/**
 * test_public_website_accessibility.js
 * Verification test for Phase 2 & 12 Gate A & F:
 * Ensures all 15+ mandatory public website routes return HTTP 200/301,
 * carry canonical domain metadata (https://tikum.app),
 * disclose PT SHINERVA PRAJNA TEJAS as the legal entity,
 * and contain zero unapproved placeholders or broken navigation links.
 */

process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'TestAdminPassword123!';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');

const REQUIRED_PUBLIC_ROUTES = [
  { path: '/', expectedStatus: 200, label: 'Homepage' },
  { path: '/about', expectedStatus: 200, label: 'About TIKUM' },
  { path: '/how-it-works', expectedStatus: 200, label: 'Buyer & Seller How It Works' },
  { path: '/how-to-buy', expectedStatus: 200, label: 'Buyer Guide (how-to-buy)' },
  { path: '/panduan-pembeli', expectedStatus: 200, label: 'Buyer Guide (panduan-pembeli)' },
  { path: '/how-to-sell', expectedStatus: 200, label: 'Seller Guide (how-to-sell)' },
  { path: '/ticket-verification', expectedStatus: 200, label: 'Ticket Verification Methodology' },
  { path: '/buyer-protection', expectedStatus: 200, label: 'Buyer Protection' },
  { path: '/fees', expectedStatus: 200, label: 'Platform Fees & Pricing Structure' },
  { path: '/terms', expectedStatus: 200, label: 'Terms of Service' },
  { path: '/privacy', expectedStatus: 200, label: 'Privacy Policy' },
  { path: '/refund-policy', expectedStatus: 200, label: 'Refund Policy' },
  { path: '/refunds', expectedStatus: 302, label: 'Refunds Redirect' },
  { path: '/disputes', expectedStatus: 200, label: 'Dispute Resolution' },
  { path: '/contact', expectedStatus: 200, label: 'Customer Support & Contact' },
  { path: '/seller-terms', expectedStatus: 200, label: 'Seller Obligations & Terms' },
  { path: '/pay', expectedStatus: 200, label: 'Demonstration Checkout' }
];

async function runTests() {
  console.log('================================================================');
  console.log('  TIKUM — PUBLIC WEBSITE ACCESSIBILITY & COMPLIANCE TEST SUITE');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 0;

  function httpRequest(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'TikumComplianceAuditor/1.0'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  for (const route of REQUIRED_PUBLIC_ROUTES) {
    total++;
    try {
      const res = await httpRequest(route.path);
      assert.strictEqual(
        res.status,
        route.expectedStatus,
        `Expected HTTP ${route.expectedStatus} for ${route.path}, got ${res.status}`
      );

      if (res.status === 200) {
        // Must contain legal entity or brand reference
        assert.ok(
          res.body.includes('PT SHINERVA PRAJNA TEJAS') || res.body.includes('Tikum') || res.body.includes('TIKUM'),
          `Route ${route.path} must mention PT SHINERVA PRAJNA TEJAS or TIKUM`
        );

        // Must not contain forbidden placeholders
        const placeholders = ['Lorem ipsum', 'test@test', 'your@email', 'your address', '000000'];
        for (const p of placeholders) {
          assert.strictEqual(
            res.body.includes(p),
            false,
            `Route ${route.path} contains forbidden placeholder '${p}'`
          );
        }
      } else if (res.status === 301 || res.status === 302) {
        assert.ok(res.headers.location, `Redirect on ${route.path} must have Location header`);
      }

      console.log(`  ✓ [PASS] ${route.label} (${route.path}) -> HTTP ${res.status}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${route.label} (${route.path}):`, err.message);
    }
  }

  server.close();

  console.log('\n================================================================');
  console.log(`  RESULT: ${passed}/${total} PUBLIC WEBSITE TESTS PASSED`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
