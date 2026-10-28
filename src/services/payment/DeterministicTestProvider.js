/**
 * TIKUM / ARGUS — Deterministic Test Payment Provider (Epic 6, Phase 1C)
 *
 * Provides a mock-free, deterministic test harness implementing PaymentProvider.
 *
 * HARD SECURITY GATE:
 * Must NEVER be instantiated or registered outside NODE_ENV=test.
 * Throws a fatal exception if invoked in development or production.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { PaymentProvider } = require('./PaymentProvider');

/**
 * Deterministic scenario constants.
 */
const TEST_PAYMENT_SCENARIOS = {
  SUCCESS: 'SUCCESS',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
  TIMEOUT: 'TIMEOUT',
  DUPLICATE_CALLBACK: 'DUPLICATE_CALLBACK',
  INVALID_CALLBACK: 'INVALID_CALLBACK',
  REFUND: 'REFUND',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUND_CONFIRMED: 'REFUND_CONFIRMED',
  REFUND_FAILED: 'REFUND_FAILED',
  REFUND_TIMEOUT: 'REFUND_TIMEOUT'
};

class DeterministicTestProvider extends PaymentProvider {
  constructor(config = {}) {
    // HARD PRODUCTION SAFETY GATE
    if (process.env.NODE_ENV !== 'test') {
      const err = new Error(
        '[FATAL_SECURITY_GATE] DeterministicTestProvider can ONLY be instantiated in NODE_ENV=test! Production or staging initialization is strictly forbidden.'
      );
      err.code = 'PRODUCTION_SECURITY_VIOLATION';
      throw err;
    }

    super(config);
    this.secretKey = config.secretKey || 'deterministic-test-hmac-secret-2026';
    this.payments = new Map();
    this.callbacksProcessed = new Set();
  }

  getName() {
    return 'test_provider';
  }

  getCountry() {
    return 'ID';
  }

  getStatus() {
    return {
      status: 'ACTIVE',
      isVerified: true,
      message: 'Deterministic Test Payment Provider (Test Environment Only)',
      readiness: 'TEST_ONLY'
    };
  }

  getSupportedChannels() {
    return [
      { code: 'TEST_ESCROW_VA', name: 'Test Virtual Account (Escrow)', type: 'VA', isEscrowSupported: true },
      { code: 'TEST_ESCROW_QRIS', name: 'Test QRIS (Escrow)', type: 'QRIS', isEscrowSupported: true },
      { code: 'TEST_DIRECT_NO_ESCROW', name: 'Test Direct Payment (No Escrow)', type: 'DIRECT', isEscrowSupported: false }
    ];
  }

  getCapabilities() {
    const { ProviderCapabilities } = require('./canonicalPaymentTypes');
    return new ProviderCapabilities({
      paymentCollection: true,
      refund: true,
      partialRefund: false,
      hold: true,
      release: true,
      payout: true,
      webhooks: true,
      reconciliation: true
    });
  }

  computeSignature(payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', this.secretKey).update(serialized).digest('hex');
  }

  /**
   * Creates a deterministic payment session.
   */
  async createPayment({
    orderId,
    amount,
    currency = 'IDR',
    channel = 'TEST_ESCROW_VA',
    buyer = {},
    requiresEscrow = true,
    scenario = TEST_PAYMENT_SCENARIOS.PENDING
  }) {
    if (requiresEscrow && !this.isEscrowSupported(channel)) {
      const err = new Error(`Payment channel '${channel}' does not support escrow holding`);
      err.code = 'ESCROW_NOT_SUPPORTED';
      throw err;
    }

    const providerRef = `test-ref-${uuidv4().substring(0, 8)}`;
    const paymentId = `test-pay-${uuidv4().substring(0, 8)}`;

    const session = {
      paymentId,
      providerRef,
      orderId,
      amount: parseInt(amount, 10),
      currency,
      channel,
      scenario,
      status: scenario === TEST_PAYMENT_SCENARIOS.SUCCESS ? 'SETTLED' : (scenario === TEST_PAYMENT_SCENARIOS.FAILED ? 'FAILED' : 'PENDING'),
      buyer,
      createdAt: new Date().toISOString()
    };

    this.payments.set(providerRef, session);

    return {
      success: true,
      paymentId,
      providerRef,
      orderId,
      amount: session.amount,
      channel,
      currency,
      status: session.status,
      scenario,
      paymentUrl: `https://test-gateway.tikum.app/pay/${providerRef}`,
      createdAt: session.createdAt
    };
  }

  /**
   * Generates a deterministic callback webhook payload and HMAC signature for testing.
   */
  generateWebhookPayload(providerRef, scenarioOverride = null) {
    const payment = this.payments.get(providerRef);
    if (!payment) {
      throw new Error(`Test payment '${providerRef}' not found`);
    }

    const scenario = scenarioOverride || payment.scenario;
    let status = 'SETTLED';
    if (scenario === TEST_PAYMENT_SCENARIOS.FAILED) status = 'FAILED';
    if (scenario === TEST_PAYMENT_SCENARIOS.PENDING) status = 'PENDING';
    if (scenario === TEST_PAYMENT_SCENARIOS.REFUND) status = 'REFUNDED';

    const body = {
      order_id: payment.orderId,
      provider_ref: providerRef,
      amount: payment.amount,
      status,
      scenario,
      idempotency_key: `idemp-${providerRef}`,
      timestamp: new Date().toISOString()
    };

    if (scenario === TEST_PAYMENT_SCENARIOS.INVALID_CALLBACK) {
      body.simulate_invalid_signature = true;
    }

    const signature = scenario === TEST_PAYMENT_SCENARIOS.INVALID_CALLBACK
      ? 'invalid-forged-hmac-signature'
      : this.computeSignature(body);

    const headers = {
      'x-test-signature': signature,
      'x-provider': 'test_provider'
    };

    return { headers, body };
  }

  verifyWebhook(headers = {}, body = {}) {
    if (body.simulate_invalid_signature) {
      return false;
    }

    const signature = headers['x-test-signature'] || headers['x-signature'];
    if (!signature) return false;

    const expectedSignature = this.computeSignature(body);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  parseWebhook(body = {}) {
    return {
      orderId: body.order_id,
      providerRef: body.provider_ref,
      amount: body.amount,
      status: body.status, // 'SETTLED', 'FAILED', 'PENDING', 'REFUNDED'
      idempotencyKey: body.idempotency_key || body.provider_ref,
      eventType: body.event_type || (body.status === 'REFUNDED' ? 'REFUND_CONFIRMED' : 'PAYMENT_EVENT'),
      scenario: body.scenario,
      rawPayload: body
    };
  }

  setRefundScenario(scenario) {
    this.refundScenario = scenario;
  }

  generateRefundWebhookPayload(providerRef, { orderId = null, amount = null, status = 'REFUNDED', scenario = null } = {}) {
    const payment = this.payments.get(providerRef);
    const ordId = orderId || payment?.orderId;
    const amt = amount !== null && amount !== undefined ? amount : (payment?.amount || 0);

    const body = {
      order_id: ordId,
      provider_ref: providerRef,
      amount: amt,
      status,
      event_type: 'REFUND_CONFIRMED',
      idempotency_key: `ref-wh-${providerRef}`,
      timestamp: new Date().toISOString()
    };

    if (scenario === TEST_PAYMENT_SCENARIOS.INVALID_CALLBACK) {
      body.simulate_invalid_signature = true;
    }

    const signature = scenario === TEST_PAYMENT_SCENARIOS.INVALID_CALLBACK
      ? 'invalid-forged-hmac-signature'
      : this.computeSignature(body);

    const headers = {
      'x-test-signature': signature,
      'x-provider': 'test_provider'
    };

    return { headers, body };
  }

  async requestRefund({ orderId, providerRef, amount, reason, scenario = null, idempotencyKey = null }) {
    const activeScenario = scenario || this.refundScenario || 'CONFIRMED';

    if (activeScenario === 'TIMEOUT' || activeScenario === 'REFUND_TIMEOUT') {
      const err = new Error('Gateway request timed out');
      err.code = 'ETIMEDOUT';
      throw err;
    }

    if (activeScenario === 'FAILED' || activeScenario === 'REFUND_FAILED') {
      return {
        success: false,
        refundId: `test-ref-refund-${Date.now()}`,
        orderId,
        providerRef,
        amount: parseInt(amount, 10),
        reason,
        status: 'FAILED',
        message: 'Refund rejected by destination rail'
      };
    }

    if (activeScenario === 'PENDING' || activeScenario === 'REFUND_PENDING') {
      return {
        success: true,
        refundId: `test-ref-refund-${Date.now()}`,
        orderId,
        providerRef,
        amount: parseInt(amount, 10),
        reason,
        status: 'PENDING',
        message: 'Refund request accepted, pending provider confirmation'
      };
    }

    return {
      success: true,
      refundId: `test-ref-refund-${Date.now()}`,
      orderId,
      providerRef,
      amount: parseInt(amount, 10),
      reason,
      status: 'CONFIRMED',
      simulated: true
    };
  }

  async refund(params) {
    return this.requestRefund(params);
  }
}

module.exports = {
  DeterministicTestProvider,
  TEST_PAYMENT_SCENARIOS
};

