/**
 * TIKUM / ARGUS — EPIC 5.1: Basic Authentication & Admin Dashboard Test Suite
 * 
 * 20 Comprehensive Security, RBAC & Data Integrity Test Cases:
 * 1.  Signup works with valid data
 * 2.  Duplicate email is rejected (409)
 * 3.  Password stored as bcrypt hash, never plaintext
 * 4.  Password hash never appears in API response
 * 5.  Login works with valid credentials and sets session
 * 6.  Wrong password rejected (401)
 * 7.  Logout works (revokes session and clears cookie)
 * 8.  GET /api/auth/me returns current user
 * 9.  Unauthenticated admin request rejected (401)
 * 10. Normal USER cannot access admin API (403)
 * 11. USER cannot self-promote to ADMIN (header or payload)
 * 12. Signup cannot create ADMIN (forces USER)
 * 13. Admin can access admin API
 * 14. Admin bootstrap is idempotent
 * 15. Admin password is never logged
 * 16. Suspended user cannot authenticate or access requireAuth
 * 17. Admin can suspend USER
 * 18. Admin can reactivate USER
 * 19. Admin dashboard uses real data
 * 20. Missing data displayed as "Not available", never fabricated
 * + BONUS: Admin cannot suspend self (self-lockout prevention)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, bootstrapAdminUser, verifyPassword } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');

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

let passed = 0;
let failed = 0;

async function test(title, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failed++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — EPIC 5.1: AUTH & ADMIN DASHBOARD TEST SUITE   ');
  console.log('================================================================\n');

  resetDatabase();

  server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('── Part 1: Authentication Endpoints (Signup, Login, Me, Logout) ──');

    // 1. Signup works with valid data
    await test('1. Signup works with valid data', async () => {
      const res = await makeRequest('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'alice.pilot@example.com',
          name: 'Alice Pilot',
          password: 'password123'
        }
      });

      assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}`);
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.user.email, 'alice.pilot@example.com');
      assert.strictEqual(res.json.user.name, 'Alice Pilot');
      assert.strictEqual(res.json.user.role, 'USER');
      assert.strictEqual(res.json.user.status, 'ACTIVE');
      assert.ok(res.json.user.id, 'User ID must be returned');
      assert.strictEqual(res.json.user.password_hash, undefined, 'password_hash must NOT be in response');
      assert.strictEqual(res.json.user.password, undefined, 'password must NOT be in response');
    });

    // 2. Duplicate email is rejected (409)
    await test('2. Duplicate email is rejected (409)', async () => {
      const res = await makeRequest('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'alice.pilot@example.com',
          name: 'Alice Clone',
          password: 'anotherPassword456'
        }
      });

      assert.strictEqual(res.statusCode, 409, `Expected 409, got ${res.statusCode}`);
      assert.ok(
        res.json.code === 'EMAIL_ALREADY_EXISTS' || res.json.code === 'EMAIL_ALREADY_REGISTERED',
        `Expected duplicate email code, got ${res.json.code}`
      );
    });

    // 3. Password stored as bcrypt hash, never plaintext
    await test('3. Password stored as bcrypt hash, never plaintext', async () => {
      const storedUser = state.users.find(u => u.email === 'alice.pilot@example.com');
      assert.ok(storedUser, 'User must exist in state');
      assert.notStrictEqual(storedUser.password_hash, 'password123');
      assert.ok(storedUser.password_hash.startsWith('$2'), 'Must be a bcrypt hash');
      assert.strictEqual(verifyPassword('password123', storedUser.password_hash), true);
      assert.strictEqual(verifyPassword('wrongpassword', storedUser.password_hash), false);
    });

    // 4. Password hash never appears in API response
    await test('4. Password hash never appears in API response', async () => {
      const signupRes = await makeRequest('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'bob.pilot@example.com',
          name: 'Bob Pilot',
          password: 'password123'
        }
      });
      assert.strictEqual(signupRes.json.user.password_hash, undefined);
      assert.strictEqual(signupRes.json.user.password, undefined);

      const loginRes = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'bob.pilot@example.com',
          password: 'password123'
        }
      });
      assert.strictEqual(loginRes.json.user.password_hash, undefined);
      assert.strictEqual(loginRes.json.user.password, undefined);

      // Verify the response JSON text directly does NOT contain the password hash
      const storedBob = state.users.find(u => u.email === 'bob.pilot@example.com');
      assert.ok(!loginRes.body.includes(storedBob.password_hash), 'Response must not contain hash');
    });

    // 5. Login works with valid credentials and sets session
    let userSessionToken = null;
    let userCookie = null;
    await test('5. Login works with valid credentials and sets session', async () => {
      const res = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'alice.pilot@example.com',
          password: 'password123'
        }
      });

      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.session_token, 'Must return session_token');
      assert.ok(res.json.session_token.startsWith('ses-'), 'Session token format');

      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie, 'Must set Set-Cookie header');
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
      assert.ok(cookieStr.includes('session_token='), 'Cookie must contain session_token');
      assert.ok(cookieStr.toLowerCase().includes('httponly'), 'Cookie must be HttpOnly');

      userSessionToken = res.json.session_token;
      userCookie = cookieStr.split(';')[0]; // session_token=ses-...
    });

    // 6. Wrong password rejected (401)
    await test('6. Wrong password rejected (401)', async () => {
      const res = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'alice.pilot@example.com',
          password: 'incorrectPassword'
        }
      });

      assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
      assert.strictEqual(res.json.code, 'INVALID_CREDENTIALS');
    });

    // 7. Logout works (revokes session and clears cookie)
    await test('7. Logout works (revokes session and clears cookie)', async () => {
      // Create temporary login to logout
      const tempLogin = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'bob.pilot@example.com', password: 'password123' }
      });
      const tempToken = tempLogin.json.session_token;

      // Verify session exists
      const sessionBefore = SessionStore.getSession(tempToken);
      assert.ok(sessionBefore, 'Session must exist prior to logout');

      // Call logout
      const logoutRes = await makeRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tempToken}` }
      });

      assert.strictEqual(logoutRes.statusCode, 200);
      assert.strictEqual(logoutRes.json.success, true);

      // Verify session revoked in store
      const sessionAfter = SessionStore.getSession(tempToken);
      assert.strictEqual(sessionAfter, null, 'Session must be null after logout');

      // Verify cookie cleared
      const setCookie = logoutRes.headers['set-cookie'];
      assert.ok(setCookie, 'Set-Cookie must be returned on logout');
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
      assert.ok(cookieStr.includes('Max-Age=0') || cookieStr.includes('1970'), 'Cookie must be expired');
    });

    // 8. GET /api/auth/me returns current user
    await test('8. GET /api/auth/me returns current user', async () => {
      // Authenticated with Bearer token
      const res = await makeRequest('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${userSessionToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.user.email, 'alice.pilot@example.com');
      assert.strictEqual(res.json.user.role, 'USER');

      // Authenticated with cookie
      const cookieRes = await makeRequest('/api/auth/me', {
        headers: { 'Cookie': userCookie }
      });
      assert.strictEqual(cookieRes.statusCode, 200);
      assert.strictEqual(cookieRes.json.user.email, 'alice.pilot@example.com');

      // Unauthenticated
      const unauthRes = await makeRequest('/api/auth/me');
      assert.strictEqual(unauthRes.statusCode, 401);
    });

    console.log('\n── Part 2: Authorization Boundaries & Role Protections ──');

    // 9. Unauthenticated admin request rejected (401)
    await test('9. Unauthenticated admin request rejected (401)', async () => {
      const endpoints = [
        ['GET', '/api/admin/overview'],
        ['GET', '/api/admin/users'],
        ['PATCH', '/api/admin/users/usr-1/status'],
        ['GET', '/api/admin/orders'],
        ['GET', '/api/admin/security']
      ];

      for (const [method, ep] of endpoints) {
        const res = await makeRequest(ep, { method });
        assert.strictEqual(res.statusCode, 401, `Expected 401 for unauthenticated ${method} ${ep}, got ${res.statusCode}`);
        assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
      }
    });

    // 10. Normal USER cannot access admin API (403)
    await test('10. Normal USER cannot access admin API (403)', async () => {
      const endpoints = [
        ['GET', '/api/admin/overview'],
        ['GET', '/api/admin/users'],
        ['PATCH', '/api/admin/users/usr-1/status', { status: 'SUSPENDED' }],
        ['GET', '/api/admin/orders'],
        ['GET', '/api/admin/security']
      ];

      for (const [method, ep, body] of endpoints) {
        const res = await makeRequest(ep, {
          method,
          headers: { 'Authorization': `Bearer ${userSessionToken}` },
          body
        });
        assert.strictEqual(res.statusCode, 403, `Expected 403 for USER on ${method} ${ep}, got ${res.statusCode}`);
        assert.ok(res.json.code === 'FORBIDDEN' || res.json.code === 'ADMIN_REQUIRED');
      }
    });

    // 11. USER cannot self-promote to ADMIN (header or payload)
    await test('11. USER cannot self-promote to ADMIN (header or payload)', async () => {
      // Attempt via headers
      const headerSpoofRes = await makeRequest('/api/admin/overview', {
        headers: {
          'Authorization': `Bearer ${userSessionToken}`,
          'x-user-role': 'ADMIN',
          'x-role': 'admin'
        }
      });
      assert.strictEqual(headerSpoofRes.statusCode, 403, 'Header spoofing must be rejected');

      // Attempt via status endpoint
      const alice = state.users.find(u => u.email === 'alice.pilot@example.com');
      const payloadSpoofRes = await makeRequest(`/api/admin/users/${alice.id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${userSessionToken}` },
        body: { role: 'ADMIN', status: 'ACTIVE' }
      });
      assert.strictEqual(payloadSpoofRes.statusCode, 403, 'Payload spoofing must be rejected');

      // Verify role in database was NOT changed
      assert.strictEqual(alice.role, 'USER', 'Role must remain USER');
    });

    // 12. Signup cannot create ADMIN (forces USER)
    await test('12. Signup cannot create ADMIN (forces USER)', async () => {
      const res = await makeRequest('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'hacker@argus.id',
          name: 'Hacker',
          password: 'password123',
          role: 'ADMIN',
          status: 'ACTIVE'
        }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.json.user.role, 'USER', 'API response must show USER');

      const hacker = state.users.find(u => u.email === 'hacker@argus.id');
      assert.ok(hacker, 'User must exist in state');
      assert.strictEqual(hacker.role, 'USER', 'Stored role must strictly be USER');
    });

    console.log('\n── Part 3: Admin Operations & Control Plane ──');

    // Login as Admin
    const adminLoginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'ops@argus.id',
        password: 'pilot123'
      }
    });
    assert.strictEqual(adminLoginRes.statusCode, 200, 'Admin login must succeed');
    const adminToken = adminLoginRes.json.session_token;

    // 13. Admin can access admin API
    await test('13. Admin can access admin API', async () => {
      const overviewRes = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(overviewRes.statusCode, 200);
      assert.ok(overviewRes.json.users);
      assert.ok(overviewRes.json.orders);

      const usersRes = await makeRequest('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(usersRes.statusCode, 200);
      assert.ok(Array.isArray(usersRes.json.users));

      const ordersRes = await makeRequest('/api/admin/orders', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(ordersRes.statusCode, 200);
      assert.ok(Array.isArray(ordersRes.json.orders));

      const secRes = await makeRequest('/api/admin/security', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(secRes.statusCode, 200);
      assert.ok(secRes.json.disputes);
      assert.ok(secRes.json.trust_policy);
    });

    // 14. Admin bootstrap is idempotent
    await test('14. Admin bootstrap is idempotent', async () => {
      const initialAdminCount = state.users.filter(u => (u.role || '').toUpperCase() === 'ADMIN' || u.email === 'ops@argus.id').length;
      
      const res1 = bootstrapAdminUser();
      assert.strictEqual(res1.created, false, 'Should recognize existing admin');

      const res2 = bootstrapAdminUser();
      assert.strictEqual(res2.created, false, 'Should recognize existing admin on 2nd run');

      const finalAdminCount = state.users.filter(u => (u.role || '').toUpperCase() === 'ADMIN' || u.email === 'ops@argus.id').length;
      assert.strictEqual(finalAdminCount, initialAdminCount, 'Admin count must remain constant');

      // Admin credentials still verify
      const admin = state.users.find(u => u.email === 'ops@argus.id');
      assert.strictEqual(verifyPassword('pilot123', admin.password_hash), true);
    });

    // 15. Admin password is never logged
    await test('15. Admin password is never logged', async () => {
      const secretPassword = 'UltraSecureTestPassword99!';
      process.env.ADMIN_PASSWORD = secretPassword;
      process.env.ADMIN_EMAIL = 'newbootstrap@argus.id';

      // Bootstrap a new admin
      const bootRes = bootstrapAdminUser();
      assert.strictEqual(bootRes.created, true);

      // Verify plaintext password is not in state logs
      const logsStr = JSON.stringify(state.audit_logs || []);
      assert.strictEqual(logsStr.includes(secretPassword), false, 'Plaintext password must not be in audit logs');

      // Verify the new user's password in database is hashed, not plaintext
      assert.notStrictEqual(bootRes.user.password_hash, secretPassword);
      assert.strictEqual(verifyPassword(secretPassword, bootRes.user.password_hash), true);

      // Clean up env
      delete process.env.ADMIN_PASSWORD;
      delete process.env.ADMIN_EMAIL;
    });

    // 16. Suspended user cannot authenticate or access requireAuth
    await test('16. Suspended user cannot authenticate or access requireAuth', async () => {
      const alice = state.users.find(u => u.email === 'alice.pilot@example.com');
      alice.status = 'SUSPENDED';

      // Attempt login
      const loginRes = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'alice.pilot@example.com',
          password: 'password123'
        }
      });
      assert.strictEqual(loginRes.statusCode, 403);
      assert.strictEqual(loginRes.json.code, 'ACCOUNT_SUSPENDED');

      // Attempt authenticated request with preexisting token
      const meRes = await makeRequest('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${userSessionToken}` }
      });
      assert.strictEqual(meRes.statusCode, 403);
      assert.strictEqual(meRes.json.code, 'USER_SUSPENDED');

      // Restore status for following tests
      alice.status = 'ACTIVE';
    });

    // 17. Admin can suspend USER
    await test('17. Admin can suspend USER', async () => {
      const alice = state.users.find(u => u.email === 'alice.pilot@example.com');
      
      const res = await makeRequest(`/api/admin/users/${alice.id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: { status: 'SUSPENDED' }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.user.status, 'SUSPENDED');
      assert.strictEqual(alice.status, 'SUSPENDED');

      // Verify audit log recorded
      const log = (state.audit_logs || []).find(l => l.action === 'STATUS_SUSPENDED' && (l.entity_id === alice.id || l.target_id === alice.id || (l.metadata && l.metadata.includes(alice.id))));
      assert.ok(log, 'Audit log for SUSPENDED must be recorded');
    });

    // 18. Admin can reactivate USER
    await test('18. Admin can reactivate USER', async () => {
      const alice = state.users.find(u => u.email === 'alice.pilot@example.com');
      
      const res = await makeRequest(`/api/admin/users/${alice.id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: { status: 'ACTIVE' }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.user.status, 'ACTIVE');
      assert.strictEqual(alice.status, 'ACTIVE');

      // Verify Alice can login again
      const loginRes = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'alice.pilot@example.com',
          password: 'password123'
        }
      });
      assert.strictEqual(loginRes.statusCode, 200);
      assert.strictEqual(loginRes.json.success, true);
    });

    // BONUS: Admin cannot suspend self (self-lockout prevention)
    await test('BONUS: Admin cannot suspend own account (Self-lockout prevention)', async () => {
      const admin = state.users.find(u => u.email === 'ops@argus.id');
      const res = await makeRequest(`/api/admin/users/${admin.id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: { status: 'SUSPENDED' }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.code, 'CANNOT_SUSPEND_SELF');
      assert.strictEqual(admin.status, 'ACTIVE');
    });

    console.log('\n── Part 4: Data Realism & Zero Fabrication Invariants ──');

    // 19. Admin dashboard uses real data
    await test('19. Admin dashboard uses real data', async () => {
      const overviewRes = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(overviewRes.statusCode, 200);

      const actualUsers = state.users.length;
      const actualActive = state.users.filter(u => (u.status || 'ACTIVE') === 'ACTIVE').length;
      const actualSuspended = state.users.filter(u => u.status === 'SUSPENDED').length;
      const actualOrders = state.orders.length;

      assert.strictEqual(overviewRes.json.users.total, actualUsers, 'Total users must match database count');
      assert.strictEqual(overviewRes.json.users.active, actualActive, 'Active users must match database count');
      assert.strictEqual(overviewRes.json.users.suspended, actualSuspended, 'Suspended users must match database count');
      assert.strictEqual(overviewRes.json.orders.total, actualOrders, 'Total orders must match database count');
    });

    // 20. Missing data displayed as "Not available", never fabricated
    await test('20. Missing data displayed as "Not available", never fabricated', async () => {
      const secRes = await makeRequest('/api/admin/security', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(secRes.statusCode, 200);

      assert.strictEqual(secRes.json.external_threat_intel, 'Not available', 'Uninstrumented metric must be Not available');
      assert.strictEqual(secRes.json.hardware_security_modules, 'Not available', 'Uninstrumented metric must be Not available');

      // Real metrics must be numbers, not hardcoded dummy stats
      assert.strictEqual(typeof secRes.json.disputes.total, 'number');
      assert.strictEqual(typeof secRes.json.disputes.open, 'number');
      assert.strictEqual(typeof secRes.json.incidents.total, 'number');
      assert.strictEqual(typeof secRes.json.trust_policy.total_evaluations, 'number');
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n================================================================');
  console.log(`  EPIC 5.1 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
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
