'use strict';

/**
 * TIKUM / ARGUS — Transaction Integrity Architecture (Option A, Sub-Phase 2) Verification
 *
 * Proves all Sub-Phase 2 & Audit Test Plan scenarios:
 *  - Fulfillment fail-closed validation (DualTierFeePolicy, ListingService, mvpRouter)
 *  - Explicit V1 / V2 policy isolation (no silent V2 override on V1 paths; /api/config/fee-policy)
 *  - T1 & T2: Quote binding rejects wrong buyer/listing/quantity/price/currency/fulfillment/policy (zero inventory leak)
 *  - T3:     Expired quote rejected (QUOTE_EXPIRED)
 *  - T4:     10 concurrent createOrder calls sharing 1 quoteId -> 1 succeeds, 9 fail QUOTE_ALREADY_CONSUMED
 *  - T6:     Cold-start hydration (state.* cleared) of TIKUM_VENUE_PIC -> quotes/charges 9% tier from repo
 *  - T8:     Unified capture parity across PaymentService.handleWebhook, MarketplaceOrderService.processPaymentCallback,
 *            mvpRouter /buyer/pay (rejects amountPaid <= 0), adminRouter /manual-confirm-payment (fails loud on DB/ledger failure)
 *  - T9a:    5x duplicate webhook replay + FAILED_RETRYABLE recovery + durable PaymentService.reconcileTransactions
 *  - T11:    Late payment on cancelled/expired order -> escrow HOLDING_FOR_REFUND, listing remains ACTIVE
 *  - T12:    Concurrent SettlementService + /manual-release-escrow -> at most 1 settlement; missing bank throws MISSING_BANK_ACCOUNT
 *
 * Modes:
 *  - Default (`node test_tx_integrity_subphase2.js`): isolated In-Memory repositories + live Express routes
 *  - Postgres (`node test_tx_integrity_subphase2.js --pg`): isolated disposable schema on Neon PostgreSQL,
 *    applies migrations 000/001/002/004/006/008/033, runs full suite + real SQL ACID concurrency, and drops schema in `finally`.
 */

process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'LIVE';
delete process.env.ACTIVE_FEE_POLICY_VERSION;
delete process.env.TIKUM_PRICING_POLICY;

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const partArgs = process.argv.filter(arg => arg.startsWith('--part='));
if (partArgs.length > 1 || (partArgs.length === 1 && !/^--part=[1-9]\d*\/[1-9]\d*$/.test(partArgs[0]))) throw new Error('Expected --part=k/n with positive integers');
const part = partArgs.length ? partArgs[0].slice(7).split('/').map(Number) : null;
if (part && (!Number.isSafeInteger(part[0]) || !Number.isSafeInteger(part[1]) || part[0] > part[1])) throw new Error('Invalid --part=k/n');

const IS_PG_MODE = process.argv.includes('--pg') ||
  Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_SCHEMA);

const schemaArgs = process.argv.filter(arg => arg.startsWith('--schema='));
const lifecycleFlags = ['--setup-only', '--keep-schema', '--drop-schema'].filter(flag => process.argv.includes(flag));
if (schemaArgs.length > 1 || lifecycleFlags.length > 1 || (lifecycleFlags.length && (schemaArgs.length !== 1 || !IS_PG_MODE))) throw new Error('Schema lifecycle flags require --pg and exactly one --schema');
const requestedSchema = schemaArgs.length ? schemaArgs[0].slice(9) : null;
if (schemaArgs.length && (!IS_PG_MODE || !/^tx_integrity_subphase2_[a-z0-9_]+$/.test(requestedSchema))) throw new Error('Invalid temporary schema name');
const setupOnly = lifecycleFlags.includes('--setup-only');
const keepSchema = lifecycleFlags.includes('--keep-schema');
const dropSchema = lifecycleFlags.includes('--drop-schema');

let createdSchema = null;
let setupPool = null;
let schemaCreated = false;

function loadDatabaseUrlFallback() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const candidates = [
    path.join(__dirname, '.env.local'),
    path.join(__dirname, '..', '.env.local'),
    'C:\\Users\\RYZEN\\.antigravity-ide\\ARGUS\\.env.local'
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('DATABASE_URL=')) {
        let val = line.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
        try {
          const u = new URL(val);
          u.searchParams.delete('channel_binding');
          val = u.toString();
        } catch (_) {}
        return val;
      }
    }
  }
  return null;
}

if (IS_PG_MODE) {
  process.env.PGOPTIONS = `${process.env.PGOPTIONS || ''} -c lock_timeout=5s -c statement_timeout=10s`.trim();
  const dbUrl = loadDatabaseUrlFallback();
  if (!dbUrl) {
    console.error('BLOCKED: --pg mode requires TEST_DATABASE_URL or local .env.local DATABASE_URL.');
    process.exit(2);
  }
  const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  createdSchema = requestedSchema || (part ? null : process.env.TEST_DATABASE_SCHEMA) || `tx_integrity_subphase2_${uniqueSuffix}`;
  if (!/^tx_integrity_subphase2_[a-z0-9_]+$/i.test(createdSchema)) {
    console.error(`BLOCKED: unsafe TEST_DATABASE_SCHEMA '${createdSchema}'`);
    process.exit(2);
  }
  process.env.TEST_DATABASE_URL = dbUrl;
  process.env.TEST_DATABASE_SCHEMA = createdSchema;
} else {
  delete process.env.TEST_DATABASE_URL;
  delete process.env.TEST_DATABASE_SCHEMA;
}

const { Pool } = require('pg');
const app = require('./src/server');
const { state, resetDatabase, bootstrapAdminUser } = require('./src/database');
const {
  getMoneyRepository,
  getMarketplaceRepository,
  getUserRepository,
  setMoneyRepository,
  setMarketplaceRepository
} = require('./src/storage');
const { closeAllSharedPools } = require('./src/storage/connectionPool');
const { calculateDualTierFees } = require('./src/pricing/DualTierFeePolicy');
const { TransactionQuoteService } = require('./src/pricing/TransactionQuoteService');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { MarketplaceOrderService } = require('./src/services/marketplace/MarketplaceOrderService');
const { OfferService } = require('./src/services/offerService');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { SettlementService } = require('./src/services/settlementService');
const { FinancialAuthorizationService, AUTHORIZATION_ACTION } = require('./src/settlement/FinancialAuthorizationService');
const { LedgerVerificationService } = require('./src/settlement/LedgerVerificationService');
const { EventPicService } = require('./src/services/eventPicService');
const { SessionStore } = require('./src/services/sessionStore');

let server;
let baseUrl;
let idSeq = 0;

function nextId(prefix) {
  idSeq += 1;
  return `${prefix}-sub2-${Date.now()}-${idSeq}`;
}

async function httpReq(method, reqPath, body = null, headers = {}) {
  const url = `${baseUrl}${reqPath}`;
  const opts = {
    method,
    headers: {
      Origin: baseUrl,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}

async function applySqlFile(client, relPath) {
  const fullPath = path.join(__dirname, relPath);
  const sql = fs.readFileSync(fullPath, 'utf8');
  await client.query(sql);
}

async function setupIsolatedSchemaIfNeeded() {
  if (!IS_PG_MODE) return;
  const { normalizeConnectionString, applyTransactionSchema } = require('./src/storage/connectionPool');
  const connStr = normalizeConnectionString(process.env.TEST_DATABASE_URL);
  setupPool = new Pool({ connectionString: connStr, max: 2, ssl: { rejectUnauthorized: false } });
  setupPool.on('error', () => {});

  if (dropSchema) {
    await setupPool.query(`DROP SCHEMA IF EXISTS "${createdSchema}" CASCADE`);
    console.log(`Dropped schema ${createdSchema}`);
    return;
  }
  if (keepSchema) {
    const found = await setupPool.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [createdSchema]);
    if (!found.rowCount) throw new Error(`Schema ${createdSchema} does not exist`);
    return;
  }

  const client = await setupPool.connect();
  try {
    await client.query(`CREATE SCHEMA "${createdSchema}"`);
    schemaCreated = true;
    await client.query('BEGIN');
    await applyTransactionSchema(client, createdSchema);
    await applySqlFile(client, 'migrations/000_user_and_auth_schema.sql');
    await applySqlFile(client, 'migrations/001_catalog_schema.sql');
    await applySqlFile(client, 'migrations/002_marketplace_and_money_schema.sql');
    await applySqlFile(client, 'migrations/004_marketplace_offers_schema.sql');
    await applySqlFile(client, 'migrations/006_compliance_and_dual_authorization.sql');
    await applySqlFile(client, 'migrations/008_transactional_outbox_schema.sql');
    await applySqlFile(client, 'migrations/033_tx_integrity_quote_order_binding.sql');
    await client.query(
      `INSERT INTO users (id, email, normalized_email, name, role, status)
       VALUES
         ('seller-1', 'seller-1@tikum.test', 'seller-1@tikum.test', 'Seller One', 'SELLER', 'ACTIVE'),
         ('seller-s2', 'seller-s2@tikum.test', 'seller-s2@tikum.test', 'Seller Two', 'SELLER', 'ACTIVE'),
         ('seller-no-bank', 'seller-nb@tikum.test', 'seller-nb@tikum.test', 'Seller NoBank', 'SELLER', 'ACTIVE'),
         ('buyer-1', 'buyer-1@tikum.test', 'buyer-1@tikum.test', 'Buyer One', 'BUYER', 'ACTIVE'),
         ('buyer-s2', 'buyer-s2@tikum.test', 'buyer-s2@tikum.test', 'Buyer S2', 'BUYER', 'ACTIVE'),
         ('buyer-s2-other', 'buyer-other@tikum.test', 'buyer-other@tikum.test', 'Buyer Other', 'BUYER', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`
    );
    await client.query(
      `INSERT INTO canonical_events (id, slug, canonical_name, venue_name, city, start_date, is_verified, verification_status, lifecycle_status)
       VALUES ('event-sub2', 'event-sub2-jakarta', 'Subphase 2 Concert', 'GBK Stadium', 'Jakarta', CURRENT_DATE + INTERVAL '30 days', TRUE, 'VERIFIED', 'UPCOMING')
       ON CONFLICT (id) DO NOTHING`
    );
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }

  const mktRepo = getMarketplaceRepository(true);
  const moneyRepo = getMoneyRepository(true);
  await mktRepo.ensureInitialized();
  await moneyRepo.ensureInitialized();
}

async function seedFixtures() {
  resetDatabase();
  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
  state.events = state.events || [];
  if (!state.events.some(e => e.id === 'event-sub2')) {
    state.events.push({
      id: 'event-sub2',
      event_id: 'event-sub2',
      slug: 'event-sub2-jakarta',
      title: 'Subphase 2 Concert',
      name: 'Subphase 2 Concert',
      canonical_name: 'Subphase 2 Concert',
      venue_id: 'venue-sub2',
      venue_name: 'GBK Stadium',
      city: 'Jakarta',
      date: futureDate.slice(0, 10),
      start_date: futureDate.slice(0, 10),
      start_datetime: futureDate,
      end_date: futureDate.slice(0, 10),
      end_datetime: futureDate,
      timezone: 'Asia/Jakarta',
      is_verified: true,
      verification_status: 'VERIFIED',
      source_url: 'https://tikum.app/events/event-sub2',
      evidence_hash: 'evh-sub2-verified',
      verified_at: new Date().toISOString(),
      lifecycle_status: 'UPCOMING',
      status: 'UPCOMING',
      archive_status: 'ACTIVE',
      is_pilot: true,
      pilot_approved: true
    });
  }
  state.venues = state.venues || [];
  if (!state.venues.some(v => v.id === 'venue-sub2')) {
    state.venues.push({ id: 'venue-sub2', name: 'GBK Stadium', city: 'Jakarta', gate_info: 'Gate 1' });
  }

  state.users = state.users || [];
  const fixtures = [
    {
      id: 'seller-s2',
      email: 'seller-s2@tikum.test',
      name: 'Seller S2',
      role: 'SELLER',
      status: 'ACTIVE',
      email_verified: true,
      phone: '+628111222333',
      kyc_status: 'VERIFIED',
      bank_account_details: 'BCA 9988776655 a.n. Seller S2',
      metadata: {
        city: 'Jakarta',
        payout_bank_name: 'BCA',
        payout_account_number: '9988776655',
        identity_doc_ref: 'ktp-s2'
      }
    },
    {
      id: 'seller-no-bank',
      email: 'seller-nb@tikum.test',
      name: 'Seller No Bank',
      role: 'SELLER',
      status: 'ACTIVE',
      email_verified: true,
      phone: '+628111222444',
      kyc_status: 'VERIFIED',
      metadata: { city: 'Jakarta', identity_doc_ref: 'ktp-nb' }
    },
    {
      id: 'buyer-s2',
      email: 'buyer-s2@tikum.test',
      name: 'Buyer S2',
      role: 'BUYER',
      status: 'ACTIVE',
      email_verified: true
    },
    {
      id: 'buyer-s2-other',
      email: 'buyer-other@tikum.test',
      name: 'Buyer Other',
      role: 'BUYER',
      status: 'ACTIVE',
      email_verified: true
    },
    {
      id: 'pic-s2',
      email: 'pic-s2@tikum.test',
      name: 'PIC S2',
      role: 'pic',
      status: 'ACTIVE'
    }
  ];

  for (const u of fixtures) {
    const idx = state.users.findIndex(x => x.id === u.id);
    if (idx >= 0) state.users[idx] = { ...state.users[idx], ...u };
    else state.users.push(u);
  }
  if (IS_PG_MODE) {
    const { InMemoryUserRepository, setUserRepository } = require('./src/storage');
    const memUserRepo = new InMemoryUserRepository();
    await memUserRepo.init();
    setUserRepository(memUserRepo);
  }
  const userRepo = getUserRepository();
  if (userRepo && typeof userRepo.createUser === 'function') {
    for (const u of fixtures) {
      await userRepo.createUser(u).catch(() => null);
    }
  }

  state.seller_profiles = state.seller_profiles || [];
  for (const sid of ['seller-s2', 'seller-no-bank']) {
    const existing = state.seller_profiles.find(p => p.user_id === sid);
    if (!existing) {
      state.seller_profiles.push({
        user_id: sid,
        kyc_status: 'VERIFIED',
        active_listing_limit: 50,
        bank_account_details: sid === 'seller-s2' ? 'BCA 9988776655 a.n. Seller S2' : null
      });
    }
  }
}

async function createVerifiedListing({ sellerId = 'seller-s2', fulfillmentType = 'TIKUM_VENUE_PIC', price = 1000000, quantity = 1, policyVersion = null } = {}) {
  const created = await ListingService.createListing({
    sellerId,
    eventId: 'event-sub2',
    seatInfo: `VIP - ${nextId('seat')}`,
    faceValue: price,
    price,
    quantity,
    rawBarcode: `BC-${nextId('bar')}`,
    bypassPilotBounds: true,
    fulfillmentType
  });
  await ListingService.verifyListing(created.listing.id, 'admin-1', { approved: true });
  if (policyVersion) {
    created.listing.pricing_policy_version = policyVersion;
    const mktRepo = getMarketplaceRepository();
    if (typeof mktRepo.updateListing === 'function') {
      await mktRepo.updateListing(created.listing.id, { pricing_policy_version: policyVersion });
    }
  }
  return created.listing;
}

async function runSuite() {
  await seedFixtures();
  const adminRes = bootstrapAdminUser();
  const { adminSecurityStore } = require('./src/storage/AdminSecurityStore');
  const adminSession = SessionStore.createSession({ userId: adminRes.user.id, role: 'ADMIN' });
  adminSecurityStore.registerTestSession(adminSession.session_token, {
    id: adminRes.user.id,
    email: adminRes.user.email || 'admin@tikum.app',
    role: 'ADMIN',
    name: adminRes.user.name || 'Admin'
  });
  const adminHeaders = { Authorization: `Bearer ${adminSession.session_token}` };
  const sellerSession = SessionStore.createSession({ userId: 'seller-s2', role: 'SELLER' });
  const sellerHeaders = { Authorization: `Bearer ${sellerSession.session_token}` };

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  let passed = 0;
  const tests = [];
  async function check(name, fn) { tests.push({ name, fn }); }

  console.log(`\n=== SUB-PHASE 2 TX INTEGRITY SUITE (${IS_PG_MODE ? `POSTGRES SCHEMA: ${createdSchema}` : 'IN-MEMORY'}) ===`);

  // 1. Durable Fulfillment & Zero Silent Fallback
  await check('Fulfillment.1: DualTierFeePolicy rejects omitted/unknown fulfillmentType with INVALID_FULFILLMENT_TYPE', async () => {
    assert.throws(
      () => calculateDualTierFees({ ticketPrice: 1000000 }),
      (err) => err.code === 'INVALID_FULFILLMENT_TYPE' && /Unknown fulfillment/.test(err.message)
    );
    assert.throws(
      () => calculateDualTierFees({ ticketPrice: 1000000, fulfillmentType: 'INVALID_TIER' }),
      (err) => err.code === 'INVALID_FULFILLMENT_TYPE'
    );
  });

  await check('Fulfillment.2: ListingService.createListing & updateListing reject omitted/invalid fulfillmentType with 400 INVALID_FULFILLMENT_TYPE', async () => {
    await assert.rejects(
      () => ListingService.createListing({
        sellerId: 'seller-s2', eventId: 'event-sub2', seatInfo: 'CAT 1', faceValue: 1000000, price: 1000000, bypassPilotBounds: true
      }),
      (err) => err.code === 'INVALID_FULFILLMENT_TYPE' && err.status === 400
    );
    await assert.rejects(
      () => ListingService.createListing({
        sellerId: 'seller-s2', eventId: 'event-sub2', seatInfo: 'CAT 1', faceValue: 1000000, price: 1000000, bypassPilotBounds: true, fulfillmentType: 'COURIER'
      }),
      (err) => err.code === 'INVALID_FULFILLMENT_TYPE' && err.status === 400
    );

    const listing = await createVerifiedListing({ fulfillmentType: 'SELLER_MANAGED', price: 1000000 });
    await assert.rejects(
      () => ListingService.updateListing({ listingId: listing.id, sellerId: 'seller-s2', updates: { fulfillmentType: 'BOGUS' } }),
      (err) => err.code === 'INVALID_FULFILLMENT_TYPE' && err.status === 400
    );
    await assert.rejects(
      () => ListingService.updateListing({ listingId: listing.id, sellerId: 'seller-s2', updates: { fulfillmentType: null } }),
      (err) => err.code === 'INVALID_FULFILLMENT_TYPE' && err.status === 400
    );

    // Explicit valid update persists durably via marketplaceRepo.updateListing
    const upd = await ListingService.updateListing({
      listingId: listing.id, sellerId: 'seller-s2', updates: { fulfillmentType: 'TIKUM_VENUE_PIC', price: 1100000 }
    });
    assert.equal(upd.listing.fulfillment_type, 'TIKUM_VENUE_PIC');
    const persisted = await getMarketplaceRepository().getListingById(listing.id, { strictRepositoryOnly: true });
    assert.equal(persisted.fulfillment_type, 'TIKUM_VENUE_PIC');
    assert.equal(Number(persisted.price), 1100000);
  });

  await check('Fulfillment.3: POST /api/mvp/seller/listing rejects omitted/invalid fulfillmentType with 400 INVALID_FULFILLMENT_TYPE', async () => {
    const missingRes = await httpReq('POST', '/api/mvp/seller/listing', {
      eventId: 'event-sub2', seatInfo: 'CAT A', faceValue: 1000000, price: 1000000, quantity: 1
    }, sellerHeaders);
    assert.equal(missingRes.status, 400);
    assert.equal(missingRes.data.code, 'INVALID_FULFILLMENT_TYPE');

    const badRes = await httpReq('POST', '/api/mvp/seller/listing', {
      eventId: 'event-sub2', seatInfo: 'CAT A', faceValue: 1000000, price: 1000000, quantity: 1, fulfillmentType: 'OTHER'
    }, sellerHeaders);
    assert.equal(badRes.status, 400);
    assert.equal(badRes.data.code, 'INVALID_FULFILLMENT_TYPE');
  });

  // 2. Policy Isolation & Authoritative Quote Generation
  await check('Policy & Quote Isolation: GET /api/config/fee-policy + V1 default vs explicit V2 + PRICE_MISMATCH + DB GET /pricing/quote/:id', async () => {
    const cfgRes = await httpReq('GET', '/api/config/fee-policy');
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.data.active_policy_version, 'TIKUM_FEE_POLICY_V1');
    assert.equal(cfgRes.data.v2_dual_tier.version, 'V2_DUAL_TIER');

    const picListing = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 1 });

    // Require buyerId
    await assert.rejects(
      () => TransactionQuoteService.generateQuote({ listingId: picListing.id, buyerId: null }),
      (err) => err.code === 'BUYER_REQUIRED'
    );
    // Require persisted listing
    await assert.rejects(
      () => TransactionQuoteService.generateQuote({ listingId: 'nonexistent-lst', buyerId: 'buyer-s2' }),
      (err) => err.code === 'LISTING_NOT_FOUND'
    );
    // Reject price tampering
    await assert.rejects(
      () => TransactionQuoteService.generateQuote({ listingId: picListing.id, buyerId: 'buyer-s2', ticketPrice: 500000 }),
      (err) => err.code === 'PRICE_MISMATCH' && err.status === 422
    );

    // Explicit V1 quote on TIKUM_VENUE_PIC listing honors V1 (6% = 60,000) without silently switching to V2
    const v1Quote = await TransactionQuoteService.generateQuote({
      listingId: picListing.id, buyerId: 'buyer-s2', quantity: 1, pricingPolicyVersion: 'TIKUM_FEE_POLICY_V1', taxPolicyVersion: 'ZERO-TAX-TEST'
    });
    assert.equal(v1Quote.fee_policy_version, 'TIKUM_FEE_POLICY_V1');
    assert.equal(v1Quote.buyer_fee, 60000);
    assert.equal(v1Quote.fulfillment_option, 'TIKUM_VENUE_PIC');

    // Explicit V2 quote on TIKUM_VENUE_PIC listing charges 9% = 90,000
    const v2Quote = await TransactionQuoteService.generateQuote({
      listingId: picListing.id, buyerId: 'buyer-s2', quantity: 1, pricingPolicyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });
    assert.equal(v2Quote.fee_policy_version, 'V2_DUAL_TIER');
    assert.equal(v2Quote.buyer_fee, 90000);
    assert.equal(v2Quote.seller_fee, 90000);
    assert.equal(v2Quote.fulfillment_option, 'TIKUM_VENUE_PIC');

    // GET /api/mvp/pricing/quote/:id must read persisted quote from MoneyRepository even after clearing memory
    state.quotes = [];
    const quoteLookup = await httpReq('GET', `/api/mvp/pricing/quote/${v2Quote.id}`);
    assert.equal(quoteLookup.status, 200);
    assert.equal(quoteLookup.data.quote.quote_id, v2Quote.id);
    assert.equal(quoteLookup.data.quote.fulfillment_option, 'TIKUM_VENUE_PIC');
  });

  // T1 & T2: Quote-to-order context mismatch rejections & zero inventory leak
  await check('T1 & T2: Mismatched buyer, listing, qty, price, currency, fulfillment, or policy rejects & leaks ZERO inventory', async () => {
    console.log('    T1/T2: create first listing');
    const l1 = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 3, policyVersion: 'V2_DUAL_TIER' });
    console.log('    T1/T2: create second listing');
    const l2 = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 2, policyVersion: 'V2_DUAL_TIER' });

    console.log('    T1/T2: generate quote');
    const quote = await TransactionQuoteService.generateQuote({
      listingId: l1.id, buyerId: 'buyer-s2', quantity: 2, pricingPolicyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    const attempts = [
      // wrong buyer
      () => EscrowService.createOrder({ buyerId: 'buyer-s2-other', listingId: l1.id, quoteId: quote.id, quantity: 2, policyVersion: 'V2_DUAL_TIER' }),
      // wrong listing
      () => EscrowService.createOrder({ buyerId: 'buyer-s2', listingId: l2.id, quoteId: quote.id, quantity: 2, policyVersion: 'V2_DUAL_TIER' }),
      // wrong quantity
      () => EscrowService.createOrder({ buyerId: 'buyer-s2', listingId: l1.id, quoteId: quote.id, quantity: 1, policyVersion: 'V2_DUAL_TIER' }),
      // wrong price
      () => EscrowService.createOrder({ buyerId: 'buyer-s2', listingId: l1.id, quoteId: quote.id, quantity: 2, customAmount: 950000, policyVersion: 'V2_DUAL_TIER' }),
      // wrong currency
      () => EscrowService.createOrder({ buyerId: 'buyer-s2', listingId: l1.id, quoteId: quote.id, quantity: 2, currency: 'USD', policyVersion: 'V2_DUAL_TIER' }),
      // wrong policyVersion
      () => EscrowService.createOrder({ buyerId: 'buyer-s2', listingId: l1.id, quoteId: quote.id, quantity: 2, policyVersion: 'TIKUM_FEE_POLICY_V1' })
    ];

    for (const [index, runBad] of attempts.entries()) {
      console.log(`    T1/T2: mismatch attempt ${index + 1}/${attempts.length}`);
      await assert.rejects(runBad, (err) => ['QUOTE_CONTEXT_MISMATCH', 'PRICE_MISMATCH'].includes(err.code));
    }

    // Also mutate listing fulfillment on l1 temporarily -> fulfillment mismatch must reject
    console.log('    T1/T2: fulfillment mismatch');
    await getMarketplaceRepository().updateListing(l1.id, { fulfillment_type: 'SELLER_MANAGED' });
    await assert.rejects(
      () => EscrowService.createOrder({ buyerId: 'buyer-s2', listingId: l1.id, quoteId: quote.id, quantity: 2, policyVersion: 'V2_DUAL_TIER' }),
      (err) => err.code === 'QUOTE_CONTEXT_MISMATCH'
    );
    await getMarketplaceRepository().updateListing(l1.id, { fulfillment_type: 'TIKUM_VENUE_PIC' });

    // Confirm quote STILL ACTIVE and inventory STILL 3 (0 leak)
    console.log('    T1/T2: verify quote and inventory');
    const persistedQuote = await getMoneyRepository().getQuoteById(quote.id);
    assert.equal(persistedQuote.status, 'ACTIVE');
    assert.equal(persistedQuote.consumed_by_order_id || null, null);
    const persistedListing = await getMarketplaceRepository().getListingById(l1.id, { strictRepositoryOnly: true });
    const availAfter = persistedListing.available_quantity ?? persistedListing.metadata?.available_quantity;
    assert.equal(Number(availAfter), 3);
  });

  // T3: Expired quote rejected
  await check('T3: Expired quote rejected with QUOTE_EXPIRED and leaves inventory untouched', async () => {
    const l = await createVerifiedListing({ fulfillmentType: 'SELLER_MANAGED', price: 1000000, quantity: 2, policyVersion: 'V2_DUAL_TIER' });
    const expiredQuote = await getMoneyRepository().createQuote({
      quote_id: nextId('quo-exp'),
      listing_id: l.id,
      buyer_id: 'buyer-s2',
      seller_id: 'seller-s2',
      ticket_price: 1000000,
      quantity: 1,
      gross_ticket_value: 1000000,
      fulfillment_option: 'SELLER_MANAGED',
      buyer_fee: 60000,
      seller_fee: 60000,
      buyer_total: 1060000,
      seller_payout: 940000,
      currency: 'IDR',
      pricing_policy_version: 'V2_DUAL_TIER',
      tax_policy_version: 'ZERO-TAX-TEST',
      status: 'ACTIVE',
      expires_at: new Date(Date.now() - 60000).toISOString()
    });

    await assert.rejects(
      () => EscrowService.createOrder({
        buyerId: 'buyer-s2', listingId: l.id, quoteId: expiredQuote.quote_id, quantity: 1, policyVersion: 'V2_DUAL_TIER'
      }),
      (err) => err.code === 'QUOTE_EXPIRED'
    );
    const postL = await getMarketplaceRepository().getListingById(l.id, { strictRepositoryOnly: true });
    const avail = postL.available_quantity ?? postL.metadata?.available_quantity;
    assert.equal(Number(avail), 2);
  });

  // T4: 10 concurrent createOrder calls sharing 1 quoteId -> 1 succeeds, 9 fail QUOTE_ALREADY_CONSUMED
  await check('T4: 10 concurrent createOrder calls sharing 1 quoteId -> exactly 1 succeeds, 9 fail QUOTE_ALREADY_CONSUMED', async () => {
    const multiListing = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 4, policyVersion: 'V2_DUAL_TIER' });
    const sharedQuote = await TransactionQuoteService.generateQuote({
      listingId: multiListing.id, buyerId: 'buyer-s2', quantity: 1, pricingPolicyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () => EscrowService.createOrder({
        buyerId: 'buyer-s2',
        listingId: multiListing.id,
        quoteId: sharedQuote.id,
        quantity: 1,
        policyVersion: 'V2_DUAL_TIER'
      }))
    );

    const successes = settled.filter(r => r.status === 'fulfilled');
    const failures = settled.filter(r => r.status === 'rejected');
    assert.equal(successes.length, 1, `Expected exactly 1 winner, got ${successes.length}`);
    assert.equal(failures.length, 9, `Expected exactly 9 rejections, got ${failures.length}`);
    for (const f of failures) {
      assert.equal(f.reason.code, 'QUOTE_ALREADY_CONSUMED');
    }

    const qDb = await getMoneyRepository().getQuoteById(sharedQuote.id);
    assert.equal(qDb.status, 'CONSUMED');
    assert.equal(qDb.consumed_by_order_id, successes[0].value.order.id);
    const lDb = await getMarketplaceRepository().getListingById(multiListing.id, { strictRepositoryOnly: true });
    const avail = lDb.available_quantity ?? lDb.metadata?.available_quantity;
    assert.equal(Number(avail), 3);
  });

  // T6: Cold-start hydration of TIKUM_VENUE_PIC -> 9% tier preserved, never SELLER_MANAGED
  await check('T6: Cold-start hydration (state.* wiped) preserves TIKUM_VENUE_PIC and charges 9% tier', async () => {
    const picListing = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const listingId = picListing.id;

    // Simulate process cold start: clear process memory completely!
    state.listings = [];
    state.tickets = [];
    state.quotes = [];

    const httpListing = await httpReq('GET', `/api/mvp/listings/${listingId}`);
    assert.equal(httpListing.status, 200);
    assert.equal(httpListing.data.listing.fulfillment_type, 'TIKUM_VENUE_PIC');

    // Wipe state.* again right before quote & order creation
    state.listings = [];
    state.tickets = [];
    state.quotes = [];

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-s2',
      listingId,
      policyVersion: 'V2_DUAL_TIER',
      taxPolicyVersion: 'ZERO-TAX-TEST'
    });
    assert.equal(orderRes.order.fulfillment_option, 'TIKUM_VENUE_PIC');
    assert.equal(orderRes.order.buyer_fee, 90000, 'Must charge 9% TIKUM_VENUE_PIC fee, never 6% SELLER_MANAGED');
    assert.equal(orderRes.order.seller_fee, 90000);
    assert.equal(orderRes.order.buyer_total, 1090000);
  });

  // T8 & T9a: Unified Capture Caller Parity, Single Capture in MarketplaceOrderService, Replay Idempotency & Webhook Recovery
  const { paymentManager } = require('./src/services/payment');
  const testProvider = paymentManager.getProvider('test_provider');

  await check('T8.1 & T9a: PaymentService.handleWebhook 5x duplicate replay + FAILED_RETRYABLE recovery + single capture', async () => {
    const l = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: l.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    const stableIdemKey = nextId('evt-idem-fail-first');
    const webhookBodyFail = {
      order_id: order.id,
      provider_ref: `pref-${order.id}-tamper`,
      idempotency_key: stableIdemKey,
      status: 'SETTLED',
      amount: 123456, // Wrong amount forces failure mid-webhook
      currency: 'IDR'
    };

    await assert.rejects(
      () => PaymentService.handleWebhook({
        providerName: 'test_provider',
        headers: { 'x-test-signature': testProvider.computeSignature(webhookBodyFail) },
        body: webhookBodyFail
      }),
      (err) => err.code === 'AMOUNT_MISMATCH'
    );
    const expectedEventId = `wh-${stableIdemKey}`;
    const whAfterFail = await getMoneyRepository().getWebhook('test_provider', expectedEventId);
    assert.equal(whAfterFail.processing_status, 'FAILED_RETRYABLE', 'Failed webhook must transition to FAILED_RETRYABLE');

    // Corrected retry using the SAME provider eventId (via same idempotency_key) must reclaim cleanly and succeed!
    const correctedBody = {
      order_id: order.id,
      provider_ref: `pref-${order.id}-ok`,
      idempotency_key: stableIdemKey,
      status: 'SETTLED',
      amount: order.buyer_total,
      currency: 'IDR'
    };
    const firstOk = await PaymentService.handleWebhook({
      providerName: 'test_provider',
      headers: { 'x-test-signature': testProvider.computeSignature(correctedBody) },
      body: correctedBody
    });
    assert.equal(firstOk.idempotent, false);

    // 5x replay of the same event -> all idempotent, still 1 payment & 1 CAPTURE
    const replays = await Promise.all(
      Array.from({ length: 5 }, () => PaymentService.handleWebhook({
        providerName: 'test_provider',
        headers: { 'x-test-signature': testProvider.computeSignature(correctedBody) },
        body: correctedBody
      }))
    );
    for (const r of replays) {
      assert.equal(r.idempotent, true);
    }

    const captures = await getMoneyRepository().getLedgerTransactionsWithEntriesByOrderId(order.id, 'CAPTURE');
    assert.equal(captures.length, 1);
    const verified = await LedgerVerificationService.verifyDurableCapture(order.id);
    assert.equal(verified.verified, true);
  });

  await check('T8.2: MarketplaceOrderService.processPaymentCallback avoids double capture on SETTLED and reconciles durably', async () => {
    const l = await createVerifiedListing({ fulfillmentType: 'SELLER_MANAGED', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: l.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    const cbBody = {
      order_id: order.id,
      provider_ref: `cbref-${order.id}`,
      idempotency_key: nextId('evt-cb'),
      status: 'SETTLED',
      amount: order.buyer_total,
      currency: 'IDR'
    };
    const cbRes = await MarketplaceOrderService.processPaymentCallback({
      providerName: 'test_provider',
      headers: { 'x-test-signature': testProvider.computeSignature(cbBody) },
      body: cbBody
    });
    assert.equal(cbRes.success, true);
    assert.equal(cbRes.status, 'PAID');

    const captures = await getMoneyRepository().getLedgerTransactionsWithEntriesByOrderId(order.id, 'CAPTURE');
    assert.equal(captures.length, 1, 'Must produce exactly 1 CAPTURE ledger transaction (no second EscrowService.recordPayment)');

    // Reconciliation must inspect durable repositories even if state.canonical_payments is wiped
    state.canonical_payments = [];
    const rec = await PaymentService.reconcileTransactions({ providerName: 'doku' });
    assert.ok(rec.reconciled_count >= 1);
    assert.equal(rec.variances_found, 0);
  });

  await check('T8.3: POST /api/mvp/buyer/pay rejects amountPaid <= 0 and succeeds with durable verification', async () => {
    const l = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: l.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    for (const badAmount of [0, -50000, null]) {
      const badPay = await httpReq('POST', '/api/mvp/buyer/pay', {
        orderId: order.id, idempotencyKey: nextId('idem-bad'), amountPaid: badAmount
      });
      assert.equal(badPay.status, 400);
      assert.equal(badPay.data.code, 'INVALID_PAYMENT_AMOUNT');
    }

    const okPay = await httpReq('POST', '/api/mvp/buyer/pay', {
      orderId: order.id,
      providerRef: `mvp-pay-${order.id}`,
      idempotencyKey: nextId('idem-ok'),
      amountPaid: order.buyer_total
    });
    assert.equal(okPay.status, 200);
    assert.equal(okPay.data.success, true);
    assert.equal(okPay.data.verification.verified, true);
  });

  await check('T8.4: POST /api/admin/orders/:id/manual-confirm-payment persists & verifies capture, failing loud on DB error', async () => {
    const l1 = await createVerifiedListing({ fulfillmentType: 'SELLER_MANAGED', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order: o1 } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: l1.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    const okConfirm = await httpReq('POST', `/api/admin/orders/${o1.id}/manual-confirm-payment`, {
      bank_reference: 'BCA-MANUAL-98765432',
      amount_paid: o1.buyer_total,
      notes: 'Verified transfer slip'
    }, adminHeaders);
    assert.equal(okConfirm.status, 200);
    assert.equal(okConfirm.data.verification.verified, true);

    // Inject DB failure on ledger write -> manual-confirm-payment MUST fail loudly (never return 200)
    const l2 = await createVerifiedListing({ fulfillmentType: 'SELLER_MANAGED', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order: o2 } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: l2.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    const moneyRepo = getMoneyRepository();
    const origRecordLedger = moneyRepo.recordLedgerTransaction.bind(moneyRepo);
    moneyRepo.recordLedgerTransaction = async () => {
      const e = new Error('SIMULATED_ADMIN_CONFIRM_LEDGER_FAILURE');
      e.code = 'SIMULATED_LEDGER_FAILURE';
      throw e;
    };
    try {
      const failConfirm = await httpReq('POST', `/api/admin/orders/${o2.id}/manual-confirm-payment`, {
        bank_reference: 'BCA-MANUAL-11112222',
        amount_paid: o2.buyer_total
      }, adminHeaders);
      assert.notEqual(failConfirm.status, 200, 'Must never return 200 when ledger write fails');
    } finally {
      moneyRepo.recordLedgerTransaction = origRecordLedger;
    }
  });

  // T11: Late payment on cancelled / expired order -> HOLDING_FOR_REFUND, listing stays ACTIVE
  await check('T11: Late payment on cancelled/expired order sets escrow HOLDING_FOR_REFUND and keeps listing ACTIVE', async () => {
    const l = await createVerifiedListing({ fulfillmentType: 'SELLER_MANAGED', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: l.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });

    await MarketplaceOrderService.cancelOrder(order.id, 'buyer-s2', 'Cancelled before payment');
    // Force durable DB status EXPIRED/CANCELLED & listing ACTIVE
    await getMoneyRepository().updateOrderStatus(order.id, 'CANCELLED');
    await getMoneyRepository().updateEscrowStatus(order.id, 'CANCELLED');

    const latePayRes = await EscrowService.recordPayment({
      orderId: order.id,
      providerRef: `late-${order.id}`,
      idempotencyKey: nextId('idem-late'),
      amountPaid: order.buyer_total
    });

    assert.equal(latePayRes.order.status, 'LATE_PAYMENT_PENDING_REVIEW');
    assert.equal(latePayRes.escrow.status, 'HOLDING_FOR_REFUND', 'Late payment escrow must NEVER become ESCROWED');
    const dbEscrow = await getMoneyRepository().getEscrowByOrderId(order.id);
    assert.equal(dbEscrow.status, 'HOLDING_FOR_REFUND');
    const dbListing = await getMarketplaceRepository().getListingById(l.id, { strictRepositoryOnly: true });
    assert.equal(dbListing.status, LISTING_STATUS.ACTIVE, 'Late payment must NEVER set cancelled listing to SOLD');
  });

  // T12: Concurrent settlement + /manual-release-escrow & zero dummy BCA
  await check('T12: Missing seller bank account throws MISSING_BANK_ACCOUNT and concurrent settlement creates at most 1 row', async () => {
    // 1. Missing bank account fails closed (no 'BCA 1234567890 (a.n Budi Santoso)' dummy string)
    // Temporarily ensure seller-no-bank passes seller listing eligibility, then wipe payout bank fields prior to settlement
    const sNbMem = state.users.find(u => u.id === 'seller-no-bank');
    sNbMem.bank_account_details = 'TEMP 0000';
    sNbMem.metadata = { ...(sNbMem.metadata || {}), payout_bank_name: 'BCA', payout_account_number: '0000' };
    const lNoBank = await createVerifiedListing({ sellerId: 'seller-no-bank', fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order: ordNoBank, escrow: escNoBank } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: lNoBank.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });
    await EscrowService.recordPayment({
      orderId: ordNoBank.id, providerRef: `pref-nb-${ordNoBank.id}`, idempotencyKey: nextId('idem-nb'), amountPaid: ordNoBank.buyer_total
    });
    const authNb = await FinancialAuthorizationService.requestAuthorization({
      orderId: ordNoBank.id, actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      makerId: 'admin-maker', amount: escNoBank.amount, reason: 'No bank test'
    });
    await FinancialAuthorizationService.approveAuthorization({
      authorizationId: authNb.authorization.id, checkerId: 'admin-checker', notes: 'Approved'
    });
    delete sNbMem.bank_account_details;
    if (sNbMem.metadata) {
      delete sNbMem.metadata.payout_bank_name;
      delete sNbMem.metadata.payout_account_number;
    }
    const repoNbUser = await getUserRepository().getUserById('seller-no-bank');
    if (repoNbUser) {
      delete repoNbUser.bank_account_details;
      if (repoNbUser.metadata) {
        delete repoNbUser.metadata.payout_bank_name;
        delete repoNbUser.metadata.payout_account_number;
      }
    }
    await assert.rejects(
      () => SettlementService.executeSettlement({
        orderId: ordNoBank.id, sellerId: 'seller-no-bank', officerId: adminRes.user.id,
        idempotencyKey: nextId('idem-stl-nb'), authorizationId: authNb.authorization.id
      }),
      (err) => err.code === 'MISSING_BANK_ACCOUNT'
    );

    // 2. Concurrent SettlementService.executeSettlement + /manual-release-escrow -> at most 1 settlement row
    const lOk = await createVerifiedListing({ sellerId: 'seller-s2', fulfillmentType: 'TIKUM_VENUE_PIC', price: 1000000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const { order: ordOk, escrow: escOk } = await EscrowService.createOrder({
      buyerId: 'buyer-s2', listingId: lOk.id, policyVersion: 'V2_DUAL_TIER', taxPolicyVersion: 'ZERO-TAX-TEST'
    });
    await EscrowService.recordPayment({
      orderId: ordOk.id, providerRef: `pref-ok-${ordOk.id}`, idempotencyKey: nextId('idem-ok2'), amountPaid: ordOk.buyer_total
    });

    EventPicService.assignPic({ eventId: 'event-sub2', venueId: 'venue-sub2', picUserId: 'pic-s2', contactPhone: '08120000000' });
    await EventPicService.recordEntryVerification({
      picUserId: 'pic-s2', orderId: ordOk.id, gate: 'Gate 1', status: 'CONFIRMED', notes: 'Entry OK'
    });

    // Missing authorization_id on /manual-release-escrow must reject 403
    const unauthRelease = await httpReq('POST', `/api/admin/orders/${ordOk.id}/manual-release-escrow`, {
      bank_account: 'BCA 9988776655 a.n. Seller S2'
    }, adminHeaders);
    assert.equal(unauthRelease.status, 403);
    assert.equal(unauthRelease.data.code, 'AUTHORIZATION_REQUIRED');

    const authOk = await FinancialAuthorizationService.requestAuthorization({
      orderId: ordOk.id, actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      makerId: 'admin-maker', amount: escOk.amount, reason: 'Concurrent settlement test',
      payoutDestination: 'BCA 9988776655 a.n. Seller S2'
    });
    await FinancialAuthorizationService.approveAuthorization({
      authorizationId: authOk.authorization.id, checkerId: 'admin-checker', notes: 'Approved'
    });

    await EscrowService.releaseToSeller(ordOk.id, adminRes.user.id);

    const [settleA, settleB, releaseHttp] = await Promise.all([
      SettlementService.executeSettlement({
        orderId: ordOk.id, sellerId: 'seller-s2', officerId: adminRes.user.id,
        idempotencyKey: nextId('idem-conc-1'), authorizationId: authOk.authorization.id,
        bankAccount: 'BCA 9988776655 a.n. Seller S2'
      }),
      SettlementService.executeSettlement({
        orderId: ordOk.id, sellerId: 'seller-s2', officerId: adminRes.user.id,
        idempotencyKey: nextId('idem-conc-2'), authorizationId: authOk.authorization.id,
        bankAccount: 'BCA 9988776655 a.n. Seller S2'
      }),
      httpReq('POST', `/api/admin/orders/${ordOk.id}/manual-release-escrow`, {
        authorization_id: authOk.authorization.id,
        bank_account: 'BCA 9988776655 a.n. Seller S2',
        idempotency_key: nextId('idem-conc-3')
      }, adminHeaders)
    ]);

    assert.equal(releaseHttp.status, 200);
    const matchingSettlements = (state.settlements || []).filter(s => s.order_id === ordOk.id);
    assert.equal(matchingSettlements.length, 1, 'At most 1 settlement record must exist per order');
    assert.ok(settleA.settlement?.id || settleB.settlement?.id);
    const dbStl = await getMoneyRepository().getSettlementByOrderId(ordOk.id);
    assert.ok(dbStl, 'Settlement must be persisted in MoneyRepository');
    assert.equal(dbStl.order_id, ordOk.id);
    const releaseTxs = await getMoneyRepository().getLedgerTransactionsWithEntriesByOrderId(ordOk.id, 'RELEASE');
    assert.equal(releaseTxs.length, 1, 'Exactly one RELEASE ledger transaction must exist');
  });

  // OfferService propagation test
  await check('OfferService.acceptOffer propagates offerId, fulfillment_type, and quote binding into EscrowService.createOrder', async () => {
    const l = await createVerifiedListing({ fulfillmentType: 'TIKUM_VENUE_PIC', price: 1500000, quantity: 1, policyVersion: 'V2_DUAL_TIER' });
    const mktRepo = getMarketplaceRepository();
    const offerId = nextId('ofr');
    const offerRecord = {
      id: offerId,
      listing_id: l.id,
      ticket_id: l.ticket_id,
      event_id: 'event-sub2',
      buyer_id: 'buyer-s2',
      seller_id: 'seller-s2',
      original_price: 1500000,
      offer_amount: 1300000,
      status: 'PENDING',
      sequence_number: 1,
      proposal_count: 1,
      max_proposals: 5,
      pricing_policy_version: 'V2_DUAL_TIER',
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    const negRecord = {
      id: nextId('neg'),
      listing_id: l.id,
      ticket_id: l.ticket_id,
      event_id: 'event-sub2',
      buyer_id: 'buyer-s2',
      seller_id: 'seller-s2',
      original_price: 1500000,
      status: 'ACTIVE',
      proposals: []
    };
    await mktRepo.createOfferWithNegotiation(offerRecord, negRecord);
    assert.equal((await mktRepo.getOfferById(offerId))?.id, offerId, 'Offer must be durably readable in the active schema');
    state.offers = state.offers || [];
    state.offers.push(offerRecord);

    const accRes = await OfferService.acceptOffer({ offerId, sellerId: 'seller-s2' });
    assert.equal(accRes.order.ticket_price, 1300000);
    assert.equal(accRes.order.fulfillment_option, 'TIKUM_VENUE_PIC');
    assert.equal(accRes.order.buyer_fee, 117000); // 9% of 1,300,000
    assert.ok(accRes.order.quote_id, 'Offer order must carry bound quote_id');
  });

  const start = part ? Math.floor(tests.length * (part[0] - 1) / part[1]) : 0;
  const end = part ? Math.floor(tests.length * part[0] / part[1]) : tests.length;
  if (part && part[1] > tests.length) throw new Error('Shard count exceeds test count');
  const selected = tests.slice(start, end);
  console.log('  Selected ' + selected.length + '/' + tests.length + ' tests' + (part ? ' (part ' + part.join('/') + ')' : '') + ':');
  for (const test of selected) console.log('    ' + test.name);
  for (const test of selected) {
    try {
      await test.fn();
      console.log('  [PASS] ' + test.name);
      passed += 1;
    } catch (err) {
      console.error('  [FAIL] ' + test.name + ': ' + err.message);
      throw err;
    }
  }

  console.log(`\nALL SUB-PHASE 2 TESTS PASSED (${passed} checks in ${IS_PG_MODE ? 'POSTGRES' : 'IN-MEMORY'} mode)\n`);
}

(async () => {
  try {
    await setupIsolatedSchemaIfNeeded();
    if (!setupOnly && !dropSchema) await runSuite();
  } catch (err) {
    console.error('SUB-PHASE 2 SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    if (server && server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
    try {
      const mkt = getMarketplaceRepository();
      if (mkt && mkt.pool && typeof mkt.pool.end === 'function') await mkt.pool.end();
    } catch (_) {}
    try {
      const money = getMoneyRepository();
      if (money && money.pool && typeof money.pool.end === 'function') await money.pool.end();
    } catch (_) {}
    await closeAllSharedPools();
    setMoneyRepository(null);
    setMarketplaceRepository(null);
    if (schemaCreated && setupPool && (!setupOnly || process.exitCode)) {
      try {
        await setupPool.query(`DROP SCHEMA IF EXISTS "${createdSchema}" CASCADE`);
      } catch (dropErr) {
        console.error(`Error cleaning up schema ${createdSchema}:`, dropErr.message);
        process.exitCode = 1;
      }
    }
    if (setupPool) { try { await setupPool.end(); } catch (_) { process.exitCode = 1; } }
  }
})();
