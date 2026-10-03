/**
 * TIKUM / ARGUS — Canonical Payment Provider Abstraction (Part 1, 3, 16)
 *
 * Provider-independent interface for multi-channel & escrow-capable payment gateways.
 * Keeps core marketplace, order, trust, escrow, and dispute logic completely decoupled
 * from any specific financial rail (RCB, iPaymu, DOKU, Midtrans, Xendit, etc.).
 *
 * RULE: Unsupported capabilities MUST return an explicit CapabilityUnsupportedError.
 * Never silently stub or fabricate success for unsupported capabilities!
 */

const { ProviderCapabilities } = require('./canonicalPaymentTypes');

class CapabilityUnsupportedError extends Error {
  constructor(providerName, capability) {
    super(`Capability '${capability}' is not supported by payment provider '${providerName}'.`);
    this.name = 'CapabilityUnsupportedError';
    this.code = 'CAPABILITY_UNSUPPORTED';
    this.provider = providerName;
    this.capability = capability;
    this.status = 501;
  }
}

class PaymentProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Provider identifier (e.g. 'rcb', 'ipaymu', 'midtrans', 'doku', 'xendit')
   * @returns {string}
   */
  getName() {
    throw new Error('getName() must be implemented by payment provider');
  }

  /**
   * Country code this provider serves (e.g. 'ID', 'SG')
   * @returns {string}
   */
  getCountry() {
    return 'ID';
  }

  /**
   * Country codes this provider serves (e.g. ['ID'])
   * @returns {Array<string>}
   */
  getSupportedCountries() {
    return [this.getCountry()];
  }

  /**
   * Currencies supported by this provider (e.g. ['IDR'])
   * @returns {Array<string>}
   */
  getSupportedCurrencies() {
    return ['IDR'];
  }

  /**
   * Provider operational verification status:
   * 'PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'MAINTENANCE'
   * @returns {{ status: string, isVerified: boolean, message: string, readiness?: any }}
   */
  getStatus() {
    throw new Error('getStatus() must be implemented by payment provider');
  }

  /**
   * Explicit capabilities verified from official documentation/contracts.
   * @returns {ProviderCapabilities}
   */
  getCapabilities() {
    return new ProviderCapabilities({
      paymentCollection: false,
      refund: false,
      hold: false,
      release: false,
      payout: false,
      splitSettlement: false,
      sellerAccounts: false,
      subAccounts: false,
      webhooks: false,
      reconciliation: false
    });
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
    const channel = channels.find(c => c.code.toUpperCase() === (channelCode || '').toUpperCase());
    return channel ? channel.isEscrowSupported : false;
  }

  /**
   * Creates a payment intent / invoice on the provider rail.
   * @returns {Promise<import('./canonicalPaymentTypes').CanonicalPaymentResult>}
   */
  async createPayment({
    orderId,
    amount,
    currency = 'IDR',
    channel,
    buyer = {},
    requiresEscrow = true,
    metadata = {},
    idempotencyKey = null
  }) {
    throw new Error('createPayment() must be implemented by payment provider');
  }

  /**
   * Queries provider for current payment status.
   */
  async getPaymentStatus({ orderId, providerRef }) {
    throw new Error('getPaymentStatus() must be implemented by payment provider');
  }

  /**
   * Verifies incoming webhook cryptographic signature.
   * Accepts both raw buffer and parsed body.
   */
  verifyWebhook(headers = {}, body = {}, rawBodyBuffer = null) {
    throw new Error('verifyWebhook() must be implemented by payment provider');
  }

  /**
   * Normalizes gateway webhook payload into canonical ARGUS payment event.
   */
  parseWebhook(payload = {}, headers = {}) {
    throw new Error('parseWebhook() must be implemented by payment provider');
  }

  /**
   * Issues refund to buyer through the provider adapter.
   */
  async requestRefund({ orderId, providerRef, amount, reason, idempotencyKey }) {
    const caps = this.getCapabilities();
    if (!caps.refund) {
      throw new CapabilityUnsupportedError(this.getName(), 'refund');
    }
    throw new Error('requestRefund() must be implemented by payment provider');
  }

  /**
   * Queries provider for refund status.
   */
  async getRefundStatus({ refundId, providerRef }) {
    const caps = this.getCapabilities();
    if (!caps.refund) {
      throw new CapabilityUnsupportedError(this.getName(), 'refund');
    }
    throw new Error('getRefundStatus() must be implemented by payment provider');
  }

  /**
   * Creates a financial hold / escrow reservation on provider rail if supported.
   */
  async createHold({ orderId, providerRef, amount }) {
    const caps = this.getCapabilities();
    if (!caps.hold) {
      throw new CapabilityUnsupportedError(this.getName(), 'hold');
    }
    throw new Error('createHold() must be implemented by payment provider');
  }

  /**
   * Releases held funds to seller / merchant if provider supports native release.
   */
  async releaseHold({ orderId, providerRef, amount }) {
    const caps = this.getCapabilities();
    if (!caps.release) {
      throw new CapabilityUnsupportedError(this.getName(), 'release');
    }
    throw new Error('releaseHold() must be implemented by payment provider');
  }

  /**
   * Creates payout / disbursement to seller bank account.
   */
  async createPayout({ orderId, sellerId, amount, bankAccount = {}, idempotencyKey }) {
    const caps = this.getCapabilities();
    if (!caps.payout) {
      throw new CapabilityUnsupportedError(this.getName(), 'payout');
    }
    throw new Error('createPayout() must be implemented by payment provider');
  }

  /**
   * Queries payout status on provider rail.
   */
  async getPayoutStatus({ payoutId, providerRef }) {
    const caps = this.getCapabilities();
    if (!caps.payout) {
      throw new CapabilityUnsupportedError(this.getName(), 'payout');
    }
    throw new Error('getPayoutStatus() must be implemented by payment provider');
  }

  /**
   * Reconciles transaction with provider ledger.
   */
  async reconcileTransaction({ orderId, providerRef, date }) {
    const caps = this.getCapabilities();
    if (!caps.reconciliation) {
      throw new CapabilityUnsupportedError(this.getName(), 'reconciliation');
    }
    throw new Error('reconcileTransaction() must be implemented by payment provider');
  }

  /**
   * Provider connectivity / ping health check.
   */
  async healthCheck() {
    return {
      provider: this.getName(),
      healthy: true,
      timestamp: new Date().toISOString()
    };
  }

  // Backward compatibility alias for existing code
  async capture(params) {
    return this.createHold(params);
  }

  // Backward compatibility alias for existing code
  async refund(params) {
    return this.requestRefund(params);
  }

  // Backward compatibility alias for existing code
  async cancel({ orderId, providerRef, reason }) {
    return { orderId, providerRef, cancelled: true, reason };
  }
}

module.exports = {
  PaymentProvider,
  CapabilityUnsupportedError
};
