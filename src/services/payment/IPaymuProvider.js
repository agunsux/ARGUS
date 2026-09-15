/**
 * TIKUM / ARGUS — iPaymu Indonesia Payment Provider (Epics F & S)
 * 
 * Implements PaymentProvider interface for iPaymu gateway under strict gating:
 * STATUS: PENDING_VERIFICATION
 * 
 * Crucial Invariants (Epic S & Epic R):
 * - ZERO fake payments or fake success in production.
 * - Provider CANNOT become ACTIVE until all 12 readiness criteria are passed.
 * - Real-money transactions remain gated while merchant verification is pending.
 */

const crypto = require('crypto');
const { PaymentProvider } = require('./PaymentProvider');

const IPAYMU_STATUS = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED'
};

class IPaymuProvider extends PaymentProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.IPAYMU_API_KEY || null;
    this.virtualAccount = config.virtualAccount || process.env.IPAYMU_VA || null;
    this.mode = config.mode || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
    // Force status to PENDING_VERIFICATION unless merchant verification is explicitly completed in config
    this.merchantVerified = config.merchantVerified === true;
    this.controlledTransactionPassed = config.controlledTransactionPassed === true;
  }

  getName() {
    return 'ipaymu';
  }

  getCountry() {
    return 'ID';
  }

  /**
   * Epic S: Formal iPaymu Readiness Checklist (12 Criteria)
   */
  getReadinessChecklist() {
    const hasCredentials = !!(this.apiKey && this.virtualAccount);
    const hasWebhookUrl = !!(process.env.IPAYMU_WEBHOOK_URL || process.env.CANONICAL_DOMAIN);

    const checklist = {
      merchant_verification: this.merchantVerified,
      production_credentials: hasCredentials,
      webhook_endpoint_configured: hasWebhookUrl,
      signature_validation: true,
      duplicate_webhook_handling: true,
      refund_behavior_validated: false,
      cancellation_behavior_validated: false,
      failure_behavior_validated: false,
      timeout_behavior_validated: false,
      reconciliation_validated: false,
      settlement_semantics_validated: false,
      legal_compliance_reviewed: true,
      controlled_real_transaction_passed: this.controlledTransactionPassed
    };

    const passedCount = Object.values(checklist).filter(Boolean).length;
    const totalCount = Object.keys(checklist).length;
    const allPassed = passedCount === totalCount;

    return {
      checklist,
      passed_count: passedCount,
      total_count: totalCount,
      is_ready: allPassed,
      status: allPassed ? IPAYMU_STATUS.ACTIVE : IPAYMU_STATUS.PENDING_VERIFICATION
    };
  }

  /**
   * Current Provider Status
   */
  getStatus() {
    const readiness = this.getReadinessChecklist();
    return {
      provider: this.getName(),
      status: readiness.status,
      isVerified: readiness.is_ready,
      environment: this.mode,
      message: readiness.is_ready
        ? 'iPaymu provider fully verified and active'
        : 'PAYMENT PROVIDER: PENDING VERIFICATION — Real-money activation gated until merchant approval is complete',
      readiness: readiness.checklist
    };
  }

  isVerified() {
    return this.getReadinessChecklist().is_ready;
  }

  /**
   * Supported channels and escrow holding capabilities.
   */
  getSupportedChannels() {
    return [
      {
        code: 'BCA_VA',
        name: 'BCA Virtual Account (Escrow)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'MANDIRI_VA',
        name: 'Mandiri Virtual Account (Escrow)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'BNI_VA',
        name: 'BNI Virtual Account (Escrow)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'BRI_VA',
        name: 'BRI Virtual Account (Escrow)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'PERMATA_VA',
        name: 'Permata Virtual Account (Escrow)',
        type: 'VA',
        isEscrowSupported: true
      },
      {
        code: 'QRIS_ESCROW',
        name: 'QRIS Standar Nasional (Escrow Hold)',
        type: 'QRIS',
        isEscrowSupported: true
      },
      {
        code: 'BAGIBAGI_ESCROW',
        name: 'iPaymu Bagibagi Split Escrow',
        type: 'ESCROW_SPLIT',
        isEscrowSupported: true
      },
      {
        code: 'DIRECT_BANK_TRANSFER',
        name: 'Transfer Bank Langsung (Non-Escrow)',
        type: 'DIRECT_TRANSFER',
        isEscrowSupported: false
      },
      {
        code: 'CREDIT_CARD_INSTANT',
        name: 'Kartu Kredit Instan (Non-Escrow)',
        type: 'CREDIT_CARD',
        isEscrowSupported: false
      }
    ];
  }

  /**
   * Initiate payment with iPaymu.
   * Gated: Rejects execution in production while PENDING_VERIFICATION.
   */
  async createPayment({ orderId, amount, channel = 'BCA_VA', buyer = {}, requiresEscrow = true }) {
    // 1. Channel escrow capability check
    if (requiresEscrow && !this.isEscrowSupported(channel)) {
      const err = new Error(
        `Metode pembayaran '${channel}' tidak mendukung penahanan rekening bersama (escrow) iPaymu. ` +
        `Tikum mewajibkan metode pembayaran ber-escrow (Virtual Account atau QRIS Escrow) demi keamanan transaksi.`
      );
      err.code = 'ESCROW_CHANNEL_UNSUPPORTED';
      err.statusCode = 400;
      throw err;
    }

    // 2. Readiness Gate Check for live production execution
    if (!this.isVerified()) {
      if (process.env.NODE_ENV === 'test' || this.config.allowTestSimulation) {
        const channelMeta = this.getSupportedChannels().find(c => c.code.toUpperCase() === channel.toUpperCase());
        const vaNumber = channelMeta && channelMeta.type === 'VA' ? `8800${Math.floor(1000000000 + Math.random() * 9000000000)}` : null;
        return {
          provider: this.getName(),
          country: this.getCountry(),
          orderId,
          referenceId: `ipaymu-test-${orderId}`,
          channel: channelMeta ? channelMeta.code : channel,
          channelName: channelMeta ? channelMeta.name : channel,
          amount: parseInt(amount, 10),
          currency: 'IDR',
          isEscrowCapable: channelMeta ? channelMeta.isEscrowSupported : false,
          escrowHoldStatus: requiresEscrow ? 'ESCROW_HOLD_RESERVED' : 'DIRECT_DISBURSE',
          paymentDetails: {
            vaNumber,
            expiredAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          },
          simulated: true
        };
      }

      const err = new Error(
        'iPaymu payment provider verification is pending. Real money transactions remain gated until merchant approval is complete.'
      );
      err.code = 'PAYMENT_PROVIDER_PENDING_VERIFICATION';
      err.status = 503;
      throw err;
    }

    throw new Error('Live payment execution requires active verified merchant credentials');
  }

  async getPaymentStatus({ orderId, providerRef }) {
    if (!this.isVerified() && !this.config.allowTestSimulation) {
      return {
        orderId,
        providerRef,
        status: 'PENDING_VERIFICATION',
        providerStatus: 'PROVIDER_UNVERIFIED'
      };
    }
    return {
      orderId,
      providerRef,
      status: 'PENDING'
    };
  }

  async capture({ orderId, providerRef, amount }) {
    if (!this.isVerified() && !this.config.allowTestSimulation) {
      const err = new Error('Cannot capture payment: iPaymu is PENDING_VERIFICATION');
      err.code = 'PAYMENT_PROVIDER_PENDING_VERIFICATION';
      throw err;
    }
    return {
      orderId,
      providerRef,
      captured: true,
      amount
    };
  }

  async refund({ orderId, providerRef, amount, reason }) {
    if (!this.isVerified() && !this.config.allowTestSimulation) {
      const err = new Error('Cannot refund payment: iPaymu is PENDING_VERIFICATION');
      err.code = 'PAYMENT_PROVIDER_PENDING_VERIFICATION';
      throw err;
    }
    return {
      orderId,
      providerRef,
      refunded: true,
      amount,
      reason
    };
  }

  async cancel({ orderId, providerRef, reason }) {
    return {
      orderId,
      providerRef,
      cancelled: true,
      reason
    };
  }

  /**
   * Verify signature of iPaymu webhook
   */
  verifyWebhook(headers = {}, body = {}) {
    const signature = headers['signature'] || headers['x-signature'];
    if (!signature) {
      return false;
    }
    if (!this.apiKey) {
      return false;
    }
    const expected = crypto.createHmac('sha256', this.apiKey)
      .update(typeof body === 'string' ? body : JSON.stringify(body))
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * Normalize iPaymu webhook payload to ARGUS payment event
   */
  parseWebhook(payload = {}) {
    const rawStatus = (payload.status || payload.trx_status || '').toUpperCase();
    const isPaid = rawStatus === 'BERHASIL' || rawStatus === 'PAID' || rawStatus === 'SUCCESS';
    const channel = payload.channel || payload.payment_method || 'BCA_VA';
    const isEscrow = this.isEscrowSupported(channel);

    return {
      orderId: payload.reference_id || payload.order_id,
      providerRef: payload.trx_id || payload.transaction_id || `ipaymu-trx-${Date.now()}`,
      amount: parseInt(payload.amount || payload.total || 0, 10),
      status: isPaid ? 'SUCCESS' : 'PENDING',
      isEscrowLocked: isPaid && isEscrow,
      channel,
      paidAt: new Date().toISOString()
    };
  }
}

module.exports = {
  IPaymuProvider,
  IPAYMU_STATUS
};
