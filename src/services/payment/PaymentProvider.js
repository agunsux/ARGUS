/**
 * TIKUM / ARGUS — Canonical Payment Provider Abstraction (Epic F)
 * 
 * Provider-independent interface for multi-channel / ASEAN payment gateways.
 * Keeps core marketplace, order, and dispute logic completely decouple from any
 * specific financial provider (iPaymu, HitPay, 2C2P, Xendit, etc.).
 */

class PaymentProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Provider identifier (e.g. 'ipaymu', 'xendit', 'hitpay')
   * @returns {string}
   */
  getName() {
    throw new Error('getName() must be implemented by payment provider');
  }

  /**
   * Country code this provider serves (e.g. 'ID', 'SG', 'MY')
   * @returns {string}
   */
  getCountry() {
    throw new Error('getCountry() must be implemented by payment provider');
  }

  /**
   * Provider operational verification status:
   * 'PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'MAINTENANCE'
   * @returns {{ status: string, isVerified: boolean, message: string }}
   */
  getStatus() {
    throw new Error('getStatus() must be implemented by payment provider');
  }

  /**
   * Returns supported payment channels with escrow capability metadata.
   * @returns {Array<{ code: string, name: string, type: string, isEscrowSupported: boolean }>}
   */
  getSupportedChannels() {
    throw new Error('getSupportedChannels() must be implemented by payment provider');
  }

  /**
   * Checks whether a specific payment channel supports escrow holding.
   * @param {string} channelCode
   * @returns {boolean}
   */
  isEscrowSupported(channelCode) {
    const channels = this.getSupportedChannels();
    const channel = channels.find(c => c.code.toUpperCase() === channelCode.toUpperCase());
    return channel ? channel.isEscrowSupported : false;
  }

  /**
   * Creates a payment session / invoice for an order.
   * Throws if provider is in PENDING_VERIFICATION.
   */
  async createPayment({ orderId, amount, currency = 'IDR', channel, buyer = {}, requiresEscrow = true, metadata = {} }) {
    throw new Error('createPayment() must be implemented by payment provider');
  }

  /**
   * Queries provider for current payment status.
   */
  async getPaymentStatus({ orderId, providerRef }) {
    throw new Error('getPaymentStatus() must be implemented by payment provider');
  }

  /**
   * Captures authorized funds into escrow holding.
   */
  async capture({ orderId, providerRef, amount }) {
    throw new Error('capture() must be implemented by payment provider');
  }

  /**
   * Issues refund to buyer.
   */
  async refund({ orderId, providerRef, amount, reason }) {
    throw new Error('refund() must be implemented by payment provider');
  }

  /**
   * Cancels payment session / unpaid invoice.
   */
  async cancel({ orderId, providerRef, reason }) {
    throw new Error('cancel() must be implemented by payment provider');
  }

  /**
   * Verifies incoming webhook cryptographic signature.
   */
  verifyWebhook(headers = {}, body = {}) {
    throw new Error('verifyWebhook() must be implemented by payment provider');
  }

  /**
   * Normalizes gateway webhook payload into canonical ARGUS payment event.
   */
  parseWebhook(payload = {}) {
    throw new Error('parseWebhook() must be implemented by payment provider');
  }
}

module.exports = { PaymentProvider };
