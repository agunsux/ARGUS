/**
 * Tikum Canonical Frontend Pricing & Fee Engine
 * 
 * Synchronized with src/config/pricingConfig.js on the server.
 * SINGLE SOURCE OF TRUTH for client-side fee calculations and previews.
 */
(function() {
  const PRICING_CONFIG = Object.freeze({
    MIN_LISTING_PRICE_IDR: 500000,
    MAX_MARKUP_PCT: 30,
    PLATFORM_FEE_PCT: 6,
    PILOT_BUYER_FEE_PCT: 6,
    PILOT_SELLER_FEE_PCT: 6,
    NORMAL_BUYER_FEE_PCT: 7,
    NORMAL_SELLER_FEE_PCT: 7,
    PLATFORM_MIN_FEE_IDR: 35000,
    PLATFORM_MAX_FEE_IDR: 500000,
    CURRENCY: 'IDR'
  });

  function calculatePlatformFee(grossTicketValue) {
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

  function calculatePricing(price, quantity, paymentProcessingFee) {
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

  function validateListingPrice(price, faceValue) {
    const numericPrice = parseInt(price, 10);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return { valid: false, error: 'Harga tiket harus berupa nominal angka positif yang valid.' };
    }
    if (numericPrice < PRICING_CONFIG.MIN_LISTING_PRICE_IDR) {
      return {
        valid: false,
        error: `Harga tiket minimal ${formatIDR(PRICING_CONFIG.MIN_LISTING_PRICE_IDR)} untuk periode pilot.`
      };
    }
    const parsedFace = parseInt(faceValue, 10);
    if (!isNaN(parsedFace) && parsedFace > 0) {
      const maxAllowed = Math.floor(parsedFace * (1 + PRICING_CONFIG.MAX_MARKUP_PCT / 100));
      if (numericPrice > maxAllowed) {
        return {
          valid: false,
          error: `Harga tiket melebihi batas markup maksimum ${PRICING_CONFIG.MAX_MARKUP_PCT}% dari harga resmi promotor (maksimal ${formatIDR(maxAllowed)}).`
        };
      }
    }
    return { valid: true };
  }

  function simulateTransactionPricing(params) {
    const p = params || {};
    const numericPrice = parseInt(p.price, 10) || 0;
    const qty = parseInt(p.quantity, 10) || 1;
    const picFee = p.picAssisted ? (parseInt(p.picAllocationFee, 10) || 0) : 0;
    const pgFee = parseInt(p.paymentProcessingFee, 10) || 0;

    if (numericPrice <= 0) {
      return {
        ticket_base_price: 0,
        buyer_service_fee: 0,
        seller_service_fee: 0,
        pic_allocation_fee: 0,
        payment_processing_fee: 0,
        total_paid_by_buyer: 0,
        net_payout_seller: 0,
        effective_buyer_fee_pct: 0,
        effective_seller_fee_pct: 0,
        effective_total_fee_pct: 0,
        currency: PRICING_CONFIG.CURRENCY,
        standard_plan_reference: {
          planned_rate_description: 'Tarif standar normal: 7% Pembeli + 7% Penjual.',
          active_pilot_description: 'Tarif periode pilot: 6% Pembeli + 6% Penjual (Min Rp35.000, Maks Rp500.000).'
        }
      };
    }

    const gross = numericPrice * qty;
    const rawBuyerFee = Math.round((gross * PRICING_CONFIG.PILOT_BUYER_FEE_PCT) / 100);
    let buyerFee = Math.max(rawBuyerFee, PRICING_CONFIG.PLATFORM_MIN_FEE_IDR);
    if (PRICING_CONFIG.PLATFORM_MAX_FEE_IDR && buyerFee > PRICING_CONFIG.PLATFORM_MAX_FEE_IDR) buyerFee = PRICING_CONFIG.PLATFORM_MAX_FEE_IDR;

    const rawSellerFee = Math.round((gross * PRICING_CONFIG.PILOT_SELLER_FEE_PCT) / 100);
    let sellerFee = Math.max(rawSellerFee, PRICING_CONFIG.PLATFORM_MIN_FEE_IDR);
    if (PRICING_CONFIG.PLATFORM_MAX_FEE_IDR && sellerFee > PRICING_CONFIG.PLATFORM_MAX_FEE_IDR) sellerFee = PRICING_CONFIG.PLATFORM_MAX_FEE_IDR;
    if (sellerFee > gross) sellerFee = gross;

    const totalPaid = gross + buyerFee + picFee + pgFee;
    const netPayout = gross - sellerFee;

    const effBuyer = Number(((buyerFee / gross) * 100).toFixed(2));
    const effSeller = Number(((sellerFee / gross) * 100).toFixed(2));
    const effTotal = Number((((buyerFee + sellerFee) / gross) * 100).toFixed(2));

    return {
      ticket_base_price: gross,
      unit_price: numericPrice,
      quantity: qty,
      buyer_service_fee: buyerFee,
      seller_service_fee: sellerFee,
      pic_allocation_fee: picFee,
      payment_processing_fee: pgFee,
      total_paid_by_buyer: totalPaid,
      net_payout_seller: netPayout,
      effective_buyer_fee_pct: effBuyer,
      effective_seller_fee_pct: effSeller,
      effective_total_fee_pct: effTotal,
      currency: PRICING_CONFIG.CURRENCY,
      standard_plan_reference: {
        planned_rate_description: 'Tarif standar normal: 7% Pembeli + 7% Penjual.',
        active_pilot_description: 'Tarif periode pilot: 6% Pembeli + 6% Penjual (Min Rp35.000, Maks Rp500.000).',
        standard_buyer_pct: PRICING_CONFIG.NORMAL_BUYER_FEE_PCT,
        standard_seller_pct: PRICING_CONFIG.NORMAL_SELLER_FEE_PCT,
        pilot_buyer_pct: PRICING_CONFIG.PILOT_BUYER_FEE_PCT,
        pilot_seller_pct: PRICING_CONFIG.PILOT_SELLER_FEE_PCT,
        is_pilot_active: true
      }
    };
  }

  window.TikumPricing = {
    CONFIG: PRICING_CONFIG,
    calculatePlatformFee: calculatePlatformFee,
    calculatePricing: calculatePricing,
    calculateFeeBreakdown: calculatePricing,
    simulateTransactionPricing: simulateTransactionPricing,
    formatIDR: formatIDR,
    validateListingPrice: validateListingPrice
  };
})();
