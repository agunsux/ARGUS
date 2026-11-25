'use strict';

/**
 * TIKUM / ARGUS — Sub-Phase 3A DOKU Sandbox Hardening & Durable Idempotency Suite
 *
 * Deterministic (<10s, zero external network) integration tests verifying:
 *  1. Sandbox defaults (DOKU_ENV=sandbox, DOKU_BASE_URL=https://api-sandbox.doku.com) & .env.example docs
 *  2. Checkout V1 (POST /checkout/v1/payment): integer IDR amount, invoice_number <= 30 chars,
 *     exact Ticket + TIKUM Buyer Service Fee line_items math (fail-closed), additional_info.hold_settlement,
 *     and strict separation of provider_settlement_status vs internal_settlement_status
 *  3. Webhook normalization: DokuPaymentProvider.parseWebhook nested order.currency + IPaymuProvider.parseWebhook
 *  4. GET /orders/v1/status/{invoice_number}: valid GET HMAC-SHA256 without Digest + 4-status normalization
 *  5. POST /finance/v1/release with optional override_settlement
 *  6. Pre-call durable idempotency: concurrent Promise.all, cold-start state.* wipe, cross-key conflict,
 *     and timeout/failure before session issuance marking claim FAILED_RETRYABLE so buyer can retry cleanly
 *  7. Webhook verification (401 on tampered body), rotating Request-Id cold-start capture deduplication on
 *     (order_id, provider_reference), FAILED non-cancellation durable audit, ORDER_EXPIRED inventory release,
 *     and 4-status inquiry reconciliation + Guarded Release Settlement (VERIFICATION_REQUIRED,
 *     OPEN_DISPUTE_BLOCK, AUTHORIZATION_REQUIRED Maker-Checker verified & consumed).
 */

process.env.NODE_ENV = 'test';
delete process.env.TEST_DATABASE_URL;
delete process.env.TEST_DATABASE_SCHEMA;
delete process.env.DATABASE_URL;
delete process.env.ACTIVE_FEE_POLICY_VERSION;
delete process.env.TIKUM_PRICING_POLICY;

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { state, resetDatabase, bootstrapAdminUser } = require('./src/database');
const { getMoneyRepository, getMarketplaceRepository, getUserRepository } = require('./src/storage');
const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');
const { IPaymuProvider } = require('./src/services/payment/IPaymuProvider');
const { paymentManager } = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { ListingService } = require('./src/services/listingService');
const { EscrowService } = require('./src/services/escrowService');
const { LedgerVerificationService } = require('./src/settlement/LedgerVerificationService');
const { FinancialAuthorizationService, AUTHORIZATION_ACTION } = require('./src/settlement/FinancialAuthorizationService');
const { TrustPolicyEngine, ATTESTATION_TYPE } = require('./src/trust/TrustPolicyEngine');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');

const CLIENT_ID = 'BRN-SANDBOX-TEST-001';
const SECRET_KEY = 'SK-SANDBOX-TEST-SECRET-32BYTES-MIN';

let passed = 0;
let seq = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.stack || err.message}`);
    throw err;
  }
}

function verifyDokuHmacHeader({ headers, method, target, rawBody, secretKey }) {
  const clientId = headers['client-id'] || '';
  const reqId = headers['request-id'] || '';
  const reqTs = headers['request-timestamp'] || '';
  const sig = headers['signature'] || '';
  const lines = [
    `Client-Id:${clientId}`,
    `Request-Id:${reqId}`,
    `Request-Timestamp:${reqTs}`,
    `Request-Target:${target}`
  ];
  if (method !== 'GET' && rawBody) {
    const digest = crypto.createHash('sha256').update(rawBody, 'utf8').digest('base64');
    assert.equal(headers['digest'], digest, `Digest header mismatch for ${method} ${target}`);
    lines.push(`Digest:${digest}`);
  } else {
    assert.equal(headers['digest'], undefined, `GET ${target} must NOT include Digest header`);
  }
  const expected = 'HMACSHA256=' + crypto.createHmac('sha256', secretKey).update(lines.join('\n')).digest('base64');
  assert.equal(sig, expected, `Invalid DOKU HMAC signature for ${method} ${target}`);
}

function buildSignedWebhookHeaders({ bodyObj, target = '/api/webhooks/doku', requestId = nextId('req'), clientId = CLIENT_ID, secretKey = SECRET_KEY }) {
  const rawBody = JSON.stringify(bodyObj);
  const digest = crypto.createHash('sha256').update(rawBody, 'utf8').digest('base64');
  const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const sigComponent = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${timestamp}`,
    `Request-Target:${target}`,
    `Digest:${digest}`
  ].join('\n');
  const signature = 'HMACSHA256=' + crypto.createHmac('sha256', secretKey).update(sigComponent).digest('base64');
  return {
    rawBody,
    headers: {
      'client-id': clientId,
      'request-id': requestId,
      'request-timestamp': timestamp,
      'request-target': target,
      'digest': digest,
      'signature': signature
    }
  };
}

async function seedActorsAndEvent() {
  resetDatabase();
  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
  state.events = state.events || [];
  state.events.push({
    id: 'event-doku-3a',
    event_id: 'event-doku-3a',
    slug: 'event-doku-3a',
    title: 'DOKU 3A Concert',
    name: 'DOKU 3A Concert',
    canonical_name: 'DOKU 3A Concert',
    venue_id: 'venue-doku-3a',
    venue_name: 'Senayan Hall',
    city: 'Jakarta',
    date: futureDate.slice(0, 10),
    start_date: futureDate.slice(0, 10),
    start_datetime: futureDate,
    end_date: futureDate.slice(0, 10),
    end_datetime: futureDate,
    timezone: 'Asia/Jakarta',
    is_verified: true,
    verification_status: 'VERIFIED',
    source_url: 'https://tikum.app/events/event-doku-3a',
    evidence_hash: 'evh-doku-3a',
    verified_at: new Date().toISOString(),
    lifecycle_status: 'UPCOMING',
    status: 'UPCOMING',
    archive_status: 'ACTIVE',
    is_pilot: true,
    pilot_approved: true
  });
  state.venues = state.venues || [];
  state.venues.push({ id: 'venue-doku-3a', name: 'Senayan Hall', city: 'Jakarta', gate_info: 'Gate A' });

  const users = [
    {
      id: 'seller-3a',
      email: 'seller-3a@tikum.test',
      name: 'Seller 3A',
      role: 'SELLER',
      status: 'ACTIVE',
      email_verified: true,
      phone: '+62811000333',
      kyc_status: 'VERIFIED',
      bank_account_details: 'BCA 1234567890 a.n. Seller 3A',
      metadata: {
        city: 'Jakarta',
        payout_bank_name: 'BCA',
        payout_account_number: '1234567890',
        identity_doc_ref: 'ktp-seller-3a'
      }
    },
    {
      id: 'buyer-3a',
      email: 'buyer-3a@tikum.test',
      name: 'Buyer 3A',
      role: 'BUYER',
      status: 'ACTIVE',
      email_verified: true
    }
  ];
  state.users = state.users || [];
  const userRepo = getUserRepository();
  for (const u of users) {
    state.users.push(u);
    if (userRepo && typeof userRepo.createUser === 'function') {
      await userRepo.createUser(u).catch(() => null);
    }
  }
  state.seller_profiles = state.seller_profiles || [];
  state.seller_profiles.push({
    user_id: 'seller-3a',
    kyc_status: 'VERIFIED',
    active_listing_limit: 50,
    bank_account_details: 'BCA 1234567890 a.n. Seller 3A'
  });
  bootstrapAdminUser();
}

async function createV2Order({ fulfillmentType = 'TIKUM_VENUE_PIC', price = 250000, quantity = 2 } = {}) {
  const created = await ListingService.createListing({
    sellerId: 'seller-3a',
    eventId: 'event-doku-3a',
    seatInfo: `CAT1 - ${nextId('seat')}`,
    faceValue: price,
    price,
    quantity,
    rawBarcode: `BC-${nextId('bar')}`,
    bypassPilotBounds: true,
    fulfillmentType,
    policyVersion: 'V2_DUAL_TIER'
  });
  await ListingService.verifyListing(created.listing.id, 'admin-1', { approved: true });
  created.listing.pricing_policy_version = 'V2_DUAL_TIER';
  const mktRepo = getMarketplaceRepository();
  if (typeof mktRepo.updateListing === 'function') {
    await mktRepo.updateListing(created.listing.id, { pricing_policy_version: 'V2_DUAL_TIER' });
  }
  const { order } = await EscrowService.createOrder({
    buyerId: 'buyer-3a',
    listingId: created.listing.id,
    quantity,
    policyVersion: 'V2_DUAL_TIER',
    taxPolicyVersion: 'ZERO-TAX-TEST'
  });
  return { listing: created.listing, order };
}

function passAllTrustGates(order) {
  state.entry_verifications = state.entry_verifications || [];
  state.entry_verifications.push({
    id: `ev-${order.id}`,
    order_id: order.id,
    pic_id: 'pic-1',
    status: 'CONFIRMED',
    verified_at: new Date().toISOString()
  });
  TrustPolicyEngine.recordAttestation({ orderId: order.id, attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION, actorId: 'system', actorRole: 'system', result: 'PASS' });
  TrustPolicyEngine.recordAttestation({ orderId: order.id, attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION, actorId: 'system', actorRole: 'system', result: 'PASS' });
  TrustPolicyEngine.recordAttestation({ orderId: order.id, attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION, actorId: 'system', actorRole: 'system', result: 'PASS' });
  TrustPolicyEngine.recordAttestation({ orderId: order.id, attestationType: ATTESTATION_TYPE.PIC_ATTESTATION, actorId: 'pic-1', actorRole: 'pic', result: 'PASS' });
  TrustPolicyEngine.recordAttestation({ orderId: order.id, attestationType: ATTESTATION_TYPE.VENUE_ENTRY_ATTESTATION, actorId: 'pic-1', actorRole: 'pic', result: 'PASS' });
  TrustPolicyEngine.recordAttestation({ orderId: order.id, attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION, actorId: order.buyer_id, actorRole: 'buyer', result: 'PASS' });
  TrustPolicyEngine.recordAttestation({ orderId: order.id, attestationType: ATTESTATION_TYPE.SELLER_ATTESTATION, actorId: order.seller_id, actorRole: 'seller', result: 'PASS' });
}

function wipeColdStartVolatileState() {
  state.canonical_payments = [];
  state.provider_webhooks = [];
  if (state.processed_webhooks) state.processed_webhooks.clear();
  state.payment_attempts = [];
  state.orders = [];
  state.escrows = [];
  state.financial_ledger = [];
}

async function run() {
  const prevMarketplaceMode = process.env.MARKETPLACE_MODE;
  const prevDokuEnv = process.env.DOKU_ENV;
  const prevDokuBase = process.env.DOKU_BASE_URL;
  const prevHoldEnabled = process.env.DOKU_HOLD_SETTLEMENT_ENABLED;

  // Mock DOKU Sandbox HTTP server
  const recorder = {
    checkoutHits: 0,
    statusHits: 0,
    releaseHits: 0,
    lastCheckoutBody: null,
    lastReleaseBody: null,
    failNextCheckout: false,
    statusByInvoice: new Map()
  };

  const mockServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const urlPath = req.url.split('?')[0];
      try {
        verifyDokuHmacHeader({
          headers: req.headers,
          method: req.method,
          target: urlPath,
          rawBody,
          secretKey: SECRET_KEY
        });
      } catch (sigErr) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: sigErr.message }));
        return;
      }

      if (req.method === 'POST' && urlPath === '/checkout/v1/payment') {
        recorder.checkoutHits += 1;
        if (recorder.failNextCheckout) {
          recorder.failNextCheckout = false;
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Simulated upstream sandbox timeout' }));
          return;
        }
        const body = JSON.parse(rawBody);
        recorder.lastCheckoutBody = body;
        const inv = body.order.invoice_number;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: ['SUCCESS'],
          response: {
            order: { invoice_number: inv, amount: body.order.amount },
            payment: {
              url: `https://sandbox.doku.com/checkout/v2/${inv}`,
              expired_date: '2099-01-01T00:00:00Z'
            }
          }
        }));
        return;
      }

      if (req.method === 'GET' && urlPath.startsWith('/orders/v1/status/')) {
        recorder.statusHits += 1;
        const inv = decodeURIComponent(urlPath.slice('/orders/v1/status/'.length));
        const stub = recorder.statusByInvoice.get(inv) || {
          order: { invoice_number: inv, amount: 0, currency: 'IDR', status: 'ORDER_GENERATED' },
          transaction: { status: 'PENDING', transaction_id: `doku-trx-${inv}` }
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stub));
        return;
      }

      if (req.method === 'POST' && urlPath === '/finance/v1/release') {
        recorder.releaseHits += 1;
        const body = JSON.parse(rawBody);
        recorder.lastReleaseBody = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          order: { invoice_number: body.order.invoice_number, amount: body.order.amount, currency: body.order.currency },
          transaction: { original_request_id: body.transaction.original_request_id, settlement_amount: body.order.amount }
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `Unexpected path: ${req.method} ${urlPath}` }));
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;

  const sandboxProvider = new DokuPaymentProvider({
    clientId: CLIENT_ID,
    secretKey: SECRET_KEY,
    webhookSecret: SECRET_KEY,
    apiBaseUrl: mockBaseUrl,
    env: 'sandbox',
    allowSimulation: false,
    holdReleaseEnabled: true,
    contractVerified: true,
    kycVerified: true,
    sandboxTested: true
  });
  paymentManager.registerProvider(sandboxProvider);

  try {
    console.log('\n====================================================================');
    console.log('  TIKUM / ARGUS — SUB-PHASE 3A DOKU SANDBOX INTEGRATION SUITE');
    console.log('====================================================================\n');

    await check('1. Env defaults & .env.example DOKU sandbox configuration documentation', async () => {
      const envExample = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
      for (const requiredKey of [
        'PAYMENT_PROVIDER=',
        'DOKU_ENV=sandbox',
        'DOKU_BASE_URL=https://api-sandbox.doku.com',
        'DOKU_CLIENT_ID=',
        'DOKU_SECRET_KEY=',
        'DOKU_CALLBACK_URL=',
        'DOKU_RETURN_URL=',
        'DOKU_HOLD_SETTLEMENT_ENABLED=',
        'DOKU_PAYMENT_DUE_MINUTES=',
        'ACTIVE_FEE_POLICY_VERSION=',
        'MARKETPLACE_MODE=PRELAUNCH_LISTING_ONLY'
      ]) {
        assert.ok(envExample.includes(requiredKey), `.env.example missing ${requiredKey}`);
      }
      const savedEnv = process.env.DOKU_ENV;
      const savedBase = process.env.DOKU_BASE_URL;
      const savedSandboxBase = process.env.DOKU_SANDBOX_BASE_URL;
      const savedApiBase = process.env.DOKU_API_BASE_URL;
      try {
        delete process.env.DOKU_ENV;
        delete process.env.DOKU_BASE_URL;
        delete process.env.DOKU_SANDBOX_BASE_URL;
        delete process.env.DOKU_API_BASE_URL;
        const freshDefault = new DokuPaymentProvider();
        assert.equal(freshDefault.env, 'sandbox');
        assert.equal(freshDefault.apiBaseUrl, 'https://api-sandbox.doku.com');
        const blockedProd = new DokuPaymentProvider({ env: 'production', apiBaseUrl: 'https://api.doku.com', allowSimulation: false });
        assert.equal(blockedProd.productionHostRejected, true);
      } finally {
        if (savedEnv !== undefined) process.env.DOKU_ENV = savedEnv; else delete process.env.DOKU_ENV;
        if (savedBase !== undefined) process.env.DOKU_BASE_URL = savedBase; else delete process.env.DOKU_BASE_URL;
        if (savedSandboxBase !== undefined) process.env.DOKU_SANDBOX_BASE_URL = savedSandboxBase; else delete process.env.DOKU_SANDBOX_BASE_URL;
        if (savedApiBase !== undefined) process.env.DOKU_API_BASE_URL = savedApiBase; else delete process.env.DOKU_API_BASE_URL;
      }
    });

    await check('2. Checkout V1 adapter itemization, invoice <= 30 chars, hold_settlement, & status separation', async () => {
      process.env.DOKU_HOLD_SETTLEMENT_ENABLED = 'true';
      const beforeHits = recorder.checkoutHits;
      const out = await sandboxProvider.createPayment({
        orderId: 'ord-chk-3a-01',
        amount: 545000,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a', name: 'Buyer 3A', email: 'buyer-3a@tikum.test' },
        metadata: {
          quantity: 2,
          unit_listing_price: 250000,
          buyer_fee_per_ticket: 22500,
          fulfillment_type: 'TIKUM_VENUE_PIC'
        }
      });
      assert.equal(recorder.checkoutHits, beforeHits + 1);
      assert.ok(recorder.lastCheckoutBody.order.invoice_number.length <= 30);
      assert.match(recorder.lastCheckoutBody.order.invoice_number, /^[A-Za-z0-9-]+$/);
      assert.equal(recorder.lastCheckoutBody.order.amount, 545000);
      assert.deepEqual(recorder.lastCheckoutBody.order.line_items, [
        { name: 'Ticket', quantity: 2, price: 250000 },
        { name: 'TIKUM Buyer Service Fee - TIKUM_VENUE_PIC', quantity: 2, price: 22500 }
      ]);
      assert.deepEqual(recorder.lastCheckoutBody.additional_info, { hold_settlement: true });
      assert.equal(out.provider_settlement_status, 'UNKNOWN');
      assert.equal(out.internal_settlement_status, 'PAYMENT_PENDING');

      process.env.DOKU_HOLD_SETTLEMENT_ENABLED = 'false';
      await sandboxProvider.createPayment({
        orderId: 'ord-chk-3a-02',
        amount: 212000,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a' },
        metadata: {
          quantity: 2,
          unit_listing_price: 100000,
          buyer_fee_per_ticket: 6000,
          fulfillment_type: 'SELLER_MANAGED'
        }
      });
      assert.equal(recorder.lastCheckoutBody.additional_info, undefined, 'hold_settlement must be omitted when flag is false');
      process.env.DOKU_HOLD_SETTLEMENT_ENABLED = 'true';

      const hitsBeforeNeg = recorder.checkoutHits;
      await assert.rejects(
        () => sandboxProvider.createPayment({
          orderId: 'ord-bad-sum',
          amount: 550000,
          currency: 'IDR',
          channel: 'DOKU_CHECKOUT',
          metadata: { quantity: 2, unit_listing_price: 250000, buyer_fee_per_ticket: 22500, fulfillment_type: 'TIKUM_VENUE_PIC' }
        }),
        err => err.code === 'INVALID_CHECKOUT_ITEMIZATION'
      );
      await assert.rejects(
        () => sandboxProvider.createPayment({
          orderId: 'ord-too-long-uuid-order-identifier-1234567890',
          amount: 545000,
          currency: 'IDR',
          channel: 'DOKU_CHECKOUT',
          metadata: { quantity: 2, unit_listing_price: 250000, buyer_fee_per_ticket: 22500, fulfillment_type: 'TIKUM_VENUE_PIC' }
        }),
        err => err.code === 'INVALID_CHECKOUT_INVOICE'
      );
      assert.equal(recorder.checkoutHits, hitsBeforeNeg, 'Fail-closed guards must reject prior to HTTP transport');
    });

    await check('3. Webhook parser checks: DokuPaymentProvider nested order.currency & IPaymuProvider currency/eventId', async () => {
      const dokuParsed = sandboxProvider.parseWebhook({
        order: { invoice_number: 'INV-DOKU-ord-w1', amount: 265000, currency: 'SGD' },
        currency: 'USD',
        transaction: { status: 'SUCCESS', transaction_id: 'doku-tx-991' }
      }, { 'request-id': 'req-wh-991' });
      assert.equal(dokuParsed.currency, 'SGD', 'Must prioritize nested payload.order.currency before fallback');
      assert.equal(dokuParsed.orderId, 'ord-w1');
      assert.equal(dokuParsed.providerReference, 'doku-tx-991');
      assert.equal(dokuParsed.status, MONEY_STATE.PAID);

      const ipaymu = new IPaymuProvider({ apiKey: 'k', virtualAccount: 'v', allowSimulation: true });
      const ipParsed = ipaymu.parseWebhook({ trx_id: 'ip-101', reference_id: 'ord-ip-1', status: 'berhasil', amount: 150000, currency: 'IDR' }, {});
      assert.equal(ipParsed.currency, 'IDR');
      assert.ok(ipParsed.providerEventId && ipParsed.providerEventId.startsWith('ipaymu-'), 'Deterministic providerEventId expected');
    });

    await check('4. GET /orders/v1/status/{invoice_number}: valid GET HMAC (no Digest) & 4-status normalization', async () => {
      const inv = 'INV-DOKU-STAT-4';
      const expectedByStatus = [
        [{ order: { invoice_number: inv, amount: 100000, currency: 'IDR', status: 'ORDER_GENERATED' }, transaction: { status: 'PENDING' } }, MONEY_STATE.PAYMENT_PENDING, 'ORDER_GENERATED'],
        [{ order: { invoice_number: inv, amount: 100000, currency: 'IDR', status: 'ORDER_EXPIRED' }, transaction: { status: 'EXPIRED' } }, MONEY_STATE.PAYMENT_EXPIRED, 'ORDER_EXPIRED'],
        [{ order: { invoice_number: inv, amount: 100000, currency: 'IDR', status: 'ORDER_RECOVERED' }, transaction: { status: 'PENDING' } }, MONEY_STATE.PAYMENT_PENDING, 'ORDER_RECOVERED'],
        [{ order: { invoice_number: inv, amount: 100000, currency: 'IDR', status: 'ORDER_GENERATED' }, transaction: { status: 'SUCCESS', transaction_id: 'trx-ok-4' } }, MONEY_STATE.PAID, 'SUCCESS']
      ];
      for (const [stub, expState, expNorm] of expectedByStatus) {
        recorder.statusByInvoice.set(inv, stub);
        const res = await sandboxProvider.getPaymentStatus({ orderId: 'STAT-4', invoiceNumber: inv });
        assert.equal(res.status, expState);
        assert.equal(res.normalizedStatus, expNorm);
      }
    });

    await check('5. POST /finance/v1/release supports optional override_settlement & separates settlement fields', async () => {
      const splitObj = { seller_amount: 450000, platform_fee: 50000 };
      const rel = await sandboxProvider.executeRelease({
        invoiceNumber: 'INV-REL-1',
        amount: 500000,
        currency: 'IDR',
        originalRequestId: 'orig-req-1',
        orderId: 'ord-rel-1',
        override_settlement: splitObj
      });
      assert.deepEqual(recorder.lastReleaseBody.override_settlement, splitObj);
      assert.equal(rel.status, 'RELEASE_REQUESTED');
      assert.equal(rel.provider_settlement_status, 'REQUEST_ACCEPTED_UNCONFIRMED');
      assert.equal(rel.internal_settlement_status, 'UNSPECIFIED');
    });

    await seedActorsAndEvent();

    // Verify PRELAUNCH_LISTING_ONLY mode gate before switching LIVE for transaction integration tests
    await check('6a. PRELAUNCH_LISTING_ONLY strictly blocks PaymentService.createPayment', async () => {
      process.env.MARKETPLACE_MODE = 'PRELAUNCH_LISTING_ONLY';
      await assert.rejects(
        () => PaymentService.createPayment({ orderId: 'any', amount: 100000 }),
        err => err.code === 'MARKETPLACE_PRELAUNCH_ONLY'
      );
    });

    process.env.MARKETPLACE_MODE = 'LIVE';

    await check('6b. Pre-call durable idempotency: concurrent calls, cold start, cross-key conflict, & timeout recovery', async () => {
      const { order } = await createV2Order({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 250000, quantity: 2 });
      const amount = order.buyer_total; // 545000 (250k*2 + 9%*250k*2 = 545000)

      // Inject 1st attempt timeout -> must mark retryable FAILED_RETRYABLE and NOT permanently lock buyer
      const hitsBeforeFail = recorder.checkoutHits;
      recorder.failNextCheckout = true;
      await assert.rejects(
        () => PaymentService.createPayment({
          orderId: order.id,
          amount,
          currency: 'IDR',
          channel: 'DOKU_CHECKOUT',
          buyer: { id: 'buyer-3a', name: 'Buyer 3A', email: 'buyer-3a@tikum.test' },
          idempotencyKey: 'key-retry-1'
        }),
        err => err.status === 504 || /timeout/i.test(err.message)
      );
      assert.equal(recorder.checkoutHits, hitsBeforeFail + 1);
      const claimAfterFail = await getMoneyRepository().checkIdempotency(
        `payment-order-${crypto.createHash('sha256').update(String(order.id)).digest('hex')}`,
        'PAYMENT_CREATE'
      );
      assert.equal(claimAfterFail.status, 'FAILED_RETRYABLE', 'Failed attempt prior to session issuance must be retryable');

      // Retry + 2 concurrent callers -> ALL converge on 1 checkout session (1 HTTP POST call total for retry!)
      const hitsBeforeConcurrent = recorder.checkoutHits;
      const results = await Promise.all([
        PaymentService.createPayment({ orderId: order.id, amount, currency: 'IDR', channel: 'DOKU_CHECKOUT', buyer: { id: 'buyer-3a' }, idempotencyKey: 'key-conc-1' }),
        PaymentService.createPayment({ orderId: order.id, amount, currency: 'IDR', channel: 'DOKU_CHECKOUT', buyer: { id: 'buyer-3a' }, idempotencyKey: 'key-conc-2' }),
        PaymentService.createPayment({ orderId: order.id, amount, currency: 'IDR', channel: 'DOKU_CHECKOUT', buyer: { id: 'buyer-3a' }, idempotencyKey: 'key-conc-3' })
      ]);
      assert.equal(recorder.checkoutHits, hitsBeforeConcurrent + 1, 'Concurrent calls on active order must hit DOKU Checkout once');
      const uniquePaymentIds = new Set(results.map(r => r.paymentId));
      const uniqueUrls = new Set(results.map(r => r.payment_url));
      assert.equal(uniquePaymentIds.size, 1);
      assert.equal(uniqueUrls.size, 1);
      assert.ok(results[0].invoice_number && results[0].invoice_number.length <= 30, 'Derived UUID Checkout invoice_number must be <= 30 chars');
      assert.equal(results[0].provider, 'doku');
      assert.equal(results[0].provider_env, 'sandbox');
      assert.ok(results[0].doku_original_request_id);
      assert.equal(results[0].provider_settlement_status, 'UNKNOWN');
      assert.equal(results[0].internal_settlement_status, 'PAYMENT_PENDING');

      // Cold-start simulation (wipe volatile state.*) + cross-key call must return same session & NOT call DOKU again
      wipeColdStartVolatileState();
      const coldReplay = await PaymentService.createPayment({
        orderId: order.id,
        amount,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a' },
        idempotencyKey: 'key-after-cold-start'
      });
      assert.equal(coldReplay.idempotent, true);
      assert.equal(coldReplay.paymentId, results[0].paymentId);
      assert.equal(recorder.checkoutHits, hitsBeforeConcurrent + 1, 'Cold-start replay must NOT create second checkout session');

      // Amount conflict across keys on active order rejects deterministically
      await assert.rejects(
        () => PaymentService.createPayment({
          orderId: order.id,
          amount: amount + 1000,
          currency: 'IDR',
          channel: 'DOKU_CHECKOUT',
          idempotencyKey: 'key-wrong-amount'
        }),
        err => err.code === 'PAYMENT_ATTEMPT_CONFLICT'
      );

      // Reusing same explicit idempotencyKey across DIFFERENT orders rejects deterministically
      const { order: otherOrder } = await createV2Order({ fulfillmentType: 'SELLER_MANAGED', price: 100000, quantity: 1 });
      await assert.rejects(
        () => PaymentService.createPayment({
          orderId: otherOrder.id,
          amount: otherOrder.buyer_total,
          currency: 'IDR',
          channel: 'DOKU_CHECKOUT',
          idempotencyKey: 'key-conc-1'
        }),
        err => err.code === 'IDEMPOTENCY_KEY_CONFLICT'
      );
      assert.equal(recorder.checkoutHits, hitsBeforeConcurrent + 1);
    });

    await check('7. Webhook tampered body 401, FAILED non-cancellation durable audit, & rotating Request-Id cold-start dedup', async () => {
      const { listing, order } = await createV2Order({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 200000, quantity: 1 });
      const checkout = await PaymentService.createPayment({
        orderId: order.id,
        amount: order.buyer_total,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a' },
        idempotencyKey: nextId('idem-wh')
      });
      const inv = checkout.invoice_number;

      // Tampered body with original HMAC -> must fail 401 INVALID_WEBHOOK_SIGNATURE
      const origWhBody = {
        order: { invoice_number: inv, amount: order.buyer_total, currency: 'IDR' },
        transaction: { status: 'SUCCESS', transaction_id: `trx-${inv}` }
      };
      const signedOk = buildSignedWebhookHeaders({ bodyObj: origWhBody });
      await assert.rejects(
        () => PaymentService.handleWebhook({
          providerName: 'doku',
          headers: signedOk.headers,
          body: { ...origWhBody, order: { ...origWhBody.order, amount: 1 } }
        }),
        err => err.code === 'INVALID_WEBHOOK_SIGNATURE' && err.status === 401
      );

      // Non-expired FAILED webhook -> stores last_payment_attempt_status = 'FAILED' durably, keeps order & inventory active
      const failBody = {
        order: { invoice_number: inv, amount: order.buyer_total, currency: 'IDR' },
        transaction: { status: 'FAILED', transaction_id: `trx-fail-${inv}` }
      };
      const failSigned = buildSignedWebhookHeaders({ bodyObj: failBody, requestId: 'req-wh-fail-1' });
      await PaymentService.handleWebhook({
        providerName: 'doku',
        headers: failSigned.headers,
        body: failBody,
        rawBodyBuffer: Buffer.from(failSigned.rawBody, 'utf8')
      });
      const durableAfterFail = await getMoneyRepository().getPaymentByOrderId(order.id);
      assert.equal(durableAfterFail.metadata.last_payment_attempt_status, 'FAILED');
      const dbOrdAfterFail = await getMoneyRepository().getOrderById(order.id);
      assert.equal(dbOrdAfterFail.status, 'PENDING_PAYMENT', 'Declined attempt must NOT cancel active Checkout order');
      assert.equal(listing.available_quantity, 0, 'Declined attempt must NOT release reserved inventory');

      // Valid SUCCESS webhook -> server-to-server inquiry confirms PAID -> 1 CAPTURE ledger tx
      const trxId = `doku-trx-paid-${inv}`;
      const paidBody = {
        order: { invoice_number: inv, amount: order.buyer_total, currency: 'IDR' },
        transaction: { status: 'SUCCESS', transaction_id: trxId }
      };
      recorder.statusByInvoice.set(inv, {
        order: { invoice_number: inv, amount: order.buyer_total, currency: 'IDR', status: 'ORDER_GENERATED' },
        transaction: { status: 'SUCCESS', transaction_id: trxId }
      });
      const paidSigned1 = buildSignedWebhookHeaders({ bodyObj: paidBody, requestId: 'req-wh-paid-rot-1' });
      const cap1 = await PaymentService.handleWebhook({
        providerName: 'doku',
        headers: paidSigned1.headers,
        body: paidBody,
        rawBodyBuffer: Buffer.from(paidSigned1.rawBody, 'utf8')
      });
      assert.equal(cap1.idempotent, false);

      // Wipe volatile state.* (cold start) AND rotate Request-Id -> must deduplicate via durable (order_id, provider_reference)
      wipeColdStartVolatileState();
      const statusHitsBeforeReplay = recorder.statusHits;
      const paidSigned2 = buildSignedWebhookHeaders({ bodyObj: paidBody, requestId: 'req-wh-paid-rot-2' });
      const cap2 = await PaymentService.handleWebhook({
        providerName: 'doku',
        headers: paidSigned2.headers,
        body: paidBody,
        rawBodyBuffer: Buffer.from(paidSigned2.rawBody, 'utf8')
      });
      assert.equal(cap2.idempotent, true);
      assert.equal(cap2.deduplicatedBy, 'ORDER_PROVIDER_REF');
      assert.equal(recorder.statusHits, statusHitsBeforeReplay, 'Deduplicated replay should not double-capture');

      const captures = await getMoneyRepository().getLedgerTransactionsWithEntriesByOrderId(order.id, 'CAPTURE');
      assert.equal(captures.length, 1);
      const ledgerVerify = await LedgerVerificationService.verifyDurableCapture(order.id);
      assert.equal(ledgerVerify.verified, true);
    });

    await check('8. Inquiry reconciliation handles ORDER_GENERATED, ORDER_EXPIRED (+ inventory release), ORDER_RECOVERED, & SUCCESS', async () => {
      // 8a. ORDER_GENERATED -> ORDER_EXPIRED -> ORDER_RECOVERED
      const { listing: listExp, order: ordExp } = await createV2Order({ fulfillmentType: 'SELLER_MANAGED', price: 150000, quantity: 2 });
      assert.equal(listExp.available_quantity, 0);
      const chkExp = await PaymentService.createPayment({
        orderId: ordExp.id,
        amount: ordExp.buyer_total,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a' },
        idempotencyKey: nextId('idem-exp')
      });
      const invExp = chkExp.invoice_number;

      recorder.statusByInvoice.set(invExp, {
        order: { invoice_number: invExp, amount: ordExp.buyer_total, currency: 'IDR', status: 'ORDER_GENERATED' },
        transaction: { status: 'PENDING' }
      });
      const recGen = await PaymentService.reconcileDokuOrderStatus({ orderId: ordExp.id });
      assert.equal(recGen.action, 'KEPT_PENDING');
      assert.equal((await getMoneyRepository().getOrderById(ordExp.id)).status, 'PENDING_PAYMENT');

      recorder.statusByInvoice.set(invExp, {
        order: { invoice_number: invExp, amount: ordExp.buyer_total, currency: 'IDR', status: 'ORDER_EXPIRED' },
        transaction: { status: 'EXPIRED' }
      });
      const recExp = await PaymentService.reconcileDokuOrderStatus({ orderId: ordExp.id });
      assert.equal(recExp.action, 'EXPIRED_AND_INVENTORY_RELEASED');
      assert.equal((await getMoneyRepository().getOrderById(ordExp.id)).status, 'EXPIRED');
      assert.equal(listExp.available_quantity, 2, 'ORDER_EXPIRED reconciliation must release listing inventory back to available');

      recorder.statusByInvoice.set(invExp, {
        order: { invoice_number: invExp, amount: ordExp.buyer_total, currency: 'IDR', status: 'ORDER_RECOVERED' },
        transaction: { status: 'PENDING' }
      });
      const recRecov = await PaymentService.reconcileDokuOrderStatus({ orderId: ordExp.id });
      assert.equal(recRecov.action, 'RECOVERY_RECORDED');
      assert.equal(listExp.available_quantity, 2, 'ORDER_RECOVERED must not corrupt inventory');

      // 8b. SUCCESS inquiry -> unified capture + LedgerVerificationService.verifyDurableCapture (and idempotent on re-run)
      const { order: ordInq } = await createV2Order({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 300000, quantity: 1 });
      const chkInq = await PaymentService.createPayment({
        orderId: ordInq.id,
        amount: ordInq.buyer_total,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a' },
        idempotencyKey: nextId('idem-inq')
      });
      const invInq = chkInq.invoice_number;
      recorder.statusByInvoice.set(invInq, {
        order: { invoice_number: invInq, amount: ordInq.buyer_total, currency: 'IDR', status: 'ORDER_GENERATED' },
        transaction: { status: 'SUCCESS', transaction_id: `doku-inq-${invInq}` }
      });
      const recSucc1 = await PaymentService.reconcileDokuOrderStatus({ orderId: ordInq.id });
      assert.equal(recSucc1.action, 'CAPTURED_AND_LEDGER_VERIFIED');
      assert.equal(recSucc1.ledgerVerification.verified, true);
      const recSucc2 = await PaymentService.reconcileDokuOrderStatus({ orderId: ordInq.id });
      assert.equal(recSucc2.idempotent, true);
      assert.equal(recSucc2.action, 'ALREADY_CAPTURED_VERIFIED');
      assert.equal((await getMoneyRepository().getLedgerTransactionsWithEntriesByOrderId(ordInq.id, 'CAPTURE')).length, 1);
    });

    await check('9. Guarded Release Settlement enforces VERIFICATION_REQUIRED, OPEN_DISPUTE_BLOCK, & AUTHORIZATION_REQUIRED', async () => {
      const { order } = await createV2Order({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 400000, quantity: 1 });
      const chk = await PaymentService.createPayment({
        orderId: order.id,
        amount: order.buyer_total,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a' },
        idempotencyKey: nextId('idem-rel')
      });
      const inv = chk.invoice_number;
      const trxId = `doku-trx-rel-${inv}`;
      recorder.statusByInvoice.set(inv, {
        order: { invoice_number: inv, amount: order.buyer_total, currency: 'IDR', status: 'ORDER_GENERATED' },
        transaction: { status: 'SUCCESS', transaction_id: trxId }
      });
      const cap = await PaymentService.reconcileDokuOrderStatus({ orderId: order.id });
      assert.equal(cap.ledgerVerification.verified, true);

      // (a) Unverified TIKUM order -> VERIFICATION_REQUIRED
      const releaseHitsBefore = recorder.releaseHits;
      await assert.rejects(
        () => PaymentService.executeRelease({ orderId: order.id, actorId: 'admin-1' }),
        err => err.code === 'VERIFICATION_REQUIRED'
      );

      passAllTrustGates(order);

      // (b) Open dispute -> OPEN_DISPUTE_BLOCK
      const dispute = await getMoneyRepository().createDispute({
        order_id: order.id,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        ticket_id: order.ticket_id,
        canonical_event_id: order.event_id,
        reason: 'ADMISSION_ISSUE',
        status: 'OPEN',
        outcome: 'PENDING'
      });
      state.disputes = state.disputes || [];
      state.disputes.push({ ...dispute });
      await assert.rejects(
        () => PaymentService.executeRelease({ orderId: order.id, actorId: 'admin-1' }),
        err => err.code === 'OPEN_DISPUTE_BLOCK'
      );
      await getMoneyRepository().resolveDispute(dispute.dispute_id || dispute.id, 'SELLER_FAVORED', 'Verified clean admission');
      const dInState = state.disputes.find(d => d.order_id === order.id);
      if (dInState) { dInState.status = 'RESOLVED'; dInState.outcome = 'SELLER_FAVORED'; }

      // (c) Missing / unapproved Maker-Checker authorization -> AUTHORIZATION_REQUIRED
      await assert.rejects(
        () => PaymentService.executeRelease({ orderId: order.id, actorId: 'admin-1' }),
        err => err.code === 'AUTHORIZATION_REQUIRED'
      );
      const authReq = await FinancialAuthorizationService.requestAuthorization({
        orderId: order.id,
        actionType: AUTHORIZATION_ACTION.RELEASE_HOLD,
        makerId: 'maker-1',
        amount: order.seller_payout,
        reason: 'Release after verified venue entry and dispute resolution'
      });
      const authId = authReq.authorization.id;
      await assert.rejects(
        () => PaymentService.executeRelease({ orderId: order.id, actorId: 'admin-1', authorizationId: authId }),
        err => err.code === 'AUTHORIZATION_REQUIRED'
      );

      // Approve by independent Checker -> executeRelease succeeds cleanly & consumes authorization
      await FinancialAuthorizationService.approveAuthorization({ authorizationId: authId, checkerId: 'checker-1', notes: 'Approved' });
      const overrideSplit = { seller_amount: order.seller_payout, platform_fee: order.buyer_fee + order.seller_fee };
      const rel = await PaymentService.executeRelease({
        orderId: order.id,
        actorId: 'checker-1',
        authorizationId: authId,
        overrideSettlement: overrideSplit
      });
      assert.equal(rel.success, true);
      assert.equal(recorder.releaseHits, releaseHitsBefore + 1);
      assert.deepEqual(recorder.lastReleaseBody.override_settlement, overrideSplit);
      assert.equal(recorder.lastReleaseBody.order.invoice_number, inv);

      const consumedAuth = await FinancialAuthorizationService.getAuthorizationById(authId);
      assert.equal(consumedAuth.status, 'CONSUMED');

      // Re-using consumed authorization on a new release cannot bypass guard
      const idempotentRel = await PaymentService.executeRelease({ orderId: order.id, actorId: 'checker-1', authorizationId: authId });
      assert.equal(idempotentRel.alreadyReleased, true);
      assert.equal(recorder.releaseHits, releaseHitsBefore + 1);

      const { order: order2 } = await createV2Order({ fulfillmentType: 'SELLER_MANAGED', price: 200000, quantity: 1 });
      const chk2 = await PaymentService.createPayment({
        orderId: order2.id,
        amount: order2.buyer_total,
        currency: 'IDR',
        channel: 'DOKU_CHECKOUT',
        buyer: { id: 'buyer-3a' },
        idempotencyKey: nextId('idem-rel2')
      });
      recorder.statusByInvoice.set(chk2.invoice_number, {
        order: { invoice_number: chk2.invoice_number, amount: order2.buyer_total, currency: 'IDR', status: 'ORDER_GENERATED' },
        transaction: { status: 'SUCCESS', transaction_id: `doku-trx-${chk2.invoice_number}` }
      });
      await PaymentService.reconcileDokuOrderStatus({ orderId: order2.id });
      passAllTrustGates(order2);
      await assert.rejects(
        () => PaymentService.executeRelease({ orderId: order2.id, actorId: 'checker-1', authorizationId: authId }),
        err => err.code === 'AUTHORIZATION_REQUIRED'
      );
    });

    console.log(`\n====================================================================`);
    console.log(`  ALL ${passed}/${passed} DOKU SANDBOX INTEGRATION CHECKS PASSED!`);
    console.log(`====================================================================\n`);
  } finally {
    mockServer.close();
    if (prevMarketplaceMode !== undefined) process.env.MARKETPLACE_MODE = prevMarketplaceMode; else delete process.env.MARKETPLACE_MODE;
    if (prevDokuEnv !== undefined) process.env.DOKU_ENV = prevDokuEnv; else delete process.env.DOKU_ENV;
    if (prevDokuBase !== undefined) process.env.DOKU_BASE_URL = prevDokuBase; else delete process.env.DOKU_BASE_URL;
    if (prevHoldEnabled !== undefined) process.env.DOKU_HOLD_SETTLEMENT_ENABLED = prevHoldEnabled; else delete process.env.DOKU_HOLD_SETTLEMENT_ENABLED;
  }
}

run().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
