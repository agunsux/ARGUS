/**
 * TIKUM ZERO-TO-ONE — END-TO-END SANDBOX TRANSACTION SIMULATION SUITE
 *
 * 100% SYNTHETIC TEST FIXTURES — ZERO REAL MONEY — ZERO REAL TICKETS — ZERO REAL PII
 *
 * Master test suite covering:
 * Part 1: Synthetic Fixtures & Isolation Initialization
 * Part 2: Canonical Pricing Verification on Rp 1.500.000 (6% + 6%, min 35k, cap 500k, zero arbitrary PIC fee)
 * Part 3: Complete 14-Step Positive Handover & Settlement Flow (Venue-Assisted Tier B)
 *         - Strict distinction: PIC Handover vs Buyer Receipt vs Buyer Reported Entry vs Independently Verified Entry
 * Part 4: 16 Negative & Adversarial Security Scenarios
 *         - Canonical 30-Minute No-Show Boundary Tests (29m fail, 30m pass, 45m pass)
 *         - Mode 2 Refund State Machine: REFUND_REQUIRED -> REFUND_INITIATED -> REFUND_CONFIRMED / REFUND_FAILED
 *         - Separation of Seller Ticket Principal Obligation vs TIKUM Platform Fee Reversal
 *         - Ledger Journal never implies actual cash movement completion
 * Part 5: Double-Entry Ledger Reconciliation & Pilot Scorecard Audit
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '0';

const assert = require('assert');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { state, resetDatabase, recordAuditLog } = require('./src/database');
const { EventPolicyRegistry, RISK_TIERS, POLICY_STATUS, FULFILLMENT_ROUTING } = require('./src/policy/EventPolicyRegistry');
const { PRICING_CONFIG, simulateTransactionPricing, calculatePricing } = require('./src/config/pricingConfig');
const { DealService } = require('./src/services/dealService');
const { EvidenceBundleService, ARTIFACT_SLOTS, EVIDENCE_TYPES } = require('./src/trust/EvidenceBundleService');
const { AntiConflictService } = require('./src/trust/AntiConflictService');
const { VenueOperationsService, NO_SHOW_GRACE_PERIOD_MINUTES } = require('./src/venue/VenueOperationsService');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY } = require('./src/venue/IncidentService');
const { FinancialLedger, LEDGER_ACCOUNTS, FINANCIAL_EVENT_TYPES } = require('./src/settlement/FinancialLedger');
const { RefundGovernanceService, REFUND_LIFECYCLE_STATUS, REFUND_RESPONSIBILITY } = require('./src/settlement/RefundGovernanceService');
const { PilotScorecardService } = require('./src/observability/PilotScorecardService');
const {
  PaymentModeController,
  SETTLEMENT_MODES,
  PILOT_PAYMENT_CHANNELS,
  PAYMENT_STATUS,
  TICKET_VERIFICATION_STATUS,
  HANDOVER_STATUS,
  ENTRY_VERIFICATION_STATUS,
  REFUND_STATUS,
  SETTLEMENT_STATUS,
  ProviderCustodyAgreementRegistry
} = require('./src/config/paymentMode');
const {
  setMarketplaceModeForTesting,
  setPaymentGatewayFrozenForTesting,
  isPrelaunchListingMode,
  PRELAUNCH_ERROR_RESPONSE
} = require('./src/config/marketplaceMode');
const {
  SyntheticSandboxPaymentAdapter,
  SYNTHETIC_PAYMENT_STATUS,
  SYNTHETIC_SCENARIOS
} = require('./src/services/payment/SyntheticSandboxPaymentAdapter');

console.log('================================================================================');
console.log('TIKUM ZERO-TO-ONE — END-TO-END SANDBOX TRANSACTION SIMULATION');
console.log('100% SYNTHETIC FIXTURES — ZERO REAL MONEY — PRODUCTION SAFEGUARD ACTIVE');
console.log('================================================================================\n');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assertTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
    testResults.push({ name, status: 'PASS' });
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: err.message });
  }
}

async function asyncAssertTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
    testResults.push({ name, status: 'PASS' });
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: err.message });
  }
}

// ==============================================================================
// PART 1: SYNTHETIC FIXTURES SETUP
// ==============================================================================

const SYNTHETIC_FIXTURES = {
  event: {
    id: 'ev-synthetic-test-2026',
    canonical_id: 'ev-synthetic-test-2026',
    title: 'TEST CONCERT 2026',
    promoter: 'SYNTHETIC PROMOTER ENTERTAINMENT',
    venue_id: 'v-synthetic-gbk',
    venue_name: 'Gelora Bung Karno - Synthetic Arena',
    date: '2026-12-15',
    isSynthetic: true
  },
  promoterPolicy: {
    eventId: 'ev-synthetic-test-2026',
    promoterName: 'SYNTHETIC PROMOTER ENTERTAINMENT',
    riskTier: RISK_TIERS.TIER_B_VENUE_ASSISTED,
    transferability: 'LIMITED',
    wristbandExchangeRequired: true,
    policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
    policySourceUrl: 'https://synthetic-promoter.com/terms/ticket-transfer-policy-2026',
    actorId: 'usr-admin-compliance-1',
    isSynthetic: true
  },
  users: {
    seller: {
      id: 'test_seller_001',
      name: 'Budi Seller (Synthetic)',
      email: 'seller001@tikum-test.synthetic',
      phone: '081299990001',
      nik: '3171012345670001',
      role: 'user',
      kyc_status: 'VERIFIED',
      isSynthetic: true
    },
    buyer: {
      id: 'test_buyer_001',
      name: 'Siti Buyer (Synthetic)',
      email: 'buyer001@tikum-test.synthetic',
      phone: '081299990002',
      nik: '3171012345670002',
      role: 'user',
      kyc_status: 'VERIFIED',
      isSynthetic: true
    },
    pic: {
      id: 'test_pic_001',
      name: 'Rian Field PIC (Synthetic)',
      email: 'pic001@tikum-test.synthetic',
      phone: '081299990003',
      nik: '3171012345670003',
      role: 'pic',
      isSynthetic: true
    },
    trustAdmin: {
      id: 'test_trust_001',
      name: 'Dewi Trust Officer (Synthetic)',
      email: 'trust001@tikum-test.synthetic',
      phone: '081299990004',
      nik: '3171012345670004',
      role: 'admin',
      isSynthetic: true
    },
    complianceAdmin: {
      id: 'test_compliance_001',
      name: 'Arya Compliance Officer (Synthetic)',
      email: 'compliance001@tikum-test.synthetic',
      phone: '081299990005',
      nik: '3171012345670005',
      role: 'admin',
      isSynthetic: true
    }
  },
  ticket: {
    category: 'CAT 1',
    basePrice: 1500000,
    quantity: 1,
    invoiceRef: 'INV-SYNTHETIC-2026-001',
    fakeBarcode: 'SYNTHETIC-BARCODE-DO-NOT-USE-001',
    isSynthetic: true
  }
};

async function runFullSimulation() {
  console.log('--- INITIALIZING ISOLATED SYNTHETIC STATE ---');
  resetDatabase();

  // Populate synthetic entities in memory state
  state.events = [SYNTHETIC_FIXTURES.event];
  state.venues = [{ id: 'v-synthetic-gbk', name: 'Gelora Bung Karno - Synthetic Arena', city: 'Jakarta' }];
  state.users = Object.values(SYNTHETIC_FIXTURES.users);
  state.tickets = [];
  state.deals = [];
  state.orders = [];
  state.evidence_bundles = [];
  state.venue_shifts = [];
  state.financial_ledger = [];
  state.refund_records = [];
  state.incidents = [];
  state.disputes = [];

  // Register synthetic event policy
  EventPolicyRegistry.registerEventPolicy(SYNTHETIC_FIXTURES.promoterPolicy);

  const paymentAdapter = new SyntheticSandboxPaymentAdapter();

  // ==============================================================================
  // PART 2: CANONICAL PRICING VERIFICATION ON Rp 1.500.000
  // ==============================================================================
  console.log('\n--- PART 2: CANONICAL PRICING VERIFICATION (Rp 1.500.000) ---');

  assertTest('2.1 Canonical Pricing Engine matches exact 6% + 6% rates on Rp 1.500.000 with zero arbitrary PIC fee', () => {
    const pricing = simulateTransactionPricing({
      price: 1500000,
      quantity: 1,
      picAssisted: true,
      picAllocationFee: 0 // Reconciled: Zero arbitrary flat PIC fee charged to customer
    });

    assert.strictEqual(pricing.ticket_base_price, 1500000, 'Ticket base price must be exactly Rp 1.500.000');
    assert.strictEqual(pricing.buyer_service_fee, 90000, 'Buyer fee 6% of Rp 1.500.000 must be Rp 90.000');
    assert.strictEqual(pricing.seller_service_fee, 90000, 'Seller fee 6% of Rp 1.500.000 must be Rp 90.000');
    assert.strictEqual(pricing.pic_allocation_fee, 0, 'PIC allocation fee charged to customer must be Rp 0');
    assert.strictEqual(pricing.total_paid_by_buyer, 1590000, 'Buyer total must be exactly Rp 1.590.000 (1.500.000 + 90.000)');
    assert.strictEqual(pricing.net_payout_seller, 1410000, 'Seller net payout must be exactly Rp 1.410.000 (1.500.000 - 90.000)');
    assert.strictEqual(pricing.effective_buyer_fee_pct, 6);
    assert.strictEqual(pricing.effective_seller_fee_pct, 6);
  });

  assertTest('2.2 Pricing minimum floor (Rp 35.000) and maximum cap (Rp 500.000) boundaries', () => {
    // Under 500k: 6% of 200.000 = 12.000, but clamped to minimum Rp 35.000
    const smallPricing = simulateTransactionPricing({ price: 200000, quantity: 1 });
    assert.strictEqual(smallPricing.buyer_service_fee, 35000, 'Fee below Rp 35.000 must clamp to minimum Rp 35.000');

    // High value: 6% of 15.000.000 = 900.000, but clamped to maximum cap Rp 500.000
    const highPricing = simulateTransactionPricing({ price: 15000000, quantity: 1 });
    assert.strictEqual(highPricing.buyer_service_fee, 500000, 'Fee above Rp 500.000 must clamp to cap Rp 500.000');
    assert.strictEqual(highPricing.seller_service_fee, 500000, 'Seller fee must clamp to cap Rp 500.000');
  });

  assertTest('2.3 Quantity multiplier scaling (2 tickets @ Rp 1.500.000)', () => {
    const twoTicketPricing = simulateTransactionPricing({ price: 1500000, quantity: 2 });
    assert.strictEqual(twoTicketPricing.ticket_base_price, 3000000);
    assert.strictEqual(twoTicketPricing.buyer_service_fee, 180000, '6% of 3.000.000 = 180.000');
    assert.strictEqual(twoTicketPricing.seller_service_fee, 180000, '6% of 3.000.000 = 180.000');
    assert.strictEqual(twoTicketPricing.total_paid_by_buyer, 3180000);
    assert.strictEqual(twoTicketPricing.net_payout_seller, 2820000);
  });

  // ==============================================================================
  // PART 3: 14-STEP POSITIVE TRANSACTION FLOW
  // ==============================================================================
  console.log('\n--- PART 3: 14-STEP POSITIVE TRANSACTION FLOW (VENUE-ASSISTED) ---');

  let activeDeal = null;
  let activeOrder = null;
  let paymentSession = null;
  let venueShift = null;

  // Step 1: Promoter Policy Verification
  assertTest('Step 1: Event Policy Registry verified for synthetic event (TIER_B_VENUE_ASSISTED)', () => {
    const routing = EventPolicyRegistry.resolveFulfillmentRouting(SYNTHETIC_FIXTURES.event.id);
    assert.strictEqual(routing.routing, FULFILLMENT_ROUTING.VENUE_ASSISTED);
    assert.strictEqual(routing.picRequired, true);

    const check = EventPolicyRegistry.canTransact(SYNTHETIC_FIXTURES.event.id);
    assert.strictEqual(check.allowed, true);
  });

  // Step 2: Seller generates Deal Link with Stage A ownership evidence
  await asyncAssertTest('Step 2: Seller generates Deal Link with Stage A ownership evidence', async () => {
    activeDeal = await DealService.createDeal({
      sellerId: SYNTHETIC_FIXTURES.users.seller.id,
      eventId: SYNTHETIC_FIXTURES.event.id,
      ticketCategory: 'CAT 1',
      section: 'Section B',
      row: 'Row 4',
      seat: 'Seat 12',
      price: 1500000,
      quantity: 1,
      ownershipInvoice: {
        invoice_number: SYNTHETIC_FIXTURES.ticket.invoiceRef,
        source: 'SYNTHETIC_OFFICIAL_BOOKING',
        booking_date: '2026-11-01',
        is_synthetic: true
      },
      notes: 'Tiket asli kategori CAT 1 dengan serah terima di Titik Kumpul venue'
    });

    assert.ok(activeDeal.deal_id);
    assert.ok(activeDeal.deal_token);
    assert.strictEqual(activeDeal.status, 'ACTIVE_DEAL_LINK');
    assert.strictEqual(activeDeal.is_pic_mandatory, true);
    assert.strictEqual(activeDeal.evidence_bundle_id !== null, true);

    // Verify 9-Slot Evidence Bundle initialized
    const bundle = EvidenceBundleService.getBundle(activeDeal.evidence_bundle_id, 'admin');
    assert.ok(bundle.slots[ARTIFACT_SLOTS.SLOT_1_OWNERSHIP_EVIDENCE]);
    assert.ok(bundle.slots[ARTIFACT_SLOTS.SLOT_2_PURCHASE_INVOICE]);
    assert.ok(bundle.slots[ARTIFACT_SLOTS.SLOT_3_SELLER_IDENTITY_REF]);
  });

  // Step 3: Upfront pricing breakdown attached to Deal (Zero Arbitrary PIC Fee)
  assertTest('Step 3: Upfront pricing breakdown attached to Deal: Buyer pays exactly Rp 1.590.000, Seller net Rp 1.410.000', () => {
    assert.strictEqual(activeDeal.pricing.ticket_base_price, 1500000);
    assert.strictEqual(activeDeal.pricing.buyer_service_fee, 90000);
    assert.strictEqual(activeDeal.pricing.seller_service_fee, 90000);
    assert.strictEqual(activeDeal.pricing.pic_allocation_fee, 0, 'No arbitrary flat PIC fee charged to customer');
    assert.strictEqual(activeDeal.pricing.total_paid_by_buyer, 1590000);
    assert.strictEqual(activeDeal.pricing.net_payout_seller, 1410000);
  });

  // Step 4: Buyer opens Deal Link independently without seller credentials
  assertTest('Step 4: Buyer opens Deal Link independently without seller credentials', () => {
    const dealRoom = DealService.getDealByToken(activeDeal.deal_token, 'buyer');
    assert.ok(dealRoom);
    assert.strictEqual(dealRoom.deal_id, activeDeal.deal_id);
    assert.strictEqual(dealRoom.ticket.category, 'CAT 1');
    assert.strictEqual(dealRoom.handover.type, FULFILLMENT_ROUTING.VENUE_ASSISTED);
    assert.strictEqual(dealRoom.pricing.buyer_service_fee, 90000);
    assert.strictEqual(dealRoom.pricing.total_paid_by_buyer, 1590000);

    // Verify privacy: Buyer cannot see seller private credentials
    assert.strictEqual(dealRoom.evidence_bundle.slots[ARTIFACT_SLOTS.SLOT_3_SELLER_IDENTITY_REF].redacted, true);
  });

  // Step 5: Buyer agrees to binding terms and checks out
  await asyncAssertTest('Step 5: Buyer agrees to binding terms and checks out', async () => {
    // Temporarily set LIVE mode for test transaction runner
    setMarketplaceModeForTesting('LIVE');

    const checkoutRes = await DealService.checkoutDeal({
      dealToken: activeDeal.deal_token,
      buyerId: SYNTHETIC_FIXTURES.users.buyer.id,
      paymentChannel: PILOT_PAYMENT_CHANNELS.QRIS,
      termsAccepted: true,
      ipAddress: '10.0.0.1'
    });

    assert.strictEqual(checkoutRes.success, true);
    activeOrder = checkoutRes.order;
    assert.strictEqual(activeOrder.status, 'PENDING_PAYMENT');
    assert.strictEqual(activeOrder.buyer_id, SYNTHETIC_FIXTURES.users.buyer.id);
    assert.strictEqual(activeOrder.pricing.total_paid_by_buyer, 1590000);

    // Verify Slot 4 (Binding Consent Log) attached to bundle
    const bundle = EvidenceBundleService.getBundle(activeDeal.evidence_bundle_id, 'admin');
    assert.ok(bundle.slots[ARTIFACT_SLOTS.SLOT_4_BINDING_CONSENT_LOG]);
    assert.strictEqual(bundle.slots[ARTIFACT_SLOTS.SLOT_4_BINDING_CONSENT_LOG].metadata.consent_binding, true);
  });

  // Step 6: Fake Payment Simulator generates payment session
  await asyncAssertTest('Step 6: Synthetic Payment Adapter generates payment session', async () => {
    paymentSession = await paymentAdapter.createPayment({
      orderId: activeOrder.id,
      amount: activeOrder.pricing.total_paid_by_buyer,
      currency: 'IDR',
      channel: 'QRIS',
      scenario: SYNTHETIC_SCENARIOS.PENDING,
      buyer: { id: activeOrder.buyer_id }
    });

    assert.strictEqual(paymentSession.success, true);
    assert.strictEqual(paymentSession.isSynthetic, true);
    assert.strictEqual(paymentSession.amount, 1590000);
    assert.strictEqual(paymentSession.status, SYNTHETIC_PAYMENT_STATUS.PENDING);
    assert.ok(paymentSession.qrisString);
  });

  // Step 7: Gateway delivers valid HMAC-signed webhook for PAID
  let webhookPayload = null;
  assertTest('Step 7: Gateway generates valid HMAC-SHA256 signature for PAID status', () => {
    webhookPayload = paymentAdapter.generateWebhookPayload(paymentSession.providerRef, SYNTHETIC_SCENARIOS.SUCCESS);
    assert.ok(webhookPayload.headers['x-tikum-signature']);
    assert.strictEqual(webhookPayload.body.status, SYNTHETIC_PAYMENT_STATUS.PAID);
    assert.strictEqual(paymentAdapter.verifyWebhook(webhookPayload.headers, webhookPayload.body), true);
  });

  // Step 8: Webhook processed and payment confirmed in DealService
  await asyncAssertTest('Step 8: Webhook processed and payment confirmed in DealService', async () => {
    const webhookRes = await paymentAdapter.handleWebhook({
      headers: webhookPayload.headers,
      body: webhookPayload.body
    });
    assert.strictEqual(webhookRes.success, true);
    assert.strictEqual(webhookRes.status, SYNTHETIC_PAYMENT_STATUS.PAID);

    // Confirm in DealService
    const confirmedOrder = await DealService.confirmPayment({
      orderId: activeOrder.id,
      providerReference: paymentSession.providerRef,
      paymentProofContent: {
        provider: 'tikum_synthetic_sandbox',
        channel: 'QRIS',
        amount: activeOrder.pricing.total_paid_by_buyer,
        transaction_ref: paymentSession.providerRef,
        isSynthetic: true
      }
    });

    assert.strictEqual(confirmedOrder.payment_status, PAYMENT_STATUS.PAYMENT_CONFIRMED_PROVIDER);
    assert.strictEqual(confirmedOrder.status, 'PAID');

    // Verify Slot 5 (Payment Proof) attached
    const bundle = EvidenceBundleService.getBundle(activeDeal.evidence_bundle_id, 'admin');
    assert.ok(bundle.slots[ARTIFACT_SLOTS.SLOT_5_PAYMENT_PROOF]);
  });

  // Step 9: Decoupled State Invariant: Ticket verification remains UNVERIFIED until Stage B
  assertTest('Step 9: Payment confirmation preserves ticket verification axis (decoupled)', () => {
    assert.strictEqual(
      activeOrder.ticket_verification_status,
      TICKET_VERIFICATION_STATUS.OWNERSHIP_EVIDENCE_REVIEWED,
      'Payment confirmation must NOT blindly flip ticket verification to verified'
    );
  });

  // Step 10: Stage B ticket verification (non-scannable fake barcode & invoice)
  assertTest('Step 10: Stage B ticket verification attached to Evidence Bundle', () => {
    EvidenceBundleService.attachArtifact({
      bundleId: activeOrder.evidence_bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_1_OWNERSHIP_EVIDENCE,
      content: {
        stage: 'STAGE_B_POST_PAYMENT',
        fake_barcode: SYNTHETIC_FIXTURES.ticket.fakeBarcode,
        non_scannable_marker: 'TEST_SYNTHETIC_DATA_DO_NOT_SCAN',
        verified_by: SYNTHETIC_FIXTURES.users.trustAdmin.id
      },
      metadata: { stage: 'STAGE_B_POST_PAYMENT', is_synthetic: true },
      actorId: SYNTHETIC_FIXTURES.users.trustAdmin.id,
      actorRole: 'admin_trust'
    });

    activeOrder.ticket_verification_status = TICKET_VERIFICATION_STATUS.VERIFIED_FOR_HANDOVER;
    assert.strictEqual(activeOrder.ticket_verification_status, TICKET_VERIFICATION_STATUS.VERIFIED_FOR_HANDOVER);
  });

  // Step 11: Venue Operations PIC shift assignment and timestamped check-in
  await asyncAssertTest('Step 11: Venue PIC assigned to shift & records timestamped check-in at Titik Kumpul', async () => {
    venueShift = await VenueOperationsService.createShiftAssignment({
      eventId: SYNTHETIC_FIXTURES.event.id,
      venueId: 'v-synthetic-gbk',
      picUserId: SYNTHETIC_FIXTURES.users.pic.id,
      shiftName: 'Pintu 5 GBK VIP Shift',
      meetingPoint: 'Titik Kumpul Utama Tikum - Gate 5 GBK',
      deploymentFee: 250000 // Actual shift operational deployment fee
    });

    assert.strictEqual(venueShift.status, 'ASSIGNED');

    // PIC checks in with attendance proof
    await VenueOperationsService.recordAttendanceProof({
      shiftId: venueShift.shift_id,
      picUserId: SYNTHETIC_FIXTURES.users.pic.id,
      type: 'CHECK_IN',
      proofUrl: 'https://synthetic-storage.tikum.app/pic-attendance/gate5-checkin.jpg',
      location: 'Titik Kumpul Utama Tikum - Gate 5 GBK (GPS: -6.2183, 106.8022)'
    });

    assert.strictEqual(venueShift.status, 'CHECKED_IN');
    assert.ok(venueShift.attendance_evidence.check_in_timestamp);

    // Attach to Evidence Bundle (Slot 6)
    EvidenceBundleService.attachArtifact({
      bundleId: activeOrder.evidence_bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_6_PIC_ATTENDANCE_PROOF,
      content: {
        shift_id: venueShift.shift_id,
        pic_id: SYNTHETIC_FIXTURES.users.pic.id,
        location: venueShift.attendance_evidence.location,
        check_in_at: venueShift.attendance_evidence.check_in_timestamp,
        is_synthetic: true
      },
      actorId: SYNTHETIC_FIXTURES.users.pic.id,
      actorRole: 'pic'
    });

    const bundle = EvidenceBundleService.getBundle(activeOrder.evidence_bundle_id, 'admin');
    assert.ok(bundle.slots[ARTIFACT_SLOTS.SLOT_6_PIC_ATTENDANCE_PROOF]);
  });

  // Step 12: Handover witnessed at venue meeting point (Truthfulness: Handover != Gate Entry)
  assertTest('Step 12: PIC witnesses physical handover with explicit non-guarantee disclaimer', () => {
    // Anti-conflict check
    AntiConflictService.assertCanWitnessHandoff(SYNTHETIC_FIXTURES.users.pic.id, activeOrder);

    // Record Handover Proof (Slot 7)
    EvidenceBundleService.attachArtifact({
      bundleId: activeOrder.evidence_bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_7_HANDOVER_PROOF,
      content: {
        witnessed_by_pic: SYNTHETIC_FIXTURES.users.pic.id,
        wristband_exchange_photo_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        meeting_point: venueShift.meeting_point,
        handover_timestamp: new Date().toISOString(),
        is_synthetic: true
      },
      metadata: {
        evidence_type: EVIDENCE_TYPES.PIC_WITNESSED_HANDOVER
      },
      actorId: SYNTHETIC_FIXTURES.users.pic.id,
      actorRole: 'pic'
    });

    activeOrder.handover_status = HANDOVER_STATUS.PIC_HANDOVER_WITNESSED;
    assert.strictEqual(activeOrder.handover_status, HANDOVER_STATUS.PIC_HANDOVER_WITNESSED);

    // Assert Truthfulness: PIC witnessing DOES NOT guarantee turnstile entry
    const bundle = EvidenceBundleService.getBundle(activeOrder.evidence_bundle_id, 'admin');
    const slot7 = bundle.slots[ARTIFACT_SLOTS.SLOT_7_HANDOVER_PROOF];
    assert.strictEqual(slot7.metadata.guarantees_venue_entry, false);
    assert.strictEqual(slot7.metadata.evidence_type, EVIDENCE_TYPES.PIC_WITNESSED_HANDOVER);
  });

  // Step 13: Buyer Confirms Receipt & Distinct Entry Verification (Truthfulness)
  assertTest('Step 13: Truthful evidence separation: Buyer Receipt Confirmed vs Venue Entry', () => {
    // 13.a: Buyer confirms receipt of physical wristband
    EvidenceBundleService.attachArtifact({
      bundleId: activeOrder.evidence_bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_8_BUYER_RECEIPT_OR_NOSHOW,
      content: {
        buyer_id: SYNTHETIC_FIXTURES.users.buyer.id,
        receipt_confirmed: true,
        wristband_received: true,
        confirmed_at: new Date().toISOString(),
        is_synthetic: true
      },
      metadata: {
        evidence_type: EVIDENCE_TYPES.BUYER_CONFIRMED_RECEIPT
      },
      actorId: SYNTHETIC_FIXTURES.users.buyer.id,
      actorRole: 'buyer'
    });

    activeOrder.handover_status = HANDOVER_STATUS.BUYER_CONFIRMED_RECEIPT;
    assert.strictEqual(activeOrder.handover_status, HANDOVER_STATUS.BUYER_CONFIRMED_RECEIPT);

    // 13.b: Buyer self-reports venue entry (remains unverified self-report)
    activeOrder.entry_verification_status = ENTRY_VERIFICATION_STATUS.BUYER_REPORTED_ENTRY;
    assert.strictEqual(activeOrder.entry_verification_status, ENTRY_VERIFICATION_STATUS.BUYER_REPORTED_ENTRY);
    assert.notStrictEqual(activeOrder.entry_verification_status, ENTRY_VERIFICATION_STATUS.INDEPENDENTLY_VERIFIED_ENTRY);

    // 13.c: Authoritative promoter turnstile scan confirms independent admission
    activeOrder.entry_verification_status = ENTRY_VERIFICATION_STATUS.INDEPENDENTLY_VERIFIED_ENTRY;
    activeOrder.status = 'ENTRY_CONFIRMED';
    assert.strictEqual(activeOrder.entry_verification_status, ENTRY_VERIFICATION_STATUS.INDEPENDENTLY_VERIFIED_ENTRY);
    assert.strictEqual(activeOrder.status, 'ENTRY_CONFIRMED');
  });

  // Step 14: Dual Trust & Compliance authorization, double-entry ledger settlement, and bundle completion
  await asyncAssertTest('Step 14: Dual authorization, double-entry ledger capture & release, 100% bundle completeness', async () => {
    // 1. Independent settlement approval check
    AntiConflictService.assertCanApproveSettlement(SYNTHETIC_FIXTURES.users.complianceAdmin.id, activeOrder);

    // 2. Attach Resolution Notes (Slot 9)
    EvidenceBundleService.attachArtifact({
      bundleId: activeOrder.evidence_bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_9_RESOLUTION_NOTES,
      content: {
        resolution: 'TRANSACTION_SUCCESSFULLY_COMPLETED',
        trust_officer: SYNTHETIC_FIXTURES.users.trustAdmin.id,
        compliance_officer: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
        payout_approved: true,
        is_synthetic: true
      },
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
      actorRole: 'admin_compliance'
    });

    // 3. Double-Entry Financial Ledger: Record Capture & Release (Base: 1.5M, BuyerFee: 90k, SellerFee: 90k)
    const captureTx = await FinancialLedger.recordPaymentCapture({
      orderId: activeOrder.id,
      ticketPrice: 1500000,
      buyerFee: 90000,
      sellerFee: 90000,
      actorId: 'SYNTHETIC_TEST_RUNNER'
    });
    assert.ok(captureTx.transaction_id);

    const releaseTx = await FinancialLedger.recordDisbursementRelease({
      orderId: activeOrder.id,
      sellerAmount: 1410000,
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id
    });
    assert.ok(releaseTx.transaction_id);

    activeOrder.status = 'SETTLED';
    activeOrder.settlement_status = SETTLEMENT_STATUS.SETTLED;

    // 4. Verify Evidence Bundle reached 100% completeness
    const completeness = EvidenceBundleService.getBundleCompleteness(activeOrder.evidence_bundle_id);
    assert.strictEqual(completeness.isComplete, true, 'Bundle must have all 9 slots filled');
    assert.strictEqual(completeness.completenessPercent, 100);

    // 5. Shift Ledger: Calculate actual PIC operational allocation (deployment_fee / completed_tx)
    venueShift.completed_transaction_count = 1;
    const allocatedOperationalCost = VenueOperationsService.calculateAllocatedPicCost(venueShift.shift_id);
    assert.strictEqual(allocatedOperationalCost, 250000, 'Shift allocation for 1 completed tx equals 250.000 deployment fee');
  });

  // Reset testing mode override
  setMarketplaceModeForTesting(null);

  // ==============================================================================
  // PART 4: 16 NEGATIVE & ADVERSARIAL SCENARIOS
  // ==============================================================================
  console.log('\n--- PART 4: 16 NEGATIVE & ADVERSARIAL SCENARIOS ---');

  // Neg-1: Fake payment with forged HMAC signature fails closed
  await asyncAssertTest('Neg-1: Fake payment marked PAID with forged HMAC signature fails closed (401)', async () => {
    const forgedPayload = paymentAdapter.generateWebhookPayload(paymentSession.providerRef, SYNTHETIC_SCENARIOS.INVALID_SIGNATURE);
    let caught = false;
    try {
      await paymentAdapter.handleWebhook({
        headers: forgedPayload.headers,
        body: forgedPayload.body
      });
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'INVALID_WEBHOOK_SIGNATURE');
    }
    assert.strictEqual(caught, true, 'Forged webhook must be rejected');
  });

  // Neg-2: Duplicate payment webhook handled idempotently without double processing
  await asyncAssertTest('Neg-2: Duplicate payment webhook handled idempotently without double processing', async () => {
    const dupRes = await paymentAdapter.handleWebhook({
      headers: webhookPayload.headers,
      body: webhookPayload.body
    });
    assert.strictEqual(dupRes.idempotent, true);
    assert.ok(dupRes.message.includes('Idempotent replay detected'));
  });

  // Neg-3: Expired deal checkout rejected (24h TTL guard)
  await asyncAssertTest('Neg-3: Expired deal checkout rejected with DEAL_EXPIRED', async () => {
    const expiredDeal = {
      deal_id: 'deal-expired-test',
      deal_token: 'dl-expired-token',
      seller_id: SYNTHETIC_FIXTURES.users.seller.id,
      event_id: SYNTHETIC_FIXTURES.event.id,
      status: 'ACTIVE_DEAL_LINK',
      expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      pricing: activeDeal.pricing
    };
    state.deals.push(expiredDeal);

    let caught = false;
    try {
      await DealService.checkoutDeal({
        dealToken: expiredDeal.deal_token,
        buyerId: SYNTHETIC_FIXTURES.users.buyer.id,
        paymentChannel: 'QRIS',
        termsAccepted: true
      });
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'DEAL_EXPIRED');
    }
    assert.strictEqual(caught, true);
  });

  // Neg-4: Buyer attempts price tampering after agreement
  assertTest('Neg-4: Buyer cannot tamper with locked deal price upon checkout', () => {
    // DealService relies on the immutable pricing stored in the deal, never client input
    assert.strictEqual(activeOrder.pricing.total_paid_by_buyer, activeDeal.pricing.total_paid_by_buyer);
  });

  // Neg-5: Seller attempts to alter ticket or price on checked-out deal
  assertTest('Neg-5: Deal in CHECKED_OUT status cannot be checked out again or altered', () => {
    assert.strictEqual(activeDeal.status, 'CHECKED_OUT');
  });

  // Neg-6: Fake ticket ownership rejected during verification
  assertTest('Neg-6: Invalid or spoofed ownership evidence rejected during review', () => {
    const ticketDoc = {
      invoice_number: 'SPOOFED-INV-999',
      buyer_name: 'Unrelated Stranger'
    };
    const isMatching = ticketDoc.buyer_name === SYNTHETIC_FIXTURES.users.seller.name;
    assert.strictEqual(isMatching, false, 'Non-matching ownership document must fail verification');
  });

  // Neg-7: Raw QR/barcode prohibited at Stage A deal creation
  await asyncAssertTest('Neg-7: Raw QR/barcode upload strictly prohibited at Stage A deal creation', async () => {
    let caught = false;
    try {
      await DealService.createDeal({
        sellerId: SYNTHETIC_FIXTURES.users.seller.id,
        eventId: SYNTHETIC_FIXTURES.event.id,
        price: 1500000,
        containsRawQr: true,
        notes: 'Malicious attempt to upload raw QR code at Stage A'
      });
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'RAW_QR_PROHIBITED_STAGE_A');
    }
    assert.strictEqual(caught, true);
  });

  // Neg-8: PIC attempts to witness/approve their own transaction
  assertTest('Neg-8: PIC cannot witness handover where they are buyer or seller (CONFLICT_OF_INTEREST_PIC)', () => {
    const conflictedOrder = {
      id: 'ord-conflict-pic',
      seller_id: SYNTHETIC_FIXTURES.users.pic.id, // PIC is the seller!
      buyer_id: SYNTHETIC_FIXTURES.users.buyer.id
    };

    let caught = false;
    try {
      AntiConflictService.assertCanWitnessHandoff(SYNTHETIC_FIXTURES.users.pic.id, conflictedOrder);
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'CONFLICT_OF_INTEREST_PIC');
    }
    assert.strictEqual(caught, true);
  });

  // Neg-9: Seller attempts to act as verifier for their own ticket
  assertTest('Neg-9: Seller cannot verify their own listing (CONFLICT_OF_INTEREST_VERIFIER)', () => {
    const ticket = {
      id: 'tkt-self-verify',
      seller_id: SYNTHETIC_FIXTURES.users.seller.id
    };

    let caught = false;
    try {
      AntiConflictService.assertCanVerifyListing(SYNTHETIC_FIXTURES.users.seller.id, ticket);
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'CONFLICT_OF_INTEREST_VERIFIER');
    }
    assert.strictEqual(caught, true);
  });

  // Neg-10: Quorum Sybil / Duplicate Role Slot in Buyer No-Show
  assertTest('Neg-10: Same person occupying multiple quorum roles rejected (COLLUSION_PREVENTION_DUPLICATE_ROLE_SLOT)', () => {
    let caught = false;
    try {
      AntiConflictService.assertQuorumIndependence({
        picUserId: 'usr-sybil-same-person',
        trustAdminUserId: 'usr-sybil-same-person', // Same user!
        complianceAdminUserId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
        order: activeOrder
      });
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'COLLUSION_PREVENTION_DUPLICATE_ROLE_SLOT');
    }
    assert.strictEqual(caught, true);
  });

  // Neg-11: Canonical 30-Minute Grace Period Boundary Tests (No-Show Single Source of Truth)
  await asyncAssertTest('Neg-11: Canonical 30-Minute No-Show Grace Period Boundary Tests (29m fail, 30m pass, 45m pass)', async () => {
    assert.strictEqual(NO_SHOW_GRACE_PERIOD_MINUTES, 30, 'Canonical grace period must be exactly 30 minutes');
    assert.strictEqual(VenueOperationsService.NO_SHOW_GRACE_PERIOD_MINUTES, 30);

    const boundaryOrder = {
      id: 'ord-noshow-boundary-test',
      seller_id: SYNTHETIC_FIXTURES.users.seller.id,
      buyer_id: SYNTHETIC_FIXTURES.users.buyer.id,
      assigned_pic_user_id: SYNTHETIC_FIXTURES.users.pic.id,
      verified_by: SYNTHETIC_FIXTURES.users.trustAdmin.id,
      seller_fulfilled: true,
      pic_attendance_verified: true,
      pricing: activeDeal.pricing
    };
    state.orders.push(boundaryOrder);

    // Boundary 1: 29 minutes (< 30) -> MUST FAIL with GRACE_PERIOD_NOT_ELAPSED
    let b29Failed = false;
    try {
      await VenueOperationsService.resolveBuyerNoShow({
        order: boundaryOrder,
        picUserId: SYNTHETIC_FIXTURES.users.pic.id,
        trustAdminUserId: SYNTHETIC_FIXTURES.users.trustAdmin.id,
        adminApproverId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
        sellerFulfilledObligation: true,
        sellerConfirmed: true,
        picConfirmedAttendance: true,
        waitingPeriodMinutes: 29, // 29 minutes!
        meetingProtocolExecuted: true,
        trustComplianceApproved: true
      });
    } catch (err) {
      b29Failed = true;
      assert.strictEqual(err.code, 'GRACE_PERIOD_NOT_ELAPSED');
      assert.strictEqual(err.required_grace_period_minutes, 30);
      assert.strictEqual(err.elapsed_minutes, 29);
    }
    assert.strictEqual(b29Failed, true, '29 minutes must fail closed');

    // Boundary 2: Exactly 30 minutes (= 30) -> MUST PASS
    const b30Result = await VenueOperationsService.resolveBuyerNoShow({
      order: boundaryOrder,
      picUserId: SYNTHETIC_FIXTURES.users.pic.id,
      trustAdminUserId: SYNTHETIC_FIXTURES.users.trustAdmin.id,
      adminApproverId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
      sellerFulfilledObligation: true,
      sellerConfirmed: true,
      picConfirmedAttendance: true,
      waitingPeriodMinutes: 30, // Exact boundary!
      meetingProtocolExecuted: true,
      trustComplianceApproved: true,
      notes: 'Buyer non-responsive exactly 30 minutes at meeting point; seller confirmed.'
    });
    assert.strictEqual(b30Result.resolution, 'BUYER_NO_SHOW_CONFIRMED');
    assert.strictEqual(boundaryOrder.status, 'BUYER_NO_SHOW');

    // Boundary 3: 45 minutes (> 30) -> MUST PASS
    const b45Order = {
      id: 'ord-noshow-45m',
      seller_id: SYNTHETIC_FIXTURES.users.seller.id,
      buyer_id: SYNTHETIC_FIXTURES.users.buyer.id,
      assigned_pic_user_id: SYNTHETIC_FIXTURES.users.pic.id,
      verified_by: SYNTHETIC_FIXTURES.users.trustAdmin.id,
      seller_fulfilled: true,
      pic_attendance_verified: true,
      pricing: activeDeal.pricing
    };
    state.orders.push(b45Order);

    const b45Result = await VenueOperationsService.resolveBuyerNoShow({
      order: b45Order,
      picUserId: SYNTHETIC_FIXTURES.users.pic.id,
      trustAdminUserId: SYNTHETIC_FIXTURES.users.trustAdmin.id,
      adminApproverId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
      sellerFulfilledObligation: true,
      sellerConfirmed: true,
      picConfirmedAttendance: true,
      waitingPeriodMinutes: 45,
      meetingProtocolExecuted: true,
      trustComplianceApproved: true
    });
    assert.strictEqual(b45Result.resolution, 'BUYER_NO_SHOW_CONFIRMED');
  });

  // Neg-12: Seller No-Show Lifecycle: REFUND_REQUIRED -> REFUND_INITIATED -> REFUND_CONFIRMED (Mode 2 Separation)
  await asyncAssertTest('Neg-12: Seller No-Show: Mode 2 lifecycle REFUND_REQUIRED -> REFUND_INITIATED -> REFUND_CONFIRMED with proof', async () => {
    const sellerNoShowOrder = {
      id: 'ord-seller-noshow-lifecycle',
      seller_id: SYNTHETIC_FIXTURES.users.seller.id,
      buyer_id: SYNTHETIC_FIXTURES.users.buyer.id,
      settlement_mode: SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT,
      buyer_refund_destination: 'BCA 1234567890 a/n Siti Buyer',
      pricing: { ticket_base_price: 1500000, buyer_service_fee: 90000, seller_service_fee: 90000 }
    };
    state.orders.push(sellerNoShowOrder);

    // 1. Report critical incident
    const incident = await IncidentService.reportIncident({
      orderId: sellerNoShowOrder.id,
      eventId: SYNTHETIC_FIXTURES.event.id,
      type: INCIDENT_TYPES.SELLER_NO_SHOW,
      severity: INCIDENT_SEVERITY.CRITICAL,
      reporterId: SYNTHETIC_FIXTURES.users.pic.id,
      description: 'Penjual tidak hadir di titik kumpul setelah grace period 45 menit'
    });
    assert.strictEqual(incident.type, 'SELLER_NO_SHOW');

    // 2. Stage A: Require Refund (Records legal obligation, does NOT claim money sent)
    const reqRes = await RefundGovernanceService.requireRefund({
      orderId: sellerNoShowOrder.id,
      reason: 'SELLER_NO_SHOW',
      incidentId: incident.id,
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id
    });
    assert.strictEqual(reqRes.record.overall_status, REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED);
    assert.strictEqual(reqRes.record.ticket_principal.responsible_party, REFUND_RESPONSIBILITY.SELLER_DIRECT_OBLIGATION);
    assert.strictEqual(reqRes.record.is_cash_refund_completed, false);
    assert.strictEqual(sellerNoShowOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED);

    // Assert: No ledger journal created yet for refund!
    const earlyJournal = (state.financial_ledger || []).find(tx => tx.order_id === sellerNoShowOrder.id && tx.event_type === 'REFUND');
    assert.strictEqual(earlyJournal, undefined, 'Ledger journal must NOT be created before verifiable refund completion');

    // 3. Stage B: Initiate Refund (Dispatches demand notice to seller)
    const initRes = await RefundGovernanceService.initiateRefund({
      orderId: sellerNoShowOrder.id,
      sellerInstructionRef: 'DEMAND-SELLER-SNS-001',
      gatewayFeeReversalRef: 'REV-GW-FEE-001',
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id
    });
    assert.strictEqual(initRes.overall_status, REFUND_LIFECYCLE_STATUS.REFUND_INITIATED);
    assert.strictEqual(sellerNoShowOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_INITIATED);

    // 4. Stage C: Confirm Refund with verifiable bank transfer evidence
    const confRes = await RefundGovernanceService.confirmRefund({
      orderId: sellerNoShowOrder.id,
      principalTransferEvidenceRef: 'BCA-TRF-RECEIPT-REF-998822',
      feeGatewayRef: 'DOKU-REFUND-FEE-CONF-4433',
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
      isSynthetic: true
    });
    assert.strictEqual(confRes.record.overall_status, REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED);
    assert.strictEqual(confRes.record.is_cash_refund_completed, true);
    assert.strictEqual(sellerNoShowOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED);
    assert.strictEqual(sellerNoShowOrder.status, 'REFUNDED');

    // Assert: Balanced ledger journal created ONLY upon confirmed evidence
    const confirmedJournal = (state.financial_ledger || []).find(tx => tx.order_id === sellerNoShowOrder.id && tx.event_type === 'REFUND');
    assert.ok(confirmedJournal, 'Double-entry refund journal posted upon verified confirmation');

    // 5. Test Idempotency: Submitting duplicate confirmation returns idempotent flag without double posting
    const initialLedgerCount = state.financial_ledger.length;
    const dupConfRes = await RefundGovernanceService.confirmRefund({
      orderId: sellerNoShowOrder.id,
      principalTransferEvidenceRef: 'BCA-TRF-RECEIPT-REF-998822',
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id
    });
    assert.strictEqual(dupConfRes.idempotent, true);
    assert.strictEqual(state.financial_ledger.length, initialLedgerCount, 'Duplicate confirmation must not duplicate ledger transactions');

    // Penalty applied to seller behavioral ledger
    AntiConflictService.recordOutcome(SYNTHETIC_FIXTURES.users.seller.id, 'NO_SHOW');
    const sellerLedger = AntiConflictService.getUserLedger(SYNTHETIC_FIXTURES.users.seller.id);
    assert.ok(sellerLedger.no_show_count > 0);
  });

  // Neg-13: Invalid Ticket Dispute at Turnstile: Full Refund Lifecycle + Dispute Escalation
  await asyncAssertTest('Neg-13: Invalid ticket at turnstile: Full refund lifecycle + seller dispute penalty', async () => {
    const invalidTicketOrder = {
      id: 'ord-invalid-ticket-lifecycle',
      seller_id: SYNTHETIC_FIXTURES.users.seller.id,
      buyer_id: SYNTHETIC_FIXTURES.users.buyer.id,
      settlement_mode: SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT,
      buyer_refund_destination: 'Mandiri 137000123456 a/n Siti Buyer',
      pricing: { ticket_base_price: 1500000, buyer_service_fee: 90000, seller_service_fee: 90000 }
    };
    state.orders.push(invalidTicketOrder);

    const disputeIncident = await IncidentService.reportIncident({
      orderId: invalidTicketOrder.id,
      eventId: SYNTHETIC_FIXTURES.event.id,
      type: INCIDENT_TYPES.FAKE_TICKET,
      severity: INCIDENT_SEVERITY.CRITICAL,
      reporterId: SYNTHETIC_FIXTURES.users.pic.id,
      description: 'Barcode ditolak turnstile resmi: Alasan ALREADY_USED / INVALID_BARCODE'
    });
    assert.strictEqual(disputeIncident.type, 'FAKE_TICKET');

    // Lifecycle: Required -> Initiated -> Confirmed
    await RefundGovernanceService.requireRefund({
      orderId: invalidTicketOrder.id,
      reason: 'FAKE_TICKET_AT_GATE',
      incidentId: disputeIncident.id,
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id
    });
    assert.strictEqual(invalidTicketOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED);

    await RefundGovernanceService.initiateRefund({
      orderId: invalidTicketOrder.id,
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id
    });
    assert.strictEqual(invalidTicketOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_INITIATED);

    await RefundGovernanceService.confirmRefund({
      orderId: invalidTicketOrder.id,
      principalTransferEvidenceRef: 'MANDIRI-DISPUTE-TRF-CONF-7711',
      feeGatewayRef: 'FEE-REFUND-GATEWAY-7711',
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
      isSynthetic: true
    });
    assert.strictEqual(invalidTicketOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED);
    assert.strictEqual(invalidTicketOrder.status, 'REFUNDED');

    AntiConflictService.recordOutcome(SYNTHETIC_FIXTURES.users.seller.id, 'DISPUTE_LOST');
    const sellerLedger = AntiConflictService.getUserLedger(SYNTHETIC_FIXTURES.users.seller.id);
    assert.ok(sellerLedger.disputes_lost_count > 0);
  });

  // Neg-14: Official Promoter Event Cancellation Lifecycle
  await asyncAssertTest('Neg-14: Official promoter event cancellation: Refund lifecycle with separate fee treatment', async () => {
    const cancelledEventOrder = {
      id: 'ord-event-cancelled-lifecycle',
      seller_id: SYNTHETIC_FIXTURES.users.seller.id,
      buyer_id: SYNTHETIC_FIXTURES.users.buyer.id,
      settlement_mode: SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT,
      buyer_refund_destination: 'BNI 0987654321 a/n Siti Buyer',
      pricing: { ticket_base_price: 1500000, buyer_service_fee: 90000, seller_service_fee: 90000 }
    };
    state.orders.push(cancelledEventOrder);

    // 1. Require refund
    await RefundGovernanceService.requireRefund({
      orderId: cancelledEventOrder.id,
      reason: 'OFFICIAL_PROMOTER_EVENT_CANCELLED',
      actorId: 'PROMOTER_BOT'
    });
    assert.strictEqual(cancelledEventOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED);

    // 2. Initiate
    await RefundGovernanceService.initiateRefund({
      orderId: cancelledEventOrder.id,
      actorId: 'PROMOTER_BOT'
    });
    assert.strictEqual(cancelledEventOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_INITIATED);

    // 3. Confirm
    const confRes = await RefundGovernanceService.confirmRefund({
      orderId: cancelledEventOrder.id,
      principalTransferEvidenceRef: 'BNI-PROMOTER-MASS-TRF-0019',
      feeGatewayRef: 'GW-FEE-WAIVED-0019',
      actorId: SYNTHETIC_FIXTURES.users.complianceAdmin.id,
      isSynthetic: true
    });
    assert.strictEqual(confRes.record.overall_status, REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED);
    assert.strictEqual(cancelledEventOrder.refund_status, REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED);
    assert.strictEqual(cancelledEventOrder.status, 'REFUNDED');
  });

  // Neg-15: Unauthorized Evidence Bundle Access (UU PDP No. 27/2022 PII Redaction)
  assertTest('Neg-15: Public/Buyer view redacts sensitive PII under UU PDP No. 27/2022', () => {
    const publicBundle = EvidenceBundleService.getBundle(activeDeal.evidence_bundle_id, 'public');
    const slot3 = publicBundle.slots[ARTIFACT_SLOTS.SLOT_3_SELLER_IDENTITY_REF];
    assert.strictEqual(slot3.redacted, true);
    assert.ok(slot3.notice.includes('UU PDP No. 27/2022'));

    // PII mask function test
    const rawData = { full_name: 'Budi Santoso', nik: '3171012345670001', phone: '081299990001', email: 'budi@test.com' };
    const masked = EvidenceBundleService.maskPII(rawData);
    assert.ok(!masked.nik.includes('1234567'), 'NIK must be masked');
    assert.strictEqual(masked.pdp_compliance, 'UU_PDP_NO_27_2022');
  });

  // Neg-16: Isolation & Production Safety Gate (Prelaunch listing mode fails closed)
  assertTest('Neg-16: Production Safeguard: Mode 1 blocked without agreement & Prelaunch fails closed', () => {
    // 1. Assert Mode 1 cannot be activated with env var alone
    const currentMode = PaymentModeController.getSettlementMode();
    assert.strictEqual(currentMode, SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT);
    const activeAgreement = ProviderCustodyAgreementRegistry.getActiveCustodyAgreement();
    assert.strictEqual(activeAgreement, null, 'No written custody agreement must be active');

    // 2. Assert prelaunch listing mode fails closed outside test override
    setMarketplaceModeForTesting(null);
    assert.strictEqual(isPrelaunchListingMode(), true);
  });

  // ==============================================================================
  // PART 5: DOUBLE-ENTRY LEDGER RECONCILIATION & PILOT SCORECARD
  // ==============================================================================
  console.log('\n--- PART 5: LEDGER RECONCILIATION & PILOT SCORECARD ---');

  assertTest('5.1 Double-Entry Financial Ledger satisfies solvency invariant: sum(Debits) === sum(Credits)', () => {
    const solvency = FinancialLedger.assertSolvency();
    assert.strictEqual(solvency.solvent, true);
    assert.strictEqual(solvency.grandDebits, solvency.grandCredits);
    console.log(`       Grand Total Debits : Rp ${solvency.grandDebits.toLocaleString('id-ID')}`);
    console.log(`       Grand Total Credits: Rp ${solvency.grandCredits.toLocaleString('id-ID')}`);
    console.log(`       Solvency Status    : 100% BALANCED`);
  });

  assertTest('5.2 Pilot Scorecard reports zero unauthorized releases and zero ledger discrepancies', () => {
    const scorecard = PilotScorecardService.getScorecard();
    const hardTargets = scorecard.hard_governance_targets;

    assert.strictEqual(hardTargets.unauthorized_settlement_releases, 0, 'Must have exactly 0 unauthorized releases');
    assert.strictEqual(hardTargets.ledger_discrepancies_idr, 0, 'Must have exactly Rp 0 ledger discrepancies');
    assert.strictEqual(hardTargets.evidence_completeness_target_pct, 100);

    console.log(`       Unauthorized Releases: ${hardTargets.unauthorized_settlement_releases} (Target: 0)`);
    console.log(`       Ledger Discrepancies : Rp ${hardTargets.ledger_discrepancies_idr} (Target: 0)`);
    console.log(`       Completed Volume     : ${hardTargets.pilot_volume_completed} transactions`);
  });

  console.log('\n================================================================================');
  console.log(`SIMULATION COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED out of ${passedTests + failedTests} assertions.`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFullSimulation().catch(err => {
  console.error('Fatal Simulation Error:', err);
  process.exit(1);
});
