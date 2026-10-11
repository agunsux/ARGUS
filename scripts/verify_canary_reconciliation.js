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

const { getCatalogRepository } = require('../src/discovery/repository');
const { sourceRegistry } = require('../src/discovery/SourceRegistry');

async function verifyCanaries() {
  const repo = getCatalogRepository();
  await repo.init();

  console.log('=== CANARY RECONCILIATION VERIFICATION REPORT ===\n');
  const allEvents = await repo.getAllEvents();

  const canaryLines = fs.readFileSync('audit/canary_events.csv', 'utf8').trim().split('\n').slice(1);
  for (const line of canaryLines) {
    if (!line.trim()) continue;
    // Simple CSV parse
    const match = line.match(/^"([^"]+)",([^,]+),([^,]+),"([^"]+)",(\d+),(\d+),([^,]+),([^,]+),([^,]+),"([^"]+)"$/);
    if (!match) continue;

    const [_, name, category, city, venue, minPrice, maxPrice, primaryTicketing, sourceUrl, expectedStatus, notes] = match;

    console.log(`Checking Canary: "${name}" [${expectedStatus}]`);
    
    // Find all matching in repository
    const matching = allEvents.filter(e => {
      const eName = (e.canonical_name || e.name || '').toLowerCase();
      const cName = name.toLowerCase().split(':')[0].trim();
      return eName.includes(cName) || cName.includes(eName);
    });

    if (matching.length > 0) {
      for (const found of matching) {
        console.log(`  -> FOUND in Neon DB: [${found.id}] "${found.canonical_name}" (${found.city})`);
        console.log(`     Status: ${found.verification_status} | Lifecycle: ${found.lifecycle_status} | Price: Rp ${Number(found.min_price || 0).toLocaleString()} - Rp ${Number(found.max_price || 0).toLocaleString()}`);
        console.log(`     Seating: ${found.seating_type || found.metadata?.seating_type} | Tiers count: ${(found.price_tiers || found.metadata?.price_tiers || []).length}`);
      }
    } else {
      if (expectedStatus === 'BLOCKED') {
        const src = sourceRegistry.getSource('src-tiket-com');
        console.log(`  -> NOT IN CANONICAL CATALOG (EXPECTED: Source is BLOCKED due to anti-scraping). Active status in registry: ${src?.active_status}`);
      } else {
        console.log(`  -> NOT FOUND in DB! Gaps detected.`);
      }
    }
    console.log('');
  }
}

verifyCanaries().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
