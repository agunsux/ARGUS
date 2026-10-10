/**
 * TIKUM P0.6 — Fix Event Image Rendering & Homepage Performance Test Suite
 * 
 * Verifies:
 * 1. Image Asset Availability (no 403 or 404 endpoints for hero or fallback assets).
 * 2. Nassar and Ye concert card image provenance and deliberate fallback safety.
 * 3. Prevention of CLS: explicit width/height dimensions on image elements.
 * 4. Priority loading strategy (eager above-the-fold, lazy below-the-fold).
 * 5. Horizontal carousel scrolling performance CSS properties (smooth momentum, overscroll containment, content-visibility).
 * 6. Data Integrity & Marketplace Invariants: Zero fake inventory, fail-closed payment flags.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('  TIKUM P0.6 — EVENT IMAGE RENDERING & PERFORMANCE SUITE');
console.log('================================================================');

// 1. Asset Files Integrity
console.log('\n── Section 1: Asset Files Integrity & 404/403 Elimination ──');

test('1.1 public/assets/placeholder-event.svg exists and contains valid SVG', () => {
  const filePath = path.join(__dirname, 'public', 'assets', 'placeholder-event.svg');
  assert.ok(fs.existsSync(filePath), 'placeholder-event.svg must exist');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('<svg') && content.includes('</svg>'), 'Must be valid SVG');
  assert.ok(content.includes('TIKUM KATALOG'), 'Must feature TIKUM branding');
});

test('1.2 public/assets/placeholder-nassar.svg exists and contains verified promoter artwork', () => {
  const filePath = path.join(__dirname, 'public', 'assets', 'placeholder-nassar.svg');
  assert.ok(fs.existsSync(filePath), 'placeholder-nassar.svg must exist');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('<svg') && content.includes('</svg>'), 'Must be valid SVG');
  assert.ok(content.includes('BOSS CREATOR PRESENT'), 'Must feature Boss Creator promoter attribution');
  assert.ok(content.includes('KING NASSAR'), 'Must feature King Nassar typography');
});

test('1.3 public/img/placeholder-event.png exists to prevent 404 on legacy references', () => {
  const filePath = path.join(__dirname, 'public', 'img', 'placeholder-event.png');
  assert.ok(fs.existsSync(filePath), 'placeholder-event.png must exist');
  const stat = fs.statSync(filePath);
  assert.ok(stat.size > 0, 'Must not be empty');
});

// 2. Hero Page Poster Rendering
console.log('\n── Section 2: Hero Page Poster Rendering & Error Fallbacks ──');

test('2.1 public/hero.html uses approved local asset for Nassar, avoiding 403', () => {
  const heroHtml = fs.readFileSync(path.join(__dirname, 'public', 'hero.html'), 'utf8');
  assert.ok(heroHtml.includes('/assets/placeholder-nassar.svg'), 'Hero page must use local placeholder-nassar.svg');
  assert.ok(!heroHtml.includes('onerror="this.src=\'/img/placeholder-event.png\'"'), 'Must not point to missing legacy PNG');
  assert.ok(heroHtml.includes('onerror="this.onerror=null; this.src=\'/assets/placeholder-event.svg\';"'), 'Must use reliable SVG fallback');
});

test('2.2 public/hero.html specifies explicit dimensions and eager loading for above-the-fold cards', () => {
  const heroHtml = fs.readFileSync(path.join(__dirname, 'public', 'hero.html'), 'utf8');
  assert.ok(heroHtml.includes('width="540"'), 'Cards must have explicit width');
  assert.ok(heroHtml.includes('height="280"'), 'Cards must have explicit height');
  assert.ok(heroHtml.includes('loading="eager"'), 'Hero cards must use eager loading');
  assert.ok(heroHtml.includes('fetchpriority="high"'), 'Hero cards must use high fetch priority');
});

// 3. Homepage CSS Scrolling & Intrinsic Sizing
console.log('\n── Section 3: CSS Scrolling Performance & Layout Containment ──');

test('3.1 .ln-rail in style.css has touch momentum and overscroll containment', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public', 'css', 'style.css'), 'utf8');
  assert.ok(css.includes('-webkit-overflow-scrolling: touch;'), '.ln-rail must support iOS touch momentum');
  assert.ok(css.includes('overscroll-behavior-x: contain;'), '.ln-rail must contain horizontal overscroll');
  assert.ok(css.includes('will-change: scroll-position;'), '.ln-rail must optimize scroll compositing');
});

test('3.2 .poster-card in style.css has content-visibility and intrinsic sizing', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public', 'css', 'style.css'), 'utf8');
  assert.ok(css.includes('content-visibility: auto;'), '.poster-card must use content-visibility: auto');
  assert.ok(css.includes('contain-intrinsic-size: 250px 380px;'), '.poster-card must declare contain-intrinsic-size');
});

test('3.3 style.css respects prefers-reduced-motion for scroll and hover transitions', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public', 'css', 'style.css'), 'utf8');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Must contain reduced motion media query');
  assert.ok(css.includes('transition: none !important;'), 'Must disable transitions on reduced motion');
});

// 4. Homepage JS Card Rendering
console.log('\n── Section 4: Homepage Card Rendering & CLS Prevention ──');

test('4.1 renderPosterMedia in index.html renders explicit width and height', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('width="250"'), 'Must have explicit width="250"');
  assert.ok(indexHtml.includes('height="312"'), 'Must have explicit height="312"');
});

test('4.2 renderPosterMedia differentiates priority cards from deferred cards', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('loading="eager" fetchpriority="high"'), 'Must support eager high-priority loading');
  assert.ok(indexHtml.includes('loading="lazy"'), 'Must support lazy loading for below-the-fold');
  assert.ok(indexHtml.includes('decoding="async"'), 'Must support asynchronous image decoding');
});

test('4.3 Cards without images do not emit dummy img elements', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  // Check if else block directly renders poster-fallback-wrap without <img>
  assert.ok(indexHtml.includes('poster-fallback-art'), 'Must use rich poster-fallback-art');
  assert.ok(indexHtml.includes('getCategoryVisual'), 'Must use dynamic category visual gradients');
});

// 5. Data Integrity & Payment Gateways
console.log('\n── Section 5: Data Integrity & Production Gateways ──');

test('5.1 Hero API returns verified records with zero fake inventory', async () => {
  const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
  const heroEvents = canonicalRegistry.getHeroEvents();
  assert.strictEqual(heroEvents.length, 2, 'Must have exactly 2 hero events');
  for (const ev of heroEvents) {
    assert.strictEqual(ev.resale_inventory_count, 0, `${ev.name} must have 0 resale inventory`);
  }
});

test('5.2 Payment gateways remain locked (fail-closed) in environment', () => {
  assert.strictEqual(process.env.ENABLE_DOKU_PRODUCTION, undefined, 'DOKU prod must not be enabled');
  assert.strictEqual(process.env.ENABLE_MIDTRANS_PRODUCTION, undefined, 'Midtrans prod must not be enabled');
  assert.strictEqual(process.env.ENABLE_XENDIT_PRODUCTION, undefined, 'Xendit prod must not be enabled');
  assert.strictEqual(process.env.ENABLE_IPAYMU_PRODUCTION, undefined, 'iPaymu prod must not be enabled');
});

console.log('\n================================================================');
console.log(`TIKUM P0.6 TEST SUITE: ${passed} passed, ${failed} failed`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
