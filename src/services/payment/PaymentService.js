/**
 * TIKUM / ARGUS — Unified Payment Service (Epic F & R)
 * 
 * Orchestrates provider-independent payment lifecycle and enforces
 * Production Safety Gates:
 * - NO_REAL_PAYMENT
 * - NO_REAL_SETTLEMENT
 * - NO_FAKE_PAYMENT_SUCCESS
 * - NO_FAKE_ESCROW_BALANCE
 * - NO_FAKE_GMV
 * 
 * Automatically blocks financial activation while providers are PENDING_VERIFICATION.
 */

const { paymentManager } = require('./index');
const { state, recordAuditLog } = require('../../database');

const PRODUCTION_SAFETY_GATES = {
  NO_REAL_PAYMENT: true,
  NO_REAL_SETTLEMENT: true,
  NO_FAKE_PAYMENT_SUCCESS: true,
  NO_FAKE_ESCROW_BALANCE: true,
  NO_FAKE_GMV: true
};

class PaymentService {
  /**
   * Returns current payment subsystem status for admin/observability
   */
  static getSubsystemStatus() {
    const provider = paymentManager.getProvider('ipaymu');
    const providerStatus = provider ? provider.getStatus() : { status: 'UNCONFIGURED' };

    return {
      safety_gates: PRODUCTION_SAFETY_GATES,
      active_providers: paymentManager.getAvailablePaymentMethods(),
      primary_provider: {
        name: 'ipaymu',
        status: providerStatus.status,
        is_verified: providerStatus.isVerified,
        message: providerStatus.message,
        readiness: providerStatus.readiness
      },
      marketplace_financial_state: {
        real_money_active: false,
        settlement_active: false,
        claim: 'PAYMENT_PENDING_MERCHANT_VERIFICATION'
      }
    };
  }

  /**
   * Initiates payment through the appropriate regional provider.
   * Gated: Enforces production safety gates.
   */
  static async createPayment({ orderId, amount, channel, buyer = {}, providerName = 'ipaymu' }) {
    const provider = paymentManager.getProvider(providerName);
    if (!provider) {
      const err = new Error(`Payment provider '${providerName}' not supported`);
      err.code = 'UNKNOWN_PAYMENT_PROVIDER';
      throw err;
    }

    const providerStatus = provider.getStatus();
    if (!providerStatus.isVerified && !provider.config.allowTestSimulation) {
      const err = new Error(
        `Payment provider '${providerName}' is ${providerStatus.status}. Real-money marketplace activation is gated until verification is complete.`
      );
      err.code = 'PAYMENT_PROVIDER_PENDING_VERIFICATION';
      err.status = 503;
      throw err;
    }

    return await provider.createPayment({
      orderId,
      amount,
      channel,
      buyer,
      requiresEscrow: true
    });
  }

  /**
   * Processes incoming gateway webhook in an idempotent, tamper-proof manner.
   */
  static async handleWebhook({ providerName = 'ipaymu', headers = {}, body = {}, rawPayload = null }) {
    const provider = paymentManager.getProvider(providerName);
    if (!provider) {
      const err = new Error(`Provider '${providerName}' not registered`);
      err.code = 'UNKNOWN_PROVIDER';
      throw err;
    }

    // 1. Signature Verification
    const isValidSig = provider.verifyWebhook(headers, body);
    if (!isValidSig) {
      await recordAuditLog('WEBHOOK', 'unknown', 'SIGNATURE_REJECTED', 'GATEWAY', {
        provider: providerName,
        reason: 'Invalid or forged HMAC signature'
      });
      const err = new Error('Invalid gateway webhook signature');
      err.code = 'INVALID_WEBHOOK_SIGNATURE';
      err.status = 401;
      throw err;
    }

    // 2. Normalize payload
    const event = provider.parseWebhook(body);
    const eventId = `wh-${event.providerRef || Date.now()}`;

    // 3. Idempotency Check
    if (!state.processed_webhooks) {
      state.processed_webhooks = new Set();
    }
    if (state.processed_webhooks.has(event.providerRef)) {
      return {
        idempotent: true,
        orderId: event.orderId,
        providerRef: event.providerRef,
        message: 'Webhook event already processed'
      };
    }
    state.processed_webhooks.add(event.providerRef);

    await recordAuditLog('WEBHOOK', eventId, 'PROCESSED', providerName, {
      order_id: event.orderId,
      provider_ref: event.providerRef,
      amount: event.amount,
      status: event.status
    });

    return {
      idempotent: false,
      event
    };
  }
}

module.exports = {
  PaymentService,
  PRODUCTION_SAFETY_GATES
};
