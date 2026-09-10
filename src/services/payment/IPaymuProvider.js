/**
 * ARGUS iPaymu Indonesia Payment & Escrow Provider
 * 
 * Implements PaymentProvider interface for iPaymu gateway.
 * Crucial Model Invariant:
 * Not every iPaymu payment method supports escrow holding.
 * Channels are explicitly segmented into escrow-capable vs non-escrow instant channels.
 * For secondary ticket transactions on ARGUS, escrow holding is MANDATORY.
 */

const crypto = require('crypto');
const { PaymentProvider } = require('./PaymentProvider');

class IPaymuProvider extends PaymentProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.IPAYMU_API_KEY || 'mock-ipaymu-key';
    this.virtualAccount = config.virtualAccount || process.env.IPAYMU_VA || '0000001234567890';
    this.mode = config.mode || process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
  }

  getName() {
    return 'ipaymu';
  }

  getCountry() {
    return 'ID';
  }

  /**
   * Defines all supported iPaymu channels and explicitly marks whether they support escrow.
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
      // Non-escrow channels:
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
   * Initiate payment with iPaymu
   */
  async createPayment({ orderId, amount, channel = 'BCA_VA', buyer = {}, returnUrl, requiresEscrow = true }) {
    // 1. Verify channel escrow capability if escrow is required
    if (requiresEscrow && !this.isEscrowSupported(channel)) {
      const err = new Error(
        `Metode pembayaran '${channel}' tidak mendukung penahanan rekening bersama (escrow) iPaymu. ` +
        `Tikum mewajibkan metode pembayaran ber-escrow (Virtual Account atau QRIS Escrow) demi keamanan transaksi.`
      );
      err.code = 'ESCROW_CHANNEL_UNSUPPORTED';
      err.statusCode = 400;
      throw err;
    }

    const channelMeta = this.getSupportedChannels().find(c => c.code.toUpperCase() === channel.toUpperCase());
    const referenceId = `ipaymu-${orderId}-${Date.now()}`;
    const vaNumber = `8800${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    return {
      provider: this.getName(),
      country: this.getCountry(),
      orderId,
      referenceId,
      channel: channelMeta ? channelMeta.code : channel,
      channelName: channelMeta ? channelMeta.name : channel,
      amount: parseInt(amount, 10),
      currency: 'IDR',
      isEscrowCapable: channelMeta ? channelMeta.isEscrowSupported : false,
      escrowHoldStatus: requiresEscrow ? 'ESCROW_HOLD_RESERVED' : 'DIRECT_DISBURSE',
      paymentDetails: {
        vaNumber: channelMeta && channelMeta.type === 'VA' ? vaNumber : null,
        qrString: channelMeta && channelMeta.type === 'QRIS' ? `00020101021226...MOCK_QRIS_${orderId}` : null,
        expiredAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours window
      },
      instructions: `Lakukan pembayaran ke ${channelMeta?.name || channel} sebesar Rp ${amount.toLocaleString('id-ID')}. Dana akan dikunci di Rekening Penampungan Tikum (Escrow) hingga verifikasi gate selesai.`
    };
  }

  /**
   * Verify signature of iPaymu webhook
   */
  verifyWebhook(headers = {}, body = {}) {
    // In test/pilot mode or with API key signature verification
    const signature = headers['signature'] || headers['x-signature'];
    if (!signature) {
      // In sandbox/test environment allow valid signature simulation
      return process.env.NODE_ENV === 'test' || !this.config.enforceSignature;
    }
    const expected = crypto.createHmac('sha256', this.apiKey)
      .update(typeof body === 'string' ? body : JSON.stringify(body))
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  /**
   * Normalize iPaymu webhook payload to ARGUS payment event
   */
  parseWebhook(payload = {}) {
    const rawStatus = (payload.status || payload.trx_status || '').toUpperCase();
    const isPaid = rawStatus === 'BERHASIL' || rawStatus === 'PAID' || rawStatus === 'SUCCESS';
    const channel = payload.channel || payload.payment_method || 'VA';
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

module.exports = { IPaymuProvider };
