/**
 * TIKUM / ARGUS — Admin Control Center P0 Test Suite
 *
 * Verifies the production-grounded Admin Control Center contract:
 * 1.  Anonymous browser access to /admin redirects to /admin/login
 * 2.  Anonymous API access to /admin is rejected (401 JSON)
 * 3.  /admin/login page is publicly served
 * 4.  Anonymous /api/admin/session rejected (401)
 * 5.  Invalid admin credentials rejected (401)
 * 6.  Valid admin login issues a session (no secrets in response)
 * 7.  Authenticated admin session resolves real identity + role
 * 8.  Valid non-admin credentials rejected for admin login (403)
 * 9.  Non-admin session rejected across admin APIs (403)
 * 10. Logout revokes the session server-side
 * 11. Empty database produces zero/empty states (no mock metrics)
 * 12. Overview canonical/marketplace/source metrics reflect real fixtures
 * 13. Event list uses canonical events with verification filters
 * 14. Event detail exposes canonical verification + last_verified_at
 * 15. SourceClaims are visible for a canonical event
 * 16. Field provenance is visible for a canonical event
 * 17. Source gap diagnostics are visible for a canonical event
 * 18. Source health exposes fetch/failure/HTTP/gap/claim telemetry
 * 19. Manual approve/reject works and syncs marketplace projection
 * 20. Listings + venues read APIs use real records
 * 21. Unknown event returns 404 (no fabricated payload)
 */

process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin.p0@tikum.app';
process.env.ADMIN_PASSWORD = 'P0-Control-Center-Secret!';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, hashPassword } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { sourceRegistry } = require('./src/discovery/SourceRegistry');
const { SourceClaim } = require('./src/discovery/models/SourceClaim');

let server;
let port;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqOpts.headers['Content-Type'] && !reqOpts.headers['content-type']) {
        req.setHeader('Content-Type', 'application/json');
      }
      req.write(payload);
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

async function test(title, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${title}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failed++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — ADMIN CONTROL CENTER P0 SUITE                 ');
  console.log('================================================================\n');

  resetDatabase();
  canonicalRegistry.reset();
  sourceRegistry.reset();

  server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  let adminToken = null;

  // Normal user fixture with known credentials
  const buyerPassword = 'buyer-pass-123';
  const buyerHash = hashPassword(buyerPassword);
  const normalUser = {
    id: 'usr-p0-buyer',
    name: 'P0 Buyer',
    email: 'p0.buyer@example.com',
    role: 'USER',
    status: 'ACTIVE',
    password: buyerHash,
    password_hash: buyerHash,
    created_at: new Date().toISOString()
  };
  state.users.push(normalUser);
  const userSession = SessionStore.createSession({ userId: normalUser.id, role: 'USER' });
  const userToken = userSession.session_token;

  try {
    console.log('-- Part 1: Admin Authentication Boundaries --');

    await test('1. Anonymous browser access to /admin redirects to /admin/login', async () => {
      const res = await makeRequest('/admin', { headers: { 'Accept': 'text/html' } });
      assert.strictEqual(res.statusCode, 302, `Expected 302, got ${res.statusCode}`);
      assert.strictEqual(res.headers.location, '/admin/login');
    });

    await test('2. Anonymous API access to /admin returns 401 JSON', async () => {
      const res = await makeRequest('/admin');
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
    });

    await test('3. /admin/login page is publicly served', async () => {
      const res = await makeRequest('/admin/login', { headers: { 'Accept': 'text/html' } });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('text/html'));
      assert.ok(res.body.includes('Admin Sign In'));
      assert.ok(res.body.includes('/api/admin/login'));
    });

    await test('4. Anonymous /api/admin/session rejected (401)', async () => {
      const res = await makeRequest('/api/admin/session');
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
    });

    await test('5. Invalid admin credentials rejected (401)', async () => {
      const res = await makeRequest('/api/admin/login', {
        method: 'POST',
        body: { email: adminEmail, password: 'wrong-password' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'INVALID_CREDENTIALS');
    });

    await test('6. Valid admin login issues session without leaking secrets', async () => {
      const res = await makeRequest('/api/admin/login', {
        method: 'POST',
        body: { email: adminEmail, password: adminPassword }
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
      assert.ok(res.json.session_token, 'Session token required');
      assert.strictEqual(res.json.user.role, 'ADMIN');
      assert.ok(res.headers['set-cookie'][0].includes('HttpOnly'), 'Cookie must be HttpOnly');
      assert.strictEqual(JSON.stringify(res.json).includes('password'), false, 'Response must not leak password fields');

      adminToken = res.json.session_token;
    });

    await test('7. Authenticated admin session resolves real identity + role', async () => {
      const res = await makeRequest('/api/admin/session', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.authenticated, true);
      assert.strictEqual(res.json.user.email, adminEmail);
      assert.strictEqual(res.json.user.role, 'ADMIN');
      assert.ok(res.json.admin_roles.includes('OPS'));
      assert.ok(res.json.admin_roles.includes('TRUST_OFFICER'));
      assert.ok(res.json.admin_roles.includes('SUPER_ADMIN'));
    });

    await test('8. Valid non-admin credentials rejected for admin login (403)', async () => {
      const res = await makeRequest('/api/admin/login', {
        method: 'POST',
        body: { email: normalUser.email, password: buyerPassword }
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.json.code, 'ADMIN_ACCESS_REQUIRED');
    });

    await test('9. Non-admin session rejected across admin APIs (403)', async () => {
      for (const endpoint of ['/api/admin/overview', '/api/admin/sources', '/api/admin/events?source=canonical']) {
        const res = await makeRequest(endpoint, {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });
        assert.strictEqual(res.statusCode, 403, `${endpoint} must reject non-admin with 403`);
      }
    });

    await test('10. Logout revokes the session server-side', async () => {
      const res = await makeRequest('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);

      const after = await makeRequest('/api/admin/session', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(after.statusCode, 401, 'Revoked session must be rejected');
    });

    // Re-login for the rest of the suite
    const loginRes = await makeRequest('/api/admin/login', {
      method: 'POST',
      body: { email: adminEmail, password: adminPassword }
    });
    assert.strictEqual(loginRes.statusCode, 200);
    adminToken = loginRes.json.session_token;

    console.log('\n-- Part 2: Real Data Only (Zero Fabrication) --');

    await test('11. Empty database produces zero/empty states', async () => {
      canonicalRegistry.reset();
      state.listings = [];
      state.tickets = [];
      state.orders = [];
      state.disputes = [];
      state.incidents = [];

      const res = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.canonical_events.total, 0);
      assert.strictEqual(res.json.canonical_events.verified, 0);
      assert.strictEqual(res.json.canonical_events.pending_verification, 0);
      assert.strictEqual(res.json.marketplace.active_listings, 0);
      assert.strictEqual(res.json.marketplace.pending_listings, 0);
      assert.strictEqual(res.json.marketplace.sold_listings, 0);

      // Source health is registry truth, never fabricated: must equal a live recount.
      const liveSources = sourceRegistry.getAllSources();
      const liveBlocked = liveSources.filter(s => s.circuit_breaker_status === 'OPEN' || ['NOT_ALLOWED', 'UNKNOWN'].includes((s.permission_status || '').toUpperCase())).length;
      assert.strictEqual(res.json.source_health.total, liveSources.length);
      assert.strictEqual(res.json.source_health.blocked, liveBlocked);
    });

    // Seed real fixtures
    sourceRegistry.registerSource({
      source_id: 'src-p0-promoter',
      source_name: 'P0 Official Promoter',
      tier: 1,
      authority_level: 'HIGH',
      permission_status: 'AUTHORIZED_API',
      active_status: 'ACTIVE'
    });

    const claim = new SourceClaim({
      source_id: 'src-p0-promoter',
      claim_type: 'EVENT_NAME',
      value: 'P0 Test Concert',
      source_authority_tier: 1
    });

    function seedCanonical(id, title, verificationStatus, status) {
      const ev = canonicalRegistry.createEvent({
        event_id: id,
        canonical_name: title,
        start_date: '2026-12-01',
        venue_name: 'Istora Senayan',
        city: 'Jakarta',
        sources: [{
          source_id: 'src-p0-promoter',
          source_name: 'P0 Official Promoter',
          tier: 1,
          authority_level: 'HIGH',
          trust_level: 'TIER_1'
        }],
        claims: [claim.toJSON()],
        status: status || 'UPCOMING',
        is_verified: verificationStatus === 'VERIFIED',
        verification_status: verificationStatus
      });
      ev.verification_status = verificationStatus;
      ev.is_verified = verificationStatus === 'VERIFIED';
      return ev;
    }

    const pendingEvent = seedCanonical('ev-p0-pending', 'P0 Pending Event', 'UNVERIFIED');
    const verifiedEvent = seedCanonical('ev-p0-verified', 'P0 Verified Event', 'VERIFIED');
    const staleEvent = seedCanonical('ev-p0-stale', 'P0 Stale Event', 'STALE');
    const cancelledEvent = seedCanonical('ev-p0-cancelled', 'P0 Cancelled Event', 'CANCELLED', 'CANCELLED');
    assert.ok(pendingEvent && verifiedEvent && staleEvent && cancelledEvent);

    state.listings = [
      { id: 'lst-p0-01', ticket_id: 'tkt-p0-01', event_id: 'ev-p0-verified', seller_id: 'seller-1', face_value: 1000000, price: 1100000, status: 'ACTIVE', created_at: new Date().toISOString() },
      { id: 'lst-p0-02', ticket_id: 'tkt-p0-02', event_id: 'ev-p0-pending', seller_id: 'seller-1', face_value: 500000, price: 550000, status: 'SUBMITTED', created_at: new Date().toISOString() }
    ];
    state.tickets = [
      { id: 'tkt-p0-01', event_id: 'ev-p0-verified', seller_id: 'seller-1', seat_info: 'CAT 1', face_value: 1000000, verification_status: 'VERIFIED' },
      { id: 'tkt-p0-02', event_id: 'ev-p0-pending', seller_id: 'seller-1', seat_info: 'CAT 2', face_value: 500000, verification_status: 'UNDER_REVIEW' }
    ];

    await test('12. Overview canonical/marketplace metrics reflect real fixtures', async () => {
      const res = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const ce = res.json.canonical_events;
      assert.strictEqual(ce.total, 4);
      assert.strictEqual(ce.verified, 1);
      assert.strictEqual(ce.pending_verification, 1);
      assert.strictEqual(ce.stale, 1);
      assert.strictEqual(ce.cancelled, 1);

      const mk = res.json.marketplace;
      assert.strictEqual(mk.total_listings, 2);
      assert.strictEqual(mk.active_listings, 1);
      assert.strictEqual(mk.pending_listings, 1);
      assert.strictEqual(mk.sold_listings, 0);
    });

    await test('13. Event list uses canonical events with verification filters', async () => {
      const all = await makeRequest('/api/admin/events?source=canonical&status=all', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(all.statusCode, 200);
      assert.strictEqual(all.json.source, 'canonical');
      assert.strictEqual(all.json.total, 4);

      const verified = await makeRequest('/api/admin/events?source=canonical&status=verified', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(verified.json.total, 1);
      assert.strictEqual(verified.json.events[0].canonical_event_id, 'ev-p0-verified');
      assert.strictEqual(verified.json.events[0].verification_status, 'VERIFIED');

      const pending = await makeRequest('/api/admin/events?source=canonical&status=pending', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(pending.json.total, 1);
      assert.strictEqual(pending.json.events[0].canonical_event_id, 'ev-p0-pending');

      const stale = await makeRequest('/api/admin/events?source=canonical&status=stale', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(stale.json.total, 1);
      assert.strictEqual(stale.json.events[0].canonical_event_id, 'ev-p0-stale');

      const cancelled = await makeRequest('/api/admin/events?source=canonical&status=cancelled', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(cancelled.json.total, 1);
      assert.strictEqual(cancelled.json.events[0].canonical_event_id, 'ev-p0-cancelled');
    });

    await test('14. Event detail exposes canonical verification + last_verified_at', async () => {
      const res = await makeRequest('/api/admin/events/ev-p0-pending', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.registry, 'canonical');
      assert.strictEqual(res.json.canonical_event_id, 'ev-p0-pending');
      assert.strictEqual(res.json.verification_status, 'UNVERIFIED');
      assert.ok(res.json.last_verified_at, 'last_verified_at must be present');
      assert.strictEqual(res.json.marketplace.listings_total, 1);
    });

    await test('15. SourceClaims are visible for a canonical event', async () => {
      const res = await makeRequest('/api/admin/events/ev-p0-pending/claims', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.available, true);
      assert.strictEqual(res.json.total, 1);
      assert.strictEqual(res.json.claims[0].claim_type, 'EVENT_NAME');
      assert.strictEqual(res.json.claims[0].source_id, 'src-p0-promoter');
      assert.ok(res.json.claims[0].evidence_hash, 'Claims must carry evidence hashes');
    });

    await test('16. Field provenance is visible for a canonical event', async () => {
      const res = await makeRequest('/api/admin/events/ev-p0-pending/provenance', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.available, true);
      assert.ok(res.json.field_provenance.start_date, 'start_date provenance required');
      assert.ok(res.json.field_provenance.venue_name, 'venue_name provenance required');
      assert.ok(Array.isArray(res.json.sources));
      assert.ok(res.json.sources.some(s => s.source_id === 'src-p0-promoter'));
    });

    await test('17. Source gap diagnostics are visible for a canonical event', async () => {
      const res = await makeRequest('/api/admin/events/ev-p0-pending/source-gaps', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.available, true);
      assert.ok(res.json.stages && res.json.stages.claims_ingestion, 'Claim stage diagnostics required');
      assert.ok(res.json.stages.public_delivery, 'Public delivery stage diagnostics required');
      assert.ok(typeof res.json.overall_verdict === 'string');
    });

    await test('18. Source health exposes fetch/failure/HTTP/gap/claim telemetry', async () => {
      sourceRegistry.updateHealth('src-p0-promoter', null, { success: false, httpStatus: 403 });

      const res = await makeRequest('/api/admin/sources', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const source = res.json.sources.find(s => s.source_id === 'src-p0-promoter');
      assert.ok(source, 'Registered source must be listed');
      assert.strictEqual(source.tier, 1);
      assert.strictEqual(source.last_http_status, 403);
      assert.ok(source.last_failure, 'Last failure timestamp must be recorded');
      assert.strictEqual(source.consecutive_failures, 1);
      assert.notStrictEqual(source.source_gap_status, 'HEALTHY');
      assert.ok(source.claim_count >= 4, 'Each seeded event contributes one claim');
    });

    console.log('\n-- Part 3: Operator Actions & Marketplace Ops --');

    await test('19. Manual approve/reject works and syncs marketplace projection', async () => {
      const verifyRes = await makeRequest('/api/admin/events/ev-p0-pending/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: { notes: 'Verified against official promoter statement' }
      });
      assert.strictEqual(verifyRes.statusCode, 200, verifyRes.body);
      assert.strictEqual(verifyRes.json.event.verification_status, 'VERIFIED');
      assert.strictEqual(canonicalRegistry.getEventById('ev-p0-pending').is_verified, true);
      assert.ok(state.events.some(e => e.id === 'ev-p0-pending'), 'syncToState must project verified event');

      const rejectRes = await makeRequest('/api/admin/events/ev-p0-cancelled/reject', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: { reason: 'Duplicate record' }
      });
      assert.strictEqual(rejectRes.statusCode, 200, rejectRes.body);
      assert.strictEqual(rejectRes.json.event.verification_status, 'REJECTED');

      const auditEntry = (state.audit_logs || []).find(l => l.action === 'EVENT_MANUALLY_VERIFIED');
      assert.ok(auditEntry, 'Manual verification must be audited');
    });

    await test('20. Listings + venues read APIs use real records', async () => {
      const listingsRes = await makeRequest('/api/admin/listings', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(listingsRes.statusCode, 200);
      assert.strictEqual(listingsRes.json.summary.total, 2);
      assert.strictEqual(listingsRes.json.summary.active, 1);
      assert.strictEqual(listingsRes.json.summary.pending, 1);

      const filtered = await makeRequest('/api/admin/listings?status=ACTIVE', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(filtered.json.total, 1);
      assert.strictEqual(filtered.json.listings[0].listing_id, 'lst-p0-01');

      const venuesRes = await makeRequest('/api/admin/venues', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(venuesRes.statusCode, 200);
      assert.ok(venuesRes.json.total > 0, 'Seeded venue registry must be exposed');
      assert.ok(Array.isArray(venuesRes.json.venues));
    });

    await test('21. Unknown event returns 404 (no fabricated payload)', async () => {
      const res = await makeRequest('/api/admin/events/ev-does-not-exist', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.code, 'EVENT_NOT_FOUND');
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n================================================================');
  console.log(`  ADMIN CONTROL CENTER P0 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSuite().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runSuite };
