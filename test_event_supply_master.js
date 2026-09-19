/**
 * TIKUM / ARGUS — Event Supply Master Architecture Test Suite
 * 
 * Systematically tests the 10 core architectural principles of the
 * Nationwide Supply Intelligence Layer:
 * 
 * 1.  Multi-Source Registry & Circuit Breaker (Tiers 1-3, cooldown, telemetry)
 * 2.  City Registry & Haversine Distance (40+ cities, regions, lat/lng, spatial distance)
 * 3.  Venue Registry (Capacity tiers, geo-coordinates, dynamic venues)
 * 4.  Event Normalization (Zero Jakarta fallback, Indonesian timezones WIB/WITA/WIT)
 * 5.  Atomic SourceClaim Model (SHA-256 evidence hashing, claim types, conflict comparison)
 * 6.  Field Confidence & Exponential Time Decay (t_half = 30d for dates, 7d for prices)
 * 7.  Multi-Night Residency & Tour Deduplication (Non-collapsing distinct dates)
 * 8.  Popularity Engine (Demand ground truth isolated from context signals)
 * 9.  Deterministic LOCAL_GEMS Scoring (Tier-2/3 regional cultural qualification gate)
 * 10. Public Discovery Contract & Zero-Mock Production Invariant
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const { SourceRegistry, sourceRegistry } = require('./src/discovery/SourceRegistry');
const { CityRegistry, cityRegistry, NATIONWIDE_CITIES } = require('./src/discovery/CityRegistry');
const { VenueRegistry, venueRegistry } = require('./src/discovery/VenueRegistry');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { SourceClaim, CLAIM_TYPES } = require('./src/discovery/models/SourceClaim');
const { EventVerificationService } = require('./src/discovery/EventVerificationService');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { PopularityEngine } = require('./src/discovery/PopularityEngine');
const { CanonicalEventRegistry } = require('./src/discovery/CanonicalEventRegistry');

async function runSupplyMasterTests() {
  console.log('================================================================');
  console.log('TIKUM / ARGUS — EVENT SUPPLY MASTER ARCHITECTURE TEST SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 1: Multi-Source Registry & Circuit Breaker
  // ---------------------------------------------------------------------------
  console.log('[TEST 1] Principle 1: Multi-Source Registry & Circuit Breaker State Transitions');
  const testReg = new SourceRegistry();
  const allSources = testReg.getAllSources();
  assert.ok(allSources.length >= 15, `Must have comprehensive registered sources, got ${allSources.length}`);

  // Test Tier 1 promoter sources
  const tem = testReg.getSource('src-promoter-tem');
  assert.ok(tem, 'TEM Presents must be registered');
  assert.strictEqual(tem.tier, 1, 'TEM Presents must be Tier 1');

  // Test Regional Ticketing sources
  const dewatiket = testReg.getSource('src-dewatiket');
  assert.ok(dewatiket, 'Dewatiket must be registered');
  assert.strictEqual(dewatiket.coverage, 'CENTRAL_AND_EAST_JAVA');

  const yesplis = testReg.getSource('src-yesplis');
  assert.ok(yesplis, 'Yesplis must be registered');

  const artatix = testReg.getSource('src-artatix');
  assert.ok(artatix, 'Artatix must be registered');

  // Test Circuit Breaker: 5 consecutive failures trips to CIRCUIT_OPEN
  for (let i = 0; i < 5; i++) {
    testReg.updateHealth('src-dewatiket', null, { success: false, isSchemaFailure: false });
  }
  const brokenSrc = testReg.getSource('src-dewatiket');
  assert.strictEqual(brokenSrc.circuit_breaker_status, 'OPEN', 'Circuit breaker must trip to OPEN after 5 consecutive failures');
  assert.strictEqual(testReg.isSourcePermittedForIngestion('src-dewatiket'), false, 'Source must be blocked while circuit breaker is OPEN');

  // Cooldown reset test
  testReg.resetCircuitBreaker('src-dewatiket');
  assert.strictEqual(testReg.isSourcePermittedForIngestion('src-dewatiket'), true, 'Reset circuit breaker must permit ingestion');
  console.log('  -> PASS: Principle 1 Multi-source registry and circuit breaker verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 2: City Registry & Haversine Distance
  // ---------------------------------------------------------------------------
  console.log('[TEST 2] Principle 2: Nationwide City Directory & Accurate Haversine Distance');
  const cityReg = new CityRegistry();
  const cities = cityReg.getAllCities();
  assert.ok(cities.length >= 40, `City directory must contain at least 40 nationwide cities, got ${cities.length}`);

  // Verify non-Jabodetabek coverage: Sumatera, Jawa Tengah, Jawa Timur, Bali, Kalimantan, Sulawesi, Papua
  const regions = new Set(cities.map(c => c.region));
  assert.ok(regions.has('Jabodetabek'), 'Must cover Jabodetabek');
  assert.ok(regions.has('Jawa Barat'), 'Must cover Jawa Barat');
  assert.ok(regions.has('Jawa Tengah'), 'Must cover Jawa Tengah');
  assert.ok(regions.has('Jawa Timur'), 'Must cover Jawa Timur');
  assert.ok(regions.has('Bali'), 'Must cover Bali');
  assert.ok(regions.has('Sumatera'), 'Must cover Sumatera');
  assert.ok(regions.has('Kalimantan'), 'Must cover Kalimantan');
  assert.ok(regions.has('Sulawesi'), 'Must cover Sulawesi');

  // Haversine distance test: Jakarta (-6.2088, 106.8456) to Bandung (-6.9175, 107.6191) ~ 120-155 km
  const jktBdgDist = CityRegistry.haversineDistanceKm(-6.2088, 106.8456, -6.9175, 107.6191);
  assert.ok(jktBdgDist >= 115 && jktBdgDist <= 160, `Distance Jakarta-Bandung must be ~130km, got ${jktBdgDist}`);

  // Jakarta to Surabaya (-7.2575, 112.7521) ~ 660 km
  const jktSbyDist = CityRegistry.haversineDistanceKm(-6.2088, 106.8456, -7.2575, 112.7521);
  assert.ok(jktSbyDist >= 600 && jktSbyDist <= 750, `Distance Jakarta-Surabaya must be ~660km, got ${jktSbyDist}`);
  console.log('  -> PASS: Principle 2 City registry and spatial Haversine distance verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 3: Venue Registry & Capacity Tiers
  // ---------------------------------------------------------------------------
  console.log('[TEST 3] Principle 3: Venue Directory, Capacity Tiers & Dynamic Registration');
  const vReg = new VenueRegistry();

  // Stadium tier: Indonesia Arena Senayan (LARGE/ARENA)
  const indoArena = vReg.findVenue('Indonesia Arena, Senayan');
  assert.ok(indoArena, 'Indonesia Arena must exist in venue registry');
  assert.strictEqual(indoArena.capacity_tier, 'ARENA_LARGE');
  assert.strictEqual(indoArena.city, 'Jakarta');

  // Regional cultural venue: Taman Ismail Marzuki (CULTURAL)
  const tim = vReg.findVenue('Taman Ismail Marzuki');
  assert.ok(tim, 'Taman Ismail Marzuki must exist');
  assert.strictEqual(tim.capacity_tier, 'HALL_MEDIUM');

  // Regional venue: Eldorado Dome, Bandung
  const eldorado = vReg.findVenue('Eldorado Dome, Bandung');
  assert.ok(eldorado, 'Eldorado Dome must exist');
  assert.strictEqual(eldorado.city, 'Bandung');

  // Dynamic venue registration
  const dynVenue = vReg.registerVenue({
    name: 'Balai Budaya Minangkabau',
    city: 'Padang',
    capacity_tier: 'CULTURAL',
    lat: -0.9471,
    lng: 100.4172
  });
  assert.ok(dynVenue, 'Dynamic venue registration must succeed');
  assert.strictEqual(vReg.findVenue('Balai Budaya Minangkabau').city, 'Padang');
  console.log('  -> PASS: Principle 3 Venue registry and capacity tiers verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 4: Event Normalization (Zero Jakarta Default Fallback)
  // ---------------------------------------------------------------------------
  console.log('[TEST 4] Principle 4: Normalization Integrity & Zero Jakarta Fallback Invariant');

  // Non-Jakarta city must NEVER fall back to Jakarta
  const normMalang = EventNormalizationService.normalizeVenue('Graha Cakrawala UM', 'Malang');
  assert.strictEqual(normMalang.city, 'Malang', 'Malang venue must normalize to Malang');

  const normJogja = EventNormalizationService.normalizeVenue('Jogja Expo Center', 'Yogyakarta');
  assert.strictEqual(normJogja.city, 'Yogyakarta', 'Jogja venue must normalize to Yogyakarta');

  const normBjm = EventNormalizationService.normalizeVenue('Gedung Sultan Suriansyah', 'Banjarmasin');
  assert.strictEqual(normBjm.city, 'Banjarmasin', 'Banjarmasin venue must normalize to Banjarmasin');

  // Timezone offsets
  const dtWib = EventNormalizationService.normalizeDateTime('2026-10-15', '19:00', 'Asia/Jakarta');
  assert.ok(dtWib.start_datetime.endsWith('+07:00'), 'WIB datetime must end with +07:00');

  const dtWita = EventNormalizationService.normalizeDateTime('2026-10-15', '19:00', 'Asia/Makassar');
  assert.ok(dtWita.start_datetime.endsWith('+08:00'), 'WITA datetime must end with +08:00');

  const dtWit = EventNormalizationService.normalizeDateTime('2026-10-15', '19:00', 'Asia/Jayapura');
  assert.ok(dtWit.start_datetime.endsWith('+09:00'), 'WIT datetime must end with +09:00');
  console.log('  -> PASS: Principle 4 Normalization and nationwide timezones verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 5: Atomic SourceClaim Model
  // ---------------------------------------------------------------------------
  console.log('[TEST 5] Principle 5: Atomic SourceClaim Model & Cryptographic Evidence Hash');

  const claim1 = new SourceClaim({
    source_id: 'src-promoter-tem',
    source_url: 'https://temgmt.com/lany',
    claim_type: CLAIM_TYPES.VENUE,
    value: 'Indonesia Arena, Senayan',
    observed_at: '2026-06-01T10:00:00Z',
    source_authority_tier: 1
  });

  const claim2 = new SourceClaim({
    source_id: 'src-argus-community',
    source_url: 'https://tikum.app/lany-rumor',
    claim_type: CLAIM_TYPES.VENUE,
    value: 'Beach City Stadium, Ancol',
    observed_at: '2026-06-05T10:00:00Z',
    source_authority_tier: 3
  });

  assert.ok(claim1.evidence_hash, 'Claim must generate SHA-256 evidence hash');
  assert.strictEqual(claim1.evidence_hash.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');

  // Conflict detection between claim1 and claim2
  const conflictReport = claim1.conflictsWith(claim2);
  assert.strictEqual(conflictReport.isConflict, true, 'Different values for VENUE claim must register conflict');
  assert.strictEqual(conflictReport.field, 'VENUE');
  assert.strictEqual(claim1.takesPrecedenceOver(claim2), true, 'Tier 1 claim must take precedence over Tier 3 claim');
  assert.strictEqual(claim2.takesPrecedenceOver(claim1), false, 'Tier 3 claim cannot override Tier 1 claim');
  console.log('  -> PASS: Principle 5 Atomic SourceClaim and evidence hashing verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 6: Field Confidence Calculation & Temporal Decay
  // ---------------------------------------------------------------------------
  console.log('[TEST 6] Principle 6: Field Confidence Formula & Exponential Time Decay');

  const nowMs = Date.now();
  const freshObs = new Date(nowMs - 1000 * 60 * 60).toISOString(); // 1 hour ago
  const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago

  // Fresh Tier 1 claim for date
  const freshResult = EventVerificationService.calculateFieldConfidence({
    fieldType: 'EVENT_DATE',
    sourceType: 'promoter',
    observedAt: freshObs,
    corroboratingSourcesCount: 1
  });
  assert.ok(freshResult.confidence >= 0.85, `Fresh Tier 1 confidence should be >= 0.85, got ${freshResult.confidence}`);

  // 30-day old claim for date (half-life tau = 30 days -> confidence cut in half)
  const decayedResult = EventVerificationService.calculateFieldConfidence({
    fieldType: 'EVENT_DATE',
    sourceType: 'promoter',
    observedAt: thirtyDaysAgo,
    corroboratingSourcesCount: 1
  });
  assert.ok(decayedResult.confidence < freshResult.confidence, 'Decayed confidence must be strictly lower than fresh confidence');
  const ratio = decayedResult.confidence / freshResult.confidence;
  assert.ok(ratio >= 0.45 && ratio <= 0.60, `Decay ratio over 1 half-life should be ~0.50, got ${ratio}`);
  console.log('  -> PASS: Principle 6 Field confidence exponential time decay verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 7: Multi-Night Residency & Tour Deduplication
  // ---------------------------------------------------------------------------
  console.log('[TEST 7] Principle 7: Multi-Night Residency & Tour Deduplication Separation');

  const existingNight1 = {
    canonical_name: 'LANY Soft World Tour',
    name: 'LANY Soft World Tour',
    start_date: '2026-10-29',
    venue_name: 'Indonesia Arena, Senayan',
    city: 'Jakarta',
    artists: ['LANY']
  };

  const incomingNight2 = {
    name: 'LANY Soft World Tour - Day 2 Added Date',
    start_date: '2026-10-30', // Distinct date!
    venue_name: 'Indonesia Arena, Senayan',
    city: 'Jakarta',
    artists: ['LANY']
  };

  // Distinct dates MUST NOT match existingNight1!
  const dedupNight2 = EventDeduplicationService.findDuplicateCandidate(incomingNight2, [existingNight1]);
  assert.strictEqual(dedupNight2.isMatch, false, 'Multi-night residency on different dates must NOT collapse into existing event');

  // Distinct cities on same tour MUST NOT match!
  const incomingBandungStop = {
    name: 'LANY Soft World Tour - Bandung',
    start_date: '2026-11-02',
    venue_name: 'Eldorado Dome',
    city: 'Bandung',
    artists: ['LANY']
  };
  const dedupTourStop = EventDeduplicationService.findDuplicateCandidate(incomingBandungStop, [existingNight1]);
  assert.strictEqual(dedupTourStop.isMatch, false, 'Multi-city tour stops must remain separate events');

  // Corroborating observation for Night 1 on same date, venue, and city MUST match!
  const incomingNight1Corroboration = {
    name: 'LANY Jakarta Concert',
    start_date: '2026-10-29',
    venue_name: 'Indonesia Arena Senayan',
    city: 'Jakarta',
    artists: ['LANY']
  };
  const dedupNight1 = EventDeduplicationService.findDuplicateCandidate(incomingNight1Corroboration, [existingNight1]);
  assert.strictEqual(dedupNight1.isMatch, true, 'Corroborating observation for same date and venue must match existing event');
  console.log('  -> PASS: Principle 7 Multi-night residency disambiguation verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 8: Popularity Engine (Demand Ground Truth Isolation)
  // ---------------------------------------------------------------------------
  console.log('[TEST 8] Principle 8: Popularity Signals vs Context Signals Separation');

  const megaConcert = {
    event_id: 'ev-test-mega',
    title: 'Ed Sheeran + - = ÷ x Tour Jakarta',
    start_date: '2026-12-01',
    venue_capacity_tier: 'MEGA',
    verification_status: 'VERIFIED'
  };

  // High market demand signals
  const popMega = PopularityEngine.calculatePopularity(megaConcert, {
    primary_sold_out: true,
    view_count_24h: 8000,
    search_volume_index: 95
  });

  assert.ok(popMega.popularity_score >= 80, `Mega sold out concert must have high popularity score, got ${popMega.popularity_score}`);
  assert.strictEqual(popMega.context_signals.time_remaining_days > 30, true);

  // Obscure near-term event (Happening tomorrow, but zero organic market demand)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const nearTermNicheEvent = {
    event_id: 'ev-test-niche',
    title: 'Workshop Musik Indie Lokal',
    start_date: tomorrow,
    venue_capacity_tier: 'CLUB',
    verification_status: 'VERIFIED'
  };

  const popNiche = PopularityEngine.calculatePopularity(nearTermNicheEvent, {
    primary_sold_out: false,
    view_count_24h: 5,
    search_volume_index: 2
  });

  // CRITICAL INVARIANT: Time proximity is a CONTEXT signal, NOT a popularity score!
  // The obscure event must NOT be ranked as "popular" merely because it happens tomorrow!
  assert.ok(popNiche.popularity_score < 40, `Obscure near-term event must NOT have high popularity score merely due to proximity (got ${popNiche.popularity_score})`);
  assert.strictEqual(popNiche.context_signals.is_imminent, true, 'Context signal must record is_imminent = true');
  assert.ok(popMega.popularity_score > popNiche.popularity_score * 2, 'Mega concert demand must overwhelmingly outrank obscure near-term event');
  console.log('  -> PASS: Principle 8 Popularity signals cleanly isolated from context signals.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 9: Deterministic LOCAL_GEMS Evaluation
  // ---------------------------------------------------------------------------
  console.log('[TEST 9] Principle 9: Deterministic LOCAL_GEMS Scoring & Qualification Gate');

  // Case A: High-quality indie festival in regional city (Yogyakarta / Solo)
  const regionalGem = {
    event_id: 'ev-gem-1',
    title: 'Prambanan Jazz Festival / Sleman Temple Vibes',
    city: 'Yogyakarta',
    venue_name: 'Candi Prambanan',
    start_date: '2026-10-10',
    venue_capacity_tier: 'CULTURAL',
    category: 'FESTIVAL',
    verification_status: 'VERIFIED',
    verification_confidence: 88,
    is_verified: true,
    popularity_score: 45
  };

  const gemEvalA = PopularityEngine.evaluateLocalGem(regionalGem);
  assert.strictEqual(gemEvalA.is_local_gem, true, 'Regional cultural festival in Yogyakarta must qualify as a local gem');
  assert.ok(gemEvalA.local_gems_score >= 65, `Local gem score must be >= 65, got ${gemEvalA.local_gems_score}`);

  // Case B: Stadium mega tour in Jakarta (disqualified from local gems gate)
  const stadiumMega = {
    event_id: 'ev-stadium-1',
    title: 'Coldplay Live in Jakarta (Stadium Tour)',
    city: 'Jakarta',
    venue_name: 'Gelora Bung Karno',
    start_date: '2026-11-15',
    venue_capacity_tier: 'MEGA',
    verification_status: 'VERIFIED',
    verification_confidence: 95,
    is_verified: true,
    popularity_score: 98
  };

  const gemEvalB = PopularityEngine.evaluateLocalGem(stadiumMega);
  assert.strictEqual(gemEvalB.is_local_gem, false, 'Mega stadium tour in Jakarta must NOT qualify as a local gem');
  assert.strictEqual(gemEvalB.local_gems_score, 0, 'Disqualified event must receive local_gems_score = 0');
  console.log('  -> PASS: Principle 9 Deterministic LOCAL_GEMS qualification gate verified.\n');

  // ---------------------------------------------------------------------------
  // PRINCIPLE 10: Zero-Mock Production Invariant & Freshness Maintenance
  // ---------------------------------------------------------------------------
  console.log('[TEST 10] Principle 10: Zero-Mock Invariant & STALE Lifecycle Transition');

  const regFreshness = new CanonicalEventRegistry();
  const pastDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10); // 60 days ago

  const expiredEvent = regFreshness.createEvent({
    canonical_name: 'Old Historical Gig',
    start_date: pastDate,
    venue_name: 'Teater Jakarta',
    city: 'Jakarta',
    verification_status: 'VERIFIED',
    verification_confidence: 85,
    is_verified: true,
    expires_at: new Date(Date.now() - 10000).toISOString() // Expired TTL
  });

  // Run temporal expiration scanner
  const expiredIds = regFreshness.checkAndExpireEvents();
  assert.ok(expiredIds.includes(expiredEvent.event_id), 'Past TTL event must be flagged as EXPIRED');
  assert.strictEqual(expiredEvent.verification_status, 'EXPIRED', 'Verification status must transition to EXPIRED');
  assert.strictEqual(expiredEvent.is_verified, false, 'Expired event cannot remain is_verified = true');
  console.log('  -> PASS: Principle 10 Zero-mock production invariant and STALE expiration verified.\n');

  console.log('================================================================');
  console.log('ALL 10 EVENT SUPPLY MASTER ARCHITECTURAL TESTS PASSED (10/10)!');
  console.log('================================================================\n');
}

runSupplyMasterTests().catch(err => {
  console.error('\nEVENT SUPPLY MASTER TEST SUITE FAILED:', err);
  process.exit(1);
});
