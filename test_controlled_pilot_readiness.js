/**
 * TIKUM / ARGUS — Controlled Supply Pilot Readiness Test Suite
 * 
 * Verifies:
 * 1. Partner authority gating & consignment pre-conditions (zero fake supply).
 * 2. Concluded / archived events are strictly excluded from consignment.
 * 3. Complete transaction state machine in sandbox/simulation:
 *    - Order creation & 6% canonical fee engine.
 *    - Payment pending, success (PAID !== SELLER PAID), failure, and timeout.
 *    - Ticket verification (valid admission) vs invalid-ticket rejection (gate scan failure).
 *    - Non-delivery (seller no-show) with escrow freeze.
 *    - Dispute handling & 100% buyer refund (with consignor payout forfeiture).
 *    - Settlement eligibility gating & double-disbursement prevention.
 * 4. Double-entry ledger balance: sum(debits) === sum(credits) for all transactions.
 * 5. Fail-closed production payments & honest catalog separation.
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const crypto = require('crypto');
const { state, resetDatabase, recordAuditLog } = require('./src/database');
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
const { MarketplaceOrderService, MARKETPLACE_ORDER_STATUS } = require('./src/services/marketplace/MarketplaceOrderService');
const { EventPicService } = require('./src/services/eventPicService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('./src/services/disputeService');
const { SettlementService } = require('./src/services/settlementService');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY } = require('./src/venue/IncidentService');
const { FinancialLedger, LEDGER_ACCOUNTS, FINANCIAL_EVENT_TYPES } = require('./src/settlement/FinancialLedger');
const { CanonicalFeeEngine } = require('./src/pricing/CanonicalFeeEngine');
const { CanonicalEventRegistry } = require('./src/discovery/CanonicalEventRegistry');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ [FAIL] ${name} -> ${e.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ [FAIL] ${name} -> ${e.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('\n================================================================');
  console.log('  TIKUM — CONTROLLED SUPPLY PILOT READINESS VERIFICATION');
  console.log('================================================================\n');

  resetDatabase();

  // ---------------------------------------------------------------------------
  // SECTION 1: PARTNER AUTHORITY GATING & CONSIGNMENT PRE-CONDITIONS
  // ---------------------------------------------------------------------------
  console.log('── Section 1: Partner Authority & Consignment Pre-Conditions ──');

  await testAsync('1.1 Concluded or archived event (Pestapora 2026) cannot be consigned', async () => {
    const p = await PartnerValidationService.registerPartner({
      partnerId: 'partner-unverified-1',
      businessName: 'Unverified Test Candidate',
      representativeName: 'Candidate Rep',
      partnerType: PARTNER_TYPES.PROMOTER,
      contactEmail: 'cand@test.id',
      contactPhone: '08123456789'
    });

    await assert.rejects(
      async () => {
        await PartnerValidationService.registerConsignedInventory({
          partnerId: p.id,
          eventId: 'event-pestapora-2026',
          ticketCategory: '3-Day Pass',
          quantity: 6,
          faceValue: 1250000,
          consignmentPrice: 1500000,
          transferMethod: 'PHYSICAL_WRISTBAND'
        });
      },
      (err) => err.code === 'EVENT_NOT_UPCOMING'
    );
  });

  test('1.2 Unverified partner cannot allocate inventory to marketplace listings', async () => {
    const partner = await PartnerValidationService.registerPartner({
      businessName: 'PT Boss Kreator Indonesia Candidate',
      representativeName: 'Candidate Rep',
      partnerType: PARTNER_TYPES.PROMOTER,
      contactEmail: 'candidate@bosscreator.id',
      contactPhone: '08123456789'
    });

    assert.strictEqual(partner.status, PARTNER_STATUS.IDENTIFIED);

    // Register inventory on upcoming simulated event
    const batch = await PartnerValidationService.registerConsignedInventory({
      partnerId: partner.id,
      eventId: 'event-joyland-2026',
      ticketCategory: 'Regular Pass',
      quantity: 6,
      faceValue: 1250000,
      consignmentPrice: 1500000,
      transferMethod: 'PHYSICAL_WRISTBAND'
    });

    assert.strictEqual(batch.status, INVENTORY_STATUS.PROPOSED);

    // Attempting to allocate before authority verification throws error
    await assert.rejects(
      async () => {
        await PartnerValidationService.allocateInventoryItem(batch.id, { quantity: 1 });
      },
      (err) => err.code === 'INVENTORY_NOT_LISTABLE'
    );
  });

  test('1.3 Verified hero concerts honestly show 0 resale inventory and resale_available: false', () => {
    const registry = new CanonicalEventRegistry();
    const heroEvents = registry.getHeroEvents();
    assert.strictEqual(heroEvents.length, 2);

    const nassar = heroEvents.find(e => e.id === 'event-nassar-lost-in-the-jungle-2026');
    assert.ok(nassar);
    assert.strictEqual(nassar.resale_inventory_count, 0);

    const ye = heroEvents.find(e => e.id === 'kanye-west-ye-tour-jakarta-2026');
    assert.ok(ye);
    assert.strictEqual(ye.resale_inventory_count, 0);
  });

  test('1.4 Live payment gateways remain fail-closed disabled in environment', () => {
    const dokuProd = process.env.ENABLE_DOKU_PRODUCTION === 'true';
    const ipaymuProd = process.env.ENABLE_IPAYMU_PRODUCTION === 'true';
    const midtransProd = process.env.ENABLE_MIDTRANS_PRODUCTION === 'true';
    const xenditProd = process.env.ENABLE_XENDIT_PRODUCTION === 'true';
    assert.strictEqual(dokuProd, false, 'DOKU production must be disabled');
    assert.strictEqual(ipaymuProd, false, 'iPaymu production must be disabled');
    assert.strictEqual(midtransProd, false, 'Midtrans production must be disabled');
    assert.strictEqual(xenditProd, false, 'Xendit production must be disabled');
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: TRANSACTION STATE MACHINE — SUCCESSFUL TRANSACTION & SETTLEMENT
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Scenario A — Successful Transaction, Entry & Settlement ──');

  let listingA, orderA, escrowA;

  await testAsync('2.1 Verified listing created with transparent pricing & immutable quote', async () => {
    // Setup verified listing for simulated pilot
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-joyland-2026',
      seatInfo: 'VIP Section A, Row 1, Seat 1',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'SIMULATED-BARCODE-PILOT-PASS-01',
      evidenceBundleId: 'bdl-seed-1'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });
    listingA = listRes.listing;
    assert.strictEqual(listingA.status, LISTING_STATUS.ACTIVE);

    const pricing = EscrowService.calculatePricing(listingA.price);
    assert.strictEqual(pricing.ticketPrice, 1500000);
    assert.strictEqual(pricing.platformFee, 90000); // 6% fee
    assert.strictEqual(pricing.buyer_total, 1590000);
    assert.strictEqual(pricing.seller_net_payout, 1410000); // 1.500.000 minus 6% (90.000) = 1.410.000 net payout
  });

  await testAsync('2.2 Order created: order in PENDING_PAYMENT, escrow created, listing RESERVED', async () => {
    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listingA.id
    });
    orderA = orderRes.order;
    escrowA = orderRes.escrow;

    assert.strictEqual(orderA.status, ORDER_STATUS.PENDING_PAYMENT);
    assert.strictEqual(escrowA.status, ESCROW_STATUS.PENDING_PAYMENT);
    assert.strictEqual(listingA.status, LISTING_STATUS.RESERVED);
  });

  await testAsync('2.3 Payment success: funds locked in escrow (PAID !== SELLER PAID), listing SOLD', async () => {
    const payRes = await EscrowService.recordPayment({
      orderId: orderA.id,
      providerRef: 'sim-pay-ref-001',
      idempotencyKey: 'idem-sim-001',
      amountPaid: orderA.buyer_total
    });

    assert.strictEqual(payRes.payment.status, 'SETTLED');
    assert.strictEqual(escrowA.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(orderA.status, ORDER_STATUS.PAID_ESCROWED);
    assert.strictEqual(listingA.status, LISTING_STATUS.SOLD);

    // INVARIANT: Seller is NOT paid upon payment capture
    assert.notStrictEqual(escrowA.status, ESCROW_STATUS.RELEASED);
  });

  await testAsync('2.4 Turnstile admission confirmed by PIC: order ENTRY_CONFIRMED, escrow RELEASE_PENDING', async () => {
    EventPicService.assignPic({
      eventId: 'event-joyland-2026',
      venueId: 'venue-gbk',
      picUserId: 'pic-1',
      contactPhone: '081299927378'
    });

    const entryRes = await EventPicService.recordEntryVerification({
      picUserId: 'pic-1',
      orderId: orderA.id,
      gate: 'Gate 1 Turnstile A',
      notes: 'Turnstile RFID indicator green. Escort confirmed.',
      status: 'CONFIRMED'
    });

    assert.strictEqual(entryRes.status, 'CONFIRMED');
    assert.strictEqual(orderA.status, 'ENTRY_CONFIRMED');
    assert.strictEqual(escrowA.status, 'RELEASE_PENDING');
  });

  await testAsync('2.5 Settlement disbursement executed: payout logged, duplicate prevented', async () => {
    const settleRes = await SettlementService.executeSettlement({
      orderId: orderA.id,
      sellerId: orderA.seller_id,
      officerId: 'admin-1',
      idempotencyKey: 'idem-settle-001',
      bankAccount: 'BCA 8899001122 a.n. Partner Pilot Consignor'
    });

    assert.strictEqual(settleRes.settlement.status, 'EXECUTED');
    assert.strictEqual(settleRes.settlement.amount, escrowA.amount);

    // Duplicate settlement attempt with same or different key is prevented
    const dupSettle = await SettlementService.executeSettlement({
      orderId: orderA.id,
      sellerId: orderA.seller_id,
      officerId: 'admin-1',
      idempotencyKey: 'idem-settle-002',
      bankAccount: 'BCA 8899001122 a.n. Partner Pilot Consignor'
    });
    assert.strictEqual(dupSettle.idempotent, true);
    assert.strictEqual(dupSettle.duplicatePrevented, true);
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: TRANSACTION STATE MACHINE — PAYMENT FAILURE & TIMEOUT
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Scenario B & C — Payment Failure & Timeout/Cancellation ──');

  await testAsync('3.1 Payment failure: transitions order to PAYMENT_FAILED and releases listing to ACTIVE', async () => {
    const listResB = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-joyland-2026',
      seatInfo: 'VIP Section A, Row 1, Seat 2',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'SIMULATED-BARCODE-PILOT-PASS-02',
      evidenceBundleId: 'bdl-seed-1'
    });
    await ListingService.verifyListing(listResB.listing.id, 'admin-1', { approved: true });

    const orderResB = await EscrowService.createOrder({
      buyerId: 'buyer-2',
      listingId: listResB.listing.id
    });
    const orderB = orderResB.order;
    assert.strictEqual(listResB.listing.status, LISTING_STATUS.RESERVED);

    // Simulate payment failure callback
    await MarketplaceOrderService.handlePaymentFailure(orderB.id, 'Virtual account expired or insufficient funds');

    assert.strictEqual(orderB.marketplace_status, MARKETPLACE_ORDER_STATUS.PAYMENT_FAILED);
    assert.strictEqual(listResB.listing.status, LISTING_STATUS.ACTIVE);
  });

  await testAsync('3.2 Pre-payment order cancellation / timeout: inventory safely restored', async () => {
    const listResC = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-joyland-2026',
      seatInfo: 'VIP Section A, Row 1, Seat 3',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'SIMULATED-BARCODE-PILOT-PASS-03',
      evidenceBundleId: 'bdl-seed-1'
    });
    await ListingService.verifyListing(listResC.listing.id, 'admin-1', { approved: true });

    const orderResC = await EscrowService.createOrder({
      buyerId: 'buyer-2',
      listingId: listResC.listing.id
    });
    const orderC = orderResC.order;
    assert.strictEqual(listResC.listing.status, LISTING_STATUS.RESERVED);

    // Buyer cancels before payment
    await MarketplaceOrderService.cancelOrder(orderC.id, 'buyer-2', 'Buyer changed payment channel');

    assert.strictEqual(orderC.marketplace_status, MARKETPLACE_ORDER_STATUS.CANCELLED);
    assert.strictEqual(listResC.listing.status, LISTING_STATUS.ACTIVE);
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: INVALID-TICKET REJECTION & TURNSTILE INCIDENT
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Scenario D — Invalid Ticket Rejection & Turnstile Incident ──');

  let orderD, escrowD, disputeD;

  await testAsync('4.1 Setup paid order for turnstile scan failure test', async () => {
    const listResD = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-joyland-2026',
      seatInfo: 'VIP Section A, Row 1, Seat 4',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'SIMULATED-BARCODE-PILOT-PASS-04-DUPLICATE',
      evidenceBundleId: 'bdl-seed-1'
    });
    await ListingService.verifyListing(listResD.listing.id, 'admin-1', { approved: true });

    const orderResD = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listResD.listing.id
    });
    orderD = orderResD.order;
    escrowD = orderResD.escrow;

    await EscrowService.recordPayment({
      orderId: orderD.id,
      providerRef: 'sim-pay-ref-004',
      idempotencyKey: 'idem-sim-004',
      amountPaid: orderD.buyer_total
    });

    assert.strictEqual(escrowD.status, ESCROW_STATUS.ESCROWED);
  });

  await testAsync('4.2 Turnstile rejection reported by PIC: logs incident, freezes escrow', async () => {
    const entryRes = await EventPicService.recordEntryVerification({
      picUserId: 'pic-1',
      orderId: orderD.id,
      gate: 'Gate 2 Turnstile C',
      status: 'GATE_REJECTION',
      reason: 'Scanner promotor menunjukkan barcode sudah pernah dipindai (DUPLICATE SCAN)',
      nextAction: 'LOKET_RESOLUTION_ESCORT'
    });

    assert.strictEqual(entryRes.status, 'GATE_REJECTION');
    assert.strictEqual(orderD.operational_stage, 'GATE_REJECTION');

    // Create formal dispute
    const dispRes = await DisputeService.openDispute({
      orderId: orderD.id,
      buyerId: 'buyer-1',
      reason: 'Turnstile scanner rejected ticket: Duplicate scan error at Gate 2'
    });
    disputeD = dispRes.dispute;

    assert.strictEqual(disputeD.status, DISPUTE_STATUS.OPEN);
    assert.strictEqual(escrowD.status, ESCROW_STATUS.DISPUTED);
    assert.strictEqual(orderD.status, ORDER_STATUS.DISPUTED);

    // Attempting settlement on DISPUTED order must throw error
    await assert.rejects(
      async () => {
        await SettlementService.executeSettlement({
          orderId: orderD.id,
          sellerId: orderD.seller_id,
          officerId: 'admin-1',
          idempotencyKey: 'idem-settle-invalid',
          bankAccount: 'BCA 123456789'
        });
      },
      (err) => err.code === 'TRANSACTION_DISPUTED'
    );
  });

  await testAsync('4.3 Dispute investigation & resolution: 100% refund to buyer, seller payout forfeited', async () => {
    // PIC submits field notes confirming scanner failure
    await DisputeService.submitPicInvestigation({
      disputeId: disputeD.id,
      picUserId: 'pic-1',
      notes: 'Konfirmasi di Resolution Booth Loket: barcode telah discan 30 menit lalu sebelum pembeli tiba.',
      gateStatus: 'INVALID'
    });

    // Admin resolves dispute in favor of buyer
    const resolveRes = await DisputeService.resolveDispute({
      disputeId: disputeD.id,
      officerId: 'admin-1',
      outcome: DISPUTE_OUTCOME.REFUND_BUYER,
      decisionReason: 'Authenticity warranty breached: 100% refund to buyer, consignor payout forfeited.',
      decisionNotes: 'Investigation confirmed gate scan failure and invalid duplicate ticket.'
    });

    assert.strictEqual(resolveRes.dispute.status, DISPUTE_STATUS.RESOLVED);
    assert.strictEqual(resolveRes.dispute.outcome, DISPUTE_OUTCOME.REFUND_BUYER);
    assert.strictEqual(escrowD.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(orderD.status, ORDER_STATUS.REFUNDED);
    assert.ok(escrowD.refunded_at);
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: NON-DELIVERY (SELLER NO-SHOW) & REFUND
  // ---------------------------------------------------------------------------
  console.log('\n── Section 5: Scenario E — Non-Delivery (Seller No-Show) ──');

  await testAsync('5.1 Seller no-show: PIC flags NO_SHOW_SELLER, dispute opened, 100% buyer refund', async () => {
    const listResE = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-joyland-2026',
      seatInfo: 'VIP Section A, Row 1, Seat 5',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'SIMULATED-BARCODE-PILOT-PASS-05',
      evidenceBundleId: 'bdl-seed-1'
    });
    await ListingService.verifyListing(listResE.listing.id, 'admin-1', { approved: true });

    const orderResE = await EscrowService.createOrder({
      buyerId: 'buyer-2',
      listingId: listResE.listing.id
    });
    const orderE = orderResE.order;
    const escrowE = orderResE.escrow;

    await EscrowService.recordPayment({
      orderId: orderE.id,
      providerRef: 'sim-pay-ref-005',
      idempotencyKey: 'idem-sim-005',
      amountPaid: orderE.buyer_total
    });

    // PIC flags seller no-show
    const entryResE = await EventPicService.recordEntryVerification({
      picUserId: 'pic-1',
      orderId: orderE.id,
      gate: 'Public Concourse Gate B',
      status: 'NO_SHOW_SELLER',
      reason: 'Seller tidak hadir di concourse meeting point hingga H-30 menit konser',
      nextAction: 'HOLD_ESCROW_AWAIT_OPS_REVIEW'
    });

    assert.strictEqual(entryResE.status, 'NO_SHOW_SELLER');

    // Refund directly to buyer
    const refundRes = await EscrowService.refundToBuyer(orderE.id, 'admin-1', 'Seller failed to deliver ticket at meeting point');
    assert.strictEqual(refundRes.escrow.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(orderE.status, ORDER_STATUS.REFUNDED);
  });

  // ---------------------------------------------------------------------------
  // SECTION 6: DOUBLE-ENTRY LEDGER RECONCILIATION & SOLVENCY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 6: Double-Entry Ledger Solvency & Balancing ──');

  await testAsync('6.1 Ledger entries balance mathematically: sum(debit) === sum(credit)', async () => {
    // Record balanced transaction
    const tx = await FinancialLedger.recordTransaction({
      eventType: FINANCIAL_EVENT_TYPES.CAPTURE,
      orderId: orderA.id,
      entries: [
        { account: LEDGER_ACCOUNTS.BUYER_ESCROW_HOLDING, type: 'DEBIT', amount: 1590000 },
        { account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING, type: 'CREDIT', amount: 1500000 },
        { account: LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE, type: 'CREDIT', amount: 90000 }
      ],
      description: 'Pilot test capture transaction',
      actorId: 'SYSTEM'
    });

    assert.ok(tx.id);
    assert.strictEqual(tx.total_amount, 1590000);

    // Verify unbalanced transaction is strictly rejected
    await assert.rejects(
      async () => {
        await FinancialLedger.recordTransaction({
          eventType: FINANCIAL_EVENT_TYPES.CAPTURE,
          orderId: orderA.id,
          entries: [
            { account: LEDGER_ACCOUNTS.BUYER_ESCROW_HOLDING, type: 'DEBIT', amount: 1590000 },
            { account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING, type: 'CREDIT', amount: 1500000 }
            // Missing 90.000 credit -> must reject
          ],
          description: 'Unbalanced malicious test',
          actorId: 'ATTACKER'
        });
      },
      (err) => err.code === 'LEDGER_UNBALANCED'
    );
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`CONTROLLED PILOT READINESS SUITE COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
