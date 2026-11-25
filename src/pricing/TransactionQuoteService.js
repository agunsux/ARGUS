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
const { CanonicalFeeEngine, SUPPORTED_POLICIES } = require('./CanonicalFeeEngine');
const { TaxEngine } = require('./TaxEngine');
const { FEE_POLICY_V2, calculateDualTierFees } = require('./DualTierFeePolicy');
const { PRICING_CONFIG } = require('../config/pricingConfig');

const VALID_FULFILLMENT_OPTIONS = new Set(['SELLER_MANAGED', 'TIKUM_VENUE_PIC']);

const QUOTE_STATUS = {
  ACTIVE: 'ACTIVE',
  CONSUMED: 'CONSUMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

function parseMetadata(rawMeta) {
  if (rawMeta && typeof rawMeta === 'object') return rawMeta;
  if (typeof rawMeta === 'string') {
    try { return JSON.parse(rawMeta); } catch (_) { return {}; }
  }
  return {};
}

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
   * Generate an authoritative, immutable transaction quote bound to durable listing/offer state.
   */
  static async generateQuote({
    listingId,
    ticketPrice = null,
    quantity = 1,
    buyerId,
    sellerId = null,
    offerId = null,
    paymentProcessingFee = 0,
    pricingPolicyVersion = null,
    taxPolicyVersion = null,
    transactionDate = null,
    ttlMinutes = 15
  }) {
    this.init();

    if (!buyerId || typeof buyerId !== 'string' || !buyerId.trim()) {
      const err = new Error('buyerId is required to generate an immutable transaction quote');
      err.code = 'BUYER_REQUIRED';
      err.status = 400;
      throw err;
    }

    if (!listingId || typeof listingId !== 'string' || !listingId.trim()) {
      const err = new Error('listingId is required to generate a transaction quote');
      err.code = 'LISTING_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const qty = parseInt(quantity || 1, 10);
    if (isNaN(qty) || qty <= 0) {
      const err = new Error(`Invalid quantity for quote: ${quantity}`);
      err.code = 'INVALID_QUANTITY';
      err.status = 400;
      throw err;
    }

    const pgFee = parseInt(paymentProcessingFee || 0, 10);
    if (isNaN(pgFee) || pgFee < 0) {
      const err = new Error(`Invalid payment processing fee: ${paymentProcessingFee}`);
      err.code = 'INVALID_PAYMENT_FEE';
      err.status = 400;
      throw err;
    }

    const requestedPolicy = String(
      pricingPolicyVersion || PRICING_CONFIG.ACTIVE_FEE_POLICY_VERSION || 'TIKUM_FEE_POLICY_V1'
    ).trim();
    const isV2Policy = requestedPolicy === FEE_POLICY_V2.version;
    if (!isV2Policy && !Object.prototype.hasOwnProperty.call(SUPPORTED_POLICIES, requestedPolicy)) {
      const err = new Error(`Unsupported fee policy version '${requestedPolicy}'`);
      err.code = 'UNSUPPORTED_FEE_POLICY_VERSION';
      err.status = 400;
      throw err;
    }

    // Always resolve listing authoritatively from MarketplaceRepository (PostgreSQL first)
    const { getMarketplaceRepository, getMoneyRepository } = require('../storage');
    const marketplaceRepo = getMarketplaceRepository();
    const moneyRepo = getMoneyRepository();

    const listing = await marketplaceRepo.getListingById(listingId, { strictRepositoryOnly: true });
    if (!listing) {
      const err = new Error(`Listing '${listingId}' not found`);
      err.code = 'LISTING_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const meta = parseMetadata(listing.metadata);
    const rawFulfillment = listing.fulfillment_type || meta.fulfillment_type || meta.fulfillment_option || null;
    if (!rawFulfillment || !VALID_FULFILLMENT_OPTIONS.has(String(rawFulfillment).trim())) {
      const err = new Error(`Listing '${listingId}' lacks a valid persisted fulfillment_type`);
      err.code = 'INVALID_FULFILLMENT_TYPE';
      err.status = 400;
      throw err;
    }
    const fulfillment = String(rawFulfillment).trim();

    let authoritativeUnitPrice = parseInt(listing.price, 10);
    let verifiedOfferId = null;
    if (offerId) {
      const offer = typeof marketplaceRepo.getOfferById === 'function'
        ? await marketplaceRepo.getOfferById(offerId)
        : null;
      if (!offer) {
        const err = new Error(`Offer '${offerId}' not found`);
        err.code = 'OFFER_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (String(offer.listing_id) !== String(listing.id) || String(offer.buyer_id) !== String(buyerId)) {
        const err = new Error(`Offer '${offerId}' does not match listing '${listingId}' and buyer '${buyerId}'`);
        err.code = 'QUOTE_CONTEXT_MISMATCH';
        err.status = 422;
        throw err;
      }
      if (!['PENDING', 'COUNTERED', 'ACCEPTED'].includes(String(offer.status || '').toUpperCase())) {
        const err = new Error(`Offer '${offerId}' is not active (status: ${offer.status})`);
        err.code = 'OFFER_NOT_ACTIVE';
        err.status = 409;
        throw err;
      }
      const offerAmt = offer.agreed_amount ?? offer.counter_amount ?? offer.offer_amount;
      authoritativeUnitPrice = parseInt(offerAmt, 10);
      verifiedOfferId = offer.id;
    }

    if (!Number.isSafeInteger(authoritativeUnitPrice) || authoritativeUnitPrice <= 0) {
      const err = new Error(`Listing '${listingId}' has invalid authoritative ticket price`);
      err.code = 'INVALID_TICKET_PRICE';
      err.status = 400;
      throw err;
    }

    if (ticketPrice !== undefined && ticketPrice !== null) {
      const suppliedPrice = Number(ticketPrice);
      if (!Number.isSafeInteger(suppliedPrice) || suppliedPrice !== authoritativeUnitPrice) {
        const err = new Error(`Client ticketPrice (${ticketPrice}) mismatches authoritative price (${authoritativeUnitPrice})`);
        err.code = 'PRICE_MISMATCH';
        err.status = 422;
        throw err;
      }
    }

    const price = authoritativeUnitPrice;
    const effectiveSellerId = sellerId || listing.seller_id;
    const currency = String(listing.currency || 'IDR').trim().toUpperCase();

    const sellerProfile = (state.seller_profiles || []).find(sp => sp.user_id === effectiveSellerId) || {};
    const sellerTaxProfile = {
      seller_type: sellerProfile.seller_type || 'INDIVIDUAL',
      spt_declaration_submitted: sellerProfile.spt_declaration_submitted === true,
      annual_turnover: sellerProfile.annual_turnover || 0,
      tax_exempt: sellerProfile.tax_exempt === true,
      exemption_reason: sellerProfile.exemption_reason || null
    };

    // 1. Compute two-sided platform fees cleanly per explicit requestedPolicy
    let fees;
    if (isV2Policy) {
      const calculated = calculateDualTierFees({
        ticketPrice: price,
        quantity: qty,
        fulfillmentType: fulfillment
      });
      fees = {
        ...calculated,
        policy_version: FEE_POLICY_V2.version,
        fee_policy_version: FEE_POLICY_V2.version,
        currency,
        gross_ticket_value: calculated.ticket_subtotal,
        total_platform_fee: calculated.platform_revenue,
        buyer_rate: FEE_POLICY_V2.tiers[fulfillment].rate_percent / 100
      };
    } else {
      const v1Fees = CanonicalFeeEngine.calculateTicketFees({
        ticketPrice: price,
        quantity: qty,
        paymentProcessingFee: pgFee,
        currency,
        policyVersion: requestedPolicy
      });
      fees = {
        ...v1Fees,
        policy_version: v1Fees.fee_policy_version,
        total_platform_fee: v1Fees.total_tikum_fee
      };
    }

    const grossTicketValue = fees.gross_ticket_value || (price * qty);

    // 2. Calculate separated tax liabilities with effective-date awareness
    const effectiveTxDate = transactionDate || new Date().toISOString();
    const resolvedTaxPolicyVersion = taxPolicyVersion ||
      (requestedPolicy === 'LEGACY-BUYER-10PCT' ? 'ZERO-TAX-TEST' : TaxEngine.getDefaultTaxPolicyVersion());
    const taxes = TaxEngine.calculateTax({
      ticketPrice: grossTicketValue,
      buyerPlatformFee: fees.buyer_fee,
      sellerTaxProfile,
      transactionDate: effectiveTxDate,
      taxPolicyVersion: resolvedTaxPolicyVersion
    });

    // 3. Compute final totals
    const buyerSubtotal = grossTicketValue + fees.buyer_fee;
    const buyerTotal = buyerSubtotal + pgFee + taxes.total_buyer_tax;
    const sellerNetPayout = grossTicketValue - fees.seller_fee - taxes.total_seller_tax_withholding;
    const platformGrossRevenue = fees.buyer_fee + fees.seller_fee;
    const totalTaxLiability = taxes.total_tax_collected;

    if (buyerTotal !== grossTicketValue + fees.buyer_fee + pgFee + taxes.total_buyer_tax) {
      const err = new Error('Quote calculation invariant violation: Buyer total mismatch');
      err.code = 'QUOTE_INVARIANT_VIOLATION';
      throw err;
    }

    if (sellerNetPayout !== grossTicketValue - fees.seller_fee - taxes.total_seller_tax_withholding) {
      const err = new Error('Quote calculation invariant violation: Seller payout mismatch');
      err.code = 'QUOTE_INVARIANT_VIOLATION';
      throw err;
    }

    const distributionSum = sellerNetPayout + platformGrossRevenue + totalTaxLiability + pgFee;
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
      offer_id: verifiedOfferId,
      ticket_price: price,
      quantity: qty,
      gross_ticket_value: grossTicketValue,
      currency,
      fee_policy_version: requestedPolicy,
      pricing_policy_version: requestedPolicy,
      buyer_platform_fee: fees.buyer_fee,
      seller_platform_fee: fees.seller_fee,
      buyer_fee: fees.buyer_fee,
      seller_fee: fees.seller_fee,
      total_platform_fee: platformGrossRevenue,
      total_tikum_fee: platformGrossRevenue,
      payment_processing_fee: pgFee,
      buyer_tax_amount: taxes.total_buyer_tax,
      seller_tax_withholding: taxes.total_seller_tax_withholding,
      total_tax_amount: totalTaxLiability,
      buyer_subtotal: buyerSubtotal,
      buyer_total: buyerTotal,
      buyer_total_amount: buyerTotal,
      seller_net_payout: sellerNetPayout,
      platform_revenue: platformGrossRevenue,
      fulfillment_option: fulfillment,
      platform_gross_revenue: platformGrossRevenue,
      pricing_breakdown: fees,
      tax_breakdown: taxes,
      transaction_date: effectiveTxDate,
      tax_policy_version: taxes.tax_policy_version || resolvedTaxPolicyVersion,
      tax_policy_effective_from: taxes.pph22_effective_from,
      pph22_is_effective: taxes.pph22_is_effective_at_transaction_date,
      status: QUOTE_STATUS.ACTIVE,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      consumed_at: null,
      consumed_by_order_id: null,
      order_id: null
    };

    try {
      await moneyRepo.createQuote({
        quote_id: quoteId,
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: effectiveSellerId,
        offer_id: verifiedOfferId,
        ticket_price: price,
        quantity: qty,
        gross_ticket_value: grossTicketValue,
        fulfillment_option: fulfillment,
        buyer_fee: fees.buyer_fee,
        seller_fee: fees.seller_fee,
        buyer_tax: taxes.total_buyer_tax,
        seller_tax: taxes.total_seller_tax_withholding,
        payment_fee: pgFee,
        buyer_total: buyerTotal,
        seller_payout: sellerNetPayout,
        currency,
        pricing_policy_version: requestedPolicy,
        tax_policy_version: quote.tax_policy_version,
        status: QUOTE_STATUS.ACTIVE,
        expires_at: expiresAt
      });
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL || (moneyRepo && !moneyRepo.degraded)) {
        throw repoErr;
      }
    }

    state.quotes.push(quote);

    await recordAuditLog('QUOTE', quoteId, 'GENERATED', buyerId || 'SYSTEM', {
      listing_id: listingId,
      ticket_price: price,
      quantity: qty,
      fulfillment_option: fulfillment,
      fee_policy_version: requestedPolicy,
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
   * Retrieve authoritative quote by ID from durable MoneyRepository first
   */
  static async getQuoteById(quoteId, txContext = null) {
    if (!quoteId) return null;
    try {
      const { getMoneyRepository } = require('../storage');
      const moneyRepo = getMoneyRepository();
      const dbQuote = await moneyRepo.getQuoteById(quoteId, txContext);
      if (dbQuote) {
        const ticketPrice = parseInt(dbQuote.ticket_price, 10);
        const qty = parseInt(dbQuote.quantity, 10) || 1;
        const normalized = {
          id: dbQuote.quote_id,
          quote_id: dbQuote.quote_id,
          listing_id: dbQuote.listing_id,
          buyer_id: dbQuote.buyer_id,
          seller_id: dbQuote.seller_id,
          offer_id: dbQuote.offer_id || null,
          ticket_price: ticketPrice,
          quantity: qty,
          gross_ticket_value: dbQuote.gross_ticket_value !== undefined && dbQuote.gross_ticket_value !== null
            ? parseInt(dbQuote.gross_ticket_value, 10)
            : ticketPrice * qty,
          fulfillment_option: dbQuote.fulfillment_option || null,
          buyer_platform_fee: parseInt(dbQuote.buyer_fee, 10) || 0,
          seller_platform_fee: parseInt(dbQuote.seller_fee, 10) || 0,
          buyer_fee: parseInt(dbQuote.buyer_fee, 10) || 0,
          seller_fee: parseInt(dbQuote.seller_fee, 10) || 0,
          total_platform_fee: (parseInt(dbQuote.buyer_fee, 10) || 0) + (parseInt(dbQuote.seller_fee, 10) || 0),
          buyer_tax_amount: parseInt(dbQuote.buyer_tax, 10) || 0,
          seller_tax_withholding: parseInt(dbQuote.seller_tax, 10) || 0,
          payment_processing_fee: parseInt(dbQuote.payment_fee, 10) || 0,
          buyer_subtotal: (ticketPrice * qty) + (parseInt(dbQuote.buyer_fee, 10) || 0),
          buyer_total: parseInt(dbQuote.buyer_total, 10),
          seller_net_payout: parseInt(dbQuote.seller_payout, 10),
          currency: dbQuote.currency || 'IDR',
          fee_policy_version: dbQuote.pricing_policy_version || 'TIKUM_FEE_POLICY_V1',
          pricing_policy_version: dbQuote.pricing_policy_version || 'TIKUM_FEE_POLICY_V1',
          tax_policy_version: dbQuote.tax_policy_version || '2026.1-ID-TAX',
          status: dbQuote.status,
          expires_at: dbQuote.expires_at,
          consumed_at: dbQuote.consumed_at,
          consumed_by_order_id: dbQuote.consumed_by_order_id || null,
          order_id: dbQuote.consumed_by_order_id || null,
          created_at: dbQuote.created_at
        };
        if (normalized.status === QUOTE_STATUS.ACTIVE && new Date(normalized.expires_at).getTime() <= Date.now()) {
          normalized.status = QUOTE_STATUS.EXPIRED;
        }
        return normalized;
      }
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw repoErr;
      }
    }
    return this.getQuote(quoteId);
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

    if (quote.status === QUOTE_STATUS.EXPIRED || new Date(quote.expires_at).getTime() <= Date.now()) {
      quote.status = QUOTE_STATUS.EXPIRED;
      const err = new Error(`Transaction quote '${quoteId}' has expired`);
      err.code = 'QUOTE_EXPIRED';
      throw err;
    }

    if (quote.status === QUOTE_STATUS.CONSUMED || quote.consumed_by_order_id) {
      const err = new Error(`Transaction quote '${quoteId}' has already been consumed by order ${quote.order_id || quote.consumed_by_order_id}`);
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
   * Atomic CAS quote consumption bound to full order context inside UnitOfWork.
   */
  static async consumeQuoteForOrder(quoteId, expectedContext = {}, txContext = null) {
    const { getMoneyRepository } = require('../storage');
    const moneyRepo = getMoneyRepository();
    const consumedDbQuote = await moneyRepo.consumeQuoteForOrder(quoteId, expectedContext, txContext);

    const localQuote = (state.quotes || []).find(q => q.id === quoteId || q.quote_id === quoteId);
    const consumedOrderId = expectedContext.order_id || expectedContext.orderId || consumedDbQuote.consumed_by_order_id || null;
    if (localQuote) {
      localQuote.status = QUOTE_STATUS.CONSUMED;
      localQuote.order_id = consumedOrderId;
      localQuote.consumed_by_order_id = consumedOrderId;
      localQuote.consumed_at = consumedDbQuote.consumed_at || new Date().toISOString();
    }

    await recordAuditLog('QUOTE', quoteId, 'CONSUMED', expectedContext.buyer_id || expectedContext.buyerId || 'SYSTEM', {
      order_id: consumedOrderId,
      buyer_total: Number(consumedDbQuote.buyer_total),
      seller_net_payout: Number(consumedDbQuote.seller_payout)
    });

    return {
      ...consumedDbQuote,
      id: consumedDbQuote.quote_id || quoteId,
      order_id: consumedOrderId,
      buyer_total: Number(consumedDbQuote.buyer_total),
      seller_net_payout: Number(consumedDbQuote.seller_payout),
      buyer_platform_fee: Number(consumedDbQuote.buyer_fee || 0),
      seller_platform_fee: Number(consumedDbQuote.seller_fee || 0),
      buyer_tax_amount: Number(consumedDbQuote.buyer_tax || 0),
      seller_tax_withholding: Number(consumedDbQuote.seller_tax || 0),
      payment_processing_fee: Number(consumedDbQuote.payment_fee || 0),
      fee_policy_version: consumedDbQuote.pricing_policy_version
    };
  }

  /**
   * Consume quote when order is created (delegates to consumeQuoteForOrder when context is provided)
   */
  static async consumeQuote(quoteId, orderIdOrContext, actorId = 'SYSTEM', txContext = null) {
    if (orderIdOrContext && typeof orderIdOrContext === 'object') {
      return await this.consumeQuoteForOrder(quoteId, orderIdOrContext, txContext);
    }
    const orderId = orderIdOrContext;
    return await this.consumeQuoteForOrder(quoteId, { order_id: orderId }, txContext);
  }
}

module.exports = {
  TransactionQuoteService,
  QUOTE_STATUS
};
