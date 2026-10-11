const fs = require('fs');

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

const { marketSupplyService } = require('../src/discovery/supply/MarketSupplyExpansionService');
const { getCatalogRepository } = require('../src/discovery/repository');

async function run() {
  console.log('[Ingest] Initializing repository...');
  const repo = getCatalogRepository();
  await repo.init();

  console.log('[Ingest] Running market supply ingestion (minPrice: Rp 100.000)...');
  const result = await marketSupplyService.ingest({
    repository: repo,
    minPrice: 100000,
    actor: 'AUDIT_AGENT_NATIONAL_COVERAGE'
  });

  console.log('\n=== INGESTION SUMMARY ===');
  console.log('Mode:', result.mode);
  console.log('Run ID:', result.run_id);
  console.log('Summary:', JSON.stringify(result.summary, null, 2));

  if (result.errors && result.errors.length > 0) {
    console.error('Errors encountered:', result.errors);
  }

  // Audit state in PostgreSQL
  console.log('\n=== POST-INGESTION DATABASE AUDIT ===');
  const allEvents = await repo.getAllEvents();
  console.log(`Total events in database: ${allEvents.length}`);

  const categories = {};
  for (const ev of allEvents) {
    categories[ev.category] = (categories[ev.category] || 0) + 1;
  }
  console.log('Category distribution:', categories);

  // Check LaLaLa Festival
  const lalala = allEvents.filter(e => (e.slug || '').includes('lalala') || (e.name || '').toLowerCase().includes('lalala'));
  console.log(`\nLaLaLa Festival matching records (${lalala.length}):`);
  for (const l of lalala) {
    console.log(` - [${l.id}] "${l.name}" | slug: ${l.slug} | cat: ${l.category} | city: ${l.city} | price: Rp ${l.min_price} - ${l.max_price} | verified: ${l.is_verified} | status: ${l.lifecycle_status} | url: ${l.official_event_url || l.source_url}`);
  }

  // Check Comedy Events
  const comedy = allEvents.filter(e => e.category === 'COMEDY' || (e.category || '').toLowerCase() === 'comedy' || (e.category || '').toLowerCase() === 'standup');
  console.log(`\nStand-up comedy events (${comedy.length}):`);
  for (const c of comedy) {
    console.log(` - [${c.id}] "${c.name}" | slug: ${c.slug} | venue: ${c.venue_name} | price: Rp ${c.min_price} - ${c.max_price} | verified: ${c.is_verified}`);
  }

  // Check Festivals
  const festivals = allEvents.filter(e => e.category === 'FESTIVAL');
  console.log(`\nMajor Festivals (${festivals.length}):`);
  for (const f of festivals) {
    console.log(` - [${f.id}] "${f.name}" | slug: ${f.slug} | venue: ${f.venue_name} | price: Rp ${f.min_price} - ${f.max_price} | verified: ${f.is_verified}`);
  }

  // Check High-Value Events (>= 500k)
  const highVal = allEvents.filter(e => (e.min_price && Number(e.min_price) >= 500000) || (e.max_price && Number(e.max_price) >= 500000));
  console.log(`\nHigh-Value Events (>= Rp 500.000): ${highVal.length}`);

  return { result, totalCount: allEvents.length };
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[Ingest] Failed:', err);
    process.exit(1);
  });
