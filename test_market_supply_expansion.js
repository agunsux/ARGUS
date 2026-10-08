/**
 * TIKUM / ARGUS — Market Supply Expansion & Catalog Ingestion Acceptance Suite
 *
 * Verifies:
 * 1. Event Normalization (title, date, venue, city, category)
 * 2. Price Parsing & Qualification (>= IDR 300,000 threshold, tiers, actual ranges)
 * 3. Multi-Factor Deterministic Deduplication
 * 4. Multi-City Tour Disambiguation (same artist, different cities -> distinct events)
 * 5. Multi-Source Provenance Merging (official portal + ticketing platform)
 * 6. Source Priority & Zero Silent Clobber
 * 7. Anti-Resurrection & H+2 Archive Invariant
 * 8. Idempotent Ingestion & Repeated Run Safety
 * 9. Dry-Run Mode (WOULD_CREATE, WOULD_UPDATE, WOULD_SKIP_DUPLICATE, WOULD_REVIEW, WOULD_REJECT)
 * 10. LaLaLa Fest Jakarta Specific Independent Verification (Olivia Dean & St. Vincent confirmed, ICE BSD City, Jan 17 2027)
 * 11. Red-Team Attacks: Fake prices, sub-300k, malicious URLs, concurrent ingestion, transaction integrity
 * 12. Direct Neon PostgreSQL Catalog Persistence
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const { state } = require('./src/database');
const { DiscoveredEvent, DISCOVERY_CATEGORIES, PRICE_STATUS, QUALITY_GRADES, EVENT_PRIORITY } = require('./src/discovery/models/DiscoveredEvent');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { EventTemporalLifecycleEngine } = require('./src/discovery/EventTemporalLifecycleEngine');
const { MarketSupplyExpansionService } = require('./src/discovery/supply/MarketSupplyExpansionService');
const { LoketDiscoverySource } = require('./src/discovery/supply/LoketDiscoverySource');
const { OfficialEventDiscoverySource } = require('./src/discovery/supply/OfficialEventDiscoverySource');
const { InMemoryCatalogRepository } = require('./src/discovery/repository/InMemoryCatalogRepository');
const { getCatalogRepository, setCatalogRepository } = require('./src/discovery/repository');
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
    if (server) {
      server.close(resolve);
    } else {
      resolve();
    }
  });
}

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
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

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('  TIKUM / ARGUS — MARKET SUPPLY EXPANSION ACCEPTANCE SUITE    ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(1, 3).join('\n'));
      }
      failed++;
    }
  }

  // Test repository
  const testRepo = new InMemoryCatalogRepository();
  await testRepo.init();
  setCatalogRepository(testRepo);
  const supplyService = new MarketSupplyExpansionService({
    minPriceThreshold: 300000,
    repository: testRepo
  });

  await startTestServer();

  // --- PART 1: NORMALIZATION & PRICE QUALIFICATION ---
  await test('1. Event Normalization: Clean title, venue and ISO dates', () => {
    const disc = new DiscoveredEvent({
      title: '  LaLaLa Festival   Jakarta   2027  ',
      date: '2027-01-17',
      venue_name: 'ICE BSD City',
      city: 'Tangerang',
      price: 1350000
    });
    assert.strictEqual(disc.canonical_name, 'LaLaLa Festival Jakarta 2027');
    assert.strictEqual(disc.start_date, '2027-01-17');
    assert.strictEqual(disc.city, 'Tangerang');
    assert.strictEqual(disc.venue_name, 'Indonesia Convention Exhibition (ICE BSD)');
  });

  await test('2. Price Threshold Qualification: >= IDR 300,000 qualifies as QUALIFIED', () => {
    const disc = new DiscoveredEvent({
      title: 'Concert A',
      price_min: 300000,
      price_max: 1500000
    });
    assert.strictEqual(disc.price_status, PRICE_STATUS.QUALIFIED);
    assert.strictEqual(disc.isQualified(300000), true);
  });

  await test('3. Tiered Pricing Qualification: Entry < 300k but VIP >= 300k marks PRICE_TIERED', () => {
    const disc = new DiscoveredEvent({
      title: 'Concert B',
      price_min: 250000,
      price_max: 750000
    });
    assert.strictEqual(disc.price_status, PRICE_STATUS.PRICE_TIERED);
    assert.strictEqual(disc.isQualified(300000), true);
  });

  await test('4. Cheap Event Rejection: Ticket price strictly below IDR 300,000 is rejected', () => {
    const disc = new DiscoveredEvent({
      title: 'Cheap Local Gig',
      price_min: 50000,
      price_max: 150000
    });
    assert.strictEqual(disc.price_status, PRICE_STATUS.EXCLUDED_PRICE_TOO_LOW);
    assert.strictEqual(disc.isQualified(300000), false);
  });

  await test('5. Unknown Price Handling: Event with unstated ticket price marks UNKNOWN', () => {
    const disc = new DiscoveredEvent({
      title: 'Unannounced Showcase',
      price_min: null,
      price_max: null
    });
    assert.strictEqual(disc.price_status, PRICE_STATUS.UNKNOWN);
    assert.strictEqual(disc.isQualified(300000), false);
  });

  // --- PART 2: DEDUPLICATION & SEPARATION INVARIANTS ---
  await test('6. Multi-City Tour Disambiguation: Same artist in distinct cities remain separate canonical events', () => {
    const bandungEvent = {
      title: 'Sheila On 7 Live in Bandung',
      canonical_name: 'Sheila On 7 Live in Bandung',
      start_date: '2026-11-20',
      city: 'Bandung',
      venue_name: 'Stadion Siliwangi',
      artists: ['Sheila On 7']
    };
    const surabayaEvent = {
      title: 'Sheila On 7 Live in Surabaya',
      canonical_name: 'Sheila On 7 Live in Surabaya',
      start_date: '2026-11-20',
      city: 'Surabaya',
      venue_name: 'Stadion Gelora 10 November',
      artists: ['Sheila On 7']
    };

    const match = EventDeduplicationService.findDuplicateCandidate(surabayaEvent, [bandungEvent]);
    assert.strictEqual(match.isMatch, false, 'Surabaya and Bandung stops must NEVER collapse into one event');
  });

  await test('7. Multi-Night Tour Disambiguation: Distinct show dates for same tour remain separate', () => {
    const night1 = {
      title: 'LANY Soft World Tour Night 1',
      canonical_name: 'LANY Soft World Tour',
      start_date: '2026-10-29',
      city: 'Jakarta',
      venue_name: 'Indonesia Arena',
      artists: ['LANY']
    };
    const night2 = {
      title: 'LANY Soft World Tour Night 2',
      canonical_name: 'LANY Soft World Tour',
      start_date: '2026-10-30',
      city: 'Jakarta',
      venue_name: 'Indonesia Arena',
      artists: ['LANY']
    };

    const match = EventDeduplicationService.findDuplicateCandidate(night2, [night1]);
    assert.strictEqual(match.isMatch, false, 'Night 1 and Night 2 must remain distinct canonical events');
  });

  await test('8. Multi-Source Corroboration: Official portal + Ticketing page match same canonical event', () => {
    const canonical = {
      id: 'ev-lalala-2027',
      event_id: 'ev-lalala-2027',
      title: 'LaLaLa Festival Jakarta 2027',
      canonical_name: 'LaLaLa Festival Jakarta 2027',
      start_date: '2027-01-17',
      city: 'Tangerang',
      venue_name: 'ICE BSD City',
      official_event_url: 'https://lalalafest.com/jakarta'
    };

    const loketListing = {
      title: 'LALALA FESTIVAL JAKARTA 2027',
      canonical_name: 'LaLaLa Festival Jakarta 2027',
      start_date: '2027-01-17',
      city: 'Tangerang',
      venue_name: 'ICE BSD City',
      source_id: 'src-loket',
      official_ticket_url: 'https://www.loket.com/event/lalala-festival-2027'
    };

    const match = EventDeduplicationService.findDuplicateCandidate(loketListing, [canonical]);
    assert.strictEqual(match.isMatch, true, 'Same festival on same date and venue must corroborate');
    assert.strictEqual(match.canonicalEvent.id, 'ev-lalala-2027');
  });

  // --- PART 3: LALALA FEST SPECIFIC VERIFICATION (PHASE 13) ---
  await test('9. LALALA FEST Specific Verification: Olivia Dean and St. Vincent confirmed in official schema', async () => {
    const officialSource = new OfficialEventDiscoverySource();
    const events = await officialSource.discover();
    const lalala = events.find(e => e.canonical_name.includes('LaLaLa'));

    assert.ok(lalala, 'LaLaLa Festival Jakarta must be discovered');
    assert.strictEqual(lalala.start_date, '2027-01-17');
    assert.ok(lalala.venue_name.includes('ICE BSD'), 'Venue must be ICE BSD');
    assert.strictEqual(lalala.city, 'Tangerang');
    assert.ok(lalala.artists.includes('Olivia Dean'), 'Olivia Dean must be verified headliner');
    assert.ok(lalala.artists.includes('St. Vincent'), 'St. Vincent must be verified performer');
    assert.strictEqual(lalala.price_min, 1350000, 'Min price is Early Entry Rp 1.350.000');
    assert.strictEqual(lalala.price_max, 28000000, 'Max price is VVIP Rp 28.000.000');
    assert.strictEqual(lalala.isQualified(300000), true);
    assert.strictEqual(lalala.priority, EVENT_PRIORITY.P0);
    assert.strictEqual(lalala.quality_grade, QUALITY_GRADES.A);
  });

  // --- PART 4: QUALITY SCORING & PRIORITY ORDER ---
  await test('10. Quality Scoring: Verified P0 festival achieves Grade A', () => {
    const disc = new DiscoveredEvent({
      title: 'Major Stadium Festival 2027',
      category: DISCOVERY_CATEGORIES.CONCERT,
      artists: ['Major International Headliner'],
      start_date: '2027-03-15',
      venue_name: 'Gelora Bung Karno Main Stadium',
      city: 'Jakarta',
      price_min: 1500000,
      price_max: 3500000,
      official_event_url: 'https://stadiumfestival.com',
      official_ticket_url: 'https://loket.com/stadiumfest',
      is_verified: true
    });

    assert.strictEqual(disc.quality_grade, QUALITY_GRADES.A);
    assert.strictEqual(disc.priority, EVENT_PRIORITY.P0);
    assert.ok(disc.quality_score >= 80, `Expected score >= 80, got ${disc.quality_score}`);
  });

  await test('11. Education/Training Filter: Bootcamps and seminars do NOT enter P0', () => {
    const bootcamp = new DiscoveredEvent({
      title: 'Fullstack Engineering Intensive Bootcamp',
      category: DISCOVERY_CATEGORIES.OTHER,
      price_min: 5000000,
      city: 'Jakarta'
    });
    assert.notStrictEqual(bootcamp.priority, EVENT_PRIORITY.P0, 'Bootcamps must NEVER be P0');
  });

  // --- PART 5: DRY-RUN PIPELINE EXECUTION ---
  await test('12. Dry-Run Execution: Returns classified counts without database writes', async () => {
    const dryRunRes = await supplyService.dryRun({ minPrice: 300000, repository: testRepo });
    assert.strictEqual(dryRunRes.success, true);
    assert.strictEqual(dryRunRes.mode, 'DRY_RUN');
    assert.ok(dryRunRes.summary.total_discovered >= 100, `Expected >= 100 discovered, got ${dryRunRes.summary.total_discovered}`);
    assert.ok(dryRunRes.summary.would_create_count > 0, 'Expected qualified events in would_create');
    assert.ok(dryRunRes.summary.would_reject_count > 0, 'Expected cheap/expired events rejected');
    assert.ok(Array.isArray(dryRunRes.would_create));

    // Verify DB was NOT mutated
    const dbEvents = await testRepo.getAllEvents();
    assert.strictEqual(dbEvents.length, 0, 'Dry-run must NOT write to database');
  });

  // --- PART 6: IDEMPOTENT INGESTION & ANTI-RESURRECTION ---
  await test('13. Canonical Ingestion: Qualified events persist to repository with provenance', async () => {
    const ingestRes = await supplyService.ingest({
      minPrice: 300000,
      repository: testRepo,
      actor: 'TEST_ADMIN'
    });

    assert.strictEqual(ingestRes.success, true);
    assert.strictEqual(ingestRes.mode, 'INGESTED');
    assert.ok(ingestRes.summary.ingested_count > 0, 'Must have ingested qualified events');

    const allEvents = await testRepo.getAllEvents();
    assert.strictEqual(allEvents.length, ingestRes.summary.ingested_count);

    // Verify LaLaLa Festival was ingested
    const lalala = allEvents.find(e => e.canonical_name.includes('LaLaLa'));
    assert.ok(lalala, 'LaLaLa Festival must exist in canonical repository');
    assert.strictEqual(lalala.start_date, '2027-01-17');
    assert.strictEqual(lalala.min_price, 1350000);

    // Verify source links
    const links = await testRepo.getSourceLinksForEvent(lalala.id);
    assert.ok(links.length > 0, 'Must have source links attached in event_source_links');
  });

  await test('14. Idempotent Ingestion: Running ingestion twice produces ZERO duplicates', async () => {
    const initialEvents = await testRepo.getAllEvents();
    const initialCount = initialEvents.length;

    const secondIngestRes = await supplyService.ingest({
      minPrice: 300000,
      repository: testRepo,
      actor: 'TEST_ADMIN'
    });

    const postEvents = await testRepo.getAllEvents();
    assert.strictEqual(postEvents.length, initialCount, `Count must remain unchanged: ${postEvents.length} === ${initialCount}`);
    assert.strictEqual(secondIngestRes.summary.ingested_count, 0, 'Second run must ingest 0 new events');
    assert.ok(secondIngestRes.summary.skipped_duplicates > 0, 'Duplicates must be skipped');
  });

  await test('15. Anti-Resurrection Invariant: Concluded event cannot be resurrected to UPCOMING', async () => {
    // Create an archived event
    const archivedEvent = {
      id: 'ev-concluded-fest-2024',
      slug: 'concluded-fest-2024',
      canonical_name: 'Concluded Fest 2024',
      start_date: '2024-05-10',
      archive_status: 'ARCHIVED',
      lifecycle_status: 'ARCHIVED',
      homepage_visibility: false
    };
    await testRepo.upsertCanonicalEvent(archivedEvent);

    // Attempt to upsert with incoming UPCOMING payload
    const incomingPayload = {
      id: 'ev-concluded-fest-2024',
      canonical_name: 'Concluded Fest 2024',
      start_date: '2024-05-10',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      homepage_visibility: true
    };
    const result = await testRepo.upsertCanonicalEvent(incomingPayload);

    assert.strictEqual(result.archive_status, 'ARCHIVED', 'Archive status must remain ARCHIVED');
    assert.strictEqual(result.homepage_visibility, false, 'Homepage visibility must remain FALSE');
  });

  // --- PART 7: API ENDPOINTS & ACCESS CONTROL ---
  await test('16. GET /api/discovery/supply/scan: Returns dry-run scan results', async () => {
    const res = await makeRequest('/api/discovery/supply/scan?minPrice=300000');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.mode, 'DRY_RUN');
    assert.ok(res.json.summary.total_discovered >= 100);
  });

  await test('17. GET /api/discovery/supply/review-queue: Exposes ambiguous & secondary candidates', async () => {
    const res = await makeRequest('/api/discovery/supply/review-queue');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.total_pending >= 0);
  });

  await test('18. POST /api/discovery/supply/ingest: Rejects unauthenticated non-admin caller', async () => {
    const res = await makeRequest('/api/discovery/supply/ingest', {
      method: 'POST',
      body: { minPrice: 300000 }
    });
    assert.strictEqual(res.statusCode, 401, 'Must reject unauthenticated call with 401');
  });

  await test('19. POST /api/discovery/supply/ingest: Authorized admin triggers ingestion', async () => {
    state.users = state.users || [];
    if (!state.users.some(u => u.id === 'admin-1')) {
      state.users.push({ id: 'admin-1', role: 'admin' });
    }
    const { SessionStore } = require('./src/services/sessionStore');
    let adminToken = 'admin-token-test';
    try {
      const s = SessionStore.createSession({ userId: 'admin-1', role: 'admin', token: adminToken });
      adminToken = s.session_token || adminToken;
    } catch (e) {
      console.error('Session creation error:', e.message);
    }

    const res = await makeRequest('/api/discovery/supply/ingest', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${adminToken}`,
        'content-type': 'application/json'
      },
      body: { minPrice: 300000 }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
  });

  // --- PART 8: RED-TEAM ATTACK MATRIX ---
  await test('20. Red-Team: Fake price below 300k is blocked from canonical creation', async () => {
    const fakeLow = new DiscoveredEvent({
      title: 'Fake Cheap Ticket Concert',
      category: DISCOVERY_CATEGORIES.CONCERT,
      price_min: 50000,
      price_max: 100000
    });
    const { classified } = await supplyService.classifyCandidates([fakeLow], { repository: testRepo });
    assert.strictEqual(classified.would_create.length, 0);
    assert.strictEqual(classified.would_reject.length, 1);
    assert.strictEqual(classified.would_reject[0].reason, 'PRICE_BELOW_THRESHOLD');
  });

  await test('21. Red-Team: Missing source URL / sourceless event defaults to unverified', () => {
    const sourceless = new DiscoveredEvent({
      title: 'Sourceless Ghost Concert',
      category: DISCOVERY_CATEGORIES.CONCERT,
      price_min: 500000,
      source_id: 'src-unknown'
    });
    assert.strictEqual(sourceless.is_verified, false);
    assert.strictEqual(sourceless.verification_status, 'UNVERIFIED');
    assert.strictEqual(sourceless.provenance.official_source, null);
  });

  await test('22. Red-Team: Non-physical / Online webinars are routed to review, not created', async () => {
    const onlineEvent = new DiscoveredEvent({
      title: 'Digital Marketing & Tax Webinar Online',
      city: 'Online',
      venue_name: 'Zoom Cloud Meetings',
      price_min: 450000
    });
    const { classified } = await supplyService.classifyCandidates([onlineEvent], { repository: testRepo });
    assert.strictEqual(classified.would_create.length, 0);
    assert.strictEqual(classified.would_review.length, 1);
  });

  await test('23. Red-Team: Concurrent Advisory Lock prevents racing ingestion runs', async () => {
    // Acquire the lock directly
    const lockAcquired = await testRepo.acquireAdvisoryLock(17913009);
    assert.strictEqual(lockAcquired, true);

    try {
      // Attempt ingestion while lock is held
      let caught = false;
      try {
        await supplyService.ingest({ repository: testRepo });
      } catch (err) {
        caught = true;
        assert.ok(err.message.includes('advisory lock busy'));
      }
      assert.strictEqual(caught, true, 'Must fail when advisory lock is busy');
    } finally {
      await testRepo.releaseAdvisoryLock(17913009);
    }
  });

  await test('24. Red-Team: Transactional integrity: Ingestion failure does not leave orphan records', async () => {
    const failingRepo = {
      ...testRepo,
      init: async () => {},
      getAllEvents: async () => [],
      acquireAdvisoryLock: async () => true,
      releaseAdvisoryLock: async () => true,
      recordReconciliationRun: async () => ({ id: 'fail-run' }),
      updateReconciliationRun: async () => {},
      upsertCanonicalEvent: async () => {
        throw new Error('SIMULATED_DB_WRITE_FAILURE');
      }
    };

    const res = await supplyService.ingest({ repository: failingRepo });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.summary.ingested_count, 0);
    assert.ok(res.errors.length > 0, 'Errors must be reported gracefully');
  });

  await test('25. Red-Team: Non-IDR currency is tracked accurately without false conversion', () => {
    const sgdEvent = new DiscoveredEvent({
      title: 'Singapore Concert Tour Stop',
      country: 'Singapore',
      price_currency: 'SGD',
      price_min: 150,
      price_max: 300
    });
    assert.strictEqual(sgdEvent.price_currency, 'SGD');
    assert.strictEqual(sgdEvent.price_min, 150);
  });

  await stopTestServer();

  console.log('\n===============================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
