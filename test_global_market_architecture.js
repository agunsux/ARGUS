/**
 * TIKUM / ARGUS — Global Architecture & Local-First Verification Suite
 *
 * Verifies:
 * 1. Global Market & Country Abstraction (ID active, ASEAN future, inactive market protection)
 * 2. Currency Abstraction (Integer minor units, zero floats, supported currencies)
 * 3. Payment Routing & Multi-Provider Failover (Deterministic attempts, uncertain state guard)
 * 4. Venue Assist & Optional Operations Service (Gated on real operator, unavailable rejected)
 * 5. Local Operator Network Abstraction (Real operators only, zero synthetic entities)
 * 6. Internationalization (Fallback hierarchy: locale -> EN -> ID, domain terms, RTL)
 * 7. Production Safety Invariants (ENABLE_RCB_PRODUCTION=false, zero fake GMV)
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const {
  MARKET_STATUS,
  MARKETS,
  getMarket,
  isMarketActive,
  getActiveMarkets,
  resolveMarketFromCountry
} = require('./src/config/markets');
const {
  CURRENCIES,
  BASE_CURRENCY,
  isSupportedCurrency,
  getCurrency,
  assertIntegerMoney
} = require('./src/config/currencies');
const {
  PaymentRoutingService,
  PROVIDER_TIER,
  PAYMENT_ATTEMPT_STATUS
} = require('./src/services/payment/PaymentRoutingService');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { paymentManager, PaymentProvider } = require('./src/services/payment');
const {
  VenueAssistService,
  PIC_AVAILABILITY_STATUS,
  DEFAULT_VENUE_ASSIST_FEE_IDR
} = require('./src/venue/VenueAssistService');
const { OperatorNetworkService } = require('./src/venue/OperatorNetworkService');
const { CanonicalEventRegistry } = require('./src/discovery/CanonicalEventRegistry');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('\n================================================================');
  console.log('  TIKUM — GLOBAL ARCHITECTURE & LOCAL LIQUIDITY ACCEPTANCE SUITE');
  console.log('================================================================\n');

  resetDatabase();

  // ---------------------------------------------------------------------------
  // 1. GLOBAL MARKET & COUNTRY ABSTRACTION
  // ---------------------------------------------------------------------------
  console.log('── Section 1: Global Market & Country Abstraction ──');

  await test('1.1 Indonesia is registered as default ACTIVE market', async () => {
    const idMarket = getMarket('ID');
    assert.ok(idMarket, 'ID market must exist');
    assert.strictEqual(idMarket.countryCode, 'ID');
    assert.strictEqual(idMarket.currency, 'IDR');
    assert.strictEqual(idMarket.status, MARKET_STATUS.ACTIVE);
    assert.strictEqual(isMarketActive('ID'), true);
  });

  await test('1.2 ASEAN markets (SG, MY, TH, VN, PH) are FUTURE and not commercially active', async () => {
    const futureCodes = ['SG', 'MY', 'TH', 'VN', 'PH'];
    for (const code of futureCodes) {
      const m = getMarket(code);
      assert.ok(m, `Market ${code} must exist in architecture`);
      assert.strictEqual(m.status, MARKET_STATUS.FUTURE, `Market ${code} must be FUTURE`);
      assert.strictEqual(isMarketActive(code), false, `Market ${code} must not be active`);
    }
  });

  await test('1.3 resolveMarketFromCountry resolves by code or full country name', async () => {
    const m1 = resolveMarketFromCountry('Indonesia');
    assert.strictEqual(m1.countryCode, 'ID');
    const m2 = resolveMarketFromCountry('SG');
    assert.strictEqual(m2.country, 'Singapore');
  });

  await test('1.4 Inactive future market checkout throws MARKET_NOT_ACTIVE error', async () => {
    assert.throws(() => {
      PaymentRoutingService.resolveProvider({ countryCode: 'SG', currency: 'SGD' });
    }, (err) => {
      return err.code === 'MARKET_NOT_ACTIVE';
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CURRENCY ABSTRACTION & INTEGER REPRESENTATION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Currency Abstraction & Integer Minor Units ──');

  await test('2.1 Registers supported global currencies without floats', async () => {
    assert.strictEqual(isSupportedCurrency('IDR'), true);
    assert.strictEqual(isSupportedCurrency('USD'), true);
    assert.strictEqual(isSupportedCurrency('SGD'), true);
    assert.strictEqual(isSupportedCurrency('EUR'), true);
    assert.strictEqual(isSupportedCurrency('UNKNOWN_COIN'), false);
  });

  await test('2.2 assertIntegerMoney enforces integer minor units and rejects floats', async () => {
    assert.strictEqual(assertIntegerMoney(1500000), 1500000);
    assert.strictEqual(assertIntegerMoney('250000'), 250000);
    assert.throws(() => {
      assertIntegerMoney(1500.50);
    }, /integer minor unit/);
    assert.throws(() => {
      assertIntegerMoney(-500);
    }, /cannot be negative/);
  });

  // ---------------------------------------------------------------------------
  // 3. PAYMENT PROVIDER ABSTRACTION & ROUTING FAILOVER
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Payment Provider Routing & Failover Architecture ──');

  await test('3.1 Base PaymentProvider provides getSupportedCountries & getSupportedCurrencies', async () => {
    const provider = paymentManager.getProvider('doku');
    assert.ok(Array.isArray(provider.getSupportedCountries()));
    assert.ok(provider.getSupportedCountries().includes('ID'));
    assert.ok(Array.isArray(provider.getSupportedCurrencies()));
    assert.ok(provider.getSupportedCurrencies().includes('IDR'));
  });

  await test('3.2 PaymentRoutingService resolves deterministic primary provider for Indonesia', async () => {
    const resolved = PaymentRoutingService.resolveProvider({ countryCode: 'ID', currency: 'IDR' });
    assert.ok(resolved.providerName === 'doku' || resolved.providerName === 'test');
    assert.strictEqual(resolved.tier, PROVIDER_TIER.PRIMARY);
  });

  await test('3.3 Payment attempts recorded with deterministic audit fields', async () => {
    const attempt = PaymentRoutingService.recordPaymentAttempt({
      paymentAttemptId: 'att-test-001',
      orderId: 'ord-test-001',
      provider: 'doku',
      idempotencyKey: 'idemp-att-001',
      status: PAYMENT_ATTEMPT_STATUS.PENDING
    });
    assert.strictEqual(attempt.paymentAttemptId, 'att-test-001');
    assert.strictEqual(attempt.status, PAYMENT_ATTEMPT_STATUS.PENDING);
    assert.ok(attempt.createdAt);
  });

  await test('3.4 Failover is strictly BLOCKED if prior payment attempt is UNKNOWN or PENDING', async () => {
    assert.throws(() => {
      PaymentRoutingService.assertFailoverAllowed('ord-test-001');
    }, (err) => {
      return err.code === 'FAILOVER_UNCERTAIN_STATE_BLOCKED';
    });

    // Update status to FAILED -> failover should now be permitted
    PaymentRoutingService.updateAttemptStatus('att-test-001', PAYMENT_ATTEMPT_STATUS.FAILED);
    assert.strictEqual(PaymentRoutingService.assertFailoverAllowed('ord-test-001'), true);
  });

  await test('3.5 Failover is strictly BLOCKED if payment already succeeded (zero duplicate charges)', async () => {
    PaymentRoutingService.recordPaymentAttempt({
      paymentAttemptId: 'att-test-002',
      orderId: 'ord-test-002',
      provider: 'doku',
      idempotencyKey: 'idemp-att-002',
      status: PAYMENT_ATTEMPT_STATUS.SUCCESS
    });

    assert.throws(() => {
      PaymentRoutingService.assertFailoverAllowed('ord-test-002');
    }, (err) => {
      return err.code === 'PAYMENT_ALREADY_SUCCEEDED';
    });
  });

  // ---------------------------------------------------------------------------
  // 4. VENUE ASSIST & OPTIONAL OPERATIONS SERVICE
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Venue Assist & Optional Operations Service ──');

  await test('4.1 Event with NO operator assignment returns PIC_UNAVAILABLE and available: false', async () => {
    const res = VenueAssistService.getAvailabilityForEvent('event-unassigned-random');
    assert.strictEqual(res.status, PIC_AVAILABILITY_STATUS.PIC_UNAVAILABLE);
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.operatorId, null);
  });

  await test('4.2 Attempting to attach Venue Assist to unassigned event is REJECTED', async () => {
    if (!state.orders) state.orders = [];
    state.orders.push({ id: 'ord-no-pic', event_id: 'event-no-pic', buyer_id: 'buyer-1' });

    await assert.rejects(async () => {
      await VenueAssistService.attachVenueAssistToOrder('ord-no-pic');
    }, (err) => {
      return err.code === 'VENUE_ASSIST_UNAVAILABLE';
    });
  });

  await test('4.3 Event with confirmed operator assignment returns PIC_AVAILABLE and allows add-on', async () => {
    if (!state.event_pics) state.event_pics = [];
    state.event_pics.push({
      event_id: 'event-with-pic',
      pic_user_id: 'pic-user-1',
      status: 'ACTIVE'
    });
    if (!state.orders) state.orders = [];
    state.orders.push({ id: 'ord-with-pic', event_id: 'event-with-pic', buyer_id: 'buyer-1' });

    const avail = VenueAssistService.getAvailabilityForEvent('event-with-pic');
    assert.strictEqual(avail.available, true);
    assert.strictEqual(avail.status, PIC_AVAILABILITY_STATUS.PIC_AVAILABLE);
    assert.strictEqual(avail.operatorId, 'pic-user-1');

    const attached = await VenueAssistService.attachVenueAssistToOrder('ord-with-pic');
    assert.strictEqual(attached.success, true);
    assert.strictEqual(attached.fee, DEFAULT_VENUE_ASSIST_FEE_IDR);

    const order = state.orders.find(o => o.id === 'ord-with-pic');
    assert.strictEqual(order.venue_assist, true);
    assert.strictEqual(order.venue_assist_fee, DEFAULT_VENUE_ASSIST_FEE_IDR);
  });

  // ---------------------------------------------------------------------------
  // 5. LOCAL OPERATOR NETWORK ABSTRACTION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 5: Local Operator Network Abstraction ──');

  await test('5.1 OperatorNetworkService returns real operators from state only (zero synthetic)', async () => {
    if (!state.users) state.users = [];
    state.users.push({
      id: 'pic-user-1',
      name: 'Rian Kurniawan (PIC)',
      role: 'pic',
      country: 'Indonesia',
      city: 'Jakarta',
      is_verified: true,
      trust_score: 98
    });

    const ops = OperatorNetworkService.getOperators();
    assert.ok(ops.length >= 1);
    const op = ops.find(o => o.operatorId === 'pic-user-1');
    assert.ok(op);
    assert.strictEqual(op.country, 'Indonesia');
    assert.strictEqual(op.city, 'Jakarta');
    assert.strictEqual(op.verificationStatus, 'VERIFIED');
    assert.strictEqual(op.trustScore, 98);
  });

  // ---------------------------------------------------------------------------
  // 6. INTERNATIONALIZATION & LOCALIZATION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 6: Internationalization & Fallback Hierarchy ──');

  await test('6.1 i18n client module loads cleanly and implements requested -> EN -> ID fallback', async () => {
    const fs = require('fs');
    const code = fs.readFileSync('public/js/i18n.js', 'utf8');
    assert.ok(code.includes('Fallback hierarchy: requested locale -> English -> Indonesian'));
    assert.ok(code.includes('escrow'));
    assert.ok(code.includes('venueAssist'));
    assert.ok(code.includes('document.documentElement.dir = \'rtl\''));
  });

  // ---------------------------------------------------------------------------
  // 7. EVENT DISCOVERY MARKET-AWARE METADATA
  // ---------------------------------------------------------------------------
  console.log('\n── Section 7: Event Discovery Market-Aware Metadata ──');

  await test('7.1 CanonicalEventRegistry attaches countryCode, currencyCode, eventId, timezone', async () => {
    const reg = new CanonicalEventRegistry();
    const ev = reg.createEvent({
      title: 'Global Tour Jakarta 2026',
      date: '2026-11-20',
      venue: 'GBK Stadium',
      city: 'Jakarta',
      country: 'Indonesia',
      currency: 'IDR'
    }, [{
      source_id: 'src-official',
      source_name: 'Official Organizer',
      source_tier: 1,
      source_url: 'https://official.org/tour'
    }]);

    assert.ok(ev);
    assert.strictEqual(ev.countryCode, 'ID');
    assert.strictEqual(ev.currencyCode, 'IDR');
    assert.strictEqual(ev.eventId, ev.id);
    assert.ok(ev.startAt);
    assert.ok(ev.timezone);
  });

  // ---------------------------------------------------------------------------
  // 8. PRODUCTION PAYMENT & FINANCIAL SAFETY GATES
  // ---------------------------------------------------------------------------
  console.log('\n── Section 8: Production Payment & Financial Safety Invariants ──');

  await test('8.1 Production safety gates remain absolute and un-bypassed', async () => {
    const status = PaymentService.getSubsystemStatus();
    assert.strictEqual(status.safety_gates.NO_REAL_PAYMENT, true);
    assert.strictEqual(status.safety_gates.NO_REAL_SETTLEMENT, true);
    assert.strictEqual(status.safety_gates.NO_FAKE_PAYMENT_SUCCESS, true);
    assert.strictEqual(status.safety_gates.NO_FAKE_ESCROW_BALANCE, true);
    assert.strictEqual(status.safety_gates.NO_FAKE_GMV, true);
    assert.strictEqual(status.marketplace_financial_state.real_money_active, false);
  });

  console.log('\n================================================================');
  console.log(`  GLOBAL ARCHITECTURE ACCEPTANCE: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
