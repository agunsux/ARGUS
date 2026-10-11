const assert = require('assert');
const { ingestionScheduler } = require('./src/discovery/EventIngestionScheduler');
const { EventTemporalLifecycleEngine } = require('./src/discovery/EventTemporalLifecycleEngine');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { DiscoveredEvent } = require('./src/discovery/models/DiscoveredEvent');
const { getCatalogRepository } = require('./src/discovery/repository');

async function runTests() {
  console.log('=== TEST SUITE: CHUNKED INGESTION, PRICE_PARTIAL & STALENESS GATE ===\n');

  // Test 1: S1 Tier Normalization
  console.log('[Test 1] S1 Price Tier Normalization:');
  const tiers1 = EventNormalizationService.normalizePriceTiers(
    [{ name: 'Cat 1 VIP', price: 1500000 }, { name: 'Cat 2 GA', price: 750000 }],
    750000,
    1500000
  );
  assert.strictEqual(tiers1.length, 2, 'Should normalize 2 tiers');
  assert.strictEqual(tiers1[0].name, 'Cat 1 VIP');
  assert.strictEqual(tiers1[0].price, 1500000);
  assert.strictEqual(tiers1[0].seating_type, 'ASSIGNED_SEATING');

  const tiersFallback = EventNormalizationService.normalizePriceTiers([], 450000, 1200000);
  assert.strictEqual(tiersFallback.length, 2, 'Should create 2 fallback tiers for range');
  assert.strictEqual(tiersFallback[0].price, 450000);
  assert.strictEqual(tiersFallback[1].price, 1200000);
  console.log('  -> PASS');

  // Test 2: S2 Seating and Map Normalization
  console.log('\n[Test 2] S2 Seating & Map Normalization:');
  const s2Seating = EventNormalizationService.normalizeSeatingAndMap(
    { capacity_tier: 'ARENA_LARGE' },
    { seating_type: 'ASSIGNED_SEATING', seat_map_url: 'https://example.com/map.png' }
  );
  assert.strictEqual(s2Seating.seating_type, 'ASSIGNED_SEATING');
  assert.strictEqual(s2Seating.seat_map_url, 'https://example.com/map.png');

  const s2Stadium = EventNormalizationService.normalizeSeatingAndMap(
    { capacity_tier: 'STADIUM_MEGA' },
    {}
  );
  assert.strictEqual(s2Stadium.seating_type, 'MIXED', 'Stadium mega defaults to mixed seating');
  console.log('  -> PASS');

  // Test 3: PRICE_PARTIAL Lifecycle State
  console.log('\n[Test 3] PRICE_PARTIAL Starting Price Trap Detection:');
  const partialEvent = canonicalRegistry.createEvent({
    name: 'Jakarta Indie Fest 2027',
    category: 'FESTIVAL',
    start_date: '2027-04-15',
    venue_name: 'GBK Senayan',
    city: 'Jakarta',
    min_price: 250000, // Starts at 250k ("Mulai Dari")
    source_id: 'src-loket'
  });
  assert.strictEqual(partialEvent.price_status, 'PRICE_PARTIAL', 'Should be tagged PRICE_PARTIAL');
  assert.strictEqual(partialEvent.tier_enrichment_needed, true, 'Should flag tier_enrichment_needed');
  assert.strictEqual(partialEvent.meets_price_threshold, true, 'Should tentatively qualify for audit priority');

  const highValEvent = canonicalRegistry.createEvent({
    name: 'Super Arena Show 2027',
    category: 'CONCERT',
    start_date: '2027-05-20',
    venue_name: 'Indonesia Arena',
    city: 'Jakarta',
    min_price: 1500000,
    source_id: 'src-loket'
  });
  assert.strictEqual(highValEvent.price_status, 'QUALIFIED', 'High value event should be QUALIFIED');
  assert.strictEqual(highValEvent.meets_price_threshold, true);
  console.log('  -> PASS');

  // Test 4: DiscoveredEvent Model PRICE_PARTIAL
  console.log('\n[Test 4] DiscoveredEvent Domain Model PRICE_PARTIAL:');
  const disc = new DiscoveredEvent({
    title: 'Standup Comedy Tour',
    category: 'COMEDY',
    price_min: 250000,
    price_max: 250000
  });
  assert.strictEqual(disc.price_status, 'PRICE_PARTIAL');
  assert.strictEqual(disc.isQualified(), true, 'Should be qualified under partial tier expectation');
  console.log('  -> PASS');

  // Test 5: Staleness Gate for Imminent Events (T <= 7 Days)
  console.log('\n[Test 5] Staleness Gate Predicate:');
  const now = new Date('2026-10-15T12:00:00Z');
  
  // Event 3 days in the future, verified 10 hours ago -> FRESH
  const freshEvent = {
    start_date: '2026-10-18',
    event_start_at: '2026-10-18T19:00:00+07:00',
    event_end_at: '2026-10-18T23:00:00+07:00',
    verified_at: new Date('2026-10-15T02:00:00Z').toISOString(),
    status: 'UPCOMING'
  };
  assert.strictEqual(EventTemporalLifecycleEngine.isEventStaleForTrading(freshEvent, now), false, 'Fresh event should not be stale');
  assert.strictEqual(EventTemporalLifecycleEngine.isEventEligibleForTrading(freshEvent, now).eligible, true);

  // Event 3 days in the future, verified 72 hours ago -> STALE
  const staleEvent = {
    start_date: '2026-10-18',
    event_start_at: '2026-10-18T19:00:00+07:00',
    event_end_at: '2026-10-18T23:00:00+07:00',
    verified_at: new Date('2026-10-12T00:00:00Z').toISOString(),
    status: 'UPCOMING'
  };
  assert.strictEqual(EventTemporalLifecycleEngine.isEventStaleForTrading(staleEvent, now), true, '72h unverified imminent event should be stale');
  const staleCheck = EventTemporalLifecycleEngine.isEventEligibleForTrading(staleEvent, now);
  assert.strictEqual(staleCheck.eligible, false);
  assert.strictEqual(staleCheck.reason, 'EVENT_VERIFICATION_STALE');

  // Cancelled event -> NOT ELIGIBLE
  const cancelledEvent = {
    start_date: '2026-10-25',
    status: 'CANCELLED'
  };
  assert.strictEqual(EventTemporalLifecycleEngine.isEventEligibleForTrading(cancelledEvent, now).eligible, false);
  assert.strictEqual(EventTemporalLifecycleEngine.isEventEligibleForTrading(cancelledEvent, now).reason, 'EVENT_CANCELLED');
  console.log('  -> PASS');

  // Test 6: Chunked Ingestion Worker & Advisory Lock
  console.log('\n[Test 6] Chunked Ingestion Execution:');
  const chunkResult = await ingestionScheduler.runChunkedDiscoveryJob({ batchSize: 3, timeBudgetMs: 5000 });
  assert.strictEqual(chunkResult.status, 'SUCCESS', 'Chunked sync should succeed');
  assert.strictEqual(chunkResult.batch_size, 3, 'Batch size should be 3');
  assert.strictEqual(chunkResult.sources_polled.length, 3, 'Should poll 3 sources');
  console.log(`  - Sources polled in chunk: ${chunkResult.sources_polled.join(', ')}`);
  console.log(`  - Next cursor index: ${chunkResult.cursor_next}`);
  console.log('  -> PASS');

  // Test 7: Advisory Lock Concurrency Safety
  console.log('\n[Test 7] Advisory Lock Concurrency Defense:');
  const repo = getCatalogRepository();
  const lockAcquired = await repo.acquireAdvisoryLock(17913009);
  assert.strictEqual(lockAcquired, true, 'Primary lock acquired');

  // Attempt second job while lock is held
  const concurrentResult = await ingestionScheduler.runChunkedDiscoveryJob({ batchSize: 2 });
  assert.strictEqual(concurrentResult.status, 'LOCKED', 'Concurrent worker must be rejected with LOCKED status');
  assert.strictEqual(concurrentResult.code, 'LOCK_BUSY');

  // Release lock
  await repo.releaseAdvisoryLock(17913009);
  console.log('  -> PASS');

  console.log('\n=== ALL 7 TESTS PASSED SUCCESSFULLY! ===');
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
