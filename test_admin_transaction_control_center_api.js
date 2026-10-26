/**
 * TIKUM / ARGUS — Admin Transaction Control Center API HTTP Test Suite
 *
 * Verifies HTTP endpoints:
 * 1. Anonymous access is rejected (401 AUTH_REQUIRED)
 * 2. Non-admin access is rejected (403 FORBIDDEN)
 * 3. GET /api/admin/transactions/control-center returns summary and paginated transactions
 * 4. GET /api/admin/transactions/:orderId/timeline returns chronological audit trail
 * 5. POST /api/admin/transactions/:orderId/hold applies administrative hold (forces RED)
 * 6. POST /api/admin/transactions/:orderId/release-hold clears hold
 * 7. POST /api/admin/transactions/:orderId/execute-payout:
 *    - Rejects PIC / BUYER role (403 FORBIDDEN)
 *    - Rejects if status is not GREEN (400 PAYOUT_NOT_ELIGIBLE)
 *    - Executes payout when status is GREEN (200 OK)
 */

process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin.tcc@tikum.app';
process.env.ADMIN_PASSWORD = 'Tcc-Control-Center-2026!';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, hashPassword } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');

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
    failed++;
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — TRANSACTION CONTROL CENTER API TEST           ');
  console.log('================================================================\n');

  resetDatabase();

  server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // 1. Setup Fixture Users and Sessions
  const adminUser = {
    id: 'usr-admin-tcc',
    email: process.env.ADMIN_EMAIL,
    password_hash: hashPassword(process.env.ADMIN_PASSWORD),
    role: 'ADMIN',
    status: 'ACTIVE'
  };
  const buyerUser = {
    id: 'usr-buyer-tcc',
    email: 'buyer.tcc@example.com',
    password_hash: hashPassword('buyer-pass'),
    role: 'BUYER',
    status: 'ACTIVE'
  };
  const picUser = {
    id: 'usr-pic-tcc',
    email: 'pic.tcc@example.com',
    password_hash: hashPassword('pic-pass'),
    role: 'VENUE_PIC',
    status: 'ACTIVE'
  };
  const sellerUser = {
    id: 'usr-seller-tcc',
    email: 'seller.tcc@example.com',
    password_hash: hashPassword('seller-pass'),
    role: 'SELLER',
    status: 'ACTIVE'
  };

  state.users = [adminUser, buyerUser, picUser, sellerUser];
  state.seller_profiles = [
    { user_id: 'usr-seller-tcc', kyc_status: 'VERIFIED' }
  ];

  const adminSession = SessionStore.createSession({ userId: adminUser.id, role: 'ADMIN' });
  const buyerSession = SessionStore.createSession({ userId: buyerUser.id, role: 'BUYER' });
  const picSession = SessionStore.createSession({ userId: picUser.id, role: 'VENUE_PIC' });

  const adminToken = adminSession.session_token;
  const buyerToken = buyerSession.session_token;
  const picToken = picSession.session_token;

  // 2. Setup Orders Fixture
  state.orders = [
    {
      id: 'ord-http-yellow',
      buyer_id: 'usr-buyer-tcc',
      seller_id: 'usr-seller-tcc',
      status: 'PAYMENT_PENDING',
      buyer_total: 500000,
      seller_payout: 450000,
      created_at: '2026-10-26T10:00:00Z'
    },
    {
      id: 'ord-http-green',
      ticket_id: 'tkt-http-green',
      buyer_id: 'usr-buyer-tcc',
      seller_id: 'usr-seller-tcc',
      status: 'PAID',
      buyer_total: 1000000,
      seller_payout: 900000,
      created_at: '2026-10-26T11:00:00Z'
    }
  ];
  state.tickets = [
    {
      id: 'tkt-http-green',
      ticket_id: 'tkt-http-green',
      status: 'TRANSFERRED',
      seller_id: 'usr-seller-tcc'
    }
  ];
  state.escrows = [
    {
      id: 'esc-http-green',
      order_id: 'ord-http-green',
      amount: 900000,
      status: 'FUNDED',
      funded_at: '2026-10-26T11:05:00Z'
    }
  ];
  state.entry_verifications = [
    {
      order_id: 'ord-http-green',
      status: 'CONFIRMED',
      gate: 'Main Gate',
      pic_id: 'usr-pic-tcc',
      verified_at: '2026-10-26T11:30:00Z'
    }
  ];
  state.settlements = [];
  state.disputes = [];
  state.incidents = [];
  state.admin_holds = [];

  // --------------------------------------------------------------------------
  // Tests
  // --------------------------------------------------------------------------

  await test('Anonymous request to /api/admin/transactions/control-center returns 401', async () => {
    const res = await makeRequest('/api/admin/transactions/control-center');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json.code, 'AUTH_REQUIRED');
  });

  await test('Buyer request to /api/admin/transactions/control-center returns 403', async () => {
    const res = await makeRequest('/api/admin/transactions/control-center', {
      headers: { 'Authorization': `Bearer ${buyerToken}` }
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json.code, 'FORBIDDEN');
  });

  await test('Admin GET /api/admin/transactions/control-center returns summary and paginated transactions', async () => {
    const res = await makeRequest('/api/admin/transactions/control-center', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.summary);
    assert.strictEqual(res.json.summary.total_transactions, 2);
    assert.strictEqual(res.json.summary.count_yellow, 1);
    assert.strictEqual(res.json.summary.count_green, 1);
    assert.strictEqual(res.json.transactions.length, 2);
  });

  await test('Admin GET /api/admin/transactions/control-center?status=GREEN filters correctly', async () => {
    const res = await makeRequest('/api/admin/transactions/control-center?status=GREEN', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.transactions.length, 1);
    assert.strictEqual(res.json.transactions[0].orderId, 'ord-http-green');
    assert.strictEqual(res.json.transactions[0].colorStatus, 'GREEN');
    assert.strictEqual(res.json.transactions[0].payoutEligible, true);
  });

  await test('Admin GET /api/admin/transactions/:orderId/timeline returns chronological events', async () => {
    const res = await makeRequest('/api/admin/transactions/ord-http-green/timeline', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.orderId, 'ord-http-green');
    assert.ok(Array.isArray(res.json.timeline));
    assert.ok(res.json.timeline.length >= 2);
  });

  await test('Admin POST /api/admin/transactions/:orderId/hold applies administrative hold', async () => {
    const res = await makeRequest('/api/admin/transactions/ord-http-green/hold', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { reason: 'Suspected identity mismatch reported' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.evaluation.colorStatus, 'RED');

    // Confirm control center now reports ord-http-green as RED
    const checkRes = await makeRequest('/api/admin/transactions/control-center?status=RED', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(checkRes.json.transactions.length, 1);
    assert.strictEqual(checkRes.json.transactions[0].orderId, 'ord-http-green');
  });

  await test('Admin POST /api/admin/transactions/:orderId/release-hold clears hold', async () => {
    const res = await makeRequest('/api/admin/transactions/ord-http-green/release-hold', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { reason: 'Identity verified with KTP upload' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.evaluation.colorStatus, 'GREEN');
  });

  await test('PIC user attempting POST /api/admin/transactions/:orderId/execute-payout is rejected with 403', async () => {
    const res = await makeRequest('/api/admin/transactions/ord-http-green/execute-payout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${picToken}` },
      body: { bankAccount: 'BCA 1234567890' }
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json.code, 'FORBIDDEN');
  });

  await test('Payout execution rejects when order is in YELLOW state (ord-http-yellow)', async () => {
    const res = await makeRequest('/api/admin/transactions/ord-http-yellow/execute-payout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json.code, 'PAYOUT_NOT_ELIGIBLE');
    assert.strictEqual(res.json.colorStatus, 'YELLOW');
  });

  await test('Payout execution succeeds on GREEN state (ord-http-green) and transitions to PAID_OUT', async () => {
    const res = await makeRequest('/api/admin/transactions/ord-http-green/execute-payout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        bankAccount: 'BCA 1234567890 (a.n Seller TCC)',
        idempotencyKey: 'idemp-http-green-disburse'
      }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.evaluation.colorStatus, 'PAID_OUT');
    assert.ok(res.json.settlement.payout_ref);
  });

  server.close();

  console.log('\n================================================================');
  console.log(`  ALL API TESTS PASSED: ${passed}/${passed + failed}`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('Fatal API test error:', err);
  process.exit(1);
});
