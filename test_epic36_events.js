process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const { state, resetDatabase } = require('./src/database');
const app = require('./src/server');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');

let server;
let baseUrl;
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

async function apiRequest(endpoint, { method = 'GET', headers = {}, body = null } = {}) {
  const url = `${baseUrl}${endpoint}`;
  const reqHeaders = { ...headers };
  if (body && typeof body === 'object') {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body && typeof body === 'object' ? JSON.stringify(body) : body
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data };
}

async function runSuite() {
  console.log('\n=== ARGUS EPIC 3.6: EVENT CATALOG & USER-GENERATED EVENTS SUITE ===\n');

  resetDatabase();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // Test 1: Seeded events verification
  await testAsync('Test 1: Seeded events integrity (min 18 events, Sep-Dec 2026, source=SEED, is_verified=true)', async () => {
    const res = await apiRequest('/api/mvp/events?include_past=true');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.events.length >= 18, `Expected >= 18 events, got ${res.data.events.length}`);

    for (const ev of res.data.events) {
      if (ev.source === 'SEED') {
        assert.strictEqual(ev.is_verified, true, `Seed event ${ev.id} must be verified`);
        assert.ok(ev.start_date >= '2026-09-01' && ev.start_date <= '2026-12-31', `Event ${ev.name} date ${ev.start_date} outside Sep-Dec 2026 window`);
        assert.ok(ev.name, 'Event must have name');
        assert.ok(ev.venue_name, 'Event must have venue_name');
        assert.ok(ev.venue_city, 'Event must have venue_city');
        assert.ok(ev.category, 'Event must have category');
      }
    }
  });

  // Test 2: User-created event via API
  let userCreatedEventId;
  await testAsync('Test 2: Verified user can create a missing event (source=USER_CREATED, is_verified=false)', async () => {
    const payload = {
      sellerId: 'seller-1',
      name: 'Festival Musik Indie Bandung 2026',
      venue_name: 'Lapangan Tegallega Bandung',
      venue_city: 'Bandung',
      start_date: '2026-11-08',
      category: 'FESTIVAL',
      artists: ['Efek Rumah Kaca', 'Mocca', 'The Sigit']
    };

    const res = await apiRequest('/api/mvp/events', {
      method: 'POST',
      headers: { 'x-user-id': 'seller-1' },
      body: payload
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.event.id.startsWith('event-usr-'));
    assert.strictEqual(res.data.event.source, 'USER_CREATED');
    assert.strictEqual(res.data.event.is_verified, false);
    assert.strictEqual(res.data.event.status, 'UPCOMING');
    assert.strictEqual(res.data.event.created_by_user_id, 'seller-1');
    assert.strictEqual(res.data.event.category, 'FESTIVAL');

    userCreatedEventId = res.data.event.id;
  });

  // Test 3: Duplicate event creation rejected
  await testAsync('Test 3: Uniqueness check prevents duplicate event (same name + venue + date)', async () => {
    const duplicatePayload = {
      sellerId: 'seller-1',
      name: 'Festival Musik Indie Bandung 2026',
      venue_name: 'Lapangan Tegallega Bandung',
      venue_city: 'Bandung',
      start_date: '2026-11-08',
      category: 'FESTIVAL'
    };

    const res = await apiRequest('/api/mvp/events', {
      method: 'POST',
      headers: { 'x-user-id': 'seller-1' },
      body: duplicatePayload
    });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.code, 'DUPLICATE_EVENT');
    assert.strictEqual(res.data.existing_event_id, userCreatedEventId);
  });

  // Test 4: Search & Filter events
  await testAsync('Test 4: Search & filter events by keyword, city, category, and source', async () => {
    // 4A: Search by city
    const resBandung = await apiRequest('/api/mvp/events?city=Bandung&include_past=true');
    assert.strictEqual(resBandung.status, 200);
    assert.ok(resBandung.data.events.length >= 3, 'Expected >= 3 events in Bandung');
    assert.ok(resBandung.data.events.every(e => e.venue_city.toLowerCase().includes('bandung')));

    // 4B: Search by category
    const resStandup = await apiRequest('/api/mvp/events?category=STANDUP&include_past=true');
    assert.strictEqual(resStandup.status, 200);
    assert.ok(resStandup.data.events.length >= 2, 'Expected >= 2 STANDUP events');
    assert.ok(resStandup.data.events.every(e => e.category === 'STANDUP'));

    // 4C: Text search
    const resSearch = await apiRequest('/api/mvp/events?q=Pestapora&include_past=true');
    assert.strictEqual(resSearch.status, 200);
    assert.strictEqual(resSearch.data.events.length, 1);
    assert.strictEqual(resSearch.data.events[0].id, 'event-pestapora-2026');

    // 4D: Filter by source
    const resUserCreated = await apiRequest('/api/mvp/events?source=USER_CREATED&include_past=true');
    assert.strictEqual(resUserCreated.status, 200);
    assert.ok(resUserCreated.data.events.some(e => e.id === userCreatedEventId));
  });

  // Test 5: Listing creation bound to user-created event with soft warning
  let userEventListingId;
  await testAsync('Test 5: Listing created on user event has soft warning flag (user_created_event: true)', async () => {
    const listingRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: userCreatedEventId,
      seatInfo: 'Festival Area Section A',
      faceValue: 350000,
      price: 400000,
      rawBarcode: 'BANDUNG-INDIE-FEST-2026-TICKET-001',
      evidenceBundleId: null
    });

    assert.ok(listingRes.listing.id);
    assert.strictEqual(listingRes.listing.user_created_event, true);
    assert.strictEqual(listingRes.listing.event_verification_warning, 'Event dibuat oleh pengguna – belum diverifikasi resmi');

    userEventListingId = listingRes.listing.id;

    // Admin verifies the listing to make it active in marketplace
    await ListingService.verifyListing(userEventListingId, 'admin-1', { approved: true });

    // Verify public listings show the soft warning
    const activeListings = ListingService.getActiveListings(userCreatedEventId);
    assert.strictEqual(activeListings.length, 1);
    assert.strictEqual(activeListings[0].user_created_event, true);
    assert.strictEqual(activeListings[0].is_event_verified, false);
    assert.strictEqual(activeListings[0].event_verification_warning, 'Event dibuat oleh pengguna – belum diverifikasi resmi');
  });

  // Test 6: Listing fails if event does not exist
  await testAsync('Test 6: Listing creation fails if eventId does not exist', async () => {
    await assert.rejects(async () => {
      await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'non-existent-event-999',
        seatInfo: 'CAT 1',
        faceValue: 500000,
        price: 600000,
        rawBarcode: 'BARCODE-XYZ-FAIL',
        evidenceBundleId: null
      });
    }, { code: 'EVENT_NOT_FOUND' });
  });

  // Test 7: Admin verifies user-created event
  await testAsync('Test 7: Admin toggles is_verified on user-created event', async () => {
    const verifyRes = await apiRequest(`/api/mvp/admin/events/${userCreatedEventId}/verify`, {
      method: 'POST',
      headers: { 'x-user-id': 'admin-1' },
      body: { officerId: 'admin-1', is_verified: true, reason: 'Promotor flyer verified by Ops' }
    });

    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.data.success, true);
    assert.strictEqual(verifyRes.data.event.is_verified, true);

    // Active listing should now reflect verified event
    const activeListings = ListingService.getActiveListings(userCreatedEventId);
    assert.strictEqual(activeListings[0].is_event_verified, true);
    assert.strictEqual(activeListings[0].event_verification_warning, null);
  });

  // Test 8: Admin edits and cancels an event
  await testAsync('Test 8: Admin edits event and cancels event (status=DIBATALKAN)', async () => {
    // Edit
    const editRes = await apiRequest(`/api/mvp/admin/events/${userCreatedEventId}`, {
      method: 'PATCH',
      headers: { 'x-user-id': 'admin-1' },
      body: { officerId: 'admin-1', official_link: 'https://bandungindiefest.id' }
    });
    assert.strictEqual(editRes.status, 200);
    assert.strictEqual(editRes.data.event.official_link, 'https://bandungindiefest.id');

    // Cancel
    const cancelRes = await apiRequest(`/api/mvp/admin/events/${userCreatedEventId}/cancel`, {
      method: 'POST',
      headers: { 'x-user-id': 'admin-1' },
      body: { officerId: 'admin-1', reason: 'Penyelenggara membatalkan acara karena cuaca' }
    });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.event.status, 'DIBATALKAN');

    // Public events query should now exclude cancelled event by default
    const pubRes = await apiRequest('/api/mvp/events');
    assert.ok(!pubRes.data.events.some(e => e.id === userCreatedEventId));
  });

  // Test 9: Public tracking endpoint handles both Orders and Listings without PII leak
  await testAsync('Test 9: Public tracking endpoint GET /api/mvp/track/:id handles listings and orders securely', async () => {
    const resListing = await apiRequest(`/api/mvp/track/${userEventListingId}`);
    assert.strictEqual(resListing.status, 200);
    assert.strictEqual(resListing.data.success, true);
    assert.strictEqual(resListing.data.transaction.id, userEventListingId);
    assert.strictEqual(resListing.data.transaction.type, 'LISTING');
    assert.ok(resListing.data.transaction.event.title);
    assert.strictEqual(resListing.data.transaction.price, 400000);
    // Invariant: zero PII leak (no phone, no NIK, no raw barcode)
    assert.strictEqual(resListing.data.transaction.barcode_hash, undefined);
    assert.strictEqual(resListing.data.transaction.nik_hash, undefined);

    // Invalid ID returns 404
    const resNotFound = await apiRequest('/api/mvp/track/fake-id-12345');
    assert.strictEqual(resNotFound.status, 404);
  });

  server.close();

  console.log(`\n=======================`);
  console.log(`Epic 3.6 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
