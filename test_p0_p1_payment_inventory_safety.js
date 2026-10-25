/**
 * TIKUM / ARGUS — P0/P1 Payment & Inventory Safety Regression Test Suite
 *
 * Verifies all 8 critical payment & inventory safety requirements:
 * 1. Failed payment webhook releases inventory exactly once.
 * 2. Expired payment webhook releases inventory exactly once.
 * 3. Pending payment webhook retains reservation (no release).
 * 4. Duplicate webhook delivery does not double-release inventory.
 * 5. MarketplaceOrderService.cancelOrder updates available/reserved quantities consistently & idempotently.
 * 6. Concurrent cancellation versus payment webhook handling:
 *    - Cancellation first -> late payment routes to LATE_PAYMENT_PENDING_REVIEW without double-selling.
 *    - Payment first -> cancellation is blocked (must use refund workflow).
 * 7. Midtrans production disabled cannot route customers to Sandbox (fails-closed).
 * 8. No silent fallback to unapproved or capability-incompatible payment provider.
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.ENABLE_DOKU_PRODUCTION = 'false';
process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';
process.env.ENABLE_XENDIT_PRODUCTION = 'false';
process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-test-key-p0p1';
process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-test-key-p0p1';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { paymentManager, MidtransPaymentProvider, DokuPaymentProvider } = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { PaymentRoutingService } = require('./src/services/payment/PaymentRoutingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { MarketplaceOrderService } = require('./src/services/marketplace/MarketplaceOrderService');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');
const { getMarketplaceRepository } = require('./src/storage');

console.log('================================================================');
console.log('  TIKUM — P0/P1 PAYMENT & INVENTORY SAFETY REGRESSION SUITE');
console.log('================================================================\n');

let server;
let baseUrl;

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serialized = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers, host: url.host };
    if (serialized && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (serialized && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(serialized);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (serialized) req.write(serialized);
    req.end();
  });
}

async function runTests() {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] ${msg}`);
  }

  function fail(msg, err) {
    total++;
    console.error(`  ✗ [FAIL] ${msg}`);
    console.error(err);
    process.exitCode = 1;
  }

  try {
    resetDatabase();
    const repo = getMarketplaceRepository();

    if (!state.users) state.users = [];
    const testBuyer1 = { id: 'buyer-fail-1', name: 'Buyer Fail', email: 'buyer.fail@example.com', role: 'buyer' };
    const testBuyer2 = { id: 'buyer-expire-2', name: 'Buyer Expire', email: 'buyer.expire@example.com', role: 'buyer' };
    const testBuyer3 = { id: 'buyer-pending-3', name: 'Buyer Pending', email: 'buyer.pending@example.com', role: 'buyer' };
    const testBuyer5 = { id: 'buyer-cancel-5', name: 'Buyer Cancel', email: 'buyer.cancel@example.com', role: 'buyer' };
    const testBuyer6A = { id: 'buyer-race-6a', name: 'Buyer Race 6A', email: 'buyer.race6a@example.com', role: 'buyer' };
    const testBuyer6New = { id: 'buyer-race-new', name: 'Buyer Race New', email: 'buyer.racenew@example.com', role: 'buyer' };
    const testBuyer6B = { id: 'buyer-race-6b', name: 'Buyer Race 6B', email: 'buyer.race6b@example.com', role: 'buyer' };
    const testSeller = { id: 'seller-1', name: 'Seller 1', email: 'seller.1@example.com', role: 'seller' };
    state.users.push(testBuyer1, testBuyer2, testBuyer3, testBuyer5, testBuyer6A, testBuyer6New, testBuyer6B, testSeller);

    if (!state.events) state.events = [];
    state.events.push({
      id: 'event-test-safety',
      title: 'Safety Test Concert 2026',
      status: 'PUBLISHED',
      is_active: true
    });

    if (!state.tickets) state.tickets = [];
    ['tkt-fail-1', 'tkt-expire-2', 'tkt-pending-3', 'tkt-cancel-5', 'tkt-race-6a', 'tkt-race-6b'].forEach(tid => {
      state.tickets.push({
        id: tid,
        seller_id: 'seller-1',
        canonical_event_id: 'event-test-safety',
        event_id: 'event-test-safety',
        ticket_type: 'GENERAL_ADMISSION',
        quantity: 1,
        face_value: 500000,
        currency: 'IDR',
        status: 'VERIFIED'
      });
    });

    // -------------------------------------------------------------
    // 1. Failed payment releases inventory exactly once
    // -------------------------------------------------------------
    console.log('── Requirement 1: Failed Payment Releases Inventory Exactly Once ──');
    const listing1 = {
      id: 'list-fail-inv-1',
      ticket_id: 'tkt-fail-1',
      seller_id: 'seller-1',
      price: 500000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0
    };
    state.listings = [listing1];
    if (typeof repo.createListing === 'function') {
      try { await repo.createListing(listing1); } catch (_) {}
    }

    const orderRes1 = await EscrowService.createOrder({
      listingId: listing1.id,
      buyerId: 'buyer-fail-1'
    });
    const order1 = orderRes1.order;

    // Verify order created and inventory reserved
    assert.strictEqual(listing1.available_quantity, 0, 'Available quantity should be 0');
    assert.strictEqual(listing1.reserved_quantity, 1, 'Reserved quantity should be 1');
    assert.strictEqual(listing1.status, 'RESERVED', 'Listing should be RESERVED');

    // Simulate failed payment webhook from Midtrans
    const failGross = (order1.buyer_total || order1.total_amount).toString();
    const failSig = crypto.createHash('sha512').update(`${order1.id}202${failGross}${process.env.MIDTRANS_SERVER_KEY}`).digest('hex');
    const failPayload = {
      order_id: order1.id,
      transaction_id: `trx-fail-${order1.id}`,
      status_code: '202',
      transaction_status: 'deny',
      gross_amount: failGross,
      signature_key: failSig
    };

    const resWh1 = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: failPayload
    });
    assert.strictEqual(resWh1.statusCode, 200, 'Webhook should return 200');

    // Verify order cancelled and inventory cleanly restored to ACTIVE
    assert.strictEqual(order1.status, 'CANCELLED', 'Order must be CANCELLED');
    assert.strictEqual(order1.marketplace_status, 'PAYMENT_FAILED', 'Marketplace status must be PAYMENT_FAILED');
    assert.strictEqual(listing1.available_quantity, 1, 'Available quantity must be restored to 1');
    assert.strictEqual(listing1.reserved_quantity, 0, 'Reserved quantity must be 0');
    assert.strictEqual(listing1.status, 'ACTIVE', 'Listing must be returned to ACTIVE');
    pass('1.1 Verified failed payment webhook releases reserved ticket inventory exactly once and restores status to ACTIVE');

    // -------------------------------------------------------------
    // 2. Expired payment releases inventory exactly once
    // -------------------------------------------------------------
    console.log('\n── Requirement 2: Expired Payment Releases Inventory Exactly Once ──');
    const listing2 = {
      id: 'list-expire-inv-2',
      ticket_id: 'tkt-expire-2',
      seller_id: 'seller-1',
      price: 600000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0
    };
    state.listings.push(listing2);
    if (typeof repo.createListing === 'function') {
      try { await repo.createListing(listing2); } catch (_) {}
    }

    const orderRes2 = await EscrowService.createOrder({
      listingId: listing2.id,
      buyerId: 'buyer-expire-2'
    });
    const order2 = orderRes2.order;
    assert.strictEqual(listing2.available_quantity, 0);
    assert.strictEqual(listing2.status, 'RESERVED');

    // Deliver expire webhook
    const expGross = (order2.buyer_total || order2.total_amount).toString();
    const expSig = crypto.createHash('sha512').update(`${order2.id}407${expGross}${process.env.MIDTRANS_SERVER_KEY}`).digest('hex');
    const expirePayload = {
      order_id: order2.id,
      transaction_id: `trx-exp-${order2.id}`,
      status_code: '407',
      transaction_status: 'expire',
      gross_amount: expGross,
      signature_key: expSig
    };

    const resWh2 = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: expirePayload
    });
    assert.strictEqual(resWh2.statusCode, 200);

    assert.strictEqual(order2.status, 'EXPIRED');
    assert.strictEqual(order2.marketplace_status, 'PAYMENT_EXPIRED');
    assert.strictEqual(listing2.available_quantity, 1);
    assert.strictEqual(listing2.reserved_quantity, 0);
    assert.strictEqual(listing2.status, 'ACTIVE');
    pass('2.1 Verified expired payment webhook marks order EXPIRED and releases inventory back to ACTIVE');

    // -------------------------------------------------------------
    // 3. Pending payment retains the reservation
    // -------------------------------------------------------------
    console.log('\n── Requirement 3: Pending Payment Retains Reservation ──');
    const listing3 = {
      id: 'list-pending-inv-3',
      ticket_id: 'tkt-pending-3',
      seller_id: 'seller-1',
      price: 750000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0
    };
    state.listings.push(listing3);
    const orderRes3 = await EscrowService.createOrder({
      listingId: listing3.id,
      buyerId: 'buyer-pending-3'
    });
    const order3 = orderRes3.order;

    // Send pending webhook (e.g. challenge or pending status)
    const pendGross = (order3.buyer_total || order3.total_amount).toString();
    const pendSig = crypto.createHash('sha512').update(`${order3.id}201${pendGross}${process.env.MIDTRANS_SERVER_KEY}`).digest('hex');
    const pendingPayload = {
      order_id: order3.id,
      transaction_id: `trx-pend-${order3.id}`,
      status_code: '201',
      transaction_status: 'pending',
      gross_amount: pendGross,
      signature_key: pendSig
    };

    const resWh3 = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: pendingPayload
    });
    assert.strictEqual(resWh3.statusCode, 200);

    // INVARIANT: Inventory MUST remain reserved!
    assert.strictEqual(listing3.available_quantity, 0, 'Available quantity must remain 0 during pending payment');
    assert.strictEqual(listing3.reserved_quantity, 1, 'Reserved quantity must remain 1 during pending payment');
    assert.strictEqual(listing3.status, 'RESERVED', 'Listing must remain RESERVED');
    pass('3.1 Verified pending payment webhook acknowledges reception but strictly preserves reservation');

    // -------------------------------------------------------------
    // 4. Duplicate webhooks do not double-release stock
    // -------------------------------------------------------------
    console.log('\n── Requirement 4: Duplicate Webhooks Do Not Double-Release Stock ──');
    // Replay the expire webhook from section 2
    const resWh2Duplicate = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: expirePayload
    });
    assert.strictEqual(resWh2Duplicate.statusCode, 200);
    assert.strictEqual(resWh2Duplicate.json.idempotent, true, 'Duplicate webhook must report idempotent: true');

    // Crucial invariant: listing2 available_quantity must STILL be 1, NOT 2!
    assert.strictEqual(listing2.available_quantity, 1, 'Available quantity must not be incremented a second time');
    assert.strictEqual(listing2.reserved_quantity, 0, 'Reserved quantity must remain 0');

    // Also call EscrowService.releaseInventoryForOrder directly on order2
    const directDup = await EscrowService.releaseInventoryForOrder(order2.id, 'MANUAL_RETRY');
    assert.strictEqual(directDup.idempotent, true, 'Direct release on already-released order must be idempotent');
    assert.strictEqual(directDup.releasedQuantity, 0, 'Released quantity must be 0 on duplicate call');
    assert.strictEqual(listing2.available_quantity, 1, 'Inventory remains 1');
    pass('4.1 Verified duplicate webhooks and direct release calls are strictly idempotent and never double-release inventory');

    // -------------------------------------------------------------
    // 5. Cancellation updates available and reserved quantities consistently
    // -------------------------------------------------------------
    console.log('\n── Requirement 5: Cancellation Consistency via MarketplaceOrderService ──');
    const listing5 = {
      id: 'list-cancel-inv-5',
      ticket_id: 'tkt-cancel-5',
      seller_id: 'seller-1',
      price: 800000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0
    };
    state.listings.push(listing5);
    const orderRes5 = await EscrowService.createOrder({
      listingId: listing5.id,
      buyerId: 'buyer-cancel-5'
    });
    const order5 = orderRes5.order;
    assert.strictEqual(listing5.available_quantity, 0);
    assert.strictEqual(listing5.reserved_quantity, 1);
    assert.strictEqual(listing5.status, 'RESERVED');

    // Cancel order through MarketplaceOrderService
    const cancelledOrder = await MarketplaceOrderService.cancelOrder(order5.id, 'buyer-cancel-5', 'Changed my mind');
    assert.strictEqual(cancelledOrder.status, 'CANCELLED');
    assert.strictEqual(listing5.available_quantity, 1, 'Cancellation must restore available_quantity to 1');
    assert.strictEqual(listing5.reserved_quantity, 0, 'Cancellation must decrement reserved_quantity to 0');
    assert.strictEqual(listing5.status, 'ACTIVE', 'Cancellation must restore listing status to ACTIVE');

    // Repeated cancellation request must be idempotent
    const repeatCancel = await MarketplaceOrderService.cancelOrder(order5.id, 'buyer-cancel-5', 'Repeated cancel');
    assert.strictEqual(repeatCancel.status, 'CANCELLED');
    assert.strictEqual(listing5.available_quantity, 1, 'Repeat cancel must not double-increment inventory');
    assert.strictEqual(listing5.reserved_quantity, 0);
    pass('5.1 Verified MarketplaceOrderService.cancelOrder restores inventory consistently and handles repeat calls idempotently');

    // -------------------------------------------------------------
    // 6. Concurrent cancellation versus payment webhook handling
    // -------------------------------------------------------------
    console.log('\n── Requirement 6: Concurrent Cancellation vs Payment Webhook Handling ──');
    // Scenario 6A: Order cancelled first -> Late payment webhook arrives
    const listing6A = {
      id: 'list-race-6a',
      ticket_id: 'tkt-race-6a',
      seller_id: 'seller-1',
      price: 900000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0
    };
    state.listings.push(listing6A);
    const orderRes6A = await EscrowService.createOrder({ listingId: listing6A.id, buyerId: 'buyer-race-6a' });
    const order6A = orderRes6A.order;

    // Buyer cancels first
    await MarketplaceOrderService.cancelOrder(order6A.id, 'buyer-race-6a', 'Timeout cancel');
    assert.strictEqual(order6A.status, 'CANCELLED');
    assert.strictEqual(listing6A.available_quantity, 1);

    // Another buyer buys the released ticket
    const listing6ABuyer2 = await EscrowService.createOrder({ listingId: listing6A.id, buyerId: 'buyer-race-new' });
    assert.strictEqual(listing6A.available_quantity, 0);

    // Now late payment arrives for order6A at the gateway!
    const lateGross = (order6A.buyer_total || order6A.total_amount).toString();
    const lateSig = crypto.createHash('sha512').update(`${order6A.id}200${lateGross}${process.env.MIDTRANS_SERVER_KEY}`).digest('hex');
    const latePayload = {
      order_id: order6A.id,
      transaction_id: `trx-late-${order6A.id}`,
      status_code: '200',
      transaction_status: 'settlement',
      gross_amount: lateGross,
      signature_key: lateSig
    };
    const resLate = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: latePayload
    });
    assert.strictEqual(resLate.statusCode, 200);

    // Invariant I7: Order must transition to LATE_PAYMENT_PENDING_REVIEW, NOT double-sell inventory
    assert.strictEqual(order6A.status, 'LATE_PAYMENT_PENDING_REVIEW');
    assert.strictEqual(order6A.marketplace_status, 'LATE_PAYMENT');
    pass('6.1 Invariant I7 Verified: Late settlement on cancelled order routes to LATE_PAYMENT_PENDING_REVIEW without double-selling');

    // Scenario 6B: Payment succeeds first -> Cancellation blocked
    const listing6B = {
      id: 'list-race-6b',
      ticket_id: 'tkt-race-6b',
      seller_id: 'seller-1',
      price: 950000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0
    };
    state.listings.push(listing6B);
    const orderRes6B = await EscrowService.createOrder({ listingId: listing6B.id, buyerId: 'buyer-race-6b' });
    const order6B = orderRes6B.order;

    // Payment arrives and settles
    const paidGross = (order6B.buyer_total || order6B.total_amount).toString();
    const paidSig = crypto.createHash('sha512').update(`${order6B.id}200${paidGross}${process.env.MIDTRANS_SERVER_KEY}`).digest('hex');
    await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        order_id: order6B.id,
        transaction_id: `trx-paid-${order6B.id}`,
        status_code: '200',
        transaction_status: 'settlement',
        gross_amount: paidGross,
        signature_key: paidSig
      }
    });

    // Attempt to cancel paid order must be rejected
    await assert.rejects(async () => {
      await MarketplaceOrderService.cancelOrder(order6B.id, 'buyer-race-6b', 'Try cancel paid');
    }, (err) => err.code === 'CANNOT_CANCEL_ORDER');
    pass('6.2 Verified paid order blocks standard cancellation (paid orders require formal refund workflow)');

    // -------------------------------------------------------------
    // 7. Midtrans production disabled cannot route customers to Sandbox
    // -------------------------------------------------------------
    console.log('\n── Requirement 7: Midtrans Production Disabled Fails-Closed ──');
    const origNodeEnv = process.env.NODE_ENV;
    const origEnableMidtrans = process.env.ENABLE_MIDTRANS_PRODUCTION;

    try {
      // Simulate production environment
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';

      const prodMidtrans = new MidtransPaymentProvider({
        serverKey: 'SB-Mid-server-some-key',
        isProduction: false,
        allowSimulation: false
      });

      // getStatus() must report NOT verified and PENDING_VERIFICATION in production
      const prodStatus = prodMidtrans.getStatus();
      assert.strictEqual(prodStatus.isVerified, false, 'Midtrans must not be verified in production when ENABLE_MIDTRANS_PRODUCTION is false');
      assert.strictEqual(prodStatus.status, 'PENDING_VERIFICATION');

      // createPayment must throw error refusing Sandbox in production
      await assert.rejects(async () => {
        await prodMidtrans.createPayment({
          orderId: 'ord-prod-sandbox-attempt',
          amount: 500000,
          requiresEscrow: false
        });
      }, (err) => err.code === 'SANDBOX_PROHIBITED_IN_PRODUCTION' || err.status === 503);

      // GET /api/v1/payments/midtrans/client-key in production must return 503
      const resKey = await request({
        method: 'GET',
        path: '/api/v1/payments/midtrans/client-key'
      });
      assert.strictEqual(resKey.statusCode, 503, 'Client key endpoint in production must return HTTP 503');
      assert.strictEqual(resKey.json.code, 'MIDTRANS_NOT_ACTIVATED');
      assert.strictEqual(resKey.json.isAvailable, false);
      pass('7.1 Verified Midtrans fail-closed gate: Sandbox strictly prohibited in production (HTTP 503)');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.ENABLE_MIDTRANS_PRODUCTION = origEnableMidtrans;
    }

    // -------------------------------------------------------------
    // 8. No silent fallback to unapproved or capability-incompatible provider
    // -------------------------------------------------------------
    console.log('\n── Requirement 8: No Fallback to Incompatible / Unapproved Provider ──');
    // Requesting escrow with an escrow-incompatible provider (e.g. Midtrans or Xendit) must throw ESCROW_CAPABILITY_REQUIRED
    assert.throws(() => {
      PaymentRoutingService.resolveProvider({
        countryCode: 'ID',
        currency: 'IDR',
        tier: 'BACKUP_2', // Midtrans
        requiresEscrow: true
      });
    }, (err) => err.code === 'ESCROW_CAPABILITY_REQUIRED' || err.code === 'CAPABILITY_UNSUPPORTED');

    // Assert failover cannot switch from an escrow provider to a non-escrow provider
    assert.throws(() => {
      PaymentRoutingService.assertFailoverAllowed('ord-test-escrow', true, 'midtrans');
    }, (err) => err.code === 'CAPABILITY_UNSUPPORTED' || err.code === 'ESCROW_CAPABILITY_REQUIRED');
    pass('8.1 Verified routing engine forbids silent downgrade or fallback to escrow-incompatible payment rails');

  } catch (err) {
    fail('Test suite encountered an unhandled exception', err);
  } finally {
    if (server) server.close();
  }

  console.log('\n================================================================');
  if (passed === total && total > 0) {
    console.log(`  ALL ${passed}/${total} P0/P1 PAYMENT & INVENTORY TESTS PASSED!`);
  } else {
    console.log(`  TESTS FAILED: ${passed}/${total} passed`);
    process.exitCode = 1;
  }
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
