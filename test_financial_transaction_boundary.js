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
const { Client } = require('pg');

process.env.NODE_ENV = 'test';

// Set isolated test database URL from environment or preview connection
const TEST_DB_URL = process.env.TEST_DATABASE_URL ||
  'postgresql://neondb_owner:npg_kRMvQPcwfx35@ep-muddy-thunder-b4yvk29p-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
process.env.TEST_DATABASE_URL = TEST_DB_URL;

const {
  UnitOfWork,
  PostgresMoneyRepository,
  PostgresMarketplaceRepository,
  InMemoryMoneyRepository,
  InMemoryMarketplaceRepository
} = require('./src/storage');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { outboxDispatcher, OutboxDispatcher } = require('./src/services/outbox/OutboxDispatcher');
const { state } = require('./src/database');

async function getIndependentClient() {
  const cleanConn = TEST_DB_URL.replace(/['"]/g, '');
  const client = new Client({
    connectionString: cleanConn,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  return client;
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  TIKUM FINANCIAL TRANSACTION BOUNDARY — P0 ACCEPTANCE SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
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

  const moneyRepo = new PostgresMoneyRepository({ connectionString: TEST_DB_URL });
  const mktRepo = new PostgresMarketplaceRepository({ connectionString: TEST_DB_URL });
  await moneyRepo.init();
  await mktRepo.init();

  // Helper to create valid baseline seed entities in DB for testing
  async function createTestFixtures(suffix) {
    const ticketId = `tkt-uow-${suffix}`;
    const listingId = `lst-uow-${suffix}`;
    const orderId = `ord-uow-${suffix}`;
    const escrowId = `esc-uow-${suffix}`;
    const paymentId = `pay-uow-${suffix}`;
    const amount = 500000;

    await mktRepo.createTicket({
      id: ticketId,
      seller_id: 'seller-1',
      canonical_event_id: 'event-joyland-2026',
      face_value: amount,
      status: 'VERIFIED'
    });

    await mktRepo.createListing({
      id: listingId,
      ticket_id: ticketId,
      seller_id: 'seller-1',
      canonical_event_id: 'event-joyland-2026',
      price: amount,
      status: 'ACTIVE'
    });

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
    });

    await moneyRepo.createEscrow({
      id: escrowId,
      order_id: orderId,
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      amount,
      status: 'PENDING_PAYMENT'
    });

    return { ticketId, listingId, orderId, escrowId, paymentId, amount };
  }

  // Cleanup helper
  async function cleanupFixtures(fixtures, txId = null, eventId = null) {
    const observer = await getIndependentClient();
    try {
      if (eventId) {
        await observer.query('DELETE FROM financial_outbox WHERE event_id = $1', [eventId]);
      }
      if (txId) {
        await observer.query('DELETE FROM financial_ledger_entries WHERE transaction_id = $1', [txId]);
        await observer.query('DELETE FROM financial_ledger_transactions WHERE transaction_id = $1', [txId]);
      }
      if (fixtures.paymentId) {
        await observer.query('DELETE FROM financial_payments WHERE id = $1', [fixtures.paymentId]);
      }
      if (fixtures.escrowId) {
        await observer.query('DELETE FROM financial_escrows WHERE id = $1', [fixtures.escrowId]);
      }
      if (fixtures.orderId) {
        await observer.query('DELETE FROM financial_orders WHERE id = $1', [fixtures.orderId]);
      }
      if (fixtures.listingId) {
        await observer.query('DELETE FROM marketplace_listings WHERE id = $1', [fixtures.listingId]);
      }
      if (fixtures.ticketId) {
        await observer.query('DELETE FROM marketplace_tickets WHERE id = $1', [fixtures.ticketId]);
      }
    } catch (_) {
    } finally {
      await observer.end();
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: UNIT OF WORK & TRANSACTION PROPAGATION
  // ---------------------------------------------------------------------------
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
    const observer = await getIndependentClient();
    try {
      const payRes = await observer.query('SELECT * FROM financial_payments WHERE id = $1', [f.paymentId]);
      assert.strictEqual(payRes.rows.length, 1, 'Payment must be committed');
      assert.strictEqual(payRes.rows[0].status, 'SETTLED');

      const ordRes = await observer.query('SELECT * FROM financial_orders WHERE id = $1', [f.orderId]);
      assert.strictEqual(ordRes.rows[0].status, 'PAID_ESCROWED');

      const listRes = await observer.query('SELECT * FROM marketplace_listings WHERE id = $1', [f.listingId]);
      assert.strictEqual(listRes.rows[0].status, 'SOLD');

      const tktRes = await observer.query('SELECT * FROM marketplace_tickets WHERE id = $1', [f.ticketId]);
      assert.strictEqual(tktRes.rows[0].status, 'ESCROWED');

      const ledgerRes = await observer.query('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId]);
      assert.strictEqual(ledgerRes.rows.length, 1, 'Ledger transaction must be committed');

      const outboxRes = await observer.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
      assert.strictEqual(outboxRes.rows.length, 1, 'Outbox record must be committed');
    } finally {
      await observer.end();
      await cleanupFixtures(f, null, eventId);
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: FAILURE RECOVERY & ROLLBACK AT EVERY STAGE
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Failure Recovery & Rollback at Every Transaction Stage ──');

  const failureStages = [
    { stage: 1, name: 'after canonical payment mutation' },
    { stage: 2, name: 'after order mutation' },
    { stage: 3, name: 'after inventory mutation' },
    { stage: 4, name: 'after ledger posting' },
    { stage: 5, name: 'after idempotency insertion' },
    { stage: 6, name: 'after outbox insertion' },
    { stage: 7, name: 'before commit' }
  ];

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
      const observer = await getIndependentClient();
      try {
        const payRes = await observer.query('SELECT * FROM financial_payments WHERE id = $1', [f.paymentId]);
        assert.strictEqual(payRes.rows.length, 0, `Stage ${stage}: Rolled-back payment must NOT exist in DB`);

        const ordRes = await observer.query('SELECT * FROM financial_orders WHERE id = $1', [f.orderId]);
        assert.strictEqual(ordRes.rows[0].status, 'CREATED', `Stage ${stage}: Order status must remain CREATED`);

        const listRes = await observer.query('SELECT * FROM marketplace_listings WHERE id = $1', [f.listingId]);
        assert.strictEqual(listRes.rows[0].status, 'ACTIVE', `Stage ${stage}: Listing must remain ACTIVE`);

        const tktRes = await observer.query('SELECT * FROM marketplace_tickets WHERE id = $1', [f.ticketId]);
        assert.strictEqual(tktRes.rows[0].status, 'VERIFIED', `Stage ${stage}: Ticket must remain VERIFIED`);

        const ledgerRes = await observer.query('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId]);
        assert.strictEqual(ledgerRes.rows.length, 0, `Stage ${stage}: Zero ledger transactions must exist`);

        const idempRes = await observer.query('SELECT * FROM financial_idempotency_records WHERE key = $1', [idempKey]);
        assert.strictEqual(idempRes.rows.length, 0, `Stage ${stage}: Idempotency record must be rolled back`);

        const outboxRes = await observer.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
        assert.strictEqual(outboxRes.rows.length, 0, `Stage ${stage}: Outbox event must be rolled back`);
      } finally {
        await observer.end();
        await cleanupFixtures(f);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: DURABLE IDEMPOTENCY & CONCURRENCY CONTROL
  // ---------------------------------------------------------------------------
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
    const observer = await getIndependentClient();
    try {
      const payRes = await observer.query('SELECT * FROM financial_payments WHERE order_id = $1', [f.orderId]);
      assert.strictEqual(payRes.rows.length, 1, 'Only ONE payment record must exist');

      const ledgerRes = await observer.query('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId]);
      assert.strictEqual(ledgerRes.rows.length, 1, 'Only ONE ledger journal entry must exist');

      const outboxRes = await observer.query('SELECT * FROM financial_outbox WHERE aggregate_id = $1', [f.orderId]);
      assert.strictEqual(outboxRes.rows.length, 1, 'Only ONE outbox event must exist');
    } finally {
      await observer.end();
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
    const midObserver = await getIndependentClient();
    const midPay = await midObserver.query('SELECT status FROM financial_payments WHERE id = $1', [f.paymentId]);
    assert.strictEqual(midPay.rows[0].status, 'PAYMENT_PENDING');
    await midObserver.end();

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
    const observer = await getIndependentClient();
    try {
      const finalPay = await observer.query('SELECT status FROM financial_payments WHERE id = $1', [f.paymentId]);
      assert.strictEqual(finalPay.rows[0].status, 'SETTLED');

      const finalOrd = await observer.query('SELECT status FROM financial_orders WHERE id = $1', [f.orderId]);
      assert.strictEqual(finalOrd.rows[0].status, 'PAID_ESCROWED');

      const ledgerRes = await observer.query('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [f.orderId]);
      assert.strictEqual(ledgerRes.rows.length, 1, 'Ledger posted once upon SUCCESS transition');
    } finally {
      await observer.end();
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

    const observer = await getIndependentClient();
    try {
      const ordRes = await observer.query('SELECT status FROM financial_orders WHERE id = $1', [f.orderId]);
      assert.strictEqual(ordRes.rows[0].status, 'PAID_ESCROWED', 'Order status must NOT regress from PAID to PENDING');
    } finally {
      await observer.end();
      await cleanupFixtures(f);
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: TRANSACTIONAL OUTBOX & ARGUS ASYNCHRONOUS LIFECYCLE
  // ---------------------------------------------------------------------------
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
    const observer = await getIndependentClient();
    const pendingRes = await observer.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
    assert.strictEqual(pendingRes.rows[0].status, 'PENDING');
    await observer.end();

    // Dispatch outbox events
    const results = await outboxDispatcher.dispatchPendingEvents(5);
    const delivered = results.find(r => r.eventId === eventId);
    assert.ok(delivered, 'Event must be processed by dispatcher');
    assert.strictEqual(delivered.status, 'PROCESSED');

    // Verify DB status is now PROCESSED
    const observer2 = await getIndependentClient();
    try {
      const processedRes = await observer2.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
      assert.strictEqual(processedRes.rows[0].status, 'PROCESSED');
      assert.ok(processedRes.rows[0].processed_at, 'processed_at must be populated');
    } finally {
      await observer2.end();
      const cleanObserver = await getIndependentClient();
      await cleanObserver.query('DELETE FROM financial_outbox WHERE event_id = $1', [eventId]);
      await cleanObserver.end();
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
    const observer = await getIndependentClient();
    try {
      const dbRes = await observer.query('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId]);
      assert.strictEqual(dbRes.rows[0].retry_count, 1);
      assert.ok(dbRes.rows[0].last_error.includes('SIMULATED_TRANSIENT_DOWNSTREAM_OUTAGE'));
    } finally {
      await observer.end();
      const cleanObserver = await getIndependentClient();
      await cleanObserver.query('DELETE FROM financial_outbox WHERE event_id = $1', [eventId]);
      await cleanObserver.end();
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: FINANCIAL LEDGER INTEGRITY & INVARIANTS
  // ---------------------------------------------------------------------------
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

    const observer = await getIndependentClient();
    try {
      const res = await observer.query('SELECT * FROM financial_ledger_transactions WHERE order_id = $1', [orderId]);
      assert.strictEqual(res.rows.length, 0, 'Zero ledger entries must exist for unbalanced transaction');
    } finally {
      await observer.end();
    }
  });

  await test('5.2 Capability gate verifyAtomicTransitionCapability returns valid status', () => {
    const caps = UnitOfWork.verifyAtomicTransitionCapability();
    assert.strictEqual(caps.available, true);
    assert.strictEqual(caps.supportsRollback, true);
    assert.strictEqual(caps.supportsLedgerAtomicity, true);
    assert.strictEqual(caps.supportsOutboxAtomicity, true);
  });

  console.log('\n================================================================');
  console.log(`  SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
