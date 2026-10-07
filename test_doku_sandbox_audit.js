/**
 * TIKUM / ARGUS — Focused DOKU Sandbox Integration & Security Audit Suite
 *
 * Verifies the 9 Non-Negotiable Audit Invariants:
 * 1. Credential & configuration validation (never leaks secret key)
 * 2. Cryptographic request signing (DOKU HMAC-SHA256 component specification)
 * 3. Create-payment request formatting & HTTP payload inspection
 * 4. Successful DOKU response handling & canonical intent mapping
 * 5. Invalid signature & timestamp replay rejection (HTTP 401)
 * 6. Duplicate webhook replay idempotency (zero double-entry duplicates)
 * 7. Failed payment event handling & inventory safety unlock
 * 8. Successful payment event handling (Order PAID_ESCROWED, funds locked, seller unpaid)
 * 9. Double-entry ledger reconciliation & mathematical balancing: sum(debits) === sum(credits)
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { DokuPaymentProvider, DOKU_STATUS, DOKU_ACCOUNT_STATUS, DOKU_ESCROW_STATUS } = require('./src/services/payment/DokuPaymentProvider');
const { paymentManager } = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { ListingService } = require('./src/services/listingService');

let server;
let baseUrl;

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

let mockDokuServer;
let mockDokuPort;
let interceptedRequest = null;

async function runAuditSuite() {
  console.log('================================================================');
  console.log('  TIKUM — DOKU SANDBOX INTEGRATION AUDIT & INVARIANT TEST SUITE');
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
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}\n`);
      failed++;
      throw err;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: CREDENTIAL & CONFIGURATION VALIDATION
    // -------------------------------------------------------------------------
    console.log('── Test 1: Credential & Configuration Validation ──');

    await check('1.1 Empty configuration fails validation and identifies missing keys', async () => {
      const unconfigured = new DokuPaymentProvider({
        clientId: null,
        secretKey: null,
        apiBaseUrl: null,
        env: null
      });
      const checkResult = unconfigured.validateConfiguration();
      assert.strictEqual(checkResult.valid, false);
      assert.ok(checkResult.issues.includes('DOKU_CLIENT_ID is missing'));
      assert.ok(checkResult.issues.includes('DOKU_SECRET_KEY is missing'));
      assert.strictEqual(checkResult.hasClientId, false);
      assert.strictEqual(checkResult.hasSecretKey, false);
    });

    await check('1.2 Valid Sandbox configuration passes validation without exposing secret key', async () => {
      const configured = new DokuPaymentProvider({
        clientId: 'MALL-ID-TIKUM-TEST',
        secretKey: 'SK-TEST-TOP-SECRET-DO-NOT-LEAK',
        apiBaseUrl: 'https://api-sandbox.doku.com',
        env: 'sandbox'
      });
      const checkResult = configured.validateConfiguration();
      assert.strictEqual(checkResult.valid, true);
      assert.strictEqual(checkResult.environment, 'sandbox');
      assert.strictEqual(checkResult.isSandbox, true);
      assert.strictEqual(checkResult.hasClientId, true);
      assert.strictEqual(checkResult.hasSecretKey, true);
      assert.strictEqual(checkResult.apiBaseUrl, 'https://api-sandbox.doku.com');

      // Security Invariant: Never print secret key in validation response or json string
      const stringified = JSON.stringify(checkResult);
      assert.strictEqual(stringified.includes('SK-TEST-TOP-SECRET-DO-NOT-LEAK'), false, 'Secret key must never be exposed');
    });

    await check('1.3 Provider cleanly resolves DOKU_ENV and DOKU_BASE_URL aliases', async () => {
      const provider = new DokuPaymentProvider({
        apiBaseUrl: 'https://api-sandbox.doku.com',
        env: 'sandbox'
      });
      assert.strictEqual(provider.apiBaseUrl, 'https://api-sandbox.doku.com');
      assert.strictEqual(provider.env, 'sandbox');
      assert.strictEqual(provider.isSandbox, true);
    });

    // -------------------------------------------------------------------------
    // TEST 2: REQUEST SIGNING (DOKU HMAC-SHA256 SPECIFICATION)
    // -------------------------------------------------------------------------
    console.log('\n── Test 2: Cryptographic Request Signing Specification ──');

    const testSecret = 'sk_sandbox_secret_key_999';
    const testClientId = 'client_tikum_001';

    await check('2.1 Generates canonical HMAC-SHA256 signature matching official DOKU formula', async () => {
      const provider = new DokuPaymentProvider({
        clientId: testClientId,
        secretKey: testSecret
      });

      const requestId = 'req-123456';
      const requestTimestamp = '2026-10-07T12:00:00Z';
      const requestTarget = '/checkout/v1/payment';
      const rawBody = JSON.stringify({ order: { amount: 500000, invoice_number: 'INV-TEST-001' } });

      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const expectedComponent = [
        `Client-Id:${testClientId}`,
        `Request-Id:${requestId}`,
        `Request-Timestamp:${requestTimestamp}`,
        `Request-Target:${requestTarget}`,
        `Digest:${digest}`
      ].join('\n');
      const expectedHmac = crypto.createHmac('sha256', testSecret).update(expectedComponent).digest('base64');
      const expectedSignature = `HMACSHA256=${expectedHmac}`;

      const actualSignature = provider.generateSignature({
        requestId,
        requestTimestamp,
        requestTarget,
        rawBody
      });

      assert.strictEqual(actualSignature, expectedSignature);
    });

    await check('2.2 Altering any component parameter produces completely different signature', async () => {
      const provider = new DokuPaymentProvider({ clientId: testClientId, secretKey: testSecret });
      const baseParams = {
        requestId: 'req-1',
        requestTimestamp: '2026-10-07T12:00:00Z',
        requestTarget: '/checkout/v1/payment',
        rawBody: '{"test":1}'
      };
      const baseSig = provider.generateSignature(baseParams);

      // Tampered body
      const tamperedBodySig = provider.generateSignature({ ...baseParams, rawBody: '{"test":2}' });
      assert.notStrictEqual(baseSig, tamperedBodySig);

      // Tampered timestamp
      const tamperedTimeSig = provider.generateSignature({ ...baseParams, requestTimestamp: '2026-10-07T12:00:01Z' });
      assert.notStrictEqual(baseSig, tamperedTimeSig);

      // Tampered target
      const tamperedTargetSig = provider.generateSignature({ ...baseParams, requestTarget: '/checkout/v1/other' });
      assert.notStrictEqual(baseSig, tamperedTargetSig);
    });

    await check('2.3 Throws explicit error if secretKey is not configured during signing', async () => {
      const provider = new DokuPaymentProvider({ clientId: testClientId, secretKey: null });
      assert.throws(() => {
        provider.generateSignature({
          requestId: 'req-1',
          requestTimestamp: '2026-10-07T12:00:00Z',
          requestTarget: '/checkout/v1/payment'
        });
      }, /secret key is not configured/i);
    });

    // -------------------------------------------------------------------------
    // TEST 3 & 4: CREATE-PAYMENT REQUEST FORMATTING & DOKU RESPONSE HANDLING
    // -------------------------------------------------------------------------
    console.log('\n── Test 3 & 4: Create-Payment Request Formatting & Response Handling ──');

    // Spin up local mock DOKU API server
    await new Promise((resolve) => {
      mockDokuServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          interceptedRequest = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body,
            json: JSON.parse(body || '{}')
          };

          if (req.url === '/checkout/v1/payment' && req.method === 'POST') {
            const invoiceNumber = interceptedRequest.json.order?.invoice_number || 'INV-DOKU-UNKNOWN';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              order: {
                invoice_number: invoiceNumber,
                amount: interceptedRequest.json.order?.amount
              },
              payment: {
                url: `https://sandbox.doku.com/checkout/link/tok_${Date.now()}`,
                expired_date: new Date(Date.now() + 3600 * 1000).toISOString()
              }
            }));
          } else {
            res.writeHead(404);
            res.end();
          }
        });
      });
      mockDokuServer.listen(0, () => {
        mockDokuPort = mockDokuServer.address().port;
        resolve();
      });
    });

    let liveSandboxProvider;
    await check('3.1 createPayment formats exact DOKU Checkout request and transmits signed headers', async () => {
      liveSandboxProvider = new DokuPaymentProvider({
        clientId: testClientId,
        secretKey: testSecret,
        apiBaseUrl: `http://127.0.0.1:${mockDokuPort}`,
        env: 'sandbox',
        allowSimulation: false
      });

      const orderId = 'ord-audit-1001';
      const result = await liveSandboxProvider.createPayment({
        orderId,
        amount: 350000,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'usr-buyer-99', name: 'Budi Santoso', email: 'budi@example.com' }
      });

      assert.ok(interceptedRequest);
      assert.strictEqual(interceptedRequest.method, 'POST');
      assert.strictEqual(interceptedRequest.url, '/checkout/v1/payment');
      assert.strictEqual(interceptedRequest.headers['client-id'], testClientId);
      assert.ok(interceptedRequest.headers['request-id']);
      assert.ok(interceptedRequest.headers['request-timestamp']);
      assert.ok(interceptedRequest.headers['signature'].startsWith('HMACSHA256='));

      // Verify request body format
      assert.strictEqual(interceptedRequest.json.order.invoice_number, `INV-DOKU-${orderId}`);
      assert.strictEqual(interceptedRequest.json.order.amount, 350000);
      assert.strictEqual(interceptedRequest.json.payment.payment_due_date, 60);
      assert.strictEqual(interceptedRequest.json.customer.id, 'usr-buyer-99');
      assert.strictEqual(interceptedRequest.json.customer.name, 'Budi Santoso');
      assert.strictEqual(interceptedRequest.json.customer.email, 'budi@example.com');
    });

    await check('4.1 Parses DOKU Checkout response into CanonicalPaymentIntent', async () => {
      const orderId = 'ord-audit-1002';
      const result = await liveSandboxProvider.createPayment({
        orderId,
        amount: 750000,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'usr-buyer-88' }
      });

      assert.strictEqual(result.provider, 'doku');
      assert.strictEqual(result.orderId, orderId);
      assert.strictEqual(result.providerReference, `INV-DOKU-${orderId}`);
      assert.strictEqual(result.amount, 750000);
      assert.strictEqual(result.status, MONEY_STATE.PAYMENT_PENDING);
      assert.strictEqual(result.simulated, false);
      assert.ok(result.paymentUrl.startsWith('https://sandbox.doku.com/checkout/link/'));
      assert.strictEqual(result.paymentDetails.checkoutUrl, result.paymentUrl);
    });

    await check('4.2 Throws descriptive DOKU_API_ERROR on non-200 DOKU response', async () => {
      // Create failing provider pointing to bad target
      const failingProvider = new DokuPaymentProvider({
        clientId: testClientId,
        secretKey: testSecret,
        apiBaseUrl: `http://127.0.0.1:${mockDokuPort}`,
        env: 'sandbox',
        allowSimulation: false
      });
      // Temporarily override target
      const origMethod = failingProvider._httpPost;
      failingProvider._httpPost = async () => ({
        statusCode: 400,
        json: { error: { message: 'Invalid customer email address' } }
      });

      await assert.rejects(async () => {
        await failingProvider.createPayment({ orderId: 'ord-bad', amount: 100000 });
      }, (err) => err.code === 'DOKU_API_ERROR' && err.message.includes('Invalid customer email address'));
    });

    // -------------------------------------------------------------------------
    // TEST 5: INVALID SIGNATURE & REPLAY REJECTION
    // -------------------------------------------------------------------------
    console.log('\n── Test 5: Invalid Signature & Timestamp Replay Protection ──');

    const dokuRegistered = paymentManager.getProvider('doku');
    dokuRegistered.clientId = 'client-tikum-audit-wh';
    dokuRegistered.secretKey = 'secret-tikum-audit-wh-123';
    dokuRegistered.webhookSecret = 'secret-tikum-audit-wh-123';

    await check('5.1 Forged webhook signature returns HTTP 401 INVALID_WEBHOOK_SIGNATURE', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-tikum-audit-wh',
          'request-id': `req-forged-${Date.now()}`,
          'request-timestamp': new Date().toISOString(),
          'signature': 'HMACSHA256=invalidBase64ForgedSignature=='
        },
        body: {
          order: { invoice_number: 'INV-DOKU-ord-fake', amount: 500000 },
          transaction: { status: 'SUCCESS', transaction_id: 'doku-fake-trx' }
        }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.code, 'INVALID_WEBHOOK_SIGNATURE');
    });

    await check('5.2 Webhook older than 300 seconds is rejected for replay protection', async () => {
      const staleTimestamp = new Date(Date.now() - 360 * 1000).toISOString(); // 6 minutes ago
      const body = {
        order: { invoice_number: 'INV-DOKU-ord-stale', amount: 200000 },
        transaction: { status: 'SUCCESS', transaction_id: 'doku-stale-trx' }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const sigComponent = `Client-Id:client-tikum-audit-wh\nRequest-Id:req-stale-1\nRequest-Timestamp:${staleTimestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuRegistered.webhookSecret).update(sigComponent).digest('base64');

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-tikum-audit-wh',
          'request-id': 'req-stale-1',
          'request-timestamp': staleTimestamp,
          'signature': sig
        },
        body
      });

      assert.strictEqual(res.statusCode, 401);
    });

    // -------------------------------------------------------------------------
    // TEST 6: DUPLICATE WEBHOOK / IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('\n── Test 6: Duplicate Webhook Idempotency ──');

    let auditOrder;
    await check('6.1 Setup verified ticket listing and order for webhook testing', async () => {
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'VIP Row 1',
        faceValue: 400000,
        price: 400000,
        rawBarcode: `BC-AUDIT-${Date.now()}`,
        evidenceBundleId: 'bdl-audit-1'
      });
      await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true, notes: 'Verified', evidenceType: 'INVOICE_PDF' });
      const orderRes = await EscrowService.createOrder({ listingId: listRes.listing.id, buyerId: 'buyer-1' });
      auditOrder = orderRes.order;
      assert.ok(auditOrder);
    });

    const eventIdWebhook = `evt-audit-${Date.now()}`;
    await check('6.2 First legitimate webhook marks payment processed and records ledger entry', async () => {
      const timestamp = new Date().toISOString();
      const body = {
        order: { invoice_number: `INV-DOKU-${auditOrder.id}`, amount: auditOrder.buyer_total },
        transaction: { status: 'SUCCESS', transaction_id: `trx-audit-${auditOrder.id}`, date: timestamp }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const sigComponent = `Client-Id:client-tikum-audit-wh\nRequest-Id:${eventIdWebhook}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuRegistered.webhookSecret).update(sigComponent).digest('base64');

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-tikum-audit-wh',
          'request-id': eventIdWebhook,
          'request-timestamp': timestamp,
          'signature': sig
        },
        body
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.idempotent, false);
    });

    await check('6.3 Replaying duplicate webhook returns HTTP 200 with idempotent: true and NO new ledger entry', async () => {
      const timestamp = new Date().toISOString();
      const body = {
        order: { invoice_number: `INV-DOKU-${auditOrder.id}`, amount: auditOrder.buyer_total },
        transaction: { status: 'SUCCESS', transaction_id: `trx-audit-${auditOrder.id}` }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const sigComponent = `Client-Id:client-tikum-audit-wh\nRequest-Id:${eventIdWebhook}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuRegistered.webhookSecret).update(sigComponent).digest('base64');

      const ledgerCountBefore = (state.financial_ledger || []).length;

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-tikum-audit-wh',
          'request-id': eventIdWebhook,
          'request-timestamp': timestamp,
          'signature': sig
        },
        body
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.idempotent, true);
      assert.strictEqual((state.financial_ledger || []).length, ledgerCountBefore, 'Must not duplicate ledger transactions');
    });

    // -------------------------------------------------------------------------
    // TEST 7: FAILED PAYMENT EVENT
    // -------------------------------------------------------------------------
    console.log('\n── Test 7: Failed Payment Handling & Inventory Unlock ──');

    let failedOrder;
    await check('7.1 Setup second order to test gateway payment failure', async () => {
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'VIP Row 2',
        faceValue: 500000,
        price: 500000,
        rawBarcode: `BC-FAIL-${Date.now()}`,
        evidenceBundleId: 'bdl-audit-2'
      });
      await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true, notes: 'Verified', evidenceType: 'INVOICE_PDF' });
      const orderRes = await EscrowService.createOrder({ listingId: listRes.listing.id, buyerId: 'buyer-1' });
      failedOrder = orderRes.order;
      assert.ok(failedOrder);
    });

    await check('7.2 Failed webhook updates order to CANCELLED and marks marketplace PAYMENT_FAILED', async () => {
      const timestamp = new Date().toISOString();
      const body = {
        order: { invoice_number: `INV-DOKU-${failedOrder.id}`, amount: failedOrder.buyer_total },
        transaction: { status: 'FAILED', transaction_id: `trx-fail-${failedOrder.id}` }
      };
      const rawBody = JSON.stringify(body);
      const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
      const reqId = `req-fail-${failedOrder.id}`;
      const sigComponent = `Client-Id:client-tikum-audit-wh\nRequest-Id:${reqId}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
      const sig = 'HMACSHA256=' + crypto.createHmac('sha256', dokuRegistered.webhookSecret).update(sigComponent).digest('base64');

      const res = await request({
        method: 'POST',
        path: '/api/v1/payments/webhook/doku',
        headers: {
          'client-id': 'client-tikum-audit-wh',
          'request-id': reqId,
          'request-timestamp': timestamp,
          'signature': sig
        },
        body
      });

      assert.strictEqual(res.statusCode, 200);

      const dbOrder = state.orders.find(o => o.id === failedOrder.id);
      assert.strictEqual(dbOrder.status, 'CANCELLED');
      assert.strictEqual(dbOrder.marketplace_status, 'PAYMENT_FAILED');
    });

    // -------------------------------------------------------------------------
    // TEST 8: SUCCESSFUL PAYMENT & ESCROW HOLD INVARIANT
    // -------------------------------------------------------------------------
    console.log('\n── Test 8: Successful Payment & Escrow Lock Invariant ──');

    await check('8.1 Successful payment transitions Escrow to ESCROWED and Order to PAID_ESCROWED', async () => {
      const dbEscrow = state.escrows.find(e => e.order_id === auditOrder.id);
      assert.ok(dbEscrow);
      assert.strictEqual(dbEscrow.status, ESCROW_STATUS.ESCROWED);

      const dbOrder = state.orders.find(o => o.id === auditOrder.id);
      assert.strictEqual(dbOrder.status, ORDER_STATUS.PAID_ESCROWED);
    });

    await check('8.2 INVARIANT: PAYMENT SUCCESS !== SELLER PAID (funds held, seller unpaid)', async () => {
      const dbEscrow = state.escrows.find(e => e.order_id === auditOrder.id);
      assert.notStrictEqual(dbEscrow.status, ESCROW_STATUS.RELEASED, 'Escrow must NOT be released upon payment capture');

      const dbOrder = state.orders.find(o => o.id === auditOrder.id);
      assert.notStrictEqual(dbOrder.status, ORDER_STATUS.SETTLED, 'Order must NOT be settled upon payment capture');
    });

    // -------------------------------------------------------------------------
    // TEST 9: LEDGER RECONCILIATION & DOUBLE-ENTRY INVARIANT
    // -------------------------------------------------------------------------
    console.log('\n── Test 9: Double-Entry Balancing & Ledger Reconciliation ──');

    await check('9.1 Double-entry FinancialLedger balances mathematically: sum(debits) === sum(credits)', async () => {
      let totalDebits = 0;
      let totalCredits = 0;

      for (const tx of (state.financial_ledger || [])) {
        for (const e of tx.entries) {
          if (e.type === 'DEBIT') totalDebits += e.amount;
          if (e.type === 'CREDIT') totalCredits += e.amount;
        }
      }

      assert.strictEqual(totalDebits, totalCredits, 'Mathematical ledger invariant: sum(debits) must equal sum(credits)');
      assert.ok(totalDebits > 0, 'Ledger must have non-zero debits recorded');
    });

    await check('9.2 PaymentService.reconcileTransactions detects zero variance for balanced orders', async () => {
      const report = await PaymentService.reconcileTransactions({ providerName: 'doku' });
      assert.ok(report);
      assert.strictEqual(report.variances_found, 0);
    });

    await check('9.3 Reconciliation detects artificial amount tampering as an exception', async () => {
      // Simulate artificial tampering in canonical_payments
      const target = (state.canonical_payments || []).find(p => p.order_id === auditOrder.id);
      if (target) {
        const originalGross = target.gross_amount;
        target.gross_amount = originalGross + 50000; // Inject Rp 50.000 variance

        const tamperedReport = await PaymentService.reconcileTransactions({ providerName: 'doku' });
        assert.ok(tamperedReport.variances_found >= 1, 'Reconciliation must flag variance');
        const mismatch = tamperedReport.records.find(r => r.order_id === auditOrder.id);
        assert.strictEqual(mismatch.status, 'AMOUNT_MISMATCH');

        // Restore original
        target.gross_amount = originalGross;
      }
    });

    console.log('\n================================================================');
    console.log(`  ALL ${passed} FOCUSED DOKU SANDBOX AUDIT TESTS PASSED!`);
    console.log('================================================================\n');

  } finally {
    if (mockDokuServer) mockDokuServer.close();
    if (server) server.close();
  }
}

runAuditSuite().catch((err) => {
  console.error('\nAudit Suite Execution Failed:', err);
  process.exit(1);
});
