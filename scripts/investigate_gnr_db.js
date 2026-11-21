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

async function inspect() {
  const dbUrl = getDbUrl();
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();

    console.log('=== GNR Canonical Events ===');
    const gnrEvents = await client.query(`
      SELECT id, slug, canonical_name, start_date, start_datetime, venue_name, lifecycle_status, public_visibility, homepage_visibility, metadata
      FROM canonical_events 
      WHERE canonical_name ILIKE '%guns%' OR slug ILIKE '%guns%' OR id ILIKE '%gnr%';
    `);
    console.dir(gnrEvents.rows, { depth: null });

    console.log('\n=== Tickets with GNR Event or Recently Created ===');
    const tickets = await client.query(`
      SELECT *
      FROM marketplace_tickets
      WHERE canonical_event_id ILIKE '%gnr%' OR canonical_event_id ILIKE '%guns%'
      ORDER BY created_at DESC;
    `);
    console.dir(tickets.rows.map(t => {
      const m = { ...t };
      if (m.seller_id) m.seller_id = String(m.seller_id).slice(0, 8) + '***';
      if (m.current_owner_id) m.current_owner_id = String(m.current_owner_id).slice(0, 8) + '***';
      return m;
    }), { depth: null });

    console.log('\n=== Listings with GNR Event or Recently Created ===');
    const listings = await client.query(`
      SELECT *
      FROM marketplace_listings
      WHERE canonical_event_id ILIKE '%gnr%' OR canonical_event_id ILIKE '%guns%'
      ORDER BY created_at DESC;
    `);
    console.dir(listings.rows, { depth: null });

    // Also check all tables with "listing" or "ticket" in name
    const relatedTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND (table_name ILIKE '%list%' OR table_name ILIKE '%ticket%' OR table_name ILIKE '%order%' OR table_name ILIKE '%moderation%');
    `);
    console.log('\n=== Related Tables in DB ===', relatedTables.rows.map(r => r.table_name));

    client.release();
  } catch (err) {
    console.error('Inspection error:', err);
  } finally {
    await pool.end();
  }
}

inspect();
