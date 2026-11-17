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
  console.log('  TIKUM — EVENT POSTER PIPELINE VERIFICATION SUITE');
  console.log('================================================================\n');

  console.log('── Section 1: Static Poster Assets on Disk ──');
  test('1.1 BTS verified SVG poster asset exists at both slug paths', () => {
    const p1 = path.join(__dirname, 'public', 'assets', 'posters', 'bts-world-tour-arirang-jakarta-2026.svg');
    const p2 = path.join(__dirname, 'public', 'assets', 'posters', 'bts-arirang-world-tour-jakarta-2026.svg');
    assert.ok(fs.existsSync(p1), 'bts-world-tour-arirang-jakarta-2026.svg must exist');
    assert.ok(fs.existsSync(p2), 'bts-arirang-world-tour-jakarta-2026.svg must exist');
    const content = fs.readFileSync(p1, 'utf8');
    assert.ok(content.includes('<svg'), 'Must be valid SVG');
    assert.ok(content.includes('BTS WORLD TOUR'), 'Must contain concert title');
  });

  test('1.2 BIGBANG verified SVG poster asset exists', () => {
    const p = path.join(__dirname, 'public', 'assets', 'posters', 'bigbang-cosmos-tour-jakarta-2027.svg');
    assert.ok(fs.existsSync(p), 'bigbang-cosmos-tour-jakarta-2027.svg must exist');
    const content = fs.readFileSync(p, 'utf8');
    assert.ok(content.includes('<svg'), 'Must be valid SVG');
    assert.ok(content.includes('BIGBANG'), 'Must contain BIGBANG');
    assert.ok(content.includes('COSMOS'), 'Must contain tour name');
  });

  console.log('\n── Section 2: Verified Image Provenance Registry ──');
  test('2.1 Provenance fixture maps canonical event IDs to verified images', () => {
    const provPath = path.join(__dirname, 'src', 'discovery', 'fixtures', 'verified_event_image_provenance.json');
    const prov = JSON.parse(fs.readFileSync(provPath, 'utf8'));
    assert.ok(prov.verified_by_event_id['event-gnr-jakarta-2026'], 'GNR must be registered');
    assert.ok(prov.verified_by_event_id['ev-can-lalala-fest-2027'], 'LaLaLa Fest must be registered');
    assert.ok(prov.verified_by_event_id['ev-can-joyland-sessions-2026'], 'Joyland must be registered');
    assert.ok(prov.verified_by_event_id['event-dwp-2026'], 'DWP must be registered');
    assert.ok(prov.verified_by_event_id['bts-world-tour-arirang-jakarta-2026'], 'BTS must be registered');
    assert.ok(prov.verified_by_event_id['bigbang-cosmos-tour-jakarta-2027'], 'BIGBANG must be registered');
    assert.ok(prov.verified_by_event_id['evt_edp1690841'], 'Maroon 5 must be registered');
  });

  console.log('\n── Section 3: Dynamic 3:4 SVG Fallback Poster Route ──');
  const app = require('./src/server');
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;

  await asyncTest('3.1 GET /api/discovery/events/:id/poster.svg returns 200 image/svg+xml', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/discovery/events/event-gnr-jakarta-2026/poster.svg`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('image/svg+xml'));
    const svg = await res.text();
    assert.ok(svg.includes('<svg'), 'Response must be valid SVG');
    assert.ok(svg.includes('viewBox="0 0 600 800"'), 'SVG must use 3:4 aspect ratio (600x800)');
  });

  await asyncTest('3.2 GET /api/events/:id/poster.svg alias returns 200 image/svg+xml', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events/ev-can-doh-kyung-soo-2026/poster.svg`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('image/svg+xml'));
    const svg = await res.text();
    assert.ok(svg.includes('<svg'));
  });

  await asyncTest('3.3 GET /events/:id/poster.svg fallback for unknown ID returns resilient branded SVG', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events/unknown-test-concert/poster.svg`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('image/svg+xml'));
    const svg = await res.text();
    assert.ok(svg.includes('TIKUM VERIFIED'));
  });

  console.log('\n── Section 4: Frontend Index & Spotlight Alignment ──');
  test('4.1 public/index.html BIGBANG spotlight points to local verified SVG asset', () => {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    assert.ok(!html.includes('https://ygfamily.com/artist/bigbang/worldtour2027-jakarta.jpg'), '404 YG image URL must be removed');
    assert.ok(html.includes('/assets/posters/bigbang-cosmos-tour-jakarta-2027.svg'), 'Must use local verified SVG');
  });

  test('4.2 SSR /events renders .catalog-card-media and .catalog-card-fallback without broken img tags', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/events`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('class="catalog-card-media"'), 'Must render catalog-card-media');
    assert.ok(html.includes('class="catalog-card-fallback"'), 'Must render catalog-card-fallback');
  });

  server.close();

  console.log('\n================================================================');
  console.log(`TIKUM EVENT POSTER SUITE: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
