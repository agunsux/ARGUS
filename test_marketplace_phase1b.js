/**
 * TIKUM / ARGUS — Phase 1B Integration & Concurrency Test Suite
 *
 * Verifies:
 * 1. MarketplaceListingService:
 *    - Creation against canonical ticket inventory
 *    - Ticket ownership invariant (non-owner cannot list)
 *    - Invariant: A ticket cannot have duplicate active listings
 *    - Transparent fee decomposition
 *    - Cancellation restores ticket status to VERIFIED
 * 2. ReservationService:
 *    - Atomic reservation: listing -> RESERVED, ticket -> LOCKED
 *    - Self-dealing prevention: seller cannot reserve own listing
 *    - Sequential double-reservation rejection
 *    - MANDATORY CONCURRENT RACE-CONDITION TEST: 20 simultaneous concurrent
 *      reservation requests -> exactly 1 succeeds, 19 fail with LISTING_ALREADY_RESERVED
 *    - Expiry & recovery: expired reservation automatically reverts listing to ACTIVE and ticket to LISTED
 *    - Re-reservation after expiry/recovery succeeds
 *    - Voluntary release: buyer release returns inventory to available
 *    - Zero payment/escrow/settlement side effects
 */

const assert = require('assert');
const { resetDatabase, state } = require('./src/database');
const { TicketInventoryService, TICKET_STATUS } = require('./src/services/marketplace/TicketInventoryService');
const { MarketplaceListingService, LISTING_STATUS } = require('./src/services/marketplace/MarketplaceListingService');
const { ReservationService, RESERVATION_STATUS } = require('./src/services/marketplace/ReservationService');

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
  console.log('  EPIC 6 — PHASE 1B: LISTING & ATOMIC RESERVATION TEST SUITE');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  resetDatabase();

  const sellerId = 'seller-1';
  const buyer1Id = 'buyer-1';
  const buyer2Id = 'buyer-2';
  const eventId = 'event-pestapora-2026';

  // -------------------------------------------------------------
  // PART 1: MarketplaceListingService Tests
  // -------------------------------------------------------------
  console.log('--- 1. MarketplaceListingService Tests ---');

  let ticket1;
  await runTest('1.1 Create canonical ticket in inventory', async () => {
    ticket1 = await TicketInventoryService.createTicket({
      sellerId,
      canonicalEventId: eventId,
      ticketType: 'VIP',
      section: 'VIP Section A',
      row: '1',
      seat: '10',
      faceValue: 1500000,
      currency: 'IDR',
      rawBarcode: 'BARCODE-PHASE1B-001'
    });

    assert.ok(ticket1);
    assert.strictEqual(ticket1.status, TICKET_STATUS.DRAFT);
    assert.strictEqual(ticket1.current_owner_id, sellerId);
    assert.strictEqual(ticket1.face_value, 1500000);
  });

  await runTest('1.2 Submit ticket for verification and verify it', async () => {
    await TicketInventoryService.submitForVerification(ticket1.ticket_id || ticket1.id, sellerId);
    assert.strictEqual(ticket1.status, TICKET_STATUS.PENDING_VERIFICATION);

    await TicketInventoryService.transitionStatus(ticket1.ticket_id || ticket1.id, TICKET_STATUS.VERIFIED, 'admin-1', 'Admin verified');
    assert.strictEqual(ticket1.status, TICKET_STATUS.VERIFIED);
  });

  await runTest('1.3 Non-owner cannot list another seller\'s ticket', async () => {
    let error;
    try {
      await MarketplaceListingService.createListing({
        sellerId: 'buyer-1', // Not the owner
        ticketId: ticket1.ticket_id || ticket1.id,
        price: 1800000
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'Expected error when non-owner attempts to list');
    assert.strictEqual(error.code, 'UNAUTHORIZED_NOT_TICKET_OWNER');
  });

  let listing1;
  await runTest('1.4 Owner creates listing with transparent fee decomposition', async () => {
    listing1 = await MarketplaceListingService.createListing({
      sellerId,
      ticketId: ticket1.ticket_id || ticket1.id,
      price: 1800000
    });

    assert.ok(listing1);
    assert.strictEqual(listing1.status, LISTING_STATUS.ACTIVE);
    assert.strictEqual(listing1.ticket_id, ticket1.ticket_id || ticket1.id);
    assert.strictEqual(listing1.seller_id, sellerId);
    assert.strictEqual(listing1.price, 1800000);

    // Verify transparent fee decomposition
    assert.ok(listing1.pricing);
    assert.strictEqual(listing1.pricing.ticket_price, 1800000);
    assert.ok(listing1.pricing.buyer_fee > 0, 'Buyer fee must be > 0');
    assert.strictEqual(listing1.pricing.buyer_total, 1800000 + listing1.pricing.buyer_fee);
    assert.ok(listing1.pricing.seller_proceeds <= 1800000);

    // Verify ticket status transitioned to LISTED
    const updatedTicket = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(updatedTicket.status, TICKET_STATUS.LISTED);
  });

  await runTest('1.5 Invariant: Duplicate active listing for the same ticket is rejected', async () => {
    let error;
    try {
      await MarketplaceListingService.createListing({
        sellerId,
        ticketId: ticket1.ticket_id || ticket1.id,
        price: 2000000
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.ok(error.code === 'TICKET_ALREADY_LISTED' || error.code === 'TICKET_NOT_LISTABLE');
  });

  // -------------------------------------------------------------
  // PART 2: ReservationService & Concurrency Tests
  // -------------------------------------------------------------
  console.log('\n--- 2. ReservationService & Concurrency Tests ---');

  await runTest('2.1 Seller cannot reserve their own listing (Self-dealing guard)', async () => {
    let error;
    try {
      await ReservationService.reserveListing({
        listingId: listing1.id,
        buyerId: sellerId // Seller trying to reserve own listing
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'SELF_DEALING_FORBIDDEN');
  });

  let reservation1;
  await runTest('2.2 Happy Path: Buyer reserves active listing -> listing RESERVED, ticket LOCKED', async () => {
    reservation1 = await ReservationService.reserveListing({
      listingId: listing1.id,
      buyerId: buyer1Id,
      ttlMinutes: 10
    });

    assert.ok(reservation1);
    assert.strictEqual(reservation1.status, RESERVATION_STATUS.PENDING);
    assert.strictEqual(reservation1.buyer_id, buyer1Id);
    assert.strictEqual(reservation1.listing_id, listing1.id);
    assert.ok(new Date(reservation1.expires_at) > new Date());

    // Verify listing is RESERVED
    const listingInDb = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingInDb.status, LISTING_STATUS.RESERVED);

    // Verify ticket is LOCKED
    const ticketInDb = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(ticketInDb.status, TICKET_STATUS.LOCKED);

    // Verify NO payment/escrow side effects
    assert.strictEqual(state.payments.length, 0);
    assert.strictEqual(state.escrows.length, 0);
  });

  await runTest('2.3 Sequential double-reservation rejection', async () => {
    let error;
    try {
      await ReservationService.reserveListing({
        listingId: listing1.id,
        buyerId: buyer2Id
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'LISTING_ALREADY_RESERVED');
  });

  await runTest('2.4 Voluntary release: Buyer releases reservation -> inventory returned to available', async () => {
    const releaseRes = await ReservationService.releaseReservation(reservation1.id, buyer1Id, 'Buyer changed mind');
    assert.ok(releaseRes.success);
    assert.strictEqual(releaseRes.reservation.status, RESERVATION_STATUS.RELEASED);

    // Listing must be ACTIVE again
    const listingInDb = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingInDb.status, LISTING_STATUS.ACTIVE);

    // Ticket must be LISTED again
    const ticketInDb = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(ticketInDb.status, TICKET_STATUS.LISTED);
  });

  // -------------------------------------------------------------
  // PART 3: MANDATORY CONCURRENT RACE-CONDITION TEST
  // -------------------------------------------------------------
  console.log('\n--- 3. Mandatory Concurrent Race-Condition Test ---');

  await runTest('3.1 Concurrency: 20 simultaneous requests -> EXACTLY 1 succeeds, 19 fail with LISTING_ALREADY_RESERVED', async () => {
    // Ensure listing is ACTIVE before race
    const listingBefore = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingBefore.status, LISTING_STATUS.ACTIVE);

    const CONCURRENT_REQUESTS = 20;
    const buyers = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      buyers.push({
        id: `buyer-race-${i}`,
        name: `Race Buyer ${i}`,
        email: `buyer${i}@race.com`,
        role: 'buyer'
      });
    }
    state.users.push(...buyers);

    // Fire 20 simultaneous reservation requests
    const promises = buyers.map(buyer =>
      ReservationService.reserveListing({
        listingId: listing1.id,
        buyerId: buyer.id,
        ttlMinutes: 15
      }).then(
        res => ({ success: true, res }),
        err => ({ success: false, code: err.code, status: err.status })
      )
    );

    const results = await Promise.all(promises);

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    assert.strictEqual(successes.length, 1, `Expected exactly 1 success, got ${successes.length}`);
    assert.strictEqual(failures.length, CONCURRENT_REQUESTS - 1, `Expected exactly ${CONCURRENT_REQUESTS - 1} failures, got ${failures.length}`);

    // All failures must be LISTING_ALREADY_RESERVED
    failures.forEach(f => {
      assert.strictEqual(f.code, 'LISTING_ALREADY_RESERVED');
      assert.strictEqual(f.status, 409);
    });

    // Verify listing state
    const listingAfter = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingAfter.status, LISTING_STATUS.RESERVED);

    // Verify ticket state
    const ticketAfter = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(ticketAfter.status, TICKET_STATUS.LOCKED);

    // Verify exactly 1 pending reservation exists for this listing
    const activeRes = state.reservations.filter(r => r.listing_id === listing1.id && r.status === RESERVATION_STATUS.PENDING);
    assert.strictEqual(activeRes.length, 1);
    assert.strictEqual(activeRes[0].id, successes[0].res.id);
  });

  // -------------------------------------------------------------
  // PART 4: Expiry, Recovery & Re-Reservation Tests
  // -------------------------------------------------------------
  console.log('\n--- 4. Expiry, Recovery & Re-Reservation Tests ---');

  await runTest('4.1 Reservation expiry recovery: Expired reservation automatically reverts inventory', async () => {
    // Find the winning reservation from the concurrency test
    const winningRes = state.reservations.find(r => r.listing_id === listing1.id && r.status === RESERVATION_STATUS.PENDING);
    assert.ok(winningRes);

    // Simulate time elapsed past expires_at
    winningRes.expires_at = new Date(Date.now() - 60000).toISOString(); // 1 minute in the past

    // Run expiry reconciliation
    const recon = await ReservationService.reconcileExpiredReservations();
    assert.strictEqual(recon.count, 1);
    assert.strictEqual(recon.recoveredIds[0], winningRes.id);

    // Verify reservation status is EXPIRED
    assert.strictEqual(winningRes.status, RESERVATION_STATUS.EXPIRED);

    // Verify listing is restored to ACTIVE
    const listingRecon = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingRecon.status, LISTING_STATUS.ACTIVE);

    // Verify ticket is restored to LISTED
    const ticketRecon = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(ticketRecon.status, TICKET_STATUS.LISTED);
  });

  await runTest('4.2 Re-reservation after recovery succeeds cleanly', async () => {
    const newRes = await ReservationService.reserveListing({
      listingId: listing1.id,
      buyerId: buyer2Id,
      ttlMinutes: 15
    });

    assert.ok(newRes);
    assert.strictEqual(newRes.status, RESERVATION_STATUS.PENDING);
    assert.strictEqual(newRes.buyer_id, buyer2Id);

    const listingNow = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingNow.status, LISTING_STATUS.RESERVED);

    // Release to leave state clean
    await ReservationService.releaseReservation(newRes.id, buyer2Id);
  });

  // -------------------------------------------------------------
  // PART 5: Listing Cancellation & Expiry Tests
  // -------------------------------------------------------------
  console.log('\n--- 5. Listing Cancellation & Expiry Tests ---');

  await runTest('5.1 Cancelling listing restores ticket status to VERIFIED', async () => {
    // Listing is currently ACTIVE (after release above)
    const listingBefore = state.listings.find(l => l.id === listing1.id);
    assert.strictEqual(listingBefore.status, LISTING_STATUS.ACTIVE);

    await MarketplaceListingService.cancelListing(listing1.id, sellerId, 'Seller cancelled listing');

    assert.strictEqual(listingBefore.status, LISTING_STATUS.CANCELLED);

    // Ticket must be restored to VERIFIED
    const ticketAfter = TicketInventoryService.findTicket(ticket1.ticket_id || ticket1.id);
    assert.strictEqual(ticketAfter.status, TICKET_STATUS.VERIFIED);
  });

  await runTest('5.2 Cannot reserve a CANCELLED listing', async () => {
    let error;
    try {
      await ReservationService.reserveListing({
        listingId: listing1.id,
        buyerId: buyer1Id
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.code, 'LISTING_ALREADY_RESERVED');
  });

  console.log('\n================================================================');
  console.log(`  PHASE 1B TEST RESULTS: ${passedTests} passed, ${totalTests - passedTests} failed, ${totalTests} total`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
