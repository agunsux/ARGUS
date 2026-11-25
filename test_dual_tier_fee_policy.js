'use strict';

const assert = require('assert');
const { FEE_POLICY_V2, calculateDualTierFees } = require('./src/pricing/DualTierFeePolicy');

for (const [tier, amount, expected] of [
  ['SELLER_MANAGED', 500000, 35000],
  ['SELLER_MANAGED', 1000000, 60000],
  ['SELLER_MANAGED', 10000000, 300000],
  ['TIKUM_VENUE_PIC', 500000, 45000],
  ['TIKUM_VENUE_PIC', 1000000, 90000],
  ['TIKUM_VENUE_PIC', 10000000, 450000]
]) {
  for (const quantity of [1, 3]) {
    const result = calculateDualTierFees({ ticketPrice: amount, quantity, fulfillmentType: tier });
    assert.strictEqual(result.buyer_fee, expected * quantity);
    assert.strictEqual(result.seller_fee, expected * quantity);
    assert.strictEqual(result.buyer_total_amount, result.seller_net_payout + result.platform_revenue);
  }
}
assert.strictEqual(calculateDualTierFees({ ticketPrice: 1000000 }).fulfillment_option, 'SELLER_MANAGED');
assert.strictEqual(calculateDualTierFees({ ticketPrice: 1000009 }).buyer_fee, 60001);
assert.throws(() => calculateDualTierFees({ ticketPrice: 1000000, fulfillmentType: 'UNKNOWN' }), /Unknown fulfillment/);
assert.strictEqual(FEE_POLICY_V2.minimum_listing_price, 500000);
assert.strictEqual(FEE_POLICY_V2.maximum_markup_percent, 30);
console.log('PASS: isolated V2 fee calculations, tier fallback, per-ticket caps and balance');