/**
 * Live Production Health & E2E Verification for https://tikum.app
 */

const assert = require('assert');
const https = require('https');

console.log('======================================================================');
console.log('  TIKUM — LIVE PRODUCTION HEALTH CHECK (https://tikum.app)');
console.log('======================================================================\n');

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, { headers: { 'User-Agent': 'TikumHealthBot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
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

async function runHealthCheck() {
  // 1. Homepage & CSS
  console.log('[1/6] Checking Homepage (https://tikum.app) & CSS...');
  const home = await fetchUrl('https://tikum.app');
  assert.strictEqual(home.statusCode, 200, 'Homepage must return 200 OK');
  assert.ok(home.body.includes('flow-marquee-wrapper'), 'Homepage must contain flow-marquee-wrapper');
  assert.ok(home.body.includes('tikum-horizontal.svg'), 'Homepage must reference tikum-horizontal.svg');
  assert.ok(home.body.includes('PT Shinerva Prajna Tejas'), 'Homepage must contain PT Shinerva Prajna Tejas');

  const css = await fetchUrl('https://tikum.app/css/style.css');
  assert.strictEqual(css.statusCode, 200, 'CSS must return 200 OK');
  assert.ok(css.body.includes('tikumFlowMarquee'), 'CSS must define @keyframes tikumFlowMarquee');
  console.log('  ✓ Homepage and CSS 200 OK with Flow Ninja marquee & branding.\n');

  // 2. Active Events API with Hype Sort
  console.log('[2/6] Checking GET /api/discovery/events-qualified?sort=hype...');
  const activeRes = await fetchUrl('https://tikum.app/api/discovery/events-qualified?sort=hype');
  assert.strictEqual(activeRes.statusCode, 200);
  const activeJson = JSON.parse(activeRes.body);
  assert.strictEqual(activeJson.success, true);
  const events = activeJson.events || activeJson.data || [];
  assert.ok(events.length >= 10, `Expected >= 10 active events, got ${events.length}`);
  
  // BTS and BIGBANG top rank
  assert.ok((events[0].id || events[0].event_id).includes('bts'), 'Top #1 must be BTS');
  assert.strictEqual(events[0].hype_score, 98, 'BTS hype score must be 98');
  assert.ok((events[1].id || events[1].event_id).includes('bigbang'), 'Top #2 must be BIGBANG');
  assert.strictEqual(events[1].hype_score, 95, 'BIGBANG hype score must be 95');

  // Verify all events are within window >= 2026-11-24 and price >= 300,000
  for (const ev of events) {
    assert.ok(ev.event_date >= '2026-11-24', `Event ${ev.event_name} date ${ev.event_date} must be >= 2026-11-24`);
    const price = ev.price_floor || ev.starting_price_idr || 0;
    assert.ok(price >= 300000, `Event ${ev.event_name} price must be >= 300,000`);
  }
  console.log(`  ✓ ${events.length} active events returned.`);
  console.log(`  ✓ Top 1: ${events[0].event_name} (Hype: ${events[0].hype_score})`);
  console.log(`  ✓ Top 2: ${events[1].event_name} (Hype: ${events[1].hype_score})\n`);

  // 3. Jabodetabek Filtering API
  console.log('[3/6] Checking GET /api/discovery/events-qualified?city=Jakarta...');
  const jktRes = await fetchUrl('https://tikum.app/api/discovery/events-qualified?city=Jakarta');
  assert.strictEqual(jktRes.statusCode, 200);
  const jktJson = JSON.parse(jktRes.body);
  const jktEvents = jktJson.events || jktJson.data || [];
  assert.ok(jktEvents.length >= 8, `Expected >= 8 Jabodetabek events, got ${jktEvents.length}`);
  assert.ok(jktEvents.some(e => (e.venue || '').includes('ICE BSD')), 'Must include ICE BSD Tangerang');
  assert.ok(jktEvents.some(e => (e.venue || '').includes('SICC')), 'Must include SICC Bogor');
  console.log(`  ✓ Jakarta query matches ${jktEvents.length} Jabodetabek events (including ICE BSD & SICC).\n`);

  // 4. Past Events API
  console.log('[4/6] Checking GET /api/discovery/past-events...');
  const pastRes = await fetchUrl('https://tikum.app/api/discovery/past-events');
  assert.strictEqual(pastRes.statusCode, 200);
  const pastJson = JSON.parse(pastRes.body);
  assert.strictEqual(pastJson.success, true);
  const pastEvents = pastJson.events || pastJson.data || [];
  assert.ok(pastEvents.length >= 10, `Expected >= 10 past events, got ${pastEvents.length}`);
  for (const pe of pastEvents) {
    assert.ok(pe.event_date < '2026-11-24', `Past event ${pe.event_name} date ${pe.event_date} must be < 2026-11-24`);
  }
  console.log(`  ✓ ${pastEvents.length} past events correctly preserved.\n`);

  // 5. Home Feed API
  console.log('[5/6] Checking GET /api/events/home-feed...');
  const feedRes = await fetchUrl('https://tikum.app/api/events/home-feed');
  assert.strictEqual(feedRes.statusCode, 200);
  const feedJson = JSON.parse(feedRes.body);
  assert.strictEqual(feedJson.success, true);
  assert.ok(feedJson.sections && feedJson.sections.upcoming.length >= 10, 'Feed upcoming events must exist');
  assert.ok(feedJson.hero_events && feedJson.hero_events.length >= 2, 'Feed hero events must exist');
  console.log('  ✓ Home feed API healthy with upcoming & hero sections.\n');

  // 6. Vector Logo Asset with Ticket-Stub Notch
  console.log('[6/6] Checking Vector SVG Logo & Ticket-Stub Notch...');
  const logoRes = await fetchUrl('https://tikum.app/images/tikum-horizontal.svg');
  assert.strictEqual(logoRes.statusCode, 200);
  assert.ok(logoRes.body.includes('M 43 56 H 57'), 'tikum-horizontal.svg must contain ticket-stub notch');
  console.log('  ✓ SVG Logo live with signature Warm Cream ticket-stub notch.\n');

  console.log('======================================================================');
  console.log('  LIVE PRODUCTION HEALTH CHECK 100% PASSED — SYSTEM FULLY OPERATIONAL');
  console.log('======================================================================');
}

runHealthCheck().catch(err => {
  console.error('Production health check failed:', err);
  process.exit(1);
});
