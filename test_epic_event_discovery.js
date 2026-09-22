process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const { state, resetDatabase } = require('./src/database');
const app = require('./src/server');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { sourceRegistry, SOURCE_STATUS, TRUST_LEVELS } = require('./src/discovery/SourceRegistry');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');
const { demandCapture } = require('./src/discovery/DemandCaptureService');
const { VERIFICATION_STATUS } = require('./src/discovery/EventVerificationService');
const { ListingService } = require('./src/services/listingService');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

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

  return { status: res.status, headers: res.headers, data };
}

async function runSuite() {
  console.log('\n=== ARGUS EPIC: EVENT DISCOVERY & SEO ENGINE ACCEPTANCE SUITE ===\n');

  resetDatabase();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // ==========================================
  // SCENARIO A: Event exists on tiket.com but not LOKET
  // ==========================================
  let scenarioAEventId;
  let scenarioASlug;
  let scenarioCSlug;
  await testAsync('Scenario A: Ingestion from tiket.com discovers event, creates canonical entry with source provenance', async () => {
    const payload = {
      name: 'Ed Sheeran: Mathematics Tour Jakarta 2026',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      city: 'Jakarta',
      start_date: '2026-11-20',
      category: 'KONSER',
      official_ticket_url: 'https://www.tiket.com/to-do/ed-sheeran-jakarta-2026',
      source_event_id: 'tiket-ed-sheeran-2026'
    };

    const res = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: {
        payload,
        source_id: 'src-tiket-com'
      }
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.dedup_action, 'CREATED');
    assert.strictEqual(res.data.canonical_event.canonical_name, 'Ed Sheeran: Mathematics Tour Jakarta 2026');
    assert.strictEqual(res.data.canonical_event.source_count, 1);
    assert.strictEqual(res.data.canonical_event.sources[0].source_id, 'src-tiket-com');

    scenarioAEventId = res.data.canonical_event.event_id;
    scenarioASlug = res.data.canonical_event.slug;

    // Corroborate with Tier 1 Authoritative Promoter (PK Entertainment)
    await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: {
        payload: {
          ...payload,
          official_event_url: 'https://pk-ent.com/events/ed-sheeran',
          source_event_id: 'pk-ed-sheeran-2026'
        },
        source_id: 'src-org-pk-ent'
      }
    });

    // Verify marketplace bridge (synced to state.events)
    const inState = state.events.find(e => e.id === scenarioAEventId);
    assert.ok(inState, 'Canonical event must be present in state.events');
    assert.strictEqual(inState.name, 'Ed Sheeran: Mathematics Tour Jakarta 2026');
  });

  // ==========================================
  // SCENARIO B: Event exists on LOKET but not GOERS
  // ==========================================
  let scenarioBEventId;
  await testAsync('Scenario B: Ingestion from LOKET discovers independent indie festival', async () => {
    const payload = {
      name: 'We The Fest: Autumn Showcase 2026',
      venue_name: 'GBK Baseball Stadium Senayan',
      city: 'Jakarta',
      start_date: '2026-12-05',
      category: 'FESTIVAL',
      official_ticket_url: 'https://www.loket.com/event/wtf-autumn-2026',
      source_event_id: 'loket-wtf-2026'
    };

    const res = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: {
        payload,
        source_id: 'src-loket'
      }
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.dedup_action, 'CREATED');
    assert.strictEqual(res.data.canonical_event.sources[0].source_id, 'src-loket');
    scenarioBEventId = res.data.canonical_event.event_id;
  });

  // ==========================================
  // SCENARIO C: Event exists on GOERS and official promoter website
  // ==========================================
  await testAsync('Scenario C: Sources from GOERS and Official Promoter merge into ONE canonical event', async () => {
    // 1. Ingest from GOERS
    const goersPayload = {
      name: 'Jakarta Jazz Heritage Night 2026',
      venue_name: 'Taman Ismail Marzuki (TIM)',
      city: 'Jakarta',
      start_date: '2026-10-30',
      category: 'CONCERT',
      official_ticket_url: 'https://goersapp.com/events/jazz-heritage-2026',
      source_event_id: 'goers-jazz-101'
    };

    const res1 = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: { payload: goersPayload, source_id: 'src-goers' }
    });
    assert.strictEqual(res1.status, 201);
    const eventId = res1.data.canonical_event.event_id;

    // 2. Ingest same event from Official Promoter
    const promoterPayload = {
      name: 'Jakarta Jazz Heritage Night 2026',
      venue_name: 'Taman Ismail Marzuki (TIM)',
      city: 'Jakarta',
      start_date: '2026-10-30',
      category: 'CONCERT',
      official_event_url: 'https://pk-ent.com/events/jazz-heritage',
      official_ticket_url: 'https://goersapp.com/events/jazz-heritage-2026',
      source_event_id: 'pk-jazz-2026'
    };

    const res2 = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: { payload: promoterPayload, source_id: 'src-org-pk-ent' }
    });

    assert.strictEqual(res2.status, 201);
    assert.strictEqual(res2.data.dedup_action, 'MERGED', 'Must detect duplicate and merge');
    assert.strictEqual(res2.data.canonical_event.event_id, eventId, 'Must keep same canonical event ID');
    assert.strictEqual(res2.data.canonical_event.source_count, 2, 'Must have 2 source records');
    assert.ok(res2.data.canonical_event.verification_confidence >= 80, 'Tier 1 promoter boost must verify event');
    scenarioCSlug = res2.data.canonical_event.slug;
  });

  // ==========================================
  // SCENARIO D: Same event on 3 platforms with different names
  // ==========================================
  await testAsync('Scenario D: Normalization & deduplication merges differently named records into ONE event', async () => {
    // Source 1: LOKET calling it "Persib vs Persija"
    const p1 = {
      name: 'Persib vs Persija',
      venue_name: 'Stadion Gelora Bandung Lautan Api (GBLA)',
      city: 'Bandung',
      start_date: '2026-11-12',
      category: 'FOOTBALL',
      official_ticket_url: 'https://loket.com/persib-persija'
    };

    const r1 = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: { payload: p1, source_id: 'src-loket' }
    });
    assert.strictEqual(r1.status, 201);
    const targetId = r1.data.canonical_event.event_id;

    // Source 2: GOERS calling it "Persib Bandung vs Persija Jakarta"
    const p2 = {
      name: 'Persib Bandung vs Persija Jakarta',
      venue_name: 'Stadion Gelora Bandung Lautan Api (GBLA)',
      city: 'Bandung',
      start_date: '2026-11-12',
      category: 'SEPAK BOLA',
      official_ticket_url: 'https://goers.com/persib-persija'
    };

    const r2 = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: { payload: p2, source_id: 'src-goers' }
    });
    assert.strictEqual(r2.status, 201);
    assert.strictEqual(r2.data.dedup_action, 'MERGED');
    assert.strictEqual(r2.data.canonical_event.event_id, targetId);

    // Source 3: Official League with sponsor prefix "BRI Liga 1: Persib v Persija"
    const p3 = {
      name: 'BRI Liga 1: Persib v Persija',
      venue_name: 'Stadion Gelora Bandung Lautan Api (GBLA)',
      city: 'Bandung',
      start_date: '2026-11-12',
      category: 'FOOTBALL',
      official_event_url: 'https://ligaindonesiabaru.com'
    };

    const r3 = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: { payload: p3, source_id: 'src-league-ibl' } // sport org tier 1
    });
    assert.strictEqual(r3.status, 201);
    assert.strictEqual(r3.data.dedup_action, 'MERGED');
    assert.strictEqual(r3.data.canonical_event.event_id, targetId);
    assert.strictEqual(r3.data.canonical_event.source_count, 3);
  });

  // ==========================================
  // SCENARIO E: Two sources disagree on event date
  // ==========================================
  let conflictEventId;
  await testAsync('Scenario E: Disagreeing sources trigger DATA_CONFLICT status, preventing unverified publishing', async () => {
    // Source A says 20 October 2026
    const resA = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: {
        payload: {
          name: 'Festival Lentera Candi Prambanan 2026',
          venue_name: 'Candi Prambanan',
          city: 'Yogyakarta',
          start_date: '2026-10-20',
          category: 'CULTURAL',
          source_event_id: 'lentera-fest-2026'
        },
        source_id: 'src-loket'
      }
    });
    assert.strictEqual(resA.status, 201);
    conflictEventId = resA.data.canonical_event.event_id;

    // Source B says 21 October 2026 (conflicting date)
    const resB = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: {
        payload: {
          name: 'Festival Lentera Candi Prambanan 2026',
          venue_name: 'Candi Prambanan',
          city: 'Yogyakarta',
          start_date: '2026-10-21', // mismatch
          category: 'CULTURAL',
          source_event_id: 'lentera-fest-2026'
        },
        source_id: 'src-goers'
      }
    });

    assert.strictEqual(resB.status, 201);
    assert.strictEqual(resB.data.canonical_event.event_id, conflictEventId);
    assert.strictEqual(resB.data.verification_status, VERIFICATION_STATUS.DATA_CONFLICT);
    assert.ok(resB.data.canonical_event.conflicts.length > 0);
    assert.strictEqual(resB.data.canonical_event.conflicts[0].field, 'start_date');

    // Admin resolves conflict
    const resolveRes = await apiRequest(`/api/discovery/admin/events/${conflictEventId}/resolve-conflict`, {
      method: 'POST',
      headers: { 'x-user-id': 'admin-1' },
      body: { start_date: '2026-10-20' }
    });
    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(resolveRes.data.event.verification_status, VERIFICATION_STATUS.VERIFIED);
    assert.strictEqual(resolveRes.data.event.start_date, '2026-10-20');
  });

  // ==========================================
  // SCENARIO F: Zero-inventory event remains discoverable and captures demand
  // ==========================================
  await testAsync('Scenario F: Zero-inventory event has indexable SSR page and active demand capture waitlist', async () => {
    // Event has zero secondary listings
    const ssrRes = await apiRequest(`/events/${scenarioASlug}`);
    assert.strictEqual(ssrRes.status, 200);
    assert.ok(ssrRes.data.includes('Ed Sheeran: Mathematics Tour Jakarta 2026'));
    assert.ok(ssrRes.data.includes('Saat Ini Belum Ada Tiket Resale Terverifikasi'));
    assert.ok(ssrRes.data.includes('Ingatkan Saya'));
    assert.ok(ssrRes.data.includes('https://schema.org'));

    // Submit demand notification
    const demandRes = await apiRequest('/api/discovery/demand', {
      method: 'POST',
      body: {
        eventId: scenarioAEventId,
        contactInfo: '081299998888',
        targetCategory: 'CAT 1',
        maxBudget: 2500000
      }
    });

    assert.strictEqual(demandRes.status, 201);
    assert.strictEqual(demandRes.data.success, true);
    assert.strictEqual(demandRes.data.demand.event_id, scenarioAEventId);

    // Verify demand count appears in event JSON
    const detailRes = await apiRequest(`/api/discovery/events/${scenarioASlug}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.data.demand_intelligence.waitlist_count, 1);
  });

  // ==========================================
  // SCENARIO G: Marketplace listing attaches to canonical event
  // ==========================================
  let listingId;
  await testAsync('Scenario G: Marketplace listing attaches seamlessly to canonical event without duplicate creation', async () => {
    const listingRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: scenarioAEventId,
      seatInfo: 'CAT 1 Row A Seat 15',
      faceValue: 2000000,
      price: 2200000,
      rawBarcode: 'ED-SHEERAN-TICKET-BARCODE-001',
      evidenceBundleId: null
    });

    assert.ok(listingRes.listing.id);
    listingId = listingRes.listing.id;

    // Admin verifies listing to make it ACTIVE in marketplace
    await ListingService.verifyListing(listingId, 'admin-1', { approved: true });

    // Verify Event page SSR now displays verified resale inventory!
    const ssrRes = await apiRequest(`/events/${scenarioASlug}`);
    assert.strictEqual(ssrRes.status, 200);
    assert.ok(ssrRes.data.includes('1 Tiket Resale Terverifikasi'));
    assert.ok(ssrRes.data.includes('Rp 2.200.000'));
    assert.ok(ssrRes.data.includes('CAT 1 Row A Seat 15'));
  });

  // ==========================================
  // SCENARIO H: Official cancellation handling
  // ==========================================
  await testAsync('Scenario H: Official cancellation updates canonical status and cancels active resale listings', async () => {
    const cancelRes = await apiRequest(`/api/discovery/admin/events/${scenarioAEventId}/cancel`, {
      method: 'POST',
      headers: { 'x-user-id': 'admin-1' },
      body: { reason: 'Artis mengalami cedera pita suara' }
    });

    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.event.status, 'CANCELLED');
    assert.strictEqual(cancelRes.data.cancelled_listings_count, 1);

    // Verify listing in state is cancelled
    const listing = state.listings.find(l => l.id === listingId);
    assert.strictEqual(listing.status, 'CANCELLED');
    assert.ok(listing.rejection_reason.includes('Event dibatalkan oleh pihak resmi'));
  });

  // ==========================================
  // SCENARIO I: Source becomes degraded / unavailable
  // ==========================================
  await testAsync('Scenario I: Source failure degrades source health while existing canonical events remain preserved', async () => {
    // Degrade source
    sourceRegistry.updateHealth('src-tiket-com', SOURCE_STATUS.DEGRADED);

    const src = sourceRegistry.getSource('src-tiket-com');
    assert.strictEqual(src.active_status, SOURCE_STATUS.DEGRADED);

    // Existing event still accessible and intact
    const event = canonicalRegistry.getEventById(scenarioAEventId);
    assert.ok(event);
    assert.strictEqual(event.canonical_name, 'Ed Sheeran: Mathematics Tour Jakarta 2026');
  });

  // ==========================================
  // SECTION 40: SEO TECHNICAL AUDIT
  // ==========================================
  await testAsync('Section 40: SEO technical audit validates Schema.org JSON-LD and canonical metadata', async () => {
    const res = await apiRequest(`/events/${scenarioCSlug}`);
    assert.strictEqual(res.status, 200);
    const html = res.data;

    // 1. Stable Canonical Link
    assert.ok(
      html.includes(`<link rel="canonical" href="https://tikum.app/events/${scenarioCSlug}">`)
    );

    // 2. OpenGraph & Twitter
    assert.ok(html.includes('<meta property="og:title"'));
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));

    // 3. Schema.org JSON-LD parsing
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(jsonLdMatch, 'Page must contain valid JSON-LD script tag');
    const jsonLd = JSON.parse(jsonLdMatch[1].trim());

    assert.strictEqual(jsonLd['@context'], 'https://schema.org');
    assert.strictEqual(jsonLd['@type'], 'MusicEvent');
    assert.ok(jsonLd.name.includes('Jazz'));
    assert.strictEqual(jsonLd.location['@type'], 'Place');
    assert.strictEqual(jsonLd.location.address.addressCountry, 'ID');
    assert.ok(jsonLd.offers, 'Offers must be structured');

    // 4. Official Ticket strictly separated from secondary market
    assert.ok(html.includes('Sumber Tiket Resmi (Primary Provider)'));
    assert.ok(html.includes('Tiket Resale Terverifikasi di Tikum') || html.includes('ARGUS Verified Resale Marketplace'));
  });

  // ==========================================
  // SECTION 41: BUSINESS ACCEPTANCE TEST
  // ==========================================
  await testAsync('Section 41: Business Acceptance — Discovery catalog query, filtering, and telemetry', async () => {
    // 1. User discovers events via public catalog API
    const catRes = await apiRequest('/api/discovery/events?city=Jakarta&include_past=true');
    assert.strictEqual(catRes.status, 200);
    assert.ok(catRes.data.events.length >= 5);

    // 2. Telemetry reflects all activities
    const telemRes = await apiRequest('/api/discovery/telemetry');
    assert.strictEqual(telemRes.status, 200);
    assert.ok(telemRes.data.metrics.events_discovered >= 5);
    assert.ok(telemRes.data.metrics.duplicates_detected >= 2);
    assert.ok(telemRes.data.recent_logs.length > 0);
  });

  server.close();

  console.log(`\n=======================`);
  console.log(`Event Discovery Suite Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error in Event Discovery suite:', err);
  if (server) server.close();
  process.exit(1);
});
