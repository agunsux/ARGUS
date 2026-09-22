process.env.NODE_ENV = 'test';
const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('./src/services/disputeService');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}

async function runDisputeSuite() {
  console.log('\n=== ARGUS MVP: DISPUTE RESOLUTION LOOP INTEGRATION TEST ===\n');

  // =========================================================================
  // SCENARIO 1: TICKET INVALID AT GATE -> INVESTIGATION -> REFUND BUYER
  // =========================================================================
  console.log('--- SCENARIO 1: Invalid Ticket -> Full Buyer Refund ---\n');
  resetDatabase();

  let listing1, order1, escrow1, dispute1;

  await testAsync('Setup: Verified Listing & Paid Escrow Order', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Section West, Row A, Seat 1',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-SCENARIO-1',
      evidenceBundleId: 'bdl-seed-1'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });
    listing1 = listRes.listing;

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listing1.id
    });
    order1 = orderRes.order;
    escrow1 = orderRes.escrow;

    await EscrowService.recordPayment({
      orderId: order1.id,
      providerRef: 'pay-ref-disp-1',
      idempotencyKey: 'idem-disp-1',
      amountPaid: 1650000
    });

    assert.strictEqual(escrow1.status, ESCROW_STATUS.ESCROWED);
  });

  await testAsync('Step 1: Buyer reports "TICKET INVALID" at venue gate -> Dispute created in OPEN state', async () => {
    const dispRes = await DisputeService.openDispute({
      orderId: order1.id,
      buyerId: 'buyer-1',
      reason: 'Scanner panitia menolak tiket: Barcode has already been scanned by another attendee'
    });
    dispute1 = dispRes.dispute;

    assert.strictEqual(dispute1.status, DISPUTE_STATUS.OPEN);
    assert.strictEqual(dispute1.order_id, order1.id);
    assert.strictEqual(escrow1.status, ESCROW_STATUS.DISPUTED);
    assert.strictEqual(order1.status, ORDER_STATUS.DISPUTED);
  });

  await testAsync('Step 2: Event PIC investigates at gate, submits photos & field notes -> DECISION_PENDING', async () => {
    const picRes = await DisputeService.submitPicInvestigation({
      disputeId: dispute1.id,
      picUserId: 'pic-1',
      notes: 'Petugas panitia gate mengonfirmasi barcode duplikat telah dipakai masuk 15 menit lalu oleh orang lain. Foto layar scanner panitia terlampir.',
      evidenceBundleId: 'bdl-gate-scan-evidence',
      gateStatus: 'INVALID'
    });

    assert.strictEqual(picRes.status, DISPUTE_STATUS.DECISION_PENDING);
    assert.strictEqual(picRes.pic_id, 'pic-1');
    assert.ok(picRes.pic_notes.includes('barcode duplikat'));

    const verification = state.entry_verifications.find(ev => ev.order_id === order1.id);
    assert.ok(verification);
    assert.strictEqual(verification.status, 'INVALID');
  });

  test('Step 3: ARGUS Admin inspects complete evidence dossier', () => {
    const dossier = DisputeService.getDisputeDossier(dispute1.id);
    assert.ok(dossier);
    assert.strictEqual(dossier.buyer.id, 'buyer-1');
    assert.strictEqual(dossier.seller.id, 'seller-1');
    assert.strictEqual(dossier.event.id, 'event-pestapora-2026');
    assert.strictEqual(dossier.entryVerifications[0].status, 'INVALID');
    assert.ok(dossier.auditLogs.length >= 3);
  });

  await testAsync('Step 4: ARGUS Admin resolves dispute: REFUND_BUYER -> Escrow refunded, Seller gets 0', async () => {
    const resolveRes = await DisputeService.resolveDispute({
      disputeId: dispute1.id,
      officerId: 'admin-1',
      outcome: DISPUTE_OUTCOME.REFUND_BUYER,
      decisionReason: 'Bukti scanner panitia valid: seller menjual tiket yang sudah dipakai orang lain',
      decisionNotes: 'Refund 100% senilai Rp 1.650.000 ke buyer. Seller ditandai penalti.'
    });

    assert.strictEqual(resolveRes.dispute.status, DISPUTE_STATUS.RESOLVED);
    assert.strictEqual(resolveRes.dispute.outcome, DISPUTE_OUTCOME.REFUND_BUYER);
    assert.strictEqual(escrow1.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(order1.status, ORDER_STATUS.REFUNDED);
    assert.ok(escrow1.refunded_at);
  });

  // =========================================================================
  // SCENARIO 2: FALSE BUYER CLAIM -> PIC PROVES VALID -> RELEASE SELLER
  // =========================================================================
  console.log('\n--- SCENARIO 2: False Claim / Genuine Ticket -> Release to Seller ---\n');

  let listing2, order2, escrow2, dispute2;

  await testAsync('Setup Scenario 2: Verified Listing & Paid Escrow Order', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Section West, Row B, Seat 2',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-SCENARIO-2',
      evidenceBundleId: 'bdl-seed-1'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });
    listing2 = listRes.listing;

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listing2.id
    });
    order2 = orderRes.order;
    escrow2 = orderRes.escrow;

    await EscrowService.recordPayment({
      orderId: order2.id,
      providerRef: 'pay-ref-disp-2',
      idempotencyKey: 'idem-disp-2',
      amountPaid: 1650000
    });

    assert.strictEqual(escrow2.status, ESCROW_STATUS.ESCROWED);
  });

  await testAsync('Step 2.1: Buyer falsely opens dispute claiming gate issue', async () => {
    const dispRes = await DisputeService.openDispute({
      orderId: order2.id,
      buyerId: 'buyer-1',
      reason: 'Gate menolak tiket saya'
    });
    dispute2 = dispRes.dispute;
    assert.strictEqual(dispute2.status, DISPUTE_STATUS.OPEN);
  });

  await testAsync('Step 2.2: Event PIC investigates and finds buyer was at wrong gate; escorted to correct gate and entered successfully', async () => {
    await DisputeService.submitPicInvestigation({
      disputeId: dispute2.id,
      picUserId: 'pic-1',
      notes: 'Buyer salah gate (berdiri di Gate Barat padahal tiket Gate Utara). Didampingi ke Gate Utara, barcode terverifikasi valid dan buyer berhasil masuk.',
      evidenceBundleId: 'bdl-escort-success',
      gateStatus: 'CONFIRMED'
    });
    assert.strictEqual(dispute2.status, DISPUTE_STATUS.DECISION_PENDING);
  });

  await testAsync('Step 2.3: ARGUS Admin resolves dispute: RELEASE_SELLER -> Seller receives payment', async () => {
    const resolveRes = await DisputeService.resolveDispute({
      disputeId: dispute2.id,
      officerId: 'admin-1',
      outcome: DISPUTE_OUTCOME.RELEASE_SELLER,
      decisionReason: 'PIC mengonfirmasi tiket valid dan mendampingi buyer hingga berhasil masuk venue',
      decisionNotes: 'Dana seller dilepas.'
    });

    assert.strictEqual(resolveRes.dispute.status, DISPUTE_STATUS.RESOLVED);
    assert.strictEqual(resolveRes.dispute.outcome, DISPUTE_OUTCOME.RELEASE_SELLER);
    assert.strictEqual(escrow2.status, ESCROW_STATUS.RELEASED);
    assert.strictEqual(order2.status, ORDER_STATUS.SETTLED);
  });

  console.log(`\n=======================`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) process.exit(1);
}

runDisputeSuite().catch(err => {
  console.error('Dispute Suite Failed:', err);
  process.exit(1);
});

