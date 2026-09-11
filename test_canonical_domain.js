/**
 * TIKUM CANONICAL PRODUCTION DOMAIN & REDIRECT TEST SUITE
 * 
 * Validates:
 * 1. Legacy public hostname redirection (argus-trust-infrastructure.vercel.app -> https://tikum.app)
 * 2. Legacy URL path and query preservation (/events/abc?x=1 -> https://tikum.app/events/abc?x=1)
 * 3. Host safety: localhost, preview URLs, and canonical tikum.app are NOT redirected
 * 4. All public customer pages render canonical link rel pointing to https://tikum.app/...
 * 5. robots.txt and sitemap.xml declare https://tikum.app as sitemap origin
 * 6. businessProfile canonical domain and origin match https://tikum.app
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = require('./src/server');
const { businessProfile } = require('./src/config/businessProfile');

let server;
let port;
let baseUrl;

function request(reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: reqPath,
      method: 'GET',
      headers: {
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('  TIKUM — CANONICAL DOMAIN & HOST SAFETY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  // Start temporary local server to test host routing
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // 1. LEGACY HOST REDIRECT
    await testAsync('1. Legacy Host argus-trust-infrastructure.vercel.app redirects with 301 to https://tikum.app/', async () => {
      const res = await request('/', { host: 'argus-trust-infrastructure.vercel.app' });
      assert.strictEqual(res.statusCode, 301, `Expected 301, got ${res.statusCode}`);
      assert.strictEqual(res.headers.location, 'https://tikum.app/', `Expected location https://tikum.app/, got ${res.headers.location}`);
    });

    // 2. PATH AND QUERY PRESERVATION
    await testAsync('2. Legacy Host preserves path and query string on redirect', async () => {
      const res = await request('/events/coldplay-2026?ref=promo&source=old', {
        host: 'argus-trust-infrastructure.vercel.app'
      });
      assert.strictEqual(res.statusCode, 301, `Expected 301, got ${res.statusCode}`);
      assert.strictEqual(res.headers.location, 'https://tikum.app/events/coldplay-2026?ref=promo&source=old');
    });

    // 3. SECONDARY LEGACY VERCEL ALIASES
    await testAsync('3. Secondary legacy alias argus-trust-infrastructure-shinerva.vercel.app also redirects', async () => {
      const res = await request('/faq', {
        host: 'argus-trust-infrastructure-shinerva.vercel.app'
      });
      assert.strictEqual(res.statusCode, 301, `Expected 301, got ${res.statusCode}`);
      assert.strictEqual(res.headers.location, 'https://tikum.app/faq');
    });

    // 4. CANONICAL HOST PASSTHROUGH
    await testAsync('4. Canonical host tikum.app passes through normally (HTTP 200, no redirect)', async () => {
      const res = await request('/health', { host: 'tikum.app' });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.headers.location, undefined, 'Canonical host must not emit redirect Location');
    });

    // 5. LOCALHOST / DEV SAFETY
    await testAsync('5. Localhost and 127.0.0.1 pass through without redirect', async () => {
      const res = await request('/health', { host: `localhost:${port}` });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.headers.location, undefined, 'Localhost must not be redirected');
    });

    // 6. PREVIEW DEPLOYMENT SAFETY
    await testAsync('6. Vercel preview URLs are NOT redirected', async () => {
      const res = await request('/health', { host: 'argus-trust-infrastructure-abc123xyz-shinerva.vercel.app' });
      assert.strictEqual(res.statusCode, 200, `Preview deployments must be served normally, got ${res.statusCode}`);
      assert.strictEqual(res.headers.location, undefined, 'Preview URLs must not be redirected');
    });

    // 7. PUBLIC HTML CANONICAL LINKS
    test('7. All public customer HTML pages contain canonical link pointing to https://tikum.app', () => {
      const publicDir = path.resolve(__dirname, 'public');
      const pages = [
        { file: 'index.html', canonical: 'https://tikum.app/' },
        { file: 'create.html', canonical: 'https://tikum.app/create' },
        { file: 'pay.html', canonical: 'https://tikum.app/pay' },
        { file: 'offers.html', canonical: 'https://tikum.app/offers' },
        { file: 'track.html', canonical: 'https://tikum.app/track' },
        { file: 'faq.html', canonical: 'https://tikum.app/faq' },
        { file: 'terms.html', canonical: 'https://tikum.app/terms' },
        { file: 'refund-policy.html', canonical: 'https://tikum.app/refund-policy' },
        { file: 'contact.html', canonical: 'https://tikum.app/contact' },
        { file: 'privacy.html', canonical: 'https://tikum.app/privacy' }
      ];

      for (const p of pages) {
        const content = fs.readFileSync(path.join(publicDir, p.file), 'utf8');
        const expectedTag = `<link rel="canonical" href="${p.canonical}">`;
        assert.ok(content.includes(expectedTag), `${p.file} must include ${expectedTag}`);
      }
    });

    // 8. ROBOTS.TXT & SITEMAP.XML
    test('8. robots.txt and sitemap.xml specify https://tikum.app as canonical root', () => {
      const robots = fs.readFileSync(path.resolve(__dirname, 'public/robots.txt'), 'utf8');
      assert.ok(robots.includes('Sitemap: https://tikum.app/sitemap.xml'), 'robots.txt must point to sitemap at https://tikum.app/sitemap.xml');

      const sitemap = fs.readFileSync(path.resolve(__dirname, 'public/sitemap.xml'), 'utf8');
      assert.ok(sitemap.includes('<loc>https://tikum.app/</loc>'), 'sitemap.xml must include canonical root https://tikum.app/');
      assert.ok(!sitemap.includes('vercel.app'), 'sitemap.xml must not contain vercel.app');
    });

    // 9. BUSINESS PROFILE CANONICAL VALUES
    test('9. businessProfile defines canonicalDomain and canonicalOrigin as https://tikum.app', () => {
      assert.strictEqual(businessProfile.canonicalDomain, 'https://tikum.app');
      assert.strictEqual(businessProfile.canonicalOrigin, 'https://tikum.app');
      assert.strictEqual(businessProfile.primaryDomain, 'tikum.app');
    });

    console.log(`\nAll ${passed}/${total} Canonical Domain tests PASSED successfully!\n`);
  } finally {
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
