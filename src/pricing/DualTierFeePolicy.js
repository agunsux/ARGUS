'use strict';

// V2 is deliberately explicit: callers must opt in until all order paths are migrated.
const FEE_POLICY_V2 = Object.freeze({
  version: 'V2_DUAL_TIER',
  currency: 'IDR',
  listing_fee: 0,
  minimum_listing_price: 500000,
  maximum_markup_percent: 30,
  tiers: Object.freeze({
    SELLER_MANAGED: Object.freeze({ rate_percent: 6, minimum_fee: 35000, maximum_fee: 300000 }),
    TIKUM_VENUE_PIC: Object.freeze({ rate_percent: 9, minimum_fee: 35000, maximum_fee: 450000 })
  })
});

function calculateDualTierFees({ ticketPrice, quantity = 1, fulfillmentType = 'SELLER_MANAGED' }) {
  if (!Number.isSafeInteger(ticketPrice) || ticketPrice <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new TypeError('ticketPrice and quantity must be positive safe integers');
  }
  const tier = FEE_POLICY_V2.tiers[fulfillmentType];
  if (!tier) throw new RangeError(`Unknown fulfillment type: ${fulfillmentType}`);
  // Integer arithmetic implements Math.round(price * rate / 100) without binary fraction drift.
  const price = BigInt(ticketPrice);
  const unitFee = Number((price * BigInt(tier.rate_percent) + 50n) / 100n);
  const feePerTicket = Math.max(tier.minimum_fee, Math.min(tier.maximum_fee, unitFee));
  const subtotal = ticketPrice * quantity;
  const fee = feePerTicket * quantity;
  if (![subtotal, fee, subtotal + fee, fee * 2].every(Number.isSafeInteger)) throw new RangeError('Order amount exceeds safe integer range');
  if (feePerTicket > ticketPrice) throw new RangeError('Fee cannot exceed ticket price');
  return Object.freeze({
    fee_policy_version: FEE_POLICY_V2.version,
    fulfillment_option: fulfillmentType,
    ticket_price: ticketPrice,
    quantity,
    ticket_subtotal: subtotal,
    buyer_fee_per_ticket: feePerTicket,
    seller_fee_per_ticket: feePerTicket,
    buyer_fee: fee,
    seller_fee: fee,
    buyer_total_amount: subtotal + fee,
    seller_net_payout: subtotal - fee,
    platform_revenue: fee * 2
  });
}

module.exports = { FEE_POLICY_V2, calculateDualTierFees };