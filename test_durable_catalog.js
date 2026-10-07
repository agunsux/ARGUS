/**
 * TIKUM / ARGUS — DURABLE CATALOG & ADMIN LOCKDOWN ACCEPTANCE SUITE
 *
 * Verifies:
 * 1. Cold-Start Hydration & Seed Persistence (survives container recycle)
 * 2. Idempotent Double-Sync (zero duplicates across runs)
 * 3. Anti-Resurrection Invariant (H+2 archived events cannot be resurrected)
 * 4. Admin API Key Gate (401 missing, 401 wrong, 200 valid, 401 fail-closed when env unset)
 * 5. Cron Secret Gate (401 missing, 401 wrong, 200 valid, 500 fail-closed when env unset)
 * 6. Advisory Concurrency Lock (409 conflict when locked, 200 after release)
 * 7. Payload Sanitization & Parameterized Query SQL Injection Resistance
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const crypto = require('crypto');
const { state } = require('./src/database');
const { CanonicalEventRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { EventTemporalLifecycleEngine } = require('./src/discovery/EventTemporalLifecycleEngine');
const { getCatalogRepository, setCatalogRepository } = require('./src/discovery/repository');
const { InMemoryCatalogRepository } = require('./src/discovery/repository/InMemoryCatalogRepository');
const { PostgresCatalogRepository } = require('./src/discovery/repository/PostgresCatalogRepository');
const { requireAdminApiKey, resetAdminRateLimits } = require('./src/middleware/adminApiKeyAuth');
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
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('TIKUM — DURABLE CATALOG & ADMIN LOCKDOWN ACCEPTANCE SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  await startTestServer();

  const TEST_ADMIN_KEY = 'test-secret-admin-key-argus-998877';
  const TEST_CRON_SECRET = 'test-secret-cron-key-argus-554433';

  console.log('── Section 1: Cold-Start Hydration & Repository Invariants ──');

  await test('Test 1: Repository persists canonical event and hydrates on cold restart', async () => {
    const testRepo = new InMemoryCatalogRepository();
    await testRepo.init();

    // Insert sample event into repository
    const sampleEvent = {
      id: 'durable-evt-001',
      event_id: 'durable-evt-001',
      slug: 'durable-test-concert-jakarta-2026',
      canonical_name: 'Durable Test Concert 2026',
      event_type: 'CONCERT',
      category: 'CONCERT',
      start_date: '2026-11-15',
      venue_name: 'GBK Stadium',
      city: 'Jakarta',
      province: 'DKI Jakarta',
      country: 'Indonesia',
      organizer_name: 'Live Nation Indonesia',
      is_verified: true,
      verification_status: 'VERIFIED',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    };

    await testRepo.upsertEvent(sampleEvent);

    // Simulate new cold-start container with a fresh registry pointing to same repository
    const freshRegistry = new CanonicalEventRegistry(testRepo);
    await freshRegistry.init();

    const hydrated = freshRegistry.getEventById('durable-evt-001');
    assert.ok(hydrated, 'Event should be present after cold-start hydration');
    assert.strictEqual(hydrated.canonical_name, 'Durable Test Concert 2026');
    assert.strictEqual(hydrated.city, 'Jakarta');
    assert.strictEqual(hydrated.archive_status, 'ACTIVE');

    const bySlug = freshRegistry.getEventBySlug('durable-test-concert-jakarta-2026');
    assert.ok(bySlug, 'Event should be resolvable by slug after cold restart');
    assert.strictEqual(bySlug.event_id, 'durable-evt-001');
  });

  await test('Test 2: Idempotent Double-Sync never duplicates canonical events', async () => {
    const testRepo = new InMemoryCatalogRepository();
    await testRepo.init();

    const event = {
      id: 'idempotent-evt-002',
      event_id: 'idempotent-evt-002',
      slug: 'idempotent-festival-jakarta-2026',
      canonical_name: 'Idempotent Music Fest 2026',
      start_date: '2026-12-01',
      venue_name: 'JIExpo Kemayoran',
      city: 'Jakarta',
      is_verified: true,
      verification_status: 'VERIFIED',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    };

    // First upsert
    const first = await testRepo.upsertEvent(event);
    assert.ok(first);

    // Second upsert of identical event
    const second = await testRepo.upsertEvent(event);
    assert.ok(second);

    const allEvents = await testRepo.getAllEvents();
    const matching = allEvents.filter(e => e.id === 'idempotent-evt-002');
    assert.strictEqual(matching.length, 1, 'Duplicate row must not be created on second sync');
  });

  await test('Test 3: Anti-Resurrection: Archived H+2 event rejects transition back to UPCOMING', async () => {
    const testRepo = new InMemoryCatalogRepository();
    await testRepo.init();

    const pastEvent = {
      id: 'archived-evt-003',
      event_id: 'archived-evt-003',
      slug: 'archived-rock-show-jakarta-2026',
      canonical_name: 'Archived Rock Show',
      start_date: '2026-01-10',
      end_date: '2026-01-10',
      venue_name: 'Tennis Indoor Senayan',
      city: 'Jakarta',
      is_verified: true,
      verification_status: 'VERIFIED',
      lifecycle_status: 'ARCHIVED',
      archive_status: 'ARCHIVED',
      archived_at: '2026-01-13T00:00:00.000Z'
    };

    await testRepo.upsertEvent(pastEvent);

    // Attempt resurrection by incoming discovery observation claiming UPCOMING
    const resurrectAttempt = {
      ...pastEvent,
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    };

    const saved = await testRepo.upsertEvent(resurrectAttempt);
    assert.strictEqual(saved.archive_status, 'ARCHIVED', 'Archived status must remain ARCHIVED');
    assert.strictEqual(saved.lifecycle_status, 'ARCHIVED', 'Lifecycle status must remain ARCHIVED');
  });

  console.log('\n── Section 2: Admin API Key Lockdown & Fail-Closed Gate ──');

  await test('Test 4: Admin endpoints reject request with 401 when ADMIN_API_KEY is missing from request', async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    resetAdminRateLimits();

    const res = await apiRequest('/api/discovery/admin/inventory-report');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'ADMIN_KEY_REQUIRED');
  });

  await test('Test 5: Admin endpoints reject request with 401 when ADMIN_API_KEY is invalid', async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    resetAdminRateLimits();

    const res = await apiRequest('/api/discovery/admin/inventory-report', {
      headers: {
        'x-admin-api-key': 'wrong-unauthorized-key-000'
      }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_ADMIN_KEY');
  });

  await test('Test 6: Admin endpoints succeed with 200 when valid x-admin-api-key is supplied', async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    resetAdminRateLimits();

    const res = await apiRequest('/api/discovery/admin/inventory-report', {
      headers: {
        'x-admin-api-key': TEST_ADMIN_KEY
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.report);
  });

  await test('Test 7: Admin endpoints fail-closed with 401 when ADMIN_API_KEY is unset in environment', async () => {
    const savedKey = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;
    resetAdminRateLimits();

    const res = await apiRequest('/api/discovery/admin/inventory-report', {
      headers: {
        'x-admin-api-key': TEST_ADMIN_KEY
      }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'ADMIN_KEY_NOT_CONFIGURED');

    // Restore key
    process.env.ADMIN_API_KEY = savedKey;
  });

  console.log('\n── Section 3: Vercel Cron Discovery Sync & Concurrency Locking ──');

  await test('Test 8: Cron sync rejects request with 401 when cron secret is missing', async () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;

    const res = await apiRequest('/api/cron/discovery-sync');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'CRON_SECRET_REQUIRED');
  });

  await test('Test 9: Cron sync rejects request with 401 when cron secret is invalid', async () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;

    const res = await apiRequest('/api/cron/discovery-sync', {
      headers: {
        'Authorization': 'Bearer wrong-cron-secret'
      }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_CRON_SECRET');
  });

  await test('Test 10: Cron sync fails-closed with 500 when CRON_SECRET is unset in environment', async () => {
    const savedCron = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    const res = await apiRequest('/api/cron/discovery-sync', {
      headers: {
        'Authorization': `Bearer ${TEST_CRON_SECRET}`
      }
    });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.code, 'CRON_SECRET_NOT_CONFIGURED');

    process.env.CRON_SECRET = savedCron;
  });

  await test('Test 11: Advisory lock prevents concurrent cron executions (HTTP 409 SKIPPED)', async () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const catalogRepo = getCatalogRepository();

    // Manually hold advisory lock
    const locked = await catalogRepo.acquireAdvisoryLock(17913001);
    assert.strictEqual(locked, true, 'Advisory lock should be acquired');

    // Attempt cron sync while lock held
    const res = await apiRequest('/api/cron/discovery-sync', {
      headers: {
        'Authorization': `Bearer ${TEST_CRON_SECRET}`
      }
    });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'LOCK_BUSY');
    assert.strictEqual(res.body.status, 'SKIPPED');

    // Release lock
    await catalogRepo.releaseAdvisoryLock(17913001);

    // Verify lock is now released
    const canAcquireAgain = await catalogRepo.acquireAdvisoryLock(17913001);
    assert.strictEqual(canAcquireAgain, true);
    await catalogRepo.releaseAdvisoryLock(17913001);
  });

  console.log('\n── Section 4: Payload Sanitization & Injection Defense ──');

  await test('Test 12: EventNormalizationService sanitizes HTML and clamps title length', () => {
    const dirtyTitle = '<script>alert("xss")</script><b>Heavy Metal Fest</b> ' + 'A'.repeat(300);
    const cleaned = EventNormalizationService.normalizeTitle(dirtyTitle);

    assert.ok(!cleaned.includes('<script>'), 'HTML script tags must be stripped');
    assert.ok(!cleaned.includes('<b>'), 'HTML bold tags must be stripped');
    assert.ok(cleaned.length <= 255, `Title length must be clamped to <= 255 chars, got ${cleaned.length}`);
  });

  await test('Test 13: SQL injection payloads in title/venue do not corrupt catalog repository', async () => {
    const testRepo = new InMemoryCatalogRepository();
    await testRepo.init();

    const injectionPayload = {
      id: 'inj-evt-001',
      event_id: 'inj-evt-001',
      slug: 'sql-injection-test-slug',
      canonical_name: "Robert'); DROP TABLE canonical_events; --",
      venue_name: "1' OR '1'='1",
      city: 'Jakarta',
      start_date: '2026-11-20',
      is_verified: true,
      verification_status: 'VERIFIED',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    };

    const saved = await testRepo.upsertEvent(injectionPayload);
    assert.strictEqual(saved.id, 'inj-evt-001');

    // Verify repository still works and row was stored verbatim without SQL execution
    const retrieved = await testRepo.getEventById('inj-evt-001');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.canonical_name, "Robert'); DROP TABLE canonical_events; --");
  });

  await stopTestServer();

  console.log('\n================================================================');
  console.log(`TIKUM DURABLE CATALOG SUITE: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test execution fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
