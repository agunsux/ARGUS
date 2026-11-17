/**
 * TIKUM — EPIC P1.1: EVENT VISUAL RESPONSIVENESS & AUTOMATIC EVENT LIFECYCLE
 * Comprehensive Verification & Regression Test Suite
 *
 * Test Matrix:
 * 1. Poster Integrity & Media Container Contract
 *    - MCR poster renders intact as 3:4 SVG with no text/metadata leakage into artwork box
 *    - All spotlight hero cards use valid <img> tags in 3:4 portrait ratio
 *    - renderPosterMedia outputs clean 3:4 <img> without .poster-fallback-art text injection
 * 2. Responsive Event Card & Viewport Contract
 *    - .poster-media aspect-ratio: 3 / 4
 *    - .hero-spotlight-section .poster-wrap aspect-ratio: 3 / 4; height: auto
 *    - .hero-spotlight-section .poster-img object-fit: contain on neutral dark background
 *    - Responsive media queries for <= 768px and <= 480px (grid-template-columns: 1fr)
 *    - Mobile 360px fit verification (no horizontal overflow)
 * 3. Automatic Event Lifecycle & Dynamic Rotation Engine
 *    - Temporal clock travel (Nov 18 -> Nov 22 -> Nov 29 -> Dec 07 -> Dec 30)
 *    - Concluded events automatically drop from hero spotlight and upcoming pools
 *    - Next upcoming events advance dynamically
 *    - Multi-day event retention until final day
 * 4. Safety & Marketplace Invariants
 *    - PAYMENT_GATEWAY_FROZEN remains true
 *    - Zero Fake Inventory preserved across cards
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const express = require('express');

if (!process.env.PAYMENT_GATEWAY_FROZEN) {
  process.env.PAYMENT_GATEWAY_FROZEN = 'true';
}

const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { HeroSelectionService } = require('./src/discovery/HeroSelectionService');
const { EventTemporalLifecycleEngine } = require('./src/discovery/EventTemporalLifecycleEngine');
const { EventVisualProvenanceService } = require('./src/discovery/EventVisualProvenanceService');
const { isPaymentGatewayFrozen } = require('./src/config/marketplaceMode');
const discoveryRouter = require('./src/discovery/discoveryRouter');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗ [FAIL]\x1b[0m ${name}`);
    console.error(`      Error: ${err.message}`);
    failed++;
  }
}

async function runVisualLifecycleMatrix() {
  console.log('========================================================================');
  console.log('TIKUM — EPIC P1.1: EVENT VISUAL RESPONSIVENESS & AUTOMATIC EVENT LIFECYCLE');
  console.log('========================================================================\n');

  // Start temporary express server for route checks
  const app = express();
  app.use(discoveryRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: POSTER INTEGRITY & MEDIA CONTAINER CONTRACT
    // -------------------------------------------------------------------------
    console.log('── Section 1: Poster Integrity & Media Container Contract ──');

    await test('1.1 GET /api/events/my-chemical-romance-jakarta-2026/poster.svg returns 200 with 3:4 SVG', async () => {
      const res = await fetch(`${baseUrl}/api/events/my-chemical-romance-jakarta-2026/poster.svg`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
      const body = await res.text();
      assert.ok(body.includes('<svg'), 'Response must be valid SVG');
      assert.ok(body.includes('viewBox="0 0 600 800"'), 'SVG must have 3:4 portrait viewBox (600x800)');
      assert.ok(body.includes('My Chemical Romance'), 'Poster must contain artist/title');
      assert.ok(body.includes('Jakarta International Stadium'), 'Poster must contain venue');
      assert.ok(body.includes('TIKUM VERIFIED'), 'Poster must carry verified brief mark');
    });

    await test('1.2 public/index.html #card-mcr uses standard 3:4 <img> tag with zero text-overlay leakage', () => {
      const html = fs.readFileSync('./public/index.html', 'utf8');
      const mcrCardMatch = html.match(/<article[^>]+id="card-mcr"[^>]*>([\s\S]*?)<\/article>/i);
      assert.ok(mcrCardMatch, 'card-mcr article must exist in HTML');
      const mcrCardHtml = mcrCardMatch[1];

      // Must have img inside poster-wrap
      assert.ok(mcrCardHtml.includes('<img'), 'card-mcr must contain an <img> tag');
      assert.ok(mcrCardHtml.includes('/api/events/my-chemical-romance-jakarta-2026/poster.svg'), 'card-mcr must point to MCR 3:4 poster SVG');
      assert.ok(!mcrCardHtml.includes('fa-skull'), 'card-mcr poster-wrap must not contain the faux skull icon div');
      assert.ok(!mcrCardHtml.includes('linear-gradient(135deg, #18181b'), 'card-mcr must not contain hardcoded text gradient div');

      // The textual title and metadata must exist strictly in card-body, not poster-wrap
      const posterWrapMatch = mcrCardHtml.match(/<div class="poster-wrap">([\s\S]*?)<\/div>/i);
      assert.ok(posterWrapMatch, 'poster-wrap must exist');
      const posterWrapContent = posterWrapMatch[1];
      assert.ok(!posterWrapContent.includes('LIVE IN JAKARTA'), 'poster-wrap must not leak LIVE IN JAKARTA text');
      assert.ok(!posterWrapContent.includes('My Chemical Romance</div>'), 'poster-wrap must not leak raw text title div');
    });

    await test('1.3 All spotlight hero cards (BTS, BIGBANG, Efestaphoria, MCR, GNR) have 3:4 portrait <img> tags', () => {
      const html = fs.readFileSync('./public/index.html', 'utf8');
      const cardIds = ['card-bts', 'card-bigbang', 'card-efestaphoria', 'card-mcr', 'card-gnr'];
      for (const cid of cardIds) {
        const cardMatch = html.match(new RegExp(`<article[^>]+id="${cid}"[^>]*>([\\s\\S]*?)<\\/article>`, 'i'));
        assert.ok(cardMatch, `${cid} must exist in index.html`);
        const cardHtml = cardMatch[1];
        assert.ok(cardHtml.includes('<img'), `${cid} must contain <img> tag`);
        assert.ok(cardHtml.includes('class="poster-img"'), `${cid} <img> must have class poster-img`);
        assert.ok(cardHtml.includes('height="720"'), `${cid} <img> must have 3:4 aspect height="720"`);
      }
    });

    await test('1.4 EventVisualProvenanceService validates local SVG routes as trusted local assets', () => {
      const paths = [
        '/assets/placeholder-event.svg',
        '/assets/posters/bts-arirang-world-tour-jakarta-2026.svg',
        '/api/events/my-chemical-romance-jakarta-2026/poster.svg',
        '/api/discovery/events/event-gnr-jakarta-2026/poster.svg',
        '/events/the-15th-efestaphoria-surabaya-2026/poster.svg'
      ];
      for (const p of paths) {
        const check = EventVisualProvenanceService.validateImageUrl(p);
        assert.strictEqual(check.valid, true, `Path ${p} must be recognized as valid`);
        assert.strictEqual(check.is_local_official_asset, true, `Path ${p} must be marked local official asset`);
      }
    });

    // -------------------------------------------------------------------------
    // SECTION 2: RESPONSIVE EVENT CARD & VIEWPORT CONTRACT
    // -------------------------------------------------------------------------
    console.log('\n── Section 2: Responsive Event Card & Viewport Contract ──');

    await test('2.1 CSS enforces exact 3:4 portrait aspect-ratio on .poster-media and .poster-wrap', () => {
      const css = fs.readFileSync('./public/css/style.css', 'utf8');
      assert.ok(css.includes('.poster-media {') && css.includes('aspect-ratio: 3 / 4;'), '.poster-media must specify aspect-ratio: 3 / 4');
      assert.ok(css.includes('.hero-spotlight-section .poster-wrap {') && css.includes('aspect-ratio: 3 / 4;'), '.poster-wrap must specify aspect-ratio: 3 / 4');
      assert.ok(!css.includes('height: 280px;'), 'Fixed height 280px must be removed to avoid distortion');
    });

    await test('2.2 CSS uses object-fit: contain on neutral dark background (#0f172a)', () => {
      const css = fs.readFileSync('./public/css/style.css', 'utf8');
      assert.ok(css.includes('.poster-media img {') && css.includes('object-fit: contain;'), '.poster-media img must have object-fit: contain');
      assert.ok(css.includes('.hero-spotlight-section .poster-img {') && css.includes('object-fit: contain;'), '.hero-spotlight-section .poster-img must have object-fit: contain');
      assert.ok(css.includes('background-color: #0f172a;') || css.includes('background: #0f172a;'), 'Dark container background must be #0f172a');
    });

    await test('2.3 CSS includes responsive mobile rules preventing horizontal overflow on 360px viewport', () => {
      const css = fs.readFileSync('./public/css/style.css', 'utf8');
      assert.ok(css.includes('@media (max-width: 480px)'), 'Mobile media query (max-width: 480px) must exist');
      assert.ok(css.includes('grid-template-columns: 1fr;'), 'Mobile view must collapse main-grid to single column 1fr');
      assert.ok(css.includes('padding: 0 0.75rem'), 'Mobile padding must be comfortable without horizontal scroll');
    });

    // -------------------------------------------------------------------------
    // SECTION 3: AUTOMATIC EVENT LIFECYCLE & DYNAMIC ROTATION ENGINE
    // -------------------------------------------------------------------------
    console.log('\n── Section 3: Automatic Event Lifecycle & Dynamic Rotation Engine ──');

    await test('3.1 Baseline As Of 2026-11-18: GNR, MCR, and nearest upcoming events are active upcoming heroes', () => {
      const asOf = new Date('2026-11-18T12:00:00+07:00');
      const selection = HeroSelectionService.selectHeroConcerts(asOf);
      assert.ok(selection.heroes.length >= 4, `Expected at least 4 hero concerts, got ${selection.heroes.length}`);
      const slugs = selection.heroes.map(h => h.slug);
      assert.ok(slugs.includes('guns-n-roses-jakarta-2026'), 'GNR must be in upcoming heroes on Nov 18');
      assert.ok(slugs.includes('my-chemical-romance-jakarta-2026'), 'MCR must be in upcoming heroes on Nov 18');
      assert.ok(slugs.includes('the-15th-efestaphoria-surabaya-2026') || slugs.includes('doh-kyung-soo-day-off-jakarta-2026'), 'Upcoming verified event must be in heroes on Nov 18');
    });

    await test('3.2 Time Travel to 2026-11-22: GNR (concluded Nov 21) drops; MCR advances to #1 nearest hero', () => {
      const asOf = new Date('2026-11-22T08:00:00+07:00');
      const gnrEvent = canonicalRegistry.getEventById('event-gnr-jakarta-2026');
      assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(gnrEvent, asOf), false, 'GNR must be concluded on Nov 22');

      const selection = HeroSelectionService.selectHeroConcerts(asOf);
      const slugs = selection.heroes.map(h => h.slug);
      assert.ok(!slugs.includes('guns-n-roses-jakarta-2026'), 'Concluded GNR concert must NOT be in active heroes on Nov 22');
      assert.strictEqual(selection.primaryHero.slug, 'my-chemical-romance-jakarta-2026', 'MCR (Nov 28) must advance to primary hero on Nov 22');
    });

    await test('3.3 Time Travel to 2026-11-29: MCR (concluded Nov 28) drops; next upcoming concerts advance', () => {
      const asOf = new Date('2026-11-29T08:00:00+07:00');
      const mcrEvent = canonicalRegistry.getEventById('event-mcr-jakarta-2026');
      assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(mcrEvent, asOf), false, 'MCR must be concluded on Nov 29');

      const selection = HeroSelectionService.selectHeroConcerts(asOf);
      const slugs = selection.heroes.map(h => h.slug);
      assert.ok(!slugs.includes('my-chemical-romance-jakarta-2026'), 'Concluded MCR concert must NOT be in active heroes on Nov 29');
      assert.ok(!slugs.includes('guns-n-roses-jakarta-2026'), 'Concluded GNR concert must NOT be in active heroes on Nov 29');
      assert.ok(selection.primaryHero, 'Primary hero must be present on Nov 29');
      assert.ok(slugs.includes('the-15th-efestaphoria-surabaya-2026') || slugs.includes('syahrini-aku-kembali-2026'), 'Upcoming December event must advance');
    });

    await test('3.4 Time Travel to 2026-12-07: Efestaphoria drops; BTS advances to primary hero', () => {
      const asOf = new Date('2026-12-07T08:00:00+07:00');
      const efestaEvent = canonicalRegistry.getEventById('event-efestaphoria-2026');
      assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(efestaEvent, asOf), false, 'Efestaphoria must be concluded on Dec 07');

      const selection = HeroSelectionService.selectHeroConcerts(asOf);
      const slugs = selection.heroes.map(h => h.slug);
      assert.ok(!slugs.includes('the-15th-efestaphoria-surabaya-2026'), 'Efestaphoria must NOT be in active heroes on Dec 07');
      assert.ok(selection.primaryHero.slug.includes('bts'), 'BTS (Dec 26-29) must advance to primary hero on Dec 07');
    });

    await test('3.5 Multi-day residency rule: BTS is active on Dec 28, but strictly concluded on Dec 30', () => {
      const btsEvent = canonicalRegistry.getEventById('bts-world-tour-arirang-jakarta-2026') ||
        canonicalRegistry.getEventById('ev-can-fd86cf7d');
      assert.ok(btsEvent, 'BTS event must exist');

      // During residency (Dec 28)
      const during = new Date('2026-12-28T20:00:00+07:00');
      assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(btsEvent, during), true, 'BTS must remain upcoming/active during multi-day run on Dec 28');

      // After residency (Dec 30)
      const after = new Date('2026-12-30T10:00:00+07:00');
      assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(btsEvent, after), false, 'BTS must conclude after final night (Dec 30)');
    });

    // -------------------------------------------------------------------------
    // SECTION 4: SAFETY & PLATFORM INVARIANTS
    // -------------------------------------------------------------------------
    console.log('\n── Section 4: Safety & Platform Invariants ──');

    await test('4.1 PAYMENT_GATEWAY_FROZEN invariant remains strictly true', () => {
      assert.strictEqual(isPaymentGatewayFrozen(), true, 'Payment gateway must remain frozen');
      assert.strictEqual(process.env.PAYMENT_GATEWAY_FROZEN, 'true', 'PAYMENT_GATEWAY_FROZEN env must be true');
    });

    await test('4.2 Zero Fake Inventory invariant is present across all cards', () => {
      const html = fs.readFileSync('./public/index.html', 'utf8');
      const matches = html.match(/Zero Fake Inventory/g);
      assert.ok(matches && matches.length >= 5, 'Zero Fake Inventory cue must appear on every hero card');
    });

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(`TIKUM EVENT VISUAL & LIFECYCLE MATRIX: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runVisualLifecycleMatrix().catch(err => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
