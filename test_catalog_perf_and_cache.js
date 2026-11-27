'use strict';
process.env.NODE_ENV = 'test';
delete process.env.TEST_DATABASE_URL;

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const express = require('express');
const { PostgresCatalogRepository } = require('./src/discovery/repository/PostgresCatalogRepository');
const { setCatalogRepository } = require('./src/discovery/repository');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ensureCatalogHydrated } = require('./src/discovery/ensureCatalogHydrated');
const { CatalogReadCache } = require('./src/discovery/CatalogReadCache');
const { state } = require('./src/database');

(async () => {
  let now = Date.parse('2026-11-28T23:59:59+07:00');
  const repo = new PostgresCatalogRepository({ skipMigrations: true });
  repo.catalogReads.clock = () => now;
  repo.initialized = true;
  let fetches = 0;
  const date = '2026-11-28';
  const active = { id: 'cache-active', slug: 'cache-active', canonical_name: 'Verified Cache Arena Showcase', start_date: date,
    city: 'Jakarta', venue_name: 'Cache Test Arena', category: 'CONCERT', min_price: 600000, lowest_official_price: 600000,
    lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: true, is_verified: true,
    verification_status: 'PRIMARY_SOURCE_VERIFIED', official_event_url: 'https://example.com/cache',
    metadata: { status: 'UPCOMING', evidence_hash: 'offline-fixture', verified_at: '2026-11-27T01:00:00Z' } };
  let rows = [active, { ...active, id: 'cache-merged', slug: 'cache-merged', metadata: { ...active.metadata, merged_into: active.id } },
    { ...active, id: 'cache-archived', slug: 'cache-archived', archive_status: 'ARCHIVED' }];
  repo.pool = { query: async sql => {
    if (/^SELECT /.test(sql)) { fetches++; await new Promise(r => setTimeout(r, 25)); return { rows }; }
    assert.match(sql.trim(), /^UPDATE canonical_events/);
    rows = rows.map(row => ({ ...row, archive_status: 'ARCHIVED', lifecycle_status: 'PAST' }));
    return { rows };
  } };
  setCatalogRepository(repo);
  canonicalRegistry.reset();
  const cold = performance.now();
  await Promise.all([ensureCatalogHydrated(), ensureCatalogHydrated(), repo.getAllEvents()]);
  const coldMs = performance.now() - cold;
  assert.equal(fetches, 1);
  const warm = performance.now();
  const copy = await repo.getAllEvents();
  const warmMs = performance.now() - warm;
  copy[0].archive_status = 'ARCHIVED';
  assert.equal((await repo.getAllEvents())[0].archive_status, 'ACTIVE');
  assert.equal(fetches, 1);

  const app = express();
  app.use('/api/mvp', require('./src/api/mvpRouter'));
  app.use(require('./src/discovery/discoveryRouter'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    canonicalRegistry.syncToState(state.events);
    const get = async route => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}?now=2026-11-28T00%3A00%3A00%2B07%3A00`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      return response.json();
    };
    const assertNoLeaks = body => assert.doesNotMatch(JSON.stringify(body), /cache-(?:merged|archived)|merged_into/);
    assertNoLeaks(await get('/api/events/home-feed'));
    for (let i = 0; i < 2; i++) {
      const dropdown = await get('/api/mvp/events');
      assertNoLeaks(dropdown);
      assert(dropdown.events.some(event => event.id === active.id));
    }
  } finally { await new Promise(resolve => server.close(resolve)); }

  now += 1000;
  await repo.getAllEvents();
  assert.equal(fetches, 2, 'WIB midnight must bypass TTL');
  await repo.archivePastEvents({ todayWib: '2026-11-29' });
  assert.equal((await repo.getAllEvents())[0].archive_status, 'ARCHIVED');
  assert.equal(fetches, 3, 'archive must clear the cache');
  now += 30000;
  await repo.getAllEvents();
  assert.equal(fetches, 4, 'TTL expiry must re-fetch');
  let releaseOldRead;
  const oldRead = new Promise(resolve => { releaseOldRead = resolve; });
  let calls = 0;
  const racing = new CatalogReadCache(() => ++calls === 1 ? oldRead : 'archived');
  const pending = racing.get();
  racing.invalidate();
  assert.equal(await racing.get(), 'archived');
  releaseOldRead('stale');
  assert.equal(await pending, 'archived', 'an invalidated in-flight read must not publish stale rows');
  console.log(`Offline PG double: single flight, rollover, archive, TTL and warm HTTP integrity PASS; cold ${coldMs.toFixed(2)} ms, warm ${warmMs.toFixed(2)} ms (25 ms simulated read)`);
})().catch(error => { console.error(error); process.exitCode = 1; });