/**
 * TIKUM / ARGUS — Money Repository Interface
 *
 * Defines the contract for financial orders, quotes, payments,
 * webhooks, escrows, settlements, disputes, and double-entry ledger.
 */

class MoneyRepository {
  async init() { throw new Error('Not implemented'); }

  // Quotes
  async createQuote(quoteData) { throw new Error('Not implemented'); }
  async getQuoteById(quoteId) { throw new Error('Not implemented'); }
  async consumeQuote(quoteId) { throw new Error('Not implemented'); }

  // Orders
  async createOrder(orderData) { throw new Error('Not implemented'); }
  async getOrderById(orderId) { throw new Error('Not implemented'); }
  async updateOrderStatus(orderId, status, metadata = {}) { throw new Error('Not implemented'); }

  // Canonical Payments & Attempts
  async createPayment(paymentData) { throw new Error('Not implemented'); }
  async getPaymentById(paymentId) { throw new Error('Not implemented'); }
  async getPaymentByOrderId(orderId) { throw new Error('Not implemented'); }
  async updatePaymentStatus(paymentId, status, metadata = {}) { throw new Error('Not implemented'); }
  async recordPaymentAttempt(attemptData) { throw new Error('Not implemented'); }

  // Webhooks (Replay-Proof)
  async recordWebhook(webhookData) { throw new Error('Not implemented'); }
  async getWebhook(provider, providerEventId) { throw new Error('Not implemented'); }
  async markWebhookProcessed(provider, providerEventId, status = 'PROCESSED') { throw new Error('Not implemented'); }

  // Escrows (Atomic Release & Hold)
  async createEscrow(escrowData) { throw new Error('Not implemented'); }
  async getEscrowByOrderId(orderId) { throw new Error('Not implemented'); }
  async updateEscrowStatus(orderId, status, metadata = {}) { throw new Error('Not implemented'); }
  async releaseEscrow(orderId, actorId) { throw new Error('Not implemented'); }
  async refundEscrow(orderId, actorId, reason) { throw new Error('Not implemented'); }
  async setDisputeHold(orderId, hold = true) { throw new Error('Not implemented'); }

  // Settlements
  async createSettlement(settlementData) { throw new Error('Not implemented'); }
  async getSettlementByOrderId(orderId) { throw new Error('Not implemented'); }

  // Disputes
  async createDispute(disputeData) { throw new Error('Not implemented'); }
  async getDisputeByOrderId(orderId) { throw new Error('Not implemented'); }
  async resolveDispute(disputeId, outcome, notes) { throw new Error('Not implemented'); }

  // Chargebacks
  async createChargeback(chargebackData) { throw new Error('Not implemented'); }

  // Append-Only Financial Ledger (Double-Entry Journal)
  async recordLedgerTransaction(txData, entries) { throw new Error('Not implemented'); }
  async getAccountBalances() { throw new Error('Not implemented'); }
  async getLedgerTransactionsByOrderId(orderId) { throw new Error('Not implemented'); }

  // Idempotency
  async checkIdempotency(key, scope) { throw new Error('Not implemented'); }
  async saveIdempotency(key, scope, responsePayload) { throw new Error('Not implemented'); }
}

module.exports = { MoneyRepository };
