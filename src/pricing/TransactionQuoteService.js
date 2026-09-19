/**
 * TIKUM / ARGUS — Transaction Quote Service
 * 
 * Generates and locks immutable transaction quotes before checkout.
 * 
 * Mathematical Invariants:
 * 1. BUYER_DISPLAYED_TOTAL === ticket_price + buyer_platform_fee + buyer_tax (PPN)
 * 2. SELLER_DISPLAYED_NET_PAYOUT === ticket_price - seller_platform_fee - seller_tax_withholding (PPh 22)
 * 3. DOUBLE_ENTRY_SUM === Total Inflow (buyer_total) === Total Distribution (seller_payout + platform_revenue + tax_payable)
 * 4. PRICE LOCK: Quote remains fixed and immutable for TTL (default 15 minutes) during checkout.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { MarketplacePricingEngine } = require('./MarketplacePricingEngine');
const { TaxEngine } = require('./TaxEngine');

const QUOTE_STATUS = {
  ACTIVE: 'ACTIVE',
  CONSUMED: 'CONSUMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

class TransactionQuoteService {
  /**
   * Initialize quotes table in state
   */
  static init() {
    if (!state.quotes) {
      state.quotes = [];
    }
  }

  /**
   * Generate an authoritative, immutable transaction quote
   * 
   * @param {Object} params
   * @param {string} params.listingId - Listing being purchased
   * @param {number} params.ticketPrice - Final agreed ticket price (IDR)
   * @param {string} params.buyerId - Prospective buyer
   * @param {string} [params.sellerId] - Seller ID (resolved from listing if omitted)
   * @param {string} [params.pricingPolicyVersion='2026.1-ID-DEFAULT']
   * @param {string} [params.taxPolicyVersion='2026.1-ID-TAX']
   * @param {number} [params.ttlMinutes=15] - Quote validity duration
   */
  static async generateQuote({
    listingId,
    ticketPrice,
    buyerId,
    sellerId = null,
    pricingPolicyVersion = '2026.1-ID-DEFAULT',
    taxPolicyVersion = '2026.1-ID-TAX',
    transactionDate = null,
    ttlMinutes = 15
  }) {
    this.init();

    const price = parseInt(ticketPrice, 10);
    if (isNaN(price) || price <= 0) {
      const err = new Error(`Invalid ticket price for quote: ${ticketPrice}`);
      err.code = 'INVALID_TICKET_PRICE';
      throw err;
    }

    // Resolve seller and seller profile if not provided
    let effectiveSellerId = sellerId;
    if (!effectiveSellerId && listingId) {
      const listing = state.listings.find(l => l.id === listingId);
      if (listing) effectiveSellerId = listing.seller_id;
    }

    const sellerProfile = state.seller_profiles?.find(sp => sp.user_id === effectiveSellerId) || {};
    const sellerTaxProfile = {
      seller_type: sellerProfile.seller_type || 'INDIVIDUAL',
      spt_declaration_submitted: sellerProfile.spt_declaration_submitted === true,
      annual_turnover: sellerProfile.annual_turnover || 0,
      tax_exempt: sellerProfile.tax_exempt === true,
      exemption_reason: sellerProfile.exemption_reason || null
    };

    // 1. Calculate two-sided platform fees
    const fees = MarketplacePricingEngine.calculateFees({
      ticketPrice: price,
      policyVersion: pricingPolicyVersion
    });

    // 2. Calculate separated tax liabilities with effective-date awareness
    const effectiveTxDate = transactionDate || new Date().toISOString();
    const taxes = TaxEngine.calculateTax({
      ticketPrice: price,
      buyerPlatformFee: fees.buyer_fee,
      sellerTaxProfile,
      transactionDate: effectiveTxDate,
      taxPolicyVersion
    });

    // 3. Compute final totals
    const buyerTotal = price + fees.buyer_fee + taxes.total_buyer_tax;
    const sellerNetPayout = price - fees.seller_fee - taxes.total_seller_tax_withholding;
    const platformGrossRevenue = fees.buyer_fee + fees.seller_fee;
    const totalTaxLiability = taxes.total_tax_collected;

    // Mathematical Invariant Checks
    if (buyerTotal !== price + fees.buyer_fee + taxes.total_buyer_tax) {
      const err = new Error('Quote calculation invariant violation: Buyer total mismatch');
      err.code = 'QUOTE_INVARIANT_VIOLATION';
      throw err;
    }

    if (sellerNetPayout !== price - fees.seller_fee - taxes.total_seller_tax_withholding) {
      const err = new Error('Quote calculation invariant violation: Seller payout mismatch');
      err.code = 'QUOTE_INVARIANT_VIOLATION';
      throw err;
    }

    // Balancing Invariant: buyerTotal === sellerNetPayout + platformGrossRevenue + totalTaxLiability
    const distributionSum = sellerNetPayout + platformGrossRevenue + totalTaxLiability;
    if (buyerTotal !== distributionSum) {
      const err = new Error(
        `Double-entry quote balance violation: Inflow (${buyerTotal}) does not match Outflow (${distributionSum})`
      );
      err.code = 'QUOTE_BALANCE_VIOLATION';
      throw err;
    }

    const quoteId = `quo-${uuidv4()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();

    const quote = {
      id: quoteId,
      quote_id: quoteId,
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: effectiveSellerId,
      ticket_price: price,
      currency: fees.currency || 'IDR',
      buyer_platform_fee: fees.buyer_fee,
      seller_platform_fee: fees.seller_fee,
      total_platform_fee: platformGrossRevenue,
      buyer_tax_amount: taxes.total_buyer_tax,
      seller_tax_withholding: taxes.total_seller_tax_withholding,
      total_tax_amount: totalTaxLiability,
      buyer_total: buyerTotal,
      seller_net_payout: sellerNetPayout,
      platform_gross_revenue: platformGrossRevenue,
      pricing_breakdown: fees,
      tax_breakdown: taxes,
      transaction_date: effectiveTxDate,
      tax_policy_effective_from: taxes.pph22_effective_from,
      pph22_is_effective: taxes.pph22_is_effective_at_transaction_date,
      status: QUOTE_STATUS.ACTIVE,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      consumed_at: null,
      order_id: null
    };

    state.quotes.push(quote);

    await recordAuditLog('QUOTE', quoteId, 'GENERATED', buyerId || 'SYSTEM', {
      listing_id: listingId,
      ticket_price: price,
      buyer_total: buyerTotal,
      seller_net_payout: sellerNetPayout,
      expires_at: expiresAt
    });

    return quote;
  }

  /**
   * Retrieve quote by ID with auto-expiry check
   */
  static getQuote(quoteId) {
    this.init();
    const quote = state.quotes.find(q => q.id === quoteId || q.quote_id === quoteId);
    if (!quote) return null;

    if (quote.status === QUOTE_STATUS.ACTIVE && new Date(quote.expires_at).getTime() < Date.now()) {
      quote.status = QUOTE_STATUS.EXPIRED;
    }

    return quote;
  }

  /**
   * Validate that a quote exists, is active, and is not expired
   */
  static validateQuote(quoteId) {
    const quote = this.getQuote(quoteId);
    if (!quote) {
      const err = new Error(`Transaction quote '${quoteId}' not found`);
      err.code = 'QUOTE_NOT_FOUND';
      throw err;
    }

    if (quote.status === QUOTE_STATUS.EXPIRED || new Date(quote.expires_at).getTime() < Date.now()) {
      quote.status = QUOTE_STATUS.EXPIRED;
      const err = new Error(`Transaction quote '${quoteId}' has expired`);
      err.code = 'QUOTE_EXPIRED';
      throw err;
    }

    if (quote.status === QUOTE_STATUS.CONSUMED) {
      const err = new Error(`Transaction quote '${quoteId}' has already been consumed by order ${quote.order_id}`);
      err.code = 'QUOTE_ALREADY_CONSUMED';
      throw err;
    }

    if (quote.status !== QUOTE_STATUS.ACTIVE) {
      const err = new Error(`Transaction quote '${quoteId}' is not active (status: ${quote.status})`);
      err.code = 'QUOTE_NOT_ACTIVE';
      throw err;
    }

    return quote;
  }

  /**
   * Consume quote when order is successfully created
   */
  static async consumeQuote(quoteId, orderId, actorId = 'SYSTEM') {
    const quote = this.validateQuote(quoteId);

    quote.status = QUOTE_STATUS.CONSUMED;
    quote.order_id = orderId;
    quote.consumed_at = new Date().toISOString();

    await recordAuditLog('QUOTE', quoteId, 'CONSUMED', actorId, {
      order_id: orderId,
      buyer_total: quote.buyer_total,
      seller_net_payout: quote.seller_net_payout
    });

    return quote;
  }
}

module.exports = {
  TransactionQuoteService,
  QUOTE_STATUS
};
