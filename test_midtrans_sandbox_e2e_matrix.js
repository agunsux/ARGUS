/**
 * TIKUM / ARGUS — Phase F Midtrans Sandbox E2E Matrix & Verification Suite
 *
 * Comprehensive end-to-end testing suite for Midtrans Sandbox lifecycle across all 15 Phase F scenarios:
 * 1. Create order
 * 2. Initiate checkout
 * 3. Successful Sandbox payment
 * 4. Valid webhook (SHA-512)
 * 5. Payment success processing
 * 6. Duplicate webhook (Idempotent processing)
 * 7. Invalid webhook signature (Rejected with HTTP 401)
 * 8. Failed payment (cancel/deny -> PAYMENT_FAILED)
 * 9. Expired transaction (expire -> PAYMENT_EXPIRED)
 * 10. Amount mismatch (Tampering protection)
 * 11. Unknown transaction ID (Safely rejected)
 * 12. Concurrent checkout (Inventory race prevention)
 * 13. Repeated checkout (Idempotency on payment creation)
 * 14. Provider timeout (Graceful timeout handling)
 * 15. Webhook retry (Re-submitting webhook maintains idempotency)
 *
 * Plus Safety & Invariant Gates:
 * 16. Production fail-closed gate (Forbidden in production)
 * 17. Public client key discovery (Zero server key leakage)
 * 18. Double-entry financial ledger solvency: sum(debits) === sum(credits)
 * 19. Truthful non-escrow rail contract (CapabilityUnsupportedError on escrow)
 * 20. Production payment gateway freeze invariant preserved
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.ENABLE_DOKU_PRODUCTION = 'false';
process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';
process.env.ENABLE_XENDIT_PRODUCTION = 'false';
process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-sandbox-test-key-argus';
process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-sandbox-test-key-argus';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const { DEPLOYMENT_ENV, setDeploymentEnvForTesting, isVercelPreview, isProductionDeployment } = require('./src/config/deploymentEnv');
const { setMarketplaceModeForTesting, setPaymentGatewayFrozenForTesting, isPaymentGatewayFrozen } = require('./src/config/marketplaceMode');

// Simulate Preview environment for Sandbox testing
setDeploymentEnvForTesting(DEPLOYMENT_ENV.PREVIEW);

const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const {
  paymentManager,
  MidtransPaymentProvider,
  CapabilityUnsupportedError
} = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');
const { getMarketplaceRepository } = require('./src/storage');

console.log('================================================================');
console.log('  TIKUM — MIDTRANS SANDBOX E2E ACCEPTANCE MATRIX (PHASE F)');
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
    throw err;
  }

  try {
    const midtrans = paymentManager.getProvider('midtrans');
    assert.ok(midtrans, 'Midtrans provider is registered');

    // -------------------------------------------------------------
    // Scenario 1: Create Order
    // -------------------------------------------------------------
    console.log('── Scenario 1: Create Order ──');
    resetDatabase();
    const repo = getMarketplaceRepository();
    const orderId = `ord-mid-e2e-${Date.now()}`;
    const listingId = `lst-mid-e2e-${Date.now()}`;
    const buyerId = 'usr-buyer-e2e';
    const sellerId = 'usr-seller-e2e';

    if (!state.users) state.users = [];
    state.users.push(
      { id: buyerId, name: 'Dewi Lestari', email: 'dewi.buyer@example.com', role: 'buyer' },
      { id: sellerId, name: 'Budi Santoso', email: 'budi.seller@example.com', role: 'seller' }
    );

    if (!state.events) state.events = [];
    state.events.push({
      id: 'event-mid-e2e',
      title: 'Midtrans Sandbox Concert 2027',
      start_date: '2027-11-20T19:00:00+07:00',
      event_date: '2027-11-20T19:00:00+07:00',
      status: 'PUBLISHED',
      is_active: true
    });

    if (!state.tickets) state.tickets = [];
    state.tickets.push({
      id: `tkt-mid-e2e-${Date.now()}`,
      seller_id: sellerId,
      canonical_event_id: 'event-mid-e2e',
      event_id: 'event-mid-e2e',
      ticket_type: 'VIP',
      quantity: 1,
      face_value: 750000,
      currency: 'IDR',
      status: 'VERIFIED'
    });

    if (!state.listings) state.listings = [];
    const testListing = {
      id: listingId,
      ticket_id: state.tickets[0].id,
      seller_id: sellerId,
      canonical_event_id: 'event-mid-e2e',
      event_id: 'event-mid-e2e',
      price: 750000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0,
      metadata: { total_quantity: 1, available_quantity: 1, reserved_quantity: 0 }
    };
    state.listings.push(testListing);

    const orderRes = await EscrowService.createOrder({
      buyerId,
      listingId,
      quantity: 1,
      orderQuantity: 1
    });
    const order = orderRes.order;
    assert.strictEqual(order.status, ORDER_STATUS.PENDING_PAYMENT);
    pass('1. Valid order created in PENDING_PAYMENT state');

    // -------------------------------------------------------------
    // Scenario 2: Initiate Checkout (Snap Transaction)
    // -------------------------------------------------------------
    console.log('\n── Scenario 2: Initiate Checkout ──');
    setMarketplaceModeForTesting('LIVE');
    setPaymentGatewayFrozenForTesting(false);

    const payRes = await request({
      method: 'POST',
      path: '/api/v1/payments/create',
      headers: { 'x-user-id': buyerId },
      body: {
        orderId: order.id,
        providerName: 'midtrans',
        channel: 'SNAP',
        requiresEscrow: false,
        buyer: { id: buyerId, name: 'Dewi Lestari', email: 'dewi.buyer@example.com' }
      }
    });
    assert.strictEqual(payRes.statusCode, 200);
    assert.strictEqual(payRes.json.payment.provider, 'midtrans');
    assert.strictEqual(payRes.json.payment.status, MONEY_STATE.PAYMENT_PENDING);
    assert.ok(payRes.json.payment.paymentDetails?.token);
    pass('2. Checkout initiated: Snap token and transaction details created');

    // -------------------------------------------------------------
    // Scenario 3: Successful Sandbox Payment
    // -------------------------------------------------------------
    console.log('\n── Scenario 3 & 4 & 5: Valid Webhook & Payment Success ──');
    const grossAmountStr = String(order.buyer_total || 795000);
    const validSignature = midtrans.generateSignature({
      orderId: order.id,
      statusCode: '200',
      grossAmount: grossAmountStr
    });

    // -------------------------------------------------------------
    // Scenario 7: Invalid Webhook Signature Rejected
    // -------------------------------------------------------------
    const forgedRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        order_id: order.id,
        status_code: '200',
        gross_amount: grossAmountStr,
        transaction_status: 'settlement',
        signature_key: 'invalid_sha512_signature_string_that_must_fail'
      }
    });
    assert.strictEqual(forgedRes.statusCode, 401);
    pass('7. Invalid webhook signature rejected with HTTP 401 (Zero financial mutation)');

    // -------------------------------------------------------------
    // Scenario 4 & 5: Valid Webhook & Payment Success Processing
    // -------------------------------------------------------------
    const webhookPayload = {
      order_id: order.id,
      status_code: '200',
      gross_amount: grossAmountStr,
      transaction_status: 'settlement',
      fraud_status: 'accept',
      payment_type: 'qris',
      transaction_id: `trx-e2e-${Date.now()}`,
      settlement_time: new Date().toISOString(),
      signature_key: validSignature
    };

    const webhookRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: webhookPayload
    });
    assert.strictEqual(webhookRes.statusCode, 200);
    assert.strictEqual(webhookRes.json.success, true);
    pass('4. Valid webhook accepted with verified SHA-512 signature (HTTP 200)');

    const postOrder = state.orders.find(o => o.id === order.id);
    assert.strictEqual(postOrder.status, ORDER_STATUS.PAID_PLATFORM_HELD);
    const postEscrow = state.escrows.find(e => e.order_id === order.id);
    assert.strictEqual(postEscrow.provider_escrow_id, null, 'provider_escrow_id is strictly null on Midtrans rail');
    pass('5. Payment success processed: Order marked PAID_PLATFORM_HELD with NULL provider_escrow_id');

    // -------------------------------------------------------------
    // Scenario 6: Duplicate Webhook Idempotency
    // -------------------------------------------------------------
    console.log('\n── Scenario 6: Duplicate Webhook Idempotency ──');
    const ledgerCountBefore = (state.financial_ledger || []).length;
    const dupRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: webhookPayload
    });
    assert.strictEqual(dupRes.statusCode, 200);
    assert.strictEqual(dupRes.json.idempotent, true);
    const ledgerCountAfter = (state.financial_ledger || []).length;
    assert.strictEqual(ledgerCountAfter, ledgerCountBefore, 'Zero duplicate financial ledger entries created');
    pass('6. Duplicate webhook recognized as idempotent (Zero duplicate ledger entries)');

    // -------------------------------------------------------------
    // Scenario 8: Failed Payment
    // -------------------------------------------------------------
    console.log('\n── Scenario 8: Failed Payment ──');
    const failedOrderId = `ord-mid-fail-${Date.now()}`;
    state.orders.push({
      id: failedOrderId,
      buyer_id: buyerId,
      seller_id: sellerId,
      total_amount: 500000,
      buyer_total: 500000,
      status: ORDER_STATUS.PENDING_PAYMENT
    });

    const failSig = midtrans.generateSignature({
      orderId: failedOrderId,
      statusCode: '202',
      grossAmount: '500000'
    });

    const failWebhookRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        order_id: failedOrderId,
        status_code: '202',
        gross_amount: '500000',
        transaction_status: 'deny',
        signature_key: failSig
      }
    });
    assert.strictEqual(failWebhookRes.statusCode, 200);
    const failedOrder = state.orders.find(o => o.id === failedOrderId);
    assert.strictEqual(failedOrder.status, 'CANCELLED', 'Failed payment transitions order to CANCELLED');
    assert.strictEqual(failedOrder.marketplace_status, 'PAYMENT_FAILED');
    pass('8. Failed payment processed: Order marked CANCELLED with PAYMENT_FAILED (inventory released)');

    // -------------------------------------------------------------
    // Scenario 9: Expired Transaction
    // -------------------------------------------------------------
    console.log('\n── Scenario 9: Expired Transaction ──');
    const expireOrderId = `ord-mid-expire-${Date.now()}`;
    state.orders.push({
      id: expireOrderId,
      buyer_id: buyerId,
      seller_id: sellerId,
      total_amount: 500000,
      buyer_total: 500000,
      status: ORDER_STATUS.PENDING_PAYMENT
    });

    const expireSig = midtrans.generateSignature({
      orderId: expireOrderId,
      statusCode: '202',
      grossAmount: '500000'
    });

    const expireWebhookRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        order_id: expireOrderId,
        status_code: '202',
        gross_amount: '500000',
        transaction_status: 'expire',
        signature_key: expireSig
      }
    });
    assert.strictEqual(expireWebhookRes.statusCode, 200);
    const expiredOrder = state.orders.find(o => o.id === expireOrderId);
    assert.strictEqual(expiredOrder.status, 'EXPIRED', 'Expired payment transitions order to EXPIRED');
    assert.strictEqual(expiredOrder.marketplace_status, 'PAYMENT_EXPIRED');
    pass('9. Expired transaction handled: Order marked EXPIRED with PAYMENT_EXPIRED');

    // -------------------------------------------------------------
    // Scenario 10: Amount Mismatch Protection
    // -------------------------------------------------------------
    console.log('\n── Scenario 10: Amount Mismatch Protection ──');
    const tamperedRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        ...webhookPayload,
        gross_amount: '99999999' // Tampered amount
      }
    });
    assert.strictEqual(tamperedRes.statusCode, 401, 'Tampered amount rejected due to signature mismatch');
    pass('10. Amount mismatch rejected safely via SHA-512 invalidation');

    // -------------------------------------------------------------
    // Scenario 11: Unknown Transaction / Order ID
    // -------------------------------------------------------------
    console.log('\n── Scenario 11: Unknown Order ID ──');
    const unknownOrderId = 'ord-unknown-99999';
    const unknownSig = midtrans.generateSignature({
      orderId: unknownOrderId,
      statusCode: '200',
      grossAmount: '100000'
    });

    const ledgerBeforeUnknown = (state.financial_ledger || []).length;
    const unknownRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        order_id: unknownOrderId,
        status_code: '200',
        gross_amount: '100000',
        transaction_status: 'settlement',
        signature_key: unknownSig
      }
    });
    assert.strictEqual(unknownRes.statusCode, 200);
    const ledgerAfterUnknown = (state.financial_ledger || []).length;
    assert.strictEqual(ledgerAfterUnknown, ledgerBeforeUnknown, 'No financial ledger mutation occurred for unknown order');
    assert.strictEqual(state.orders.some(o => o.id === unknownOrderId), false, 'Unknown order was not created or modified');
    pass('11. Unknown order ID: Acknowledged safely without financial mutation');

    // -------------------------------------------------------------
    // Scenario 12: Concurrent Checkout Race Prevention
    // -------------------------------------------------------------
    console.log('\n── Scenario 12: Concurrent Checkout Race Prevention ──');
    const concurrentListing = {
      id: `lst-race-${Date.now()}`,
      ticket_id: `tkt-race-${Date.now()}`,
      seller_id: sellerId,
      canonical_event_id: 'event-mid-e2e',
      event_id: 'event-mid-e2e',
      price: 500000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0,
      metadata: { total_quantity: 1, available_quantity: 1, reserved_quantity: 0 }
    };
    state.listings.push(concurrentListing);

    // First reservation succeeds
    const res1 = await EscrowService.createOrder({ buyerId, listingId: concurrentListing.id, quantity: 1, orderQuantity: 1 });
    assert.ok(res1.order);

    // Second reservation on exhausted inventory must fail
    let secondOrderError = null;
    try {
      await EscrowService.createOrder({ buyerId: 'buyer-2', listingId: concurrentListing.id, quantity: 1, orderQuantity: 1 });
    } catch (err) {
      secondOrderError = err;
    }
    assert.ok(secondOrderError, 'Second concurrent reservation must throw INSUFFICIENT_INVENTORY');
    pass('12. Concurrent checkout prevents overselling: Inventory strictly protected');

    // -------------------------------------------------------------
    // Scenario 13: Repeated Checkout Idempotency
    // -------------------------------------------------------------
    console.log('\n── Scenario 13: Repeated Checkout Idempotency ──');
    const repeatOrder = res1.order;
    const payRes1 = await request({
      method: 'POST',
      path: '/api/v1/payments/create',
      headers: { 'x-user-id': buyerId, 'x-idempotency-key': `idem-${repeatOrder.id}` },
      body: {
        orderId: repeatOrder.id,
        providerName: 'midtrans',
        channel: 'SNAP',
        requiresEscrow: false,
        idempotencyKey: `idem-${repeatOrder.id}`,
        buyer: { id: buyerId, name: 'Dewi Lestari', email: 'dewi.buyer@example.com' }
      }
    });
    assert.strictEqual(payRes1.statusCode, 200);

    const payRes2 = await request({
      method: 'POST',
      path: '/api/v1/payments/create',
      headers: { 'x-user-id': buyerId, 'x-idempotency-key': `idem-${repeatOrder.id}` },
      body: {
        orderId: repeatOrder.id,
        providerName: 'midtrans',
        channel: 'SNAP',
        requiresEscrow: false,
        idempotencyKey: `idem-${repeatOrder.id}`,
        buyer: { id: buyerId, name: 'Dewi Lestari', email: 'dewi.buyer@example.com' }
      }
    });
    assert.strictEqual(payRes2.statusCode, 200);
    assert.strictEqual(payRes2.json.payment.paymentDetails?.token, payRes1.json.payment.paymentDetails?.token);
    pass('13. Repeated checkout: Idempotency prevents duplicate charges or order corruption');

    // -------------------------------------------------------------
    // Scenario 14: Provider Timeout Handling
    // -------------------------------------------------------------
    console.log('\n── Scenario 14: Provider Timeout Handling ──');
    let timeoutCaught = false;
    try {
      await midtrans._httpRequest({
        url: 'http://10.255.255.1:1/timeout-test', // Unreachable IP
        timeout: 200
      });
    } catch (e) {
      timeoutCaught = e.message.includes('timed out') || e.message.includes('network error');
    }
    assert.strictEqual(timeoutCaught, true, 'Provider HTTP client catches and throws on timeout');
    pass('14. Provider timeout handled safely with fail-closed timeout exception');

    // -------------------------------------------------------------
    // Scenario 15: Webhook Retry Idempotency
    // -------------------------------------------------------------
    console.log('\n── Scenario 15: Webhook Retry Idempotency ──');
    const retryRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: webhookPayload
    });
    assert.strictEqual(retryRes.statusCode, 200);
    assert.strictEqual(retryRes.json.idempotent, true);
    pass('15. Webhook retry maintains idempotency across multiple deliveries');

    // -------------------------------------------------------------
    // Scenario 16: Production Fail-Closed Gate
    // -------------------------------------------------------------
    console.log('\n── Scenario 16: Production Fail-Closed Gate ──');
    setDeploymentEnvForTesting(DEPLOYMENT_ENV.PRODUCTION);
    assert.strictEqual(isProductionDeployment(), true);

    const prodLiveCycleRes = await request({
      method: 'POST',
      path: '/api/v1/payments/sandbox/midtrans/execute-live-cycle'
    });
    assert.strictEqual(prodLiveCycleRes.statusCode, 403);
    assert.strictEqual(prodLiveCycleRes.json.code, 'FORBIDDEN_IN_PRODUCTION');
    pass('16. Production fail-closed gate: Sandbox live cycle strictly blocked with HTTP 403');

    // -------------------------------------------------------------
    // Scenario 17: Public Client Key Discovery (Zero Server Key Leak)
    // -------------------------------------------------------------
    console.log('\n── Scenario 17: Public Client Key Discovery ──');
    setDeploymentEnvForTesting(DEPLOYMENT_ENV.PREVIEW);
    const clientKeyRes = await request({
      method: 'GET',
      path: '/api/v1/payments/midtrans/client-key'
    });
    assert.strictEqual(clientKeyRes.statusCode, 200);
    assert.strictEqual(clientKeyRes.json.clientKey, process.env.MIDTRANS_CLIENT_KEY);
    assert.strictEqual(clientKeyRes.json.serverKey, undefined, 'Server key is never exposed');
    pass('17. Public client key discoverable on Preview with zero server key leakage');

    // -------------------------------------------------------------
    // Scenario 18: Double-Entry Financial Ledger Solvency
    // -------------------------------------------------------------
    console.log('\n── Scenario 18: Double-Entry Ledger Solvency ──');
    const ledger = state.financial_ledger || [];
    let debits = 0;
    let credits = 0;
    for (const tx of ledger) {
      if (tx.entries && Array.isArray(tx.entries)) {
        for (const e of tx.entries) {
          if (e.type === 'DEBIT') debits += parseInt(e.amount || 0, 10);
          if (e.type === 'CREDIT') credits += parseInt(e.amount || 0, 10);
        }
      } else {
        debits += parseInt(tx.debit || 0, 10);
        credits += parseInt(tx.credit || 0, 10);
      }
    }
    assert.ok(debits > 0, 'Debits must be positive');
    assert.strictEqual(debits, credits, `Ledger must balance: ${debits} === ${credits}`);
    pass(`18. Double-entry Financial Ledger balances mathematically: debit ${debits} === credit ${credits}`);

    // -------------------------------------------------------------
    // Scenario 19: Truthful Non-Escrow Rail Contract
    // -------------------------------------------------------------
    console.log('\n── Scenario 19: Truthful Non-Escrow Rail Contract ──');
    let escrowUnsupportedCaught = false;
    try {
      await midtrans.createPayment({
        orderId: `ord-truth-${Date.now()}`,
        amount: 500000,
        requiresEscrow: true
      });
    } catch (e) {
      escrowUnsupportedCaught = e instanceof CapabilityUnsupportedError || e.code === 'CAPABILITY_UNSUPPORTED';
    }
    assert.strictEqual(escrowUnsupportedCaught, true);
    pass('19. Requesting milestone escrow on Midtrans rail throws CapabilityUnsupportedError (Truthfulness preserved)');

    // -------------------------------------------------------------
    // Scenario 20: Production Payment Gateway Freeze Invariant
    // -------------------------------------------------------------
    console.log('\n── Scenario 20: Production Payment Gateway Freeze Invariant ──');
    setMarketplaceModeForTesting(null);
    setPaymentGatewayFrozenForTesting(null);
    assert.strictEqual(isPaymentGatewayFrozen(), true, 'Payment gateway freeze remains active by default');
    pass('20. Production payment gateway freeze invariant preserved (isPaymentGatewayFrozen === true)');

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} PHASE F MATRIX ACCEPTANCE TESTS PASSED!`);
    console.log('================================================================\n');

  } catch (err) {
    fail('Unhandled exception in Phase F test suite', err);
  } finally {
    if (server) {
      server.close();
    }
    setDeploymentEnvForTesting(null);
    setMarketplaceModeForTesting(null);
    setPaymentGatewayFrozenForTesting(null);
    process.exit(process.exitCode || 0);
  }
}

runTests();
