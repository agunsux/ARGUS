/**
 * TIKUM / ARGUS — Infokonser Primary Discovery & Event Lifecycle Test Suite
 *
 * Validates all 15 acceptance criteria:
 * 1. @infokonser source registered as active and primary discovery
 * 2. @infokonser discovery returns upcoming Indonesian events
 * 3. Discovered events have complete metadata
 * 4. Cross-check prevents duplicate creation
 * 5. Missing upcoming events are added
 * 6. Expired event detection (event in past is identified as expired)
 * 7. H+3 rule calculation:
 *    - Event on 2026-09-29 -> at 2026-09-30 = not archived (H+1)
 *    - Event on 2026-09-29 -> at 2026-10-02 = ARCHIVED (H+3)
 * 8. Homepage filter excludes archived events
 * 9. Archive endpoint returns archived events
 * 10. Lifecycle engine moves expired events to ARCHIVED
 * 11. Preserved data invariant (archived events retain all fields)
 * 12. Image verification passes for all new events
 * 13. Source provenance is complete for all events
 * 14. Defense-in-depth: query-time filter catches expired even without lifecycle run
 * 15. Real-time discovery doesn't block request processing
 */

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { sourceRegistry } = require('./src/discovery/SourceRegistry');
const { adapterRegistry } = require('./src/discovery/adapters/AdapterRegistry');
const { CanonicalEventRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS, isEventExpired, isEventArchived, getJakartaDateString } = require('./src/discovery/EventTemporalLifecycleEngine');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { EventVisualProvenanceService } = require('./src/discovery/EventVisualProvenanceService');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          parsed = body;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          body: parsed
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('TIKUM — INFOKONSER DISCOVERY & EVENT LIFECYCLE ACCEPTANCE SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.error(`      ${err.message}`);
      failed++;
    }
  }

  // Start temporary server for HTTP endpoints
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // ----------------------------------------------------------------
    // Test 1: @infokonser source registered as active and primary discovery
    // ----------------------------------------------------------------
    await test('Test 1: @infokonser source registered as active and primary discovery', async () => {
      const src = sourceRegistry.getSource('src-ig-infokonser');
      assert.ok(src, 'src-ig-infokonser must be registered');
      assert.strictEqual(src.active, true, 'src-ig-infokonser must be active');
      assert.strictEqual(src.priority, 1, 'src-ig-infokonser must have priority 1');
      assert.strictEqual(src.is_primary_discovery, true, 'src-ig-infokonser must be primary discovery source');
      assert.strictEqual(src.account_handle, '@infokonser');
    });

    // ----------------------------------------------------------------
    // Test 2: @infokonser discovery returns upcoming events
    // ----------------------------------------------------------------
    let discoveredSignals = [];
    await test('Test 2: @infokonser discovery returns upcoming events', async () => {
      const adapter = adapterRegistry.getAdapter('src-ig-infokonser');
      assert.ok(adapter, 'SocialDiscoveryAdapter must be resolved for src-ig-infokonser');
      discoveredSignals = await adapter.discover();
      assert.ok(Array.isArray(discoveredSignals), 'discover() must return an array');
      assert.ok(discoveredSignals.length >= 10, `Expected at least 10 signals from @infokonser, got ${discoveredSignals.length}`);
      
      const upcoming = discoveredSignals.filter(s => (s.start_date || s.date) >= '2026-10-01');
      assert.ok(upcoming.length >= 5, `Expected multiple upcoming concerts, got ${upcoming.length}`);
    });

    // ----------------------------------------------------------------
    // Test 3: Discovered events have complete metadata
    // ----------------------------------------------------------------
    await test('Test 3: Discovered events have complete metadata', async () => {
      assert.ok(discoveredSignals.length > 0, 'Signals must be populated');
      for (const s of discoveredSignals) {
        assert.ok(s.source_id, 'Signal must have source_id');
        assert.ok(s.canonical_name || s.title || s.name, 'Signal must have title/name');
        assert.ok(s.start_date || s.date, `Signal ${s.title} missing date`);
        assert.ok(s.venue_name || s.venue, `Signal ${s.title} missing venue`);
        assert.ok(s.city, `Signal ${s.title} missing city`);
        assert.ok(s.country, `Signal ${s.title} missing country`);
        assert.ok(s.source_url || s.post_url, `Signal ${s.title} missing source_url`);
      }
    });

    // ----------------------------------------------------------------
    // Test 4: Cross-check prevents duplicate creation
    // ----------------------------------------------------------------
    await test('Test 4: Cross-check prevents duplicate creation', async () => {
      const registry = new CanonicalEventRegistry();
      const existingEvent = registry.createEvent({
        id: 'ev-nct127-jakarta',
        title: 'NCT 127 4TH TOUR NEO CITY — THE MOMENTUM',
        artists: ['NCT 127'],
        start_date: '2026-11-14',
        venue_name: 'Beach City International Stadium',
        city: 'Jakarta',
        country: 'Indonesia',
        source_id: 'src-weverse'
      });

      const duplicateSignal = {
        title: 'NCT 127 NEO CITY THE MOMENTUM JAKARTA',
        artists: ['NCT 127'],
        start_date: '2026-11-14',
        venue_name: 'Beach City International Stadium',
        city: 'Jakarta',
        country: 'Indonesia'
      };

      const match = EventDeduplicationService.findDuplicateCandidate(duplicateSignal, registry.getAllEvents());
      assert.ok(match.isMatch, 'Must detect duplicate of existing event');
      assert.strictEqual(match.canonicalEvent.id, existingEvent.id, 'Must match exact canonical event ID');
    });

    // ----------------------------------------------------------------
    // Test 5: Missing upcoming events are added
    // ----------------------------------------------------------------
    await test('Test 5: Missing upcoming events are added', async () => {
      const registry = new CanonicalEventRegistry();
      const newEvent = registry.createEvent({
        name: 'The Script — Satellites World Tour Jakarta',
        title: 'The Script — Satellites World Tour Jakarta',
        artists: ['The Script'],
        start_date: '2026-10-18',
        venue_name: 'Indonesia Arena',
        city: 'Jakarta',
        country: 'Indonesia',
        organizer_name: 'Color Asia Live',
        source_id: 'src-ig-infokonser',
        source_url: 'https://www.instagram.com/p/CxyzTheScriptJakarta'
      });

      assert.ok(newEvent.event_id, 'Created event must have event_id');
      assert.strictEqual(newEvent.discovered_by, '@infokonser', 'Must note discoveredBy as @infokonser');
      assert.strictEqual(newEvent.city, 'Jakarta');
      assert.strictEqual(newEvent.start_date, '2026-10-18');
    });

    // ----------------------------------------------------------------
    // Test 6: Expired event detection (event in past is identified as expired)
    // ----------------------------------------------------------------
    await test('Test 6: Expired event detection (event in past is identified as expired)', async () => {
      const pastEvent = {
        title: 'Past Concert In August',
        start_date: '2026-08-15',
        end_date: '2026-08-15',
        event_start_at: '2026-08-15T19:00:00+07:00',
        event_end_at: '2026-08-15T23:00:00+07:00',
        timezone: 'Asia/Jakarta'
      };

      const now = new Date('2026-09-30T10:00:00+07:00');
      assert.strictEqual(EventTemporalLifecycleEngine.isEventExpired(pastEvent, now), true, 'Past event must be expired');
      assert.strictEqual(isEventExpired(pastEvent, now), true, 'Exported isEventExpired helper must return true');

      const futureEvent = {
        title: 'Future Concert In November',
        start_date: '2026-11-20',
        end_date: '2026-11-20',
        event_start_at: '2026-11-20T19:00:00+07:00',
        event_end_at: '2026-11-20T23:00:00+07:00',
        timezone: 'Asia/Jakarta'
      };
      assert.strictEqual(EventTemporalLifecycleEngine.isEventExpired(futureEvent, now), false, 'Future event must not be expired');
    });

    // ----------------------------------------------------------------
    // Test 7: H+3 rule calculation:
    // Event on 2026-09-29 -> at 2026-09-30 = not archived (H+1)
    // Event on 2026-09-29 -> at 2026-10-02 = ARCHIVED (H+3)
    // ----------------------------------------------------------------
    await test('Test 7: H+3 rule calculation: 2026-09-29 event at 2026-09-30 is not archived; at 2026-10-02 is ARCHIVED', async () => {
      const sept29Event = {
        event_id: 'ev-test-sept-29',
        title: 'Special Concert on Sept 29',
        start_date: '2026-09-29',
        end_date: '2026-09-29',
        event_start_at: '2026-09-29T19:00:00+07:00',
        event_end_at: '2026-09-29T23:00:00+07:00',
        timezone: 'Asia/Jakarta'
      };

      // At 2026-09-30 (H+1): within grace period -> NOT ARCHIVED
      const clockH1 = new Date('2026-09-30T14:00:00+07:00');
      const isArchivedH1 = EventTemporalLifecycleEngine.isEventArchived(sept29Event, clockH1);
      assert.strictEqual(isArchivedH1, false, 'Event on 2026-09-29 at 2026-09-30 must NOT be archived (H+1)');

      // At 2026-10-01 (H+2): within grace period -> NOT ARCHIVED
      const clockH2 = new Date('2026-10-01T20:00:00+07:00');
      const isArchivedH2 = EventTemporalLifecycleEngine.isEventArchived(sept29Event, clockH2);
      assert.strictEqual(isArchivedH2, false, 'Event on 2026-09-29 at 2026-10-01 must NOT be archived (H+2)');

      // At 2026-10-02 (H+3): past grace period -> ARCHIVED
      const clockH3 = new Date('2026-10-02T10:00:00+07:00');
      const isArchivedH3 = EventTemporalLifecycleEngine.isEventArchived(sept29Event, clockH3);
      assert.strictEqual(isArchivedH3, true, 'Event on 2026-09-29 at 2026-10-02 must be ARCHIVED (H+3)');
    });

    // ----------------------------------------------------------------
    // Test 8: Homepage filter excludes archived events
    // ----------------------------------------------------------------
    await test('Test 8: Homepage filter excludes archived events', async () => {
      // Simulate query at 2026-10-02 (H+3 for Sept 29 event)
      const res = await makeRequest('/api/events/home-feed?now=2026-10-02T12:00:00%2B07:00');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      const allCardTitles = (res.data.feed || []).concat(res.data.events || []).map(e => e.title);
      assert.strictEqual(allCardTitles.some(t => t.includes('Sept 29') || t.includes('Pestapora')), false,
        'Archived events must not appear in homepage feed');
    });

    // ----------------------------------------------------------------
    // Test 9: Archive endpoint returns archived events
    // ----------------------------------------------------------------
    await test('Test 9: Archive endpoint returns archived events', async () => {
      const res = await makeRequest('/api/events/archived?now=2026-10-02T12:00:00%2B07:00');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.events), 'Archived events must be returned as array');
    });

    // ----------------------------------------------------------------
    // Test 10: Lifecycle engine moves expired events to ARCHIVED
    // ----------------------------------------------------------------
    await test('Test 10: Lifecycle engine moves expired events to ARCHIVED', async () => {
      const eventToArchive = {
        event_id: 'ev-test-lifecycle-archive',
        title: 'Concluded Rock Fest',
        start_date: '2026-09-25',
        end_date: '2026-09-25',
        event_start_at: '2026-09-25T19:00:00+07:00',
        event_end_at: '2026-09-25T23:00:00+07:00',
        timezone: 'Asia/Jakarta',
        verification_status: 'VERIFIED',
        is_verified: true,
        public_visibility: true,
        homepage_visibility: true
      };

      const nowH3 = new Date('2026-09-30T10:00:00+07:00'); // H+5
      const res = await EventTemporalLifecycleEngine.reconcileEvent(eventToArchive, nowH3);
      assert.strictEqual(res.new_status, LIFECYCLE_STATUS.ARCHIVED);
      assert.strictEqual(eventToArchive.archive_status, 'ARCHIVED');
      assert.strictEqual(eventToArchive.homepage_visibility, false);
      assert.strictEqual(eventToArchive.public_visibility, false);
      assert.ok(eventToArchive.archived_at, 'archived_at timestamp must be populated');
    });

    // ----------------------------------------------------------------
    // Test 11: Preserved data invariant (archived events retain all fields)
    // ----------------------------------------------------------------
    await test('Test 11: Preserved data invariant (archived events retain all fields)', async () => {
      const eventRecord = {
        event_id: 'ev-preserve-test',
        title: 'Preserved Legendary Concert',
        artists: ['Legend Band'],
        start_date: '2026-09-20',
        end_date: '2026-09-20',
        event_start_at: '2026-09-20T19:00:00+07:00',
        event_end_at: '2026-09-20T23:00:00+07:00',
        venue_name: 'Gelora Bung Karno',
        city: 'Jakarta',
        country: 'Indonesia',
        organizer_name: 'Big Promoters',
        min_price: 750000,
        max_price: 2500000,
        source_url: 'https://loket.com/event/legend',
        sources: [{ source_id: 'src-loket', source_url: 'https://loket.com/event/legend' }]
      };

      await EventTemporalLifecycleEngine.reconcileEvent(eventRecord, new Date('2026-09-30T10:00:00+07:00'));
      assert.strictEqual(eventRecord.archive_status, 'ARCHIVED');
      assert.strictEqual(eventRecord.title, 'Preserved Legendary Concert');
      assert.strictEqual(eventRecord.venue_name, 'Gelora Bung Karno');
      assert.strictEqual(eventRecord.min_price, 750000);
      assert.strictEqual(eventRecord.sources.length, 1);
      assert.ok(eventRecord.archived_at, 'archived_at must be preserved');
    });

    // ----------------------------------------------------------------
    // Test 12: Image verification passes for all new events
    // ----------------------------------------------------------------
    await test('Test 12: Image verification passes for all new events', async () => {
      const nctEvent = {
        title: 'NCT 127 4TH TOUR NEO CITY — THE MOMENTUM',
        canonical_name: 'NCT 127 4TH TOUR NEO CITY — THE MOMENTUM',
        artist: 'NCT 127',
        artists: ['NCT 127'],
        city: 'Jakarta'
      };

      const validPoster = 'https://assets.loket.com/nct127-official-poster.jpg';
      const checkValid = EventVisualProvenanceService.detectWrongImage(validPoster, nctEvent);
      assert.strictEqual(checkValid.is_wrong, false, 'Authentic artist poster must not be flagged wrong');

      const wrongLanyPoster = 'https://assets.loket.com/lany-jakarta-banner.jpg';
      const checkWrong = EventVisualProvenanceService.detectWrongImage(wrongLanyPoster, nctEvent);
      assert.strictEqual(checkWrong.is_wrong, true, 'Cross-artist poster must be detected as wrong image');
    });

    // ----------------------------------------------------------------
    // Test 13: Source provenance is complete for all events
    // ----------------------------------------------------------------
    await test('Test 13: Source provenance is complete for all events', async () => {
      const registry = new CanonicalEventRegistry();
      const ev = registry.createEvent({
        title: 'BABYMONSTER 1ST WORLD TOUR IN JAKARTA',
        artists: ['BABYMONSTER'],
        start_date: '2026-11-28',
        venue_name: 'ICE BSD',
        city: 'Tangerang',
        country: 'Indonesia',
        source_id: 'src-ig-infokonser',
        source_url: 'https://www.instagram.com/p/CxyzBabymonsterJakarta',
        image_url: 'https://assets.loket.com/babymonster-poster.jpg'
      });

      assert.strictEqual(ev.discoveredBy, '@infokonser');
      assert.ok(ev.sourceUrl);
      assert.ok(ev.imageSource);
      assert.ok(ev.imageConfidence);
      assert.ok(ev.firstDiscoveredAt);
    });

    // ----------------------------------------------------------------
    // Test 14: Defense-in-depth: query-time filter catches expired even without lifecycle run
    // ----------------------------------------------------------------
    await test('Test 14: Defense-in-depth: query-time filter catches expired even without lifecycle run', async () => {
      const mockEvent = {
        title: 'Concluded Event Still Marked Upcoming',
        status: 'UPCOMING',
        lifecycle_status: 'UPCOMING',
        archive_status: 'ACTIVE',
        start_date: '2026-09-20',
        end_date: '2026-09-20',
        event_start_at: '2026-09-20T19:00:00+07:00',
        event_end_at: '2026-09-20T23:00:00+07:00',
        timezone: 'Asia/Jakarta',
        is_verified: true,
        verification_status: 'VERIFIED',
        public_visibility: true,
        homepage_visibility: true
      };

      const now = new Date('2026-09-30T10:00:00+07:00');
      // Even though mockEvent has status: 'UPCOMING', the query-level predicate rejects it!
      const eligible = EventTemporalLifecycleEngine.isEventHomepageEligible(mockEvent, now);
      assert.strictEqual(eligible, false, 'Defense-in-depth must reject past event regardless of raw status field');
      assert.strictEqual(EventTemporalLifecycleEngine.isEventArchived(mockEvent, now), true, 'Must identify as archived');
    });

    // ----------------------------------------------------------------
    // Test 15: Real-time discovery doesn't block request processing
    // ----------------------------------------------------------------
    await test('Test 15: Real-time discovery doesn\'t block request processing', async () => {
      const startMs = Date.now();
      const res = await makeRequest('/api/events/home-feed');
      const durationMs = Date.now() - startMs;

      assert.strictEqual(res.status, 200);
      assert.ok(durationMs < 1000, `Feed request must respond within SLA (< 1000ms), took ${durationMs}ms`);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n================================================================');
  console.log(`INFOKONSER DISCOVERY SUITE: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
