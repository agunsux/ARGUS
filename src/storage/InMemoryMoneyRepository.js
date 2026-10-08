/**
 * TIKUM / ARGUS — In-Memory Money Repository
 *
 * Fast, isolated test-runner implementation of MoneyRepository.
 */

const { MoneyRepository } = require('./MoneyRepository');

class InMemoryMoneyRepository extends MoneyRepository {
  constructor() {
    super();
    this.quotes = new Map();
    this.orders = new Map();
    this.payments = new Map();
    this.attempts = new Map();
    this.webhooks = new Map(); // key: `${provider}:${providerEventId}`
    this.escrows = new Map();
    this.settlements = new Map();
    this.disputes = new Map();
    this.chargebacks = new Map();
    this.ledgerTransactions = new Map();
    this.ledgerEntries = [];
    this.idempotency = new Map();
  }

  async init() {
    return true;
  }

  // Quotes
  async createQuote(quoteData) {
    const id = quoteData.quote_id || quoteData.id || `quo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const quote = {
      ...quoteData,
      quote_id: id,
      id,
      status: quoteData.status || 'ACTIVE',
      created_at: new Date().toISOString()
    };
    this.quotes.set(id, quote);
    return quote;
  }

  async getQuoteById(quoteId) {
    return this.quotes.get(quoteId) || null;
  }

  async consumeQuote(quoteId) {
    const q = this.quotes.get(quoteId);
    if (!q) return null;
    q.status = 'CONSUMED';
    q.consumed_at = new Date().toISOString();
    return q;
  }

  // Orders
  async createOrder(orderData) {
    const id = orderData.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const order = {
      ...orderData,
      id,
      order_id: id,
      status: orderData.status || 'CREATED',
      created_at: orderData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.orders.set(id, order);
    return order;
  }

  async getOrderById(orderId) {
    return this.orders.get(orderId) || null;
  }

  async updateOrderStatus(orderId, status, metadata = {}) {
    const order = this.orders.get(orderId);
    if (!order) return null;
    order.status = status;
    order.updated_at = new Date().toISOString();
    Object.assign(order, metadata);
    return order;
  }

  // Payments
  async createPayment(paymentData) {
    const id = paymentData.id || `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const payment = {
      ...paymentData,
      id,
      internal_payment_id: paymentData.internal_payment_id || id,
      status: paymentData.status || 'PAYMENT_PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPaymentById(paymentId) {
    for (const p of this.payments.values()) {
      if (p.id === paymentId || p.internal_payment_id === paymentId || p.provider_reference === paymentId) {
        return p;
      }
    }
    return null;
  }

  async getPaymentByOrderId(orderId) {
    for (const p of this.payments.values()) {
      if (p.order_id === orderId) return p;
    }
    return null;
  }

  async updatePaymentStatus(paymentId, status, metadata = {}) {
    const p = await this.getPaymentById(paymentId);
    if (!p) return null;
    p.status = status;
    p.updated_at = new Date().toISOString();
    Object.assign(p, metadata);
    return p;
  }

  async recordPaymentAttempt(attemptData) {
    const id = attemptData.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const attempt = { ...attemptData, id, created_at: new Date().toISOString() };
    this.attempts.set(id, attempt);
    return attempt;
  }

  // Webhooks
  async recordWebhook(webhookData) {
    const providerEventId = webhookData.provider_event_id || webhookData.providerEventId;
    const key = `${webhookData.provider}:${providerEventId}`;
    if (this.webhooks.has(key)) {
      const existing = this.webhooks.get(key);
      return { id: existing.id, inserted: false, duplicate: true, idempotent: true, record: existing };
    }
    const record = {
      ...webhookData,
      id: webhookData.id || `pwh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      provider_event_id: providerEventId,
      processing_status: webhookData.processing_status || 'PENDING',
      received_at: new Date().toISOString()
    };
    this.webhooks.set(key, record);
    return { id: record.id, inserted: true, duplicate: false, idempotent: false, record };
  }

  async getWebhook(provider, providerEventId) {
    return this.webhooks.get(`${provider}:${providerEventId}`) || null;
  }

  async markWebhookProcessed(provider, providerEventId, status = 'PROCESSED') {
    const w = this.webhooks.get(`${provider}:${providerEventId}`);
    if (!w) return null;
    w.processing_status = status;
    w.processed_at = new Date().toISOString();
    return w;
  }

  // Escrows
  async createEscrow(escrowData) {
    const id = escrowData.id || `esc-${escrowData.order_id || Date.now()}`;
    const escrow = {
      ...escrowData,
      id,
      escrow_id: id,
      status: escrowData.status || 'PENDING_PAYMENT',
      dispute_hold: escrowData.dispute_hold === true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.escrows.set(escrowData.order_id, escrow);
    return escrow;
  }

  async getEscrowByOrderId(orderId) {
    return this.escrows.get(orderId) || null;
  }

  async updateEscrowStatus(orderId, status, metadata = {}) {
    const escrow = this.escrows.get(orderId);
    if (!escrow) return null;
    escrow.status = status;
    escrow.updated_at = new Date().toISOString();
    Object.assign(escrow, metadata);
    return escrow;
  }

  async releaseEscrow(orderIdParam, actorIdParam = 'SYSTEM', reason = null) {
    let orderId = orderIdParam;
    let actorId = actorIdParam;
    if (typeof orderIdParam === 'object' && orderIdParam !== null) {
      orderId = orderIdParam.orderId || orderIdParam.order_id;
      actorId = orderIdParam.actorId || orderIdParam.actor_id || 'SYSTEM';
    }
    const escrow = this.escrows.get(orderId);
    if (!escrow) throw new Error(`Escrow for order '${orderId}' not found`);
    if (escrow.dispute_hold || escrow.status === 'DISPUTED') {
      const err = new Error('Cannot release escrow: transaction is in disputed state');
      err.code = 'TRANSACTION_IN_DISPUTED_STATE';
      throw err;
    }
    if (escrow.status === 'FROZEN') {
      const err = new Error('Cannot release escrow: transaction is in frozen state');
      err.code = 'TRANSACTION_IN_FROZEN_STATE';
      throw err;
    }
    if (escrow.status === 'RELEASED') {
      return { escrow, alreadyReleased: true, idempotent: true };
    }

    escrow.status = 'RELEASED';
    escrow.released_at = new Date().toISOString();
    escrow.released_by = actorId;
    escrow.release_reason = reason;
    escrow.updated_at = new Date().toISOString();
    return { escrow, alreadyReleased: false, idempotent: false };
  }

  async refundEscrow(orderId, actorId, reason) {
    const escrow = this.escrows.get(orderId);
    if (!escrow) throw new Error(`Escrow for order '${orderId}' not found`);
    if (escrow.status === 'REFUNDED') return { escrow, alreadyRefunded: true };

    escrow.status = 'REFUNDED';
    escrow.refunded_at = new Date().toISOString();
    escrow.refunded_by = actorId;
    escrow.refund_reason = reason;
    escrow.updated_at = new Date().toISOString();
    return { escrow, alreadyRefunded: false };
  }

  async setDisputeHold(orderId, hold = true) {
    const escrow = this.escrows.get(orderId);
    if (!escrow) return null;
    escrow.dispute_hold = hold;
    if (hold) escrow.status = 'DISPUTED';
    escrow.updated_at = new Date().toISOString();
    return escrow;
  }

  // Settlements
  async createSettlement(settlementData) {
    if (this.settlements.has(settlementData.order_id)) {
      return { settlement: this.settlements.get(settlementData.order_id), idempotent: true };
    }
    const id = settlementData.id || `stl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const settlement = {
      ...settlementData,
      id,
      status: settlementData.status || 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.settlements.set(settlementData.order_id, settlement);
    return { settlement, idempotent: false };
  }

  async getSettlementByOrderId(orderId) {
    return this.settlements.get(orderId) || null;
  }

  // Disputes
  async createDispute(disputeData) {
    const id = disputeData.id || disputeData.dispute_id || `dsp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const dispute = {
      ...disputeData,
      id,
      dispute_id: id,
      status: disputeData.status || 'OPEN',
      created_at: new Date().toISOString()
    };
    this.disputes.set(disputeData.order_id, dispute);
    return dispute;
  }

  async getDisputeByOrderId(orderId) {
    return this.disputes.get(orderId) || null;
  }

  async resolveDispute(disputeId, outcome, notes) {
    for (const d of this.disputes.values()) {
      if (d.id === disputeId || d.dispute_id === disputeId) {
        d.status = 'RESOLVED';
        d.outcome = outcome;
        d.decision_notes = notes;
        d.resolved_at = new Date().toISOString();
        return d;
      }
    }
    return null;
  }

  // Chargebacks
  async createChargeback(chargebackData) {
    const id = chargebackData.id || `chg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const chargeback = { ...chargebackData, id, created_at: new Date().toISOString() };
    this.chargebacks.set(id, chargeback);
    return chargeback;
  }

  // Financial Ledger
  async recordLedgerTransaction(txData, entriesList = null) {
    const entries = entriesList || txData.entries || [];
    // Check balanced invariant: sum(debit) === sum(credit)
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of entries) {
      const amt = parseInt(e.amount, 10);
      if (e.type === 'DEBIT') totalDebit += amt;
      else if (e.type === 'CREDIT') totalCredit += amt;
    }
    if (totalDebit !== totalCredit) {
      const err = new Error(`Double-entry imbalance: totalDebit (${totalDebit}) !== totalCredit (${totalCredit})`);
      err.code = 'LEDGER_UNBALANCED';
      throw err;
    }

    const txId = txData.transaction_id || txData.transactionId || txData.id || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const tx = {
      ...txData,
      transaction_id: txId,
      id: txId,
      total_amount: totalDebit,
      created_at: new Date().toISOString(),
      entries
    };
    this.ledgerTransactions.set(txId, tx);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const entryId = `${txId}-${i + 1}`;
      this.ledgerEntries.push({
        entry_id: entryId,
        transaction_id: txId,
        order_id: txData.order_id || txData.orderId,
        ledger_account: e.account || e.ledger_account,
        entry_type: e.type || e.entry_type,
        amount: parseInt(e.amount, 10),
        currency: e.currency || 'IDR',
        source_event: txData.event_type || txData.eventType,
        created_at: tx.created_at
      });
    }

    return tx;
  }

  async getAccountBalances() {
    const balances = {};
    for (const e of this.ledgerEntries) {
      if (!balances[e.ledger_account]) balances[e.ledger_account] = 0;
      if (e.entry_type === 'DEBIT') balances[e.ledger_account] += e.amount;
      else balances[e.ledger_account] -= e.amount;
    }
    return balances;
  }

  async getLedgerTransactionsByOrderId(orderId) {
    const res = [];
    for (const tx of this.ledgerTransactions.values()) {
      if (tx.order_id === orderId) res.push(tx);
    }
    return res;
  }

  // Idempotency
  async checkIdempotency(key, scope) {
    const record = this.idempotency.get(key);
    if (record && record.scope === scope) return record;
    return null;
  }

  async saveIdempotency(key, scope, responsePayload) {
    const record = { key, scope, status: 'COMPLETED', response_payload: responsePayload, created_at: new Date().toISOString() };
    this.idempotency.set(key, record);
    return record;
  }
}

module.exports = { InMemoryMoneyRepository };
