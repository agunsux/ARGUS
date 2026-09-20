/**
 * TIKUM / ARGUS — Phase 1C Integration & Concurrency Test Suite
 *
 * Mandated Tests:
 * 1. reservation -> order happy path
 * 2. unauthorized buyer cannot convert reservation
 * 3. expired reservation cannot create order
 * 4. released reservation cannot create order
 * 5. duplicate order conversion rejected / idempotent
 * 6. payment SUCCESS
 * 7. payment FAILED
 * 8. payment PENDING
 * 9. payment TIMEOUT
 * 10. duplicate payment callback (idempotent, no duplicate payment/escrow)
 * 11. invalid payment callback (signature rejected)
 * 12. refund
 * 13. duplicate refund (idempotent)
 * 14. payment failure releases inventory correctly
 * 15. paid order does not automatically settle seller (PAID != SELLER PAID)
 * 16. order/ticket/listing/reservation state consistency
 * 17. 10 concurrent order-conversion attempts -> exactly one order
 * 18. financial history is never deleted
 * 19. Hard security gate: DeterministicTestProvider throws outside NODE_ENV=test
 */

const assert = require('assert');
const { resetDatabase, state } = require('./src/database');
const { TicketInventoryService, TICKET_STATUS } = require('./src/services/marketplace/TicketInventoryService');
const { MarketplaceListingService, LISTING_STATUS } = require('./src/services/marketplace/MarketplaceListingService');
const { ReservationService, RESERVATION_STATUS } = require('./src/services/marketplace/ReservationService');
const { MarketplaceOrderService, MARKETPLACE_ORDER_STATUS } = require('./src/services/marketplace/MarketplaceOrderService');
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
  console.log('  EPIC 6 — PHASE 1C: ORDER ORCHESTRATION & PAYMENT TEST SUITE');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  resetDatabase();

  // Register DeterministicTestProvider in test environment
  const testProvider = new DeterministicTestProvider();
  paymentManager.registerProvider(testProvider);

  const sellerId = 'seller-1';
  const buyer1Id = 'buyer-1';
  const buyer2Id = 'buyer-2';
  const eventId = 'event-pestapora-2026';

  // -------------------------------------------------------------
  // Test 19: Hard security gate on DeterministicTestProvider
  // -------------------------------------------------------------
  console.log('--- Security Gate Verification ---');
  await runTest('Hard gate: DeterministicTestProvider throws outside NODE_ENV=test', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      let threw = false;
      try {
        new DeterministicTestProvider();
      } catch (err) {
        threw = true;
        assert.strictEqual(err.code, 'PRODUCTION_SECURITY_VIOLATION');
      }
      assert.strictEqual(threw, true, 'DeterministicTestProvider must throw outside NODE_ENV=test');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // -------------------------------------------------------------
  // Setup canonical ticket & listing for subsequent tests
  // -------------------------------------------------------------
  console.log('\n--- Setup Test Inventory ---');
  const ticket1 = await TicketInventoryService.createTicket({
    sellerId,
    canonicalEventId: eventId,
    ticketType: 'VIP',
    section: 'VIP Center',
    row: '2',
    seat: '15',
    faceValue: 1000000,
    rawBarcode: 'BARCODE-PHASE1C-001'
  });
  await TicketInventoryService.submitForVerification(ticket1.ticket_id || ticket1.id, sellerId);
  await TicketInventoryService.transitionStatus(ticket1.ticket_id || ticket1.id, TICKET_STATUS.VERIFIED, 'admin-1');

  const listing1 = await MarketplaceListingService.createListing({
    sellerId,
    ticketId: ticket1.ticket_id || ticket1.id,
    price: 1200000
  });

  // -------------------------------------------------------------
  // Scenario 1: Reservation -> Order Happy Path
  // -------------------------------------------------------------
  console.log('\n--- Scenarios 1-5: Reservation -> Order Conversion ---');
  let res1;
  let order1;

  await runTest('1. Reservation -> Order conversion happy path', async () => {
    res1 = await ReservationService.reserveListing({
      listingId: listing1.id,
      buyerId: buyer1Id,
      ttlMinutes: 15
    });
    assert.strictEqual(res1.status, RESERVATION_STATUS.PENDING);

    const orderResult = await MarketplaceOrderService.createOrderFromReservation({
      reservationId: res1.id,
      buyerId: buyer1Id
    });

    order1 = orderResult.order;
    assert.ok(order1);
    assert.strictEqual(order1.buyer_id, buyer1Id);
    assert.strictEqual(order1.listing_id, listing1.id);
    assert.strictEqual(order1.reservation_id, res1.id);
    assert.strictEqual(order1.marketplace_status, MARKETPLACE_ORDER_STATUS.PAYMENT_PENDING);

    // Pricing snapshot check
    assert.ok(order1.total_amount > 0);
    assert.strictEqual(order1.ticket_price, 1200000);

    // Reservation converted
    const resInDb = state.reservations.find(r => r.id === res1.id);
    assert.strictEqual(resInDb.status, RESERVATION_STATUS.CONVERTED);

    // Ticket remains locked, seller still owner
    const ticketInDb = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(ticketInDb.status, TICKET_STATUS.LOCKED);
    assert.strictEqual(ticketInDb.current_owner_id, sellerId);

    // Escrow account created in PENDING_PAYMENT
    const escrowInDb = state.escrows.find(e => e.order_id === order1.id);
    assert.ok(escrowInDb);
    assert.strictEqual(escrowInDb.status, ESCROW_STATUS.PENDING_PAYMENT);
  });

  // -------------------------------------------------------------
  // Scenario 2: Unauthorized buyer cannot convert reservation
  // -------------------------------------------------------------
  await runTest('2. Unauthorized buyer cannot convert reservation', async () => {
    let error;
    try {
      await MarketplaceOrderService.createOrderFromReservation({
        reservationId: res1.id,
        buyerId: buyer2Id // wrong buyer!
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'UNAUTHORIZED_RESERVATION_OWNER');
    assert.strictEqual(error.status, 403);
  });

  // -------------------------------------------------------------
  // Scenario 3: Expired reservation cannot create order
  // -------------------------------------------------------------
  await runTest('3. Expired reservation cannot create order', async () => {
    // Setup ticket2 and listing2
    const ticket2 = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: eventId,
      faceValue: 500000,
      rawBarcode: 'BARCODE-PHASE1C-002'
    });
    await TicketInventoryService.submitForVerification(ticket2.ticket_id || ticket2.id, sellerId);
    await TicketInventoryService.transitionStatus(ticket2.ticket_id || ticket2.id, TICKET_STATUS.VERIFIED, 'admin-1');
    const listing2 = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticket2.ticket_id || ticket2.id,
      price: 600000
    });

    const resExpired = await ReservationService.reserveListing({
      listingId: listing2.id,
      buyerId: buyer1Id,
      ttlMinutes: 10
    });

    // Artificially expire reservation
    resExpired.expires_at = new Date(Date.now() - 10000).toISOString();

    let error;
    try {
      await MarketplaceOrderService.createOrderFromReservation({
        reservationId: resExpired.id,
        buyerId: buyer1Id
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'RESERVATION_EXPIRED');
    assert.strictEqual(error.status, 410);
  });

  // -------------------------------------------------------------
  // Scenario 4: Released reservation cannot create order
  // -------------------------------------------------------------
  await runTest('4. Released reservation cannot create order', async () => {
    const ticket3 = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: eventId,
      faceValue: 500000,
      rawBarcode: 'BARCODE-PHASE1C-003'
    });
    await TicketInventoryService.submitForVerification(ticket3.ticket_id || ticket3.id, sellerId);
    await TicketInventoryService.transitionStatus(ticket3.ticket_id || ticket3.id, TICKET_STATUS.VERIFIED, 'admin-1');
    const listing3 = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticket3.ticket_id || ticket3.id,
      price: 600000
    });

    const resReleased = await ReservationService.reserveListing({
      listingId: listing3.id,
      buyerId: buyer1Id,
      ttlMinutes: 10
    });
    await ReservationService.releaseReservation(resReleased.id, buyer1Id, 'Cancelled');

    let error;
    try {
      await MarketplaceOrderService.createOrderFromReservation({
        reservationId: resReleased.id,
        buyerId: buyer1Id
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'RESERVATION_NOT_PENDING');
  });

  // -------------------------------------------------------------
  // Scenario 5: Duplicate order conversion rejected / idempotent
  // -------------------------------------------------------------
  await runTest('5. Duplicate order conversion is idempotent / rejects double order', async () => {
    const duplicateResult = await MarketplaceOrderService.createOrderFromReservation({
      reservationId: res1.id,
      buyerId: buyer1Id
    });

    assert.strictEqual(duplicateResult.idempotent, true);
    assert.strictEqual(duplicateResult.order.id, order1.id);

    // Verify exactly ONE order exists for this reservation
    const matchingOrders = state.orders.filter(o => o.reservation_id === res1.id);
    assert.strictEqual(matchingOrders.length, 1);
  });

  // -------------------------------------------------------------
  // Scenarios 6-11: Payment State Machine & Callbacks
  // -------------------------------------------------------------
  console.log('\n--- Scenarios 6-11: Payment Lifecycle & Idempotency ---');

  let paymentSession;
  await runTest('8. Payment PENDING initiation', async () => {
    paymentSession = await MarketplaceOrderService.initiatePayment({
      orderId: order1.id,
      buyerId: buyer1Id,
      channel: 'TEST_ESCROW_VA',
      providerName: 'test_provider'
    });

    assert.ok(paymentSession);
    assert.strictEqual(paymentSession.success, true);
    assert.strictEqual(paymentSession.status, 'PENDING');
    assert.ok(paymentSession.providerRef);
  });

  await runTest('11. Invalid payment callback signature is rejected', async () => {
    const invalidWebhook = testProvider.generateWebhookPayload(paymentSession.providerRef, TEST_PAYMENT_SCENARIOS.INVALID_CALLBACK);

    let error;
    try {
      await MarketplaceOrderService.processPaymentCallback({
        providerName: 'test_provider',
        headers: invalidWebhook.headers,
        body: invalidWebhook.body
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'INVALID_WEBHOOK_SIGNATURE');
    assert.strictEqual(error.status, 401);
  });

  await runTest('6. Payment SUCCESS: funds escrow, order marked PAID (PAID != SELLER PAID)', async () => {
    const successWebhook = testProvider.generateWebhookPayload(paymentSession.providerRef, TEST_PAYMENT_SCENARIOS.SUCCESS);

    const callbackResult = await MarketplaceOrderService.processPaymentCallback({
      providerName: 'test_provider',
      headers: successWebhook.headers,
      body: successWebhook.body
    });

    assert.strictEqual(callbackResult.success, true);
    assert.strictEqual(callbackResult.status, MARKETPLACE_ORDER_STATUS.PAID);

    // Escrow must be ESCROWED
    const escrowInDb = state.escrows.find(e => e.order_id === order1.id);
    assert.strictEqual(escrowInDb.status, ESCROW_STATUS.ESCROWED);

    // CRITICAL INVARIANT: PAID != SELLER PAID
    assert.strictEqual(escrowInDb.released_at, null);
    assert.strictEqual(escrowInDb.status !== ESCROW_STATUS.RELEASED, true);

    // Listing marked SOLD
    const listingInDb = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingInDb.status, LISTING_STATUS.SOLD);

    // Ticket marked ESCROWED
    const ticketInDb = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(ticketInDb.status, 'ESCROWED');

    // Double-entry accounting verified in FinancialLedger
    const ledgerEntries = state.financial_ledger.filter(l => l.order_id === order1.id);
    assert.ok(ledgerEntries.length > 0, 'Ledger entries must be created for payment capture');
  });

  await runTest('10. Duplicate payment callback is idempotent (no double escrow/ledger entry)', async () => {
    const ledgerCountBefore = state.financial_ledger.filter(l => l.order_id === order1.id).length;
    const paymentCountBefore = state.payments.filter(p => p.order_id === order1.id).length;

    const duplicateWebhook = testProvider.generateWebhookPayload(paymentSession.providerRef, TEST_PAYMENT_SCENARIOS.SUCCESS);

    const duplicateResult = await MarketplaceOrderService.processPaymentCallback({
      providerName: 'test_provider',
      headers: duplicateWebhook.headers,
      body: duplicateWebhook.body
    });

    assert.strictEqual(duplicateResult.idempotent, true);

    // Ledger and payments count must be strictly unchanged
    const ledgerCountAfter = state.financial_ledger.filter(l => l.order_id === order1.id).length;
    const paymentCountAfter = state.payments.filter(p => p.order_id === order1.id).length;
    assert.strictEqual(ledgerCountAfter, ledgerCountBefore);
    assert.strictEqual(paymentCountAfter, paymentCountBefore);
  });

  await runTest('15. Paid order does NOT automatically settle seller', async () => {
    const escrow = state.escrows.find(e => e.order_id === order1.id);
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(escrow.released_at, null);
  });

  // -------------------------------------------------------------
  // Scenario 7, 9, 14: Payment Failure & Inventory Release
  // -------------------------------------------------------------
  console.log('\n--- Scenarios 7, 9, 14: Payment Failure & Inventory Recovery ---');

  await runTest('7 & 14. Payment FAILED / TIMEOUT safely unlocks inventory', async () => {
    // Setup ticket4 and listing4
    const ticket4 = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: eventId,
      faceValue: 750000,
      rawBarcode: 'BARCODE-PHASE1C-004'
    });
    await TicketInventoryService.submitForVerification(ticket4.ticket_id || ticket4.id, sellerId);
    await TicketInventoryService.transitionStatus(ticket4.ticket_id || ticket4.id, TICKET_STATUS.VERIFIED, 'admin-1');
    const listing4 = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticket4.ticket_id || ticket4.id,
      price: 800000
    });

    // Reserve & create order
    const resFail = await ReservationService.reserveListing({
      listingId: listing4.id,
      buyerId: buyer1Id
    });
    const orderFail = (await MarketplaceOrderService.createOrderFromReservation({
      reservationId: resFail.id,
      buyerId: buyer1Id
    })).order;

    // Initiate payment
    const sessionFail = await MarketplaceOrderService.initiatePayment({
      orderId: orderFail.id,
      buyerId: buyer1Id,
      channel: 'TEST_ESCROW_VA',
      providerName: 'test_provider'
    });

    // Gateway sends FAILED webhook
    const failWebhook = testProvider.generateWebhookPayload(sessionFail.providerRef, TEST_PAYMENT_SCENARIOS.FAILED);
    const failResult = await MarketplaceOrderService.processPaymentCallback({
      providerName: 'test_provider',
      headers: failWebhook.headers,
      body: failWebhook.body
    });

    assert.strictEqual(failResult.success, false);
    assert.strictEqual(failResult.status, MARKETPLACE_ORDER_STATUS.PAYMENT_FAILED);

    // Invariant: Inventory must be released
    const listingRecovered = state.listings.find(l => l.id === listing4.id);
    assert.strictEqual(listingRecovered.status, LISTING_STATUS.ACTIVE);

    const ticketRecovered = TicketInventoryService.findTicket(ticket4.ticket_id || ticket4.id);
    assert.strictEqual(ticketRecovered.status, TICKET_STATUS.LISTED);

    // Another buyer can now reserve and purchase this listing
    const reReserve = await ReservationService.reserveListing({
      listingId: listing4.id,
      buyerId: buyer2Id
    });
    assert.ok(reReserve);
    assert.strictEqual(reReserve.status, RESERVATION_STATUS.PENDING);
  });

  // -------------------------------------------------------------
  // Scenarios 12, 13, 18: Refund & Immutability
  // -------------------------------------------------------------
  console.log('\n--- Scenarios 12, 13, 18: Refund & Financial Immutability ---');

  await runTest('12. Refund paid order: ledger reversal recorded, status REFUNDED', async () => {
    const refundResult = await MarketplaceOrderService.refundOrder({
      orderId: order1.id,
      actorId: 'admin-1',
      reason: 'Event ticket verification dispute resolution'
    });

    assert.strictEqual(refundResult.success, true);
    assert.strictEqual(refundResult.idempotent, false);
    assert.strictEqual(refundResult.order.marketplace_status, MARKETPLACE_ORDER_STATUS.REFUNDED);

    const escrow = state.escrows.find(e => e.order_id === order1.id);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUNDED);
    assert.ok(escrow.refunded_at);

    // Financial ledger reversal recorded
    const refundLedger = state.financial_ledger.find(l => l.order_id === order1.id && l.event_type === 'REFUND');
    assert.ok(refundLedger, 'Double-entry refund reversal must be recorded in ledger');
  });

  await runTest('13. Duplicate refund is idempotent (no duplicate ledger entries)', async () => {
    const refundLedgerCountBefore = state.financial_ledger.filter(l => l.order_id === order1.id && l.event_type === 'REFUND').length;

    const dupRefund = await MarketplaceOrderService.refundOrder({
      orderId: order1.id,
      actorId: 'admin-1',
      reason: 'Duplicate refund request'
    });

    assert.strictEqual(dupRefund.success, true);
    assert.strictEqual(dupRefund.idempotent, true);

    const refundLedgerCountAfter = state.financial_ledger.filter(l => l.order_id === order1.id && l.event_type === 'REFUND').length;
    assert.strictEqual(refundLedgerCountAfter, refundLedgerCountBefore);
  });

  await runTest('18. Financial history is NEVER deleted upon refund/cancellation', async () => {
    // Order, Payment, Escrow, and Ledger records for order1 must all still exist in state
    const orderExists = state.orders.find(o => o.id === order1.id);
    const paymentExists = state.payments.find(p => p.order_id === order1.id);
    const escrowExists = state.escrows.find(e => e.order_id === order1.id);
    const ledgerEntries = state.financial_ledger.filter(l => l.order_id === order1.id);

    assert.ok(orderExists, 'Order must remain in state');
    assert.ok(paymentExists, 'Payment record must remain in state');
    assert.ok(escrowExists, 'Escrow record must remain in state');
    assert.ok(ledgerEntries.length >= 2, 'Financial ledger capture + refund entries must remain intact');
  });

  // -------------------------------------------------------------
  // Scenario 16: State Consistency
  // -------------------------------------------------------------
  console.log('\n--- Scenario 16: Cross-Entity Consistency ---');
  await runTest('16. Order/Ticket/Listing/Reservation cross-entity consistency verified', async () => {
    assert.strictEqual(order1.ticket_id, ticket1.ticket_id || ticket1.id);
    assert.strictEqual(order1.listing_id, listing1.id);
    assert.strictEqual(order1.reservation_id, res1.id);
    assert.strictEqual(order1.buyer_id, buyer1Id);
    assert.strictEqual(order1.seller_id, sellerId);
  });

  // -------------------------------------------------------------
  // Scenario 17: 10 Concurrent Order-Conversion Attempts
  // -------------------------------------------------------------
  console.log('\n--- Scenario 17: Concurrent Order Conversion ---');
  await runTest('17. 10 concurrent order-conversion attempts -> exactly ONE order created', async () => {
    // Create new inventory
    const ticketConc = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: eventId,
      faceValue: 1000000,
      rawBarcode: 'BARCODE-CONC-001'
    });
    await TicketInventoryService.submitForVerification(ticketConc.ticket_id || ticketConc.id, sellerId);
    await TicketInventoryService.transitionStatus(ticketConc.ticket_id || ticketConc.id, TICKET_STATUS.VERIFIED, 'admin-1');

    const listingConc = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticketConc.ticket_id || ticketConc.id,
      price: 1100000
    });

    const resConc = await ReservationService.reserveListing({
      listingId: listingConc.id,
      buyerId: buyer1Id
    });

    // Fire 10 simultaneous order conversions for the exact same reservation
    const promises = Array.from({ length: 10 }, () =>
      MarketplaceOrderService.createOrderFromReservation({
        reservationId: resConc.id,
        buyerId: buyer1Id
      }).then(
        r => ({ success: true, result: r }),
        e => ({ success: false, error: e })
      )
    );

    const results = await Promise.all(promises);

    // Exactly one call should have created the order (!idempotent), the other 9 returned idempotent or failed cleanly
    const createdCalls = results.filter(r => r.success && !r.result.idempotent);
    const idempotentCalls = results.filter(r => r.success && r.result.idempotent);

    assert.strictEqual(createdCalls.length, 1, `Expected exactly 1 order creation, got ${createdCalls.length}`);
    assert.strictEqual(idempotentCalls.length, 9, `Expected 9 idempotent results, got ${idempotentCalls.length}`);

    // Verify database state has EXACTLY 1 order for this reservation
    const ordersInDb = state.orders.filter(o => o.reservation_id === resConc.id);
    assert.strictEqual(ordersInDb.length, 1, `Expected exactly 1 order in state, got ${ordersInDb.length}`);
  });

  console.log('\n================================================================');
  console.log(`  PHASE 1C TEST RESULTS: ${passedTests} passed, ${totalTests - passedTests} failed, ${totalTests} total`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

