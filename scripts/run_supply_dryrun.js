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
  const repo = getCatalogRepository();
  await repo.init();
  const dry = await marketSupplyService.dryRun({ repository: repo, minPrice: 100000 });
  const reasons = {};
  for (const r of dry.review_queue) {
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  }
  console.log('Review reasons breakdown:', reasons);
  console.log('\nSample review items:');
  for (const r of dry.review_queue.slice(0, 8)) {
    console.log(` - [${r.reason}] "${r.title}" | ${r.city} | Rp ${r.price}`);
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
