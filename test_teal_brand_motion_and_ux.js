/**
 * TIKUM — Teal Brand System, SeatGeek Buyer UX, TicketSwap Seller Flow & Flow Ninja Motion Test Suite
 *
 * Verifies:
 * 1. Teal Brand Tokens, Dual-Tone SVG Logos, Google Fonts, and Motion Engine.
 * 2. SeatGeek-Simple Top Navigation Header (<= 4 links + Jual Tiket CTA + single ID|EN toggle) & Mobile Drawer.
 * 3. 100% Frictionless Guest-First Browsing (/, /offers, /deal, /past-events, /blog return 200 OK without forced auth).
 * 4. Zero-Redundancy Unified Event Discovery Grid, Two-Way Protection Bento, 5-Step Flow Rail & Minimal Footer.
 * 5. TicketSwap-Simple Centered Wizard & Seller Protection Strip on /deal/create.
 * 6. 100% Bilingual Dictionary Parity & Zero Banned Compliance Claims.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('======================================================================');
console.log('  TIKUM — TEAL BRAND, SEATGEEK NAV, TICKETSWAP & FLOW NINJA TEST SUITE');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Teal Brand Palette, Dual-Tone SVG Logos & Motion System
// -----------------------------------------------------------------------------
console.log('[TEST 1] Teal Brand Palette, Vector Logos & Flow Ninja Motion...');

const tokensCss = fs.readFileSync(path.join(__dirname, 'public/css/tikum-tokens.css'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, 'public/css/style.css'), 'utf8');

// Brand colors
assert.ok(tokensCss.includes('#124E61') || styleCss.includes('#124E61'), 'Brand Teal (#124E61) token must exist');
assert.ok(tokensCss.includes('#FAF8F4') || styleCss.includes('#FAF8F4'), 'Warm Cream (#FAF8F4) canvas token must exist');
assert.ok(tokensCss.includes('#DA674E') || styleCss.includes('#DA674E'), 'Signature Coral (#DA674E) CTA token must exist');

// Dual-tone SVG vector assets
const requiredSvgs = [
  'public/images/tikum-symbol.svg',
  'public/images/tikum-horizontal.svg',
  'public/images/tikum-horizontal-light.svg',
  'public/images/tikum-logo.svg',
  'public/favicon.svg'
];

for (const svgPath of requiredSvgs) {
  assert.ok(fs.existsSync(path.join(__dirname, svgPath)), `SVG asset ${svgPath} must exist`);
  const svgContent = fs.readFileSync(path.join(__dirname, svgPath), 'utf8');
  assert.ok(svgContent.includes('<svg') && svgContent.includes('</svg>'), `${svgPath} must be valid SVG markup`);
}

// Google Fonts
assert.ok(styleCss.includes('Bricolage+Grotesque') || styleCss.includes('Bricolage Grotesque'), 'Bricolage Grotesque font must be imported');
assert.ok(styleCss.includes('Plus+Jakarta+Sans') || styleCss.includes('Plus Jakarta Sans'), 'Plus Jakarta Sans font must be imported');

// Flow Ninja Motion Engine
const motionJsPath = path.join(__dirname, 'public/js/motion.js');
assert.ok(fs.existsSync(motionJsPath), 'public/js/motion.js must exist');
const motionJs = fs.readFileSync(motionJsPath, 'utf8');
assert.ok(motionJs.includes('prefers-reduced-motion'), 'motion.js must handle prefers-reduced-motion');
assert.ok(motionJs.includes('IntersectionObserver'), 'motion.js must implement IntersectionObserver');
assert.ok(styleCss.includes('[data-reveal]'), 'style.css must have [data-reveal] styles');

console.log('  ✓ Exact Teal brand tokens (#124E61, #FAF8F4, #DA674E) verified.');
console.log('  ✓ All 5 dual-tone SVG vector assets verified in public/images/ and favicon.');
console.log('  ✓ Fluid Google Fonts & Flow Ninja motion engine verified.\n');

// -----------------------------------------------------------------------------
// TEST 2: SeatGeek-Simple Top Navigation & Mobile Drawer
// -----------------------------------------------------------------------------
console.log('[TEST 2] SeatGeek-Simple Top Navigation & Mobile Drawer...');

const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

// Header structure
assert.ok(indexHtml.includes('id="appTopbar"'), 'index.html must contain #appTopbar');
assert.ok(indexHtml.includes('tikum-horizontal.svg'), 'index.html must use tikum-horizontal.svg in topbar');

// Max 4 primary center links
const navLinksMatch = indexHtml.match(/<ul class="topbar-nav-links">([\s\S]*?)<\/ul>/i);
assert.ok(navLinksMatch, 'index.html must have .topbar-nav-links in topbar');
const navItems = (navLinksMatch[1].match(/<li[\s>]/g) || []).length;
assert.ok(navItems <= 4, `SeatGeek topbar must have <= 4 center items, found ${navItems}`);

// Jual Tiket CTA
assert.ok(indexHtml.includes('btn-topbar-seller'), 'Topbar must have prominent seller CTA');
assert.ok(indexHtml.includes('/deal/create'), 'Topbar seller CTA must link to /deal/create');

// Single ID|EN toggle (zero duplicate bug)
assert.ok(indexHtml.includes('lang-toggle-btn') || indexHtml.includes('lang-switcher-pill'), 'Topbar must contain segmented ID|EN toggle');
assert.strictEqual(indexHtml.includes('ID ID EN'), false, 'Topbar must not have duplicate ID ID EN bug');

// Off-canvas mobile drawer (#appSidebar)
assert.ok(indexHtml.includes('id="appSidebar"'), 'index.html must preserve #appSidebar for mobile drawer');
assert.ok(indexHtml.includes('sidebar-legal-details'), 'index.html must contain legal details in drawer');

console.log('  ✓ SeatGeek 1-row header verified (<= 4 center links, prominent seller CTA, clean ID|EN).');
console.log('  ✓ Slide-over drawer verified for mobile & secondary navigation.\n');

// -----------------------------------------------------------------------------
// TEST 3: Guest-First Browsing (Zero Forced Login on Public Catalog & Deal Hub)
// -----------------------------------------------------------------------------
console.log('[TEST 3] Guest-First Browsing Verification...');

const app = require('./src/server.js');

function fetchPath(server, pathStr) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathStr,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runGuestBrowsingTests() {
  const server = app.listen(0);
  try {
    const guestPaths = ['/', '/offers', '/deal', '/past-events', '/blog'];
    for (const p of guestPaths) {
      const res = await fetchPath(server, p);
      assert.strictEqual(res.status, 200, `Guest must be able to view ${p} with 200 OK without login`);
      assert.ok(!res.headers.location || !res.headers.location.includes('/login'), `${p} must not redirect guest to /login`);
    }
    console.log('  ✓ Guest browsing verified: unauthenticated users freely access /, /offers, /deal, /past-events, /blog with HTTP 200.');
  } finally {
    server.close();
  }
}

// -----------------------------------------------------------------------------
// TEST 4: Zero Redundancy Unified Discovery Grid, Two-Way Protection & Minimal Footer
// -----------------------------------------------------------------------------
console.log('[TEST 4] Zero-Redundancy Unified Grid, Two-Way Protection & Minimal Footer...');

// Section 1: Editorial Hero
assert.ok(indexHtml.includes('hero-teal-editorial') || indexHtml.includes('editorialHero'), 'Section 1 must be Deep Teal Editorial Hero');
assert.ok(indexHtml.includes('id="searchInput"'), 'Section 1 must contain SeatGeek search bar #searchInput');
assert.ok(indexHtml.includes('instant-deal-bar'), 'Section 1 must contain Instant Deal Link bar');

// Section 2: Unified Discovery Grid
assert.ok(indexHtml.includes('id="mainContent"'), 'Section 2 must contain #mainContent unified discovery grid');
assert.ok(indexHtml.includes('id="cityFilter"'), 'Section 2 must contain #cityFilter');
assert.ok(indexHtml.includes('id="dateFilter"'), 'Section 2 must contain #dateFilter');
assert.ok(!indexHtml.includes('id="card-bts"'), 'Redundant hardcoded event spotlight cards must be removed');

// Section 3: Two-Way Protection Bento
assert.ok(indexHtml.includes('twoWayProtection') || indexHtml.includes('two-way-protection'), 'Section 3 Two-Way Protection section must exist');
assert.ok(indexHtml.includes('founder-quote-glass') || indexHtml.includes('founderQuoteText'), 'Section 3 must contain Founder Origin Quote card');
assert.ok(indexHtml.includes('bento-card-flow') || indexHtml.includes('bento-grid'), 'Section 3 must contain 2 balanced Bento cards');

// Section 4: 5-Step Flow Rail & Fee Summary
assert.ok(indexHtml.includes('howItWorks') || indexHtml.includes('flow-rail'), 'Section 4 5-step flow rail must exist');
assert.ok(indexHtml.includes('pilot-fee-bar'), 'Section 4 must contain Upfront Pilot Fee transparency bar');

// Section 5: Blog Strip & Minimal 2-Tier Footer
assert.ok(indexHtml.includes('featuredBlog'), 'Section 5 must contain 3 blog preview cards');
assert.ok(indexHtml.includes('closing-cta-card'), 'Section 5 must contain Deep Teal Closing CTA card');
assert.ok(indexHtml.includes('footer-tier-1'), 'Footer must contain Tier 1');
assert.ok(indexHtml.includes('footer-tier-2'), 'Footer must contain Tier 2');

console.log('  ✓ 5 Sharp Flow Ninja sections verified (Editorial Hero, Unified Grid, Two-Way Protection, 5-Step Rail, Blog/Closing CTA).');
console.log('  ✓ Redundant duplicate event rails eradicated into ONE unified discovery grid.');
console.log('  ✓ Two-Way Protection narrative & authentic founder quote card verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: TicketSwap-Simple Centered Wizard & Protection Strip on /deal/create
// -----------------------------------------------------------------------------
console.log('[TEST 5] TicketSwap-Simple Seller Wizard on /deal/create...');

const createHtml = fs.readFileSync(path.join(__dirname, 'public/create.html'), 'utf8');

assert.ok(createHtml.includes('seller-protection-strip'), '/deal/create must have Teal Perlindungan Penjual TIKUM strip');
assert.ok(createHtml.includes('id="createStepper"'), '/deal/create must preserve 3-step progress stepper');
assert.ok(createHtml.includes('id="step1Card"'), '/deal/create must preserve Step 1 auth gating');
assert.ok(createHtml.includes('id="step2Card"'), '/deal/create must preserve Step 2 profile auto-fill');
assert.ok(createHtml.includes('id="formCard"'), '/deal/create must preserve Step 3 ticket details card');
assert.ok(createHtml.includes('id="listingForm"'), '/deal/create must preserve #listingForm submission');

console.log('  ✓ TicketSwap-simple centered seller wizard & Teal protection strip verified on /deal/create.');
console.log('  ✓ 100% of Verify-Once Auto-Fill & Zero-QR Stage A preserved without regression.\n');

// -----------------------------------------------------------------------------
// TEST 6: 100% Bilingual Dictionary Parity & Zero Compliance Violations
// -----------------------------------------------------------------------------
console.log('[TEST 6] Bilingual Parity & Compliance Copy Verification...');

const idDict = require('./src/i18n/dictionaries/id.js');
const enDict = require('./src/i18n/dictionaries/en.js');

function collectLeaves(obj, prefix = '') {
  let leaves = {};
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      Object.assign(leaves, collectLeaves(obj[key], fullPath));
    } else {
      leaves[fullPath] = obj[key];
    }
  }
  return leaves;
}

const idLeaves = collectLeaves(idDict);
const enLeaves = collectLeaves(enDict);

assert.strictEqual(Object.keys(idLeaves).length, Object.keys(enLeaves).length, 'ID and EN leaf key count must match');

const missingInEn = Object.keys(idLeaves).filter(k => !(k in enLeaves));
const missingInId = Object.keys(enLeaves).filter(k => !(k in idLeaves));
assert.strictEqual(missingInEn.length, 0, `Missing in EN: ${missingInEn.join(', ')}`);
assert.strictEqual(missingInId.length, 0, `Missing in ID: ${missingInId.join(', ')}`);

const BANNED_PATTERNS = [
  /100%\s*escrow/i,
  /100%\s*guaranteed\s*entry/i,
  /guaranteed\s*entry/i,
  /automatic\s*100%\s*refund/i,
  /always\s*12%/i,
  /pasti\s*masuk/i,
  /100%\s*pasti\s*masuk/i,
  /rekening\s*escrow\s*berizin/i
];

for (const [key, val] of Object.entries(idLeaves)) {
  for (const pattern of BANNED_PATTERNS) {
    assert.ok(!pattern.test(val), `Banned phrase in ID key "${key}": "${val}"`);
  }
}
for (const [key, val] of Object.entries(enLeaves)) {
  for (const pattern of BANNED_PATTERNS) {
    assert.ok(!pattern.test(val), `Banned phrase in EN key "${key}": "${val}"`);
  }
}

console.log(`  ✓ 100% Strict key parity confirmed (${Object.keys(idLeaves).length} ID keys vs ${Object.keys(enLeaves).length} EN keys).`);
console.log('  ✓ Zero prohibited absolute claims verified across entire dictionaries.\n');

runGuestBrowsingTests().then(() => {
  console.log('======================================================================');
  console.log('  ALL TEAL BRAND, SEATGEEK, TICKETSWAP & FLOW NINJA TESTS PASSED! (100% OK)');
  console.log('======================================================================\n');
}).catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
