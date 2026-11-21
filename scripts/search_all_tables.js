const { Pool } = require('pg');
const fs = require('fs');

function getDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) {
        return trimmed.replace(/^DATABASE_URL=/, '').replace(/^["']|["']$/g, '').trim();
      }
    }
  }
  return null;
}

async function search() {
  const pool = new Pool({
    connectionString: getDbUrl(),
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);

  console.log('Searching for usr-9a825b68 across all tables...');
  for (const t of tables.rows) {
    const tbl = t.table_name;
    try {
      const res = await client.query(`SELECT * FROM "${tbl}" WHERE CAST(row_to_json("${tbl}") AS TEXT) ILIKE '%usr-9a825b68%'`);
      if (res.rows.length > 0) {
        console.log(`Found in table ${tbl}: ${res.rows.length} rows`);
        for (const row of res.rows) {
          console.dir(row, { depth: null });
        }
      }
    } catch (e) {
      // ignore
    }
  }

  console.log('\nSearching for 18f2f68c across all tables...');
  for (const t of tables.rows) {
    const tbl = t.table_name;
    try {
      const res = await client.query(`SELECT * FROM "${tbl}" WHERE CAST(row_to_json("${tbl}") AS TEXT) ILIKE '%18f2f68c%'`);
      if (res.rows.length > 0) {
        console.log(`Found in table ${tbl}: ${res.rows.length} rows`);
      }
    } catch (e) {
      // ignore
    }
  }

  client.release();
  await pool.end();
}

search();
