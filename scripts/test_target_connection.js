#!/usr/bin/env node
/**
 * TIKUM / ARGUS — Safe Target Database Connectivity Tester
 * 
 * Verifies connectivity to the target Supabase instance.
 * STRICT SECURITY INVARIANT: Zero credential, password, or auth token logging.
 */

const { Pool } = require('pg');
const fs = require('fs');

let targetUrl = process.env.TARGET_DATABASE_URL || process.env.SUPABASE_DATABASE_URL;

if (!targetUrl && process.argv[2]) {
  targetUrl = process.argv[2];
}

if (!targetUrl && fs.existsSync('.env.local')) {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    for (const line of envContent.split('\n')) {
      if (line.startsWith('TARGET_DATABASE_URL=') || line.startsWith('SUPABASE_DATABASE_URL=')) {
        let val = line.split('=')[1].trim().replace(/['"]/g, '');
        try {
          const u = new URL(val);
          u.searchParams.delete('channel_binding');
          u.searchParams.delete('sslmode');
          val = u.toString();
        } catch (_) {}
        targetUrl = val;
        break;
      }
    }
  } catch (_) {}
}

if (!targetUrl) {
  console.error('[ERROR] TARGET_DATABASE_URL or SUPABASE_DATABASE_URL environment variable is not defined.');
  console.error('Usage: TARGET_DATABASE_URL="postgresql://..." node scripts/test_target_connection.js');
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(targetUrl);
} catch (e) {
  console.error('[FATAL] Target database URL has invalid format.');
  process.exit(1);
}

const sanitizedHost = parsedUrl.hostname;
const sanitizedPort = parsedUrl.port || '5432';
const sanitizedDb = parsedUrl.pathname.replace(/^\//, '');
const isSupabase = sanitizedHost.includes('supabase.co') || sanitizedHost.includes('pooler.supabase.com');
const isPooler = sanitizedPort === '6543' || sanitizedHost.includes('pooler');

console.log('========================================================================');
console.log('TIKUM / ARGUS — TARGET DATABASE CONNECTIVITY AUDIT');
console.log('========================================================================');
console.log(`Target Host:     ${sanitizedHost}`);
console.log(`Target Port:     ${sanitizedPort} (${isPooler ? 'Transaction Pooler / Supavisor' : 'Direct Connection'})`);
console.log(`Target Database: ${sanitizedDb}`);
console.log(`Target Provider: ${isSupabase ? 'SUPABASE POSTGRESQL' : 'POSTGRESQL'}`);
console.log('------------------------------------------------------------------------\n');

const pool = new Pool({
  connectionString: targetUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function testConnection() {
  const startTime = Date.now();
  let client;
  try {
    process.stdout.write('  Establishing TLS connection ... ');
    client = await pool.connect();
    const connectTime = Date.now() - startTime;
    console.log(`[CONNECTED] (${connectTime}ms)`);

    process.stdout.write('  Auditing target database engine ... ');
    const res = await client.query('SELECT version(), current_database(), current_schema();');
    console.log('[OK]');

    const row = res.rows[0];
    const versionParts = row.version.split(' ');
    console.log(`\n  Engine Version:  ${versionParts[0]} ${versionParts[1]}`);
    console.log(`  Database Name:   ${row.current_database}`);
    console.log(`  Current Schema:  ${row.current_schema}`);

    process.stdout.write('  Checking write & rollback capability ... ');
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE _tikum_conn_probe (id INT)');
    await client.query('INSERT INTO _tikum_conn_probe VALUES (1)');
    await client.query('ROLLBACK');
    console.log('[OK]');

    console.log('\n========================================================================');
    console.log('✅ TARGET DATABASE IS ONLINE, HEALTHY, AND READY FOR SCHEMA MIGRATION');
    console.log('========================================================================\n');
  } catch (err) {
    console.log('[FAILED]');
    console.error(`\n[CONNECTION ERROR] ${err.message}`);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

testConnection();
