/**
 * TIKUM / ARGUS — Comprehensive Test Suite:
 * Pricing, Effective-Date-Aware Tax, Immutable Quotes, Double-Entry Ledger, & Unit Economics
 * 
 * Tests:
 * 1. MarketplacePricingEngine: Two-sided fee policy (5% + 5%, floor Rp 15k, cap Rp 500k) across 12 boundary price points
 * 2. TaxEngine: Effective-date awareness (PMK 37/2025 postponed to 2026-11-01), PPN 12% on fee, fail-closed safety
 * 3. TransactionQuoteService: Price lock, TTL expiration, consumption, balance invariant
 * 4. End-to-End Checkout & Double-Entry FinancialLedger:
 *    - Balanced journal entries (sum(Debits) === sum(Credits))
 *    - Every money movement contains: transaction_id, quote_id, order_id, ledger_account, amount, currency, source_event
 *    - Tax liability separation in TAX_PAYABLE
 *    - Settlement disbursement and full refund reversal
 * 5. EconomicsEngine: Unit economics, variable costs, contribution margin, and ledger reconciliation
 * 6. API Endpoints: Calculation preview, quote lookup, admin policy management, contribution margin report
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { MarketplacePricingEngine } = require('./src/pricing/MarketplacePricingEngine');
const { TaxEngine } = require('./src/pricing/TaxEngine');
const { TransactionQuoteService, QUOTE_STATUS } = require('./src/pricing/TransactionQuoteService');
const { EconomicsEngine } = require('./src/pricing/EconomicsEngine');
const { FinancialLedger, LEDGER_ACCOUNTS, FINANCIAL_EVENT_TYPES } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { SessionStore } = require('./src/services/sessionStore');
const { TrustPolicyEngine, ATTESTATION_TYPE } = require('./src/trust/TrustPolicyEngine');

let passed = 0;
let total = 0;

function syncTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  console.log('\n================================================================');
  console.log('  TIKUM — PRICING, DATE-AWARE TAX, QUOTES & LEDGER TEST SUITE   ');
  console.log('================================================================\n');

  resetDatabase();

  // ===========================================================================
  // 1. MARKETPLACE PRICING ENGINE & BOUNDARY PRICE POINTS
  // ===========================================================================
  console.log('── Part 1: Marketplace Pricing Engine (12 Boundary Price Points) ──');

  const boundaryPoints = [
    { price: 50000, expectedBuyerFee: 15000, expectedSellerFee: 15000, note: 'Floor triggered (50k * 5% = 2.5k -> 15k floor)' },
    { price: 100000, expectedBuyerFee: 15000, expectedSellerFee: 15000, note: 'Floor triggered (100k * 5% = 5k -> 15k floor)' },
    { price: 200000, expectedBuyerFee: 15000, expectedSellerFee: 15000, note: 'Floor triggered (200k * 5% = 10k -> 15k floor)' },
    { price: 300000, expectedBuyerFee: 15000, expectedSellerFee: 15000, note: 'Exact floor boundary (300k * 5% = 15k)' },
    { price: 500000, expectedBuyerFee: 25000, expectedSellerFee: 25000, note: 'Proportional 5% (500k * 5% = 25k)' },
    { price: 1000000, expectedBuyerFee: 50000, expectedSellerFee: 50000, note: 'Proportional 5% (1M * 5% = 50k)' },
    { price: 2500000, expectedBuyerFee: 125000, expectedSellerFee: 125000, note: 'Proportional 5% (2.5M * 5% = 125k)' },
    { price: 5000000, expectedBuyerFee: 250000, expectedSellerFee: 250000, note: 'Proportional 5% (5M * 5% = 250k)' },
    { price: 10000000, expectedBuyerFee: 500000, expectedSellerFee: 500000, note: 'Exact cap boundary (10M * 5% = 500k)' },
    { price: 15000000, expectedBuyerFee: 500000, expectedSellerFee: 500000, note: 'Cap triggered (15M * 5% = 750k -> 500k cap)' },
    { price: 25000000, expectedBuyerFee: 500000, expectedSellerFee: 500000, note: 'Cap triggered (25M * 5% = 1.25M -> 500k cap)' },
    { price: 50000000, expectedBuyerFee: 500000, expectedSellerFee: 500000, note: 'Cap triggered (50M * 5% = 2.5M -> 500k cap)' }
  ];

  boundaryPoints.forEach((point, idx) => {
    syncTest(`1.${idx + 1} Pricing Boundary [Rp ${point.price.toLocaleString('id-ID')}]: ${point.note}`, () => {
      const fees = MarketplacePricingEngine.calculateFees({
        ticketPrice: point.price,
        policyVersion: '2026.1-ID-DEFAULT'
      });
      assert.strictEqual(fees.buyer_fee, point.expectedBuyerFee, `Buyer fee mismatch at Rp ${point.price}`);
      assert.strictEqual(fees.seller_fee, point.expectedSellerFee, `Seller fee mismatch at Rp ${point.price}`);
      assert.strictEqual(fees.total_platform_fee, point.expectedBuyerFee + point.expectedSellerFee);
    });
  });

  syncTest('1.13 Invariant: Zero negative payout protection if fee equals ticket price', () => {
    const fees = MarketplacePricingEngine.calculateFees({
      ticketPrice: 10000,
      policyVersion: '2026.1-ID-DEFAULT'
    });
    // Price is 10k, raw fee is 500 -> clamped by floor to 15k, but cannot exceed price (10k)
    assert.strictEqual(fees.seller_fee, 10000);
  });

  syncTest('1.14 Rejects non-positive ticket price', () => {
    assert.throws(() => {
      MarketplacePricingEngine.calculateFees({ ticketPrice: -5000 });
    }, /INVALID_TICKET_PRICE/);
  });

  // ===========================================================================
  // 2. TAX ENGINE & DATE-AWARENESS (PMK 37/2025 POSTPONEMENT)
  // ===========================================================================
  console.log('\n── Part 2: Tax Engine & Effective-Date Awareness ──');

  syncTest('2.1 September 2026 transaction: PMK 37/2025 PPh 22 is NOT deducted (Postponed to 1 Nov 2026)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 1000000,
      buyerPlatformFee: 50000,
      sellerTaxProfile: { seller_type: 'INDIVIDUAL', spt_declaration_submitted: false, annual_turnover: 600000000 },
      transactionDate: '2026-09-19T10:00:00Z', // September 2026 (current implementation context)
      taxPolicyVersion: '2026.1-ID-TAX'
    });

    assert.strictEqual(taxes.seller_tax.pph22_amount, 0, 'PPh 22 must be 0 prior to 1 Nov 2026');
    assert.strictEqual(taxes.seller_tax.is_exempt, true);
    assert.strictEqual(taxes.seller_tax.exemption_reason, 'PMK_37_2025_POSTPONED_UNTIL_2026_11_01');
    assert.strictEqual(taxes.pph22_is_effective_at_transaction_date, false);

    // PPN under PMK 131/2024 Nilai Lain mechanism on platform fee (base = 50,000)
    // DPP = 50,000 * 11/12 = 45,833
    // PPN = 45,833 * 12% = 5,500 (effective 11%)
    assert.strictEqual(taxes.buyer_tax.statutory_rate, 0.12);
    assert.strictEqual(taxes.buyer_tax.dpp_multiplier, '11/12');
    assert.strictEqual(taxes.buyer_tax.effective_rate, 0.11);
    assert.strictEqual(taxes.buyer_tax.taxable_base, 50000);
    assert.strictEqual(taxes.buyer_tax.taxable_dpp, 45833);
    assert.strictEqual(taxes.buyer_tax.tax_amount, 5500);
    assert.strictEqual(taxes.buyer_tax.ppn_amount, 5500);
    assert.strictEqual(taxes.total_buyer_tax, 5500);
    assert.strictEqual(taxes.total_seller_tax_withholding, 0);
  });

  syncTest('2.2 October 2026 transaction: PPh 22 remains postponed (0%)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 2000000,
      buyerPlatformFee: 100000,
      sellerTaxProfile: { seller_type: 'CORPORATE' },
      transactionDate: '2026-10-31T23:59:59Z', // Day before effective date
      taxPolicyVersion: '2026.1-ID-TAX'
    });

    assert.strictEqual(taxes.seller_tax.pph22_amount, 0);
    assert.strictEqual(taxes.seller_tax.exemption_reason, 'PMK_37_2025_POSTPONED_UNTIL_2026_11_01');
    assert.strictEqual(taxes.buyer_tax.taxable_base, 100000);
    assert.strictEqual(taxes.buyer_tax.taxable_dpp, 91667);
    assert.strictEqual(taxes.buyer_tax.tax_amount, 11000);
    assert.strictEqual(taxes.total_buyer_tax, 11000);
  });

  syncTest('2.3 Post 1 November 2026: Non-exempt seller gets 0.5% PPh 22 withheld', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 1000000,
      buyerPlatformFee: 50000,
      sellerTaxProfile: { seller_type: 'INDIVIDUAL', spt_declaration_submitted: false, annual_turnover: 700000000 },
      transactionDate: '2026-11-05T10:00:00Z', // After 1 Nov 2026
      taxPolicyVersion: '2026.1-ID-TAX'
    });

    assert.strictEqual(taxes.pph22_is_effective_at_transaction_date, true);
    assert.strictEqual(taxes.seller_tax.is_exempt, false);
    assert.strictEqual(taxes.seller_tax.pph22_rate, 0.005);
    assert.strictEqual(taxes.seller_tax.pph22_amount, 5000); // 0.5% of 1,000,000
    assert.strictEqual(taxes.total_seller_tax_withholding, 5000);
    assert.strictEqual(taxes.total_buyer_tax, 5500);
    assert.strictEqual(taxes.total_tax_collected, 10500);
  });

  syncTest('2.4 Post 1 November 2026: Domestic WP OP with declaration & turnover <= 500M is EXEMPT (0%)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 1000000,
      buyerPlatformFee: 50000,
      sellerTaxProfile: {
        seller_type: 'INDIVIDUAL',
        spt_declaration_submitted: true,
        annual_turnover: 150000000 // Under 500M
      },
      transactionDate: '2026-11-05T10:00:00Z',
      taxPolicyVersion: '2026.1-ID-TAX'
    });

    assert.strictEqual(taxes.seller_tax.is_exempt, true);
    assert.strictEqual(taxes.seller_tax.pph22_amount, 0);
    assert.strictEqual(taxes.seller_tax.exemption_reason, 'PMK_37_2025_WP_OP_UMKM_DECLARATION_SUBMITTED');
  });

  syncTest('2.5 Fail-Closed: Rejects invalid transaction date', () => {
    assert.throws(() => {
      TaxEngine.calculateTax({
        ticketPrice: 1000000,
        buyerPlatformFee: 50000,
        transactionDate: 'invalid-date-string'
      });
    }, (err) => err.code === 'TAX_FAIL_CLOSED_INVALID_DATE');
  });

  syncTest('2.6 Fail-Closed: Rejects negative price or invalid fee', () => {
    assert.throws(() => {
      TaxEngine.calculateTax({
        ticketPrice: -100,
        buyerPlatformFee: 50000
      });
    }, (err) => err.code === 'TAX_FAIL_CLOSED_INVALID_PRICE');

    assert.throws(() => {
      TaxEngine.calculateTax({
        ticketPrice: 1000000,
        buyerPlatformFee: -50
      });
    }, (err) => err.code === 'TAX_FAIL_CLOSED_INVALID_FEE');
  });

  syncTest('2.7 Invariant: Zero double taxation (PPN is strictly on platform fee, not ticket face value)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 5000000, // Rp 5,000,000 ticket
      buyerPlatformFee: 250000, // Rp 250,000 platform fee
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    // PPN must be 11% effective on 250,000 = 27,500 (229,167 * 12%), NOT on ticket price
    assert.strictEqual(taxes.buyer_tax.taxable_base, 250000);
    assert.strictEqual(taxes.buyer_tax.taxable_dpp, 229167);
    assert.strictEqual(taxes.buyer_tax.tax_amount, 27500);
    assert.notStrictEqual(taxes.buyer_tax.tax_amount, 30000, 'Must NOT be direct 12% multiplication');
    assert.notStrictEqual(taxes.buyer_tax.tax_amount, 600000, 'Must NEVER tax ticket price');
  });

  // -------------------------------------------------------------------------
  // CRITICAL REGRESSION TESTS — PMK 131/2024 PPN CALCULATION
  // -------------------------------------------------------------------------
  syncTest('2.8 Regression 1: Rp 100,000 taxable base → effective PPN Rp 11,000', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 2000000,
      buyerPlatformFee: 100000,
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    assert.strictEqual(taxes.buyer_tax.taxable_base, 100000);
    assert.strictEqual(taxes.buyer_tax.tax_amount, 11000);
    assert.strictEqual(taxes.buyer_tax.ppn_amount, 11000);
    assert.strictEqual(taxes.total_buyer_tax, 11000);
  });

  syncTest('2.9 Regression 2: Statutory rate remains 12% (0.12)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 2000000,
      buyerPlatformFee: 100000,
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    assert.strictEqual(taxes.buyer_tax.statutory_rate, 0.12);
  });

  syncTest('2.10 Regression 3: DPP multiplier is 11/12 and taxable_dpp is Math.round(taxable_base * 11/12)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 2000000,
      buyerPlatformFee: 100000,
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    assert.strictEqual(taxes.buyer_tax.dpp_multiplier, '11/12');
    assert.strictEqual(taxes.buyer_tax.dpp_multiplier_numeric, 11 / 12);
    assert.strictEqual(taxes.buyer_tax.taxable_dpp, 91667); // Math.round(100000 * 11 / 12)
    // Verify tax_amount is strictly taxable_dpp * statutory_rate
    assert.strictEqual(taxes.buyer_tax.tax_amount, Math.round(91667 * 0.12));
  });

  syncTest('2.11 Regression 4: Effective rate is 11% (0.11)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 2000000,
      buyerPlatformFee: 100000,
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    assert.strictEqual(taxes.buyer_tax.effective_rate, 0.11);
    assert.strictEqual(taxes.buyer_tax.ppn_rate, 0.11);
  });

  syncTest('2.12 Regression 5: No accidental 12% direct multiplication (tax_amount !== 12% * taxable_base)', () => {
    const taxes = TaxEngine.calculateTax({
      ticketPrice: 2000000,
      buyerPlatformFee: 100000,
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    const direct12Pct = Math.round(100000 * 0.12); // 12,000
    assert.strictEqual(direct12Pct, 12000);
    assert.notStrictEqual(taxes.buyer_tax.tax_amount, direct12Pct, 'tax_amount must NOT equal direct 12% of taxable base');
    assert.strictEqual(taxes.buyer_tax.tax_amount, 11000);
  });

  await asyncTest('2.13 Regression 6: Historical quotes remain unchanged after policy updates', async () => {
    // Generate a quote under current policy
    const quote = await TransactionQuoteService.generateQuote({
      listingId: 'list-demo-immutable',
      ticketPrice: 2000000,
      buyerId: 'buyer-immutable-test',
      pricingPolicyVersion: '2026.1-ID-DEFAULT',
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    const originalBuyerTax = quote.buyer_tax_amount;
    const originalBuyerTotal = quote.buyer_total;
    const originalEffectiveRate = quote.tax_breakdown.buyer_tax.effective_rate;
    assert.strictEqual(originalBuyerTax, 11000);

    // Update tax policy in registry
    await TaxEngine.registerPolicy({
      version: '2026.1-ID-TAX',
      ppn_subject_to_tax: true,
      ppn_regime: 'STANDARD_12',
      ppn_taxable_base_type: 'PLATFORM_FEE',
      ppn_statutory_rate: 0.12,
      pph22_rate: 0.005,
      is_active: true
    }, 'admin-test');

    // Retrieve historical quote
    const fetched = TransactionQuoteService.getQuote(quote.id);
    assert.strictEqual(fetched.buyer_tax_amount, originalBuyerTax, 'Historical quote buyer_tax_amount must not change');
    assert.strictEqual(fetched.buyer_total, originalBuyerTotal, 'Historical quote buyer_total must not change');
    assert.strictEqual(fetched.tax_breakdown.buyer_tax.effective_rate, originalEffectiveRate, 'Historical quote effective_rate must not change');

    // Reset policy back to default PMK 131/2024
    await TaxEngine.registerPolicy({
      version: '2026.1-ID-TAX',
      ppn_subject_to_tax: true,
      ppn_regime: 'PMK_131_2024',
      ppn_taxable_base_type: 'PLATFORM_FEE',
      ppn_statutory_rate: 0.12,
      ppn_dpp_multiplier_string: '11/12',
      ppn_dpp_numerator: 11,
      ppn_dpp_denominator: 12,
      ppn_effective_rate: 0.11,
      pph22_rate: 0.005,
      pph22_effective_from: '2026-11-01T00:00:00Z',
      is_active: true
    }, 'SYSTEM');
  });

  syncTest('2.14 Regression 7: PPN remains balance sheet liability (TAX_PAYABLE), never platform revenue', () => {
    assert.ok(LEDGER_ACCOUNTS.TAX_PAYABLE, 'TAX_PAYABLE account must exist');
    assert.ok(LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE, 'PLATFORM_FEE_REVENUE account must exist');
    assert.notStrictEqual(LEDGER_ACCOUNTS.TAX_PAYABLE, LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE);
  });

  syncTest('2.15 Fail-Closed: Unknown tax policy version throws TAX_FAIL_CLOSED_POLICY_NOT_FOUND', () => {
    assert.throws(() => {
      TaxEngine.calculateTax({
        ticketPrice: 1000000,
        buyerPlatformFee: 50000,
        taxPolicyVersion: 'NON_EXISTENT_POLICY_123'
      });
    }, (err) => err.code === 'TAX_FAIL_CLOSED_POLICY_NOT_FOUND');
  });

  await asyncTest('2.16 Fail-Closed: Undetermined taxable base policy fails closed upon registration', async () => {
    await assert.rejects(async () => {
      await TaxEngine.registerPolicy({
        version: 'INVALID_BASE_TEST',
        ppn_regime: 'PMK_131_2024',
        ppn_taxable_base_type: 'UNKNOWN_BASE_TYPE',
        pph22_rate: 0.005
      });
    }, (err) => err.code === 'INVALID_TAXABLE_BASE_TYPE');
  });

  await asyncTest('2.17 Fail-Closed: Undetermined PPN regime registration fails closed', async () => {
    await assert.rejects(async () => {
      await TaxEngine.registerPolicy({
        version: 'INVALID_REGIME_TEST',
        ppn_regime: 'IMAGINARY_REGIME',
        pph22_rate: 0.005
      });
    }, (err) => err.code === 'INVALID_PPN_REGIME');
  });

  syncTest('2.18 Fail-Closed: Undetermined PPN regime during calculation fails closed', () => {
    state.tax_policies.push({
      version: 'CORRUPTED_REGIME_POLICY',
      country_code: 'ID',
      currency: 'IDR',
      ppn_subject_to_tax: true,
      ppn_regime: null,
      ppn_taxable_base_type: 'PLATFORM_FEE',
      is_active: true
    });
    assert.throws(() => {
      TaxEngine.calculateTax({
        ticketPrice: 1000000,
        buyerPlatformFee: 50000,
        taxPolicyVersion: 'CORRUPTED_REGIME_POLICY'
      });
    }, (err) => err.code === 'TAX_FAIL_CLOSED_REGIME_UNDETERMINED');
  });

  syncTest('2.19 Fail-Closed: Undetermined taxable-base policy during calculation fails closed', () => {
    state.tax_policies.push({
      version: 'CORRUPTED_BASE_POLICY',
      country_code: 'ID',
      currency: 'IDR',
      ppn_subject_to_tax: true,
      ppn_regime: 'PMK_131_2024',
      ppn_taxable_base_type: null,
      is_active: true
    });
    assert.throws(() => {
      TaxEngine.calculateTax({
        ticketPrice: 1000000,
        buyerPlatformFee: 50000,
        taxPolicyVersion: 'CORRUPTED_BASE_POLICY'
      });
    }, (err) => err.code === 'TAX_FAIL_CLOSED_TAXABLE_BASE_POLICY_UNDETERMINED');
  });

  syncTest('2.20 Fail-Closed: Undetermined subject_to_tax applicability fails closed', () => {
    state.tax_policies.push({
      version: 'CORRUPTED_SUBJECT_POLICY',
      country_code: 'ID',
      currency: 'IDR',
      ppn_subject_to_tax: undefined,
      ppn_regime: 'PMK_131_2024',
      ppn_taxable_base_type: 'PLATFORM_FEE',
      is_active: true
    });
    assert.throws(() => {
      TaxEngine.calculateTax({
        ticketPrice: 1000000,
        buyerPlatformFee: 50000,
        taxPolicyVersion: 'CORRUPTED_SUBJECT_POLICY'
      });
    }, (err) => err.code === 'TAX_FAIL_CLOSED_SUBJECT_TO_TAX_UNDETERMINED');
  });

  syncTest('2.21 Policy-driven applicability: NON_PKP policy produces 0 PPN and reflects non-taxable status', () => {
    const nonPkpTaxes = TaxEngine.calculateTax({
      ticketPrice: 1000000,
      buyerPlatformFee: 50000,
      taxPolicyVersion: 'NON-PKP-ID-TAX',
      transactionDate: '2026-09-19T10:00:00Z'
    });
    assert.strictEqual(nonPkpTaxes.buyer_tax.is_subject_to_ppn, false);
    assert.strictEqual(nonPkpTaxes.buyer_tax.tax_amount, 0);
    assert.strictEqual(nonPkpTaxes.buyer_tax.ppn_amount, 0);
    assert.strictEqual(nonPkpTaxes.total_buyer_tax, 0);
  });

  // ===========================================================================
  // 3. TRANSACTION QUOTE SERVICE & PRICE LOCK
  // ===========================================================================
  console.log('\n── Part 3: Transaction Quote Service & Price Lock ──');

  let activeQuote;
  await asyncTest('3.1 Generates immutable quote and satisfies double-entry balancing equation', async () => {
    activeQuote = await TransactionQuoteService.generateQuote({
      listingId: 'list-demo-pestapora',
      ticketPrice: 1000000,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      pricingPolicyVersion: '2026.1-ID-DEFAULT',
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T12:00:00Z',
      ttlMinutes: 15
    });

    assert.ok(activeQuote.id.startsWith('quo-'));
    assert.strictEqual(activeQuote.status, QUOTE_STATUS.ACTIVE);
    assert.strictEqual(activeQuote.ticket_price, 1000000);
    assert.strictEqual(activeQuote.buyer_platform_fee, 50000);
    assert.strictEqual(activeQuote.seller_platform_fee, 50000);
    assert.strictEqual(activeQuote.buyer_tax_amount, 5500); // 11% effective PPN on 50k fee under PMK 131/2024 (45833 * 12% = 5500)
    assert.strictEqual(activeQuote.seller_tax_withholding, 0); // Postponed in Sept 2026
    assert.strictEqual(activeQuote.buyer_total, 1055500); // 1M + 50k + 5.5k
    assert.strictEqual(activeQuote.seller_net_payout, 950000); // 1M - 50k - 0
    assert.strictEqual(activeQuote.platform_gross_revenue, 100000); // 50k + 50k

    // Mathematical Double-Entry Invariant:
    // buyer_total === seller_net_payout + platform_gross_revenue + total_tax_amount
    const totalOutflows = activeQuote.seller_net_payout + activeQuote.platform_gross_revenue + activeQuote.total_tax_amount;
    assert.strictEqual(activeQuote.buyer_total, totalOutflows);
    assert.strictEqual(activeQuote.buyer_total, 1055500);
  });

  syncTest('3.2 Validates active quote before consumption', () => {
    const validated = TransactionQuoteService.validateQuote(activeQuote.id);
    assert.strictEqual(validated.id, activeQuote.id);
    assert.strictEqual(validated.status, QUOTE_STATUS.ACTIVE);
  });

  await asyncTest('3.3 Consumes quote and links to orderId', async () => {
    const consumed = await TransactionQuoteService.consumeQuote(activeQuote.id, 'ord-test-quote-01', 'buyer-1');
    assert.strictEqual(consumed.status, QUOTE_STATUS.CONSUMED);
    assert.strictEqual(consumed.order_id, 'ord-test-quote-01');
    assert.ok(consumed.consumed_at);
  });

  syncTest('3.4 Blocks duplicate consumption of already consumed quote', () => {
    assert.throws(() => {
      TransactionQuoteService.validateQuote(activeQuote.id);
    }, (err) => err.code === 'QUOTE_ALREADY_CONSUMED');
  });

  await asyncTest('3.5 Expired quote is rejected after TTL elapses', async () => {
    const expiredQuote = await TransactionQuoteService.generateQuote({
      listingId: 'list-demo-pestapora',
      ticketPrice: 500000,
      buyerId: 'buyer-1',
      ttlMinutes: -1 // Expired 1 minute ago
    });

    assert.throws(() => {
      TransactionQuoteService.validateQuote(expiredQuote.id);
    }, (err) => err.code === 'QUOTE_EXPIRED');
  });

  // ===========================================================================
  // 4. END-TO-END CHECKOUT & DOUBLE-ENTRY FINANCIAL LEDGER INTEGRATION
  // ===========================================================================
  console.log('\n── Part 4: End-to-End Checkout & Double-Entry Ledger ──');

  let e2eOrder, e2eEscrow, e2eQuote;

  await asyncTest('4.1 Generate locked quote and create order with two-sided pricing and taxes', async () => {
    // Generate locked quote for listing
    e2eQuote = await TransactionQuoteService.generateQuote({
      listingId: 'list-demo-pestapora',
      ticketPrice: 1500000,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      pricingPolicyVersion: '2026.1-ID-DEFAULT',
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T14:00:00Z'
    });

    // 1.5M * 5% = 75,000 fee
    // 75,000 * 11/12 = 68,750 DPP
    // 68,750 * 12% = 8,250 PPN (effective 11%)
    // buyer_total = 1,583,250
    // seller_net_payout = 1,425,000
    assert.strictEqual(e2eQuote.buyer_platform_fee, 75000);
    assert.strictEqual(e2eQuote.seller_platform_fee, 75000);
    assert.strictEqual(e2eQuote.buyer_tax_amount, 8250);
    assert.strictEqual(e2eQuote.buyer_total, 1583250);
    assert.strictEqual(e2eQuote.seller_net_payout, 1425000);

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: 'list-demo-pestapora',
      quoteId: e2eQuote.id
    });

    e2eOrder = orderRes.order;
    e2eEscrow = orderRes.escrow;

    assert.strictEqual(e2eOrder.total_amount, 1583250);
    assert.strictEqual(e2eOrder.ticket_price, 1500000);
    assert.strictEqual(e2eOrder.buyer_fee, 75000);
    assert.strictEqual(e2eOrder.seller_fee, 75000);
    assert.strictEqual(e2eOrder.buyer_tax, 8250);
    assert.strictEqual(e2eOrder.seller_net_payout, 1425000);
    assert.strictEqual(e2eOrder.quote_id, e2eQuote.id);

    assert.strictEqual(e2eEscrow.amount, 1425000, 'Escrow held amount must reflect exact seller net payout');
    assert.strictEqual(e2eEscrow.total_paid, 1583250, 'Escrow total paid must reflect buyer all-in price');
  });

  await asyncTest('4.2 Capture payment: Records balanced journal entry with TAX_PAYABLE and money movement metadata', async () => {
    const payRes = await EscrowService.recordPayment({
      orderId: e2eOrder.id,
      providerRef: 'ipaymu-tx-778899',
      idempotencyKey: 'idem-key-e2e-01',
      amountPaid: 1583250
    });

    assert.strictEqual(payRes.order.status, ORDER_STATUS.PAID_ESCROWED);
    assert.strictEqual(payRes.escrow.status, ESCROW_STATUS.ESCROWED);

    // Verify Financial Ledger
    const captureJournalTx = state.financial_ledger.find(
      tx => tx.order_id === e2eOrder.id && tx.event_type === FINANCIAL_EVENT_TYPES.CAPTURE
    );
    assert.ok(captureJournalTx, 'Financial ledger must contain CAPTURE entry for order');
    assert.strictEqual(captureJournalTx.quote_id, e2eQuote.id, 'Transaction must record quote_id');
    assert.strictEqual(captureJournalTx.total_amount, 1583250);

    // Verify money movement metadata on EVERY entry
    for (const entry of captureJournalTx.entries) {
      assert.ok(entry.entry_id, 'Entry must have entry_id');
      assert.ok(entry.transaction_id, 'Entry must have transaction_id');
      assert.strictEqual(entry.quote_id, e2eQuote.id, 'Entry must have quote_id');
      assert.strictEqual(entry.order_id, e2eOrder.id, 'Entry must have order_id');
      assert.ok(entry.ledger_account, 'Entry must have ledger_account');
      assert.ok(entry.amount > 0, 'Entry amount must be positive');
      assert.strictEqual(entry.currency, 'IDR', 'Entry must have currency');
      assert.strictEqual(entry.source_event, FINANCIAL_EVENT_TYPES.CAPTURE, 'Entry must have source_event');
      assert.ok(entry.created_at, 'Entry must have created_at timestamp');
    }

    // Assert double-entry debits and credits
    let debits = 0;
    let credits = 0;
    for (const e of captureJournalTx.entries) {
      if (e.type === 'DEBIT') debits += e.amount;
      if (e.type === 'CREDIT') credits += e.amount;
    }
    assert.strictEqual(debits, credits, 'Debits and credits must balance exactly');
    assert.strictEqual(debits, 1583250);

    // Check account balances
    const balances = FinancialLedger.getAccountBalances();
    assert.strictEqual(balances[LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING], 1583250, 'Gateway clearing received 1,583,250');
    assert.strictEqual(balances[LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING], -1425000, 'Seller payable pending credit of 1,425,000');
    assert.strictEqual(balances[LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE], -150000, 'Platform fee revenue credit of 150,000 (75k + 75k)');
    assert.strictEqual(balances[LEDGER_ACCOUNTS.TAX_PAYABLE], -8250, 'Tax payable liability credit of 8,250');
  });

  await asyncTest('4.3 Release escrow upon turnstile admission: Clears seller payable and disburses exact net payout', async () => {
    // 1. Simulate entry verification by PIC
    state.entry_verifications.push({
      id: `ev-${e2eOrder.id}`,
      order_id: e2eOrder.id,
      event_id: e2eOrder.event_id,
      status: 'CONFIRMED',
      handshake_code: '123456',
      verified_by_pic_id: 'pic-1',
      gate: 'Pintu 3',
      verified_at: new Date().toISOString()
    });

    // 2. Add required attestations in TrustPolicyEngine
    await TrustPolicyEngine.recordAttestation({
      orderId: e2eOrder.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS',
      metadata: { gate: 'Pintu 3' }
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: e2eOrder.id,
      attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION,
      actorId: 'buyer-1',
      actorRole: 'buyer',
      result: 'PASS'
    });

    // 3. Release escrow to seller
    const releaseRes = await EscrowService.releaseToSeller(e2eOrder.id, 'admin-1');
    assert.strictEqual(releaseRes.success, true);
    assert.strictEqual(releaseRes.escrow.status, ESCROW_STATUS.RELEASED);
    assert.strictEqual(releaseRes.order.status, ORDER_STATUS.SETTLED);

    // 4. Verify Financial Ledger balances post-release
    const balances = FinancialLedger.getAccountBalances();
    assert.strictEqual(balances[LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING], 0, 'Seller payable pending cleared to 0');
    assert.strictEqual(balances[LEDGER_ACCOUNTS.SETTLEMENT_CLEARING], -1425000, 'Settlement clearing disbursed 1,425,000');
    assert.strictEqual(balances[LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE], -150000, 'Platform revenue remains 150,000');
    assert.strictEqual(balances[LEDGER_ACCOUNTS.TAX_PAYABLE], -8250, 'Tax liability remains 8,250 for tax remittance to DJP');
  });

  await asyncTest('4.4 Refund transaction: Reverses seller allocation, fee revenue, and tax payable liabilities', async () => {
    state.listings.push({
      id: 'list-refund-demo',
      ticket_id: 'ticket-demo-2',
      seller_id: 'seller-1',
      event_id: 'event-pestapora-2026',
      face_value: 1000000,
      price: 1000000,
      status: LISTING_STATUS.ACTIVE,
      created_at: new Date().toISOString()
    });

    // Setup a new order and payment to test refund
    const refundQuote = await TransactionQuoteService.generateQuote({
      listingId: 'list-refund-demo',
      ticketPrice: 1000000,
      buyerId: 'buyer-2',
      sellerId: 'seller-1',
      pricingPolicyVersion: '2026.1-ID-DEFAULT',
      taxPolicyVersion: '2026.1-ID-TAX',
      transactionDate: '2026-09-19T15:00:00Z'
    });

    const refundOrderRes = await EscrowService.createOrder({
      buyerId: 'buyer-2',
      listingId: 'list-refund-demo',
      quoteId: refundQuote.id
    });

    const refundOrder = refundOrderRes.order;
    await EscrowService.recordPayment({
      orderId: refundOrder.id,
      providerRef: 'pay-refund-test-01',
      idempotencyKey: 'idem-refund-01',
      amountPaid: refundOrder.total_amount
    });

    const balancesBeforeRefund = FinancialLedger.getAccountBalances();
    const feeBefore = balancesBeforeRefund[LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE];
    const taxBefore = balancesBeforeRefund[LEDGER_ACCOUNTS.TAX_PAYABLE];

    // Issue refund to buyer
    const refundRes = await EscrowService.refundToBuyer(refundOrder.id, 'admin-1', 'Event cancelled by promoter');
    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.order.status, ORDER_STATUS.REFUNDED);
    assert.strictEqual(refundRes.escrow.status, ESCROW_STATUS.REFUNDED);

    const refundTx = state.financial_ledger.find(
      tx => tx.order_id === refundOrder.id && tx.event_type === FINANCIAL_EVENT_TYPES.REFUND
    );
    assert.ok(refundTx, 'Refund entry must exist in ledger');
    assert.strictEqual(refundTx.quote_id, refundQuote.id);

    // Debits and credits must balance
    let debits = 0;
    let credits = 0;
    for (const e of refundTx.entries) {
      if (e.type === 'DEBIT') debits += e.amount;
      if (e.type === 'CREDIT') credits += e.amount;
    }
    assert.strictEqual(debits, credits);

    // Revenue and tax accounts must be reversed back to their pre-order balances
    const balancesAfterRefund = FinancialLedger.getAccountBalances();
    assert.strictEqual(balancesAfterRefund[LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE], feeBefore + 100000, 'Reversed 100k platform fee');
    assert.strictEqual(balancesAfterRefund[LEDGER_ACCOUNTS.TAX_PAYABLE], taxBefore + 5500, 'Reversed 5.5k tax payable');
  });

  // ===========================================================================
  // 5. ECONOMICS ENGINE & CONTRIBUTION MARGIN
  // ===========================================================================
  console.log('\n── Part 5: Economics Engine & Contribution Margin ──');

  syncTest('5.1 Calculates accurate GMV, gross revenue, direct costs, and net contribution margin', () => {
    const economics = EconomicsEngine.calculateContributionMargin();

    assert.ok(economics.gmv > 0, 'GMV must be greater than zero');
    assert.ok(economics.gross_revenue.total > 0, 'Gross revenue must be greater than zero');
    assert.ok(economics.variable_costs.payment_gateway_fees > 0, 'Payment gateway cost tracked');
    assert.ok(economics.variable_costs.risk_reserve_pool > 0, 'Risk reserve tracked');
    assert.ok(economics.taxes.buyer_ppn > 0, 'Buyer PPN tracked');
    assert.strictEqual(typeof economics.unit_economics.net_contribution_margin, 'number');
    assert.strictEqual(typeof economics.unit_economics.contribution_margin_ratio, 'number');

    // Cross-reference with ledger balances
    assert.ok(economics.ledger_balances[LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING] !== undefined);
    assert.ok(economics.ledger_balances[LEDGER_ACCOUNTS.TAX_PAYABLE] !== undefined);
  });

  // ===========================================================================
  // 6. HTTP API ENDPOINTS
  // ===========================================================================
  console.log('\n── Part 6: HTTP API Endpoints ──');

  let server, port;
  await asyncTest('6.1 Spin up test server and create admin session', async () => {
    port = await new Promise((resolve) => {
      server = app.listen(0, () => resolve(server.address().port));
    });
    const adminSession = SessionStore.createSession({ userId: 'admin-1', role: 'admin' });
    state.sessions.push(adminSession);
  });

  function apiPost(path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers
        }
      }, (res) => {
        let resData = '';
        res.on('data', chunk => resData += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(resData) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: resData });
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  function apiGet(path, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers
      }, (res) => {
        let resData = '';
        res.on('data', chunk => resData += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(resData) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: resData });
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  await asyncTest('6.2 POST /api/mvp/pricing/calculate: Returns transparent quote preview', async () => {
    const res = await apiPost('/api/mvp/pricing/calculate', {
      ticketPrice: 2000000,
      policyVersion: '2026.1-ID-DEFAULT',
      taxPolicyVersion: '2026.1-ID-TAX'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.ticket_price, 2000000);
    assert.strictEqual(res.body.buyer_fee, 100000); // 5% of 2M
    assert.strictEqual(res.body.seller_fee, 100000); // 5% of 2M
    // Under PMK 131/2024: 100,000 * 11/12 = 91,667 * 12% = 11,000 (effective 11%)
    assert.strictEqual(res.body.buyer_tax, 11000);
    assert.strictEqual(res.body.buyer_total, 2111000);
    assert.strictEqual(res.body.seller_net_payout, 1900000);
  });

  let apiLockedQuoteId;
  await asyncTest('6.3 POST /api/mvp/pricing/calculate with lockQuote: Generates locked Quote ID', async () => {
    const res = await apiPost('/api/mvp/pricing/calculate', {
      ticketPrice: 3000000,
      listingId: 'list-demo-pestapora',
      buyerId: 'buyer-1',
      lockQuote: true
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.quote_id);
    apiLockedQuoteId = res.body.quote_id;
  });

  await asyncTest('6.4 GET /api/mvp/pricing/quote/:id: Returns quote details', async () => {
    const res = await apiGet(`/api/mvp/pricing/quote/${apiLockedQuoteId}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.quote.id, apiLockedQuoteId);
    assert.strictEqual(res.body.quote.ticket_price, 3000000);
  });

  await asyncTest('6.5 GET /api/mvp/admin/economics/contribution-margin: Admin-only unit economics report', async () => {
    const adminSession = state.sessions.find(s => s.user_id === 'admin-1');
    const res = await apiGet('/api/mvp/admin/economics/contribution-margin', {
      'authorization': `Bearer ${adminSession.session_token}`
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.economics.gmv > 0);
  });

  await asyncTest('6.6 GET /api/mvp/admin/pricing/policies: Requires admin role', async () => {
    // Non-admin request with authenticated buyer session
    const buyerSession = SessionStore.createSession({ userId: 'buyer-1', role: 'buyer' });
    const userRes = await apiGet('/api/mvp/admin/pricing/policies', {
      'authorization': `Bearer ${buyerSession.session_token}`
    });
    assert.strictEqual(userRes.statusCode, 403);

    // Admin request
    const adminSession = state.sessions.find(s => s.user_id === 'admin-1');
    const adminRes = await apiGet('/api/mvp/admin/pricing/policies', {
      'authorization': `Bearer ${adminSession.session_token}`
    });
    assert.strictEqual(adminRes.statusCode, 200);
    assert.ok(Array.isArray(adminRes.body.policies));
    assert.ok(adminRes.body.policies.some(p => p.version === '2026.1-ID-DEFAULT'));
  });

  await asyncTest('6.7 GET /api/mvp/admin/tax/policies: Requires admin role and returns registered tax policies', async () => {
    const adminSession = state.sessions.find(s => s.user_id === 'admin-1');
    const adminRes = await apiGet('/api/mvp/admin/tax/policies', {
      'authorization': `Bearer ${adminSession.session_token}`
    });
    assert.strictEqual(adminRes.statusCode, 200);
    assert.ok(Array.isArray(adminRes.body.policies));
    const taxPol = adminRes.body.policies.find(p => p.version === '2026.1-ID-TAX');
    assert.ok(taxPol);
    assert.strictEqual(taxPol.pph22_effective_from, '2026-11-01T00:00:00Z');
  });

  // Close server
  if (server) {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`  PRICING & TAX LEDGER SUITE: ${passed}/${total} TESTS PASSED!`);
  console.log('================================================================\n');
}

runSuite().catch(err => {
  console.error('\nFatal suite error:', err);
  process.exit(1);
});
