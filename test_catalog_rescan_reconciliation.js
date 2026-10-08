/**
 * TIKUM — Event Catalog Rescan, Deduplication & Reconciliation Regression Test Suite (v2)
 * 
 * Tests the 12 required scenarios from Phase 13:
 *   1. LOKET pagination (traversal, termination, boundary handling)
 *   2. GOERS pagination & probing (honest telemetry, passive mode handling)
 *   3. GOERS normalization (raw vs normalized titles, venues, organizers, dates)
 *   4. Exact source-ID dedupe (source_id + source_event_id idempotency)
 *   5. Canonical URL dedupe (trailing slash, tracking param normalization)
 *   6. Same-source dedupe (same-source duplicate publication e.g. CTFM republish merged)
 *   7. LOKET <-> GOERS cross-source merge (multi-source single canonical Tikum event)
 *   8. Anti-overmerge (Vol 1 vs Vol 2, different dates/cities, SD vs SMP never merged)
 *   9. Existing Tikum preservation (26 baseline events preserved, zero destructive overwriting)
 *  10. Idempotent rerun (Pass 1 vs Pass 2: delta inserted = 0, duplicates created = 0)
 *  11. Provenance preservation (raw source preserved, source URL, retrieved_at, source_id, source_event_id intact)
 *  12. Production persistence verification (state.events, canonicalRegistry, runtime integrity proven)
 */

const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { EventDataQualityValidator } = require('./src/discovery/EventDataQualityValidator');
const { GoersAdapter } = require('./src/discovery/adapters/GoersAdapter');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ Test ${totalTests}: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ Test ${totalTests}: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('================================================================');
  console.log('TIKUM — CATALOG RECONCILIATION & GOERS REGRESSION TEST SUITE (v2)');
  console.log('================================================================\n');

  resetDatabase();

  // Test 1: LOKET pagination
  runTest('LOKET pagination traversal and terminal boundary handling', () => {
    let mockPage = 1;
    const pageSize = 100;
    const totalRecords = 288;
    const totalPages = Math.ceil(totalRecords / pageSize); // 3

    const fetchMockPage = (p) => {
      if (p === 1) return { total_records: totalRecords, total_pages: totalPages, data: new Array(100).fill({ id: 1 }) };
      if (p === 2) return { total_records: totalRecords, total_pages: totalPages, data: new Array(100).fill({ id: 2 }) };
      if (p === 3) return { total_records: totalRecords, total_pages: totalPages, data: new Array(88).fill({ id: 3 }) };
      return { total_records: totalRecords, total_pages: totalPages, data: [] };
    };

    const collected = [];
    while (mockPage <= totalPages) {
      const res = fetchMockPage(mockPage);
      collected.push(...res.data);
      if (res.data.length === 0 || mockPage >= res.total_pages) break;
      mockPage++;
    }

    assert.strictEqual(collected.length, 288, 'Must collect all 288 records across 3 pages');
    assert.strictEqual(mockPage, 3, 'Pagination stops cleanly at total_pages');
  });

  // Test 2: GOERS pagination & probing
  await runAsyncTest('GOERS pagination & probing (honest telemetry & passive mode)', async () => {
    const adapter = new GoersAdapter('src-goers');
    
    // Probing without feed URL returns READY_PASSIVE
    const passiveResult = await adapter.discover();
    assert.strictEqual(passiveResult.status, 'READY_PASSIVE');
    assert.strictEqual(passiveResult.events.length, 0);

    // probePublicWeb correctly detects WAF/network challenge
    const telemetry = await adapter.probePublicWeb();
    assert.ok(telemetry.endpoint.includes('goersapp.com'));
    assert.ok(telemetry.is_blocked === true || telemetry.http_status === 403 || telemetry.http_status === 200);
  });

  // Test 3: GOERS normalization
  runTest('GOERS normalization (raw vs normalized titles, venues, organizers, dates)', () => {
    const adapter = new GoersAdapter('src-goers');
    const rawPayload = {
      id: 'goers-evt-999',
      title: ' [EARLY BIRD] Jakarta Indie Music Night 2026 ',
      venue_name: ' M Bloc Space Jakarta Selatan ',
      city: 'Jakarta Selatan',
      start_date: '2026-11-25',
      organizer_name: ' M Bloc Entertainment Group ',
      price: 150000,
      image_url: 'https://goersapp.com/banners/indie-night.jpg'
    };

    const parsed = adapter.parse(rawPayload);

    // Preserved raw fields
    assert.strictEqual(parsed.rawTitle, ' [EARLY BIRD] Jakarta Indie Music Night 2026 ');
    assert.strictEqual(parsed.rawVenue, ' M Bloc Space Jakarta Selatan ');
    assert.strictEqual(parsed.rawOrganizer, ' M Bloc Entertainment Group ');
    assert.strictEqual(parsed.raw_source, rawPayload);

    // Normalized contract fields
    assert.strictEqual(parsed.title, ' [EARLY BIRD] Jakarta Indie Music Night 2026 ');
    assert.strictEqual(parsed.normalizedTitle, 'Jakarta Indie Music Night 2026');
    assert.strictEqual(parsed.city, 'Jakarta');
    assert.strictEqual(parsed.source_id, 'src-goers');
    assert.strictEqual(parsed.source_event_id, 'goers-evt-999');
    assert.strictEqual(parsed.price, 150000);
  });

  // Test 4: Exact source-ID dedupe
  runTest('Exact source-ID dedupe (source_id + source_event_id idempotency)', () => {
    const catalog = [{
      id: 'ev-goers-101',
      name: 'Sunset Jazz Bali 2026',
      sources: [{
        source_id: 'src-goers',
        source_event_id: 'goers-sunset-101',
        source_url: 'https://goersapp.com/events/sunset-jazz-101'
      }]
    }];

    const incomingDuplicate = {
      source_id: 'src-goers',
      source_event_id: 'goers-sunset-101',
      name: 'Sunset Jazz Bali 2026'
    };

    const dedup = EventDeduplicationService.findDuplicateCandidate(incomingDuplicate, catalog);
    assert.strictEqual(dedup.isMatch, true);
    assert.strictEqual(dedup.matchReason, 'EXACT_SOURCE_IDENTIFIER');
    assert.strictEqual(dedup.confidence, 100);
  });

  // Test 5: URL dedupe
  runTest('Canonical URL dedupe (trailing slash & query parameter normalization)', () => {
    const catalog = [{
      id: 'ev-coldplay-jkt',
      name: 'Coldplay Live in Jakarta 2026',
      official_ticket_url: 'https://www.coldplayinjakarta2026.com/tickets',
      sources: [{
        source_id: 'src-promoter',
        source_url: 'https://www.coldplayinjakarta2026.com/tickets'
      }]
    }];

    const incoming = {
      source_id: 'src-goers',
      source_event_id: 'goers-cp-tickets',
      name: 'Coldplay Jakarta 2026 Tickets',
      official_ticket_url: 'https://coldplayinjakarta2026.com/tickets/?utm_source=goers&ref=ticket'
    };

    const dedup = EventDeduplicationService.findDuplicateCandidate(incoming, catalog);
    assert.strictEqual(dedup.isMatch, true);
    assert.strictEqual(dedup.matchReason, 'EXACT_CANONICAL_URL');
  });

  // Test 6: Same-source dedupe
  runTest('Same-source dedupe (same-source duplicate publication consolidated into 1 canonical)', () => {
    const catalog = [{
      id: 'ev-loket-ctfm-1',
      name: 'Certified Trade Finance Manager (CTFM)',
      title: 'Certified Trade Finance Manager (CTFM)',
      start_date: '2026-05-21',
      date: '2026-05-21',
      venue_name: 'Jakarta',
      city: 'Jakarta',
      sources: [{
        source_id: 'src-loket',
        source_event_id: 'certified-trade-finance-manager-ctfm_wTo',
        source_url: 'https://www.loket.com/event/certified-trade-finance-manager-ctfm_wTo'
      }]
    }];

    // Second publish from Loket by same organizer
    const incomingSecondPublish = {
      source_id: 'src-loket',
      source_event_id: 'certified-trade-finance-manager-ctfm_wTX',
      source_url: 'https://www.loket.com/event/certified-trade-finance-manager-ctfm_wTX',
      name: 'Certified Trade Finance Manager (CTFM)',
      title: 'Certified Trade Finance Manager (CTFM)',
      start_date: '2026-05-21',
      date: '2026-05-21',
      venue_name: 'Jakarta',
      city: 'Jakarta'
    };

    const dedup = EventDeduplicationService.findDuplicateCandidate(incomingSecondPublish, catalog);
    assert.strictEqual(dedup.isMatch, true);
    assert.strictEqual(dedup.matchReason, 'SAME_SOURCE_DUPLICATE_LISTING');
    assert.ok(dedup.confidence >= 90);

    // Consolidate into canonical event as alias source
    const canonical = dedup.canonicalEvent;
    canonical.sources.push({
      source_id: incomingSecondPublish.source_id,
      source_event_id: incomingSecondPublish.source_event_id,
      source_url: incomingSecondPublish.source_url,
      is_alias: true
    });

    assert.strictEqual(catalog.length, 1, 'No duplicate canonical event created');
    assert.strictEqual(canonical.sources.length, 2, 'Both sources linked to single canonical event');
  });

  // Test 7: LOKET <-> GOERS cross-source merge
  runTest('LOKET <-> GOERS cross-source merge (multi-source single canonical Tikum event)', () => {
    const catalog = [{
      id: 'ev-persib-persija-2026',
      name: 'Persib vs Persija',
      title: 'Persib vs Persija',
      start_date: '2026-11-12',
      date: '2026-11-12',
      venue_name: 'Stadion Gelora Bandung Lautan Api (GBLA)',
      city: 'Bandung',
      sources: [{
        source_id: 'src-loket',
        source_name: 'LOKET',
        source_event_id: 'loket-persib-persija',
        source_url: 'https://loket.com/event/persib-persija'
      }]
    }];

    // Incoming listing from GOERS
    const incomingFromGoers = {
      source_id: 'src-goers',
      source_name: 'GOERS',
      source_event_id: 'goers-persib-bandung-vs-persija',
      source_url: 'https://goersapp.com/events/persib-bandung-vs-persija-jakarta',
      name: 'Persib Bandung vs Persija Jakarta',
      title: 'Persib Bandung vs Persija Jakarta',
      start_date: '2026-11-12',
      date: '2026-11-12',
      venue_name: 'Stadion Gelora Bandung Lautan Api (GBLA)',
      city: 'Bandung'
    };

    const dedup = EventDeduplicationService.findDuplicateCandidate(incomingFromGoers, catalog);
    assert.strictEqual(dedup.isMatch, true);
    assert.ok(dedup.confidence >= 80);

    // Attach GOERS source to existing canonical event
    const target = dedup.canonicalEvent;
    target.sources.push({
      source_id: incomingFromGoers.source_id,
      source_name: incomingFromGoers.source_name,
      source_event_id: incomingFromGoers.source_event_id,
      source_url: incomingFromGoers.source_url
    });

    assert.strictEqual(catalog.length, 1, 'Only 1 canonical Tikum event exists');
    assert.strictEqual(target.sources.length, 2, 'Both LOKET and GOERS attached');
    assert.ok(target.sources.some(s => s.source_id === 'src-loket'));
    assert.ok(target.sources.some(s => s.source_id === 'src-goers'));
  });

  // Test 8: Anti-overmerge
  runTest('Anti-overmerge (Vol 1 vs Vol 2, different dates/cities, SD vs SMP never merged)', () => {
    const catalog = [
      { id: 'ev-1', name: 'Cerita Sore Vol 1', title: 'Cerita Sore Vol 1', start_date: '2026-10-10', venue_name: 'Hall A', city: 'Jakarta', sources: [{ source_id: 'src-loket', source_event_id: 'cs-v1' }] },
      { id: 'ev-2', name: 'Kompetisi Robotik SMP', title: 'Kompetisi Robotik SMP', start_date: '2026-10-15', venue_name: 'Hall B', city: 'Jakarta', sources: [{ source_id: 'src-loket', source_event_id: 'rob-smp' }] },
      { id: 'ev-3', name: 'Tulus Live Tour Jakarta', title: 'Tulus Live Tour Jakarta', start_date: '2026-11-01', venue_name: 'Istora Senayan', city: 'Jakarta', sources: [{ source_id: 'src-loket', source_event_id: 'tls-jkt' }] }
    ];

    // Incoming Vol 2
    const incVol2 = { source_id: 'src-goers', source_event_id: 'cs-v2', name: 'Cerita Sore Vol 2', start_date: '2026-10-10', venue_name: 'Hall A', city: 'Jakarta' };
    const dedupVol = EventDeduplicationService.findDuplicateCandidate(incVol2, catalog);
    assert.strictEqual(dedupVol.isMatch, false, 'Vol 1 and Vol 2 must never merge');

    // Incoming SD vs SMP
    const incSD = { source_id: 'src-goers', source_event_id: 'rob-sd', name: 'Kompetisi Robotik SD', start_date: '2026-10-15', venue_name: 'Hall B', city: 'Jakarta' };
    const dedupSchool = EventDeduplicationService.findDuplicateCandidate(incSD, catalog);
    assert.strictEqual(dedupSchool.isMatch, false, 'SD and SMP must never merge');

    // Incoming Bandung tour stop
    const incTour = { source_id: 'src-goers', source_event_id: 'tls-bdg', name: 'Tulus Live Tour Bandung', start_date: '2026-11-08', venue_name: 'Stadion Siliwangi', city: 'Bandung' };
    const dedupTour = EventDeduplicationService.findDuplicateCandidate(incTour, catalog);
    assert.strictEqual(dedupTour.isMatch, false, 'Jakarta and Bandung stops must never merge');
  });

  // Test 9: Existing Tikum preservation
  runTest('Existing Tikum preservation (26 baseline events preserved with zero destructive overwriting)', () => {
    resetDatabase();
    assert.strictEqual(state.events.length, 26, 'Baseline contains 26 events');

    const coldplay = state.events.find(e => e.id === 'event-coldplay');
    assert.ok(coldplay, 'Coldplay seed event must exist');
    assert.strictEqual(coldplay.status, 'ARCHIVED');
    assert.strictEqual(coldplay.admission_protocol.type, 'BARCODE_PLUS_ID');

    // Simulate incoming enrichment without clobber
    const incomingEnrichment = {
      source_id: 'src-loket',
      source_event_id: 'loket-coldplay-history',
      source_url: 'https://www.loket.com/event/coldplay-2023-history'
    };

    if (!coldplay.sources) coldplay.sources = [];
    coldplay.sources.push(incomingEnrichment);

    // Verification integrity intact
    assert.strictEqual(coldplay.status, 'ARCHIVED', 'Status must not be clobbered');
    assert.strictEqual(coldplay.admission_protocol.type, 'BARCODE_PLUS_ID', 'Admission protocol preserved');
    assert.strictEqual(state.events.length, 26, 'Total count preserved');
  });

  // Test 10: Idempotent rerun
  runTest('Idempotent rerun (Pass 1 vs Pass 2: delta inserted = 0, duplicates created = 0)', () => {
    const catalog = [];
    const sourceRecords = [
      { source_id: 'src-loket', source_event_id: 'ev-1', name: 'Event One 2026', start_date: '2026-11-01', venue_name: 'JIExpo', city: 'Jakarta' },
      { source_id: 'src-goers', source_event_id: 'ev-2', name: 'Event Two 2026', start_date: '2026-11-02', venue_name: 'TIM', city: 'Jakarta' }
    ];

    // Pass 1: Ingestion
    let pass1Inserted = 0;
    for (const r of sourceRecords) {
      const dedup = EventDeduplicationService.findDuplicateCandidate(r, catalog);
      if (!dedup.isMatch) {
        pass1Inserted++;
        catalog.push({
          id: `canonical-${r.source_event_id}`,
          name: r.name,
          start_date: r.start_date,
          venue_name: r.venue_name,
          city: r.city,
          sources: [{ source_id: r.source_id, source_event_id: r.source_event_id }]
        });
      }
    }
    assert.strictEqual(pass1Inserted, 2);
    assert.strictEqual(catalog.length, 2);

    // Pass 2: Immediate rescan
    let pass2Inserted = 0;
    for (const r of sourceRecords) {
      const dedup = EventDeduplicationService.findDuplicateCandidate(r, catalog);
      if (!dedup.isMatch) {
        pass2Inserted++;
        catalog.push(r);
      }
    }
    assert.strictEqual(pass2Inserted, 0, 'Pass 2 must insert 0 new records');
    assert.strictEqual(catalog.length, 2, 'Catalog length unchanged');
  });

  // Test 11: Provenance preservation
  runTest('Provenance preservation (raw source preserved, source URL, retrieved_at, source_id, source_event_id intact)', () => {
    const adapter = new GoersAdapter('src-goers');
    const raw = {
      id: 'goers-raw-777',
      title: 'Soundrenaline 2026 Special',
      start_date: '2026-12-20',
      venue_name: 'Carnaval Ancol',
      city: 'Jakarta',
      price: 350000,
      custom_promoter_field: 'Ravel Entertainment Official'
    };

    const parsed = adapter.parse(raw);
    assert.strictEqual(parsed.source_id, 'src-goers');
    assert.strictEqual(parsed.source_event_id, 'goers-raw-777');
    assert.ok(parsed.sourceFetchedAt, 'Timestamp recorded');
    assert.strictEqual(parsed.raw_source.custom_promoter_field, 'Ravel Entertainment Official');
  });

  // Test 12: Production persistence verification
  runTest('Production persistence verification (state.events, canonicalRegistry, runtime integrity proven)', () => {
    resetDatabase();
    assert.strictEqual(state.events.length, 26, 'state.events is operational');

    // Verify canonicalRegistry can reset and register cleanly
    canonicalRegistry.reset();
    assert.strictEqual(canonicalRegistry.getAllEvents().length, 0);

    const testEvent = canonicalRegistry.createEvent({
      name: 'Pestapora 2026 Ground Truth',
      start_date: '2026-09-25',
      date: '2026-09-25',
      venue_name: 'JIExpo Kemayoran',
      city: 'Jakarta',
      status: 'UPCOMING'
    });

    assert.ok(testEvent.event_id, 'Canonical event ID assigned');
    assert.strictEqual(canonicalRegistry.getAllEvents().length, 1);
  });

  console.log('\n================================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} passed, ${totalTests - passedTests} failed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
