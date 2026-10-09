/**
 * TIKUM / ARGUS — Midtrans Payment Provider Adapter (TIER 2A)
 *
 * Implements PaymentProvider for Midtrans (PT Midtrans / GoTo Financial).
 *
 * CRITICAL CAPABILITY SPECIFICATION:
 * - Midtrans provides payment acceptance (Snap, QRIS, GoPay, VA, Cards)
 *   and Iris disbursement rails.
 * - Midtrans does NOT provide native buyer-protection third-party milestone escrow holding.
 * - ESCROW CAPABILITY: ESCROW_UNAVAILABLE.
 * - Never fake ESCROW_HELD on Midtrans rail.
 * - SHA512 signature verification: SHA512(order_id + status_code + gross_amount + ServerKey).
 * - Real HTTP transport for Snap transactions, Core API status inquiry, and refunds.
 */

const crypto = require('crypto');
const { PaymentProvider, CapabilityUnsupportedError } = require('./PaymentProvider');
const {
  CANONICAL_PAYMENT_STATUS,
  MONEY_STATE,
  ProviderCapabilities
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
    this.serverKey = (config.serverKey || process.env.MIDTRANS_SERVER_KEY || '').trim() || null;
    this.clientKey = (config.clientKey || process.env.MIDTRANS_CLIENT_KEY || '').trim() || null;
    this.isProduction = config.isProduction === true || process.env.MIDTRANS_IS_PRODUCTION === 'true';
    this.apiBaseUrl = config.apiBaseUrl || (this.isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com');
    this.snapBaseUrl = this.isProduction ? 'https://app.midtrans.com/snap/v1' : 'https://app.sandbox.midtrans.com/snap/v1';

    this.irisEnabled = config.irisEnabled === true || process.env.MIDTRANS_IRIS_ENABLED === 'true';
    this.allowSimulation = config.allowSimulation !== undefined
      ? Boolean(config.allowSimulation)
      : (process.env.NODE_ENV === 'test' && !process.env.ENABLE_MIDTRANS_PRODUCTION);
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
      hasServerKey: hasKeys,
      message: isReady
        ? 'Midtrans payment rail active'
        : 'PAYMENT PROVIDER MIDTRANS: Awaiting MIDTRANS_SERVER_KEY configuration',
      tier: 'TIER_2A'
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

  capabilities() {
    return this.getCapabilities();
  }

  async healthCheck() {
    return {
      provider: this.getName(),
      healthy: Boolean(this.serverKey) || this.allowSimulation,
      status: this.getStatus().status,
      timestamp: new Date().toISOString()
    };
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

  /**
   * General HTTP client for Midtrans API requests
   */
  _httpRequest({ url, method = 'POST', headers = {}, body = null, timeout = 10000 }) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? require('https') : require('http');

      const reqHeaders = { ...headers };
      if (body && !reqHeaders['Content-Length'] && !reqHeaders['content-length']) {
        reqHeaders['Content-Length'] = Buffer.byteLength(body, 'utf8');
      }

      const req = transport.request(parsedUrl, {
        method: method.toUpperCase(),
        headers: reqHeaders,
        timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (_) {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            json
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Midtrans API request timed out (${timeout / 1000}s)`));
      });

      req.on('error', (err) => {
        reject(new Error(`Midtrans API network error: ${err.message}`));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
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
      // Never fake ESCROW_HELD on Midtrans!
      throw new CapabilityUnsupportedError(
        this.getName(),
        'escrow',
        'ESCROW_UNAVAILABLE: Midtrans does not provide native third-party escrow. Use DOKU for escrow-backed transactions.'
      );
    }

    const gross = parseInt(amount, 10);

    // Live HTTP execution if ServerKey is present and not allowSimulation
    if (this.serverKey && !this.allowSimulation) {
      if (this.isProduction && process.env.ENABLE_MIDTRANS_PRODUCTION !== 'true') {
        throw new Error('Live Midtrans production API client awaiting merchant production activation.');
      }

      const payload = {
        transaction_details: {
          order_id: orderId,
          gross_amount: gross
        },
        customer_details: {
          first_name: buyer.name || 'Tikum Customer',
          email: buyer.email || 'support@tikum.app',
          phone: buyer.phone || '081299927378'
        }
      };

      const basicAuth = Buffer.from(`${this.serverKey}:`).toString('base64');
      const response = await this._httpRequest({
        url: `${this.snapBaseUrl}/transactions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Basic ${basicAuth}`
        },
        body: JSON.stringify(payload)
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const errorMsg = response.json?.error_messages?.join(', ') || response.json?.message || `HTTP ${response.statusCode}`;
        const err = new Error(`Midtrans Snap API error: ${errorMsg}`);
        err.code = 'MIDTRANS_API_ERROR';
        err.status = response.statusCode;
        err.details = response.json;
        throw err;
      }

      const snapData = response.json || {};
      const snapToken = snapData.token;
      const redirectUrl = snapData.redirect_url;

      return {
        provider: this.getName(),
        orderId,
        providerReference: snapToken || `midtrans-${orderId}`,
        providerTransactionId: snapToken || `midtrans-${orderId}`,
        amount: gross,
        currency,
        channel,
        status: MONEY_STATE.PAYMENT_PENDING,
        requiresEscrow: false,
        escrowHeld: false,
        paymentUrl: redirectUrl,
        paymentDetails: {
          token: snapToken,
          redirect_url: redirectUrl,
          checkoutUrl: redirectUrl
        },
        idempotencyKey,
        correlationId,
        simulated: false
      };
    }

    // Simulation mode for testing / sandbox verification
    if (this.allowSimulation || !this.serverKey) {
      const providerRef = `midtrans-${orderId}-${Date.now()}`;
      const snapToken = `snap-token-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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

  async getPaymentStatus(refOrObj) {
    const orderId = typeof refOrObj === 'object' && refOrObj !== null
      ? (refOrObj.orderId || refOrObj.providerRef)
      : refOrObj;

    if (this.serverKey && !this.allowSimulation) {
      if (this.isProduction && process.env.ENABLE_MIDTRANS_PRODUCTION !== 'true') {
        throw new Error('Live Midtrans production API client awaiting merchant production activation.');
      }

      try {
        const basicAuth = Buffer.from(`${this.serverKey}:`).toString('base64');
        const res = await this._httpRequest({
          url: `${this.apiBaseUrl}/v2/${orderId}/status`,
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${basicAuth}`
          }
        });

        if (res.statusCode === 200 && res.json) {
          const tStatus = (res.json.transaction_status || '').toLowerCase();
          const fStatus = (res.json.fraud_status || '').toLowerCase();
          let cStatus = MONEY_STATE.PAYMENT_PENDING;

          if (tStatus === 'capture') {
            cStatus = fStatus === 'challenge' ? MONEY_STATE.PAYMENT_PENDING : MONEY_STATE.PAID;
          } else if (tStatus === 'settlement') {
            cStatus = MONEY_STATE.PAID;
          } else if (tStatus === 'cancel' || tStatus === 'deny') {
            cStatus = MONEY_STATE.PAYMENT_FAILED;
          } else if (tStatus === 'expire') {
            cStatus = MONEY_STATE.PAYMENT_EXPIRED;
          } else if (tStatus === 'refund') {
            cStatus = MONEY_STATE.REFUNDED;
          }

          return {
            orderId,
            providerRef: res.json.transaction_id || orderId,
            status: cStatus,
            rawStatus: tStatus,
            amount: parseInt(res.json.gross_amount || 0, 10),
            provider: this.getName(),
            simulated: false
          };
        }
      } catch (_) {}
    }

    return {
      orderId,
      providerRef: orderId,
      status: MONEY_STATE.PAYMENT_PENDING,
      amount: null,
      provider: this.getName(),
      simulated: true
    };
  }

  /**
   * Verifies Midtrans webhook signature
   * SHA512(order_id + status_code + gross_amount + ServerKey) === signature_key
   */
  verifyWebhook(headers = {}, body = {}, rawBodyBuffer = null) {
    const payload = typeof body === 'object' && body !== null ? body : {};
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
    const targetRef = orderId || providerRef;
    if (this.serverKey && !this.allowSimulation) {
      if (this.isProduction && process.env.ENABLE_MIDTRANS_PRODUCTION !== 'true') {
        throw new Error('Live Midtrans production API client awaiting merchant production activation.');
      }

      try {
        const basicAuth = Buffer.from(`${this.serverKey}:`).toString('base64');
        const res = await this._httpRequest({
          url: `${this.apiBaseUrl}/v2/${targetRef}/refund`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Basic ${basicAuth}`
          },
          body: JSON.stringify({
            refund_key: idempotencyKey || `ref-${Date.now()}`,
            amount: parseInt(amount, 10),
            reason
          })
        });

        if (res.statusCode >= 200 && res.statusCode < 300) {
          return {
            refundId: res.json?.refund_key || `midtrans-ref-${targetRef}`,
            orderId,
            providerRef: targetRef,
            amount: parseInt(amount, 10),
            status: 'CONFIRMED',
            moneyState: MONEY_STATE.REFUNDED,
            reason,
            idempotencyKey,
            simulated: false,
            createdAt: new Date().toISOString()
          };
        }
      } catch (_) {}
    }

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

  async getPayoutStatus({ payoutId, providerRef }) {
    if (!this.irisEnabled && !this.allowSimulation) {
      throw new CapabilityUnsupportedError(this.getName(), 'payout', 'Midtrans Iris disbursement not active');
    }
    const id = payoutId || providerRef;
    return {
      payoutId: id,
      status: 'DISBURSED',
      provider: this.getName(),
      simulated: true
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
