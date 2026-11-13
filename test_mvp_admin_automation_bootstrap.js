/**
 * TIKUM / ARGUS — MVP Admin & Automation Bootstrap Test Suite
 * 
 * Verifies:
 * 1. Event-to-Blog Draft Automation & Quality Gates
 * 2. Automation Center Engine & Durable State
 * 3. Simple RBAC Boundaries
 * 4. System Settings & Payment Gateway Status
 * 5. Admin Panel MVP UI Elements & Navigation
 */

process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');

const { EventBlogDraftService } = require('./src/content/EventBlogDraftService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { articleRepository } = require('./src/content/ArticleRepository');
const { ContentQualityEngine } = require('./src/content/ContentQualityEngine');
const { ingestionScheduler, JOB_TYPES } = require('./src/discovery/EventIngestionScheduler');
const { state } = require('./src/database');
const { ADMIN_ROLES, isAdminRole } = require('./src/middleware/auth');

async function runTestSuite() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — MVP ADMIN & AUTOMATION BOOTSTRAP TEST SUITE   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function record(desc, ok, err) {
    if (ok) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      if (err) console.error('     Error:', err.message);
      failed++;
    }
  }

  // Setup test environment & canonical events
  canonicalRegistry.importLegacyEvents(state.events);
  const testEventId = 'test-mvp-concert-' + Date.now();
  canonicalRegistry.createEvent({
    id: testEventId,
    canonical_name: 'Sheila on 7 Tunggu Aku di Senayan ' + Date.now(),
    title: 'Sheila on 7 Tunggu Aku di Senayan ' + Date.now(),
    start_date: '2026-12-20',
    venue_name: 'Stadion Utama Gelora Bung Karno',
    venue_city: 'Jakarta Pusat',
    city: 'Jakarta',
    status: 'UPCOMING',
    is_verified: true,
    verification_status: 'VERIFIED'
  });

  // -------------------------------------------------------------
  // Section 1: Event-to-Blog Draft Automation
  // -------------------------------------------------------------
  console.log('── Section 1: Event-to-Blog Draft Automation ──');

  try {
    const draftRes = EventBlogDraftService.generateDraftFromEvent(testEventId);
    assert.equal(draftRes.success, true, 'Draft generation should report success');
    assert.equal(draftRes.created, true, 'First generation should create new draft');
    assert.equal(draftRes.article.status, 'draft', 'Draft must be created with status DRAFT');
    assert.equal(draftRes.article.target_event_id, testEventId, 'target_event_id must match canonical event');
    
    // Evaluation scores
    const evalReport = draftRes.evaluation;
    assert.ok(evalReport.seo_score >= 80, `SEO score should be >= 80, got ${evalReport.seo_score}`);
    assert.ok(evalReport.quality_score >= 90, `Quality score should be >= 90, got ${evalReport.quality_score}`);
    assert.ok(evalReport.trust_score >= 90, `Trust score should be >= 90, got ${evalReport.trust_score}`);
    assert.ok(evalReport.readability_score >= 80, `Readability score should be >= 80, got ${evalReport.readability_score}`);
    assert.equal(evalReport.fact_check_passed, true, 'Fact check must pass');
    
    record('1.1 Generated blog draft meets strict ContentQualityEngine criteria', true);
  } catch (err) {
    record('1.1 Generated blog draft meets strict ContentQualityEngine criteria', false, err);
  }

  try {
    // Idempotency check: rerun generation
    const retryRes = EventBlogDraftService.generateDraftFromEvent(testEventId);
    assert.equal(retryRes.success, true, 'Rerun should succeed');
    assert.equal(retryRes.created, false, 'Rerun must NOT create duplicate (idempotent)');
    record('1.2 Idempotency guarantee: duplicate generation for same event is blocked', true);
  } catch (err) {
    record('1.2 Idempotency guarantee: duplicate generation for same event is blocked', false, err);
  }

  // -------------------------------------------------------------
  // Section 2: Automation Center Engine & Jobs
  // -------------------------------------------------------------
  console.log('\n── Section 2: Automation Center Engine & Jobs ──');

  try {
    const allJobs = ingestionScheduler.getAllJobs();
    assert.ok(allJobs.length >= 8, `Expected at least 8 jobs, found ${allJobs.length}`);
    const blogDraftJob = allJobs.find(j => j.name === JOB_TYPES.BLOG_DRAFT_GENERATION);
    const pubJob = allJobs.find(j => j.name === JOB_TYPES.SCHEDULED_PUBLISHING);
    assert.ok(blogDraftJob, 'BLOG_DRAFT_GENERATION job must be registered');
    assert.ok(pubJob, 'SCHEDULED_PUBLISHING job must be registered');
    record('2.1 Automation Center registers discovery, lifecycle, blog draft & publishing jobs', true);
  } catch (err) {
    record('2.1 Automation Center registers discovery, lifecycle, blog draft & publishing jobs', false, err);
  }

  try {
    const jobName = JOB_TYPES.SOURCE_HEALTH_CHECK;
    const initialJob = ingestionScheduler.getJobStatus(jobName);
    const initialEnabled = initialJob.enabled;

    // Toggle job
    const toggled = ingestionScheduler.toggleJob(jobName);
    assert.equal(toggled.enabled, !initialEnabled, 'Toggle must invert enabled status');

    // Run job
    const runResult = await ingestionScheduler.runJob(jobName);
    assert.ok(runResult, 'Run job must return execution result');
    const updatedJob = ingestionScheduler.getJobStatus(jobName);
    assert.equal(updatedJob.status, 'COMPLETED', 'Job status must be COMPLETED');
    assert.ok(updatedJob.run_count >= 1, 'Run count must increment');

    // Restore enabled status
    ingestionScheduler.toggleJob(jobName, initialEnabled);
    record('2.2 Manual execution, status transitions, and toggle state succeed', true);
  } catch (err) {
    record('2.2 Manual execution, status transitions, and toggle state succeed', false, err);
  }

  try {
    const history = ingestionScheduler.getJobHistory(10);
    assert.ok(Array.isArray(history), 'History must be an array');
    assert.ok(history.length > 0, 'History should contain recorded runs');
    assert.ok(history[history.length - 1].timestamp, 'History entry must have timestamp');
    record('2.3 Durable execution history records timestamps and durations', true);
  } catch (err) {
    record('2.3 Durable execution history records timestamps and durations', false, err);
  }

  // -------------------------------------------------------------
  // Section 3: Simple RBAC Server-Side Boundaries
  // -------------------------------------------------------------
  console.log('\n── Section 3: Simple RBAC Server-Side Boundaries ──');

  try {
    const expectedRoles = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'EVENT_OPERATIONS', 'SUPPORT', 'FINANCE_READ_ONLY', 'FINANCE'];
    for (const r of expectedRoles) {
      assert.ok(isAdminRole(r), `Role '${r}' must be recognized in ADMIN_ROLES`);
    }
    assert.equal(isAdminRole('BUYER'), false, 'BUYER must NOT be admin role');
    assert.equal(isAdminRole('SELLER'), false, 'SELLER must NOT be admin role');
    record('3.1 Canonical ADMIN_ROLES includes Super Admin, Admin, Editor, Support, Finance', true);
  } catch (err) {
    record('3.1 Canonical ADMIN_ROLES includes Super Admin, Admin, Editor, Support, Finance', false, err);
  }

  // -------------------------------------------------------------
  // Section 4: Admin API Endpoints HTTP Integration
  // -------------------------------------------------------------
  console.log('\n── Section 4: Admin API Endpoints HTTP Integration ──');

  const app = express();
  app.use(express.json());

  // Setup admin user in state
  const testAdmin = {
    id: 'admin-bootstrap-test',
    email: 'admin@tikum.app',
    name: 'Super Admin Test',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE'
  };
  state.users = state.users || [];
  if (!state.users.find(u => u.id === testAdmin.id)) {
    state.users.push(testAdmin);
  }

  // Mock test auth middleware
  app.use((req, res, next) => {
    if (req.headers['x-test-non-admin']) {
      req.user = { id: 'user-normal', role: 'BUYER', status: 'ACTIVE' };
    } else {
      req.user = testAdmin;
    }
    next();
  });

  const adminRouter = require('./src/api/adminRouter');
  const contentAdminRouter = require('./src/api/contentAdminRouter');
  app.use('/api/admin', adminRouter);
  app.use(contentAdminRouter);

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 4.1 System Settings Endpoint
    const setRes = await fetch(`${baseUrl}/api/admin/system-settings`);
    assert.equal(setRes.status, 200, 'GET /api/admin/system-settings must return 200');
    const setData = await setRes.json();
    assert.equal(setData.success, true);
    assert.equal(setData.legal_entity.company_name, 'PT Shinerva Prajna Tejas');
    assert.equal(setData.legal_entity.address, 'Jl. Pasirluyu No. 79, Bandung 40254, Indonesia');
    assert.ok(['DOKU', 'iPaymu'].includes(setData.payment_gateways.primary.provider));
    assert.ok(['DOKU', 'iPaymu'].includes(setData.payment_gateways.backup.provider));
    assert.equal(setData.operational_contacts.support_email, 'support@tikum.app');
    record('4.1 GET /api/admin/system-settings returns verified brand, legal, and payment info', true);
  } catch (err) {
    record('4.1 GET /api/admin/system-settings returns verified brand, legal, and payment info', false, err);
  }

  try {
    // 4.2 Automation Jobs List Endpoint
    const jobsRes = await fetch(`${baseUrl}/api/admin/automation/jobs`);
    assert.equal(jobsRes.status, 200, 'GET /api/admin/automation/jobs must return 200');
    const jobsData = await jobsRes.json();
    assert.equal(jobsData.success, true);
    assert.ok(jobsData.jobs.length >= 8);
    record('4.2 GET /api/admin/automation/jobs returns list of all registered jobs', true);
  } catch (err) {
    record('4.2 GET /api/admin/automation/jobs returns list of all registered jobs', false, err);
  }

  try {
    // 4.3 Content Generate Draft Endpoint
    const genRes = await fetch(`${baseUrl}/api/admin/content/generate-draft/${testEventId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.ok(genRes.status === 200 || genRes.status === 201, `Expected 200 or 201, got ${genRes.status}`);
    const genData = await genRes.json();
    assert.equal(genData.success, true);
    record('4.3 POST /api/admin/content/generate-draft/:eventId generates and links article', true);
  } catch (err) {
    record('4.3 POST /api/admin/content/generate-draft/:eventId generates and links article', false, err);
  }

  try {
    // 4.4 Non-admin access to admin automation is forbidden
    const forbiddenRes = await fetch(`${baseUrl}/api/admin/automation/jobs`, {
      headers: { 'x-test-non-admin': 'true' }
    });
    assert.equal(forbiddenRes.status, 403, 'Non-admin request must receive 403');
    record('4.4 Non-admin users are strictly blocked from Automation endpoints (403)', true);
  } catch (err) {
    record('4.4 Non-admin users are strictly blocked from Automation endpoints (403)', false, err);
  }

  await new Promise(resolve => server.close(resolve));

  // -------------------------------------------------------------
  // Section 5: Admin Panel MVP UI Elements & Navigation
  // -------------------------------------------------------------
  console.log('\n── Section 5: Admin Panel MVP UI Elements & Navigation ──');

  try {
    const adminHtml = fs.readFileSync(path.resolve(__dirname, 'public/admin.html'), 'utf8');

    // 11 Required Navigation Items
    const requiredNavViews = [
      'overview',
      'events',
      'listings',
      'orders',
      'sellers',
      'buyers',
      'venue-pic',
      'disputes',
      'editorial',
      'automation',
      'settings'
    ];

    for (const view of requiredNavViews) {
      assert.ok(
        adminHtml.includes(`switchView('${view}'`) || adminHtml.includes(`switchView("${view}"`),
        `admin.html sidebar must contain navigation button for view '${view}'`
      );
    }

    // Required View Containers
    assert.ok(adminHtml.includes('id="viewAutomation"'), 'admin.html must contain #viewAutomation');
    assert.ok(adminHtml.includes('id="viewSettings"'), 'admin.html must contain #viewSettings');
    assert.ok(adminHtml.includes('id="automationJobsTableBody"'), 'admin.html must contain jobs table body');
    assert.ok(adminHtml.includes('id="automationHistoryTableBody"'), 'admin.html must contain history table body');
    assert.ok(adminHtml.includes('id="setCompanyName"'), 'admin.html settings must display company name');
    assert.ok(adminHtml.includes('id="setIpaymuStatus"'), 'admin.html settings must display iPaymu payment status');

    record('5.1 admin.html contains all 11 required navigation items and dedicated views', true);
  } catch (err) {
    record('5.1 admin.html contains all 11 required navigation items and dedicated views', false, err);
  }

  console.log('\n================================================================');
  console.log(`  BOOTSTRAP SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
