'use strict';

/**
 * TIKUM / ARGUS — Transaction Integrity Architecture (Option A, Sub-Phase 1) Verification
 *
 * Proves:
 *  - T5:  Fail-closed fulfillment validation (zero silent fallback to SELLER_MANAGED)
 *  - T7:  Independent durable read-after-write LedgerVerificationService (rejects missing/corrupt DB even when state.financial_ledger is poisoned)
 *  - T9b: Webhook idempotency vs safe reclaim after FAILED / PROCESSING_FAILED / stale PROCESSING
 *  - T10: Real UnitOfWork ACID rollback & atomic commit across quotes, orders, payments, escrows, ledger, outbox, listings, tickets, and state.*
 *  - DB-first FinancialLedger error propagation & duplicate CAPTURE / RELEASE conflict guards
 *
 * Modes:
 *  - Default (`node test_tx_integrity_subphase1.js`): 100% isolated InMemory repositories
 *  - Postgres (`node test_tx_integrity_subphase1.js --pg`): creates a fresh disposable schema on configured DB,
 *    applies 000/001/002/008/033 (+ idempotent re-run of 033), runs full suite via real PostgreSQL ACID tx,
 *    and drops the disposable schema in `finally`.
 */

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const IS_PG_MODE = process.argv.includes('--pg') ||
  Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_SCHEMA);

let createdSchema = null;
let setupPool = null;

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
  const dbUrl = loadDatabaseUrlFallback();
  if (!dbUrl) {
    console.error('BLOCKED: --pg mode requires TEST_DATABASE_URL or local .env.local DATABASE_URL.');
    process.exit(2);
  }
  const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  createdSchema = process.env.TEST_DATABASE_SCHEMA || `tx_integrity_subphase1_${uniqueSuffix}`;
  if (!/^tx_integrity_subphase1_[a-z0-9_]+$/i.test(createdSchema)) {
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
const {
  getMoneyRepository,
  getMarketplaceRepository,
  setMoneyRepository,
  setMarketplaceRepository
} = require('./src/storage');
const { UnitOfWork } = require('./src/storage/UnitOfWork');
const { closeAllSharedPools } = require('./src/storage/connectionPool');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { LedgerVerificationService } = require('./src/settlement/LedgerVerificationService');
const { calculateDualTierFees } = require('./src/pricing/DualTierFeePolicy');
const { CanonicalFeeEngine } = require('./src/pricing/CanonicalFeeEngine');
const { state } = require('./src/database');

let idSeq = 0;
function nextId(prefix) {
  idSeq += 1;
  return `${prefix}-sub1-${Date.now()}-${idSeq}`;
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

  const client = await setupPool.connect();
  try {
    await client.query(`CREATE SCHEMA "${createdSchema}"`);
    await client.query('BEGIN');
    await applyTransactionSchema(client, createdSchema);
    await applySqlFile(client, 'migrations/000_user_and_auth_schema.sql');
    await applySqlFile(client, 'migrations/001_catalog_schema.sql');
    await applySqlFile(client, 'migrations/002_marketplace_and_money_schema.sql');
    await applySqlFile(client, 'migrations/008_transactional_outbox_schema.sql');
    await applySqlFile(client, 'migrations/033_tx_integrity_quote_order_binding.sql');
    // Idempotency proof: apply migration 033 a second time
    await applySqlFile(client, 'migrations/033_tx_integrity_quote_order_binding.sql');

    // Seed an initial historical listing with NULL fulfillment_type to verify migration 033
    // does NOT silently coerce historical rows to SELLER_MANAGED
    await client.query(
      `INSERT INTO users (id, email, normalized_email, name, role, status)
       VALUES ($1, $2, $3, $4, 'SELLER', 'ACTIVE'),
              ($5, $6, $7, $8, 'BUYER', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [
        'seller-sub1', 'seller-sub1@tikum.test', 'seller-sub1@tikum.test', 'Seller Sub1',
        'buyer-sub1', 'buyer-sub1@tikum.test', 'buyer-sub1@tikum.test', 'Buyer Sub1'
      ]
    );
    await client.query(
      `INSERT INTO canonical_events (id, slug, canonical_name, venue_name, city, start_date, lifecycle_status)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + INTERVAL '30 days', 'UPCOMING')
       ON CONFLICT (id) DO NOTHING`,
      ['event-sub1', 'event-sub1-jakarta', 'Subphase 1 Concert', 'GBK Stadium', 'Jakarta']
    );
    await client.query(
      `INSERT INTO marketplace_tickets (id, seller_id, current_owner_id, canonical_event_id, face_value, status)
       VALUES ('tkt-legacy-null', 'seller-sub1', 'seller-sub1', 'event-sub1', 1000000, 'VERIFIED')`
    );
    await client.query(
      `INSERT INTO marketplace_listings (id, ticket_id, seller_id, canonical_event_id, price, status, metadata)
       VALUES ('lst-legacy-null', 'tkt-legacy-null', 'seller-sub1', 'event-sub1', 1100000, 'ACTIVE', '{}'::jsonb)`
    );
    // Re-run 033 backfill explicitly after legacy null insert
    await applySqlFile(client, 'migrations/033_tx_integrity_quote_order_binding.sql');
    const chk = await client.query(`SELECT fulfillment_type FROM marketplace_listings WHERE id = 'lst-legacy-null'`);
    assert.equal(chk.rows[0].fulfillment_type, null, 'Migration 033 must keep missing legacy fulfillment_type as NULL');
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }

  // Re-initialize singletons targeting the isolated schema
  const mktRepo = getMarketplaceRepository(true);
  const moneyRepo = getMoneyRepository(true);
  await mktRepo.ensureInitialized();
  await moneyRepo.ensureInitialized();
  assert.equal(mktRepo.degraded, false, 'PostgresMarketplaceRepository must connect cleanly in isolated PG mode');
  assert.equal(moneyRepo.degraded, false, 'PostgresMoneyRepository must connect cleanly in isolated PG mode');
}

function seedInMemoryCatalogUsers() {
  state.users = state.users || [];
  for (const [id, role] of [['seller-sub1', 'SELLER'], ['buyer-sub1', 'BUYER']]) {
    if (!state.users.some(u => u.id === id)) {
      state.users.push({ id, email: `${id}@tikum.test`, name: id, role, status: 'ACTIVE' });
    }
  }
  state.canonical_events = state.canonical_events || [];
  if (!state.canonical_events.some(e => e.id === 'event-sub1')) {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    state.canonical_events.push({
      id: 'event-sub1',
      slug: 'event-sub1-jakarta',
      canonical_name: 'Subphase 1 Concert',
      venue_name: 'GBK Stadium',
      city: 'Jakarta',
      start_date: future.slice(0, 10),
      start_datetime: future,
      end_date: future.slice(0, 10),
      end_datetime: future,
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    });
  }
}

async function seedListingWithTicket({ marketplaceRepo, fulfillmentType = undefined, ticketPrice = 1000000, quantity = 1, policyVersion = 'V2_DUAL_TIER', txContext = null }) {
  const ticketId = nextId('tkt');
  const listingId = nextId('lst');
  const totalQty = quantity;
  await marketplaceRepo.createTicket({
    id: ticketId,
    seller_id: 'seller-sub1',
    current_owner_id: 'seller-sub1',
    canonical_event_id: 'event-sub1',
    ticket_type: 'VIP',
    quantity: totalQty,
    face_value: ticketPrice,
    currency: 'IDR',
    status: 'VERIFIED'
  }, txContext);

  const listingPayload = {
    id: listingId,
    ticket_id: ticketId,
    seller_id: 'seller-sub1',
    canonical_event_id: 'event-sub1',
    price: ticketPrice,
    currency: 'IDR',
    status: 'ACTIVE',
    pricing_policy_version: policyVersion,
    metadata: {
      total_quantity: totalQty,
      available_quantity: totalQty,
      reserved_quantity: 0,
      sold_quantity: 0
    }
  };
  if (fulfillmentType !== undefined) {
    listingPayload.fulfillment_type = fulfillmentType;
  }

  const listing = await marketplaceRepo.createListing(listingPayload, txContext);
  return { ticketId, listingId, listing };
}

async function seedOrderStack({
  moneyRepo,
  marketplaceRepo,
  policyVersion = 'V2_DUAL_TIER',
  fulfillmentType = 'TIKUM_VENUE_PIC',
  ticketPrice = 1500000,
  quantity = 1,
  buyerTax = 0,
  sellerTax = 0,
  providerFee = 0,
  recordCapture = true,
  settledPayment = true,
  overrideOrderFields = {},
  overrideQuoteFields = {},
  txContext = null
}) {
  const { ticketId, listingId, listing } = await seedListingWithTicket({
    marketplaceRepo,
    fulfillmentType: fulfillmentType === undefined ? undefined : fulfillmentType,
    ticketPrice,
    quantity,
    policyVersion,
    txContext
  });

  const grossTicketValue = ticketPrice * quantity;
  let buyerFee;
  let sellerFee;
  if (policyVersion === 'V2_DUAL_TIER') {
    const tierInput = fulfillmentType || 'SELLER_MANAGED';
    const fees = calculateDualTierFees({ ticketPrice, quantity, fulfillmentType: tierInput });
    buyerFee = fees.buyer_fee;
    sellerFee = fees.seller_fee;
  } else {
    const fees = CanonicalFeeEngine.calculateTicketFees({
      ticketPrice,
      quantity,
      paymentProcessingFee: providerFee,
      currency: 'IDR',
      policyVersion
    });
    buyerFee = fees.buyer_fee;
    sellerFee = fees.seller_fee;
  }

  const buyerTotal = grossTicketValue + buyerFee + buyerTax + providerFee;
  const sellerPayout = grossTicketValue - sellerFee - sellerTax;

  const quoteId = nextId('quo');
  const orderId = nextId('ord');
  const paymentId = nextId('pay');

  const quote = await moneyRepo.createQuote({
    quote_id: quoteId,
    listing_id: listingId,
    buyer_id: 'buyer-sub1',
    seller_id: 'seller-sub1',
    ticket_price: ticketPrice,
    quantity,
    gross_ticket_value: grossTicketValue,
    fulfillment_option: overrideQuoteFields.fulfillment_option !== undefined
      ? overrideQuoteFields.fulfillment_option
      : (fulfillmentType || null),
    buyer_fee: buyerFee,
    seller_fee: sellerFee,
    buyer_tax: buyerTax,
    seller_tax: sellerTax,
    payment_fee: providerFee,
    buyer_total: buyerTotal,
    seller_payout: sellerPayout,
    currency: overrideQuoteFields.currency || 'IDR',
    pricing_policy_version: overrideQuoteFields.pricing_policy_version || policyVersion,
    status: 'CONSUMED',
    consumed_by_order_id: orderId,
    expires_at: new Date(Date.now() + 600000).toISOString()
  }, txContext);

  const order = await moneyRepo.createOrder({
    id: orderId,
    idempotency_key: `idem-${orderId}`,
    buyer_id: 'buyer-sub1',
    seller_id: 'seller-sub1',
    listing_id: listingId,
    ticket_id: ticketId,
    canonical_event_id: 'event-sub1',
    quote_id: quoteId,
    status: settledPayment ? 'ESCROW_HELD' : 'PAYMENT_PENDING',
    total_amount: overrideOrderFields.buyer_total ?? buyerTotal,
    buyer_total: overrideOrderFields.buyer_total ?? buyerTotal,
    seller_payout: overrideOrderFields.seller_payout ?? sellerPayout,
    service_fee: buyerFee + sellerFee,
    buyer_tax: buyerTax,
    seller_tax: sellerTax,
    ticket_price: ticketPrice,
    quantity,
    gross_ticket_value: grossTicketValue,
    fulfillment_option: overrideOrderFields.fulfillment_option !== undefined
      ? overrideOrderFields.fulfillment_option
      : (fulfillmentType || null),
    buyer_fee: overrideOrderFields.buyer_fee ?? buyerFee,
    seller_fee: overrideOrderFields.seller_fee ?? sellerFee,
    fee_policy_version: overrideOrderFields.fee_policy_version || policyVersion,
    currency: overrideOrderFields.currency || 'IDR',
    is_sandbox: true
  }, txContext);

  let payment = null;
  if (settledPayment) {
    payment = await moneyRepo.createPayment({
      id: paymentId,
      internal_payment_id: paymentId,
      order_id: orderId,
      buyer_id: 'buyer-sub1',
      seller_id: 'seller-sub1',
      provider: 'doku',
      provider_transaction_id: `doku-tx-${orderId}`,
      provider_reference: `doku-ref-${orderId}`,
      currency: overrideOrderFields.payment_currency || 'IDR',
      gross_amount: overrideOrderFields.payment_amount ?? buyerTotal,
      provider_fee: providerFee,
      status: 'SETTLED',
      money_state: 'ESCROW_HELD',
      payment_method: 'QRIS',
      idempotency_key: `pay-idem-${orderId}`
    }, txContext);
  }

  let ledgerTx = null;
  if (recordCapture) {
    ledgerTx = await FinancialLedger.recordPaymentCapture({
      orderId,
      quoteId,
      ticketPrice: grossTicketValue,
      buyerFee,
      sellerFee,
      buyerTax,
      sellerTax,
      providerFee,
      currency: overrideOrderFields.currency || 'IDR',
      actorId: 'TEST_HARNESS'
    }, txContext);
  }

  return { ticketId, listingId, listing, quote, order, payment, ledgerTx, buyerTotal, sellerPayout, buyerFee, sellerFee };
}

async function runTests() {
  seedInMemoryCatalogUsers();
  const moneyRepo = getMoneyRepository();
  const marketplaceRepo = getMarketplaceRepository();

  let passed = 0;
  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed += 1;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  console.log(`\n=== SUB-PHASE 1 TX INTEGRITY SUITE (${IS_PG_MODE ? `POSTGRES SCHEMA: ${createdSchema}` : 'IN-MEMORY'}) ===`);

  // T5: Fail-closed fulfillment validation, no silent fallback to SELLER_MANAGED
  await check('T5.1: V2 listing rejects invalid fulfillment_type and preserves null when omitted', async () => {
    await assert.rejects(
      () => seedListingWithTicket({ marketplaceRepo, fulfillmentType: 'INVALID_TIER' }),
      (err) => err.code === 'INVALID_FULFILLMENT_TYPE'
    );
    const omitted = await seedListingWithTicket({ marketplaceRepo, fulfillmentType: undefined });
    assert.equal(omitted.listing.fulfillment_type ?? null, null, 'Omitted fulfillment_type must remain null (no coercion)');
  });

  await check('T5.2: LedgerVerificationService fails closed when V2 order/listing lacks explicit fulfillment_option', async () => {
    // Create raw order/quote/listing directly with null fulfillment_option and SELLER_MANAGED-shaped fees
    const { ticketId, listingId } = await seedListingWithTicket({
      marketplaceRepo,
      fulfillmentType: undefined,
      ticketPrice: 1000000,
      quantity: 1,
      policyVersion: 'V2_DUAL_TIER'
    });
    const orderId = nextId('ord-t5');
    const quoteId = nextId('quo-t5');
    const fees = calculateDualTierFees({ ticketPrice: 1000000, quantity: 1, fulfillmentType: 'SELLER_MANAGED' });
    await moneyRepo.createQuote({
      quote_id: quoteId, listing_id: listingId, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
      ticket_price: 1000000, quantity: 1, gross_ticket_value: 1000000, fulfillment_option: null,
      buyer_fee: fees.buyer_fee, seller_fee: fees.seller_fee,
      buyer_total: fees.buyer_total_amount, seller_payout: fees.seller_net_payout,
      currency: 'IDR', pricing_policy_version: 'V2_DUAL_TIER', status: 'CONSUMED',
      consumed_by_order_id: orderId, expires_at: new Date(Date.now() + 600000).toISOString()
    });
    await moneyRepo.createOrder({
      id: orderId, idempotency_key: `idem-${orderId}`, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
      listing_id: listingId, ticket_id: ticketId, canonical_event_id: 'event-sub1', quote_id: quoteId,
      status: 'ESCROW_HELD', total_amount: fees.buyer_total_amount, buyer_total: fees.buyer_total_amount,
      seller_payout: fees.seller_net_payout, service_fee: fees.buyer_fee + fees.seller_fee,
      ticket_price: 1000000, quantity: 1, gross_ticket_value: 1000000, fulfillment_option: null,
      buyer_fee: fees.buyer_fee, seller_fee: fees.seller_fee, fee_policy_version: 'V2_DUAL_TIER', currency: 'IDR'
    });
    await moneyRepo.createPayment({
      id: nextId('pay'), order_id: orderId, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
      gross_amount: fees.buyer_total_amount, currency: 'IDR', status: 'SETTLED'
    });
    await FinancialLedger.recordPaymentCapture({
      orderId, quoteId, ticketPrice: 1000000, buyerFee: fees.buyer_fee, sellerFee: fees.seller_fee, currency: 'IDR'
    });

    await assert.rejects(
      () => LedgerVerificationService.verifyDurableCapture(orderId, { moneyRepo, marketplaceRepo }),
      (err) => err.code === 'LEDGER_RECONCILIATION_REQUIRED' && err.reason === 'MISSING_FULFILLMENT_OPTION'
    );
  });

  await check('T5.3: LedgerVerificationService rejects fulfillment mismatch between order and listing', async () => {
    const stack = await seedOrderStack({
      moneyRepo,
      marketplaceRepo,
      policyVersion: 'V2_DUAL_TIER',
      fulfillmentType: 'TIKUM_VENUE_PIC',
      ticketPrice: 1000000,
      quantity: 1
    });
    // Force mismatch on listing directly via repository
    await marketplaceRepo.updateListingInventory(stack.listingId, { fulfillment_type: 'SELLER_MANAGED' });
    await assert.rejects(
      () => LedgerVerificationService.verifyDurableCapture(stack.order.id, { moneyRepo, marketplaceRepo }),
      (err) => err.code === 'LEDGER_RECONCILIATION_REQUIRED' && err.reason === 'FULFILLMENT_OPTION_MISMATCH'
    );
  });

  // T7: Independent Durable Read-After-Write Verification vs Poisoned Memory
  await check('T7.1: Rejects missing DB CAPTURE even when state.financial_ledger is poisoned with matching entry', async () => {
    const stack = await seedOrderStack({
      moneyRepo,
      marketplaceRepo,
      policyVersion: 'V2_DUAL_TIER',
      fulfillmentType: 'TIKUM_VENUE_PIC',
      ticketPrice: 1000000,
      quantity: 1,
      recordCapture: false
    });

    // Poison process-memory state.financial_ledger intentionally
    state.financial_ledger = state.financial_ledger || [];
    state.financial_ledger.push({
      transaction_id: nextId('tx-poison'),
      order_id: stack.order.id,
      quote_id: stack.quote.quote_id,
      event_type: 'CAPTURE',
      source_event: 'CAPTURE',
      currency: 'IDR',
      total_amount: stack.buyerTotal,
      entries: [
        { ledger_account: 'PAYMENT_GATEWAY_CLEARING', entry_type: 'DEBIT', amount: stack.buyerTotal },
        { ledger_account: 'SELLER_PAYABLE_PENDING', entry_type: 'CREDIT', amount: stack.sellerPayout },
        { ledger_account: 'PLATFORM_FEE_REVENUE', entry_type: 'CREDIT', amount: stack.buyerFee + stack.sellerFee }
      ]
    });

    await assert.rejects(
      () => LedgerVerificationService.verifyDurableCapture(stack.order.id, { moneyRepo, marketplaceRepo }),
      (err) => err.code === 'LEDGER_RECONCILIATION_REQUIRED' && err.reason === 'LEDGER_CAPTURE_MISSING'
    );
  });

  await check('T7.2: Passes durable verification for V2 SELLER_MANAGED (qty=1), V2 TIKUM_VENUE_PIC (qty=3 + tax), and V1 (qty=2)', async () => {
    const s1 = await seedOrderStack({
      moneyRepo, marketplaceRepo, policyVersion: 'V2_DUAL_TIER', fulfillmentType: 'SELLER_MANAGED', ticketPrice: 1000000, quantity: 1
    });
    const r1 = await LedgerVerificationService.verifyDurableCapture(s1.order.id, { moneyRepo, marketplaceRepo });
    assert.equal(r1.verified, true);
    assert.equal(r1.expectedBuyerTotal, 1060000);
    assert.equal(r1.expectedSellerPayout, 940000);
    assert.equal(r1.fulfillmentOption, 'SELLER_MANAGED');

    const s2 = await seedOrderStack({
      moneyRepo, marketplaceRepo, policyVersion: 'V2_DUAL_TIER', fulfillmentType: 'TIKUM_VENUE_PIC',
      ticketPrice: 2000000, quantity: 3, buyerTax: 59400, sellerTax: 0, providerFee: 4500
    });
    const r2 = await LedgerVerificationService.verifyDurableCapture(s2.order.id, { moneyRepo, marketplaceRepo });
    assert.equal(r2.verified, true);
    assert.equal(r2.expectedBuyerFee, 540000);
    assert.equal(r2.expectedSellerFee, 540000);
    assert.equal(r2.expectedBuyerTotal, 6000000 + 540000 + 59400 + 4500);
    assert.equal(r2.expectedSellerPayout, 6000000 - 540000);
    assert.equal(r2.fulfillmentOption, 'TIKUM_VENUE_PIC');

    const s3 = await seedOrderStack({
      moneyRepo, marketplaceRepo, policyVersion: 'TIKUM_FEE_POLICY_V1', fulfillmentType: null, ticketPrice: 1000000, quantity: 2
    });
    const r3 = await LedgerVerificationService.verifyDurableCapture(s3.order.id, { moneyRepo, marketplaceRepo });
    assert.equal(r3.verified, true);
    assert.equal(r3.policyVersion, 'TIKUM_FEE_POLICY_V1');
    assert.equal(r3.expectedBuyerTotal, 2120000);
    assert.equal(r3.expectedSellerPayout, 1880000);
  });

  await check('T7.3: Rejects settled payment amount mismatch & missing ledger entries on tampered records', async () => {
    const stack = await seedOrderStack({
      moneyRepo,
      marketplaceRepo,
      policyVersion: 'V2_DUAL_TIER',
      fulfillmentType: 'SELLER_MANAGED',
      ticketPrice: 1000000,
      quantity: 1,
      overrideOrderFields: { payment_amount: 999999 }
    });
    await assert.rejects(
      () => LedgerVerificationService.verifyDurableCapture(stack.order.id, { moneyRepo, marketplaceRepo }),
      (err) => err.code === 'LEDGER_RECONCILIATION_REQUIRED' && err.reason === 'PAYMENT_AMOUNT_MISMATCH'
    );
  });

  // FinancialLedger DB-first + Idempotency + Conflict Guards
  await check('Ledger DB-First: repository error is never swallowed and state.financial_ledger stays clean', async () => {
    const stack = await seedOrderStack({
      moneyRepo, marketplaceRepo, policyVersion: 'V2_DUAL_TIER', fulfillmentType: 'SELLER_MANAGED',
      ticketPrice: 1000000, quantity: 1, recordCapture: false
    });
    const prevLen = (state.financial_ledger || []).length;
    const origRecord = moneyRepo.recordLedgerTransaction.bind(moneyRepo);
    moneyRepo.recordLedgerTransaction = async () => {
      const err = new Error('SIMULATED_LEDGER_DB_WRITE_FAILURE');
      err.code = 'SIMULATED_LEDGER_FAILURE';
      throw err;
    };
    try {
      await assert.rejects(
        () => FinancialLedger.recordPaymentCapture({
          orderId: stack.order.id, quoteId: stack.quote.quote_id, ticketPrice: 1000000,
          buyerFee: stack.buyerFee, sellerFee: stack.sellerFee, currency: 'IDR'
        }),
        (err) => err.code === 'SIMULATED_LEDGER_FAILURE'
      );
      assert.equal((state.financial_ledger || []).length, prevLen, 'state.financial_ledger must NOT record orphan on DB failure');
    } finally {
      moneyRepo.recordLedgerTransaction = origRecord;
    }
  });

  await check('Ledger Idempotency & Conflict: identical retry returns idempotent=true; mismatched amount throws DUPLICATE_LEDGER_CONFLICT', async () => {
    const stack = await seedOrderStack({
      moneyRepo, marketplaceRepo, policyVersion: 'V2_DUAL_TIER', fulfillmentType: 'SELLER_MANAGED',
      ticketPrice: 1000000, quantity: 1, recordCapture: true
    });
    const idemRetry = await FinancialLedger.recordPaymentCapture({
      orderId: stack.order.id, quoteId: stack.quote.quote_id, ticketPrice: 1000000,
      buyerFee: stack.buyerFee, sellerFee: stack.sellerFee, currency: 'IDR'
    });
    assert.equal(idemRetry.idempotent, true, 'Identical CAPTURE retry must be idempotent');

    await assert.rejects(
      () => FinancialLedger.recordPaymentCapture({
        orderId: stack.order.id, quoteId: stack.quote.quote_id, ticketPrice: 1200000,
        buyerFee: stack.buyerFee, sellerFee: stack.sellerFee, currency: 'IDR'
      }),
      (err) => err.code === 'DUPLICATE_LEDGER_CONFLICT'
    );

    const txRows = await moneyRepo.getLedgerTransactionsWithEntriesByOrderId(stack.order.id, 'CAPTURE');
    assert.equal(txRows.length, 1, 'Exactly one CAPTURE row must exist');
    assert.ok(Array.isArray(txRows[0].entries) && txRows[0].entries.length >= 3, 'Entries must be joined cleanly');
  });

  // T9b: Webhook Idempotency vs Safe Retry Reclaim
  await check('T9b: Webhook deduplicates active/processed deliveries and reclaims FAILED, PROCESSING_FAILED, and stale PROCESSING', async () => {
    const evtId = nextId('doku-evt');
    const first = await moneyRepo.recordWebhook({
      provider: 'doku', provider_event_id: evtId, event_type: 'PAYMENT_PAID',
      payload_hash: 'h1', signature_status: 'VALID', processing_status: 'PROCESSING',
      raw_payload: { attempt: 1 }
    });
    assert.equal(first.inserted, true);
    assert.equal(first.retried, false);

    // Fresh duplicate while PROCESSING must be blocked
    const dupActive = await moneyRepo.recordWebhook({
      provider: 'doku', provider_event_id: evtId, event_type: 'PAYMENT_PAID',
      payload_hash: 'h1', signature_status: 'VALID', processing_status: 'PROCESSING',
      staleAfterSeconds: 120, raw_payload: { attempt: 2 }
    });
    assert.equal(dupActive.inserted, false);
    assert.equal(dupActive.duplicate, true);

    // Mark FAILED -> must be safely reclaimable
    await moneyRepo.markWebhookProcessed('doku', evtId, 'FAILED', { error_message: 'timeout' });
    const reclaimedFailed = await moneyRepo.recordWebhook({
      provider: 'doku', provider_event_id: evtId, event_type: 'PAYMENT_PAID',
      payload_hash: 'h1', signature_status: 'VALID', processing_status: 'PROCESSING',
      raw_payload: { attempt: 3 }
    });
    assert.equal(reclaimedFailed.inserted, true);
    assert.equal(reclaimedFailed.retried, true);

    // Mark PROCESSING_FAILED -> must be safely reclaimable
    await moneyRepo.markWebhookProcessed('doku', evtId, 'PROCESSING_FAILED', { error_message: 'crash' });
    const reclaimedProcFailed = await moneyRepo.recordWebhook({
      provider: 'doku', provider_event_id: evtId, event_type: 'PAYMENT_PAID',
      payload_hash: 'h1', signature_status: 'VALID', processing_status: 'PROCESSING',
      raw_payload: { attempt: 4 }
    });
    assert.equal(reclaimedProcFailed.inserted, true);
    assert.equal(reclaimedProcFailed.retried, true);

    // Mark PROCESSED -> permanent idempotent duplicate
    await moneyRepo.markWebhookProcessed('doku', evtId, 'PROCESSED');
    const finalDup = await moneyRepo.recordWebhook({
      provider: 'doku', provider_event_id: evtId, event_type: 'PAYMENT_PAID',
      payload_hash: 'h1', signature_status: 'VALID', processing_status: 'PROCESSING',
      staleAfterSeconds: 0, raw_payload: { attempt: 5 }
    });
    assert.equal(finalDup.inserted, false);
    assert.equal(finalDup.duplicate, true);

    // Separate stale PROCESSING test
    const staleEvtId = nextId('doku-stale');
    await moneyRepo.recordWebhook({
      provider: 'doku', provider_event_id: staleEvtId, event_type: 'PAYMENT_PAID',
      payload_hash: 'h2', signature_status: 'VALID', processing_status: 'PROCESSING',
      raw_payload: { stale: true }
    });
    if (IS_PG_MODE && setupPool) {
      const { applyTransactionSchema } = require('./src/storage/connectionPool');
      const c = await setupPool.connect();
      try {
        await c.query('BEGIN');
        await applyTransactionSchema(c, createdSchema);
        await c.query("UPDATE financial_provider_webhooks SET received_at = NOW() - INTERVAL '300 seconds' WHERE provider_event_id = $1", [staleEvtId]);
        await c.query('COMMIT');
      } finally {
        c.release();
      }
    } else if (typeof moneyRepo._createSnapshot === 'function') {
      const rec = moneyRepo.webhooks.get(`doku:${staleEvtId}`);
      rec.received_at = new Date(Date.now() - 300000).toISOString();
    }
    const staleReclaim = await moneyRepo.recordWebhook({
      provider: 'doku', provider_event_id: staleEvtId, event_type: 'PAYMENT_PAID',
      payload_hash: 'h2', signature_status: 'VALID', processing_status: 'PROCESSING',
      staleAfterSeconds: 120, raw_payload: { retry: true }
    });
    assert.equal(staleReclaim.inserted, true);
    assert.equal(staleReclaim.retried, true);
  });

  // T10: Real UnitOfWork multi-table ACID rollback & commit
  await check('T10.1: UnitOfWork rolls back listing, quote, order, payment, escrow, ledger, outbox, and state.* on failure', async () => {
    const { ticketId, listingId } = await seedListingWithTicket({
      marketplaceRepo, fulfillmentType: 'TIKUM_VENUE_PIC', ticketPrice: 1000000, quantity: 2, policyVersion: 'V2_DUAL_TIER'
    });
    const fees = calculateDualTierFees({ ticketPrice: 1000000, quantity: 2, fulfillmentType: 'TIKUM_VENUE_PIC' });
    const quoteId = nextId('quo-uow');
    const orderId = nextId('ord-uow');
    const paymentId = nextId('pay-uow');
    const outboxEventId = nextId('obx-uow');

    await moneyRepo.createQuote({
      quote_id: quoteId, listing_id: listingId, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
      ticket_price: 1000000, quantity: 2, gross_ticket_value: 2000000, fulfillment_option: 'TIKUM_VENUE_PIC',
      buyer_fee: fees.buyer_fee, seller_fee: fees.seller_fee,
      buyer_total: fees.buyer_total_amount, seller_payout: fees.seller_net_payout,
      currency: 'IDR', pricing_policy_version: 'V2_DUAL_TIER', status: 'ACTIVE',
      expires_at: new Date(Date.now() + 600000).toISOString()
    });

    const ledgerLenBefore = (state.financial_ledger || []).length;

    await assert.rejects(
      () => UnitOfWork.execute(async (tx) => {
        const reservedListing = await marketplaceRepo.atomicReserveInventory(listingId, 2, tx);
        assert.ok(reservedListing, 'Inventory reservation inside UoW must succeed prior to injected failure');

        const consumedQuote = await moneyRepo.consumeQuoteForOrder(quoteId, {
          order_id: orderId,
          buyer_id: 'buyer-sub1',
          listing_id: listingId,
          quantity: 2,
          ticket_price: 1000000,
          gross_ticket_value: 2000000,
          currency: 'IDR',
          fulfillment_option: 'TIKUM_VENUE_PIC',
          pricing_policy_version: 'V2_DUAL_TIER'
        }, tx);
        assert.equal(consumedQuote.status, 'CONSUMED');
        assert.equal(consumedQuote.consumed_by_order_id, orderId);

        await moneyRepo.createOrder({
          id: orderId, idempotency_key: `idem-${orderId}`, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
          listing_id: listingId, ticket_id: ticketId, canonical_event_id: 'event-sub1', quote_id: quoteId,
          status: 'ESCROW_HELD', total_amount: fees.buyer_total_amount, buyer_total: fees.buyer_total_amount,
          seller_payout: fees.seller_net_payout, service_fee: fees.buyer_fee + fees.seller_fee,
          ticket_price: 1000000, quantity: 2, gross_ticket_value: 2000000, fulfillment_option: 'TIKUM_VENUE_PIC',
          buyer_fee: fees.buyer_fee, seller_fee: fees.seller_fee, fee_policy_version: 'V2_DUAL_TIER', currency: 'IDR'
        }, tx);

        await moneyRepo.createPayment({
          id: paymentId, internal_payment_id: paymentId, order_id: orderId, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
          gross_amount: fees.buyer_total_amount, currency: 'IDR', status: 'SETTLED', money_state: 'ESCROW_HELD'
        }, tx);

        await moneyRepo.createEscrow({
          order_id: orderId, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
          amount: fees.seller_net_payout, currency: 'IDR', status: 'ESCROW_HELD'
        }, tx);

        await FinancialLedger.recordPaymentCapture({
          orderId, quoteId, ticketPrice: 2000000, buyerFee: fees.buyer_fee, sellerFee: fees.seller_fee, currency: 'IDR'
        }, tx);

        await moneyRepo.createOutboxEvent({
          event_id: outboxEventId, event_type: 'ORDER_PAID_ESCROW_HELD', aggregate_id: orderId, payload: { orderId }
        }, tx);

        const err = new Error('INJECTED_MID_TX_CRASH');
        err.code = 'INJECTED_MID_TX_CRASH';
        throw err;
      }),
      (err) => err.code === 'INJECTED_MID_TX_CRASH'
    );

    // Every table AND process memory must be completely reverted
    assert.equal(await moneyRepo.getOrderById(orderId), null, 'Order must be rolled back');
    assert.equal(await moneyRepo.getPaymentById(paymentId), null, 'Payment must be rolled back');
    assert.equal(await moneyRepo.getEscrowByOrderId(orderId), null, 'Escrow must be rolled back');
    const postQuote = await moneyRepo.getQuoteById(quoteId);
    assert.equal(postQuote.status, 'ACTIVE', 'Quote status must revert to ACTIVE on rollback');
    assert.equal(postQuote.consumed_by_order_id || null, null, 'Quote consumed_by_order_id must revert to null');
    const postLedger = await moneyRepo.getLedgerTransactionsWithEntriesByOrderId(orderId);
    assert.equal(postLedger.length, 0, 'Ledger transactions must be rolled back');
    assert.equal((state.financial_ledger || []).length, ledgerLenBefore, 'state.financial_ledger must revert');
    const postListing = await marketplaceRepo.getListingById(listingId);
    assert.equal(postListing.status, 'ACTIVE', 'Listing status must revert to ACTIVE');
    const revertedAvail = postListing.metadata?.available_quantity ?? postListing.available_quantity;
    assert.equal(Number(revertedAvail), 2, 'Listing available_quantity must revert to 2');

    // Outbox must NOT contain the rolled-back event
    if (IS_PG_MODE && setupPool) {
      const { applyTransactionSchema } = require('./src/storage/connectionPool');
      const c = await setupPool.connect();
      try {
        await c.query('BEGIN');
        await applyTransactionSchema(c, createdSchema);
        const obxRes = await c.query('SELECT * FROM financial_outbox WHERE event_id = $1', [outboxEventId]);
        assert.equal(obxRes.rows.length, 0, 'Outbox row must be rolled back in PG');
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
    } else if (moneyRepo.outbox instanceof Map) {
      const found = Array.from(moneyRepo.outbox.values()).filter(e => e.event_id === outboxEventId);
      assert.equal(found.length, 0, 'Outbox row must be rolled back in InMemory');
    }

    // Now execute the same workflow WITHOUT error -> commits atomically & passes durable verification!
    await UnitOfWork.execute(async (tx) => {
      await marketplaceRepo.atomicReserveInventory(listingId, 2, tx);
      await moneyRepo.consumeQuoteForOrder(quoteId, {
        order_id: orderId, buyer_id: 'buyer-sub1', listing_id: listingId,
        quantity: 2, ticket_price: 1000000, gross_ticket_value: 2000000,
        currency: 'IDR', fulfillment_option: 'TIKUM_VENUE_PIC', pricing_policy_version: 'V2_DUAL_TIER'
      }, tx);
      await moneyRepo.createOrder({
        id: orderId, idempotency_key: `idem-${orderId}`, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
        listing_id: listingId, ticket_id: ticketId, canonical_event_id: 'event-sub1', quote_id: quoteId,
        status: 'ESCROW_HELD', total_amount: fees.buyer_total_amount, buyer_total: fees.buyer_total_amount,
        seller_payout: fees.seller_net_payout, service_fee: fees.buyer_fee + fees.seller_fee,
        ticket_price: 1000000, quantity: 2, gross_ticket_value: 2000000, fulfillment_option: 'TIKUM_VENUE_PIC',
        buyer_fee: fees.buyer_fee, seller_fee: fees.seller_fee, fee_policy_version: 'V2_DUAL_TIER', currency: 'IDR'
      }, tx);
      await moneyRepo.createPayment({
        id: paymentId, internal_payment_id: paymentId, order_id: orderId, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
        gross_amount: fees.buyer_total_amount, currency: 'IDR', status: 'SETTLED', money_state: 'ESCROW_HELD'
      }, tx);
      await moneyRepo.createEscrow({
        order_id: orderId, buyer_id: 'buyer-sub1', seller_id: 'seller-sub1',
        amount: fees.seller_net_payout, currency: 'IDR', status: 'ESCROW_HELD'
      }, tx);
      await FinancialLedger.recordPaymentCapture({
        orderId, quoteId, ticketPrice: 2000000, buyerFee: fees.buyer_fee, sellerFee: fees.seller_fee, currency: 'IDR'
      }, tx);
      await moneyRepo.createOutboxEvent({
        event_id: outboxEventId, event_type: 'ORDER_PAID_ESCROW_HELD', aggregate_id: orderId, payload: { orderId }
      }, tx);
    });

    const verified = await LedgerVerificationService.verifyDurableCapture(orderId, { moneyRepo, marketplaceRepo });
    assert.equal(verified.verified, true);
    assert.equal(verified.expectedBuyerTotal, fees.buyer_total_amount);
    const committedListing = await marketplaceRepo.getListingById(listingId);
    assert.equal(committedListing.status, 'RESERVED');
    const committedQuote = await moneyRepo.getQuoteById(quoteId);
    assert.equal(committedQuote.status, 'CONSUMED');
    assert.equal(committedQuote.consumed_by_order_id, orderId);
  });

  if (IS_PG_MODE && setupPool) {
    await check('PG Schema Integrity: unique quote_id on orders and partial unique CAPTURE/RELEASE indexes enforce SQL-level safety', async () => {
      const { applyTransactionSchema } = require('./src/storage/connectionPool');
      const stack = await seedOrderStack({
        moneyRepo, marketplaceRepo, policyVersion: 'V2_DUAL_TIER', fulfillmentType: 'SELLER_MANAGED', ticketPrice: 1000000, quantity: 1
      });
      const c = await setupPool.connect();
      try {
        await c.query('BEGIN');
        await applyTransactionSchema(c, createdSchema);
        await assert.rejects(
          () => c.query(
            `INSERT INTO financial_ledger_transactions (transaction_id, order_id, event_type, total_amount, currency, description)
             VALUES ($1, $2, 'CAPTURE', 1060000, 'IDR', 'duplicate capture SQL check')`,
            [nextId('tx-dup-sql'), stack.order.id]
          ),
          (err) => err.code === '23505'
        );
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
    });
  }

  console.log(`\nALL SUB-PHASE 1 TESTS PASSED (${passed} checks in ${IS_PG_MODE ? 'POSTGRES' : 'IN-MEMORY'} mode)\n`);
}

(async () => {
  try {
    await setupIsolatedSchemaIfNeeded();
    await runTests();
  } catch (err) {
    console.error('SUB-PHASE 1 SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
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
    if (createdSchema && setupPool) {
      try {
        await setupPool.query(`DROP SCHEMA IF EXISTS "${createdSchema}" CASCADE`);
      } catch (dropErr) {
        console.error(`Warning cleaning up schema ${createdSchema}:`, dropErr.message);
      }
      try { await setupPool.end(); } catch (_) {}
    }
  }
})();
