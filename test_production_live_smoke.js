#!/usr/bin/env node
/**
 * TIKUM — Live Production Smoke & SEO Certification Suite
 * Target: https://tikum.app
 */

const assert = require('assert');
const https = require('https');

const PROD_URL = 'https://tikum.app';

function get(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${PROD_URL}${path}`;
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tikum-Production-Smoke/1.0',
        ...options.headers
      }
    };
    https.get(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

function post(path, body, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${PROD_URL}${path}`;
    const parsed = new URL(url);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tikum-Production-Smoke/1.0',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runSmoke() {
  console.log('================================================================');
  console.log('  TIKUM — LIVE PRODUCTION DEPLOYMENT SMOKE TESTS');
  console.log(`  Target: ${PROD_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function check(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${desc}`);
      console.error(`         ${err.message}`);
      throw err;
    }
  }

  // 1. Homepage Smoke
  console.log('--- 1. Homepage (/) ---');
  const home = await get('/');
  check('GET / returns HTTP 200', () => {
    assert.strictEqual(home.status, 200);
  });
  check('Homepage contains brand title and canonical link', () => {
    assert(home.body.includes('TIKUM') || home.body.includes('Tikum'), 'Brand title must be present');
    assert(home.body.includes('link rel="canonical" href="https://tikum.app/"') || home.body.includes('link rel="canonical" href="https://tikum.app"'), 'Homepage canonical must point to https://tikum.app/');
  });
  check('Homepage renders grounded hero events (BTS and BIGBANG)', () => {
    assert(home.body.includes('BTS WORLD TOUR ARIRANG') || home.body.includes('bts-world-tour-arirang'), 'BTS must be present');
    assert(home.body.includes('BIGBANG 2026–2027 WORLD TOUR') || home.body.includes('bigbang-cosmos-tour'), 'BIGBANG must be present');
  });

  // 2. BTS Event Page Smoke & Schema Invariants
  console.log('\n--- 2. BTS Event Detail (/events/bts-world-tour-arirang-jakarta-2026) ---');
  const bts = await get('/events/bts-world-tour-arirang-jakarta-2026');
  check('GET BTS event returns HTTP 200', () => {
    assert.strictEqual(bts.status, 200);
  });
  check('BTS event canonical points to https://tikum.app/events/bts-world-tour-arirang-jakarta-2026', () => {
    assert(bts.body.includes('link rel="canonical" href="https://tikum.app/events/bts-world-tour-arirang-jakarta-2026"'));
  });
  check('BTS JSON-LD structured data omits unverified offers and contains ZERO InStock claims', () => {
    const match = bts.body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert(match, 'JSON-LD script tag must exist');
    const schema = JSON.parse(match[1]);
    assert.strictEqual(schema['@type'], 'MusicEvent');
    assert.strictEqual(schema.startDate, '2026-12-26T19:00:00+07:00');
    assert.strictEqual(schema.endDate, '2026-12-27T22:30:00+07:00');
    assert.strictEqual(schema.offers, undefined, 'offers must be omitted');
    assert(!bts.body.includes('schema.org/InStock'), 'Must not claim InStock in HTML or schema');
  });
  check('BTS official ticket link to Tiket.com is visible and functional in HTML', () => {
    assert(bts.body.includes('https://www.tiket.com/en-id/to-do/bts-jakarta-day1'), 'Official URL must be present');
    assert(bts.body.includes('Tiket.com'), 'Tiket.com must be named');
    assert(bts.body.includes('Buka Halaman Tiket Resmi') || bts.body.includes('Cek Waiting List'), 'CTA must be present');
  });
  check('BTS visible page declares 0 resale inventory truthfully', () => {
    assert(bts.body.includes('Saat Ini Belum Ada Tiket Resale Terverifikasi') || bts.body.includes('Belum ada pengguna yang mendaftarkan penjualan tiket') || bts.body.includes('0 Tiket Tersedia'));
  });

  // 3. BIGBANG Event Page Smoke & Schema Invariants
  console.log('\n--- 3. BIGBANG Event Detail (/events/bigbang-cosmos-tour-jakarta-2027) ---');
  const bb = await get('/events/bigbang-cosmos-tour-jakarta-2027');
  check('GET BIGBANG event returns HTTP 200', () => {
    assert.strictEqual(bb.status, 200);
  });
  check('BIGBANG canonical points to https://tikum.app/events/bigbang-cosmos-tour-jakarta-2027', () => {
    assert(bb.body.includes('link rel="canonical" href="https://tikum.app/events/bigbang-cosmos-tour-jakarta-2027"'));
  });
  check('BIGBANG JSON-LD omits unverified offers and contains ZERO InStock claims', () => {
    const match = bb.body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert(match, 'JSON-LD script tag must exist');
    const schema = JSON.parse(match[1]);
    assert.strictEqual(schema['@type'], 'MusicEvent');
    assert.strictEqual(schema.startDate, '2027-01-16T19:00:00+07:00', 'Start date must be 2027-01-16');
    assert.strictEqual(schema.endDate, '2027-01-17T22:30:00+07:00', 'End date must be 2027-01-17');
    assert.strictEqual(schema.offers, undefined, 'offers must be omitted');
    assert(!bb.body.includes('schema.org/InStock'), 'Must not claim InStock in HTML or schema');
  });
  check('BIGBANG official ticket link to bigbanginjakarta.com is visible and functional in HTML', () => {
    assert(bb.body.includes('https://bigbanginjakarta.com/'));
    assert(bb.body.includes('Jakarta International Stadium'));
  });

  // 4. Artist Pages Smoke
  console.log('\n--- 4. Artist Directory Pages (/artists/bts & /artists/bigbang) ---');
  const artistBts = await get('/artists/bts');
  check('GET /artists/bts returns HTTP 200 with grounded events', () => {
    assert.strictEqual(artistBts.status, 200);
    assert(artistBts.body.includes('BTS'));
    assert(artistBts.body.includes('link rel="canonical" href="https://tikum.app/artists/bts"'));
  });

  const artistBb = await get('/artists/bigbang');
  check('GET /artists/bigbang returns HTTP 200 with grounded events', () => {
    assert.strictEqual(artistBb.status, 200);
    assert(artistBb.body.includes('BIGBANG'));
    assert(artistBb.body.includes('link rel="canonical" href="https://tikum.app/artists/bigbang"'));
  });

  // 5. Technical SEO Assets (/sitemap.xml & /robots.txt)
  console.log('\n--- 5. Technical SEO Assets (/sitemap.xml & /robots.txt) ---');
  const sitemap = await get('/sitemap.xml');
  check('GET /sitemap.xml returns HTTP 200 with valid canonical URLs', () => {
    assert.strictEqual(sitemap.status, 200);
    assert(sitemap.body.includes('<urlset'));
    assert(sitemap.body.includes('https://tikum.app/events/bts-world-tour-arirang-jakarta-2026'));
    assert(sitemap.body.includes('https://tikum.app/events/bigbang-cosmos-tour-jakarta-2027'));
    assert(!sitemap.body.includes('guns-n-roses'), 'Guns N Roses must be absent from sitemap');
    assert(!sitemap.body.includes('vercel.app'), 'Sitemap must not contain vercel.app domains');
  });

  const robots = await get('/robots.txt');
  check('GET /robots.txt returns HTTP 200 referencing canonical sitemap', () => {
    assert.strictEqual(robots.status, 200);
    assert(robots.body.includes('Sitemap: https://tikum.app/sitemap.xml'));
    assert(robots.body.includes('Disallow: /admin'));
  });

  // 6. Prelaunch Payment & Security Boundary
  console.log('\n--- 6. Prelaunch Payment & Security Boundary ---');
  const payConfig = await get('/api/v1/payments/active-config');
  check('Payment active-config confirms PRELAUNCH mode', () => {
    assert.strictEqual(payConfig.status, 200);
    const data = JSON.parse(payConfig.body);
    assert.strictEqual(data.is_prelaunch, true);
    assert.strictEqual(data.marketplace_mode, 'PRELAUNCH_LISTING_ONLY');
  });

  const payStatus = await get('/api/v1/payments/status');
  check('Payment status confirms NO_REAL_PAYMENT safety gate', () => {
    assert.strictEqual(payStatus.status, 200);
    const data = JSON.parse(payStatus.body);
    assert.strictEqual(data.safety_gates?.NO_REAL_PAYMENT, true);
    assert.strictEqual(data.safety_gates?.NO_REAL_SETTLEMENT, true);
    assert.strictEqual(data.marketplace_financial_state?.real_money_active, false);
  });

  const unauthCheckout = await post('/api/v1/payments/create', { orderId: 'test-order-999', amount: 100000 });
  check('Payment initiation is blocked with 403 (PRELAUNCH_LISTING_ONLY fail-closed)', () => {
    assert.strictEqual(unauthCheckout.status, 403, `Must be blocked with 403, got ${unauthCheckout.status}`);
    const data = JSON.parse(unauthCheckout.body);
    assert.strictEqual(data.code, 'MARKETPLACE_PRELAUNCH_ONLY');
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} PRODUCTION SMOKE CHECKS PASSED!`);
  console.log('  STATUS: PRODUCTION RUNTIME VERIFIED (https://tikum.app)');
  console.log('================================================================\n');
}

runSmoke().catch(err => {
  console.error('\nProduction Smoke Failed:', err);
  process.exit(1);
});
