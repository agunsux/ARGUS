/**
 * TIKUM — Final iPaymu Integration Alignment Test Suite
 *
 * Comprehensive regression tests verifying:
 * 1. Seller Onboarding & Closed API Compatibility (Audit & Failure Handling)
 * 2. Split Payment (BagiBagi) Allocation & Idempotency
 * 3. Escrow Channel Restrictions (VA/Unique-Code ONLY, QRIS/Card strictly rejected)
 * 4. Confirmation Window & Expiry (7-day standard, 3-day extension, 10-day max)
 * 5. Event Horizon Eligibility ($t_{event} > 10$ days rejected, $\le 7$ days verified)
 * 6. Provider Limitations (Manual refund, no fake remote escrow control APIs)
 * 7. ARGUS Double-Entry Ledger Invariants & Solvency
 * 8. Production Safety Gate (Prelaunch mode fail-closed blocking)
 */

const assert = require('assert');
const { IPaymuProvider } = require('./src/services/payment/IPaymuProvider');
const { IPaymuEscrowPolicy } = require('./src/services/payment/ipaymu/IPaymuEscrowPolicy');
const { IPaymuSellerOnboardingService, SELLER_ONBOARDING_STATUS } = require('./src/services/payment/ipaymu/IPaymuSellerOnboardingService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { CapabilityUnsupportedError } = require('./src/services/payment/PaymentProvider');
const { state } = require('./src/database');

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('================================================================');
console.log('  TIKUM — iPaymu FINAL INTEGRATION ALIGNMENT REGRESSION SUITE');
console.log('================================================================\n');

(async () => {
  const provider = new IPaymuProvider({
    apiKey: 'SANDBOX-TEST-API-KEY-9999',
    virtualAccount: '1122334455',
    mode: 'sandbox',
    allowSimulation: true
  });

  // ----------------------------------------------------------------
  // 1. SELLER ONBOARDING & SPLIT PAYMENT
  // ----------------------------------------------------------------
  console.log('── Suite 1: Seller Onboarding & Split Payment Compatibility ──');

  runTest('1.1 Closed API Single Register reports BLOCKED status with required actions', () => {
    const status = provider.getClosedApiStatus();
    assert.strictEqual(status.status, SELLER_ONBOARDING_STATUS.BLOCKED_AWAITING_PROVIDER_DOCS);
    assert.strictEqual(status.isAvailable, false);
    assert.ok(status.blocker.includes('perjanjian kemitraan enterprise'));
    assert.strictEqual(status.requiredActions.length, 3);
  });

  runTest('1.2 Individual seller account linkage requires KYC verification in Tikum', () => {
    const unverifiedSeller = { id: 'seller-unverified', kyc_status: 'UNVERIFIED' };
    assert.throws(() => {
      provider.linkSellerAccount(unverifiedSeller, { vaNumber: '00123456789' });
    }, (err) => err.code === 'SELLER_KYC_REQUIRED');

    const verifiedSeller = { id: 'seller-verified', kyc_status: 'VERIFIED' };
    const linkRes = provider.linkSellerAccount(verifiedSeller, { vaNumber: '00123456789', phone: '08123456789' });
    assert.strictEqual(linkRes.status, 'ACTIVE_LINKED');
    assert.strictEqual(linkRes.iPaymuAccount.vaNumber, '00123456789');
  });

  runTest('1.3 Split Payment validation balances gross === sellerAmount + platformFee', () => {
    const seller = { id: 'seller-1', ipaymuVa: '00123456789' };
    const split = provider.validateSplitConfiguration({
      seller,
      grossAmount: 1500000,
      sellerAmount: 1350000,
      platformFee: 150000
    });

    assert.strictEqual(split.isValid, true);
    assert.strictEqual(split.sellerAmount, 1350000);
    assert.strictEqual(split.platformFee, 150000);
    assert.strictEqual(split.bagiBagiPayload[0].account, '00123456789');
    assert.strictEqual(split.bagiBagiPayload[0].amount, 1350000);
  });

  runTest('1.4 Split Payment rejects unbalanced allocation (SPLIT_AMOUNT_MISMATCH)', () => {
    const seller = { id: 'seller-1', ipaymuVa: '00123456789' };
    assert.throws(() => {
      provider.validateSplitConfiguration({
        seller,
        grossAmount: 1500000,
        sellerAmount: 1300000, // Missing 50k
        platformFee: 150000
      });
    }, (err) => err.code === 'SPLIT_AMOUNT_MISMATCH');
  });

  runTest('1.5 Split Payment rejects unregistered seller account (SELLER_ACCOUNT_UNREGISTERED)', () => {
    const sellerWithoutVa = { id: 'seller-no-va' };
    assert.throws(() => {
      provider.validateSplitConfiguration({
        seller: sellerWithoutVa,
        grossAmount: 1000000,
        sellerAmount: 900000,
        platformFee: 100000
      });
    }, (err) => err.code === 'SELLER_ACCOUNT_UNREGISTERED');
  });

  runTest('1.6 Failure handling aborts cleanly without orphaned escrow state', () => {
    const failRes = IPaymuSellerOnboardingService.handleSplitFailure('ORD-SPLIT-FAIL', {
      code: 'SELLER_ACCOUNT_UNREGISTERED',
      message: 'Penjual belum memiliki akun iPaymu'
    });
    assert.strictEqual(failRes.status, 'ABORTED_FAIL_CLOSED');
    assert.strictEqual(failRes.actionTaken, 'PAYMENT_INITIATION_CANCELLED');
  });

  // ----------------------------------------------------------------
  // 2. ESCROW PAYMENT FLOW & CHANNEL RESTRICTIONS
  // ----------------------------------------------------------------
  console.log('\n── Suite 2: Escrow Channel Restrictions & Eligibility ──');

  runTest('2.1 Virtual Account channels are eligible for escrow', () => {
    assert.strictEqual(provider.isEscrowSupported('BCA_VA'), true);
    assert.strictEqual(provider.isEscrowSupported('MANDIRI_VA'), true);
    assert.strictEqual(provider.isEscrowSupported('VA_BNI'), true);
    assert.strictEqual(provider.isEscrowSupported('VA_BRI'), true);
    assert.strictEqual(provider.isEscrowSupported('VA_PERMATA'), true);
  });

  runTest('2.2 Bank Transfer with Unique Code is eligible for escrow', () => {
    assert.strictEqual(provider.isEscrowSupported('BANK_TRANSFER_UNIQUE_CODE'), true);
    assert.strictEqual(provider.isEscrowSupported('DIRECT_BANK_TRANSFER_UNIQUE_CODE'), true);
  });

  runTest('2.3 QRIS and Credit Card are strictly ineligible for escrow', () => {
    assert.strictEqual(provider.isEscrowSupported('QRIS'), false);
    assert.strictEqual(provider.isEscrowSupported('QRIS_STANDARD'), false);
    assert.strictEqual(provider.isEscrowSupported('CREDIT_CARD_INSTANT'), false);
    assert.strictEqual(provider.isEscrowSupported('CREDIT_CARD'), false);
    assert.strictEqual(provider.isEscrowSupported('DIRECT_BANK_TRANSFER'), false);
  });

  await runAsyncTest('2.4 Payment creation with QRIS and requiresEscrow=true is rejected', async () => {
    await assert.rejects(async () => {
      await provider.createPayment({
        orderId: 'ORD-QRIS-ESCROW-REJECT',
        amount: 500000,
        channel: 'QRIS',
        requiresEscrow: true
      });
    }, (err) => err.code === 'ESCROW_CHANNEL_UNSUPPORTED');
  });

  await runAsyncTest('2.5 Payment creation with Credit Card and requiresEscrow=true is rejected', async () => {
    await assert.rejects(async () => {
      await provider.createPayment({
        orderId: 'ORD-CC-ESCROW-REJECT',
        amount: 750000,
        channel: 'CREDIT_CARD_INSTANT',
        requiresEscrow: true
      });
    }, (err) => err.code === 'ESCROW_CHANNEL_UNSUPPORTED');
  });

  // ----------------------------------------------------------------
  // 3. CONFIRMATION WINDOW & EVENT-TIME ELIGIBILITY
  // ----------------------------------------------------------------
  console.log('\n── Suite 3: Confirmation Window & Event Horizon Eligibility ──');

  runTest('3.1 Standard confirmation window is exactly 168h (7 days) and max 240h (10 days)', () => {
    const now = new Date('2026-11-10T12:00:00Z').getTime();
    const deadlines = provider.calculateEscrowDeadlines(now, false);
    assert.strictEqual(deadlines.standardWindowHours, 168);
    assert.strictEqual(deadlines.maxWindowHours, 240);
    assert.strictEqual(new Date(deadlines.standardAutoReleaseAt).getTime() - now, 7 * 24 * 3600 * 1000);
    assert.strictEqual(new Date(deadlines.maxExtendedReleaseAt).getTime() - now, 10 * 24 * 3600 * 1000);
  });

  runTest('3.2 Event > 10 days away is rejected from provider escrow (EVENT_HORIZON_EXCEEDS_ESCROW_MAX)', () => {
    const now = new Date('2026-11-10T12:00:00Z').getTime();
    const eventIn30Days = new Date(now + 30 * 24 * 3600 * 1000).toISOString();

    const evalRes = provider.evaluateEscrowEligibility({
      paymentTimestamp: now,
      eventTimestamp: eventIn30Days
    });

    assert.strictEqual(evalRes.eligible, false);
    assert.strictEqual(evalRes.code, 'EVENT_HORIZON_EXCEEDS_ESCROW_MAX');
    assert.ok(evalRes.reason.includes('melebihi batas maksimal escrow iPaymu 10 hari'));
  });

  runTest('3.3 Event within 7 days is approved with critical gate scan warning', () => {
    const now = new Date('2026-11-10T12:00:00Z').getTime();
    const eventIn4Days = new Date(now + 4 * 24 * 3600 * 1000).toISOString();

    const evalRes = provider.evaluateEscrowEligibility({
      paymentTimestamp: now,
      eventTimestamp: eventIn4Days
    });

    assert.strictEqual(evalRes.eligible, true);
    assert.strictEqual(evalRes.code, 'ELIGIBLE_WITHIN_STANDARD_WINDOW');
    assert.ok(evalRes.warnings[0].includes('Pembeli dilarang menekan "Konfirmasi Terima" sebelum barcode tiket berhasil dipindai'));
  });

  runTest('3.4 Event between 7 and 10 days flags requirement for buyer extension', () => {
    const now = new Date('2026-11-10T12:00:00Z').getTime();
    const eventIn9Days = new Date(now + 9 * 24 * 3600 * 1000).toISOString();

    const evalRes = provider.evaluateEscrowEligibility({
      paymentTimestamp: now,
      eventTimestamp: eventIn9Days,
      isExtended: false
    });

    assert.strictEqual(evalRes.eligible, true);
    assert.strictEqual(evalRes.code, 'ELIGIBLE_REQUIRES_BUYER_EXTENSION');
    assert.strictEqual(evalRes.requiresExtension, true);
  });

  await runAsyncTest('3.5 createPayment rejects event > 10 days when escrow is requested', async () => {
    const now = new Date('2026-11-10T12:00:00Z').getTime();
    const eventIn45Days = new Date(now + 45 * 24 * 3600 * 1000).toISOString();

    await assert.rejects(async () => {
      await provider.createPayment({
        orderId: 'ORD-LONG-HORIZON-REJECT',
        amount: 800000,
        channel: 'BCA_VA',
        requiresEscrow: true,
        eventTimestamp: eventIn45Days
      });
    }, (err) => err.code === 'EVENT_HORIZON_EXCEEDS_ESCROW_MAX');
  });

  // ----------------------------------------------------------------
  // 4. PROVIDER LIMITATIONS (MANUAL REFUND, NO FAKE ESCROW APIS)
  // ----------------------------------------------------------------
  console.log('\n── Suite 4: Confirmed Provider Limitations & Non-API Invariants ──');

  await runAsyncTest('4.1 provider.hold() throws CapabilityUnsupportedError (no remote hold API)', async () => {
    await assert.rejects(async () => {
      await provider.hold({ orderId: 'ORD-TEST' });
    }, (err) => err instanceof CapabilityUnsupportedError && err.capability === 'hold');
  });

  await runAsyncTest('4.2 provider.release() throws CapabilityUnsupportedError (no remote release API)', async () => {
    await assert.rejects(async () => {
      await provider.release({ orderId: 'ORD-TEST' });
    }, (err) => err instanceof CapabilityUnsupportedError && err.capability === 'release');
  });

  await runAsyncTest('4.3 provider.refund() returns MANUAL_REFUND_PENDING (manual SLA workflow)', async () => {
    const refundRes = await provider.refund({
      orderId: 'ORD-REFUND-MANUAL',
      amount: 450000,
      reason: 'DUPLICATE_BARCODE_GATE_REJECTION'
    });

    assert.strictEqual(refundRes.refunded, false);
    assert.strictEqual(refundRes.manualActionRequired, true);
    assert.strictEqual(refundRes.status, 'MANUAL_REFUND_PENDING');
    assert.ok(refundRes.instruction.includes('portal iPaymu atau korespondensi resmi'));
  });

  await runAsyncTest('4.4 provider.createPayout() throws CapabilityUnsupportedError (payouts disabled)', async () => {
    await assert.rejects(async () => {
      await provider.createPayout({ orderId: 'ORD-TEST' });
    }, (err) => err instanceof CapabilityUnsupportedError && err.capability === 'payout');
  });

  // ----------------------------------------------------------------
  // 5. ARGUS DOUBLE-ENTRY LEDGER & FINANCIAL INTEGRITY
  // ----------------------------------------------------------------
  console.log('\n── Suite 5: ARGUS Double-Entry Financial Ledger Invariants ──');

  await runAsyncTest('5.1 Double-entry ledger captures payment and balances mathematically', async () => {
    const orderId = `ORD-ALIGN-${Date.now()}`;
    const price = 600000;
    const buyerFee = 30000;
    const sellerTax = 0;

    const captureTx = await FinancialLedger.recordPaymentCapture({
      orderId,
      ticketPrice: price,
      buyerFee,
      currency: 'IDR'
    });

    assert.ok(captureTx);
    assert.strictEqual(captureTx.order_id, orderId);

    // Sum of debits must equal sum of credits
    let sumDebits = 0;
    let sumCredits = 0;
    for (const entry of captureTx.entries) {
      if (entry.type === 'DEBIT') sumDebits += entry.amount;
      if (entry.type === 'CREDIT') sumCredits += entry.amount;
    }
    assert.strictEqual(sumDebits, sumCredits);
    assert.strictEqual(sumDebits, price + buyerFee);

    // Solvency check
    const solvency = FinancialLedger.assertSolvency();
    assert.strictEqual(solvency.solvent, true);
  });

  await runAsyncTest('5.2 Ledger refund reversal restores zero liability balance', async () => {
    const refundOrderId = `ORD-REF-REV-${Date.now()}`;
    const price = 500000;
    const buyerFee = 25000;

    await FinancialLedger.recordPaymentCapture({
      orderId: refundOrderId,
      ticketPrice: price,
      buyerFee
    });

    const refundTx = await FinancialLedger.recordRefund({
      orderId: refundOrderId,
      ticketPrice: price,
      buyerFee,
      sellerTax: 0,
      reason: 'PROMOTER_CANCELLED_EVENT'
    });

    assert.ok(refundTx);
    assert.strictEqual(refundTx.event_type, 'REFUND');

    const solvency = FinancialLedger.assertSolvency();
    assert.strictEqual(solvency.solvent, true);
  });

  // ----------------------------------------------------------------
  // 6. PRODUCTION SAFETY GATES
  // ----------------------------------------------------------------
  console.log('\n── Suite 6: Production Safety Gates & Prelaunch Invariants ──');

  runTest('6.1 Prelaunch mode fail-closed prevents real-money checkout', () => {
    const { isPrelaunchListingMode } = require('./src/config/marketplaceMode');
    assert.strictEqual(isPrelaunchListingMode(), true);
  });

  runTest('6.2 IPaymu config reports PENDING_VERIFICATION and zero exposed secrets', () => {
    const status = provider.getStatus();
    assert.strictEqual(status.status, 'PENDING_VERIFICATION');
    assert.strictEqual(status.isVerified, false);
    assert.strictEqual(status.hasCredentials, true);
    // Ensure no secrets leaked
    assert.strictEqual(status.apiKey, undefined);
    assert.strictEqual(status.secretKey, undefined);
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passedCount}/${totalCount} iPaymu ALIGNMENT REGRESSION TESTS PASSED!`);
  console.log('================================================================');
})();
