/**
 * TIKUM / ARGUS — P0.4 COMMERCIAL PILOT ACTIVATION READINESS SUITE
 * 
 * Verifies:
 * 1. Partner outreach pack generation and authority verification checklist.
 * 2. Written consignment agreement specification, defect liability, and document hashing.
 * 3. Operational PIC duty authorization, public concourse perimeter, and turnstile escort protocols.
 * 4. End-to-end zero-real-money simulation with contract-backed pricing and liability refund.
 * 5. Multi-criteria GO/NO-GO evaluation engine (SIMULATION_READY vs PILOT_READY vs BLOCKED).
 * 
 * ZERO REAL MONEY: All operations run in simulation mode with fail-closed locks.
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const crypto = require('crypto');
const { state, resetDatabase } = require('./src/database');
const {
  PartnerValidationService,
  PARTNER_TYPES,
  PARTNER_STATUS,
  INVENTORY_STATUS
} = require('./src/partner/PartnerValidationService');
const {
  CommercialPilotActivationService,
  AGREEMENT_STATUS,
  DUTY_STATUS,
  PILOT_VERDICT
} = require('./src/partner/CommercialPilotActivationService');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { VenueOperationsService } = require('./src/venue/VenueOperationsService');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY } = require('./src/venue/IncidentService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('./src/services/disputeService');
const { SettlementService } = require('./src/services/settlementService');
const { ReservationService, RESERVATION_STATUS } = require('./src/services/marketplace/ReservationService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ [PASS]', name);
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL]', name, '->', e.message);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  ✓ [PASS]', name);
    passed++;
  } catch (e) {
    console.error('  ✗ [FAIL]', name, '->', e.message);
    failed++;
  }
}

async function runCommercialPilotActivationTests() {
  console.log('\n================================================================');
  console.log('  TIKUM — P0.4 COMMERCIAL PILOT ACTIVATION READINESS SUITE');
  console.log('================================================================\n');

  resetDatabase();

  const pilotEventId = 'event-pestapora-2026';
  const pilotVenueId = 'venue-kemayoran';
  const picUserId = 'pic-1';

  // Seed participants
  state.users.push(
    { id: 'seller-partner-rep', name: 'PT Boss Kreator Consignment Rep', role: 'seller', phone: '081234567899', email: 'consignment@bosscreator.id' },
    { id: 'buyer-pilot-p4-a', name: 'Buyer Pilot P4 A', role: 'buyer', phone: '081298765431', email: 'buyer-p4-a@tikum.app' },
    { id: 'buyer-pilot-p4-b', name: 'Buyer Pilot P4 B', role: 'buyer', phone: '081298765432', email: 'buyer-p4-b@tikum.app' }
  );

  state.seller_profiles.push({
    user_id: 'seller-partner-rep',
    kyc_status: 'VERIFIED',
    nik_hash: 'nik-hash-bosscreator-rep-p4',
    active_listing_limit: 20
  });

  // Register candidate partner
  const partner = await PartnerValidationService.registerPartner({
    partnerId: 'partner-boss-creator-p4',
    businessName: 'PT Boss Kreator Indonesia',
    legalName: 'PT Boss Kreator Indonesia',
    partnerType: PARTNER_TYPES.PROMOTER,
    geographicCoverage: ['Jabodetabek'],
    representativeName: 'Kiki Ucup (Festival Director)',
    contactEmail: 'partnership@bosscreator.id',
    contactPhone: '081122334455'
  });

  // Propose controlled 6-ticket consignment batch
  const batch = await PartnerValidationService.registerConsignedInventory({
    partnerId: partner.id,
    eventId: pilotEventId,
    ticketCategory: 'Festival 3-Day Pass',
    quantity: 6,
    faceValue: 1250000,
    consignmentPrice: 1500000,
    transferMethod: 'PHYSICAL_WRISTBAND',
    seatOrSectionDetails: ['Pass-01', 'Pass-02', 'Pass-03', 'Pass-04', 'Pass-05', 'Pass-06']
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: PARTNER OUTREACH PACK GENERATION & CHECKLIST
  // ---------------------------------------------------------------------------
  console.log('── Section 1: Partner Outreach Pack & Authority Verification ──');

  let outreachPack;

  test('1.1 Generates structured commercial outreach pack with accurate pricing breakdown', () => {
    outreachPack = CommercialPilotActivationService.generateOutreachPack({
      partnerId: partner.id,
      eventId: pilotEventId,
      contactPerson: 'Kiki Ucup (Festival Director)',
      ticketQuantity: 6,
      faceValue: 1250000,
      consignmentPriceCap: 1500000,
      commissionPct: 6.0
    });

    assert.ok(outreachPack.pack_id.startsWith('otp-tkm-'));
    assert.strictEqual(outreachPack.target_partner.business_name, 'PT Boss Kreator Indonesia');
    assert.strictEqual(outreachPack.commercial_terms.quantity, 6);
    assert.strictEqual(outreachPack.commercial_terms.face_value_idr, 1250000);
    assert.strictEqual(outreachPack.commercial_terms.consignment_resale_cap_idr, 1500000);
    assert.strictEqual(outreachPack.commercial_terms.platform_commission_pct, 6.0);
    assert.strictEqual(outreachPack.commercial_terms.platform_fee_per_ticket_idr, 90000);
    assert.strictEqual(outreachPack.commercial_terms.net_payout_per_ticket_idr, 1410000);
    assert.strictEqual(outreachPack.commercial_terms.total_consignment_value_idr, 9000000);
    assert.strictEqual(outreachPack.commercial_terms.total_net_payout_idr, 8460000);
  });

  test('1.2 Mandatory authority verification checklist contains all required legal & primary ticketing items', () => {
    const checklist = outreachPack.mandatory_verification_checklist;
    assert.strictEqual(checklist.length, 5);
    assert.ok(checklist.some(c => c.item.includes('Akta Perusahaan & NIB')));
    assert.ok(checklist.some(c => c.item.includes('NPWP Perusahaan')));
    assert.ok(checklist.some(c => c.item.includes('KTP Penanggung Jawab / Surat Kuasa')));
    assert.ok(checklist.some(c => c.item.includes('Loket.com')));
    assert.ok(checklist.some(c => c.item.includes('Rekening Bank Resmi')));
  });

  test('1.3 Operational handoff protocol specifies public meeting zone at Gambir Expo Gate B', () => {
    const ops = outreachPack.operational_handoff_protocol;
    assert.strictEqual(ops.meeting_point, 'Gambir Expo Gate B Public Concourse (Area Terbuka Publik)');
    assert.strictEqual(ops.pic_officer, 'Agus Hendra (Lead PIC Jabodetabek)');
    assert.strictEqual(ops.dry_run_date, '2026-10-24 (H-1)');
    assert.strictEqual(ops.event_date, '2026-10-25 (H-Day)');
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: WRITTEN CONSIGNMENT AGREEMENT & DEFECT LIABILITY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Written Consignment Agreement & Defect Liability ──');

  let agreement;

  await testAsync('2.1 Creates formal written consignment agreement with defect & rejection liability', async () => {
    agreement = await CommercialPilotActivationService.createConsignmentAgreement({
      partnerId: partner.id,
      eventId: pilotEventId,
      agreementNumber: 'SPK/TKM-BC/2026/10-001',
      ticketBatchDetails: {
        category: 'Festival 3-Day Pass',
        quantity: 6,
        faceValue: 1250000,
        consignmentPrice: 1500000,
        ticketIdentifiers: ['Pass-01', 'Pass-02', 'Pass-03', 'Pass-04', 'Pass-05', 'Pass-06']
      },
      commissionPct: 6.0,
      settlementTiming: 'POST_GATE_ADMISSION'
    });

    assert.strictEqual(agreement.status, AGREEMENT_STATUS.DRAFT);
    assert.strictEqual(agreement.agreement_number, 'SPK/TKM-BC/2026/10-001');
    assert.strictEqual(agreement.defect_and_rejection_liability.consignor_authenticity_warranty, true);
    assert.strictEqual(agreement.defect_and_rejection_liability.turnstile_failure_penalty, '100% Payout Forfeiture + Immediate Buyer Refund');
  });

  await testAsync('2.2 Signing agreement verifies document hash and advances partner lifecycle', async () => {
    // Partner authority verified first
    const mouDocHash = crypto.createHash('sha256').update('MOU-BOSS-CREATOR-ALLOCATION-2026').digest('hex');
    await PartnerValidationService.updatePartnerStatus(partner.id, PARTNER_STATUS.CONTACTED);
    await PartnerValidationService.updatePartnerStatus(partner.id, PARTNER_STATUS.INTEREST_CONFIRMED);
    await PartnerValidationService.verifyPartnerAuthority(partner.id, {
      evidenceType: 'PROMOTER_DIRECT_MOU',
      documentHash: mouDocHash,
      referenceNumber: 'MOU/BC-TKM/2026/001',
      issuerName: 'PT Boss Kreator Indonesia'
    });

    const spkHash = crypto.createHash('sha256').update('SPK-SIGNED-AGREEMENT-PESTAPORA-6TICKETS').digest('hex');
    const signed = await CommercialPilotActivationService.signConsignmentAgreement({
      agreementId: agreement.id,
      signerName: 'Kiki Ucup',
      signerTitle: 'Direktur / Festival Director PT Boss Kreator Indonesia',
      documentHash: spkHash,
      officerId: 'commercial-lead-1'
    });

    assert.strictEqual(signed.status, AGREEMENT_STATUS.SIGNED);
    assert.strictEqual(signed.document_hash, spkHash);
    assert.strictEqual(partner.status, PARTNER_STATUS.TERMS_AGREED);

    // Promote inventory batch to VERIFIED
    await PartnerValidationService.verifyConsignedBatch(batch.id, {
      notes: 'Wristbands verified in physical custody of partner rep'
    });
    assert.strictEqual(batch.status, INVENTORY_STATUS.VERIFIED);
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: OPERATIONAL PIC DUTY AUTHORIZATION & PERIMETER BOUNDARIES
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Operational PIC Duty Authorization & Public Perimeter ──');

  let dutyAuth;

  await testAsync('3.1 Issues formal Surat Tugas PIC with strict public concourse perimeter boundaries', async () => {
    dutyAuth = await CommercialPilotActivationService.issuePicDutyAuthorization({
      eventId: pilotEventId,
      picUserId: picUserId,
      venueId: pilotVenueId,
      dutyNumber: 'ST-TKM/OPS/2026/10-001',
      shiftDate: '2026-10-25',
      shiftStartTime: '2026-10-25T14:00:00+07:00',
      shiftEndTime: '2026-10-25T23:00:00+07:00'
    });

    assert.strictEqual(dutyAuth.status, DUTY_STATUS.ISSUED);
    assert.strictEqual(dutyAuth.duty_number, 'ST-TKM/OPS/2026/10-001');
    assert.strictEqual(dutyAuth.pic_officer.name, 'Agus Hendra (Event PIC)');

    // Non-infringement boundary declaration
    const boundaries = dutyAuth.operational_boundaries;
    assert.ok(boundaries.exact_meetup_perimeter.includes('Gambir Expo Gate B Public Concourse'));
    assert.ok(boundaries.non_infringement_declaration.includes('TIDAK mengklaim identitas panitia promotor'));
    assert.ok(boundaries.allowed_actions.some(a => a.includes('turnstile resmi promotor')));
    assert.ok(boundaries.prohibited_actions.some(p => p.includes('Memasuki area terbatas/backstage')));
  });

  test('3.2 Synchronizes shift schedule in VenueOperationsService for on-site execution', () => {
    const shifts = state.venue_shifts || [];
    const shift = shifts.find(s => s.event_id === pilotEventId && s.pic_user_id === picUserId);
    assert.ok(shift, 'Shift must be recorded in venue_shifts');
    assert.strictEqual(shift.shift_name, 'Pestapora Gate B Turnstile Escort Shift');
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: END-TO-END SIMULATION WITH CONTRACT PRICING & DEFECT LIABILITY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: End-to-End Simulation with Contract Pricing & Liability ──');

  let orderValid, escrowValid, orderDefective, escrowDefective;

  await testAsync('4.1 Valid consigned ticket flow: Escrow releases exact contract net payout (IDR 1,410,000)', async () => {
    // Allocate 1 ticket from batch for Pass-01
    await PartnerValidationService.allocateInventoryItem(batch.id, {
      quantity: 1,
      listingId: 'list-p4-pass-01'
    });

    const listRes = await ListingService.createListing({
      sellerId: 'seller-partner-rep',
      eventId: pilotEventId,
      seatInfo: 'Festival 3-Day Pass — Wristband Pass-01 (Consigned)',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'PESTAPORA-2026-P4-PASS-01'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    // Buyer A reserves and buys
    await ReservationService.reserveListing({
      listingId: listRes.listing.id,
      buyerId: 'buyer-pilot-p4-a',
      ttlMinutes: 15
    });
    const activeRes = ReservationService.getActiveReservationForListing(listRes.listing.id);

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-pilot-p4-a',
      listingId: listRes.listing.id,
      reservationId: activeRes.id
    });
    orderValid = orderRes.order;
    escrowValid = orderRes.escrow;

    await EscrowService.recordPayment({
      orderId: orderValid.id,
      providerRef: 'sim-pay-p4-pass-01',
      idempotencyKey: 'idem-p4-pass-01',
      amountPaid: orderValid.buyer_total
    });

    // PIC verifies handover at Gambir Expo Gate B and confirms turnstile admission
    await EventPicService.updateOperationalStage({ picUserId, orderId: orderValid.id, stage: 'HANDOFF_READY' });
    await EventPicService.recordTicketVerification({
      picUserId,
      orderId: orderValid.id,
      notes: 'Wristband Pass-01 fisik dan RFID chip terverifikasi utuh'
    });
    await EventPicService.recordEntryVerification({
      picUserId,
      orderId: orderValid.id,
      gate: 'Turnstile Gate 2 Gambir Expo',
      status: 'CONFIRMED',
      notes: 'Turnstile RFID reader lampu hijau'
    });

    // Escrow releases to settlement
    const relRes = await EscrowService.releaseToSeller(orderValid.id, 'admin-1');
    assert.strictEqual(relRes.escrow.status, ESCROW_STATUS.RELEASED);

    const stlRes = await SettlementService.executeSettlement({
      orderId: orderValid.id,
      sellerId: orderValid.seller_id,
      officerId: 'admin-1',
      idempotencyKey: 'idem-stl-p4-pass-01',
      bankAccount: 'BCA 1122334455 a.n. PT Boss Kreator Indonesia'
    });
    assert.strictEqual(stlRes.settlement.amount, 1410000); // Contract net payout: 1,500,000 - 6% (90,000)
  });

  await testAsync('4.2 Turnstile rejection incident triggers contract liability: Payout voided, Buyer 100% refunded', async () => {
    // Allocate 1 ticket for Pass-02
    await PartnerValidationService.allocateInventoryItem(batch.id, {
      quantity: 1,
      listingId: 'list-p4-pass-02'
    });

    const listRes = await ListingService.createListing({
      sellerId: 'seller-partner-rep',
      eventId: pilotEventId,
      seatInfo: 'Festival 3-Day Pass — Wristband Pass-02 (Consigned)',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'PESTAPORA-2026-P4-PASS-02'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    await ReservationService.reserveListing({
      listingId: listRes.listing.id,
      buyerId: 'buyer-pilot-p4-b',
      ttlMinutes: 15
    });
    const activeRes = ReservationService.getActiveReservationForListing(listRes.listing.id);

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-pilot-p4-b',
      listingId: listRes.listing.id,
      reservationId: activeRes.id
    });
    orderDefective = orderRes.order;
    escrowDefective = orderRes.escrow;

    await EscrowService.recordPayment({
      orderId: orderDefective.id,
      providerRef: 'sim-pay-p4-pass-02',
      idempotencyKey: 'idem-p4-pass-02',
      amountPaid: orderDefective.buyer_total
    });

    // PIC Turnstile rejection
    await IncidentService.reportIncident({
      type: INCIDENT_TYPES.ENTRY_FAILURE,
      severity: INCIDENT_SEVERITY.HIGH,
      orderId: orderDefective.id,
      eventId: pilotEventId,
      venueId: pilotVenueId,
      reporterId: picUserId,
      description: 'Turnstile RFID scanner shows red light: duplicate scan code'
    });

    await EventPicService.recordEntryVerification({
      picUserId,
      orderId: orderDefective.id,
      gate: 'Turnstile Gate 2 Gambir Expo',
      status: 'GATE_REJECTION',
      notes: 'Turnstile red light: duplicate scan',
      currentDateStr: '2026-10-25'
    });

    const dispRes = await DisputeService.openDispute({
      orderId: orderDefective.id,
      buyerId: 'buyer-pilot-p4-b',
      reason: 'Gate turnstile rejected Pass-02 as duplicate scan'
    });

    assert.strictEqual(escrowDefective.status, ESCROW_STATUS.DISPUTED);

    // PIC submits field investigation report with scan evidence
    await DisputeService.submitPicInvestigation({
      disputeId: dispRes.dispute.id,
      picUserId,
      notes: 'Konfirmasi posko gate: Wristband Pass-02 terdeteksi duplikat pada scanner RFID panitia',
      evidenceBundleId: 'bdl-pestapora-gate-scan-pass-02',
      gateStatus: 'GATE_REJECTION'
    });

    // Resolve dispute under Contract Liability Clause -> 100% refund to buyer
    const resolveRes = await DisputeService.resolveDispute({
      disputeId: dispRes.dispute.id,
      officerId: 'admin-1',
      outcome: DISPUTE_OUTCOME.REFUND_BUYER,
      decisionReason: 'Contract Defect Liability Enforced: Duplicate wristband scan at turnstile',
      decisionNotes: 'Full refund to buyer. Consignor payout forfeited per SPK/TKM-BC/2026/10-001 clause 4.'
    });

    assert.strictEqual(resolveRes.dispute.status, DISPUTE_STATUS.RESOLVED);
    assert.strictEqual(escrowDefective.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(orderDefective.status, ORDER_STATUS.REFUNDED);
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: GO/NO-GO EVALUATION ENGINE AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n── Section 5: Multi-Criteria GO/NO-GO Evaluation Engine ──');

  test('5.1 Evaluates all 5 launch gates and certifies PILOT_READY when fully authorized', () => {
    // Advance partner to PILOT_APPROVED
    partner.status = PARTNER_STATUS.PILOT_APPROVED;

    const evalResult = CommercialPilotActivationService.evaluatePilotGoNoGo({
      partnerId: partner.id,
      eventId: pilotEventId
    });

    assert.strictEqual(evalResult.passed_count, 5);
    assert.strictEqual(evalResult.total_count, 5);
    assert.strictEqual(evalResult.gates.gate_1_partner_authority.passed, true);
    assert.strictEqual(evalResult.gates.gate_2_supply_verification.passed, true);
    assert.strictEqual(evalResult.gates.gate_3_operational_coverage.passed, true);
    assert.strictEqual(evalResult.gates.gate_4_payment_safety.passed, true);
    assert.strictEqual(evalResult.gates.gate_5_event_temporal.passed, true);
    assert.strictEqual(evalResult.verdict, PILOT_VERDICT.PILOT_READY);
  });

  test('5.2 Certifies SIMULATION_READY_AWAITING_COMMERCIAL_EXECUTION when awaiting real signature', () => {
    // Test with unsigned partner candidate
    const unsignedPartner = {
      id: 'partner-unsigned-test',
      business_name: 'Unsigned Promoter',
      status: PARTNER_STATUS.IDENTIFIED,
      authority_evidence: null
    };
    state.partners.push(unsignedPartner);

    const evalResult = CommercialPilotActivationService.evaluatePilotGoNoGo({
      partnerId: unsignedPartner.id,
      eventId: pilotEventId
    });

    assert.strictEqual(evalResult.verdict, PILOT_VERDICT.SIMULATION_READY_AWAITING_COMMERCIAL_EXECUTION);
    assert.strictEqual(evalResult.gates.gate_1_partner_authority.passed, false);
    assert.strictEqual(evalResult.gates.gate_2_supply_verification.passed, false);
    assert.strictEqual(evalResult.gates.gate_4_payment_safety.passed, true); // Still fail-closed
  });

  test('5.3 Strictly returns BLOCKED if live payment rail leak is detected in non-prod', () => {
    const originalEnv = process.env.ENABLE_DOKU_PRODUCTION;
    try {
      process.env.ENABLE_DOKU_PRODUCTION = 'true'; // Simulate unauthorized leak
      const evalResult = CommercialPilotActivationService.evaluatePilotGoNoGo({
        partnerId: partner.id,
        eventId: pilotEventId
      });
      assert.strictEqual(evalResult.verdict, PILOT_VERDICT.BLOCKED);
      assert.strictEqual(evalResult.gates.gate_4_payment_safety.passed, false);
    } finally {
      process.env.ENABLE_DOKU_PRODUCTION = originalEnv;
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 6: FINANCIAL SOLVENCY & AUDIT TRAIL IMMUTABILITY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 6: Financial Solvency & Audit Trail Completeness ──');

  test('6.1 Double-entry FinancialLedger maintains absolute solvency across simulated orders', () => {
    FinancialLedger.assertSolvency();

    const ledger = state.financial_ledger || [];
    let grandDebits = 0;
    let grandCredits = 0;
    for (const tx of ledger) {
      for (const entry of tx.entries) {
        if (entry.type === 'DEBIT') grandDebits += entry.amount;
        if (entry.type === 'CREDIT') grandCredits += entry.amount;
      }
    }
    assert.strictEqual(grandDebits, grandCredits, `Ledger imbalanced: Debits (${grandDebits}) !== Credits (${grandCredits})`);
  });

  test('6.2 Immutable audit logs recorded for agreement creation, signing, and PIC duty authorization', () => {
    const logs = state.audit_logs || [];
    assert.ok(logs.some(l => l.entity_type === 'CONSIGNMENT_AGREEMENT' && l.action === 'AGREEMENT_DRAFTED'));
    assert.ok(logs.some(l => l.entity_type === 'CONSIGNMENT_AGREEMENT' && l.action === 'AGREEMENT_SIGNED'));
    assert.ok(logs.some(l => l.entity_type === 'PIC_DUTY_AUTHORIZATION' && l.action === 'DUTY_ISSUED'));
  });

  console.log('\n================================================================');
  console.log(`  P0.4 RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCommercialPilotActivationTests().catch(err => {
    console.error('Test suite uncaught error:', err);
    process.exit(1);
  });
}

module.exports = { runCommercialPilotActivationTests };
