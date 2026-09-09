/**
 * ARGUS PAYMENT PROVIDER ABSTRACTION
 * 
 * Base interface for multi-channel / multi-country payment and escrow providers.
 * Designed for modularity: initial implementation is iPaymu (Indonesia),
 * with support for future ASEAN gateways (HitPay, 2C2P, Xendit, etc.).
 */

class PaymentProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Provider identifier (e.g. 'ipaymu', 'hitpay', 'xendit')
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
   * Returns supported payment channels with escrow capability metadata.
   * Crucial: Not every channel supports escrow holding!
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
   * Throws if an escrow order selects a channel that does not support escrow.
   * @param {Object} params
   * @param {string} params.orderId
   * @param {number} params.amount
   * @param {string} params.channel
   * @param {Object} params.buyer
   * @param {boolean} params.requiresEscrow
   * @returns {Promise<Object>}
   */
  async createPayment({ orderId, amount, channel, buyer, requiresEscrow = true }) {
    throw new Error('createPayment() must be implemented by payment provider');
  }

  /**
   * Verifies incoming webhook signature from the gateway.
   * @param {Object} headers
   * @param {Object|string} body
   * @returns {boolean}
   */
  verifyWebhook(headers, body) {
    throw new Error('verifyWebhook() must be implemented by payment provider');
  }

  /**
   * Normalizes webhook payload into canonical ARGUS payment event.
   * @param {Object} payload
   * @returns {{ orderId: string, providerRef: string, amount: number, status: string, isEscrowLocked: boolean, channel: string }}
   */
  parseWebhook(payload) {
    throw new Error('parseWebhook() must be implemented by payment provider');
  }
}

module.exports = { PaymentProvider };
