/**
 * TIKUM / ARGUS — P0 PRODUCTION REMEDIATION REGRESSION TEST SUITE
 *
 * Verifies:
 * 1. P0.1: Pestapora 2026 listings are strictly non-existent/expired in active marketplace feeds.
 * 2. P0.2: Universal Lifecycle Gate:
 *    - Upcoming events return active listings.
 *    - Expired events are excluded from active listings.
 *    - Archived events are excluded from active listings.
 *    - Cancelled events are excluded from active listings.
 *    - Malformed/invalid date events are excluded from active listings.
 *    - Special-case bypass for Pestapora is completely removed from ListingService.
 *    - createListing throws EVENT_CONCLUDED for concluded events without exception.
 * 3. P0.3: Hero API Consistency:
 *    - canonicalRegistry.getAllEvents() includes canonical hero events.
 *    - /api/discovery/hero-concerts returns both Nassar and Ye.
 *    - Zero fake resale inventory: resale_inventory_count is 0 and resale_available is false.
 *    - Traceable source URLs and observation timestamps are present.
 * 4. P0.4: PIC Assignment & Agus Hendra Purge:
 *    - Zero fabricated assignments exist in state.event_pics.
 *    - Database reset does not resurrect Agus Hendra operational assignments.
 *    - No active PIC coverage is claimed for unconfirmed venues.
 */

const assert = require('assert');
const express = require('express');
const { state, resetDatabase } = require('./src/database');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('./src/discovery/EventTemporalLifecycleEngine');
const discoveryRouter = require('./src/discovery/discoveryRouter');

let passedTests = 0;
let failedTests = 0;

async function runTest(testName, fn) {
  try {
    process.stdout.write(`TEST: ${testName}... `);
    await fn();
    console.log('\x1b[32mPASS\x1b[0m');
    passedTests++;
  } catch (err) {
    console.log('\x1b[31mFAIL\x1b[0m');
    console.error(err);
    failedTests++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('TIKUM P0 PRODUCTION REMEDIATION REGRESSION SUITE');
  console.log('================================================================');

  // Test 1: Pestapora listings in state are strictly EXPIRED and absent from getActiveListings
  await runTest('1. Pestapora demo listing is EXPIRED and excluded from getActiveListings', async () => {
    resetDatabase();
    const activeListings = ListingService.getActiveListings('event-pestapora-2026');
    assert.strictEqual(activeListings.length, 0, 'No active listings may exist for Pestapora');

    const allActive = ListingService.getActiveListings();
    const pestaInAll = allActive.filter(l => l.event_id === 'event-pestapora-2026');
    assert.strictEqual(pestaInAll.length, 0, 'Pestapora cannot appear in general active listings');

    const pestaSeed = state.listings.find(l => l.id === 'list-demo-pestapora');
    assert.strictEqual(pestaSeed.status, 'EXPIRED');
  });

  // Test 2: Upcoming verified event returns active listings normally
  await runTest('2. Legitimate upcoming verified event returns active listings', async () => {
    resetDatabase();
    // Create dummy upcoming verified event
    const upcomingEventId = 'event-test-upcoming-verified';
    state.events.push({
      id: upcomingEventId,
      title: 'Konser Musik Masa Depan',
      start_date: '2026-12-15',
      end_date: '2026-12-15',
      event_start_at: '2026-12-15T19:00:00+07:00',
      event_end_at: '2026-12-15T23:00:00+07:00',
      event_timezone: 'Asia/Jakarta',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      is_verified: true,
      verification_status: 'VERIFIED',
      source: 'OFFICIAL_PROMOTER',
      source_url: 'https://promoter.id/event',
      evidence_hash: 'hash-test-ev',
      verified_at: new Date().toISOString()
    });

    state.tickets.push({
      id: 'ticket-test-upcoming',
      event_id: upcomingEventId,
      current_owner_id: 'seller-1',
      status: 'VERIFIED',
      barcode_hash: 'hash-test-barcode-1'
    });

    state.listings.push({
      id: 'list-test-upcoming',
      ticket_id: 'ticket-test-upcoming',
      seller_id: 'seller-1',
      event_id: upcomingEventId,
      face_value: 500000,
      price: 600000,
      status: LISTING_STATUS.ACTIVE,
      created_at: new Date().toISOString()
    });

    const activeListings = ListingService.getActiveListings(upcomingEventId);
    assert.strictEqual(activeListings.length, 1, 'Upcoming event must retain its active listing');
    assert.strictEqual(activeListings[0].id, 'list-test-upcoming');
    assert.strictEqual(activeListings[0].is_event_verified, true);
  });

  // Test 3: Concluded / expired event is strictly excluded by Universal Lifecycle Gate
  await runTest('3. Concluded/past event is strictly excluded by Universal Lifecycle Gate', async () => {
    const expiredEventId = 'event-test-expired-past';
    state.events.push({
      id: expiredEventId,
      title: 'Konser Yang Telah Usai',
      start_date: '2026-08-01',
      end_date: '2026-08-01',
      event_start_at: '2026-08-01T19:00:00+07:00',
      event_end_at: '2026-08-01T23:00:00+07:00',
      event_timezone: 'Asia/Jakarta',
      status: 'UPCOMING', // deliberately stale status in event, but date is in past
      lifecycle_status: 'UPCOMING',
      is_verified: true,
      verification_status: 'VERIFIED'
    });

    state.listings.push({
      id: 'list-test-expired',
      ticket_id: 'ticket-test-exp',
      seller_id: 'seller-1',
      event_id: expiredEventId,
      price: 500000,
      status: LISTING_STATUS.ACTIVE
    });

    const active = ListingService.getActiveListings(expiredEventId);
    assert.strictEqual(active.length, 0, 'Past date event must be excluded even if status flag was stale');
  });

  // Test 4: Archived lifecycle status is strictly excluded
  await runTest('4. Archived lifecycle status is strictly excluded from active listings', async () => {
    const archivedEventId = 'event-test-archived';
    state.events.push({
      id: archivedEventId,
      title: 'Konser Diarsipkan',
      start_date: '2026-11-20',
      end_date: '2026-11-20',
      event_start_at: '2026-11-20T19:00:00+07:00',
      event_end_at: '2026-11-20T23:00:00+07:00',
      status: 'ARCHIVED',
      lifecycle_status: 'ARCHIVED',
      is_verified: true,
      verification_status: 'VERIFIED'
    });

    state.listings.push({
      id: 'list-test-archived',
      ticket_id: 'ticket-test-arc',
      seller_id: 'seller-1',
      event_id: archivedEventId,
      price: 500000,
      status: LISTING_STATUS.ACTIVE
    });

    const active = ListingService.getActiveListings(archivedEventId);
    assert.strictEqual(active.length, 0, 'ARCHIVED status must exclude listings');
  });

  // Test 5: Cancelled event is strictly excluded
  await runTest('5. Cancelled event is strictly excluded from active listings', async () => {
    const cancelledEventId = 'event-test-cancelled';
    state.events.push({
      id: cancelledEventId,
      title: 'Konser Dibatalkan Promotor',
      start_date: '2026-12-01',
      end_date: '2026-12-01',
      event_start_at: '2026-12-01T19:00:00+07:00',
      event_end_at: '2026-12-01T23:00:00+07:00',
      status: 'CANCELLED',
      lifecycle_status: 'CANCELLED',
      is_verified: true,
      verification_status: 'VERIFIED'
    });

    state.listings.push({
      id: 'list-test-cancelled',
      ticket_id: 'ticket-test-cnc',
      seller_id: 'seller-1',
      event_id: cancelledEventId,
      price: 500000,
      status: LISTING_STATUS.ACTIVE
    });

    const active = ListingService.getActiveListings(cancelledEventId);
    assert.strictEqual(active.length, 0, 'CANCELLED status must exclude listings');
  });

  // Test 6: Malformed or unresolvable dates are strictly excluded
  await runTest('6. Event with malformed or unresolvable dates is strictly excluded', async () => {
    const malformedEventId = 'event-test-malformed-date';
    state.events.push({
      id: malformedEventId,
      title: 'Konser Tanggal Rusak',
      start_date: 'INVALID-DATE-STRING',
      end_date: null,
      event_start_at: 'INVALID',
      event_end_at: 'INVALID',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      is_verified: true,
      verification_status: 'VERIFIED'
    });

    state.listings.push({
      id: 'list-test-malformed',
      ticket_id: 'ticket-test-mal',
      seller_id: 'seller-1',
      event_id: malformedEventId,
      price: 500000,
      status: LISTING_STATUS.ACTIVE
    });

    const active = ListingService.getActiveListings(malformedEventId);
    assert.strictEqual(active.length, 0, 'Malformed date event must fail closed and exclude listings');
  });

  // Test 7: createListing throws EVENT_CONCLUDED for archived/concluded events without exception
  await runTest('7. createListing throws EVENT_CONCLUDED for concluded events (no Pestapora exception)', async () => {
    let thrown = null;
    try {
      await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'General 3-Day Pass',
        price: 1500000,
        rawBarcode: 'BARCODE-TEST-123456789'
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'createListing must throw for Pestapora');
    assert.strictEqual(thrown.code, 'EVENT_CONCLUDED', 'Expected EVENT_CONCLUDED code');
  });

  // Test 8: CanonicalEventRegistry.getHeroEvents includes both hero events
  await runTest('8. canonicalRegistry.getHeroEvents() includes both verified hero concerts', async () => {
    const heroes = canonicalRegistry.getHeroEvents();
    assert.ok(Array.isArray(heroes), 'getHeroEvents must return an array');
    assert.strictEqual(heroes.length, 2, 'getHeroEvents must return exactly 2 hero concerts');

    const nassar = heroes.find(e => (e.slug && e.slug.includes('nassar')) || (e.title && e.title.includes('Nassar')));
    assert.ok(nassar, 'Nassar must be found in getHeroEvents()');
    assert.strictEqual(nassar.date, '2026-11-07');
    assert.strictEqual(nassar.primary_ticket_status, 'SOLD_OUT');
    assert.strictEqual(nassar.resale_inventory_count, 0);

    const ye = heroes.find(e => (e.slug && e.slug.includes('ye-live')) || (e.title && e.title.includes('YE')));
    assert.ok(ye, 'Ye must be found in getHeroEvents()');
    assert.strictEqual(ye.date, '2026-10-24');
    assert.strictEqual(ye.primary_ticket_status, 'ON_SALE');
    assert.strictEqual(ye.resale_inventory_count, 0);
  });

  // Test 9: GET /api/discovery/hero-concerts returns both Nassar and Ye with zero fake inventory
  await runTest('9. GET /api/discovery/hero-concerts returns 2 verified hero concerts with zero fake inventory', async () => {
    const app = express();
    app.use(discoveryRouter);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/discovery/hero-concerts`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.count, 2, 'API must return exactly 2 hero concerts');
      assert.strictEqual(data.concerts.length, 2);

      const nassarCard = data.concerts.find(c => c.title.includes('Nassar'));
      assert.ok(nassarCard, 'Nassar card must be present');
      assert.strictEqual(nassarCard.organizer_name, 'Boss Creator');
      assert.strictEqual(nassarCard.primary_ticket_status, 'SOLD_OUT');
      assert.strictEqual(nassarCard.resale_inventory_count, 0, 'Resale inventory must be 0');
      assert.strictEqual(nassarCard.resale_available, false);
      assert.ok(nassarCard.official_event_url, 'Must have official event URL');
      assert.ok(nassarCard.observed_at, 'Must have observation timestamp');

      const yeCard = data.concerts.find(c => c.title.includes('YE'));
      assert.ok(yeCard, 'Ye card must be present');
      assert.strictEqual(yeCard.organizer_name, 'Raw Vision Collective & Yeezy');
      assert.strictEqual(yeCard.primary_ticket_status, 'ON_SALE');
      assert.strictEqual(yeCard.resale_inventory_count, 0, 'Resale inventory must be 0');
      assert.strictEqual(yeCard.resale_available, false);
      assert.ok(yeCard.official_event_url, 'Must have official event URL');
      assert.ok(yeCard.observed_at, 'Must have observation timestamp');
    } finally {
      server.close();
    }
  });

  // Test 10: PIC assignments are purged and cannot reappear upon reseeding
  await runTest('10. Fabricated PIC assignments are absent and do not reappear upon resetDatabase', async () => {
    resetDatabase();
    assert.strictEqual(state.event_pics.length, 0, 'state.event_pics must be empty by default');

    // Confirm Agus Hendra is absent from active assignments
    const activeAssignments = state.event_pics.filter(ep => ep.status === 'ACTIVE');
    assert.strictEqual(activeAssignments.length, 0);

    // Confirm no venue shift is pre-assigned to Agus Hendra
    assert.strictEqual(state.venue_shifts ? state.venue_shifts.length : 0, 0);
  });

  console.log('================================================================');
  console.log(`P0 REMEDIATION SUITE COMPLETE: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
