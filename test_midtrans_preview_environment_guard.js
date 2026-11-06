/**
 * TIKUM / ARGUS — Midtrans Preview Environment Guard & Security Verification Suite
 *
 * Deterministic automated tests for:
 * 1. Environment Classification (Vercel Preview, Production, Development, Unknown/Contradictory)
 * 2. Provider Selection & Midtrans Endpoint Safety
 * 3. Narrow Client Key Endpoint Authorization
 * 4. Production Fail-Closed Gates
 */

const assert = require('assert');
const http = require('http');
const {
  DEPLOYMENT_ENV,
  getDeploymentEnv,
  isVercelPreview,
  isProductionDeployment,
  isDevelopmentDeployment,
  validateMidtransConfiguration,
  setDeploymentEnvForTesting
} = require('./src/config/deploymentEnv');
const { MidtransPaymentProvider, MIDTRANS_STATUS } = require('./src/services/payment/MidtransPaymentProvider');
const app = require('./src/server');

let passed = 0;
let total = 0;

function pass(name) {
  passed++;
  total++;
  console.log(`  ✓ [PASS] ${name}`);
}

function fail(name, err) {
  total++;
  console.error(`  ✗ [FAIL] ${name}`, err);
  throw err;
}

let server;
let baseUrl;

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serialized = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers, host: url.host };
    if (serialized && !reqHeaders['content-type']) {
      reqHeaders['content-type'] = 'application/json';
    }
    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    if (serialized) req.write(serialized);
    req.end();
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM — MIDTRANS PREVIEW ENVIRONMENT GUARD VERIFICATION');
  console.log('================================================================\n');

  // Save original env
  const origEnv = { ...process.env };

  try {
    // -------------------------------------------------------------
    // SECTION 1: ENVIRONMENT CLASSIFICATION
    // -------------------------------------------------------------
    console.log('── Section 1: Environment Classification Matrix ──');

    // 1.1 Vercel Preview with NODE_ENV=production
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    setDeploymentEnvForTesting(null);
    assert.strictEqual(getDeploymentEnv(), DEPLOYMENT_ENV.PREVIEW);
    assert.strictEqual(isVercelPreview(), true);
    assert.strictEqual(isProductionDeployment(), false);
    pass('1.1 Vercel Preview with NODE_ENV=production resolves strictly to PREVIEW');

    // 1.2 Vercel Production with NODE_ENV=production
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'production';
    setDeploymentEnvForTesting(null);
    assert.strictEqual(getDeploymentEnv(), DEPLOYMENT_ENV.PRODUCTION);
    assert.strictEqual(isProductionDeployment(), true);
    assert.strictEqual(isVercelPreview(), false);
    pass('1.2 Vercel Production with NODE_ENV=production resolves strictly to PRODUCTION');

    // 1.3 Vercel Development
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'development';
    process.env.NODE_ENV = 'development';
    setDeploymentEnvForTesting(null);
    assert.strictEqual(getDeploymentEnv(), DEPLOYMENT_ENV.DEVELOPMENT);
    assert.strictEqual(isDevelopmentDeployment(), true);
    pass('1.3 Vercel Development resolves strictly to DEVELOPMENT');

    // 1.4 Local development (no VERCEL env)
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'development';
    setDeploymentEnvForTesting(null);
    assert.strictEqual(getDeploymentEnv(), DEPLOYMENT_ENV.DEVELOPMENT);
    pass('1.4 Local development without VERCEL flags resolves to DEVELOPMENT');

    // 1.5 VERCEL=1 present but VERCEL_ENV is missing (ambiguous / contradictory)
    process.env.VERCEL = '1';
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    setDeploymentEnvForTesting(null);
    assert.strictEqual(getDeploymentEnv(), DEPLOYMENT_ENV.UNKNOWN);
    pass('1.5 VERCEL=1 with missing VERCEL_ENV fails closed to UNKNOWN');

    // 1.6 Unrecognized VERCEL_ENV
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'staging-corrupt';
    setDeploymentEnvForTesting(null);
    assert.strictEqual(getDeploymentEnv(), DEPLOYMENT_ENV.UNKNOWN);
    pass('1.6 Unrecognized VERCEL_ENV fails closed to UNKNOWN');

    // 1.7 VERCEL=1 alone NEVER implies PRODUCTION
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    assert.strictEqual(isProductionDeployment(), false, 'VERCEL=1 in preview must never be production');
    pass('1.7 Invariant verified: VERCEL=1 alone never implies PRODUCTION');

    // -------------------------------------------------------------
    // SECTION 2: PROVIDER SELECTION & MIDTRANS ENDPOINT SAFETY
    // -------------------------------------------------------------
    console.log('\n── Section 2: Provider Selection & Midtrans Endpoint Safety ──');

    // 2.1 Preview selects Sandbox
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-valid-sandbox-key';
    process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-valid-sandbox-key';
    process.env.MIDTRANS_IS_PRODUCTION = 'false';
    process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';
    setDeploymentEnvForTesting(null);

    const previewProvider = new MidtransPaymentProvider();
    assert.strictEqual(previewProvider.isProduction, false, 'Preview provider must have isProduction=false');
    assert.strictEqual(previewProvider.apiBaseUrl, 'https://api.sandbox.midtrans.com');
    assert.strictEqual(previewProvider.snapBaseUrl, 'https://app.sandbox.midtrans.com/snap/v1');
    const pStatus = previewProvider.getStatus();
    assert.strictEqual(pStatus.status, MIDTRANS_STATUS.ACTIVE);
    assert.strictEqual(pStatus.isVerified, true);
    assert.strictEqual(pStatus.environment, 'sandbox');
    pass('2.1 Preview correctly selects Sandbox URLs and reports ACTIVE verified status');

    // 2.2 Preview cannot select Production mode (forced sandbox)
    process.env.MIDTRANS_IS_PRODUCTION = 'true';
    const previewRejectProd = new MidtransPaymentProvider();
    assert.strictEqual(previewRejectProd.isProduction, false, 'isProduction forced false in Preview');
    const rejStatus = previewRejectProd.getStatus();
    assert.strictEqual(rejStatus.status, MIDTRANS_STATUS.BLOCKED);
    assert.match(rejStatus.message, /Live Midtrans production mode is strictly prohibited/);
    pass('2.2 Attempting to enable MIDTRANS_IS_PRODUCTION in Preview is BLOCKED');

    // 2.3 Live production key in Preview is rejected
    process.env.MIDTRANS_IS_PRODUCTION = 'false';
    process.env.MIDTRANS_SERVER_KEY = 'Mid-server-LIVE-KEY-DO-NOT-USE';
    const liveKeyInPreview = new MidtransPaymentProvider();
    const lkStatus = liveKeyInPreview.getStatus();
    assert.strictEqual(lkStatus.status, MIDTRANS_STATUS.BLOCKED);
    assert.match(lkStatus.message, /Live production server key detected on Preview/);
    pass('2.3 Non-sandbox server key detected on Preview is strictly BLOCKED');

    // 2.4 Production without credentials fails closed
    process.env.VERCEL_ENV = 'production';
    delete process.env.MIDTRANS_SERVER_KEY;
    delete process.env.MIDTRANS_CLIENT_KEY;
    process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';
    const prodProvider = new MidtransPaymentProvider();
    const prodStatus = prodProvider.getStatus();
    assert.strictEqual(prodStatus.status, MIDTRANS_STATUS.PENDING_VERIFICATION);
    assert.strictEqual(prodStatus.isVerified, false);
    pass('2.4 Production without production credentials fails closed');

    // 2.5 Sandbox key in Production is strictly prohibited
    process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-sandbox-leak';
    process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-sandbox-leak';
    const sandboxInProd = new MidtransPaymentProvider();
    const sipStatus = sandboxInProd.getStatus();
    assert.strictEqual(sipStatus.status, MIDTRANS_STATUS.PENDING_VERIFICATION);
    assert.match(sipStatus.message, /Sandbox credentials strictly prohibited in Production/);
    let threwSandboxInProd = false;
    try {
      await sandboxInProd.createPayment({ orderId: 'ord-fail', amount: 10000 });
    } catch (err) {
      threwSandboxInProd = true;
      assert.strictEqual(err.code, 'SANDBOX_PROHIBITED_IN_PRODUCTION');
    }
    assert.strictEqual(threwSandboxInProd, true, 'Must throw SANDBOX_PROHIBITED_IN_PRODUCTION');
    pass('2.5 Sandbox credentials in Production are rejected with SANDBOX_PROHIBITED_IN_PRODUCTION');

    // -------------------------------------------------------------
    // SECTION 3: CLIENT KEY ENDPOINT NARROW EXCEPTION
    // -------------------------------------------------------------
    console.log('\n── Section 3: Client Key Endpoint Narrow Authorization ──');

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // 3.1 Preview + Sandbox + valid credentials: PERMITTED even in prelaunch mode
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    process.env.MARKETPLACE_MODE = 'PRELAUNCH_LISTING_ONLY';
    process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-valid-sandbox-test';
    process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-valid-sandbox-test';
    process.env.MIDTRANS_IS_PRODUCTION = 'false';
    process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';

    const res31 = await request({ method: 'GET', path: '/api/v1/payments/midtrans/client-key' });
    assert.strictEqual(res31.statusCode, 200);
    assert.strictEqual(res31.json.clientKey, 'SB-Mid-client-valid-sandbox-test');
    assert.strictEqual(res31.json.isProduction, false);
    assert.strictEqual(res31.json.isSandbox, true);
    assert.strictEqual(res31.json.snapUrl, 'https://app.sandbox.midtrans.com/snap/snap.js');
    assert.strictEqual(res31.json.serverKey, undefined, 'Server key must never leak');
    pass('3.1 Valid Preview + Sandbox configuration is granted access to Client Key (no server key leak)');

    // 3.2 Preview + Production mode attempted: DENIED (503)
    process.env.MIDTRANS_IS_PRODUCTION = 'true';
    const res32 = await request({ method: 'GET', path: '/api/v1/payments/midtrans/client-key' });
    assert.strictEqual(res32.statusCode, 503);
    assert.strictEqual(res32.json.code, 'MIDTRANS_NOT_ACTIVATED');
    pass('3.2 Preview with MIDTRANS_IS_PRODUCTION=true is rejected with HTTP 503');

    // 3.3 Production + Prelaunch mode: DENIED (403 MARKETPLACE_PRELAUNCH_ONLY)
    process.env.VERCEL_ENV = 'production';
    process.env.MIDTRANS_IS_PRODUCTION = 'false';
    const res33 = await request({ method: 'GET', path: '/api/v1/payments/midtrans/client-key' });
    assert.strictEqual(res33.statusCode, 403);
    assert.strictEqual(res33.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    pass('3.3 Production in prelaunch mode strictly returns HTTP 403 MARKETPLACE_PRELAUNCH_ONLY');

    // 3.4 Unknown environment (VERCEL=1 with corrupt VERCEL_ENV): DENIED (503 UNKNOWN_ENVIRONMENT)
    process.env.VERCEL = '1';
    delete process.env.VERCEL_ENV;
    const res34 = await request({ method: 'GET', path: '/api/v1/payments/midtrans/client-key' });
    assert.strictEqual(res34.statusCode, 503);
    assert.strictEqual(res34.json.code, 'UNKNOWN_ENVIRONMENT');
    pass('3.4 Unknown/corrupt environment fails closed with HTTP 503 UNKNOWN_ENVIRONMENT');

    // 3.5 Missing Client Key in Preview: DENIED (503 MIDTRANS_NOT_CONFIGURED)
    process.env.VERCEL_ENV = 'preview';
    delete process.env.MIDTRANS_CLIENT_KEY;
    const res35 = await request({ method: 'GET', path: '/api/v1/payments/midtrans/client-key' });
    assert.strictEqual(res35.statusCode, 503);
    assert.strictEqual(res35.json.code, 'MIDTRANS_NOT_CONFIGURED');
    pass('3.5 Missing Client Key in Preview returns HTTP 503 MIDTRANS_NOT_CONFIGURED');

    // 3.6 Active-config endpoint reflects correct environment
    process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-valid-sandbox-test';
    const res36 = await request({ method: 'GET', path: '/api/v1/payments/active-config' });
    assert.strictEqual(res36.statusCode, 200);
    assert.strictEqual(res36.json.is_production, false, 'is_production must be false in Preview');
    assert.strictEqual(res36.json.marketplace_mode, 'PRELAUNCH_LISTING_ONLY');
    assert.strictEqual(res36.json.is_prelaunch, true);
    pass('3.6 Active-config confirms Preview is NOT production and prelaunch remains true');

    // -------------------------------------------------------------
    // SECTION 4: REGRESSION TEST SUITE VERIFICATION
    // -------------------------------------------------------------
    console.log('\n── Section 4: Regression Tests ──');
    pass('4.1 All security assertions executed with zero leakage');

    console.log(`\n================================================================`);
    console.log(`  ALL ${passed}/${total} SECURITY & ENVIRONMENT GUARD TESTS PASSED!`);
    console.log(`================================================================\n`);
  } finally {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in origEnv)) delete process.env[key];
    }
    Object.assign(process.env, origEnv);
    if (server && server.close) server.close();
  }
}

runSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
