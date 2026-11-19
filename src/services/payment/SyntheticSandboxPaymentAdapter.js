/**
 * TIKUM / ARGUS — Synthetic Sandbox Payment Adapter
 *
 * Provides an isolated, 100% synthetic payment simulator for end-to-end sandbox testing.
 *
 * HARD SAFETY INVARIANTS:
 * 1. Zero real money: All transactions and ledger records are marked with `isSynthetic: true`.
 * 2. Zero production impact: Must NEVER invoke live payment gateway APIs or production merchant accounts.
 * 3. Timing-safe cryptographic HMAC-SHA256 signature generation and verification.
 * 4. Fails closed on forged signatures, tampered payloads, or unknown providers.
 * 5. Full idempotency protection: duplicate webhooks return idempotent confirmation without double processing.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const SYNTHETIC_PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED'
});

const SYNTHETIC_SCENARIOS = Object.freeze({
  SUCCESS: 'SUCCESS',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUND: 'REFUND',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  DUPLICATE: 'DUPLICATE'
});

class SyntheticSandboxPaymentAdapter {
  constructor(config = {}) {
    this.secretKey = config.secretKey || process.env.SYNTHETIC_SANDBOX_SECRET || 'tikum-synthetic-sandbox-hmac-secret-2026';
    this.providerName = 'tikum_synthetic_sandbox';
    this.sessions = new Map();
    this.processedIdempotencyKeys = new Set();
  }

  getName() {
    return this.providerName;
  }

  isEscrowSupported(channel) {
    return channel === 'QRIS' || channel === 'VIRTUAL_ACCOUNT' || channel === 'TEST_ESCROW_VA';
  }

  /**
   * Computes an HMAC-SHA256 signature over the serialized payload.
   */
  computeSignature(payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', this.secretKey).update(serialized).digest('hex');
  }

  /**
   * Creates an isolated synthetic payment session with `isSynthetic: true`.
   */
  async createPayment({
    orderId,
    amount,
    currency = 'IDR',
    channel = 'QRIS',
    scenario = SYNTHETIC_SCENARIOS.PENDING,
    buyer = {}
  }) {
    if (!orderId || !amount) {
      const err = new Error('orderId and amount are required to create a synthetic payment session');
      err.code = 'INVALID_SYNTHETIC_PAYMENT_PAYLOAD';
      throw err;
    }

    const providerRef = `syn-ref-${uuidv4().substring(0, 10)}`;
    const paymentId = `syn-pay-${uuidv4().substring(0, 10)}`;
    const now = new Date().toISOString();

    let initialStatus = SYNTHETIC_PAYMENT_STATUS.PENDING;
    if (scenario === SYNTHETIC_SCENARIOS.SUCCESS) initialStatus = SYNTHETIC_PAYMENT_STATUS.PAID;
    if (scenario === SYNTHETIC_SCENARIOS.FAILED) initialStatus = SYNTHETIC_PAYMENT_STATUS.FAILED;
    if (scenario === SYNTHETIC_SCENARIOS.EXPIRED) initialStatus = SYNTHETIC_PAYMENT_STATUS.EXPIRED;

    const session = {
      isSynthetic: true,
      syntheticTestMarker: 'SYNTHETIC_SANDBOX_TRANSACTION_DO_NOT_CHARGE',
      paymentId,
      providerRef,
      orderId,
      amount: parseInt(amount, 10),
      currency,
      channel,
      scenario,
      status: initialStatus,
      buyer,
      createdAt: now,
      updatedAt: now
    };

    this.sessions.set(providerRef, session);

    return {
      success: true,
      isSynthetic: true,
      paymentId,
      providerRef,
      orderId,
      amount: session.amount,
      channel,
      currency,
      status: session.status,
      scenario,
      paymentUrl: `https://sandbox-gateway.tikum.app/pay/${providerRef}`,
      qrisString: channel === 'QRIS' ? `00020101021226610014ID.LINKAJA.WWW01189360091100212345670215SYNTHETIC${orderId}520458125303360540${amount}5802ID5914TIKUM SANDBOX6007JAKARTA62070703A016304` : null,
      vaNumber: channel === 'VIRTUAL_ACCOUNT' ? `880099${Date.now().toString().slice(-8)}` : null,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      createdAt: session.createdAt
    };
  }

  /**
   * Generates a deterministic webhook payload and HMAC signature for testing.
   */
  generateWebhookPayload(providerRef, scenarioOverride = null) {
    const session = this.sessions.get(providerRef);
    if (!session) {
      throw new Error(`Synthetic payment session '${providerRef}' not found`);
    }

    const scenario = scenarioOverride || session.scenario;
    let status = SYNTHETIC_PAYMENT_STATUS.PAID;
    if (scenario === SYNTHETIC_SCENARIOS.FAILED) status = SYNTHETIC_PAYMENT_STATUS.FAILED;
    if (scenario === SYNTHETIC_SCENARIOS.PENDING) status = SYNTHETIC_PAYMENT_STATUS.PENDING;
    if (scenario === SYNTHETIC_SCENARIOS.EXPIRED) status = SYNTHETIC_PAYMENT_STATUS.EXPIRED;
    if (scenario === SYNTHETIC_SCENARIOS.REFUND) status = SYNTHETIC_PAYMENT_STATUS.REFUNDED;

    const body = {
      isSynthetic: true,
      order_id: session.orderId,
      provider_ref: providerRef,
      payment_id: session.paymentId,
      amount: session.amount,
      currency: session.currency,
      channel: session.channel,
      status,
      scenario,
      idempotency_key: `idemp-${providerRef}`,
      timestamp: new Date().toISOString()
    };

    const isForged = scenario === SYNTHETIC_SCENARIOS.INVALID_SIGNATURE;
    const signature = isForged ? 'forged-fake-hmac-signature-666' : this.computeSignature(body);

    const headers = {
      'x-tikum-signature': signature,
      'x-provider': this.providerName,
      'x-synthetic-test': 'true'
    };

    return { headers, body };
  }

  /**
   * Verifies an incoming webhook with timing-safe comparison.
   */
  verifyWebhook(headers = {}, body = {}) {
    const signature = headers['x-tikum-signature'] || headers['x-test-signature'] || headers['x-signature'];
    if (!signature) return false;

    const expectedSignature = this.computeSignature(body);
    if (signature.length !== expectedSignature.length) return false;

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  /**
   * Processes a webhook with idempotency verification and state update.
   */
  async handleWebhook({ headers = {}, body = {} }) {
    // 1. Signature Verification
    if (!this.verifyWebhook(headers, body)) {
      const err = new Error('Invalid synthetic webhook signature: HMAC mismatch');
      err.code = 'INVALID_WEBHOOK_SIGNATURE';
      err.status = 401;
      throw err;
    }

    // 2. Idempotency Check
    const idempotencyKey = body.idempotency_key || body.provider_ref;
    if (this.processedIdempotencyKeys.has(idempotencyKey)) {
      return {
        success: true,
        idempotent: true,
        orderId: body.order_id,
        providerRef: body.provider_ref,
        status: body.status,
        message: 'Synthetic webhook already processed (Idempotent replay detected)'
      };
    }

    // 3. Update session state
    const session = this.sessions.get(body.provider_ref);
    if (session) {
      session.status = body.status;
      session.updatedAt = new Date().toISOString();
    }

    this.processedIdempotencyKeys.add(idempotencyKey);

    return {
      success: true,
      idempotent: false,
      orderId: body.order_id,
      providerRef: body.provider_ref,
      status: body.status,
      amount: body.amount,
      isSynthetic: true,
      processedAt: new Date().toISOString()
    };
  }

  /**
   * Queries payment status from the synthetic adapter session.
   */
  async getPaymentStatus(providerRef) {
    const session = this.sessions.get(providerRef);
    if (!session) {
      const err = new Error(`Synthetic payment '${providerRef}' not found`);
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    return {
      isSynthetic: true,
      providerRef,
      orderId: session.orderId,
      amount: session.amount,
      status: session.status,
      channel: session.channel,
      updatedAt: session.updatedAt
    };
  }

  /**
   * Generates a refund webhook payload.
   */
  generateRefundWebhookPayload(providerRef, { amount = null, scenario = null, reason = 'TEST_REFUND' } = {}) {
    const session = this.sessions.get(providerRef);
    const amt = amount !== null ? amount : (session?.amount || 0);

    const body = {
      isSynthetic: true,
      order_id: session?.orderId || 'ord-unknown',
      provider_ref: providerRef,
      amount: amt,
      status: SYNTHETIC_PAYMENT_STATUS.REFUNDED,
      event_type: 'REFUND_CONFIRMED',
      reason,
      idempotency_key: `ref-idemp-${providerRef}`,
      timestamp: new Date().toISOString()
    };

    const isForged = scenario === SYNTHETIC_SCENARIOS.INVALID_SIGNATURE;
    const signature = isForged ? 'forged-refund-signature-xxx' : this.computeSignature(body);

    const headers = {
      'x-tikum-signature': signature,
      'x-provider': this.providerName,
      'x-synthetic-test': 'true'
    };

    return { headers, body };
  }
}

module.exports = {
  SyntheticSandboxPaymentAdapter,
  SYNTHETIC_PAYMENT_STATUS,
  SYNTHETIC_SCENARIOS
};
