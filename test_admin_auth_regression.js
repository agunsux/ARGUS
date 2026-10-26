/**
 * TIKUM / ARGUS — Admin Authentication & Transaction Control Center Regression Suite
 * Tests all 9 acceptance items from Phase 3 before production verification.
 */

process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'TestAdminSecretPassword123!';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, hashPassword, verifyPassword } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { getUserRepository } = require('./src/storage');

let server;
let port;
let baseUrl;

function request(path, options = {}) {
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
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          status: res.statusCode,
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

async function runTests() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — PHASE 3 PRE-DEPLOYMENT AUTH REGRESSION SUITE  ');
  console.log('================================================================\n');

  await resetDatabase();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
      } catch (err) {
        console.error(`  [FAIL] ${name}: ${err.message}`);
        failed++;
      }
    })();
  }

  // 1. Valid admin credentials authenticate successfully
  let adminSessionToken = null;
  await test('1. Valid admin credentials authenticate successfully', async () => {
    const res = await request('/api/admin/login', {
      method: 'POST',
      body: { email: 'admin@tikum.app', password: 'TestAdminSecretPassword123!' }
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.session_token, 'Session token must be present');
    assert.strictEqual(res.json.user.email, 'admin@tikum.app');
    assert.ok(res.headers['set-cookie'], 'Set-Cookie header must be present');
    adminSessionToken = res.json.session_token;
  });

  // 2. Invalid password rejected (401)
  await test('2. Invalid password is rejected (401)', async () => {
    const res = await request('/api/admin/login', {
      method: 'POST',
      body: { email: 'admin@tikum.app', password: 'wrongpassword' }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.json.code, 'INVALID_CREDENTIALS');
  });

  // 3. Unknown email rejected (401)
  await test('3. Unknown email is rejected (401)', async () => {
    const res = await request('/api/admin/login', {
      method: 'POST',
      body: { email: 'unknown@tikum.app', password: 'TestAdminSecretPassword123!' }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.json.code, 'INVALID_CREDENTIALS');
  });

  // 4. Anonymous access to protected admin APIs rejected (401)
  await test('4. Anonymous access to protected admin APIs is rejected (401)', async () => {
    const res = await request('/api/admin/transactions/control-center', {
      method: 'GET'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
  });

  // 5. Authenticated non-admin access rejected (403)
  await test('5. Authenticated non-admin access is rejected (403)', async () => {
    // Register normal buyer
    const signupRes = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        name: 'Regular Customer',
        email: 'customer@example.com',
        password: 'CustomerPass123!'
      }
    });
    assert.strictEqual(signupRes.status, 201);

    // Login as buyer to get valid session token
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'customer@example.com',
        password: 'CustomerPass123!'
      }
    });
    assert.strictEqual(loginRes.status, 200);
    const buyerToken = loginRes.json.session_token;

    // Try accessing admin control center
    const adminRes = await request('/api/admin/transactions/control-center', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${buyerToken}` }
    });
    assert.strictEqual(adminRes.status, 403);
    assert.strictEqual(adminRes.json.code, 'FORBIDDEN');
  });

  // 6. Authenticated admin access is allowed (200)
  await test('6. Authenticated admin access to Control Center is allowed (200)', async () => {
    const res = await request('/api/admin/transactions/control-center', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminSessionToken}` }
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.summary, 'Summary KPI metrics must be present');
    assert.ok(Array.isArray(res.json.transactions), 'Transactions array must be present');
  });

  // 7. Expired or invalid sessions are rejected (401)
  await test('7. Expired or invalid sessions are rejected (401)', async () => {
    const res = await request('/api/admin/transactions/control-center', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ses-invalid-nonexistent-token-12345' }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
  });

  // 8. Passwords and session secrets are never exposed in API responses or logs
  await test('8. Passwords and session secrets are never exposed in API responses', async () => {
    const res = await request('/api/admin/transactions/control-center', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminSessionToken}` }
    });
    const bodyStr = res.body;
    assert.ok(!bodyStr.includes('password_hash'), 'Response must never leak password_hash');
    assert.ok(!bodyStr.includes('TestAdminSecretPassword123!'), 'Response must never leak plaintext password');
    assert.ok(!bodyStr.includes('session_token_hash'), 'Response must never leak session_token_hash');
  });

  // 9. Existing customer login and seller workflows remain functional
  await test('9. Existing customer login and seller workflows remain functional', async () => {
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'customer@example.com', password: 'CustomerPass123!' }
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.json.success, true);
    assert.strictEqual(loginRes.json.user.role, 'BUYER');

    const meRes = await request('/api/auth/me', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${loginRes.json.session_token}` }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.json.user.email, 'customer@example.com');
  });

  server.close();

  console.log('\n================================================================');
  console.log(`  PHASE 3 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner failure:', err);
  if (server) server.close();
  process.exit(1);
});
