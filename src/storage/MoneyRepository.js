/**
 * TIKUM / ARGUS — Money Repository Interface
 *
 * Defines the contract for financial orders, quotes, payments,
 * webhooks, escrows, settlements, disputes, and double-entry ledger.
 */

class MoneyRepository {
  async init() { throw new Error('Not implemented'); }

  // Quotes
  async createQuote(quoteData, txContext = null) { throw new Error('Not implemented'); }
  async getQuoteById(quoteId, txContext = null) { throw new Error('Not implemented'); }
  async consumeQuote(quoteId, orderContextOrTx = null, txContext = null) { throw new Error('Not implemented'); }
  async consumeQuoteForOrder(quoteId, expectedContext = {}, txContext = null) { throw new Error('Not implemented'); }

  // Orders
  async createOrder(orderData, txContext = null) { throw new Error('Not implemented'); }
  async getOrderById(orderId, txContext = null) { throw new Error('Not implemented'); }
  async listOrdersByBuyerId(buyerId) { throw new Error('Not implemented'); }
  async listOrdersBySellerId(sellerId) { throw new Error('Not implemented'); }
  async listAllOrders(limit = 200) { throw new Error('Not implemented'); }
  async updateOrderStatus(orderId, status, metadata = {}, txContext = null) { throw new Error('Not implemented'); }

  // Canonical Payments & Attempts
  async createPayment(paymentData, txContext = null) { throw new Error('Not implemented'); }
  async getPaymentById(paymentId, txContext = null) { throw new Error('Not implemented'); }
  async getPaymentByOrderId(orderId, txContext = null) { throw new Error('Not implemented'); }
  async getPaymentByOrderAndProviderRef(orderId, providerReference, txContext = null) { throw new Error('Not implemented'); }
  async getSettledPaymentByOrderAndProviderRef(orderId, providerReference, txContext = null) { throw new Error('Not implemented'); }
  async getPaymentByInvoiceOrRef(ref, txContext = null) { throw new Error('Not implemented'); }
  async getPaymentByIdempotencyKey(idempotencyKey, txContext = null) { throw new Error('Not implemented'); }
  async getLatestSettledPaymentByOrderId(orderId, txContext = null) { throw new Error('Not implemented'); }
  async updatePaymentStatus(paymentId, status, metadata = {}, txContext = null) { throw new Error('Not implemented'); }
  async updatePaymentMetadata(paymentId, metadata = {}, txContext = null) { throw new Error('Not implemented'); }
  async recordPaymentAttempt(attemptData, txContext = null) { throw new Error('Not implemented'); }
  async updatePaymentAttemptStatus(attemptId, status, extra = {}, txContext = null) { throw new Error('Not implemented'); }

  // Webhooks (Replay-Proof & Retry-Safe)
  async recordWebhook(webhookData, txContext = null) { throw new Error('Not implemented'); }
  async getWebhook(provider, providerEventId, txContext = null) { throw new Error('Not implemented'); }
  async markWebhookProcessed(provider, providerEventId, status = 'PROCESSED', metadataOrTx = null, txContext = null) { throw new Error('Not implemented'); }

  // Escrows (Atomic Release & Hold)
  async createEscrow(escrowData, txContext = null) { throw new Error('Not implemented'); }
  async getEscrowByOrderId(orderId, txContext = null) { throw new Error('Not implemented'); }
  async listEscrowsByBuyerId(buyerId) { throw new Error('Not implemented'); }
  async listEscrowsBySellerId(sellerId) { throw new Error('Not implemented'); }
  async listAllEscrows(limit = 200) { throw new Error('Not implemented'); }
  async updateEscrowStatus(orderId, status, metadata = {}, txContext = null) { throw new Error('Not implemented'); }
  async releaseEscrow(orderId, actorId, reason = null, txContext = null) { throw new Error('Not implemented'); }
  async refundEscrow(orderId, actorId, reason, txContext = null) { throw new Error('Not implemented'); }
  async setDisputeHold(orderId, hold = true, txContext = null) { throw new Error('Not implemented'); }

  // Settlements
  async createSettlement(settlementData, txContext = null) { throw new Error('Not implemented'); }
  async getSettlementByOrderId(orderId, txContext = null) { throw new Error('Not implemented'); }
  async listSettlementsBySellerId(sellerId) { throw new Error('Not implemented'); }
  async listAllSettlements(limit = 200) { throw new Error('Not implemented'); }

  // Disputes
  async createDispute(disputeData, txContext = null) { throw new Error('Not implemented'); }
  async getDisputeByOrderId(orderId, txContext = null) { throw new Error('Not implemented'); }
  async listDisputesByBuyerId(buyerId) { throw new Error('Not implemented'); }
  async listDisputesBySellerId(sellerId) { throw new Error('Not implemented'); }
  async listAllDisputes(limit = 200) { throw new Error('Not implemented'); }
  async resolveDispute(disputeId, outcome, notes, txContext = null) { throw new Error('Not implemented'); }

  // Chargebacks
  async createChargeback(chargebackData, txContext = null) { throw new Error('Not implemented'); }

  // Append-Only Financial Ledger (Double-Entry Journal)
  async recordLedgerTransaction(txData, entries, txContext = null) { throw new Error('Not implemented'); }
  async getAccountBalances(txContext = null) { throw new Error('Not implemented'); }
  async getLedgerTransactionsByOrderId(orderId, txContext = null) { throw new Error('Not implemented'); }
  async getLedgerTransactionsWithEntriesByOrderId(orderId, eventType = null, txContext = null) { throw new Error('Not implemented'); }

  // Idempotency
  async checkIdempotency(key, scope, txContext = null) { throw new Error('Not implemented'); }
  async claimIdempotency(key, scope, payload, txContext = null) { throw new Error('Not implemented'); }
  async saveIdempotency(key, scope, responsePayload, txContext = null) { throw new Error('Not implemented'); }
  async markIdempotencyRetryable(key, scope, payload = {}, txContext = null) { throw new Error('Not implemented'); }

  // Transactional Outbox
  async createOutboxEvent(outboxData, txContext = null) { throw new Error('Not implemented'); }
  async claimPendingOutboxEvents(batchSize = 10) { throw new Error('Not implemented'); }
  async markOutboxEventProcessed(eventId, txContext = null) { throw new Error('Not implemented'); }
  async markOutboxEventFailed(eventId, errorMessage, backoffSeconds = 60, txContext = null) { throw new Error('Not implemented'); }

  // Financial Dual Authorization (Maker-Checker Gate)
  async createFinancialAuthorization(authData) { throw new Error('Not implemented'); }
  async getFinancialAuthorizationById(id) { throw new Error('Not implemented'); }
  async getPendingFinancialAuthorization(orderId, actionType) { throw new Error('Not implemented'); }
  async approveFinancialAuthorization(authorizationId, checkerId, notes) { throw new Error('Not implemented'); }
  async rejectFinancialAuthorization(authorizationId, checkerId, rejectionReason) { throw new Error('Not implemented'); }
  async consumeFinancialAuthorization(authorizationId, settlementId) { throw new Error('Not implemented'); }
  async listFinancialAuthorizations(filter) { throw new Error('Not implemented'); }

  // Verified Bank Disbursement
  async confirmSettlementDisbursement(params) { throw new Error('Not implemented'); }
}

module.exports = { MoneyRepository };
