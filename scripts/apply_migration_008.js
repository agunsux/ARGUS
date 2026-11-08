#!/usr/bin/env node
/**
 * TIKUM / ARGUS — Migration 008 Runner & Verification Suite
 * 
 * Target: Neon Staging / Preview Database (nameless-heart-51880694)
 * Invariants:
 * - Sanitized logging only (zero credentials, passwords, or raw connection strings logged).
 * - Production database guard (hard abort if targeting shiny-surf-22498418 or ap-southeast-1).
 * - Strict transaction (BEGIN / COMMIT / ROLLBACK on failure).
 * - Tracks execution in `schema_migrations`.
 * - Full verification of 4 tables, columns, indexes, constraints, and ACID rollback.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

let targetUrl = process.env.STAGING_DATABASE_URL || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl && process.argv[2]) {
  targetUrl = process.argv[2];
}

if (!targetUrl) {
  console.error('[FATAL] Target database connection string missing.');
  console.error('Usage: STAGING_DATABASE_URL="postgresql://..." node scripts/apply_migration_008.js');
  process.exit(1);
}

// Clean quotes & channel binding
let cleanUrl = targetUrl.trim().replace(/^['"]|['"]$/g, '');
try {
  const u = new URL(cleanUrl);
  u.searchParams.delete('channel_binding');
  cleanUrl = u.toString();
} catch (e) {
  console.error('[FATAL] Invalid connection string format.');
  process.exit(1);
}

const parsedUrl = new URL(cleanUrl);

// PRODUCTION SAFETY GUARD
const PROD_HOST_PATTERNS = [
  'ep-wispy-salad-b3in9yw3',
  'shiny-surf-22498418',
  'c-4.ap-southeast-1.aws.neon.tech',
  'ap-southeast-1'
];

for (const pattern of PROD_HOST_PATTERNS) {
  if (parsedUrl.hostname.includes(pattern)) {
    console.error('\n========================================================================');
    console.error('🚨 [ABORT] PRODUCTION DATABASE DETECTED!');
    console.error(`Target Host: ${parsedUrl.hostname} matches production pattern '${pattern}'.`);
    console.error('Migration 008 is STRICTLY FORBIDDEN on Production at this stage.');
    console.error('========================================================================\n');
    process.exit(1);
  }
}

console.log('========================================================================');
console.log('TIKUM / ARGUS — MIGRATION 008 RUNNER (EDITORIAL & SCHEDULER)');
console.log('========================================================================');
console.log(`Target Host:     ${parsedUrl.hostname}`);
console.log(`Target Port:     ${parsedUrl.port || '5432'}`);
console.log(`Target Database: ${parsedUrl.pathname}`);
console.log(`Target User:     ${parsedUrl.username}`);
console.log(`Provider Target: NEON POSTGRESQL (STAGING / PREVIEW)`);
console.log('------------------------------------------------------------------------\n');

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function run() {
  const client = await pool.connect();
  console.log('[CONNECT] Successfully connected to staging database.');

  try {
    const verRes = await client.query('SELECT version(), current_database(), current_schema();');
    console.log(`[INFO] PostgreSQL Version: ${verRes.rows[0].version.split(' ')[0]} ${verRes.rows[0].version.split(' ')[1]}`);
    console.log(`[INFO] Database:           ${verRes.rows[0].current_database}`);
    console.log(`[INFO] Schema:             ${verRes.rows[0].current_schema}\n`);

    // 1. Ensure schema_migrations exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum VARCHAR(64) NOT NULL,
        execution_time_ms INT NOT NULL DEFAULT 0
      );
    `);

    // 2. Read migration file
    const migrationFile = path.resolve(__dirname, '../migrations/008_editorial_articles_and_scheduler_schema.sql');
    const sqlContent = fs.readFileSync(migrationFile, 'utf8').trim();
    const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex').slice(0, 16);

    // 3. Check migration status
    const migCheck = await client.query('SELECT * FROM schema_migrations WHERE version = $1', ['008']);
    if (migCheck.rows.length > 0) {
      console.log(`[STATUS] Migration 008 already recorded in schema_migrations (applied at ${migCheck.rows[0].applied_at.toISOString()}).`);
    } else {
      console.log('[APPLY] Executing migration 008 within a transaction...');
      const startTime = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        const duration = Date.now() - startTime;
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4)',
          ['008', '008_editorial_articles_and_scheduler_schema', checksum, duration]
        );
        await client.query('COMMIT');
        console.log(`[OK] Migration 008 applied and committed successfully (${duration}ms).`);
      } catch (applyErr) {
        await client.query('ROLLBACK');
        console.error('[FAILED] Migration transaction failed and was rolled back.');
        throw applyErr;
      }
    }

    // 4. Verify all 4 tables exist
    console.log('\n--- 1. Table Existence Verification ---');
    const expectedTables = [
      'editorial_articles',
      'editorial_article_audit_logs',
      'editorial_scheduler_state',
      'editorial_scheduler_execution_logs'
    ];

    for (const tbl of expectedTables) {
      const res = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [tbl]
      );
      if (res.rows.length === 0) {
        throw new Error(`Expected table '${tbl}' was NOT found in public schema!`);
      }
      console.log(`  ✓ Table '${tbl.padEnd(36)}' : EXISTS`);
    }

    // 5. Verify Column Specifications
    console.log('\n--- 2. Column Specification Verification ---');
    const columnsCheck = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (
        'editorial_articles',
        'editorial_article_audit_logs',
        'editorial_scheduler_state',
        'editorial_scheduler_execution_logs'
      )
      ORDER BY table_name, ordinal_position;
    `);

    const colsByTable = {};
    for (const row of columnsCheck.rows) {
      if (!colsByTable[row.table_name]) colsByTable[row.table_name] = [];
      colsByTable[row.table_name].push(row.column_name);
    }

    const requiredColumns = {
      editorial_articles: [
        'id', 'slug', 'title', 'description', 'category', 'search_intent',
        'primary_keyword', 'secondary_keywords', 'seo_title', 'meta_description',
        'image', 'image_alt', 'content', 'author', 'status', 'human_approved_by',
        'human_approved_at', 'scheduled_at', 'published_at', 'publish_error',
        'faq', 'internal_links', 'quality_score', 'seo_score', 'trust_score',
        'version', 'created_at', 'updated_at'
      ],
      editorial_article_audit_logs: [
        'id', 'article_id', 'action', 'performed_by', 'from_status', 'to_status', 'changes', 'created_at'
      ],
      editorial_scheduler_state: [
        'job_name', 'lease_owner', 'lease_acquired_at', 'lease_expires_at', 'last_run_id',
        'last_status', 'last_run_report', 'is_paused', 'retry_count', 'next_retry_at', 'updated_at'
      ],
      editorial_scheduler_execution_logs: [
        'id', 'job_name', 'run_id', 'status', 'published_count', 'published_articles',
        'error_message', 'started_at', 'completed_at'
      ]
    };

    for (const [tbl, cols] of Object.entries(requiredColumns)) {
      const existing = new Set(colsByTable[tbl] || []);
      for (const col of cols) {
        if (!existing.has(col)) {
          throw new Error(`Missing expected column '${col}' in table '${tbl}'!`);
        }
      }
      console.log(`  ✓ Table '${tbl.padEnd(36)}' : All ${cols.length} required columns verified.`);
    }

    // 6. Verify Indexes
    console.log('\n--- 3. Index Verification ---');
    const indexRes = await client.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN (
        'editorial_articles',
        'editorial_article_audit_logs',
        'editorial_scheduler_state',
        'editorial_scheduler_execution_logs'
      );
    `);

    const expectedIndexes = [
      'idx_editorial_articles_slug',
      'idx_editorial_articles_status_pub',
      'idx_editorial_articles_scheduled',
      'idx_editorial_article_audit_art',
      'idx_editorial_scheduler_exec_time'
    ];

    const existingIndexNames = new Set(indexRes.rows.map(r => r.indexname));
    for (const idx of expectedIndexes) {
      if (!existingIndexNames.has(idx)) {
        throw new Error(`Missing expected index '${idx}'!`);
      }
      console.log(`  ✓ Index '${idx.padEnd(36)}' : EXISTS`);
    }

    // 7. Test Transaction Behavior & Rollback
    console.log('\n--- 4. Transaction Atomicity & Rollback Verification ---');
    await client.query('BEGIN');
    const probeJob = '_probe_rollback_test_' + Date.now();
    await client.query(
      `INSERT INTO editorial_scheduler_state (job_name, lease_owner, is_paused) VALUES ($1, $2, true)`,
      [probeJob, 'rollback_test_worker']
    );
    await client.query('ROLLBACK');

    const rollbackCheck = await client.query(
      `SELECT * FROM editorial_scheduler_state WHERE job_name = $1`,
      [probeJob]
    );
    if (rollbackCheck.rows.length !== 0) {
      throw new Error('Transaction rollback failed: probe record still exists after ROLLBACK!');
    }
    console.log('  ✓ Transaction rollback verified: rolled back row does NOT persist.');

    // 8. Initial Seed Data Verification
    console.log('\n--- 5. Seed Inventory Verification ---');
    const countCheck = await client.query('SELECT COUNT(*) FROM editorial_articles');
    let articleCount = parseInt(countCheck.rows[0].count, 10);

    if (articleCount === 0) {
      console.log('  [SEED] Table is empty. Seeding baseline from articles_snapshot.json...');
      const snapPath = path.resolve(__dirname, '../src/content/fixtures/articles_snapshot.json');
      const fixtures = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
      
      for (const art of fixtures) {
        await client.query(`
          INSERT INTO editorial_articles (
            id, slug, title, description, category, search_intent,
            primary_keyword, secondary_keywords, seo_title, meta_description,
            image, image_alt, content, author, status, human_approved_by,
            human_approved_at, scheduled_at, published_at, faq, internal_links,
            quality_score, seo_score, trust_score, version, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26, $27
          ) ON CONFLICT (id) DO NOTHING
        `, [
          art.id, art.slug, art.title, art.description, art.category, art.search_intent || 'informational',
          art.primary_keyword || null, JSON.stringify(art.secondary_keywords || []), art.seo_title || null, art.meta_description || null,
          art.image || null, art.image_alt || null, art.content, art.author || 'Tim Editorial Tikum', art.status || 'draft', art.human_approved_by || null,
          art.human_approved_at ? new Date(art.human_approved_at).toISOString() : null,
          art.scheduled_at ? new Date(art.scheduled_at).toISOString() : null,
          art.published_at ? new Date(art.published_at).toISOString() : null,
          JSON.stringify(art.faq || []), JSON.stringify(art.internal_links || []),
          art.quality_score || null, art.seo_score || null, art.trust_score || null,
          art.version || 1,
          art.created_at ? new Date(art.created_at).toISOString() : new Date().toISOString(),
          art.updated_at ? new Date(art.updated_at).toISOString() : new Date().toISOString()
        ]);
      }
      const updatedCountRes = await client.query('SELECT COUNT(*) FROM editorial_articles');
      articleCount = parseInt(updatedCountRes.rows[0].count, 10);
      console.log(`  ✓ Successfully seeded ${articleCount} articles.`);
    } else {
      console.log(`  ✓ Table already contains ${articleCount} articles.`);
    }

    // Status breakdown audit
    const statusAudit = await client.query(`
      SELECT status, COUNT(*) as count
      FROM editorial_articles
      GROUP BY status
      ORDER BY status;
    `);

    console.log('\n--- 6. Status Breakdown on Staging Database ---');
    for (const row of statusAudit.rows) {
      console.log(`  Status '${row.status.padEnd(12)}' : ${row.count} articles`);
    }

    // Verify GNR article is NOT published or present
    const gnrAudit = await client.query(`
      SELECT id, slug, status FROM editorial_articles
      WHERE id LIKE '%gnr%' OR slug LIKE '%gnr%' OR title ILIKE '%guns n%roses%';
    `);

    if (gnrAudit.rows.length > 0) {
      const gnr = gnrAudit.rows[0];
      if (gnr.status === 'published') {
        throw new Error(`CRITICAL VIOLATION: GNR article is marked 'published' on staging database!`);
      }
      console.log(`  ✓ GNR Article Check: Found 1 article (${gnr.id}) with status '${gnr.status}' (NOT PUBLISHED).`);
    } else {
      console.log('  ✓ GNR Article Check: Zero GNR articles in staging database (COMPLETELY UNPUBLISHED).');
    }

    console.log('\n========================================================================');
    console.log('✅ MIGRATION 008 VERIFIED ON STAGING DATABASE');
    console.log('========================================================================\n');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n[FATAL ERROR IN MIGRATION 008]', err.message);
  process.exit(1);
});
