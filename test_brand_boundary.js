/**
 * TIKUM & ARGUS Trust Engine — Comprehensive Brand Boundary & Compliance Test Suite
 * 
 * Validates the 13 Brand Constitution & Architecture Invariants:
 * 1. Public homepage renders TIKUM.
 * 2. Public navigation renders TIKUM.
 * 3. Public footer renders TIKUM — by SHINERVA (ZERO customer-facing ARGUS).
 * 4. Public legal pages render TIKUM (/terms, /privacy, /refund-policy, /faq, /contact).
 * 5. Public SEO metadata uses TIKUM (titles, OpenGraph site_name, Twitter card).
 * 6. Canonical URLs use: https://tikum.app across all public pages.
 * 7. Consumer pages do NOT expose ANY public ARGUS references (ZERO customer-facing ARGUS occurrences).
 * 8. Internal ARGUS references remain intact where required (admin console, engine name, database fixtures, internal health check).
 * 9. SHINERVA remains correctly represented as parent/operator entity.
 * 10. No destructive database rename occurred (ledger tables & collections intact).
 * 11. No transaction logic changed (order state transitions & escrow invariants intact).
 * 12. No payment activation occurred (iPaymu live remains inactive / pilot sandbox).
 * 13. Existing API behavior remains intact (/api/business-profile, /api/discovery/events, /health).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('./src/server');
const { state } = require('./src/database');
const { businessProfile } = require('./src/config/businessProfile');
const { EventSEOService } = require('./src/discovery/EventSEOService');
const { EscrowService } = require('./src/services/escrowService');

let server;
let baseUrl;

function request(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function runBrandBoundaryTests() {
  console.log('====================================================');
  console.log('  TIKUM & ARGUS — 13-POINT BRAND BOUNDARY SUITE');
  console.log('====================================================\n');

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

  const publicDir = path.join(__dirname, 'public');
  const customerFacingFiles = [
    'index.html',
    'pay.html',
    'create.html',
    'track.html',
    'offers.html',
    'faq.html',
    'terms.html',
    'refund-policy.html',
    'contact.html',
    'privacy.html'
  ];

  const forbiddenStrings = [
    'ARGUS Marketplace',
    'ARGUS Tickets',
    'ARGUS.app',
    'Tikum by ARGUS',
    'ARGUS PIC',
    'ARGUS Trust Officer',
    'argus.id',
    'argus.app',
    'tikum.id'
  ];

  // -------------------------------------------------------------
  // 1. PUBLIC HOMEPAGE RENDERS TIKUM
  // -------------------------------------------------------------
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  check('1. Public homepage renders TIKUM as primary brand and title', () => {
    assert.ok(indexHtml.includes('Tikum'), 'index.html must include consumer brand Tikum');
    assert.ok(indexHtml.includes('<title>Tikum — Verified Ticket Marketplace by Shinerva</title>'));
    assert.ok(indexHtml.includes('class="brand-title">Tikum</div>'));
  });

  // -------------------------------------------------------------
  // 2. PUBLIC NAVIGATION RENDERS TIKUM
  // -------------------------------------------------------------
  check('2. Public navigation across all customer pages renders TIKUM brand', () => {
    for (const filename of customerFacingFiles) {
      const content = fs.readFileSync(path.join(publicDir, filename), 'utf8');
      assert.ok(content.includes('class="brand-title">Tikum</div>') || content.includes('Tikum — by Shinerva'),
        `Navigation missing Tikum brand in ${filename}`);
    }
  });

  // -------------------------------------------------------------
  // 3. PUBLIC FOOTER RENDERS TIKUM OPERATED BY SHINERVA (NO ARGUS)
  // -------------------------------------------------------------
  check('3. Public footer renders TIKUM — by SHINERVA with ZERO customer-facing ARGUS', () => {
    for (const filename of customerFacingFiles) {
      const content = fs.readFileSync(path.join(publicDir, filename), 'utf8');
      assert.ok(content.includes('TIKUM — by SHINERVA') || content.includes('Tikum — by Shinerva'),
        `Missing TIKUM — by SHINERVA in footer of ${filename}`);
      assert.ok(content.includes('SHINERVA HQ'), `Missing SHINERVA HQ entity in ${filename}`);
      assert.ok(content.includes('Jl. Pasirluyu No. 79'), `Missing Pasirluyu address in ${filename}`);
      assert.strictEqual(content.includes('ARGUS Trust Engine'), false, `Footer must NOT include ARGUS Trust Engine in ${filename}`);
      assert.strictEqual(/argus/i.test(content), false, `Customer-facing file ${filename} must have 0 occurrences of ARGUS`);
    }
  });

  // -------------------------------------------------------------
  // 4. PUBLIC LEGAL PAGES RENDER TIKUM
  // -------------------------------------------------------------
  const legalPages = ['terms.html', 'refund-policy.html', 'privacy.html', 'faq.html', 'contact.html'];
  check('4. Public legal and policy pages render TIKUM consumer brand', () => {
    for (const lp of legalPages) {
      const content = fs.readFileSync(path.join(publicDir, lp), 'utf8');
      assert.ok(content.includes('Tikum'), `Legal page ${lp} must render Tikum`);
      assert.ok(content.includes('SHINERVA HQ'), `Legal page ${lp} must identify SHINERVA HQ`);
    }
  });

  // -------------------------------------------------------------
  // 5. PUBLIC SEO METADATA USES TIKUM
  // -------------------------------------------------------------
  check('5. Public SEO metadata uses TIKUM (og:site_name, titles, descriptions)', () => {
    for (const filename of customerFacingFiles) {
      const content = fs.readFileSync(path.join(publicDir, filename), 'utf8');
      assert.ok(content.includes('<meta property="og:site_name" content="TIKUM">'),
        `Missing og:site_name TIKUM in ${filename}`);
      assert.ok(content.includes('name="description"'), `Missing meta description in ${filename}`);
      assert.ok(content.includes('name="twitter:card"'), `Missing twitter:card in ${filename}`);
    }
  });

  // -------------------------------------------------------------
  // 6. CANONICAL URLS USE HTTPS://TIKUM.APP
  // -------------------------------------------------------------
  check('6. Canonical URLs strictly use https://tikum.app across all public pages', () => {
    const expectedCanonicals = {
      'index.html': 'https://tikum.app/',
      'pay.html': 'https://tikum.app/pay',
      'create.html': 'https://tikum.app/create',
      'track.html': 'https://tikum.app/track',
      'offers.html': 'https://tikum.app/offers',
      'faq.html': 'https://tikum.app/faq',
      'terms.html': 'https://tikum.app/terms',
      'refund-policy.html': 'https://tikum.app/refund-policy',
      'contact.html': 'https://tikum.app/contact',
      'privacy.html': 'https://tikum.app/privacy'
    };

    for (const [file, expectedUrl] of Object.entries(expectedCanonicals)) {
      const content = fs.readFileSync(path.join(publicDir, file), 'utf8');
      assert.ok(content.includes(`<link rel="canonical" href="${expectedUrl}">`),
        `File ${file} must have canonical ${expectedUrl}`);
    }

    assert.strictEqual(businessProfile.canonicalDomain, 'https://tikum.app');
    assert.strictEqual(businessProfile.canonicalOrigin, 'https://tikum.app');
    assert.strictEqual(businessProfile.primaryDomain, 'tikum.app');
  });

  // -------------------------------------------------------------
  // 7. CONSUMER PAGES DO NOT EXPOSE FORBIDDEN STRINGS OR ARGUS
  // -------------------------------------------------------------
  check('7. Consumer pages do NOT expose forbidden strings and have ZERO ARGUS occurrences', () => {
    for (const filename of customerFacingFiles) {
      const content = fs.readFileSync(path.join(publicDir, filename), 'utf8');
      for (const forbidden of forbiddenStrings) {
        assert.strictEqual(
          content.includes(forbidden),
          false,
          `Found forbidden string "${forbidden}" in public file ${filename}`
        );
      }
      assert.strictEqual(
        /argus/i.test(content),
        false,
        `Customer-facing file ${filename} contains forbidden occurrence of ARGUS`
      );
    }
  });

  // -------------------------------------------------------------
  // 8. INTERNAL ARGUS REFERENCES REMAIN INTACT WHERE REQUIRED
  // -------------------------------------------------------------
  check('8. Internal ARGUS engine identifiers and database fixtures remain intact', () => {
    assert.strictEqual(businessProfile.engineName, 'ARGUS Trust Engine');

    // Internal user fixtures in database.js
    const adminUser = state.users.find(u => u.id === 'admin-1');
    assert.ok(adminUser, 'admin-1 user fixture must exist');
    assert.strictEqual(adminUser.name, 'Trust Officer ARGUS');
    assert.strictEqual(adminUser.email, 'ops@argus.id');

    const picUser = state.users.find(u => u.id === 'pic-1');
    assert.ok(picUser, 'pic-1 user fixture must exist');
    assert.strictEqual(picUser.email, 'agus.pic@argus.id');

    // Admin console surface retains internal ARGUS Trust Engine branding
    const adminHtml = fs.readFileSync(path.join(publicDir, 'admin.html'), 'utf8');
    assert.ok(adminHtml.includes('TIKUM Operations Console — ARGUS Trust Engine | SHINERVA HQ'),
      'Admin console title must retain ARGUS Trust Engine');
    assert.ok(adminHtml.includes('Powered by ARGUS Trust Engine &bull; SHINERVA HQ'),
      'Admin console header must retain ARGUS Trust Engine');
  });

  // -------------------------------------------------------------
  // 9. SHINERVA REMAINS CORRECTLY REPRESENTED AS PARENT/OPERATOR
  // -------------------------------------------------------------
  check('9. SHINERVA is accurately configured as parent company & legal entity', () => {
    assert.strictEqual(businessProfile.parentCompany, 'Shinerva');
    assert.strictEqual(businessProfile.parentEntity, 'SHINERVA HQ');
    assert.strictEqual(businessProfile.name, 'SHINERVA HQ');
    assert.strictEqual(businessProfile.address.entity, 'SHINERVA HQ');
    assert.strictEqual(businessProfile.address.city, 'Bandung');
  });

  // -------------------------------------------------------------
  // 10. NO DESTRUCTIVE DATABASE RENAME OCCURRED
  // -------------------------------------------------------------
  check('10. Database tables/collections exist and maintain schema integrity', () => {
    assert.ok(Array.isArray(state.users), 'state.users must be intact');
    assert.ok(Array.isArray(state.listings), 'state.listings must be intact');
    assert.ok(Array.isArray(state.events), 'state.events must be intact');
    assert.ok(Array.isArray(state.orders), 'state.orders must be intact');
    assert.ok(Array.isArray(state.offers), 'state.offers must be intact');
    assert.ok(Array.isArray(state.disputes), 'state.disputes must be intact');
    assert.ok(Array.isArray(state.venues), 'state.venues must be intact');
    assert.ok(Array.isArray(state.seller_profiles), 'state.seller_profiles must be intact');
  });

  // -------------------------------------------------------------
  // 11. NO TRANSACTION LOGIC CHANGED
  // -------------------------------------------------------------
  check('11. Escrow calculations and pricing logic adhere to canonical 6% fee engine', () => {
    const pricing = EscrowService.calculatePricing(1000000);
    assert.strictEqual(pricing.ticketPrice, 1000000);
    assert.strictEqual(pricing.platformFee, 60000); // Canonical 6% fee rate
    assert.strictEqual(pricing.buyer_subtotal, 1060000);
    assert.strictEqual(pricing.totalAmount, 1060000); // 1,060,000 (NON-PKP default: Rp0 tax)
  });

  // -------------------------------------------------------------
  // 12. NO PAYMENT ACTIVATION OCCURRED
  // -------------------------------------------------------------
  check('12. Live payments are NOT activated (pilot simulation mode remains active)', () => {
    assert.notStrictEqual(process.env.IPAYMU_IS_PRODUCTION, 'true', 'iPaymu must not be in live production mode');
  });

  // -------------------------------------------------------------
  // 13. EXISTING API BEHAVIOR REMAINS INTACT
  // -------------------------------------------------------------
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // Check /health internal endpoint
    const healthRes = await request('/health');
    check('13a. /health internal endpoint returns ARGUS Trust Infrastructure service', () => {
      assert.strictEqual(healthRes.statusCode, 200);
      const json = JSON.parse(healthRes.body);
      assert.strictEqual(json.service, 'ARGUS Trust Infrastructure');
      assert.strictEqual(json.status, 'healthy');
    });

    // Check /api/business-profile endpoint
    const bizRes = await request('/api/business-profile');
    check('13b. /api/business-profile returns canonical TIKUM brand and SHINERVA HQ parent', () => {
      assert.strictEqual(bizRes.statusCode, 200);
      const json = JSON.parse(bizRes.body);
      assert.strictEqual(json.brandName, 'Tikum');
      assert.strictEqual(json.parentEntity, 'SHINERVA HQ');
      assert.strictEqual(json.canonicalDomain, 'https://tikum.app');
    });

    // Check SSR /events page
    const eventsRes = await request('/events');
    check('13c. /events SSR page renders TIKUM brand, https://tikum.app/events canonical link, and ZERO ARGUS', () => {
      assert.strictEqual(eventsRes.statusCode, 200);
      assert.ok(eventsRes.body.includes('Tikum'), 'Missing Tikum brand in /events');
      assert.ok(eventsRes.body.includes('<link rel="canonical" href="https://tikum.app/events">'),
        'Missing canonical https://tikum.app/events in /events');
      assert.strictEqual(/argus/i.test(eventsRes.body), false, '/events SSR page contains forbidden occurrence of ARGUS');
    });

    // Check EventSEOService canonical rendering
    const dummyEvent = {
      event_id: 'test-ev-1',
      canonical_name: 'Coldplay Music of the Spheres Jakarta',
      slug: 'coldplay-jakarta-2026',
      venue_name: 'Gelora Bung Karno',
      city: 'Jakarta',
      date: '2026-11-15',
      organizer_name: 'PK Entertainment',
      description: 'Konser tur dunia Coldplay.',
      official_ticket_url: 'https://coldplayinjakarta.com'
    };
    const ssrHtml = EventSEOService.renderEventPageHtml(dummyEvent, [], []);
    check('13d. EventSEOService renders https://tikum.app/events/:slug canonical link and Event PIC Tikum with ZERO ARGUS', () => {
      assert.ok(ssrHtml.includes('https://tikum.app/events/coldplay-jakarta-2026'));
      assert.ok(ssrHtml.includes('Event PIC Tikum'));
      assert.strictEqual(/argus/i.test(ssrHtml), false, 'SSR event page contains forbidden occurrence of ARGUS');
      for (const forbidden of forbiddenStrings) {
        assert.strictEqual(ssrHtml.includes(forbidden), false, `SSR contains forbidden "${forbidden}"`);
      }
    });

    // Check PWA manifest and robots.txt
    const manifestContent = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
    check('13e. Web App Manifest specifies TIKUM and https://tikum.app/ start_url', () => {
      assert.strictEqual(manifestContent.name, 'TIKUM — Verified Ticket Marketplace');
      assert.strictEqual(manifestContent.short_name, 'TIKUM');
      assert.strictEqual(manifestContent.start_url, 'https://tikum.app/');
    });

    const robotsContent = fs.readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
    check('13f. robots.txt specifies sitemap at https://tikum.app/sitemap.xml', () => {
      assert.ok(robotsContent.includes('Sitemap: https://tikum.app/sitemap.xml'));
    });

    console.log(`\nAll ${passed}/${total} Brand Boundary & Architecture checks PASSED!\n`);
  } finally {
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runBrandBoundaryTests().catch(err => {
    console.error('Brand boundary test failed:', err);
    process.exit(1);
  });
}

module.exports = { runBrandBoundaryTests };
