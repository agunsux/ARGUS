const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('================================================================');
  console.log('  TIKUM — POSTER PROVENANCE & CANONICAL INTEGRITY SUITE');
  console.log('================================================================\n');

  console.log('── Section 1: Static Poster Assets & Visual Truthfulness ──');
  test('1.1 BTS SVG poster has no unauthorized promoter presentation and uses Event Brief', () => {
    const p1 = path.join(__dirname, 'public', 'assets', 'posters', 'bts-world-tour-arirang-jakarta-2026.svg');
    const p2 = path.join(__dirname, 'public', 'assets', 'posters', 'bts-arirang-world-tour-jakarta-2026.svg');
    assert.ok(fs.existsSync(p1), 'bts-world-tour-arirang-jakarta-2026.svg must exist');
    assert.ok(fs.existsSync(p2), 'bts-arirang-world-tour-jakarta-2026.svg must exist');
    const content = fs.readFileSync(p1, 'utf8');
    assert.ok(content.includes('<svg'), 'Must be valid SVG');
    assert.ok(content.includes('BTS WORLD TOUR'), 'Must contain concert title');
    assert.ok(!content.includes('BIGHIT MUSIC &amp; HYBE PRESENT'), 'Must not claim promoter presentation');
    assert.ok(content.includes('TIKUM EVENT BRIEF'), 'Must indicate neutral Event Brief placeholder');
    assert.ok(content.includes('POSTER RESMI BELUM DITERBITKAN'), 'Must state official poster not yet published');
  });

  test('1.2 BIGBANG SVG poster has no crown motif or promoter claim and uses Event Brief', () => {
    const p = path.join(__dirname, 'public', 'assets', 'posters', 'bigbang-cosmos-tour-jakarta-2027.svg');
    assert.ok(fs.existsSync(p), 'bigbang-cosmos-tour-jakarta-2027.svg must exist');
    const content = fs.readFileSync(p, 'utf8');
    assert.ok(content.includes('<svg'), 'Must be valid SVG');
    assert.ok(content.includes('BIGBANG'), 'Must contain BIGBANG');
    assert.ok(!content.includes('YG ENTERTAINMENT &amp; APPLEWOOD'), 'Must not claim promoter presentation');
    assert.ok(!content.includes('M -40,20 L -25,-20'), 'Crown motif must be removed');
    assert.ok(!content.includes('TERVERIFIKASI SUMBER RESMI PROMOTOR'), 'Must not claim promoter verified poster');
    assert.ok(content.includes('TIKUM EVENT BRIEF'), 'Must indicate neutral Event Brief placeholder');
    assert.ok(content.includes('POSTER RESMI BELUM DITERBITKAN'), 'Must state official poster not yet published');
  });

  console.log('\n── Section 2: Verified Image Provenance Governance ──');
  const { EventVisualProvenanceService } = require('./src/discovery/EventVisualProvenanceService');

  test('2.1 BTS and BIGBANG are classified as BRANDED_FALLBACK with is_fallback_image: true', () => {
    const bts = EventVisualProvenanceService.resolveCatalogEventImageProvenance({ id: 'bts-world-tour-arirang-jakarta-2026' }, {});
    assert.strictEqual(bts.image_status, 'BRANDED_FALLBACK', 'BTS must be BRANDED_FALLBACK');
    assert.strictEqual(bts.is_fallback_image, true, 'BTS must be fallback image');

    const bigbang = EventVisualProvenanceService.resolveCatalogEventImageProvenance({ id: 'bigbang-cosmos-tour-jakarta-2027' }, {});
    assert.strictEqual(bigbang.image_status, 'BRANDED_FALLBACK', 'BIGBANG must be BRANDED_FALLBACK');
    assert.strictEqual(bigbang.is_fallback_image, true, 'BIGBANG must be fallback image');
  });

  test('2.2 Official organizer & ticket partner banners retain genuine verified status', () => {
    const gnr = EventVisualProvenanceService.resolveCatalogEventImageProvenance({ id: 'event-gnr-jakarta-2026' }, {});
    assert.strictEqual(gnr.image_status, 'VERIFIED_OFFICIAL', 'GNR must be VERIFIED_OFFICIAL');
    assert.strictEqual(gnr.is_fallback_image, false, 'GNR is not fallback');

    const dwp = EventVisualProvenanceService.resolveCatalogEventImageProvenance({ id: 'event-dwp-2026' }, {});
    assert.strictEqual(dwp.image_status, 'VERIFIED_OFFICIAL', 'DWP must be VERIFIED_OFFICIAL');
    assert.strictEqual(dwp.is_fallback_image, false, 'DWP is not fallback');

    const maroon = EventVisualProvenanceService.resolveCatalogEventImageProvenance({ id: 'ev-can-30949569' }, {});
    assert.strictEqual(maroon.image_status, 'VERIFIED_OFFICIAL', 'Maroon 5 must be VERIFIED_OFFICIAL');
    assert.strictEqual(maroon.is_fallback_image, false, 'Maroon 5 is not fallback');

    const joyland = EventVisualProvenanceService.resolveCatalogEventImageProvenance({ id: 'ev-can-joyland-sessions-2026' }, {});
    assert.strictEqual(joyland.image_status, 'VERIFIED_AUTHORIZED_SELLER', 'Joyland must be VERIFIED_AUTHORIZED_SELLER');
    assert.strictEqual(joyland.is_fallback_image, false, 'Joyland is not fallback');
  });

  console.log('\n── Section 3: Canonical Event Deduplication & Alias Resolution ──');
  const { CanonicalEventRegistry } = require('./src/discovery/CanonicalEventRegistry');
  const registry = new CanonicalEventRegistry();

  test('3.1 Registry resolves DWP alias slugs and IDs to primary canonical event', () => {
    registry.createEvent({
      id: 'event-dwp-2026',
      slug: 'djakarta-warehouse-project-dwp-2026',
      canonical_name: 'Djakarta Warehouse Project (DWP 2026)',
      start_date: '2026-12-11',
      venue_name: 'JIExpo Kemayoran',
      metadata: {
        alias_ids: ['ev-can-cc1f95f7', 'evt_dwp-2026_wVb9'],
        alias_slugs: ['dwp-2026-jakarta', 'dwp-2026_wVb9']
      }
    });

    const byPrimaryId = registry.getEventById('event-dwp-2026');
    assert.ok(byPrimaryId, 'Primary DWP must exist');

    const byAliasId1 = registry.getEventById('ev-can-cc1f95f7');
    assert.strictEqual(byAliasId1.id, 'event-dwp-2026', 'Lookup by ev-can-cc1f95f7 must resolve to primary');

    const byAliasId2 = registry.getEventById('evt_dwp-2026_wVb9');
    assert.strictEqual(byAliasId2.id, 'event-dwp-2026', 'Lookup by evt_dwp-2026_wVb9 must resolve to primary');

    const byAliasSlug = registry.getEventBySlug('dwp-2026-jakarta');
    assert.strictEqual(byAliasSlug.id, 'event-dwp-2026', 'Slug dwp-2026-jakarta must resolve to primary');
  });

  test('3.2 Registry resolves Maroon 5 alias slug and ID to primary canonical event', () => {
    registry.createEvent({
      id: 'ev-can-30949569',
      slug: 'maroon-5-asia-2027-in-jakarta',
      canonical_name: 'Maroon 5 Asia 2027 in Jakarta',
      start_date: '2027-02-05',
      venue_name: 'Jakarta International Stadium (JIS)',
      metadata: {
        alias_ids: ['evt_edp1690841'],
        alias_slugs: ['evt_edp1690841']
      }
    });

    const byAliasId = registry.getEventById('evt_edp1690841');
    assert.strictEqual(byAliasId.id, 'ev-can-30949569', 'Lookup by evt_edp1690841 must resolve to primary');

    const byAliasSlug = registry.getEventBySlug('evt_edp1690841');
    assert.strictEqual(byAliasSlug.id, 'ev-can-30949569', 'Slug evt_edp1690841 must resolve to primary');
  });

  console.log('\n── Section 4: Dynamic 3:4 SVG Fallback Poster Route ──');
  const app = require('./src/server');
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;

  await asyncTest('4.1 GET /api/discovery/events/:id/poster.svg returns 200 image/svg+xml', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/discovery/events/event-gnr-jakarta-2026/poster.svg`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('image/svg+xml'));
    const svg = await res.text();
    assert.ok(svg.includes('<svg'), 'Response must be valid SVG');
    assert.ok(svg.includes('viewBox="0 0 600 800"'), 'SVG must use 3:4 aspect ratio (600x800)');
  });

  await asyncTest('4.2 GET /api/events/:id/poster.svg alias returns 200 image/svg+xml', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events/ev-can-doh-kyung-soo-2026/poster.svg`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('image/svg+xml'));
    const svg = await res.text();
    assert.ok(svg.includes('<svg'));
  });

  await asyncTest('4.3 GET /events/:id/poster.svg fallback for unknown ID returns resilient branded SVG', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events/unknown-test-concert/poster.svg`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('image/svg+xml'));
    const svg = await res.text();
    assert.ok(svg.includes('TIKUM VERIFIED'));
  });

  console.log('\n── Section 5: Frontend Index & Spotlight Alignment ──');
  test('5.1 public/index.html spotlight badges use truthful schedule confirmation, not false promoter claims', () => {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    assert.ok(!html.includes('https://ygfamily.com/artist/bigbang/worldtour2027-jakarta.jpg'), '404 YG image URL must be removed');
    assert.ok(html.includes('/assets/posters/bigbang-cosmos-tour-jakarta-2027.svg'), 'Must use local SVG');
    
    // Check card-bts
    const btsCard = html.substring(html.indexOf('id="card-bts"'), html.indexOf('id="card-bigbang"'));
    assert.ok(!btsCard.includes('PROMOTER VERIFIED'), 'card-bts must not claim PROMOTER VERIFIED');
    assert.ok(btsCard.includes('scheduleConfirmed'), 'card-bts must use scheduleConfirmed');

    // Check card-bigbang
    const bigbangCard = html.substring(html.indexOf('id="card-bigbang"'), html.indexOf('id="card-efestaphoria"'));
    assert.ok(!bigbangCard.includes('OFFICIAL CHANNEL'), 'card-bigbang must not claim OFFICIAL CHANNEL');
    assert.ok(bigbangCard.includes('scheduleConfirmed'), 'card-bigbang must use scheduleConfirmed');
  });

  test('5.2 SSR /events renders .catalog-card-media and .catalog-card-fallback without broken img tags', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/events`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('class="catalog-card-media"'), 'Must render catalog-card-media');
    assert.ok(html.includes('class="catalog-card-fallback"'), 'Must render catalog-card-fallback');
  });

  server.close();

  console.log('\n================================================================');
  console.log(`TIKUM INTEGRITY SUITE: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
