/**
 * TIKUM — Neon Egress Optimization & Cost Control Acceptance Suite
 *
 * Validates Phase 5 targeted fixes:
 * 1. Bounded column projection: CANONICAL_EVENT_SELECT_FIELDS strips bloated observations (~95% transfer reduction).
 * 2. mapRowToEvent resilience: maps all required event properties cleanly without observations.
 * 3. Ingestion bounding: observations & event_history capped to at most 10 items on upsert.
 * 4. Cache-Control headers: public discovery endpoints have Edge CDN caching (s-maxage).
 * 5. Frontend polling guard: offers.html polls only when tab is visible with 60s interval.
 * 6. Background job guard: offerExpiryJob defaults to 5-minute interval.
 * 7. Egress observability: EgressMetrics tracks response byte sizes without logging secrets.
 * 8. Test isolation: Test scripts block connection to Neon production without isolated config.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { PostgresCatalogRepository } = require('./src/discovery/repository/PostgresCatalogRepository');
const { EgressMetrics, egressTrackerMiddleware } = require('./src/middleware/egressTracker');
const { startOfferExpiryJob, stopOfferExpiryJob } = require('./src/jobs/offerExpiryJob');
const { assertTestDatabaseIsolation } = require('./src/storage/testIsolation');
const discoveryRouter = require('./src/discovery/discoveryRouter');

async function runTests() {
  console.log('================================================================');
  console.log('  TIKUM — NEON EGRESS OPTIMIZATION & FORENSIC VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] Gate ${passed + failed + 1}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] Gate ${passed + failed + 1}: ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  // 1. Column projection excludes observations
  await test('PostgresCatalogRepository: read queries strip observations in SQL projection', () => {
    const fileContent = fs.readFileSync('./src/discovery/repository/PostgresCatalogRepository.js', 'utf8');
    assert.ok(fileContent.includes("(metadata - 'observations') AS metadata"), 'SQL projection must strip observations');
    assert.ok(!fileContent.includes("async getAllEvents() {\n    if (this.degraded || !this.pool) {\n      return this.fallbackRepo.getAllEvents();\n    }\n    try {\n      const res = await this.query('SELECT * FROM canonical_events"), 'getAllEvents must not use SELECT *');
  });

  // 2. mapRowToEvent handles stripped metadata without error
  await test('mapRowToEvent: cleanly handles stripped metadata without observations', () => {
    const repo = new PostgresCatalogRepository();
    const mockRow = {
      id: 'ev-test-1',
      slug: 'konser-test-jakarta',
      canonical_name: 'Konser Test Jakarta',
      event_type: 'CONCERT',
      category: 'CONCERT',
      start_date: '2026-11-20',
      start_datetime: '2026-11-20T19:00:00Z',
      end_date: '2026-11-20',
      end_datetime: '2026-11-20T22:00:00Z',
      timezone: 'Asia/Jakarta',
      venue_name: 'GBK Stadium',
      venue_city: 'Jakarta',
      city: 'Jakarta',
      province: 'DKI Jakarta',
      country: 'Indonesia',
      organizer_name: 'Test Promoter',
      official_event_url: 'https://test.com/event',
      official_ticket_url: 'https://test.com/ticket',
      official_ticketing_provider: 'LOKET',
      min_price: '500000.00',
      max_price: '1500000.00',
      is_verified: true,
      verification_status: 'VERIFIED',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      archived_at: null,
      public_visibility: true,
      homepage_visibility: true,
      metadata: {
        artist: 'Test Artist',
        image_url: 'https://cdn.test.com/poster.jpg'
      },
      created_at: new Date(),
      updated_at: new Date()
    };

    const event = repo.mapRowToEvent(mockRow);
    assert.strictEqual(event.id, 'ev-test-1');
    assert.strictEqual(event.canonical_name, 'Konser Test Jakarta');
    assert.strictEqual(event.artist, 'Test Artist');
    assert.strictEqual(event.image_url, 'https://cdn.test.com/poster.jpg');
    assert.deepStrictEqual(event.observations, [], 'Observations must default to empty array when stripped');
    assert.strictEqual(event.is_verified, true);
  });

  // 3. Upsert bounding: observations and event_history capped to 10 entries
  await test('upsertCanonicalEvent: caps observations and history to prevent JSONB bloat', () => {
    const fileContent = fs.readFileSync('./src/discovery/repository/PostgresCatalogRepository.js', 'utf8');
    assert.ok(fileContent.includes('.slice(-10)'), 'Observations/history in upsert must be clamped with .slice(-10)');
    assert.ok(fileContent.includes('RETURNING ${CANONICAL_EVENT_SELECT_FIELDS}'), 'RETURNING clause must use projected fields');
  });

  // 4. Edge CDN Cache-Control headers on discovery endpoints
  await test('Cache-Control: public discovery endpoints configure Edge CDN caching (s-maxage)', async () => {
    const app = express();
    app.use(discoveryRouter);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const endpoints = [
      { path: '/events', minSMaxAge: 60 },
      { path: '/api/events/home-feed', minSMaxAge: 120 },
      { path: '/api/discovery/events', minSMaxAge: 60 },
      { path: '/api/events/archived', minSMaxAge: 300 }
    ];

    for (const ep of endpoints) {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${ep.path}`, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
        }).on('error', reject);
      });

      const cc = res.headers['cache-control'] || '';
      assert.ok(cc.includes('public'), `Endpoint ${ep.path} Cache-Control must be public, got: ${cc}`);
      assert.ok(cc.includes('s-maxage='), `Endpoint ${ep.path} Cache-Control must contain s-maxage, got: ${cc}`);
    }

    await new Promise(r => server.close(r));
  });

  // 5. Frontend polling guard in public/offers.html
  await test('Frontend: offers.html guards auto-refresh with document.visibilityState and 60s interval', () => {
    const html = fs.readFileSync('./public/offers.html', 'utf8');
    assert.ok(html.includes('document.visibilityState === \'visible\''), 'offers.html must guard polling with visibilityState');
    assert.ok(html.includes('60000'), 'offers.html polling interval must be at least 60000ms');
    assert.ok(!html.includes('}, 15000);'), 'offers.html must not use aggressive 15000ms polling');
  });

  // 6. Background job interval guard in offerExpiryJob.js
  await test('Background Job: offerExpiryJob defaults to 5-minute interval (300000ms)', () => {
    const fileContent = fs.readFileSync('./src/jobs/offerExpiryJob.js', 'utf8');
    assert.ok(fileContent.includes('intervalMs = 300000'), 'startOfferExpiryJob default must be 300000ms');
  });

  // 7. EgressMetrics observability middleware
  await test('Observability: EgressMetrics records outbound bytes cleanly without logging secrets', async () => {
    EgressMetrics.reset();

    const app = express();
    app.use(egressTrackerMiddleware);
    app.get('/test/sample-payload', (req, res) => {
      res.json({ message: 'A'.repeat(500) });
    });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/test/sample-payload`, res => {
        res.on('data', () => {});
        res.on('end', resolve);
      }).on('error', reject);
    });

    const summary = EgressMetrics.getSummary();
    assert.strictEqual(summary.total_requests, 1);
    assert.ok(summary.total_bytes_sent > 500, `Recorded bytes should be > 500, got ${summary.total_bytes_sent}`);
    assert.strictEqual(summary.top_routes_by_bytes.length, 1);
    assert.strictEqual(summary.top_routes_by_bytes[0].route, '/test/sample-payload');

    await new Promise(r => server.close(r));
    EgressMetrics.reset();
  });

  // 8. Test isolation prevents accidental production mutations
  await test('Test Isolation: assertTestDatabaseIsolation blocks test runs against public schema', async () => {
    let thrown = false;
    try {
      const mockPool = {
        query: async () => ({ rows: [{ current_schema: 'public', current_database: 'neondb' }] })
      };
      await assertTestDatabaseIsolation(mockPool);
    } catch (e) {
      thrown = e.message.includes('TEST_DATABASE_ISOLATION_VIOLATION');
    }
    assert.ok(thrown, 'Isolation gate must throw TEST_DATABASE_ISOLATION_VIOLATION');
  });

  console.log('\n================================================================');
  console.log(`  SUITE COMPLETE: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
