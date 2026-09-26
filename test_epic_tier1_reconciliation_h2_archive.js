/**
 * TIKUM — TIER 1 RECONCILIATION & H+2 ARCHIVE ACCEPTANCE SUITE
 * 
 * Comprehensive 30-Test Acceptance Suite covering:
 * - Tier 1 Elevation: LOKET.com, Tiket.com, Songkick.com, Bandsintown.com
 * - Multi-source Ingestion & Zero-Duplicate Guarantee (1 concert = 1 canonical event = 1 homepage card)
 * - Multi-Night and Multi-City Residency Disambiguation
 * - Organic YE Live in Jakarta Discovery (Zero Hardcoding)
 * - Strict H+2 Lifecycle Archiving (now > event_end_at + 48h)
 * - Defense-in-Depth Query-Time Filtering on /api/events/home-feed
 * - Non-Terminal Operations Preservation (ARCHIVED_WITH_OPEN_OPERATIONS)
 * - Data Preservation Invariant (No DELETE from database)
 * - Admin Reconciliation & Reporting Endpoints
 * - Complete Provenance Inspection
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const { state } = require('./src/database');
const { sourceRegistry, TRUST_LEVELS } = require('./src/discovery/SourceRegistry');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS, HOMEPAGE_EVENT_GRACE_DAYS } = require('./src/discovery/EventTemporalLifecycleEngine');
const { inventoryReconciliationService } = require('./src/discovery/EventInventoryReconciliationService');
const { AdminEventControlService } = require('./src/discovery/AdminEventControlService');
const discoveryRouter = require('./src/discovery/discoveryRouter');

let server;
let baseUrl;

function startTestServer() {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use(discoveryRouter);
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };
    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch (_) { json = body; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`      ${err.message}`);
    failedCount++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('TIKUM — TIER 1 RECONCILIATION & H+2 ARCHIVE ACCEPTANCE SUITE');
  console.log('================================================================\n');

  await startTestServer();

  // Reset database state and canonical registry to clean baseline
  state.events = [];
  state.orders = [];
  state.escrows = [];
  state.disputes = [];
  state.listings = [];
  state.tickets = [];
  canonicalRegistry.reset();

  console.log('── Section 1: Tier-1 Source Registrations (LOKET, Tiket.com, Songkick, Bandsintown) ──');

  await test('Test 1: LOKET.com is registered as Tier-1 Authoritative Source', async () => {
    const loket = sourceRegistry.getSource('src-loket');
    assert.ok(loket, 'src-loket must exist');
    assert.strictEqual(loket.tier, 1, 'src-loket tier must be 1');
    assert.strictEqual(loket.trust_level, TRUST_LEVELS.TIER_1, 'trust_level must be TIER_1');
    assert.strictEqual(loket.can_mark_verified, true, 'can_mark_verified must be true');
    assert.strictEqual(sourceRegistry.isAuthoritativeSource('src-loket'), true, 'isAuthoritativeSource must be true');
  });

  await test('Test 2: Tiket.com is registered as Tier-1 Authoritative Source', async () => {
    const tiket = sourceRegistry.getSource('src-tiket-com');
    assert.ok(tiket, 'src-tiket-com must exist');
    assert.strictEqual(tiket.tier, 1, 'src-tiket-com tier must be 1');
    assert.strictEqual(tiket.trust_level, TRUST_LEVELS.TIER_1, 'trust_level must be TIER_1');
    assert.strictEqual(tiket.can_mark_verified, true, 'can_mark_verified must be true');
    assert.strictEqual(sourceRegistry.isAuthoritativeSource('src-tiket-com'), true, 'isAuthoritativeSource must be true');
  });

  await test('Test 3: Songkick.com is registered as Tier-1 Authoritative Source', async () => {
    const songkick = sourceRegistry.getSource('src-songkick-jakarta');
    assert.ok(songkick, 'src-songkick-jakarta must exist');
    assert.strictEqual(songkick.tier, 1, 'src-songkick-jakarta tier must be 1');
    assert.strictEqual(songkick.can_mark_verified, true, 'can_mark_verified must be true');
    assert.strictEqual(sourceRegistry.isAuthoritativeSource('src-songkick-jakarta'), true, 'isAuthoritativeSource must be true');

    const songkickAlias = sourceRegistry.getSource('src-songkick');
    assert.ok(songkickAlias, 'src-songkick alias must exist');
    assert.strictEqual(songkickAlias.tier, 1);
  });

  await test('Test 4: Bandsintown.com is registered as Tier-1 Authoritative Source', async () => {
    const bandsintown = sourceRegistry.getSource('src-bandsintown-jakarta');
    assert.ok(bandsintown, 'src-bandsintown-jakarta must exist');
    assert.strictEqual(bandsintown.tier, 1, 'src-bandsintown-jakarta tier must be 1');
    assert.strictEqual(bandsintown.can_mark_verified, true, 'can_mark_verified must be true');
    assert.strictEqual(sourceRegistry.isAuthoritativeSource('src-bandsintown-jakarta'), true, 'isAuthoritativeSource must be true');

    const bandsintownAlias = sourceRegistry.getSource('src-bandsintown');
    assert.ok(bandsintownAlias, 'src-bandsintown alias must exist');
    assert.strictEqual(bandsintownAlias.tier, 1);
  });

  console.log('\n── Section 2: Ingestion from Tier-1 Sources & Canonical Verification ──');

  await test('Test 5: Ingesting event from Loket creates verified canonical event', async () => {
    const res = await ingestionPipeline.ingestEvent({
      name: 'Pestapora 2026',
      title: 'Pestapora 2026',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      start_date: '2026-10-15',
      category: 'FESTIVAL',
      min_price: 250000,
      max_price: 700000,
      official_ticket_url: 'https://www.loket.com/event/pestapora-2026'
    }, 'src-loket');

    assert.ok(res.canonical_event, 'Must return canonical event');
    assert.strictEqual(res.canonical_event.is_verified, true, 'Loket Tier-1 must mark event verified');
    assert.strictEqual(res.canonical_event.verification_status, 'VERIFIED');
    assert.strictEqual(res.canonical_event.official_ticket_url, 'https://www.loket.com/event/pestapora-2026');
  });

  await test('Test 6: Ingesting event from Tiket.com creates verified canonical event', async () => {
    const res = await ingestionPipeline.ingestEvent({
      name: 'Coldplay: Music of the Spheres Jakarta',
      title: 'Coldplay: Music of the Spheres Jakarta',
      venue_name: 'Gelora Bung Karno Main Stadium',
      city: 'Jakarta',
      start_date: '2026-11-15',
      category: 'CONCERT',
      min_price: 800000,
      max_price: 5000000,
      official_ticket_url: 'https://www.tiket.com/to-do/coldplay-jakarta'
    }, 'src-tiket-com');

    assert.ok(res.canonical_event);
    assert.strictEqual(res.canonical_event.is_verified, true);
    assert.strictEqual(res.canonical_event.verification_status, 'VERIFIED');
    assert.strictEqual(res.canonical_event.official_ticket_url, 'https://www.tiket.com/to-do/coldplay-jakarta');
  });

  await test('Test 7: Ingesting event from Songkick creates verified canonical event', async () => {
    const res = await ingestionPipeline.ingestEvent({
      name: 'The Script — Satellites World Tour Jakarta',
      title: 'The Script — Satellites World Tour Jakarta',
      venue_name: 'Istora Senayan',
      city: 'Jakarta',
      start_date: '2026-10-10',
      category: 'CONCERT',
      official_ticket_url: 'https://www.songkick.com/concerts/the-script-jakarta'
    }, 'src-songkick-jakarta');

    assert.ok(res.canonical_event);
    assert.strictEqual(res.canonical_event.is_verified, true);
    assert.strictEqual(res.canonical_event.verification_status, 'VERIFIED');
  });

  await test('Test 8: Ingesting event from Bandsintown creates verified canonical event', async () => {
    const res = await ingestionPipeline.ingestEvent({
      name: 'Men I Trust — Live in Jakarta 2026',
      title: 'Men I Trust — Live in Jakarta 2026',
      venue_name: 'Tennis Indoor Senayan',
      city: 'Jakarta',
      start_date: '2026-10-20',
      category: 'CONCERT',
      official_ticket_url: 'https://www.bandsintown.com/e/men-i-trust-jakarta'
    }, 'src-bandsintown-jakarta');

    assert.ok(res.canonical_event);
    assert.strictEqual(res.canonical_event.is_verified, true);
    assert.strictEqual(res.canonical_event.verification_status, 'VERIFIED');
  });

  console.log('\n── Section 3: Zero-Duplicate Guarantee (1 Concert = 1 Canonical Event) ──');

  await test('Test 9: Ingesting duplicate event from Tiket.com merges into existing Loket canonical event', async () => {
    const initialCount = canonicalRegistry.getAllEvents().length;

    // Same concert (Pestapora 2026, 2026-10-15, Gambir Expo Kemayoran, Jakarta) arriving from Tiket.com
    const res = await ingestionPipeline.ingestEvent({
      name: 'Pestapora 2026 Official',
      title: 'Pestapora 2026 Official',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      start_date: '2026-10-15',
      category: 'FESTIVAL',
      min_price: 250000,
      max_price: 700000,
      official_ticket_url: 'https://www.tiket.com/to-do/pestapora-2026'
    }, 'src-tiket-com');

    assert.strictEqual(res.dedup_action, 'MERGED', 'Must merge duplicate candidate');
    const newCount = canonicalRegistry.getAllEvents().length;
    assert.strictEqual(newCount, initialCount, 'Total canonical events must not increase (zero double event)');

    const canonical = res.canonical_event;
    assert.ok(canonical.sources.some(s => s.source_id === 'src-loket'), 'Must retain Loket source');
    assert.ok(canonical.sources.some(s => s.source_id === 'src-tiket-com'), 'Must add Tiket.com source');
    assert.strictEqual(canonical.sources.length, 2, 'Canonical event must carry 2 source provenances');
  });

  await test('Test 10: Third observation from official promoter PK Entertainment merges into the same canonical event', async () => {
    const initialCount = canonicalRegistry.getAllEvents().length;

    const res = await ingestionPipeline.ingestEvent({
      name: 'Pestapora 2026',
      title: 'Pestapora 2026',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      start_date: '2026-10-15',
      category: 'FESTIVAL',
      official_event_url: 'https://pk-ent.com/events/pestapora-2026'
    }, 'src-promoters-official');

    assert.strictEqual(res.dedup_action, 'MERGED');
    assert.strictEqual(canonicalRegistry.getAllEvents().length, initialCount);

    const canonical = res.canonical_event;
    assert.strictEqual(canonical.sources.length, 3, 'Must have 3 sources now');
  });

  await test('Test 11: Multi-Night Residency Disambiguation: LANY Night 1 and Night 2 remain two distinct events', async () => {
    const lanyNight1 = await ingestionPipeline.ingestEvent({
      name: 'LANY: soft world tour – Night 1',
      title: 'LANY: soft world tour – Night 1',
      venue_name: 'Indonesia Arena',
      city: 'Jakarta',
      start_date: '2026-10-29',
      category: 'CONCERT',
      official_ticket_url: 'https://www.loket.com/event/lany-jkt-n1'
    }, 'src-loket');

    const lanyNight2 = await ingestionPipeline.ingestEvent({
      name: 'LANY: soft world tour – Night 2',
      title: 'LANY: soft world tour – Night 2',
      venue_name: 'Indonesia Arena',
      city: 'Jakarta',
      start_date: '2026-10-30', // Distinct date!
      category: 'CONCERT',
      official_ticket_url: 'https://www.loket.com/event/lany-jkt-n2'
    }, 'src-loket');

    assert.notStrictEqual(lanyNight1.canonical_event.event_id, lanyNight2.canonical_event.event_id,
      'Multi-night residency on different dates MUST produce distinct canonical events');
  });

  await test('Test 12: Multi-City Tour Disambiguation: Same artist in Bandung vs Jakarta remain separate', async () => {
    const sheilaJakarta = await ingestionPipeline.ingestEvent({
      name: 'Sheila on 7: Tunggu Aku Di Jakarta',
      venue_name: 'Stadion Madya GBK',
      city: 'Jakarta',
      start_date: '2026-11-20',
      category: 'CONCERT'
    }, 'src-loket');

    const sheilaBandung = await ingestionPipeline.ingestEvent({
      name: 'Sheila on 7: Tunggu Aku Di Bandung',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung',
      start_date: '2026-11-27',
      category: 'CONCERT'
    }, 'src-loket');

    assert.notStrictEqual(sheilaJakarta.canonical_event.event_id, sheilaBandung.canonical_event.event_id);
    assert.strictEqual(sheilaBandung.canonical_event.city, 'Bandung');
  });

  await test('Test 13: Deterministic Idempotency: Re-ingesting exact same payload yields SKIPPED_EXISTING', async () => {
    const payload = {
      name: 'Pestapora 2026',
      title: 'Pestapora 2026',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      start_date: '2026-10-15',
      category: 'FESTIVAL',
      official_ticket_url: 'https://www.loket.com/event/pestapora-2026'
    };

    const res = await ingestionPipeline.ingestEvent(payload, 'src-loket');
    assert.strictEqual(res.is_idempotent_duplicate, true);
    assert.strictEqual(res.dedup_action, 'SKIPPED_EXISTING');
  });

  console.log('\n── Section 4: Organic YE Live in Jakarta Discovery (Zero Hardcoding) ──');

  await test('Test 14: YE Live in Jakarta: Uncorroborated radar observation fails-closed', async () => {
    // Stage A: Radar discovery from non-authoritative channel
    const radarObservation = canonicalRegistry.createEvent({
      event_id: 'ev-can-ye-jakarta',
      title: 'YE Live in Jakarta',
      name: 'YE Live in Jakarta',
      artists: ['Kanye West', 'YE'],
      start_date: '2026-10-24',
      venue_name: 'Stadion Madya Gelora Bung Karno',
      city: 'Jakarta',
      category: 'CONCERT',
      source_id: 'src-ekraf-hub',
      source_url: 'https://kemenparekraf.go.id/event/ye-live-jakarta',
      enforce_zero_fake_policy: true
    });

    assert.strictEqual(radarObservation.verification_status, 'PENDING_ARTIST_VERIFICATION');
    assert.strictEqual(radarObservation.is_verified, false, 'Uncorroborated radar MUST NOT be verified');
    assert.strictEqual(radarObservation.homepage_visibility, false, 'Uncorroborated radar MUST NOT be on homepage');
  });

  await test('Test 15: YE Live in Jakarta: Tier-1 Loket + Promoter corroboration merges and elevates to VERIFIED', async () => {
    // Stage B: Loket Tier 1 official ticketing observation arrives
    const loketObs = await ingestionPipeline.ingestEvent({
      name: 'YE Live in Jakarta',
      title: 'YE Live in Jakarta',
      artists: ['Kanye West', 'YE'],
      venue_name: 'Stadion Madya Gelora Bung Karno',
      city: 'Jakarta',
      start_date: '2026-10-24',
      category: 'CONCERT',
      official_ticket_url: 'https://www.loket.com/event/ye-live-jakarta'
    }, 'src-loket');

    assert.strictEqual(loketObs.dedup_action, 'MERGED', 'Must merge with existing radar observation');

    // Stage C: Official promoter corroboration arrives with official artist tour corroboration
    const promoterObs = await ingestionPipeline.ingestEvent({
      name: 'YE Live in Jakarta',
      title: 'YE Live in Jakarta',
      artists: ['Kanye West', 'YE'],
      venue_name: 'Stadion Madya Gelora Bung Karno',
      city: 'Jakarta',
      start_date: '2026-10-24',
      category: 'CONCERT',
      official_event_url: 'https://pk-ent.com/concerts/ye-live-jakarta',
      promoter_official_url: 'https://pk-ent.com/concerts/ye-live-jakarta',
      artist_official_url: 'https://yeezy.com/tour',
      artist_verification_status: 'VERIFIED'
    }, 'src-promoters-official');

    const canonicalYe = promoterObs.canonical_event;
    assert.strictEqual(canonicalYe.is_verified, true, 'Multi-source Tier-1 corroboration elevates to VERIFIED');
    assert.strictEqual(canonicalYe.verification_status, 'VERIFIED');
    assert.ok(canonicalYe.sources.some(s => s.source_id === 'src-loket'));
    assert.ok(canonicalYe.sources.some(s => s.source_id === 'src-promoters-official'));
  });

  console.log('\n── Section 5: Strict Temporal Lifecycle & H+2 Archive Rule ──');

  await test('Test 16: Future event (now < start_at) is UPCOMING with archive_status = ACTIVE', async () => {
    const simNow = new Date('2026-09-25T10:00:00+07:00');
    const futureEvent = canonicalRegistry.createEvent({
      event_id: 'ev-future-test',
      title: 'Future Concert 2026',
      start_date: '2026-10-15',
      start_time: '19:00',
      venue_name: 'Istora Senayan',
      city: 'Jakarta',
      source_id: 'src-loket',
      is_verified: true,
      verification_status: 'VERIFIED'
    });

    await EventTemporalLifecycleEngine.reconcileEvent(futureEvent, simNow);
    assert.strictEqual(futureEvent.lifecycle_status, LIFECYCLE_STATUS.UPCOMING);
    assert.strictEqual(futureEvent.archive_status, 'ACTIVE');
    assert.strictEqual(futureEvent.homepage_visibility, true);
    assert.strictEqual(futureEvent.public_upcoming, true);
  });

  await test('Test 17: Live event (start_at <= now <= end_at) is LIVE with archive_status = ACTIVE', async () => {
    const simNow = new Date('2026-10-15T20:00:00+07:00'); // Mid-concert!
    const ev = canonicalRegistry.getEventById('ev-future-test');
    await EventTemporalLifecycleEngine.reconcileEvent(ev, simNow);

    assert.strictEqual(ev.lifecycle_status, LIFECYCLE_STATUS.LIVE);
    assert.strictEqual(ev.status, 'LIVE');
    assert.strictEqual(ev.archive_status, 'ACTIVE');
    assert.strictEqual(EventTemporalLifecycleEngine.getHomepageTemporalWindow(ev, simNow), 'TODAY');
  });

  await test('Test 18: Event concluded within H+2 grace period (now <= end_at + 48h) is RECENT and archive_status = ACTIVE', async () => {
    // Concert ended at 2026-10-15 23:00. Evaluated at 2026-10-16 12:00 (H+13 hours)
    const simNow = new Date('2026-10-16T12:00:00+07:00');
    const ev = canonicalRegistry.getEventById('ev-future-test');
    await EventTemporalLifecycleEngine.reconcileEvent(ev, simNow);

    assert.strictEqual(ev.lifecycle_status, LIFECYCLE_STATUS.COMPLETED);
    assert.strictEqual(ev.archive_status, 'ACTIVE');
    assert.strictEqual(EventTemporalLifecycleEngine.getHomepageTemporalWindow(ev, simNow), 'RECENT');
  });

  await test('Test 19: H+2 Boundary: Event at H+48h + 1 minute transitions to ARCHIVED', async () => {
    // Concert end_at: 2026-10-15 23:00. H+48h is 2026-10-17 23:00.
    // Evaluated at 2026-10-17 23:05 (5 minutes past H+2)
    const simNow = new Date('2026-10-17T23:05:00+07:00');
    const ev = canonicalRegistry.getEventById('ev-future-test');
    const res = await EventTemporalLifecycleEngine.reconcileEvent(ev, simNow);

    assert.strictEqual(res.new_status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(ev.lifecycle_status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(ev.archive_status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(ev.status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(ev.homepage_visibility, false, 'Homepage visibility must be false');
    assert.strictEqual(ev.public_upcoming, false, 'Public upcoming must be false');
    assert.strictEqual(ev.public_visibility, false, 'Public visibility must be false');
    assert.ok(ev.archived_at, 'Must have archived_at timestamp');
  });

  await test('Test 20: isEventHomepageEligible returns false for ARCHIVED event past H+2', async () => {
    const simNow = new Date('2026-10-17T23:05:00+07:00');
    const ev = canonicalRegistry.getEventById('ev-future-test');
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(ev, simNow), false);
  });

  await test('Test 21: Defense-in-depth: /api/events/home-feed strictly excludes ARCHIVED event past H+2', async () => {
    const simNow = encodeURIComponent('2026-10-17T23:05:00+07:00');
    const res = await apiRequest(`/api/events/home-feed?now=${simNow}`);

    assert.strictEqual(res.status, 200);
    const feed = res.body.feed || res.body.events || [];
    const found = feed.find(e => e.event_id === 'ev-future-test');
    assert.strictEqual(found, undefined, 'ARCHIVED event must be completely absent from home-feed');
  });

  await test('Test 22: Concluded event expires active resale listings and unlocks tickets', async () => {
    const evId = 'ev-listing-test';
    const ev = canonicalRegistry.createEvent({
      event_id: evId,
      title: 'Concert with Listing',
      start_date: '2026-09-20',
      venue_name: 'Venue',
      city: 'Jakarta',
      source_id: 'src-loket',
      is_verified: true
    });

    state.listings.push({
      id: 'list-123',
      event_id: evId,
      ticket_id: 'tkt-123',
      price: 500000,
      status: 'ACTIVE'
    });
    state.tickets.push({
      id: 'tkt-123',
      event_id: evId,
      status: 'LISTED',
      listing_id: 'list-123'
    });

    const simNow = new Date('2026-09-23T12:00:00+07:00'); // Past H+2
    await EventTemporalLifecycleEngine.reconcileEvent(ev, simNow);

    const listing = state.listings.find(l => l.id === 'list-123');
    const ticket = state.tickets.find(t => t.id === 'tkt-123');
    assert.strictEqual(listing.status, 'EXPIRED', 'Listing must be expired');
    assert.strictEqual(ticket.status, 'VERIFIED', 'Ticket lock must be cleared');
  });

  await test('Test 23: Non-terminal operations exception: Event with open dispute transitions to ARCHIVED_WITH_OPEN_OPERATIONS', async () => {
    const evId = 'ev-dispute-test';
    const ev = canonicalRegistry.createEvent({
      event_id: evId,
      title: 'Concert with Open Dispute',
      start_date: '2026-09-20',
      venue_name: 'Venue',
      city: 'Jakarta',
      source_id: 'src-loket',
      is_verified: true
    });

    state.disputes.push({
      id: 'disp-1',
      event_id: evId,
      status: 'INVESTIGATION' // Non-terminal!
    });

    const simNow = new Date('2026-09-24T12:00:00+07:00');
    await EventTemporalLifecycleEngine.reconcileEvent(ev, simNow);

    assert.strictEqual(ev.lifecycle_status, LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS);
    assert.strictEqual(ev.archive_status, LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS);
    assert.strictEqual(ev.homepage_visibility, false, 'Must be excluded from homepage despite open ops');
  });

  await test('Test 24: Data Preservation Invariant: Event past H+2 is preserved in database (never deleted)', async () => {
    const ev = canonicalRegistry.getEventById('ev-future-test');
    assert.ok(ev, 'Canonical event record MUST be preserved in CanonicalEventRegistry');
    assert.strictEqual(ev.archive_status, 'ARCHIVED');

    const inState = state.events.find(e => e.id === 'ev-future-test' || e.event_id === 'ev-future-test');
    assert.ok(inState, 'Canonical event MUST remain in state.events for audit and history');
    assert.strictEqual(inState.archive_status, 'ARCHIVED');
  });

  console.log('\n── Section 6: Inventory Reconciliation Service & Admin Endpoints ──');

  await test('Test 25: inventoryReconciliationService.reconcileInventory executes cleanly and returns full report', async () => {
    const simNow = new Date('2026-09-26T12:00:00+07:00');
    const report = await inventoryReconciliationService.reconcileInventory({
      now: simNow,
      syncSources: false // Test with existing canonical inventory
    });

    assert.ok(report.reconciliation_id, 'Report must carry reconciliation_id');
    assert.ok(report.summary.total_canonical_events > 0, 'Must report total canonical events');
    assert.strictEqual(report.invariants_verified.zero_duplicate_events, true);
    assert.strictEqual(report.invariants_verified.h2_archive_enforced, true);
    assert.strictEqual(report.invariants_verified.data_preserved_in_db, true);
  });

  await test('Test 26: POST /api/discovery/admin/reconcile endpoint triggers reconciliation', async () => {
    const simNow = '2026-09-26T12:00:00+07:00';
    const res = await apiRequest('/api/discovery/admin/reconcile', {
      method: 'POST',
      body: { now: simNow, sync_sources: false }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.report.reconciliation_id);
    assert.ok(res.body.report.homepage_inventory.length > 0);
  });

  await test('Test 27: GET /api/discovery/admin/inventory-report returns inventory breakdown', async () => {
    const res = await apiRequest('/api/discovery/admin/inventory-report');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.report.counts.total_canonical > 0);
    assert.ok(res.body.report.source_breakdown['src-loket'] > 0);
  });

  await test('Test 28: AdminEventControlService.getEventProvenance returns homepage & archive explanations', async () => {
    const simNow = new Date('2026-09-26T12:00:00+07:00');
    // Active upcoming event: Pestapora 2026
    const pestapora = canonicalRegistry.getAllEvents().find(e => (e.title || '').includes('Pestapora'));
    assert.ok(pestapora);

    const prov = AdminEventControlService.getEventProvenance(pestapora.event_id, simNow);
    assert.ok(prov);
    assert.strictEqual(prov.homepage_visibility, true);
    assert.strictEqual(prov.archive_status, 'ACTIVE');
    assert.ok(prov.why_on_homepage.includes('OFFICIAL_PRIMARY_SOURCE_VERIFIED'));
    assert.ok(prov.why_on_homepage.includes('CANONICAL_FUTURE_DATE'));

    // Archived event: ev-future-test (archived on Oct 17)
    const archivedProv = AdminEventControlService.getEventProvenance('ev-future-test', new Date('2026-10-18T12:00:00+07:00'));
    assert.ok(archivedProv);
    assert.strictEqual(archivedProv.homepage_visibility, false);
    assert.strictEqual(archivedProv.archive_status, 'ARCHIVED');
    assert.ok(archivedProv.why_not_on_homepage.includes('EXPIRED_PAST_H2_GRACE_THRESHOLD'));
    assert.ok(archivedProv.why_not_on_homepage.includes('EVENT_ARCHIVED'));
  });

  await test('Test 29: Cancelled event sets archive_status = CANCELLED and is removed from homepage', async () => {
    const ev = canonicalRegistry.createEvent({
      event_id: 'ev-cancel-test',
      title: 'Cancelled Show',
      start_date: '2026-10-30',
      venue_name: 'Venue',
      city: 'Jakarta',
      source_id: 'src-loket',
      is_verified: true,
      status: 'CANCELLED'
    });

    const simNow = new Date('2026-09-26T12:00:00+07:00');
    await EventTemporalLifecycleEngine.reconcileEvent(ev, simNow);

    assert.strictEqual(ev.archive_status, 'CANCELLED');
    assert.strictEqual(ev.homepage_visibility, false);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(ev, simNow), false);
  });

  await test('Test 30: End-to-end Homepage Feed: 1 concert = 1 card, zero double events, zero expired events', async () => {
    const simNow = encodeURIComponent('2026-09-26T12:00:00+07:00');
    const res = await apiRequest(`/api/events/home-feed?now=${simNow}`);

    assert.strictEqual(res.status, 200);
    const feed = res.body.feed || res.body.events || [];
    assert.ok(feed.length > 0, 'Feed must return verified upcoming concerts');

    // Invariant 1: Zero Duplicate Cards
    const seenEventKeys = new Set();
    for (const card of feed) {
      const key = `${card.title.toLowerCase().trim()}::${card.city.toLowerCase().trim()}::${card.start_at.substring(0, 10)}`;
      assert.strictEqual(seenEventKeys.has(key), false, `Duplicate homepage card detected: ${card.title}`);
      seenEventKeys.add(key);
    }

    // Invariant 2: Zero Expired Events past H+2
    const nowMs = new Date('2026-09-26T12:00:00+07:00').getTime();
    for (const card of feed) {
      const endMs = new Date(card.end_datetime || card.end_at || card.start_at).getTime();
      const graceMs = HOMEPAGE_EVENT_GRACE_DAYS * 24 * 60 * 60 * 1000;
      assert.ok(nowMs <= endMs + graceMs, `Expired event leaked to homepage: ${card.title}`);
    }

    // Invariant 3: Zero Unverified Events
    for (const card of feed) {
      assert.ok(card.verification_status === 'VERIFIED' || card.is_verified === true,
        `Unverified event leaked to homepage: ${card.title}`);
    }
  });

  await test('Test 31: Kanye West — Ye Tour in Jakarta corroborated by official artist website https://tour.yeezy.com/ achieves TIER_A_DOUBLE_OFFICIAL and VERIFIED status', async () => {
    const kanyeObs = await ingestionPipeline.ingestEvent({
      name: 'Kanye West — Ye Tour 2026 in Jakarta',
      title: 'Kanye West — Ye Tour 2026 in Jakarta',
      artists: ['Kanye West', 'Ye'],
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      city: 'Jakarta',
      start_date: '2026-10-24',
      category: 'CONCERT',
      official_event_url: 'https://tour.yeezy.com/',
      official_ticket_url: 'https://tour.yeezy.com/',
      artist_official_url: 'https://tour.yeezy.com/',
      artist_verification_status: 'VERIFIED'
    }, 'src-yeezy-tour');

    const canonicalKanye = kanyeObs.canonical_event;
    assert.ok(canonicalKanye);
    assert.strictEqual(canonicalKanye.is_verified, true);
    assert.strictEqual(canonicalKanye.verification_status, 'VERIFIED');
    assert.strictEqual(canonicalKanye.artist_official_url, 'https://tour.yeezy.com/');
    assert.strictEqual(canonicalKanye.artist_verification_status, 'VERIFIED');
    assert.strictEqual(canonicalKanye.verification_tier, 'TIER_A_DOUBLE_OFFICIAL');
    assert.strictEqual(canonicalKanye.homepage_visibility, true);
    assert.strictEqual(canonicalKanye.public_upcoming, true);
  });

  await stopTestServer();

  console.log('\n================================================================');
  console.log(`TIKUM RECONCILIATION SUITE: ${passedCount} passed, ${failedCount} failed`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
