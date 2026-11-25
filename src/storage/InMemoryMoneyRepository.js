/**
 * TIKUM / ARGUS — In-Memory Money Repository
 *
 * Fast, isolated test-runner implementation of MoneyRepository.
 */

const { MoneyRepository } = require('./MoneyRepository');

function cloneCollectionValue(val) {
  return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

function resolveEntriesAndTx(entriesList, txContext) {
  if (entriesList && !Array.isArray(entriesList) &&
      (entriesList.isPostgres !== undefined || entriesList.isInMemory !== undefined || entriesList.client !== undefined)) {
    return { entriesArg: null, resolvedTx: entriesList };
  }
  return { entriesArg: entriesList, resolvedTx: txContext };
}

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
    this.authorizations = new Map();
    this.outbox = new Map();
  }

  _createSnapshot() {
    const snapMap = (map) => Array.from(map.entries()).map(([k, v]) => [k, cloneCollectionValue(v)]);
    return {
      quotes: snapMap(this.quotes),
      orders: snapMap(this.orders),
      payments: snapMap(this.payments),
      attempts: snapMap(this.attempts),
      webhooks: snapMap(this.webhooks),
      escrows: snapMap(this.escrows),
      settlements: snapMap(this.settlements),
      disputes: snapMap(this.disputes),
      chargebacks: snapMap(this.chargebacks),
      ledgerTransactions: snapMap(this.ledgerTransactions),
      ledgerEntries: cloneCollectionValue(this.ledgerEntries),
      idempotency: snapMap(this.idempotency),
      authorizations: snapMap(this.authorizations),
      outbox: snapMap(this.outbox)
    };
  }

  _restoreSnapshot(snap) {
    if (!snap) return;
    const restoreMap = (target, entries) => {
      target.clear();
      for (const [k, v] of (entries || [])) {
        target.set(k, cloneCollectionValue(v));
      }
    };
    restoreMap(this.quotes, snap.quotes);
    restoreMap(this.orders, snap.orders);
    restoreMap(this.payments, snap.payments);
    restoreMap(this.attempts, snap.attempts);
    restoreMap(this.webhooks, snap.webhooks);
    restoreMap(this.escrows, snap.escrows);
    restoreMap(this.settlements, snap.settlements);
    restoreMap(this.disputes, snap.disputes);
    restoreMap(this.chargebacks, snap.chargebacks);
    restoreMap(this.ledgerTransactions, snap.ledgerTransactions);
    this.ledgerEntries = cloneCollectionValue(snap.ledgerEntries || []);
    restoreMap(this.idempotency, snap.idempotency);
    restoreMap(this.authorizations, snap.authorizations);
    restoreMap(this.outbox, snap.outbox);
  }

  async init() {
    return true;
  }

  // Quotes
  async createQuote(quoteData, txContext = null) {
    const id = quoteData.quote_id || quoteData.id || `quo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const ticketPrice = Number(quoteData.ticket_price ?? quoteData.ticketPrice);
    const quantity = Number(quoteData.quantity ?? 1);
    const grossTicketValue = quoteData.gross_ticket_value !== undefined
      ? Number(quoteData.gross_ticket_value)
      : (Number.isFinite(ticketPrice) ? ticketPrice * quantity : null);
    const quote = {
      ...quoteData,
      quote_id: id,
      id,
      gross_ticket_value: grossTicketValue,
      fulfillment_option: quoteData.fulfillment_option || null,
      offer_id: quoteData.offer_id || null,
      consumed_by_order_id: quoteData.consumed_by_order_id || null,
      status: quoteData.status || 'ACTIVE',
      created_at: quoteData.created_at || new Date().toISOString()
    };
    this.quotes.set(id, quote);
    return { ...quote };
  }

  async getQuoteById(quoteId, txContext = null) {
    const q = this.quotes.get(quoteId);
    return q ? { ...q } : null;
  }

  async consumeQuote(quoteId, orderContextOrTx = null, txContext = null) {
    if (orderContextOrTx && typeof orderContextOrTx === 'object' &&
        (orderContextOrTx.orderId || orderContextOrTx.order_id || orderContextOrTx.buyerId || orderContextOrTx.buyer_id || orderContextOrTx.listingId || orderContextOrTx.listing_id)) {
      return await this.consumeQuoteForOrder(quoteId, orderContextOrTx, txContext);
    }
    const q = this.quotes.get(quoteId);
    if (!q) return null;
    if (q.status === 'CONSUMED') {
      const err = new Error(`Transaction quote '${quoteId}' has already been consumed`);
      err.code = 'QUOTE_ALREADY_CONSUMED';
      err.status = 409;
      throw err;
    }
    if (q.status === 'EXPIRED' || (q.expires_at && new Date(q.expires_at).getTime() <= Date.now())) {
      q.status = 'EXPIRED';
      const err = new Error(`Transaction quote '${quoteId}' has expired`);
      err.code = 'QUOTE_EXPIRED';
      err.status = 410;
      throw err;
    }
    q.status = 'CONSUMED';
    q.consumed_at = new Date().toISOString();
    return { ...q };
  }

  async consumeQuoteForOrder(quoteId, expectedContext = {}, txContext = null) {
    const q = this.quotes.get(quoteId);
    if (!q) {
      const err = new Error(`Transaction quote '${quoteId}' not found`);
      err.code = 'QUOTE_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    if (q.status === 'CONSUMED' || q.consumed_by_order_id) {
      const err = new Error(`Transaction quote '${quoteId}' has already been consumed by order ${q.consumed_by_order_id || 'unknown'}`);
      err.code = 'QUOTE_ALREADY_CONSUMED';
      err.status = 409;
      throw err;
    }
    if (q.status === 'EXPIRED' || (q.expires_at && new Date(q.expires_at).getTime() <= Date.now())) {
      q.status = 'EXPIRED';
      const err = new Error(`Transaction quote '${quoteId}' has expired`);
      err.code = 'QUOTE_EXPIRED';
      err.status = 410;
      throw err;
    }
    if (q.status !== 'ACTIVE') {
      const err = new Error(`Transaction quote '${quoteId}' is not active (status: ${q.status})`);
      err.code = 'QUOTE_NOT_ACTIVE';
      err.status = 409;
      throw err;
    }

    const expBuyer = expectedContext.buyer_id ?? expectedContext.buyerId;
    const expListing = expectedContext.listing_id ?? expectedContext.listingId;
    const expQty = expectedContext.quantity;
    const expPrice = expectedContext.ticket_price ?? expectedContext.ticketPrice;
    const expGross = expectedContext.gross_ticket_value ?? expectedContext.grossTicketValue;
    const expCurrency = expectedContext.currency;
    const expFulfillment = expectedContext.fulfillment_option ?? expectedContext.fulfillmentOption;
    const expPolicy = expectedContext.pricing_policy_version ?? expectedContext.pricingPolicyVersion ?? expectedContext.fee_policy_version;
    const expOrderId = expectedContext.order_id ?? expectedContext.orderId ?? null;

    const mismatches = [];
    if (expBuyer !== undefined && String(q.buyer_id) !== String(expBuyer)) mismatches.push('buyer_id');
    if (expListing !== undefined && String(q.listing_id) !== String(expListing)) mismatches.push('listing_id');
    if (expQty !== undefined && Number(q.quantity) !== Number(expQty)) mismatches.push('quantity');
    if (expPrice !== undefined && Number(q.ticket_price) !== Number(expPrice)) mismatches.push('ticket_price');
    if (expGross !== undefined && Number(q.gross_ticket_value ?? (q.ticket_price * q.quantity)) !== Number(expGross)) mismatches.push('gross_ticket_value');
    if (expCurrency !== undefined && String(q.currency || '').toUpperCase() !== String(expCurrency || '').toUpperCase()) mismatches.push('currency');
    if (expFulfillment !== undefined && q.fulfillment_option !== expFulfillment) mismatches.push('fulfillment_option');
    if (expPolicy !== undefined && q.pricing_policy_version !== expPolicy) mismatches.push('pricing_policy_version');

    if (mismatches.length > 0) {
      const err = new Error(`Transaction quote '${quoteId}' does not match order context: ${mismatches.join(', ')}`);
      err.code = 'QUOTE_CONTEXT_MISMATCH';
      err.status = 422;
      err.mismatches = mismatches;
      throw err;
    }

    q.status = 'CONSUMED';
    q.consumed_at = new Date().toISOString();
    q.consumed_by_order_id = expOrderId;
    return { ...q };
  }

  // Orders
  async createOrder(orderData, txContext = null) {
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
    return { ...order };
  }

  async getOrderById(orderId, txContext = null) {
    const o = this.orders.get(orderId);
    return o ? { ...o } : null;
  }

  async listOrdersByBuyerId(buyerId) {
    const list = [];
    for (const o of this.orders.values()) {
      if (o.buyer_id === buyerId) list.push(o);
    }
    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listOrdersBySellerId(sellerId) {
    const list = [];
    for (const o of this.orders.values()) {
      if (o.seller_id === sellerId) list.push(o);
    }
    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listAllOrders(limit = 200) {
    return Array.from(this.orders.values())
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);
  }

  async updateOrderStatus(orderId, status, metadata = {}, txContext = null) {
    const order = this.orders.get(orderId);
    if (!order) return null;
    order.status = status;
    order.updated_at = new Date().toISOString();
    Object.assign(order, metadata);
    return { ...order };
  }

  // Payments
  async createPayment(paymentData, txContext = null) {
    const id = paymentData.id || `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const payment = {
      ...paymentData,
      id,
      internal_payment_id: paymentData.internal_payment_id || id,
      status: paymentData.status || 'PAYMENT_PENDING',
      created_at: paymentData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.payments.set(id, payment);
    return { ...payment };
  }

  async getPaymentById(paymentId, txContext = null) {
    for (const p of this.payments.values()) {
      if (p.id === paymentId || p.internal_payment_id === paymentId || p.provider_reference === paymentId) {
        return { ...p };
      }
    }
    return null;
  }

  async getPaymentByOrderId(orderId, txContext = null) {
    for (const p of this.payments.values()) {
      if (p.order_id === orderId) return { ...p };
    }
    return null;
  }

  async getLatestSettledPaymentByOrderId(orderId, txContext = null) {
    const settledStatuses = new Set(['SETTLED', 'PAID', 'ESCROW_HELD', 'CAPTURED_PLATFORM_SETTLEMENT']);
    const matches = Array.from(this.payments.values())
      .filter(p => p.order_id === orderId && settledStatuses.has(String(p.status || '').toUpperCase()))
      .sort((a, b) => new Date(b.paid_at || b.updated_at || b.created_at || 0) - new Date(a.paid_at || a.updated_at || a.created_at || 0));
    return matches[0] ? { ...matches[0] } : null;
  }

  async updatePaymentStatus(paymentId, status, metadata = {}, txContext = null) {
    for (const p of this.payments.values()) {
      if (p.id === paymentId || p.internal_payment_id === paymentId || p.provider_reference === paymentId) {
        p.status = status;
        p.money_state = status;
        if (['PAID', 'ESCROW_HELD', 'SETTLED'].includes(status)) {
          p.paid_at = p.paid_at || new Date().toISOString();
        }
        p.updated_at = new Date().toISOString();
        Object.assign(p, metadata);
        return { ...p };
      }
    }
    return null;
  }

  async recordPaymentAttempt(attemptData, txContext = null) {
    const id = attemptData.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const attempt = { ...attemptData, id, created_at: new Date().toISOString() };
    this.attempts.set(id, attempt);
    return attempt;
  }

  // Webhooks
  async recordWebhook(webhookData, txContext = null) {
    const providerEventId = webhookData.provider_event_id || webhookData.providerEventId;
    const key = `${webhookData.provider}:${providerEventId}`;
    const targetStatus = webhookData.processing_status || 'PENDING';
    const staleAfterSeconds = Number.isFinite(Number(webhookData.staleAfterSeconds))
      ? Math.max(0, Number(webhookData.staleAfterSeconds))
      : 120;

    if (this.webhooks.has(key)) {
      const existing = this.webhooks.get(key);
      const isFailed = existing.processing_status === 'FAILED' || existing.processing_status === 'PROCESSING_FAILED';
      const ageMs = Date.now() - new Date(existing.received_at || 0).getTime();
      const isStale = (existing.processing_status === 'PENDING' || existing.processing_status === 'PROCESSING') &&
        ageMs > (staleAfterSeconds * 1000);

      if (isFailed || isStale) {
        existing.event_type = webhookData.event_type || webhookData.eventType || existing.event_type || 'PAYMENT_EVENT';
        existing.payload_hash = webhookData.payload_hash || webhookData.payloadHash || existing.payload_hash;
        existing.signature_status = webhookData.signature_status || existing.signature_status || 'VALID';
        existing.processing_status = targetStatus;
        existing.raw_payload = webhookData.raw_payload || webhookData.rawPayload || existing.raw_payload;
        existing.error_message = null;
        existing.received_at = new Date().toISOString();
        existing.processed_at = null;
        return { id: existing.id, inserted: true, retried: true, duplicate: false, idempotent: false, record: { ...existing } };
      }
      return { id: existing.id, inserted: false, duplicate: true, idempotent: true, record: { ...existing } };
    }

    const record = {
      ...webhookData,
      id: webhookData.id || `pwh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      provider_event_id: providerEventId,
      processing_status: targetStatus,
      error_message: null,
      received_at: webhookData.received_at || new Date().toISOString(),
      processed_at: null
    };
    this.webhooks.set(key, record);
    return { id: record.id, inserted: true, retried: false, duplicate: false, idempotent: false, record: { ...record } };
  }

  async getWebhook(provider, providerEventId, txContext = null) {
    const w = this.webhooks.get(`${provider}:${providerEventId}`);
    return w ? { ...w } : null;
  }

  async markWebhookProcessed(provider, providerEventId, status = 'PROCESSED', metadataOrTx = null, txContext = null) {
    const w = this.webhooks.get(`${provider}:${providerEventId}`);
    if (!w) return null;
    const isTxObj = metadataOrTx && (metadataOrTx.isPostgres !== undefined || metadataOrTx.isInMemory !== undefined || metadataOrTx.client !== undefined);
    const meta = (!isTxObj && typeof metadataOrTx === 'object' && metadataOrTx !== null) ? metadataOrTx : {};
    w.processing_status = status;
    if (status === 'PROCESSED') {
      w.processed_at = new Date().toISOString();
      w.error_message = null;
    } else {
      w.processed_at = null;
      if (meta.error_message !== undefined) {
        w.error_message = meta.error_message;
      }
    }
    return { ...w };
  }

  // Escrows
  async createEscrow(escrowData, txContext = null) {
    const id = escrowData.id || `esc-${escrowData.order_id || Date.now()}`;
    const escrow = {
      ...escrowData,
      id,
      escrow_id: id,
      status: escrowData.status || 'PENDING_PAYMENT',
      dispute_hold: escrowData.dispute_hold === true,
      created_at: escrowData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.escrows.set(escrowData.order_id, escrow);
    return { ...escrow };
  }

  async getEscrowByOrderId(orderId, txContext = null) {
    const e = this.escrows.get(orderId);
    return e ? { ...e } : null;
  }

  async listEscrowsByBuyerId(buyerId) {
    return Array.from(this.escrows.values())
      .filter(e => e.buyer_id === buyerId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listEscrowsBySellerId(sellerId) {
    return Array.from(this.escrows.values())
      .filter(e => e.seller_id === sellerId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listAllEscrows(limit = 200) {
    return Array.from(this.escrows.values())
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);
  }

  async updateEscrowStatus(orderId, status, metadata = {}, txContext = null) {
    const escrow = this.escrows.get(orderId);
    if (!escrow) return null;
    escrow.status = status;
    if (status === 'ESCROWED') {
      escrow.funded_at = escrow.funded_at || new Date().toISOString();
    }
    escrow.updated_at = new Date().toISOString();
    Object.assign(escrow, metadata);
    return { ...escrow };
  }

  async releaseEscrow(orderIdParam, actorIdParam = 'SYSTEM', reason = null, txContext = null) {
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
      return { escrow: { ...escrow }, alreadyReleased: true, idempotent: true };
    }

    escrow.status = 'RELEASED';
    escrow.released_at = new Date().toISOString();
    escrow.released_by = actorId;
    escrow.release_reason = reason;
    escrow.updated_at = new Date().toISOString();
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'SETTLED';
      order.updated_at = new Date().toISOString();
    }
    return { escrow: { ...escrow }, alreadyReleased: false, idempotent: false };
  }

  async refundEscrow(orderId, actorId, reason, txContext = null) {
    const escrow = this.escrows.get(orderId);
    if (!escrow) throw new Error(`Escrow for order '${orderId}' not found`);
    if (escrow.status === 'REFUNDED') return { escrow: { ...escrow }, alreadyRefunded: true };

    escrow.status = 'REFUNDED';
    escrow.refunded_at = new Date().toISOString();
    escrow.refunded_by = actorId;
    escrow.refund_reason = reason;
    escrow.updated_at = new Date().toISOString();
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'REFUNDED';
      order.updated_at = new Date().toISOString();
    }
    return { escrow: { ...escrow }, alreadyRefunded: false };
  }

  async setDisputeHold(orderId, hold = true, txContext = null) {
    const escrow = this.escrows.get(orderId);
    if (!escrow) return null;
    escrow.dispute_hold = hold;
    if (hold) escrow.status = 'DISPUTED';
    escrow.updated_at = new Date().toISOString();
    return { ...escrow };
  }

  // Settlements
  async createSettlement(settlementData, txContext = null) {
    if (this.settlements.has(settlementData.order_id)) {
      return { settlement: { ...this.settlements.get(settlementData.order_id) }, idempotent: true };
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
    return { settlement: { ...settlement }, idempotent: false };
  }

  async getSettlementByOrderId(orderId) {
    return this.settlements.get(orderId) || null;
  }

  async listSettlementsBySellerId(sellerId) {
    return Array.from(this.settlements.values())
      .filter(s => s.seller_id === sellerId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listAllSettlements(limit = 200) {
    return Array.from(this.settlements.values())
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);
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

  async listDisputesByBuyerId(buyerId) {
    return Array.from(this.disputes.values())
      .filter(d => d.buyer_id === buyerId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listDisputesBySellerId(sellerId) {
    return Array.from(this.disputes.values())
      .filter(d => d.seller_id === sellerId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listAllDisputes(limit = 200) {
    return Array.from(this.disputes.values())
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);
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
  async recordLedgerTransaction(txData, entriesList = null, txContext = null) {
    const { entriesArg, resolvedTx } = resolveEntriesAndTx(entriesList, txContext);
    const entries = entriesArg || txData.entries || [];
    if (!Array.isArray(entries) || entries.length < 2) {
      const err = new Error('Ledger transaction requires at least two balancing entries');
      err.code = 'INVALID_LEDGER_TRANSACTION';
      throw err;
    }

    const eventType = txData.event_type || txData.eventType || txData.source_event;
    if (!eventType) {
      const err = new Error('Ledger transaction requires a non-empty event_type');
      err.code = 'INVALID_EVENT_TYPE';
      throw err;
    }
    const orderId = txData.order_id || txData.orderId;
    if (!orderId) {
      const err = new Error('Ledger transaction requires order_id');
      err.code = 'INVALID_LEDGER_TRANSACTION';
      throw err;
    }

    // Check balanced invariant: sum(debit) === sum(credit) & positive integers
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of entries) {
      const amt = Number(e.amount);
      const etype = e.type || e.entry_type;
      if (!Number.isSafeInteger(amt) || amt <= 0) {
        const err = new Error(`Ledger entry amount must be a positive integer, got: ${e.amount}`);
        err.code = 'INVALID_ENTRY_AMOUNT';
        throw err;
      }
      if (etype === 'DEBIT') totalDebit += amt;
      else if (etype === 'CREDIT') totalCredit += amt;
      else {
        const err = new Error(`Invalid entry type: ${etype}`);
        err.code = 'INVALID_ENTRY_TYPE';
        throw err;
      }
    }
    if (totalDebit !== totalCredit) {
      const err = new Error(`Double-entry imbalance: totalDebit (${totalDebit}) !== totalCredit (${totalCredit})`);
      err.code = 'LEDGER_UNBALANCED';
      throw err;
    }

    if (eventType === 'CAPTURE' || eventType === 'RELEASE') {
      for (const existing of this.ledgerTransactions.values()) {
        if (existing.order_id === orderId && (existing.event_type || existing.source_event) === eventType) {
          const err = new Error(`Duplicate ledger ${eventType} transaction for order '${orderId}'`);
          err.code = 'DUPLICATE_LEDGER_EVENT';
          err.status = 409;
          throw err;
        }
      }
    }

    const txId = txData.transaction_id || txData.transactionId || txData.id || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const currency = txData.currency || 'IDR';

    const storedEntries = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const entryId = e.entry_id || `${txId}-${i + 1}`;
      const account = e.account || e.ledger_account;
      const entryType = e.type || e.entry_type;
      const entryObj = {
        entry_id: entryId,
        transaction_id: txId,
        order_id: orderId,
        ledger_account: account,
        account,
        entry_type: entryType,
        type: entryType,
        amount: parseInt(e.amount, 10),
        currency: e.currency || currency,
        source_event: eventType,
        created_at: now
      };
      this.ledgerEntries.push(entryObj);
      storedEntries.push({ ...entryObj });
    }

    const tx = {
      ...txData,
      transaction_id: txId,
      id: txId,
      order_id: orderId,
      quote_id: txData.quote_id || txData.quoteId || null,
      event_type: eventType,
      source_event: eventType,
      total_amount: totalDebit,
      currency,
      description: txData.description || '',
      actor_id: txData.actor_id || txData.actorId || 'SYSTEM',
      created_at: now,
      entries: storedEntries
    };
    this.ledgerTransactions.set(txId, tx);

    return { ...tx, entries: storedEntries.map(e => ({ ...e })) };
  }

  async getAccountBalances(txContext = null) {
    const balances = {};
    for (const e of this.ledgerEntries) {
      if (!balances[e.ledger_account]) balances[e.ledger_account] = 0;
      if (e.entry_type === 'DEBIT') balances[e.ledger_account] += e.amount;
      else balances[e.ledger_account] -= e.amount;
    }
    return balances;
  }

  async getLedgerTransactionsByOrderId(orderId, txContext = null) {
    return await this.getLedgerTransactionsWithEntriesByOrderId(orderId, null, txContext);
  }

  async getLedgerTransactionsWithEntriesByOrderId(orderId, eventType = null, txContext = null) {
    const res = [];
    for (const tx of this.ledgerTransactions.values()) {
      const txEvent = tx.event_type || tx.source_event;
      if (tx.order_id === orderId && (!eventType || txEvent === eventType)) {
        const entries = this.ledgerEntries
          .filter(e => e.transaction_id === tx.transaction_id)
          .map(e => ({ ...e }));
        res.push({ ...tx, entries });
      }
    }
    res.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    return res;
  }

  // Idempotency
  async checkIdempotency(key, scope, txContext = null) {
    const record = this.idempotency.get(key);
    if (record && record.scope === scope) return { ...record };
    return null;
  }

  async saveIdempotency(key, scope, responsePayload, txContext = null) {
    const record = { key, scope, status: 'COMPLETED', response_payload: responsePayload, created_at: new Date().toISOString(), completed_at: new Date().toISOString() };
    this.idempotency.set(key, record);
    return { ...record };
  }

  // Transactional Outbox
  async createOutboxEvent(outboxData, txContext = null) {
    const eventId = outboxData.event_id || outboxData.eventId;
    if (this.outbox.has(eventId)) {
      return { ...this.outbox.get(eventId), idempotent: true };
    }
    const id = outboxData.id || `obx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record = {
      ...outboxData,
      id,
      event_id: eventId,
      status: outboxData.status || 'PENDING',
      retry_count: outboxData.retry_count || 0,
      max_retries: outboxData.max_retries || 5,
      last_error: outboxData.last_error || null,
      next_retry_at: outboxData.next_retry_at || new Date().toISOString(),
      created_at: outboxData.created_at || new Date().toISOString(),
      processed_at: outboxData.processed_at || null
    };
    this.outbox.set(eventId, record);
    return { ...record };
  }

  async claimPendingOutboxEvents(batchSize = 10) {
    const now = Date.now();
    const list = Array.from(this.outbox.values())
      .filter(e => e.status === 'PENDING' && new Date(e.next_retry_at || 0).getTime() <= now)
      .slice(0, batchSize);
    for (const e of list) {
      e.status = 'PROCESSING';
    }
    return list.map(e => ({ ...e }));
  }

  async markOutboxEventProcessed(eventId, txContext = null) {
    const e = this.outbox.get(eventId);
    if (!e) return null;
    e.status = 'PROCESSED';
    e.processed_at = new Date().toISOString();
    e.last_error = null;
    return { ...e };
  }

  async markOutboxEventFailed(eventId, errorMessage, backoffSeconds = 60, txContext = null) {
    const e = this.outbox.get(eventId);
    if (!e) return null;
    e.retry_count = (e.retry_count || 0) + 1;
    e.last_error = errorMessage;
    e.status = e.retry_count >= (e.max_retries || 5) ? 'DEAD_LETTER' : 'PENDING';
    e.next_retry_at = new Date(Date.now() + (backoffSeconds * 1000)).toISOString();
    return { ...e };
  }

  // Financial Dual Authorization (Maker-Checker Gate)
  async createFinancialAuthorization(authData) {
    const id = authData.authorization_id || authData.id || `fauth-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    for (const a of this.authorizations.values()) {
      if (a.order_id === authData.order_id && a.action_type === authData.action_type && a.status === 'PENDING_APPROVAL') {
        return { authorization: a, idempotent: true };
      }
    }
    const authorization = {
      id,
      authorization_id: id,
      order_id: authData.order_id,
      action_type: authData.action_type,
      maker_id: authData.maker_id,
      checker_id: null,
      status: 'PENDING_APPROVAL',
      amount: parseInt(authData.amount || 0, 10),
      currency: authData.currency || 'IDR',
      payout_destination: authData.payout_destination || authData.bankAccount || null,
      reason: authData.reason,
      approval_notes: null,
      rejection_reason: null,
      metadata: authData.metadata || {},
      created_at: new Date().toISOString(),
      approved_at: null,
      rejected_at: null,
      consumed_at: null,
      consumed_by_settlement_id: null
    };
    this.authorizations.set(id, authorization);
    return { authorization, idempotent: false };
  }

  async getFinancialAuthorizationById(id) {
    for (const a of this.authorizations.values()) {
      if (a.id === id || a.authorization_id === id) return a;
    }
    return null;
  }

  async getPendingFinancialAuthorization(orderId, actionType) {
    for (const a of this.authorizations.values()) {
      if (a.order_id === orderId && a.action_type === actionType && a.status === 'PENDING_APPROVAL') {
        return a;
      }
    }
    return null;
  }

  async approveFinancialAuthorization(authorizationId, checkerId, notes = null) {
    const auth = await this.getFinancialAuthorizationById(authorizationId);
    if (!auth) {
      const err = new Error(`Financial authorization '${authorizationId}' not found`);
      err.code = 'AUTHORIZATION_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    if (auth.status !== 'PENDING_APPROVAL') {
      const err = new Error(`Cannot approve: authorization request is already ${auth.status}`);
      err.code = 'AUTHORIZATION_NOT_PENDING';
      err.status = 400;
      throw err;
    }
    if (auth.maker_id === checkerId) {
      const err = new Error('Maker-Checker violation: Initiator (Maker) cannot approve their own financial authorization request');
      err.code = 'MAKER_CHECKER_VIOLATION';
      err.status = 403;
      throw err;
    }
    auth.status = 'APPROVED';
    auth.checker_id = checkerId;
    auth.approval_notes = notes;
    auth.approved_at = new Date().toISOString();
    return { success: true, authorization: auth };
  }

  async rejectFinancialAuthorization(authorizationId, checkerId, rejectionReason) {
    const auth = await this.getFinancialAuthorizationById(authorizationId);
    if (!auth) {
      const err = new Error(`Financial authorization '${authorizationId}' not found`);
      err.code = 'AUTHORIZATION_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    if (auth.status !== 'PENDING_APPROVAL') {
      const err = new Error(`Cannot reject: authorization request is already ${auth.status}`);
      err.code = 'AUTHORIZATION_NOT_PENDING';
      err.status = 400;
      throw err;
    }
    auth.status = 'REJECTED';
    auth.checker_id = checkerId;
    auth.rejection_reason = rejectionReason;
    auth.rejected_at = new Date().toISOString();
    return { success: true, authorization: auth };
  }

  async consumeFinancialAuthorization(authorizationId, settlementId) {
    const auth = await this.getFinancialAuthorizationById(authorizationId);
    if (!auth) {
      const err = new Error(`Financial authorization '${authorizationId}' not found`);
      err.code = 'AUTHORIZATION_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    if (auth.status !== 'APPROVED') {
      const err = new Error(`Cannot consume authorization: status is ${auth.status}`);
      err.code = 'AUTHORIZATION_NOT_APPROVED';
      err.status = 400;
      throw err;
    }
    auth.status = 'CONSUMED';
    auth.consumed_at = new Date().toISOString();
    auth.consumed_by_settlement_id = settlementId;
    return { success: true, authorization: auth };
  }

  async listFinancialAuthorizations(filter = {}) {
    let list = Array.from(this.authorizations.values());
    if (filter.status) list = list.filter(a => a.status === filter.status);
    if (filter.orderId) list = list.filter(a => a.order_id === filter.orderId);
    if (filter.actionType) list = list.filter(a => a.action_type === filter.actionType);
    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async confirmSettlementDisbursement({
    settlementId,
    orderId,
    officerId,
    bankReferenceNumber,
    proofDocumentUrl = null,
    bankAccount = null
  }) {
    if (!bankReferenceNumber || typeof bankReferenceNumber !== 'string' || bankReferenceNumber.trim().length < 5) {
      const err = new Error('Authentic bank transaction reference number is required (min 5 characters)');
      err.code = 'INVALID_BANK_REFERENCE';
      err.status = 400;
      throw err;
    }
    const cleanRef = bankReferenceNumber.trim();

    for (const s of this.settlements.values()) {
      if (s.id !== settlementId && s.bank_reference_number === cleanRef) {
        if (!bankAccount || s.bank_account === bankAccount) {
          const err = new Error(`Duplicate bank reference number '${cleanRef}' has already been used for settlement '${s.id}'`);
          err.code = 'DUPLICATE_BANK_REFERENCE';
          err.status = 400;
          throw err;
        }
      }
    }

    let settlement = null;
    for (const s of this.settlements.values()) {
      if (s.id === settlementId || (orderId && s.order_id === orderId)) {
        settlement = s;
        break;
      }
    }
    if (!settlement) {
      const err = new Error(`Settlement '${settlementId || orderId}' not found`);
      err.code = 'SETTLEMENT_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const now = new Date().toISOString();
    settlement.status = 'DISBURSED';
    settlement.disbursement_status = 'DISBURSED';
    settlement.bank_reference_number = cleanRef;
    settlement.proof_document_url = proofDocumentUrl;
    settlement.disbursed_at = now;
    settlement.confirmed_by_officer = officerId;
    return { success: true, status: 'DISBURSED', settlement, bankReferenceNumber: cleanRef, confirmedAt: now };
  }
}

module.exports = { InMemoryMoneyRepository };
