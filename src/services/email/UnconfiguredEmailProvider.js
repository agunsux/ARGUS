/**
 * Unconfigured Email Provider (Fail-Closed)
 * 
 * Used when running in production without required credentials.
 * Enforces the strict FAIL CLOSED invariant:
 * - Does NOT instantiate TestEmailProvider in production.
 * - Does NOT report successful delivery.
 * - Returns a structured failure with EMAIL_PROVIDER_NOT_CONFIGURED.
 * - Exposes clear error details without leaking any internal secrets.
 */

const { EmailProvider } = require('./EmailProvider');

class UnconfiguredEmailProvider extends EmailProvider {
  /**
   * @param {string} [reason]
   */
  constructor(reason = 'EMAIL_PROVIDER_NOT_CONFIGURED: RESEND_API_KEY is not configured in production environment') {
    super('unconfigured');
    this.reason = reason;
  }

  /**
   * Fail-closed dispatch
   * Never reports success, never simulates delivery, never calls network.
   */
  async send(options = {}) {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      provider: 'unconfigured',
      error: this.reason,
      delivered: false,
      idempotencyKey: options?.idempotencyKey || null
    };
  }
}

module.exports = { UnconfiguredEmailProvider };

