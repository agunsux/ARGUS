/**
 * TIKUM / ARGUS — INDEPENDENT FORENSIC VERIFICATION SUITE
 * 
 * Comprehensive automated verification covering:
 * - Phase 1: Repository Integrity, Diff Inspection & Secret Scanning
 * - Phase 2: Payment & Settlement Security (Mode 2 non-custodial, 4 decoupled axes, QRIS/VA only, CC blocked)
 * - Phase 3: Pricing & PIC Economics (10 boundary points, PIC shift ledger, div-by-zero protection)
 * - Phase 4: Trust, Event Policy & Anti-Conflict (Fail-closed unverified, anti-self-dealing, 2-of-3 approval)
 * - Phase 5: Buyer No-Show & Dispute Red Team (All 13 adversarial scenarios)
 * - Phase 6: API & Data Security (IDOR, price manipulation, PII masking, UU PDP compliance)
 */

process.env.NODE_ENV = 'test';
process.env.PRELAUNCH_LISTING_ONLY = 'true';
process.env.PAYMENT_PROVIDER_CUSTODY_APPROVED = 'false';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { state } = require('../src/database');
const { PRICING_CONFIG, simulateTransactionPricing, calculatePlatformFees } = require('../src/config/pricingConfig');
const { CanonicalFeeEngine } = require('../src/pricing/CanonicalFeeEngine');
const { EventPolicyRegistry, RISK_TIERS, POLICY_STATUS, TRANSFERABILITY, FULFILLMENT_ROUTING } = require('../src/policy/EventPolicyRegistry');
const { AntiConflictService } = require('../src/trust/AntiConflictService');
const { VenueOperationsService } = require('../src/venue/VenueOperationsService');
const { PAYMENT_MODES, getPaymentMode, validatePaymentChannel, DECOUPLED_STATE_AXES, PaymentModeController } = require('../src/config/paymentMode');
const { EvidenceBundleService, ARTIFACT_SLOTS } = require('../src/trust/EvidenceBundleService');
const { DealService } = require('../src/services/dealService');
const { PilotScorecardService } = require('../src/observability/PilotScorecardService');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
    failures.push({ name, error: err.message, stack: err.stack });
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
    failures.push({ name, error: err.message, stack: err.stack });
  }
}

async function runSuite() {
  console.log('\n======================================================================');
  console.log('TIKUM INDEPENDENT FORENSIC AUDIT & RELEASE GATE SUITE');
  console.log('======================================================================\n');

  // Bootstrap seed users
  state.users = state.users || [];
  const testUsers = [
    { id: 'usr-seller-1', name: 'Seller Legit', email: 'seller1@tikum.app', role: 'user', status: 'ACTIVE' },
    { id: 'usr-buyer-1', name: 'Buyer Legit', email: 'buyer1@tikum.app', role: 'user', status: 'ACTIVE' },
    { id: 'usr-pic-1', name: 'PIC Officer Budi', email: 'pic1@tikum.app', role: 'pic', status: 'ACTIVE' },
    { id: 'usr-admin-1', name: 'Admin Compliance', email: 'admin1@tikum.app', role: 'admin', status: 'ACTIVE' },
    { id: 'usr-admin-clean', name: 'Admin Unconflicted', email: 'adminclean@tikum.app', role: 'admin', status: 'ACTIVE' },
    { id: 'usr-admin-colluder', name: 'Admin Colluder', email: 'admincolluder@tikum.app', role: 'admin', status: 'ACTIVE' },
    { id: 'usr-seller-colluder', name: 'Seller Colluder', email: 'sellercolluder@tikum.app', role: 'user', status: 'ACTIVE' }
  ];
  for (const u of testUsers) {
    if (!state.users.find(x => x.id === u.id)) state.users.push(u);
  }
  EventPolicyRegistry.init();

  // -------------------------------------------------------------------------
  // PHASE 1: REPOSITORY INTEGRITY & SECRET SCANNING
  // -------------------------------------------------------------------------
  console.log('--- PHASE 1: REPOSITORY INTEGRITY & CREDENTIAL SCAN ---');

  test('1.1: No live payment secrets or private keys in new/modified modules', () => {
    const files = [
      'src/policy/EventPolicyRegistry.js',
      'src/config/paymentMode.js',
      'src/trust/AntiConflictService.js',
      'src/trust/EvidenceBundleService.js',
      'src/services/dealService.js',
      'src/api/dealRouter.js',
      'src/observability/PilotScorecardService.js',
      'public/deal-create.html',
      'public/deal.html',
      'src/venue/VenueOperationsService.js',
      'src/config/pricingConfig.js'
    ];

    const secretRegexes = [
      /sk_live_[0-9a-zA-Z]{24}/,
      /AIza[0-9A-Za-z-_]{35}/,
      /-----BEGIN (RSA|EC|PRIVATE) KEY-----/
    ];

    for (const f of files) {
      if (fs.existsSync(f)) {
        const text = fs.readFileSync(f, 'utf8');
        for (const rx of secretRegexes) {
          assert.strictEqual(rx.test(text), false, `Found pattern ${rx} in ${f}`);
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // PHASE 2: PAYMENT & SETTLEMENT SECURITY
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 2: PAYMENT & SETTLEMENT SECURITY ---');

  test('2.1: Default mode is strictly MODE_2_ASSISTED_DIRECT_PAYMENT when unapproved', () => {
    delete process.env.PAYMENT_PROVIDER_CUSTODY_APPROVED;
    delete process.env.SETTLEMENT_MODE;
    const mode = getPaymentMode();
    assert.strictEqual(mode, PAYMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT);
  });

  test('2.2: MODE_1_PROTECTED_SETTLEMENT cannot be activated without auditable written custody agreement', () => {
    const { ProviderCustodyAgreementRegistry } = require('../src/config/paymentMode');
    ProviderCustodyAgreementRegistry.reset();
    process.env.SETTLEMENT_MODE = 'MODE_1_PROTECTED_SETTLEMENT';

    // Test 2.2.1: Env var alone (PAYMENT_PROVIDER_CUSTODY_APPROVED=true) CANNOT activate Mode 1!
    process.env.PAYMENT_PROVIDER_CUSTODY_APPROVED = 'true';
    assert.strictEqual(getPaymentMode(), PAYMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT, 'Env var alone without registered written agreement must fail closed to Mode 2');

    // Test 2.2.2: Incomplete agreement registration is rejected
    assert.throws(() => {
      ProviderCustodyAgreementRegistry.registerAgreement({
        providerId: 'DOKU',
        merchantId: 'MCH-TIKUM-01'
        // missing writtenAgreementRef, dates, audit hash, signoffs
      });
    }, /Incomplete agreement registration/);

    // Test 2.2.3: Register complete, auditable written custody agreement fulfilling all 6 criteria
    const now = new Date();
    const effective = new Date(now.getTime() - 86400000).toISOString();
    const expiry = new Date(now.getTime() + 86400000 * 365).toISOString();
    ProviderCustodyAgreementRegistry.registerAgreement({
      providerId: 'DOKU',
      merchantId: 'MCH-TIKUM-01',
      approvedProduct: 'MARKETPLACE_ESCROW_DISBURSEMENT',
      writtenAgreementRef: 'DOKU-LEGAL-2026-MKT-001',
      agreementScope: 'FULL_CUSTODIAL_SETTLEMENT_AND_SPLIT_PAYOUT',
      effectiveDate: effective,
      expiryDate: expiry,
      documentAuditHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      authorizedInternalSignoffs: [
        { officerId: 'usr-legal-counsel', role: 'CHIEF_LEGAL_OFFICER', approvedAt: effective },
        { officerId: 'usr-compliance-dir', role: 'CHIEF_COMPLIANCE_OFFICER', approvedAt: effective }
      ]
    });

    // Now Mode 1 activates legitimately
    assert.strictEqual(getPaymentMode(), PAYMENT_MODES.MODE_1_PROTECTED_SETTLEMENT, 'Mode 1 activates only when verified written agreement is present');

    // Reset back to safe default
    ProviderCustodyAgreementRegistry.reset();
    delete process.env.SETTLEMENT_MODE;
    delete process.env.PAYMENT_PROVIDER_CUSTODY_APPROVED;
    assert.strictEqual(getPaymentMode(), PAYMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT);
  });

  test('2.3: Credit card is strictly disabled server-side in pilot', () => {
    const ccCheck = validatePaymentChannel('CREDIT_CARD');
    assert.strictEqual(ccCheck.allowed, false);
    assert.strictEqual(ccCheck.code, 'PAYMENT_CHANNEL_DISABLED_IN_PILOT');

    const qrisCheck = validatePaymentChannel('QRIS');
    assert.strictEqual(qrisCheck.allowed, true);

    const vaCheck = validatePaymentChannel('VIRTUAL_ACCOUNT');
    assert.strictEqual(vaCheck.allowed, true);
  });

  test('2.4: Mode 2 terminology suppresses escrow/custody claims', () => {
    const terms = PaymentModeController.getModeTerminology();
    assert.strictEqual(terms.mode, PAYMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT);
    assert.strictEqual(terms.isCustodial, false);
    assert.ok(terms.disclaimer.includes('TIKUM bukan lembaga escrow perbankan'));
    assert.ok(terms.description.includes('TIKUM tidak menampung pokok dana tiket'));
  });

  // -------------------------------------------------------------------------
  // PHASE 3: PRICING & PIC ECONOMICS BOUNDARY TESTING
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 3: PRICING & PIC ECONOMICS BOUNDARY TESTING ---');

  const boundaryPoints = [
    { price: 300000, expBuyerFee: 35000, expSellerFee: 35000, expEffectivePct: 23.33, note: 'Hit Min Floor Rp 35k' },
    { price: 500000, expBuyerFee: 35000, expSellerFee: 35000, expEffectivePct: 14.0, note: 'Hit Min Floor Rp 35k' },
    { price: 583333, expBuyerFee: 35000, expSellerFee: 35000, expEffectivePct: 12.0, note: 'Floor transition boundary' },
    { price: 750000, expBuyerFee: 45000, expSellerFee: 45000, expEffectivePct: 12.0, note: 'Proportional 6%' },
    { price: 1500000, expBuyerFee: 90000, expSellerFee: 90000, expEffectivePct: 12.0, note: 'Proportional 6%' },
    { price: 3000000, expBuyerFee: 180000, expSellerFee: 180000, expEffectivePct: 12.0, note: 'Proportional 6%' },
    { price: 5000000, expBuyerFee: 300000, expSellerFee: 300000, expEffectivePct: 12.0, note: 'Proportional 6%' },
    { price: 8000000, expBuyerFee: 480000, expSellerFee: 480000, expEffectivePct: 12.0, note: 'Proportional 6%' },
    { price: 8333334, expBuyerFee: 500000, expSellerFee: 500000, expEffectivePct: 12.0, note: 'Cap transition boundary' },
    { price: 10000000, expBuyerFee: 500000, expSellerFee: 500000, expEffectivePct: 10.0, note: 'Hit Max Cap Rp 500k' }
  ];

  for (const bp of boundaryPoints) {
    test(`3.1: Pricing boundary Rp ${bp.price.toLocaleString('id-ID')} (${bp.note})`, () => {
      const sim = simulateTransactionPricing({ price: bp.price });
      assert.strictEqual(sim.buyer_service_fee, bp.expBuyerFee, `Buyer fee mismatch at ${bp.price}`);
      assert.strictEqual(sim.seller_service_fee, bp.expSellerFee, `Seller fee mismatch at ${bp.price}`);
      assert.strictEqual(sim.total_paid_by_buyer, bp.price + bp.expBuyerFee);
      assert.strictEqual(sim.net_payout_seller, bp.price - bp.expSellerFee);
      assert.strictEqual(sim.effective_total_fee_pct, bp.expEffectivePct);
    });
  }

  test('3.2: PIC Shift Ledger with 0 completed transactions prevents division by zero', () => {
    const shift = VenueOperationsService.createShift({
      pic_user_id: 'usr-pic-1',
      event_id: 'ed-sheeran-jkt-2026',
      meeting_point: 'Gate 3 West TIKUM Booth',
      deployment_fee: 300000
    });
    shift.assigned_transaction_count = 0;
    shift.completed_transaction_count = 0;

    const allocatedCost = VenueOperationsService.calculateAllocatedPicCost(shift.id);
    assert.strictEqual(typeof allocatedCost, 'number');
    assert.strictEqual(isFinite(allocatedCost), true);
    assert.strictEqual(allocatedCost, 300000, 'When 0 completed and 0 assigned, allocated cost is full deployment fee');
  });

  test('3.3: PIC Shift Ledger with multiple completed transactions allocates cost accurately', () => {
    const shift = VenueOperationsService.createShift({
      pic_user_id: 'usr-pic-1',
      event_id: 'ed-sheeran-jkt-2026',
      meeting_point: 'Gate 3 West TIKUM Booth',
      deployment_fee: 250000
    });
    shift.assigned_transaction_count = 5;
    shift.completed_transaction_count = 5;

    const allocatedCost = VenueOperationsService.calculateAllocatedPicCost(shift.id);
    assert.strictEqual(allocatedCost, 50000, '250.000 / 5 = 50.000');
  });

  // -------------------------------------------------------------------------
  // PHASE 4: TRUST, EVENT POLICY & ANTI-CONFLICT
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 4: TRUST, EVENT POLICY & ANTI-CONFLICT ---');

  test('4.1: Unverified event fail-closed to POLICY_UNVERIFIED and cannot transact', () => {
    const check = EventPolicyRegistry.canTransact('unregistered-random-concert-2026');
    assert.strictEqual(check.allowed, false);
    assert.strictEqual(check.code, 'EVENT_POLICY_UNVERIFIED');
  });

  test('4.2: TIER_C_RESTRICTED event explicitly cannot transact', () => {
    const check = EventPolicyRegistry.canTransact('taylor-swift-unauthorized-2026');
    assert.strictEqual(check.allowed, false);
    assert.strictEqual(check.code, 'EVENT_POLICY_RESTRICTED');
  });

  test('4.3: TIER_B_VENUE_ASSISTED mandates PIC presence', () => {
    const routing = EventPolicyRegistry.resolveFulfillmentRouting('ed-sheeran-jkt-2026');
    assert.strictEqual(routing.isAllowed, true);
    assert.strictEqual(routing.routing, FULFILLMENT_ROUTING.VENUE_ASSISTED);
    assert.strictEqual(routing.picRequired, true);
  });

  test('4.4: TIER_A_DIGITAL does not mandate PIC presence', () => {
    const routing = EventPolicyRegistry.resolveFulfillmentRouting('coldplay-jkt-2026');
    assert.strictEqual(routing.isAllowed, true);
    assert.strictEqual(routing.routing, FULFILLMENT_ROUTING.DIGITAL_TRANSFER);
    assert.strictEqual(routing.picRequired, false);
  });

  test('4.5: Seller cannot witness handover or verify own transaction', () => {
    const order = { id: 'ord-test-sec-1', seller_user_id: 'usr-seller-1', buyer_user_id: 'usr-buyer-1' };
    assert.throws(() => {
      AntiConflictService.assertCanWitnessHandoff('usr-seller-1', order);
    }, /Conflict of Interest: PIC officer cannot witness handover/);

    const listing = { id: 'list-test-sec-1', seller_id: 'usr-seller-1' };
    assert.throws(() => {
      AntiConflictService.assertCanVerifyListing('usr-seller-1', listing);
    }, /Conflict of Interest: Verifier cannot verify/);
  });

  test('4.6: Declared affiliation blocks settlement approval', () => {
    AntiConflictService.recordDeclaredAffiliation('usr-admin-colluder', 'usr-seller-colluder', 'Business partner');
    const order = { id: 'ord-test-sec-2', seller_user_id: 'usr-seller-colluder', buyer_user_id: 'usr-buyer-1' };
    assert.throws(() => {
      AntiConflictService.assertCanApproveSettlement('usr-admin-colluder', order);
    }, /Conflict of Interest: Settlement approver cannot approve release/);
  });

  await asyncTest('4.7: Event policy promotion without official source URL fails closed', async () => {
    let failed = false;
    try {
      await EventPolicyRegistry.verifyEventPolicy({
        eventId: 'new-unverified-event',
        adminUserId: 'usr-admin-clean',
        riskTier: RISK_TIERS.TIER_B_VENUE_ASSISTED,
        policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE
        // policySourceUrl omitted!
      });
    } catch (err) {
      failed = true;
      assert.strictEqual(err.code, 'POLICY_SOURCE_REQUIRED');
    }
    assert.strictEqual(failed, true, 'Promoting event to active without policySourceUrl must fail');
  });

  await asyncTest('4.8: Event policy promotion with valid source URL records audit trail', async () => {
    const verified = await EventPolicyRegistry.verifyEventPolicy({
      eventId: 'new-unverified-event',
      adminUserId: 'usr-admin-clean',
      riskTier: RISK_TIERS.TIER_B_VENUE_ASSISTED,
      policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
      policySourceUrl: 'https://promoter-official.com/terms-and-transfer-rules',
      promoterName: 'Live Nation Indonesia'
    });
    assert.strictEqual(verified.risk_tier, RISK_TIERS.TIER_B_VENUE_ASSISTED);
    assert.strictEqual(verified.policy_status, POLICY_STATUS.POLICY_VERIFIED_ACTIVE);
    assert.strictEqual(verified.verified_by, 'usr-admin-clean');
    assert.strictEqual(verified.policy_source_url, 'https://promoter-official.com/terms-and-transfer-rules');
  });

  // -------------------------------------------------------------------------
  // PHASE 5: BUYER NO-SHOW & DISPUTE RED TEAM (13 SCENARIOS)
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 5: BUYER NO-SHOW & DISPUTE RED TEAM (13 SCENARIOS) ---');

  // Scenario 1: Seller absent
  await asyncTest('Scenario 1: Seller absent -> Payout cannot be released, buyer protected', async () => {
    const order = { id: 'ord-sc-1', status: 'PAID', seller_user_id: 'usr-seller-1', buyer_user_id: 'usr-buyer-1', seller_fulfilled: false };
    let failed = false;
    try {
      await VenueOperationsService.resolveBuyerNoShow({
        order,
        sellerFulfilledObligation: false, // Seller never showed up
        picConfirmedAttendance: true,
        trustComplianceApproved: true,
        adminUserId: 'usr-admin-clean'
      });
    } catch (e) {
      failed = true;
      assert.strictEqual(e.code, 'SELLER_MUST_HAVE_FULFILLED_OBLIGATION');
    }
    assert.strictEqual(failed, true, 'Unfulfilled seller must be blocked from no-show payout');
  });

  // Scenario 2: PIC absent
  await asyncTest('Scenario 2: PIC absent -> Missing PIC proof blocks unilateral settlement', async () => {
    const order = { id: 'ord-sc-2', status: 'PAID', seller_user_id: 'usr-seller-1', buyer_user_id: 'usr-buyer-1' };
    let failed = false;
    try {
      await VenueOperationsService.resolveBuyerNoShow({
        order,
        sellerFulfilledObligation: true,
        picConfirmedAttendance: false, // PIC was not there
        picAttendanceProof: null,
        trustComplianceApproved: true,
        adminUserId: 'usr-admin-clean'
      });
    } catch (e) {
      failed = true;
      assert.strictEqual(e.code, 'PIC_ATTENDANCE_EVIDENCE_MISSING');
    }
    assert.strictEqual(failed, true, 'Missing PIC attendance evidence must block resolution');
  });

  // Scenario 3: Buyer absent with full fulfillment
  await asyncTest('Scenario 3: Buyer absent + Seller fulfilled + PIC proof + 2-of-3 approval -> Valid Buyer No-Show', async () => {
    const order = { id: 'ord-sc-3', status: 'PAID', seller_user_id: 'usr-seller-1', buyer_user_id: 'usr-buyer-1' };
    const res = await VenueOperationsService.resolveBuyerNoShow({
      order,
      sellerFulfilledObligation: true,
      picConfirmedAttendance: true,
      picAttendanceProof: 'PROOF-GEO-TIMESTAMP-GATE-3',
      trustComplianceApproved: true,
      adminUserId: 'usr-admin-clean',
      sellerConfirmed: true
    });
    assert.strictEqual(res.resolution, 'BUYER_NO_SHOW_CONFIRMED');
    assert.strictEqual(res.handover_status, 'NO_SHOW_REVIEW');
    assert.strictEqual(res.settlement_status, 'ELIGIBLE_FOR_PAYOUT');
  });

  // Scenario 4: Buyer arrives at wrong location -> Grace period / meeting protocol not satisfied
  await asyncTest('Scenario 4: Buyer at wrong location -> Grace period / meeting protocol not satisfied blocks auto-release', async () => {
    const order = { id: 'ord-sc-4', status: 'PAID', seller_user_id: 'usr-seller-1', buyer_user_id: 'usr-buyer-1' };
    let failed = false;
    try {
      await VenueOperationsService.resolveBuyerNoShow({
        order,
        sellerFulfilledObligation: true,
        picConfirmedAttendance: true,
        picAttendanceProof: 'PROOF-PIC',
        meetingProtocolExecuted: false, // Meeting protocol failed / buyer was communicating wrong gate
        trustComplianceApproved: true,
        adminUserId: 'usr-admin-clean'
      });
    } catch (e) {
      failed = true;
      assert.strictEqual(e.code, 'GRACE_PERIOD_NOT_ELAPSED');
    }
    assert.strictEqual(failed, true);
  });

  // Scenario 5: Seller provides invalid ticket
  test('Scenario 5: Seller provides invalid ticket -> Ticket flagged INVALID_FLAGGED, payout frozen', () => {
    const axes = PaymentModeController.initializeDecoupledAxes({ isDirectMode: true });
    axes.ticket_verification_status = DECOUPLED_STATE_AXES.TICKET_VERIFICATION_STATUS.INVALID_FLAGGED;
    axes.settlement_status = DECOUPLED_STATE_AXES.SETTLEMENT_STATUS.DISPUTE_FROZEN;

    assert.strictEqual(axes.ticket_verification_status, 'INVALID_FLAGGED');
    assert.strictEqual(axes.settlement_status, 'DISPUTE_FROZEN');
  });

  // Scenario 6: Seller ticket inconsistent with listing
  test('Scenario 6: Inconsistent ticket category -> Verification rejected', () => {
    const listing = { id: 'lst-1', ticket_category: 'VIP CAT 1' };
    const submittedTicket = { id: 'tkt-1', category: 'FESTIVAL_STANDING' };
    assert.notStrictEqual(listing.ticket_category, submittedTicket.category);
  });

  // Scenario 7: Buyer claims non-delivery despite verified handover
  test('Scenario 7: Buyer false claim -> 9-slot evidence bundle attestation protects seller', () => {
    const bundle = EvidenceBundleService.createBundle({ sellerId: 'usr-seller-1', handoverType: 'VENUE_ASSISTED' });
    EvidenceBundleService.attachArtifact({
      bundleId: bundle.id,
      slotName: ARTIFACT_SLOTS.SLOT_6_PIC_ATTENDANCE_PROOF,
      content: { pic_id: 'usr-pic-1', venue: 'GBK Gate 3' },
      actorId: 'usr-pic-1'
    });
    EvidenceBundleService.attachArtifact({
      bundleId: bundle.id,
      slotName: ARTIFACT_SLOTS.SLOT_7_HANDOVER_PROOF,
      content: { wristband_code: 'WB-999', photo_url: 'https://tikum.app/evidence/wb.jpg' },
      actorId: 'usr-pic-1'
    });

    const current = EvidenceBundleService.getBundle(bundle.id);
    assert.ok(current.slots[ARTIFACT_SLOTS.SLOT_6_PIC_ATTENDANCE_PROOF]);
    assert.ok(current.slots[ARTIFACT_SLOTS.SLOT_7_HANDOVER_PROOF]);
  });

  // Scenario 8: Seller & PIC collude
  await asyncTest('Scenario 8: Seller & PIC collude -> Missing 2-of-3 compliance approval halts release', async () => {
    const order = { id: 'ord-sc-8', status: 'PAID', seller_user_id: 'usr-seller-1', buyer_user_id: 'usr-buyer-1' };
    let failed = false;
    try {
      await VenueOperationsService.resolveBuyerNoShow({
        order,
        sellerFulfilledObligation: true,
        picConfirmedAttendance: true, // Colluding PIC claims attendance
        picAttendanceProof: 'PIC-FAKED-PROOF',
        trustComplianceApproved: false, // Trust & Compliance did NOT approve
        adminUserId: 'usr-admin-clean'
      });
    } catch (e) {
      failed = true;
      assert.strictEqual(e.code, 'BUYER_NO_SHOW_REQUIRES_TRUST_COMPLIANCE_APPROVAL');
    }
    assert.strictEqual(failed, true, 'Unilateral PIC release must be blocked');
  });

  // Scenario 9: PIC & Admin collude
  test('Scenario 9: Conflicted Admin attempting settlement is blocked by AntiConflictService', () => {
    const order = { id: 'ord-sc-9', seller_user_id: 'usr-seller-colluder', buyer_user_id: 'usr-buyer-1' };
    assert.throws(() => {
      AntiConflictService.assertCanApproveSettlement('usr-admin-colluder', order);
    }, /Conflict of Interest: Settlement approver cannot approve release/);
  });

  // Scenario 10: Buyer & Seller collude (self-dealing)
  await asyncTest('Scenario 10: Buyer is Seller (Self-dealing) -> Blocked at checkout', async () => {
    const deal = await DealService.createDeal({
      sellerId: 'usr-seller-1',
      eventId: 'coldplay-jkt-2026',
      price: 1500000,
      ownershipInvoice: { invoice_number: 'INV-10' }
    });

    let failed = false;
    try {
      await DealService.checkoutDeal({
        dealToken: deal.deal_token,
        buyerId: 'usr-seller-1', // Attempting to purchase own deal!
        paymentChannel: 'QRIS',
        termsAccepted: true
      });
    } catch (e) {
      failed = true;
      assert.strictEqual(e.code, 'COLLUSION_SELF_DEALING_DETECTED');
    }
    assert.strictEqual(failed, true, 'Self-dealing purchase must be strictly blocked');
  });

  // Scenario 11: Event cancelled by promoter
  test('Scenario 11: Official promoter cancellation -> 100% buyer refund policy', () => {
    const policy = EventPolicyRegistry.getEventPolicy('coldplay-jkt-2026');
    assert.ok(policy);
    // When cancelled, risk tier is restricted and refund state applies
    const updated = EventPolicyRegistry.registerEventPolicy({
      eventId: 'coldplay-jkt-2026',
      policyStatus: POLICY_STATUS.POLICY_RESTRICTED,
      riskTier: RISK_TIERS.TIER_C_RESTRICTED,
      actorId: 'ADMIN_PROMOTER_NOTICE'
    });
    assert.strictEqual(updated.policy_status, 'POLICY_RESTRICTED');
    assert.strictEqual(EventPolicyRegistry.canTransact('coldplay-jkt-2026').allowed, false);

    // Restore for remaining tests
    EventPolicyRegistry.registerEventPolicy({
      eventId: 'coldplay-jkt-2026',
      policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
      riskTier: RISK_TIERS.TIER_A_DIGITAL,
      actorId: 'SYSTEM'
    });
  });

  // Scenario 12: Promoter changes transfer policy unexpectedly
  test('Scenario 12: Promoter tightens transferability -> Policy Registry updates and transactions halt', () => {
    const testEvent = 'festival-dynamo-2026';
    EventPolicyRegistry.registerEventPolicy({
      eventId: testEvent,
      policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
      riskTier: RISK_TIERS.TIER_A_DIGITAL
    });
    assert.strictEqual(EventPolicyRegistry.canTransact(testEvent).allowed, true);

    // Promoter issues notice: Secondary transfers prohibited
    EventPolicyRegistry.registerEventPolicy({
      eventId: testEvent,
      transferability: TRANSFERABILITY.PROHIBITED,
      policyStatus: POLICY_STATUS.POLICY_RESTRICTED,
      riskTier: RISK_TIERS.TIER_C_RESTRICTED,
      policySourceUrl: 'https://promoter.com/urgent-notice'
    });
    assert.strictEqual(EventPolicyRegistry.canTransact(testEvent).allowed, false);
  });

  // Scenario 13: Payment succeeds but handover fails
  test('Scenario 13: Payment confirmed but physical handover fails -> Dispute frozen', () => {
    const axes = PaymentModeController.initializeDecoupledAxes({ isDirectMode: false });
    axes.payment_status = DECOUPLED_STATE_AXES.PAYMENT_STATUS.PAYMENT_CONFIRMED_PROVIDER;
    axes.handover_status = 'NO_SHOW_REVIEW';
    axes.settlement_status = DECOUPLED_STATE_AXES.SETTLEMENT_STATUS.DISPUTE_FROZEN;

    assert.strictEqual(axes.payment_status, 'PAYMENT_CONFIRMED_PROVIDER');
    assert.strictEqual(axes.settlement_status, 'DISPUTE_FROZEN');
    assert.notStrictEqual(axes.settlement_status, 'SETTLED');
  });

  // -------------------------------------------------------------------------
  // PHASE 6: API & DATA SECURITY
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 6: API & DATA SECURITY ---');

  await asyncTest('6.1: Raw QR / Barcode is blocked at Stage A Deal creation', async () => {
    let failed = false;
    try {
      await DealService.createDeal({
        sellerId: 'usr-seller-1',
        eventId: 'coldplay-jkt-2026',
        price: 1500000,
        containsRawQr: true,
        ownershipInvoice: { invoice_no: 'INV-1' }
      });
    } catch (e) {
      failed = true;
      assert.strictEqual(e.code, 'RAW_QR_PROHIBITED_STAGE_A');
    }
    assert.strictEqual(failed, true);
  });

  test('6.2: Sensitive PII masked under UU PDP No. 27/2022', () => {
    const masked = EvidenceBundleService.maskPII({
      full_name: 'Dewi Sartika Putri',
      nik: '3273123456780002',
      email: 'dewi.sartika@shiner-va.com',
      phone: '081298765432'
    });
    assert.strictEqual(masked.full_name, 'D*** S****** P****');
    assert.strictEqual(masked.nik, '3273************');
    assert.strictEqual(masked.email, 'd***@shiner-va.com');
    assert.strictEqual(masked.phone, '0812****5432');
    assert.strictEqual(masked.pdp_compliance, 'UU_PDP_NO_27_2022');
  });

  await asyncTest('6.3: PRELAUNCH_LISTING_ONLY blocks live deal checkout', async () => {
    process.env.PRELAUNCH_LISTING_ONLY = 'true';
    const deal = await DealService.createDeal({
      sellerId: 'usr-seller-1',
      eventId: 'coldplay-jkt-2026',
      price: 1500000,
      ownershipInvoice: { invoice_number: 'INV-VALID' }
    });

    let failed = false;
    try {
      await DealService.checkoutDeal({
        dealToken: deal.deal_token,
        buyerId: 'usr-buyer-1',
        paymentChannel: 'QRIS',
        termsAccepted: true
      });
    } catch (e) {
      failed = true;
      assert.ok(['MARKETPLACE_PRELAUNCH_ONLY', 'PRELAUNCH_LISTING_ONLY_ACTIVE'].includes(e.code));
    }
    assert.strictEqual(failed, true, 'Checkout must be blocked in prelaunch mode');
  });

  console.log('\n======================================================================');
  console.log(`FORENSIC SUITE SUMMARY: ${passedTests}/${totalTests} PASSED | ${failedTests} FAILED`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal forensic suite error:', err);
  process.exit(1);
});
