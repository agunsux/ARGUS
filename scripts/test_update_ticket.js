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

const sql = `
  UPDATE marketplace_tickets
  SET status = $2,
      locked_by = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE locked_by END,
      updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

const lockedBy = {
  verification_status: 'SUBMITTED',
  evidence_bundle_id: null
};

// Test running this query with a non-existent ID so it doesn't modify anything, but tests SQL parsing and parameter binding
pool.query(sql, ['non-existent-id', 'PENDING_VERIFICATION', lockedBy])
  .then(r => {
    console.log('Update query succeeded. Rows affected:', r.rows.length);
    pool.end();
  })
  .catch(e => {
    console.error('Update query FAILED:', e);
    pool.end();
  });
