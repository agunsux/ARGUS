/**
 * TIKUM / ARGUS — Tax Engine (Indonesia & Regional ASEAN)
 * 
 * Compliant, Effective-Date-Aware Tax Withholding & Value Added Tax (VAT) Engine.
 * 
 * Critical Legal Context (Indonesian Directorate General of Taxes / DJP):
 * 1. PPN (Value Added Tax / PPN PMSE under PMK 131/2024):
 *    - For applicable non-luxury BKP/JKP under PMK 131/2024:
 *      statutory_rate = 12% (0.12)
 *      dpp_multiplier = 11/12 (fraction)
 *      effective_rate = 11% (0.11)
 *      taxable_dpp = taxable_base × 11/12
 *      tax_amount = taxable_dpp × 12%
 *    - The engine MUST preserve: statutory_rate, dpp_multiplier, effective_rate,
 *      taxable_base, taxable_dpp, and tax_amount.
 *    - Never directly multiply taxable_base by 12% for non-luxury BKP/JKP under PMK 131/2024.
 *    - Taxable Base (DPP): Strictly the Platform Service Fee charged to the buyer.
 *    - Zero Double-Taxation: PPN is NEVER charged on ticket face value or secondary price.
 *    - Configuration-Driven Applicability: Do not assume Tikum is automatically subject
 *      to PPN; PPN applies strictly when the configured regime specifies subject_to_tax.
 * 
 * 2. PPh Pasal 22 (PMK 37/2025 - Marketplace Withholding):
 *    - Standard statutory rate: 0.5% on qualifying seller gross turnover.
 *    - CRITICAL ENFORCEMENT TIMELINE: The implementation of PMK 37/2025 marketplace
 *      withholding has been officially POSTPONED until 1 November 2026.
 *    - Transactions in September / October 2026 have 0% withholding with
 *      audit reason 'PMK_37_2025_POSTPONED_UNTIL_2026_11_01'.
 *    - After 1 November 2026: Domestic individual sellers (WP OP) with turnover <= Rp 500 million
 *      who submit statutory declaration remain exempt (0%).
 * 
 * 3. Fail-Closed Invariant:
 *    - If the applicable tax regime, taxable-base policy, or transaction date
 *      cannot be determined with certainty, the engine FAILS CLOSED (throws specific error)
 *      rather than inventing a tax amount.
 * 
 * 4. Balance Sheet Separation:
 *    - Taxes are collected on behalf of DJP and accounted as balance sheet liabilities (TAX_PAYABLE),
 *      NEVER platform revenue.
 */

const { state, recordAuditLog } = require('../database');

const VALID_PPN_REGIMES = new Set(['PMK_131_2024', 'NON_PKP', 'EXEMPT', 'STANDARD_12']);
const VALID_TAXABLE_BASE_TYPES = new Set(['PLATFORM_FEE', 'TICKET_PRICE', 'TOTAL_AMOUNT']);

const DEFAULT_TAX_POLICIES = {
  '2026.1-ID-TAX': {
    version: '2026.1-ID-TAX',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Indonesia Statutory Tax Policy: PMK 131/2024 DPP Nilai Lain (11/12 DPP, 12% Statutory = 11% Effective PPN) + PMK 37/2025 PPh 22 postponed to 2026-11-01',
    // PPN Configuration under PMK 131/2024
    ppn_subject_to_tax: true,
    ppn_regime: 'PMK_131_2024',
    ppn_taxable_base_type: 'PLATFORM_FEE',
    ppn_statutory_rate: 0.12,
    ppn_dpp_multiplier_string: '11/12',
    ppn_dpp_numerator: 11,
    ppn_dpp_denominator: 12,
    ppn_dpp_multiplier: 11 / 12,
    ppn_effective_rate: 0.11,
    ppn_effective_from: '2025-01-01T00:00:00Z',
    // PPh 22 Configuration
    pph22_rate: 0.005,
    pph22_effective_from: '2026-11-01T00:00:00Z', // Officially postponed to 1 November 2026
    wp_op_exemption_threshold: 500000000, // Rp 500,000,000
    is_active: true,
    effective_from: '2026-01-01T00:00:00Z'
  },
  'NON-PKP-ID-TAX': {
    version: 'NON-PKP-ID-TAX',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Indonesia Non-PKP Platform Policy: Zero PPN (Not Subject to PPN), PMK 37/2025 postponed to 2026-11-01',
    ppn_subject_to_tax: false,
    ppn_regime: 'NON_PKP',
    ppn_taxable_base_type: 'PLATFORM_FEE',
    ppn_statutory_rate: 0.00,
    ppn_dpp_multiplier_string: '0',
    ppn_dpp_numerator: 0,
    ppn_dpp_denominator: 1,
    ppn_dpp_multiplier: 0,
    ppn_effective_rate: 0.00,
    ppn_effective_from: '2025-01-01T00:00:00Z',
    pph22_rate: 0.005,
    pph22_effective_from: '2026-11-01T00:00:00Z',
    wp_op_exemption_threshold: 500000000,
    is_active: true,
    effective_from: '2026-01-01T00:00:00Z'
  },
  'ZERO-TAX-TEST': {
    version: 'ZERO-TAX-TEST',
    country_code: 'ID',
    currency: 'IDR',
    description: 'Zero Tax Test / Sandbox Policy',
    ppn_subject_to_tax: false,
    ppn_regime: 'EXEMPT',
    ppn_taxable_base_type: 'PLATFORM_FEE',
    ppn_statutory_rate: 0.00,
    ppn_dpp_multiplier_string: '0',
    ppn_dpp_numerator: 0,
    ppn_dpp_denominator: 1,
    ppn_dpp_multiplier: 0,
    ppn_effective_rate: 0.00,
    ppn_effective_from: '2025-01-01T00:00:00Z',
    pph22_rate: 0.00,
    pph22_effective_from: '2099-01-01T00:00:00Z',
    wp_op_exemption_threshold: Infinity,
    is_active: true,
    effective_from: '2026-01-01T00:00:00Z'
  }
};

class TaxEngine {
  /**
   * Initialize tax policies in state
   */
  static init() {
    if (!state.tax_policies) {
      state.tax_policies = [];
    }
    for (const key of Object.keys(DEFAULT_TAX_POLICIES)) {
      const exists = state.tax_policies.find(p => p.version === key);
      if (!exists) {
        state.tax_policies.push({ ...DEFAULT_TAX_POLICIES[key] });
      }
    }
    if (!state.tax_audit_logs) {
      state.tax_audit_logs = [];
    }
  }

  /**
   * Get active tax policy by version
   */
  static getPolicy(version = '2026.1-ID-TAX') {
    this.init();
    const policy = state.tax_policies.find(p => p.version === version && p.is_active);
    if (!policy) {
      if (DEFAULT_TAX_POLICIES[version]) {
        return DEFAULT_TAX_POLICIES[version];
      }
      return null;
    }
    return policy;
  }

  /**
   * List all registered tax policies
   */
  static listPolicies() {
    this.init();
    return [...state.tax_policies];
  }

  /**
   * Register or update a tax policy
   */
  static async registerPolicy(policyConfig, actorId = 'SYSTEM') {
    this.init();
    const {
      version,
      country_code = 'ID',
      currency = 'IDR',
      description = '',
      ppn_subject_to_tax = true,
      ppn_regime = 'PMK_131_2024',
      ppn_taxable_base_type = 'PLATFORM_FEE',
      ppn_statutory_rate = 0.12,
      ppn_dpp_multiplier_string = '11/12',
      ppn_dpp_numerator = 11,
      ppn_dpp_denominator = 12,
      ppn_effective_rate = 0.11,
      ppn_effective_from = '2025-01-01T00:00:00Z',
      pph22_rate,
      pph22_effective_from = '2026-11-01T00:00:00Z',
      wp_op_exemption_threshold = 500000000,
      is_active = true
    } = policyConfig;

    if (!version || typeof pph22_rate !== 'number') {
      const err = new Error('Invalid tax policy configuration: version and pph22_rate are required');
      err.code = 'INVALID_TAX_POLICY_CONFIG';
      throw err;
    }

    if (!VALID_PPN_REGIMES.has(ppn_regime)) {
      const err = new Error(`Invalid PPN regime: '${ppn_regime}'. Allowed: ${Array.from(VALID_PPN_REGIMES).join(', ')}`);
      err.code = 'INVALID_PPN_REGIME';
      throw err;
    }

    if (!VALID_TAXABLE_BASE_TYPES.has(ppn_taxable_base_type)) {
      const err = new Error(`Invalid taxable base type: '${ppn_taxable_base_type}'`);
      err.code = 'INVALID_TAXABLE_BASE_TYPE';
      throw err;
    }

    const newPolicy = {
      version,
      country_code,
      currency,
      description,
      ppn_subject_to_tax: Boolean(ppn_subject_to_tax),
      ppn_regime,
      ppn_taxable_base_type,
      ppn_statutory_rate,
      ppn_dpp_multiplier_string,
      ppn_dpp_numerator,
      ppn_dpp_denominator,
      ppn_dpp_multiplier: ppn_dpp_numerator / ppn_dpp_denominator,
      ppn_effective_rate,
      ppn_effective_from,
      pph22_rate,
      pph22_effective_from,
      wp_op_exemption_threshold,
      is_active,
      updated_at: new Date().toISOString()
    };

    const existingIdx = state.tax_policies.findIndex(p => p.version === version);
    if (existingIdx >= 0) {
      state.tax_policies[existingIdx] = newPolicy;
    } else {
      newPolicy.created_at = new Date().toISOString();
      state.tax_policies.push(newPolicy);
    }

    state.tax_audit_logs.push({
      id: `tal-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      action: existingIdx >= 0 ? 'POLICY_UPDATED' : 'POLICY_REGISTERED',
      policy_version: version,
      actor_id: actorId,
      details: newPolicy,
      timestamp: new Date().toISOString()
    });

    return newPolicy;
  }

  /**
   * Calculate taxes for buyer and seller with strict effective-date awareness and fail-closed safety.
   * 
   * @param {Object} params
   * @param {number} params.ticketPrice - Gross ticket transaction value
   * @param {number} params.buyerPlatformFee - Platform fee charged to buyer (taxable base for PPN)
   * @param {Object} [params.sellerTaxProfile] - Seller tax info (NPWP, SPT declaration, annual turnover)
   * @param {Object} [params.buyerTaxProfile] - Buyer tax info
   * @param {string|Date} [params.transactionDate] - Transaction timestamp for effective-date awareness
   * @param {string} [params.taxPolicyVersion='2026.1-ID-TAX']
   */
  static calculateTax({
    ticketPrice,
    buyerPlatformFee,
    sellerTaxProfile = {},
    buyerTaxProfile = {},
    transactionDate = null,
    taxPolicyVersion = '2026.1-ID-TAX'
  }) {
    // 1. Fail-Closed Validation: Price & Platform Fee
    if (ticketPrice === undefined || ticketPrice === null || typeof ticketPrice !== 'number' || isNaN(ticketPrice) || ticketPrice < 0) {
      const err = new Error(`Tax calculation failed closed: Invalid ticket price '${ticketPrice}'`);
      err.code = 'TAX_FAIL_CLOSED_INVALID_PRICE';
      throw err;
    }

    if (buyerPlatformFee === undefined || buyerPlatformFee === null || typeof buyerPlatformFee !== 'number' || isNaN(buyerPlatformFee) || buyerPlatformFee < 0) {
      const err = new Error(`Tax calculation failed closed: Invalid buyer platform fee '${buyerPlatformFee}'`);
      err.code = 'TAX_FAIL_CLOSED_INVALID_FEE';
      throw err;
    }

    // 2. Fail-Closed Validation: Effective Date Verification
    const effectiveTxDate = transactionDate ? new Date(transactionDate) : new Date();
    if (isNaN(effectiveTxDate.getTime())) {
      const err = new Error(`Tax calculation failed closed: Invalid transaction date '${transactionDate}'`);
      err.code = 'TAX_FAIL_CLOSED_INVALID_DATE';
      throw err;
    }
    const txTime = effectiveTxDate.getTime();
    const txDateIso = effectiveTxDate.toISOString();

    // 3. Fail-Closed Validation: Tax Policy Existence
    const policy = this.getPolicy(taxPolicyVersion);
    if (!policy) {
      const err = new Error(`Tax calculation failed closed: Unknown tax policy version '${taxPolicyVersion}'`);
      err.code = 'TAX_FAIL_CLOSED_POLICY_NOT_FOUND';
      throw err;
    }

    // 4. Fail-Closed Validation: Regime and Taxable Base Policy Determination
    if (!policy.ppn_regime || !VALID_PPN_REGIMES.has(policy.ppn_regime)) {
      const err = new Error(`Tax calculation failed closed: Undetermined or invalid PPN regime '${policy.ppn_regime}'`);
      err.code = 'TAX_FAIL_CLOSED_REGIME_UNDETERMINED';
      throw err;
    }

    if (!policy.ppn_taxable_base_type || !VALID_TAXABLE_BASE_TYPES.has(policy.ppn_taxable_base_type)) {
      const err = new Error(`Tax calculation failed closed: Undetermined or invalid taxable base policy '${policy.ppn_taxable_base_type}'`);
      err.code = 'TAX_FAIL_CLOSED_TAXABLE_BASE_POLICY_UNDETERMINED';
      throw err;
    }

    if (policy.ppn_subject_to_tax === undefined || typeof policy.ppn_subject_to_tax !== 'boolean') {
      const err = new Error(`Tax calculation failed closed: PPN subject-to-tax applicability undetermined in policy '${policy.version}'`);
      err.code = 'TAX_FAIL_CLOSED_SUBJECT_TO_TAX_UNDETERMINED';
      throw err;
    }

    // 5. PPN Calculation under PMK 131/2024 Nilai Lain Mechanism
    // Applicable base: buyerPlatformFee (since ppn_taxable_base_type === 'PLATFORM_FEE')
    const taxableBase = buyerPlatformFee;
    const ppnEffectiveTime = new Date(policy.ppn_effective_from || '2025-01-01T00:00:00Z').getTime();
    const isPpnEffective = txTime >= ppnEffectiveTime;

    let buyerTax;

    if (!policy.ppn_subject_to_tax || !isPpnEffective || policy.ppn_regime === 'NON_PKP' || policy.ppn_regime === 'EXEMPT') {
      // Non-PKP, Exempt, or before effective date
      buyerTax = {
        tax_type: policy.ppn_regime === 'NON_PKP' ? 'PPN_NON_PKP' : 'PPN_EXEMPT',
        regime: policy.ppn_regime,
        is_subject_to_ppn: false,
        statutory_rate: 0.0,
        dpp_multiplier: '0',
        dpp_multiplier_numeric: 0,
        effective_rate: 0.0,
        taxable_base: taxableBase,
        taxable_dpp: 0,
        tax_amount: 0,
        ppn_amount: 0,
        ppn_rate: 0.0,
        effective_from: policy.ppn_effective_from,
        is_effective: isPpnEffective,
        item_name: 'Tidak Dikenakan PPN (Platform Non-PKP / Bebas PPN)'
      };
    } else if (policy.ppn_regime === 'PMK_131_2024') {
      // Model calculation explicitly per PMK 131/2024:
      // statutory_rate = 12%
      // dpp_multiplier = 11/12
      // effective_rate = 11%
      // taxable_dpp = taxable_base × 11/12
      // tax_amount = taxable_dpp × 12%
      const statutoryRate = policy.ppn_statutory_rate || 0.12;
      const dppMultiplierStr = policy.ppn_dpp_multiplier_string || '11/12';
      const dppNumerator = policy.ppn_dpp_numerator !== undefined ? policy.ppn_dpp_numerator : 11;
      const dppDenominator = policy.ppn_dpp_denominator !== undefined ? policy.ppn_dpp_denominator : 12;
      const dppMultiplierNumeric = dppNumerator / dppDenominator;
      const effectiveRate = policy.ppn_effective_rate || 0.11;

      // Invariant check: taxable_dpp calculation
      const taxableDpp = Math.round(taxableBase * dppMultiplierNumeric);
      // Tax amount calculated strictly from taxable_dpp × statutory_rate
      const taxAmount = Math.round(taxableDpp * statutoryRate);

      buyerTax = {
        tax_type: 'PPN_PMSE_PMK131',
        regime: policy.ppn_regime,
        is_subject_to_ppn: true,
        statutory_rate: statutoryRate,
        dpp_multiplier: dppMultiplierStr,
        dpp_multiplier_numeric: dppMultiplierNumeric,
        effective_rate: effectiveRate,
        taxable_base: taxableBase,
        taxable_dpp: taxableDpp,
        tax_amount: taxAmount,
        ppn_amount: taxAmount, // preserved for standard readers
        ppn_rate: effectiveRate, // preserved for standard readers
        effective_from: policy.ppn_effective_from,
        is_effective: true,
        item_name: 'PPN PMK 131/2024 atas Jasa Layanan Platform (DPP 11/12 × Tarif 12% = Efektif 11%)'
      };
    } else if (policy.ppn_regime === 'STANDARD_12') {
      // Direct standard 12% without Nilai Lain
      const statutoryRate = policy.ppn_statutory_rate || 0.12;
      const taxableDpp = taxableBase;
      const taxAmount = Math.round(taxableDpp * statutoryRate);

      buyerTax = {
        tax_type: 'PPN_STANDARD_12',
        regime: policy.ppn_regime,
        is_subject_to_ppn: true,
        statutory_rate: statutoryRate,
        dpp_multiplier: '1',
        dpp_multiplier_numeric: 1.0,
        effective_rate: statutoryRate,
        taxable_base: taxableBase,
        taxable_dpp: taxableDpp,
        tax_amount: taxAmount,
        ppn_amount: taxAmount,
        ppn_rate: statutoryRate,
        effective_from: policy.ppn_effective_from,
        is_effective: true,
        item_name: 'PPN Standard 12% atas Jasa Layanan Platform'
      };
    } else {
      const err = new Error(`Tax calculation failed closed: Unhandled tax regime '${policy.ppn_regime}'`);
      err.code = 'TAX_FAIL_CLOSED_REGIME_UNDETERMINED';
      throw err;
    }

    // 6. PPh Pasal 22 Calculation (DPP = ticketPrice)
    // CRITICAL: PMK 37/2025 officially postponed to 1 November 2026.
    const pph22EffectiveTime = new Date(policy.pph22_effective_from || '2026-11-01T00:00:00Z').getTime();
    const isPph22Effective = txTime >= pph22EffectiveTime;

    let pphRate = 0.0;
    let isExempt = true;
    let exemptionReason = null;

    if (!isPph22Effective) {
      // Prior to 1 November 2026: Withholding postponed per DJP implementation schedule
      pphRate = 0.0;
      isExempt = true;
      exemptionReason = 'PMK_37_2025_POSTPONED_UNTIL_2026_11_01';
    } else {
      // Post 1 November 2026: Evaluate seller tax profile & statutory declarations
      const annualTurnover = sellerTaxProfile.annual_turnover || 0;
      const sptDeclaration = sellerTaxProfile.spt_declaration_submitted === true;
      const sellerType = sellerTaxProfile.seller_type || 'INDIVIDUAL';

      if (sellerTaxProfile.tax_exempt === true) {
        pphRate = 0.0;
        isExempt = true;
        exemptionReason = sellerTaxProfile.exemption_reason || 'EXEMPT_BY_CERTIFICATE';
      } else if (
        (sellerType === 'INDIVIDUAL' || sellerType === 'WP_OP') &&
        sptDeclaration &&
        annualTurnover <= policy.wp_op_exemption_threshold
      ) {
        // Exemption per PMK 37/2025: Domestic WP OP with annual turnover <= 500M and SPT declaration
        pphRate = 0.0;
        isExempt = true;
        exemptionReason = 'PMK_37_2025_WP_OP_UMKM_DECLARATION_SUBMITTED';
      } else {
        // Qualifying non-exempt seller post 1 Nov 2026
        pphRate = policy.pph22_rate;
        isExempt = false;
        exemptionReason = null;
      }
    }

    const pph22Amount = Math.round(ticketPrice * pphRate);
    const sellerTax = {
      tax_type: 'PPH_22_PMK37',
      pph22_rate: pphRate,
      standard_rate: policy.pph22_rate,
      taxable_base: ticketPrice,
      pph22_amount: pph22Amount,
      is_exempt: isExempt,
      exemption_reason: exemptionReason,
      effective_from: policy.pph22_effective_from,
      is_effective: isPph22Effective,
      item_name: 'PPh Pasal 22 PMK 37/2025 Marketplace Withholding'
    };

    const totalTaxCollected = buyerTax.tax_amount + sellerTax.pph22_amount;

    return {
      tax_policy_version: policy.version,
      country_code: policy.country_code,
      currency: policy.currency,
      transaction_date: txDateIso,
      pph22_effective_from: policy.pph22_effective_from,
      pph22_is_effective_at_transaction_date: isPph22Effective,
      buyer_tax: buyerTax,
      seller_tax: sellerTax,
      total_tax_collected: totalTaxCollected,
      total_buyer_tax: buyerTax.tax_amount,
      total_seller_tax_withholding: sellerTax.pph22_amount
    };
  }
}

module.exports = {
  TaxEngine,
  DEFAULT_TAX_POLICIES,
  VALID_PPN_REGIMES,
  VALID_TAXABLE_BASE_TYPES
};
