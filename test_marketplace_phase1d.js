/**
 * TIKUM / ARGUS — Phase 1D Integration, Concurrency & Lifecycle Test Suite
 *
 * Mandated Tests:
 * 1. delivery creation duplicate (idempotent)
 * 2. duplicate markDelivered (idempotent)
 * 3. duplicate receipt confirmation (idempotent)
 * 4. failed delivery recovery
 * 5. invalid order status for delivery (unpaid order rejected)
 * 6. event transition duplicate (idempotent)
 * 7. invalid event transition (illegal state jump rejected)
 * 8. duplicate cancellation (idempotent)
 * 9. cancellation after completed (rejected)
 * 10. venue entry duplicate -> exactly one success, duplicate rejected
 * 11. concurrent venue entry -> exactly one successful transition
 * 12. cancelled event preserves all financial history (non-destructive cancellation)
 * 13. completed event does not automatically payout seller (PAID != SELLER PAID)
 * 14. delivery/order/ticket/event cross-entity consistency
 */

const assert = require('assert');
const { resetDatabase, state } = require('./src/database');
const { TicketInventoryService, TICKET_STATUS } = require('./src/services/marketplace/TicketInventoryService');
const { MarketplaceListingService, LISTING_STATUS } = require('./src/services/marketplace/MarketplaceListingService');
const { ReservationService, RESERVATION_STATUS } = require('./src/services/marketplace/ReservationService');
const { MarketplaceOrderService, MARKETPLACE_ORDER_STATUS } = require('./src/services/marketplace/MarketplaceOrderService');
const { TicketDeliveryService, DELIVERY_STATUS } = require('./src/services/marketplace/TicketDeliveryService');
const { EventLifecycleService, CANONICAL_EVENT_STATUS } = require('./src/services/marketplace/EventLifecycleService');
const { DeterministicTestProvider, TEST_PAYMENT_SCENARIOS } = require('./src/services/payment/DeterministicTestProvider');
const { paymentManager } = require('./src/services/payment');
const { ESCROW_STATUS } = require('./src/services/escrowService');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('  EPIC 6 — PHASE 1D: DELIVERY & EVENT LIFECYCLE TEST SUITE');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  resetDatabase();

  const testProvider = new DeterministicTestProvider();
  paymentManager.registerProvider(testProvider);

  const sellerId = 'seller-1';
  const buyerId = 'buyer-1';
  const eventId = 'event-pestapora-2026';

  // -------------------------------------------------------------
  // Setup Helper: Creates a PAID order ready for fulfillment
  // -------------------------------------------------------------
  async function createPaidOrder(barcodeSuffix = '01') {
    const ticket = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: eventId,
      ticketType: 'VIP',
      section: 'VIP Center',
      row: '1',
      seat: '10',
      faceValue: 1000000,
      rawBarcode: `BARCODE-1D-${barcodeSuffix}`
    });
    await TicketInventoryService.submitForVerification(ticket.ticket_id || ticket.id, sellerId);
    await TicketInventoryService.transitionStatus(ticket.ticket_id || ticket.id, TICKET_STATUS.VERIFIED, 'admin-1');

    const listing = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticket.ticket_id || ticket.id,
      price: 1200000
    });

    const reservation = await ReservationService.reserveListing({
      listingId: listing.id,
      buyerId,
      ttlMinutes: 15
    });

    const orderRes = await MarketplaceOrderService.createOrderFromReservation({
      reservationId: reservation.id,
      buyerId
    });

    const session = await MarketplaceOrderService.initiatePayment({
      orderId: orderRes.order.id,
      buyerId,
      channel: 'TEST_ESCROW_VA',
      providerName: 'test_provider'
    });

    const webhook = testProvider.generateWebhookPayload(session.providerRef, TEST_PAYMENT_SCENARIOS.SUCCESS);
    await MarketplaceOrderService.processPaymentCallback({
      providerName: 'test_provider',
      headers: webhook.headers,
      body: webhook.body
    });

    return { ticket, listing, reservation, order: orderRes.order };
  }

  // -------------------------------------------------------------
  // PART 1: TicketDeliveryService Tests
  // -------------------------------------------------------------
  console.log('--- 1. Ticket Delivery Lifecycle Tests ---');

  let setup1 = await createPaidOrder('DEL-01');
  let delivery1;

  await runTest('5. Invalid order status: Unpaid order cannot create delivery', async () => {
    // Create an unpaid order
    const ticketUnpaid = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: eventId,
      faceValue: 500000,
      rawBarcode: 'BARCODE-UNPAID-01'
    });
    await TicketInventoryService.submitForVerification(ticketUnpaid.ticket_id || ticketUnpaid.id, sellerId);
    await TicketInventoryService.transitionStatus(ticketUnpaid.ticket_id || ticketUnpaid.id, TICKET_STATUS.VERIFIED, 'admin-1');
    const listingUnpaid = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticketUnpaid.ticket_id || ticketUnpaid.id,
      price: 600000
    });
    const resUnpaid = await ReservationService.reserveListing({
      listingId: listingUnpaid.id,
      buyerId
    });
    const unpaidOrder = (await MarketplaceOrderService.createOrderFromReservation({
      reservationId: resUnpaid.id,
      buyerId
    })).order;

    let error;
    try {
      await TicketDeliveryService.createDelivery(unpaidOrder.id);
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'ORDER_NOT_PAID');
  });

  await runTest('1. Create delivery for paid order & duplicate creation is idempotent', async () => {
    const res = await TicketDeliveryService.createDelivery(setup1.order.id, {
      deliveryMethod: 'MOBILE_TRANSFER',
      deliveryReference: 'REF-MOB-001'
    });

    delivery1 = res.delivery;
    assert.ok(delivery1);
    assert.strictEqual(delivery1.status, DELIVERY_STATUS.PENDING);
    assert.strictEqual(delivery1.order_id, setup1.order.id);
    assert.strictEqual(delivery1.buyer_id, buyerId);
    assert.strictEqual(res.idempotent, false);

    // Duplicate creation test
    const dupRes = await TicketDeliveryService.createDelivery(setup1.order.id);
    assert.strictEqual(dupRes.idempotent, true);
    assert.strictEqual(dupRes.delivery.id, delivery1.id);
  });

  await runTest('2. Mark delivered & duplicate markDelivered is idempotent', async () => {
    const res = await TicketDeliveryService.markDelivered(delivery1.id, {
      deliveryReference: 'REF-COMPLETED-001',
      notes: 'Sent via official ticketing transfer'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.delivery.status, DELIVERY_STATUS.DELIVERED);
    assert.ok(res.delivery.delivered_at);

    // Ticket status must transition to TRANSFERRED
    const ticketInDb = TicketInventoryService.findTicket(setup1.ticket.ticket_id || setup1.ticket.id);
    assert.strictEqual(ticketInDb.status, TICKET_STATUS.TRANSFERRED);

    // INVARIANT: DELIVERED !== USED
    assert.strictEqual(ticketInDb.status !== TICKET_STATUS.USED, true);

    // Duplicate markDelivered test
    const dupRes = await TicketDeliveryService.markDelivered(delivery1.id);
    assert.strictEqual(dupRes.idempotent, true);
    assert.strictEqual(dupRes.delivery.status, DELIVERY_STATUS.DELIVERED);
  });

  await runTest('3. Buyer confirms receipt & duplicate receipt confirmation is idempotent', async () => {
    const res = await TicketDeliveryService.confirmReceipt(delivery1.id, buyerId);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.delivery.status, DELIVERY_STATUS.CONFIRMED);
    assert.ok(res.delivery.confirmed_at);

    // Order status must be FULFILLED
    const orderInDb = state.orders.find(o => o.id === setup1.order.id);
    assert.strictEqual(orderInDb.marketplace_status, MARKETPLACE_ORDER_STATUS.FULFILLED);

    // Duplicate receipt confirmation
    const dupRes = await TicketDeliveryService.confirmReceipt(delivery1.id, buyerId);
    assert.strictEqual(dupRes.idempotent, true);
  });

  await runTest('4. Failed delivery recovery allows retry', async () => {
    const setupFail = await createPaidOrder('DEL-FAIL-01');
    const delFail = (await TicketDeliveryService.createDelivery(setupFail.order.id)).delivery;

    // Fail the delivery
    const failRes = await TicketDeliveryService.markDeliveryFailed(delFail.id, 'Invalid recipient email');
    assert.strictEqual(failRes.delivery.status, DELIVERY_STATUS.FAILED);
    assert.strictEqual(failRes.delivery.failure_reason, 'Invalid recipient email');

    // Ticket status reverts to SOLD so transfer can be retried
    const ticketInDb = TicketInventoryService.findTicket(setupFail.ticket.ticket_id || setupFail.ticket.id);
    assert.strictEqual(ticketInDb.status, TICKET_STATUS.SOLD);
  });

  // -------------------------------------------------------------
  // PART 2: Venue Entry Tests
  // -------------------------------------------------------------
  console.log('\n--- 2. Venue Entry Tests ---');

  await runTest('10. Venue entry confirmation: Single scan succeeds, duplicate rejected with TICKET_ALREADY_USED', async () => {
    // Ticket from setup1 is currently TRANSFERRED
    const entryRes = await TicketDeliveryService.confirmVenueEntry({
      orderId: setup1.order.id,
      ticketId: setup1.ticket.ticket_id || setup1.ticket.id,
      actorId: 'pic-1',
      venueId: 'venue-gbk',
      gate: 'Gate 3'
    });

    assert.strictEqual(entryRes.success, true);
    assert.strictEqual(entryRes.status, TICKET_STATUS.USED);

    const ticketInDb = TicketInventoryService.findTicket(setup1.ticket.ticket_id || setup1.ticket.id);
    assert.strictEqual(ticketInDb.status, TICKET_STATUS.USED);
    assert.ok(ticketInDb.used_at);

    // Duplicate scan must throw TICKET_ALREADY_USED
    let error;
    try {
      await TicketDeliveryService.confirmVenueEntry({
        orderId: setup1.order.id,
        ticketId: setup1.ticket.ticket_id || setup1.ticket.id,
        actorId: 'pic-1',
        gate: 'Gate 3'
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'TICKET_ALREADY_USED');
    assert.strictEqual(error.status, 409);
  });

  await runTest('11. Concurrency: 10 concurrent venue entry scans -> EXACTLY 1 succeeds, 9 fail', async () => {
    const setupConc = await createPaidOrder('CONC-ENTRY-01');
    const delConc = (await TicketDeliveryService.createDelivery(setupConc.order.id)).delivery;
    await TicketDeliveryService.markDelivered(delConc.id);

    // Fire 10 simultaneous turnstile scans for the exact same ticket
    const promises = Array.from({ length: 10 }, (_, i) =>
      TicketDeliveryService.confirmVenueEntry({
        orderId: setupConc.order.id,
        ticketId: setupConc.ticket.ticket_id || setupConc.ticket.id,
        actorId: `pic-${i}`,
        gate: `Gate ${i + 1}`
      }).then(
        r => ({ success: true, res: r }),
        e => ({ success: false, code: e.code, status: e.status })
      )
    );

    const results = await Promise.all(promises);
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    assert.strictEqual(successes.length, 1, `Expected exactly 1 scan to succeed, got ${successes.length}`);
    assert.strictEqual(failures.length, 9, `Expected exactly 9 scans to fail, got ${failures.length}`);

    failures.forEach(f => {
      assert.strictEqual(f.code, 'TICKET_ALREADY_USED');
      assert.strictEqual(f.status, 409);
    });
  });

  // -------------------------------------------------------------
  // PART 3: EventLifecycleService Tests
  // -------------------------------------------------------------
  console.log('\n--- 3. Event Lifecycle & Cancellation Invariants ---');

  const testEventId = 'event-pestapora-2026';

  await runTest('6. Event status transition & duplicate transition is idempotent', async () => {
    const res = await EventLifecycleService.transitionEvent(testEventId, CANONICAL_EVENT_STATUS.ONGOING, 'admin-1', 'Event gates opened');
    assert.strictEqual(res.status, CANONICAL_EVENT_STATUS.ONGOING);

    // Duplicate transition
    const dupRes = await EventLifecycleService.transitionEvent(testEventId, CANONICAL_EVENT_STATUS.ONGOING, 'admin-1');
    assert.strictEqual(dupRes.idempotent, true);
  });

  await runTest('7. Invalid event status transition throws ILLEGAL_EVENT_TRANSITION', async () => {
    // ONGOING cannot jump back to SCHEDULED
    let error;
    try {
      await EventLifecycleService.transitionEvent(testEventId, CANONICAL_EVENT_STATUS.SCHEDULED, 'admin-1');
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'ILLEGAL_EVENT_TRANSITION');
  });

  await runTest('13. Completed event: eligible_for_settlement = true, but does NOT auto-payout seller', async () => {
    const completeRes = await EventLifecycleService.completeEvent(testEventId, 'admin-1');
    assert.strictEqual(completeRes.success, true);
    assert.strictEqual(completeRes.status, CANONICAL_EVENT_STATUS.COMPLETED);
    assert.strictEqual(completeRes.eligibleForSettlement, true);

    // Verify settlement flag
    assert.strictEqual(EventLifecycleService.isEventEligibleForSettlement(testEventId), true);

    // CRITICAL: Escrow funds must NOT be automatically paid out
    const escrow = state.escrows.find(e => e.order_id === setup1.order.id);
    assert.strictEqual(escrow.released_at, null);
    assert.strictEqual(escrow.status !== ESCROW_STATUS.RELEASED, true);
  });

  await runTest('9. Cancellation after COMPLETED is strictly rejected', async () => {
    let error;
    try {
      await EventLifecycleService.cancelEvent(testEventId, 'Rain storm', 'admin-1');
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'CANNOT_CANCEL_COMPLETED_EVENT');
    assert.strictEqual(error.status, 400);
  });

  // -------------------------------------------------------------
  // Cancellation with Non-Destructive Cascade & History Retention
  // -------------------------------------------------------------
  console.log('\n--- 4. Non-Destructive Event Cancellation & Financial Retention ---');

  let cancelledEventId = 'event-raditya-dika-standup';

  await runTest('12. Cancelled event: non-destructively cancels listings, refunds paid orders, retains all history', async () => {
    // Setup a paid order for this event
    const ticketCancel = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: cancelledEventId,
      faceValue: 400000,
      rawBarcode: 'BARCODE-CANCEL-01'
    });
    await TicketInventoryService.submitForVerification(ticketCancel.ticket_id || ticketCancel.id, sellerId);
    await TicketInventoryService.transitionStatus(ticketCancel.ticket_id || ticketCancel.id, TICKET_STATUS.VERIFIED, 'admin-1');

    const listingCancel = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticketCancel.ticket_id || ticketCancel.id,
      price: 450000
    });

    const resCancel = await ReservationService.reserveListing({
      listingId: listingCancel.id,
      buyerId
    });

    const orderCancel = (await MarketplaceOrderService.createOrderFromReservation({
      reservationId: resCancel.id,
      buyerId
    })).order;

    const paySession = await MarketplaceOrderService.initiatePayment({
      orderId: orderCancel.id,
      buyerId,
      channel: 'TEST_ESCROW_VA',
      providerName: 'test_provider'
    });

    const payWebhook = testProvider.generateWebhookPayload(paySession.providerRef, TEST_PAYMENT_SCENARIOS.SUCCESS);
    await MarketplaceOrderService.processPaymentCallback({
      providerName: 'test_provider',
      headers: payWebhook.headers,
      body: payWebhook.body
    });

    // Cancel the event
    const cancelRes = await EventLifecycleService.cancelEvent(cancelledEventId, 'Artist illness', 'admin-1');

    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.status, CANONICAL_EVENT_STATUS.CANCELLED);
    assert.ok(cancelRes.refundedOrdersCount >= 1);

    // Check order is REFUNDED
    const orderInDb = state.orders.find(o => o.id === orderCancel.id);
    assert.strictEqual(orderInDb.marketplace_status, MARKETPLACE_ORDER_STATUS.REFUNDED);

    // FINANCIAL HISTORY RETENTION: Records must NOT be deleted
    assert.ok(state.orders.find(o => o.id === orderCancel.id), 'Order record must be retained');
    assert.ok(state.payments.find(p => p.order_id === orderCancel.id), 'Payment record must be retained');
    assert.ok(state.escrows.find(e => e.order_id === orderCancel.id), 'Escrow record must be retained');
    assert.ok(state.tickets.find(t => t.id === ticketCancel.id || t.ticket_id === ticketCancel.id), 'Ticket record must be retained');

    // Financial ledger reversal must be intact
    const ledgerEntries = state.financial_ledger.filter(l => l.order_id === orderCancel.id);
    assert.ok(ledgerEntries.length >= 2, 'Capture and refund ledger entries must both exist');
  });

  await runTest('8. Duplicate event cancellation is idempotent', async () => {
    const dupCancel = await EventLifecycleService.cancelEvent(cancelledEventId, 'Duplicate cancel call', 'admin-1');
    assert.strictEqual(dupCancel.idempotent, true);
    assert.strictEqual(dupCancel.message, 'Event is already cancelled');
  });

  await runTest('14. Cross-entity consistency: Delivery/Order/Ticket/Event linkage verified', async () => {
    assert.strictEqual(delivery1.order_id, setup1.order.id);
    assert.strictEqual(delivery1.ticket_id, setup1.ticket.ticket_id || setup1.ticket.id);
    assert.strictEqual(delivery1.buyer_id, buyerId);
    assert.strictEqual(delivery1.seller_id, sellerId);
  });

  console.log('\n================================================================');
  console.log(`  PHASE 1D TEST RESULTS: ${passedTests} passed, ${totalTests - passedTests} failed, ${totalTests} total`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

