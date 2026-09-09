/**
 * Tikum & ARGUS Trust Engine — Brand Boundary & Compliance Test Suite
 * 
 * Validates:
 * 1. Brand Architecture Boundary:
 *    - Parent: SHINERVA (SHINERVA HQ)
 *    - Consumer Marketplace: Tikum
 *    - Trust/Escrow/Operations Engine: ARGUS Trust Engine
 * 2. Absolute Absence of Forbidden Public Strings:
 *    - "ARGUS Marketplace"
 *    - "ARGUS Tickets"
 *    - "ARGUS.app"
 *    - "Tikum by ARGUS"
 * 3. Policy-Based Refund Language:
 *    - No unconditional "100% refund guarantee" or absolute claims
 * 4. Canonical Business Information:
 *    - SHINERVA HQ, agunsux@gmail.com, 081299927378, Jl. Pasirluyu No. 79, Bandung 40254
 * 5. Internationalization & Theme Switcher Controls on all public pages
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('./src/server');
const { businessProfile } = require('./src/config/businessProfile');
const { EventSEOService } = require('./src/discovery/EventSEOService');

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
  console.log('  TIKUM & ARGUS — BRAND BOUNDARY TEST SUITE');
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

  // 1. Business Profile Config Test
  check('businessProfile has Tikum brand, SHINERVA HQ parent, and ARGUS Trust Engine', () => {
    assert.strictEqual(businessProfile.brandName, 'Tikum');
    assert.strictEqual(businessProfile.parentEntity, 'SHINERVA HQ');
    assert.strictEqual(businessProfile.engineName, 'ARGUS Trust Engine');
    assert.strictEqual(businessProfile.name, 'SHINERVA HQ');
    assert.strictEqual(businessProfile.email, 'agunsux@gmail.com');
    assert.strictEqual(businessProfile.phone, '081299927378');
  });

  // 2. Public HTML Files Audit
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
    'contact.html'
  ];

  const forbiddenStrings = [
    'ARGUS Marketplace',
    'ARGUS Tickets',
    'ARGUS.app',
    'Tikum by ARGUS'
  ];

  for (const filename of customerFacingFiles) {
    const filePath = path.join(publicDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');

    // Check Consumer Brand
    check(`${filename} contains consumer brand "Tikum"`, () => {
      assert.ok(content.includes('Tikum'), `Missing "Tikum" in ${filename}`);
    });

    // Check absence of forbidden strings
    for (const forbidden of forbiddenStrings) {
      check(`${filename} does NOT contain forbidden string "${forbidden}"`, () => {
        assert.strictEqual(
          content.includes(forbidden),
          false,
          `Found forbidden string "${forbidden}" in ${filename}`
        );
      });
    }

    // Check Canonical Contact Info in Footer
    check(`${filename} contains canonical business contacts`, () => {
      assert.ok(content.includes('SHINERVA HQ'), `Missing "SHINERVA HQ" in ${filename}`);
      assert.ok(content.includes('agunsux@gmail.com'), `Missing email in ${filename}`);
      assert.ok(content.includes('081299927378'), `Missing phone/WA in ${filename}`);
      assert.ok(content.includes('Jl. Pasirluyu No. 79'), `Missing street in ${filename}`);
      assert.ok(content.includes('Bandung 40254'), `Missing city/zip in ${filename}`);
      assert.ok(content.includes('Indonesia'), `Missing country in ${filename}`);
    });

    // Check i18n & Theme Switcher controls
    check(`${filename} contains language & theme switcher controls and i18n script`, () => {
      assert.ok(content.includes('btnLangToggle'), `Missing btnLangToggle in ${filename}`);
      assert.ok(content.includes('btnThemeToggle'), `Missing btnThemeToggle in ${filename}`);
      assert.ok(content.includes('/js/i18n.js'), `Missing i18n.js in ${filename}`);
    });

    // Check that there is no unconditional 100% refund claim
    check(`${filename} does NOT have unconditional "Garansi 100% Refund Tanpa Syarat"`, () => {
      assert.strictEqual(content.includes('Garansi 100% Refund Tanpa Syarat'), false);
      assert.strictEqual(content.includes('Garansi refund 100% tanpa syarat'), false);
      assert.strictEqual(content.includes('100% uang kembali tanpa syarat'), false);
      assert.strictEqual(content.includes('Kebijakan pengembalian dana 100% Tikum'), false);
    });
  }

  // 3. Server-Rendered (SSR) Event Pages Brand Boundary Test
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    const eventsRes = await request('/events');
    check('/events SSR page renders Tikum brand in header and title', () => {
      assert.strictEqual(eventsRes.statusCode, 200);
      assert.ok(eventsRes.body.includes('Tikum'), 'Missing Tikum in /events');
      assert.ok(eventsRes.body.includes('SHINERVA HQ'), 'Missing SHINERVA HQ in /events');
      assert.ok(eventsRes.body.includes('btnLangToggle'), 'Missing lang toggle in /events');
      assert.ok(eventsRes.body.includes('btnThemeToggle'), 'Missing theme toggle in /events');
    });

    // Check EventSEOService rendering
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

    check('EventSEOService renders Tikum in title, meta, and canonical footer', () => {
      assert.ok(ssrHtml.includes('Coldplay Music of the Spheres Jakarta — Jadwal, Lokasi, Tiket Resmi & Resale Terverifikasi | Tikum'));
      assert.ok(ssrHtml.includes('og:site_name" content="Tikum"'));
      assert.ok(ssrHtml.includes('Tikum — by Shinerva'));
      assert.ok(ssrHtml.includes('ARGUS Trust Engine'));
      for (const forbidden of forbiddenStrings) {
        assert.strictEqual(ssrHtml.includes(forbidden), false, `SSR contains forbidden "${forbidden}"`);
      }
    });

    // 4. API Business Profile Endpoint Test
    const bizRes = await request('/api/business-profile');
    check('/api/business-profile returns brand and parent info', () => {
      assert.strictEqual(bizRes.statusCode, 200);
      const data = JSON.parse(bizRes.body);
      assert.strictEqual(data.brandName, 'Tikum');
      assert.strictEqual(data.parentEntity, 'SHINERVA HQ');
      assert.strictEqual(data.engineName, 'ARGUS Trust Engine');
      assert.strictEqual(data.email, 'agunsux@gmail.com');
      assert.strictEqual(data.phone, '081299927378');
    });

    console.log(`\nAll ${passed}/${total} brand boundary checks PASSED!\n`);
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
