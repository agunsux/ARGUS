const fs = require('fs');
const { Pool } = require('pg');

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

async function inspectUser() {
  const dbUrl = getDbUrl();
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();

    console.log('=== Notifications for usr-9a825b68 / GNR ===');
    const notifs = await client.query(`
      SELECT id, event_type, priority, subject, status, created_at, payload
      FROM admin_activity_notifications
      WHERE user_id = 'usr-9a825b68' OR payload::text ILIKE '%gnr%' OR payload::text ILIKE '%guns%'
      ORDER BY created_at DESC;
    `);
    console.log('Count:', notifs.rows.length);
    for (const n of notifs.rows) {
      console.dir(n, { depth: null });
    }

    client.release();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

inspectUser();
