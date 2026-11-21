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

async function checkConstraints() {
  const pool = new Pool({
    connectionString: getDbUrl(),
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  const constraints = await client.query(`
    SELECT
        tc.table_name, 
        tc.constraint_name, 
        tc.constraint_type, 
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.table_name IN ('marketplace_listings', 'marketplace_tickets');
  `);
  console.dir(constraints.rows, { depth: null });

  client.release();
  await pool.end();
}

checkConstraints();
