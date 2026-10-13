/**
 * TIKUM / ARGUS — Xendit Sandbox Smoke Test & Technical Verification Suite
 *
 * Verifies end-to-end Xendit Test Mode payment flow without real money:
 * Phase 1: Configuration & Environment Audit (Zero Secret Leaks)
 * Phase 2: Sandbox Payment Intent Creation & HTTP Wire Serialization
 * Phase 3: Status Inquiry & Re-query Protocol
 * Phase 4: Webhook Signature Verification, Timing-Safe Token Check & Idempotency
 * Phase 5: Domain State Transition & Authoritative Double-Entry Ledger Posting
 * Phase 6: Negative & Tampering Paths (Signature Mismatch, Amount Mismatch, Currency Mismatch)
 * Phase 7: Milestone Escrow Separation (CapabilityUnsupportedError on Xendit Escrow Hold)
 * Phase 8: Production Safety Invariants (Fail-Closed Gates, Zero Real Money Moved)
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku'; // DOKU remains primary
process.env.ENABLE_DOKU_PRODUCTION = 'false';
process.env.ENABLE_XENDIT_PRODUCTION = 'false';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const {
  paymentManager,
  XenditPaymentProvider,
  CapabilityUnsupportedError
} = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const {
  PaymentRoutingService,
  PAYMENT_ATTEMPT_STATUS
} = require('./src/services/payment/PaymentRoutingService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');

console.log('================================================================');
console.log('  TIKUM — XENDIT SANDBOX SMOKE TEST & VERIFICATION SUITE');
console.log('================================================================\n');

let server;
let baseUrl;
let mockXenditServer;
let mockXenditBaseUrl;
let interceptedXenditRequests = [];

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serialized = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers, host: url.host };
    if (serialized && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (serialized && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(serialized);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
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
    if (serialized) req.write(serialized);
    req.end();
  });
}

let passed = 0;
let total = 0;

function check(title, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function asyncCheck(title, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  resetDatabase();

  // Start Tikum HTTP application server on ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Start local Mock Xendit wire server to intercept actual HTTP network calls
  await new Promise((resolve) => {
    mockXenditServer = http.createServer((req, res) => {
      let reqBody = '';
      req.on('data', chunk => reqBody += chunk);
      req.on('end', () => {
        let json = null;
        try { json = JSON.parse(reqBody); } catch (_) {}
        interceptedXenditRequests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: json,
          rawBody: reqBody
        });

        // Route responses
        if (req.method === 'POST' && req.url === '/v2/invoices') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: `inv_wire_${Date.now()}`,
            external_id: json?.external_id || 'test_ext',
            status: 'PENDING',
            amount: json?.amount || 500000,
            invoice_url: `https://checkout-staging.xendit.co/web/inv_wire_${Date.now()}`,
            expiry_date: new Date(Date.now() + 86400000).toISOString()
          }));
        } else if (req.method === 'GET' && req.url.startsWith('/v2/invoices/')) {
          const invId = req.url.split('/').pop();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: invId,
            external_id: 'ord-smoke-001',
            status: 'PAID',
            amount: 500000,
            paid_at: new Date().toISOString()
          }));
        } else if (req.method === 'POST' && req.url === '/v2/accounts') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: `acc_wire_${Date.now()}`,
            email: json?.email,
            type: json?.type || 'OWNED',
            public_profile: { business_name: json?.public_profile?.business_name },
            status: 'ACTIVE'
          }));
        } else if (req.method === 'POST' && req.url === '/split_rules') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: `split_wire_${Date.now()}`,
            name: json?.name,
            routes: json?.routes || []
          }));
        } else if (req.method === 'POST' && req.url === '/transfers') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: `trf_wire_${Date.now()}`,
            transfer_id: `trf_wire_${Date.now()}`,
            reference: json?.reference,
            amount: json?.amount,
            status: 'SUCCESSFUL'
          }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'NOT_FOUND' }));
        }
      });
    });
    mockXenditServer.listen(0, () => {
      const port = mockXenditServer.address().port;
      mockXenditBaseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: CONFIGURATION & ENVIRONMENT AUDIT
  // ---------------------------------------------------------------------------
  console.log('── Section 1: Configuration & Environment Audit ──');

  check('1.1 Xendit adapter instantiated with sandbox configuration without secret leaks', () => {
    const sandboxXendit = new XenditPaymentProvider({
      secretKey: 'xnd_development_dummy_sandbox_key_for_testing',
      webhookToken: 'test_sandbox_webhook_token_secret',
      apiBaseUrl: mockXenditBaseUrl,
      mode: 'sandbox',
      allowSimulation: false
    });

    const status = sandboxXendit.getStatus();
    assert.strictEqual(status.provider, 'xendit');
    assert.strictEqual(status.environment, 'sandbox');
    assert.strictEqual(status.hasSecretKey, true);
    assert.strictEqual(status.tier, 'TIER_2B');
    // Ensure raw secret is never exposed in status dump
    assert.strictEqual(JSON.stringify(status).includes('xnd_development_dummy'), false);
  });

  check('1.2 Merchant account status: Langgam vs TIKUM separation noted', () => {
    const sandboxXendit = new XenditPaymentProvider({
      secretKey: 'xnd_development_dummy_key',
      mode: 'sandbox'
    });
    const status = sandboxXendit.getStatus();
    assert.ok(status.underwritingRequirements);
    assert.strictEqual(status.underwritingRequirements.category, 'HIGH_RISK_SECONDARY_TICKETING');
    assert.strictEqual(status.underwritingRequirements.approvalRequired, true);
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: ISOLATED TEST ORDER & PAYMENT INTENT CREATION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Isolated Test Order & Payment Request Creation ──');

  // Setup isolated test entities
  state.users.push({
    id: 'user-smoke-buyer',
    email: 'smoke.buyer@tikum.app',
    name: 'Smoke Test Buyer',
    role: 'buyer',
    is_verified: true
  });
  state.users.push({
    id: 'user-smoke-seller',
    email: 'smoke.seller@tikum.app',
    name: 'Smoke Test Seller',
    role: 'seller',
    is_verified: true
  });
  state.events.push({
    id: 'event-smoke-2026',
    title: 'Coldplay Live Jakarta 2026',
    date: '2026-12-01',
    venue: 'GBK Jakarta',
    city: 'Jakarta',
    country: 'Indonesia',
    currency: 'IDR'
  });
  state.tickets.push({
    id: 'tkt-smoke-001',
    event_id: 'event-smoke-2026',
    seller_id: 'user-smoke-seller',
    category: 'CAT 1',
    original_price: 500000,
    status: 'AVAILABLE'
  });
  state.listings.push({
    id: 'list-smoke-001',
    seller_id: 'user-smoke-seller',
    ticket_id: 'tkt-smoke-001',
    event_id: 'event-smoke-2026',
    price: 500000,
    quantity: 1,
    status: 'ACTIVE'
  });

  let testOrder = null;

  await asyncCheck('2.1 EscrowService creates isolated test order without real customer data', async () => {
    const created = await EscrowService.createOrder({
      buyerId: 'user-smoke-buyer',
      listingId: 'list-smoke-001'
    });
    assert.ok(created);
    assert.ok(created.order);
    assert.ok(created.escrow);
    testOrder = created.order;
    assert.strictEqual(testOrder.buyer_id, 'user-smoke-buyer');
    assert.strictEqual(testOrder.status, ORDER_STATUS.PENDING_PAYMENT);
  });

  await asyncCheck('2.2 PaymentService.createPayment initiates Xendit Test Mode payment request', async () => {
    const sandboxXendit = new XenditPaymentProvider({
      secretKey: 'xnd_development_test_key',
      webhookToken: 'test_token',
      apiBaseUrl: mockXenditBaseUrl,
      mode: 'sandbox',
      allowSimulation: false
    });
    paymentManager.registerProvider(sandboxXendit);

    interceptedXenditRequests = [];

    const paymentResult = await PaymentService.createPayment({
      orderId: testOrder.id,
      amount: testOrder.buyer_total,
      channel: 'INVOICE',
      providerName: 'xendit',
      buyer: {
        id: 'user-smoke-buyer',
        name: 'Smoke Test Buyer',
        email: 'smoke.buyer@tikum.app'
      },
      requiresEscrow: false, // Xendit does not do milestone escrow
      idempotencyKey: `idemp-smoke-${testOrder.id}`
    });

    assert.ok(paymentResult);
    assert.strictEqual(paymentResult.provider, 'xendit');
    assert.strictEqual(paymentResult.orderId, testOrder.id);
    assert.ok(paymentResult.providerRef);
    assert.strictEqual(paymentResult.status, MONEY_STATE.PAYMENT_PENDING);
    assert.ok(paymentResult.paymentDetails.checkoutUrl);

    // Verify actual wire HTTP request intercepted by mock Xendit server
    assert.strictEqual(interceptedXenditRequests.length, 1);
    const wireReq = interceptedXenditRequests[0];
    assert.strictEqual(wireReq.method, 'POST');
    assert.strictEqual(wireReq.url, '/v2/invoices');
    assert.ok(wireReq.headers.authorization.startsWith('Basic '));
    assert.strictEqual(wireReq.body.external_id, testOrder.id);
    assert.strictEqual(wireReq.body.amount, testOrder.buyer_total);
  });

  check('2.3 Payment attempt and canonical payment are durably pinned to Xendit', () => {
    const canonical = (state.canonical_payments || []).find(p => p.order_id === testOrder.id);
    assert.ok(canonical);
    assert.strictEqual(canonical.provider, 'xendit');
    assert.strictEqual(canonical.money_state, MONEY_STATE.PAYMENT_PENDING);
    assert.strictEqual(canonical.business_state, 'TICKET_RESERVED');

    // Cross-provider failover is blocked while payment is PENDING
    assert.throws(() => {
      PaymentRoutingService.assertFailoverAllowed(testOrder.id);
    }, (err) => err.code === 'FAILOVER_UNCERTAIN_STATE_BLOCKED');
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: HTTP STATUS INQUIRY RE-QUERY PROTOCOL
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Status Inquiry Re-Query Protocol ──');

  await asyncCheck('3.1 Server-to-server inquiry re-queries Xendit API via wire HTTP', async () => {
    const xenditProvider = paymentManager.getProvider('xendit');
    interceptedXenditRequests = [];

    const statusInquiry = await xenditProvider.getPaymentStatus({
      providerRef: 'inv_wire_test_123',
      orderId: testOrder.id
    });

    assert.ok(statusInquiry);
    assert.strictEqual(statusInquiry.status, MONEY_STATE.PAID);
    assert.strictEqual(statusInquiry.amount, 500000);

    // Verify wire GET /v2/invoices/:id was called
    assert.strictEqual(interceptedXenditRequests.length, 1);
    assert.strictEqual(interceptedXenditRequests[0].method, 'GET');
    assert.strictEqual(interceptedXenditRequests[0].url, '/v2/invoices/inv_wire_test_123');
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: WEBHOOK RECEPTION, TIMING-SAFE VERIFICATION & IDEMPOTENCY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Webhook Verification, Timing-Safe Token & Idempotency ──');

  const webhookSecret = 'test_sandbox_webhook_token_secret';
  const configuredXendit = new XenditPaymentProvider({
    secretKey: 'xnd_development_test_key',
    webhookToken: webhookSecret,
    apiBaseUrl: mockXenditBaseUrl,
    mode: 'sandbox',
    allowSimulation: false
  });
  paymentManager.registerProvider(configuredXendit);

  await asyncCheck('4.1 Forged webhook callback token is strictly rejected with HTTP 401', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/xendit',
      headers: {
        'x-callback-token': 'attacker_forged_callback_token'
      },
      body: {
        id: `evt_xendit_${Date.now()}`,
        external_id: testOrder.id,
        status: 'PAID',
        amount: testOrder.buyer_total
      }
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json?.code, 'INVALID_WEBHOOK_SIGNATURE');
  });

  await asyncCheck('4.2 Missing webhook token header is strictly rejected with HTTP 401', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/xendit',
      body: {
        id: `evt_xendit_${Date.now()}`,
        external_id: testOrder.id,
        status: 'PAID',
        amount: testOrder.buyer_total
      }
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json?.code, 'INVALID_WEBHOOK_SIGNATURE');
  });

  const webhookEventId = `evt_xendit_smoke_${Date.now()}`;
  const validWebhookPayload = {
    id: webhookEventId,
    external_id: testOrder.id,
    status: 'PAID',
    amount: testOrder.buyer_total,
    currency: 'IDR',
    paid_at: new Date().toISOString()
  };

  await asyncCheck('4.3 Valid Xendit webhook confirms payment and processes domain state', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/xendit',
      headers: {
        'x-callback-token': webhookSecret
      },
      body: validWebhookPayload
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json?.success, true);
    assert.strictEqual(res.json?.idempotent, false);
    assert.strictEqual(res.json?.event?.status, MONEY_STATE.PAID);
  });

  await asyncCheck('4.4 Duplicate webhook replay returns idempotent: true with zero double-entry duplicates', async () => {
    const beforePaymentsCount = (state.payments || []).length;
    const beforeLedgerCount = (state.financial_ledger || []).length;

    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/xendit',
      headers: {
        'x-callback-token': webhookSecret
      },
      body: validWebhookPayload
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json?.success, true);
    assert.strictEqual(res.json?.idempotent, true);

    const afterPaymentsCount = (state.payments || []).length;
    const afterLedgerCount = (state.financial_ledger || []).length;

    assert.strictEqual(afterPaymentsCount, beforePaymentsCount, 'Zero duplicate payment records');
    assert.strictEqual(afterLedgerCount, beforeLedgerCount, 'Zero duplicate financial ledger entries');
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: DOMAIN STATE & FINANCIAL LEDGER RECONCILIATION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 5: Domain State & Financial Ledger Reconciliation ──');

  check('5.1 Order transitions to PAID_PLATFORM_HELD (truthful non-escrow rail); listing to SOLD; ticket to ESCROWED', () => {
    const order = state.orders.find(o => o.id === testOrder.id);
    assert.ok(order);
    assert.strictEqual(order.status, ORDER_STATUS.PAID_PLATFORM_HELD, 'Order must be PAID_PLATFORM_HELD, never falsely claiming PAID_ESCROWED');
    assert.strictEqual(order.marketplace_status, 'PAID');
    assert.strictEqual(order.payment_money_state, MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT);
    assert.strictEqual(order.escrow_type, 'NONE_PLATFORM_CAPTURED');

    const canonical = (state.canonical_payments || []).find(p => p.order_id === testOrder.id);
    assert.ok(canonical);
    assert.strictEqual(canonical.money_state, MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT);
    assert.strictEqual(canonical.escrow_type, 'NONE_PLATFORM_CAPTURED');

    const listing = state.listings.find(l => l.id === testOrder.listing_id);
    assert.strictEqual(listing.status, 'SOLD');

    const ticket = state.tickets.find(t => t.id === testOrder.ticket_id);
    assert.strictEqual(ticket.status, 'ESCROWED');
  });

  check('5.2 Escrow record is held internally; provider_escrow_id is strictly NULL (zero fake provider escrow); seller payout locked', () => {
    const escrow = state.escrows.find(e => e.order_id === testOrder.id);
    assert.ok(escrow);
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(escrow.escrow_type, 'NONE_PLATFORM_CAPTURED');
    assert.strictEqual(escrow.provider_escrow_id, null, 'Provider escrow ID must be null for non-escrow rail Xendit');
    assert.strictEqual(escrow.released_at, null, 'Seller payout must remain locked until venue entry');
  });

  check('5.3 Double-entry Financial Ledger balances mathematically: sum(debits) === sum(credits)', () => {
    const ledger = state.financial_ledger || [];
    assert.ok(ledger.length >= 1, 'Must have at least 1 journal transaction in ledger');

    let totalDebits = 0;
    let totalCredits = 0;
    for (const tx of ledger) {
      if (tx.entries && Array.isArray(tx.entries)) {
        for (const entry of tx.entries) {
          const amt = parseInt(entry.amount || 0, 10);
          if (entry.type === 'DEBIT') totalDebits += amt;
          if (entry.type === 'CREDIT') totalCredits += amt;
        }
      } else {
        totalDebits += parseInt(tx.debit || 0, 10);
        totalCredits += parseInt(tx.credit || 0, 10);
      }
    }

    assert.ok(totalDebits > 0, 'Debits must be positive');
    assert.strictEqual(totalDebits, totalCredits, `Ledger must balance: ${totalDebits} vs ${totalCredits}`);
  });

  // ---------------------------------------------------------------------------
  // SECTION 6: NEGATIVE PATHS & TAMPERING GUARDS
  // ---------------------------------------------------------------------------
  console.log('\n── Section 6: Negative Paths & Tampering Guards ──');

  await asyncCheck('6.1 Tampered webhook amount is rejected with HTTP 422 AMOUNT_MISMATCH', async () => {
    const tamperedPayload = {
      id: `evt_tampered_${Date.now()}`,
      external_id: testOrder.id,
      status: 'PAID',
      amount: 9999999, // Tampered amount
      currency: 'IDR'
    };

    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/xendit',
      headers: {
        'x-callback-token': webhookSecret
      },
      body: tamperedPayload
    });

    assert.strictEqual(res.statusCode, 422);
    assert.strictEqual(res.json?.code, 'AMOUNT_MISMATCH');
  });

  await asyncCheck('6.2 Tampered webhook currency is rejected with HTTP 422 CURRENCY_MISMATCH', async () => {
    const tamperedCurrencyPayload = {
      id: `evt_tampered_curr_${Date.now()}`,
      external_id: testOrder.id,
      status: 'PAID',
      amount: testOrder.buyer_total,
      currency: 'USD' // Tampered currency
    };

    const res = await request({
      method: 'POST',
      path: '/api/v1/payments/webhook/xendit',
      headers: {
        'x-callback-token': webhookSecret
      },
      body: tamperedCurrencyPayload
    });

    assert.strictEqual(res.statusCode, 422);
    assert.strictEqual(res.json?.code, 'CURRENCY_MISMATCH');
  });

  // ---------------------------------------------------------------------------
  // SECTION 7: TRUTHFUL ESCROW CONTRACT & XENPLATFORM SEPARATION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 7: Truthful Escrow Contract & xenPlatform Separation ──');

  await asyncCheck('7.1 Attempting milestone escrow hold via Xendit throws CapabilityUnsupportedError', async () => {
    const xenditProvider = paymentManager.getProvider('xendit');
    await assert.rejects(async () => {
      await xenditProvider.createHold({ orderId: testOrder.id, amount: testOrder.buyer_total });
    }, (err) => {
      assert.ok(err instanceof CapabilityUnsupportedError);
      assert.ok(err.message.includes('ESCROW_UNAVAILABLE'));
      return true;
    });
  });

  await asyncCheck('7.2 xenPlatform wire HTTP calls: subaccounts, split rules, transfers work as intended', async () => {
    const xenditProvider = paymentManager.getProvider('xendit');

    interceptedXenditRequests = [];
    const subAcc = await xenditProvider.createSubAccount({
      email: 'langgam.seller@tikum.app',
      businessName: 'Langgam Seller Store',
      type: 'OWNED',
      country: 'ID'
    });
    assert.ok(subAcc);
    assert.ok(subAcc.accountId.startsWith('acc_wire_'));
    assert.strictEqual(interceptedXenditRequests.length, 1);
    assert.strictEqual(interceptedXenditRequests[0].url, '/v2/accounts');

    interceptedXenditRequests = [];
    const splitRule = await xenditProvider.createSplitRule({
      name: 'Marketplace Split 6%',
      routes: [
        { percent_amount: 6, destination_account_id: 'acc-treasury' },
        { percent_amount: 94, destination_account_id: subAcc.accountId }
      ]
    });
    assert.ok(splitRule);
    assert.ok(splitRule.splitRuleId.startsWith('split_wire_'));
    assert.strictEqual(interceptedXenditRequests.length, 1);
    assert.strictEqual(interceptedXenditRequests[0].url, '/split_rules');

    interceptedXenditRequests = [];
    const trf = await xenditProvider.transferBetweenAccounts({
      sourceAccountId: 'acc-platform',
      destinationAccountId: subAcc.accountId,
      amount: 470000,
      currency: 'IDR'
    });
    assert.ok(trf);
    assert.ok(trf.transferId.startsWith('trf_wire_'));
    assert.strictEqual(interceptedXenditRequests.length, 1);
    assert.strictEqual(interceptedXenditRequests[0].url, '/transfers');
  });

  // ---------------------------------------------------------------------------
  // SECTION 8: PRODUCTION FAIL-CLOSED SAFETY GATES
  // ---------------------------------------------------------------------------
  console.log('\n── Section 8: Production Fail-Closed Safety Gates ──');

  check('8.1 Production safety gates remain enforced; zero real money moved', () => {
    const sysStatus = PaymentService.getSubsystemStatus();
    assert.strictEqual(sysStatus.safety_gates.NO_REAL_PAYMENT, true);
    assert.strictEqual(sysStatus.safety_gates.NO_REAL_SETTLEMENT, true);
    assert.strictEqual(sysStatus.safety_gates.NO_FAKE_PAYMENT_SUCCESS, true);
    assert.strictEqual(sysStatus.safety_gates.NO_FAKE_ESCROW_BALANCE, true);
    assert.strictEqual(sysStatus.safety_gates.NO_FAKE_GMV, true);
    assert.strictEqual(sysStatus.marketplace_financial_state.real_money_active, false);
  });

  check('8.2 DOKU remains primary default provider; Xendit is strictly Tier 2B backup', () => {
    const resolved = PaymentRoutingService.resolveProvider({ countryCode: 'ID', currency: 'IDR' });
    assert.strictEqual(resolved.providerName, 'doku');
    assert.strictEqual(resolved.tier, 'TIER_1A_PRIMARY');
  });

  // Cleanup servers
  await new Promise(r => server.close(r));
  await new Promise(r => mockXenditServer.close(r));

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} XENDIT SANDBOX SMOKE TESTS PASSED!`);
  console.log('================================================================\n');
}

runSuite().catch(err => {
  console.error('Fatal Smoke Test Error:', err);
  if (server) server.close();
  if (mockXenditServer) mockXenditServer.close();
  process.exit(1);
});
