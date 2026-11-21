const { EventTemporalLifecycleEngine } = require('../src/discovery/EventTemporalLifecycleEngine');
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

async function checkEvent() {
  const client = await pool.connect();
  const res = await client.query('SELECT * FROM canonical_events WHERE id = $1', ['event-gnr-jakarta-2026']);
  const ev = res.rows[0];
  console.log('Event from DB:', {
    id: ev.id,
    start_date: ev.start_date,
    start_datetime: ev.start_datetime,
    end_date: ev.end_date,
    end_datetime: ev.end_datetime,
    timezone: ev.timezone,
    lifecycle_status: ev.lifecycle_status,
    homepage_visibility: ev.homepage_visibility
  });

  const isExp = EventTemporalLifecycleEngine.isEventExpired(ev);
  const isUp = EventTemporalLifecycleEngine.isEventUpcoming(ev);
  const isHpEligible = EventTemporalLifecycleEngine.isEventHomepageEligible(ev);
  console.log('Temporal checks:', { isExp, isUp, isHpEligible });

  client.release();
  await pool.end();
}

checkEvent();
