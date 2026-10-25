/**
 * TIKUM / ARGUS — Event Deduplication & Temporal Lifecycle Test Suite
 *
 * Comprehensive regression suite verifying:
 * 1. URL Normalization (stripping tracking clutter, fragments, protocol/www variants, trailing slashes)
 * 2. Canonical Deduplication & Multi-Night / Multi-City Disambiguation
 * 3. Temporal Lifecycle Engine & Date Classification (Invalid dates must NOT become upcoming)
 * 4. Storage Protections (blocking listing creation and inventory reservation on expired events)
 * 5. Web Routing & Archive Experience (/events/archive, /events/:slug, /api/discovery/events/:slugOrId)
 */

const assert = require('assert');
const http = require('http');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('./src/discovery/EventTemporalLifecycleEngine');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { InMemoryMarketplaceRepository } = require('./src/storage/InMemoryMarketplaceRepository');

let passedTests = 0;
let failedTests = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}:`, err.message);
    failedTests++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}:`, err.message);
    failedTests++;
  }
}

async function runSuite() {
  console.log('========================================================================');
  console.log('  TIKUM — EVENT DEDUPLICATION & TEMPORAL LIFECYCLE TEST SUITE');
  console.log('========================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // 1. URL NORMALIZATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('── Section 1: URL Normalization Service ──');

  it('1.1 Strips UTM tracking query parameters and marketing flags', () => {
    const raw = 'https://www.loket.com/event/dwp-2026?utm_source=instagram&utm_medium=bio&utm_campaign=dwp_launch&fbclid=IwAR2xyz';
    const norm = EventNormalizationService.normalizeUrl(raw);
    assert.strictEqual(norm, 'loket.com/event/dwp-2026');
  });

  it('1.2 Strips protocol, www prefix, trailing slashes, and hash fragments', () => {
    const raw = 'http://www.tiket.com/event/lany-jakarta/#ticket-section/';
    const norm = EventNormalizationService.normalizeUrl(raw);
    assert.strictEqual(norm, 'tiket.com/event/lany-jakarta');
  });

  it('1.3 Retains meaningful path and functional non-tracking query parameters', () => {
    const raw = 'https://goersapp.com/events/indie-gig?session=1&utm_term=rock';
    const norm = EventNormalizationService.normalizeUrl(raw);
    assert.strictEqual(norm, 'goersapp.com/events/indie-gig?session=1');
  });

  it('1.4 Handles bare domain URLs and missing protocols gracefully', () => {
    const raw = 'bosscreator.id/events/pestapora-2026/';
    const norm = EventNormalizationService.normalizeUrl(raw);
    assert.strictEqual(norm, 'bosscreator.id/events/pestapora-2026');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CANONICAL DEDUPLICATION & RESIDENCY / TOUR DISAMBIGUATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Section 2: Canonical Event Deduplication ──');

  it('2.1 Deterministic key incorporates normalized title, venue alias, city, and date', () => {
    const eventA = {
      canonical_name: 'DWP 2026 - Djakarta Warehouse Project',
      venue_name: 'JIExpo Kemayoran',
      city: 'Jakarta',
      start_date: '2026-12-11'
    };
    const key = EventDeduplicationService.buildDeterministicKey(eventA);
    assert.ok(key.includes('venue-kemayoran') || key.includes('jiexpo'));
    assert.ok(key.includes('2026-12-11'));
    assert.ok(key.includes('jakarta'));
  });

  it('2.2 Deduplication merges Kanye West vs YE Live alias on same venue and date', () => {
    const canonicalKanye = {
      event_id: 'evt-kanye-2026',
      canonical_name: 'Kanye West — Ye Tour 2026 in Jakarta',
      artist: 'Kanye West',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      city: 'Jakarta',
      start_date: '2026-10-24'
    };
    const incomingYe = {
      name: 'YE Live in Jakarta',
      artist: 'Ye',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      city: 'Jakarta',
      start_date: '2026-10-24'
    };

    const match = EventDeduplicationService.findDuplicateCandidate(incomingYe, [canonicalKanye]);
    assert.strictEqual(match.isMatch, true);
    assert.ok(match.confidence >= 80);
  });

  it('2.3 Strictly separates multi-night residencies (LANY Night 1 vs Night 2)', () => {
    const lanyNight1 = {
      event_id: 'evt-lany-n1',
      canonical_name: 'LANY: soft world tour – Night 1',
      venue_name: 'Indonesia Arena, Senayan',
      city: 'Jakarta',
      start_date: '2026-10-29'
    };
    const lanyNight2 = {
      event_id: 'evt-lany-n2',
      canonical_name: 'LANY: soft world tour – Night 2',
      venue_name: 'Indonesia Arena, Senayan',
      city: 'Jakarta',
      start_date: '2026-10-30'
    };

    const match = EventDeduplicationService.findDuplicateCandidate(lanyNight2, [lanyNight1]);
    assert.strictEqual(match.isMatch, false, 'Multi-night residency shows must NOT collapse');
  });

  it('2.4 Strictly separates multi-city tour stops (Sheila on 7 in Bandung vs Jakarta)', () => {
    const so7Bandung = {
      event_id: 'evt-so7-bdg',
      canonical_name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung',
      start_date: '2026-11-20',
      artist: 'Sheila on 7'
    };
    const so7Jakarta = {
      event_id: 'evt-so7-jkt',
      canonical_name: 'Sheila on 7 — Tunggu Aku Di Jakarta',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      city: 'Jakarta',
      start_date: '2026-11-20',
      artist: 'Sheila on 7'
    };

    const match = EventDeduplicationService.findDuplicateCandidate(so7Jakarta, [so7Bandung]);
    assert.strictEqual(match.isMatch, false, 'Multi-city tour stops must NOT collapse');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. TEMPORAL LIFECYCLE & DATE INTEGRITY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Section 3: Temporal Lifecycle & Date Classification ──');

  it('3.1 Missing or invalid start dates do NOT default to today', () => {
    const invalidEvent = {
      id: 'evt-shuttle-bus',
      name: 'Layanan Shuttle Bus DWP 2026',
      start_date: null,
      date: null
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(invalidEvent);
    assert.strictEqual(temporal.is_invalid_date, true);
    assert.strictEqual(temporal.event_start_at, null);
    assert.strictEqual(temporal.event_end_at, null);
  });

  it('3.2 Invalid date records receive SCHEDULE_PENDING status and are not upcoming', () => {
    const invalidEvent = {
      id: 'evt-aston-kemayoran',
      name: 'ASTON Kemayoran Hotel Package',
      start_date: 'INVALID_DATE'
    };
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(invalidEvent);
    assert.strictEqual(status, LIFECYCLE_STATUS.SCHEDULE_PENDING);

    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(invalidEvent);
    assert.strictEqual(isUpcoming, false, 'Events without valid dates cannot be upcoming');
  });

  it('3.3 Past events are classified as COMPLETED or ARCHIVED', () => {
    const pastEvent = {
      id: 'evt-pestapora-2026',
      name: 'Pestapora 2026',
      start_date: '2026-09-25',
      end_date: '2026-09-27'
    };
    const now = new Date('2026-10-26T03:00:00+07:00');
    const isPast = EventTemporalLifecycleEngine.isEventExpired(pastEvent, now);
    assert.strictEqual(isPast, true);

    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(pastEvent, now);
    assert.strictEqual(isUpcoming, false);

    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(pastEvent, now);
    assert.ok(status === LIFECYCLE_STATUS.COMPLETED || status === LIFECYCLE_STATUS.ARCHIVED);
  });

  it('3.4 Future events are classified as UPCOMING', () => {
    const futureEvent = {
      id: 'evt-dwp-2026',
      name: 'DWP 2026',
      start_date: '2026-12-11',
      end_date: '2026-12-13'
    };
    const now = new Date('2026-10-26T03:00:00+07:00');
    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(futureEvent, now);
    assert.strictEqual(isUpcoming, true);

    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(futureEvent, now);
    assert.strictEqual(status, LIFECYCLE_STATUS.UPCOMING);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. STORAGE LAYER PROTECTIONS FOR EXPIRED EVENTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Section 4: Marketplace Storage Protections ──');

  await itAsync('4.1 InMemoryMarketplaceRepository.createListing blocks expired events with EVENT_EXPIRED', async () => {
    const repo = new InMemoryMarketplaceRepository();
    canonicalRegistry.createEvent({
      id: 'evt-past-show-1',
      canonical_name: 'Past Concert 2026',
      venue_name: 'GBK',
      city: 'Jakarta',
      start_date: '2026-09-01',
      lifecycle_status: 'COMPLETED',
      archive_status: 'ARCHIVED',
      source_url: 'https://official.test',
      is_verified: true,
      verification_status: 'VERIFIED'
    });

    let threw = false;
    try {
      await repo.createListing({
        canonical_event_id: 'evt-past-show-1',
        ticket_id: 't-123',
        seller_id: 'u-seller',
        price: 500000
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'EVENT_EXPIRED');
    }
    assert.strictEqual(threw, true, 'createListing on past event must throw EVENT_EXPIRED');
  });

  await itAsync('4.2 InMemoryMarketplaceRepository.atomicReserveInventory blocks expired events with EVENT_EXPIRED', async () => {
    const repo = new InMemoryMarketplaceRepository();
    canonicalRegistry.createEvent({
      id: 'evt-past-show-2',
      canonical_name: 'Concluded Rock Fest',
      venue_name: 'JIExpo',
      city: 'Jakarta',
      start_date: '2026-08-15',
      lifecycle_status: 'ARCHIVED',
      archive_status: 'ARCHIVED'
    });

    // Manually register an existing listing to simulate an unexpired dangling listing
    repo.listings.set('list-dangling-1', {
      id: 'list-dangling-1',
      canonical_event_id: 'evt-past-show-2',
      status: 'ACTIVE',
      available_quantity: 1,
      reserved_quantity: 0
    });

    let threw = false;
    try {
      await repo.atomicReserveInventory('list-dangling-1', 1);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'EVENT_EXPIRED');
    }
    assert.strictEqual(threw, true, 'atomicReserveInventory on expired event must throw EVENT_EXPIRED');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. WEB ROUTING & ARCHIVE HUB
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Section 5: Web Routing & Archive Experience ──');

  let server;
  let baseUrl;

  try {
    const express = require('express');
    const app = express();
    const discoveryRouter = require('./src/discovery/discoveryRouter');
    app.use(discoveryRouter);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    await itAsync('5.1 GET /events/archive serves the historical archive hub (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/events/archive`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('Arsip Event'), 'Must contain archive title');
      assert.ok(text.includes('TIKUM HISTORICAL ARCHIVE'), 'Must contain historical archive pill');
      assert.ok(text.includes('/events/archive'), 'Must contain self link');
    });

    await itAsync('5.2 GET /events contains navigation links to both Upcoming and Archive', async () => {
      const res = await fetch(`${baseUrl}/events`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('Event Mendatang'));
      assert.ok(text.includes('href="/events/archive"'));
    });

    await itAsync('5.3 GET /events/:slug for a past event displays the concluded notice, not 404', async () => {
      canonicalRegistry.createEvent({
        id: 'evt-test-past-seo',
        slug: 'test-past-concert-2026',
        canonical_name: 'Test Past Concert 2026',
        venue_name: 'Istora Senayan',
        city: 'Jakarta',
        start_date: '2026-09-10',
        lifecycle_status: 'ARCHIVED',
        archive_status: 'ARCHIVED',
        source_url: 'https://official.promoter.test',
        evidence_hash: 'ev-hash-12345',
        last_verified_at: '2026-09-01T00:00:00.000Z',
        is_verified: true,
        verification_status: 'VERIFIED'
      });

      const res = await fetch(`${baseUrl}/events/test-past-concert-2026`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('Event Ini Telah Berakhir'), 'Past event landing page must render concluded notice');
      assert.ok(text.includes('EventCompleted'), 'Must contain Schema.org EventCompleted status');
    });

    await itAsync('5.4 GET /api/discovery/events/:slugOrId for a past event returns JSON with 0 active listings, not 404', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/events/test-past-concert-2026`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.resale_inventory.active_count, 0, 'Past events must have 0 active resale inventory');
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(`  RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal suite execution error:', err);
  process.exit(1);
});
