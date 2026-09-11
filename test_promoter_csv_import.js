process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const { state, resetDatabase } = require('./src/database');
const app = require('./src/server');
const { promoterRegistry, PROMOTER_STATUS, PROMOTER_AUTHORITY } = require('./src/discovery/PromoterDiscoveryRegistry');
const { PromoterImportService, MAX_CSV_BYTES } = require('./src/discovery/PromoterImportService');
const { sourceRegistry, TRUST_LEVELS } = require('./src/discovery/SourceRegistry');
const { discoverySignalService } = require('./src/discovery/EventDiscoverySignalService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { VERIFICATION_STATUS } = require('./src/discovery/EventVerificationService');

let server;
let baseUrl;
let adminToken;
let sellerToken;
let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}

async function apiRequest(endpoint, { method = 'GET', headers = {}, body = null } = {}) {
  const url = `${baseUrl}${endpoint}`;
  const reqHeaders = { ...headers };
  if (body && typeof body === 'object') {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body && typeof body === 'object' ? JSON.stringify(body) : body
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, headers: res.headers, data };
}

function adminHeaders() {
  return { 'Authorization': `Bearer ${adminToken}`, 'x-user-id': 'admin-1' };
}

// --- CSV fixtures ---------------------------------------------------------
const VALID_CSV = [
  'promoter_name,instagram_handle,instagram_url,website_url,city,category,notes',
  'Sumatra Live Sound,@sumatralivesound,https://www.instagram.com/sumatralivesound/,https://sumatralivesound.id,Medan,CONCERT,New Sumatera promoter',
  'Makassar Stage Works,@makassarstageworks,https://www.instagram.com/makassarstageworks/,https://makassarstageworks.id,Makassar,FESTIVAL,New Sulawesi promoter',
  'Boss Creator,@boss.creator,https://www.instagram.com/boss.creator/,https://bosscreator.id,Jakarta,FESTIVAL,Existing APMI member',
  'Antarasuara,@antara.suara,https://www.instagram.com/antara.suara/,,Jakarta,CONCERT,Existing verified APMI - incomplete row'
].join('\n');

const MALFORMED_STRUCTURE_CSV = 'nama_promotor,kota\nFoo Bar,Jakarta\n';

const DUPLICATE_ROW_CSV = [
  'promoter_name,instagram_handle,instagram_url,website_url,city,category,notes',
  'Same Row Promoter,@samerowpromoter,https://www.instagram.com/samerowpromoter/,https://samerowpromoter.id,Jakarta,CONCERT,row1',
  'Same Row Promoter,@samerowpromoter,https://www.instagram.com/samerowpromoter/,https://samerowpromoter.id,Jakarta,CONCERT,row2'
].join('\n');

const DUPLICATE_HANDLE_CSV = [
  'promoter_name,instagram_handle,instagram_url,website_url,city,category,notes',
  'Alpha Promoter,@sharedhandle,https://www.instagram.com/sharedhandle/,https://alpha.id,Jakarta,CONCERT,a',
  'Beta Promoter,@sharedhandle,https://www.instagram.com/sharedhandle/,https://beta.id,Jakarta,CONCERT,b'
].join('\n');

const POSSIBLE_DUPLICATE_CSV = [
  'promoter_name,instagram_handle,instagram_url,website_url,city,category,notes',
  'Raw Vision Collective Indonesia,@rawvisioncollective.id,https://www.instagram.com/rawvisioncollective.id/,https://rawvisioncollective.id,Jakarta,INDIE_TOUR,Fuzzy near-match for possible duplicate review'
].join('\n');

async function runSuite() {
  console.log('\n=== TIKUM PROMOTER CSV IMPORT WORKFLOW SUITE ===\n');

  resetDatabase();
  promoterRegistry.reset();
  canonicalRegistry.reset();
  discoverySignalService.reset();
  sourceRegistry.reset();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const adminLogin = await apiRequest('/api/mvp/auth/login', { method: 'POST', body: { usernameOrId: 'admin-1' } });
  adminToken = adminLogin.data.session_token;
  const sellerLogin = await apiRequest('/api/mvp/auth/login', { method: 'POST', body: { usernameOrId: 'seller-1' } });
  sellerToken = sellerLogin.data.session_token;

  const seeded = promoterRegistry.getAllPromoters().length;

  // ==========================================
  // 1. Valid CSV import: validate → preview → confirm
  // ==========================================
  let validPreviewId;
  await testAsync('1. Admin previews then confirms a valid CSV (no silent import on upload)', async () => {
    const preview = await apiRequest('/api/discovery/promoters/import/preview', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: VALID_CSV, filename: 'PROMOTER_IMPORT_TEMPLATE.csv' }
    });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.data.success, true);
    assert.strictEqual(preview.data.ok, true);
    assert.strictEqual(preview.data.summary.TOTAL_ROWS, 4);
    assert.strictEqual(preview.data.summary.IMPORTED, 2);
    assert.strictEqual(preview.data.summary.VALIDATION_ERRORS, 0);
    assert.ok(preview.data.preview_id, 'preview_id is required for explicit confirmation');
    validPreviewId = preview.data.preview_id;

    // Preview must NOT mutate the registry
    assert.strictEqual(promoterRegistry.getAllPromoters().length, seeded, 'Preview must not mutate the registry');

    const confirm = await apiRequest('/api/discovery/promoters/import/confirm', {
      method: 'POST',
      headers: adminHeaders(),
      body: { preview_id: validPreviewId }
    });
    assert.strictEqual(confirm.status, 200);
    assert.strictEqual(confirm.data.IMPORTED, 2);
    assert.strictEqual(confirm.data.UNCHANGED, 2);
    assert.ok(confirm.data.import_id.startsWith('pimp-'));
    assert.strictEqual(promoterRegistry.getAllPromoters().length, seeded + 2);
  });

  // ==========================================
  // 2. Malformed CSV structure is rejected
  // ==========================================
  await testAsync('2. Malformed CSV (missing required columns) returns clear structure errors and is not imported', async () => {
    const preview = await apiRequest('/api/discovery/promoters/import/preview', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: MALFORMED_STRUCTURE_CSV }
    });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.data.ok, false);
    assert.ok(preview.data.structure_errors.some(e => e.includes('promoter_name')));
    assert.strictEqual(preview.data.summary.TOTAL_ROWS, 0);

    const before = promoterRegistry.getAllPromoters().length;
    const confirm = await apiRequest('/api/discovery/promoters/import/confirm', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: MALFORMED_STRUCTURE_CSV }
    });
    assert.strictEqual(confirm.status, 400);
    assert.strictEqual(confirm.data.code, 'INVALID_STRUCTURE');
    assert.strictEqual(promoterRegistry.getAllPromoters().length, before);
  });

  // ==========================================
  // 3. Duplicate row inside the CSV
  // ==========================================
  await testAsync('3. Duplicate row is reported as a validation error and never double-imported', async () => {
    const preview = await apiRequest('/api/discovery/promoters/import/preview', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: DUPLICATE_ROW_CSV }
    });
    assert.strictEqual(preview.data.summary.TOTAL_ROWS, 2);
    assert.strictEqual(preview.data.summary.VALIDATION_ERRORS, 1);
    assert.ok(preview.data.summary.DUPLICATES >= 1);

    const before = promoterRegistry.getAllPromoters().length;
    const confirm = await apiRequest('/api/discovery/promoters/import/confirm', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: DUPLICATE_ROW_CSV }
    });
    assert.strictEqual(confirm.data.IMPORTED, 1);
    assert.strictEqual(confirm.data.VALIDATION_ERRORS, 1);
    assert.strictEqual(promoterRegistry.getAllPromoters().length, before + 1);
    assert.strictEqual(promoterRegistry.getAllPromoters().filter(p => /same row promoter/i.test(p.canonical_name)).length, 1);
  });

  // ==========================================
  // 4. Duplicate Instagram handle inside the CSV
  // ==========================================
  await testAsync('4. Duplicate Instagram handle is rejected as a validation error', async () => {
    const preview = await apiRequest('/api/discovery/promoters/import/preview', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: DUPLICATE_HANDLE_CSV }
    });
    assert.strictEqual(preview.data.summary.VALIDATION_ERRORS >= 1, true);
    assert.ok(preview.data.rows.some(r => (r.errors || []).some(e => e.includes('Duplicate Instagram handle'))));

    // Handle syntax rules: a trailing underscore is valid; malformed tokens are not
    const handleCheck = PromoterImportService.validateCSV([
      'promoter_name,instagram_handle',
      'Trailing Underscore Co,@plainsonglive_',
      'Bad Handle Co,@bad handle!'
    ].join('\n'));
    const trailing = handleCheck.rows.find(r => r.values.promoter_name === 'Trailing Underscore Co');
    const bad = handleCheck.rows.find(r => r.values.promoter_name === 'Bad Handle Co');
    assert.strictEqual(trailing.errors.length, 0, 'trailing underscore handle must be accepted');
    assert.ok(bad.errors.some(e => e.includes('Malformed Instagram handle')));
  });

  // ==========================================
  // 5. Idempotent re-import (no duplicates created)
  // ==========================================
  await testAsync('5. Re-importing the same CSV is idempotent (all UNCHANGED, zero new records)', async () => {
    const before = promoterRegistry.getAllPromoters().length;
    const reimport = await apiRequest('/api/discovery/promoters/import/confirm', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: VALID_CSV, filename: 'PROMOTER_IMPORT_TEMPLATE.csv' }
    });
    assert.strictEqual(reimport.status, 200);
    assert.strictEqual(reimport.data.IMPORTED, 0);
    assert.strictEqual(reimport.data.UPDATED, 0);
    assert.strictEqual(reimport.data.UNCHANGED, 4);
    assert.strictEqual(promoterRegistry.getAllPromoters().length, before, 'Re-import must not create duplicates');
  });

  // ==========================================
  // 6. Existing VERIFIED promoter is never downgraded
  // ==========================================
  await testAsync('6. Existing verified promoter keeps VERIFIED_OFFICIAL_PROMOTER_ACCOUNT after incomplete CSV row', async () => {
    const antara = promoterRegistry.getPromoterByHandle('@antara.suara');
    assert.ok(antara, 'Antarasuara must exist');
    assert.strictEqual(antara.verification_status, PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);
    assert.strictEqual(antara.authority_level, PROMOTER_AUTHORITY.OFFICIAL_AUTHORITY);
    assert.strictEqual(antara.apmi_member, true);

    const report = PromoterImportService.confirmImport({ csv_content: VALID_CSV, admin_id: 'admin-1' });
    const antaraResult = report.results.find(r => r.row_number && /antarasuara|antara\.suara/i.test(r.canonical_name || ''));
    assert.ok(antaraResult, 'Antarasuara row must be classified');
    assert.strictEqual(antaraResult.already_verified, true);
    assert.strictEqual(promoterRegistry.getPromoterByHandle('@antara.suara').verification_status, PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);
  });

  // ==========================================
  // 7. APMI cross-reference matching after import
  // ==========================================
  await testAsync('7. Import cross-references the APMI registry and reports APMI_MATCHES', async () => {
    const report = PromoterImportService.confirmImport({ csv_content: VALID_CSV, admin_id: 'admin-1' });
    assert.ok(report.APMI_MATCHES >= 2, 'Existing APMI members must be matched');
    const boss = promoterRegistry.getPromoterByHandle('@boss.creator');
    assert.strictEqual(boss.apmi_member, true);
    assert.strictEqual(boss.apmi_member_source, 'src-assoc-apmi');
  });

  // ==========================================
  // 8. Unverified promoter remains DISCOVERED
  // ==========================================
  await testAsync('8. Newly imported promoter remains DISCOVERED until the verification system confirms it', async () => {
    const sumatra = promoterRegistry.getPromoterByHandle('@sumatralivesound');
    assert.ok(sumatra, 'Imported promoter must exist in the registry');
    assert.strictEqual(sumatra.verification_status, PROMOTER_STATUS.DISCOVERED);
    assert.strictEqual(sumatra.authority_level, PROMOTER_AUTHORITY.UNKNOWN);
    assert.strictEqual(sumatra.apmi_member, false);
  });

  // ==========================================
  // 9. Tier S is not granted automatically by CSV import
  // ==========================================
  await testAsync('9. CSV import does NOT register a Tier S source for unverified promoters', async () => {
    const sumatra = promoterRegistry.getPromoterByHandle('@sumatralivesound');
    const src = sourceRegistry.getSource(`src-promoter-${sumatra.slug}-instagram`);
    assert.strictEqual(src, null, 'Unverified CSV promoter must not become a Tier S source');

    const queue = promoterRegistry.getVerificationQueue();
    assert.ok(queue.some(q => q.promoter_id === sumatra.promoter_id && q.queue_bucket === 'DISCOVERED'));
  });

  // ==========================================
  // 10. Possible duplicate detection (fuzzy → review, no auto-merge)
  // ==========================================
  await testAsync('10. Fuzzy name near-match is flagged as POSSIBLE_DUPLICATE and never auto-merged', async () => {
    const target = promoterRegistry.getAllPromoters().find(p => /raw vision collective$/i.test(p.canonical_name));
    assert.ok(target, 'Raw Vision Collective must exist');
    const dupFlagsBefore = (target.duplicate_candidates || []).length;

    const before = promoterRegistry.getAllPromoters().length;
    const confirm = await apiRequest('/api/discovery/promoters/import/confirm', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: POSSIBLE_DUPLICATE_CSV }
    });
    assert.strictEqual(confirm.status, 200);
    assert.strictEqual(confirm.data.POSSIBLE_DUPLICATES, 1);
    assert.strictEqual(confirm.data.IMPORTED, 0, 'Possible duplicate must not be auto-created');
    assert.strictEqual(promoterRegistry.getAllPromoters().length, before, 'Possible duplicate must not create a new record');
    assert.ok(target.duplicate_candidates.length > dupFlagsBefore, 'Possible duplicate must be flagged for review');

    const flagged = promoterRegistry.getVerificationQueue().find(q => q.promoter_id === target.promoter_id);
    assert.ok(flagged && flagged.queue_bucket === 'POSSIBLE_DUPLICATE');
  });

  // ==========================================
  // 11. Import report + import history
  // ==========================================
  await testAsync('11. Import report contains the full TIKUM metric set and an audit history record', async () => {
    const report = await apiRequest('/api/discovery/promoters/import/confirm', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: VALID_CSV, filename: 'REPORT_TEST.csv' }
    });
    const d = report.data;
    for (const key of ['TOTAL_ROWS', 'IMPORTED', 'UPDATED', 'UNCHANGED', 'DUPLICATES', 'POSSIBLE_DUPLICATES', 'VALIDATION_ERRORS', 'APMI_MATCHES', 'ALREADY_VERIFIED', 'NEW_DISCOVERED']) {
      assert.strictEqual(typeof d[key], 'number', `report must expose ${key}`);
    }
    assert.strictEqual(d.history.filename, 'REPORT_TEST.csv');
    assert.strictEqual(d.history.admin_id, 'admin-1');
    assert.strictEqual(d.history.status, 'COMPLETED');
    assert.ok(d.history.success_count >= 4);

    const history = await apiRequest('/api/discovery/promoters/import/history', { headers: adminHeaders() });
    assert.strictEqual(history.status, 200);
    assert.ok(history.data.imports.some(i => i.import_id === d.import_id));
    assert.ok(state.promoter_imports.length >= 1, 'Import history must persist in audit state');
  });

  // ==========================================
  // 12. Admin authorization (authn + authz)
  // ==========================================
  await testAsync('12. Promoter management endpoints reject unauthenticated and non-admin callers', async () => {
    const anonPreview = await apiRequest('/api/discovery/promoters/import/preview', {
      method: 'POST',
      body: { csv_content: VALID_CSV }
    });
    assert.strictEqual(anonPreview.status, 401);

    const sellerPreview = await apiRequest('/api/discovery/promoters/import/preview', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sellerToken}`, 'x-user-id': 'seller-1' },
      body: { csv_content: VALID_CSV }
    });
    assert.strictEqual(sellerPreview.status, 403);

    const anonQueue = await apiRequest('/api/discovery/promoters/verification-queue');
    assert.strictEqual(anonQueue.status, 401);

    const adminQueue = await apiRequest('/api/discovery/promoters/verification-queue', { headers: adminHeaders() });
    assert.strictEqual(adminQueue.status, 200);
    assert.ok(Array.isArray(adminQueue.data.queue));

    const adminRegistry = await apiRequest('/api/discovery/promoters/admin/registry?status=DISCOVERED', { headers: adminHeaders() });
    assert.strictEqual(adminRegistry.status, 200);
    assert.ok(adminRegistry.data.promoters.every(p => p.verification_status === 'DISCOVERED'));
  });

  // ==========================================
  // 13. Event pipeline integration (verified promoter → Tier S → existing pipeline)
  // ==========================================
  await testAsync('13. Verified promoted account becomes Tier S and flows into the existing event pipeline', async () => {
    const sumatra = promoterRegistry.getPromoterByHandle('@sumatralivesound');
    promoterRegistry.verifyPromoter(sumatra.promoter_id, {
      evidence: 'Official domain backlink and corporate registration corroborated by admin',
      verified_by: 'admin-1'
    });

    const src = sourceRegistry.getSource(`src-promoter-${sumatra.slug}-instagram`);
    assert.ok(src, 'Verified promoter must register a Tier S source');
    assert.strictEqual(src.trust_level, TRUST_LEVELS.TIER_S);
    assert.strictEqual(src.source_type, 'PROMOTER_OFFICIAL_SOCIAL');
    assert.strictEqual(src.source_role, 'PRIMARY_EVENT_SOURCE');
    assert.strictEqual(src.authority_scope, 'EVENT');

    const post = {
      event_name: 'Sumatra Live Sound Festival 2026',
      start_date: '2026-12-12',
      venue_name: 'Lapangan Merdeka Medan',
      city: 'Medan',
      post_url: 'https://www.instagram.com/p/sumatra_fest_announcement/',
      published_at: '2026-10-01T10:00:00Z'
    };
    const res = await discoverySignalService.processSocialPost(post, '@sumatralivesound');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'CANONICAL_EVENT_PROMOTED');
    assert.strictEqual(res.canonical_event.verification_status, VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED);
    assert.ok(canonicalRegistry.getEventById(res.canonical_event.event_id), 'Event lives in the existing CanonicalEventRegistry');
  });

  // ==========================================
  // 14. Existing promoter registry invariants are preserved
  // ==========================================
  await testAsync('14. Existing curated promoter registry remains intact after imports', async () => {
    const boss = promoterRegistry.getPromoterByHandle('@boss.creator');
    assert.strictEqual(boss.verification_status, PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);
    assert.strictEqual(boss.authority_level, PROMOTER_AUTHORITY.OFFICIAL_AUTHORITY);
    assert.strictEqual(boss.apmi_member, true);

    const all = promoterRegistry.getAllPromoters();
    assert.ok(all.length >= seeded, 'No seeded promoter may be lost');
    assert.ok(all.filter(p => p.apmi_member).length >= 14, 'APMI accredited members must be preserved');

    const dashboard = promoterRegistry.getDashboardStats();
    assert.ok(dashboard.verified_official_promoters >= 14);
    assert.ok(dashboard.apmi_accredited_members >= 14);
  });

  // ==========================================
  // 15. Multipart upload + file type / size validation
  // ==========================================
  await testAsync('15. CSV upload accepts multipart and enforces file type and size limits', async () => {
    const form = new FormData();
    form.append('file', new Blob([VALID_CSV], { type: 'text/csv' }), 'promoter_seed.csv');
    const uploadRes = await fetch(`${baseUrl}/api/discovery/promoters/import/preview`, {
      method: 'POST',
      headers: adminHeaders(),
      body: form
    });
    assert.strictEqual(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.strictEqual(uploadData.success, true);
    assert.strictEqual(uploadData.filename, 'promoter_seed.csv');

    const badForm = new FormData();
    badForm.append('file', new Blob(['not a csv'], { type: 'application/pdf' }), 'malicious.pdf');
    const badRes = await fetch(`${baseUrl}/api/discovery/promoters/import/preview`, {
      method: 'POST',
      headers: adminHeaders(),
      body: badForm
    });
    assert.strictEqual(badRes.status, 400);
    const badData = await badRes.json();
    assert.strictEqual(badData.code, 'INVALID_FILE_TYPE');

    const huge = await apiRequest('/api/discovery/promoters/import/preview', {
      method: 'POST',
      headers: adminHeaders(),
      body: { csv_content: 'x'.repeat(MAX_CSV_BYTES + 10) }
    });
    assert.strictEqual(huge.status, 413);
    assert.strictEqual(huge.data.code, 'FILE_TOO_LARGE');
  });

  // ==========================================
  // 16. Legacy file-based import regression (existing service contract)
  // ==========================================
  await testAsync('16. Existing PromoterImportService.importFromFile template path still works (no regression)', async () => {
    const path = require('path');
    const report = PromoterImportService.importFromFile(path.join(__dirname, 'PROMOTER_IMPORT_TEMPLATE.csv'));
    assert.ok(report.total_parsed >= 10, 'Template must still parse');
    assert.ok(typeof report.imported_count === 'number');
    assert.ok(Array.isArray(report.results));
  });

  await new Promise(resolve => server.close(resolve));

  console.log(`\n=======================`);
  console.log(`Promoter CSV Import Suite Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSuite().catch(err => {
    console.error('Fatal error running promoter CSV import suite:', err);
    process.exit(1);
  });
}

module.exports = { runSuite };




