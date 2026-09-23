/**
 * TIKUM / ARGUS — Economics Engine & Contribution Margin Calculator
 * 
 * Production-grade marketplace unit economics, fee monetization, and treasury health metrics.
 * 
 * Calculates:
 * - GMV (Gross Merchandise Value)
 * - Platform Gross Revenue (Two-sided fees)
 * - Variable Transaction Costs:
 *   1. Payment Gateway Fee (e.g., 1.4% + Rp 1,500 per transaction)
 *   2. Bank Payout Disbursal Fee (e.g., Rp 2,500 per seller transfer)
 *   3. Field PIC Turnstile Cost Allocation (e.g., Rp 10,000 per verified turnstile admission)
 *   4. Fraud / Dispute Risk Reserve (e.g., 1.0% of GMV)
 * - Net Contribution Margin = Gross Revenue - Total Variable Costs
 * - Contribution Margin Ratio = Net Contribution Margin / Gross Revenue
 * - Double-Entry Ledger Verification: cross-referenced against authoritative ledger balances
 */

const { state } = require('../database');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('../settlement/FinancialLedger');

const DEFAULT_COST_CONFIG = {
  payment_gateway_percent: 0.014, // 1.4% QRIS / Virtual Account fee
  payment_gateway_fixed: 1500, // Rp 1,500 fixed cost per capture
  disbursement_fee_fixed: 2500, // Rp 2,500 fixed bank disbursal fee
  risk_reserve_rate: 0.010, // 1.0% of ticket price reserved for fraud/guarantee pool
  pic_turnstile_cost_per_order: 10000 // Rp 10,000 operational cost per verified gate admission
};

class EconomicsEngine {
  /**
   * Compute comprehensive marketplace unit economics and contribution margin
   * 
   * @param {Object} [options]
   * @param {Array} [options.orders] - Optional override array of orders to analyze
   * @param {string} [options.startDate]
   * @param {string} [options.endDate]
   * @param {Object} [options.costConfig]
   */
  static calculateContributionMargin(options = {}) {
    const costConfig = { ...DEFAULT_COST_CONFIG, ...(options.costConfig || {}) };
    const allOrders = options.orders || state.orders || [];

    const filteredOrders = allOrders.filter(order => {
      // Analyze orders that are at least paid/escrowed or settled
      const isPaidOrSettled = ['PAID_ESCROWED', 'ENTRY_CONFIRMED', 'SETTLED', 'RELEASED'].includes(order.status);
      if (!isPaidOrSettled) return false;

      if (options.startDate && new Date(order.created_at) < new Date(options.startDate)) return false;
      if (options.endDate && new Date(order.created_at) > new Date(options.endDate)) return false;

      return true;
    });

    let totalGmv = 0; // Gross ticket volume
    let totalBuyerInflow = 0; // Total amount paid by buyers
    let totalBuyerFees = 0;
    let totalSellerFees = 0;
    let totalPlatformGrossRevenue = 0;
    let totalBuyerTax = 0;
    let totalSellerTaxWithholding = 0;
    let totalTaxCollected = 0;
    let totalSellerNetPayout = 0;

    let totalPaymentGatewayCosts = 0;
    let totalDisbursalCosts = 0;
    let totalRiskReserve = 0;
    let totalPicCosts = 0;

    let settledCount = 0;
    let verifiedAdmissionCount = 0;

    for (const order of filteredOrders) {
      const ticketPrice = order.gross_ticket_value || order.ticket_price || 0;
      const buyerFee = order.buyer_fee !== undefined ? order.buyer_fee : (order.platform_fee || 0);
      const sellerFee = order.seller_fee || 0;
      const grossRevenue = buyerFee + sellerFee;

      const buyerTax = order.buyer_tax || 0;
      const sellerTax = order.seller_tax_withholding || 0;
      const buyerTotal = order.buyer_total || order.total_amount || (ticketPrice + buyerFee + buyerTax);
      const sellerPayout = order.seller_net_payout || (ticketPrice - sellerFee - sellerTax);

      totalGmv += ticketPrice;
      totalBuyerInflow += buyerTotal;
      totalBuyerFees += buyerFee;
      totalSellerFees += sellerFee;
      totalPlatformGrossRevenue += grossRevenue;
      totalBuyerTax += buyerTax;
      totalSellerTaxWithholding += sellerTax;
      totalTaxCollected += (buyerTax + sellerTax);
      totalSellerNetPayout += sellerPayout;

      // Variable Costs
      const pgCost = Math.round(buyerTotal * costConfig.payment_gateway_percent) + costConfig.payment_gateway_fixed;
      totalPaymentGatewayCosts += pgCost;

      const riskCost = Math.round(ticketPrice * costConfig.risk_reserve_rate);
      totalRiskReserve += riskCost;

      if (order.status === 'SETTLED' || order.status === 'RELEASED') {
        settledCount++;
        totalDisbursalCosts += costConfig.disbursement_fee_fixed;
      }

      // Check if entry verification was confirmed for this order
      const hasAdmission = state.entry_verifications?.some(
        ev => ev.order_id === order.id && ev.status === 'CONFIRMED'
      );
      if (hasAdmission || order.status === 'ENTRY_CONFIRMED' || order.status === 'SETTLED') {
        verifiedAdmissionCount++;
        totalPicCosts += costConfig.pic_turnstile_cost_per_order;
      }
    }

    const totalVariableCosts = totalPaymentGatewayCosts + totalDisbursalCosts + totalRiskReserve + totalPicCosts;
    const netContributionMargin = totalPlatformGrossRevenue - totalVariableCosts;
    const contributionMarginRatio = totalPlatformGrossRevenue > 0
      ? parseFloat((netContributionMargin / totalPlatformGrossRevenue).toFixed(4))
      : 0;

    const takeRate = totalGmv > 0
      ? parseFloat((totalPlatformGrossRevenue / totalGmv).toFixed(4))
      : 0;

    // Cross-reference authoritative ledger balances
    const ledgerBalances = FinancialLedger.getAccountBalances();

    return {
      order_count: filteredOrders.length,
      settled_count: settledCount,
      verified_admission_count: verifiedAdmissionCount,
      gmv: totalGmv,
      buyer_total_inflow: totalBuyerInflow,
      gross_revenue: {
        total: totalPlatformGrossRevenue,
        buyer_fees: totalBuyerFees,
        seller_fees: totalSellerFees,
        take_rate: takeRate
      },
      taxes: {
        total_collected: totalTaxCollected,
        buyer_ppn: totalBuyerTax,
        seller_pph22_withholding: totalSellerTaxWithholding,
        ledger_tax_payable: Math.abs(ledgerBalances[LEDGER_ACCOUNTS.TAX_PAYABLE] || 0)
      },
      seller_settlement: {
        total_net_payout: totalSellerNetPayout,
        ledger_pending_payable: Math.abs(ledgerBalances[LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING] || 0),
        ledger_cleared_disbursals: Math.abs(ledgerBalances[LEDGER_ACCOUNTS.SETTLEMENT_CLEARING] || 0)
      },
      variable_costs: {
        payment_gateway_fees: totalPaymentGatewayCosts,
        disbursement_fees: totalDisbursalCosts,
        risk_reserve_pool: totalRiskReserve,
        pic_turnstile_allocation: totalPicCosts,
        total_variable_costs: totalVariableCosts
      },
      unit_economics: {
        net_contribution_margin: netContributionMargin,
        contribution_margin_ratio: contributionMarginRatio,
        average_revenue_per_order: filteredOrders.length > 0 ? Math.round(totalPlatformGrossRevenue / filteredOrders.length) : 0,
        average_contribution_per_order: filteredOrders.length > 0 ? Math.round(netContributionMargin / filteredOrders.length) : 0
      },
      ledger_balances: ledgerBalances
    };
  }
}

module.exports = {
  EconomicsEngine,
  DEFAULT_COST_CONFIG
};
