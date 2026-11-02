/**
 * Tikum Canonical Pricing & Fee Configuration
 * 
 * THE SINGLE SOURCE OF TRUTH for platform fee rates, minimum listing prices,
 * and maximum markup caps across the pilot.
 */

const PRICING_CONFIG = Object.freeze({
  MIN_LISTING_PRICE_IDR: 500000,
  MAX_MARKUP_PCT: 30,
  PLATFORM_FEE_PCT: 6,
  PLATFORM_MIN_FEE_IDR: 35000,
  PLATFORM_MAX_FEE_IDR: 300000,
  CURRENCY: 'IDR'
});

/**
 * Deterministic integer platform fee calculation.
 * Formula: max(round(grossTicketValue * PLATFORM_FEE_PCT / 100), PLATFORM_MIN_FEE_IDR)
 * Clamped between [PLATFORM_MIN_FEE_IDR, min(PLATFORM_MAX_FEE_IDR, grossTicketValue)]
 *
 * @param {number} grossTicketValue - Gross ticket amount in IDR
 * @returns {number} Calculated fee in IDR
 */
function calculatePlatformFee(grossTicketValue) {
  const amount = typeof grossTicketValue === 'number' ? grossTicketValue : parseInt(grossTicketValue, 10);
  if (isNaN(amount) || amount <= 0) return 0;

  const rawFee = Math.round((amount * PRICING_CONFIG.PLATFORM_FEE_PCT) / 100);
  let fee = Math.max(rawFee, PRICING_CONFIG.PLATFORM_MIN_FEE_IDR);
  if (PRICING_CONFIG.PLATFORM_MAX_FEE_IDR && fee > PRICING_CONFIG.PLATFORM_MAX_FEE_IDR) {
    fee = PRICING_CONFIG.PLATFORM_MAX_FEE_IDR;
  }
  // Payout guard: fee cannot exceed gross ticket value
  if (fee > amount) {
    fee = amount;
  }
  return fee;
}

/**
 * Single pricing calculation function used across all surfaces:
 * form, preview, checkout, and backend order services.
 * 
 * Returns: harga jual, fee, bersih untuk penjual (sellerPayout), total pembeli (buyerTotal).
 *
 * @param {number|string} price - Selling price per ticket in IDR
 * @param {number} [quantity=1] - Number of tickets
 * @param {number} [paymentProcessingFee=0] - Explicit payment processing fee
 * @returns {Object} Complete transparent breakdown
 */
function calculatePricing(price, quantity = 1, paymentProcessingFee = 0) {
  const numericPrice = typeof price === 'number' ? price : parseInt(price, 10);
  const qty = typeof quantity === 'number' ? quantity : parseInt(quantity, 10) || 1;
  const pgFee = typeof paymentProcessingFee === 'number' ? paymentProcessingFee : parseInt(paymentProcessingFee || 0, 10) || 0;

  if (isNaN(numericPrice) || numericPrice <= 0) {
    return {
      price: 0,
      unitPrice: 0,
      unitFee: 0,
      unitSellerPayout: 0,
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
    unitFee,
    unitSellerPayout,
    quantity: qty,
    grossTicketValue,
    grossTicketPrice: grossTicketValue,
    fee,
    sellerFee: fee,
    sellerPayout,
    buyerSubtotal,
    buyerTotal,
    paymentProcessingFee: pgFee,
    currency: PRICING_CONFIG.CURRENCY
  };
}

/**
 * Fee breakdown helper alias
 */
function calculateFeeBreakdown(ticketPrice, quantity = 1, paymentProcessingFee = 0) {
  return calculatePricing(ticketPrice, quantity, paymentProcessingFee);
}

/**
 * Validate listing price against minimum floor and maximum markup cap.
 *
 * Requirements:
 * - Reject if price < MIN_LISTING_PRICE_IDR (Rp 500.000)
 * - If face value is known (via faceValue param or event data):
 *     Reject if price > faceValue * 1.30
 * - If face value is missing:
 *     Skip markup cap and flag listing for manual review (needsManualReview: true)
 *
 * @param {Object} params
 * @param {number|string} params.price - Ticket asking price
 * @param {number|string} [params.faceValue] - Ticket original face value (if provided)
 * @param {Object} [params.event] - Event object (to look up event face_value/min_price)
 * @param {number} [params.configuredMarkupPct] - Explicitly configured markup cap (e.g. 20, 25, 30)
 * @returns {{ valid: boolean, error?: string, code?: string, needsManualReview: boolean, resolvedFaceValue?: number|null, maxAllowedPrice?: number, effectiveMarkupPct?: number }}
 */
function validateListingPrice({ price, faceValue, event, configuredMarkupPct = null }) {
  const numericPrice = typeof price === 'number' ? price : parseInt(price, 10);
  if (isNaN(numericPrice) || numericPrice <= 0) {
    return {
      valid: false,
      error: 'Harga tiket harus berupa nominal angka positif yang valid.',
      code: 'INVALID_PRICE',
      needsManualReview: false
    };
  }

  // 1. Minimum listing price floor (Pilot: Rp 500.000)
  if (numericPrice < PRICING_CONFIG.MIN_LISTING_PRICE_IDR) {
    return {
      valid: false,
      error: `Harga tiket minimal Rp ${PRICING_CONFIG.MIN_LISTING_PRICE_IDR.toLocaleString('id-ID')} untuk periode pilot.`,
      code: 'PRICE_BELOW_MINIMUM',
      needsManualReview: false
    };
  }

  // 2. Resolve face value from parameter or event metadata
  let resolvedFaceValue = null;
  const parsedFaceValue = parseInt(faceValue, 10);
  if (!isNaN(parsedFaceValue) && parsedFaceValue > 0) {
    resolvedFaceValue = parsedFaceValue;
  } else if (event) {
    const evFace = parseInt(event.face_value, 10);
    const evMin = parseInt(event.min_price, 10);
    const evPrimary = parseInt(event.primary_price_min, 10);
    if (!isNaN(evFace) && evFace > 0) {
      resolvedFaceValue = evFace;
    } else if (!isNaN(evMin) && evMin > 0) {
      resolvedFaceValue = evMin;
    } else if (!isNaN(evPrimary) && evPrimary > 0) {
      resolvedFaceValue = evPrimary;
    }
  }

  // 3. Markup cap validation: if face value exists, price cannot exceed (1 + markupPct / 100)
  if (resolvedFaceValue && resolvedFaceValue > 0) {
    let markupPct = PRICING_CONFIG.MAX_MARKUP_PCT;
    if (configuredMarkupPct !== null && configuredMarkupPct !== undefined) {
      markupPct = Math.min(Math.max(configuredMarkupPct, 0), PRICING_CONFIG.MAX_MARKUP_PCT);
    } else if (event?.max_markup_pct || event?.metadata?.max_markup_pct) {
      const eventMarkup = parseInt(event.max_markup_pct || event.metadata.max_markup_pct, 10);
      if (!isNaN(eventMarkup) && eventMarkup > 0) {
        // Anti-scalping security invariant: Event metadata may tighten the markup cap (e.g. to 20%),
        // but can NEVER silently expand past the global platform maximum ceiling (30%).
        markupPct = Math.min(eventMarkup, PRICING_CONFIG.MAX_MARKUP_PCT);
      }
    }
    const maxAllowedPrice = Math.floor(resolvedFaceValue * (1 + markupPct / 100));
    if (numericPrice > maxAllowedPrice) {
      return {
        valid: false,
        error: `Harga tiket melebihi batas markup maksimum ${markupPct}% dari harga resmi promotor (maksimal Rp ${maxAllowedPrice.toLocaleString('id-ID')}).`,
        code: 'PRICE_EXCEEDS_MARKUP_CAP',
        needsManualReview: false,
        resolvedFaceValue,
        maxAllowedPrice,
        effectiveMarkupPct: markupPct
      };
    }
    return {
      valid: true,
      needsManualReview: false,
      resolvedFaceValue,
      maxAllowedPrice,
      effectiveMarkupPct: markupPct
    };
  }

  // 4. Face value missing: markup cap skipped, listing enters manual review queue
  return {
    valid: true,
    needsManualReview: true,
    resolvedFaceValue: null
  };
}

module.exports = {
  PRICING_CONFIG,
  calculatePlatformFee,
  calculatePricing,
  calculateFeeBreakdown,
  validateListingPrice
};
