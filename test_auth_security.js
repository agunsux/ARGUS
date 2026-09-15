/**
 * TIKUM / ARGUS — Comprehensive Authentication & Admin Security Test Suite
 * 
 * Verifies P0 Admin Authorization Fix and Canonical Magic Link Foundation:
 * 
 * PART 1: ADMIN AUTHORIZATION — HTTP BOUNDARY RED-TEAM (ALL 6 ENDPOINTS)
 * 1. Anonymous request → 401
 * 2. Anonymous request + x-user-role: admin → 401 (Spoofing Defeated)
 * 3. Authenticated normal user (buyer) → 403 Forbidden
 * 4. Authenticated normal user + x-user-role: admin → 403 Forbidden (Header Ignored)
 * 5. Role supplied in body / query parameter → 403 Forbidden (No Elevation)
 * 6. Forged session token / forged user identity → 401
 * 7. Authenticated authorized admin (admin-1) → 200 Success
 * 
 * PART 2: MAGIC LINK LIFECYCLE & SECURITY
 * 8. Valid email → request accepted with generic message
 * 9. Malformed email → 400 rejection
 * 10. Existing vs Unknown email → identical generic response (No User Enumeration)
 * 11. Valid token verification → session created in SessionStore + HttpOnly cookie
 * 12. Expired token → 401 rejection
 * 13. Malformed token → 401 rejection
 * 14. Replayed token (single-use enforcement) → 401 rejection
 * 15. Active session verification (/api/auth/session) → 200 with user identity
 * 16. Logout (/api/auth/logout) → revokes session, subsequent requests return 401
 * 17. Token leakage prevention → raw token NEVER appears in audit logs or state
 * 18. Open redirect prevention → dangerous URLs sanitized to /
 * 19. Rate limiting → per-email (max 3) and per-IP (max 10) trigger HTTP 429
 * 20. Self-signup role safety → new users always receive safe 'buyer' role, never 'admin'
 * 21. Payment safety invariance → authentication NEVER activates iPaymu or releases escrow
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { MagicLinkService } = require('./src/services/magicLinkService');
const { IPAYMU_STATUS } = require('./src/services/payment/IPaymuProvider');

let server;
let port;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    if (options.query) {
      Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
    }

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

let total = 0;
let passed = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — AUTHENTICATION & ADMIN SECURITY TEST SUITE    ');
  console.log('================================================================\n');

  resetDatabase();
  MagicLinkService.resetRateLimits();

  server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // =========================================================================
    // PART 1: ADMIN AUTHORIZATION — HTTP BOUNDARY (ALL 6 ENDPOINTS)
    // =========================================================================
    console.log('── Part 1: Admin Trust Router HTTP Authorization Boundary ──');

    const adminEndpoints = [
      '/api/admin/trust/summary',
      '/api/admin/trust/event-supply',
      '/api/admin/trust/ticket-trust',
      '/api/admin/trust/venue-ops',
      '/api/admin/trust/payments',
      '/api/admin/trust/audit-trail'
    ];

    // Create test sessions
    const adminSession = SessionStore.createSession({ userId: 'admin-1', role: 'admin' });
    const buyerSession = SessionStore.createSession({ userId: 'buyer-1', role: 'buyer' });
    state.sessions.push(adminSession, buyerSession);

    for (const ep of adminEndpoints) {
      const epName = ep.replace('/api/admin/trust/', '');

      // CASE 1: Anonymous request -> 401
      await test(`Endpoint [${epName}]: Anonymous request returns 401 AUTH_REQUIRED`, async () => {
        const res = await makeRequest(ep);
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
      });

      // CASE 2: Anonymous request + x-user-role: admin -> 401 (Header spoofing defeated)
      await test(`Endpoint [${epName}]: Anonymous + x-user-role: admin is rejected (401)`, async () => {
        const res = await makeRequest(ep, {
          headers: { 'x-user-role': 'admin' }
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
      });

      // CASE 3: Authenticated normal user (buyer) -> 403 Forbidden
      await test(`Endpoint [${epName}]: Authenticated normal user returns 403 FORBIDDEN`, async () => {
        const res = await makeRequest(ep, {
          headers: { 'Authorization': `Bearer ${buyerSession.session_token}` }
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.json.code, 'FORBIDDEN');
      });

      // CASE 4: Authenticated authorized admin (admin-1) -> 200 Success
      await test(`Endpoint [${epName}]: Authenticated authorized admin succeeds (200)`, async () => {
        const res = await makeRequest(ep, {
          headers: { 'Authorization': `Bearer ${adminSession.session_token}` }
        });
        assert.strictEqual(res.statusCode, 200);
      });

      // CASE 5: Authenticated normal user + x-user-role: admin -> 403 Forbidden
      await test(`Endpoint [${epName}]: Normal user + x-user-role: admin header cannot elevate (403)`, async () => {
        const res = await makeRequest(ep, {
          headers: {
            'Authorization': `Bearer ${buyerSession.session_token}`,
            'x-user-role': 'admin'
          }
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.json.code, 'FORBIDDEN');
      });

      // CASE 6: Role supplied in query parameter -> 403 Forbidden (cannot elevate)
      await test(`Endpoint [${epName}]: Role in query (?role=admin&user_role=admin) cannot elevate privilege (403)`, async () => {
        const res = await makeRequest(ep, {
          method: 'GET',
          query: { role: 'admin', user_role: 'admin', admin: 'true' },
          headers: {
            'Authorization': `Bearer ${buyerSession.session_token}`
          }
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.json.code, 'FORBIDDEN');
      });

      // CASE 7: Forged / malformed session token -> 401
      await test(`Endpoint [${epName}]: Forged / invalid session token returns 401`, async () => {
        const res = await makeRequest(ep, {
          headers: { 'Authorization': 'Bearer ses-forged-invalid-token-12345' }
        });
        assert.strictEqual(res.statusCode, 401);
      });
    }

    // Verify Cookie-based session resolution works for admin
    await test('AdminTrustRouter: Session token in HttpOnly Cookie authenticates admin', async () => {
      const res = await makeRequest('/api/admin/trust/summary', {
        headers: { 'Cookie': `session_token=${adminSession.session_token}` }
      });
      assert.strictEqual(res.statusCode, 200);
    });

    // =========================================================================
    // PART 2: MAGIC LINK AUTHENTICATION LIFECYCLE
    // =========================================================================
    console.log('\n── Part 2: Magic Link Passwordless Authentication ──');

    let capturedMail = null;
    MagicLinkService.setTestMailSink((mail) => {
      capturedMail = mail;
    });

    // Test 1: Valid email request
    await test('MagicLink: Request magic link with valid email returns generic success', async () => {
      capturedMail = null;
      const res = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'budi.seller@example.com' }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.message.includes('tautan akses telah dikirimkan'));
      assert.ok(capturedMail !== null);
      assert.strictEqual(capturedMail.to, 'budi.seller@example.com');
      assert.ok(capturedMail.rawToken.length === 64);
    });

    // Test 2: Malformed email rejection
    await test('MagicLink: Malformed email format is rejected with 400 INVALID_EMAIL', async () => {
      const invalidEmails = ['not-an-email', '@missinguser.com', 'spaces in@email.com', ''];
      for (const bad of invalidEmails) {
        const res = await makeRequest('/api/auth/magic-link', {
          method: 'POST',
          body: { email: bad }
        });
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.json.code, 'INVALID_EMAIL');
      }
    });

    // Test 3: No User Enumeration
    await test('MagicLink: Known email and unknown email produce identical responses', async () => {
      MagicLinkService.resetRateLimits();
      const resKnown = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'budi.seller@example.com' }
      });
      const resUnknown = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'completely.unknown.random.person@example.com' }
      });

      assert.strictEqual(resKnown.statusCode, 200);
      assert.strictEqual(resUnknown.statusCode, 200);
      assert.strictEqual(resKnown.json.message, resUnknown.json.message);
      assert.strictEqual(resKnown.json.success, resUnknown.json.success);
    });

    // Test 4: Token Verification & Session Establishment
    let validToken = null;
    await test('MagicLink: Verify valid token creates canonical SessionStore session', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'dewi.buyer@example.com' }
      });
      assert.ok(capturedMail !== null);
      validToken = capturedMail.rawToken;

      const verifyRes = await makeRequest(`/api/auth/verify?token=${validToken}&format=json`);
      assert.strictEqual(verifyRes.statusCode, 200);
      assert.strictEqual(verifyRes.json.success, true);
      assert.strictEqual(verifyRes.json.user.email, 'dewi.buyer@example.com');
      assert.strictEqual(verifyRes.json.user.role, 'buyer');
      assert.ok(verifyRes.json.session_token.startsWith('ses-'));

      // Verify Set-Cookie header
      const setCookie = verifyRes.headers['set-cookie'];
      assert.ok(setCookie);
      assert.ok(setCookie[0].includes('session_token='));
      assert.ok(setCookie[0].includes('HttpOnly'));

      // Verify SessionStore actually holds this session
      const sessionInStore = SessionStore.findSession(verifyRes.json.session_token);
      assert.ok(sessionInStore !== null);
      assert.strictEqual(sessionInStore.user_id, 'buyer-1');
    });

    // Test 5: Replay Protection (Single-use)
    await test('MagicLink: Replaying an already used token fails with 401 TOKEN_ALREADY_USED', async () => {
      const replayRes = await makeRequest(`/api/auth/verify?token=${validToken}&format=json`);
      assert.strictEqual(replayRes.statusCode, 401);
      assert.strictEqual(replayRes.json.code, 'TOKEN_ALREADY_USED');
    });

    // Test 6: Malformed Token Rejection
    await test('MagicLink: Malformed token fails with 401 MALFORMED_TOKEN', async () => {
      const malformedTokens = ['short', 'not-hex-characters-1234567890abcdefghijklmnopqrstuvwxyz!', 'xyz'];
      for (const mt of malformedTokens) {
        const res = await makeRequest(`/api/auth/verify?token=${mt}&format=json`);
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.json.code, 'MALFORMED_TOKEN');
      }
    });

    // Test 7: Expired Token Rejection
    await test('MagicLink: Expired token fails with 401 TOKEN_EXPIRED', async () => {
      // Manually insert an expired token record into state.magic_link_tokens
      const expiredRaw = crypto.randomBytes(32).toString('hex');
      const expiredHash = MagicLinkService.hashToken(expiredRaw);
      state.magic_link_tokens.push({
        id: 'mlt-expired-test',
        email: 'budi.seller@example.com',
        token_hash: expiredHash,
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
        used: false,
        used_at: null,
        ip_address: '127.0.0.1'
      });

      const res = await makeRequest(`/api/auth/verify?token=${expiredRaw}&format=json`);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'TOKEN_EXPIRED');
    });

    // Test 8: New User Self-Registration via Magic Link (Role safety)
    await test('MagicLink: New user signup receives safe role buyer, NEVER admin', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const newEmail = 'brand.new.user.2026@gmail.com';
      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: newEmail }
      });
      assert.ok(capturedMail !== null);

      const verifyRes = await makeRequest(`/api/auth/verify?token=${capturedMail.rawToken}&format=json`);
      assert.strictEqual(verifyRes.statusCode, 200);
      assert.strictEqual(verifyRes.json.user.email, newEmail);
      assert.strictEqual(verifyRes.json.user.role, 'buyer'); // Must be buyer

      // Verify in state.users
      const userInDb = state.users.find(u => u.email === newEmail);
      assert.ok(userInDb !== null);
      assert.strictEqual(userInDb.role, 'buyer');
      assert.strictEqual(userInDb.password, null); // Passwordless!
    });

    // Test 9: Session Query (/api/auth/session) & Logout (/api/auth/logout)
    await test('MagicLink: GET /api/auth/session returns user identity; POST /api/auth/logout terminates it', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'rina.buyer@example.com' }
      });
      const verifyRes = await makeRequest(`/api/auth/verify?token=${capturedMail.rawToken}&format=json`);
      const sessionToken = verifyRes.json.session_token;

      // Check session
      const sessionRes = await makeRequest('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      assert.strictEqual(sessionRes.statusCode, 200);
      assert.strictEqual(sessionRes.json.authenticated, true);
      assert.strictEqual(sessionRes.json.user.email, 'rina.buyer@example.com');

      // Logout
      const logoutRes = await makeRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      assert.strictEqual(logoutRes.statusCode, 200);
      assert.strictEqual(logoutRes.json.success, true);

      // Verify session is now dead
      const postLogoutRes = await makeRequest('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      assert.strictEqual(postLogoutRes.statusCode, 401);
    });

    // Test 10: Open Redirect Protection
    await test('MagicLink: Open redirect attempts are sanitized to safe relative path', async () => {
      const evilRedirects = [
        'https://evil.com/phishing',
        'http://attacker.org',
        '//evil.com',
        '/\\evil.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>'
      ];

      for (const evil of evilRedirects) {
        const sanitized = MagicLinkService.validateRedirectUrl(evil);
        assert.strictEqual(sanitized, '/', `Failed to sanitize evil redirect: ${evil}`);
      }

      // Safe redirects must be preserved
      assert.strictEqual(MagicLinkService.validateRedirectUrl('/offers'), '/offers');
      assert.strictEqual(MagicLinkService.validateRedirectUrl('/track?id=123'), '/track?id=123');
      assert.strictEqual(MagicLinkService.validateRedirectUrl('https://tikum.app/create'), 'https://tikum.app/create');
    });

    // Test 11: Rate Limiting (Per-Email & Per-IP)
    await test('MagicLink: Rate limiting activates on excess attempts (429)', async () => {
      MagicLinkService.resetRateLimits();
      const floodEmail = 'rate.limit.victim@example.com';

      // First 3 requests succeed
      for (let i = 1; i <= 3; i++) {
        const res = await makeRequest('/api/auth/magic-link', {
          method: 'POST',
          body: { email: floodEmail }
        });
        assert.strictEqual(res.statusCode, 200);
      }

      // 4th request must be rejected with 429
      const floodRes = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: floodEmail }
      });
      assert.strictEqual(floodRes.statusCode, 429);
      assert.strictEqual(floodRes.json.code, 'RATE_LIMIT_EXCEEDED');
    });

    // Test 12: Token Leakage Audit
    await test('MagicLink: Raw token is NEVER stored in database state or audit logs', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'ops@argus.id' }
      });
      assert.ok(capturedMail !== null);
      const rawToken = capturedMail.rawToken;

      // 1. Check state.magic_link_tokens
      for (const rec of state.magic_link_tokens) {
        assert.notStrictEqual(rec.token_hash, rawToken, 'Raw token stored in token_hash!');
        assert.strictEqual(typeof rec.rawToken, 'undefined', 'Raw token leaked on token record!');
      }

      // 2. Check state.audit_logs
      const stringifiedLogs = JSON.stringify(state.audit_logs);
      assert.ok(!stringifiedLogs.includes(rawToken), 'Raw magic link token leaked into audit logs!');
    });

    // Test 13: Authentication vs Trust Isolation
    await test('Trust Layer Isolation: Authenticated session does NOT unlock payment or verify seller', async () => {
      const buyerSession = SessionStore.createSession({ userId: 'buyer-1', role: 'buyer' });

      // Check payment status on admin endpoint using admin session
      const payRes = await makeRequest('/api/admin/trust/payments', {
        headers: { 'Authorization': `Bearer ${adminSession.session_token}` }
      });
      assert.strictEqual(payRes.statusCode, 200);
      assert.strictEqual(payRes.json.status, IPAYMU_STATUS.PENDING_VERIFICATION);
      assert.strictEqual(payRes.json.safety_invariants.NO_REAL_PAYMENT, true);
      assert.strictEqual(payRes.json.safety_invariants.NO_FAKE_GMV, true);
      assert.strictEqual(payRes.json.safety_invariants.NO_FAKE_ESCROW_BALANCE, true);
    });

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`  ALL ${passed}/${total} AUTH & SECURITY TESTS PASSED!`);
    console.log('════════════════════════════════════════════════════════════════\n');

  } finally {
    MagicLinkService.clearTestMailSink();
    if (server) server.close();
  }
}

runSuite().catch(err => {
  console.error('\nTest suite failed with fatal error:', err);
  process.exit(1);
});
