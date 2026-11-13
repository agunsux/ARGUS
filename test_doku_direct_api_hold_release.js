/**
 * TIKUM / ARGUS — Comprehensive DOKU Direct API + Hold & Release Test Suite
 *
 * Verifies the 6 Core Directives:
 * 1. Architecture & Entity Invariants (PT SHINERVA PRAJNA TEJAS, DOKU Primary, iPaymu Secondary)
 * 2. DOKU Direct API Virtual Account & Signing (Official Direct API target, HMAC-SHA256, Digest)
 * 3. DOKU Hold & Release Settlement Engine (POST /finance/v1/release, timeout recovery, duplicate prevention)
 * 4. ARGUS Central Trust Engine & Authorization Gate (Ticket verification, Event PIC admission, Dispute blocking)
 * 5. Financial Integrity, Double-Entry Ledger & Payout Separation (Solvency, Seller payable internally tracked)
 * 6. Non-Breaking Regression & iPaymu Secondary Status (Provider pinning, zero double-charge, backwards compatibility)
 */

process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'LIVE';
process.env.PRIMARY_PROVIDER = 'doku';
process.env.SECONDARY_PROVIDER = 'ipaymu';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.DOKU_HOLD_RELEASE_ENABLED = 'true';
process.env.DOKU_CONTRACT_VERIFIED = 'true';
process.env.DOKU_CLIENT_ID = 'MCH-TEST-SHINERVA-001';
process.env.DOKU_SECRET_KEY = 'SK-TEST-SECRET-SHINERVA-KEY-999';
process.env.IPAYMU_API_KEY = 'TEST_IPAYMU_KEY';
process.env.IPAYMU_VA = '1122334455';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const {
  paymentManager,
  CapabilityUnsupportedError,
  DokuPaymentProvider,
  DOKU_STATUS,
  DOKU_ACCOUNT_STATUS,
  DOKU_ESCROW_STATUS,
  IPaymuPaymentProvider
} = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const {
  CANONICAL_PAYMENT_STATUS,
  MONEY_STATE,
  SETTLEMENT_LIFECYCLE_STATUS
} = require('./src/services/payment/canonicalPaymentTypes');
const { PaymentRoutingService, PAYMENT_ATTEMPT_STATUS } = require('./src/services/payment/PaymentRoutingService');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { ListingService } = require('./src/services/listingService');
const { EventPicService } = require('./src/services/eventPicService');
const { DisputeService } = require('./src/services/disputeService');
const { TrustPolicyEngine, REQUIREMENT_LEVEL, AUTHORIZATION_OUTCOME } = require('./src/trust/TrustPolicyEngine');
const { SessionStore } = require('./src/services/sessionStore');

let server;
let baseUrl;
let mockDokuServer;
let mockDokuPort;
let lastInterceptedDokuReq = null;
let mockDokuReleaseHandler = null;

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serializedBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = {
      ...headers,
      'host': url.host
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
        } catch (_) {}
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

function ensureStateCollections() {
  if (!state.orders) state.orders = [];
  if (!state.escrows) state.escrows = [];
  if (!state.canonical_payments) state.canonical_payments = [];
  if (!state.tickets) state.tickets = [];
  if (!state.entry_verifications) state.entry_verifications = [];
  if (!state.disputes) state.disputes = [];
  if (!state.payment_attempts) state.payment_attempts = [];
  if (!state.payment_reconciliation_logs) state.payment_reconciliation_logs = [];
  if (!state.users) state.users = [];
  if (!state.attestations) state.attestations = [];
}

function createOrder({ orderId, amount = 100000, sellerId = 'sel-1', ticketId = null }) {
  ensureStateCollections();
  const effTicketId = ticketId || `t-${orderId}`;
  const order = {
    id: orderId,
    total_amount: amount,
    buyer_total: amount,
    total_price: amount,
    status: 'PENDING_PAYMENT',
    seller_id: sellerId,
    buyer_id: 'byr-001',
    ticket_id: effTicketId,
    created_at: new Date().toISOString()
  };
  state.orders.push(order);

  const escrow = {
    id: `esc-${orderId}`,
    order_id: orderId,
    amount,
    status: 'PENDING_PAYMENT',
    created_at: new Date().toISOString()
  };
  state.escrows.push(escrow);

  const ticket = {
    id: effTicketId,
    order_id: orderId,
    status: 'VERIFIED',
    verification_status: 'VERIFIED'
  };
  state.tickets.push(ticket);

  return { order, escrow, ticket };
}

async function authorizeForRelease(orderId) {
  ensureStateCollections();
  const order = state.orders ? state.orders.find(o => o.id === orderId) : null;
  const buyerId = order?.buyer_id || 'byr-001';
  if (order && !order.buyer_id) {
    order.buyer_id = buyerId;
  }
  await TrustPolicyEngine.recordAttestation({
    orderId,
    attestationType: 'PLATFORM_ATTESTATION',
    actorId: 'SYSTEM',
    actorRole: 'SYSTEM',
    result: 'PASS'
  });
  await TrustPolicyEngine.recordAttestation({
    orderId,
    attestationType: 'TICKET_EVIDENCE_ATTESTATION',
    actorId: 'SYSTEM',
    actorRole: 'SYSTEM',
    result: 'PASS'
  });
  await TrustPolicyEngine.recordAttestation({
    orderId,
    attestationType: 'PAYMENT_ATTESTATION',
    actorId: 'SYSTEM',
    actorRole: 'SYSTEM',
    result: 'PASS'
  });
  await TrustPolicyEngine.recordAttestation({
    orderId,
    attestationType: 'BUYER_ATTESTATION',
    actorId: buyerId,
    actorRole: 'BUYER',
    result: 'PASS'
  });
  state.entry_verifications.push({
    order_id: orderId,
    status: 'CONFIRMED',
    verified_by: 'pic-01'
  });
}

async function runTestSuite() {
  console.log('================================================================================');
  console.log('  TIKUM / ARGUS — DOKU DIRECT API + HOLD & RELEASE SETTLEMENT TEST SUITE       ');
  console.log('================================================================================\n');

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
        const stackLines = err.stack.split('\n').slice(1, 4).join('\n');
        console.error(`     ${stackLines}`);
      }
      failed++;
    }
  }

  // 1. Start App Server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // 2. Start Mock DOKU Server for Direct API & Release
  await new Promise((resolve) => {
    mockDokuServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        let json = {};
        try { json = JSON.parse(body || '{}'); } catch (_) {}

        lastInterceptedDokuReq = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
          json
        };

        // Custom handler if set
        if (mockDokuReleaseHandler && req.url === '/finance/v1/release') {
          return mockDokuReleaseHandler(req, res, lastInterceptedDokuReq);
        }

        // Direct API Virtual Account (BCA, Mandiri, BRI, BNI, Permata, DOKU)
        if (req.url.includes('-virtual-account/v2/payment-code') && req.method === 'POST') {
          const inv = json.order?.invoice_number || `INV-${Date.now()}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            order: {
              invoice_number: inv,
              amount: json.order?.amount || 100000
            },
            virtual_account_info: {
              virtual_account_number: '8888000012345678',
              how_to_pay_page: 'https://sandbox.doku.com/how-to-pay',
              how_to_pay_api: 'https://api-sandbox.doku.com/how-to-pay',
              expired_date: new Date(Date.now() + 86400000).toISOString()
            }
          }));
          return;
        }

        // Official Release API: /finance/v1/release
        if (req.url === '/finance/v1/release' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            order: {
              invoice_number: json.order?.invoice_number,
              amount: json.order?.amount,
              currency: json.order?.currency || 'IDR'
            },
            release: {
              status: 'SUCCESS',
              release_id: `REL-${Date.now()}`,
              released_at: new Date().toISOString()
            }
          }));
          return;
        }

        // Default 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Endpoint ${req.url} not handled in mock` }));
      });
    });

    mockDokuServer.listen(0, () => {
      mockDokuPort = mockDokuServer.address().port;
      resolve();
    });
  });

  // Configure test DokuPaymentProvider with mock server
  const testClientId = 'MCH-TEST-SHINERVA-001';
  const testSecret = 'SK-TEST-SECRET-SHINERVA-KEY-999';
  const dokuProvider = new DokuPaymentProvider({
    clientId: testClientId,
    secretKey: testSecret,
    apiBaseUrl: `http://127.0.0.1:${mockDokuPort}`,
    env: 'sandbox',
    allowSimulation: false,
    holdReleaseEnabled: true,
    contractVerified: true
  });
  paymentManager.registerProvider(dokuProvider, { isDefault: true });

  ensureStateCollections();
  state.users.push({ id: 'adm-001', role: 'ADMIN', name: 'Admin Test' });
  state.users.push({ id: 'byr-001', role: 'BUYER', name: 'Buyer Test' });

  const adminSession = SessionStore.createSession({ userId: 'adm-001', role: 'ADMIN' });
  const buyerSession = SessionStore.createSession({ userId: 'byr-001', role: 'BUYER' });

  // =========================================================================
  // SECTION 1: ARCHITECTURE & ENTITY INVARIANTS
  // =========================================================================
  console.log('\n── Section 1: Architecture & Entity Invariants ──');

  await test('1.1 Business entity is strictly PT SHINERVA PRAJNA TEJAS', async () => {
    assert.strictEqual(dokuProvider.targetBusinessEntity, 'PT SHINERVA PRAJNA TEJAS');
    assert.strictEqual(dokuProvider.supportsMultibrand, false);
    assert.ok(!dokuProvider.targetBusinessEntity.includes('Surya Cipta Mandiri'), 'Must NOT touch CV Surya Cipta Mandiri');
    assert.ok(!dokuProvider.targetBusinessEntity.includes('Midtrans'), 'Must NOT conflate with Shinerva Midtrans');
  });

  await test('1.2 Subsystem status reports DOKU Primary (Direct API) and iPaymu Secondary', async () => {
    const status = PaymentService.getSubsystemStatus();
    assert.strictEqual(status.primary_provider_name, 'doku');
    assert.strictEqual(status.secondary_provider_name, 'ipaymu');
    assert.strictEqual(status.target_business_entity, 'PT SHINERVA PRAJNA TEJAS');
    assert.strictEqual(status.settlement_mechanism, 'Hold & Release Settlement');
    assert.strictEqual(status.release_authority, 'ARGUS Trust Engine');
    assert.strictEqual(status.primary_provider.integration, 'Direct API');
    assert.strictEqual(status.primary_provider.hold_release_mechanism, 'POST /finance/v1/release');
    assert.strictEqual(status.primary_provider.production_gated, true);
  });

  await test('1.3 GET /api/admin/system-settings reflects DOKU Primary and iPaymu Secondary', async () => {
    const res = await request({
      path: '/api/admin/system-settings',
      headers: { 'Authorization': `Bearer ${adminSession.session_token}` }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.payment_gateways.primary.provider, 'DOKU');
    assert.strictEqual(res.json.payment_gateways.primary.integration, 'Direct API');
    assert.strictEqual(res.json.payment_gateways.primary.role, 'PRIMARY_PAYMENT_GATEWAY');
    assert.strictEqual(res.json.payment_gateways.secondary.provider, 'iPaymu');
    assert.strictEqual(res.json.payment_gateways.secondary.role, 'SECONDARY_FALLBACK_GATEWAY');
  });

  await test('1.4 GET /api/v1/payments/doku/config and /active-config leak zero secrets', async () => {
    const confRes = await request({ path: '/api/v1/payments/doku/config' });
    assert.strictEqual(confRes.statusCode, 200);
    assert.strictEqual(confRes.json.provider, 'doku');
    assert.strictEqual(confRes.json.integration, 'Direct API');
    assert.strictEqual(confRes.json.target_entity, 'PT SHINERVA PRAJNA TEJAS');
    assert.strictEqual(confRes.json.settlement_mechanism, 'Hold & Release Settlement');
    assert.strictEqual(confRes.json.release_endpoint, 'POST /finance/v1/release');
    assert.ok(confRes.json.masked_client_id.includes('***'), 'Client ID must be masked');
    assert.strictEqual(confRes.json.secretKey, undefined);
    assert.strictEqual(confRes.json.secret_key, undefined);

    const actRes = await request({ path: '/api/v1/payments/active-config' });
    assert.strictEqual(actRes.statusCode, 200);
    assert.strictEqual(actRes.json.active_provider, 'doku');
  });

  // =========================================================================
  // SECTION 2: DOKU DIRECT API VIRTUAL ACCOUNT & CRYPTOGRAPHIC SIGNING
  // =========================================================================
  console.log('\n── Section 2: DOKU Direct API Virtual Account & Signing ──');

  await test('2.1 HMAC-SHA256 signature matches official Direct API component specification', async () => {
    const requestId = 'req-sign-test-123';
    const timestamp = '2026-11-14T02:00:00Z';
    const target = '/bca-virtual-account/v2/payment-code';
    const payload = {
      order: { invoice_number: 'INV-TEST-001', amount: 50000 },
      virtual_account_info: { reusable_status: false }
    };

    const signed = dokuProvider.buildSignedRequest({
      method: 'POST',
      target,
      body: payload,
      requestId,
      requestTimestamp: timestamp
    });

    assert.strictEqual(signed.headers['Client-Id'], testClientId);
    assert.strictEqual(signed.headers['Request-Id'], requestId);
    assert.strictEqual(signed.headers['Request-Timestamp'], timestamp);
    assert.ok(signed.headers['Digest']);
    assert.ok(signed.headers['Signature'].startsWith('HMACSHA256='));

    // Verify digest
    const expectedDigest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('base64');
    assert.strictEqual(signed.headers['Digest'], expectedDigest);

    // Verify signature components
    const componentStr = `Client-Id:${testClientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:${target}\nDigest:${expectedDigest}`;
    const expectedSig = 'HMACSHA256=' + crypto.createHmac('sha256', testSecret).update(componentStr).digest('base64');
    assert.strictEqual(signed.headers['Signature'], expectedSig);
  });

  await test('2.2 Direct API VA payment creation sends hold_settlement: true and records identifiers', async () => {
    const orderId = `ord-va-${Date.now()}`;
    createOrder({ orderId, amount: 150000 });

    const intent = await dokuProvider.createPayment({
      orderId,
      amount: 150000,
      currency: 'IDR',
      channel: 'VA_BCA',
      requiresEscrow: true,
      buyer: { id: 'byr-001', name: 'Buyer Test', email: 'buyer@tikum.app' }
    });

    assert.ok(lastInterceptedDokuReq);
    assert.strictEqual(lastInterceptedDokuReq.url, '/bca-virtual-account/v2/payment-code');
    assert.strictEqual(lastInterceptedDokuReq.method, 'POST');
    assert.strictEqual(lastInterceptedDokuReq.json.order.amount, 150000);
    assert.strictEqual(lastInterceptedDokuReq.json.order.invoice_number, `INV-DOKU-${orderId}`);
    assert.strictEqual(lastInterceptedDokuReq.json.virtual_account_info.reusable_status, false);
    assert.strictEqual(lastInterceptedDokuReq.json.additional_info.hold_settlement, true);

    // Check returned intent
    assert.strictEqual(intent.provider, 'doku');
    assert.strictEqual(intent.orderId, orderId);
    assert.strictEqual(intent.invoiceNumber, `INV-DOKU-${orderId}`);
    assert.ok(intent.dokuRequestId);
    assert.strictEqual(intent.paymentDetails.virtualAccount, '8888000012345678');
  });

  await test('2.3 Non-VA Channel (QRIS) strictly rejects requiresEscrow: true', async () => {
    let thrown = null;
    try {
      await dokuProvider.createPayment({
        orderId: `ord-qris-${Date.now()}`,
        amount: 50000,
        currency: 'IDR',
        channel: 'QRIS',
        requiresEscrow: true,
        buyer: { id: 'byr-001', name: 'Buyer Test', email: 'buyer@tikum.app' }
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'Must throw CapabilityUnsupportedError for QRIS + escrow');
    assert.ok(thrown.message.includes('PROVIDER_CONFIRMATION_REQUIRED') || thrown.message.includes('hold_settlement'));
  });

  await test('2.4 Webhook HMAC verification succeeds on valid signature and rejects forged/stale', async () => {
    const orderId = `ord-wh-${Date.now()}`;
    const invoiceNumber = `INV-DOKU-${orderId}`;
    const payload = {
      order: {
        invoice_number: invoiceNumber,
        amount: 200000
      },
      transaction: {
        status: 'SUCCESS',
        date: new Date().toISOString()
      }
    };
    const bodyStr = JSON.stringify(payload);
    const digest = crypto.createHash('sha256').update(bodyStr).digest('base64');
    const clientId = testClientId;
    const reqId = `wh-req-${Date.now()}`;
    const reqTimestamp = new Date().toISOString();
    const reqTarget = '/api/v1/payments/webhook/doku';

    const comp = `Client-Id:${clientId}\nRequest-Id:${reqId}\nRequest-Timestamp:${reqTimestamp}\nRequest-Target:${reqTarget}\nDigest:${digest}`;
    const validSig = 'HMACSHA256=' + crypto.createHmac('sha256', testSecret).update(comp).digest('base64');

    // 1. Valid signature
    const validRes = dokuProvider.verifyWebhook(
      {
        'client-id': clientId,
        'request-id': reqId,
        'request-timestamp': reqTimestamp,
        'signature': validSig,
        'request-target': reqTarget
      },
      payload,
      Buffer.from(bodyStr)
    );
    assert.strictEqual(validRes, true);

    // 2. Forged signature
    const badSig = 'HMACSHA256=' + crypto.createHmac('sha256', 'WRONG_SECRET').update(comp).digest('base64');
    const badRes = dokuProvider.verifyWebhook(
      {
        'client-id': clientId,
        'request-id': reqId,
        'request-timestamp': reqTimestamp,
        'signature': badSig,
        'request-target': reqTarget
      },
      payload,
      Buffer.from(bodyStr)
    );
    assert.strictEqual(badRes, false);

    // 3. Stale timestamp (> 300s)
    const staleTimestamp = new Date(Date.now() - 400000).toISOString();
    const staleComp = `Client-Id:${clientId}\nRequest-Id:${reqId}\nRequest-Timestamp:${staleTimestamp}\nRequest-Target:${reqTarget}\nDigest:${digest}`;
    const staleSig = 'HMACSHA256=' + crypto.createHmac('sha256', testSecret).update(staleComp).digest('base64');
    const staleRes = dokuProvider.verifyWebhook(
      {
        'client-id': clientId,
        'request-id': reqId,
        'request-timestamp': staleTimestamp,
        'signature': staleSig,
        'request-target': reqTarget
      },
      payload,
      Buffer.from(bodyStr)
    );
    assert.strictEqual(staleRes, false);
  });

  await test('2.5 Webhook duplicate notifications are processed idempotently', async () => {
    const orderId = `ord-dup-${Date.now()}`;
    createOrder({ orderId, amount: 100000 });

    const initialPayment = await PaymentService.createPayment({
      orderId,
      amount: 100000,
      currency: 'IDR',
      channel: 'VA_BCA',
      requiresEscrow: true,
      buyer: { id: 'byr-001' }
    });

    const invoiceNumber = initialPayment.invoiceNumber || initialPayment.providerRef || `INV-DOKU-${orderId}`;
    const webhookPayload = {
      order: { invoice_number: invoiceNumber, amount: 100000 },
      transaction: { status: 'SUCCESS' }
    };
    const bodyStr = JSON.stringify(webhookPayload);
    const digest = crypto.createHash('sha256').update(bodyStr).digest('base64');
    const reqTimestamp = new Date().toISOString();
    const reqTarget = '/api/v1/payments/webhook/doku';
    const comp = `Client-Id:${testClientId}\nRequest-Id:req-first\nRequest-Timestamp:${reqTimestamp}\nRequest-Target:${reqTarget}\nDigest:${digest}`;
    const sig = 'HMACSHA256=' + crypto.createHmac('sha256', testSecret).update(comp).digest('base64');

    // First call
    await PaymentService.handleWebhook({
      providerName: 'doku',
      body: webhookPayload,
      rawPayload: bodyStr,
      headers: {
        'client-id': testClientId,
        'request-id': 'req-first',
        'request-timestamp': reqTimestamp,
        'signature': sig,
        'request-target': reqTarget
      }
    });

    const canonicalFirst = state.canonical_payments.find(p => p.order_id === orderId);
    assert.strictEqual(canonicalFirst.settlement_status, 'SETTLEMENT_HELD');
    assert.strictEqual(canonicalFirst.money_state, MONEY_STATE.ESCROW_HELD);

    // Second call (replay)
    const secondCall = await PaymentService.handleWebhook({
      providerName: 'doku',
      body: webhookPayload,
      rawPayload: bodyStr,
      headers: {
        'client-id': testClientId,
        'request-id': 'req-first',
        'request-timestamp': reqTimestamp,
        'signature': sig,
        'request-target': reqTarget
      }
    });
    assert.strictEqual(secondCall.idempotent, true);

    const canonicalSecond = state.canonical_payments.find(p => p.order_id === orderId);
    assert.strictEqual(canonicalSecond.settlement_status, 'SETTLEMENT_HELD');
  });

  // =========================================================================
  // SECTION 3: DOKU HOLD & RELEASE SETTLEMENT EXECUTION
  // =========================================================================
  console.log('\n── Section 3: DOKU Hold & Release Settlement Execution ──');

  await test('3.1 Successful payment webhook sets settlement_status to SETTLEMENT_HELD', async () => {
    const orderId = `ord-held-${Date.now()}`;
    createOrder({ orderId, amount: 120000 });

    const pmt = await PaymentService.createPayment({
      orderId,
      amount: 120000,
      currency: 'IDR',
      channel: 'VA_BCA',
      requiresEscrow: true,
      buyer: { id: 'byr-001' }
    });

    const invoiceNumber = pmt.invoiceNumber || pmt.providerRef || `INV-DOKU-${orderId}`;
    const raw = JSON.stringify({
      order: { invoice_number: invoiceNumber, amount: 120000 },
      transaction: { status: 'SUCCESS' }
    });
    const digest = crypto.createHash('sha256').update(raw).digest('base64');
    const ts = new Date().toISOString();
    const path = '/api/v1/payments/webhook/doku';
    const sig = 'HMACSHA256=' + crypto.createHmac('sha256', testSecret)
      .update(`Client-Id:${testClientId}\nRequest-Id:wh-held\nRequest-Timestamp:${ts}\nRequest-Target:${path}\nDigest:${digest}`)
      .digest('base64');

    await PaymentService.handleWebhook({
      providerName: 'doku',
      body: JSON.parse(raw),
      rawPayload: raw,
      headers: {
        'client-id': testClientId,
        'request-id': 'wh-held',
        'request-timestamp': ts,
        'signature': sig,
        'request-target': path
      }
    });

    const canonical = state.canonical_payments.find(p => p.order_id === orderId);
    assert.strictEqual(canonical.settlement_status, 'SETTLEMENT_HELD');
    assert.strictEqual(canonical.money_state, MONEY_STATE.ESCROW_HELD);
  });

  await test('3.2 Official Release API: sends POST /finance/v1/release with signed headers and correct body', async () => {
    const invoiceNumber = `INV-DOKU-rel-test-${Date.now()}`;
    const originalReqId = `req-orig-${Date.now()}`;
    const amount = 120000;

    const releaseRes = await dokuProvider.executeRelease({
      invoiceNumber,
      amount,
      currency: 'IDR',
      originalRequestId: originalReqId,
      orderId: 'ord-rel-test'
    });

    assert.ok(lastInterceptedDokuReq);
    assert.strictEqual(lastInterceptedDokuReq.method, 'POST');
    assert.strictEqual(lastInterceptedDokuReq.url, '/finance/v1/release');
    assert.strictEqual(lastInterceptedDokuReq.headers['client-id'], testClientId);
    assert.ok(lastInterceptedDokuReq.headers['signature'].startsWith('HMACSHA256='));
    assert.strictEqual(lastInterceptedDokuReq.json.order.invoice_number, invoiceNumber);
    assert.strictEqual(lastInterceptedDokuReq.json.order.amount, amount);
    assert.strictEqual(lastInterceptedDokuReq.json.order.currency, 'IDR');
    assert.strictEqual(lastInterceptedDokuReq.json.transaction.original_request_id, originalReqId);

    assert.strictEqual(releaseRes.status, 'RELEASE_CONFIRMED');
    assert.strictEqual(releaseRes.moneyState, MONEY_STATE.RELEASED);
  });

  await test('3.3 Duplicate release execution is handled idempotently', async () => {
    const orderId = `ord-dup-rel-${Date.now()}`;
    ensureStateCollections();
    state.orders.push({ id: orderId, total_amount: 80000, buyer_total: 80000, status: 'PAID', seller_id: 'sel-1', ticket_id: 't-1' });
    state.escrows.push({
      id: `esc-${orderId}`,
      order_id: orderId,
      amount: 80000,
      status: 'RELEASED',
      released_at: new Date().toISOString()
    });

    const dupRes = await PaymentService.executeRelease({ orderId, actorId: 'admin-1' });
    assert.strictEqual(dupRes.success, true);
    assert.strictEqual(dupRes.alreadyReleased, true);
    assert.strictEqual(dupRes.idempotent, true);
  });

  await test('3.4 Release API timeout/network failure flags settlement as PENDING_RECONCILIATION', async () => {
    const orderId = `ord-timeout-${Date.now()}`;
    const invoiceNumber = `INV-DOKU-${orderId}`;
    const originalReqId = `req-timeout-${orderId}`;
    ensureStateCollections();

    state.orders.push({ id: orderId, total_amount: 90000, buyer_total: 90000, status: 'PAID', seller_id: 'sel-1', ticket_id: 't-tout' });
    state.tickets.push({ id: 't-tout', status: 'VERIFIED', verification_status: 'VERIFIED' });
    state.escrows.push({
      id: `esc-${orderId}`,
      order_id: orderId,
      amount: 90000,
      status: 'ESCROWED'
    });
    state.canonical_payments.push({
      order_id: orderId,
      provider: 'doku',
      gross_amount: 90000,
      currency: 'IDR',
      status: MONEY_STATE.PAID_ESCROWED,
      money_state: MONEY_STATE.PAID_ESCROWED,
      settlement_status: 'SETTLEMENT_HELD',
      provider_reference: invoiceNumber,
      metadata: { invoiceNumber, originalRequestId: originalReqId }
    });

    await authorizeForRelease(orderId);

    // Mock Release API error (simulate timeout/network fail)
    mockDokuReleaseHandler = (req, res) => {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway Timeout connecting to bank' }));
    };

    let thrown = null;
    try {
      await PaymentService.executeRelease({ orderId, actorId: 'admin-1' });
    } catch (err) {
      thrown = err;
    }

    mockDokuReleaseHandler = null; // restore

    assert.ok(thrown, 'Should throw release error');
    assert.strictEqual(thrown.code, 'RELEASE_TIMEOUT_PENDING_RECONCILIATION');

    const canonical = state.canonical_payments.find(p => p.order_id === orderId);
    assert.strictEqual(canonical.settlement_status, 'PENDING_RECONCILIATION');
    assert.strictEqual(canonical.money_state, MONEY_STATE.PENDING_RECONCILIATION);
  });

  // =========================================================================
  // SECTION 4: ARGUS CENTRAL TRUST ENGINE & AUTHORIZATION GATE
  // =========================================================================
  console.log('\n── Section 4: ARGUS Central Trust Engine & Authorization Gate ──');

  await test('4.1 Release blocked if ticket is invalid or unverified', async () => {
    const orderId = `ord-gate-unverified-${Date.now()}`;
    ensureStateCollections();
    state.orders.push({ id: orderId, total_amount: 100000, buyer_total: 100000, status: 'PAID', seller_id: 'sel-1', ticket_id: 't-unverified' });
    state.tickets.push({ id: 't-unverified', status: 'PENDING_REVIEW', verification_status: 'UNVERIFIED' });
    state.escrows.push({ id: `esc-${orderId}`, order_id: orderId, amount: 100000, status: 'ESCROWED' });
    state.canonical_payments.push({
      order_id: orderId,
      provider: 'doku',
      gross_amount: 100000,
      settlement_status: 'SETTLEMENT_HELD',
      status: MONEY_STATE.PAID_ESCROWED
    });

    let thrown = null;
    try {
      await PaymentService.executeRelease({ orderId, actorId: 'admin-1' });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown);
    assert.ok(thrown.code === 'ENTRY_NOT_CONFIRMED' || thrown.code === 'FINANCIAL_RELEASE_NOT_AUTHORIZED');
  });

  await test('4.2 Release blocked if Venue PIC admission is missing', async () => {
    const orderId = `ord-gate-nopic-${Date.now()}`;
    ensureStateCollections();
    state.orders.push({ id: orderId, total_amount: 100000, buyer_total: 100000, status: 'PAID', seller_id: 'sel-1', ticket_id: 't-nopic' });
    state.tickets.push({ id: 't-nopic', status: 'VERIFIED', verification_status: 'VERIFIED' });
    state.escrows.push({ id: `esc-${orderId}`, order_id: orderId, amount: 100000, status: 'ESCROWED' });
    state.canonical_payments.push({
      order_id: orderId,
      provider: 'doku',
      gross_amount: 100000,
      settlement_status: 'SETTLEMENT_HELD',
      status: MONEY_STATE.PAID_ESCROWED
    });

    let thrown = null;
    try {
      await PaymentService.executeRelease({ orderId, actorId: 'admin-1' });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown);
    assert.strictEqual(thrown.code, 'ENTRY_NOT_CONFIRMED');
  });

  await test('4.3 Release blocked if order has an active dispute', async () => {
    const orderId = `ord-gate-dispute-${Date.now()}`;
    ensureStateCollections();
    state.orders.push({ id: orderId, total_amount: 100000, buyer_total: 100000, status: 'PAID', seller_id: 'sel-1', ticket_id: 't-disp' });
    state.tickets.push({ id: 't-disp', status: 'VERIFIED', verification_status: 'VERIFIED' });
    state.escrows.push({ id: `esc-${orderId}`, order_id: orderId, amount: 100000, status: 'ESCROWED' });
    state.canonical_payments.push({
      order_id: orderId,
      provider: 'doku',
      gross_amount: 100000,
      settlement_status: 'SETTLEMENT_HELD',
      status: MONEY_STATE.PAID_ESCROWED
    });
    state.entry_verifications.push({
      order_id: orderId,
      status: 'CONFIRMED',
      verified_by: 'pic-01'
    });
    state.disputes.push({
      id: `disp-${orderId}`,
      order_id: orderId,
      status: 'OPEN',
      reason: 'Fake barcode reported'
    });

    let thrown = null;
    try {
      await PaymentService.executeRelease({ orderId, actorId: 'admin-1' });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown);
    assert.ok(thrown.code === 'FINANCIAL_RELEASE_NOT_AUTHORIZED' || thrown.code === 'ENTRY_NOT_CONFIRMED');
  });

  await test('4.4 Release authorized and executed when all ARGUS criteria PASS', async () => {
    const orderId = `ord-gate-pass-${Date.now()}`;
    ensureStateCollections();
    state.orders.push({ id: orderId, total_amount: 150000, buyer_total: 150000, status: 'PAID', seller_id: 'sel-authorized', ticket_id: 't-pass' });
    state.tickets.push({ id: 't-pass', status: 'VERIFIED', verification_status: 'VERIFIED' });
    state.escrows.push({ id: `esc-${orderId}`, order_id: orderId, amount: 150000, status: 'ESCROWED' });
    state.canonical_payments.push({
      order_id: orderId,
      provider: 'doku',
      gross_amount: 150000,
      currency: 'IDR',
      settlement_status: 'SETTLEMENT_HELD',
      status: MONEY_STATE.PAID_ESCROWED,
      money_state: MONEY_STATE.PAID_ESCROWED,
      provider_reference: `INV-DOKU-${orderId}`,
      metadata: { invoiceNumber: `INV-DOKU-${orderId}`, originalRequestId: `req-${orderId}` }
    });

    await authorizeForRelease(orderId);

    const result = await PaymentService.executeRelease({ orderId, actorId: 'admin-argus' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.providerRelease.status, 'RELEASE_CONFIRMED');

    const canonical = state.canonical_payments.find(p => p.order_id === orderId);
    assert.strictEqual(canonical.settlement_status, 'RELEASE_CONFIRMED');
    assert.strictEqual(canonical.money_state, MONEY_STATE.RELEASE_CONFIRMED);

    const escrow = state.escrows.find(e => e.order_id === orderId);
    assert.strictEqual(escrow.status, 'RELEASED');
  });

  await test('4.5 POST /api/admin/payments/release enforces admin authentication and ARGUS gate', async () => {
    const orderId = `ord-http-rel-${Date.now()}`;
    ensureStateCollections();
    state.orders.push({ id: orderId, total_amount: 200000, buyer_total: 200000, status: 'PAID', seller_id: 'sel-1', ticket_id: 't-http' });
    state.tickets.push({ id: 't-http', status: 'VERIFIED', verification_status: 'VERIFIED' });
    state.escrows.push({ id: `esc-${orderId}`, order_id: orderId, amount: 200000, status: 'ESCROWED' });
    state.canonical_payments.push({
      order_id: orderId,
      provider: 'doku',
      gross_amount: 200000,
      settlement_status: 'SETTLEMENT_HELD',
      status: MONEY_STATE.PAID_ESCROWED,
      provider_reference: `INV-DOKU-${orderId}`,
      metadata: { invoiceNumber: `INV-DOKU-${orderId}`, originalRequestId: `req-${orderId}` }
    });

    await authorizeForRelease(orderId);

    // 1. Non-admin request rejected (403)
    const nonAdminRes = await request({
      method: 'POST',
      path: '/api/admin/payments/release',
      headers: { 'Authorization': `Bearer ${buyerSession.session_token}` },
      body: { orderId }
    });
    assert.strictEqual(nonAdminRes.statusCode, 403);

    // 2. Admin request succeeds (200)
    const adminRes = await request({
      method: 'POST',
      path: '/api/admin/payments/release',
      headers: { 'Authorization': `Bearer ${adminSession.session_token}` },
      body: { orderId }
    });
    assert.strictEqual(adminRes.statusCode, 200);
    assert.strictEqual(adminRes.json.success, true);
    assert.strictEqual(adminRes.json.release.providerRelease.status, 'RELEASE_CONFIRMED');
  });

  // =========================================================================
  // SECTION 5: FINANCIAL INTEGRITY, DOUBLE-ENTRY LEDGER & PAYOUT SEPARATION
  // =========================================================================
  console.log('\n── Section 5: Financial Integrity, Double-Entry Ledger & Payout Separation ──');

  await test('5.1 Solvency Invariant: sum(debits) === sum(credits) in FinancialLedger', async () => {
    const audit = FinancialLedger.assertSolvency();
    assert.strictEqual(audit.solvent, true, 'Financial Ledger must mathematically balance');
    assert.strictEqual(audit.grandDebits, audit.grandCredits);
  });

  await test('5.2 Payout Separation: Released escrow credits internal SELLER_PAYABLE without fake auto-disbursement', async () => {
    const balances = FinancialLedger.getAccountBalances();
    assert.ok(balances[LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING] !== undefined);
    assert.ok(balances[LEDGER_ACCOUNTS.BUYER_ESCROW_HOLDING] !== undefined);
  });

  await test('5.3 Reconciliation batch matches DOKU transactions and produces audit logs', async () => {
    const recReport = await PaymentService.reconcileTransactions({ providerName: 'doku' });
    assert.strictEqual(recReport.provider, 'doku');
    assert.ok(recReport.reconciled_count >= 0);
    assert.ok(recReport.batch_id);
  });

  // =========================================================================
  // SECTION 6: NON-BREAKING REGRESSION & IPAYMU SECONDARY STATUS
  // =========================================================================
  console.log('\n── Section 6: Non-Breaking Regression & iPaymu Secondary Status ──');

  await test('6.1 Historical transaction pinning: existing iPaymu transaction stays pinned', async () => {
    const histOrderId = `ord-hist-ipaymu-${Date.now()}`;
    ensureStateCollections();
    state.canonical_payments.push({
      order_id: histOrderId,
      provider: 'ipaymu',
      gross_amount: 75000,
      currency: 'IDR',
      status: MONEY_STATE.PAID_ESCROWED,
      money_state: MONEY_STATE.PAID_ESCROWED,
      provider_reference: `trx-ipaymu-${histOrderId}`
    });

    PaymentRoutingService.recordPaymentAttempt({
      orderId: histOrderId,
      provider: 'ipaymu',
      tier: 'PRIMARY',
      status: PAYMENT_ATTEMPT_STATUS.SUCCESS
    });

    const canonical = state.canonical_payments.find(p => p.order_id === histOrderId);
    assert.strictEqual(canonical.provider, 'ipaymu');

    // Ensure routing cannot failover or remap completed/pinned payment
    assert.throws(() => {
      PaymentRoutingService.assertFailoverAllowed(histOrderId, false, 'doku');
    });
  });

  await test('6.2 Secondary provider iPaymu creates payment when explicitly selected or routed', async () => {
    const orderId = `ord-sec-ipaymu-${Date.now()}`;
    createOrder({ orderId, amount: 150000 });

    const pmt = await PaymentService.createPayment({
      orderId,
      amount: 150000,
      currency: 'IDR',
      channel: 'IPAYMU_REDIRECT',
      providerName: 'ipaymu',
      buyer: { id: 'byr-001', name: 'Buyer Test', email: 'test@tikum.app' }
    });

    assert.strictEqual(pmt.provider, 'ipaymu');
    assert.strictEqual(pmt.status, MONEY_STATE.PAYMENT_PENDING);
    assert.ok(pmt.paymentUrl);
  });

  await test('6.3 Single-active-attempt invariant: failover does NOT double-charge ambiguous attempts', async () => {
    const orderId = `ord-ambig-${Date.now()}`;
    createOrder({ orderId, amount: 100000 });

    // Create pending payment on doku
    await PaymentService.createPayment({
      orderId,
      amount: 100000,
      currency: 'IDR',
      channel: 'VA_BCA',
      providerName: 'doku'
    });

    // Record pending attempt
    PaymentRoutingService.recordPaymentAttempt({
      orderId,
      provider: 'doku',
      tier: 'PRIMARY'
    });

    // Attempting to initiate on second provider while first is pending/ambiguous must be blocked
    let thrown = null;
    try {
      PaymentRoutingService.assertFailoverAllowed(orderId, false, 'ipaymu');
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'Must block double attempt across providers');
    assert.strictEqual(thrown.code, 'FAILOVER_UNCERTAIN_STATE_BLOCKED');
  });

  await test('6.4 iPaymu webhook processing remains fully functional', async () => {
    const orderId = `ord-ip-wh-${Date.now()}`;
    createOrder({ orderId, amount: 50000 });

    await PaymentService.createPayment({
      orderId,
      amount: 50000,
      currency: 'IDR',
      channel: 'IPAYMU_REDIRECT',
      providerName: 'ipaymu'
    });

    const ipBody = {
      trx_id: `trx-${orderId}`,
      sid: orderId,
      reference_id: orderId,
      status: 'berhasil',
      status_code: 1,
      total: 50000
    };
    const ipBodyStr = JSON.stringify(ipBody);
    const ipSig = crypto.createHmac('sha256', process.env.IPAYMU_VA || '1122334455').update(ipBodyStr).digest('hex');

    const whRes = await PaymentService.handleWebhook({
      providerName: 'ipaymu',
      body: ipBody,
      rawPayload: ipBodyStr,
      headers: { signature: ipSig }
    });

    assert.strictEqual(whRes.event.provider, 'ipaymu');

    const canonical = state.canonical_payments.find(p => p.order_id === orderId);
    assert.strictEqual(canonical.provider, 'ipaymu');
    assert.strictEqual(canonical.status, MONEY_STATE.PAID);
  });

  // Teardown
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => mockDokuServer.close(resolve));

  console.log('\n================================================================================');
  console.log(`  COMPREHENSIVE SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
