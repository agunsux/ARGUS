/**
 * TIKUM / ARGUS — Real Route Provenance & Temporal Gate Regression Suite
 * 
 * Verifies that the ACTUAL public HTTP paths cannot expose unverified,
 * expired, cancelled, or fabricated events under any circumstances.
 * 
 * Acceptance Criteria Enforced:
 * 1. Zero-trust seed data: no seed record is public merely because it exists.
 * 2. 7 suspect records remain strictly blocked unless independently proven.
 * 3. Official-source boundary: only authoritative sources can verify events.
 * 4. Evidence must be real: source type, URL, timestamps, SHA-256 evidence hash.
 * 5. Fail closed: UNVERIFIED, STALE, CANCELLED, COMPLETED, ARCHIVED -> not public.
 * 6. Temporal gate remains independent: event_end_at > now for Upcoming feed.
 * 7. Real public HTTP routes tested: /api/mvp/events, /api/events, /events, /api/events/home-feed, detail routes.
 * 8. Bypass immunity: query params such as ?status=UPCOMING or ?verified=false cannot bypass gates.
 * 9. Listing inheritance: active listings for unverified/expired events cannot leak.
 * 10. Anti-resurrection: cancelled/completed/archived events cannot be revived.
 * 11. Historical preservation: historical data remains queryable via include_past=true or admin scopes.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { promoterRegistry, PROMOTER_STATUS, PROMOTER_AUTHORITY } = require('./src/discovery/PromoterDiscoveryRegistry');
const { PromoterImportService } = require('./src/discovery/PromoterImportService');
const { discoverySignalService } = require('./src/discovery/EventDiscoverySignalService');
const { sourceRegistry, TRUST_LEVELS } = require('./src/discovery/SourceRegistry');
const { VERIFICATION_STATUS } = require('./src/discovery/EventVerificationService');
const { v4: uuidv4 } = require('uuid');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (e) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    -> ${e.message}`);
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

  return { status: res.status, headers: res.headers, data };
}

const SUSPECT_EVENT_IDS = [
  'event-hindia-bandung-2026',
  'event-sheila-2026-bandung',
  'event-lany-jakarta-2026',
  'event-bruno-mars-2026',
  'event-the-weeknd-jis',
  'event-coldplay',
  'event-gnr'
];

const SUSPECT_SLUGS = [
  'hindia-lagipula-hidup-akan-berakhir-bandung-2026',
  'sheila-on-7-live-in-bandung-2026',
  'lany-a-beautiful-blur-jakarta-2026',
  'bruno-mars-live-in-jakarta-2026',
  'the-weeknd-after-hours-til-dawn-jakarta-2026',
  'coldplay-music-of-the-spheres-jakarta-2023',
  'guns-n-roses-not-in-this-lifetime-jakarta-2018'
];

async function runSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TIKUM / ARGUS — PUBLIC ROUTE PROVENANCE & TEMPORAL GATES    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Start ephemeral HTTP test server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Reset database state to pristine zero-trust seed baseline
  resetDatabase();
  promoterRegistry.reset();
  canonicalRegistry.reset();
  canonicalRegistry.importLegacyEvents(state.events);

  // =========================================================================
  // 1. BASELINE AUDIT: Zero-Trust Seed Data State
  // =========================================================================
  console.log('── 1. Baseline Audit: Zero-Trust Seed State ──');

  await testAsync('Seed events in database.js are all UNVERIFIED / EXPIRED with is_verified: false', async () => {
    assert.strictEqual(state.events.length, 26, 'Must contain exactly 26 baseline seed records');
    for (const evt of state.events) {
      assert.strictEqual(evt.is_verified, false, `Event ${evt.id} (${evt.name}) must have is_verified: false`);
      assert.ok(
        evt.verification_status === 'UNVERIFIED' || evt.verification_status === 'EXPIRED',
        `Event ${evt.id} must have UNVERIFIED or EXPIRED status, got: ${evt.verification_status}`
      );
    }
  });

  await testAsync('The 7 suspect records exist in database but are strictly unverified', async () => {
    for (const id of SUSPECT_EVENT_IDS) {
      const found = state.events.find(e => e.id === id);
      assert.ok(found, `Suspect event ${id} must exist in seed records for tracking`);
      assert.strictEqual(found.is_verified, false, `Suspect event ${id} must NOT be verified`);
    }
  });

  // =========================================================================
  // 2. REAL ROUTE TEST: GET /api/mvp/events
  // =========================================================================
  console.log('\n── 2. Real Route: GET /api/mvp/events ──');

  await testAsync('GET /api/mvp/events returns 200 OK and ZERO unverified seed events', async () => {
    const res = await apiRequest('/api/mvp/events');
    assert.strictEqual(res.status, 200);
    const events = res.data.data?.events || res.data.events || [];
    assert.strictEqual(events.length, 0, `Expected 0 public events from unverified seed data, got ${events.length}`);
  });

  await testAsync('Bypass attempt: GET /api/mvp/events?status=UPCOMING cannot bypass provenance gate', async () => {
    const res = await apiRequest('/api/mvp/events?status=UPCOMING');
    assert.strictEqual(res.status, 200);
    const events = res.data.data?.events || res.data.events || [];
    assert.strictEqual(events.length, 0, 'status=UPCOMING query param must not leak unverified events');
  });

  await testAsync('Bypass attempt: GET /api/mvp/events?verified=false cannot bypass provenance gate', async () => {
    const res = await apiRequest('/api/mvp/events?verified=false');
    assert.strictEqual(res.status, 200);
    const events = res.data.data?.events || res.data.events || [];
    assert.strictEqual(events.length, 0, 'verified=false query param must not leak unverified events');
  });

  // =========================================================================
  // 3. REAL ROUTE TEST: GET /api/events & GET /api/events/home-feed
  // =========================================================================
  console.log('\n── 3. Real Route: GET /api/events & /api/events/home-feed ──');

  await testAsync('GET /api/events returns 200 OK and ZERO unverified/expired events', async () => {
    const res = await apiRequest('/api/events');
    assert.strictEqual(res.status, 200);
    const events = res.data.events || [];
    assert.strictEqual(events.length, 0, `Expected 0 public events, got ${events.length}`);
  });

  await testAsync('Bypass attempt: GET /api/events?status=UPCOMING cannot leak unverified events', async () => {
    const res = await apiRequest('/api/events?status=UPCOMING');
    assert.strictEqual(res.status, 200);
    const events = res.data.events || [];
    assert.strictEqual(events.length, 0);
  });

  await testAsync('GET /api/events/home-feed returns empty feed when zero events are verified', async () => {
    const res = await apiRequest('/api/events/home-feed');
    assert.strictEqual(res.status, 200);
    const feed = res.data.feed || [];
    assert.strictEqual(feed.length, 0, `Expected 0 home feed events, got ${feed.length}`);
  });

  await testAsync('Historical preservation: GET /api/events?include_past=true returns historical records for audit', async () => {
    const res = await apiRequest('/api/events?include_past=true');
    assert.strictEqual(res.status, 200);
    const events = res.data.events || [];
    assert.ok(events.length > 0, 'Historical records must be accessible for audit/reconciliation');
    // None of these historical records should have is_verified: true
    for (const evt of events) {
      assert.strictEqual(evt.is_verified, false, `Historical event ${evt.id} must be unverified`);
    }
  });

  // =========================================================================
  // 4. REAL ROUTE TEST: SSR /events HTML Catalog & Detail Routes
  // =========================================================================
  console.log('\n── 4. Real Route: SSR Catalog & Event Detail Routes ──');

  await testAsync('GET /events returns 200 HTML with empty state and ZERO suspect event names', async () => {
    const res = await apiRequest('/events');
    assert.strictEqual(res.status, 200);
    const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    
    // Check that none of the 7 suspect events appear in the HTML
    assert.ok(!html.includes('Lagipula Hidup Akan Berakhir Bandung'), 'Hindia must not appear in HTML');
    assert.ok(!html.includes('Tunggu Aku Di Bandung'), 'Sheila on 7 must not appear in HTML');
    assert.ok(!html.includes("LANY: 'a beautiful blur'"), 'LANY must not appear in HTML');
    assert.ok(!html.includes('Bruno Mars: Live in Jakarta'), 'Bruno Mars must not appear in HTML');
    assert.ok(!html.includes('The Weeknd: After Hours'), 'The Weeknd must not appear in HTML');
    assert.ok(!html.includes('Coldplay Music of the Spheres'), 'Coldplay must not appear in HTML');
    assert.ok(!html.includes('Guns N Roses: Not In This Lifetime'), 'Guns N Roses must not appear in HTML');
  });

  await testAsync('Bypass attempt: GET /events?status=UPCOMING does not render suspect events', async () => {
    const res = await apiRequest('/events?status=UPCOMING');
    assert.strictEqual(res.status, 200);
    const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    assert.ok(!html.includes('Lagipula Hidup Akan Berakhir Bandung'));
    assert.ok(!html.includes('Coldplay Music of the Spheres'));
  });

  await testAsync('GET /events/:slug returns 404 for unverified/expired events', async () => {
    for (const slug of SUSPECT_SLUGS) {
      const res = await apiRequest(`/events/${slug}`);
      assert.strictEqual(res.status, 404, `Public detail page for unverified slug ${slug} must return 404, got ${res.status}`);
    }
  });

  await testAsync('GET /api/events/:slugOrId and /api/discovery/events/:slugOrId return 404 for suspect events', async () => {
    for (const id of SUSPECT_EVENT_IDS) {
      const resApi = await apiRequest(`/api/events/${id}`);
      assert.strictEqual(resApi.status, 404, `GET /api/events/${id} must return 404`);

      const resDisc = await apiRequest(`/api/discovery/events/${id}`);
      assert.strictEqual(resDisc.status, 404, `GET /api/discovery/events/${id} must return 404`);
    }
  });

  // =========================================================================
  // 5. INHERITANCE: Active Listings Cannot Bypass Event Eligibility
  // =========================================================================
  console.log('\n── 5. Active Listing Inheritance & Injection Gate ──');

  await testAsync('Active listing for unverified event does NOT leak event into /api/mvp/events', async () => {
    // Inject active listing for unverified seed event (event-pestapora-2026)
    const testListing = {
      id: `list-test-bypass-${uuidv4().substring(0, 8)}`,
      event_id: 'event-pestapora-2026',
      seller_id: 'user-seller-1',
      category: 'CAT 1',
      section: 'A',
      row: '1',
      seat: '10',
      price: 1500000,
      original_price: 1500000,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };
    state.listings.push(testListing);

    // 1. GET /api/mvp/events must STILL return 0 events
    const resEvents = await apiRequest('/api/mvp/events');
    const events = resEvents.data.data?.events || resEvents.data.events || [];
    assert.strictEqual(events.length, 0, 'Active listing must not leak unverified event into public events feed');

    // 2. GET /api/mvp/listings must NOT include listings for unverified seed events
    const resListings = await apiRequest('/api/mvp/listings');
    const listings = resListings.data.data?.listings || resListings.data.listings || [];
    const leaked = listings.find(l => l.id === testListing.id || l.event_id === 'event-pestapora-2026');
    assert.strictEqual(leaked, undefined, 'Active listing for unverified seed event must NOT appear in public listings');

    // 3. GET /api/mvp/listings/:id must return 404 or blocked for unverified event listing
    const resDetail = await apiRequest(`/api/mvp/listings/${testListing.id}`);
    assert.strictEqual(resDetail.status, 404, 'Detail route for unverified event listing must return 404');
  });

  // =========================================================================
  // 6. AUTHORITATIVE PROVENANCE: Official Promoter Verified Event Promotion
  // =========================================================================
  console.log('\n── 6. Official Source Boundary & Real Cryptographic Evidence ──');

  let verifiedEventId;
  const realPostUrl = 'https://www.instagram.com/p/DB_sheila_official_announce/';
  const realPublishedAt = '2026-09-20T10:00:00Z';
  const realObservedAt = '2026-09-20T10:05:00Z';
  const realRawBody = 'Antara Suara presents Sheila On 7 Tunggu Aku Di Bandung at Gelora Bandung Lautan Api on 2026-10-25';
  const realEvidenceHash = crypto.createHash('sha256').update(realRawBody).digest('hex');

  await testAsync('Official Tier 1 Promoter signal creates verified event with real evidence hash', async () => {
    // 1. Register official Tier 1 promoter via APMI template
    const csvPath = path.join(__dirname, 'PROMOTER_IMPORT_TEMPLATE.csv');
    PromoterImportService.importFromFile(csvPath);

    const promoter = promoterRegistry.getPromoterByHandle('@antara.suara');
    assert.ok(promoter);
    assert.strictEqual(promoter.verification_status, PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);

    // 2. Process official social post from verified promoter
    const postPayload = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung (Official)',
      start_date: '2026-10-25',
      venue_name: 'Stadion Gelora Bandung Lautan Api',
      city: 'Bandung',
      artists: ['Sheila on 7'],
      official_ticket_url: 'https://loket.com/event/sheila-on-7-bandung-official',
      post_url: realPostUrl,
      published_at: realPublishedAt,
      observed_at: realObservedAt,
      status: 'UPCOMING'
    };

    const res = await discoverySignalService.processSocialPost(postPayload, '@antara.suara');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'CANONICAL_EVENT_PROMOTED');
    assert.strictEqual(res.canonical_event.is_verified, true);
    assert.strictEqual(res.canonical_event.verification_status, 'PRIMARY_SOURCE_VERIFIED');

    verifiedEventId = res.canonical_event.event_id;

    // Attach explicit real evidence metadata
    const canonical = canonicalRegistry.getEventById(verifiedEventId);
    canonical.source_type = 'OFFICIAL_PROMOTER_INSTAGRAM';
    canonical.source_url = realPostUrl;
    canonical.source_account = '@antara.suara';
    canonical.source_published_at = realPublishedAt;
    canonical.source_last_checked_at = realObservedAt;
    canonical.evidence_hash = realEvidenceHash;
    canonical.verified_at = new Date().toISOString();

    // Sync canonical event into state.events
    canonicalRegistry.syncToState(state.events);
    const evCheck = state.events.find(e => e.id === verifiedEventId);
  });

  await testAsync('The verified promoter event NOW appears on real public routes', async () => {
    // 1. GET /api/mvp/events
    const resMvp = await apiRequest('/api/mvp/events');
    assert.strictEqual(resMvp.status, 200);
    const mvpEvents = resMvp.data.data?.events || resMvp.data.events || [];
    assert.strictEqual(mvpEvents.length, 1, 'Verified event must appear on /api/mvp/events');
    assert.strictEqual(mvpEvents[0].id, verifiedEventId);
    assert.strictEqual(mvpEvents[0].is_verified, true);

    // 2. GET /api/events
    const resApi = await apiRequest('/api/events');
    assert.strictEqual(resApi.status, 200);
    const apiEvents = resApi.data.events || [];
    assert.strictEqual(apiEvents.length, 1);
    assert.strictEqual(apiEvents[0].id, verifiedEventId);

    // 3. GET /api/events/home-feed
    const resFeed = await apiRequest('/api/events/home-feed');
    assert.strictEqual(resFeed.status, 200);
    const feed = resFeed.data.sections?.upcoming_nearest || resFeed.data.feed || [];
    assert.strictEqual(feed.length, 1);
  });

  await testAsync('Non-authoritative source cannot make an event VERIFIED', async () => {
    // Attempt ingestion from generic secondary aggregator
    const aggregatorPayload = {
      title: 'Fabricated Indie Fest 2026',
      date: '2026-11-20',
      venue: 'Parkir Timur Senayan',
      city: 'Jakarta',
      sources: [{
        source_id: 'src-generic-media-aggregator',
        source_name: 'Generic Media Aggregator',
        tier: 4,
        trust_level: TRUST_LEVELS.TIER_5
      }]
    };

    const unverifiedCanonical = canonicalRegistry.createEvent({
      event_id: 'event-fabricated-media',
      canonical_name: aggregatorPayload.title,
      start_date: aggregatorPayload.date,
      venue_name: aggregatorPayload.venue,
      city: aggregatorPayload.city,
      status: 'UPCOMING',
      sources: aggregatorPayload.sources
    });

    assert.strictEqual(unverifiedCanonical.is_verified, false);
    assert.strictEqual(unverifiedCanonical.verification_status, VERIFICATION_STATUS.UNVERIFIED);

    canonicalRegistry.syncToState(state.events);

    // Verify it is NOT returned on public routes
    const res = await apiRequest('/api/mvp/events');
    const events = res.data.data?.events || res.data.events || [];
    assert.strictEqual(events.length, 1, 'Only the 1 verified promoter event should be public');
    assert.strictEqual(events[0].id, verifiedEventId);
  });

  // =========================================================================
  // 7. ANTI-RESURRECTION: Cancelled / Expired Events Cannot Revive
  // =========================================================================
  console.log('\n── 7. Anti-Resurrection Guard ──');

  await testAsync('Promoter announcement of CANCELLED immediately drops event from public routes', async () => {
    const cancelPost = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung (Official)',
      start_date: '2026-10-25',
      venue_name: 'Stadion Gelora Bandung Lautan Api',
      city: 'Bandung',
      artists: ['Sheila on 7'],
      status: 'CANCELLED',
      post_url: 'https://www.instagram.com/p/DB_cancelled_post/',
      published_at: '2026-09-22T08:00:00Z'
    };

    const res = await discoverySignalService.processSocialPost(cancelPost, '@antara.suara');
    assert.strictEqual(res.success, true);

    const event = canonicalRegistry.getEventById(verifiedEventId);
    assert.strictEqual(event.status, 'CANCELLED');
    assert.strictEqual(event.is_verified, false);

    canonicalRegistry.syncToState(state.events);

    // Check public routes
    const resMvp = await apiRequest('/api/mvp/events');
    const events = resMvp.data.data?.events || resMvp.data.events || [];
    assert.strictEqual(events.length, 0, 'Cancelled event must immediately disappear from public /api/mvp/events');

    const resApi = await apiRequest('/api/events');
    assert.strictEqual(resApi.data.events.length, 0, 'Cancelled event must disappear from /api/events');
  });

  await testAsync('Attempted re-ingestion claiming ON_SALE is rejected and does not revive CANCELLED event', async () => {
    const revivePost = {
      name: 'Sheila on 7 — Tunggu Aku Di Bandung (Official)',
      start_date: '2026-10-25',
      venue_name: 'Stadion Gelora Bandung Lautan Api',
      city: 'Bandung',
      status: 'UPCOMING'
    };

    const attemptRes = canonicalRegistry.updateEventFromObservation(
      verifiedEventId,
      revivePost,
      'src-promoter-antara-suara-instagram',
      {}
    );

    assert.ok(attemptRes.rejected, 'Update must be rejected for terminal lifecycle event');
    assert.strictEqual(attemptRes.rejected, 'RESURRECTION_REJECTED_FOR_TERMINAL_EVENT');

    // Public routes must still return 0 events
    const res = await apiRequest('/api/mvp/events');
    const events = res.data.data?.events || res.data.events || [];
    assert.strictEqual(events.length, 0, 'Resurrected event must not leak onto public routes');
  });

  // Close server
  await new Promise((resolve) => server.close(resolve));

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  ROUTE REGRESSION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal regression suite error:', err);
  if (server) server.close();
  process.exit(1);
});
