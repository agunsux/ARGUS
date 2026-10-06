/**
 * TIKUM / ARGUS — Canonical Payment & Settlement Types
 *
 * Establishes provider-agnostic domain contracts.
 * The domain NEVER depends on provider-specific response formats.
 * All provider adapters (DOKU, Midtrans, Xendit) MUST normalize into these canonical DTOs.
 *
 * CRITICAL SEPARATION (Section 7):
 * A. PAYMENT PROVIDER MONEY STATE (Actual fund custody state on provider rail)
 * B. TIKUM BUSINESS STATE (Marketplace transaction and PIC verification state)
 * NEVER COLLAPSE THESE INTO ONE FIELD.
 */

// A. PAYMENT PROVIDER MONEY STATE (Custody of Funds on Provider Rail)
const MONEY_STATE = {
  CREATED: 'CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  ESCROW_HELD: 'ESCROW_HELD',
  RELEASE_PENDING: 'RELEASE_PENDING',
  RELEASED: 'RELEASED',
  SETTLED: 'SETTLED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  DISPUTED: 'DISPUTED',
  CHARGEBACK: 'CHARGEBACK',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED'
};

// Backward-compatible alias for existing callers
const CANONICAL_PAYMENT_STATUS = {
  PAYMENT_CREATED: MONEY_STATE.CREATED,
  PAYMENT_PENDING: MONEY_STATE.PAYMENT_PENDING,
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  PAYMENT_PAID: MONEY_STATE.PAID,
  ESCROW_HELD: MONEY_STATE.ESCROW_HELD,
  PAYMENT_FAILED: MONEY_STATE.PAYMENT_FAILED,
  PAYMENT_EXPIRED: MONEY_STATE.PAYMENT_EXPIRED,
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  RELEASE_PENDING: MONEY_STATE.RELEASE_PENDING,
  RELEASED: MONEY_STATE.RELEASED,
  SETTLED: MONEY_STATE.SETTLED,
  REFUND_PENDING: MONEY_STATE.REFUND_PENDING,
  REFUNDED: MONEY_STATE.REFUNDED,
  PARTIALLY_REFUNDED: MONEY_STATE.PARTIALLY_REFUNDED,
  DISPUTED: MONEY_STATE.DISPUTED,
  CHARGEBACK: MONEY_STATE.CHARGEBACK,
  RECONCILIATION_REQUIRED: MONEY_STATE.RECONCILIATION_REQUIRED
};

// B. TIKUM BUSINESS STATE (Trust Engine & Physical Gate Life Cycle)
const TIKUM_BUSINESS_STATE = {
  TICKET_LISTED: 'TICKET_LISTED',
  TICKET_RESERVED: 'TICKET_RESERVED',
  TICKET_SOLD: 'TICKET_SOLD',
  TICKET_VERIFICATION_PENDING: 'TICKET_VERIFICATION_PENDING',
  TICKET_VERIFIED: 'TICKET_VERIFIED',
  PIC_PENDING: 'PIC_PENDING',
  PIC_VERIFIED: 'PIC_VERIFIED',
  ENTRY_CONFIRMED: 'ENTRY_CONFIRMED',
  BUYER_CONFIRMED: 'BUYER_CONFIRMED',
  RELEASE_AUTHORIZED: 'RELEASE_AUTHORIZED',
  DISPUTED: 'DISPUTED',
  CANCELLED: 'CANCELLED',
  SETTLEMENT_ELIGIBLE: 'SETTLEMENT_ELIGIBLE',
  SETTLEMENT_FAILED: 'SETTLEMENT_FAILED'
};

const SETTLEMENT_LIFECYCLE_STATUS = {
  ...TIKUM_BUSINESS_STATE,
  FUNDS_SECURED: 'FUNDS_SECURED',
  TRANSFER_PENDING: 'TRANSFER_PENDING',
  TRANSFER_CONFIRMED: 'TRANSFER_CONFIRMED',
  PAYOUT_INITIATED: 'PAYOUT_INITIATED',
  SELLER_PAID: 'SELLER_PAID',
  SETTLEMENT_BLOCKED: 'SETTLEMENT_BLOCKED'
};

const PROVIDER_HEALTH_STATE = {
  ACTIVE: 'ACTIVE',
  DEGRADED: 'DEGRADED',
  PAUSED: 'PAUSED',
  FAILED: 'FAILED',
  DISABLED: 'DISABLED'
};

const PROVIDER_CAPABILITY_STATUS = {
  VERIFIED_SUPPORTED: 'VERIFIED_SUPPORTED',
  UNSUPPORTED: 'UNSUPPORTED',
  PROVIDER_CONTRACT_DEPENDENT: 'PROVIDER-CONTRACT-DEPENDENT',
  PENDING_DOCUMENTATION_VERIFICATION: 'PENDING_DOCUMENTATION_VERIFICATION'
};

/**
 * Provider capabilities declaration contract.
 * Explicit capabilities verified from official documentation & contracts.
 * Unsupported capabilities MUST return an explicit CapabilityUnsupportedError.
 */
class ProviderCapabilities {
  constructor({
    paymentCollection = false,
    refund = false,
    partialRefund = false,
    hold = false,
    release = false,
    payout = false,
    splitSettlement = false,
    sellerAccounts = false,
    subAccounts = false,
    webhooks = false,
    reconciliation = false,
    disputeHandling = false,
    chargebackHandling = false,
    notes = {}
  } = {}) {
    this.paymentCollection = paymentCollection;
    this.refund = refund;
    this.partialRefund = partialRefund;
    this.hold = hold;
    this.release = release;
    this.payout = payout;
    this.splitSettlement = splitSettlement;
    this.sellerAccounts = sellerAccounts;
    this.subAccounts = subAccounts;
    this.webhooks = webhooks;
    this.reconciliation = reconciliation;
    this.disputeHandling = disputeHandling;
    this.chargebackHandling = chargebackHandling;
    this.notes = notes;
  }
}

/**
 * Validates and normalizes Canonical Payment Record.
 * Money MUST be in integer minor units (NO FLOAT).
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
  moneyState = MONEY_STATE.PAYMENT_PENDING,
  businessState = TIKUM_BUSINESS_STATE.TICKET_RESERVED,
  status = null,
  paymentMethod = 'UNKNOWN',
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
  expiresAt = null,
  paidAt = null,
  refundedAt = null,
  metadata = {},
  idempotencyKey = null,
  correlationId = null
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

  // Enforce Section 9 Invariants
  if (isNaN(gross) || gross <= 0) {
    throw new Error(`Gross amount must be positive integer minor units, got: ${grossAmount}`);
  }
  if (selAmt > gross) {
    throw new Error(`Invariant violation: seller_amount (${selAmt}) exceeds gross_amount (${gross})`);
  }

  const resolvedMoneyState = status || moneyState || MONEY_STATE.PAYMENT_PENDING;

  return {
    id: internalPaymentId,
    internal_payment_id: internalPaymentId,
    order_id: orderId,
    buyer_id: buyerId,
    seller_id: sellerId,
    event_id: eventId,
    ticket_id: ticketId,
    provider: provider.toLowerCase(),
    provider_transaction_id: providerTransactionId,
    provider_reference: providerReference,
    currency: currency.toUpperCase(),
    gross_amount: gross,
    platform_fee: platFee,
    seller_amount: selAmt,
    provider_fee: provFee,
    tax_amount: tax,
    net_amount: net,
    money_state: resolvedMoneyState,
    business_state: businessState,
    status: resolvedMoneyState, // Backward compatibility
    payment_method: paymentMethod,
    idempotency_key: idempotencyKey,
    correlation_id: correlationId || `corr-${internalPaymentId}`,
    created_at: createdAt,
    updated_at: updatedAt,
    expiresAt,
    paidAt,
    refundedAt,
    metadata
  };
}

/**
 * Normalizes a Chargeback Record
 */
function createCanonicalChargebackRecord({
  chargebackId,
  orderId,
  paymentId,
  provider,
  providerTransactionId,
  amount,
  currency = 'IDR',
  reason,
  evidence = [],
  deadline = null,
  status = 'OPEN',
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString()
}) {
  return {
    id: chargebackId,
    chargeback_id: chargebackId,
    order_id: orderId,
    payment_id: paymentId,
    provider: provider.toLowerCase(),
    provider_transaction_id: providerTransactionId,
    amount: parseInt(amount, 10),
    currency: currency.toUpperCase(),
    reason,
    evidence,
    deadline,
    status, // OPEN, UNDER_REVIEW, WON, LOST, ACCEPTED
    created_at: createdAt,
    updated_at: updatedAt
  };
}

module.exports = {
  MONEY_STATE,
  CANONICAL_PAYMENT_STATUS,
  TIKUM_BUSINESS_STATE,
  SETTLEMENT_LIFECYCLE_STATUS,
  PROVIDER_HEALTH_STATE,
  PROVIDER_CAPABILITY_STATUS,
  ProviderCapabilities,
  createCanonicalPaymentRecord,
  createCanonicalChargebackRecord
};
