const { Pool } = require('pg');
const fs = require('fs');

function getEnv() {
  const env = { ...process.env };
  if (fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }
  return env;
}

const env = getEnv();
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  console.log('--- Starting Canonical Event Deduplication ---');
  const now = new Date().toISOString();

  // 1. DWP Deduplication
  // Primary: event-dwp-2026
  // Secondaries: ev-can-cc1f95f7, evt_dwp-2026_wVb9
  console.log('1. Consolidating DWP 2026 canonical records...');
  
  // Get existing metadata for primary
  const primaryDwpRes = await pool.query('SELECT metadata FROM canonical_events WHERE id = $1', ['event-dwp-2026']);
  if (primaryDwpRes.rows.length === 0) {
    throw new Error('Primary DWP event event-dwp-2026 not found in canonical_events');
  }
  const primaryDwpMeta = primaryDwpRes.rows[0].metadata || {};
  const updatedDwpMeta = {
    ...primaryDwpMeta,
    alias_ids: Array.from(new Set([...(primaryDwpMeta.alias_ids || []), 'ev-can-cc1f95f7', 'evt_dwp-2026_wVb9'])),
    alias_slugs: Array.from(new Set([...(primaryDwpMeta.alias_slugs || []), 'dwp-2026-jakarta', 'dwp-2026_wVb9'])),
    consolidated_at: now
  };

  await pool.query(`
    UPDATE canonical_events 
    SET min_price = COALESCE(min_price, 850000.00),
        metadata = $1,
        updated_at = NOW()
    WHERE id = 'event-dwp-2026'
  `, [JSON.stringify(updatedDwpMeta)]);
  console.log('  Updated primary event-dwp-2026 with min_price and alias_ids');

  // Archive secondaries
  for (const secId of ['ev-can-cc1f95f7', 'evt_dwp-2026_wVb9']) {
    const secRes = await pool.query('SELECT metadata FROM canonical_events WHERE id = $1', [secId]);
    const secMeta = secRes.rows[0]?.metadata || {};
    const updatedSecMeta = {
      ...secMeta,
      canonical_event_id: 'event-dwp-2026',
      merged_into: 'event-dwp-2026',
      merged_at: now
    };
    await pool.query(`
      UPDATE canonical_events
      SET public_visibility = false,
          homepage_visibility = false,
          archive_status = 'ARCHIVED',
          archived_at = NOW(),
          metadata = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(updatedSecMeta), secId]);
    console.log(`  Archived secondary DWP record ${secId}`);
  }

  // 2. Maroon 5 Deduplication
  // Primary: ev-can-30949569 (slug: maroon-5-asia-2027-in-jakarta)
  // Secondary: evt_edp1690841
  console.log('\n2. Consolidating Maroon 5 canonical records...');
  const primaryM5Res = await pool.query('SELECT metadata FROM canonical_events WHERE id = $1', ['ev-can-30949569']);
  if (primaryM5Res.rows.length === 0) {
    throw new Error('Primary Maroon 5 event ev-can-30949569 not found in canonical_events');
  }
  const primaryM5Meta = primaryM5Res.rows[0].metadata || {};
  const updatedM5Meta = {
    ...primaryM5Meta,
    alias_ids: Array.from(new Set([...(primaryM5Meta.alias_ids || []), 'evt_edp1690841'])),
    alias_slugs: Array.from(new Set([...(primaryM5Meta.alias_slugs || []), 'evt_edp1690841'])),
    consolidated_at: now
  };

  await pool.query(`
    UPDATE canonical_events
    SET min_price = COALESCE(min_price, 1450000.00),
        metadata = $1,
        updated_at = NOW()
    WHERE id = 'ev-can-30949569'
  `, [JSON.stringify(updatedM5Meta)]);
  console.log('  Updated primary ev-can-30949569 with alias_ids');

  // Archive secondary Maroon 5 record
  const secM5Res = await pool.query('SELECT metadata FROM canonical_events WHERE id = $1', ['evt_edp1690841']);
  const secM5Meta = secM5Res.rows[0]?.metadata || {};
  const updatedSecM5Meta = {
    ...secM5Meta,
    canonical_event_id: 'ev-can-30949569',
    merged_into: 'ev-can-30949569',
    merged_at: now
  };
  await pool.query(`
    UPDATE canonical_events
    SET public_visibility = false,
        homepage_visibility = false,
        archive_status = 'ARCHIVED',
        archived_at = NOW(),
        metadata = $1,
        updated_at = NOW()
    WHERE id = 'evt_edp1690841'
  `, [JSON.stringify(updatedSecM5Meta)]);
  console.log('  Archived secondary Maroon 5 record evt_edp1690841');

  // Verification query
  console.log('\n3. Verifying deduplication result:');
  const targetIds = ['event-dwp-2026', 'ev-can-cc1f95f7', 'evt_dwp-2026_wVb9', 'ev-can-30949569', 'evt_edp1690841'];
  const verifyRes = await pool.query(`
    SELECT id, slug, canonical_name, min_price, public_visibility, homepage_visibility, archive_status,
           metadata->>'canonical_event_id' as merged_to,
           metadata->'alias_ids' as aliases
    FROM canonical_events
    WHERE id = ANY($1)
    ORDER BY canonical_name, archive_status
  `, [targetIds]);
  console.table(verifyRes.rows);

  await pool.end();
}

run().catch(err => {
  console.error('Error during deduplication:', err);
  pool.end();
  process.exit(1);
});
