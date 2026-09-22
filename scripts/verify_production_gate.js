const https = require('https');

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('================================================================');
  console.log('      TIKUM PRODUCTION GATE VERIFICATION (https://tikum.app)    ');
  console.log('================================================================\n');
  
  // 1. Events API
  const evRes = await fetch('https://tikum.app/api/mvp/events');
  const evJson = JSON.parse(evRes.body);
  const events = evJson.events || evJson;
  
  console.log('1. GET /api/mvp/events');
  console.log('   Status:', evRes.status);
  console.log('   Cache-Control:', evRes.headers['cache-control']);
  console.log('   Count:', events.length);
  
  const eventIds = events.map(e => e.id);
  const leakedEvents = ['event-coldplay', 'event-so7-bandung', 'event-gnr', 'event-raditya-dika-standup', 'event-ibl-finals-2026'];
  const foundLeaks = eventIds.filter(id => leakedEvents.includes(id));
  
  // 2. Listings API
  const listRes = await fetch('https://tikum.app/api/mvp/listings');
  const listJson = JSON.parse(listRes.body);
  const listings = listJson.listings || listJson;
  
  console.log('\n2. GET /api/mvp/listings');
  console.log('   Status:', listRes.status);
  console.log('   Cache-Control:', listRes.headers['cache-control']);
  console.log('   Count:', listings.length);
  console.log('   Listing contents:', JSON.stringify(listings, null, 2));

  // 3. Homepage HTML
  const homeRes = await fetch('https://tikum.app/');
  const html = homeRes.body;
  const scriptMatches = [...html.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];
  let scriptErrors = 0;
  scriptMatches.forEach((m, idx) => {
    const code = m[1].trim();
    if (!code) return;
    try {
      new Function(code);
    } catch (err) {
      scriptErrors++;
      console.error('     Script #' + idx + ' parse error:', err.message);
    }
  });

  console.log('\n3. GET / (Homepage HTML)');
  console.log('   Status:', homeRes.status);
  console.log('   Inline scripts checked:', scriptMatches.length);
  console.log('   Script parse errors:', scriptErrors);

  // 4. Assertions
  const checks = [
    { name: 'Events endpoint HTTP 200', pass: evRes.status === 200 },
    { name: 'Events Cache-Control has no-store', pass: evRes.headers['cache-control']?.includes('no-store') },
    { name: 'Exactly 18 upcoming events returned', pass: events.length === 18 },
    { name: 'Zero historical events leaked (Coldplay, SO7, GNR, Raditya)', pass: foundLeaks.length === 0 },
    { name: 'Zero LIVE events in upcoming feed (IBL Finals excluded)', pass: !eventIds.includes('event-ibl-finals-2026') },
    { name: 'Listings endpoint HTTP 200', pass: listRes.status === 200 },
    { name: 'Listings Cache-Control has no-store', pass: listRes.headers['cache-control']?.includes('no-store') },
    { name: 'Coldplay listing excluded from public listings', pass: listings.every(l => l.event_id !== 'event-coldplay') },
    { name: 'Pestapora listing (list-demo-pestapora) present', pass: listings.some(l => l.event_id === 'event-pestapora-2026') },
    { name: 'Homepage HTML HTTP 200', pass: homeRes.status === 200 },
    { name: '0 client-side script syntax errors on homepage', pass: scriptErrors === 0 }
  ];

  console.log('\n================================================================');
  console.log('                        VERIFICATION REPORT                     ');
  console.log('================================================================');
  let allPassed = true;
  for (const c of checks) {
    console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
    if (!c.pass) allPassed = false;
  }

  console.log('================================================================');
  console.log('FINAL VERDICT:', allPassed ? '✅ ALL PRODUCTION GATES PASSED (100% CLEAN)' : '❌ GATE FAILED');
  console.log('================================================================');
  process.exit(allPassed ? 0 : 1);
})();

