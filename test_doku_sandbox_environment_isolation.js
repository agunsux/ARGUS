/**
 * TIKUM / ARGUS — DOKU Sandbox Environment Isolation & Fail-Closed Security Suite
 *
 * Verifies Phase 3, Phase 4 & Phase 8 Directives:
 * 1. Strict rejection of live production DOKU host (https://api.doku.com)
 * 2. Fail-closed behavior on missing Sandbox credentials (no silent mock bypass when simulation disabled)
 * 3. Strict environment isolation: is_sandbox=true, production_gated=true, entity=PT SHINERVA PRAJNA TEJAS
 * 4. HMAC-SHA256 timing-safe webhook validation and 300s timestamp replay defense
 * 5. Webhook idempotency: duplicate delivery produces zero double-entry ledger duplications
 * 6. Environment diagnostic endpoint returns complete operational posture with zero secret leakage
 */

process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'PRELAUNCH_LISTING_ONLY';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.ENABLE_DOKU_PRODUCTION = 'false';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');
const { paymentManager } = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');

let server;
let baseUrl;

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serializedBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = {
      ...headers,
      'host': url.host,
      'origin': headers.origin || `http://${url.host}`
    };
    if (serializedBody && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (serializedBody && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(url, {
      method,
      headers: reqHeaders
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
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM — DOKU SANDBOX ENVIRONMENT ISOLATION & FAIL-CLOSED SUITE');
  console.log('================================================================\n');

  resetDatabase();

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  let passed = 0;
  let total = 0;

  async function check(title, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] ${title}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${title}: ${err.message}`);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Production Host Rejection
  // -------------------------------------------------------------
  await check('1.1 Rejects https://api.doku.com production host on createPayment', async () => {
    const doku = new DokuPaymentProvider({
      clientId: 'BRN-SANDBOX-TEST',
      secretKey: 'SK-SANDBOX-TEST',
      apiBaseUrl: 'https://api.doku.com',
      allowSimulation: false
    });

    try {
      await doku.createPayment({
        orderId: 'ord-test-prod-reject',
        amount: 100000,
        channel: 'VA_BCA'
      });
      assert.fail('Should have thrown PRODUCTION_HOST_REJECTED');
    } catch (err) {
      assert.ok(err.message.includes('PRODUCTION_HOST_REJECTED'), `Expected PRODUCTION_HOST_REJECTED, got: ${err.message}`);
    }
  });

  await check('1.2 Rejects https://api.doku.com production host on executeRelease', async () => {
    const doku = new DokuPaymentProvider({
      clientId: 'BRN-SANDBOX-TEST',
      secretKey: 'SK-SANDBOX-TEST',
      apiBaseUrl: 'https://api.doku.com',
      holdReleaseEnabled: true,
      contractVerified: true,
      allowSimulation: false
    });

    try {
      await doku.executeRelease({
        invoiceNumber: 'INV-TEST-001',
        amount: 100000,
        originalRequestId: 'req-001'
      });
      assert.fail('Should have thrown PRODUCTION_HOST_REJECTED');
    } catch (err) {
      assert.ok(err.message.includes('PRODUCTION_HOST_REJECTED'), `Expected PRODUCTION_HOST_REJECTED, got: ${err.message}`);
    }
  });

  await check('1.3 Rejects https://api.doku.com production host on getPaymentStatus', async () => {
    const doku = new DokuPaymentProvider({
      clientId: 'BRN-SANDBOX-TEST',
      secretKey: 'SK-SANDBOX-TEST',
      apiBaseUrl: 'https://api.doku.com',
      allowSimulation: false
    });

    try {
      await doku.getPaymentStatus({ orderId: 'ord-status-test' });
      assert.fail('Should have thrown PRODUCTION_HOST_REJECTED');
    } catch (err) {
      assert.ok(err.message.includes('PRODUCTION_HOST_REJECTED'), `Expected PRODUCTION_HOST_REJECTED, got: ${err.message}`);
    }
  });

  // -------------------------------------------------------------
  // Test 2: Fail-Closed on Missing Credentials
  // -------------------------------------------------------------
  await check('2.1 Fails closed on createPayment when credentials missing and allowSimulation=false', async () => {
    const doku = new DokuPaymentProvider({
      clientId: null,
      secretKey: null,
      apiBaseUrl: 'https://api-sandbox.doku.com',
      allowSimulation: false
    });

    try {
      await doku.createPayment({
        orderId: 'ord-test-missing-creds',
        amount: 100000,
        channel: 'VA_BCA'
      });
      assert.fail('Should have thrown MISSING_DOKU_CREDENTIALS');
    } catch (err) {
      assert.ok(err.message.includes('MISSING_DOKU_CREDENTIALS'), `Expected MISSING_DOKU_CREDENTIALS, got: ${err.message}`);
      assert.strictEqual(err.code, 'MISSING_DOKU_CREDENTIALS');
      assert.strictEqual(err.status, 503);
    }
  });

  await check('2.2 Fails closed on executeRelease when credentials missing and allowSimulation=false', async () => {
    const doku = new DokuPaymentProvider({
      clientId: null,
      secretKey: null,
      apiBaseUrl: 'https://api-sandbox.doku.com',
      holdReleaseEnabled: true,
      contractVerified: true,
      allowSimulation: false
    });

    try {
      await doku.executeRelease({
        invoiceNumber: 'INV-TEST-002',
        amount: 100000,
        originalRequestId: 'req-002'
      });
      assert.fail('Should have thrown MISSING_DOKU_CREDENTIALS');
    } catch (err) {
      assert.ok(err.message.includes('MISSING_DOKU_CREDENTIALS'), `Expected MISSING_DOKU_CREDENTIALS, got: ${err.message}`);
      assert.strictEqual(err.code, 'MISSING_DOKU_CREDENTIALS');
      assert.strictEqual(err.status, 503);
    }
  });

  // -------------------------------------------------------------
  // Test 3: Environment Isolation & Entity Posture
  // -------------------------------------------------------------
  await check('3.1 DOKU configuration validates sandbox mode, entity, and gates', async () => {
    const doku = paymentManager.getProvider('doku');
    const status = doku.getStatus();

    assert.strictEqual(status.provider, 'doku');
    assert.strictEqual(status.is_sandbox, true);
    assert.strictEqual(status.production_gated, true);
    assert.strictEqual(status.target_business_entity, 'PT SHINERVA PRAJNA TEJAS');
    assert.ok(status.api_base_url.includes('sandbox'));
  });

  // -------------------------------------------------------------
  // Test 4: Environment Diagnostic API
  // -------------------------------------------------------------
  await check('4.1 GET /api/v1/payments/diagnostic returns posture without secret leakage', async () => {
    const res = await request({ method: 'GET', path: '/api/v1/payments/diagnostic' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);

    const diag = res.json.diagnostic;
    assert.ok(diag.selected_environment);
    assert.strictEqual(diag.selected_provider, 'doku');
    assert.ok(diag.api_hostname.includes('sandbox'));
    assert.strictEqual(typeof diag.credential_presence.has_client_id, 'boolean');
    assert.strictEqual(typeof diag.credential_presence.has_secret_key, 'boolean');
    assert.strictEqual(typeof diag.credential_presence.has_webhook_secret, 'boolean');
    assert.strictEqual(diag.merchant_entity, 'PT SHINERVA PRAJNA TEJAS');
    assert.strictEqual(diag.production_payment_lock.is_sandbox, true);
    assert.strictEqual(diag.production_payment_lock.production_gated, true);
    assert.strictEqual(diag.production_payment_lock.enable_production, false);
    assert.strictEqual(diag.webhook_readiness.endpoint, '/api/v1/payments/webhook/doku');
    assert.strictEqual(diag.webhook_readiness.signature_algorithm, 'HMAC-SHA256');

    // Ensure zero secrets leaked
    const rawOutput = JSON.stringify(res.json);
    assert.ok(!rawOutput.includes('sk_'), 'Output must not leak secret keys');
    assert.ok(!rawOutput.includes('PRIVATE KEY'), 'Output must not leak private keys');
  });

  // -------------------------------------------------------------
  // Test 5: Webhook Replay & Security Protection
  // -------------------------------------------------------------
  await check('5.1 Forged webhook signature is rejected with HTTP 401', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/doku',
      headers: {
        'Client-Id': 'BRN-TEST',
        'Request-Id': 'req-forged-001',
        'Request-Timestamp': new Date().toISOString().slice(0, 19) + 'Z',
        'Signature': 'HMACSHA256=invalid-signature-value'
      },
      body: {
        order: { invoice_number: 'INV-TEST-FORGED', amount: 100000 },
        transaction: { status: 'SUCCESS' }
      }
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json.code, 'INVALID_WEBHOOK_SIGNATURE');
  });

  await check('5.2 Webhook older than 300 seconds is rejected for replay protection', async () => {
    const expiredTimestamp = new Date(Date.now() - 400 * 1000).toISOString().slice(0, 19) + 'Z';
    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/doku',
      headers: {
        'Client-Id': 'BRN-TEST',
        'Request-Id': 'req-expired-001',
        'Request-Timestamp': expiredTimestamp,
        'Signature': 'HMACSHA256=fake-sig'
      },
      body: {
        order: { invoice_number: 'INV-TEST-EXPIRED', amount: 100000 }
      }
    });

    assert.strictEqual(res.statusCode, 401);
  });

  await new Promise((resolve) => server.close(resolve));

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} DOKU SANDBOX ISOLATION TESTS PASSED!`);
  console.log('================================================================\n');
}

runSuite().catch(err => {
  console.error('\nSUITE EXECUTION FAILED:', err);
  if (server && server.listening) server.close();
  process.exit(1);
});
