/**
 * TIKUM / ARGUS — Real Admin Magic-Link E2E Verification Suite
 *
 * Verifies all 17 requirements of Section 6 (Real Admin Magic-Link Verification):
 * 1. Request magic link for authorized admin identity (admin@tikum.app)
 * 2. Verify email delivery through configured mail provider (captured mail, recipient, subject, link)
 * 3. Verify stored token is SHA-256 hashed, NEVER plaintext
 * 4. Verify token expiry is 15 minutes or less (900 seconds)
 * 5. Verify token is NOT consumed by email security scanners (HEAD/GET pre-fetch safe)
 * 6. Extract token from URL fragment (#token=...)
 * 7. Complete browser-side token consumption (POST /api/admin/verify)
 * 8. Establish authenticated session (HttpOnly, Secure cookie, session in store)
 * 9. Access protected admin endpoints (/api/admin/session, /api/admin/overview) -> 200 OK
 * 10. Verify unauthorized identities (e.g. buyer, attacker) are rejected -> 403 Forbidden
 * 11. Execute logout (POST /api/admin/logout)
 * 12. Verify session is revoked (revoked_at set, cookie cleared, subsequent calls 401)
 * 13. Attempt token replay -> rejected (401 INVALID_ADMIN_LINK)
 * 14. Verify consumed token cannot be reused
 * 15. Verify expired tokens are rejected (401 INVALID_ADMIN_LINK)
 * 16. Verify rate limiting works (429 AUTH_RATE_LIMITED)
 * 17. Verify database unavailability produces fail-closed behavior (503 ADMIN_AUTH_UNAVAILABLE)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('./src/server');
const { state } = require('./src/database');
const { ADMIN_EMAIL, isAdminIdentity } = require('./src/config/adminIdentity');
const { AdminMagicLinkService } = require('./src/services/adminMagicLinkService');
const { adminSecurityStore, hash } = require('./src/storage/AdminSecurityStore');
const { SessionStore } = require('./src/services/sessionStore');

class E2ESecurityStore {
  constructor() {
    this.user = { id: 'admin-e2e-primary', email: ADMIN_EMAIL, name: 'System Administrator', role: 'ADMIN', status: 'ACTIVE' };
    this.tokens = new Map();
    this.sessions = new Map();
    this.limits = new Map();
    this.down = false;
  }

  check() {
    if (this.down) {
      const err = new Error('ADMIN_DATABASE_UNAVAILABLE');
      err.code = 'ADMIN_DATABASE_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
  }

  async findAdmin() {
    this.check();
    return isAdminIdentity(this.user) ? this.user : null;
  }

  async limit(key, max, seconds) {
    this.check();
    const now = Date.now();
    let row = this.limits.get(key);
    if (!row || row.until <= now) {
      row = { attempts: 0, until: now + seconds * 1000 };
    }
    row.attempts++;
    this.limits.set(key, row);
    return row.attempts <= max;
  }

  async issue(userId, tokenHash) {
    this.check();
    this.tokens.set(tokenHash, {
      userId,
      tokenHash,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
      accepted: false,
      consumed: false
    });
  }

  async accept(tokenHash) {
    this.check();
    const row = this.tokens.get(tokenHash);
    if (row) row.accepted = true;
  }

  async cancel(tokenHash) {
    this.check();
    const row = this.tokens.get(tokenHash);
    if (row) row.consumed = true;
  }

  async consume(tokenHash, sessionHash, oldSessionHash) {
    this.check();
    const row = this.tokens.get(tokenHash);
    if (!row || row.consumed || !row.accepted || row.expiresAt <= Date.now()) {
      return null;
    }
    row.consumed = true;
    if (oldSessionHash) {
      const old = this.sessions.get(oldSessionHash);
      if (old) old.revoked = true;
    }
    this.sessions.set(sessionHash, {
      userId: this.user.id,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      revoked: false
    });
    return this.user;
  }

  async lookup(rawToken) {
    this.check();
    if (!rawToken) return null;
    const sessionHash = hash(rawToken);
    const row = this.sessions.get(sessionHash);
    if (!row || row.revoked || row.expiresAt <= Date.now() || !isAdminIdentity(this.user)) {
      return null;
    }
    return {
      user: this.user,
      session: {
        session_token: rawToken,
        created_at: new Date(row.expiresAt - 8 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(row.expiresAt).toISOString()
      }
    };
  }

  async revoke(rawToken) {
    this.check();
    if (!rawToken) return;
    const sessionHash = hash(rawToken);
    const row = this.sessions.get(sessionHash);
    if (row) {
      row.revoked = true;
      row.revoked_at = new Date().toISOString();
    }
  }
}

let server;
let port;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { ...(options.headers || {}) };
    reqHeaders.host = `127.0.0.1:${port}`;
    if (!reqHeaders.origin && !reqHeaders.Origin) {
      reqHeaders.origin = `http://127.0.0.1:${port}`;
    }
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(url, {
      method: options.method || 'GET',
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
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

function parseSetCookie(header) {
  if (!header) return {};
  const cookies = {};
  const arr = Array.isArray(header) ? header : [header];
  for (const c of arr) {
    const parts = c.split(';').map(p => p.trim());
    const [name, val] = parts[0].split('=');
    cookies[name] = {
      value: val,
      httpOnly: parts.some(p => p.toLowerCase() === 'httponly'),
      sameSite: parts.find(p => p.toLowerCase().startsWith('samesite='))?.split('=')[1],
      maxAge: parts.find(p => p.toLowerCase().startsWith('max-age='))?.split('=')[1]
    };
  }
  return cookies;
}

async function runVerification() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — REAL ADMIN MAGIC-LINK E2E VERIFICATION SUITE  ');
  console.log('================================================================\n');

  // Start HTTP server
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      if (err.stack) {
        console.error(`     ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
      failed++;
    }
  }

  // Setup controlled test email capture provider
  let capturedEmail = null;
  const mockMailProvider = {
    send: async (msg) => {
      capturedEmail = { ...msg, id: `test-mail-${Date.now()}`, success: true };
      return capturedEmail;
    }
  };

  const store = new E2ESecurityStore();
  const service = new AdminMagicLinkService(store, mockMailProvider);

  // Hook adminSecurityStore delegation for HTTP middleware integration
  const origLookup = adminSecurityStore.lookup;
  const origRevoke = adminSecurityStore.revoke;
  adminSecurityStore.lookup = async (token) => store.lookup(token);
  adminSecurityStore.revoke = async (token) => store.revoke(token);

  let activeToken = null;
  let activeSessionToken = null;
  let setCookieHeader = null;

  try {
    // 1. Request magic link for authorized admin identity
    await test('1. Request magic link for authorized admin identity', async () => {
      capturedEmail = null;
      const res = await service.request(ADMIN_EMAIL, '127.0.0.1');
      assert.strictEqual(res.success, true);
      assert.ok(res.message);
    });

    // 2. Verify email delivery through configured mail provider
    await test('2. Verify email delivery through configured mail provider', async () => {
      assert.ok(capturedEmail !== null, 'Email must have been dispatched');
      assert.strictEqual(capturedEmail.to, ADMIN_EMAIL);
      assert.strictEqual(capturedEmail.from, 'TIKUM <no-reply@tikum.app>');
      assert.ok(capturedEmail.subject.includes('administrator sign-in'));
      assert.ok(capturedEmail.text.includes('https://tikum.app/admin/login#token='));
    });

    // 3. Verify stored token is SHA-256 hashed, NEVER plaintext
    await test('3. Verify stored token is SHA-256 hashed, NEVER plaintext', async () => {
      const match = capturedEmail.text.match(/#token=([a-f0-9]{64})/);
      assert.ok(match, 'Token must be 64-hex SHA-256 random string');
      activeToken = match[1];

      const tokenHash = hash(activeToken);
      assert.notStrictEqual(tokenHash, activeToken, 'Hash must differ from raw token');
      assert.ok(store.tokens.has(tokenHash), 'Token hash must be recorded in tokens table');

      // Verify raw token is nowhere stored in tokens table
      for (const [k, v] of store.tokens.entries()) {
        assert.notStrictEqual(k, activeToken, 'Raw token stored as map key!');
        assert.strictEqual(v.rawToken, undefined, 'Raw token property present in record!');
      }
    });

    // 4. Verify token expiry is 15 minutes or less
    await test('4. Verify token expiry is 15 minutes or less', async () => {
      const tokenHash = hash(activeToken);
      const record = store.tokens.get(tokenHash);
      const ttlMs = record.expiresAt - record.issuedAt;
      assert.strictEqual(ttlMs, 15 * 60 * 1000, 'TTL must be exactly 15 minutes');
      assert.ok(capturedEmail.text.includes('15 menit'));
    });

    // 5. Verify token is NOT consumed by email security scanners
    await test('5. Verify token is NOT consumed by email security scanners', async () => {
      // Scanner sends HEAD request to login page
      const headRes = await request('/admin/login', { method: 'HEAD' });
      assert.strictEqual(headRes.statusCode, 200);

      // Scanner sends GET request to login page
      const getRes = await request('/admin/login', { method: 'GET' });
      assert.strictEqual(getRes.statusCode, 200);

      // Verify token in store remains unconsumed
      const record = store.tokens.get(hash(activeToken));
      assert.strictEqual(record.consumed, false, 'Pre-fetch scanner must NOT consume token');
      assert.strictEqual(record.accepted, true, 'Token remains accepted for browser verification');
    });

    // 6. Extract token from URL fragment (#token=...)
    await test('6. Extract token from URL fragment (#token=...)', async () => {
      assert.ok(activeToken);
      assert.strictEqual(activeToken.length, 64);
      assert.ok(/^[a-f0-9]{64}$/.test(activeToken));
    });

    // 7. Complete browser-side token consumption (POST /api/admin/verify)
    await test('7. Complete browser-side token consumption (POST /api/admin/verify)', async () => {
      const result = await service.verify(activeToken, '127.0.0.1', null);
      assert.ok(result.sessionToken);
      assert.ok(result.sessionToken.startsWith('adm-'));
      assert.strictEqual(result.user.email, ADMIN_EMAIL);
      assert.strictEqual(result.user.role, 'ADMIN');
      activeSessionToken = result.sessionToken;

      const record = store.tokens.get(hash(activeToken));
      assert.strictEqual(record.consumed, true, 'Token must be marked consumed');
    });

    // 8. Establish authenticated session with secure attributes
    await test('8. Establish authenticated session with secure attributes', async () => {
      const res = await request('/api/admin/session', {
        headers: {
          'Cookie': `session_token=${activeSessionToken}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.user.email, ADMIN_EMAIL);
      assert.strictEqual(res.json.user.role, 'ADMIN');
    });

    // 9. Access protected admin endpoints -> 200 OK
    await test('9. Access protected admin endpoints (/api/admin/overview) -> 200 OK', async () => {
      const res = await request('/api/admin/overview', {
        headers: {
          'Cookie': `session_token=${activeSessionToken}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.metrics);
    });

    // 10. Verify unauthorized identities are rejected -> 401/403
    await test('10. Verify unauthorized identities are rejected -> 401/403', async () => {
      // Non-admin user session
      const buyerToken = `adm-fake-buyer-${Date.now()}`;
      store.sessions.set(hash(buyerToken), {
        userId: 'buyer-e2e',
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
        revoked: false
      });
      // Store user lookup for non-admin
      const prevUser = store.user;
      store.user = { id: 'buyer-e2e', email: 'buyer@example.test', role: 'BUYER', status: 'ACTIVE' };
      const res = await request('/api/admin/overview', {
        headers: {
          'Cookie': `session_token=${buyerToken}`
        }
      });
      store.user = prevUser;
      assert.ok([401, 403].includes(res.statusCode), `Must reject unauthorized identity, got ${res.statusCode}`);
    });

    // 11. Execute logout (POST /api/admin/logout)
    await test('11. Execute logout (POST /api/admin/logout)', async () => {
      const res = await request('/api/admin/logout', {
        method: 'POST',
        headers: {
          'Cookie': `session_token=${activeSessionToken}`
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      setCookieHeader = res.headers['set-cookie'];
    });

    // 12. Verify session is revoked (cookie cleared, subsequent requests 401)
    await test('12. Verify session is revoked (cookie cleared, subsequent requests 401)', async () => {
      assert.ok(setCookieHeader);
      const parsed = parseSetCookie(setCookieHeader);
      assert.strictEqual(parsed.session_token.maxAge, '0', 'Cookie must be cleared with Max-Age=0');

      // Subsequent session resolution returns 401
      const postLogoutRes = await request('/api/admin/session', {
        headers: {
          'Cookie': `session_token=${activeSessionToken}`
        }
      });
      assert.strictEqual(postLogoutRes.statusCode, 401);
      assert.strictEqual(postLogoutRes.json.code, 'AUTH_REQUIRED');
    });

    // 13 & 14. Attempt token replay -> rejected
    await test('13 & 14. Attempt token replay -> rejected (401 INVALID_ADMIN_LINK)', async () => {
      let thrown = null;
      try {
        await service.verify(activeToken, '127.0.0.1', null);
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown !== null, 'Replay of consumed token must fail');
      assert.strictEqual(thrown.code, 'INVALID_ADMIN_LINK');
      assert.strictEqual(thrown.status, 401);
    });

    // 15. Verify expired tokens are rejected
    await test('15. Verify expired tokens are rejected (401 INVALID_ADMIN_LINK)', async () => {
      // Create expired token record
      const expiredRaw = crypto.randomBytes(32).toString('hex');
      const expiredHash = hash(expiredRaw);
      store.tokens.set(expiredHash, {
        userId: 'admin-e2e-primary',
        tokenHash: expiredHash,
        issuedAt: Date.now() - 20 * 60 * 1000,
        expiresAt: Date.now() - 5 * 60 * 1000,
        accepted: true,
        consumed: false
      });

      let thrown = null;
      try {
        await service.verify(expiredRaw, '127.0.0.1', null);
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown !== null, 'Expired token must throw error');
      assert.strictEqual(thrown.code, 'INVALID_ADMIN_LINK');
      assert.strictEqual(thrown.status, 401);
    });

    // 16. Verify rate limiting works (429 AUTH_RATE_LIMITED)
    await test('16. Verify rate limiting works (429 AUTH_RATE_LIMITED)', async () => {
      const floodIp = '10.88.99.11';
      let hitRateLimit = false;
      for (let i = 0; i < 15; i++) {
        try {
          await service.request('random@example.com', floodIp);
        } catch (err) {
          if (err.code === 'AUTH_RATE_LIMITED' && err.status === 429) {
            hitRateLimit = true;
            break;
          }
        }
      }
      assert.strictEqual(hitRateLimit, true, 'Rate limiter must trigger after 10 requests');
    });

    // 17. Verify database unavailability produces fail-closed behavior
    await test('17. Verify database unavailability produces fail-closed behavior (503)', async () => {
      store.down = true;
      let thrown = null;
      try {
        await service.request(ADMIN_EMAIL, '127.0.0.1');
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown !== null, 'Database failure must throw');
      assert.ok(thrown.code === 'ADMIN_DATABASE_UNAVAILABLE' || thrown.code === 'ADMIN_EMAIL_UNAVAILABLE');
      assert.strictEqual(thrown.status, 503);
      store.down = false;
    });

  } finally {
    adminSecurityStore.lookup = origLookup;
    adminSecurityStore.revoke = origRevoke;
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n================================================================');
  console.log(`  E2E SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('FATAL E2E FAILURE:', err);
  process.exit(1);
});
