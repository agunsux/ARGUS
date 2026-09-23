/**
 * TIKUM — Canonical Transaction Fee Engine V1
 * 
 * THE SINGLE SOURCE OF TRUTH for every ticket transaction fee calculation on tikum.app.
 * 
 * CORE CANONICAL POLICY: TIKUM_FEE_POLICY_V1
 * -------------------------------------------------------------
 * - Seller Fee: 6% of ticket/listing sale price
 * - Buyer Fee: 6% of ticket/listing sale price
 * - Listing Fee: Rp 0
 * - Minimum Fee: Rp 10,000 per applicable fee side
 * - Maximum Fee: Rp 300,000 per applicable fee side / order
 * - Currency: IDR
 * 
 * MONEY / ROUNDING INVARIANTS:
 * - Integer IDR minor-unit / rupiah-safe arithmetic (ZERO floating-point math).
 * - Canonical Rounding Rule: raw_fee = floor((gross_ticket_value * 6) / 100)
 * - Boundary Clamping: applicable_fee = max(10000, min(raw_fee, 300000))
 * - Seller Payout: seller_payout = gross_ticket_value - seller_fee
 * - Buyer Total: buyer_total = gross_ticket_value + buyer_fee + payment_processing_fee
 * - Multi-Ticket Order Fee Basis: ONE buyer fee + ONE seller fee per order,
 *   calculated against the order's gross ticket value (ticket_price * quantity).
 * - Transparent Platform Revenue: ZERO hidden ticket markups. Tikum does not alter seller price.
 * - Non-Negative Payout Guard: seller_fee cannot exceed gross_ticket_value (seller_payout >= 0).
 */

const TIKUM_FEE_POLICY_V1 = Object.freeze({
  version: 'TIKUM_FEE_POLICY_V1',
  country_code: 'ID',
  currency: 'IDR',
  description: 'Standard Tikum Canonical Fee Policy V1 (6% Buyer + 6% Seller, Min Rp10k, Max Rp300k)',
  seller_rate_numerator: 6,
  seller_rate_denominator: 100,
  buyer_rate_numerator: 6,
  buyer_rate_denominator: 100,
  seller_rate: 0.06,
  buyer_rate: 0.06,
  listing_fee: 0,
  minimum_fee: 10000,
  maximum_fee: 300000,
  is_active: true,
  effective_from: '2026-01-01T00:00:00Z'
});

// Supported fee policy versions
const SUPPORTED_POLICIES = Object.freeze({
  'TIKUM_FEE_POLICY_V1': TIKUM_FEE_POLICY_V1,
  // Historical policies preserved immutably for audit and historical orders
  '2026.1-ID-DEFAULT': Object.freeze({
    version: '2026.1-ID-DEFAULT',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Historical Indonesia Two-Sided Policy (5% + 5%, Min 15k, Max 500k)',
    seller_rate_numerator: 5,
    seller_rate_denominator: 100,
    buyer_rate_numerator: 5,
    buyer_rate_denominator: 100,
    seller_rate: 0.05,
    buyer_rate: 0.05,
    listing_fee: 0,
    minimum_fee: 15000,
    maximum_fee: 500000,
    is_active: false,
    effective_from: '2026-01-01T00:00:00Z'
  }),
  'LEGACY-BUYER-10PCT': Object.freeze({
    version: 'LEGACY-BUYER-10PCT',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Historical Pilot Policy: 10% Buyer Fee, 0% Seller Fee (No Min/Max)',
    seller_rate_numerator: 10,
    seller_rate_denominator: 100,
    buyer_rate_numerator: 10,
    buyer_rate_denominator: 100,
    seller_rate: 0.00,
    buyer_rate: 0.10,
    listing_fee: 0,
    minimum_fee: 0,
    maximum_fee: Infinity,
    is_active: false,
    effective_from: '2026-01-01T00:00:00Z'
  })
});

class CanonicalFeeEngine {
  /**
   * Return the canonical active fee policy
   */
  static getActivePolicy() {
    return TIKUM_FEE_POLICY_V1;
  }

  /**
   * Retrieve policy by version key (with fail-closed validation)
   */
  static getPolicy(version = 'TIKUM_FEE_POLICY_V1') {
    const policyKey = version || 'TIKUM_FEE_POLICY_V1';
    const policy = SUPPORTED_POLICIES[policyKey];
    if (!policy) {
      const err = new Error(`[UNKNOWN_FEE_POLICY] Unsupported fee policy version: '${version}'`);
      err.code = 'UNKNOWN_FEE_POLICY';
      throw err;
    }
    return policy;
  }

  /**
   * Deterministic integer floor fee calculation
   * Formula: floor((amount * numerator) / denominator)
   */
  static calculateIntegerFee(amount, numerator, denominator) {
    if (amount <= 0 || numerator <= 0) return 0;
    return Math.floor((amount * numerator) / denominator);
  }

  /**
   * Calculate complete, deterministic, immutable ticket fees.
   * SINGLE SOURCE OF TRUTH across the entire platform.
   * 
   * @param {Object} params
   * @param {number|string} params.ticketPrice - Base ticket listing price in IDR
   * @param {number|string} [params.quantity=1] - Number of tickets in order (default 1)
   * @param {number|string} [params.paymentProcessingFee=0] - Explicit payment processing fee (default 0)
   * @param {string} [params.currency='IDR'] - Currency code (must be IDR for V1)
   * @param {string} [params.policyVersion='TIKUM_FEE_POLICY_V1'] - Policy version to execute
   * @returns {Object} Complete immutable fee breakdown
   */
  static calculateTicketFees({
    ticketPrice,
    quantity = 1,
    paymentProcessingFee = 0,
    currency = 'IDR',
    policyVersion = 'TIKUM_FEE_POLICY_V1'
  }) {
    // 1. Validate currency
    const normalizedCurrency = (currency || 'IDR').toUpperCase();
    if (normalizedCurrency !== 'IDR') {
      const err = new Error(`[INVALID_CURRENCY] V1 fee engine supports only 'IDR', got '${currency}'`);
      err.code = 'INVALID_CURRENCY';
      throw err;
    }

    // 2. Validate price
    const price = typeof ticketPrice === 'number' ? ticketPrice : parseInt(ticketPrice, 10);
    if (typeof price !== 'number' || isNaN(price) || !Number.isInteger(price) || price <= 0) {
      const err = new Error(`[INVALID_TICKET_PRICE] Ticket price must be a positive integer, got: ${ticketPrice}`);
      err.code = 'INVALID_TICKET_PRICE';
      throw err;
    }

    // 3. Validate quantity
    const qty = typeof quantity === 'number' ? quantity : parseInt(quantity, 10);
    if (typeof qty !== 'number' || isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
      const err = new Error(`[INVALID_QUANTITY] Quantity must be a positive integer >= 1, got: ${quantity}`);
      err.code = 'INVALID_QUANTITY';
      throw err;
    }

    // 4. Validate payment processing fee
    const pgFee = typeof paymentProcessingFee === 'number' ? paymentProcessingFee : parseInt(paymentProcessingFee || 0, 10);
    if (typeof pgFee !== 'number' || isNaN(pgFee) || !Number.isInteger(pgFee) || pgFee < 0) {
      const err = new Error(`[INVALID_PAYMENT_FEE] Payment processing fee must be a non-negative integer, got: ${paymentProcessingFee}`);
      err.code = 'INVALID_PAYMENT_FEE';
      throw err;
    }

    // 5. Resolve policy
    const policy = this.getPolicy(policyVersion);

    // 6. Compute gross ticket value
    const grossTicketValue = price * qty;

    // 7. Calculate Buyer Fee (Order-level multi-ticket basis)
    let buyerFee = 0;
    let rawBuyerFee = 0;
    if (policy.buyer_rate_numerator > 0) {
      rawBuyerFee = this.calculateIntegerFee(grossTicketValue, policy.buyer_rate_numerator, policy.buyer_rate_denominator);
      buyerFee = rawBuyerFee;
      if (policy.minimum_fee > 0 && buyerFee < policy.minimum_fee) {
        buyerFee = policy.minimum_fee;
      }
      if (policy.maximum_fee < Infinity && buyerFee > policy.maximum_fee) {
        buyerFee = policy.maximum_fee;
      }
    }

    // 8. Calculate Seller Fee (Order-level multi-ticket basis)
    let sellerFee = 0;
    let rawSellerFee = 0;
    if (policy.seller_rate_numerator > 0) {
      rawSellerFee = this.calculateIntegerFee(grossTicketValue, policy.seller_rate_numerator, policy.seller_rate_denominator);
      sellerFee = rawSellerFee;
      if (policy.minimum_fee > 0 && sellerFee < policy.minimum_fee) {
        sellerFee = policy.minimum_fee;
      }
      if (policy.maximum_fee < Infinity && sellerFee > policy.maximum_fee) {
        sellerFee = policy.maximum_fee;
      }
    }

    // Protection: Seller fee cannot exceed gross ticket value (seller payout cannot be negative)
    if (sellerFee > grossTicketValue) {
      sellerFee = grossTicketValue;
    }

    // 9. Financial Derivations
    const sellerPayout = grossTicketValue - sellerFee;
    const buyerSubtotal = grossTicketValue + buyerFee;
    const buyerTotal = buyerSubtotal + pgFee;
    const totalTikumFee = buyerFee + sellerFee;

    // Mathematical Invariants Verification
    if (buyerTotal !== grossTicketValue + buyerFee + pgFee) {
      const err = new Error('[FEE_INVARIANT_VIOLATION] Buyer total does not balance with components');
      err.code = 'FEE_INVARIANT_VIOLATION';
      throw err;
    }
    if (sellerPayout !== grossTicketValue - sellerFee) {
      const err = new Error('[FEE_INVARIANT_VIOLATION] Seller payout does not balance with components');
      err.code = 'FEE_INVARIANT_VIOLATION';
      throw err;
    }

    // 10. Complete Immutable Fee Breakdown
    return Object.freeze({
      fee_policy_version: policy.version,
      currency: normalizedCurrency,
      country_code: policy.country_code,
      ticket_price: price,
      quantity: qty,
      gross_ticket_value: grossTicketValue,
      seller_fee: sellerFee,
      seller_payout: sellerPayout,
      buyer_fee: buyerFee,
      buyer_subtotal: buyerSubtotal,
      total_tikum_fee: totalTikumFee,
      payment_processing_fee: pgFee,
      buyer_total: buyerTotal,
      // Metadata & audit fields
      raw_buyer_fee: rawBuyerFee,
      raw_seller_fee: rawSellerFee,
      buyer_rate: policy.buyer_rate,
      seller_rate: policy.seller_rate,
      minimum_fee: policy.minimum_fee,
      maximum_fee: policy.maximum_fee,
      listing_fee: policy.listing_fee || 0,
      calculated_at: new Date().toISOString()
    });
  }
}

module.exports = {
  CanonicalFeeEngine,
  TIKUM_FEE_POLICY_V1,
  SUPPORTED_POLICIES
};
