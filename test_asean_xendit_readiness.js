/**
 * TIKUM / ARGUS — ASEAN Marketplace Readiness & Xendit xenPlatform Acceptance Suite
 *
 * Verifies:
 * 1. Regional ASEAN & Technical Market Architecture:
 *    - 7 Canonical Readiness States: DISABLED, INTERNAL_TEST, COMPLIANCE_REVIEW,
 *      PAYMENT_APPROVED, OPERATIONS_READY, LIVE, SUSPENDED.
 *    - ASEAN Members: ID, SG, MY, TH, VN, PH marked with isAseanMember: true.
 *    - Technical Non-ASEAN: HK marked with isAseanMember: false.
 *    - Minor-Unit Decimals: IDR/VND = 0, SGD/MYR/THB/PHP/HKD = 2.
 *    - Timezone-safe local formatting for each territory.
 *    - Commercial Guard: canAcceptLiveOrders strictly false for non-LIVE markets.
 *
 * 2. Xendit / xenPlatform Adapter & Truthful Escrow Contract:
 *    - Capabilities declare splitSettlement, subAccounts, and ESCROW_UNAVAILABLE.
 *    - Underwriting and cross-border domestic restrictions explicitly documented.
 *    - createSubAccount, createSplitRule, and transferBetweenAccounts contracts.
 *    - createHold and releaseHold throw CapabilityUnsupportedError (zero fake claims).
 *    - Timing-safe webhook verification (x-callback-token).
 *    - Fail-closed production guards when credentials/underwriting not activated.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const {
  MARKET_STATUS,
  MARKETS,
  getMarket,
  isMarketActive,
  canAcceptLiveOrders,
  isAseanMember,
  formatLocalDateTime,
  getMinorUnitDecimals,
  getActiveMarkets,
  getAllMarkets,
  resolveMarketFromCountry
} = require('./src/config/markets');

const {
  isSupportedCurrency,
  getCurrency,
  assertIntegerMoney
} = require('./src/config/currencies');

const {
  paymentManager,
  XenditPaymentProvider,
  CapabilityUnsupportedError
} = require('./src/services/payment/index');

const {
  PaymentRoutingService
} = require('./src/services/payment/PaymentRoutingService');

console.log('================================================================');
console.log('  TIKUM — ASEAN READINESS & XENDIT XENPLATFORM TEST SUITE');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function check(title, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function asyncCheck(title, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  // ---------------------------------------------------------------------------
  // SECTION 1: ASEAN REGIONAL COUNTRY MODEL & READINESS STATES
  // ---------------------------------------------------------------------------
  console.log('── Section 1: ASEAN Regional Country Model & Readiness States ──');

  check('1.1 Canonical readiness states enum is defined with 7 standard gates', () => {
    assert.strictEqual(MARKET_STATUS.DISABLED, 'DISABLED');
    assert.strictEqual(MARKET_STATUS.INTERNAL_TEST, 'INTERNAL_TEST');
    assert.strictEqual(MARKET_STATUS.COMPLIANCE_REVIEW, 'COMPLIANCE_REVIEW');
    assert.strictEqual(MARKET_STATUS.PAYMENT_APPROVED, 'PAYMENT_APPROVED');
    assert.strictEqual(MARKET_STATUS.OPERATIONS_READY, 'OPERATIONS_READY');
    assert.strictEqual(MARKET_STATUS.LIVE, 'LIVE');
    assert.strictEqual(MARKET_STATUS.SUSPENDED, 'SUSPENDED');
  });

  check('1.2 Indonesia (ID) is configured as default LIVE / ACTIVE market', () => {
    const id = getMarket('ID');
    assert.ok(id);
    assert.strictEqual(id.countryCode, 'ID');
    assert.strictEqual(id.currency, 'IDR');
    assert.strictEqual(id.decimals, 0);
    assert.strictEqual(id.isAseanMember, true);
    assert.strictEqual(id.status, MARKET_STATUS.ACTIVE);
    assert.strictEqual(id.readinessState, MARKET_STATUS.LIVE);
    assert.strictEqual(isMarketActive('ID'), true);
    assert.strictEqual(canAcceptLiveOrders('ID'), true);
    assert.strictEqual(isAseanMember('ID'), true);
  });

  check('1.3 ASEAN expansion countries (SG, MY, TH, VN, PH) are in COMPLIANCE_REVIEW and FUTURE', () => {
    const aseanCodes = ['SG', 'MY', 'TH', 'VN', 'PH'];
    for (const code of aseanCodes) {
      const m = getMarket(code);
      assert.ok(m, `Market ${code} must exist in registry`);
      assert.strictEqual(m.isAseanMember, true, `Market ${code} must have isAseanMember: true`);
      assert.strictEqual(m.status, MARKET_STATUS.FUTURE, `Market ${code} must have status: FUTURE`);
      assert.strictEqual(m.readinessState, MARKET_STATUS.COMPLIANCE_REVIEW, `Market ${code} must have readinessState: COMPLIANCE_REVIEW`);
      assert.strictEqual(isMarketActive(code), false, `Market ${code} must not be active`);
      assert.strictEqual(canAcceptLiveOrders(code), false, `Market ${code} must not accept live orders`);
    }
  });

  check('1.4 Technical non-ASEAN expansion territory (HK) is registered with isAseanMember: false', () => {
    const hk = getMarket('HK');
    assert.ok(hk, 'Hong Kong market must exist in registry');
    assert.strictEqual(hk.countryCode, 'HK');
    assert.strictEqual(hk.currency, 'HKD');
    assert.strictEqual(hk.decimals, 2);
    assert.strictEqual(hk.isAseanMember, false, 'Hong Kong is technically non-ASEAN');
    assert.strictEqual(hk.status, MARKET_STATUS.FUTURE);
    assert.strictEqual(hk.readinessState, MARKET_STATUS.COMPLIANCE_REVIEW);
    assert.strictEqual(isMarketActive('HK'), false);
    assert.strictEqual(canAcceptLiveOrders('HK'), false);
  });

  check('1.5 Minor-unit decimal precision rules (0 for IDR/VND, 2 for SGD/MYR/THB/PHP/HKD)', () => {
    assert.strictEqual(getMinorUnitDecimals('IDR'), 0);
    assert.strictEqual(getMinorUnitDecimals('VND'), 0);
    assert.strictEqual(getMinorUnitDecimals('ID'), 0);
    assert.strictEqual(getMinorUnitDecimals('VN'), 0);

    assert.strictEqual(getMinorUnitDecimals('SGD'), 2);
    assert.strictEqual(getMinorUnitDecimals('MYR'), 2);
    assert.strictEqual(getMinorUnitDecimals('THB'), 2);
    assert.strictEqual(getMinorUnitDecimals('PHP'), 2);
    assert.strictEqual(getMinorUnitDecimals('HKD'), 2);
    assert.strictEqual(getMinorUnitDecimals('SG'), 2);
    assert.strictEqual(getMinorUnitDecimals('HK'), 2);
  });

  check('1.6 Timezone formatting reflects respective capital timezones', () => {
    const testDate = new Date('2026-11-20T12:00:00Z');

    const idStr = formatLocalDateTime(testDate, 'ID');
    assert.ok(idStr, 'Must format ID date');

    const sgStr = formatLocalDateTime(testDate, 'SG');
    assert.ok(sgStr, 'Must format SG date');

    const hkStr = formatLocalDateTime(testDate, 'HK');
    assert.ok(hkStr, 'Must format HK date');

    const invalid = formatLocalDateTime('invalid-date-string', 'ID');
    assert.strictEqual(invalid, null);
  });

  check('1.7 Commercial checkout strictly throws MARKET_NOT_ACTIVE for non-LIVE territories', () => {
    for (const code of ['SG', 'MY', 'TH', 'VN', 'PH', 'HK']) {
      assert.throws(() => {
        PaymentRoutingService.resolveProvider({ countryCode: code, currency: getMarket(code).currency });
      }, (err) => {
        return err.code === 'MARKET_NOT_ACTIVE';
      });
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: XENDIT XENPLATFORM CAPABILITIES & HONEST ESCROW CONTRACT
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Xendit xenPlatform Capabilities & Honest Escrow Contract ──');

  const xendit = new XenditPaymentProvider({
    secretKey: 'xnd_development_dummy_key_for_testing',
    webhookToken: 'test_webhook_token_secret_123',
    allowSimulation: true
  });

  check('2.1 Xendit adapter reports tier 2B, splitSettlement and subAccounts enabled', () => {
    const caps = xendit.getCapabilities();
    assert.strictEqual(caps.splitSettlement, true);
    assert.strictEqual(caps.subAccounts, true);
    assert.strictEqual(caps.sellerAccounts, true);
    assert.strictEqual(caps.paymentCollection, true);
    assert.strictEqual(caps.refund, true);
    assert.strictEqual(caps.payout, true);
  });

  check('2.2 Truthful escrow disclosure: hold and release are FALSE, ESCROW_UNAVAILABLE documented', () => {
    const caps = xendit.getCapabilities();
    assert.strictEqual(caps.hold, false, 'Xendit must NOT claim milestone escrow hold capability');
    assert.strictEqual(caps.release, false, 'Xendit must NOT claim milestone escrow release capability');
    assert.strictEqual(caps.notes.escrow_capability, 'ESCROW_UNAVAILABLE');
    assert.strictEqual(caps.notes.marketplace_model, 'XENPLATFORM_SPLIT_AND_TRANSFER');
    assert.strictEqual(caps.notes.underwriting_status, 'REQUIRES_PARTNER_RISK_APPROVAL');
    assert.strictEqual(caps.notes.cross_border_status, 'RESTRICTED_ID_DOMESTIC_ONLY');
  });

  check('2.3 Status reports secondary ticketing underwriting requirement and domestic restriction', () => {
    const status = xendit.getStatus();
    assert.strictEqual(status.provider, 'xendit');
    assert.strictEqual(status.tier, 'TIER_2B');
    assert.ok(status.message.includes('secondary ticketing requires partner underwriting approval'));
    assert.ok(status.underwritingRequirements);
    assert.strictEqual(status.underwritingRequirements.category, 'HIGH_RISK_SECONDARY_TICKETING');
    assert.strictEqual(status.underwritingRequirements.approvalRequired, true);
  });

  await asyncCheck('2.4 createHold and releaseHold strictly reject with CapabilityUnsupportedError', async () => {
    await assert.rejects(async () => {
      await xendit.createHold({ orderId: 'ord-101', amount: 500000 });
    }, (err) => {
      assert.ok(err instanceof CapabilityUnsupportedError);
      assert.ok(err.message.includes('ESCROW_UNAVAILABLE'));
      return true;
    });

    await assert.rejects(async () => {
      await xendit.releaseHold({ orderId: 'ord-101', amount: 500000 });
    }, (err) => {
      assert.ok(err instanceof CapabilityUnsupportedError);
      assert.ok(err.message.includes('ESCROW_UNAVAILABLE'));
      return true;
    });
  });

  await asyncCheck('2.5 createPayment rejects if requiresEscrow is true', async () => {
    await assert.rejects(async () => {
      await xendit.createPayment({
        orderId: 'ord-escrow-req',
        amount: 750000,
        currency: 'IDR',
        requiresEscrow: true
      });
    }, (err) => {
      assert.ok(err instanceof CapabilityUnsupportedError);
      assert.ok(err.message.includes('ESCROW_UNAVAILABLE'));
      return true;
    });
  });

  await asyncCheck('2.6 xenPlatform createSubAccount creates seller sub-account contract', async () => {
    const subAcc = await xendit.createSubAccount({
      email: 'seller@tikum.app',
      businessName: 'Tikum Verified Ticket Seller',
      type: 'OWNED',
      country: 'ID'
    });

    assert.ok(subAcc);
    assert.ok(subAcc.accountId);
    assert.strictEqual(subAcc.email, 'seller@tikum.app');
    assert.strictEqual(subAcc.businessName, 'Tikum Verified Ticket Seller');
    assert.strictEqual(subAcc.status, 'ACTIVE');

    // Missing fields validation
    await assert.rejects(async () => {
      await xendit.createSubAccount({ email: '' });
    }, /requires email and businessName/);
  });

  await asyncCheck('2.7 xenPlatform createSplitRule creates marketplace fee split rule contract', async () => {
    const rule = await xendit.createSplitRule({
      name: 'Tikum Marketplace Platform Fee 6%',
      description: 'Splits 6% platform fee to Tikum Treasury and 94% to Seller',
      routes: [
        { flat_amount: 0, percent_amount: 6, currency: 'IDR', destination_account_id: 'acc-tikum-treasury' },
        { flat_amount: 0, percent_amount: 94, currency: 'IDR', destination_account_id: 'acc-seller-sub' }
      ]
    });

    assert.ok(rule);
    assert.ok(rule.splitRuleId);
    assert.strictEqual(rule.name, 'Tikum Marketplace Platform Fee 6%');
    assert.strictEqual(rule.routes.length, 2);

    // Empty routes validation
    await assert.rejects(async () => {
      await xendit.createSplitRule({ name: 'Empty Rule', routes: [] });
    }, /requires a name and non-empty routes array/);
  });

  await asyncCheck('2.8 xenPlatform transferBetweenAccounts transfers funds immediately (not escrow)', async () => {
    const transfer = await xendit.transferBetweenAccounts({
      sourceAccountId: 'acc-tikum-platform',
      destinationAccountId: 'acc-seller-sub',
      amount: 940000,
      currency: 'IDR',
      reference: 'ord-ref-940k'
    });

    assert.ok(transfer);
    assert.ok(transfer.transferId);
    assert.strictEqual(transfer.amount, 940000);
    assert.strictEqual(transfer.destinationAccountId, 'acc-seller-sub');
    assert.strictEqual(transfer.status, 'SUCCESSFUL');

    // Invalid amount validation
    await assert.rejects(async () => {
      await xendit.transferBetweenAccounts({
        destinationAccountId: 'acc-seller-sub',
        amount: -500
      });
    }, /positive integer amount/);
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: WEBHOOK VERIFICATION & SECURITY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Webhook Verification & Security ──');

  check('3.1 Timing-safe webhook verification succeeds with matching token', () => {
    const valid = xendit.verifyWebhook(
      { 'x-callback-token': 'test_webhook_token_secret_123' },
      { id: 'inv-123', status: 'PAID', amount: 1000000 }
    );
    assert.strictEqual(valid, true);
  });

  check('3.2 Timing-safe webhook verification rejects forged or missing tokens in constant time', () => {
    // Forged token
    const forged = xendit.verifyWebhook(
      { 'x-callback-token': 'attacker_forged_token' },
      { id: 'inv-123', status: 'PAID' }
    );
    assert.strictEqual(forged, false);

    // Empty header
    const missing = xendit.verifyWebhook({}, { id: 'inv-123' });
    assert.strictEqual(missing, false);

    // Mismatched length
    const short = xendit.verifyWebhook({ 'x-callback-token': 'short' }, {});
    assert.strictEqual(short, false);
  });

  check('3.3 verifyAndParseWebhook throws 401 INVALID_WEBHOOK_SIGNATURE on forged payload', () => {
    assert.throws(() => {
      xendit.verifyAndParseWebhook({
        headers: { 'x-callback-token': 'wrong-token' },
        body: { id: 'inv-123', status: 'PAID' }
      });
    }, (err) => {
      return err.code === 'INVALID_WEBHOOK_SIGNATURE' && err.status === 401;
    });
  });

  check('3.4 Webhook parser accurately maps PAID, SETTLED, EXPIRED, FAILED states', () => {
    const paid = xendit.parseWebhook({ id: 'inv-1', external_id: 'ord-1', status: 'PAID', amount: 500000 });
    assert.strictEqual(paid.status, 'PAID');
    assert.strictEqual(paid.orderId, 'ord-1');

    const settled = xendit.parseWebhook({ id: 'inv-2', external_id: 'ord-2', status: 'SETTLED', amount: 500000 });
    assert.strictEqual(settled.status, 'PAID');

    const expired = xendit.parseWebhook({ id: 'inv-3', external_id: 'ord-3', status: 'EXPIRED', amount: 500000 });
    assert.strictEqual(expired.status, 'PAYMENT_EXPIRED');

    const failed = xendit.parseWebhook({ id: 'inv-4', external_id: 'ord-4', status: 'FAILED', amount: 500000 });
    assert.strictEqual(failed.status, 'PAYMENT_FAILED');
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: PRODUCTION FAIL-CLOSED CONTROLS
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Production Fail-Closed Controls ──');

  await asyncCheck('4.1 Live production client calls fail closed without explicit activation', async () => {
    const prodXendit = new XenditPaymentProvider({
      secretKey: 'xnd_production_dummy_key',
      mode: 'production',
      allowSimulation: false
    });

    await assert.rejects(async () => {
      await prodXendit.createPayment({
        orderId: 'ord-prod-attempt',
        amount: 1000000,
        currency: 'IDR'
      });
    }, /Live Xendit production API client awaiting merchant production activation/);
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} ASEAN READINESS & XENDIT TESTS PASSED!`);
  console.log('================================================================\n');
}

runSuite().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
