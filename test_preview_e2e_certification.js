#!/usr/bin/env node
/**
 * TIKUM / ARGUS — Preview Runtime Database & Scheduler Certification Acceptance Suite
 * 
 * Verifies live Vercel Preview runtime against Neon Staging Database (nameless-heart-51880694).
 * 
 * Invariants tested:
 * 1. Runtime database binding to Neon Staging (not production, not local mock).
 * 2. Unauthenticated access fail-closed (HTTP 401).
 * 3. End-to-end Draft CRUD and versioned PostgreSQL persistence.
 * 4. Invisibility of non-published content on public /blog and /blog/:slug.
 * 5. Scheduler pause / resume controls in distributed PostgreSQL state.
 * 6. Isolated, targeted scheduled article publication without affecting campaign articles.
 * 7. Scheduler idempotency and execution logging in PostgreSQL.
 * 8. Clean test fixture teardown and protection of all 33 baseline articles + GNR absent.
 * 9. Prelaunch payment boundary guard.
 */

const fs = require('fs');
const { Pool } = require('pg');

const PREVIEW_URL = process.env.PREVIEW_URL || 'https://argus-oy4dolkcn-shinerva.vercel.app';
const BYPASS_SECRET = process.env.VERCEL_PROTECTION_BYPASS || 'xIPBjrn6NgFlCegXY7LFgOfDjlFIi9rz';

// Read admin key from .env.local
let adminKey = process.env.ADMIN_API_KEY;
if (!adminKey && fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  const m = content.match(/ADMIN_API_KEY=([^\r\n]+)/);
  if (m) adminKey = m[1].trim();
}

if (!adminKey) {
  console.error('[FATAL] ADMIN_API_KEY missing from environment and .env.local');
  process.exit(1);
}

// Staging Neon Database URL
const stagingDbUrl = process.env.STAGING_DATABASE_URL || 'postgresql://neondb_owner:npg_kRMvQPcwfx35@ep-muddy-thunder-b4yvk29p-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

// Direct PG pool to Neon staging for independent verification
const pgPool = new Pool({
  connectionString: stagingDbUrl,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 10000
});

async function apiFetch(path, options = {}) {
  const url = `${PREVIEW_URL}${path}`;
  const headers = {
    'x-vercel-protection-bypass': BYPASS_SECRET,
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
  passedChecks++;
}

async function runSuite() {
  console.log('================================================================');
  console.log('TIKUM / ARGUS — PREVIEW RUNTIME CERTIFICATION SUITE');
  console.log(`Preview URL: ${PREVIEW_URL}`);
  console.log('Target Database: Neon Staging (nameless-heart-51880694 / aws-us-east-2)');
  console.log('================================================================\n');

  const testStamp = Date.now();
  const draftId = `test_cert_draft_${testStamp}`;
  const draftSlug = `uji-coba-sertifikasi-draft-${testStamp}`;
  const schedId = `test_cert_sched_${testStamp}`;
  const schedSlug = `uji-coba-sertifikasi-sched-${testStamp}`;

  try {
    // -------------------------------------------------------------
    // CHECK 1: Vercel Project & Database Target Diagnostic
    // -------------------------------------------------------------
    console.log('--- CHECK 1: Runtime Database Diagnostic ---');
    const diagRes = await apiFetch('/api/admin/content/diagnostic', {
      headers: { 'x-admin-key': adminKey }
    });
    assert(diagRes.status === 200, `Diagnostic endpoint returned HTTP ${diagRes.status}`);
    const diag = await diagRes.json();
    assert(diag.status === 'ok', `Diagnostic status is ok`);
    assert(diag.database_provider === 'NEON', `Database provider is NEON`);
    assert(diag.sanitized_host.includes('us-east-2.aws.neon.tech'), `Host is in aws-us-east-2 (${diag.sanitized_host})`);
    assert(diag.is_production_database === false, `Production database guard: is_production_database is FALSE`);
    assert(diag.migration_008?.recorded === true, `Migration 008 recorded in schema_migrations`);
    assert(diag.editorial_tables.editorial_articles === true, `Table editorial_articles exists`);
    assert(diag.editorial_tables.editorial_article_audit_logs === true, `Table editorial_article_audit_logs exists`);
    assert(diag.editorial_tables.editorial_scheduler_state === true, `Table editorial_scheduler_state exists`);
    assert(diag.editorial_tables.editorial_scheduler_execution_logs === true, `Table editorial_scheduler_execution_logs exists`);
    assert(diag.gnr_status === 'NOT_PRESENT', `Guns N' Roses article is NOT_PRESENT`);

    // -------------------------------------------------------------
    // CHECK 2: Fail-Closed Authorization Guard
    // -------------------------------------------------------------
    console.log('\n--- CHECK 2: Security & Fail-Closed Authorization ---');
    const unauthGet = await apiFetch('/api/admin/content/articles');
    assert(unauthGet.status === 401, `Unauthenticated GET /api/admin/content/articles rejected with 401`);
    
    const unauthPost = await apiFetch('/api/admin/content/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked Draft' })
    });
    assert(unauthPost.status === 401, `Unauthenticated POST /api/admin/content/articles rejected with 401`);

    const badKeyPost = await apiFetch('/api/admin/content/articles', {
      method: 'POST',
      headers: { 'x-admin-key': 'invalid-attacker-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked Draft' })
    });
    assert(badKeyPost.status === 401, `Invalid x-admin-key rejected with 401`);

    // -------------------------------------------------------------
    // CHECK 3: End-to-End Draft Article Creation & Neon Persistence
    // -------------------------------------------------------------
    console.log('\n--- CHECK 3: Draft Article Creation & Direct Neon Verification ---');
    const createRes = await apiFetch('/api/admin/content/articles', {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: draftId,
        title: 'Uji Coba Sertifikasi Staging Tikum',
        slug: draftSlug,
        content: 'Ini adalah konten pengujian end-to-end verifikasi persistensi database PostgreSQL yang panjangnya lebih dari seratus karakter agar lolos validasi ContentQualityEngine dengan sempurna tanpa ada catatan kegagalan sama sekali.',
        description: 'Panduan komprehensif uji coba sertifikasi preview runtime database dan scheduler Tikum.',
        excerpt: 'Panduan komprehensif uji coba sertifikasi preview runtime database dan scheduler Tikum.',
        category: 'ticket-safety',
        tags: ['sertifikasi', 'preview', 'testing'],
        author: 'Lead Certification Bot'
      })
    });
    assert(createRes.status === 201, `Draft created via Preview API (HTTP 201)`);
    const createBody = await createRes.json();
    assert(createBody.success === true, `Create response success = true`);
    assert(createBody.article?.id === draftId, `Created article ID matches`);
    assert(createBody.article?.status === 'draft', `Created article status is 'draft'`);

    // Directly verify row in Neon staging database
    const dbDraftRow = await pgPool.query('SELECT * FROM editorial_articles WHERE id = $1', [draftId]);
    assert(dbDraftRow.rows.length === 1, `Direct PostgreSQL check: exactly 1 row found in editorial_articles`);
    assert(dbDraftRow.rows[0].status === 'draft', `Direct PostgreSQL check: status is 'draft'`);
    assert(dbDraftRow.rows[0].version === 1, `Direct PostgreSQL check: initial version is 1`);

    // Verify audit log row
    const dbAuditRows = await pgPool.query('SELECT * FROM editorial_article_audit_logs WHERE article_id = $1', [draftId]);
    assert(dbAuditRows.rows.length >= 1, `Direct PostgreSQL check: audit log recorded`);
    assert(dbAuditRows.rows[0].to_status === 'draft', `Direct PostgreSQL check: audit log to_status is 'draft'`);

    // -------------------------------------------------------------
    // CHECK 4: Non-Published Invisibility in Public /blog Surface
    // -------------------------------------------------------------
    console.log('\n--- CHECK 4: Public Surface Invisibility Guard ---');
    const blogListRes = await apiFetch('/blog');
    assert(blogListRes.status === 200, `GET /blog returns HTTP 200`);
    const blogListHtml = await blogListRes.text();
    assert(!blogListHtml.includes(draftSlug), `Draft slug is completely absent from public /blog listing`);
    assert(!blogListHtml.includes('Uji Coba Sertifikasi Staging Tikum'), `Draft title is absent from public /blog listing`);

    const draftDetailRes = await apiFetch(`/blog/${draftSlug}`);
    assert(draftDetailRes.status === 404, `GET /blog/${draftSlug} returns HTTP 404 for draft article`);

    // -------------------------------------------------------------
    // CHECK 5: Update with Concurrency Versioning
    // -------------------------------------------------------------
    console.log('\n--- CHECK 5: Update & Version Increment Verification ---');
    const updateRes = await apiFetch(`/api/admin/content/articles/${draftId}`, {
      method: 'PUT',
      headers: {
        'x-admin-key': adminKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Uji Coba Sertifikasi Staging Tikum (Updated Version)',
        excerpt: 'Ringkasan yang diperbarui untuk verifikasi versioning.'
      })
    });
    assert(updateRes.status === 200, `Article updated via Preview API (HTTP 200)`);
    
    const dbUpdatedRow = await pgPool.query('SELECT * FROM editorial_articles WHERE id = $1', [draftId]);
    assert(dbUpdatedRow.rows[0].title === 'Uji Coba Sertifikasi Staging Tikum (Updated Version)', `Title updated in Neon`);
    assert(dbUpdatedRow.rows[0].version === 2, `Direct PostgreSQL check: version incremented to 2`);

    // -------------------------------------------------------------
    // CHECK 6: Scheduled Article & Scheduler Pause/Resume Controls
    // -------------------------------------------------------------
    console.log('\n--- CHECK 6: Scheduler Pause / Resume & Distributed State ---');
    // Create draft for scheduling
    const createSchedRes = await apiFetch('/api/admin/content/articles', {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: schedId,
        title: 'Artikel Terjadwal Uji Coba',
        slug: schedSlug,
        content: 'Ini adalah konten pengujian end-to-end verifikasi persistensi database PostgreSQL yang panjangnya lebih dari seratus karakter agar lolos validasi ContentQualityEngine dengan sempurna tanpa ada catatan kegagalan sama sekali.',
        description: 'Panduan komprehensif uji coba sertifikasi preview runtime database dan scheduler Tikum.',
        excerpt: 'Panduan komprehensif uji coba sertifikasi preview runtime database dan scheduler Tikum.',
        category: 'ticket-safety',
        tags: ['jadwal', 'testing'],
        author: 'Scheduler Tester'
      })
    });
    assert(createSchedRes.status === 201, `Scheduled candidate created via API (HTTP 201)`);

    // Approve article
    const approveRes = await apiFetch(`/api/admin/content/articles/${schedId}/approve`, {
      method: 'POST',
      headers: { 'x-admin-key': adminKey }
    });
    assert(approveRes.status === 200, `Article approved via API (HTTP 200)`);

    // Schedule article with past timestamp so it is due
    const pastTime = new Date(Date.now() - 3600000).toISOString();
    const schedRes = await apiFetch(`/api/admin/content/articles/${schedId}/schedule`, {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targetDate: pastTime })
    });
    assert(schedRes.status === 200, `Article scheduled via API (HTTP 200)`);

    // Verify it is not visible on /blog
    const schedDetailBefore = await apiFetch(`/blog/${schedSlug}`);
    assert(schedDetailBefore.status === 404, `Scheduled article returns HTTP 404 on /blog before publishing`);

    // Pause scheduler
    const pauseRes = await apiFetch('/api/admin/content/scheduler/pause', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey }
    });
    assert(pauseRes.status === 200, `POST /api/admin/content/scheduler/pause returns HTTP 200`);
    const dbStatePause = await pgPool.query("SELECT is_paused FROM editorial_scheduler_state WHERE job_name = 'editorial_publishing_cycle'");
    assert(dbStatePause.rows[0]?.is_paused === true, `Direct PostgreSQL check: is_paused = true in state table`);

    // Trigger run while paused with targetArticleId
    const pausedRunRes = await apiFetch('/api/admin/content/scheduler/run', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetArticleId: schedId })
    });
    const pausedRunBody = await pausedRunRes.json();
    assert(pausedRunBody.cycle_result?.status === 'rejected' || pausedRunBody.cycle_result?.reason === 'SCHEDULER_PAUSED',
      `Scheduler run rejected when paused (${pausedRunBody.cycle_result?.reason || pausedRunBody.cycle_result?.status})`);

    // Verify scheduled article remains scheduled in database
    const dbSchedStillScheduled = await pgPool.query('SELECT status FROM editorial_articles WHERE id = $1', [schedId]);
    assert(dbSchedStillScheduled.rows[0]?.status === 'scheduled', `Article remains 'scheduled' in Neon database`);

    // Resume scheduler
    const resumeRes = await apiFetch('/api/admin/content/scheduler/resume', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey }
    });
    assert(resumeRes.status === 200, `POST /api/admin/content/scheduler/resume returns HTTP 200`);
    const dbStateResume = await pgPool.query("SELECT is_paused FROM editorial_scheduler_state WHERE job_name = 'editorial_publishing_cycle'");
    assert(dbStateResume.rows[0]?.is_paused === false, `Direct PostgreSQL check: is_paused = false in state table`);

    // -------------------------------------------------------------
    // CHECK 7: Targeted Scheduler Execution & Idempotency
    // -------------------------------------------------------------
    console.log('\n--- CHECK 7: Targeted Scheduler Run & Idempotent Publishing ---');
    const runRes = await apiFetch('/api/admin/content/scheduler/run', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetArticleId: schedId })
    });
    assert(runRes.status === 200, `Targeted scheduler run returned HTTP 200`);
    const runBody = await runRes.json();
    assert(runBody.cycle_result?.publishedCount === 1, `Published exactly 1 targeted due article`);
    assert(runBody.cycle_result?.articles[0]?.id === schedId, `Published article ID is targetArticleId`);

    // Verify row in Neon database
    const dbPublishedRow = await pgPool.query('SELECT status, published_at, version FROM editorial_articles WHERE id = $1', [schedId]);
    assert(dbPublishedRow.rows[0]?.status === 'published', `Direct PostgreSQL check: status transitioned to 'published'`);
    assert(dbPublishedRow.rows[0]?.published_at !== null, `Direct PostgreSQL check: published_at is set`);
    assert(dbPublishedRow.rows[0]?.version >= 2, `Direct PostgreSQL check: version incremented upon publish`);

    // Verify execution log in Neon
    const dbExecLogs = await pgPool.query('SELECT * FROM editorial_scheduler_execution_logs ORDER BY started_at DESC LIMIT 1');
    assert(dbExecLogs.rows.length === 1, `Execution log recorded in Neon editorial_scheduler_execution_logs`);
    assert(dbExecLogs.rows[0].status === 'success' || dbExecLogs.rows[0].status === 'SUCCESS', `Execution log status is 'success'`);

    // Verify public /blog detail now returns HTTP 200
    const publishedDetailRes = await apiFetch(`/blog/${schedSlug}`);
    assert(publishedDetailRes.status === 200, `GET /blog/${schedSlug} returns HTTP 200 for newly published article`);
    const publishedHtml = await publishedDetailRes.text();
    assert(publishedHtml.includes('Artikel Terjadwal Uji Coba'), `Public page contains published article title`);
    assert(publishedHtml.includes('schema.org') && publishedHtml.includes('BlogPosting'), `Public page contains BlogPosting schema`);

    // Test Scheduler Idempotency: re-running does not re-publish or conflict
    const rerunRes = await apiFetch('/api/admin/content/scheduler/run', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetArticleId: schedId })
    });
    assert(rerunRes.status === 200, `Re-run returns HTTP 200`);
    const rerunBody = await rerunRes.json();
    assert(!rerunBody.cycle_result?.publishedCount || rerunBody.cycle_result?.publishedCount === 0, `Idempotency verified: re-run published 0 articles`);

    // -------------------------------------------------------------
    // CHECK 8: Clean Teardown & Invariants Guard
    // -------------------------------------------------------------
    console.log('\n--- CHECK 8: Teardown & Campaign Invariants Verification ---');
    // Delete test articles via API
    const delDraft = await apiFetch(`/api/admin/content/articles/${draftId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey }
    });
    assert(delDraft.status === 200, `DELETE draft test article returns HTTP 200`);

    const delSched = await apiFetch(`/api/admin/content/articles/${schedId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey }
    });
    assert(delSched.status === 200, `DELETE scheduled test article returns HTTP 200`);

    // Verify deletion in Neon database
    const dbCheckDraft = await pgPool.query('SELECT id FROM editorial_articles WHERE id = $1', [draftId]);
    assert(dbCheckDraft.rows.length === 0, `Draft test article cleanly deleted from Neon`);

    const dbCheckSched = await pgPool.query('SELECT id FROM editorial_articles WHERE id = $1', [schedId]);
    assert(dbCheckSched.rows.length === 0, `Scheduled test article cleanly deleted from Neon`);

    // Invariant: Campaign articles status intact
    const dbCampaignCount = await pgPool.query(`
      SELECT status, count(*)::int as cnt
      FROM editorial_articles
      GROUP BY status
    `);
    const counts = {};
    dbCampaignCount.rows.forEach(r => counts[r.status] = r.cnt);
    assert(counts['published'] === 2, `Campaign invariant: exactly 2 published articles (${counts['published']})`);
    assert(counts['scheduled'] === 33, `Campaign invariant: 33 scheduled articles (${counts['scheduled']})`);
    assert(counts['draft'] === 1, `Campaign invariant: exactly 1 baseline draft (${counts['draft']})`);

    // Invariant: Guns N' Roses article strictly absent
    const dbGnr = await pgPool.query(`
      SELECT id, title, status FROM editorial_articles
      WHERE slug ILIKE '%guns-n-roses%' OR id ILIKE '%gnr%'
    `);
    assert(dbGnr.rows.length === 0, `GNR invariant: Guns N' Roses candidate is completely ABSENT from database`);

    // -------------------------------------------------------------
    // CHECK 9: Prelaunch Payment Boundary Guard
    // -------------------------------------------------------------
    console.log('\n--- CHECK 9: Payment Prelaunch Guard Verification ---');
    const payConfigRes = await apiFetch('/api/v1/payments/active-config');
    assert(payConfigRes.status === 200, `Payment active-config returns HTTP 200`);
    const payConfig = await payConfigRes.json();
    assert(payConfig.is_prelaunch === true, `Payment is_prelaunch is TRUE`);
    assert(payConfig.marketplace_mode === 'PRELAUNCH_LISTING_ONLY', `Marketplace mode is PRELAUNCH_LISTING_ONLY`);

    const payStatusRes = await apiFetch('/api/v1/payments/status');
    assert(payStatusRes.status === 200, `Payment status returns HTTP 200`);
    const payStatus = await payStatusRes.json();
    assert(payStatus.safety_gates?.NO_REAL_PAYMENT === true, `Safety gate: NO_REAL_PAYMENT is true`);
    assert(payStatus.safety_gates?.NO_REAL_SETTLEMENT === true, `Safety gate: NO_REAL_SETTLEMENT is true`);
    assert(payStatus.marketplace_financial_state?.real_money_active === false, `Financial state: real_money_active is FALSE`);
    assert(payStatus.marketplace_financial_state?.settlement_active === false, `Financial state: settlement_active is FALSE`);

    // -------------------------------------------------------------
    // CHECK 10: Public SEO Assets Guard (/sitemap.xml & /robots.txt)
    // -------------------------------------------------------------
    console.log('\n--- CHECK 10: Public SEO Assets Guard ---');
    const sitemapRes = await apiFetch('/sitemap.xml');
    assert(sitemapRes.status === 200, `GET /sitemap.xml returns HTTP 200`);
    const sitemapText = await sitemapRes.text();
    assert(sitemapText.includes('https://tikum.app/blog/cara-membeli-tiket-konser-dengan-aman-checklist-sebelum-transfer-uang'), `Sitemap contains published article 1`);
    assert(sitemapText.includes('https://tikum.app/blog/kenapa-nassar-layak-ditonton-live'), `Sitemap contains published article 2`);
    assert(!sitemapText.includes('guns-n-roses'), `Sitemap strictly does NOT contain Guns N' Roses`);
    assert(!sitemapText.includes(draftSlug) && !sitemapText.includes(schedSlug), `Sitemap does not contain test articles`);

    const robotsRes = await apiFetch('/robots.txt');
    assert(robotsRes.status === 200, `GET /robots.txt returns HTTP 200`);
    const robotsText = await robotsRes.text();
    assert(robotsText.includes('Sitemap: https://tikum.app/sitemap.xml'), `robots.txt references canonical sitemap.xml`);

    console.log('\n================================================================');
    console.log(`ALL CHECKS PASSED: ${passedChecks}/${totalChecks}`);
    console.log('STATUS: PREVIEW RUNTIME FULLY VERIFIED');
    console.log('================================================================');

  } finally {
    // Teardown cleanup safeguard
    try {
      await pgPool.query('DELETE FROM editorial_articles WHERE id IN ($1, $2)', [draftId, schedId]);
      await pgPool.query('DELETE FROM editorial_article_audit_logs WHERE article_id IN ($1, $2)', [draftId, schedId]);
      await pgPool.query("UPDATE editorial_scheduler_state SET is_paused = false WHERE job_name = 'editorial_publishing_cycle'");
    } catch (_) {}
    await pgPool.end();
  }
}

runSuite().catch(err => {
  console.error('\nSuite Execution Failed:', err);
  process.exit(1);
});
