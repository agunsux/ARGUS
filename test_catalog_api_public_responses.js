const fs = require('fs');
const http = require('http');

if (!process.env.DATABASE_URL && fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      let val = line.substring('DATABASE_URL='.length).trim().replace(/['"]/g, '');
      try {
        const u = new URL(val);
        u.searchParams.delete('channel_binding');
        val = u.toString();
      } catch (_) {}
      process.env.DATABASE_URL = val;
      break;
    }
  }
}

const app = require('./src/server');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { getCatalogRepository } = require('./src/discovery/repository');

function makeRequest(server, path) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}${path}`;
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('--- Initializing Server and Hydrating Registry ---');
  const repo = getCatalogRepository();
  await repo.init();
  await canonicalRegistry.hydrateFromRepository();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // 1. GET /api/events
    console.log('\n[1] Testing GET /api/events');
    const resAll = await makeRequest(server, '/api/events');
    if (resAll.statusCode !== 200) throw new Error(`GET /api/events returned ${resAll.statusCode}: ${resAll.body}`);
    const jsonAll = JSON.parse(resAll.body);
    console.log(`-> 200 OK. Total verified events returned: ${jsonAll.total}`);
    if (jsonAll.total < 15) {
      throw new Error(`Expected at least 15 verified events, got ${jsonAll.total}`);
    }

    // 2. Check LaLaLa Festival in /api/events
    console.log('\n[2] Checking LaLaLa Festival in /api/events');
    const lalala = jsonAll.events.find(e => (e.slug || '').includes('lalala') || (e.name || '').includes('LaLaLa'));
    if (!lalala) {
      throw new Error('LaLaLa Festival Jakarta 2027 NOT FOUND in /api/events!');
    }
    console.log(`-> FOUND LaLaLa Festival: "${lalala.name}" | slug: ${lalala.slug} | category: ${lalala.category} | min_price: ${lalala.min_price} | max_price: ${lalala.max_price} | verified: ${lalala.is_verified}`);

    // 3. GET /api/events?category=COMEDY
    console.log('\n[3] Testing GET /api/events?category=COMEDY');
    const resComedy = await makeRequest(server, '/api/events?category=COMEDY');
    if (resComedy.statusCode !== 200) throw new Error(`GET /api/events?category=COMEDY returned ${resComedy.statusCode}`);
    const jsonComedy = JSON.parse(resComedy.body);
    console.log(`-> 200 OK. Total comedy events: ${jsonComedy.total}`);
    for (const c of jsonComedy.events) {
      console.log(`   * ${c.name} (${c.venue_name || c.venue}) - Rp ${c.min_price} - ${c.max_price}`);
    }
    const comedians = ['Atsuko Okatsuka', 'Morgan Jay', 'Abdur Arsyad', 'Pandji Pragiwaksono'];
    for (const cName of comedians) {
      const found = jsonComedy.events.find(e => (e.name || '').includes(cName));
      if (!found) throw new Error(`Comedian "${cName}" not found in /api/events?category=COMEDY`);
      console.log(`   -> Verified: ${cName} is present`);
    }

    // 4. GET /api/events?category=FESTIVAL
    console.log('\n[4] Testing GET /api/events?category=FESTIVAL');
    const resFest = await makeRequest(server, '/api/events?category=FESTIVAL');
    if (resFest.statusCode !== 200) throw new Error(`GET /api/events?category=FESTIVAL returned ${resFest.statusCode}`);
    const jsonFest = JSON.parse(resFest.body);
    console.log(`-> 200 OK. Total festivals: ${jsonFest.total}`);
    const lalalaInFest = jsonFest.events.find(e => (e.slug || '').includes('lalala'));
    if (!lalalaInFest) throw new Error('LaLaLa Festival missing from /api/events?category=FESTIVAL');
    console.log(`   -> Verified: LaLaLa Festival is present in festivals filter`);

    // 5. GET /api/events/home-feed
    console.log('\n[5] Testing GET /api/events/home-feed');
    const resFeed = await makeRequest(server, '/api/events/home-feed');
    if (resFeed.statusCode !== 200) throw new Error(`GET /api/events/home-feed returned ${resFeed.statusCode}`);
    const jsonFeed = JSON.parse(resFeed.body);
    console.log(`-> 200 OK. Feed keys:`, Object.keys(jsonFeed));
    const allFeedEvents = (jsonFeed.events || jsonFeed.feed || []).concat(
      Array.isArray(jsonFeed.sections)
        ? jsonFeed.sections.flatMap(s => s.events || [])
        : Object.values(jsonFeed.sections || {}).flat()
    );
    console.log(`-> Total events in feed: ${allFeedEvents.length}`);

    // 6. GET /events/:slug (SSR landing page for LaLaLa Festival)
    console.log('\n[6] Testing GET /events/:slug (SSR Landing page for LaLaLa Festival)');
    const resLalalaHtml = await makeRequest(server, `/events/${lalala.slug}`);
    if (resLalalaHtml.statusCode !== 200) throw new Error(`GET /events/${lalala.slug} returned ${resLalalaHtml.statusCode}`);
    if (!resLalalaHtml.body.includes('LaLaLa Festival')) throw new Error('HTML does not contain "LaLaLa Festival"');
    if (!resLalalaHtml.body.includes('application/ld+json')) throw new Error('HTML does not contain schema.org JSON-LD');
    console.log('-> 200 OK. HTML rendered with Schema.org JSON-LD and title confirmed!');

    // 7. GET /events/:slug (SSR landing page for Atsuko Okatsuka)
    console.log('\n[7] Testing GET /events/:slug (SSR Landing page for Atsuko Okatsuka)');
    const atsuko = jsonComedy.events.find(e => e.name.includes('Atsuko'));
    const resAtsukoHtml = await makeRequest(server, `/events/${atsuko.slug}`);
    if (resAtsukoHtml.statusCode !== 200) throw new Error(`GET /events/${atsuko.slug} returned ${resAtsukoHtml.statusCode}`);
    if (!resAtsukoHtml.body.includes('Atsuko Okatsuka')) throw new Error('HTML does not contain "Atsuko Okatsuka"');
    console.log('-> 200 OK. Atsuko Okatsuka SSR page rendered successfully!');

    console.log('\n=== ALL 7 CATALOG API & SSR VERIFICATION CHECKS PASSED ===\n');
  } finally {
    server.close();
  }
}

runTests().then(() => process.exit(0)).catch(e => {
  console.error('\nFAILED:', e);
  process.exit(1);
});
