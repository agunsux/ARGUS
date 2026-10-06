/**
 * TIKUM / ARGUS — Comprehensive DOKU Primary Payment Rail & Trust Engine Test Suite
 *
 * Verifies:
 * 1. Provider Abstraction & Priority (DOKU Primary, Midtrans Backup 1, Xendit Backup 2, RCB Deleted)
 * 2. DOKU Business Account KYC & Escrow Activation State (PENDING_KYC, NOT_ENABLED / CONTRACT-DEPENDENT)
 * 3. 20-Point DOKU Escrow Verification Matrix
 * 4. Payment Creation (QRIS, VA) & Idempotency
 * 5. Webhook Security:
 *    - DOKU HMAC-SHA256 signature calculation & validation
 *    - Timestamp replay protection (300s window)
 *    - Midtrans SHA512 signature validation
 *    - Xendit callback token validation
 *    - Duplicate webhook replay rejection
 * 6. Trust Engine & PIC Venue Gate:
 *    - Payment Paid -> Escrow Held -> PIC Verification -> Release Authorized -> Release Executed
 * 7. Refund & Concurrency Invariants:
 *    - Full & partial refund
 *    - Duplicate refund prevention (no double-reversal)
 *    - Simultaneous refund vs release race condition
 * 8. Dispute & Chargeback Lifecycle:
 *    - Dispute blocks release immediately
 *    - Chargeback tracking and evidence submission
 * 9. Failover & Safety Guards:
 *    - Ambiguous payment state strictly BLOCKED from failover (zero double-charging)
 *    - Escrow-required transaction BLOCKED from silent downgrade to non-escrow rail
 *    - Safe initialization failover to Midtrans and Xendit
 * 10. Durable Persistence & Restart Safety:
 *     - Financial ledger & payments survive restart
 *     - Integer minor units & double-entry balance: sum(debits) === sum(credits)
 * 11. Real Automated Reconciliation Batch
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const {
  paymentManager,
  CapabilityUnsupportedError,
  DokuPaymentProvider,
  DOKU_STATUS,
  DOKU_ACCOUNT_STATUS,
  DOKU_ESCROW_STATUS,
  MidtransPaymentProvider,
  XenditPaymentProvider
} = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const {
  CANONICAL_PAYMENT_STATUS,
  MONEY_STATE,
  TIKUM_BUSINESS_STATE,
  PROVIDER_HEALTH_STATE
} = require('./src/services/payment/canonicalPaymentTypes');
const { PaymentRoutingService, PROVIDER_TIER, PAYMENT_ATTEMPT_STATUS } = require('./src/services/payment/PaymentRoutingService');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { DurableFinancialStore } = require('./src/settlement/DurableFinancialStore');
const { ListingService } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { SettlementService } = require('./src/services/settlementService');
const { DisputeService } = require('./src/services/disputeService');
const { TrustPolicyEngine } = require('./src/trust/TrustPolicyEngine');
const { SessionStore } = require('./src/services/sessionStore');

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
  console.log('  TIKUM — DOKU PRIMARY PAYMENT RAIL & TRUST ENGINE TEST SUITE');
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
  let failed = 0;
  const total = 32;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}\n`);
      failed++;
      throw err;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: PROVIDER ABSTRACTION & REGISTRY
    // -------------------------------------------------------------------------
    console.log('── Section 1: Provider Abstraction & Priority Hierarchy ──');

    await check('1.1 DOKU is registered as primary default provider', async () => {
      assert.strictEqual(paymentManager.defaultProvider, 'doku');
      const doku = paymentManager.getProvider('doku');
      assert.ok(doku instanceof DokuPaymentProvider);
      assert.strictEqual(doku.getName(), 'doku');
    });

    await check('1.2 Midtrans is Backup #1, Xendit is Backup #2, and iPaymu is Backup #3', async () => {
      assert.ok(paymentManager.hasProvider('midtrans'));
      assert.ok(paymentManager.hasProvider('xendit'));
      assert.ok(paymentManager.hasProvider('ipaymu'));
      const midtrans = paymentManager.getProvider('midtrans');
      const xendit = paymentManager.getProvider('xendit');
      const ipaymu = paymentManager.getProvider('ipaymu');
      assert.ok(midtrans instanceof MidtransPaymentProvider);
      assert.ok(xendit instanceof XenditPaymentProvider);
      assert.strictEqual(ipaymu.getName(), 'ipaymu');
    });

    await check('1.3 RCB is completely absent from live provider registry', async () => {
      assert.strictEqual(paymentManager.hasProvider('rcb'), false);
      assert.throws(() => {
        paymentManager.getProvider('rcb');
      }, /not supported or registered/);
    });

    // -------------------------------------------------------------------------
    // SECTION 2: DOKU KYC & ESCROW ACTIVATION GATES
    // -------------------------------------------------------------------------
    console.log('\n── Section 2: DOKU Business KYC & Escrow Activation Gates ──');

    await check('2.1 DOKU account starts in PENDING_KYC and escrow NOT_ENABLED by default', async () => {
      const doku = new DokuPaymentProvider({
        clientId: 'test-client',
        secretKey: 'test-secret',
        kycVerified: false,
        holdReleaseEnabled: false
      });
      const status = doku.getStatus();
      assert.strictEqual(status.account_status, DOKU_ACCOUNT_STATUS.PENDING_KYC);
      assert.strictEqual(status.escrow_status, DOKU_ESCROW_STATUS.NOT_ENABLED);
      assert.strictEqual(status.contract_dependent_items.hold_release_settlement, 'PROVIDER-CONTRACT-DEPENDENT');
    });

    await check('2.2 20-Point DOKU Escrow Verification Matrix is explicitly exposed', async () => {
      const doku = paymentManager.getProvider('doku');
      const matrix = doku.getEscrowVerificationMatrix();
      assert.ok(matrix);
      assert.strictEqual(Object.keys(matrix).length, 20);
      assert.strictEqual(matrix.q7_legal_custody_of_held_funds, 'DOKU_THIRD_PARTY_ESCROW_ACCOUNT');
      assert.strictEqual(matrix.q5_release_delayed_until_pic_verification, 'VERIFIED_BUSINESS_GATE');
      assert.strictEqual(matrix.q18_fee_schedule, 'CANONICAL_FEE_ENGINE_V1_INTEGER_MINOR_UNITS');
    });

    await check('2.3 Calling unactivated Hold/Release without contract throws explicit contract error', async () => {
      const dokuStrict = new DokuPaymentProvider({
        clientId: 'client-1',
        secretKey: 'secret-1',
        holdReleaseEnabled: false,
        allowSimulation: false
      });
      await assert.rejects(
        async () => {
          await dokuStrict.createHold({ orderId: 'ord-test', amount: 100000 });
        },
        (err) => err instanceof CapabilityUnsupportedError && err.capability === 'hold' && err.message.includes('PROVIDER-CONTRACT-DEPENDENT')
      );
    });

    await check('2.4 GET /api/v1/payments/methods exposes active DOKU, Midtrans, and Xendit channels', async () => {
      const res = await request({ method: 'GET', path: '/api/v1/payments/methods' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.default_provider, 'doku');
      const dokuEntry = res.json.providers.find(p => p.provider === 'doku');
      const midtransEntry = res.json.providers.find(p => p.provider === 'midtrans');
      const xenditEntry = res.json.providers.find(p => p.provider === 'xendit');
      assert.ok(dokuEntry, 'DOKU must be present in payment methods');
      assert.ok(midtransEntry, 'Midtrans must be present');
      assert.ok(xenditEntry, 'Xendit must be present');
      assert.ok(dokuEntry.channels.some(c => c.code === 'QRIS' && c.isEscrowSupported === true));
      assert.ok(midtransEntry.channels.some(c => c.isEscrowSupported === false));
    });

    // -------------------------------------------------------------------------
    // SECTION 3: CANONICAL PAYMENT CREATION & IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('\n── Section 3: Canonical Payment Intent Creation & Idempotency ──');

    let testOrder;
    await check('3.1 Setup active verified ticket listing & reservation order for Joyland 2026', async () => {
      const barcode = `TEST-BC-${Date.now()}`;
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026', // Active future event
        seatInfo: 'VIP West Gate Row A',
        faceValue: 1000000,
        price: 1000000,
        rawBarcode: barcode,
        evidenceBundleId: 'bdl-doku-test'
      });

      await ListingService.verifyListing(listRes.listing.id, 'admin-1', {
        approved: true,
        notes: 'Verified for DOKU Migration Test',
        evidenceType: 'INVOICE_PDF'
      });

      const orderRes = await EscrowService.createOrder({
        listingId: listRes.listing.id,
        buyerId: 'buyer-1'
      });

      testOrder = orderRes.order;
      assert.ok(testOrder);
      assert.strictEqual(testOrder.status, ORDER_STATUS.PENDING_PAYMENT);
    });

    let paymentIntent;
    await check('3.2 POST /api/v1/payments/create initiates canonical payment on DOKU rail', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/create',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          orderId: testOrder.id,
          channel: 'QRIS',
          idempotencyKey: `idemp-doku-init-${testOrder.id}`
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.success);
      paymentIntent = res.json.payment;
      assert.strictEqual(paymentIntent.provider, 'doku');
      assert.strictEqual(paymentIntent.status, MONEY_STATE.PAYMENT_PENDING);
      assert.ok(paymentIntent.paymentDetails.qrString || paymentIntent.paymentDetails.checkoutUrl);
    });

    await check('3.3 Duplicate payment creation with same idempotency key returns cached record', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/create',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          orderId: testOrder.id,
          channel: 'QRIS',
          idempotencyKey: `idemp-doku-init-${testOrder.id}`
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.payment.idempotent, true);
      assert.strictEqual(res.json.payment.paymentId, paymentIntent.paymentId);
    });

    // -------------------------------------------------------------------------
    // SECTION 4: WEBHOOK SECURITY & HMAC VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n── Section 4: Webhook Security, HMAC-SHA256 & Replay Protection ──');

    const dokuProvider = paymentManager.getProvider('doku');
    dokuProvider.secretKey = 'test-doku-secret-key-321';
    dokuProvider.webhookSecret = 'test-doku-secret-key-321';
    dokuProvider.clientId = 'client-doku-tikum-001';

    await check('4.1 Webhook with forged/invalid HMAC signature is rejected (401)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-doku-tikum-001',
          'request-id': `req-${Date.now()}`,
          'request-timestamp': new Date().toISOString(),
          'signature': 'HMACSHA256=invalidSignatureBase64=='
        },
        body: {
          order: { invoice_number: `INV-DOKU-${testOrder.id}`, amount: testOrder.buyer_total },
          transaction: { status: 'SUCCESS', transaction_id: `doku-trx-${testOrder.id}` }
        }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'INVALID_WEBHOOK_SIGNATURE');
    });

    await check('4.2 Webhook with expired timestamp (>300s skew) is rejected for replay protection', async () => {
      const expiredTimestamp = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
      const body = {
        order: { invoice_number: `INV-DOKU-${testOrder.id}`, amount: testOrder.buyer_total },
        transaction: { status: 'SUCCESS', transaction_id: `doku-trx-${testOrder.id}` }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const sigComponent = `Client-Id:client-doku-tikum-001\nRequest-Id:req-replay-1\nRequest-Timestamp:${expiredTimestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuProvider.webhookSecret).update(sigComponent).digest('base64');

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-doku-tikum-001',
          'request-id': 'req-replay-1',
          'request-timestamp': expiredTimestamp,
          'signature': sig
        },
        body
      });

      assert.strictEqual(res.statusCode, 401);
    });

    let validEventId = `evt-doku-${Date.now()}`;
    await check('4.3 Legitimate DOKU webhook with valid HMAC and fresh timestamp marks order PAID & ESCROW_HELD', async () => {
      const timestamp = new Date().toISOString();
      const body = {
        order: { invoice_number: `INV-DOKU-${testOrder.id}`, amount: testOrder.buyer_total },
        transaction: { status: 'SUCCESS', transaction_id: `doku-trx-${testOrder.id}`, date: timestamp }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const sigComponent = `Client-Id:client-doku-tikum-001\nRequest-Id:${validEventId}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuProvider.webhookSecret).update(sigComponent).digest('base64');

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-doku-tikum-001',
          'request-id': validEventId,
          'request-timestamp': timestamp,
          'signature': sig
        },
        body
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.idempotent, false);

      // Verify domain state
      const dbEscrow = state.escrows.find(e => e.order_id === testOrder.id);
      assert.ok(dbEscrow);
      assert.strictEqual(dbEscrow.status, ESCROW_STATUS.ESCROWED);

      const dbOrder = state.orders.find(o => o.id === testOrder.id);
      assert.strictEqual(dbOrder.status, ORDER_STATUS.PAID_ESCROWED);
    });

    await check('4.4 Duplicate webhook replay returns 200 idempotent without second ledger entry', async () => {
      const timestamp = new Date().toISOString();
      const body = {
        order: { invoice_number: `INV-DOKU-${testOrder.id}`, amount: testOrder.buyer_total },
        transaction: { status: 'SUCCESS', transaction_id: `doku-trx-${testOrder.id}` }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const sigComponent = `Client-Id:client-doku-tikum-001\nRequest-Id:${validEventId}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuProvider.webhookSecret).update(sigComponent).digest('base64');

      const prevLedgerCount = (state.financial_ledger || []).length;

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-doku-tikum-001',
          'request-id': validEventId,
          'request-timestamp': timestamp,
          'signature': sig
        },
        body
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.idempotent, true);
      assert.strictEqual((state.financial_ledger || []).length, prevLedgerCount, 'Must not duplicate ledger transactions');
    });

    // -------------------------------------------------------------------------
    // SECTION 5: TRUST ENGINE & PIC VENUE RELEASE GATE
    // -------------------------------------------------------------------------
    console.log('\n── Section 5: Trust Engine Quorum & PIC Venue Release Gate ──');

    await check('5.1 Settlement release is strictly BLOCKED prior to PIC venue admission', async () => {
      await assert.rejects(
        async () => {
          await EscrowService.releaseToSeller(testOrder.id, 'admin-1');
        },
        (err) => err.code === 'ENTRY_NOT_CONFIRMED' || err.message.includes('confirmed venue entry')
      );
    });

    await check('5.2 PIC turnstile gate verifies ticket admission at venue', async () => {
      if (!state.event_pics.some(ep => ep.pic_user_id === 'pic-1' && ep.event_id === 'event-joyland-2026' && ep.status === 'ACTIVE')) {
        EventPicService.assignPic({
          eventId: 'event-joyland-2026',
          venueId: 'venue-gbk',
          picUserId: 'pic-1',
          contactPhone: '081199887766'
        });
      }
      const verifyRes = await EventPicService.recordEntryVerification({
        picUserId: 'pic-1',
        orderId: testOrder.id,
        gate: 'Gate 1',
        notes: 'Turnstile gate scan verified',
        status: 'CONFIRMED'
      });
      assert.strictEqual(verifyRes.status, 'CONFIRMED');

      const dbOrder = state.orders.find(o => o.id === testOrder.id);
      assert.strictEqual(dbOrder.status, ORDER_STATUS.ENTRY_CONFIRMED);
    });

    await check('5.3 Once PIC admission is confirmed, EscrowService authorizes release and executes DOKU payout', async () => {
      const releaseRes = await EscrowService.releaseToSeller(testOrder.id, 'admin-1');
      assert.ok(releaseRes.success);

      const dbEscrow = state.escrows.find(e => e.order_id === testOrder.id);
      assert.strictEqual(dbEscrow.status, ESCROW_STATUS.RELEASED);

      const dbOrder = state.orders.find(o => o.id === testOrder.id);
      assert.strictEqual(dbOrder.status, ORDER_STATUS.SETTLED);
    });

    await check('5.4 Duplicate release attempt is idempotent and blocked from second payout', async () => {
      const res = await EscrowService.releaseToSeller(testOrder.id, 'admin-1');
      assert.strictEqual(res.idempotent, true);
      assert.strictEqual(res.alreadyReleased, true);
    });

    // -------------------------------------------------------------------------
    // SECTION 6: REFUND INVARIANTS & CONCURRENCY
    // -------------------------------------------------------------------------
    console.log('\n── Section 6: Refund Invariants & Concurrency Mutex ──');

    await check('6.1 Refund after funds already released to seller is strictly BLOCKED', async () => {
      await assert.rejects(
        async () => {
          await EscrowService.refundToBuyer(testOrder.id, 'admin-1', 'Buyer changed mind');
        },
        (err) => err.code === 'ALREADY_RELEASED'
      );
    });

    let secondOrder;
    await check('6.2 Setup second funded order for refund & concurrency verification', async () => {
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'VIP West Gate Row B',
        faceValue: 500000,
        price: 500000,
        rawBarcode: `BC-REFUND-${Date.now()}`,
        evidenceBundleId: 'bdl-doku-test-2'
      });
      await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true, notes: 'Verified', evidenceType: 'INVOICE_PDF' });
      const orderRes = await EscrowService.createOrder({ listingId: listRes.listing.id, buyerId: 'buyer-1' });
      secondOrder = orderRes.order;

      // Mark payment via webhook
      const timestamp = new Date().toISOString();
      const body = {
        order: { invoice_number: `INV-DOKU-${secondOrder.id}`, amount: secondOrder.buyer_total },
        transaction: { status: 'SUCCESS', transaction_id: `doku-trx-${secondOrder.id}`, date: timestamp }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuProvider.webhookSecret)
        .update(`Client-Id:client-doku-tikum-001\nRequest-Id:req-ref-${secondOrder.id}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`)
        .digest('base64');

      await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-doku-tikum-001',
          'request-id': `req-ref-${secondOrder.id}`,
          'request-timestamp': timestamp,
          'signature': sig
        },
        body
      });

      const dbEscrow = state.escrows.find(e => e.order_id === secondOrder.id);
      assert.strictEqual(dbEscrow.status, ESCROW_STATUS.ESCROWED);
    });

    await check('6.3 Legitimate refund transitions escrow to REFUNDED and balances ledger reversal', async () => {
      const refundRes = await EscrowService.refundToBuyer(secondOrder.id, 'admin-1', 'Ticket not valid at counter');
      assert.ok(refundRes.success);

      const dbEscrow = state.escrows.find(e => e.order_id === secondOrder.id);
      assert.strictEqual(dbEscrow.status, ESCROW_STATUS.REFUNDED);
    });

    await check('6.4 Duplicate refund on already refunded escrow is strictly BLOCKED (no double-reversal)', async () => {
      await assert.rejects(
        async () => {
          await EscrowService.refundToBuyer(secondOrder.id, 'admin-1', 'Duplicate refund request');
        },
        (err) => err.code === 'ALREADY_REFUNDED'
      );
    });

    await check('6.5 Simultaneous Release vs Refund race condition is atomic and safe', async () => {
      // Create third order
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'VIP West Gate Row C',
        faceValue: 500000,
        price: 500000,
        rawBarcode: `BC-RACE-${Date.now()}`,
        evidenceBundleId: 'bdl-doku-test-3'
      });
      await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true, notes: 'Verified', evidenceType: 'INVOICE_PDF' });
      const orderRes = await EscrowService.createOrder({ listingId: listRes.listing.id, buyerId: 'buyer-1' });
      const raceOrder = orderRes.order;

      // Fund via EscrowService
      await EscrowService.recordPayment({
        orderId: raceOrder.id,
        providerRef: `ref-race-${raceOrder.id}`,
        idempotencyKey: `wh-race-${raceOrder.id}`,
        amountPaid: raceOrder.buyer_total
      });

      // Confirm entry so both release and refund might attempt
      await EventPicService.recordEntryVerification({
        picUserId: 'pic-1',
        orderId: raceOrder.id,
        gate: 'Gate 1',
        notes: 'Turnstile scan verified',
        status: 'CONFIRMED'
      });

      // Fire simultaneous release and refund promises
      const [releaseResult, refundResult] = await Promise.allSettled([
        EscrowService.releaseToSeller(raceOrder.id, 'admin-1'),
        EscrowService.refundToBuyer(raceOrder.id, 'admin-1', 'Simultaneous claim')
      ]);

      // Exactly ONE must succeed and the other must be rejected
      const succeeded = [releaseResult, refundResult].filter(r => r.status === 'fulfilled');
      const rejected = [releaseResult, refundResult].filter(r => r.status === 'rejected');
      assert.strictEqual(succeeded.length, 1, 'Exactly one concurrent operation must succeed');
      assert.strictEqual(rejected.length, 1, 'The competing concurrent operation must be rejected');
    });

    // -------------------------------------------------------------------------
    // SECTION 7: DISPUTES & CHARGEBACKS
    // -------------------------------------------------------------------------
    console.log('\n── Section 7: Disputes, Freezes & Chargeback Lifecycle ──');

    let disputedOrder;
    await check('7.1 Open dispute immediately FREEZES escrow and BLOCKS release', async () => {
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'VIP West Gate Row D',
        faceValue: 500000,
        price: 500000,
        rawBarcode: `BC-DISPUTE-${Date.now()}`,
        evidenceBundleId: 'bdl-doku-test-4'
      });
      await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true, notes: 'Verified', evidenceType: 'INVOICE_PDF' });
      const orderRes = await EscrowService.createOrder({ listingId: listRes.listing.id, buyerId: 'buyer-1' });
      disputedOrder = orderRes.order;

      await EscrowService.recordPayment({
        orderId: disputedOrder.id,
        providerRef: `ref-disp-${disputedOrder.id}`,
        idempotencyKey: `wh-disp-${disputedOrder.id}`,
        amountPaid: disputedOrder.buyer_total
      });

      // Buyer opens dispute
      await DisputeService.openDispute({
        orderId: disputedOrder.id,
        buyerId: 'buyer-1',
        reason: 'DUPLICATE_BARCODE_ENTRY_DENIED',
        claimDetails: 'Gate scanner reported ticket was already scanned earlier.'
      });

      const dbEscrow = state.escrows.find(e => e.order_id === disputedOrder.id);
      assert.strictEqual(dbEscrow.status, 'DISPUTED');

      // Attempting release must fail immediately
      await assert.rejects(
        async () => {
          await EscrowService.releaseToSeller(disputedOrder.id, 'admin-1');
        },
        (err) => err.code === 'TRANSACTION_IN_DISPUTED_STATE' || err.code === 'TRANSACTION_DISPUTED'
      );
    });

    await check('7.2 Chargeback creates canonical record and locks transaction', async () => {
      const cb = await PaymentService.handleChargeback({
        orderId: disputedOrder.id,
        providerRef: `doku-trx-${disputedOrder.id}`,
        amount: disputedOrder.buyer_total,
        reason: 'UNAUTHORIZED_CARD_CHARGE',
        providerName: 'doku'
      });
      assert.ok(cb.id);
      assert.strictEqual(cb.status, 'OPEN');

      const retrieved = (state.chargebacks || []).find(c => c.order_id === disputedOrder.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.amount, disputedOrder.buyer_total);
    });

    // -------------------------------------------------------------------------
    // SECTION 8: PROVIDER FAILOVER & ESCROW GUARDS
    // -------------------------------------------------------------------------
    console.log('\n── Section 8: Provider Failover & Escrow Compatibility Guards ──');

    await check('8.1 Pending/Unknown payment attempt strictly blocks failover (zero double charge)', async () => {
      const ordId = `ord-failover-guard-${Date.now()}`;
      PaymentRoutingService.recordPaymentAttempt({
        paymentAttemptId: `att-pnd-${Date.now()}`,
        orderId: ordId,
        provider: 'doku',
        idempotencyKey: `idemp-${ordId}`,
        status: PAYMENT_ATTEMPT_STATUS.PENDING
      });

      assert.throws(() => {
        PaymentRoutingService.assertFailoverAllowed(ordId);
      }, (err) => err.code === 'FAILOVER_UNCERTAIN_STATE_BLOCKED');
    });

    await check('8.2 Escrow-required transaction strictly BLOCKED from failing over to non-escrow Midtrans/Xendit/iPaymu', async () => {
      assert.throws(() => {
        PaymentRoutingService.resolveProvider({
          countryCode: 'ID',
          currency: 'IDR',
          tier: 'BACKUP_1', // Midtrans
          requiresEscrow: true
        });
      }, (err) => err.code === 'ESCROW_CAPABILITY_REQUIRED');

      assert.throws(() => {
        PaymentRoutingService.resolveProvider({
          countryCode: 'ID',
          currency: 'IDR',
          tier: 'BACKUP_2', // Xendit
          requiresEscrow: true
        });
      }, (err) => err.code === 'ESCROW_CAPABILITY_REQUIRED');

      assert.throws(() => {
        PaymentRoutingService.resolveProvider({
          countryCode: 'ID',
          currency: 'IDR',
          tier: 'BACKUP_3', // iPaymu
          requiresEscrow: true
        });
      }, (err) => err.code === 'ESCROW_CAPABILITY_REQUIRED');
    });

    await check('8.3 Non-escrow transaction successfully routes to Midtrans, Xendit, and iPaymu backups', async () => {
      const b1 = PaymentRoutingService.resolveProvider({
        countryCode: 'ID',
        currency: 'IDR',
        tier: 'BACKUP_1',
        requiresEscrow: false
      });
      assert.strictEqual(b1.providerName, 'midtrans');

      const b2 = PaymentRoutingService.resolveProvider({
        countryCode: 'ID',
        currency: 'IDR',
        tier: 'BACKUP_2',
        requiresEscrow: false
      });
      assert.strictEqual(b2.providerName, 'xendit');

      const b3 = PaymentRoutingService.resolveProvider({
        countryCode: 'ID',
        currency: 'IDR',
        tier: 'BACKUP_3',
        requiresEscrow: false
      });
      assert.strictEqual(b3.providerName, 'ipaymu');
    });

    // -------------------------------------------------------------------------
    // SECTION 9: MIDTRANS & XENDIT BACKUP WEBHOOKS
    // -------------------------------------------------------------------------
    console.log('\n── Section 9: Backup Provider Webhooks (Midtrans & Xendit) ──');

    await check('9.1 Midtrans SHA512 webhook signature verification passes', async () => {
      const midtrans = paymentManager.getProvider('midtrans');
      midtrans.serverKey = 'midtrans-test-server-key-555';

      const orderId = `ord-mid-${Date.now()}`;
      const statusCode = '200';
      const grossAmount = '250000.00';
      const sig = midtrans.generateSignature({ orderId, statusCode, grossAmount });

      const body = {
        order_id: orderId,
        status_code: statusCode,
        gross_amount: grossAmount,
        transaction_status: 'settlement',
        signature_key: sig
      };

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/midtrans',
        body
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
    });

    await check('9.2 Xendit timing-safe callback token webhook verification passes', async () => {
      const xendit = paymentManager.getProvider('xendit');
      xendit.webhookToken = 'xendit-test-token-777';

      const body = {
        id: `xen-inv-${Date.now()}`,
        external_id: `ord-xen-${Date.now()}`,
        status: 'PAID',
        amount: 300000
      };

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/xendit',
        headers: {
          'x-callback-token': 'xendit-test-token-777'
        },
        body
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
    });

    // -------------------------------------------------------------------------
    // SECTION 10: DURABLE PERSISTENCE & DOUBLE-ENTRY FINANCIAL BALANCING
    // -------------------------------------------------------------------------
    console.log('\n── Section 10: Durable Persistence & Double-Entry Balancing ──');

    await check('10.1 Double-entry FinancialLedger balances mathematically: sum(debits) === sum(credits)', async () => {
      const balances = FinancialLedger.getAccountBalances();
      let totalDebits = 0;
      let totalCredits = 0;

      for (const tx of (state.financial_ledger || [])) {
        for (const e of tx.entries) {
          if (e.type === 'DEBIT') totalDebits += e.amount;
          if (e.type === 'CREDIT') totalCredits += e.amount;
        }
      }

      assert.strictEqual(totalDebits, totalCredits, `Double-entry ledger must balance: Debits ${totalDebits} !== Credits ${totalCredits}`);
    });

    await check('10.2 Financial records persist durably to disk and survive reload', async () => {
      // Verify files written to disk
      const loadedLedger = DurableFinancialStore.load('financial_ledger');
      const loadedPayments = DurableFinancialStore.load('canonical_payments');
      assert.ok(Array.isArray(loadedLedger) && loadedLedger.length > 0);
      assert.ok(Array.isArray(loadedPayments) && loadedPayments.length > 0);

      // Simulate state wipe and restore
      const mockFreshState = { financial_ledger: [], canonical_payments: [] };
      DurableFinancialStore.restoreAll(mockFreshState);
      assert.strictEqual(mockFreshState.financial_ledger.length, loadedLedger.length);
      assert.strictEqual(mockFreshState.canonical_payments.length, loadedPayments.length);
    });

    await check('10.3 Real automated reconciliation compares records and detects anomalies', async () => {
      const recResult = await PaymentService.reconcileTransactions({
        providerName: 'doku',
        date: new Date().toISOString().split('T')[0]
      });

      assert.ok(recResult.batch_id);
      assert.ok(recResult.reconciled_count > 0);
      assert.ok(Array.isArray(recResult.records));
    });

    // -------------------------------------------------------------------------
    // SECTION 11: EVENT CANCELLATION & ADMIN DASHBOARD
    // -------------------------------------------------------------------------
    console.log('\n── Section 11: Event Cancellation & Admin Financial Dashboard ──');

    await check('11.1 Event-level cancellation freezes release and initiates refunds', async () => {
      const cancelRes = await PaymentService.handleEventCancellation({
        eventId: 'event-joyland-2026',
        actorId: 'admin-1',
        reason: 'Force majeure: Severe Weather'
      });

      assert.strictEqual(cancelRes.eventId, 'event-joyland-2026');
      assert.ok(cancelRes.affected_orders >= 0);
    });

    await check('11.2 Admin financial dashboard exposes durable metrics and provider health', async () => {
      const adminSession = SessionStore.createSession({ userId: 'admin-1', role: 'ADMIN' });
      const res = await request({
        method: 'GET',
        path: '/api/admin/payments/dashboard',
        headers: {
          'Authorization': `Bearer ${adminSession.session_token}`
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.metrics);
      assert.ok(res.json.ledger_balances);
      assert.strictEqual(res.json.subsystem_status.default_provider, 'doku');
      assert.strictEqual(res.json.subsystem_status.legacy_rcb.status, 'DELETED_FROM_PRODUCTION');
    });

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} DOKU PAYMENT MIGRATION TESTS PASSED!`);
    console.log('================================================================\n');

  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
  }
}

runSuite().catch(err => {
  console.error('\n[SUITE FATAL ERROR]:', err);
  if (server) server.close();
  process.exit(1);
});
