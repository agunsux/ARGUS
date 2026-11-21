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

async function runTest() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Create a dummy ticket
    const insertRes = await client.query(`
      INSERT INTO marketplace_tickets (
        id, canonical_event_id, seller_id, current_owner_id, ticket_type, face_value, currency, status
      ) VALUES (
        'tkt-test-diag', 'event-gnr-jakarta-2026', 'usr-9a825b68', 'usr-9a825b68', 'GENERAL_ADMISSION', 100000, 'IDR', 'DRAFT'
      ) RETURNING *;
    `);
    console.log('Dummy ticket created:', insertRes.rows[0].id);

    // Now execute updateTicketStatus
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

    const updateRes = await client.query(sql, ['tkt-test-diag', 'PENDING_VERIFICATION', lockedBy]);
    console.log('Update result:', updateRes.rows[0]);

    await client.query('ROLLBACK');
    console.log('Transaction rolled back cleanly.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update test FAILED:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runTest();
