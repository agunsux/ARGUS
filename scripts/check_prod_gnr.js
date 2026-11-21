const https = require('https');

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://tikum.app${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data.slice(0, 500) });
        }
      });
    }).on('error', reject);
  });
}

async function checkProd() {
  console.log('Querying production /api/events...');
  const cat = await get('/api/events');
  const catEvents = Array.isArray(cat.data) ? cat.data : (cat.data?.events || []);
  const gnrCat = catEvents.find(e => (e.name || e.title || e.canonical_name || '').toLowerCase().includes('guns') || (e.id || '').includes('gnr') || (e.slug || '').includes('guns'));
  console.log('Found GNR in /api/events:', gnrCat ? {
    id: gnrCat.id,
    event_id: gnrCat.event_id,
    name: gnrCat.name || gnrCat.title || gnrCat.canonical_name,
    slug: gnrCat.slug,
    active_listings_count: gnrCat.active_listings_count,
    resale_available: gnrCat.resale_available,
    resale_listings_count: gnrCat.resale_listings_count
  } : 'NOT FOUND');

  console.log('\nQuerying production /api/events/home-feed...');
  const feed = await get('/api/events/home-feed');
  const feedData = feed.data || {};
  let gnrFeed = null;
  for (const sec of ['coming_soon', 'trending', 'just_announced', 'concerts', 'festivals', 'popular']) {
    const list = feedData[sec] || [];
    const found = list.find(e => (e.name || e.title || e.canonical_name || '').toLowerCase().includes('guns') || (e.id || '').includes('gnr') || (e.slug || '').includes('guns'));
    if (found) {
      gnrFeed = { section: sec, ...found };
      break;
    }
  }
  console.log('Found GNR in /api/events/home-feed:', gnrFeed ? {
    section: gnrFeed.section,
    id: gnrFeed.id,
    event_id: gnrFeed.event_id,
    title: gnrFeed.title || gnrFeed.canonical_name,
    slug: gnrFeed.slug,
    active_listings_count: gnrFeed.active_listings_count,
    resale_available: gnrFeed.resale_available,
    resale_listings_count: gnrFeed.resale_listings_count
  } : 'NOT FOUND');
}

checkProd();
