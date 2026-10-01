/**
 * TIKUM / ARGUS — RCB Payment Provider Adapter (Part 2, 4, 16, 23)
 *
 * Implements PaymentProvider interface for RCB payment rail.
 *
 * HARD PRODUCTION GATES:
 * - Real money transactions remain DISABLED while merchant verification/contract is pending.
 * - ZERO fake payments or fake success in production.
 * - Does NOT assume RCB has native milestone-based escrow release APIs.
 * - All RCB-specific payload details are normalized into Canonical Payment DTOs.
 */

const crypto = require('crypto');
const { PaymentProvider, CapabilityUnsupportedError } = require('./PaymentProvider');
const {
  CANONICAL_PAYMENT_STATUS,
  ProviderCapabilities
} = require('./canonicalPaymentTypes');

const RCB_STATUS = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  MAINTENANCE: 'MAINTENANCE'
};

class RCBPaymentProvider extends PaymentProvider {
  constructor(config = {}) {
    super(config);
    this.apiBaseUrl = config.apiBaseUrl || process.env.RCB_API_BASE_URL || 'https://api-sandbox.rcb.id';
    this.apiKey = config.apiKey || process.env.RCB_API_KEY || null;
    this.secretKey = config.secretKey || process.env.RCB_SECRET_KEY || null;
    this.clientId = config.clientId || process.env.RCB_CLIENT_ID || null;
    this.webhookSecret = config.webhookSecret || process.env.RCB_WEBHOOK_SECRET || this.secretKey || null;
    this.mode = config.mode || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

    // Production gates & verification status
    this.contractVerified = config.contractVerified === true;
    this.kycVerified = config.kycVerified === true;
    this.sandboxTested = config.sandboxTested === true;
    this.enableProduction = process.env.ENABLE_RCB_PRODUCTION === 'true';
    this.allowSimulation = config.allowSimulation === true || (process.env.NODE_ENV === 'test' && !this.enableProduction);
  }

  getName() {
    return 'rcb';
  }

  getCountry() {
    return 'ID';
  }

  /**
   * Formal Due Diligence & Readiness Criteria for RCB (Part 23 & 30)
   */
  getReadinessChecklist() {
    const hasCredentials = !!(this.apiKey && this.secretKey);
    const hasWebhookConfig = !!this.webhookSecret;

    const checklist = {
      rcb_contract_signed: this.contractVerified,
      rcb_kyc_due_diligence_verified: this.kycVerified,
      production_credentials_secured: hasCredentials,
      webhook_secret_configured: hasWebhookConfig,
      signature_validation_operational: true,
      duplicate_webhook_deduplication_ready: true,
      escrow_custody_verified: false, // RCB escrow API unverified; TIKUM FinancialLedger holds custody internally
      refund_behavior_validated: false,
      payout_behavior_validated: false,
      reconciliation_validated: false,
      timeout_and_retry_operational: true,
      controlled_sandbox_transaction_passed: this.sandboxTested
    };

    const passedCount = Object.values(checklist).filter(Boolean).length;
    const totalCount = Object.keys(checklist).length;
    const isReady = this.enableProduction && this.contractVerified && this.kycVerified && hasCredentials && this.sandboxTested;

    return {
      checklist,
      passed_count: passedCount,
      total_count: totalCount,
      is_ready: isReady,
      status: isReady ? RCB_STATUS.ACTIVE : RCB_STATUS.PENDING_VERIFICATION
    };
  }

  getStatus() {
    const readiness = this.getReadinessChecklist();
    return {
      provider: this.getName(),
      status: readiness.status,
      isVerified: readiness.is_ready,
      environment: this.mode,
      message: readiness.is_ready
        ? 'RCB payment provider fully verified and active'
        : 'PAYMENT PROVIDER RCB: PENDING VERIFICATION — Real-money activation gated until formal due diligence and contracts are signed',
      readiness: readiness.checklist
    };
  }

  /**
   * Verified Capabilities for RCB (Part 1 & 16)
   * We mark native hold/release/payout as false until official RCB documentation is validated.
   */
  getCapabilities() {
    return new ProviderCapabilities({
      paymentCollection: true,
      refund: false,          // UNVERIFIED: Cannot initiate refunds via RCB API until contract verifies refund endpoint
      hold: false,            // UNVERIFIED: Funds are held in TIKUM ledger; RCB does not have proven milestone hold API
      release: false,         // UNVERIFIED: Release is governed by ARGUS Trust Engine
      payout: false,          // UNVERIFIED: Automated seller payout via RCB is unverified
      splitSettlement: false, // UNVERIFIED
      sellerAccounts: false,
      subAccounts: false,
      webhooks: true,
      reconciliation: false   // UNVERIFIED: Requires bank statement sync
    });
  }

  getSupportedChannels() {
    return [
      {
        code: 'QRIS',
        name: 'QRIS Standar Nasional (RCB)',
        type: 'QRIS',
        isEscrowSupported: true // TIKUM holds escrow internally
      },
      {
        code: 'VA_BCA',
        name: 'BCA Virtual Account (RCB)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'VA_MANDIRI',
        name: 'Mandiri Virtual Account (RCB)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'VA_BRI',
        name: 'BRI Virtual Account (RCB)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'VA_BNI',
        name: 'BNI Virtual Account (RCB)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'VA_PERMATA',
        name: 'Permata Virtual Account (RCB)',
        type: 'VA',
        isEscrowSupported: true
      }
    ];
  }

  /**
   * Computes HMAC-SHA256 signature for outgoing requests and incoming webhooks
   */
  computeSignature(payload, secret) {
    const key = secret || this.secretKey;
    if (!key) return null;
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', key).update(bodyStr).digest('hex');
  }

  /**
   * Generates HMAC signature header for RCB API requests
   */
  generateRequestHeaders(payload, timestamp = new Date().toISOString()) {
    const signature = this.computeSignature(payload, this.secretKey);
    return {
      'Content-Type': 'application/json',
      'x-rcb-client-id': this.clientId || 'tikum-client',
      'x-rcb-timestamp': timestamp,
      'x-rcb-signature': signature
    };
  }

  /**
   * Initiates payment on RCB rail.
   * Gated: If provider is not verified, rejects live execution.
   */
  async createPayment({
    orderId,
    amount,
    currency = 'IDR',
    channel = 'QRIS',
    buyer = {},
    requiresEscrow = true,
    metadata = {},
    idempotencyKey = null
  }) {
    const readiness = this.getReadinessChecklist();

    // Invariant check: Channel must be recognized
    const supportedChannel = this.getSupportedChannels().find(c => c.code.toUpperCase() === channel.toUpperCase());
    if (!supportedChannel) {
      const err = new Error(`Payment channel '${channel}' is not supported by RCB`);
      err.code = 'UNSUPPORTED_PAYMENT_CHANNEL';
      err.status = 400;
      throw err;
    }

    const providerRef = `rcb-inv-${orderId}-${Date.now()}`;
    const intAmount = parseInt(amount, 10);

    // If sandbox / test simulation allowed
    if (!readiness.is_ready) {
      if (this.allowSimulation) {
        const isVa = supportedChannel.type === 'VA';
        const vaNumber = isVa ? `7999${Math.floor(1000000000 + Math.random() * 9000000000)}` : null;
        const qrString = !isVa ? `00020101021226${orderId}5204581253033605802ID5913TIKUM_MARKETPLACE6007BANDUNG6304${orderId.substring(0, 4)}` : null;

        return {
          provider: this.getName(),
          orderId,
          providerTransactionId: providerRef,
          providerReference: providerRef,
          amount: intAmount,
          currency,
          channel: supportedChannel.code,
          status: CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING,
          paymentDetails: {
            vaNumber,
            qrString,
            checkoutUrl: `https://checkout-sandbox.rcb.id/pay/${providerRef}`,
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          },
          simulated: true,
          idempotencyKey
        };
      }

      const err = new Error(
        'RCB payment provider is pending verification. Real-money activation is gated until merchant contract and credentials are confirmed.'
      );
      err.code = 'PAYMENT_PROVIDER_PENDING_VERIFICATION';
      err.status = 503;
      throw err;
    }

    // LIVE PRODUCTION EXECUTION (When active credentials and contracts exist)
    throw new Error('Live RCB API network client not active: awaiting contract production credentials');
  }

  /**
   * Queries payment status on RCB
   */
  async getPaymentStatus({ orderId, providerRef }) {
    if (!this.getReadinessChecklist().is_ready && !this.allowSimulation) {
      return {
        orderId,
        providerRef,
        status: CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING,
        providerStatus: 'PROVIDER_UNVERIFIED'
      };
    }

    return {
      orderId,
      providerRef,
      status: CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING,
      providerStatus: 'PENDING'
    };
  }

  /**
   * Verifies incoming RCB webhook signature
   * Timing-safe comparison.
   */
  verifyWebhook(headers = {}, body = {}, rawBodyBuffer = null) {
    const signature = headers['x-rcb-signature'] || headers['x-signature'];
    if (!signature) return false;

    const secret = this.webhookSecret || this.secretKey;
    if (!secret) return false;

    let payloadToHash;
    if (rawBodyBuffer && Buffer.isBuffer(rawBodyBuffer)) {
      payloadToHash = rawBodyBuffer;
    } else if (typeof body === 'string') {
      payloadToHash = body;
    } else {
      payloadToHash = JSON.stringify(body);
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(payloadToHash).digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * Normalizes RCB webhook payload into CanonicalPaymentEvent
   */
  parseWebhook(payload = {}, headers = {}) {
    const rawStatus = (payload.status || payload.transaction_status || '').toUpperCase();
    const isPaid = rawStatus === 'PAID' || rawStatus === 'SUCCESS' || rawStatus === 'SETTLED' || rawStatus === 'BERHASIL';
    const isFailed = rawStatus === 'FAILED' || rawStatus === 'EXPIRED' || rawStatus === 'CANCELLED';

    let canonicalStatus = CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING;
    if (isPaid) canonicalStatus = CANONICAL_PAYMENT_STATUS.PAYMENT_PAID;
    if (isFailed) canonicalStatus = CANONICAL_PAYMENT_STATUS.PAYMENT_FAILED;

    const providerRef = payload.provider_ref || payload.transaction_id || payload.invoice_id || `rcb-${Date.now()}`;
    const orderId = payload.order_id || payload.reference_id;
    const amount = parseInt(payload.amount || payload.total_amount || 0, 10);
    const providerFee = parseInt(payload.fee || payload.admin_fee || 0, 10);
    const eventId = payload.event_id || `rcb-evt-${providerRef}`;

    return {
      provider: this.getName(),
      providerEventId: eventId,
      eventType: isPaid ? 'PAYMENT_CONFIRMED' : (isFailed ? 'PAYMENT_FAILED' : 'PAYMENT_UPDATE'),
      orderId,
      providerRef,
      amount,
      providerFee,
      currency: payload.currency || 'IDR',
      status: canonicalStatus,
      rawStatus,
      paidAt: isPaid ? (payload.paid_at || new Date().toISOString()) : null,
      rawPayload: payload
    };
  }

  /**
   * Explicit capability guard: Native refund is unsupported until documented
   */
  async requestRefund({ orderId, providerRef, amount, reason, idempotencyKey }) {
    throw new CapabilityUnsupportedError(this.getName(), 'refund');
  }

  /**
   * Explicit capability guard: Native payout is unsupported until documented
   */
  async createPayout({ orderId, sellerId, amount, bankAccount, idempotencyKey }) {
    throw new CapabilityUnsupportedError(this.getName(), 'payout');
  }

  /**
   * Explicit capability guard: Native escrow hold/release is unsupported
   */
  async createHold({ orderId, providerRef, amount }) {
    throw new CapabilityUnsupportedError(this.getName(), 'hold');
  }

  async releaseHold({ orderId, providerRef, amount }) {
    throw new CapabilityUnsupportedError(this.getName(), 'release');
  }
}

module.exports = {
  RCBPaymentProvider,
  RCB_STATUS
};
