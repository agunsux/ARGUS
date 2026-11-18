/**
 * TIKUM â€” ZERO-TO-ONE GOVERNANCE ALIGNMENT TEST SUITE
 * 
 * Verifies all 11 Governance Rules specified in the Zero-to-One Directive:
 * - Test 1: Pricing Math & Upfront Transparency (6%+6%, min Rp35k, cap Rp500k, effective %, 7%+7% standard ref)
 * - Test 2: Three-Tier Handover Classification & Strategic Event Policy Registry (fail-closed unverified default)
 * - Test 3: Anti-Conflict Governance (AntiConflictService blocking seller/buyer/affiliates)
 * - Test 4: Binding Transaction, No-Show 2-of-3 & Four Decoupled State Axes
 * - Test 5: Payment Gateway Decoupling (Mode 1 vs Mode 2, QRIS/VA only, Prelaunch Guard)
 * - Test 6: QR Privacy Protection (Stage A raw QR block) & 9-Slot Evidence Bundle (UU PDP PII redaction)
 */

process.env.NODE_ENV = 'test';
process.env.PRELAUNCH_LISTING_ONLY = 'true';
process.env.PAYMENT_PROVIDER_CUSTODY_APPROVED = 'false';

const assert = require('assert');
const { state } = require('./src/database');
const { PRICING_CONFIG, calculatePlatformFees, simulateTransactionPricing } = require('./src/config/pricingConfig');
const { CanonicalFeeEngine } = require('./src/pricing/CanonicalFeeEngine');
const { EventPolicyRegistry, RISK_TIERS, POLICY_STATUS } = require('./src/policy/EventPolicyRegistry');
const { AntiConflictService } = require('./src/trust/AntiConflictService');
const { VenueOperationsService } = require('./src/venue/VenueOperationsService');
const { PAYMENT_MODES, getPaymentMode, validatePaymentChannel, DECOUPLED_STATE_AXES } = require('./src/config/paymentMode');
const { EvidenceBundleService, ARTIFACT_SLOTS } = require('./src/trust/EvidenceBundleService');
const { DealService } = require('./src/services/dealService');
const { PilotScorecardService } = require('./src/observability/PilotScorecardService');

let passed = 0;
let failed = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`  âœ“ ${testName}`);
    passed++;
  } catch (err) {
    console.error(`  âœ— ${testName}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(testName, fn) {
  try {
    await fn();
    console.log(`  âœ“ ${testName}`);
    passed++;
  } catch (err) {
    console.error(`  âœ— ${testName}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('\n===============================================================');
  console.log('TIKUM ZERO-TO-ONE â€” GOVERNANCE ALIGNMENT AUTOMATED TEST SUITE');
  console.log('===============================================================\n');

  // Seed test users & policy
  state.users = state.users || [];
  if (!state.users.find(u => u.id === 'seller-test-1')) {
    state.users.push({ id: 'seller-test-1', name: 'Seller One', email: 'seller@tikum.app', role: 'user', status: 'ACTIVE' });
  }
  if (!state.users.find(u => u.id === 'buyer-test-1')) {
    state.users.push({ id: 'buyer-test-1', name: 'Buyer One', email: 'buyer@tikum.app', role: 'user', status: 'ACTIVE' });
  }
  EventPolicyRegistry.init();

  // =========================================================================
  // TEST 1: PRICING MATH & TRANSPARENCY (RULE 1)
  // =========================================================================
  console.log('[CATEGORY 1: PRICING MATH & UPFRONT TRANSPARENCY]');

  runTest('1.1: Pilot fee rates are exactly 6% buyer + 6% seller with 7%+7% standard ref', () => {
    assert.strictEqual(PRICING_CONFIG.PILOT_BUYER_FEE_PCT, 6);
    assert.strictEqual(PRICING_CONFIG.PILOT_SELLER_FEE_PCT, 6);
    assert.strictEqual(PRICING_CONFIG.NORMAL_BUYER_FEE_PCT, 7);
    assert.strictEqual(PRICING_CONFIG.NORMAL_SELLER_FEE_PCT, 7);
    assert.strictEqual(PRICING_CONFIG.PLATFORM_MIN_FEE_IDR, 35000);
    assert.strictEqual(PRICING_CONFIG.PLATFORM_MAX_FEE_IDR, 500000);
  });

  runTest('1.2: Low-value ticket (Rp 300.000) triggers Rp 35.000 floor (Total fee Rp 70.000, 23.33% effective)', () => {
    const sim = simulateTransactionPricing({ price: 300000 });
    assert.strictEqual(sim.ticket_base_price, 300000);
    assert.strictEqual(sim.buyer_service_fee, 35000, 'Buyer fee must hit min floor Rp 35.000');
    assert.strictEqual(sim.seller_service_fee, 35000, 'Seller fee must hit min floor Rp 35.000');
    assert.strictEqual(sim.total_paid_by_buyer, 335000);
    assert.strictEqual(sim.net_payout_seller, 265000);
    assert.strictEqual(sim.buyer_service_fee + sim.seller_service_fee, 70000);
    assert.strictEqual(sim.effective_total_fee_pct, 23.33);
    assert.strictEqual(sim.standard_plan_reference.planned_rate_description, 'Tarif standar normal yang direncanakan: 7% Pembeli + 7% Penjual.');
    assert.strictEqual(sim.standard_plan_reference.is_pilot_active, true);
  });

  runTest('1.3: High-value ticket (Rp 10.000.000) hits Rp 500.000 maximum cap per side', () => {
    const sim = simulateTransactionPricing({ price: 10000000 });
    assert.strictEqual(sim.ticket_base_price, 10000000);
    assert.strictEqual(sim.buyer_service_fee, 500000, 'Buyer fee capped at Rp 500.000');
    assert.strictEqual(sim.seller_service_fee, 500000, 'Seller fee capped at Rp 500.000');
    assert.strictEqual(sim.total_paid_by_buyer, 10500000);
    assert.strictEqual(sim.net_payout_seller, 9500000);
    assert.strictEqual(sim.buyer_service_fee + sim.seller_service_fee, 1000000);
    assert.strictEqual(sim.effective_total_fee_pct, 10.0);
  });

  runTest('1.4: CanonicalFeeEngine matches PRICING_CONFIG cap of Rp 500.000', () => {
    const quote = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 10000000 });
    assert.strictEqual(quote.buyer_fee, 500000);
    assert.strictEqual(quote.seller_fee, 500000);
    assert.strictEqual(quote.total_tikum_fee, 1000000);
    assert.strictEqual(quote.buyer_total, 10500000);
    assert.strictEqual(quote.seller_payout, 9500000);
  });

  runTest('1.5: Upfront simulation payload includes all mandatory transparent elements', () => {
    const sim = simulateTransactionPricing({ price: 1500000, picAssisted: true, picAllocationFee: 50000 });
    assert.strictEqual(sim.ticket_base_price, 1500000);
    assert.strictEqual(sim.buyer_service_fee, 90000);
    assert.strictEqual(sim.seller_service_fee, 90000);
    assert.strictEqual(sim.pic_allocation_fee, 50000);
    assert.strictEqual(sim.total_paid_by_buyer, 1500000 + 90000 + 50000);
    assert.strictEqual(sim.net_payout_seller, 1500000 - 90000);
    assert.ok(sim.standard_plan_reference.planned_rate_description);
    assert.ok(sim.standard_plan_reference.active_pilot_description);
  });

  // =========================================================================
  // TEST 2: THREE-TIER ROUTING & EVENT POLICY REGISTRY (RULES 2 & 6)
  // =========================================================================
  console.log('\n[CATEGORY 2: THREE-TIER ROUTING & EVENT POLICY REGISTRY]');

  runTest('2.1: Unverified event defaults to POLICY_UNVERIFIED and blocks transaction (Fail-Closed)', () => {
    const evalResult = EventPolicyRegistry.evaluateEventRisk('unregistered-random-event-999');
    assert.strictEqual(evalResult.policy_status, POLICY_STATUS.POLICY_UNVERIFIED);
    assert.strictEqual(evalResult.risk_tier, RISK_TIERS.TIER_C_RESTRICTED);
    assert.strictEqual(evalResult.can_transact, false);
    assert.ok(evalResult.reason.includes('belum diverifikasi'), 'Reason must mention unverified policy');
  });

  runTest('2.2: TIER_C_RESTRICTED event explicitly blocks transactions', () => {
    const evalResult = EventPolicyRegistry.evaluateEventRisk('taylor-swift-unauthorized-2026');
    assert.strictEqual(evalResult.risk_tier, RISK_TIERS.TIER_C_RESTRICTED);
    assert.strictEqual(evalResult.policy_status, POLICY_STATUS.POLICY_RESTRICTED);
    assert.strictEqual(evalResult.can_transact, false);
    assert.ok(evalResult.reason.includes('RESTRICTED') || evalResult.reason.includes('melarang'), 'Reason must mention restriction or prohibition');
  });

  runTest('2.3: TIER_A_DIGITAL event routes to DIGITAL_TRANSFER without mandatory PIC', () => {
    const evalResult = EventPolicyRegistry.evaluateEventRisk('coldplay-jkt-2026');
    assert.strictEqual(evalResult.risk_tier, RISK_TIERS.TIER_A_DIGITAL);
    assert.strictEqual(evalResult.policy_status, POLICY_STATUS.POLICY_VERIFIED_ACTIVE);
    assert.strictEqual(evalResult.can_transact, true);
    assert.strictEqual(evalResult.handover_type, 'DIGITAL_TRANSFER');
    assert.strictEqual(evalResult.pic_required, false);
  });

  runTest('2.4: TIER_B_VENUE_ASSISTED event requires and routes through PIC handover', () => {
    const evalResult = EventPolicyRegistry.evaluateEventRisk('ed-sheeran-jkt-2026');
    assert.strictEqual(evalResult.risk_tier, RISK_TIERS.TIER_B_VENUE_ASSISTED);
    assert.strictEqual(evalResult.policy_status, POLICY_STATUS.POLICY_VERIFIED_ACTIVE);
    assert.strictEqual(evalResult.can_transact, true);
    assert.strictEqual(evalResult.handover_type, 'VENUE_ASSISTED');
    assert.strictEqual(evalResult.pic_required, true);
    assert.strictEqual(evalResult.wristband_exchange_required, true);
  });

  await runAsyncTest('2.5: Deal creation for unverified/restricted event is blocked by DealService', async () => {
    let thrown = false;
    try {
      await DealService.createDeal({
        sellerId: 'seller-test-1',
        eventId: 'unknown-festival-2026',
        ticketCategory: 'VIP',
        price: 1000000,
        ownershipInvoice: { invoice_number: 'INV-123' }
      });
    } catch (e) {
      thrown = true;
      assert.ok(e.message.includes('belum diverifikasi') || e.code === 'EVENT_POLICY_UNVERIFIED');
    }
    assert.strictEqual(thrown, true, 'createDeal should have thrown on unverified event');
  });

  // =========================================================================
  // TEST 3: ANTI-CONFLICT ENFORCEMENT & SHIFT LEDGER (RULES 3 & 7)
  // =========================================================================
  console.log('\n[CATEGORY 3: ANTI-CONFLICT ENFORCEMENT & SHIFT LEDGER]');

  runTest('3.1: PIC who is the Seller of a transaction is strictly blocked', () => {
    const order = { id: 'order-1', seller_user_id: 'user-pic-1', buyer_user_id: 'user-buyer-1' };
    assert.throws(() => {
      AntiConflictService.assertCanActAsPic('user-pic-1', order);
    }, /Conflict of Interest: PIC officer cannot witness handover/);
  });

  runTest('3.2: PIC who is the Buyer of a transaction is strictly blocked', () => {
    const order = { id: 'order-2', seller_user_id: 'user-seller-2', buyer_user_id: 'user-pic-1' };
    assert.throws(() => {
      AntiConflictService.assertCanActAsPic('user-pic-1', order);
    }, /Conflict of Interest: PIC officer cannot witness handover/);
  });

  runTest('3.3: Declared affiliation blocks PIC assignment', () => {
    state.users.push({ id: 'user-pic-1', name: 'PIC 1', role: 'pic' });
    state.users.push({ id: 'user-seller-3', name: 'Seller 3', role: 'user' });
    AntiConflictService.recordDeclaredAffiliation('user-pic-1', 'user-seller-3', 'Family member');
    const order = { id: 'order-3', seller_user_id: 'user-seller-3', buyer_user_id: 'user-buyer-3' };
    assert.throws(() => {
      AntiConflictService.assertCanActAsPic('user-pic-1', order);
    }, /Conflict of Interest: PIC officer cannot witness handover/);
  });

  runTest('3.4: Verifier cannot verify own ticket or listing', () => {
    const listing = { id: 'listing-1', seller_id: 'user-seller-4' };
    assert.throws(() => {
      AntiConflictService.assertCanVerifyListing('user-seller-4', listing);
    }, /Conflict of Interest: Verifier cannot verify/);
  });

  runTest('3.5: Approver cannot approve own settlement payout', () => {
    const order = { id: 'order-5', seller_user_id: 'user-seller-5', buyer_user_id: 'user-buyer-5' };
    assert.throws(() => {
      AntiConflictService.assertCanApproveSettlement('user-seller-5', order);
    }, /Conflict of Interest: Settlement approver cannot approve/);
    assert.throws(() => {
      AntiConflictService.assertCanApproveSettlement('user-buyer-5', order);
    }, /Conflict of Interest: Settlement approver cannot approve/);
  });

  runTest('3.6: Shift Ledger tracks deployment fee, assigned/completed count, and allocated PIC cost', () => {
    const shift = VenueOperationsService.createShift({
      pic_user_id: 'pic-duty-1',
      event_id: 'ed-sheeran-jkt-2026',
      shift_start: new Date().toISOString(),
      shift_end: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      meeting_point: 'Gate 3 West TIKUM Booth',
      deployment_fee: 300000
    });
    assert.strictEqual(shift.deployment_fee, 300000);
    assert.strictEqual(shift.assigned_transaction_count, 0);

    shift.assigned_transaction_count = 5;
    shift.completed_transaction_count = 3;
    const allocatedCost = VenueOperationsService.calculateAllocatedPicCost(shift.id);
    assert.strictEqual(allocatedCost, 100000, 'Allocated cost should be 300.000 / 3 = 100.000');
  });

  // =========================================================================
  // TEST 4: BINDING TRANSACTION, NO-SHOW 2-OF-3 & FOUR STATE AXES (RULES 4 & 5)
  // =========================================================================
  console.log('\n[CATEGORY 4: BINDING TRANSACTION, NO-SHOW 2-OF-3 & FOUR DECOUPLED STATE AXES]');

  await runAsyncTest('4.1: Unilateral PIC input alone CANNOT release seller payout on buyer no-show', async () => {
    const order = { id: 'ord-ns-1', status: 'IN_ESCROW', seller_user_id: 's-1', buyer_user_id: 'b-1' };
    let thrown = false;
    try {
      await VenueOperationsService.resolveBuyerNoShow({
        order,
        picConfirmedAttendance: true,
        meetingProtocolExecuted: true,
        sellerFulfilledObligation: true,
        trustComplianceApproved: false, // Missing 2-of-3 compliance approval
        adminUserId: 'admin-ops'
      });
    } catch (e) {
      thrown = true;
      assert.strictEqual(e.code, 'BUYER_NO_SHOW_REQUIRES_TRUST_COMPLIANCE_APPROVAL');
    }
    assert.strictEqual(thrown, true);
  });

  await runAsyncTest('4.2: Seller who failed to fulfill obligation CANNOT claim buyer no-show', async () => {
    const order = { id: 'ord-ns-2', status: 'IN_ESCROW', seller_user_id: 's-2', buyer_user_id: 'b-2' };
    let thrown = false;
    try {
      await VenueOperationsService.resolveBuyerNoShow({
        order,
        picConfirmedAttendance: true,
        meetingProtocolExecuted: true,
        sellerFulfilledObligation: false, // Seller was not ready/did not bring ticket
        trustComplianceApproved: true,
        adminUserId: 'admin-compliance'
      });
    } catch (e) {
      thrown = true;
      assert.strictEqual(e.code, 'SELLER_MUST_HAVE_FULFILLED_OBLIGATION');
    }
    assert.strictEqual(thrown, true);
  });

  await runAsyncTest('4.3: Buyer no-show succeeds when all 3 layers are fulfilled (seller fulfilled, meeting protocol, 2-of-3 approval)', async () => {
    const order = { id: 'ord-ns-3', status: 'IN_ESCROW', seller_user_id: 's-3', buyer_user_id: 'b-3' };
    const result = await VenueOperationsService.resolveBuyerNoShow({
      order,
      picConfirmedAttendance: true,
      meetingProtocolExecuted: true,
      sellerFulfilledObligation: true,
      trustComplianceApproved: true,
      adminUserId: 'admin-compliance'
    });
    assert.strictEqual(result.resolution, 'BUYER_NO_SHOW_CONFIRMED');
    assert.strictEqual(result.handover_status, 'NO_SHOW_REVIEW');
    assert.strictEqual(result.settlement_status, 'ELIGIBLE_FOR_PAYOUT');
  });

  await runAsyncTest('4.4: Four State Axes are decoupled (payment confirmation does not equal verified ticket)', async () => {
    const deal = await DealService.createDeal({
      sellerId: 'seller-test-1',
      eventId: 'coldplay-jkt-2026',
      ticketCategory: 'Festival B',
      price: 1200000,
      ownershipInvoice: { invoice_number: 'INV-COLD-01' }
    });

    assert.strictEqual(deal.payment_status, DECOUPLED_STATE_AXES.PAYMENT_STATUS.UNPAID);
    assert.strictEqual(deal.ticket_verification_status, DECOUPLED_STATE_AXES.TICKET_VERIFICATION_STATUS.OWNERSHIP_EVIDENCE_REVIEWED);
    assert.strictEqual(deal.handover_status, DECOUPLED_STATE_AXES.HANDOVER_STATUS.PENDING);
    assert.strictEqual(deal.settlement_status, DECOUPLED_STATE_AXES.SETTLEMENT_STATUS.NOT_APPLICABLE_DIRECT);

    // Simulate payment confirmation
    const paidDeal = await DealService.confirmPayment({ orderId: deal.deal_id, providerReference: 'DOKU-REF-999' });
    assert.strictEqual(paidDeal.payment_status, DECOUPLED_STATE_AXES.PAYMENT_STATUS.PAYMENT_CONFIRMED_PROVIDER);
    // Ticket verification status MUST NOT magically turn into gate entry or valid barcode
    assert.strictEqual(paidDeal.ticket_verification_status, DECOUPLED_STATE_AXES.TICKET_VERIFICATION_STATUS.OWNERSHIP_EVIDENCE_REVIEWED);
    assert.notStrictEqual(paidDeal.ticket_verification_status, 'GATE_ENTRY_GUARANTEED');
  });

  // =========================================================================
  // TEST 5: PAYMENT GATEWAY DECOUPLING & PRELAUNCH GUARD (RULE 5)
  // =========================================================================
  console.log('\n[CATEGORY 5: PAYMENT GATEWAY DECOUPLING & PRELAUNCH GUARD]');

  runTest('5.1: Mode 1 Protected Settlement cannot be enabled without explicit custody approval', () => {
    delete process.env.PAYMENT_PROVIDER_CUSTODY_APPROVED;
    const mode = getPaymentMode();
    assert.strictEqual(mode, PAYMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT);
  });

  runTest('5.2: Credit Card is strictly rejected during pilot (QRIS and VA only)', () => {
    const ccCheck = validatePaymentChannel('CREDIT_CARD');
    assert.strictEqual(ccCheck.allowed, false);
    assert.ok(ccCheck.reason.includes('dinonaktifkan'));

    const qrisCheck = validatePaymentChannel('QRIS');
    assert.strictEqual(qrisCheck.allowed, true);

    const vaCheck = validatePaymentChannel('VIRTUAL_ACCOUNT');
    assert.strictEqual(vaCheck.allowed, true);
  });

  await runAsyncTest('5.3: PRELAUNCH_LISTING_ONLY blocks live deal checkout', async () => {
    process.env.PRELAUNCH_LISTING_ONLY = 'true';
    const deal = await DealService.createDeal({
      sellerId: 'seller-test-1',
      eventId: 'coldplay-jkt-2026',
      ticketCategory: 'Festival A',
      price: 1500000,
      ownershipInvoice: { invoice_number: 'INV-PRE-1' }
    });

    let thrown = false;
    try {
      await DealService.checkoutDeal({
        dealToken: deal.deal_token,
        buyerId: 'buyer-test-1',
        paymentChannel: 'QRIS',
        termsAccepted: true
      });
    } catch (e) {
      thrown = true;
      assert.ok(['PRELAUNCH_LISTING_ONLY_ACTIVE', 'MARKETPLACE_PRELAUNCH_ONLY'].includes(e.code));
    }
    assert.strictEqual(thrown, true, 'Checkout must be blocked by PRELAUNCH_LISTING_ONLY');
  });

  // =========================================================================
  // TEST 6: QR PRIVACY & 9-SLOT EVIDENCE BUNDLE (RULES 8 & 9)
  // =========================================================================
  console.log('\n[CATEGORY 6: QR PRIVACY & 9-SLOT EVIDENCE BUNDLE]');

  await runAsyncTest('6.1: Stage A Deal creation strictly blocks raw QR or barcode upload', async () => {
    let thrown1 = false;
    try {
      await DealService.createDeal({
        sellerId: 'seller-test-1',
        eventId: 'coldplay-jkt-2026',
        ticketCategory: 'CAT 1',
        price: 2500000,
        containsRawQr: true,
        ownershipInvoice: { invoice_number: 'INV-BAD' }
      });
    } catch (e) {
      thrown1 = true;
      assert.strictEqual(e.code, 'RAW_QR_PROHIBITED_STAGE_A');
    }
    assert.strictEqual(thrown1, true);

    let thrown2 = false;
    try {
      await DealService.createDeal({
        sellerId: 'seller-test-1',
        eventId: 'coldplay-jkt-2026',
        ticketCategory: 'CAT 1',
        price: 2500000,
        rawBarcode: 'BARCODE123456789',
        ownershipInvoice: { invoice_number: 'INV-BAD' }
      });
    } catch (e) {
      thrown2 = true;
      assert.strictEqual(e.code, 'RAW_QR_PROHIBITED_STAGE_A');
    }
    assert.strictEqual(thrown2, true);
  });

  runTest('6.2: EvidenceBundleService masks PII in compliance with UU PDP No. 27/2022', () => {
    const rawPii = {
      full_name: 'Budi Santoso',
      nik: '3201234567890001',
      email: 'budi.santoso@shiner-va.com',
      phone: '081234567890'
    };

    const masked = EvidenceBundleService.maskPII(rawPii);
    assert.strictEqual(masked.full_name, 'B*** S******');
    assert.strictEqual(masked.nik, '3201************');
    assert.strictEqual(masked.email, 'b***@shiner-va.com');
    assert.strictEqual(masked.phone, '0812****7890');
    assert.strictEqual(masked.pdp_compliance, 'UU_PDP_NO_27_2022');
  });

  runTest('6.3: Digital Evidence Bundle tracks all 9 mandatory artifact slots', () => {
    const bundle = EvidenceBundleService.createBundle({ sellerId: 'seller-test-1', handoverType: 'VENUE_ASSISTED' });
    const slots = Object.keys(bundle.slots);
    assert.strictEqual(slots.length, 9, 'Must have exactly 9 artifact slots');
    assert.ok(slots.includes('ownership_evidence'), 'Slot 1 missing');
    assert.ok(slots.includes('purchase_invoice'), 'Slot 2 missing');
    assert.ok(slots.includes('seller_identity_ref'), 'Slot 3 missing');
    assert.ok(slots.includes('binding_consent_log'), 'Slot 4 missing');
    assert.ok(slots.includes('payment_proof'), 'Slot 5 missing');
    assert.ok(slots.includes('pic_attendance_proof'), 'Slot 6 missing');
    assert.ok(slots.includes('handover_proof'), 'Slot 7 missing');
    assert.ok(slots.includes('buyer_receipt_or_noshow'), 'Slot 8 missing');
    assert.ok(slots.includes('resolution_notes'), 'Slot 9 missing');

    const comp0 = EvidenceBundleService.getBundleCompleteness(bundle.id);
    assert.strictEqual(comp0.completenessPercent, 0);

    // Attach slot 1 and slot 2
    EvidenceBundleService.attachArtifact({
      bundleId: bundle.id,
      slotName: ARTIFACT_SLOTS.SLOT_1_OWNERSHIP_EVIDENCE,
      content: { invoice_no: 'INV-01' },
      actorId: 'seller-test-1'
    });
    EvidenceBundleService.attachArtifact({
      bundleId: bundle.id,
      slotName: ARTIFACT_SLOTS.SLOT_2_PURCHASE_INVOICE,
      content: { invoice_receipt: 'REC-01' },
      actorId: 'seller-test-1'
    });

    const comp2 = EvidenceBundleService.getBundleCompleteness(bundle.id);
    assert.strictEqual(comp2.filledSlots, 2);
    assert.strictEqual(comp2.completenessPercent, 22);
  });

  runTest('6.4: PilotScorecardService reports Hard Governance Targets and Cohort Metrics', () => {
    const scorecard = PilotScorecardService.getScorecard();
    assert.strictEqual(scorecard.hard_governance_targets.pilot_volume_target, '20-30 Transaksi');
    assert.strictEqual(scorecard.hard_governance_targets.evidence_completeness_target_pct, 100);
    assert.strictEqual(scorecard.hard_governance_targets.unauthorized_releases_target, 0);
    assert.strictEqual(scorecard.hard_governance_targets.ledger_discrepancies_target_idr, 0);
    assert.strictEqual(scorecard.hard_governance_targets.unauthorized_settlement_releases, 0);
    assert.strictEqual(scorecard.hard_governance_targets.ledger_discrepancies_idr, 0);
  });

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
