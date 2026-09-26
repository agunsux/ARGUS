/**
 * TIKUM / ARGUS — Live Event Auto-Refresh, Expiry Engine & Temporal Acceptance Test Suite
 * 
 * Validates:
 * 1. Minimal Acceptance Tests A through L (Section 21):
 *    - Test A: Future Event -> UPCOMING -> homepage feed = true
 *    - Test B: Event Today -> TODAY -> sections.today = true, not in future upcoming
 *    - Test C: H+1 Grace Period -> RECENT -> sections.recent = true, not in upcoming
 *    - Test D: H+2 Boundary -> RECENT -> grace cutoff boundary respected
 *    - Test E: H+3 Expiry -> EXPIRED -> completely hidden from homepage, DB record retained
 *    - Test F: New Verified Event -> Canonical created -> appears automatically on feed
 *    - Test G: Cancelled Event -> CANCELLED -> immediately removed from homepage
 *    - Test H: Postponed Event -> Rescheduled -> canonical updated, upcoming again
 *    - Test I: Stale Source Detection -> STALE freshness flagged when TTL elapsed
 *    - Test J: Cache Invalidation -> no-cache/no-store headers prevent serving expired events
 *    - Test K: Duplicate Resolution -> multi-source entity merging into 1 canonical event
 *    - Test L: Zero-Fake Invariant -> uncorroborated discovery radar never public
 * 
 * 2. Requirement 22 Critical Production Test (The Weeknd 2026 Simulation):
 *    - 25 Sep 2026 (WIB): The Weeknd (Today), NCT 127, BABYMONSTER, LANY (Upcoming)
 *    - 28 Sep 2026 (WIB): The Weeknd (H+3 EXPIRED, removed), NCT 127, BABYMONSTER, LANY (Upcoming)
 *    - Dynamic injection of Dewa 19 (30 Sep 2026): appears automatically before NCT 127
 * 
 * 3. Ingestion Scheduler & Admin Control Center:
 *    - Recurring job schedules (Songkick 6h, Bandsintown 6h, Promoters 6h, etc.)
 *    - Resilient fault tolerance (single source failure does not break scheduler)
 *    - Comprehensive admin dashboard metrics
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');

const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');
const {
  EventTemporalLifecycleEngine,
  LIFECYCLE_STATUS,
  HOMEPAGE_EVENT_GRACE_DAYS
} = require('./src/discovery/EventTemporalLifecycleEngine');
const {
  EventVerificationService,
  VERIFICATION_STATUS,
  VERIFICATION_TIERS
} = require('./src/discovery/EventVerificationService');
const {
  ingestionScheduler,
  EventIngestionScheduler,
  SOURCE_SYNC_STATUS
} = require('./src/discovery/EventIngestionScheduler');
const { AdminEventControlService } = require('./src/discovery/AdminEventControlService');
const { sourceRegistry } = require('./src/discovery/SourceRegistry');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function request(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json', ...headers }
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (_) {
            /* html or text */
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json !== null ? json : data
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u001b[31m✗\u001b[0m ${name}`);
    console.log(`      Error: ${err.message}`);
    failed++;
  }
}

async function run() {
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  console.log('================================================================');
  console.log('TIKUM — LIVE EVENT AUTO-REFRESH & TEMPORAL LIFECYCLE SUITE');
  console.log('================================================================');

  const testSources = [
    { source_id: 'src-artist-sheilaon7', source_name: 'Sheila On 7 Official', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-promoter-pk', source_name: 'PK Entertainment Official', tier: 1, source_type: 'OFFICIAL_PROMOTER_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-artist-brunomars', source_name: 'Bruno Mars Official Website', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-artist-theweeknd', source_name: 'The Weeknd Official Website', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-artist-lany', source_name: 'LANY Official Website', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-weverse-official', source_name: 'Weverse Official Notice', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-artist-dewa19', source_name: 'Dewa 19 Official Website', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' }
  ];
  for (const s of testSources) {
    if (!sourceRegistry.getSource(s.source_id)) {
      sourceRegistry.registerSource(s);
    }
  }

  // ============================================================================
  // SECTION 1: MINIMAL ACCEPTANCE TESTS A THROUGH L
  // ============================================================================
  console.log('\n── Section 1: Minimal Acceptance Tests A through L ──');

  await test('Test A: Future Event (start_at > NOW) is UPCOMING and homepage eligible', async () => {
    const now = new Date('2026-09-25T10:00:00+07:00');
    const futureEvent = {
      event_id: 'ev-test-future-1',
      title: 'Future Concert 2026',
      start_date: '2026-10-15',
      event_start_at: '2026-10-15T19:00:00+07:00',
      event_end_at: '2026-10-15T23:00:00+07:00',
      timezone: 'Asia/Jakarta',
      verification_status: 'VERIFIED',
      is_verified: true,
      public_visibility: true
    };

    const window = EventTemporalLifecycleEngine.getHomepageTemporalWindow(futureEvent, now);
    assert.strictEqual(window, 'UPCOMING', 'Future event should be in UPCOMING window');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(futureEvent, now), true);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(futureEvent, now), true);
  });

  await test('Test B: Event Today (start_at <= NOW <= end_at) is TODAY and separated from future Upcoming', async () => {
    const now = new Date('2026-09-25T20:30:00+07:00');
    const todayEvent = {
      event_id: 'ev-test-today-1',
      title: 'Ongoing Concert Tonight',
      start_date: '2026-09-25',
      event_start_at: '2026-09-25T19:00:00+07:00',
      event_end_at: '2026-09-25T23:00:00+07:00',
      timezone: 'Asia/Jakarta',
      verification_status: 'VERIFIED',
      is_verified: true,
      public_visibility: true
    };

    const window = EventTemporalLifecycleEngine.getHomepageTemporalWindow(todayEvent, now);
    assert.strictEqual(window, 'TODAY', 'Ongoing event should be in TODAY window');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(todayEvent, now), false, 'Ongoing event cannot be upcoming');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(todayEvent, now), true, 'Ongoing event is eligible for homepage');
  });

  await test('Test C: H+1 Grace Period (NOW = end_at + 1 day) is RECENT and excluded from Upcoming Concert', async () => {
    const now = new Date('2026-09-26T15:00:00+07:00'); // H+1
    const concludedEvent = {
      event_id: 'ev-test-h1',
      title: 'Concluded Concert Yesterday',
      start_date: '2026-09-25',
      event_start_at: '2026-09-25T19:00:00+07:00',
      event_end_at: '2026-09-25T23:00:00+07:00',
      timezone: 'Asia/Jakarta',
      verification_status: 'VERIFIED',
      is_verified: true,
      public_visibility: true
    };

    const window = EventTemporalLifecycleEngine.getHomepageTemporalWindow(concludedEvent, now);
    assert.strictEqual(window, 'RECENT', 'H+1 event must be categorized as RECENT');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(concludedEvent, now), false, 'Concluded event must NOT be upcoming');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(concludedEvent, now), true, 'H+1 event is eligible under grace period');
  });

  await test('Test D: H+2 Boundary (NOW = end_at + 2 days) is RECENT and within grace cutoff', async () => {
    assert.strictEqual(HOMEPAGE_EVENT_GRACE_DAYS, 2, 'Homepage grace days must equal 2');
    const now = new Date('2026-09-27T22:00:00+07:00'); // H+2 evening
    const concludedEvent = {
      event_id: 'ev-test-h2',
      title: 'Concluded Concert Two Days Ago',
      start_date: '2026-09-25',
      event_start_at: '2026-09-25T19:00:00+07:00',
      event_end_at: '2026-09-25T23:00:00+07:00',
      timezone: 'Asia/Jakarta',
      verification_status: 'VERIFIED',
      is_verified: true,
      public_visibility: true
    };

    const window = EventTemporalLifecycleEngine.getHomepageTemporalWindow(concludedEvent, now);
    assert.strictEqual(window, 'RECENT', 'H+2 event is in RECENT grace window');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(concludedEvent, now), true, 'H+2 event is still homepage eligible');
  });

  await test('Test E: H+3 Expiry (NOW > end_at + 2 days) is EXPIRED and PUBLIC_HOME = false', async () => {
    const now = new Date('2026-09-28T08:00:00+07:00'); // H+3
    const expiredEvent = {
      event_id: 'ev-test-h3',
      title: 'Expired Concert',
      start_date: '2026-09-25',
      event_start_at: '2026-09-25T19:00:00+07:00',
      event_end_at: '2026-09-25T23:00:00+07:00',
      timezone: 'Asia/Jakarta',
      verification_status: 'VERIFIED',
      is_verified: true,
      public_visibility: true
    };

    const window = EventTemporalLifecycleEngine.getHomepageTemporalWindow(expiredEvent, now);
    assert.strictEqual(window, 'EXPIRED', 'H+3 event must be EXPIRED');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(expiredEvent, now), false, 'Expired event must NOT be homepage eligible');

    EventTemporalLifecycleEngine.reconcileEvent(expiredEvent, now);
    assert.strictEqual(expiredEvent.public_visibility, false, 'Expired event must have public_visibility = false');
    assert.ok(
      expiredEvent.lifecycle_status === LIFECYCLE_STATUS.EXPIRED || expiredEvent.lifecycle_status === LIFECYCLE_STATUS.ARCHIVED,
      'Expired event lifecycle must be EXPIRED or ARCHIVED'
    );
    assert.ok(expiredEvent.expired_at, 'expired_at timestamp must be recorded');
  });

  await test('Test F: New Verified Event appears in feed automatically without manual edits', async () => {
    canonicalRegistry.reset();
    ingestionPipeline.reset();

    const newEventPayload = {
      name: 'Coldplay Asia Tour 2026 Jakarta',
      title: 'Coldplay Asia Tour 2026 Jakarta',
      artists: ['Coldplay'],
      start_date: '2026-11-20',
      venue_name: 'Gelora Bung Karno Stadium',
      city: 'Jakarta',
      country: 'Indonesia',
      category: 'CONCERT',
      official_event_url: 'https://www.coldplay.com/tour',
      official_ticket_url: 'https://www.loket.com/event/coldplay-jakarta-2026',
      image_url: 'https://assets.loket.com/coldplay-poster.jpg'
    };

    // Step 1: Artist source (Tier 1)
    await ingestionPipeline.ingestEvent(
      newEventPayload,
      'src-artist-coldplay-web',
      { post_url: 'https://www.coldplay.com/tour' }
    );

    // Step 2: Promoter/Ticketing source (Tier 2)
    const ingestRes = await ingestionPipeline.ingestEvent(
      newEventPayload,
      'src-loket',
      { post_url: 'https://www.loket.com/event/coldplay-jakarta-2026' }
    );

    const canonical = ingestRes.canonical_event;
    assert.ok(canonical, 'Canonical event must be generated');
    assert.strictEqual(canonical.is_verified, true, 'Event must be verified');

    // Query home feed via HTTP simulating current date 2026-09-25
    const feedRes = await request('/api/events/home-feed?now=2026-09-25T12:00:00%2B07:00');
    assert.strictEqual(feedRes.status, 200);
    const found = (feedRes.body.events || []).find(e => e.event_id === canonical.event_id);
    assert.ok(found, 'New verified event must automatically appear in home-feed events list');
  });

  await test('Test G: Cancelled Event is immediately removed from homepage feed', async () => {
    const all = canonicalRegistry.getAllEvents();
    assert.ok(all.length >= 1, 'Registry must have at least one event');
    const targetEvent = all[0];

    // Official promoter announces cancellation
    canonicalRegistry.updateEventFromObservation(
      targetEvent.event_id,
      { status: 'CANCELLED' },
      'src-loket',
      { observed_at: new Date().toISOString(), post_url: 'https://www.loket.com/cancelled' }
    );

    assert.strictEqual(targetEvent.lifecycle_status, LIFECYCLE_STATUS.CANCELLED);
    assert.strictEqual(targetEvent.public_visibility, false);

    // Query feed
    const feedRes = await request('/api/events/home-feed?now=2026-09-25T12:00:00%2B07:00');
    const found = (feedRes.body.events || []).find(e => e.event_id === targetEvent.event_id);
    assert.strictEqual(found, undefined, 'Cancelled event must NOT appear in home-feed');
  });

  await test('Test H: Postponed Event reschedule updates canonical and restores upcoming', async () => {
    canonicalRegistry.reset();
    ingestionPipeline.reset();

    // Ingest event originally on 2026-09-26
    const res1 = await ingestionPipeline.ingestEvent({
      name: 'Sheila On 7 Reunion Tour',
      title: 'Sheila On 7 Reunion Tour',
      artists: ['Sheila On 7'],
      start_date: '2026-09-26',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung',
      country: 'Indonesia',
      category: 'CONCERT',
      official_event_url: 'https://www.sheilaon7.com/tour',
      official_ticket_url: 'https://www.loket.com/so7-bandung',
      image_url: 'https://assets.loket.com/so7.jpg'
    }, 'src-artist-sheilaon7', { post_url: 'https://www.sheilaon7.com/tour' });

    await ingestionPipeline.ingestEvent({
      name: 'Sheila On 7 Reunion Tour',
      title: 'Sheila On 7 Reunion Tour',
      start_date: '2026-09-26',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung',
      official_event_url: 'https://www.sheilaon7.com/tour',
      official_ticket_url: 'https://www.loket.com/so7-bandung',
      image_url: 'https://assets.loket.com/so7.jpg'
    }, 'src-loket', { post_url: 'https://www.loket.com/so7-bandung' });

    const ev = res1.canonical_event;

    // Reschedule to 2026-11-15
    canonicalRegistry.updateEventFromObservation(
      ev.event_id,
      {
        start_date: '2026-11-15',
        start_datetime: '2026-11-15T19:00:00+07:00',
        end_datetime: '2026-11-15T23:00:00+07:00',
        status: 'UPCOMING'
      },
      'src-artist-sheilaon7',
      { observed_at: new Date().toISOString(), post_url: 'https://www.sheilaon7.com/tour-update' }
    );

    assert.strictEqual(ev.start_date, '2026-11-15');
    assert.strictEqual(ev.public_visibility, true);
    assert.ok(ev.event_history.some(h => h.change_type === 'DATE_RESCHEDULED'));

    // Check feed at simulated 2026-09-25
    const feedRes = await request('/api/events/home-feed?now=2026-09-25T12:00:00%2B07:00');
    const found = (feedRes.body.events || []).find(e => e.event_id === ev.event_id);
    assert.ok(found, 'Postponed/rescheduled event must appear in upcoming feed');
    assert.strictEqual(found.start_date, '2026-11-15');
  });

  await test('Test I: Stale Source Detection flags STALE when verification TTL elapsed', async () => {
    const nearEventDate = '2026-09-28';
    const now = new Date('2026-09-27T10:00:00+07:00');
    const ttlMs = EventVerificationService.getFreshnessTtlMs(nearEventDate, now);
    assert.strictEqual(ttlMs, 6 * 60 * 60 * 1000, 'Events within 7 days must have 6h freshness TTL');

    const testEvent = {
      event_id: 'ev-stale-test',
      title: 'Stale Event',
      start_date: nearEventDate,
      event_start_at: '2026-09-28T19:00:00+07:00',
      event_end_at: '2026-09-28T23:00:00+07:00',
      verification_status: 'VERIFIED',
      is_verified: true,
      last_verified_at: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString() // 12h ago (>6h TTL)
    };

    const evalResult = EventVerificationService.evaluateEvent(testEvent, [], { now });
    assert.strictEqual(evalResult.verification_status, VERIFICATION_STATUS.STALE);
    assert.strictEqual(evalResult.verification_freshness, 'STALE');
  });

  await test('Test J: Cache Invalidation headers and zero-staleness guarantee', async () => {
    const feedRes = await request('/api/events/home-feed');
    assert.strictEqual(feedRes.headers['cache-control'], 'no-cache, no-store, must-revalidate');
    assert.strictEqual(feedRes.headers['pragma'], 'no-cache');
    assert.strictEqual(feedRes.headers['expires'], '0');
  });

  await test('Test K: Duplicate Resolution merges multi-source claims into 1 canonical event', async () => {
    canonicalRegistry.reset();
    ingestionPipeline.reset();

    const concertTitle = 'Bruno Mars Live in Jakarta 2026';
    const date = '2026-12-05';
    const venue = 'Jakarta International Stadium';

    // Source 1: Songkick discovery radar
    await ingestionPipeline.ingestEvent({
      name: concertTitle,
      title: concertTitle,
      start_date: date,
      venue_name: venue,
      city: 'Jakarta',
      category: 'CONCERT',
      official_event_url: 'https://www.songkick.com/concerts/12345'
    }, 'src-songkick-jakarta', { post_url: 'https://www.songkick.com/concerts/12345' });

    // Source 2: Promoter web announcement (PK Entertainment / Live Nation)
    await ingestionPipeline.ingestEvent({
      name: concertTitle,
      title: concertTitle,
      start_date: date,
      venue_name: venue,
      city: 'Jakarta',
      category: 'CONCERT',
      organizer_name: 'PK Entertainment',
      official_event_url: 'https://pkentertainment.id/brunomars',
      official_ticket_url: 'https://brunomarsinjakarta.com',
      image_url: 'https://dynamicmedia.livenationinternational.com/bruno-poster.jpg'
    }, 'src-promoter-pk', { post_url: 'https://pkentertainment.id/brunomars' });

    // Source 3: Artist official website
    await ingestionPipeline.ingestEvent({
      name: concertTitle,
      title: concertTitle,
      start_date: date,
      venue_name: venue,
      city: 'Jakarta',
      category: 'CONCERT',
      official_event_url: 'https://www.brunomars.com/tour'
    }, 'src-artist-brunomars', { post_url: 'https://www.brunomars.com/tour' });

    const all = canonicalRegistry.getAllEvents();
    assert.strictEqual(all.length, 1, 'Multi-source discovery must resolve into exactly 1 canonical event');
    const canonical = all[0];
    assert.strictEqual(canonical.sources.length, 3, 'Canonical event must contain all 3 source observations');
    assert.strictEqual(canonical.is_verified, true, 'Corroborated canonical event must be verified');
  });

  await test('Test L: Zero-Fake Invariant - Uncorroborated discovery radar never public', async () => {
    canonicalRegistry.reset();
    ingestionPipeline.reset();

    // Discovery from unverified Instagram channel alone
    const igRes = await ingestionPipeline.ingestEvent({
      name: 'Rumored Indie Gig at Kemang',
      title: 'Rumored Indie Gig at Kemang',
      start_date: '2026-10-30',
      venue_name: 'Kemang Backyard',
      city: 'Jakarta',
      category: 'CONCERT',
      official_event_url: 'https://www.instagram.com/infokonser/'
    }, 'src-ig-infokonser', { post_url: 'https://www.instagram.com/p/Cxyz' });

    const ev = igRes.canonical_event;
    assert.strictEqual(ev.is_verified, false, 'Uncorroborated social claim must NOT be verified');
    assert.strictEqual(ev.public_visibility, false, 'Unverified event must NOT have public_visibility');

    const feedRes = await request('/api/events/home-feed?now=2026-09-25T12:00:00%2B07:00');
    const found = (feedRes.body.events || []).find(e => e.event_id === ev.event_id);
    assert.strictEqual(found, undefined, 'Unverified discovery radar must NEVER leak to homepage feed');
  });

  // ============================================================================
  // SECTION 2: CRITICAL PRODUCTION TEST (THE WEEKND 2026 SIMULATION)
  // ============================================================================
  console.log('\n── Section 2: Requirement 22 Critical Production Test (The Weeknd 2026 Simulation) ──');

  canonicalRegistry.reset();
  ingestionPipeline.reset();
  resetDatabase();

  const sec2Sources = [
    { source_id: 'src-artist-theweeknd', source_name: 'The Weeknd Official Website', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-weverse-official', source_name: 'Weverse Official Notice', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-artist-lany', source_name: 'LANY Official Website', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' },
    { source_id: 'src-artist-dewa19', source_name: 'Dewa 19 Official Website', tier: 1, source_type: 'OFFICIAL_ARTIST_WEB', authority_role: 'PRIMARY_AUTHORITY', trust_level: 'TIER_1_OFFICIAL', active_status: 'ACTIVE' }
  ];
  for (const s of sec2Sources) {
    if (!sourceRegistry.getSource(s.source_id)) {
      sourceRegistry.registerSource(s);
    }
  }

  // Seed the 4 official benchmark events
  // 1. The Weeknd: 25 Sep 2026 (JIS)
  const weekndPayload = {
    name: 'The Weeknd — After Hours Til Dawn Tour',
    title: 'The Weeknd — After Hours Til Dawn Tour',
    artists: ['The Weeknd'],
    start_date: '2026-09-25',
    start_time: '19:00',
    start_datetime: '2026-09-25T19:00:00+07:00',
    end_date: '2026-09-25',
    end_time: '23:59',
    end_datetime: '2026-09-25T23:59:59+07:00',
    venue_name: 'Jakarta International Stadium (JIS)',
    city: 'Jakarta',
    country: 'Indonesia',
    category: 'CONCERT',
    official_event_url: 'https://www.theweekndinjakarta.com',
    official_ticket_url: 'https://www.loket.com/event/theweeknd2026',
    image_url: 'https://assets.loket.com/theweeknd-poster.jpg'
  };
  await ingestionPipeline.ingestEvent(weekndPayload, 'src-artist-theweeknd', { post_url: 'https://www.theweekndinjakarta.com' });
  await ingestionPipeline.ingestEvent(weekndPayload, 'src-loket', { post_url: 'https://www.loket.com/event/theweeknd2026' });

  // 2. NCT 127: 3 Oct 2026 (Beach City)
  const nctPayload = {
    name: 'NCT 127 4TH TOUR NEO CITY — THE MOMENTUM',
    title: 'NCT 127 4TH TOUR NEO CITY — THE MOMENTUM',
    artists: ['NCT 127'],
    start_date: '2026-10-03',
    start_time: '19:00',
    start_datetime: '2026-10-03T19:00:00+07:00',
    end_date: '2026-10-03',
    end_time: '23:00',
    end_datetime: '2026-10-03T23:00:00+07:00',
    venue_name: 'Beach City International Stadium',
    city: 'Jakarta',
    country: 'Indonesia',
    category: 'CONCERT',
    official_event_url: 'https://weverse.io/nct127/notice/37278',
    official_ticket_url: 'https://www.loket.com/event/nct127-jakarta',
    image_url: 'https://assets.loket.com/nct127-poster.jpg'
  };
  await ingestionPipeline.ingestEvent(nctPayload, 'src-weverse-official', { post_url: 'https://weverse.io/nct127/notice/37278' });
  await ingestionPipeline.ingestEvent(nctPayload, 'src-loket', { post_url: 'https://www.loket.com/event/nct127-jakarta' });

  // 3. BABYMONSTER: 17 Oct 2026 (ICE BSD)
  const bmPayload = {
    name: 'BABYMONSTER 1ST WORLD TOUR <HELLO MONSTERS> IN JAKARTA',
    title: 'BABYMONSTER 1ST WORLD TOUR <HELLO MONSTERS> IN JAKARTA',
    artists: ['BABYMONSTER'],
    start_date: '2026-10-17',
    start_time: '18:00',
    start_datetime: '2026-10-17T18:00:00+07:00',
    end_date: '2026-10-17',
    end_time: '22:00',
    end_datetime: '2026-10-17T22:00:00+07:00',
    venue_name: 'ICE BSD Hall 5-6',
    city: 'Tangerang',
    country: 'Indonesia',
    category: 'CONCERT',
    official_event_url: 'https://weverse.io/babymonster/notice/35647',
    official_ticket_url: 'https://www.loket.com/event/babymonster-jakarta',
    image_url: 'https://assets.loket.com/babymonster-poster.jpg'
  };
  await ingestionPipeline.ingestEvent(bmPayload, 'src-weverse-official', { post_url: 'https://weverse.io/babymonster/notice/35647' });
  await ingestionPipeline.ingestEvent(bmPayload, 'src-loket', { post_url: 'https://www.loket.com/event/babymonster-jakarta' });

  // 4. LANY: 29 Oct 2026 (ICE BSD)
  const lanyPayload = {
    name: 'LANY — a beautiful blur: the tour Jakarta',
    title: 'LANY — a beautiful blur: the tour Jakarta',
    artists: ['LANY'],
    start_date: '2026-10-29',
    start_time: '20:00',
    start_datetime: '2026-10-29T20:00:00+07:00',
    end_date: '2026-10-29',
    end_time: '23:30',
    end_datetime: '2026-10-29T23:30:00+07:00',
    venue_name: 'ICE BSD',
    city: 'Tangerang',
    country: 'Indonesia',
    category: 'CONCERT',
    official_event_url: 'https://www.lanyinjakarta2026.com',
    official_ticket_url: 'https://www.loket.com/event/lany-jakarta',
    image_url: 'https://assets.loket.com/lany-poster.jpg'
  };
  await ingestionPipeline.ingestEvent(lanyPayload, 'src-artist-lany', { post_url: 'https://www.lanyinjakarta2026.com' });
  await ingestionPipeline.ingestEvent(lanyPayload, 'src-loket', { post_url: 'https://www.loket.com/event/lany-jakarta' });

  await test('Simulation Step 1: On 25 Sep 2026, The Weeknd is TODAY and 3 events are UPCOMING', async () => {
    // 25 Sep 2026 at 19:30 WIB (during The Weeknd concert)
    const clock = '2026-09-25T19:30:00+07:00';
    const res = await request(`/api/events/home-feed?now=${encodeURIComponent(clock)}`);
    assert.strictEqual(res.status, 200);

    // Section counts
    assert.strictEqual(res.body.counts.today, 1, 'Expected 1 event happening today (The Weeknd)');
    assert.strictEqual(res.body.counts.upcoming, 3, 'Expected 3 upcoming events (NCT 127, BABYMONSTER, LANY)');

    // The Weeknd must be in today section
    const todayTitles = (res.body.sections.today || []).map(e => e.title);
    assert.ok(todayTitles.some(t => t.includes('The Weeknd')), 'The Weeknd must appear in sections.today');

    // Upcoming feed must ONLY contain events that haven't started yet
    const upcomingTitles = (res.body.sections.upcoming || []).map(e => e.title);
    assert.strictEqual(upcomingTitles.some(t => t.includes('The Weeknd')), false, 'The Weeknd must NOT appear in sections.upcoming');
    assert.ok(upcomingTitles.some(t => t.includes('NCT 127')), 'NCT 127 must be upcoming');
    assert.ok(upcomingTitles.some(t => t.includes('BABYMONSTER')), 'BABYMONSTER must be upcoming');
    assert.ok(upcomingTitles.some(t => t.includes('LANY')), 'LANY must be upcoming');

    // Section 13 format check on each event
    const sample = res.body.sections.today[0];
    assert.ok(sample.event_id, 'Missing event_id');
    assert.ok(sample.title, 'Missing title');
    assert.ok(sample.start_at, 'Missing start_at');
    assert.ok(sample.venue, 'Missing venue');
    assert.ok(sample.city, 'Missing city');
    assert.ok(sample.category, 'Missing category');
    assert.strictEqual(sample.verification_status, 'VERIFIED');
    assert.ok(sample.verification_tier, 'Missing verification_tier');
    assert.ok(sample.official_event_url, 'Missing official_event_url');
    assert.ok(sample.official_ticketing_url, 'Missing official_ticketing_url');
    assert.ok(sample.image_url, 'Missing image_url');
    assert.ok(sample.last_verified_at, 'Missing last_verified_at');
    assert.ok(sample.source_last_seen_at, 'Missing source_last_seen_at');
  });

  await test('Simulation Step 2: On 28 Sep 2026 (H+3), The Weeknd is EXPIRED and excluded from feed', async () => {
    // 28 Sep 2026 at 12:00 WIB (H+3 relative to The Weeknd on Sep 25)
    const clock = '2026-09-28T12:00:00+07:00';
    const res = await request(`/api/events/home-feed?now=${encodeURIComponent(clock)}`);
    assert.strictEqual(res.status, 200);

    // The Weeknd must NOT appear anywhere in the home-feed response
    const allReturnedEvents = [
      ...(res.body.events || []),
      ...(res.body.sections?.today || []),
      ...(res.body.sections?.upcoming || []),
      ...(res.body.sections?.recent || [])
    ];
    assert.strictEqual(
      allReturnedEvents.some(e => (e.title || '').includes('The Weeknd')),
      false,
      'The Weeknd must be completely absent from home-feed on 28 Sep 2026'
    );

    // Upcoming count should be exactly 3
    assert.strictEqual(res.body.counts.upcoming, 3, 'Expected 3 upcoming events remaining');

    // NON-DELETION INVARIANT: The Weeknd record must still exist in DB / registry
    const allWeeknd = canonicalRegistry.getAllEvents().filter(e => (e.title || '').includes('The Weeknd'));
    const weekndInDb = allWeeknd.find(e => e.start_date === '2026-09-25') || allWeeknd[0];
    assert.ok(weekndInDb, 'The Weeknd record must NOT be deleted from database');
    assert.ok(
      weekndInDb.lifecycle_status === LIFECYCLE_STATUS.EXPIRED || weekndInDb.lifecycle_status === LIFECYCLE_STATUS.ARCHIVED,
      'Database record must be flagged EXPIRED or ARCHIVED'
    );
    assert.strictEqual(weekndInDb.public_visibility, false, 'Database record must have public_visibility = false');
  });

  await test('Simulation Step 3: Dynamic Ingestion of Dewa 19 (30 Sep) automatically inserts before NCT 127', async () => {
    // Ingest Dewa 19 on 30 Sep 2026
    const dewaPayload = {
      name: 'Dewa 19 All Stars Stadium Tour 2026',
      title: 'Dewa 19 All Stars Stadium Tour 2026',
      artists: ['Dewa 19', 'All Stars'],
      start_date: '2026-09-30',
      start_time: '19:30',
      start_datetime: '2026-09-30T19:30:00+07:00',
      end_date: '2026-09-30',
      end_time: '23:30',
      end_datetime: '2026-09-30T23:30:00+07:00',
      venue_name: 'Gelora Bung Karno Stadium',
      city: 'Jakarta',
      country: 'Indonesia',
      category: 'CONCERT',
      official_event_url: 'https://dewa19.com/tour',
      official_ticket_url: 'https://www.loket.com/event/dewa19-allstars-2026',
      image_url: 'https://assets.loket.com/dewa19-poster.jpg'
    };

    await ingestionPipeline.ingestEvent(dewaPayload, 'src-artist-dewa19', { post_url: 'https://dewa19.com/tour' });
    await ingestionPipeline.ingestEvent(dewaPayload, 'src-loket', { post_url: 'https://www.loket.com/event/dewa19-allstars-2026' });

    // Query on simulated 28 Sep 2026
    const clock = '2026-09-28T12:00:00+07:00';
    const res = await request(`/api/events/home-feed?now=${encodeURIComponent(clock)}`);
    assert.strictEqual(res.status, 200);

    const upcomingEvents = res.body.events || [];
    assert.strictEqual(upcomingEvents.length, 4, 'Expected 4 upcoming events now');

    // Verify Dewa 19 is present and first (Sep 30 < Oct 3)
    assert.ok(upcomingEvents[0].title.includes('Dewa 19'), 'Dewa 19 (Sep 30) must be first in upcoming feed');
    assert.ok(upcomingEvents[1].title.includes('NCT 127'), 'NCT 127 (Oct 3) must be second');
    assert.ok(upcomingEvents[2].title.includes('BABYMONSTER'), 'BABYMONSTER (Oct 17) must be third');
    assert.ok(upcomingEvents[3].title.includes('LANY'), 'LANY (Oct 29) must be fourth');
  });

  // ============================================================================
  // SECTION 3: INGESTION SCHEDULER & ADMIN CONTROL CENTER
  // ============================================================================
  console.log('\n── Section 3: Ingestion Scheduler & Admin Control Center ──');

  await test('Scheduler registers distinct recurring discovery schedules per source', async () => {
    const jobs = ingestionScheduler.getSourceSyncJobs();
    assert.ok(jobs.length >= 6, 'Expected at least 6 source sync jobs');

    const songkick = jobs.find(j => j.source_id === 'src-songkick-jakarta');
    assert.ok(songkick, 'Songkick job missing');
    assert.strictEqual(songkick.interval_hours, 6, 'Songkick must sync every 6h');

    const bandsintown = jobs.find(j => j.source_id === 'src-bandsintown-jakarta');
    assert.ok(bandsintown, 'Bandsintown job missing');
    assert.strictEqual(bandsintown.interval_hours, 6, 'Bandsintown must sync every 6h');

    const promoters = jobs.find(j => j.source_id === 'src-promoters-official');
    assert.ok(promoters, 'Promoters job missing');
    assert.strictEqual(promoters.interval_hours, 6, 'Promoters must sync every 6h');

    const weverse = jobs.find(j => j.source_id === 'src-weverse-official');
    assert.ok(weverse, 'Weverse job missing');
    assert.strictEqual(weverse.interval_hours, 12, 'Weverse artist official must sync every 12h');

    const gov = jobs.find(j => j.source_id === 'src-gov-calendar');
    assert.ok(gov, 'Gov calendar job missing');
    assert.strictEqual(gov.interval_hours, 24, 'Gov calendar must sync every 24h');
  });

  await test('Scheduler execution runs sync and updates last_source_sync_at', async () => {
    const now = new Date('2026-09-28T14:00:00+07:00');
    const result = await ingestionScheduler.runSourceSync('src-promoters-official', now);
    assert.strictEqual(result.status, SOURCE_SYNC_STATUS.SUCCESS);
    assert.ok(ingestionScheduler.getLastSourceSyncAt(), 'last_source_sync_at must be populated');
  });

  await test('Scheduler fault tolerance: individual adapter failure does not crash system', async () => {
    // Create isolated test scheduler instance to verify failure containment
    const testScheduler = new EventIngestionScheduler();
    const result = await testScheduler.runSourceSync('src-non-existent-broken');
    assert.strictEqual(result.status, SOURCE_SYNC_STATUS.FAILED);
    assert.ok(result.error, 'Error message must be reported without throwing unhandled exception');
  });

  await test('Admin Control Dashboard reports accurate real-time metrics and temporal states', async () => {
    const now = new Date('2026-09-28T12:00:00+07:00');
    const dashboard = AdminEventControlService.getControlDashboard(now);

    assert.ok(dashboard.timestamp, 'Missing dashboard timestamp');
    assert.strictEqual(dashboard.timezone, 'Asia/Jakarta');
    assert.ok(dashboard.counts, 'Missing dashboard counts');
    assert.ok(dashboard.counts.total_canonical >= 5, 'Expected at least 5 canonical events');
    assert.ok(dashboard.counts.verified >= 4, 'Expected at least 4 verified events');
    assert.ok(dashboard.counts.expired >= 1, 'Expected at least 1 expired event (The Weeknd)');
    assert.ok(dashboard.daily_counters, 'Missing daily_counters');
    assert.ok(dashboard.source_sync_jobs.length >= 6, 'Missing source sync jobs in dashboard');
    assert.ok(Array.isArray(dashboard.events), 'Missing detailed events array');
  });

  server.close();

  console.log('\n================================================================');
  console.log(`  TIKUM TEMPORAL LIFECYCLE SUITE: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(err => {
  console.error(err);
  if (server) server.close();
  process.exit(1);
});
