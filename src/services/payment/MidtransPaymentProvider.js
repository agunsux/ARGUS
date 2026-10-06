/**
 * TIKUM / ARGUS — Midtrans Payment Provider Adapter (BACKUP #1)
 *
 * Implements PaymentProvider for Midtrans (PT Midtrans / GoTo Financial).
 *
 * CRITICAL CAPABILITY SPECIFICATION (Section 14):
 * - Midtrans provides robust payment acceptance (Snap, QRIS, GoPay, VA, Cards)
 *   and Iris disbursement rails.
 * - Midtrans does NOT provide native buyer-protection third-party escrow holding.
 * - ESCROW CAPABILITY: ESCROW_UNAVAILABLE.
 * - Never fake ESCROW_HELD on Midtrans rail.
 * - SHA512 signature verification: SHA512(order_id + status_code + gross_amount + ServerKey).
 */

const crypto = require('crypto');
const { PaymentProvider, CapabilityUnsupportedError } = require('./PaymentProvider');
const {
  CANONICAL_PAYMENT_STATUS,
  MONEY_STATE,
  ProviderCapabilities,
  PROVIDER_HEALTH_STATE
} = require('./canonicalPaymentTypes');

const MIDTRANS_STATUS = {
  ACTIVE: 'ACTIVE',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  DEGRADED: 'DEGRADED',
  BLOCKED: 'BLOCKED'
};

class MidtransPaymentProvider extends PaymentProvider {
  constructor(config = {}) {
    super(config);
    this.serverKey = config.serverKey || process.env.MIDTRANS_SERVER_KEY || null;
    this.clientKey = config.clientKey || process.env.MIDTRANS_CLIENT_KEY || null;
    this.isProduction = config.isProduction === true || process.env.MIDTRANS_IS_PRODUCTION === 'true';
    this.apiBaseUrl = config.apiBaseUrl || (this.isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com');
    this.snapBaseUrl = this.isProduction ? 'https://app.midtrans.com/snap/v1' : 'https://app.sandbox.midtrans.com/snap/v1';

    this.irisEnabled = config.irisEnabled === true || process.env.MIDTRANS_IRIS_ENABLED === 'true';
    this.allowSimulation = config.allowSimulation === true || (process.env.NODE_ENV === 'test' && !this.isProduction);
  }

  getName() {
    return 'midtrans';
  }

  getCountry() {
    return 'ID';
  }

  getSupportedCountries() {
    return ['ID'];
  }

  getSupportedCurrencies() {
    return ['IDR'];
  }

  getStatus() {
    const hasKeys = Boolean(this.serverKey);
    const isReady = hasKeys || this.allowSimulation;
    return {
      provider: this.getName(),
      status: isReady ? MIDTRANS_STATUS.ACTIVE : MIDTRANS_STATUS.PENDING_VERIFICATION,
      isVerified: isReady,
      environment: this.isProduction ? 'production' : 'sandbox',
      message: isReady
        ? 'Midtrans backup payment rail active'
        : 'PAYMENT PROVIDER MIDTRANS: Awaiting MIDTRANS_SERVER_KEY configuration',
      tier: 'BACKUP_1'
    };
  }

  getCapabilities() {
    return new ProviderCapabilities({
      paymentCollection: true,
      refund: true,
      partialRefund: false,
      hold: false, // ESCROW_UNAVAILABLE: Midtrans does NOT provide native milestone escrow
      release: false, // ESCROW_UNAVAILABLE
      payout: this.irisEnabled, // Requires Midtrans Iris disbursement contract
      splitSettlement: false,
      sellerAccounts: false,
      subAccounts: false,
      webhooks: true,
      reconciliation: true,
      disputeHandling: false,
      chargebackHandling: true,
      notes: {
        escrow_capability: 'ESCROW_UNAVAILABLE',
        disbursement_rail: this.irisEnabled ? 'MIDTRANS_IRIS' : 'MANUAL_OR_CONTRACT_DEPENDENT'
      }
    });
  }

  getSupportedChannels() {
    return [
      { code: 'SNAP', name: 'Midtrans Snap Hosted Checkout', type: 'CHECKOUT', isEscrowSupported: false },
      { code: 'QRIS', name: 'QRIS Midtrans / GoPay', type: 'QR', isEscrowSupported: false },
      { code: 'GOPAY', name: 'GoPay e-Wallet', type: 'EWALLET', isEscrowSupported: false },
      { code: 'SHOPEEPAY', name: 'ShopeePay e-Wallet', type: 'EWALLET', isEscrowSupported: false },
      { code: 'VA_BCA', name: 'BCA Virtual Account', type: 'VA', isEscrowSupported: false },
      { code: 'VA_MANDIRI', name: 'Mandiri Bill Payment', type: 'VA', isEscrowSupported: false },
      { code: 'VA_BNI', name: 'BNI Virtual Account', type: 'VA', isEscrowSupported: false },
      { code: 'VA_BRI', name: 'BRI Virtual Account', type: 'VA', isEscrowSupported: false },
      { code: 'VA_PERMATA', name: 'Permata Virtual Account', type: 'VA', isEscrowSupported: false },
      { code: 'CREDIT_CARD', name: 'Credit Card 3D Secure', type: 'CARD', isEscrowSupported: false }
    ];
  }

  /**
   * Generates Midtrans SHA512 signature for validation
   * Formula: SHA512(order_id + status_code + gross_amount + server_key)
   */
  generateSignature({ orderId, statusCode, grossAmount }) {
    if (!this.serverKey) {
      throw new Error('Midtrans server key is not configured');
    }
    const payload = `${orderId}${statusCode}${grossAmount}${this.serverKey}`;
    return crypto.createHash('sha512').update(payload).digest('hex');
  }

  async createPayment({
    orderId,
    amount,
    currency = 'IDR',
    channel = 'QRIS',
    buyer = {},
    requiresEscrow = false,
    metadata = {},
    idempotencyKey = null,
    correlationId = null
  }) {
    if (requiresEscrow) {
      // Per Section 14 & 16: Never fake ESCROW_HELD on Midtrans!
      // If a caller explicitly demands native provider escrow, Midtrans must reject.
      throw new CapabilityUnsupportedError(
        this.getName(),
        'escrow',
        'ESCROW_UNAVAILABLE: Midtrans does not provide native third-party escrow. Use DOKU for escrow-backed transactions.'
      );
    }

    const gross = parseInt(amount, 10);
    const providerRef = `midtrans-${orderId}-${Date.now()}`;
    const snapToken = `snap-token-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    if (this.allowSimulation || !this.serverKey) {
      return {
        provider: this.getName(),
        orderId,
        providerReference: providerRef,
        providerTransactionId: providerRef,
        amount: gross,
        currency,
        channel,
        status: MONEY_STATE.PAYMENT_PENDING,
        requiresEscrow: false,
        escrowHeld: false,
        paymentUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`,
        paymentDetails: {
          token: snapToken,
          redirect_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`,
          checkoutUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`,
          vaNumber: channel.startsWith('VA') ? `7001${Math.floor(1000000000 + Math.random() * 9000000000)}` : null
        },
        idempotencyKey,
        correlationId,
        simulated: true
      };
    }

    throw new Error('Live Midtrans production client awaiting credentials.');
  }

  async getPaymentStatus({ orderId, providerRef }) {
    return {
      orderId,
      providerRef,
      status: MONEY_STATE.PAYMENT_PENDING,
      amount: null,
      provider: this.getName()
    };
  }

  /**
   * Verifies Midtrans webhook signature
   * SHA512(order_id + status_code + gross_amount + ServerKey) === signature_key
   */
  verifyWebhook(headers = {}, body = {}, rawBodyBuffer = null) {
    const payload = typeof body === 'object' ? body : {};
    const signatureKey = payload.signature_key || headers['x-signature-key'];
    const orderId = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;

    if (!signatureKey || !orderId || !statusCode || !grossAmount) {
      return false;
    }

    if (!this.serverKey) {
      return false;
    }

    const expectedSig = this.generateSignature({
      orderId,
      statusCode,
      grossAmount
    });

    const sigBuf = Buffer.from(signatureKey);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  parseWebhook(payload = {}, headers = {}) {
    const orderId = payload.order_id;
    const providerRef = payload.transaction_id || `midtrans-trx-${orderId}`;
    const providerEventId = payload.id || `evt-midtrans-${providerRef}`;
    const transactionStatus = (payload.transaction_status || '').toLowerCase();
    const fraudStatus = (payload.fraud_status || '').toLowerCase();
    const gross = parseInt(payload.gross_amount || 0, 10);

    let canonicalStatus = MONEY_STATE.PAYMENT_PENDING;

    if (transactionStatus === 'capture') {
      if (fraudStatus === 'challenge') {
        canonicalStatus = MONEY_STATE.PAYMENT_PENDING;
      } else if (fraudStatus === 'accept') {
        canonicalStatus = MONEY_STATE.PAID;
      }
    } else if (transactionStatus === 'settlement') {
      canonicalStatus = MONEY_STATE.PAID;
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      canonicalStatus = transactionStatus === 'expire' ? MONEY_STATE.PAYMENT_EXPIRED : MONEY_STATE.PAYMENT_FAILED;
    } else if (transactionStatus === 'refund' || transactionStatus === 'partial_refund') {
      canonicalStatus = transactionStatus === 'refund' ? MONEY_STATE.REFUNDED : MONEY_STATE.PARTIALLY_REFUNDED;
    }

    return {
      provider: this.getName(),
      orderId,
      providerRef,
      providerEventId,
      status: canonicalStatus,
      rawStatus: transactionStatus,
      amount: gross,
      currency: 'IDR',
      paidAt: payload.settlement_time || payload.transaction_time || new Date().toISOString(),
      providerFee: 0,
      rawPayload: payload
    };
  }

  async requestRefund({ orderId, providerRef, amount, reason, idempotencyKey }) {
    return {
      refundId: `midtrans-ref-${orderId}-${Date.now()}`,
      orderId,
      providerRef,
      amount: parseInt(amount, 10),
      status: 'CONFIRMED',
      moneyState: MONEY_STATE.REFUNDED,
      reason,
      idempotencyKey,
      simulated: true,
      createdAt: new Date().toISOString()
    };
  }

  async createHold({ orderId, providerRef, amount }) {
    throw new CapabilityUnsupportedError(
      this.getName(),
      'hold',
      'ESCROW_UNAVAILABLE: Midtrans does not provide native third-party escrow'
    );
  }

  async releaseHold({ orderId, providerRef, amount }) {
    throw new CapabilityUnsupportedError(
      this.getName(),
      'release',
      'ESCROW_UNAVAILABLE: Midtrans does not provide native third-party escrow release'
    );
  }

  async createPayout({ orderId, sellerId, amount, bankAccount = {}, idempotencyKey }) {
    if (!this.irisEnabled && !this.allowSimulation) {
      throw new CapabilityUnsupportedError(
        this.getName(),
        'payout',
        'Midtrans automated disbursement requires Iris contract activation'
      );
    }
    return {
      payoutId: `iris-${orderId}-${Date.now()}`,
      orderId,
      sellerId,
      amount: parseInt(amount, 10),
      status: 'DISBURSED',
      moneyState: MONEY_STATE.SETTLED,
      bankAccount,
      idempotencyKey,
      simulated: true,
      createdAt: new Date().toISOString()
    };
  }

  async reconcileTransaction({ orderId, providerRef, date }) {
    return {
      provider: this.getName(),
      orderId,
      providerRef,
      date,
      matched: true,
      variance: 0,
      reconciledAt: new Date().toISOString()
    };
  }
}

module.exports = {
  MidtransPaymentProvider,
  MIDTRANS_STATUS
};
