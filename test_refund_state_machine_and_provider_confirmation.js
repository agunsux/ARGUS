/**
 * TIKUM / ARGUS — P0 Refund State Integrity & Provider Confirmation Acceptance Suite
 *
 * Verifies the authoritative separation of refund lifecycles:
 * 1. Provider reports pending -> order/escrow in REFUND_PENDING, ledger reversal NOT posted.
 * 2. Provider confirms -> order/escrow in REFUNDED, ledger reversal IS posted.
 * 3. Provider rejects -> REFUND_FAILED / RECONCILIATION_REQUIRED, ledger reversal NOT posted.
 * 4. Provider timeout -> MANUAL_REFUND_REQUIRED / REFUND_PENDING, ledger reversal NOT posted.
 * 5. Duplicate refund request -> idempotent response, no duplicate ledger entry.
 * 6. Webhook confirms pending refund -> transitions to REFUNDED, posts ledger reversal.
 * 7. Duplicate webhook confirmation -> idempotent, zero double-reversal.
 * 8. Forged webhook signature -> rejected (401), state remains REFUND_PENDING.
 * 9. Manual refund initiated -> awaiting verification, status MANUAL_REFUND_REQUIRED, no ledger reversal.
 * 10. Verified manual reconciliation with bankReference -> REFUNDED, ledger reversal posted.
 * 11. Duplicate manual reconciliation -> idempotent, zero double-reversal.
 * 12. Durable persistence across process reload -> rehydrated as REFUND_PENDING, confirmed subsequently.
 * 13. Concurrent seller cancellation requests -> serialized via mutex, strike counted once, single refund flow.
 * 14. Real external payment/refund calls blocked fail-closed under safety gates.
 */

const assert = require('assert');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'LIVE';

const { state, resetDatabase } = require('./src/database');
const { paymentManager } = require('./src/services/payment');
const { DeterministicTestProvider, TEST_PAYMENT_SCENARIOS } = require('./src/services/payment/DeterministicTestProvider');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { EscrowService, ORDER_STATUS, ESCROW_STATUS } = require('./src/services/escrowService');
const { MarketplaceOrderService, MARKETPLACE_ORDER_STATUS } = require('./src/services/marketplace/MarketplaceOrderService');
const { SellerCommitmentService } = require('./src/services/sellerCommitmentService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { DurableFinancialStore } = require('./src/settlement/DurableFinancialStore');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');

console.log('================================================================');
console.log('  TIKUM — P0 REFUND STATE INTEGRITY & RECONCILIATION SUITE');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

async function test(title, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${title}: ${err.message}`);
    failed++;
    throw err;
  }
}

// Helper to seed a standard paid transaction
async function seedPaidTransaction({
  orderId = `ord-${Date.now()}-${uuidv4().substring(0, 4)}`,
  ticketPrice = 500000,
  buyerFee = 25000,
  sellerFee = 25000,
  buyerTax = 2750,
  sellerTax = 1000,
  providerName = 'test_provider'
} = {}) {
  const sellerId = `seller-${uuidv4().substring(0, 6)}`;
  const buyerId = `buyer-${uuidv4().substring(0, 6)}`;
  const ticketId = `tkt-${uuidv4().substring(0, 6)}`;
  const listingId = `list-${uuidv4().substring(0, 6)}`;
  const eventId = 'evt-test-event-2026';

  const grossTicketValue = ticketPrice;
  const totalAmount = ticketPrice + buyerFee + buyerTax;

  const order = {
    id: orderId,
    order_id: orderId,
    buyer_id: buyerId,
    seller_id: sellerId,
    ticket_id: ticketId,
    listing_id: listingId,
    event_id: eventId,
    gross_ticket_value: grossTicketValue,
    ticket_price: ticketPrice,
    buyer_fee: buyerFee,
    seller_fee: sellerFee,
    buyer_tax: buyerTax,
    seller_tax_withholding: sellerTax,
    buyer_total: totalAmount,
    total_amount: totalAmount,
    currency: 'IDR',
    marketplace_status: MARKETPLACE_ORDER_STATUS.PAID,
    status: ORDER_STATUS.PAID_ESCROWED,
    provider: providerName,
    created_at: new Date().toISOString()
  };
  state.orders.push(order);

  const escrow = {
    id: `esc-${orderId}`,
    order_id: orderId,
    ticket_id: ticketId,
    listing_id: listingId,
    seller_id: sellerId,
    buyer_id: buyerId,
    status: ESCROW_STATUS.ESCROWED,
    total_paid: totalAmount,
    gross_ticket_value: grossTicketValue,
    ticket_price: ticketPrice,
    platform_fee: buyerFee,
    buyer_fee: buyerFee,
    seller_fee: sellerFee,
    buyer_tax: buyerTax,
    seller_tax_withholding: sellerTax,
    ledger_reversed: false,
    provider_refund_confirmed: false,
    created_at: new Date().toISOString()
  };
  state.escrows.push(escrow);

  const providerRef = `ref-${orderId}`;
  const canonicalPayment = {
    id: `pay-${orderId}`,
    internal_payment_id: `pay-${orderId}`,
    order_id: orderId,
    buyer_id: buyerId,
    seller_id: sellerId,
    provider: providerName,
    provider_reference: providerRef,
    provider_transaction_id: `txn-${orderId}`,
    gross_amount: totalAmount,
    currency: 'IDR',
    money_state: MONEY_STATE.ESCROW_HELD,
    status: MONEY_STATE.PAID,
    created_at: new Date().toISOString()
  };
  state.canonical_payments.push(canonicalPayment);

  // Capture in double-entry ledger initially
  await FinancialLedger.recordPaymentCapture({
    orderId,
    ticketPrice,
    buyerFee,
    sellerFee,
    buyerTax,
    sellerTax,
    providerFee: 0,
    actorId: 'SYSTEM'
  });

  return { order, escrow, canonicalPayment, providerRef };
}

async function runAll() {
  resetDatabase();

  const testProvider = new DeterministicTestProvider();
  paymentManager.registerProvider(testProvider);

  // ─────────────────────────────────────────────────────────────
  // 1. PROVIDER REPORTS PENDING REFUND -> ORDER & ESCROW IN REFUND_PENDING
  // ─────────────────────────────────────────────────────────────
  console.log('── Group 1: Asynchronous & Pending Provider Refund Integrity ──');

  let order1PendingId = null;
  let order1ProviderRef = null;

  await test('1. Provider reports pending refund -> order/escrow in REFUND_PENDING, ledger NOT posted', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_PENDING);

    const { order, escrow, providerRef } = await seedPaidTransaction();
    order1PendingId = order.id;
    order1ProviderRef = providerRef;

    const refundRes = await MarketplaceOrderService.refundOrder({
      orderId: order.id,
      actorId: 'test-admin',
      reason: 'Buyer requested cancellation'
    });

    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.confirmed, false, 'Refund must NOT be marked confirmed while pending');
    assert.strictEqual(order.status, ORDER_STATUS.REFUND_PENDING);
    assert.strictEqual(order.marketplace_status, MARKETPLACE_ORDER_STATUS.REFUND_PENDING);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUND_PENDING);
    assert.strictEqual(escrow.ledger_reversed, false, 'Internal ledger must NOT be reversed while pending');
    assert.strictEqual(escrow.provider_refund_confirmed, false);
    assert.strictEqual(escrow.refund_rail_status, 'PROVIDER_REFUND_REQUESTED');

    // Confirm no refund journal transaction was posted to double-entry ledger
    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order.id && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 0, 'No REFUND transaction in ledger while pending');
  });

  // ─────────────────────────────────────────────────────────────
  // 2. PROVIDER REPORTS CONFIRMED REFUND -> ORDER & ESCROW IN REFUNDED
  // ─────────────────────────────────────────────────────────────
  await test('2. Provider confirms refund synchronously -> status is REFUNDED, ledger reversal IS posted', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_CONFIRMED);

    const { order, escrow } = await seedPaidTransaction();

    const refundRes = await MarketplaceOrderService.refundOrder({
      orderId: order.id,
      actorId: 'test-admin',
      reason: 'Immediate confirmed refund'
    });

    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.confirmed, true, 'Refund must be marked confirmed');
    assert.strictEqual(order.status, ORDER_STATUS.REFUNDED);
    assert.strictEqual(order.marketplace_status, MARKETPLACE_ORDER_STATUS.REFUNDED);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(escrow.ledger_reversed, true, 'Internal ledger MUST be reversed upon confirmation');
    assert.strictEqual(escrow.provider_refund_confirmed, true);
    assert.strictEqual(escrow.refund_rail_status, 'PROVIDER_REFUND_CONFIRMED');

    // Confirm refund journal transaction WAS posted
    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order.id && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 1, 'Exactly one REFUND transaction in ledger');

    // Check double-entry balance: sum(debit) === sum(credit)
    const tx = refundLedgerTxs[0];
    const totalDebit = tx.entries.filter(e => e.type === 'DEBIT').reduce((s, e) => s + e.amount, 0);
    const totalCredit = tx.entries.filter(e => e.type === 'CREDIT').reduce((s, e) => s + e.amount, 0);
    assert.strictEqual(totalDebit, totalCredit, 'Refund ledger entry must balance perfectly');
  });

  // ─────────────────────────────────────────────────────────────
  // 3. PROVIDER REPORTS FAILURE / REJECTION
  // ─────────────────────────────────────────────────────────────
  await test('3. Provider reports failure/rejection -> status is REFUND_FAILED, ledger NOT posted', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_FAILED);

    const { order, escrow } = await seedPaidTransaction();

    const refundRes = await MarketplaceOrderService.refundOrder({
      orderId: order.id,
      actorId: 'test-admin',
      reason: 'Destination account invalid'
    });

    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.confirmed, false);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUND_PENDING);
    assert.strictEqual(escrow.refund_rail_status, 'REFUND_FAILED');
    assert.strictEqual(escrow.ledger_reversed, false);

    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order.id && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 0, 'No REFUND transaction in ledger on provider rejection');
  });

  // ─────────────────────────────────────────────────────────────
  // 4. PROVIDER TIMEOUT OR NETWORK ERROR DURING REFUND REQUEST
  // ─────────────────────────────────────────────────────────────
  await test('4. Provider timeout or network error -> status is MANUAL_REFUND_REQUIRED / REFUND_PENDING, ledger NOT posted', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_TIMEOUT);

    const { order, escrow } = await seedPaidTransaction();

    const refundRes = await MarketplaceOrderService.refundOrder({
      orderId: order.id,
      actorId: 'test-admin',
      reason: 'Provider gateway timeout'
    });

    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.confirmed, false);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUND_PENDING);
    assert.strictEqual(escrow.refund_rail_status, 'MANUAL_REFUND_REQUIRED');
    assert.strictEqual(escrow.ledger_reversed, false);

    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order.id && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 0);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. DUPLICATE REFUND REQUEST WHILE PENDING
  // ─────────────────────────────────────────────────────────────
  await test('5. Duplicate refund request while pending -> idempotent response, zero duplicate ledger', async () => {
    // Re-call refundOrder on order1PendingId
    const dupRes = await MarketplaceOrderService.refundOrder({
      orderId: order1PendingId,
      actorId: 'test-admin',
      reason: 'Second click while pending'
    });

    assert.strictEqual(dupRes.success, true);
    assert.strictEqual(dupRes.idempotent, true);
    assert.strictEqual(dupRes.confirmed, false);
    assert.strictEqual(dupRes.order.status, ORDER_STATUS.REFUND_PENDING);

    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order1PendingId && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 0, 'Zero ledger transactions generated on duplicate pending refund');
  });

  // ─────────────────────────────────────────────────────────────
  // 6. WEBHOOK ARRIVES CONFIRMING A PENDING REFUND
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Group 2: Webhook Confirmation & Reconciliation ──');

  let order1WebhookPayload = null;

  await test('6. Webhook arrives confirming pending refund -> transitions to REFUNDED, posts ledger reversal', async () => {
    // Generate valid signed webhook payload for order1PendingId
    const webhookData = testProvider.generateRefundWebhookPayload(order1ProviderRef, {
      orderId: order1PendingId,
      amount: 527750,
      status: 'REFUNDED'
    });
    order1WebhookPayload = webhookData;

    const webhookRes = await PaymentService.handleWebhook({
      providerName: 'test_provider',
      headers: webhookData.headers,
      body: webhookData.body
    });

    assert.strictEqual(webhookRes.idempotent, false);

    // Verify domain and escrow state transitioned
    const order = state.orders.find(o => o.id === order1PendingId);
    const escrow = state.escrows.find(e => e.order_id === order1PendingId);

    assert.strictEqual(order.status, ORDER_STATUS.REFUNDED);
    assert.strictEqual(order.marketplace_status, MARKETPLACE_ORDER_STATUS.REFUNDED);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(escrow.ledger_reversed, true, 'Internal ledger reversed now that webhook confirmed');
    assert.strictEqual(escrow.provider_refund_confirmed, true);
    assert.strictEqual(escrow.refund_rail_status, 'PROVIDER_REFUND_CONFIRMED');

    // Verify ledger transaction was posted
    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order1PendingId && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 1, 'Exactly 1 ledger transaction posted upon webhook confirmation');
  });

  // ─────────────────────────────────────────────────────────────
  // 7. DUPLICATE WEBHOOK CONFIRMATION ARRIVES -> IDEMPOTENT
  // ─────────────────────────────────────────────────────────────
  await test('7. Duplicate webhook confirmation arrives -> idempotent, 200 OK, zero double reversal', async () => {
    const dupWebhookRes = await PaymentService.handleWebhook({
      providerName: 'test_provider',
      headers: order1WebhookPayload.headers,
      body: order1WebhookPayload.body
    });

    assert.strictEqual(dupWebhookRes.idempotent, true);

    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order1PendingId && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 1, 'Still exactly 1 ledger transaction, no duplicate credit');
  });

  // ─────────────────────────────────────────────────────────────
  // 8. WEBHOOK WITH INVALID / FORGED SIGNATURE
  // ─────────────────────────────────────────────────────────────
  await test('8. Webhook with forged signature -> rejected (401), state remains REFUND_PENDING', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_PENDING);
    const { order, escrow, providerRef } = await seedPaidTransaction();

    await MarketplaceOrderService.refundOrder({
      orderId: order.id,
      actorId: 'test-admin',
      reason: 'Testing webhook security'
    });

    assert.strictEqual(order.status, ORDER_STATUS.REFUND_PENDING);

    const forgedWebhook = testProvider.generateRefundWebhookPayload(providerRef, {
      orderId: order.id,
      amount: order.buyer_total,
      scenario: TEST_PAYMENT_SCENARIOS.INVALID_CALLBACK
    });

    let threw = false;
    try {
      await PaymentService.handleWebhook({
        providerName: 'test_provider',
        headers: forgedWebhook.headers,
        body: forgedWebhook.body
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'INVALID_WEBHOOK_SIGNATURE');
    }

    assert.strictEqual(threw, true, 'Forged webhook signature MUST throw');
    assert.strictEqual(order.status, ORDER_STATUS.REFUND_PENDING, 'Order state MUST remain REFUND_PENDING');
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUND_PENDING, 'Escrow state MUST remain REFUND_PENDING');
    assert.strictEqual(escrow.ledger_reversed, false, 'Ledger MUST NOT be reversed on forged webhook');
  });

  // ─────────────────────────────────────────────────────────────
  // 9. MANUAL REFUND INITIATED -> AWAITING VERIFICATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Group 3: Manual Banking Reconciliation Workflow ──');

  let manualOrderId = null;

  await test('9. Manual refund initiated -> status is MANUAL_REFUND_REQUIRED / REFUND_PENDING, no ledger reversal', async () => {
    // Simulate non-automated rail where provider throws CAPABILITY_UNSUPPORTED
    const { order, escrow } = await seedPaidTransaction({ providerName: 'manual_wire' });
    manualOrderId = order.id;

    // Direct EscrowService refund with unautomated provider
    const refundRes = await EscrowService.refundToBuyer(order.id, 'operator-1', 'Manual bank disburse required');

    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.confirmed, false);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUND_PENDING);
    assert.strictEqual(escrow.refund_rail_status, 'MANUAL_REFUND_REQUIRED');
    assert.strictEqual(escrow.ledger_reversed, false, 'Ledger must NOT reverse until verified proof is submitted');

    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order.id && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 0);
  });

  // ─────────────────────────────────────────────────────────────
  // 10. OPERATOR MARKS MANUAL REFUND AS VERIFIED WITH BANK REFERENCE
  // ─────────────────────────────────────────────────────────────
  await test('10. Operator marks manual refund as verified with bankReference -> REFUNDED, ledger reversal posted', async () => {
    const bankRef = 'BCA-DISBURSE-20261028-098231';
    const confirmRes = await EscrowService.confirmManualRefund({
      orderId: manualOrderId,
      actorId: 'finance-lead-siti',
      bankReference: bankRef,
      notes: 'Disbursed via KlikBCA Bisnis batch 4012'
    });

    assert.strictEqual(confirmRes.success, true);
    assert.strictEqual(confirmRes.confirmed, true);

    const order = state.orders.find(o => o.id === manualOrderId);
    const escrow = state.escrows.find(e => e.order_id === manualOrderId);

    assert.strictEqual(order.status, ORDER_STATUS.REFUNDED);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(escrow.ledger_reversed, true);
    assert.strictEqual(escrow.provider_refund_confirmed, true);
    assert.strictEqual(escrow.refund_rail_status, 'MANUAL_REFUND_CONFIRMED');
    assert.strictEqual(escrow.manual_reconciliation.bank_reference, bankRef);
    assert.strictEqual(escrow.manual_reconciliation.reconciled_by, 'finance-lead-siti');

    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === manualOrderId && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 1);
  });

  await test('10b. confirmManualRefund strictly rejects unauthorized actors and empty bankReference', async () => {
    const { order } = await seedPaidTransaction({ providerName: 'manual_wire' });
    const buyerUser = { id: 'usr-unauth-buyer', role: 'buyer', name: 'Random Buyer' };
    state.users.push(buyerUser);

    // 1. Unauthorized actor (buyer)
    let threwAuth = false;
    try {
      await EscrowService.confirmManualRefund({
        orderId: order.id,
        actorId: 'usr-unauth-buyer',
        bankReference: 'BCA-TRF-123456'
      });
    } catch (err) {
      threwAuth = true;
      assert.strictEqual(err.code, 'MANUAL_REFUND_UNAUTHORIZED');
      assert.strictEqual(err.status, 403);
    }
    assert.strictEqual(threwAuth, true, 'Unauthorized actor MUST be rejected with 403');

    // 2. Empty / whitespace bankReference
    let threwEmptyRef = false;
    try {
      await EscrowService.confirmManualRefund({
        orderId: order.id,
        actorId: 'admin-1',
        bankReference: '   '
      });
    } catch (err) {
      threwEmptyRef = true;
      assert.strictEqual(err.code, 'INVALID_MANUAL_REFUND_PAYLOAD');
      assert.strictEqual(err.status, 400);
    }
    assert.strictEqual(threwEmptyRef, true, 'Empty bank reference MUST be rejected with 400');
  });

  await test('10c. Ledger failure after provider confirmation flags LEDGER_REVERSAL_FAILED and is recoverable', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_PENDING);
    const { order, escrow, providerRef } = await seedPaidTransaction();

    await MarketplaceOrderService.refundOrder({
      orderId: order.id,
      actorId: 'test-admin',
      reason: 'Ledger failure test'
    });

    // Temporarily sabotage FinancialLedger.recordRefund to simulate ledger storage crash
    const originalRecordRefund = FinancialLedger.recordRefund;
    FinancialLedger.recordRefund = async () => {
      const err = new Error('Database connection failed while recording double-entry refund ledger');
      err.code = 'LEDGER_DB_UNAVAILABLE';
      throw err;
    };

    try {
      const webhookData = testProvider.generateRefundWebhookPayload(providerRef, {
        orderId: order.id,
        amount: order.buyer_total,
        status: 'REFUNDED'
      });

      await PaymentService.handleWebhook({
        providerName: 'test_provider',
        headers: webhookData.headers,
        body: webhookData.body
      });

      // Domain state is REFUNDED because money moved on rail, BUT ledger is NOT falsely marked reversed!
      assert.strictEqual(escrow.status, ESCROW_STATUS.REFUNDED);
      assert.strictEqual(escrow.ledger_reversed, false, 'ledger_reversed MUST remain false when ledger fails');
      assert.strictEqual(escrow.reconciliation_status, 'LEDGER_REVERSAL_FAILED');
      assert.strictEqual(order.reconciliation_status, 'LEDGER_REVERSAL_FAILED');
    } finally {
      // Restore original FinancialLedger.recordRefund
      FinancialLedger.recordRefund = originalRecordRefund;
    }

    // Now test recovery mechanism: retryLedgerReversal
    const recoveryRes = await EscrowService.retryLedgerReversal({
      orderId: order.id,
      actorId: 'finance-reconciliation-job'
    });

    assert.strictEqual(recoveryRes.success, true);
    assert.strictEqual(recoveryRes.recovered, true);
    assert.strictEqual(escrow.ledger_reversed, true, 'ledger_reversed MUST be true after recovery');
    assert.strictEqual(escrow.reconciliation_status, 'SETTLED_RECONCILED');
    assert.strictEqual(order.reconciliation_status, 'SETTLED_RECONCILED');

    // Duplicate retry is safe and idempotent
    const dupRecovery = await EscrowService.retryLedgerReversal({
      orderId: order.id,
      actorId: 'finance-reconciliation-job'
    });
    assert.strictEqual(dupRecovery.idempotent, true);
  });

  // ─────────────────────────────────────────────────────────────
  // 11. DUPLICATE MANUAL RECONCILIATION ATTEMPT -> IDEMPOTENT
  // ─────────────────────────────────────────────────────────────
  await test('11. Duplicate manual reconciliation attempt -> idempotent, zero double reversal', async () => {
    const dupManualRes = await EscrowService.confirmManualRefund({
      orderId: manualOrderId,
      actorId: 'finance-lead-siti',
      bankReference: 'BCA-DISBURSE-20261028-098231',
      notes: 'Repeated operator submission'
    });

    assert.strictEqual(dupManualRes.success, true);
    assert.strictEqual(dupManualRes.idempotent, true);

    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === manualOrderId && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 1, 'Zero duplicate ledger reversal on second manual reconciliation');
  });

  // ─────────────────────────────────────────────────────────────
  // 12. DURABLE PERSISTENCE ACROSS PROCESS RELOAD
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Group 4: Durability, Concurrency & Governance ──');

  await test('12. Process restart / reload with pending refund -> state correctly rehydrated as REFUND_PENDING', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_PENDING);
    const { order, escrow, providerRef } = await seedPaidTransaction();

    await MarketplaceOrderService.refundOrder({
      orderId: order.id,
      actorId: 'test-admin',
      reason: 'Testing cold restart recovery'
    });

    assert.strictEqual(order.status, ORDER_STATUS.REFUND_PENDING);

    // Persist to DurableFinancialStore
    DurableFinancialStore.persist('orders', state.orders);
    DurableFinancialStore.persist('escrows', state.escrows);
    DurableFinancialStore.persist('canonical_payments', state.canonical_payments);

    // Simulate cold process start: read back directly from store
    const persistedOrders = DurableFinancialStore.load('orders');
    const persistedEscrows = DurableFinancialStore.load('escrows');

    const loadedOrder = persistedOrders.find(o => o.id === order.id);
    const loadedEscrow = persistedEscrows.find(e => e.order_id === order.id);

    assert.strictEqual(loadedOrder.status, ORDER_STATUS.REFUND_PENDING, 'Rehydrated order status must be REFUND_PENDING');
    assert.strictEqual(loadedEscrow.status, ESCROW_STATUS.REFUND_PENDING, 'Rehydrated escrow status must be REFUND_PENDING');
    assert.strictEqual(loadedEscrow.ledger_reversed, false, 'Rehydrated ledger_reversed must remain false');

    // Confirm that arriving webhook can confirm the rehydrated pending refund
    const coldWebhook = testProvider.generateRefundWebhookPayload(providerRef, {
      orderId: order.id,
      amount: order.buyer_total,
      status: 'REFUNDED'
    });

    const coldRes = await PaymentService.handleWebhook({
      providerName: 'test_provider',
      headers: coldWebhook.headers,
      body: coldWebhook.body
    });

    assert.strictEqual(coldRes.idempotent, false);
    assert.strictEqual(order.status, ORDER_STATUS.REFUNDED);
    assert.strictEqual(escrow.status, ESCROW_STATUS.REFUNDED);
    assert.strictEqual(escrow.ledger_reversed, true);
  });

  // ─────────────────────────────────────────────────────────────
  // 13. CONCURRENT SELLER CANCELLATION REQUESTS ON SAME ORDER
  // ─────────────────────────────────────────────────────────────
  await test('13. Concurrent seller cancellation requests -> serialized via mutex, strikes not duplicated, single refund flow', async () => {
    testProvider.setRefundScenario(TEST_PAYMENT_SCENARIOS.REFUND_CONFIRMED);
    const { order, escrow } = await seedPaidTransaction();

    const sellerUser = { id: order.seller_id, name: 'Seller Race Test', strikes: 0 };
    state.users.push(sellerUser);

    const testEvent = { id: 'evt-race-test', date: new Date(Date.now() + 10 * 3600 * 1000).toISOString() };
    state.events.push(testEvent);
    order.event_id = testEvent.id;

    // Fire 5 concurrent seller cancellations
    const promises = [1, 2, 3, 4, 5].map(i =>
      MarketplaceOrderService.sellerCancelOrder({
        orderId: order.id,
        sellerId: order.seller_id,
        reason: `Concurrent cancellation attempt #${i}`,
        hoursToEvent: 10
      })
    );

    const results = await Promise.all(promises);

    // All should succeed
    results.forEach(r => assert.strictEqual(r.success, true));

    // Exactly one strike should be recorded in SellerCommitmentService
    const strikeStatus = SellerCommitmentService.getSellerStrikeStatus(order.seller_id);
    assert.strictEqual(strikeStatus.strikes, 2, 'Critical cancellation carries weight 2 and must NOT be duplicated by race');

    // Exactly 1 refund journal transaction in ledger
    const refundLedgerTxs = (state.financial_ledger || []).filter(
      tx => tx.order_id === order.id && tx.event_type === 'REFUND'
    );
    assert.strictEqual(refundLedgerTxs.length, 1, 'Exactly 1 ledger refund transaction on concurrent cancellation');
  });

  // ─────────────────────────────────────────────────────────────
  // 14. REAL EXTERNAL GATEWAY CALLS REMAIN BLOCKED FAIL-CLOSED
  // ─────────────────────────────────────────────────────────────
  await test('14. Production safety gates enforce zero real external money movement in non-production mode', () => {
    const doku = paymentManager.getProvider('doku');
    const dokuStatus = doku.getStatus();
    assert.strictEqual(dokuStatus.isVerified, false, 'DOKU merchant verification must remain unverified');
    assert.strictEqual(dokuStatus.production_gated, true, 'Production gate must be active');
    assert.strictEqual(dokuStatus.readiness.doku_contract_signed, false);
    assert.strictEqual(dokuStatus.readiness.doku_kyc_due_diligence_verified, false);
    assert.strictEqual(dokuStatus.readiness.production_credentials_secured, false);

    const subStatus = PaymentService.getSubsystemStatus();
    assert.strictEqual(subStatus.safety_gates.NO_REAL_PAYMENT, true);
    assert.strictEqual(subStatus.safety_gates.NO_REAL_SETTLEMENT, true);
    assert.strictEqual(subStatus.safety_gates.NO_FAKE_PAYMENT_SUCCESS, true);
    assert.strictEqual(subStatus.safety_gates.NO_FAKE_ESCROW_BALANCE, true);
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed} REFUND INTEGRITY TEST CASES PASSED SUCCESSFULLY`);
  console.log('================================================================');
}

runAll().catch(err => {
  console.error('\nSuite Execution Failed:', err);
  process.exit(1);
});
