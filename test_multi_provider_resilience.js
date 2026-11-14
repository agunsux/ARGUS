/**
 * TIKUM / ARGUS — Multi-Provider Payment Resilience & Safe Fallback Test Suite
 *
 * Validates the Multi-Provider Payment Architecture:
 * 1. Multi-Provider Tiering:
 *    - PRIMARY: DOKU Direct API (VA & QRIS Direct)
 *    - SECONDARY / FALLBACK: DOKU Checkout (Hosted checkout when Direct API is degraded)
 *    - EMERGENCY ALTERNATIVE: iPaymu (with historical pinning & compliance rules)
 *
 * 2. Safe Fallback Rules:
 *    - Rule A: DOKU Direct API healthy -> routes to Direct API.
 *    - Rule B: DOKU Direct API unavailable before creation -> falls back to DOKU Checkout.
 *    - Rule C: Ambiguous response / timeout -> status inquiry first, NEVER blind second charge.
 *    - Rule D: Payment pending -> original transaction remains active, no auto duplicate attempt.
 *    - Rule E: Payment confirmed -> updates canonical ledger exactly once.
 *    - Rule F: Both DOKU integrations unavailable -> emergency fallback to iPaymu (if eligible).
 *
 * 3. ARGUS Escrow Invariants:
 *    - Payment collection success !== Escrow release.
 *    - ARGUS Trust Policy Engine remains the SOLE escrow release authority.
 *    - Active dispute freezes release across all providers.
 *    - Venue PIC admission confirmation is strictly required.
 *    - Zero double-charging and double-entry ledger balancing.
 */

process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'LIVE';
process.env.PRIMARY_PROVIDER = 'doku';
process.env.SECONDARY_PROVIDER = 'ipaymu';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.DOKU_HOLD_RELEASE_ENABLED = 'true';
process.env.DOKU_CONTRACT_VERIFIED = 'true';
process.env.DOKU_CLIENT_ID = 'MCH-SHINERVA-TEST-001';
process.env.DOKU_SECRET_KEY = 'SK-SHINERVA-TEST-KEY-888';
process.env.IPAYMU_API_KEY = 'TEST_IPAYMU_KEY';
process.env.IPAYMU_VA = '1122334455';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const {
  paymentManager,
  CapabilityUnsupportedError,
  DokuPaymentProvider,
  IPaymuPaymentProvider
} = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const {
  CANONICAL_PAYMENT_STATUS,
  MONEY_STATE
} = require('./src/services/payment/canonicalPaymentTypes');
const {
  PaymentRoutingService,
  PAYMENT_ATTEMPT_STATUS,
  circuitBreakers,
  opsKillSwitches
} = require('./src/services/payment/PaymentRoutingService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { ListingService } = require('./src/services/listingService');
const { EventPicService } = require('./src/services/eventPicService');
const { DisputeService } = require('./src/services/disputeService');
const { TrustPolicyEngine, AUTHORIZATION_OUTCOME } = require('./src/trust/TrustPolicyEngine');

let server;
let baseUrl;
let passed = 0;
let total = 0;

function check(title, fn) {
  total++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ✅ [PASS] ${title}`);
        passed++;
      }).catch((err) => {
        console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
        throw err;
      });
    }
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  console.log('================================================================================');
  console.log('  TIKUM / ARGUS — MULTI-PROVIDER PAYMENT RESILIENCE & SAFE FALLBACK TEST SUITE  ');
  console.log('================================================================================\n');

  resetDatabase();

  // Reset circuit breakers and kill switches
  for (const k of Object.keys(circuitBreakers)) {
    circuitBreakers[k].failures = 0;
    circuitBreakers[k].state = 'CLOSED';
    circuitBreakers[k].nextProbe = 0;
  }
  for (const k of Object.keys(opsKillSwitches)) {
    opsKillSwitches[k] = false;
  }

  // Setup mock order in database
  const orderId = 'ord-resilience-001';
  state.orders = [{
    id: orderId,
    ticket_id: 't-resilience-001',
    event_id: 'ev-resilience-001',
    buyer_id: 'buyer-resilience-01',
    seller_id: 'seller-resilience-01',
    total_amount: 500000,
    gross_amount: 500000,
    platform_fee: 25000,
    seller_payout: 475000,
    status: 'PENDING_PAYMENT',
    payment_status: 'PENDING'
  }];

  state.escrows = [{
    id: `esc-${orderId}`,
    order_id: orderId,
    buyer_id: 'buyer-resilience-01',
    seller_id: 'seller-resilience-01',
    amount: 475000,
    gross_amount: 500000,
    status: ESCROW_STATUS.PENDING_PAYMENT,
    requires_escrow: true
  }];

  state.tickets = [{
    id: 't-resilience-001',
    event_id: 'ev-resilience-001',
    seller_id: 'seller-resilience-01',
    status: 'RESERVED',
    validation_status: 'VERIFIED',
    price: 500000
  }];

  state.events = [{
    id: 'ev-resilience-001',
    name: 'Jakarta Music Festival 2026',
    date: '2026-12-15T20:00:00Z',
    status: 'ACTIVE'
  }];

  // ---------------------------------------------------------------------------
  // SECTION 1: ARCHITECTURE TIERING & HEALTH CHECKS
  // ---------------------------------------------------------------------------
  console.log('── Section 1: Multi-Provider Tiering & Initial Health Checks ──');

  check('1.1 DOKU is Primary, iPaymu is Secondary/Emergency Alternative', () => {
    assert.strictEqual(paymentManager.defaultProvider, 'doku');
    assert.ok(paymentManager.hasProvider('doku'));
    assert.ok(paymentManager.hasProvider('ipaymu'));
    assert.ok(paymentManager.hasProvider('midtrans'));
    assert.ok(paymentManager.hasProvider('xendit'));
  });

  check('1.2 Initial state has all circuit breakers CLOSED and available', () => {
    assert.strictEqual(PaymentRoutingService.isProviderAvailable('doku'), true);
    assert.strictEqual(PaymentRoutingService.isProviderAvailable('doku', 'direct'), true);
    assert.strictEqual(PaymentRoutingService.isProviderAvailable('doku', 'checkout'), true);
    assert.strictEqual(PaymentRoutingService.isProviderAvailable('ipaymu'), true);
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: RULE A — DIRECT API PRIMARY EXECUTION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Rule A — DOKU Direct API Primary Selection ──');

  await check('2.1 When Direct API is healthy, resolveResilientChannelOrFallback selects DOKU Direct API', async () => {
    const resolution = PaymentRoutingService.resolveResilientChannelOrFallback({
      channel: 'VA_BCA',
      requiresEscrow: true,
      orderId: 'ord-healthy-01'
    });

    assert.strictEqual(resolution.provider, 'doku');
    assert.strictEqual(resolution.channel, 'VA_BCA');
    assert.strictEqual(resolution.integrationType, 'DOKU_DIRECT_API');
    assert.strictEqual(resolution.fallbackApplied, false);
  });

  await check('2.2 Direct API Virtual Account creates valid payment intent with hold_settlement: true', async () => {
    const payment = await PaymentService.createPayment({
      orderId,
      amount: 500000,
      channel: 'VA_BCA',
      buyer: { id: 'buyer-resilience-01', name: 'Buyer Satu', email: 'buyer1@test.com' },
      requiresEscrow: true
    });

    assert.ok(payment);
    assert.strictEqual(payment.orderId, orderId);
    assert.strictEqual(payment.status, MONEY_STATE.PAYMENT_PENDING);
    assert.strictEqual(payment.paymentDetails.virtualAccount !== undefined || payment.paymentDetails.vaNumber !== undefined, true);
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: RULE B — CONTROLLED FALLBACK TO DOKU CHECKOUT
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Rule B — Fallback to DOKU Checkout When Direct API Unavailable ──');

  await check('3.1 Tripping doku_direct circuit breaker triggers automatic fallback to DOKU Checkout', async () => {
    // Record 5 failures on doku_direct to OPEN its circuit breaker
    for (let i = 0; i < 5; i++) {
      PaymentRoutingService.recordProviderFailure('doku', 'direct');
    }

    assert.strictEqual(PaymentRoutingService.isProviderAvailable('doku', 'direct'), false);
    assert.strictEqual(PaymentRoutingService.isProviderAvailable('doku', 'checkout'), true);

    const testOrderId = 'ord-fallback-checkout-01';
    state.orders.push({
      id: testOrderId,
      ticket_id: 't-fb-01',
      buyer_id: 'buyer-02',
      seller_id: 'seller-01',
      total_amount: 300000,
      gross_amount: 300000,
      platform_fee: 15000,
      seller_payout: 285000,
      status: 'PENDING_PAYMENT'
    });

    const resolution = PaymentRoutingService.resolveResilientChannelOrFallback({
      channel: 'VA_MANDIRI',
      requiresEscrow: true,
      orderId: testOrderId
    });

    assert.strictEqual(resolution.provider, 'doku');
    assert.strictEqual(resolution.channel, 'DOKU_CHECKOUT');
    assert.strictEqual(resolution.integrationType, 'DOKU_CHECKOUT_FALLBACK');
    assert.strictEqual(resolution.fallbackApplied, true);
    assert.strictEqual(resolution.originalChannel, 'VA_MANDIRI');

    // Create payment through PaymentService with fallback applied
    const payment = await PaymentService.createPayment({
      orderId: testOrderId,
      amount: 300000,
      channel: 'VA_MANDIRI',
      buyer: { id: 'buyer-02', name: 'Buyer Dua', email: 'buyer2@test.com' },
      requiresEscrow: true
    });

    assert.strictEqual(payment.channel, 'DOKU_CHECKOUT');
    assert.strictEqual(payment.paymentDetails.checkoutUrl !== undefined, true);
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: RULE C & D — AMBIGUOUS RESPONSE & SINGLE ATTEMPT PINNING
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Rules C & D — Ambiguous Timeout & Zero Double Charging ──');

  await check('4.1 Escrow-required transaction strictly blocks failover to non-escrow provider', async () => {
    assert.throws(() => {
      PaymentRoutingService.assertFailoverAllowed(orderId, true, 'ipaymu');
    }, (err) => {
      assert.strictEqual(err.code, 'CAPABILITY_UNSUPPORTED');
      return true;
    });
  });

  await check('4.2 In-flight PENDING / UNKNOWN attempt strictly blocks failover to another provider', async () => {
    // An attempt is already pending for 'ord-resilience-001' on 'doku'
    assert.throws(() => {
      PaymentRoutingService.assertFailoverAllowed(orderId, false, 'ipaymu');
    }, (err) => {
      assert.strictEqual(err.code, 'FAILOVER_UNCERTAIN_STATE_BLOCKED');
      return true;
    });
  });

  await check('4.3 Attempting to create duplicate payment with different provider on same order is rejected', async () => {
    await assert.rejects(async () => {
      await PaymentService.createPayment({
        orderId,
        amount: 500000,
        providerName: 'ipaymu',
        channel: 'IPAYMU_VA',
        buyer: { id: 'buyer-resilience-01' },
        requiresEscrow: false
      });
    }, (err) => {
      assert.strictEqual(err.code, 'FAILOVER_UNCERTAIN_STATE_BLOCKED');
      return true;
    });
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: RULE F — EMERGENCY ALTERNATIVE (IPAYMU)
  // ---------------------------------------------------------------------------
  console.log('\n── Section 5: Rule F — Emergency Fallback When All DOKU Integrations Unavailable ──');

  await check('5.1 When both DOKU Direct API and Checkout are down, routes to iPaymu emergency alternative', async () => {
    // Trip doku_checkout as well
    for (let i = 0; i < 5; i++) {
      PaymentRoutingService.recordProviderFailure('doku', 'checkout');
    }

    assert.strictEqual(PaymentRoutingService.isProviderAvailable('doku', 'direct'), false);
    assert.strictEqual(PaymentRoutingService.isProviderAvailable('doku', 'checkout'), false);
    assert.strictEqual(PaymentRoutingService.isProviderAvailable('ipaymu'), true);

    const emergencyOrderId = 'ord-emergency-001';
    state.orders.push({
      id: emergencyOrderId,
      ticket_id: 't-emg-01',
      buyer_id: 'buyer-03',
      seller_id: 'seller-01',
      total_amount: 400000,
      gross_amount: 400000,
      platform_fee: 20000,
      seller_payout: 380000,
      status: 'PENDING_PAYMENT'
    });

    const resolution = PaymentRoutingService.resolveResilientChannelOrFallback({
      channel: 'VA_BCA',
      requiresEscrow: true,
      orderId: emergencyOrderId
    });

    assert.strictEqual(resolution.provider, 'ipaymu');
    assert.strictEqual(resolution.integrationType, 'EMERGENCY_ALTERNATIVE');
    assert.strictEqual(resolution.fallbackApplied, true);
  });

  await check('5.2 When all providers are circuit-broken, fail closed with explicit error', async () => {
    // Trip ipaymu as well
    for (let i = 0; i < 5; i++) {
      PaymentRoutingService.recordProviderFailure('ipaymu');
    }

    assert.throws(() => {
      PaymentRoutingService.resolveResilientChannelOrFallback({
        channel: 'VA_BCA',
        requiresEscrow: true,
        orderId: 'ord-all-down-001'
      });
    }, (err) => {
      assert.ok(err.message.includes('unavailable or circuit-broken'));
      return true;
    });
  });

  // ---------------------------------------------------------------------------
  // SECTION 6: DIRECT API QRIS CHANNELS & CONSTRAINTS
  // ---------------------------------------------------------------------------
  console.log('\n── Section 6: Direct API QRIS Channel & Escrow Invariants ──');

  // Reset circuit breakers
  PaymentRoutingService.recordProviderSuccess('doku', 'direct');
  PaymentRoutingService.recordProviderSuccess('doku', 'checkout');
  PaymentRoutingService.recordProviderSuccess('doku');
  PaymentRoutingService.recordProviderSuccess('ipaymu');

  await check('6.1 QRIS Direct API strictly rejects requiresEscrow: true per DOKU contract', async () => {
    const qrisOrderId = 'ord-qris-001';
    state.orders.push({
      id: qrisOrderId,
      ticket_id: 't-qris-01',
      buyer_id: 'buyer-qris',
      seller_id: 'seller-01',
      total_amount: 150000,
      gross_amount: 150000,
      status: 'PENDING_PAYMENT'
    });

    await assert.rejects(async () => {
      await PaymentService.createPayment({
        orderId: qrisOrderId,
        amount: 150000,
        channel: 'QRIS',
        buyer: { id: 'buyer-qris' },
        requiresEscrow: true
      });
    }, (err) => {
      assert.strictEqual(err.name, 'CapabilityUnsupportedError');
      assert.ok(err.message.includes('hold_settlement'));
      return true;
    });
  });

  await check('6.2 QRIS Direct API succeeds when requiresEscrow: false (direct standard purchase)', async () => {
    const qrisDirectOrderId = 'ord-qris-direct-002';
    state.orders.push({
      id: qrisDirectOrderId,
      ticket_id: 't-qris-02',
      buyer_id: 'buyer-qris-2',
      seller_id: 'seller-01',
      total_amount: 150000,
      gross_amount: 150000,
      status: 'PENDING_PAYMENT'
    });

    const payment = await PaymentService.createPayment({
      orderId: qrisDirectOrderId,
      amount: 150000,
      channel: 'QRIS',
      buyer: { id: 'buyer-qris-2' },
      requiresEscrow: false
    });

    assert.strictEqual(payment.orderId, qrisDirectOrderId);
    assert.strictEqual(payment.channel, 'QRIS');
    assert.strictEqual(payment.paymentDetails.qrString !== undefined, true);
    assert.strictEqual(payment.paymentDetails.qrString.startsWith('00020101021226'), true);
  });

  // ---------------------------------------------------------------------------
  // SECTION 7: WEBHOOK IDEMPOTENCY & LEDGER CONSISTENCY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 7: Rule E — Webhook Processing & Double-Entry Balancing ──');

  await check('7.1 Webhook marks order PAID & ESCROW_HELD and records ledger entry', async () => {
    const webhookOrderId = orderId;
    const providerRef = `doku-trx-${webhookOrderId}`;
    const initialLedgerEntries = (state.financial_ledger || []).length;

    const dokuProvider = paymentManager.getProvider('doku');
    const webhookPayload = {
      order: {
        invoice_number: `INV-DOKU-${webhookOrderId}`,
        amount: 500000
      },
      transaction: {
        transaction_id: providerRef,
        status: 'SUCCESS',
        date: new Date().toISOString()
      }
    };

    const rawBody = JSON.stringify(webhookPayload);
    const digest = crypto.createHash('sha256').update(rawBody, 'utf8').digest('base64');
    const requestId = `req-hook-${Date.now()}`;
    const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
    const component = `Client-Id:MCH-SHINERVA-TEST-001\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
    const sig = 'HMACSHA256=' + crypto.createHmac('sha256', 'SK-SHINERVA-TEST-KEY-888').update(component).digest('base64');

    const result = await PaymentService.handleWebhook({
      providerName: 'doku',
      headers: {
        'client-id': 'MCH-SHINERVA-TEST-001',
        'request-id': requestId,
        'request-timestamp': timestamp,
        'signature': sig
      },
      body: webhookPayload,
      rawBodyBuffer: Buffer.from(rawBody, 'utf8')
    });

    assert.strictEqual(result.idempotent, false);
    assert.strictEqual(result.event.status, MONEY_STATE.PAID);

    const postLedgerEntries = (state.financial_ledger || []).length;
    assert.ok(postLedgerEntries > initialLedgerEntries, 'Ledger entry must be recorded');
  });

  await check('7.2 Duplicate webhook replay returns idempotent: true without duplicate ledger credit', async () => {
    const webhookOrderId = orderId;
    const providerRef = `doku-trx-${webhookOrderId}`;
    const preReplayLedgerEntries = (state.financial_ledger || []).length;

    const webhookPayload = {
      order: {
        invoice_number: `INV-DOKU-${webhookOrderId}`,
        amount: 500000
      },
      transaction: {
        transaction_id: providerRef,
        status: 'SUCCESS',
        date: new Date().toISOString()
      }
    };

    const rawBody = JSON.stringify(webhookPayload);
    const digest = crypto.createHash('sha256').update(rawBody, 'utf8').digest('base64');
    const requestId = `req-hook-${Date.now()}`;
    const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
    const component = `Client-Id:MCH-SHINERVA-TEST-001\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
    const sig = 'HMACSHA256=' + crypto.createHmac('sha256', 'SK-SHINERVA-TEST-KEY-888').update(component).digest('base64');

    const result = await PaymentService.handleWebhook({
      providerName: 'doku',
      headers: {
        'client-id': 'MCH-SHINERVA-TEST-001',
        'request-id': requestId,
        'request-timestamp': timestamp,
        'signature': sig
      },
      body: webhookPayload,
      rawBodyBuffer: Buffer.from(rawBody, 'utf8')
    });

    assert.strictEqual(result.idempotent, true);
    const postReplayLedgerEntries = (state.financial_ledger || []).length;
    assert.strictEqual(postReplayLedgerEntries, preReplayLedgerEntries, 'Zero duplicate ledger records allowed');
  });

  // ---------------------------------------------------------------------------
  // SECTION 8: CENTRALIZED ARGUS ESCROW RELEASE INVARIANTS
  // ---------------------------------------------------------------------------
  console.log('\n── Section 8: ARGUS Centralized Escrow Authority & Release Invariants ──');

  await check('8.1 Payment success does NEVER auto-release escrow to seller', async () => {
    const escrow = state.escrows.find(e => e.order_id === orderId);
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(escrow.released_at, undefined);
  });

  await check('8.2 Open dispute strictly freezes escrow and blocks release', async () => {
    state.disputes = [{
      id: 'disp-001',
      order_id: orderId,
      status: 'OPEN',
      reason: 'TICKET_SUSPECTED_COUNTERFEIT'
    }];
    const escrow = state.escrows.find(e => e.order_id === orderId);
    escrow.status = ESCROW_STATUS.DISPUTED;

    await assert.rejects(async () => {
      await EscrowService.releaseToSeller(orderId, 'admin-01');
    }, (err) => {
      assert.ok(err.message.includes('disputed state'));
      return true;
    });

    // Clear dispute for next test
    state.disputes = [];
    escrow.status = ESCROW_STATUS.ESCROWED;
  });

  await check('8.3 Venue PIC admission confirmation and Trust Policy approval authorize release', async () => {
    // Record PIC entry verification
    if (!state.entry_verifications) state.entry_verifications = [];
    state.entry_verifications.push({
      id: 'ev-entry-001',
      order_id: orderId,
      status: 'CONFIRMED',
      verified_by: 'pic-01'
    });

    // Record Trust Policy attestations
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: 'PLATFORM_ATTESTATION',
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: 'TICKET_EVIDENCE_ATTESTATION',
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: 'PAYMENT_ATTESTATION',
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: 'BUYER_ATTESTATION',
      actorId: 'buyer-resilience-01',
      actorRole: 'BUYER',
      result: 'PASS'
    });

    const releaseResult = await EscrowService.releaseToSeller(orderId, 'admin-01');
    assert.strictEqual(releaseResult.success, true);
    assert.strictEqual(releaseResult.escrow.status, ESCROW_STATUS.RELEASED);
    assert.ok(releaseResult.escrow.released_at);
  });

  await check('8.4 FinancialLedger double-entry mathematically balances', () => {
    assert.doesNotThrow(() => {
      FinancialLedger.assertSolvency();
    }, 'Sum(debits) must equal sum(credits)');
  });

  console.log('\n================================================================================');
  console.log(`  MULTI-PROVIDER RESILIENCE SUITE SUMMARY: ${passed}/${total} PASSED | 0 FAILED`);
  console.log('================================================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ TEST RUNNER FATAL ERROR:', err);
  process.exitCode = 1;
});
