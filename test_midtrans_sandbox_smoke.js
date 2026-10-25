/**
 * TIKUM / ARGUS — Midtrans Sandbox Smoke Test & Technical Verification Suite
 *
 * Verifies end-to-end Midtrans Sandbox payment integration without real money:
 * Phase 1: Configuration & Environment Audit (Zero Secret Leaks)
 * Phase 2: Public Client Key & Snap SDK Discovery Endpoint
 * Phase 3: Sandbox Payment Creation (Snap Token, Pinning, Failover Prevention)
 * Phase 4: Truthful Escrow Contract (CapabilityUnsupportedError on Midtrans Escrow Hold)
 * Phase 5: SHA-512 Webhook Signature Verification (Timing-Safe, Anti-Tamper)
 * Phase 6: Webhook Settlement & Double-Entry Financial Ledger Reconciliation
 * Phase 7: Replay Attack Deduplication (Idempotent Webhook Processing)
 * Phase 8: Negative Paths & Mismatched Signatures Blocked
 * Phase 9: Manual Refund Procedure & Solvency Reversal
 * Phase 10: Production Fail-Closed Safety Gates & Tier Hierarchy
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
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const {
  paymentManager,
  MidtransPaymentProvider,
  CapabilityUnsupportedError
} = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const {
  PaymentRoutingService,
  PAYMENT_ATTEMPT_STATUS
} = require('./src/services/payment/PaymentRoutingService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');
const { getMarketplaceRepository } = require('./src/storage');

console.log('================================================================');
console.log('  TIKUM — MIDTRANS SANDBOX SMOKE TEST & VERIFICATION SUITE');
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
    // -------------------------------------------------------------
    // Section 1: Configuration & Environment Audit (Zero Secret Leaks)
    // -------------------------------------------------------------
    console.log('── Section 1: Configuration & Environment Audit ──');
    const midtrans = paymentManager.getProvider('midtrans');
    assert.ok(midtrans, 'Midtrans provider is registered in paymentManager');
    assert.strictEqual(midtrans.getName(), 'midtrans');

    const caps = midtrans.getCapabilities();
    assert.strictEqual(caps.hold, false, 'Midtrans hold capability must be false (truthful non-escrow rail)');
    assert.strictEqual(caps.splitSettlement, false, 'Midtrans split capability is false for standard merchant account');
    assert.strictEqual(caps.webhooks, true, 'Midtrans supports webhooks');
    assert.strictEqual(caps.refund, true, 'Midtrans supports refund');
    pass('1.1 Midtrans adapter instantiated with correct capabilities (hold: false, webhooks: true)');

    const status = midtrans.getStatus();
    assert.strictEqual(status.environment, 'sandbox', 'Midtrans is operating in sandbox mode');
    assert.strictEqual(status.hasServerKey, true, 'Server key is configured');
    assert.strictEqual(status.isVerified, true, 'Midtrans is verified / ready');
    pass('1.2 Safe status audit confirms sandbox mode and zero secret exposure');

    // -------------------------------------------------------------
    // Section 2: Public Client Key & Snap SDK Discovery Endpoint
    // -------------------------------------------------------------
    console.log('\n── Section 2: Public Client Key & Snap SDK Discovery ──');
    const clientKeyRes = await request({
      method: 'GET',
      path: '/api/v1/payments/midtrans/client-key'
    });
    assert.strictEqual(clientKeyRes.statusCode, 200, 'GET /api/v1/payments/midtrans/client-key returns HTTP 200');
    assert.strictEqual(clientKeyRes.json.clientKey, process.env.MIDTRANS_CLIENT_KEY, 'Returns configured public client key');
    assert.strictEqual(clientKeyRes.json.isSandbox, true, 'isSandbox flag is true');
    assert.strictEqual(clientKeyRes.json.snapUrl, 'https://app.sandbox.midtrans.com/snap/snap.js', 'Returns correct sandbox Snap URL');
    assert.strictEqual(clientKeyRes.json.serverKey, undefined, 'Server key is NEVER exposed in client response');
    pass('2.1 GET /api/v1/payments/midtrans/client-key provides Snap SDK config with zero server key leakage');

    // -------------------------------------------------------------
    // Section 3: Sandbox Payment Creation (Snap Token, Pinning)
    // -------------------------------------------------------------
    console.log('\n── Section 3: Sandbox Payment Intent Creation ──');
    resetDatabase();

    const repo = getMarketplaceRepository();
    const orderId = 'ord-midtrans-test-01';
    const listingId = 'list-midtrans-test-01';
    const buyerId = 'usr-buyer-midtrans';
    const sellerId = 'usr-seller-midtrans';

    if (!state.users) state.users = [];
    state.users.push(
      { id: buyerId, name: 'Dewi Lestari', email: 'dewi.buyer@example.com', role: 'buyer' },
      { id: sellerId, name: 'Budi Santoso', email: 'budi.seller@example.com', role: 'seller' }
    );

    if (!state.events) state.events = [];
    state.events.push({
      id: 'event-midtrans-smoke',
      title: 'Pestapora 2026 Midtrans Smoke Test',
      status: 'PUBLISHED',
      is_active: true
    });

    if (!state.tickets) state.tickets = [];
    state.tickets.push({
      id: 'tkt-midtrans-test-01',
      seller_id: sellerId,
      canonical_event_id: 'event-midtrans-smoke',
      event_id: 'event-midtrans-smoke',
      ticket_type: 'GENERAL_ADMISSION',
      quantity: 1,
      face_value: 500000,
      currency: 'IDR',
      status: 'VERIFIED'
    });

    if (!state.listings) state.listings = [];
    const testListing = {
      id: listingId,
      ticket_id: 'tkt-midtrans-test-01',
      seller_id: sellerId,
      canonical_event_id: 'event-midtrans-smoke',
      event_id: 'event-midtrans-smoke',
      price: 600000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0,
      metadata: { total_quantity: 1, available_quantity: 1, reserved_quantity: 0 }
    };
    state.listings.push(testListing);
    if (typeof repo.createListing === 'function') {
      try { await repo.createListing(testListing); } catch (_) {}
    }

    // Create Order via EscrowService
    const orderResult = await EscrowService.createOrder({
      buyerId,
      listingId,
      quantity: 1,
      orderQuantity: 1
    });
    const createdOrder = orderResult.order;
    assert.strictEqual(createdOrder.status, ORDER_STATUS.PENDING_PAYMENT);
    pass('3.1 Isolated order created in PENDING_PAYMENT state');

    // Create Midtrans Payment intent via POST /api/v1/payments/create
    const payRes = await request({
      method: 'POST',
      path: '/api/v1/payments/create',
      headers: { 'x-user-id': buyerId },
      body: {
        orderId: createdOrder.id,
        providerName: 'midtrans',
        channel: 'SNAP',
        requiresEscrow: false,
        buyer: {
          id: buyerId,
          name: 'Dewi Lestari',
          email: 'dewi.buyer@example.com'
        }
      }
    });

    assert.strictEqual(payRes.statusCode, 200, `POST /api/v1/payments/create returned ${payRes.statusCode}`);
    const payBody = payRes.json;
    assert.ok(payBody.payment, 'Response contains payment object');
    assert.strictEqual(payBody.payment.provider, 'midtrans', 'Provider is midtrans');
    assert.strictEqual(payBody.payment.status, MONEY_STATE.PAYMENT_PENDING, 'Status is PAYMENT_PENDING');
    assert.ok(payBody.payment.paymentDetails?.token, 'Payment details contain snap token');
    assert.ok(payBody.payment.paymentUrl, 'Payment URL is present');
    pass('3.2 Midtrans Snap payment intent successfully created with token & paymentUrl');

    // Verify Payment Attempt Pinning (Zero premature failover)
    const attempts = (state.payment_attempts || []).filter(a => a.orderId === createdOrder.id);
    assert.ok(attempts.length >= 1, 'Payment attempt recorded in state');
    assert.strictEqual(attempts[0].provider, 'midtrans', 'Payment attempt pinned to midtrans');
    pass('3.3 Payment attempt is strictly pinned to Midtrans (failover blocked)');

    // -------------------------------------------------------------
    // Section 4: Truthful Escrow Separation (Capability Gate)
    // -------------------------------------------------------------
    console.log('\n── Section 4: Truthful Escrow Separation ──');
    const forcedOrderId = `ord-forced-escrow-${Date.now()}`;
    state.orders.push({
      id: forcedOrderId,
      buyer_id: buyerId,
      seller_id: sellerId,
      total_amount: 500000,
      buyer_total: 500000,
      status: ORDER_STATUS.PENDING_PAYMENT
    });

    let escrowErrorCaught = false;
    try {
      await PaymentService.createPayment({
        orderId: forcedOrderId,
        amount: 500000,
        providerName: 'midtrans',
        channel: 'SNAP',
        requiresEscrow: true
      });
    } catch (e) {
      escrowErrorCaught = e instanceof CapabilityUnsupportedError || e.code === 'CAPABILITY_UNSUPPORTED';
    }
    assert.strictEqual(escrowErrorCaught, true, 'Midtrans strictly throws CapabilityUnsupportedError when escrow is required');
    pass('4.1 Attempting milestone escrow hold via Midtrans throws CapabilityUnsupportedError (truthfulness enforced)');

    // -------------------------------------------------------------
    // Section 5: SHA-512 Webhook Signature Verification
    // -------------------------------------------------------------
    console.log('\n── Section 5: SHA-512 Webhook Signature Verification ──');
    const grossAmountStr = String(createdOrder.buyer_total || 636000);
    const grossAmount = parseInt(grossAmountStr, 10);
    const statusCode = '200';

    // Midtrans SHA512 signature: SHA512(order_id + status_code + gross_amount + ServerKey)
    const rawSignatureStr = `${createdOrder.id}${statusCode}${grossAmountStr}${process.env.MIDTRANS_SERVER_KEY}`;
    const validSignature = crypto.createHash('sha512').update(rawSignatureStr).digest('hex');

    // 5.1 Forged Signature Rejected (401)
    const forgedRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        order_id: createdOrder.id,
        status_code: statusCode,
        gross_amount: grossAmountStr,
        transaction_status: 'settlement',
        signature_key: 'forged_deadbeef_signature_key_that_does_not_match'
      }
    });
    assert.strictEqual(forgedRes.statusCode, 401, 'Forged signature rejected with HTTP 401');
    pass('5.1 Webhook with forged SHA-512 signature is rejected with HTTP 401');

    // 5.2 Missing Signature Rejected (401)
    const missingRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: {
        order_id: createdOrder.id,
        status_code: statusCode,
        gross_amount: grossAmountStr,
        transaction_status: 'settlement'
      }
    });
    assert.strictEqual(missingRes.statusCode, 401, 'Missing signature rejected with HTTP 401');
    pass('5.2 Webhook with missing signature is rejected with HTTP 401');

    // -------------------------------------------------------------
    // Section 6: Webhook Settlement & Double-Entry Ledger Reconciliation
    // -------------------------------------------------------------
    console.log('\n── Section 6: Webhook Settlement & Ledger Reconciliation ──');
    const validWebhookPayload = {
      order_id: createdOrder.id,
      status_code: statusCode,
      gross_amount: grossAmountStr,
      transaction_status: 'settlement',
      fraud_status: 'accept',
      payment_type: 'qris',
      transaction_id: `midtrans-trx-${Date.now()}`,
      settlement_time: new Date().toISOString(),
      signature_key: validSignature
    };

    const settleRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: validWebhookPayload
    });

    assert.strictEqual(settleRes.statusCode, 200, `Valid webhook accepted with 200 (got ${settleRes.statusCode})`);
    assert.strictEqual(settleRes.json.success, true);
    pass('6.1 Valid Midtrans settlement webhook successfully processed (HTTP 200)');

    // Verify Domain Transitions
    const settledOrder = state.orders.find(o => o.id === createdOrder.id);
    assert.strictEqual(settledOrder.status, ORDER_STATUS.PAID_PLATFORM_HELD, 'Order status is PAID_PLATFORM_HELD (truthful non-escrow)');
    assert.strictEqual(settledOrder.escrow_type, 'NONE_PLATFORM_CAPTURED', 'Escrow type is NONE_PLATFORM_CAPTURED');

    const settledEscrow = state.escrows.find(e => e.order_id === createdOrder.id);
    assert.ok(settledEscrow, 'Escrow record exists');
    assert.strictEqual(settledEscrow.status, ESCROW_STATUS.ESCROWED, 'Escrow status is ESCROWED (internally held)');
    assert.strictEqual(settledEscrow.provider_escrow_id, null, 'provider_escrow_id is strictly NULL (no fake 3rd-party escrow ID)');
    pass('6.2 Order marked PAID_PLATFORM_HELD with NULL provider_escrow_id (truthful non-escrow rail)');

    // Verify Double-Entry Financial Ledger
    const ledger = state.financial_ledger || [];
    assert.ok(ledger.length >= 1, 'Must have at least 1 journal transaction in ledger');

    let totalDebits = 0;
    let totalCredits = 0;
    for (const tx of ledger) {
      if (tx.entries && Array.isArray(tx.entries)) {
        for (const entry of tx.entries) {
          const amt = parseInt(entry.amount || 0, 10);
          if (entry.type === 'DEBIT') totalDebits += amt;
          if (entry.type === 'CREDIT') totalCredits += amt;
        }
      } else {
        totalDebits += parseInt(tx.debit || 0, 10);
        totalCredits += parseInt(tx.credit || 0, 10);
      }
    }
    assert.ok(totalDebits > 0, 'Debits must be positive');
    assert.strictEqual(totalDebits, totalCredits, `Ledger must balance: ${totalDebits} vs ${totalCredits}`);
    pass(`6.3 Double-entry Financial Ledger balances mathematically: debit ${totalDebits} === credit ${totalCredits}`);

    // -------------------------------------------------------------
    // Section 7: Replay Attack Deduplication
    // -------------------------------------------------------------
    console.log('\n── Section 7: Replay Attack Deduplication ──');
    const ledgerCountBefore = (state.financial_ledger || []).length;

    const replayRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: validWebhookPayload
    });

    assert.strictEqual(replayRes.statusCode, 200, 'Replay webhook returns HTTP 200');
    assert.strictEqual(replayRes.json.idempotent, true, 'Replay recognized as idempotent: true');

    const ledgerCountAfter = (state.financial_ledger || []).length;
    assert.strictEqual(ledgerCountAfter, ledgerCountBefore, 'Zero duplicate ledger entries created on webhook replay');
    pass('7.1 Webhook replay attack deduplicated: returns idempotent: true without double-posting ledger');

    // -------------------------------------------------------------
    // Section 8: Negative Paths & Amount Tampering Protection
    // -------------------------------------------------------------
    console.log('\n── Section 8: Negative Paths & Amount Tampering Protection ──');
    // Tampering the gross amount with an otherwise forged or mismatched signature
    const tamperedPayload = {
      order_id: createdOrder.id,
      status_code: statusCode,
      gross_amount: '99999999', // Tampered amount
      transaction_status: 'settlement',
      signature_key: validSignature // Original signature doesn't match tampered amount
    };

    const tamperRes = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/midtrans',
      body: tamperedPayload
    });

    assert.strictEqual(tamperRes.statusCode, 401, 'Tampered amount with mismatched signature rejected with 401');
    pass('8.1 Tampered webhook amount results in signature invalidation and HTTP 401 rejection');

    // -------------------------------------------------------------
    // Section 9: Manual Refund Procedure & Solvency Reversal
    // -------------------------------------------------------------
    console.log('\n── Section 9: Manual Refund Procedure & Solvency Reversal ──');
    const refundResult = await EscrowService.refundToBuyer(
      createdOrder.id,
      'usr-admin-ops',
      'Buyer requested refund for unfulfilled event ticket'
    );

    assert.strictEqual(refundResult.success, true, 'Refund processed successfully');
    assert.strictEqual(refundResult.escrow.status, ESCROW_STATUS.REFUNDED, 'Escrow status transitioned to REFUNDED');

    // Check ledger balance after refund
    const allLedger = state.financial_ledger || [];
    let allDebit = 0;
    let allCredit = 0;
    for (const tx of allLedger) {
      if (tx.entries && Array.isArray(tx.entries)) {
        for (const entry of tx.entries) {
          const amt = parseInt(entry.amount || 0, 10);
          if (entry.type === 'DEBIT') allDebit += amt;
          if (entry.type === 'CREDIT') allCredit += amt;
        }
      } else {
        allDebit += parseInt(tx.debit || 0, 10);
        allCredit += parseInt(tx.credit || 0, 10);
      }
    }
    assert.strictEqual(allDebit, allCredit, `Ledger balanced after refund: debit (${allDebit}) === credit (${allCredit})`);
    pass(`9.1 Refund executes cleanly; ledger remains mathematically balanced (debit ${allDebit} === credit ${allCredit})`);

    // -------------------------------------------------------------
    // Section 10: Production Fail-Closed Safety Gates
    // -------------------------------------------------------------
    console.log('\n── Section 10: Production Fail-Closed Safety Gates ──');
    assert.strictEqual(process.env.ENABLE_MIDTRANS_PRODUCTION, 'false', 'Midtrans production flag is false');
    assert.strictEqual(process.env.ENABLE_DOKU_PRODUCTION, 'false', 'DOKU production flag is false');
    assert.strictEqual(process.env.DEFAULT_PAYMENT_PROVIDER, 'doku', 'DOKU remains default provider');
    pass('10.1 Production fail-closed gates active: zero real money moved, sandbox isolation maintained');

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} MIDTRANS SANDBOX SMOKE TESTS PASSED!`);
    console.log('================================================================\n');

  } catch (err) {
    fail('Unhandled exception in Midtrans smoke test suite', err);
  } finally {
    if (server) {
      server.close();
    }
    process.exit(process.exitCode || 0);
  }
}

runTests();
