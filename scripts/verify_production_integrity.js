const assert = require('assert');

async function verify() {
  console.log('================================================================');
  console.log('  TIKUM LIVE PRODUCTION VERIFICATION — EPIC P0.7');
  console.log('  Target: https://tikum.app');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function report(name, ok, detail = '') {
    if (ok) {
      console.log(`  \x1b[32m✓\x1b[0m [PASS] ${name} ${detail}`);
      passed++;
    } else {
      console.error(`  \x1b[31m✗\x1b[0m [FAIL] ${name} ${detail}`);
      failed++;
    }
  }

  // 1. Homepage HTML & Spotlight Badges
  console.log('── Step 1: Homepage Truthfulness & Spotlight Badges ──');
  const homeRes = await fetch('https://tikum.app/', { headers: { 'User-Agent': 'Tikum-Verification-Bot/1.0' } });
  report('Homepage responds with HTTP 200', homeRes.status === 200, `(status: ${homeRes.status})`);
  const homeHtml = await homeRes.text();

  // Check BTS Card
  const btsIdx = homeHtml.indexOf('id="card-bts"');
  const bigbangIdx = homeHtml.indexOf('id="card-bigbang"');
  const btsCard = homeHtml.substring(btsIdx, bigbangIdx);
  report('BTS card has no false "PROMOTER VERIFIED" badge', !btsCard.includes('PROMOTER VERIFIED'));
  report('BTS card uses "scheduleConfirmed" / "✓ JADWAL RESMI TERKONFIRMASI"', btsCard.includes('scheduleConfirmed') || btsCard.includes('JADWAL RESMI TERKONFIRMASI'));
  report('BTS card tag uses "TIKUM Event Brief · Jadwal Terkonfirmasi"', btsCard.includes('TIKUM Event Brief'));

  // Check BIGBANG Card
  const efestIdx = homeHtml.indexOf('id="card-efestaphoria"');
  const bigbangCard = homeHtml.substring(bigbangIdx, efestIdx);
  report('BIGBANG card has no false "OFFICIAL CHANNEL" badge', !bigbangCard.includes('OFFICIAL CHANNEL'));
  report('BIGBANG card uses "scheduleConfirmed" / "✓ JADWAL RESMI TERKONFIRMASI"', bigbangCard.includes('scheduleConfirmed') || bigbangCard.includes('JADWAL RESMI TERKONFIRMASI'));
  report('BIGBANG card tag uses "TIKUM Event Brief · Jadwal Terkonfirmasi"', bigbangCard.includes('TIKUM Event Brief'));

  // 2. Production SVG Poster Truthfulness
  console.log('\n── Step 2: Live Poster SVG Truthfulness & Provenance ──');
  const bbSvgRes = await fetch('https://tikum.app/assets/posters/bigbang-cosmos-tour-jakarta-2027.svg');
  report('BIGBANG SVG responds with HTTP 200', bbSvgRes.status === 200);
  const bbSvg = await bbSvgRes.text();
  report('BIGBANG SVG has no false YG/Applewood presentation banner', !bbSvg.includes('YG ENTERTAINMENT &amp; APPLEWOOD'));
  report('BIGBANG SVG has no crown motif', !bbSvg.includes('M -40,20 L -25,-20'));
  report('BIGBANG SVG has no false "TERVERIFIKASI SUMBER RESMI PROMOTOR"', !bbSvg.includes('TERVERIFIKASI SUMBER RESMI PROMOTOR'));
  report('BIGBANG SVG uses "TIKUM EVENT BRIEF · INFORMASI RESMI"', bbSvg.includes('TIKUM EVENT BRIEF · INFORMASI RESMI'));
  report('BIGBANG SVG states "POSTER RESMI BELUM DITERBITKAN"', bbSvg.includes('POSTER RESMI BELUM DITERBITKAN'));

  const btsSvgRes = await fetch('https://tikum.app/assets/posters/bts-world-tour-arirang-jakarta-2026.svg');
  report('BTS SVG responds with HTTP 200', btsSvgRes.status === 200);
  const btsSvg = await btsSvgRes.text();
  report('BTS SVG has no false BigHit/HYBE presentation banner', !btsSvg.includes('BIGHIT MUSIC &amp; HYBE PRESENT'));
  report('BTS SVG uses "TIKUM EVENT BRIEF · INFORMASI RESMI"', btsSvg.includes('TIKUM EVENT BRIEF · INFORMASI RESMI'));
  report('BTS SVG states "POSTER RESMI BELUM DITERBITKAN"', btsSvg.includes('POSTER RESMI BELUM DITERBITKAN'));

  // 3. Dynamic Fallback Poster Endpoint
  console.log('\n── Step 3: Dynamic 3:4 SVG Fallback Poster Endpoint ──');
  const dynPosterRes = await fetch('https://tikum.app/api/discovery/events/event-gnr-jakarta-2026/poster.svg');
  report('Dynamic poster route responds with HTTP 200', dynPosterRes.status === 200);
  report('Dynamic poster route Content-Type is image/svg+xml', (dynPosterRes.headers.get('content-type') || '').includes('image/svg+xml'));
  const dynPosterSvg = await dynPosterRes.text();
  report('Dynamic poster SVG uses 3:4 viewBox (0 0 600 800)', dynPosterSvg.includes('viewBox="0 0 600 800"'));

  // 4. Canonical Deduplication & API Verification
  console.log('\n── Step 4: Canonical Deduplication & Zero Duplication ──');
  const eventsRes = await fetch('https://tikum.app/api/discovery/events?limit=100');
  report('GET /api/discovery/events responds with HTTP 200', eventsRes.status === 200);
  const eventsData = await eventsRes.json();
  const events = eventsData.events || eventsData.data || [];

  // DWP deduplication check
  const dwpEvents = events.filter(e => {
    const t = (e.canonical_name || e.title || e.name || '').toLowerCase();
    const slug = (e.slug || '').toLowerCase();
    return t.includes('dwp') || t.includes('djakarta warehouse') || slug.includes('dwp');
  });
  report(`DWP has exactly 1 public canonical event (found: ${dwpEvents.length})`, dwpEvents.length === 1, dwpEvents.map(e => `${e.id || e.event_id} (${e.slug})`).join(', '));
  if (dwpEvents.length > 0) {
    report('DWP primary event ID is event-dwp-2026', (dwpEvents[0].id || dwpEvents[0].event_id) === 'event-dwp-2026');
  }

  // Maroon 5 deduplication check
  const m5Events = events.filter(e => {
    const t = (e.canonical_name || e.title || e.name || '').toLowerCase();
    const slug = (e.slug || '').toLowerCase();
    return t.includes('maroon 5') || slug.includes('maroon-5') || slug.includes('edp1690841');
  });
  report(`Maroon 5 has exactly 1 public canonical event (found: ${m5Events.length})`, m5Events.length === 1, m5Events.map(e => `${e.id || e.event_id} (${e.slug})`).join(', '));
  if (m5Events.length > 0) {
    report('Maroon 5 primary event ID is ev-can-30949569', (m5Events[0].id || m5Events[0].event_id) === 'ev-can-30949569');
  }

  console.log('\n================================================================');
  console.log(`PRODUCTION VERIFICATION COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

verify().catch(err => {
  console.error('Production verification error:', err);
  process.exit(1);
});
