/**
 * TIKUM / ARGUS — Canonical Payment & Settlement Types (Part 1, 3, 4, 16)
 *
 * Establishes provider-agnostic domain contracts.
 * The domain NEVER depends on provider-specific response formats (e.g. rcbOrderId, ipaymuTrxId).
 * All provider adapters MUST normalize into these canonical DTOs.
 */

const CANONICAL_PAYMENT_STATUS = {
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  PAYMENT_PAID: 'PAYMENT_PAID',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  DISPUTED: 'DISPUTED'
};

const SETTLEMENT_LIFECYCLE_STATUS = {
  PAYMENT_PAID: 'PAYMENT_PAID',
  FUNDS_SECURED: 'FUNDS_SECURED',
  TICKET_VERIFICATION_PENDING: 'TICKET_VERIFICATION_PENDING',
  TICKET_VERIFIED: 'TICKET_VERIFIED',
  TRANSFER_PENDING: 'TRANSFER_PENDING',
  TRANSFER_CONFIRMED: 'TRANSFER_CONFIRMED',
  EVENT_PENDING: 'EVENT_PENDING',
  ENTRY_CONFIRMED: 'ENTRY_CONFIRMED',
  SETTLEMENT_ELIGIBLE: 'SETTLEMENT_ELIGIBLE',
  SETTLEMENT_AUTHORIZED: 'SETTLEMENT_AUTHORIZED',
  PAYOUT_INITIATED: 'PAYOUT_INITIATED',
  SELLER_PAID: 'SELLER_PAID',
  SETTLEMENT_BLOCKED: 'SETTLEMENT_BLOCKED',
  SETTLEMENT_FAILED: 'SETTLEMENT_FAILED'
};

const PROVIDER_CAPABILITY_STATUS = {
  VERIFIED_SUPPORTED: 'VERIFIED_SUPPORTED',
  UNSUPPORTED: 'UNSUPPORTED',
  PENDING_DOCUMENTATION_VERIFICATION: 'PENDING_DOCUMENTATION_VERIFICATION'
};

/**
 * Provider capabilities declaration contract.
 * Unsupported capabilities MUST throw an explicit capability error.
 */
class ProviderCapabilities {
  constructor({
    paymentCollection = false,
    refund = false,
    hold = false,
    release = false,
    payout = false,
    splitSettlement = false,
    sellerAccounts = false,
    subAccounts = false,
    webhooks = false,
    reconciliation = false
  } = {}) {
    this.paymentCollection = paymentCollection;
    this.refund = refund;
    this.hold = hold;
    this.release = release;
    this.payout = payout;
    this.splitSettlement = splitSettlement;
    this.sellerAccounts = sellerAccounts;
    this.subAccounts = subAccounts;
    this.webhooks = webhooks;
    this.reconciliation = reconciliation;
  }
}

/**
 * Validates and normalizes Canonical Payment Record
 */
function createCanonicalPaymentRecord({
  internalPaymentId,
  orderId,
  buyerId,
  sellerId,
  eventId,
  ticketId,
  provider,
  providerTransactionId = null,
  providerReference,
  currency = 'IDR',
  grossAmount,
  platformFee = 0,
  sellerAmount = 0,
  providerFee = 0,
  taxAmount = 0,
  netAmount = null,
  status = CANONICAL_PAYMENT_STATUS.PAYMENT_CREATED,
  paymentMethod = 'UNKNOWN',
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
  expiresAt = null,
  paidAt = null,
  refundedAt = null,
  metadata = {}
}) {
  if (!internalPaymentId || !orderId || !buyerId || !sellerId || !eventId || !ticketId || !provider || !providerReference) {
    const err = new Error('Missing required fields for Canonical Payment Record');
    err.code = 'INVALID_CANONICAL_PAYMENT_PAYLOAD';
    throw err;
  }

  const gross = parseInt(grossAmount, 10);
  const platFee = parseInt(platformFee, 10);
  const selAmt = parseInt(sellerAmount, 10);
  const provFee = parseInt(providerFee, 10);
  const tax = parseInt(taxAmount, 10);
  const net = netAmount !== null ? parseInt(netAmount, 10) : gross - provFee;

  return {
    internalPaymentId,
    orderId,
    buyerId,
    sellerId,
    eventId,
    ticketId,
    provider,
    providerTransactionId,
    providerReference,
    currency,
    grossAmount: gross,
    platformFee: platFee,
    sellerAmount: selAmt,
    providerFee: provFee,
    taxAmount: tax,
    netAmount: net,
    status,
    paymentMethod,
    createdAt,
    updatedAt,
    expiresAt,
    paidAt,
    refundedAt,
    metadata
  };
}

module.exports = {
  CANONICAL_PAYMENT_STATUS,
  SETTLEMENT_LIFECYCLE_STATUS,
  PROVIDER_CAPABILITY_STATUS,
  ProviderCapabilities,
  createCanonicalPaymentRecord
};
