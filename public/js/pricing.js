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
    PLATFORM_MIN_FEE_IDR: 35000,
    PLATFORM_MAX_FEE_IDR: 300000,
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

  window.TikumPricing = {
    CONFIG: PRICING_CONFIG,
    calculatePlatformFee: calculatePlatformFee,
    calculatePricing: calculatePricing,
    calculateFeeBreakdown: calculatePricing,
    formatIDR: formatIDR,
    validateListingPrice: validateListingPrice
  };
})();
