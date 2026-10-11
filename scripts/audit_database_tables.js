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

async function run() {
  const repo = getCatalogRepository();
  await repo.init();

  const tablesRes = await repo.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('--- ALL PUBLIC TABLES IN NEON POSTGRESQL ---');
  for (const row of tablesRes.rows) {
    const countRes = await repo.query(`SELECT COUNT(*) FROM "${row.table_name}";`).catch(e => ({ rows: [{ count: 'ERROR: ' + e.message }] }));
    console.log(`  Table: ${row.table_name.padEnd(30)} | Rows: ${countRes.rows[0].count}`);
  }
}

run().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
