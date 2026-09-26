/**
 * TIKUM / ARGUS — ZERO-FAKE EVENT POLICY & VERIFIED EVENT REGISTRY ACCEPTANCE SUITE
 * 
 * Verifies Epics:
 * 1. ZERO-FAKE POLICY: No event verified without authoritative proofs.
 * 2. 3 VERIFICATION TIERS:
 *    - TIER A: Double Official Verified (Artist + Promoter + Ticketing/Venue)
 *    - TIER B: Official Event Verified (Event Site + Organizer + Ticketing/Venue/Gov)
 *    - TIER C: Discovery Only (Aggregators, Social, Uncorroborated Gov Calendars)
 * 3. 14 MANDATORY SCHEMA ATTRIBUTES:
 *    - artist_official_url, artist_official_source_type, artist_verification_status
 *    - promoter_official_url, promoter_verification_status
 *    - event_official_url, event_verification_status
 *    - ticketing_official_url, ticketing_verification_status
 *    - venue_verification_status
 *    - verification_tier, verification_score
 *    - last_verified_at, next_verification_at
 * 4. REAL-WORLD CASES:
 *    - NCT 127 (Weverse notice): TIER A Verified
 *    - BABYMONSTER (Weverse notice): TIER A Verified
 *    - Synchronize Festival 2026: TIER B Verified
 *    - YE Live in Jakarta (EKRAF Hub listing): FAIL-CLOSED to PENDING_ARTIST_VERIFICATION / TIER C
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventVerificationService, VERIFICATION_STATUS, VERIFICATION_TIERS, ARTIST_SOURCE_TYPES } = require('./src/discovery/EventVerificationService');
const { sourceRegistry } = require('./src/discovery/SourceRegistry');
const { RealSourceSeedService } = require('./src/discovery/RealSourceSeedService');
const { OfficialSourceSnapshotStore } = require('./src/discovery/OfficialSourceSnapshotStore');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function request(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: 'GET', headers: { Accept: 'application/json' } }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json !== null ? json : data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

async function run() {
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  console.log('================================================================');
  console.log('TIKUM — ZERO-FAKE EVENT POLICY & VERIFICATION TIERS SUITE');
  console.log('================================================================\n');

  console.log('── 1. Schema Validation (14 Mandatory Attributes) ──');

  await test('EventVerificationService exports VERIFICATION_TIERS and ARTIST_SOURCE_TYPES', async () => {
    assert.ok(VERIFICATION_TIERS.TIER_A_DOUBLE_OFFICIAL);
    assert.ok(VERIFICATION_TIERS.TIER_B_OFFICIAL_EVENT);
    assert.ok(VERIFICATION_TIERS.TIER_C_DISCOVERY_ONLY);

    assert.ok(ARTIST_SOURCE_TYPES.WEVERSE);
    assert.ok(ARTIST_SOURCE_TYPES.ARTIST_OFFICIAL_WEB);
    assert.ok(ARTIST_SOURCE_TYPES.MANAGEMENT_LABEL_OFFICIAL);
    assert.ok(ARTIST_SOURCE_TYPES.NOT_APPLICABLE);
  });

  await test('Evaluation generates all 14 mandatory fields with correct types', async () => {
    const mockConcert = {
      event_id: 'ev-test-schema-001',
      title: 'IU: HEREH World Tour Jakarta 2026',
      start_date: '2026-11-15',
      venue_name: 'Indonesia Arena',
      city: 'Jakarta',
      category: 'CONCERT',
      artist_official_url: 'https://edam-ent.com/artist/iu/tour',
      artist_official_source_type: 'MANAGEMENT_LABEL_OFFICIAL',
      artist_verification_status: 'VERIFIED',
      promoter_official_url: 'https://pk-ent.com/',
      promoter_verification_status: 'VERIFIED',
      official_event_url: 'https://edam-ent.com/artist/iu/tour',
      official_ticket_url: 'https://www.loket.com/event/iu-jakarta-2026',
      ticketing_verification_status: 'VERIFIED',
      venue_verification_status: 'VERIFIED'
    };

    const mockSources = [
      { source_id: 'src-org-pk-ent', tier: 1, source_type: 'OFFICIAL_PROMOTER_WEB' },
      { source_id: 'src-loket', tier: 2, source_type: 'TICKETING_PLATFORM' }
    ];

    const result = EventVerificationService.evaluateEvent(mockConcert, mockSources);

    // 14 Schema Attributes Check
    assert.strictEqual(typeof result.artist_official_url, 'string');
    assert.strictEqual(result.artist_official_source_type, 'MANAGEMENT_LABEL_OFFICIAL');
    assert.strictEqual(result.artist_verification_status, 'VERIFIED');

    assert.strictEqual(typeof result.promoter_official_url, 'string');
    assert.strictEqual(result.promoter_verification_status, 'VERIFIED');

    assert.strictEqual(typeof result.event_official_url, 'string');
    assert.strictEqual(result.event_verification_status, 'VERIFIED');

    assert.strictEqual(typeof result.ticketing_official_url, 'string');
    assert.strictEqual(result.ticketing_verification_status, 'VERIFIED');

    assert.strictEqual(result.venue_verification_status, 'VERIFIED');

    assert.strictEqual(result.verification_tier, VERIFICATION_TIERS.TIER_A_DOUBLE_OFFICIAL);
    assert.ok(typeof result.verification_score === 'number' && result.verification_score >= 90 && result.verification_score <= 98);

    assert.ok(!isNaN(new Date(result.last_verified_at).getTime()));
    assert.ok(!isNaN(new Date(result.next_verification_at).getTime()));
  });

  console.log('\n── 2. Real-World Case Studies per 25 September 2026 ──');

  await test('NCT 127 (Weverse Notice 37278) achieves TIER A Double Official Verified', async () => {
    const nctEvent = canonicalRegistry.createEvent({
      event_id: 'ev-can-nct127-test',
      title: 'NCT 127 — NEO CITY: THE REDLINE Jakarta',
      start_date: '2026-10-03',
      venue_name: 'Indonesia Arena - Senayan',
      city: 'Jakarta',
      category: 'CONCERT',
      artist_official_url: 'https://weverse.io/nct127/notice/37278',
      artist_official_source_type: 'WEVERSE',
      artist_verification_status: 'VERIFIED',
      promoter_official_url: 'https://dyandraglobal.com/',
      promoter_verification_status: 'VERIFIED',
      official_event_url: 'https://weverse.io/nct127/notice/37278',
      official_ticket_url: 'https://dyandraglobalstore.com/',
      source_id: 'src-weverse'
    });

    assert.strictEqual(nctEvent.verification_status, 'VERIFIED');
    assert.strictEqual(nctEvent.is_verified, true);
    assert.strictEqual(nctEvent.verification_tier, VERIFICATION_TIERS.TIER_A_DOUBLE_OFFICIAL);
    assert.ok(nctEvent.verification_score >= 90);
    assert.strictEqual(nctEvent.artist_official_source_type, 'WEVERSE');
  });

  await test('BABYMONSTER (Weverse Notice 35647) achieves TIER A Double Official Verified', async () => {
    const babyEvent = canonicalRegistry.createEvent({
      event_id: 'ev-can-babymonster-test',
      title: 'BABYMONSTER — 2026-27 WORLD TOUR [춤 (CHOOM)] Jakarta',
      start_date: '2026-10-17',
      venue_name: 'Indonesia Arena - Senayan',
      city: 'Jakarta',
      category: 'CONCERT',
      artist_official_url: 'https://weverse.io/babymonster/notice/35647',
      artist_official_source_type: 'WEVERSE',
      artist_verification_status: 'VERIFIED',
      promoter_official_url: 'https://pk-ent.com/',
      promoter_verification_status: 'VERIFIED',
      official_event_url: 'https://weverse.io/babymonster/notice/35647',
      official_ticket_url: 'https://www.tiket.com/to-do/babymonster-jakarta-2026',
      source_id: 'src-weverse'
    });

    assert.strictEqual(babyEvent.verification_status, 'VERIFIED');
    assert.strictEqual(babyEvent.is_verified, true);
    assert.strictEqual(babyEvent.verification_tier, VERIFICATION_TIERS.TIER_A_DOUBLE_OFFICIAL);
    assert.ok(babyEvent.verification_score >= 90);
  });

  await test('Synchronize Festival 2026 achieves TIER B Official Event Verified (Festival Scope)', async () => {
    const syncEvent = canonicalRegistry.createEvent({
      event_id: 'ev-can-sync-test',
      title: 'Synchronize Festival 2026',
      start_date: '2026-10-16',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      category: 'FESTIVAL',
      promoter_official_url: 'https://demajors.com/',
      promoter_verification_status: 'VERIFIED',
      official_event_url: 'https://www.synchronizefestival.com/tickets',
      official_ticket_url: 'https://www.synchronizefestival.com/tickets',
      source_id: 'src-event-synchronize-web'
    });

    assert.strictEqual(syncEvent.verification_status, 'VERIFIED');
    assert.strictEqual(syncEvent.is_verified, true);
    assert.strictEqual(syncEvent.verification_tier, VERIFICATION_TIERS.TIER_B_OFFICIAL_EVENT);
    assert.strictEqual(syncEvent.artist_verification_status, 'NOT_APPLICABLE');
    assert.ok(syncEvent.verification_score >= 80 && syncEvent.verification_score <= 89);
  });

  await test('FAIL-CLOSED: YE Live in Jakarta fails closed to PENDING_ARTIST_VERIFICATION & TIER C (No Artist Web)', async () => {
    // Government calendar / EKRAF Hub listing without Kanye West official confirmation
    const yeEvent = canonicalRegistry.createEvent({
      event_id: 'ev-can-ye-test',
      title: 'YE Live in Jakarta',
      name: 'YE Live in Jakarta',
      artists: ['Kanye West', 'Ye'],
      start_date: '2026-10-24',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      city: 'Jakarta',
      category: 'CONCERT',
      source_id: 'src-ekraf-hub',
      artist_verification_status: 'PENDING_ARTIST_VERIFICATION',
      enforce_zero_fake_policy: true
    });

    assert.strictEqual(yeEvent.verification_status, VERIFICATION_STATUS.PENDING_ARTIST_VERIFICATION);
    assert.strictEqual(yeEvent.is_verified, false, 'Unconfirmed concert must never be marked verified');
    assert.strictEqual(yeEvent.verification_tier, VERIFICATION_TIERS.TIER_C_DISCOVERY_ONLY);
    assert.ok(yeEvent.verification_score <= 50);
    assert.ok(yeEvent.verification_reasons.includes('ZERO_FAKE_POLICY_PENDING_ARTIST_VERIFICATION'));
  });

  console.log('\n── 3. Public Catalogue Integration & Zero-Fake Isolation ──');

  resetDatabase();
  const seedService = new RealSourceSeedService();
  await seedService.seed({ log: () => {} });

  const publicRes = await request('/api/events');
  await test('GET /api/events exposes 14 fields on all public events', async () => {
    assert.strictEqual(publicRes.status, 200);
    assert.ok(publicRes.body.total >= 6, `Expected >= 6 verified events, got ${publicRes.body.total}`);

    for (const ev of publicRes.body.events) {
      assert.ok(ev.verification_tier, `Event ${ev.title} missing verification_tier`);
      assert.ok(['TIER_A_DOUBLE_OFFICIAL', 'TIER_B_OFFICIAL_EVENT'].includes(ev.verification_tier));
      assert.ok(typeof ev.verification_score === 'number');
      assert.ok(ev.last_verified_at);
      assert.ok(ev.next_verification_at);

      // Verify ZERO unverified leaks
      assert.strictEqual(ev.is_verified, true);
      assert.notStrictEqual(ev.verification_status, 'PENDING_ARTIST_VERIFICATION');
      assert.notStrictEqual(ev.title, 'YE Live in Jakarta');
    }
  });

  const homeFeedRes = await request('/api/events/home-feed');
  await test('GET /api/events/home-feed carries verification_tier and verification_score', async () => {
    assert.strictEqual(homeFeedRes.status, 200);
    for (const ev of homeFeedRes.body.feed) {
      assert.ok(ev.verification_tier, `Event ${ev.title} missing verification_tier in feed`);
      assert.ok(ev.verification_score >= 80, `Event ${ev.title} score ${ev.verification_score} < 80`);
    }
  });

  console.log('\n── 4. Concert Platforms: Songkick & Bandsintown (Jakarta & Greater Jakarta) Tier-1 Status ──');

  await test('SourceRegistry registers Songkick as Tier-1 Authoritative Platform with Greater Jakarta scope', async () => {
    const songkick = sourceRegistry.getSource('src-songkick-jakarta');
    assert.ok(songkick, 'src-songkick-jakarta must be registered');
    assert.strictEqual(songkick.name, 'Songkick');
    assert.strictEqual(songkick.tier, 1);
    assert.strictEqual(songkick.category, 'MUSIC');
    assert.strictEqual(songkick.can_create_event, true);
    assert.strictEqual(songkick.can_mark_verified, true);
    assert.strictEqual(songkick.can_override_official_source, false);
    assert.strictEqual(songkick.official_url, 'https://www.songkick.com/');
    assert.strictEqual(songkick.city_feed, 'https://www.songkick.com/metro-areas/29154-indonesia-jakarta');
    assert.strictEqual(songkick.region, 'Jakarta & Greater Jakarta');

    // Greater Jakarta Scope (Jakarta, Tangerang, Tangerang Selatan, Bekasi, Depok, Bogor)
    const requiredCities = ['Jakarta', 'Tangerang', 'Tangerang Selatan', 'Bekasi', 'Depok', 'Bogor'];
    for (const c of requiredCities) {
      assert.ok(songkick.supported_cities.includes(c), `Songkick missing supported city: ${c}`);
    }

    // Tier 1 Invariant: isAuthoritativeSource returns true
    assert.strictEqual(sourceRegistry.isAuthoritativeSource('src-songkick-jakarta'), true);
  });

  await test('SourceRegistry registers Bandsintown as Tier-1 Authoritative Platform with Greater Jakarta scope', async () => {
    const bandsintown = sourceRegistry.getSource('src-bandsintown-jakarta');
    assert.ok(bandsintown, 'src-bandsintown-jakarta must be registered');
    assert.strictEqual(bandsintown.name, 'Bandsintown');
    assert.strictEqual(bandsintown.tier, 1);
    assert.strictEqual(bandsintown.category, 'MUSIC');
    assert.strictEqual(bandsintown.can_create_event, true);
    assert.strictEqual(bandsintown.can_mark_verified, true);
    assert.strictEqual(bandsintown.can_override_official_source, false);
    assert.strictEqual(bandsintown.official_url, 'https://www.bandsintown.com/');
    assert.strictEqual(bandsintown.city_feed, 'https://www.bandsintown.com/c/jakarta-indonesia');
    assert.strictEqual(bandsintown.region, 'Jakarta & Greater Jakarta');

    const requiredCities = ['Jakarta', 'Tangerang', 'Tangerang Selatan', 'Bekasi', 'Depok', 'Bogor'];
    for (const c of requiredCities) {
      assert.ok(bandsintown.supported_cities.includes(c), `Bandsintown missing supported city: ${c}`);
    }

    // Tier 1 Invariant: isAuthoritativeSource returns true
    assert.strictEqual(sourceRegistry.isAuthoritativeSource('src-bandsintown-jakarta'), true);
  });

  await test('Unverified Radar: My Chemical Romance fails-closed to PENDING_ARTIST_VERIFICATION without artist proof', async () => {
    // Unverified discovery radar from non-authoritative source
    const unverifiedObservation = canonicalRegistry.createEvent({
      event_id: 'ev-can-mcr-radar-test',
      title: 'My Chemical Romance — Jakarta International Stadium',
      name: 'My Chemical Romance — Jakarta International Stadium',
      artists: ['My Chemical Romance'],
      start_date: '2026-11-28',
      venue_name: 'Jakarta International Stadium',
      city: 'Jakarta',
      category: 'CONCERT',
      source_id: 'src-ekraf-hub',
      source_url: 'https://kemenparekraf.go.id/radar/mcr-jakarta',
      enforce_zero_fake_policy: true
    });

    // Zero-Fake Gate: Non-authoritative discovery cannot solely verify
    assert.strictEqual(unverifiedObservation.verification_status, VERIFICATION_STATUS.PENDING_ARTIST_VERIFICATION);
    assert.strictEqual(unverifiedObservation.is_verified, false, 'Radar discovery alone cannot verify event');
    assert.strictEqual(unverifiedObservation.verification_tier, VERIFICATION_TIERS.TIER_C_DISCOVERY_ONLY);
    assert.ok(unverifiedObservation.verification_score <= 50);
    assert.ok(unverifiedObservation.verification_reasons.includes('ZERO_FAKE_POLICY_PENDING_ARTIST_VERIFICATION'));
  });

  await test('Songkick + Corroboration Flow: MCR elevates to TIER A Double Official Verified when official sources corroborated', async () => {
    // Corroboration arrives: Official Artist Website + Official Promoter + Official Ticketing
    const mcrCorroborated = canonicalRegistry.createEvent({
      event_id: 'ev-can-mcr-corroborated-test',
      title: 'My Chemical Romance — Jakarta International Stadium',
      artists: ['My Chemical Romance'],
      start_date: '2026-11-28',
      venue_name: 'Jakarta International Stadium',
      city: 'Jakarta',
      category: 'CONCERT',
      source_id: 'src-songkick-jakarta',
      artist_official_url: 'https://www.mychemicalromance.com/tour',
      artist_official_source_type: 'ARTIST_OFFICIAL_WEB',
      artist_verification_status: 'VERIFIED',
      promoter_official_url: 'https://pk-ent.com/',
      promoter_verification_status: 'VERIFIED',
      official_event_url: 'https://www.mychemicalromance.com/tour',
      official_ticket_url: 'https://www.loket.com/event/mcr-jakarta-2026',
      ticketing_verification_status: 'VERIFIED',
      sources: [
        { source_id: 'src-songkick-jakarta', tier: 3, source_type: 'CONCERT_DISCOVERY_RADAR' },
        { source_id: 'src-org-pk-ent', tier: 1, source_type: 'OFFICIAL_PROMOTER_WEB' }
      ]
    });

    assert.strictEqual(mcrCorroborated.verification_status, 'VERIFIED');
    assert.strictEqual(mcrCorroborated.is_verified, true);
    assert.strictEqual(mcrCorroborated.verification_tier, VERIFICATION_TIERS.TIER_A_DOUBLE_OFFICIAL);
    assert.ok(mcrCorroborated.verification_score >= 90);
    assert.strictEqual(mcrCorroborated.artist_verification_status, 'VERIFIED');
  });

  await test('Greater Jakarta Scope: Songkick event in Tangerang / Tangerang Selatan normalizes correctly and gates fail-closed', async () => {
    const venueEvent = canonicalRegistry.createEvent({
      event_id: 'ev-can-greater-jakarta-radar',
      title: 'Maddix — Live in Tangerang',
      artists: ['Maddix'],
      start_date: '2026-11-14',
      venue_name: 'ICE BSD City',
      city: 'Tangerang',
      category: 'CONCERT',
      source_id: 'src-songkick-jakarta',
      source_url: 'https://www.songkick.com/metro-areas/29154-indonesia-jakarta',
      enforce_zero_fake_policy: true
    });

    assert.strictEqual(venueEvent.city, 'Tangerang');
    assert.strictEqual(venueEvent.verification_status, VERIFICATION_STATUS.PENDING_ARTIST_VERIFICATION);
    assert.strictEqual(venueEvent.is_verified, false);
    assert.strictEqual(venueEvent.verification_tier, VERIFICATION_TIERS.TIER_C_DISCOVERY_ONLY);
  });

  server.close();

  console.log('\n================================================================');
  console.log(`  ZERO-FAKE POLICY TESTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(err => {
  console.error(err);
  if (server) server.close();
  process.exit(1);
});
