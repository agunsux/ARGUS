/**
 * TIKUM — Payment Gateway Environment Governance & iPaymu Freeze Verification Suite
 */

const assert = require('assert');
const express = require('express');
const http = require('http');
const {
  DEPLOYMENT_ENV,
  getDeploymentEnv,
  setDeploymentEnvForTesting,
  validateDokuConfiguration
} = require('./src/config/deploymentEnv');
const { paymentManager, DokuPaymentProvider } = require('./src/services/payment/index');
const { PaymentRoutingService } = require('./src/services/payment/PaymentRoutingService');
const paymentRouter = require('./src/api/paymentRouter');
const { state } = require('./src/database');

function makeRequest(server, options, postData) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port: port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (postData) {
      const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(dataStr);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const body = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runPaymentGovernanceSuite() {
  console.log('======================================================================');
  console.log('  TIKUM — PAYMENT ENVIRONMENT GOVERNANCE & IPAYMU FREEZE SUITE');
  console.log('======================================================================\n');

  // TEST 1: Vercel Preview Isolation — DOKU Sandbox Mandate
  console.log('[TEST 1] Vercel Preview Isolation: DOKU Sandbox Mandate...');
  setDeploymentEnvForTesting(DEPLOYMENT_ENV.PREVIEW);

  const previewValid = validateDokuConfiguration({
    clientId: 'MALLID-SB-TEST',
    secretKey: 'SK-SB-TEST',
    apiBaseUrl: 'https://api-sandbox.doku.com',
    env: 'sandbox'
  });
  assert.strictEqual(previewValid.allowed, true, 'Preview should permit DOKU Sandbox');
  assert.strictEqual(previewValid.isSandbox, true);

  const previewProdRejected = validateDokuConfiguration({
    clientId: 'MALLID-PROD-TEST',
    secretKey: 'SK-PROD-TEST',
    apiBaseUrl: 'https://api.doku.com',
    env: 'production'
  });
  assert.strictEqual(previewProdRejected.allowed, false, 'Preview must strictly reject Production endpoint & env');
  assert(previewProdRejected.reason.includes('prohibited on Preview'), 'Reason should explain preview prohibition');
  console.log('  ✓ Preview strictly permits Sandbox and rejects Production.');

  // TEST 2: Vercel Production Isolation — DOKU Production Mandate
  console.log('[TEST 2] Vercel Production Isolation: DOKU Production Mandate...');
  setDeploymentEnvForTesting(DEPLOYMENT_ENV.PRODUCTION);

  const prodSandboxRejected = validateDokuConfiguration({
    clientId: 'MALLID-SB-TEST',
    secretKey: 'SK-SB-TEST',
    apiBaseUrl: 'https://api-sandbox.doku.com',
    env: 'sandbox'
  });
  assert.strictEqual(prodSandboxRejected.allowed, false, 'Production must strictly reject Sandbox credentials/URL');

  // When ENABLE_DOKU_PRODUCTION is false, production must gate payments fail-closed
  const origEnable = process.env.ENABLE_DOKU_PRODUCTION;
  process.env.ENABLE_DOKU_PRODUCTION = 'false';
  const prodGated = validateDokuConfiguration({
    clientId: 'MALLID-PROD-TEST',
    secretKey: 'SK-PROD-TEST',
    apiBaseUrl: 'https://api.doku.com',
    env: 'production'
  });
  assert.strictEqual(prodGated.allowed, false, 'Production must gate payments when ENABLE_DOKU_PRODUCTION is false');
  process.env.ENABLE_DOKU_PRODUCTION = origEnable;
  console.log('  ✓ Production strictly rejects Sandbox and gates payments when flag is false.');

  // TEST 3: Ambiguous / Unknown Environment Fails Closed
  console.log('[TEST 3] Ambiguous / Unknown Environment Gating...');
  setDeploymentEnvForTesting(DEPLOYMENT_ENV.UNKNOWN);
  const unknownGated = validateDokuConfiguration({
    clientId: 'MALLID-TEST',
    secretKey: 'SK-TEST',
    apiBaseUrl: 'https://api-sandbox.doku.com',
    env: 'sandbox'
  });
  assert.strictEqual(unknownGated.allowed, false, 'Unknown environment must fail closed');
  console.log('  ✓ Ambiguous deployment environment fails closed.');

  // TEST 4: Mixed Credential Families Rejected
  console.log('[TEST 4] Mixed Credential Families Detection...');
  setDeploymentEnvForTesting(DEPLOYMENT_ENV.DEVELOPMENT);
  const mixedFam1 = validateDokuConfiguration({
    clientId: 'MALLID-TEST',
    secretKey: 'SK-TEST',
    apiBaseUrl: 'https://api.doku.com',
    env: 'sandbox'
  });
  assert.strictEqual(mixedFam1.allowed, false);
  assert(mixedFam1.reason.includes('CREDENTIAL_FAMILY_MIXED'));

  const mixedFam2 = validateDokuConfiguration({
    clientId: 'MALLID-TEST',
    secretKey: 'SK-TEST',
    apiBaseUrl: 'https://api-sandbox.doku.com',
    env: 'production'
  });
  assert.strictEqual(mixedFam2.allowed, false);
  assert(mixedFam2.reason.includes('CREDENTIAL_FAMILY_MIXED'));
  console.log('  ✓ Mixed credential families and endpoints rejected.');

  // Reset testing environment override
  setDeploymentEnvForTesting(null);

  // TEST 5: iPaymu Frozen — Default Provider Guard
  console.log('[TEST 5] iPaymu Frozen: Default Provider Guard...');
  assert.notStrictEqual(paymentManager.defaultProvider, 'ipaymu', 'Default provider must never be ipaymu');
  assert.throws(() => {
    paymentManager.setDefaultProvider('ipaymu');
  }, /frozen provider 'ipaymu'/i, 'setDefaultProvider must throw when attempting to set ipaymu');
  console.log('  ✓ iPaymu cannot be set as default provider.');

  // TEST 6: iPaymu Frozen — Available Payment Methods Classification
  console.log('[TEST 6] iPaymu Frozen: Available Payment Methods Classification...');
  const methods = paymentManager.getAvailablePaymentMethods();
  const ipaymuMethod = methods.find(m => m.provider === 'ipaymu');
  assert(ipaymuMethod, 'iPaymu must exist in methods list for historical awareness');
  assert.strictEqual(ipaymuMethod.status, 'FROZEN', 'iPaymu status must be FROZEN');
  assert.strictEqual(ipaymuMethod.is_frozen, true, 'is_frozen flag must be true');
  assert.strictEqual(ipaymuMethod.channels.length, 0, 'Frozen provider must expose 0 active channels');
  console.log('  ✓ iPaymu is explicitly classified as FROZEN with zero active channels.');

  // TEST 7: iPaymu Frozen — PaymentRoutingService Selection & Fallback Block
  console.log('[TEST 7] iPaymu Frozen: PaymentRoutingService Selection & Fallback Block...');
  assert.throws(() => {
    PaymentRoutingService.resolveProvider({ countryCode: 'ID', currency: 'IDR', channel: 'IPAYMU_VA' });
  }, (err) => {
    return err.code === 'PAYMENT_PROVIDER_FROZEN';
  }, 'Resolving ipaymu channel must throw PAYMENT_PROVIDER_FROZEN');

  const resolvedBackup = PaymentRoutingService.resolveProvider({ countryCode: 'ID', currency: 'IDR', tier: 'BACKUP_1' });
  assert.notStrictEqual(resolvedBackup.providerName, 'ipaymu', 'BACKUP_1 must never resolve to frozen ipaymu');
  assert.strictEqual(resolvedBackup.providerName, 'doku', 'BACKUP_1 safely falls back to doku');

  // Verify resolveResilientChannelOrFallback does not fall back to ipaymu
  PaymentRoutingService.setKillSwitch('doku', true);
  PaymentRoutingService.setKillSwitch('doku_direct', true);
  PaymentRoutingService.setKillSwitch('doku_checkout', true);
  assert.throws(() => {
    PaymentRoutingService.resolveResilientChannelOrFallback({ channel: 'VA_BCA' });
  }, /All configured active payment providers/i, 'When DOKU is down, must NOT fall back to iPaymu');
  PaymentRoutingService.setKillSwitch('doku', false);
  PaymentRoutingService.setKillSwitch('doku_direct', false);
  PaymentRoutingService.setKillSwitch('doku_checkout', false);
  console.log('  ✓ PaymentRoutingService strictly blocks iPaymu selection and fallback.');

  // TEST 8: iPaymu Frozen — HTTP Endpoints Rejection
  console.log('[TEST 8] iPaymu Frozen: HTTP Endpoints Rejection...');
  const app = express();
  app.use(express.json());
  app.use('/api', paymentRouter);
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, '127.0.0.1', res));

  const { setMarketplaceModeForTesting, setPaymentGatewayFrozenForTesting } = require('./src/config/marketplaceMode');
  setMarketplaceModeForTesting('LIVE');
  setPaymentGatewayFrozenForTesting(false);

  try {
    // Test /api/v1/payments/ipaymu/config
    const configRes = await makeRequest(server, { path: '/api/v1/payments/ipaymu/config', method: 'GET' });
    assert.strictEqual(configRes.status, 200);
    assert.strictEqual(configRes.body.status, 'FROZEN');
    assert.strictEqual(configRes.body.is_available, false);
    assert.strictEqual(configRes.body.is_frozen, true);

    // Seed a test order for /api/v1/payments/create test
    if (!state.orders) state.orders = [];
    const testOrderId = 'order-governance-test-' + Date.now();
    state.orders.push({
      id: testOrderId,
      buyer_id: 'buyer-gov-test',
      buyer_total: 500000,
      status: 'PAYMENT_PENDING'
    });

    const createRes = await makeRequest(server, {
      path: '/api/v1/payments/create',
      method: 'POST'
    }, {
      orderId: testOrderId,
      providerName: 'ipaymu',
      channel: 'IPAYMU_VA'
    });
    assert.strictEqual(createRes.status, 400);
    assert.strictEqual(createRes.body.code, 'PAYMENT_PROVIDER_FROZEN');
    assert(createRes.body.error.includes('FROZEN'), 'Error must specify iPaymu is frozen');
    console.log('  ✓ POST /api/v1/payments/create with ipaymu returns 400 PAYMENT_PROVIDER_FROZEN.');
  } finally {
    setMarketplaceModeForTesting(null);
    setPaymentGatewayFrozenForTesting(null);
    await new Promise(res => server.close(res));
  }

  // TEST 9: Historical iPaymu Provider Invariants
  console.log('[TEST 9] Historical iPaymu Provider Invariants...');
  const ipaymu = paymentManager.getProvider('ipaymu');
  assert(ipaymu, 'Historical iPaymu provider instance must be accessible');
  assert.strictEqual(typeof ipaymu.verifyAndParseWebhook, 'function', 'Webhook parsing must remain intact');
  assert.strictEqual(typeof ipaymu.getPaymentStatus, 'function', 'Status inquiry must remain intact');
  console.log('  ✓ Historical iPaymu inspection and webhook methods preserved.');

  console.log('\n======================================================================');
  console.log('  ALL PAYMENT GOVERNANCE & IPAYMU FREEZE TESTS PASSED! (100% OK)');
  console.log('======================================================================\n');
}

runPaymentGovernanceSuite().catch(err => {
  console.error('\n❌ PAYMENT GOVERNANCE TEST FAILED:', err);
  process.exit(1);
});
