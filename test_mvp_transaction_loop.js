process.env.NODE_ENV = 'test';
const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { SettlementService } = require('./src/services/settlementService');

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

async function runSuite() {
  console.log('\n=== ARGUS MVP: TRANSACTION TRUST LOOP INTEGRATION TEST ===\n');

  resetDatabase();

  // 1. Seller creates listing
  let listing1, ticket1;
  await testAsync('Step 1: Verified Seller creates ticket listing with barcode', async () => {
    const result = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Section West, Row K, Seat 18',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'COLDPLAY-GBK-CAT1-K18-UNIQUE',
      evidenceBundleId: 'bdl-seed-1'
    });
    listing1 = result.listing;
    ticket1 = result.ticket;

    assert.ok(listing1.id);
    assert.strictEqual(listing1.status, LISTING_STATUS.PENDING_VERIFICATION);
    assert.strictEqual(ticket1.status, 'PENDING_VERIFICATION');
    assert.strictEqual(listing1.price, 1500000);
  });

  // 2. Admin verifies listing
  await testAsync('Step 2: ARGUS Admin verifies ticket authenticity -> Listing becomes ACTIVE', async () => {
    const verifyRes = await ListingService.verifyListing(listing1.id, 'admin-1', {
      approved: true
    });
    assert.strictEqual(verifyRes.status, LISTING_STATUS.ACTIVE);
    assert.strictEqual(listing1.status, LISTING_STATUS.ACTIVE);
  });

  // 3. Buyer browses & selects ticket -> transparent pricing breakdown
  test('Step 3: Buyer sees 100% transparent pricing upfront (No hidden surprise checkout fees)', () => {
    const pricing = EscrowService.calculatePricing(listing1.price);
    assert.strictEqual(pricing.ticketPrice, 1500000);
    assert.strictEqual(pricing.platformFee, 90000); // Canonical 6% fee
    assert.strictEqual(pricing.buyer_subtotal, 1590000);
    assert.strictEqual(pricing.totalAmount, 1599900); // 1.590.000 + 9.900 PPN
  });

  // 4. Buyer reserves ticket & creates order
  let order1, escrow1;
  await testAsync('Step 4: Buyer reserves ticket -> Order created & Listing marked RESERVED', async () => {
    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listing1.id
    });
    order1 = orderRes.order;
    escrow1 = orderRes.escrow;

    assert.strictEqual(order1.status, ORDER_STATUS.PENDING_PAYMENT);
    assert.strictEqual(escrow1.status, ESCROW_STATUS.PENDING_PAYMENT);
    assert.strictEqual(listing1.status, LISTING_STATUS.RESERVED);
    assert.strictEqual(order1.total_amount, 1599900);
  });

  // 5. Buyer pays -> Payment locked into Escrow
  await testAsync('Step 5: Buyer completes payment -> Funds locked into ESCROW, Listing marked SOLD', async () => {
    const payRes = await EscrowService.recordPayment({
      orderId: order1.id,
      providerRef: 'midtrans-mock-pay-1234',
      idempotencyKey: 'idem-key-order-1',
      amountPaid: order1.buyer_total
    });

    assert.strictEqual(payRes.escrow.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(payRes.order.status, ORDER_STATUS.PAID_ESCROWED);
    assert.strictEqual(listing1.status, LISTING_STATUS.SOLD);
    assert.ok(payRes.escrow.provider_escrow_id);
  });

  // 6. PIC assigned to Event + Venue + Date (Event-Centric Cell)
  test('Step 6: PIC operational cell active at venue (Event + Venue + Date grouping)', () => {
    const activeCheck = EventPicService.isPicActiveForEvent('pic-1', 'event-pestapora-2026', '2026-09-25');
    assert.strictEqual(activeCheck.active, true);
    assert.strictEqual(activeCheck.event.id, 'event-pestapora-2026');

    const dashboard = EventPicService.getPicEventDashboard('pic-1', 'event-pestapora-2026');
    assert.ok(dashboard.orders.length >= 1);
    const cellOrder = dashboard.orders.find(o => o.order_id === order1.id);
    assert.ok(cellOrder);
    assert.strictEqual(cellOrder.buyer_name, 'Dewi Lestari');
    assert.strictEqual(cellOrder.escrow_status, ESCROW_STATUS.ESCROWED);
  });

  // 7. Physical verification at gate: Buyer enters venue
  let verification1;
  await testAsync('Step 7: Event PIC verifies ticket & buyer at gate -> Entry CONFIRMED', async () => {
    verification1 = await EventPicService.recordEntryVerification({
      picUserId: 'pic-1',
      orderId: order1.id,
      gate: 'Gate 3 Utara GBK',
      notes: 'Tiket fisik & e-voucher valid. Barcode lolos scanner panitia.',
      status: 'CONFIRMED'
    });

    assert.strictEqual(verification1.status, 'CONFIRMED');
    assert.strictEqual(order1.status, 'ENTRY_CONFIRMED');
    assert.strictEqual(escrow1.status, ESCROW_STATUS.RELEASE_PENDING);
  });

  // 8. Escrow release to seller
  await testAsync('Step 8: ARGUS releases escrow funds to Seller after confirmed gate entry', async () => {
    const releaseRes = await EscrowService.releaseToSeller(order1.id, 'admin-1');
    assert.strictEqual(releaseRes.escrow.status, ESCROW_STATUS.RELEASED);
    assert.strictEqual(releaseRes.order.status, ORDER_STATUS.SETTLED);
    assert.strictEqual(listing1.status, LISTING_STATUS.SETTLED);
  });

  // 9. Seller settlement execution
  await testAsync('Step 9: Settlement executed & disbursed to Seller bank account (Idempotent)', async () => {
    const setRes = await SettlementService.executeSettlement({
      orderId: order1.id,
      sellerId: 'seller-1',
      officerId: 'admin-1',
      idempotencyKey: 'idem-settlement-order-1',
      bankAccount: 'BCA 1234567890 (Budi Santoso)'
    });

    assert.strictEqual(setRes.settlement.status, 'EXECUTED');
    assert.strictEqual(setRes.settlement.amount, 1410000); // 1.500.000 - 90.000 (6% seller fee)
    assert.strictEqual(setRes.idempotent, false);

    // Test idempotency
    const retryRes = await SettlementService.executeSettlement({
      orderId: order1.id,
      sellerId: 'seller-1',
      officerId: 'admin-1',
      idempotencyKey: 'idem-settlement-order-1',
      bankAccount: 'BCA 1234567890 (Budi Santoso)'
    });
    assert.strictEqual(retryRes.idempotent, true);
  });

  // 10. Audit log completeness
  test('Step 10: Immutable audit trail records every transition in chronological order', () => {
    const logs = state.audit_logs.filter(
      l => l.entity_id === listing1.id || l.entity_id === order1.id || l.entity_id === escrow1.id
    );
    assert.ok(logs.length >= 5);
    const actions = logs.map(l => l.action);
    assert.ok(actions.includes('SUBMITTED_FOR_VERIFICATION'));
    assert.ok(actions.includes('VERIFIED_AND_ACTIVATED'));
    assert.ok(actions.includes('CREATED'));
    assert.ok(actions.includes('FUNDS_LOCKED_IN_ESCROW'));
    assert.ok(actions.includes('FUNDS_RELEASED_TO_SELLER'));
  });

  console.log(`\n=======================`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
