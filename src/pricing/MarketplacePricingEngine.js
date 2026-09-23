/**
 * TIKUM / ARGUS — Marketplace Pricing Engine
 * 
 * Two-Sided Marketplace Pricing Model (Indonesia & Regional ASEAN).
 * 
 * Core Invariants:
 * - BUYER_DISPLAYED_TOTAL === BUYER_ACTUALLY_CHARGED (Zero hidden fees)
 * - SELLER_DISPLAYED_NET_PAYOUT === SELLER_ACTUALLY_SETTLED
 * - Platform fee policies are versioned, configurable, and auditable.
 * - Standard Indonesia Policy (2026.1-ID-DEFAULT):
 *   - Buyer Fee: 5% of ticket price (Min Rp 15,000, Max Rp 500,000)
 *   - Seller Fee: 5% of ticket price (Min Rp 15,000, Max Rp 500,000)
 * - Legacy Fallback Policy (LEGACY-BUYER-10PCT):
 *   - Buyer Fee: 10% of ticket price (No floor/cap)
 *   - Seller Fee: 0%
 */

const { state, recordAuditLog } = require('../database');
const { CanonicalFeeEngine, TIKUM_FEE_POLICY_V1 } = require('./CanonicalFeeEngine');

const DEFAULT_POLICIES = {
  'TIKUM_FEE_POLICY_V1': {
    version: 'TIKUM_FEE_POLICY_V1',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Standard Tikum Canonical Fee Policy V1 (6% Buyer + 6% Seller, Min Rp10k, Max Rp300k)',
    buyer_rate: 0.06,
    buyer_min_fee: 10000,
    buyer_max_fee: 300000,
    seller_rate: 0.06,
    seller_min_fee: 10000,
    seller_max_fee: 300000,
    is_active: true,
    effective_from: '2026-01-01T00:00:00Z'
  },
  '2026.1-ID-DEFAULT': {
    version: '2026.1-ID-DEFAULT',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Historical Indonesia Two-Sided Marketplace Policy (5% + 5%, Min 15k, Max 500k)',
    buyer_rate: 0.05,
    buyer_min_fee: 15000,
    buyer_max_fee: 500000,
    seller_rate: 0.05,
    seller_min_fee: 15000,
    seller_max_fee: 500000,
    is_active: false,
    effective_from: '2026-01-01T00:00:00Z'
  },
  'LEGACY-BUYER-10PCT': {
    version: 'LEGACY-BUYER-10PCT',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Historical Pilot Policy: 10% Buyer Fee, 0% Seller Fee (No Min/Max)',
    buyer_rate: 0.10,
    buyer_min_fee: 0,
    buyer_max_fee: Infinity,
    seller_rate: 0.00,
    seller_min_fee: 0,
    seller_max_fee: 0,
    is_active: false,
    effective_from: '2026-01-01T00:00:00Z'
  }
};

class MarketplacePricingEngine {
  /**
   * Initialize and seed pricing policies in state
   */
  static init() {
    if (!state.pricing_policies) {
      state.pricing_policies = [];
    }
    for (const key of Object.keys(DEFAULT_POLICIES)) {
      const exists = state.pricing_policies.find(p => p.version === key);
      if (!exists) {
        state.pricing_policies.push({ ...DEFAULT_POLICIES[key] });
      }
    }
    if (!state.pricing_audit_logs) {
      state.pricing_audit_logs = [];
    }
  }

  /**
   * Retrieve active pricing policy by version
   */
  static getPolicy(version = 'TIKUM_FEE_POLICY_V1') {
    this.init();
    const targetVersion = version || 'TIKUM_FEE_POLICY_V1';
    const policy = state.pricing_policies.find(p => p.version === targetVersion);
    if (!policy) {
      // Fallback to default in-memory definition if state was reset without init
      if (DEFAULT_POLICIES[targetVersion]) {
        return DEFAULT_POLICIES[targetVersion];
      }
      return DEFAULT_POLICIES['TIKUM_FEE_POLICY_V1'];
    }
    return policy;
  }

  /**
   * List all registered pricing policies
   */
  static listPolicies() {
    this.init();
    return [...state.pricing_policies];
  }

  /**
   * Register or update a pricing policy (Admin restricted)
   */
  static async registerPolicy(policyConfig, actorId = 'SYSTEM') {
    this.init();
    const {
      version,
      country_code = 'ID',
      currency = 'IDR',
      description = '',
      buyer_rate,
      buyer_min_fee = 0,
      buyer_max_fee = Infinity,
      seller_rate,
      seller_min_fee = 0,
      seller_max_fee = Infinity,
      is_active = true
    } = policyConfig;

    if (!version || typeof buyer_rate !== 'number' || typeof seller_rate !== 'number') {
      const err = new Error('Invalid policy configuration: version, buyer_rate, and seller_rate are required numbers');
      err.code = 'INVALID_POLICY_CONFIG';
      throw err;
    }

    const newPolicy = {
      version,
      country_code,
      currency,
      description,
      buyer_rate,
      buyer_min_fee,
      buyer_max_fee,
      seller_rate,
      seller_min_fee,
      seller_max_fee,
      is_active,
      updated_at: new Date().toISOString()
    };

    const existingIdx = state.pricing_policies.findIndex(p => p.version === version);
    if (existingIdx >= 0) {
      state.pricing_policies[existingIdx] = newPolicy;
    } else {
      newPolicy.created_at = new Date().toISOString();
      state.pricing_policies.push(newPolicy);
    }

    state.pricing_audit_logs.push({
      id: `pal-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      action: existingIdx >= 0 ? 'POLICY_UPDATED' : 'POLICY_REGISTERED',
      policy_version: version,
      actor_id: actorId,
      details: newPolicy,
      timestamp: new Date().toISOString()
    });

    return newPolicy;
  }

  /**
   * Calculate two-sided platform fees for a ticket price
   * 
   * @param {Object} params
   * @param {number} params.ticketPrice - Final ticket price in integer units (IDR)
   * @param {number} [params.quantity=1] - Multi-ticket order count
   * @param {string} [params.policyVersion='TIKUM_FEE_POLICY_V1']
   * @param {string} [params.currency='IDR']
   * @param {string} [params.countryCode='ID']
   */
  static calculateFees({
    ticketPrice,
    quantity = 1,
    policyVersion = 'TIKUM_FEE_POLICY_V1',
    currency = 'IDR',
    countryCode = 'ID'
  }) {
    const targetPolicy = policyVersion || 'TIKUM_FEE_POLICY_V1';

    // If target is canonical V1, delegate directly to CanonicalFeeEngine
    if (targetPolicy === 'TIKUM_FEE_POLICY_V1') {
      const canonical = CanonicalFeeEngine.calculateTicketFees({
        ticketPrice,
        quantity,
        currency,
        policyVersion: 'TIKUM_FEE_POLICY_V1'
      });
      return {
        policy_version: canonical.fee_policy_version,
        currency: canonical.currency,
        country_code: canonical.country_code || countryCode,
        ticket_price: canonical.ticket_price,
        quantity: canonical.quantity,
        gross_ticket_value: canonical.gross_ticket_value,
        buyer_fee: canonical.buyer_fee,
        seller_fee: canonical.seller_fee,
        raw_buyer_fee: canonical.raw_buyer_fee,
        raw_seller_fee: canonical.raw_seller_fee,
        buyer_rate: canonical.buyer_rate,
        seller_rate: canonical.seller_rate,
        buyer_min_fee: canonical.minimum_fee,
        buyer_max_fee: canonical.maximum_fee,
        seller_min_fee: canonical.minimum_fee,
        seller_max_fee: canonical.maximum_fee,
        total_platform_fee: canonical.total_tikum_fee,
        seller_payout: canonical.seller_payout,
        buyer_subtotal: canonical.buyer_subtotal,
        buyer_total: canonical.buyer_total
      };
    }

    const price = parseInt(ticketPrice, 10);
    if (isNaN(price) || price <= 0) {
      const err = new Error(`[INVALID_TICKET_PRICE] Ticket price must be a positive integer, got: ${ticketPrice}`);
      err.code = 'INVALID_TICKET_PRICE';
      throw err;
    }

    const policy = this.getPolicy(targetPolicy);

    // 1. Calculate raw Buyer Fee
    const rawBuyerFee = Math.round(price * policy.buyer_rate);
    let buyerFee = rawBuyerFee;
    if (policy.buyer_min_fee !== undefined && buyerFee < policy.buyer_min_fee) {
      buyerFee = policy.buyer_min_fee;
    }
    if (policy.buyer_max_fee !== undefined && buyerFee > policy.buyer_max_fee) {
      buyerFee = policy.buyer_max_fee;
    }

    // 2. Calculate raw Seller Fee
    const rawSellerFee = Math.round(price * policy.seller_rate);
    let sellerFee = rawSellerFee;
    if (policy.seller_min_fee !== undefined && sellerFee < policy.seller_min_fee) {
      sellerFee = policy.seller_min_fee;
    }
    if (policy.seller_max_fee !== undefined && sellerFee > policy.seller_max_fee) {
      sellerFee = policy.seller_max_fee;
    }

    // Protection: Seller fee cannot exceed ticket price (no negative net payout)
    if (sellerFee > price) {
      sellerFee = price;
    }

    const totalPlatformFee = buyerFee + sellerFee;

    return {
      policy_version: policy.version,
      currency: policy.currency || currency,
      country_code: policy.country_code || countryCode,
      ticket_price: price,
      buyer_fee: buyerFee,
      seller_fee: sellerFee,
      raw_buyer_fee: rawBuyerFee,
      raw_seller_fee: rawSellerFee,
      buyer_rate: policy.buyer_rate,
      seller_rate: policy.seller_rate,
      buyer_min_fee: policy.buyer_min_fee,
      buyer_max_fee: policy.buyer_max_fee,
      seller_min_fee: policy.seller_min_fee,
      seller_max_fee: policy.seller_max_fee,
      total_platform_fee: totalPlatformFee
    };
  }
}

module.exports = {
  MarketplacePricingEngine,
  DEFAULT_POLICIES
};
