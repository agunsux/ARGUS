process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const { state, resetDatabase } = require('./src/database');
const app = require('./src/server');
const { apmiPromoterRegistry } = require('./src/discovery/ApmiPromoterRegistry');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}

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
  console.log('\n=== TIKUM — APMI PROMOTER REGISTRY & ARCHIVE ACCEPTANCE SUITE ===\n');

  resetDatabase();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // 1. Direct registry unit tests
  test('1. APMI Promoter Registry metadata and board are complete', () => {
    const assoc = apmiPromoterRegistry.getAssociationInfo();
    assert.strictEqual(assoc.short_name, 'APMI');
    assert.strictEqual(assoc.official_website, 'https://apmi.co.id');
    assert.ok(assoc.board.length >= 8, 'Board must have at least 8 members');
    assert.ok(assoc.board.some(b => b.name === 'Dino Hamid'));
  });

  test('2. APMI Members roster includes key Indonesian promoters', () => {
    const members = apmiPromoterRegistry.getAllMembers();
    assert.ok(members.length >= 12, 'Must have at least 12 accredited members');

    const bossCreator = apmiPromoterRegistry.getMemberBySlug('boss-creator');
    assert.ok(bossCreator);
    assert.strictEqual(bossCreator.name, 'Boss Creator');
    assert.strictEqual(bossCreator.trust_tier, 'TIER_S');
    assert.ok(bossCreator.signature_events.includes('Pestapora'));

    const antarasuara = apmiPromoterRegistry.getMemberBySlug('antarasuara');
    assert.ok(antarasuara);
    assert.strictEqual(antarasuara.name, 'Antarasuara');

    const otello = apmiPromoterRegistry.getMemberBySlug('otello-asia');
    assert.ok(otello);
    assert.strictEqual(otello.name, 'Otello Asia');

    const ismaya = apmiPromoterRegistry.getMemberBySlug('ismaya-live');
    assert.ok(ismaya);
    assert.ok(ismaya.signature_events.includes('Djakarta Warehouse Project (DWP)'));
  });

  // 2. HTTP REST API Tests
  await testAsync('3. GET /api/discovery/promoters/apmi returns all members with event metrics', async () => {
    const res = await apiRequest('/api/discovery/promoters/apmi');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.total_members >= 12);
    assert.ok(Array.isArray(res.data.members));
    
    // Check that Pestapora in seeded events links to Boss Creator
    const bc = res.data.members.find(m => m.slug === 'boss-creator');
    assert.ok(bc, 'Boss Creator must be present in members list');
    assert.ok(bc.event_metrics.total_events >= 1, 'Pestapora should link to Boss Creator');
  });

  await testAsync('4. GET /api/discovery/promoters/apmi/boss-creator returns member details and linked Pestapora', async () => {
    const res = await apiRequest('/api/discovery/promoters/apmi/boss-creator');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.promoter.name, 'Boss Creator');
    assert.ok(res.data.events.total >= 1);
    const pestapora = res.data.events.all.find(e => (e.canonical_name || e.name || '').includes('Pestapora'));
    assert.ok(pestapora, 'Pestapora must be linked to Boss Creator');
  });

  await testAsync('5. Ingest new event under APMI promoter Antarasuara and verify it appears in promoter archive', async () => {
    const payload = {
      name: 'Sheila on 7: Tunggu Aku Di Bandung 2026',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung',
      start_date: '2026-10-18',
      category: 'CONCERT',
      organizer_name: 'Antarasuara',
      official_ticket_url: 'https://antarasuara.com/so7-bandung-2026',
      source_event_id: 'antarasuara-so7-2026'
    };

    const ingestRes = await apiRequest('/api/discovery/ingest', {
      method: 'POST',
      body: {
        payload,
        source_id: 'src-promoter-antarasuara'
      }
    });

    assert.strictEqual(ingestRes.status, 201);
    assert.strictEqual(ingestRes.data.success, true);

    // Query Antarasuara promoter archive
    const promRes = await apiRequest('/api/discovery/promoters/apmi/antarasuara');
    assert.strictEqual(promRes.status, 200);
    assert.ok(promRes.data.events.total >= 1);
    const so7 = promRes.data.events.all.find(e => (e.canonical_name || '').toLowerCase().includes('sheila on 7'));
    assert.ok(so7, 'Newly ingested SO7 concert must be linked to Antarasuara');
  });

  // 3. Public SSR Pages
  await testAsync('6. GET /promoters/apmi renders indexable SSR HTML with canonical link and zero leaked keywords', async () => {
    const res = await apiRequest('/promoters/apmi');
    assert.strictEqual(res.status, 200);
    const html = res.data;
    assert.ok(html.includes('<title>Direktori Promotor Musik Indonesia (APMI)'));
    assert.ok(html.includes('<link rel="canonical" href="https://tikum.app/promoters/apmi">'));
    assert.ok(html.includes('Boss Creator'));
    assert.ok(html.includes('Antarasuara'));
    assert.ok(html.includes('Otello Asia'));
    assert.ok(html.includes('Plainsong Live'));
    assert.ok(html.includes('Joyland Festival'));
    assert.ok(!html.includes('ARGUS'), 'Customer-facing page must have ZERO ARGUS brand leaks');
  });

  await testAsync('7. GET /promoters/apmi/boss-creator renders single promoter profile and event schedule', async () => {
    const res = await apiRequest('/promoters/apmi/boss-creator');
    assert.strictEqual(res.status, 200);
    const html = res.data;
    assert.ok(html.includes('Boss Creator'));
    assert.ok(html.includes('PT Boss Kreator Indonesia'));
    assert.ok(html.includes('Pestapora'));
    assert.ok(html.includes('<link rel="canonical" href="https://tikum.app/promoters/apmi/boss-creator">'));
    assert.ok(!html.includes('ARGUS'), 'Customer-facing page must have ZERO ARGUS brand leaks');
  });

  await testAsync('8. GET /api/discovery/promoters/apmi/unknown-slug returns 404', async () => {
    const res = await apiRequest('/api/discovery/promoters/apmi/non-existent-promoter');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.code, 'PROMOTER_NOT_FOUND');
  });

  server.close();

  console.log(`\n=======================`);
  console.log(`APMI Promoter Archive Suite Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error in APMI Promoter Archive suite:', err);
  if (server) server.close();
  process.exit(1);
});
