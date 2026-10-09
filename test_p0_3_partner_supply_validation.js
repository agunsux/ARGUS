/**
 * TIKUM — P0.3 PARTNER & SUPPLY VALIDATION TEST SUITE
 * 
 * Verifies partner authority, consignment governance, ticket supply controls,
 * and operational PIC coverage for Jabodetabek and Bandung pilot events.
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
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { VenueOperationsService } = require('./src/venue/VenueOperationsService');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY, INCIDENT_STATUS } = require('./src/venue/IncidentService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('./src/services/disputeService');
const { SettlementService } = require('./src/services/settlementService');
const { ReservationService, RESERVATION_STATUS } = require('./src/services/marketplace/ReservationService');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');

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

async function runPartnerSupplyValidationTests() {
  console.log('\n================================================================');
  console.log('  TIKUM — P0.3 PARTNER & SUPPLY VALIDATION SUITE');
  console.log('================================================================\n');

  resetDatabase();

  const pilotEventId = 'event-pestapora-2026';
  const pilotVenueId = 'venue-kemayoran';
  const picUserId = 'pic-1';

  // Seed participants
  state.users.push(
    { id: 'seller-partner-rep', name: 'Boss Creator Consignment Rep', role: 'seller', phone: '081234567899', email: 'rep@bosscreator.id' },
    { id: 'buyer-pilot-p3', name: 'Buyer Pilot P0.3', role: 'buyer', phone: '081298765430', email: 'buyer-p3@tikum.app' },
    { id: 'buyer-pilot-p3-incident', name: 'Buyer Pilot Incident', role: 'buyer', phone: '081298765439', email: 'buyer-incident@tikum.app' }
  );

  state.seller_profiles.push({
    user_id: 'seller-partner-rep',
    kyc_status: 'VERIFIED',
    nik_hash: 'nik-hash-bosscreator-rep-1',
    active_listing_limit: 20
  });

  // ---------------------------------------------------------------------------
  // PART 1: PARTNER REGISTRATION & STRICT LIFECYCLE
  // ---------------------------------------------------------------------------
  console.log('── Part 1: Partner Registration & Strict Lifecycle FSM ──');

  let partnerA, partnerB;

  await testAsync('1.1 Partner registration creates partner in IDENTIFIED status', async () => {
    partnerA = await PartnerValidationService.registerPartner({
      partnerId: 'partner-pestapora-promoter',
      businessName: 'PT Boss Kreator Indonesia',
      legalName: 'PT Boss Kreator Indonesia',
      partnerType: PARTNER_TYPES.PROMOTER,
      geographicCoverage: ['Jabodetabek'],
      representativeName: 'Kiki Ucup (Festival Director)',
      contactEmail: 'partnership@bosscreator.id',
      contactPhone: '081122334455',
      notes: 'Pestapora official promoter / ticketing rights holder'
    });

    assert.strictEqual(partnerA.status, PARTNER_STATUS.IDENTIFIED);
    assert.strictEqual(partnerA.business_name, 'PT Boss Kreator Indonesia');
    assert.strictEqual(partnerA.partner_type, PARTNER_TYPES.PROMOTER);
  });

  await testAsync('1.2 Duplicate business name registration is rejected', async () => {
    let errorCaught = false;
    try {
      await PartnerValidationService.registerPartner({
        businessName: 'pt boss kreator indonesia',
        representativeName: 'Duplicate Rep'
      });
    } catch (e) {
      errorCaught = true;
      assert.strictEqual(e.code, 'DUPLICATE_PARTNER');
    }
    assert.strictEqual(errorCaught, true);
  });

  await testAsync('1.3 Regional coverage filtering (Jabodetabek vs Bandung)', async () => {
    partnerB = await PartnerValidationService.registerPartner({
      partnerId: 'partner-bandung-collective',
      businessName: 'Bandung Indie Collective',
      partnerType: PARTNER_TYPES.CONSIGNOR,
      geographicCoverage: ['Bandung', 'Jawa Barat'],
      representativeName: 'Rian Pelaksana',
      contactEmail: 'rian@bandungindie.id',
      contactPhone: '082211445566'
    });

    const jabodetabekPartners = PartnerValidationService.listPartners({ region: 'Jabodetabek' });
    const bandungPartners = PartnerValidationService.listPartners({ region: 'Bandung' });

    assert.strictEqual(jabodetabekPartners.some(p => p.id === partnerA.id), true);
    assert.strictEqual(jabodetabekPartners.some(p => p.id === partnerB.id), false);
    assert.strictEqual(bandungPartners.some(p => p.id === partnerB.id), true);
  });

  await testAsync('1.4 Illegal status transition (skipping stages) is strictly rejected', async () => {
    let errorCaught = false;
    try {
      // Trying to jump from IDENTIFIED directly to PILOT_APPROVED
      await PartnerValidationService.updatePartnerStatus(partnerA.id, PARTNER_STATUS.PILOT_APPROVED);
    } catch (e) {
      errorCaught = true;
      assert.strictEqual(e.code, 'ILLEGAL_STATUS_TRANSITION');
    }
    assert.strictEqual(errorCaught, true);
    assert.strictEqual(partnerA.status, PARTNER_STATUS.IDENTIFIED);
  });

  await testAsync('1.5 Orderly progression through CONTACTED and INTEREST_CONFIRMED', async () => {
    await PartnerValidationService.updatePartnerStatus(partnerA.id, PARTNER_STATUS.CONTACTED, {
      actorId: 'admin-lead-1',
      reason: 'Introductory outreach pack sent to promoter'
    });
    assert.strictEqual(partnerA.status, PARTNER_STATUS.CONTACTED);

    await PartnerValidationService.updatePartnerStatus(partnerA.id, PARTNER_STATUS.INTEREST_CONFIRMED, {
      actorId: 'admin-lead-1',
      reason: 'Promoter expresses interest in controlled 10-ticket secondary pilot'
    });
    assert.strictEqual(partnerA.status, PARTNER_STATUS.INTEREST_CONFIRMED);
  });

  // ---------------------------------------------------------------------------
  // PART 2: AUTHORITY GATING & EVIDENCE VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n── Part 2: Authority Gating & Evidence Verification ──');

  let batchUnverified;

  await testAsync('2.1 Consignment inventory proposed before authority verification remains PROPOSED', async () => {
    batchUnverified = await PartnerValidationService.registerConsignedInventory({
      partnerId: partnerA.id,
      eventId: pilotEventId,
      ticketCategory: 'FESTIVAL_3DAY_PASS',
      quantity: 6,
      faceValue: 1250000,
      consignmentPrice: 1500000,
      transferMethod: 'PHYSICAL_WRISTBAND',
      seatOrSectionDetails: ['Pass-01', 'Pass-02', 'Pass-03', 'Pass-04', 'Pass-05', 'Pass-06']
    });

    assert.strictEqual(batchUnverified.status, INVENTORY_STATUS.PROPOSED);
    assert.strictEqual(batchUnverified.quantity, 6);
    assert.strictEqual(batchUnverified.available_quantity, 6);
  });

  await testAsync('2.2 Unverified inventory cannot be allocated or listed', async () => {
    let errorCaught = false;
    try {
      await PartnerValidationService.allocateInventoryItem(batchUnverified.id, { quantity: 1 });
    } catch (e) {
      errorCaught = true;
      assert.strictEqual(e.code, 'INVENTORY_NOT_LISTABLE');
    }
    assert.strictEqual(errorCaught, true);
  });

  await testAsync('2.3 Premature inventory batch verification without partner authority is rejected', async () => {
    let errorCaught = false;
    try {
      await PartnerValidationService.verifyConsignedBatch(batchUnverified.id);
    } catch (e) {
      errorCaught = true;
      assert.strictEqual(e.code, 'PARTNER_AUTHORITY_REQUIRED');
    }
    assert.strictEqual(errorCaught, true);
  });

  await testAsync('2.4 Verifying partner authority transitions status to AUTHORITY_VERIFIED', async () => {
    const docHash = crypto.createHash('sha256').update('MOU-BOSS-CREATOR-TIKUM-PILOT-2026').digest('hex');
    await PartnerValidationService.verifyPartnerAuthority(partnerA.id, {
      evidenceType: 'PROMOTER_DIRECT_MOU',
      documentHash: docHash,
      referenceNumber: 'MOU/BC-TKM/2026/001',
      issuerName: 'PT Boss Kreator Indonesia',
      validUntil: '2026-10-31',
      officerId: 'trust-officer-1',
      notes: 'Direct consignment allocation letter signed by authorized director'
    });

    assert.strictEqual(partnerA.status, PARTNER_STATUS.AUTHORITY_VERIFIED);
    assert.strictEqual(partnerA.authority_evidence.document_hash, docHash);
    assert.strictEqual(partnerA.authority_evidence.reference_number, 'MOU/BC-TKM/2026/001');
  });

  await testAsync('2.5 Recording agreed terms advances partner to TERMS_AGREED', async () => {
    const termsHash = crypto.createHash('sha256').update('TERMS-PESTAPORA-CONSIGNMENT-6PCT').digest('hex');
    await PartnerValidationService.recordAgreedTerms(partnerA.id, {
      consignmentCommissionPct: 6.0,
      agreedTransferMechanisms: ['PHYSICAL_WRISTBAND'],
      agreementDocHash: termsHash,
      settlementTiming: 'POST_GATE_ADMISSION',
      officerId: 'commercial-lead-1'
    });

    assert.strictEqual(partnerA.status, PARTNER_STATUS.TERMS_AGREED);
    assert.strictEqual(partnerA.commercial_terms.consignment_commission_pct, 6.0);
  });

  await testAsync('2.6 Final approval advances partner to PILOT_APPROVED', async () => {
    await PartnerValidationService.updatePartnerStatus(partnerA.id, PARTNER_STATUS.PILOT_APPROVED, {
      actorId: 'operations-director-1',
      reason: 'Formal pilot authorization signed for Pestapora 2026 6-ticket consignment'
    });

    assert.strictEqual(partnerA.status, PARTNER_STATUS.PILOT_APPROVED);
  });

  await testAsync('2.7 Verifying inventory batch succeeds once partner is authorized', async () => {
    const verifiedBatch = await PartnerValidationService.verifyConsignedBatch(batchUnverified.id, {
      officerId: 'trust-officer-1',
      notes: 'Wristbands verified in physical custody of partner rep'
    });

    assert.strictEqual(verifiedBatch.status, INVENTORY_STATUS.VERIFIED);
  });

  // ---------------------------------------------------------------------------
  // PART 3: INVENTORY CONTROLS & ANTI-OVERSELLING
  // ---------------------------------------------------------------------------
  console.log('\n── Part 3: Inventory Controls & Anti-Overselling Invariants ──');

  await testAsync('3.1 Reject consignment for concluded or non-upcoming event', async () => {
    let errorCaught = false;
    try {
      await PartnerValidationService.registerConsignedInventory({
        partnerId: partnerA.id,
        eventId: 'event-so7-bandung', // Past event in 2024
        ticketCategory: 'VIP',
        quantity: 5,
        faceValue: 500000,
        consignmentPrice: 600000,
        transferMethod: 'PHYSICAL_WRISTBAND'
      });
    } catch (e) {
      errorCaught = true;
      assert.strictEqual(e.code, 'EVENT_NOT_UPCOMING');
    }
    assert.strictEqual(errorCaught, true);
  });

  await testAsync('3.2 Allocating inventory decrements available quantity accurately', async () => {
    const initialAvailable = batchUnverified.available_quantity;
    await PartnerValidationService.allocateInventoryItem(batchUnverified.id, {
      quantity: 1,
      listingId: 'list-pestapora-pilot-demo'
    });

    assert.strictEqual(batchUnverified.available_quantity, initialAvailable - 1);
    assert.strictEqual(batchUnverified.allocated_quantity, 1);
    assert.strictEqual(batchUnverified.status, INVENTORY_STATUS.LISTED);
  });

  await testAsync('3.3 Over-allocation beyond available quantity is blocked (anti-overselling)', async () => {
    let errorCaught = false;
    try {
      // Available is 5, trying to allocate 10
      await PartnerValidationService.allocateInventoryItem(batchUnverified.id, { quantity: 10 });
    } catch (e) {
      errorCaught = true;
      assert.strictEqual(e.code, 'INSUFFICIENT_INVENTORY');
      assert.strictEqual(e.availableQuantity, 5);
    }
    assert.strictEqual(errorCaught, true);
  });

  // ---------------------------------------------------------------------------
  // PART 4: PIC ON-SITE COVERAGE & HANDOVER READINESS
  // ---------------------------------------------------------------------------
  console.log('\n── Part 4: PIC Operational Coverage & Handover Protocols ──');

  test('4.1 Event PIC assignment is confirmed for Pestapora 2026', () => {
    const assignment = state.event_pics.find(
      ep => ep.event_id === pilotEventId && ep.pic_user_id === picUserId
    );
    assert.ok(assignment, 'PIC assignment must exist in state.event_pics');
    assert.strictEqual(assignment.pic_user_id, picUserId);
    assert.strictEqual(assignment.venue_id, pilotVenueId);
    assert.strictEqual(assignment.status, 'ACTIVE');

    const activeCheck = EventPicService.isPicActiveForEvent(picUserId, pilotEventId);
    assert.strictEqual(activeCheck.active, true);
  });

  await testAsync('4.2 Venue operations shift created with confirmed operational window', async () => {
    const shift = await VenueOperationsService.createShiftAssignment({
      eventId: pilotEventId,
      venueId: pilotVenueId,
      picUserId,
      shiftName: 'Pestapora Main Turnstile Gate Shift',
      startTime: '2026-10-25T14:00:00+07:00',
      endTime: '2026-10-25T23:00:00+07:00'
    });
    assert.strictEqual(shift.status, 'ASSIGNED');
    assert.strictEqual(shift.pic_user_id, picUserId);
    assert.strictEqual(shift.event_id, pilotEventId);
  });

  // ---------------------------------------------------------------------------
  // PART 5: END-TO-END ZERO-MONEY TRANSACTION SIMULATION
  // ---------------------------------------------------------------------------
  console.log('\n── Part 5: End-to-End Zero-Money Consigned Ticket Simulation ──');

  let consignedListing, consignedOrder, consignedEscrow;

  await testAsync('5.1 Consigned inventory item is listed in marketplace by verified partner rep', async () => {
    // Allocate 1 ticket from batch for this listing
    await PartnerValidationService.allocateInventoryItem(batchUnverified.id, {
      quantity: 1,
      listingId: 'list-pestapora-consigned-pass-01'
    });

    const listRes = await ListingService.createListing({
      sellerId: 'seller-partner-rep',
      eventId: pilotEventId,
      seatInfo: 'Festival 3-Day Pass — Wristband Pass-01 (Consigned)',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'PESTAPORA-2026-CONSIGNED-PASS-01'
    });

    consignedListing = listRes.listing;
    assert.strictEqual(consignedListing.status, LISTING_STATUS.PENDING_VERIFICATION);

    // Admin verifies listing
    const verified = await ListingService.verifyListing(consignedListing.id, 'admin-1', { approved: true });
    assert.strictEqual(verified.status, LISTING_STATUS.ACTIVE);
  });

  await testAsync('5.2 Buyer reserves and initiates simulated escrow for consigned ticket', async () => {
    // Reserve listing
    const reservation = await ReservationService.reserveListing({
      listingId: consignedListing.id,
      buyerId: 'buyer-pilot-p3',
      ttlMinutes: 15
    });
    assert.strictEqual(reservation.status, RESERVATION_STATUS.PENDING);
    assert.strictEqual(consignedListing.status, LISTING_STATUS.RESERVED);

    const activeRes = ReservationService.getActiveReservationForListing(consignedListing.id);
    assert.ok(activeRes);

    // Create escrow order in simulation
    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-pilot-p3',
      listingId: consignedListing.id,
      reservationId: activeRes.id
    });

    consignedOrder = orderRes.order;
    consignedEscrow = orderRes.escrow;

    assert.strictEqual(consignedOrder.status, ORDER_STATUS.PENDING_PAYMENT);
    assert.strictEqual(consignedEscrow.status, ESCROW_STATUS.PENDING_PAYMENT);

    // Simulated payment lock
    const payRes = await EscrowService.recordPayment({
      orderId: consignedOrder.id,
      providerRef: 'sim-pay-consigned-pass-01',
      idempotencyKey: 'idem-sim-p3-pass-01',
      amountPaid: consignedOrder.buyer_total
    });

    assert.strictEqual(payRes.escrow.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(payRes.order.status, ORDER_STATUS.PAID_ESCROWED);
    assert.strictEqual(consignedListing.status, LISTING_STATUS.SOLD);
  });

  await testAsync('5.3 On-site physical wristband handover and turnstile verified by PIC', async () => {
    await EventPicService.updateOperationalStage({ picUserId, orderId: consignedOrder.id, stage: 'CONTACTED' });
    await EventPicService.updateOperationalStage({ picUserId, orderId: consignedOrder.id, stage: 'MEETUP_CONFIRMED' });
    await EventPicService.updateOperationalStage({ picUserId, orderId: consignedOrder.id, stage: 'HANDOFF_READY' });

    const tv = await EventPicService.recordTicketVerification({
      picUserId,
      orderId: consignedOrder.id,
      notes: 'Wristband Pass-01 fisik dan RFID chip terverifikasi'
    });
    assert.strictEqual(tv.ticket_verified, true);

    const ev = await EventPicService.recordEntryVerification({
      picUserId,
      orderId: consignedOrder.id,
      gate: 'Turnstile Gate 2 Gambir Expo',
      status: 'CONFIRMED',
      notes: 'Wristband berhasil scan turnstile panitia Pestapora'
    });
    assert.strictEqual(ev.status, 'CONFIRMED');
    assert.strictEqual(consignedEscrow.status, ESCROW_STATUS.RELEASE_PENDING);
  });

  await testAsync('5.4 Escrow releases to settlement without real money disbursement', async () => {
    const releaseRes = await EscrowService.releaseToSeller(consignedOrder.id, 'admin-1');
    assert.strictEqual(releaseRes.escrow.status, ESCROW_STATUS.RELEASED);
    assert.strictEqual(releaseRes.order.status, ORDER_STATUS.SETTLED);

    const stlRes = await SettlementService.executeSettlement({
      orderId: consignedOrder.id,
      sellerId: consignedOrder.seller_id,
      officerId: 'admin-1',
      idempotencyKey: 'idem-stl-p3-consigned-1',
      bankAccount: 'BCA 8899001122 a.n. Boss Creator Consignment'
    });
    assert.strictEqual(stlRes.settlement.status, 'EXECUTED');
    assert.strictEqual(stlRes.settlement.amount, 1410000); // 1,500,000 - 6% fee (90,000)
    assert.ok(['SIMULATED', 'PROVIDER_RAIL_AUTOMATED'].includes(stlRes.settlement.mode));
  });

  // ---------------------------------------------------------------------------
  // PART 6: TURNSTILE INCIDENT & DISPUTE WORKFLOW
  // ---------------------------------------------------------------------------
  console.log('\n── Part 6: Turnstile Incident & Dispute Resolution ──');

  let incidentOrder, incidentEscrow;

  await testAsync('6.1 Turnstile entry failure triggers first-class incident and freezes escrow', async () => {
    // Allocate 1 ticket from batch for second order
    await PartnerValidationService.allocateInventoryItem(batchUnverified.id, {
      quantity: 1,
      listingId: 'list-pestapora-consigned-pass-02'
    });

    const listRes = await ListingService.createListing({
      sellerId: 'seller-partner-rep',
      eventId: pilotEventId,
      seatInfo: 'Festival 3-Day Pass — Wristband Pass-02 (Consigned)',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'PESTAPORA-2026-CONSIGNED-PASS-02'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    await ReservationService.reserveListing({
      listingId: listRes.listing.id,
      buyerId: 'buyer-pilot-p3-incident',
      ttlMinutes: 15
    });
    const activeRes = ReservationService.getActiveReservationForListing(listRes.listing.id);

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-pilot-p3-incident',
      listingId: listRes.listing.id,
      reservationId: activeRes.id
    });
    incidentOrder = orderRes.order;
    incidentEscrow = orderRes.escrow;

    await EscrowService.recordPayment({
      orderId: incidentOrder.id,
      providerRef: 'sim-pay-incident-pass-02',
      idempotencyKey: 'idem-sim-incident-pass-02',
      amountPaid: incidentOrder.buyer_total
    });
    assert.strictEqual(incidentEscrow.status, ESCROW_STATUS.ESCROWED);

    // PIC reports entry failure at turnstile
    const incident = await IncidentService.reportIncident({
      type: INCIDENT_TYPES.ENTRY_FAILURE,
      severity: INCIDENT_SEVERITY.HIGH,
      orderId: incidentOrder.id,
      eventId: pilotEventId,
      venueId: pilotVenueId,
      reporterId: picUserId,
      reporterRole: 'pic',
      description: 'Turnstile RFID reader indicates wristband Pass-02 already scanned earlier'
    });

    assert.ok(incident, 'Incident must be created');
    assert.strictEqual(incident.type, INCIDENT_TYPES.ENTRY_FAILURE);
    assert.strictEqual(incident.severity, INCIDENT_SEVERITY.HIGH);

    // PIC records gate rejection
    const verification = await EventPicService.recordEntryVerification({
      picUserId,
      orderId: incidentOrder.id,
      gate: 'Turnstile Gate 2 Gambir Expo',
      status: 'GATE_REJECTION',
      notes: 'RFID reader duplicate scan error',
      currentDateStr: '2026-10-25'
    });
    assert.strictEqual(verification.status, 'GATE_REJECTION');

    // Buyer opens dispute based on gate rejection incident -> freezes escrow
    const dispRes = await DisputeService.openDispute({
      orderId: incidentOrder.id,
      buyerId: 'buyer-pilot-p3-incident',
      reason: 'Turnstile RFID reader rejected wristband as duplicate'
    });

    assert.strictEqual(dispRes.dispute.status, DISPUTE_STATUS.OPEN);
    assert.strictEqual(incidentEscrow.status, ESCROW_STATUS.DISPUTED);
    assert.strictEqual(incidentOrder.status, ORDER_STATUS.DISPUTED);
  });

  // ---------------------------------------------------------------------------
  // PART 7: CONSOLIDATED REPORTING & AUDIT INVARIANTS
  // ---------------------------------------------------------------------------
  console.log('\n── Part 7: Consolidated Reporting & Financial Solvency ──');

  test('7.1 Consignment summary report reflects accurate partner and inventory counts', () => {
    const report = PartnerValidationService.getConsignmentReport();
    assert.strictEqual(report.total_partners, 2);
    assert.strictEqual(report.partners_by_status[PARTNER_STATUS.PILOT_APPROVED], 1);
    assert.strictEqual(report.total_tickets_consigned, 6);
    assert.strictEqual(report.total_tickets_allocated, 3); // 1 in 3.2, 1 in 5.1, 1 in 6.1
    assert.strictEqual(report.total_tickets_available, 3);
  });

  test('7.2 Double-entry ledger solvency balance is maintained (debits === credits)', () => {
    // Solvency assert
    FinancialLedger.assertSolvency();

    const ledger = state.financial_ledger || [];
    assert.ok(ledger.length >= 1, `Expected ledger transactions, got ${ledger.length}`);

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

  test('7.3 Audit log recorded immutable trail for all partner & consignment lifecycle events', () => {
    const logs = state.audit_logs || [];
    assert.ok(logs.some(l => l.action === 'PARTNER_REGISTRATION'), 'PARTNER_REGISTRATION log missing');
    assert.ok(logs.some(l => l.action === 'PARTNER_STATUS_UPDATE'), 'PARTNER_STATUS_UPDATE log missing');
    assert.ok(logs.some(l => l.action === 'CONSIGNED_INVENTORY_REGISTRATION'), 'CONSIGNED_INVENTORY_REGISTRATION log missing');
    assert.ok(logs.some(l => l.action === 'CONSIGNED_INVENTORY_VERIFIED'), 'CONSIGNED_INVENTORY_VERIFIED log missing');
    assert.ok(logs.some(l => l.action === 'INVENTORY_ALLOCATION'), 'INVENTORY_ALLOCATION log missing');
  });

  console.log('\n================================================================');
  console.log(`  P0.3 RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPartnerSupplyValidationTests().catch(err => {
    console.error('Test suite uncaught error:', err);
    process.exit(1);
  });
}

module.exports = { runPartnerSupplyValidationTests };
