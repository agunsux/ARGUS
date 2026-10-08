const { Pool } = require('pg');
const fs = require('fs');

if (!process.env.DATABASE_URL && fs.existsSync('.env.local')) {
  try {
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
  } catch (_) {}
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canonical_events'");
  console.log('Columns in canonical_events:', cols.rows.map(r => r.column_name));

  const events = await pool.query("SELECT id, slug, canonical_name, venue_name, city, start_date, category, is_verified, min_price, max_price, lifecycle_status FROM canonical_events ORDER BY id");
  console.log(`Total events in database: ${events.rows.length}`);
  for (const e of events.rows) {
    const d = e.start_date ? (e.start_date instanceof Date ? e.start_date.toISOString().slice(0, 10) : e.start_date) : 'N/A';
    console.log(`  [${e.id}] "${e.canonical_name}" | cat: ${e.category} | city: ${e.city} | date: ${d} | price: ${e.min_price}-${e.max_price} | verified: ${e.is_verified} | status: ${e.lifecycle_status}`);
  }

  const lalala = await pool.query("SELECT * FROM canonical_events WHERE canonical_name ILIKE '%lalala%' OR slug ILIKE '%lalala%'");
  console.log('\n--- LALALA FEST DETAILS ---');
  console.log(JSON.stringify(lalala.rows, null, 2));

  await pool.end();
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
