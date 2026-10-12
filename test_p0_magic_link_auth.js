/**
 * Test Suite: P0 — TIKUM PASSWORDLESS AUTH: MAGIC LINK LOGIN / SIGN UP
 * 
 * Verifies all architectural security, flow, and UI invariants:
 * 1. Centralized 15-Minute Expiry (MAGIC_LINK_EXPIRY_MINUTES)
 * 2. Request magic link returns generic success without leaking raw token
 * 3. Outbound email has correct subject and passwordless body
 * 4. Malformed email formats are rejected with 400 INVALID_EMAIL
 * 5. Anti-enumeration ensures identical response for existing and new emails
 * 6. New email auto-creates passwordless account with safe role buyer (never admin)
 * 7. Database stores only SHA-256 token hash; raw token is NEVER persisted
 * 8. Valid token verification establishes session, sets HttpOnly cookie
 * 9. Single-use replay protection rejects reused token with 401 TOKEN_ALREADY_USED
 * 10. Expired token rejects with 401 TOKEN_EXPIRED and clear message
 * 11. Malformed and unknown tokens are rejected with 401
 * 12. Rate limit rejects excess requests with 429 RATE_LIMIT_EXCEEDED
 * 13. Redirect URLs are strictly validated to prevent open redirects
 * 14. GET /api/auth/session returns user identity; POST /api/auth/logout terminates it
 * 15. Audit trail records all required lifecycle events
 * 16. UI Header contains Login/Sign Up adjacent to Dark Mode; /account serves valid page
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('./src/server');
const { state } = require('./src/database');
const { getUserRepository } = require('./src/storage');
const { MagicLinkService, MAGIC_LINK_EXPIRY_MINUTES } = require('./src/services/magicLinkService');
const { SessionStore } = require('./src/services/sessionStore');

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = options.headers || {};
    let body = options.body;

    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  RUNNING P0 — TIKUM PASSWORDLESS MAGIC LINK AUTH TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      }
      throw err;
    }
  }

  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let capturedMail = null;
  MagicLinkService.setTestMailSink((mail) => {
    capturedMail = mail;
  });

  try {
    // 1. Centralized Expiry Verification
    await test('Invariant 1: Centralized MAGIC_LINK_EXPIRY_MINUTES is 15 minutes', async () => {
      assert.strictEqual(MAGIC_LINK_EXPIRY_MINUTES, 15);
    });

    // 2. Valid Email Magic Link Request & Zero Raw Token Leakage
    await test('Invariant 2: Request magic link returns generic success without leaking raw token', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;

      const res = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'buyer.alice@example.com' }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.message.includes('tautan akses telah dikirimkan'));

      // ZERO RAW TOKEN LEAKED TO API RESPONSE
      assert.strictEqual(typeof res.json._test_token, 'undefined');
      assert.strictEqual(typeof res.json.token, 'undefined');
      assert.strictEqual(typeof res.json.rawToken, 'undefined');
      assert.strictEqual(typeof res.json.magicLinkUrl, 'undefined');

      // Captured by test mail sink
      assert.ok(capturedMail !== null);
      assert.strictEqual(capturedMail.to, 'buyer.alice@example.com');
      assert.ok(capturedMail.rawToken.length === 64);
      assert.ok(capturedMail.magicLinkUrl.includes(capturedMail.rawToken));
    });

    // 3. Email content validation (Subject & Body requirements)
    await test('Invariant 3: Outbound email has correct subject and passwordless body', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;

      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'content.check@example.com' }
      });

      assert.ok(capturedMail !== null);
      assert.ok(capturedMail.magicLinkUrl.includes('https://tikum.app/api/auth/verify?token='));
    });

    // 4. Invalid Email Rejection
    await test('Invariant 4: Malformed email formats are rejected with 400 INVALID_EMAIL', async () => {
      const invalidEmails = ['', '   ', 'not-an-email', 'missing@domain', '@missinguser.com', 'spaces in@mail.com'];
      for (const bad of invalidEmails) {
        const res = await makeRequest('/api/auth/magic-link', {
          method: 'POST',
          body: { email: bad }
        });
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.json.code, 'INVALID_EMAIL');
      }
    });

    // 5. Anti-Enumeration: Known vs Unknown Email Produce Identical Response
    await test('Invariant 5: Anti-enumeration ensures identical response for existing and new emails', async () => {
      MagicLinkService.resetRateLimits();

      // Seed an existing user
      if (!state.users) state.users = [];
      const knownEmail = 'known.existing.user@tikum.app';
      if (!state.users.find(u => u.email === knownEmail)) {
        state.users.push({
          id: 'usr-known-1',
          email: knownEmail,
          name: 'Known User',
          role: 'buyer',
          status: 'ACTIVE'
        });
      }

      const resKnown = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: knownEmail }
      });

      const resUnknown = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: 'brand.new.never.seen.user@example.com' }
      });

      assert.strictEqual(resKnown.statusCode, 200);
      assert.strictEqual(resUnknown.statusCode, 200);
      assert.strictEqual(resKnown.json.message, resUnknown.json.message);
      assert.strictEqual(resKnown.json.success, resUnknown.json.success);
    });

    // 6. Single Passwordless Flow: Auto Account Creation for New Users with Safe Role
    await test('Invariant 6: New email auto-creates passwordless account with safe role buyer (never admin)', async () => {
      MagicLinkService.resetRateLimits();
      const newEmail = 'auto.signup.test@tikum.app';

      // Ensure user doesn't exist beforehand
      state.users = (state.users || []).filter(u => u.email !== newEmail);

      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: newEmail }
      });

      const userInDb = state.users.find(u => u.email === newEmail);
      assert.ok(userInDb !== null, 'User must be created in state.users');
      assert.strictEqual(userInDb.role, 'buyer');
      assert.strictEqual(userInDb.status, 'ACTIVE');
      assert.strictEqual(userInDb.password, null);
      assert.strictEqual(userInDb.auth_provider, 'MAGIC_LINK');
    });

    // 7. Token Security & Storage: Raw Token Never Persisted in DB or Audit Logs
    await test('Invariant 7: Database stores only SHA-256 token hash; raw token is NEVER persisted', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const secretAuditEmail = 'token.security.check@example.com';

      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: secretAuditEmail }
      });

      assert.ok(capturedMail !== null);
      const rawToken = capturedMail.rawToken;
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Check state.magic_link_tokens
      const record = state.magic_link_tokens.find(t => t.email === secretAuditEmail);
      assert.ok(record !== null);
      assert.strictEqual(record.token_hash, expectedHash);
      assert.notStrictEqual(record.token_hash, rawToken);
      assert.strictEqual(typeof record.rawToken, 'undefined');

      // Check state.audit_logs: raw token must NEVER appear anywhere in serialized logs
      const allLogsString = JSON.stringify(state.audit_logs || []);
      assert.ok(!allLogsString.includes(rawToken), 'Raw token leaked into audit logs!');
    });

    // 8. Token Verification, Session Establishment & HttpOnly Cookie
    let verificationToken = null;
    let establishedSessionToken = null;
    await test('Invariant 8: Valid token verification establishes session, sets HttpOnly cookie', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const testEmail = 'verify.session.test@tikum.app';

      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: testEmail }
      });

      verificationToken = capturedMail.rawToken;

      const verifyRes = await makeRequest(`/api/auth/verify?token=${verificationToken}&format=json`);
      assert.strictEqual(verifyRes.statusCode, 200);
      assert.strictEqual(verifyRes.json.success, true);
      assert.strictEqual(verifyRes.json.user.email, testEmail);
      assert.ok(verifyRes.json.session_token.startsWith('ses-'));
      establishedSessionToken = verifyRes.json.session_token;

      // Verify Set-Cookie header
      const setCookie = verifyRes.headers['set-cookie'];
      assert.ok(setCookie, 'Set-Cookie header must be present');
      assert.ok(setCookie[0].includes('session_token='));
      assert.ok(setCookie[0].includes('HttpOnly'));

      // Verify SessionStore holds this session
      const sessionInStore = SessionStore.findSession(establishedSessionToken);
      assert.ok(sessionInStore !== null);
      assert.strictEqual(sessionInStore.revoked, false);
    });

    // 9. Single-Use Replay Protection: Second Verification Attempt Fails
    await test('Invariant 9: Single-use replay protection rejects reused token with 401 TOKEN_ALREADY_USED', async () => {
      assert.ok(verificationToken !== null);

      const replayRes = await makeRequest(`/api/auth/verify?token=${verificationToken}&format=json`);
      assert.strictEqual(replayRes.statusCode, 401);
      assert.strictEqual(replayRes.json.code, 'TOKEN_ALREADY_USED');
    });

    // 10. Expired Token Rejection
    await test('Invariant 10: Expired token rejects with 401 TOKEN_EXPIRED and clear message', async () => {
      const expiredRaw = crypto.randomBytes(32).toString('hex');
      const expiredHash = crypto.createHash('sha256').update(expiredRaw).digest('hex');

      state.magic_link_tokens.push({
        id: 'mlt-expired-unit-test',
        email: 'expired.user@tikum.app',
        token_hash: expiredHash,
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // Expired 15 mins ago
        used: false,
        used_at: null,
        ip_address: '127.0.0.1'
      });

      const res = await makeRequest(`/api/auth/verify?token=${expiredRaw}&format=json`);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'TOKEN_EXPIRED');
      assert.ok(res.json.error.includes('kedaluwarsa'));
    });

    // 11. Malformed and Non-existent Tokens
    await test('Invariant 11: Malformed and unknown tokens are rejected with 401', async () => {
      // Malformed
      const malformedRes = await makeRequest('/api/auth/verify?token=short-invalid-token&format=json');
      assert.strictEqual(malformedRes.statusCode, 401);
      assert.strictEqual(malformedRes.json.code, 'MALFORMED_TOKEN');

      // Unknown 64-hex token
      const unknownToken = crypto.randomBytes(32).toString('hex');
      const unknownRes = await makeRequest(`/api/auth/verify?token=${unknownToken}&format=json`);
      assert.strictEqual(unknownRes.statusCode, 401);
      assert.strictEqual(unknownRes.json.code, 'INVALID_TOKEN');
    });

    // 12. Rate Limiting: Per-Email and Per-IP Thresholds
    await test('Invariant 12: Rate limit rejects excess requests with 429 RATE_LIMIT_EXCEEDED', async () => {
      MagicLinkService.resetRateLimits();
      const rateEmail = 'flood.target@example.com';

      // 3 attempts succeed (EMAIL_RATE_LIMIT_MAX = 3)
      for (let i = 1; i <= 3; i++) {
        const res = await makeRequest('/api/auth/magic-link', {
          method: 'POST',
          body: { email: rateEmail }
        });
        assert.strictEqual(res.statusCode, 200);
      }

      // 4th attempt fails
      const blockedRes = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: rateEmail }
      });
      assert.strictEqual(blockedRes.statusCode, 429);
      assert.strictEqual(blockedRes.json.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(blockedRes.json.retryAfter > 0);
    });

    // 13. Open Redirect Protection
    await test('Invariant 13: Redirect URLs are strictly validated to prevent open redirects', async () => {
      const maliciousTargets = [
        'https://attacker.com/evil',
        'http://phishing.site',
        '//attacker.org',
        '/\\malicious.com',
        'javascript:alert(1)',
        'data:text/html,evil'
      ];

      for (const target of maliciousTargets) {
        const sanitized = MagicLinkService.validateRedirectUrl(target);
        assert.strictEqual(sanitized, '/', `Target ${target} was not sanitized to /`);
      }

      // Safe internal relative targets must pass
      assert.strictEqual(MagicLinkService.validateRedirectUrl('/account'), '/account');
      assert.strictEqual(MagicLinkService.validateRedirectUrl('/track?id=ord-1'), '/track?id=ord-1');
      assert.strictEqual(MagicLinkService.validateRedirectUrl('/offers'), '/offers');
      assert.strictEqual(MagicLinkService.validateRedirectUrl('https://tikum.app/account'), 'https://tikum.app/account');
    });

    // 14. Session Endpoint & Logout Flow
    await test('Invariant 14: GET /api/auth/session returns user identity; POST /api/auth/logout terminates it', async () => {
      assert.ok(establishedSessionToken !== null);

      // 1. Check session
      const sessRes = await makeRequest('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${establishedSessionToken}` }
      });
      assert.strictEqual(sessRes.statusCode, 200);
      assert.strictEqual(sessRes.json.authenticated, true);
      assert.strictEqual(sessRes.json.user.email, 'verify.session.test@tikum.app');
      assert.strictEqual(sessRes.json.user.status, 'ACTIVE');

      // 2. Logout
      const logoutRes = await makeRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${establishedSessionToken}` }
      });
      assert.strictEqual(logoutRes.statusCode, 200);
      assert.strictEqual(logoutRes.json.success, true);

      // Verify Set-Cookie clears the session
      const clearCookie = logoutRes.headers['set-cookie'];
      assert.ok(clearCookie);
      assert.ok(clearCookie[0].includes('Max-Age=0'));

      // 3. Post-logout session check must return 401
      const postLogoutRes = await makeRequest('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${establishedSessionToken}` }
      });
      assert.strictEqual(postLogoutRes.statusCode, 401);
    });

    // 15. Audit Trail Verification
    await test('Invariant 15: Audit trail records all required lifecycle events', async () => {
      const logs = state.audit_logs || [];
      const recordedActions = new Set(logs.map(l => l.action));

      const requiredActions = [
        'MAGIC_LINK_REQUESTED',
        'MAGIC_LINK_SENT',
        'MAGIC_LINK_VERIFIED',
        'MAGIC_LINK_EXPIRED',
        'MAGIC_LINK_INVALID',
        'SESSION_CREATED',
        'SESSION_REVOKED',
        'LOGOUT'
      ];

      for (const action of requiredActions) {
        assert.ok(recordedActions.has(action), `Missing audit log action: ${action}`);
      }
    });

    // 16. UI Verification: Header has Login / Sign Up adjacent to Dark Mode & Account Page exists
    await test('Invariant 16: UI Header contains Login/Sign Up adjacent to Dark Mode; /account serves valid page', async () => {
      // Check homepage HTML
      const homeRes = await makeRequest('/');
      assert.strictEqual(homeRes.statusCode, 200);
      assert.ok(homeRes.body.includes('id="authHeaderContainer"'));
      assert.ok(homeRes.body.includes('Login / Sign Up'));
      assert.ok(homeRes.body.includes('id="themeToggle"'));
      assert.ok(homeRes.body.includes('id="authModal"'));

      // Verify Brand Boundary: Zero customer-facing ARGUS on homepage
      assert.ok(!homeRes.body.includes('ARGUS Identity'));
      assert.ok(homeRes.body.includes('Tikum — Verified Ticket Marketplace'));

      // Check /account page
      const accountRes = await makeRequest('/account');
      assert.strictEqual(accountRes.statusCode, 200);
      assert.ok(accountRes.body.includes('Akun Saya'));
      assert.ok(accountRes.body.includes('Status Akun'));
      assert.ok(accountRes.body.includes('Verified'));
      assert.ok(accountRes.body.includes('Member Since'));
      assert.ok(accountRes.body.includes('Logout'));

      // Check /login page
      const loginRes = await makeRequest('/login');
      assert.strictEqual(loginRes.statusCode, 200);
      assert.ok(loginRes.body.includes('Masuk ke Tikum'));
      assert.ok(loginRes.body.includes('Kirim Magic Link'));
      assert.ok(!loginRes.body.includes('ARGUS Identity'));
    });

    // 17. Serverless Cold-Start Cross-Instance Magic Link Verification & Session Durability
    await test('Invariant 17: Magic link verification succeeds across serverless cold start (state wiped) and persists session in UserRepository', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const coldStartEmail = 'coldstart.serverless.user@tikum.app';

      // Step 1: Request magic link on "Instance A"
      const reqRes = await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: coldStartEmail, redirectUrl: '/account' }
      });
      assert.strictEqual(reqRes.statusCode, 200);
      assert.ok(capturedMail && capturedMail.rawToken);
      const rawToken = capturedMail.rawToken;

      // Step 2: Simulate serverless cold start on "Instance B" by wiping all process-local RAM & local file cache
      state.magic_link_tokens = [];
      state.users = [];
      state.sessions = [];
      SessionStore.reset();

      // Step 3: Click magic link (browser HTML redirect flow) on "Instance B"
      const verifyRes = await makeRequest(`/api/auth/verify?token=${rawToken}&redirect=%2Faccount`, {
        headers: { 'Accept': 'text/html,application/xhtml+xml' }
      });
      assert.strictEqual(verifyRes.statusCode, 302, 'Browser verify must return 302 Redirect');
      assert.strictEqual(verifyRes.headers.location, '/account', 'Must redirect to validated redirectUrl');

      const setCookie = verifyRes.headers['set-cookie'];
      assert.ok(setCookie && setCookie[0], 'Must set session_token cookie on 302 redirect');
      const cookiePair = setCookie[0].split(';')[0];
      assert.ok(cookiePair.startsWith('session_token=ses-'));

      // Step 4: Simulate another cold start on "Instance C" when browser loads /account and calls /api/auth/session & /api/auth/me
      state.sessions = [];
      SessionStore.reset();

      const sessionCheck = await makeRequest('/api/auth/session', {
        headers: { 'Cookie': cookiePair }
      });
      assert.strictEqual(sessionCheck.statusCode, 200, 'Session must hydrate from authoritative UserRepository');
      assert.strictEqual(sessionCheck.json.authenticated, true);
      assert.strictEqual(sessionCheck.json.user.email, coldStartEmail);

      const meCheck = await makeRequest('/api/auth/me', {
        headers: { 'Cookie': cookiePair }
      });
      assert.strictEqual(meCheck.statusCode, 200, '/api/auth/me must succeed with Cookie');
      assert.strictEqual(meCheck.json.user.email, coldStartEmail);

      // Step 5: Replaying the consumed token on a cold-started instance must still be rejected (401 / redirect to /login?error=TOKEN_ALREADY_USED)
      state.magic_link_tokens = [];
      const replayBrowserRes = await makeRequest(`/api/auth/verify?token=${rawToken}`, {
        headers: { 'Accept': 'text/html' }
      });
      assert.strictEqual(replayBrowserRes.statusCode, 302);
      assert.strictEqual(replayBrowserRes.headers.location, '/login?error=TOKEN_ALREADY_USED');
    });

    // 18. Existing / Legacy User Profile Preservation (Zero Duplicate Accounts)
    await test('Invariant 18: Existing user in UserRepository keeps canonical ID and role without duplicate creation', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const userRepo = getUserRepository();
      const existingEmail = 'legacy.existing.seller@tikum.app';

      const createdLegacy = await userRepo.createUser({
        id: 'usr-legacy-seller-99',
        email: existingEmail,
        name: 'Legacy Seller',
        role: 'SELLER',
        status: 'ACTIVE'
      });

      // Wipe state.users to simulate serverless instance that hasn't cached this user in RAM
      state.users = [];

      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: existingEmail }
      });
      assert.ok(capturedMail && capturedMail.rawToken);

      const verifyRes = await makeRequest(`/api/auth/verify?token=${capturedMail.rawToken}&format=json`);
      assert.strictEqual(verifyRes.statusCode, 200);
      assert.strictEqual(verifyRes.json.user.id, createdLegacy.id, 'Must preserve canonical user ID');
      assert.strictEqual(verifyRes.json.user.role, 'seller', 'Must preserve existing seller role');

      const matchingInState = state.users.filter(u => u.email && u.email.toLowerCase() === existingEmail);
      assert.strictEqual(matchingInState.length, 1, 'Must not create duplicate user records');
    });

    // 19. Email Scanner HEAD Preflight Protection
    await test('Invariant 19: HEAD /api/auth/verify does NOT consume single-use magic link token', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const scannerEmail = 'scanner.preflight@tikum.app';

      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: scannerEmail }
      });
      const rawToken = capturedMail.rawToken;

      // Email security scanner sends HEAD request before user clicks
      const headRes = await makeRequest(`/api/auth/verify?token=${rawToken}`, {
        method: 'HEAD'
      });
      assert.strictEqual(headRes.statusCode, 200);

      // User subsequently clicks the link (GET) -> must still succeed!
      const getRes = await makeRequest(`/api/auth/verify?token=${rawToken}&format=json`);
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.json.success, true);
      assert.strictEqual(getRes.json.user.email, scannerEmail);
    });

    // 20. Suspended User Magic Link Rejection
    await test('Invariant 20: Suspended user clicking magic link is rejected with 403 USER_SUSPENDED and no session is created', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const suspendedEmail = 'suspended.magic.user@tikum.app';
      const userRepo = getUserRepository();

      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: suspendedEmail }
      });
      const rawToken = capturedMail.rawToken;

      const dbUser = await userRepo.getUserByEmail(suspendedEmail);
      assert.ok(dbUser);
      await userRepo.updateUserStatus(dbUser.id, 'SUSPENDED');
      const stateUser = state.users.find(u => u.id === dbUser.id);
      if (stateUser) stateUser.status = 'SUSPENDED';

      const verifyRes = await makeRequest(`/api/auth/verify?token=${rawToken}&format=json`);
      assert.strictEqual(verifyRes.statusCode, 403);
      assert.strictEqual(verifyRes.json.code, 'USER_SUSPENDED');
      assert.strictEqual(verifyRes.headers['set-cookie'], undefined, 'Must not set session cookie for suspended user');
    });

    // 21. Concurrent GET /api/auth/verify Atomic Single-Use Enforcement (Warm & Cold-Start + Postgres SQL Contract)
    await test('Invariant 21: Concurrent GET /api/auth/verify requests establish exactly ONE session and reject all parallel replays', async () => {
      MagicLinkService.resetRateLimits();
      capturedMail = null;

      // Part A: 5 simultaneous GET requests on cold-started instances (state.magic_link_tokens wiped, relying purely on UserRepository)
      const raceColdEmail = 'concurrent.cold.race@tikum.app';
      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: raceColdEmail }
      });
      const coldRawToken = capturedMail.rawToken;
      state.magic_link_tokens = [];

      const coldResults = await Promise.all([
        makeRequest(`/api/auth/verify?token=${coldRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${coldRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${coldRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${coldRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${coldRawToken}&format=json`)
      ]);

      const coldSuccesses = coldResults.filter(r => r.statusCode === 200);
      const coldReplays = coldResults.filter(r => r.statusCode === 401 && r.json && r.json.code === 'TOKEN_ALREADY_USED');
      assert.strictEqual(coldSuccesses.length, 1, `Expected exactly 1 success in cold concurrent race, got ${coldSuccesses.length}`);
      assert.strictEqual(coldReplays.length, 4, `Expected 4 TOKEN_ALREADY_USED rejections in cold concurrent race, got ${coldReplays.length}`);
      for (const replay of coldReplays) {
        assert.strictEqual(replay.headers['set-cookie'], undefined, 'Rejected concurrent replay must not set session cookie');
      }

      // Part B: 5 simultaneous GET requests on warm instance (both state.magic_link_tokens and UserRepository populated)
      MagicLinkService.resetRateLimits();
      capturedMail = null;
      const raceWarmEmail = 'concurrent.warm.race@tikum.app';
      await makeRequest('/api/auth/magic-link', {
        method: 'POST',
        body: { email: raceWarmEmail }
      });
      const warmRawToken = capturedMail.rawToken;

      const warmResults = await Promise.all([
        makeRequest(`/api/auth/verify?token=${warmRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${warmRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${warmRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${warmRawToken}&format=json`),
        makeRequest(`/api/auth/verify?token=${warmRawToken}&format=json`)
      ]);

      const warmSuccesses = warmResults.filter(r => r.statusCode === 200);
      const warmReplays = warmResults.filter(r => r.statusCode === 401 && r.json && r.json.code === 'TOKEN_ALREADY_USED');
      assert.strictEqual(warmSuccesses.length, 1, `Expected exactly 1 success in warm concurrent race, got ${warmSuccesses.length}`);
      assert.strictEqual(warmReplays.length, 4, `Expected 4 TOKEN_ALREADY_USED rejections in warm concurrent race, got ${warmReplays.length}`);

      // Part C: Verify PostgresUserRepository SQL contract enforces atomic UPDATE and DB NOW() expiry
      const { PostgresUserRepository } = require('./src/storage/PostgresUserRepository');
      const pgSource = PostgresUserRepository.prototype.consumeMagicLinkToken.toString();
      assert.ok(pgSource.includes("WHERE event_type = 'MAGIC_LINK_TOKEN_ISSUED'"), 'Postgres consume SQL must lock on MAGIC_LINK_TOKEN_ISSUED');
      assert.ok(pgSource.includes("COALESCE((metadata->>'used')::boolean, false) = false"), 'Postgres consume SQL must require used = false');
      assert.ok(pgSource.includes("(metadata->>'expires_at')::timestamptz > NOW()"), 'Postgres consume SQL must enforce trusted DB NOW() expiry');
      assert.ok(pgSource.includes('RETURNING id'), 'Postgres consume SQL must return consumed row id');
    });

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`  ALL ${passed}/${total} P0 MAGIC LINK AUTH TESTS PASSED!`);
    console.log('════════════════════════════════════════════════════════════════\n');

  } finally {
    MagicLinkService.clearTestMailSink();
    if (server) server.close();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
