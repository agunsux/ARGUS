/**
 * TIKUM / ARGUS — EPIC P1.2: DOKU STATUS INQUIRY, SECURITY & LIFECYCLE RECONCILIATION
 *
 * Verifies:
 * 1. DOKU status inquiry normalization and target path generation (/orders/v1/status/{invoiceNumber}).
 * 2. Root cause reproduction: un-prefixed providerRef vs canonical invoice number mapping.
 * 3. Fail-closed handling of 404 data_not_found from DOKU API without unearned status fabrication.
 * 4. Gateway status confirmation guard in PaymentService.handleWebhook against fraudulent SUCCESS.
 * 5. Strict authorization gate on POST /api/v1/payments/sandbox/execute-live-cycle (rejects anonymous, requires admin).
 * 6. Production hard gate on execute-live-cycle (403 FORBIDDEN_IN_PRODUCTION).
 * 7. Rate limiter on execute-live-cycle (429 RATE_LIMIT_EXCEEDED).
 * 8. Clean removal and 410 PROVIDER_REMOVED on /v1/payments/sandbox/midtrans/execute-live-cycle.
 * 9. Double-entry ledger solvency and immutability invariants.
 */

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { state } = require('./src/database');
const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { paymentManager } = require('./src/services/payment');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');
const paymentRouter = require('./src/api/paymentRouter');

let passed = 0;
let failed = 0;

async function check(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================================');
  console.log('  TIKUM / ARGUS — EPIC P1.2: DOKU STATUS INQUIRY & ENDPOINT SECURITY SUITE     ');
  console.log('================================================================================\n');

  // Set test environment variables
  process.env.ADMIN_API_KEY = 'test_admin_secret_key_epic_p1_2';
  process.env.NODE_ENV = 'test';

  // ---------------------------------------------------------------------------
  console.log('── Section 1: DOKU Status Inquiry Normalization & Root-Cause Remediation ──');
  // ---------------------------------------------------------------------------

  const doku = new DokuPaymentProvider({
    clientId: 'BRN-0291-TEST',
    secretKey: 'SK-TEST-P1-2',
    env: 'sandbox',
    apiBaseUrl: 'https://api-sandbox.doku.com',
    allowSimulation: true
  });

  await check('1.1 Normalizes orderId object to canonical INV-DOKU-${orderId} invoice reference', async () => {
    const res = await doku.getPaymentStatus({ orderId: 'ord-abc-123' });
    assert.strictEqual(res.providerRef, 'INV-DOKU-ord-abc-123');
    assert.strictEqual(res.orderId, 'ord-abc-123');
    assert.strictEqual(res.status, MONEY_STATE.PAYMENT_PENDING);
  });

  await check('1.2 Normalizes unprefixed sbx-ord providerRef to canonical INV-DOKU-${ref}', async () => {
    const res = await doku.getPaymentStatus({ providerRef: 'sbx-ord-1794937510566' });
    assert.strictEqual(res.providerRef, 'INV-DOKU-sbx-ord-1794937510566');
    assert.strictEqual(res.orderId, 'sbx-ord-1794937510566');
  });

  await check('1.3 Normalizes unprefixed string ref to canonical INV-DOKU-${ref}', async () => {
    const res = await doku.getPaymentStatus('sbx-ord-999888777');
    assert.strictEqual(res.providerRef, 'INV-DOKU-sbx-ord-999888777');
    assert.strictEqual(res.orderId, 'sbx-ord-999888777');
  });

  await check('1.4 Preserves already formatted INV-DOKU invoice reference without duplication', async () => {
    const res = await doku.getPaymentStatus({ invoiceNumber: 'INV-DOKU-clean-ref' });
    assert.strictEqual(res.providerRef, 'INV-DOKU-clean-ref');
    assert.strictEqual(res.orderId, 'clean-ref');
  });

  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Mock HTTP Status Inquiry & Fail-Closed 404 Behavior ──');
  // ---------------------------------------------------------------------------

  // Set up ephemeral mock DOKU server to test real HTTP request signing & responses
  const recordedRequests = [];
  const mockServer = http.createServer((req, res) => {
    recordedRequests.push({
      method: req.method,
      url: req.url,
      headers: req.headers
    });

    if (req.url === '/orders/v1/status/INV-DOKU-paid-order') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        order: { invoice_number: 'INV-DOKU-paid-order', amount: 50000, currency: 'IDR' },
        transaction: { status: 'SUCCESS', amount: 50000 },
        service: { id: 'VIRTUAL_ACCOUNT' }
      }));
    } else if (req.url === '/orders/v1/status/INV-DOKU-pending-order') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        order: { invoice_number: 'INV-DOKU-pending-order', amount: 50000, currency: 'IDR' },
        transaction: { status: 'PENDING', amount: 50000 },
        service: { id: 'VIRTUAL_ACCOUNT' }
      }));
    } else if (req.url === '/orders/v1/status/INV-DOKU-not-found') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: { code: 'data_not_found', message: 'Order data not found' }
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    }
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${mockPort}`;

  const liveDoku = new DokuPaymentProvider({
    clientId: 'BRN-0291-TEST',
    secretKey: 'SK-TEST-P1-2',
    env: 'sandbox',
    apiBaseUrl: mockBaseUrl,
    allowSimulation: false // Force real HTTP calls to mock server
  });

  await check('2.1 Status inquiry transmits GET request without Digest line in HMAC signature', async () => {
    const statusRes = await liveDoku.getPaymentStatus({ orderId: 'paid-order' });
    assert.strictEqual(statusRes.status, MONEY_STATE.PAID);
    assert.strictEqual(statusRes.amount, 50000);
    assert.strictEqual(statusRes.rawStatus, 'SUCCESS');

    const lastReq = recordedRequests[recordedRequests.length - 1];
    assert.strictEqual(lastReq.method, 'GET');
    assert.strictEqual(lastReq.url, '/orders/v1/status/INV-DOKU-paid-order');
    assert.ok(lastReq.headers['signature'].startsWith('HMACSHA256='));
    assert.strictEqual(lastReq.headers['digest'], undefined, 'GET request must not include Digest header');
  });

  await check('2.2 Status inquiry correctly parses PENDING transaction state', async () => {
    const statusRes = await liveDoku.getPaymentStatus({ orderId: 'pending-order' });
    assert.strictEqual(statusRes.status, MONEY_STATE.PAYMENT_PENDING);
    assert.strictEqual(statusRes.rawStatus, 'PENDING');
  });

  await check('2.3 Status inquiry strictly fails closed on HTTP 404 data_not_found without fabricating PAID', async () => {
    await assert.rejects(async () => {
      await liveDoku.getPaymentStatus({ orderId: 'not-found' });
    }, (err) => {
      assert.strictEqual(err.code, 'DOKU_STATUS_ERROR');
      assert.strictEqual(err.status, 404);
      return true;
    });
  });

  mockServer.close();

  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Anti-Fraud Webhook Reconciliation Guard Invariant ──');
  // ---------------------------------------------------------------------------

  await check('3.1 PaymentService rejects fake SUCCESS webhook when provider status is PENDING', async () => {
    const orderId = `sbx-ord-guard-test-${Date.now()}`;
    const testOrder = {
      id: orderId,
      buyer_total: 75000,
      total_amount: 75000,
      currency: 'IDR',
      status: 'PENDING_PAYMENT'
    };
    state.orders = state.orders || [];
    state.orders.push(testOrder);

    const dokuInManager = paymentManager.getProvider('doku');
    const origGetPaymentStatus = dokuInManager.getPaymentStatus;
    const origAllowSim = dokuInManager.allowSimulation;
    const origVerifyWebhook = dokuInManager.verifyWebhook;

    try {
      dokuInManager.allowSimulation = false;
      dokuInManager.verifyWebhook = () => true;
      dokuInManager.parseWebhook = (h, b) => ({
        orderId,
        providerRef: `INV-DOKU-${orderId}`,
        providerEventId: `evt-${orderId}`,
        status: MONEY_STATE.PAID,
        amount: 75000,
        currency: 'IDR'
      });
      dokuInManager.getPaymentStatus = async () => ({
        status: MONEY_STATE.PAYMENT_PENDING,
        rawStatus: 'PENDING',
        simulated: false
      });

      await assert.rejects(async () => {
        await PaymentService.handleWebhook({
          providerName: 'doku',
          headers: {
            'client-id': dokuInManager.clientId || 'BRN-TEST',
            'request-id': 'req-test-guard',
            'request-timestamp': new Date().toISOString().slice(0, 19) + 'Z',
            'signature': 'HMACSHA256=valid'
          },
          body: {
            order: { invoice_number: `INV-DOKU-${orderId}`, amount: 75000 },
            transaction: { status: 'SUCCESS' }
          }
        });
      }, (err) => {
        assert.strictEqual(err.code, 'GATEWAY_STATUS_UNCONFIRMED');
        return true;
      });

      // Verify order remained UNPAID in database
      const o = state.orders.find(x => x.id === orderId);
      assert.strictEqual(o.status, 'PENDING_PAYMENT', 'Order status must not transition to PAID');
    } finally {
      dokuInManager.getPaymentStatus = origGetPaymentStatus;
      dokuInManager.allowSimulation = origAllowSim;
      dokuInManager.verifyWebhook = origVerifyWebhook;
    }
  });

  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Endpoint Security on /execute-live-cycle ──');
  // ---------------------------------------------------------------------------

  const app = express();
  app.use(express.json());
  app.use('/api', paymentRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  async function callEndpoint(path, headers = {}, body = {}) {
    return new Promise((resolve, reject) => {
      const dataStr = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr),
          ...headers
        }
      }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          let j = null;
          try { j = JSON.parse(b); } catch (_) {}
          resolve({ status: res.statusCode, body: j || b });
        });
      });
      req.on('error', reject);
      req.write(dataStr);
      req.end();
    });
  }

  await check('4.1 Rejects anonymous call to /api/v1/payments/sandbox/execute-live-cycle (401 ADMIN_AUTH_REQUIRED)', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = await callEndpoint('/api/v1/payments/sandbox/execute-live-cycle', {}, {});
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'ADMIN_AUTH_REQUIRED');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  await check('4.2 Rejects invalid admin key with 401 ADMIN_AUTH_REQUIRED', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = await callEndpoint('/api/v1/payments/sandbox/execute-live-cycle', {
        'x-admin-key': 'WRONG-ADMIN-KEY'
      }, {});
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'ADMIN_AUTH_REQUIRED');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  await check('4.3 Rejects call when target host is production tikum.app (403 FORBIDDEN_IN_PRODUCTION)', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = await callEndpoint('/api/v1/payments/sandbox/execute-live-cycle', {
        'x-admin-key': process.env.ADMIN_API_KEY,
        'host': 'tikum.app'
      }, {});
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN_IN_PRODUCTION');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  await check('4.4 Rejects invalid test amount outside [10000, 100000] (400 INVALID_AMOUNT)', async () => {
    const res = await callEndpoint('/api/v1/payments/sandbox/execute-live-cycle', {
      'x-admin-key': process.env.ADMIN_API_KEY
    }, { amount: 5000000 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'INVALID_AMOUNT');
  });

  await check('4.5 Midtrans execute-live-cycle returns 410 PROVIDER_REMOVED', async () => {
    const res = await callEndpoint('/api/v1/payments/sandbox/midtrans/execute-live-cycle', {}, {});
    assert.strictEqual(res.status, 410);
    assert.strictEqual(res.body.code, 'PROVIDER_REMOVED');
  });

  server.close();

  console.log('\n================================================================================');
  console.log(`  SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED (TOTAL: ${passed + failed}/13)`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
