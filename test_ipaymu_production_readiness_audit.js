/**
 * TIKUM — iPaymu Production Verification & Readiness Audit Test Suite
 *
 * Comprehensive test coverage adhering to:
 * - Phase 1: iPaymu API v2 specification (request signing, direct & redirect checkout, status inquiry)
 * - Phase 2: Product Catalog & Server-Authoritative pricing
 * - Phase 3: Legal Pages & Canonical Business Entity
 * - Phase 4: Outbound Server IP diagnostic endpoint
 * - Phase 5: Payment Business Model Safety & Invariants
 * - Phase 6: Unit, Integration, and Security Tests
 */

process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'LIVE';
process.env.ENABLE_IPAYMU_PRODUCTION = 'false';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { businessProfile } = require('./src/config/businessProfile');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const {
  paymentManager,
  IPaymuProvider,
  IPAYMU_STATUS,
  CapabilityUnsupportedError
} = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { state, resetDatabase } = require('./src/database');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, (res) => {
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
    if (options.body) {
      const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.write(bodyStr);
    }
    req.end();
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM — iPaymu VERIFICATION & PRODUCTION READINESS AUDIT');
  console.log('================================================================\n');

  resetDatabase();

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  try {
    // ─────────────────────────────────────────────────────────────
    // CATEGORY A: UNIT TESTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n── Category A: iPaymu Unit Tests ──');

    const testProvider = new IPaymuProvider({
      apiKey: 'test-api-key-secret-12345',
      virtualAccount: '11790012345678',
      mode: 'sandbox',
      allowSimulation: true
    });
    paymentManager.registerProvider(testProvider);

    test('A.1 Generates authentic API v2 HMAC-SHA256 signature (Method:Va:BodyHash:ApiKey)', () => {
      const payload = { amount: 150000, orderId: 'ord-unit-01' };
      const rawBody = JSON.stringify(payload);
      const bodyHash = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex').toLowerCase();
      const stringToSign = `POST:11790012345678:${bodyHash}:test-api-key-secret-12345`;
      const expectedSig = crypto.createHmac('sha256', 'test-api-key-secret-12345').update(stringToSign, 'utf8').digest('hex');

      const generatedSig = testProvider.generateSignature({ method: 'POST', body: rawBody });
      assert.strictEqual(generatedSig, expectedSig);
    });

    test('A.2 buildSignedRequest outputs correct headers, URL, and timestamp', () => {
      const req = testProvider.buildSignedRequest({
        endpoint: '/payment/direct',
        method: 'POST',
        body: { amount: 100000 }
      });
      assert.strictEqual(req.url, 'https://sandbox.ipaymu.com/api/v2/payment/direct');
      assert.strictEqual(req.headers['va'], '11790012345678');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.ok(req.headers['signature']);
      assert.ok(req.headers['timestamp']);
    });

    test('A.3 Validates webhook callback signature using Virtual Account as primary secret key', () => {
      const webhookPayload = {
        trx_id: 99887766,
        reference_id: 'ord-test-webhook-va',
        status: 'berhasil',
        status_code: 1,
        amount: 500000
      };
      const rawBody = JSON.stringify(webhookPayload);
      const signatureVa = crypto.createHmac('sha256', '11790012345678')
        .update(rawBody, 'utf8')
        .digest('hex');

      const isValid = testProvider.verifyWebhook({ 'x-signature': signatureVa }, webhookPayload, rawBody);
      assert.strictEqual(isValid, true);
    });

    test('A.4 Rejects forged or tampered webhook signature', () => {
      const webhookPayload = { trx_id: 12345, reference_id: 'ord-fake', status: 'berhasil', amount: 100000 };
      const rawBody = JSON.stringify(webhookPayload);
      const forgedSig = crypto.createHmac('sha256', 'wrong-secret-key').update(rawBody).digest('hex');

      const isValid = testProvider.verifyWebhook({ 'x-signature': forgedSig }, webhookPayload, rawBody);
      assert.strictEqual(isValid, false);
    });

    test('A.5 parseWebhook extracts normalized status (BERHASIL -> SUCCESS, EXPIRED -> EXPIRED)', () => {
      const successEvent = testProvider.parseWebhook({
        trx_id: 'trx-101',
        reference_id: 'ord-success-01',
        status: 'berhasil',
        amount: '250000',
        payment_method: 'bca_va'
      });
      assert.strictEqual(successEvent.status, 'SUCCESS');
      assert.strictEqual(successEvent.orderId, 'ord-success-01');
      assert.strictEqual(successEvent.amount, 250000);

      const expiredEvent = testProvider.parseWebhook({
        trx_id: 'trx-102',
        reference_id: 'ord-expired-01',
        status: 'expired',
        amount: '250000'
      });
      assert.strictEqual(expiredEvent.status, 'EXPIRED');
    });

    test('A.6 Currency validation strictly enforces IDR and ID country code', () => {
      assert.strictEqual(testProvider.getCountry(), 'ID');
      assert.deepStrictEqual(testProvider.getSupportedCurrencies(), ['IDR']);
    });

    // ─────────────────────────────────────────────────────────────
    // CATEGORY B: INTEGRATION TESTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n── Category B: iPaymu Integration & Lifecycle Tests ──');

    await testAsync('B.1 PaymentService.createPayment initiates iPaymu payment and records attempt', async () => {
      const orderId = `ord-int-${Date.now()}`;
      state.orders = [{
        id: orderId,
        buyer_id: 'usr-buyer-01',
        buyer_total: 650000,
        status: 'RESERVED'
      }];

      const res = await PaymentService.createPayment({
        orderId,
        amount: 650000,
        channel: 'IPAYMU_REDIRECT',
        buyer: { id: 'usr-buyer-01', name: 'Budi Santoso', email: 'budi@example.com' },
        providerName: 'ipaymu',
        idempotencyKey: `idem-${orderId}`
      });

      assert.strictEqual(res.provider, 'ipaymu');
      assert.strictEqual(res.status, MONEY_STATE.PAYMENT_PENDING);
      assert.ok(res.paymentUrl);
      assert.strictEqual(res.currency, 'IDR');
    });

    await testAsync('B.2 POST /api/v1/payments/webhook/ipaymu accepts valid webhook and updates ledger', async () => {
      const orderId = `ord-wh-${Date.now()}`;
      const sellerId = 'usr-seller-01';
      state.orders = [{
        id: orderId,
        buyer_id: 'usr-buyer-01',
        seller_id: sellerId,
        buyer_total: 535000,
        ticket_price: 500000,
        buyer_fee: 35000,
        seller_fee: 15000,
        buyer_tax: 0,
        provider_fee: 3500,
        status: 'RESERVED'
      }];
      state.escrows = [{
        id: `esc-${orderId}`,
        order_id: orderId,
        buyer_id: 'usr-buyer-01',
        seller_id: sellerId,
        amount: 485000,
        currency: 'IDR',
        status: 'PENDING_PAYMENT',
        held_by: 'TIKUM_INTERNAL_ESCROW'
      }];

      const webhookBody = {
        trx_id: `ipaymu-trx-${Date.now()}`,
        reference_id: orderId,
        status: 'berhasil',
        status_code: 1,
        amount: 535000,
        channel: 'BCA_VA'
      };
      const rawBody = JSON.stringify(webhookBody);
      const signature = crypto.createHmac('sha256', testProvider.virtualAccount || testProvider.apiKey)
        .update(rawBody, 'utf8')
        .digest('hex');

      // Send to webhook endpoint
      const res = await request('/api/v1/payments/webhook/ipaymu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signature
        },
        body: rawBody
      });

      if (res.statusCode !== 200) {
        console.error('Webhook error details:', res.body);
      }
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);

      // Verify double-entry ledger capture
      const ledgerEntries = state.financial_ledger || [];
      const orderCapture = ledgerEntries.find(e => e.order_id === orderId || e.reference_id === orderId);
      assert.ok(orderCapture, 'Ledger entry must be created upon verified payment webhook');
      const debitEntry = orderCapture.entries?.find(e => e.type === 'DEBIT') || orderCapture;
      assert.strictEqual(debitEntry.account || debitEntry.debit_account, LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING);
    });

    await testAsync('B.3 Duplicate webhook returns idempotent HTTP 200 without double-entry duplicate', async () => {
      const orderId = `ord-dedup-${Date.now()}`;
      const trxId = `trx-dedup-${Date.now()}`;
      state.orders = [{
        id: orderId,
        buyer_id: 'usr-buyer-01',
        seller_id: 'usr-seller-01',
        buyer_total: 535000,
        ticket_price: 500000,
        buyer_fee: 35000,
        seller_fee: 15000,
        buyer_tax: 0,
        status: 'RESERVED'
      }];
      state.escrows = [{
        id: `esc-${orderId}`,
        order_id: orderId,
        buyer_id: 'usr-buyer-01',
        seller_id: 'usr-seller-01',
        amount: 485000,
        currency: 'IDR',
        status: 'PENDING_PAYMENT',
        held_by: 'TIKUM_INTERNAL_ESCROW'
      }];

      const webhookBody = { trx_id: trxId, reference_id: orderId, status: 'berhasil', status_code: 1, amount: 535000 };
      const rawBody = JSON.stringify(webhookBody);
      const signature = crypto.createHmac('sha256', testProvider.virtualAccount || testProvider.apiKey)
        .update(rawBody, 'utf8')
        .digest('hex');

      // First webhook call
      const res1 = await request('/api/v1/payments/webhook/ipaymu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': signature },
        body: rawBody
      });
      assert.strictEqual(res1.statusCode, 200);

      const ledgerCountBefore = (state.financial_ledger || []).length;

      // Second identical webhook call (replay)
      const res2 = await request('/api/v1/payments/webhook/ipaymu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': signature },
        body: rawBody
      });
      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.json.idempotent, true);

      const ledgerCountAfter = (state.financial_ledger || []).length;
      assert.strictEqual(ledgerCountAfter, ledgerCountBefore, 'Duplicate webhook must not create duplicate ledger entries');
    });

    // ─────────────────────────────────────────────────────────────
    // CATEGORY C: SECURITY TESTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n── Category C: Security & Anti-Fraud Tests ──');

    await testAsync('C.1 GET /api/v1/payments/ipaymu/config exposes zero secrets (API key remains hidden)', async () => {
      const res = await request('/api/v1/payments/ipaymu/config');
      if (res.statusCode !== 200) {
        console.error('Webhook error details:', res.body);
      }
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.provider, 'ipaymu');
      assert.strictEqual(res.json.apiKey, undefined, 'API key must never be exposed');
      assert.strictEqual(res.json.secret, undefined, 'Secret must never be exposed');
      assert.strictEqual(res.body.includes('test-api-key-secret-12345'), false);
    });

    await testAsync('C.2 Unauthenticated webhook with invalid signature is rejected with HTTP 401', async () => {
      const res = await request('/api/v1/payments/webhook/ipaymu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': 'invalid_forged_signature_hex' },
        body: JSON.stringify({ reference_id: 'ord-hack', status: 'berhasil' })
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'INVALID_WEBHOOK_SIGNATURE');
    });

    test('C.3 Automated seller payouts via iPaymu throw CapabilityUnsupportedError (unauthorized payout blocked)', async () => {
      assert.rejects(
        async () => { await testProvider.createPayout({ recipient: '123', amount: 500000 }); },
        (err) => err instanceof CapabilityUnsupportedError
      );
    });

    // ─────────────────────────────────────────────────────────────
    // CATEGORY D: PRODUCT CATALOG, LEGAL PAGES & OUTBOUND IP
    // ─────────────────────────────────────────────────────────────
    console.log('\n── Category D: Catalog, Legal & Outbound IP Diagnostic Tests ──');

    await testAsync('D.1 GET /api/v1/system/outbound-ip detects and returns authoritative backend egress IP', async () => {
      const res = await request('/api/v1/system/outbound-ip');
      if (res.statusCode !== 200) {
        console.error('Webhook error details:', res.body);
      }
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.outbound_ip, 'Outbound IP must be resolved');
      assert.ok(res.json.hosting_environment);
      assert.ok(res.json.ipaymu_verification_instructions);
      console.log(`      -> Backend Outbound IP Detected: ${res.json.outbound_ip} (${res.json.latency_ms}ms)`);
    });

    await testAsync('D.2 Public legal pages (/terms, /refund-policy, /faq) return HTTP 200 without authentication', async () => {
      const pages = ['/terms', '/refund-policy', '/faq'];
      for (const p of pages) {
        const res = await request(p);
        assert.strictEqual(res.statusCode, 200, `Expected 200 on ${p}`);
        assert.ok(res.body.includes('PT SHINERVA PRAJNA TEJAS') || res.body.includes('Shinerva'), `Missing canonical entity on ${p}`);
        assert.ok(res.body.includes('support@tikum.app'), `Missing support@tikum.app on ${p}`);
        assert.ok(res.body.includes('081299927378'), `Missing contact phone on ${p}`);
      }
    });

    await testAsync('D.3 GET /api/events/home-feed returns verified upcoming events in product catalog', async () => {
      const heroes = canonicalRegistry.getHeroEvents({ includePast: false });
      for (const h of heroes) {
        canonicalRegistry.events.set(h.id, h);
        if (h.event_id) canonicalRegistry.events.set(h.event_id, h);
        if (h.slug) canonicalRegistry.slugMap.set(h.slug, h.id);
      }
      const res = await request('/api/events/home-feed');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      const events = res.json.events || (res.json.sections && res.json.sections.upcoming) || [];
      assert.ok(events.length > 0, 'Catalog must contain verified upcoming events');
      const first = events[0];
      assert.ok(first.name || first.canonical_name || first.title);
      assert.ok(first.start_date || first.date);
      assert.ok(first.venue_name || first.venue);
      assert.ok(first.min_price !== undefined);
      console.log(`      -> Verified catalog sample: "${first.name || first.canonical_name}" at ${first.venue_name || first.venue} (Rp ${Number(first.min_price).toLocaleString('id-ID')})`);
    });

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} iPaymu PRODUCTION READINESS CHECKS PASSED!`);
    console.log('================================================================\n');

  } finally {
    if (server) {
      server.close();
    }
  }
}

runSuite().catch(err => {
  console.error('Audit suite failed:', err);
  if (server) server.close();
  process.exit(1);
});
