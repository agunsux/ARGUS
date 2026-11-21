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

const pool = new Pool({
  connectionString: getDbUrl(),
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT $1::text as val', [{ a: 1 }])
  .then(r => {
    console.log('Result:', r.rows);
    pool.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    pool.end();
  });
