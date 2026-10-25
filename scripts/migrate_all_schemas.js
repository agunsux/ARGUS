#!/usr/bin/env node
/**
 * TIKUM / ARGUS — Comprehensive Database Schema Migration Runner
 * 
 * Supports target migration to Supabase PostgreSQL or any standard PostgreSQL instance.
 * 
 * Invariants:
 * - Sanitized logging only (zero credentials, passwords, or connection strings logged).
 * - Strict transaction per migration file.
 * - Non-destructive (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
 * - Comprehensive schema audit of all 29 core tables upon completion.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

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
          val = u.toString();
        } catch (_) {}
        targetUrl = val;
        break;
      }
    }
  } catch (_) {}
}

if (!targetUrl && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('neon.tech')) {
  targetUrl = process.env.DATABASE_URL;
}

if (!targetUrl) {
  console.error('[FATAL] Target database connection string missing. Set TARGET_DATABASE_URL or SUPABASE_DATABASE_URL.');
  console.error('Usage: TARGET_DATABASE_URL="postgresql://..." node scripts/migrate_all_schemas.js');
  process.exit(1);
}

// Sanitize display URL
try {
  const u = new URL(targetUrl);
  console.log('========================================================================');
  console.log('TIKUM / ARGUS — DATABASE SCHEMA MIGRATION RUNNER');
  console.log('========================================================================');
  console.log(`Target Host:     ${u.hostname}`);
  console.log(`Target Port:     ${u.port || '5432'}`);
  console.log(`Target Database: ${u.pathname}`);
  console.log(`Provider Target: ${u.hostname.includes('supabase.co') ? 'SUPABASE' : u.hostname.includes('neon.tech') ? 'NEON' : 'POSTGRESQL'}`);
  console.log('------------------------------------------------------------------------\n');
} catch (e) {
  console.error('[FATAL] Invalid target connection string URL format.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: targetUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

const USER_REPO_DDL = `
  -- 1. Users table
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    normalized_email VARCHAR(255) UNIQUE,
    username VARCHAR(100) UNIQUE,
    normalized_username VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'BUYER',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    password_hash VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (normalized_email);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

  -- 2. User Roles table
  CREATE TABLE IF NOT EXISTS user_roles (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    assigned_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_role UNIQUE (user_id, role)
  );
  CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id);

  -- 3. Sessions table
  CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL,
    ip_address VARCHAR(100),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(100),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (session_token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (expires_at, revoked);

  -- 4. Auth Audit Events table
  CREATE TABLE IF NOT EXISTS auth_audit_events (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100),
    event_type VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    ip_address VARCHAR(100),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_events (user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_audit_type ON auth_audit_events (event_type);
  CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit_events (created_at DESC);
`;

const MIGRATIONS = [
  { version: '000', name: '000_user_and_auth_schema', sql: USER_REPO_DDL },
  { version: '001', name: '001_catalog_schema', file: 'migrations/001_catalog_schema.sql' },
  { version: '002', name: '002_marketplace_and_money_schema', file: 'migrations/002_marketplace_and_money_schema.sql' },
  { version: '003', name: '003_demand_alerts_schema', file: 'migrations/003_demand_alerts_schema.sql' },
  { version: '004', name: '004_marketplace_offers_schema', file: 'migrations/004_marketplace_offers_schema.sql' },
  { version: '005', name: '005_affiliate_partners_schema', file: 'migrations/005_affiliate_partners_schema.sql' }
];

const EXPECTED_TABLES = [
  // Schema History Tracking
  'schema_migrations',
  // Auth
  'users',
  'user_roles',
  'sessions',
  'auth_audit_events',
  // Catalog
  'canonical_events',
  'source_snapshots',
  'event_source_links',
  'reconciliation_runs',
  'discovery_scheduler_state',
  // Marketplace & Inventory
  'marketplace_tickets',
  'marketplace_listings',
  'marketplace_reservations',
  'marketplace_deliveries',
  // Financial & Money Tier
  'financial_quotes',
  'financial_orders',
  'financial_payments',
  'financial_payment_attempts',
  'financial_provider_webhooks',
  'financial_escrows',
  'financial_settlements',
  'financial_disputes',
  'financial_chargebacks',
  'financial_ledger_transactions',
  'financial_ledger_entries',
  'financial_idempotency_records',
  // Demand Alerts
  'demand_alerts',
  // Offers & Negotiations
  'marketplace_negotiations',
  'marketplace_offers',
  'marketplace_offer_audit_logs',
  // Affiliate & Ticketing Partners
  'ticketing_partners',
  'event_partner_offers',
  'affiliate_clicks',
  'affiliate_conversions',
  'partner_audit_logs'
];

async function run() {
  const client = await pool.connect();
  console.log('[CONNECT] Successfully established connection to target database.');

  try {
    const verRes = await client.query('SELECT version(), current_database(), current_schema();');
    console.log(`[INFO] PostgreSQL Version: ${verRes.rows[0].version.split(' ')[0]} ${verRes.rows[0].version.split(' ')[1]}`);
    console.log(`[INFO] Database:           ${verRes.rows[0].current_database}`);
    console.log(`[INFO] Schema:             ${verRes.rows[0].current_schema}\n`);

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum VARCHAR(64) NOT NULL,
        execution_time_ms INT NOT NULL DEFAULT 0
      );
    `);

    // Fetch existing applied migrations
    const appliedRes = await client.query('SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC');
    const appliedMap = new Map(appliedRes.rows.map(r => [r.version, r]));

    console.log('--- Applying Migrations ---');
    for (const m of MIGRATIONS) {
      const sql = (m.sql || fs.readFileSync(path.resolve(m.file), 'utf8')).trim();
      const checksum = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);

      if (appliedMap.has(m.version)) {
        console.log(`  [SKIP] ${m.name.padEnd(42)} (Already applied at ${appliedMap.get(m.version).applied_at.toISOString()})`);
        continue;
      }

      process.stdout.write(`  [APPLY] ${m.name.padEnd(41)} ... `);
      const startTime = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(sql);
        const duration = Date.now() - startTime;
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4)',
          [m.version, m.name, checksum, duration]
        );
        await client.query('COMMIT');
        console.log(`[OK] (${duration}ms)`);
      } catch (mErr) {
        await client.query('ROLLBACK');
        console.log('[FAILED]');
        throw mErr;
      }
    }

    console.log('\n--- Verifying Tables (34 Total) ---');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const existing = new Set(tablesRes.rows.map(r => r.table_name));

    let allPassed = true;
    for (const tbl of EXPECTED_TABLES) {
      const found = existing.has(tbl);
      console.log(`  Table ${tbl.padEnd(35)} : ${found ? '[EXISTS]' : '[MISSING]'}`);
      if (!found) allPassed = false;
    }

    if (!allPassed) {
      throw new Error('Not all expected tables were created in the target database.');
    }

    // Constraint and Index Audit
    const indexRes = await client.query(`
      SELECT COUNT(*) as count FROM pg_indexes WHERE schemaname = 'public';
    `);
    console.log(`\n[INFO] Total Indexes in 'public' schema: ${indexRes.rows[0].count}`);

    const fkeyRes = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.table_constraints 
      WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY';
    `);
    console.log(`[INFO] Total Foreign Keys in 'public' schema: ${fkeyRes.rows[0].count}`);

    console.log('\n>>> ALL 34 TARGET SCHEMA TABLES & MIGRATION HISTORY VERIFIED SUCCESSFULLY! <<<');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n[MIGRATION ERROR]', err.message);
  process.exit(1);
});
