const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      let val = line.substring('DATABASE_URL='.length).trim().replace(/['"]/g, '');
      try {
        const u = new URL(val);
        u.searchParams.delete('channel_binding');
        val = u.toString();
      } catch (_) {}
      databaseUrl = val;
      break;
    }
  }
}

if (!databaseUrl) {
  console.error('[ERROR] DATABASE_URL not found in environment or .env.local');
  process.exit(1);
}

async function applyMigration() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('[MIGRATION] Connected to Neon PostgreSQL database.');

  try {
    const migrationSqlPath = path.join(__dirname, '..', 'migrations', '005_affiliate_partners_schema.sql');
    const sqlContent = fs.readFileSync(migrationSqlPath, 'utf8');

    console.log('[MIGRATION] Applying 005_affiliate_partners_schema.sql within a transaction...');
    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');
    console.log('[MIGRATION] Transaction committed successfully.');

    // Verification
    const expectedTables = [
      'ticketing_partners',
      'event_partner_offers',
      'affiliate_clicks',
      'affiliate_conversions',
      'partner_audit_logs'
    ];

    console.log('\n[VERIFICATION] Verifying created tables:');
    for (const tbl of expectedTables) {
      const res = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1;`,
        [tbl]
      );
      if (res.rows.length > 0) {
        const countRes = await client.query(`SELECT COUNT(*) FROM "${tbl}";`);
        console.log(`  ✓ Table [${tbl}] exists. Current rows: ${countRes.rows[0].count}`);
      } else {
        throw new Error(`Expected table [${tbl}] was NOT found after migration!`);
      }
    }

    console.log('\n[SUCCESS] Migration 005 applied and verified successfully on Neon PostgreSQL.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ERROR] Migration failed and rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
