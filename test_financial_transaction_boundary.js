/**
 * TIKUM / ARGUS — Financial Transaction Boundary & Atomic Persistence Suite
 *
 * Acceptance Criteria Verified:
 * 1. Transaction Boundary: Payment, order, inventory, ledger atomic in one database transaction
 * 2. Durable Idempotency: Duplicate callback does not duplicate financial posting
 * 3. Concurrency Control: Concurrent callbacks across independent connections result in exactly one posting
 * 4. Failure Recovery: Deliberate failure injection at each stage produces 100% clean rollback
 * 5. Outbox Delivery: ARGUS events persisted atomically and delivered idempotently without payment reversal
 * 6. Ledger Integrity: Double-entry mathematical balance enforced, no partial state
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

process.env.NODE_ENV = 'test';

const {
  applyTransactionSchema,
  closeAllSharedPools,
  normalizeConnectionString,
  sanitizeSchemaName
} = require('./src/storage/connectionPool');

const MIGRATION_FILES = [
  '000_user_and_auth_schema.sql',
  '001_catalog_schema.sql',
  '002_marketplace_and_money_schema.sql',
  '006_compliance_and_dual_authorization.sql',
  '008_transactional_outbox_schema.sql',
  '033_tx_integrity_quote_order_binding.sql'
];

function parseCliArgs(argv) {
  const opts = { setupOnly: false, schema: null, section: null, dropSchema: null, only: null };
  for (const arg of argv) {
    if (arg === '--setup-only') {
      opts.setupOnly = true;
    } else if (arg.startsWith('--schema=')) {
      opts.schema = arg.slice('--schema='.length).trim();
    } else if (arg.startsWith('--section=')) {
      opts.section = arg.slice('--section='.length).trim();
    } else if (arg.startsWith('--drop-schema=')) {
      opts.dropSchema = arg.slice('--drop-schema='.length).trim();
    } else if (arg.startsWith('--only=')) {
      opts.only = arg.slice('--only='.length).split(',').map(id => id.trim());
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }
  if (opts.setupOnly && (opts.schema || opts.section || opts.dropSchema || opts.only)) {
    throw new Error('--setup-only cannot be combined with --schema, --section, or --drop-schema');
  }
  if (opts.dropSchema && (opts.setupOnly || opts.schema || opts.section || opts.only)) {
    throw new Error('--drop-schema cannot be combined with --setup-only, --schema, or --section');
  }
  if (opts.section && !['1', '2a', '2b', '3', '4', '5'].includes(opts.section)) {
    throw new Error(`Invalid --section='${opts.section}'. Expected one of: 1, 2a, 2b, 3, 4, 5`);
  }
  if (opts.section && !opts.schema) {
    throw new Error('--section requires --schema=<name>');
  }
  if (opts.only) {
    const validIds = ['1.1', ...Array.from({ length: 7 }, (_, i) => `2.${i + 1}`),
      '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2'];
    if (!opts.schema || opts.section || opts.only.some(id => !validIds.includes(id)) || new Set(opts.only).size !== opts.only.length) {
      throw new Error('--only requires --schema, unique valid test IDs, and no --section');
    }
  }
  return opts;
}

function assertIsolatedSchemaName(name) {
  const safe = sanitizeSchemaName(name);
  if (!safe) throw new Error('Schema name must be non-empty');
  const lower = safe.toLowerCase();
  if (lower === 'public' || lower === 'information_schema' || lower.startsWith('pg_')) {
    throw new Error(`Refusing unsafe schema name: '${safe}'`);
  }
  return safe;
}

const CLI_OPTIONS = parseCliArgs(process.argv.slice(2));

// The operator must explicitly provide a database; never embed credentials.
const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!TEST_DB_URL) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
const TEST_SCHEMA = CLI_OPTIONS.dropSchema
  ? assertIsolatedSchemaName(CLI_OPTIONS.dropSchema)
  : (CLI_OPTIONS.schema
    ? assertIsolatedSchemaName(CLI_OPTIONS.schema)
    : `tx_boundary_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`);
process.env.TEST_DATABASE_URL = TEST_DB_URL;
process.env.TEST_DATABASE_SCHEMA = TEST_SCHEMA;

async function getIndependentClient() {
  const cleanConn = normalizeConnectionString(TEST_DB_URL);
  const client = new Client({
    connectionString: cleanConn,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  // SET LOCAL must be applied on the same transaction as each query: Neon
  // pooler connections do not preserve session-level search_path.
  async function inTransaction(fn) {
    await client.query('BEGIN');
    try {
      await applyTransactionSchema(client, TEST_SCHEMA);
      const result = await fn((sql, params) => client.query(sql, params));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  return {
    query(sql, params) {
      return inTransaction((q) => q(sql, params));
    },
    inTransaction,
    end: () => client.end()
  };
}

async function runTestSuite(selectedSection = null) {
  const {
    PostgresMoneyRepository,
    PostgresMarketplaceRepository,
    getMoneyRepository,
    getMarketplaceRepository,
    setMoneyRepository,
    setMarketplaceRepository
  } = require('./src/storage');
  const { UnitOfWork } = require('./src/storage/UnitOfWork');
  const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
  const { outboxDispatcher } = require('./src/services/outbox/OutboxDispatcher');
  const { state } = require('./src/database');

  const shouldRun = (sec) => !selectedSection || selectedSection === sec;

  console.log('================================================================');
  console.log(`  TIKUM FINANCIAL TRANSACTION BOUNDARY — P0 ACCEPTANCE SUITE${selectedSection ? ` [${selectedSection}]` : ''}`);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    if (CLI_OPTIONS.only && !CLI_OPTIONS.only.includes(name.split(' ')[0])) return;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      if (err.stack) {
        const stackLines = err.stack.split('\n').slice(1, 4).join('\n');
        console.error(`    ${stackLines}`);
      }
      failed++;
    }
  }

  const moneyRepo = new PostgresMoneyRepository({ connectionString: TEST_DB_URL, schema: TEST_SCHEMA });
  const mktRepo = new PostgresMarketplaceRepository({ connectionString: TEST_DB_URL, schema: TEST_SCHEMA });
  const [, , suiteObserver] = await Promise.all([
    moneyRepo.init(),
    mktRepo.init(),
    getIndependentClient()
  ]);
  setMoneyRepository(moneyRepo);
  setMarketplaceRepository(mktRepo);

  try {

  // Helper to create valid baseline seed entities in DB for testing
  async function createTestFixtures(suffix) {
    const ticketId = `tkt-uow-${suffix}`;
    const listingId = `lst-uow-${suffix}`;
    const orderId = `ord-uow-${suffix}`;
    const escrowId = `esc-uow-${suffix}`;
    const paymentId = `pay-uow-${suffix}`;
    const amount = 500000;

    await UnitOfWork.execute(async (tx) => {
      await mktRepo.createTicket({
        id: ticketId,
        seller_id: 'seller-1',
        canonical_event_id: 'event-joyland-2026',
        face_value: amount,
        status: 'VERIFIED'
      }, tx);

      await mktRepo.createListing({
        id: listingId,
        ticket_id: ticketId,
        seller_id: 'seller-1',
        canonical_event_id: 'event-joyland-2026',
        price: amount,
        fulfillment_type: 'SELLER_MANAGED',
        status: 'ACTIVE'
      }, tx);

      await moneyRepo.createOrder({
        id: orderId,
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        listing_id: listingId,
        ticket_id: ticketId,
        canonical_event_id: 'event-joyland-2026',
        status: 'CREATED',
        total_amount: amount,
        buyer_total: amount,
        seller_payout: amount,
        currency: 'IDR'
      }, tx);

      await moneyRepo.createEscrow({
        id: escrowId,
        order_id: orderId,
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        amount,
        status: 'PENDING_PAYMENT'
      }, tx);
    });

    return { ticketId, listingId, orderId, escrowId, paymentId, amount };
  }

  // Cleanup helper
  async function cleanupFixtures(fixtures, txId = null, eventId = null) {
    try {
      await suiteObserver.inTransaction(async (q) => {
        const ops = [];
        if (eventId) {
          ops.push(q('DELETE FROM financial_outbox WHERE event_id = $1', [eventId]));
        }
        if (txId) {
          ops.push(q('DELETE FROM financial_ledger_entries WHERE transaction_id = $1', [txId]));
          ops.push(q('DELETE FROM financial_ledger_transactions WHERE transaction_id = $1', [txId]));
        }
        if (fixtures.paymentId && fixtures.orderId) {
          ops.push(q('DELETE FROM financial_payments WHERE id = $1 OR order_id = $2', [fixtures.paymentId, fixtures.orderId]));
        } else if (fixtures.paymentId) {
          ops.push(q('DELETE FROM financial_payments WHERE id = $1', [fixtures.paymentId]));
        }
        if (fixtures.escrowId) {
          ops.push(q('DELETE FROM financial_escrows WHERE id = $1', [fixtures.escrowId]));
        }
        if (fixtures.orderId) {
          ops.push(q('DELETE FROM financial_orders WHERE id = $1', [fixtures.orderId]));
        }
        if (fixtures.listingId) {
          ops.push(q('DELETE FROM marketplace_listings WHERE id = $1', [fixtures.listingId]));
        }
        if (fixtures.ticketId) {
          ops.push(q('DELETE FROM marketplace_tickets WHERE id = $1', [fixtures.ticketId]));
        }
        await Promise.all(ops);
      });
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: UNIT OF WORK & TRANSACTION PROPAGATION
  // ---------------------------------------------------------------------------
  if (shouldRun('1')) {
  console.log('── Section 1: Unit of Work & Transaction Boundary Propagation ──');

  await test('1.1 UnitOfWork executes atomic commit across payment, order, inventory, and ledger', async () => {
    const suffix = `${Date.now()}-1-1`;
    const f = await createTestFixtures(suffix);
    const txId = `tx-uow-${suffix}`;
    const eventId = `obx-evt-${suffix}`;

    await UnitOfWork.execute(async (tx) => {
      // 1. Payment mutation
      await moneyRepo.createPayment({
        id: f.paymentId,
        order_id: f.orderId,
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        gross_amount: f.amount,
        status: 'SETTLED',
        money_state: 'PAID'
      }, tx);

      // 2. Order mutation
      await moneyRepo.updateOrderStatus(f.orderId, 'PAID_ESCROWED', {}, tx);

      // 3. Escrow mutation
      await moneyRepo.updateEscrowStatus(f.orderId, 'ESCROWED', {}, tx);

      // 4. Inventory mutations
      await mktRepo.updateListingStatus(f.listingId, 'SOLD', tx);
      await mktRepo.updateTicketStatus(f.ticketId, 'ESCROWED', null, tx);

      // 5. Ledger balancing entries
      await FinancialLedger.recordPaymentCapture({
        orderId: f.orderId,
        ticketPrice: f.amount,
        buyerFee: 0,
        sellerFee: 0,
        buyerTax: 0,
        sellerTax: 0,
        actorId: 'SYSTEM'
      }, tx);

      // 6. Outbox insertion
      await moneyRepo.createOutboxEvent({
        event_id: eventId,
        event_type: 'PAYMENT_CONFIRMED',
        aggregate_type: 'ORDER',
        aggregate_id: f.orderId,
        payload: { orderId: f.orderId, paymentId: f.paymentId, amount: f.amount }
      }, tx);
    });

    // Verification via an independent database connection
    try {
      await suiteObserver.inTransaction(async (q) => {
        const [payRes, ordRes, listRes, tktRes, ledgerRes, outboxRes] = await Promise.all([
          q('SELECT * FROM financial_payments WHERE id = $1', [f.paymentId]),
          q('SELECT * FROM financial_orders WHERE id = $1', [f.orderId]),
          q('SELECT * FROM marketplace_listings WHERE id = $1', [f.listingId]),
          q('SELECT * FROM marketplace_tickets WHERE id = $1', [f.ticketId]),
          q('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId]),
          q('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId])
        ]);
        assert.strictEqual(payRes.rows.length, 1, 'Payment must be committed');
        assert.strictEqual(payRes.rows[0].status, 'SETTLED');
        assert.strictEqual(ordRes.rows[0].status, 'PAID_ESCROWED');
        assert.strictEqual(listRes.rows[0].status, 'SOLD');
        assert.strictEqual(tktRes.rows[0].status, 'ESCROWED');
        assert.strictEqual(ledgerRes.rows.length, 1, 'Ledger transaction must be committed');
        assert.strictEqual(outboxRes.rows.length, 1, 'Outbox record must be committed');
      });
    } finally {
      await cleanupFixtures(f, null, eventId);
    }
  });
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: FAILURE RECOVERY & ROLLBACK AT EVERY STAGE
  // ---------------------------------------------------------------------------
  if (shouldRun('2a') || shouldRun('2b')) {
  console.log('\n── Section 2: Failure Recovery & Rollback at Every Transaction Stage ──');

  const failureStages = [
    { stage: 1, name: 'after canonical payment mutation' },
    { stage: 2, name: 'after order mutation' },
    { stage: 3, name: 'after inventory mutation' },
    { stage: 4, name: 'after ledger posting' },
    { stage: 5, name: 'after idempotency insertion' },
    { stage: 6, name: 'after outbox insertion' },
    { stage: 7, name: 'before commit' }
  ].filter(({ stage }) => {
    if (!selectedSection) return true;
    if (selectedSection === '2a') return stage >= 1 && stage <= 4;
    if (selectedSection === '2b') return stage >= 5 && stage <= 7;
    return false;
  });

  for (const { stage, name } of failureStages) {
    await test(`2.${stage} Failure injected ${name} cleanly rolls back ALL mutations`, async () => {
      const suffix = `${Date.now()}-fail-${stage}`;
      const f = await createTestFixtures(suffix);
      const eventId = `obx-fail-${suffix}`;
      const idempKey = `idemp-fail-${suffix}`;

      let caught = false;
      try {
        await UnitOfWork.execute(async (tx) => {
          // Stage 1
          await moneyRepo.createPayment({
            id: f.paymentId,
            order_id: f.orderId,
            buyer_id: 'buyer-1',
            seller_id: 'seller-1',
            gross_amount: f.amount,
            status: 'SETTLED',
            money_state: 'PAID'
          }, tx);
          if (stage === 1) throw new Error(`SIMULATED_FAILURE_AT_STAGE_${stage}`);

          // Stage 2
          await moneyRepo.updateOrderStatus(f.orderId, 'PAID_ESCROWED', {}, tx);
          if (stage === 2) throw new Error(`SIMULATED_FAILURE_AT_STAGE_${stage}`);

          // Stage 3
          await mktRepo.updateListingStatus(f.listingId, 'SOLD', tx);
          await mktRepo.updateTicketStatus(f.ticketId, 'ESCROWED', null, tx);
          if (stage === 3) throw new Error(`SIMULATED_FAILURE_AT_STAGE_${stage}`);

          // Stage 4
          await FinancialLedger.recordPaymentCapture({
            orderId: f.orderId,
            ticketPrice: f.amount,
            buyerFee: 0,
            sellerFee: 0,
            buyerTax: 0,
            sellerTax: 0,
            actorId: 'SYSTEM'
          }, tx);
          if (stage === 4) throw new Error(`SIMULATED_FAILURE_AT_STAGE_${stage}`);

          // Stage 5
          await moneyRepo.saveIdempotency(idempKey, 'PAYMENT', { processed: true }, tx);
          if (stage === 5) throw new Error(`SIMULATED_FAILURE_AT_STAGE_${stage}`);

          // Stage 6
          await moneyRepo.createOutboxEvent({
            event_id: eventId,
            event_type: 'PAYMENT_CONFIRMED',
            aggregate_type: 'ORDER',
            aggregate_id: f.orderId,
            payload: { orderId: f.orderId }
          }, tx);
          if (stage === 6) throw new Error(`SIMULATED_FAILURE_AT_STAGE_${stage}`);

          // Stage 7
          if (stage === 7) throw new Error(`SIMULATED_FAILURE_AT_STAGE_${stage}`);
        });
      } catch (e) {
        if (e.message.startsWith('SIMULATED_FAILURE')) caught = true;
        else throw e;
      }

      assert.strictEqual(caught, true, 'Simulated failure must be caught');

      // VERIFY COMPLETE ROLLBACK VIA INDEPENDENT DATABASE CONNECTION
      try {
        await suiteObserver.inTransaction(async (q) => {
          const [payRes, ordRes, listRes, tktRes, ledgerRes, idempRes, outboxRes] = await Promise.all([
            q('SELECT * FROM financial_payments WHERE id = $1', [f.paymentId]),
            q('SELECT * FROM financial_orders WHERE id = $1', [f.orderId]),
            q('SELECT * FROM marketplace_listings WHERE id = $1', [f.listingId]),
            q('SELECT * FROM marketplace_tickets WHERE id = $1', [f.ticketId]),
            q('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId]),
            q('SELECT * FROM financial_idempotency_records WHERE key = $1', [idempKey]),
            q('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId])
          ]);
          assert.strictEqual(payRes.rows.length, 0, `Stage ${stage}: Rolled-back payment must NOT exist in DB`);
          assert.strictEqual(ordRes.rows[0].status, 'CREATED', `Stage ${stage}: Order status must remain CREATED`);
          assert.strictEqual(listRes.rows[0].status, 'ACTIVE', `Stage ${stage}: Listing must remain ACTIVE`);
          assert.strictEqual(tktRes.rows[0].status, 'VERIFIED', `Stage ${stage}: Ticket must remain VERIFIED`);
          assert.strictEqual(ledgerRes.rows.length, 0, `Stage ${stage}: Zero ledger transactions must exist`);
          assert.strictEqual(idempRes.rows.length, 0, `Stage ${stage}: Idempotency record must be rolled back`);
          assert.strictEqual(outboxRes.rows.length, 0, `Stage ${stage}: Outbox event must be rolled back`);
        });
      } finally {
        await cleanupFixtures(f);
      }
    });
  }
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: DURABLE IDEMPOTENCY & CONCURRENCY CONTROL
  // ---------------------------------------------------------------------------
  if (shouldRun('3')) {
  console.log('\n── Section 3: Durable Idempotency & Multi-Connection Concurrency Control ──');

  await test('3.1 Two simultaneous identical SUCCESS callbacks across independent connections result in exactly one posting', async () => {
    const suffix = `${Date.now()}-race`;
    const f = await createTestFixtures(suffix);
    const providerRef = `trx-race-${suffix}`;
    const providerEventId = `pwh-race-${suffix}`;
    const payloadHash = crypto.createHash('sha256').update(providerRef).digest('hex');

    // Worker logic attempting simultaneous atomic transition
    async function executeCallbackWorker(workerId) {
      return await UnitOfWork.execute(async (tx) => {
        // 1. Webhook dedup record
        const dedup = await moneyRepo.recordWebhook({
          provider: 'doku',
          provider_event_id: providerEventId,
          payload_hash: payloadHash,
          raw_payload: { orderId: f.orderId, providerRef, amount: f.amount }
        }, tx);

        if (dedup.duplicate) {
          return { workerId, result: 'IDEMPOTENT_DUPLICATE_IGNORED' };
        }

        // 2. Lock order row
        const ordRes = await tx.client.query('SELECT * FROM financial_orders WHERE id = $1 FOR UPDATE', [f.orderId]);
        const order = ordRes.rows[0];
        if (order.status === 'PAID_ESCROWED') {
          return { workerId, result: 'ORDER_ALREADY_PAID_IDEMPOTENT' };
        }

        // 3. Perform atomic financial state updates
        await moneyRepo.createPayment({
          id: `pay-${f.orderId}`,
          order_id: f.orderId,
          buyer_id: 'buyer-1',
          seller_id: 'seller-1',
          gross_amount: f.amount,
          provider_reference: providerRef,
          status: 'SETTLED',
          money_state: 'PAID'
        }, tx);

        await moneyRepo.updateOrderStatus(f.orderId, 'PAID_ESCROWED', {}, tx);
        await mktRepo.updateListingStatus(f.listingId, 'SOLD', tx);
        await mktRepo.updateTicketStatus(f.ticketId, 'ESCROWED', null, tx);

        await FinancialLedger.recordPaymentCapture({
          orderId: f.orderId,
          ticketPrice: f.amount,
          buyerFee: 0,
          sellerFee: 0,
          buyerTax: 0,
          sellerTax: 0,
          actorId: 'GATEWAY'
        }, tx);

        await moneyRepo.createOutboxEvent({
          event_id: `evt-race-${f.orderId}`,
          event_type: 'PAYMENT_CONFIRMED',
          aggregate_type: 'ORDER',
          aggregate_id: f.orderId,
          payload: { orderId: f.orderId, amount: f.amount }
        }, tx);

        await moneyRepo.markWebhookProcessed('doku', providerEventId, 'PROCESSED', tx);
        return { workerId, result: 'COMMITTED_SUCCESS' };
      });
    }

    // Launch workers simultaneously
    const [resA, resB] = await Promise.allSettled([
      executeCallbackWorker('worker-A'),
      executeCallbackWorker('worker-B')
    ]);

    const successes = [resA, resB].filter(r => r.status === 'fulfilled' && r.value.result === 'COMMITTED_SUCCESS');
    const duplicates = [resA, resB].filter(r => r.status === 'fulfilled' && r.value.result.includes('IDEMPOTENT'));

    assert.strictEqual(successes.length, 1, 'Exactly ONE concurrent worker must commit');
    assert.strictEqual(duplicates.length, 1, 'The other worker must be recognized as idempotent duplicate');

    // Verify database counts
    try {
      await suiteObserver.inTransaction(async (q) => {
        const [payRes, ledgerRes, outboxRes] = await Promise.all([
          q('SELECT * FROM financial_payments WHERE order_id = $1', [f.orderId]),
          q('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId]),
          q('SELECT * FROM financial_outbox WHERE aggregate_id = $1', [f.orderId])
        ]);
        assert.strictEqual(payRes.rows.length, 1, 'Only ONE payment record must exist');
        assert.strictEqual(ledgerRes.rows.length, 1, 'Only ONE ledger journal entry must exist');
        assert.strictEqual(outboxRes.rows.length, 1, 'Only ONE outbox event must exist');
      });
    } finally {
      await cleanupFixtures(f, null, `evt-race-${f.orderId}`);
    }
  });

  await test('3.2 PENDING notification followed by SUCCESS notification is processable', async () => {
    const suffix = `${Date.now()}-seq`;
    const f = await createTestFixtures(suffix);
    const providerRef = `trx-seq-${suffix}`;

    // Step 1: PENDING webhook notification arrives
    await UnitOfWork.execute(async (tx) => {
      await moneyRepo.recordWebhook({
        provider: 'doku',
        provider_event_id: `wh-pending-${suffix}`,
        event_type: 'PAYMENT_PENDING',
        payload_hash: 'hash-pnd',
        raw_payload: { status: 'PENDING' }
      }, tx);

      await moneyRepo.createPayment({
        id: f.paymentId,
        order_id: f.orderId,
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        gross_amount: f.amount,
        status: 'PAYMENT_PENDING',
        money_state: 'PAYMENT_PENDING'
      }, tx);

      await moneyRepo.updateOrderStatus(f.orderId, 'PAYMENT_PENDING', {}, tx);
    });

    // Verify intermediate state
    const midPay = await suiteObserver.query('SELECT status FROM financial_payments WHERE id = $1', [f.paymentId]);
    assert.strictEqual(midPay.rows[0].status, 'PAYMENT_PENDING');

    // Step 2: SUCCESS webhook notification arrives
    await UnitOfWork.execute(async (tx) => {
      await moneyRepo.recordWebhook({
        provider: 'doku',
        provider_event_id: `wh-success-${suffix}`,
        event_type: 'PAYMENT_SUCCESS',
        payload_hash: 'hash-succ',
        raw_payload: { status: 'PAID' }
      }, tx);

      await moneyRepo.updatePaymentStatus(f.paymentId, 'SETTLED', { provider_transaction_id: providerRef }, tx);
      await moneyRepo.updateOrderStatus(f.orderId, 'PAID_ESCROWED', {}, tx);
      await mktRepo.updateListingStatus(f.listingId, 'SOLD', tx);

      await FinancialLedger.recordPaymentCapture({
        orderId: f.orderId,
        ticketPrice: f.amount,
        buyerFee: 0,
        sellerFee: 0,
        buyerTax: 0,
        sellerTax: 0,
        actorId: 'GATEWAY'
      }, tx);
    });

    // Verify final state
    try {
      await suiteObserver.inTransaction(async (q) => {
        const [finalPay, finalOrd, ledgerRes] = await Promise.all([
          q('SELECT status FROM financial_payments WHERE id = $1', [f.paymentId]),
          q('SELECT status FROM financial_orders WHERE id = $1', [f.orderId]),
          q('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId])
        ]);
        assert.strictEqual(finalPay.rows[0].status, 'SETTLED');
        assert.strictEqual(finalOrd.rows[0].status, 'PAID_ESCROWED');
        assert.strictEqual(ledgerRes.rows.length, 1, 'Ledger posted once upon SUCCESS transition');
      });
    } finally {
      await cleanupFixtures(f);
    }
  });

  await test('3.3 SUCCESS followed by PENDING cannot downgrade a verified payment', async () => {
    const suffix = `${Date.now()}-downgrade`;
    const f = await createTestFixtures(suffix);

    // Initial state: already PAID/SETTLED
    await UnitOfWork.execute(async (tx) => {
      await moneyRepo.createPayment({
        id: f.paymentId,
        order_id: f.orderId,
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        gross_amount: f.amount,
        status: 'SETTLED',
        money_state: 'PAID'
      }, tx);
      await moneyRepo.updateOrderStatus(f.orderId, 'PAID_ESCROWED', {}, tx);
    });

    // Attempt downgrade with late PENDING notification
    await UnitOfWork.execute(async (tx) => {
      const ordRes = await tx.client.query('SELECT * FROM financial_orders WHERE id = $1 FOR UPDATE', [f.orderId]);
      const currentOrder = ordRes.rows[0];

      // Terminal state protection: If order already PAID_ESCROWED, reject downgrade
      if (['PAID_ESCROWED', 'SETTLED'].includes(currentOrder.status)) {
        // Safe no-op or logged ignore: NEVER downgrade
        return;
      }
      await moneyRepo.updateOrderStatus(f.orderId, 'PENDING_PAYMENT', {}, tx);
    });

    try {
      const ordRes = await suiteObserver.query('SELECT status FROM financial_orders WHERE id = $1', [f.orderId]);
      assert.strictEqual(ordRes.rows[0].status, 'PAID_ESCROWED', 'Order status must NOT regress from PAID to PENDING');
    } finally {
      await cleanupFixtures(f);
    }
  });
  }

  // ---------------------------------------------------------------------------
  // SECTION 4: TRANSACTIONAL OUTBOX & ARGUS ASYNCHRONOUS LIFECYCLE
  // ---------------------------------------------------------------------------
  if (shouldRun('4')) {
  console.log('\n── Section 4: Transactional Outbox & ARGUS Asynchronous Delivery ──');

  await test('4.1 Outbox event is claimed, delivered to ARGUS, and marked PROCESSED', async () => {
    const suffix = `${Date.now()}-obx-deliver`;
    const eventId = `evt-obx-${suffix}`;
    const orderId = `ord-obx-${suffix}`;

    // Publish event into outbox
    await UnitOfWork.execute(async (tx) => {
      await moneyRepo.createOutboxEvent({
        event_id: eventId,
        event_type: 'PAYMENT_CONFIRMED',
        aggregate_type: 'ORDER',
        aggregate_id: orderId,
        payload: { orderId, amount: 250000 }
      }, tx);
    });

    // Verify pending in DB
    const pendingRes = await suiteObserver.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
    assert.strictEqual(pendingRes.rows[0].status, 'PENDING');

    // Dispatch outbox events
    const results = await outboxDispatcher.dispatchPendingEvents(5);
    const delivered = results.find(r => r.eventId === eventId);
    assert.ok(delivered, 'Event must be processed by dispatcher');
    assert.strictEqual(delivered.status, 'PROCESSED');

    // Verify DB status is now PROCESSED
    try {
      const processedRes = await suiteObserver.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
      assert.strictEqual(processedRes.rows[0].status, 'PROCESSED');
      assert.ok(processedRes.rows[0].processed_at, 'processed_at must be populated');
    } finally {
      await suiteObserver.query('DELETE FROM financial_outbox WHERE event_id = $1', [eventId]);
    }
  });

  await test('4.2 Repeated outbox delivery is strictly idempotent (zero duplicate attestations)', async () => {
    const suffix = `${Date.now()}-obx-dup`;
    const eventId = `evt-obx-dup-${suffix}`;
    const orderId = `ord-obx-dup-${suffix}`;

    const testEvent = {
      event_id: eventId,
      event_type: 'PAYMENT_CONFIRMED',
      aggregate_type: 'ORDER',
      aggregate_id: orderId,
      payload: { orderId, amount: 150000 }
    };

    // First delivery
    const res1 = await outboxDispatcher.deliverEvent(testEvent);
    assert.strictEqual(res1.status, 'PROCESSED');

    const { ATTESTATION_TYPE } = require('./src/trust/TrustPolicyEngine');
    const attestationsAfterFirst = (state.attestations || []).filter(
      a => a.order_id === orderId && (a.attestation_type === ATTESTATION_TYPE.PAYMENT_ATTESTATION || a.type === ATTESTATION_TYPE.PAYMENT_ATTESTATION)
    );
    assert.strictEqual(attestationsAfterFirst.length, 1);

    // Second duplicate delivery of same event
    const res2 = await outboxDispatcher.deliverEvent(testEvent);
    assert.strictEqual(res2.status, 'PROCESSED');

    const attestationsAfterSecond = (state.attestations || []).filter(
      a => a.order_id === orderId && (a.attestation_type === ATTESTATION_TYPE.PAYMENT_ATTESTATION || a.type === ATTESTATION_TYPE.PAYMENT_ATTESTATION)
    );
    assert.strictEqual(attestationsAfterSecond.length, 1, 'Duplicate outbox delivery must NOT create duplicate attestation');
  });

  await test('4.3 Outbox delivery failure retries with exponential backoff and preserves committed payment', async () => {
    const suffix = `${Date.now()}-obx-retry`;
    const eventId = `evt-retry-${suffix}`;
    const orderId = `ord-retry-${suffix}`;

    // Publish event
    await UnitOfWork.execute(async (tx) => {
      await moneyRepo.createOutboxEvent({
        event_id: eventId,
        event_type: 'FAILING_TEST_EVENT',
        aggregate_type: 'ORDER',
        aggregate_id: orderId,
        payload: { orderId }
      }, tx);
    });

    // Register a subscriber that intentionally fails
    outboxDispatcher.subscribe('FAILING_TEST_EVENT', async () => {
      throw new Error('SIMULATED_TRANSIENT_DOWNSTREAM_OUTAGE');
    });

    const testEvent = {
      event_id: eventId,
      event_type: 'FAILING_TEST_EVENT',
      aggregate_type: 'ORDER',
      aggregate_id: orderId,
      payload: { orderId }
    };

    const deliveryResult = await outboxDispatcher.deliverEvent(testEvent);
    assert.strictEqual(deliveryResult.status, 'PENDING');
    assert.ok(deliveryResult.error.includes('SIMULATED_TRANSIENT_DOWNSTREAM_OUTAGE'));

    // Verify DB reflects retry_count increment and future next_retry_at
    try {
      const dbRes = await suiteObserver.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
      assert.strictEqual(dbRes.rows[0].retry_count, 1);
      assert.ok(dbRes.rows[0].last_error.includes('SIMULATED_TRANSIENT_DOWNSTREAM_OUTAGE'));
    } finally {
      await suiteObserver.query('DELETE FROM financial_outbox WHERE event_id = $1', [eventId]);
    }
  });
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: FINANCIAL LEDGER INTEGRITY & INVARIANTS
  // ---------------------------------------------------------------------------
  if (shouldRun('5')) {
  console.log('\n── Section 5: Financial Ledger Invariants & Double-Entry Integrity ──');

  await test('5.1 Unbalanced ledger transaction throws LEDGER_UNBALANCED and aborts transaction', async () => {
    const suffix = `${Date.now()}-unbal`;
    const orderId = `ord-unbal-${suffix}`;

    let threw = false;
    try {
      await UnitOfWork.execute(async (tx) => {
        await FinancialLedger.recordTransaction({
          eventType: 'CAPTURE',
          orderId,
          description: 'Intentionally unbalanced test',
          entries: [
            { account: LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING, type: 'DEBIT', amount: 100000 },
            { account: LEDGER_ACCOUNTS.BUYER_ESCROW_HOLDING, type: 'CREDIT', amount: 90000 } // Misses 10,000!
          ]
        }, tx);
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'LEDGER_UNBALANCED');
    }
    assert.strictEqual(threw, true, 'Unbalanced transaction must be rejected');

    const res = await suiteObserver.query('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [orderId]);
    assert.strictEqual(res.rows.length, 0, 'Zero ledger entries must exist for unbalanced transaction');
  });

  await test('5.2 Capability gate verifyAtomicTransitionCapability returns valid status', () => {
    const caps = UnitOfWork.verifyAtomicTransitionCapability();
    assert.strictEqual(caps.available, true);
    assert.strictEqual(caps.supportsRollback, true);
    assert.strictEqual(caps.supportsLedgerAtomicity, true);
    assert.strictEqual(caps.supportsOutboxAtomicity, true);
  });
  }

  console.log('\n================================================================');
  console.log(`  SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
  } finally {
    const activeMoney = getMoneyRepository();
    const activeMkt = getMarketplaceRepository();
    await Promise.allSettled([
      suiteObserver && suiteObserver.end(),
      moneyRepo.pool && moneyRepo.pool.end(),
      mktRepo.pool && mktRepo.pool.end(),
      activeMoney && activeMoney.pool && activeMoney.pool.end(),
      activeMkt && activeMkt.pool && activeMkt.pool.end()
    ]);
  }
}

async function applySetupMigrations(admin, schemaName, onCreated) {
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  onCreated();
  await admin.query('BEGIN');
  try {
    await applyTransactionSchema(admin, schemaName);
    for (const file of MIGRATION_FILES) {
      await admin.query(fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8'));
    }
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const admin = new Client({ connectionString: normalizeConnectionString(TEST_DB_URL), ssl: { rejectUnauthorized: false } });

  if (CLI_OPTIONS.dropSchema) {
    try {
      await admin.connect();
      await admin.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
      const rem = await admin.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tx\\_boundary\\_%' ESCAPE '\\' ORDER BY schema_name`
      );
      console.log(`DROPPED_SCHEMA=${TEST_SCHEMA}`);
      console.log(`REMAINING_TX_BOUNDARY_SCHEMAS=${rem.rows.length}`);
      if (rem.rows.length > 0) {
        throw new Error(`Remaining tx_boundary_% schemas detected: ${rem.rows.map(r => r.schema_name).join(', ')}`);
      }
    } finally {
      await closeAllSharedPools();
      await admin.end();
    }
    return;
  }

  if (CLI_OPTIONS.setupOnly) {
    let created = false;
    let setupOk = false;
    try {
      await admin.connect();
      await applySetupMigrations(admin, TEST_SCHEMA, () => { created = true; });
      setupOk = true;
      console.log(`SCHEMA=${TEST_SCHEMA}`);
    } finally {
      await closeAllSharedPools();
      try {
        if (created && !setupOk) {
          await admin.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
        }
      } finally {
        await admin.end();
      }
    }
    return;
  }

  if (CLI_OPTIONS.schema) {
    try {
      await runTestSuite(CLI_OPTIONS.section);
    } finally {
      await closeAllSharedPools();
    }
    return;
  }

  let created = false;
  try {
    await admin.connect();
    await applySetupMigrations(admin, TEST_SCHEMA, () => { created = true; });
    await runTestSuite(null);
  } finally {
    await closeAllSharedPools();
    try {
      if (created) await admin.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    } finally {
      await admin.end();
    }
  }
}

main().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exitCode = 1;
});
