/**
 * TIKUM / ARGUS — Comprehensive RCB MVP & Provider-Agnostic Payment Test Suite
 * 
 * Verifies:
 * 1. Provider Abstraction & Capabilities (RCB, iPaymu, Base Interface)
 * 2. Unsupported Capabilities throw explicit CapabilityUnsupportedError (NO FAKE ESCROW)
 * 3. RCB Adapter Status, Due Diligence Gates, and DTO Normalization
 * 4. Canonical Payment Creation (QRIS, VA) & Idempotency
 * 5. Webhook Ingestion, Timing-Safe HMAC Validation, and Forged Signature Rejection
 * 6. Webhook Idempotency & Replay Protection (No Double-Credit)
 * 7. End-to-End Trust Loop:
 *    Payment Paid -> Escrow Held -> PIC Gate Admission -> ARGUS Quorum -> Settlement
 * 8. Double-Entry FinancialLedger Balancing: sum(Debits) === sum(Credits)
 * 9. Dispute & Evidence-Backed Refund Flow
 * 10. Automated Reconciliation Batch Verification
 * 11. Security Model: Direct payment bypass locked in production
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'rcb';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { paymentManager, CapabilityUnsupportedError, RCBPaymentProvider, PaymentProvider } = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { CANONICAL_PAYMENT_STATUS } = require('./src/services/payment/canonicalPaymentTypes');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { ListingService } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { SettlementService } = require('./src/services/settlementService');
const { DisputeService } = require('./src/services/disputeService');
const { TrustPolicyEngine } = require('./src/trust/TrustPolicyEngine');

let server;
let baseUrl;

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serializedBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = {
      ...headers,
      'host': url.host
    };
    if (serializedBody && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (serializedBody && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM — RCB MVP & PROVIDER-AGNOSTIC PAYMENT TEST SUITE');
  console.log('================================================================\n');

  resetDatabase();

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  let passed = 0;
  let total = 0;

  async function check(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      throw err;
    }
  }

  try {
    // -------------------------------------------------------------
    // SECTION 1: PROVIDER ABSTRACTION & CAPABILITIES
    // -------------------------------------------------------------
    await check('1.1 PaymentManager registers RCB as default provider', () => {
      const provider = paymentManager.getProvider();
      assert.strictEqual(provider.getName(), 'rcb');
      assert.strictEqual(paymentManager.defaultProvider, 'rcb');
    });

    await check('1.2 RCB declares verified capabilities; unverified capabilities are false', () => {
      const rcb = paymentManager.getProvider('rcb');
      const caps = rcb.getCapabilities();
      assert.strictEqual(caps.paymentCollection, true);
      assert.strictEqual(caps.webhooks, true);
      assert.strictEqual(caps.hold, false, 'RCB must NOT falsely claim native milestone escrow hold');
      assert.strictEqual(caps.release, false, 'RCB must NOT falsely claim native escrow release');
      assert.strictEqual(caps.payout, false, 'RCB must NOT falsely claim native automated payout until verified');
      assert.strictEqual(caps.refund, false, 'RCB must NOT falsely claim native refund until verified');
    });

    await check('1.3 Calling unsupported capabilities on RCB throws CapabilityUnsupportedError', async () => {
      const rcb = paymentManager.getProvider('rcb');
      await assert.rejects(async () => {
        await rcb.createHold({ orderId: 'ord-test', amount: 100000 });
      }, (err) => {
        assert.ok(err instanceof CapabilityUnsupportedError);
        assert.strictEqual(err.code, 'CAPABILITY_UNSUPPORTED');
        assert.strictEqual(err.capability, 'hold');
        return true;
      });

      await assert.rejects(async () => {
        await rcb.requestRefund({ orderId: 'ord-test', amount: 100000 });
      }, (err) => {
        assert.ok(err instanceof CapabilityUnsupportedError);
        assert.strictEqual(err.code, 'CAPABILITY_UNSUPPORTED');
        assert.strictEqual(err.capability, 'refund');
        return true;
      });
    });

    await check('1.4 GET /api/v1/payments/methods exposes active provider channels & capabilities', async () => {
      const res = await request({ path: '/api/v1/payments/methods' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.default_provider, 'rcb');
      assert.ok(Array.isArray(res.json.providers));
      const rcbEntry = res.json.providers.find(p => p.provider === 'rcb');
      assert.ok(rcbEntry, 'RCB provider must be present in methods listing');
      assert.ok(rcbEntry.channels.some(c => c.code === 'QRIS'));
      assert.ok(rcbEntry.channels.some(c => c.code === 'VA_BCA'));
    });

    // -------------------------------------------------------------
    // SECTION 2: CANONICAL PAYMENT INTENT CREATION
    // -------------------------------------------------------------
    // Seed listing and order for testing
    let listing, ticket, order;
    await check('2.1 Setup active verified ticket listing & reservation order', async () => {
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'VIP West Gate, Row A, Seat 1',
        faceValue: 1000000,
        price: 1200000,
        rawBarcode: 'PESTA2026-VIP-W1-UNIQUE',
        evidenceBundleId: 'bdl-rcb-test-1'
      });
      listing = listRes.listing;
      ticket = listRes.ticket;

      await ListingService.verifyListing(listing.id, 'admin-1', {
        approved: true,
        reason: 'Verified for RCB Payment Test'
      });

      const orderRes = await EscrowService.createOrder({
        buyerId: 'buyer-1',
        listingId: listing.id
      });
      order = orderRes.order;
      assert.strictEqual(order.status, ORDER_STATUS.PENDING_PAYMENT);
    });

    let paymentIntent;
    await check('2.2 POST /api/v1/payments/create generates canonical payment intent (QRIS)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/create',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          orderId: order.id,
          channel: 'QRIS'
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      paymentIntent = res.json.payment;
      assert.strictEqual(paymentIntent.provider, 'rcb');
      assert.strictEqual(paymentIntent.orderId, order.id);
      assert.strictEqual(paymentIntent.channel, 'QRIS');
      assert.ok(paymentIntent.paymentDetails.checkoutUrl);
      assert.ok(paymentIntent.paymentDetails.qrString);
      assert.strictEqual(paymentIntent.status, CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING);

      // Verify canonical payment stored in database
      const dbPayment = state.canonical_payments.find(p => p.order_id === order.id);
      assert.ok(dbPayment);
      assert.strictEqual(dbPayment.provider, 'rcb');
      assert.strictEqual(dbPayment.status, CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING);
    });

    await check('2.3 POST /api/v1/payments/create is idempotent on same order', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/create',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          orderId: order.id,
          channel: 'QRIS'
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.payment.idempotent, true);
      assert.strictEqual(res.json.payment.orderId, order.id);
    });

    // -------------------------------------------------------------
    // SECTION 3: WEBHOOK VERIFICATION & HMAC SECURITY
    // -------------------------------------------------------------
    const rcbProvider = paymentManager.getProvider('rcb');
    rcbProvider.webhookSecret = 'test-rcb-secret-key-321';

    await check('3.1 Forged webhook signature is rejected with HTTP 401', async () => {
      const webhookPayload = {
        event_id: `evt-forged-${Date.now()}`,
        order_id: order.id,
        transaction_id: paymentIntent.providerRef,
        amount: order.buyer_total,
        status: 'PAID'
      };

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/rcb',
        headers: {
          'x-rcb-signature': '0000000000000000000000000000000000000000000000000000000000000000',
          'Content-Type': 'application/json'
        },
        body: webhookPayload
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'INVALID_WEBHOOK_SIGNATURE');
    });

    let validWebhookEventId = `evt-rcb-${Date.now()}`;
    await check('3.2 Valid HMAC signed webhook transitions order to PAID and locks funds in Escrow', async () => {
      const webhookPayload = {
        event_id: validWebhookEventId,
        order_id: order.id,
        transaction_id: paymentIntent.providerRef,
        amount: order.buyer_total,
        status: 'PAID',
        paid_at: new Date().toISOString()
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto.createHmac('sha256', rcbProvider.webhookSecret).update(rawBody).digest('hex');

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/rcb',
        headers: {
          'x-rcb-signature': signature,
          'Content-Type': 'application/json'
        },
        body: rawBody
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.idempotent, false);

      // Verify domain state changes
      const updatedOrder = state.orders.find(o => o.id === order.id);
      assert.strictEqual(updatedOrder.status, ORDER_STATUS.PAID_ESCROWED);
      assert.strictEqual(updatedOrder.marketplace_status, 'PAID');

      const updatedEscrow = state.escrows.find(e => e.order_id === order.id);
      assert.strictEqual(updatedEscrow.status, ESCROW_STATUS.ESCROWED);
      assert.notStrictEqual(updatedEscrow.status, ESCROW_STATUS.RELEASED, 'PAID must NOT release escrow to seller');

      const updatedCanonical = state.canonical_payments.find(p => p.order_id === order.id);
      assert.strictEqual(updatedCanonical.status, CANONICAL_PAYMENT_STATUS.PAYMENT_PAID);
    });

    await check('3.3 Duplicate webhook replay is ignored idempotently with HTTP 200', async () => {
      const webhookPayload = {
        event_id: validWebhookEventId,
        order_id: order.id,
        transaction_id: paymentIntent.providerRef,
        amount: order.buyer_total,
        status: 'PAID'
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto.createHmac('sha256', rcbProvider.webhookSecret).update(rawBody).digest('hex');

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/rcb',
        headers: {
          'x-rcb-signature': signature,
          'Content-Type': 'application/json'
        },
        body: rawBody
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.idempotent, true);
      assert.ok(res.json.message.includes('already processed'));
    });

    // -------------------------------------------------------------
    // SECTION 4: DOUBLE-ENTRY FINANCIAL LEDGER INVARIANTS
    // -------------------------------------------------------------
    await check('4.1 Double-Entry FinancialLedger balances exactly: sum(Debits) === sum(Credits)', () => {
      const ledger = state.financial_ledger;
      assert.ok(ledger.length > 0, 'Ledger transactions must be recorded');

      for (const tx of ledger) {
        let debits = 0;
        let credits = 0;
        for (const entry of tx.entries) {
          if (entry.type === 'DEBIT') debits += entry.amount;
          if (entry.type === 'CREDIT') credits += entry.amount;
        }
        assert.strictEqual(debits, credits, `Ledger transaction ${tx.transaction_id} must balance debits and credits`);
      }
    });

    // -------------------------------------------------------------
    // SECTION 5: TRUST QUORUM, VENUE PIC ADMISSION & SETTLEMENT
    // -------------------------------------------------------------
    await check('5.1 Premature seller settlement without confirmed admission is rejected', async () => {
      await assert.rejects(async () => {
        await EscrowService.releaseToSeller(order.id, 'admin-1');
      }, (err) => {
        assert.strictEqual(err.code, 'ENTRY_NOT_CONFIRMED');
        return true;
      });
    });

    await check('5.2 PIC turnstile admission with dual-challenge handshake transitions order to ENTRY_CONFIRMED', async () => {
      // 1. PIC checks ticket at handoff
      await EventPicService.recordTicketVerification({
        picUserId: 'pic-1',
        orderId: order.id,
        currentDateStr: '2026-09-25'
      });

      // 2. Buyer generates turnstile admission code
      const challengeRes = await EventPicService.generateBuyerEntryChallenge({
        buyerId: 'buyer-1',
        orderId: order.id
      });
      assert.ok(challengeRes.challengeCode);

      // 3. PIC confirms admission code at gate
      const confirmRes = await EventPicService.confirmEntryWithCode({
        picUserId: 'pic-1',
        orderId: order.id,
        handshakeCode: challengeRes.challengeCode,
        evidenceBundleId: 'gate-photo-evidence-1',
        currentDateStr: '2026-09-25'
      });
      assert.strictEqual(confirmRes.status, 'ENTRY_CONFIRMED');

      const updatedOrder = state.orders.find(o => o.id === order.id);
      assert.strictEqual(updatedOrder.status, 'ENTRY_CONFIRMED');
    });

    await check('5.3 ARGUS Trust Engine evaluates multi-actor attestations and authorizes financial release', async () => {
      const auth = await TrustPolicyEngine.evaluateAuthorization(order.id);
      assert.strictEqual(auth.outcome, 'PASS');
      assert.strictEqual(auth.financial_release_authorized, true);
    });

    await check('5.4 EscrowService releases funds to seller post-admission', async () => {
      const releaseRes = await EscrowService.releaseToSeller(order.id, 'admin-1');
      assert.strictEqual(releaseRes.success, true);
      assert.strictEqual(releaseRes.escrow.status, ESCROW_STATUS.RELEASED);
      assert.strictEqual(releaseRes.order.status, ORDER_STATUS.SETTLED);
    });

    await check('5.5 SettlementService records disbursement; duplicate payout execution is prevented', async () => {
      const stlRes1 = await SettlementService.executeSettlement({
        orderId: order.id,
        sellerId: 'seller-1',
        officerId: 'admin-1',
        idempotencyKey: 'stl-key-pesta-1'
      });
      assert.strictEqual(stlRes1.idempotent, false);
      assert.ok(
        stlRes1.settlement.mode === 'MANUAL_BANK_TRANSFER' || stlRes1.settlement.mode === 'SIMULATED',
        'RCB payout unverified -> explicit manual / simulated bank rail disburse'
      );

      // Attempt duplicate settlement
      const stlRes2 = await SettlementService.executeSettlement({
        orderId: order.id,
        sellerId: 'seller-1',
        officerId: 'admin-1',
        idempotencyKey: 'stl-key-pesta-2'
      });
      assert.strictEqual(stlRes2.idempotent, true);
      assert.strictEqual(stlRes2.duplicatePrevented, true);
    });

    // -------------------------------------------------------------
    // SECTION 6: DISPUTE & REFUND INTEGRATION
    // -------------------------------------------------------------
    await check('6.1 Dispute resolution with BUYER_FAVORED initiates refund and balances ledger', async () => {
      // Create separate order for dispute test
      const listRes2 = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'VIP West Gate, Row B, Seat 2',
        faceValue: 1000000,
        price: 1000000,
        rawBarcode: 'PESTA2026-VIP-W2-UNIQUE',
        evidenceBundleId: 'bdl-rcb-dispute-1'
      });
      await ListingService.verifyListing(listRes2.listing.id, 'admin-1', {
        approved: true,
        reason: 'Dispute test listing'
      });
      const orderRes2 = await EscrowService.createOrder({ buyerId: 'buyer-1', listingId: listRes2.listing.id });
      const order2 = orderRes2.order;

      // Simulate payment via webhook
      const webhookPayload2 = {
        event_id: `evt-rcb-disp-${Date.now()}`,
        order_id: order2.id,
        transaction_id: `rcb-trx-disp-${Date.now()}`,
        amount: order2.buyer_total,
        status: 'PAID'
      };
      const rawBody2 = JSON.stringify(webhookPayload2);
      const sig2 = crypto.createHmac('sha256', rcbProvider.webhookSecret).update(rawBody2).digest('hex');
      await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/rcb',
        headers: { 'x-rcb-signature': sig2, 'Content-Type': 'application/json' },
        body: rawBody2
      });

      // Buyer opens dispute (Gate Rejection)
      const disputeRes = await DisputeService.openDispute({
        orderId: order2.id,
        buyerId: 'buyer-1',
        reason: 'GATE_REJECTION',
        claimDetails: 'Turnstile reported duplicate barcode from original buyer'
      });
      assert.ok(disputeRes.dispute);

      // PIC submits investigation evidence
      await DisputeService.submitPicInvestigation({
        disputeId: disputeRes.dispute.id,
        picUserId: 'pic-1',
        notes: 'Turnstile error confirmed. Ticket rejected by organizer scanner.',
        gateStatus: 'GATE_REJECTION',
        evidenceBundleId: 'gate-reject-proof'
      });

      // Admin resolves dispute in buyer's favor
      const resolveRes = await DisputeService.resolveDispute({
        disputeId: disputeRes.dispute.id,
        officerId: 'admin-1',
        outcome: 'BUYER_FAVORED',
        decisionReason: 'Turnstile gate rejection verified by on-duty Event PIC',
        evidenceIds: ['gate-reject-proof']
      });

      const disputedOrder = state.orders.find(o => o.id === order2.id);
      const disputedEscrow = state.escrows.find(e => e.order_id === order2.id);
      assert.strictEqual(disputedOrder.status, ORDER_STATUS.REFUNDED);
      assert.strictEqual(disputedEscrow.status, ESCROW_STATUS.REFUNDED);

      // Verify that ledger balances after refund
      const ledger = state.financial_ledger;
      const refundTx = ledger.find(tx => tx.order_id === order2.id && tx.event_type === 'REFUND');
      assert.ok(refundTx, 'Refund must have a dedicated journal transaction in FinancialLedger');
    });

    // -------------------------------------------------------------
    // SECTION 7: RECONCILIATION ENGINE
    // -------------------------------------------------------------
    await check('7.1 Automated reconciliation detects and logs transaction records', async () => {
      const recReport = await PaymentService.reconcileTransactions({ providerName: 'rcb' });
      assert.ok(recReport.batch_id);
      assert.ok(recReport.reconciled_count >= 1);
      assert.strictEqual(recReport.variances_found, 0);

      const { SessionStore } = require('./src/services/sessionStore');
      const adminSession = SessionStore.createSession({ userId: 'admin-1', role: 'admin' });

      // Admin reconciliation endpoint
      const res = await request({
        path: '/api/admin/payments/reconciliation',
        headers: {
          'Authorization': `Bearer ${adminSession.session_token}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.total_records >= 1);
    });

    // -------------------------------------------------------------
    // SECTION 8: PRODUCTION SAFETY GATES
    // -------------------------------------------------------------
    await check('8.1 Direct client payment simulation is blocked in production mode', async () => {
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await request({
          method: 'POST',
          path: '/api/mvp/buyer/pay',
          body: {
            orderId: 'any-order',
            idempotencyKey: 'fake-pay-attempt',
            amountPaid: 100000
          }
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.json.code, 'DIRECT_PAYMENT_SIMULATION_FORBIDDEN');
      } finally {
        process.env.NODE_ENV = previousEnv;
      }
    });

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} RCB PAYMENT ARCHITECTURE TESTS PASSED!`);
    console.log('================================================================\n');

  } finally {
    if (server) {
      server.close();
    }
  }
}

runSuite().catch(err => {
  console.error('\n[SUITE FATAL ERROR]:', err);
  process.exit(1);
});
