/**
 * Tikum Canonical Frontend Pricing & Fee Engine (V1 + V2 Dual-Tier)
 *
 * Synchronized with src/pricing/DualTierFeePolicy.js and src/config/pricingConfig.js.
 * Consumes GET /api/config/fee-policy with exact matching local fallback constants.
 */
(function() {
  const PRICING_CONFIG = Object.freeze({
    MIN_LISTING_PRICE_IDR: 500000,
    MAX_MARKUP_PCT: 30,
    PLATFORM_FEE_PCT: 6,
    PLATFORM_MIN_FEE_IDR: 35000,
    PLATFORM_MAX_FEE_IDR: 300000,
    CURRENCY: 'IDR'
  });

  const FEE_POLICY_V2_DEFAULT = {
    version: 'V2_DUAL_TIER',
    currency: 'IDR',
    listing_fee: 0,
    minimum_listing_price: 500000,
    maximum_markup_percent: 30,
    tiers: {
      SELLER_MANAGED: { rate_percent: 6, minimum_fee: 35000, maximum_fee: 300000 },
      TIKUM_VENUE_PIC: { rate_percent: 9, minimum_fee: 35000, maximum_fee: 450000 }
    }
  };

  let runtimePolicyState = {
    loaded: false,
    active_policy_version: 'V2_DUAL_TIER',
    v2_dual_tier: FEE_POLICY_V2_DEFAULT,
    v1_policy: null
  };
  let policyFetchPromise = null;

  function loadFeePolicyConfig(forceRefresh) {
    if (runtimePolicyState.loaded && !forceRefresh) {
      return Promise.resolve(runtimePolicyState);
    }
    if (policyFetchPromise && !forceRefresh) {
      return policyFetchPromise;
    }
    if (typeof fetch !== 'function') {
      return Promise.resolve(runtimePolicyState);
    }
    policyFetchPromise = fetch('/api/config/fee-policy')
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(data) {
        if (data && data.active_policy_version) {
          runtimePolicyState = {
            loaded: true,
            active_policy_version: data.active_policy_version,
            v2_dual_tier: data.v2_dual_tier || FEE_POLICY_V2_DEFAULT,
            v1_policy: data.v1_policy || null
          };
        }
        return runtimePolicyState;
      })
      .catch(function() {
        return runtimePolicyState;
      });
    return policyFetchPromise;
  }

  function normalizeFulfillmentType(fulfillmentType) {
    const upper = String(fulfillmentType || '').trim().toUpperCase();
    if (upper === 'TIKUM_VENUE_PIC' || upper === 'VENUE_PIC') return 'TIKUM_VENUE_PIC';
    return 'SELLER_MANAGED';
  }

  function getTierRule(fulfillmentType) {
    const v2 = runtimePolicyState.v2_dual_tier || FEE_POLICY_V2_DEFAULT;
    const normalized = normalizeFulfillmentType(fulfillmentType);
    const tier = (v2.tiers && v2.tiers[normalized]) || FEE_POLICY_V2_DEFAULT.tiers[normalized];
    return {
      fulfillmentType: normalized,
      rate_percent: Number(tier.rate_percent || (normalized === 'TIKUM_VENUE_PIC' ? 9 : 6)),
      minimum_fee: Number(tier.minimum_fee || 35000),
      maximum_fee: Number(tier.maximum_fee || (normalized === 'TIKUM_VENUE_PIC' ? 450000 : 300000))
    };
  }

  function calculatePerTicketTierFee(unitPrice, ratePercent, minFee, maxFee) {
    const p = parseInt(unitPrice, 10);
    if (isNaN(p) || p <= 0) return 0;
    let rawFee;
    if (typeof BigInt === 'function') {
      rawFee = Number((BigInt(p) * BigInt(ratePercent) + 50n) / 100n);
    } else {
      rawFee = Math.round((p * ratePercent) / 100);
    }
    let fee = Math.max(minFee, Math.min(maxFee, rawFee));
    if (fee > p) fee = p;
    return fee;
  }

  function calculateDualTierFees(params) {
    const opts = params || {};
    const numericPrice = parseInt(opts.ticketPrice, 10) || 0;
    const qty = Math.max(1, parseInt(opts.quantity, 10) || 1);
    const pgFee = parseInt(opts.paymentProcessingFee, 10) || 0;
    const forceV1 = opts.policyVersion === 'TIKUM_FEE_POLICY_V1' ||
      (!opts.policyVersion && runtimePolicyState.loaded && runtimePolicyState.active_policy_version === 'TIKUM_FEE_POLICY_V1');

    const normalizedFulfillment = normalizeFulfillmentType(opts.fulfillmentType);
    const rule = forceV1
      ? {
          fulfillmentType: normalizedFulfillment,
          rate_percent: PRICING_CONFIG.PLATFORM_FEE_PCT,
          minimum_fee: PRICING_CONFIG.PLATFORM_MIN_FEE_IDR,
          maximum_fee: PRICING_CONFIG.PLATFORM_MAX_FEE_IDR
        }
      : getTierRule(normalizedFulfillment);

    if (numericPrice <= 0) {
      return {
        policy_version: forceV1 ? 'TIKUM_FEE_POLICY_V1' : 'V2_DUAL_TIER',
        fee_policy_version: forceV1 ? 'TIKUM_FEE_POLICY_V1' : 'V2_DUAL_TIER',
        fulfillment_option: rule.fulfillmentType,
        rate_percent: rule.rate_percent,
        minimum_fee: rule.minimum_fee,
        maximum_fee: rule.maximum_fee,
        price: 0,
        unitPrice: 0,
        unitFee: 0,
        unitSellerPayout: 0,
        quantity: qty,
        grossTicketValue: 0,
        grossTicketPrice: 0,
        ticket_subtotal: 0,
        fee: 0,
        buyerFee: 0,
        sellerFee: 0,
        buyer_fee_per_ticket: 0,
        seller_fee_per_ticket: 0,
        buyer_fee: 0,
        seller_fee: 0,
        sellerPayout: 0,
        seller_net_payout: 0,
        buyerSubtotal: 0,
        buyerTotal: pgFee,
        buyer_total_amount: pgFee,
        paymentProcessingFee: pgFee,
        currency: PRICING_CONFIG.CURRENCY
      };
    }

    const subtotal = numericPrice * qty;
    const unitFee = forceV1
      ? calculatePerTicketTierFee(subtotal, rule.rate_percent, rule.minimum_fee, rule.maximum_fee)
      : calculatePerTicketTierFee(numericPrice, rule.rate_percent, rule.minimum_fee, rule.maximum_fee);
    const totalSideFee = forceV1 ? unitFee : unitFee * qty;
    const unitFeeDisplay = forceV1 ? Math.round(totalSideFee / qty) : unitFee;
    const buyerSubtotal = subtotal + totalSideFee;
    const buyerTotal = buyerSubtotal + pgFee;
    const sellerPayout = subtotal - totalSideFee;
    const unitSellerPayout = Math.round(sellerPayout / qty);

    return {
      policy_version: forceV1 ? 'TIKUM_FEE_POLICY_V1' : 'V2_DUAL_TIER',
      fee_policy_version: forceV1 ? 'TIKUM_FEE_POLICY_V1' : 'V2_DUAL_TIER',
      fulfillment_option: rule.fulfillmentType,
      rate_percent: rule.rate_percent,
      minimum_fee: rule.minimum_fee,
      maximum_fee: rule.maximum_fee,
      price: numericPrice,
      unitPrice: numericPrice,
      unitFee: unitFeeDisplay,
      unitSellerPayout: unitSellerPayout,
      quantity: qty,
      grossTicketValue: subtotal,
      grossTicketPrice: subtotal,
      ticket_subtotal: subtotal,
      fee: totalSideFee,
      buyerFee: totalSideFee,
      sellerFee: totalSideFee,
      buyer_fee_per_ticket: unitFeeDisplay,
      seller_fee_per_ticket: unitFeeDisplay,
      buyer_fee: totalSideFee,
      seller_fee: totalSideFee,
      sellerPayout: sellerPayout,
      seller_net_payout: sellerPayout,
      buyerSubtotal: buyerSubtotal,
      buyerTotal: buyerTotal,
      buyer_total_amount: buyerTotal,
      paymentProcessingFee: pgFee,
      currency: PRICING_CONFIG.CURRENCY
    };
  }

  function calculatePlatformFee(grossTicketValue, fulfillmentType) {
    if (fulfillmentType) {
      return calculateDualTierFees({ ticketPrice: grossTicketValue, quantity: 1, fulfillmentType: fulfillmentType }).fee;
    }
    const amount = parseInt(grossTicketValue, 10);
    if (isNaN(amount) || amount <= 0) return 0;
    const rawFee = Math.round((amount * PRICING_CONFIG.PLATFORM_FEE_PCT) / 100);
    let fee = Math.max(rawFee, PRICING_CONFIG.PLATFORM_MIN_FEE_IDR);
    if (PRICING_CONFIG.PLATFORM_MAX_FEE_IDR && fee > PRICING_CONFIG.PLATFORM_MAX_FEE_IDR) {
      fee = PRICING_CONFIG.PLATFORM_MAX_FEE_IDR;
    }
    if (fee > amount) fee = amount;
    return fee;
  }

  function calculatePricing(price, quantity, paymentProcessingFee, options) {
    if (options && (options.fulfillmentType || options.policyVersion === 'V2_DUAL_TIER')) {
      return calculateDualTierFees({
        ticketPrice: price,
        quantity: quantity,
        fulfillmentType: options.fulfillmentType || 'SELLER_MANAGED',
        paymentProcessingFee: paymentProcessingFee,
        policyVersion: options.policyVersion || null
      });
    }

    const numericPrice = parseInt(price, 10) || 0;
    const qty = parseInt(quantity, 10) || 1;
    const pgFee = parseInt(paymentProcessingFee, 10) || 0;

    if (numericPrice <= 0) {
      return {
        price: 0,
        quantity: qty,
        grossTicketValue: 0,
        fee: 0,
        sellerPayout: 0,
        buyerSubtotal: 0,
        buyerTotal: 0,
        paymentProcessingFee: pgFee,
        currency: PRICING_CONFIG.CURRENCY
      };
    }

    const grossTicketValue = numericPrice * qty;
    const fee = calculatePlatformFee(grossTicketValue);
    const sellerPayout = grossTicketValue - fee;
    const buyerSubtotal = grossTicketValue + fee;
    const buyerTotal = buyerSubtotal + pgFee;
    const unitFee = Math.round(fee / qty);
    const unitSellerPayout = Math.round(sellerPayout / qty);

    return {
      price: numericPrice,
      unitPrice: numericPrice,
      unitFee: unitFee,
      unitSellerPayout: unitSellerPayout,
      quantity: qty,
      grossTicketValue: grossTicketValue,
      grossTicketPrice: grossTicketValue,
      fee: fee,
      sellerFee: fee,
      sellerPayout: sellerPayout,
      buyerSubtotal: buyerSubtotal,
      buyerTotal: buyerTotal,
      paymentProcessingFee: pgFee,
      currency: PRICING_CONFIG.CURRENCY
    };
  }

  function formatIDR(amount) {
    return 'Rp ' + (amount || 0).toLocaleString('id-ID');
  }

  function formatMoneyLocalized(amount) {
    if (typeof window !== 'undefined' && window.TikumI18n && typeof window.TikumI18n.formatCurrency === 'function') {
      return window.TikumI18n.formatCurrency(amount, 'IDR');
    }
    return formatIDR(amount);
  }

  function translatePricingText(key, fallback) {
    if (typeof window !== 'undefined' && window.TikumI18n && typeof window.TikumI18n.t === 'function') {
      return window.TikumI18n.t(key, fallback);
    }
    return fallback;
  }

  function validateListingPrice(price, faceValue) {
    const numericPrice = parseInt(price, 10);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return {
        valid: false,
        error: translatePricingText('create.errPriceInvalid', 'Harga tiket harus berupa nominal angka positif yang valid.')
      };
    }
    if (numericPrice < PRICING_CONFIG.MIN_LISTING_PRICE_IDR) {
      const tpl = translatePricingText('create.errPriceMin', 'Harga tiket minimal {minPrice} per tiket.');
      return {
        valid: false,
        error: tpl.replace('{minPrice}', formatMoneyLocalized(PRICING_CONFIG.MIN_LISTING_PRICE_IDR))
      };
    }
    const parsedFace = parseInt(faceValue, 10);
    if (!isNaN(parsedFace) && parsedFace > 0) {
      const maxAllowed = Math.floor(parsedFace * (1 + PRICING_CONFIG.MAX_MARKUP_PCT / 100));
      if (numericPrice > maxAllowed) {
        const tpl = translatePricingText(
          'create.errPriceMarkup',
          'Harga tiket melebihi batas markup maksimum {pct}% dari harga resmi promotor (maksimal {maxAllowed}).'
        );
        return {
          valid: false,
          error: tpl
            .replace('{pct}', String(PRICING_CONFIG.MAX_MARKUP_PCT))
            .replace('{maxAllowed}', formatMoneyLocalized(maxAllowed))
        };
      }
    }
    return { valid: true };
  }

  window.TikumPricing = {
    CONFIG: PRICING_CONFIG,
    FEE_POLICY_V2_DEFAULT: FEE_POLICY_V2_DEFAULT,
    loadFeePolicyConfig: loadFeePolicyConfig,
    getRuntimePolicyState: function() { return runtimePolicyState; },
    getTierRule: getTierRule,
    normalizeFulfillmentType: normalizeFulfillmentType,
    calculateDualTierFees: calculateDualTierFees,
    calculatePlatformFee: calculatePlatformFee,
    calculatePricing: calculatePricing,
    calculateFeeBreakdown: calculatePricing,
    formatIDR: formatIDR,
    validateListingPrice: validateListingPrice
  };
})();
