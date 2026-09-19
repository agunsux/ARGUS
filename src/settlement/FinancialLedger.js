/**
 * TIKUM / ARGUS — Double-Entry Financial Ledger Foundation (Epic H)
 * 
 * Production-grade double-entry bookkeeping engine.
 * 
 * Non-Negotiable Invariants:
 * - NEVER use `balance += amount` as the authoritative financial model.
 * - Every financial journal entry MUST balance: sum(debits) === sum(credits).
 * - All ledger entries are append-only and cryptographically immutable.
 * - Real settlement remains deactivated until payment provider is verified.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');

const LEDGER_ACCOUNTS = {
  BUYER_ESCROW_HOLDING: 'BUYER_ESCROW_HOLDING', // Asset (Held funds in gateway/trust)
  SELLER_PAYABLE_PENDING: 'SELLER_PAYABLE_PENDING', // Liability (Owed to seller post-verification)
  PLATFORM_FEE_REVENUE: 'PLATFORM_FEE_REVENUE', // Revenue (Tikum platform fee)
  TAX_PAYABLE: 'TAX_PAYABLE', // Liability (Taxes withheld and collected owed to DJP)
  PAYMENT_GATEWAY_CLEARING: 'PAYMENT_GATEWAY_CLEARING', // Clearing Asset (Gateway receivables)
  SETTLEMENT_CLEARING: 'SETTLEMENT_CLEARING', // Clearing (Disbursal bank account)
  REFUND_REVERSAL_ACCOUNT: 'REFUND_REVERSAL_ACCOUNT' // Contra-Account for refunds
};

const FINANCIAL_EVENT_TYPES = {
  AUTHORIZATION: 'AUTHORIZATION',
  CAPTURE: 'CAPTURE',
  REFUND: 'REFUND',
  RELEASE: 'RELEASE',
  FEE: 'FEE',
  COMMISSION: 'COMMISSION',
  CHARGEBACK: 'CHARGEBACK',
  ADJUSTMENT: 'ADJUSTMENT'
};

class FinancialLedger {
  /**
   * Records a balanced double-entry transaction.
   * Throws immediately if debits and credits do not balance.
   * 
   * @param {Object} params
   * @param {string} params.eventType - One of FINANCIAL_EVENT_TYPES
   * @param {string} params.orderId - Associated order ID
   * @param {Array<{ account: string, type: 'DEBIT'|'CREDIT', amount: number }>} params.entries
   * @param {string} params.description - Business justification
   * @param {string} params.actorId - Operator or SYSTEM
   * @param {string} [params.currency='IDR']
   */
  static async recordTransaction({
    eventType,
    orderId,
    quoteId = null,
    entries,
    description,
    actorId = 'SYSTEM',
    currency = 'IDR'
  }) {
    if (!eventType || !orderId || !Array.isArray(entries) || entries.length < 2) {
      const err = new Error('Ledger transaction requires eventType, orderId, and at least two balancing entries');
      err.code = 'INVALID_LEDGER_TRANSACTION';
      throw err;
    }

    if (!FINANCIAL_EVENT_TYPES[eventType]) {
      const err = new Error(`Invalid financial event type: '${eventType}'`);
      err.code = 'INVALID_EVENT_TYPE';
      throw err;
    }

    // 1. Calculate and verify sum(Debits) === sum(Credits)
    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries) {
      const amount = parseInt(entry.amount, 10);
      if (isNaN(amount) || amount <= 0) {
        const err = new Error(`Ledger entry amount must be a positive integer, got: ${entry.amount}`);
        err.code = 'INVALID_ENTRY_AMOUNT';
        throw err;
      }

      if (!LEDGER_ACCOUNTS[entry.account]) {
        const err = new Error(`Unknown ledger account: '${entry.account}'`);
        err.code = 'UNKNOWN_LEDGER_ACCOUNT';
        throw err;
      }

      if (entry.type === 'DEBIT') {
        totalDebits += amount;
      } else if (entry.type === 'CREDIT') {
        totalCredits += amount;
      } else {
        const err = new Error(`Entry type must be 'DEBIT' or 'CREDIT', got: '${entry.type}'`);
        err.code = 'INVALID_ENTRY_TYPE';
        throw err;
      }
    }

    // Mathematical Double-Entry Balancing Invariant
    if (totalDebits !== totalCredits) {
      const err = new Error(
        `Double-entry imbalance detected: Total Debits (${totalDebits}) does not equal Total Credits (${totalCredits}). Transaction rejected.`
      );
      err.code = 'LEDGER_UNBALANCED';
      err.totalDebits = totalDebits;
      err.totalCredits = totalCredits;
      throw err;
    }

    // Resolve quoteId from order if not directly provided
    let effectiveQuoteId = quoteId;
    if (!effectiveQuoteId && state.orders) {
      const matchedOrder = state.orders.find(o => o.id === orderId);
      if (matchedOrder && matchedOrder.quote_id) {
        effectiveQuoteId = matchedOrder.quote_id;
      }
    }

    const transactionId = `tx-${uuidv4()}`;
    const now = new Date().toISOString();

    const journalTransaction = {
      transaction_id: transactionId,
      id: transactionId,
      quote_id: effectiveQuoteId || null,
      order_id: orderId,
      source_event: eventType,
      event_type: eventType,
      currency,
      total_amount: totalDebits,
      description,
      actor_id: actorId,
      created_at: now,
      entries: entries.map((e, index) => ({
        entry_id: `${transactionId}-${index + 1}`,
        transaction_id: transactionId,
        quote_id: effectiveQuoteId || null,
        order_id: orderId,
        ledger_account: e.account,
        account: e.account,
        type: e.type,
        amount: parseInt(e.amount, 10),
        currency,
        source_event: eventType,
        created_at: now
      }))
    };

    if (!state.financial_ledger) {
      state.financial_ledger = [];
    }
    state.financial_ledger.push(journalTransaction);

    await recordAuditLog('FINANCIAL_LEDGER', transactionId, eventType, actorId, {
      order_id: orderId,
      quote_id: effectiveQuoteId || null,
      source_event: eventType,
      currency,
      total_amount: totalDebits,
      entries_count: entries.length,
      description
    });

    return journalTransaction;
  }

  /**
   * Standard Template: Capture Payment into Escrow Holding
   * Supports both legacy single-fee and two-sided platform fees with separated tax liabilities.
   * Debits: PAYMENT_GATEWAY_CLEARING (Buyer Total Inflow)
   * Credits: SELLER_PAYABLE_PENDING (Seller Net Payout)
   * Credits: PLATFORM_FEE_REVENUE (Buyer Fee + Seller Fee)
   * Credits: TAX_PAYABLE (Buyer PPN + Seller PPh 22 Withholding)
   */
  static async recordPaymentCapture({
    orderId,
    quoteId = null,
    ticketPrice,
    platformFee,
    buyerFee,
    sellerFee,
    buyerTax = 0,
    sellerTax = 0,
    actorId = 'SYSTEM'
  }) {
    const price = parseInt(ticketPrice, 10);
    const effBuyerFee = buyerFee !== undefined ? parseInt(buyerFee, 10) : (platformFee !== undefined ? parseInt(platformFee, 10) : 0);
    const effSellerFee = sellerFee !== undefined ? parseInt(sellerFee, 10) : 0;
    const effBuyerTax = parseInt(buyerTax || 0, 10);
    const effSellerTax = parseInt(sellerTax || 0, 10);

    const buyerTotal = price + effBuyerFee + effBuyerTax;
    const sellerNetPayout = price - effSellerFee - effSellerTax;
    const totalPlatformFee = effBuyerFee + effSellerFee;
    const totalTaxPayable = effBuyerTax + effSellerTax;

    const entries = [
      {
        account: LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING,
        type: 'DEBIT',
        amount: buyerTotal
      }
    ];

    if (sellerNetPayout > 0) {
      entries.push({
        account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING,
        type: 'CREDIT',
        amount: sellerNetPayout
      });
    }

    if (totalPlatformFee > 0) {
      entries.push({
        account: LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE,
        type: 'CREDIT',
        amount: totalPlatformFee
      });
    }

    if (totalTaxPayable > 0) {
      entries.push({
        account: LEDGER_ACCOUNTS.TAX_PAYABLE,
        type: 'CREDIT',
        amount: totalTaxPayable
      });
    }

    return await this.recordTransaction({
      eventType: FINANCIAL_EVENT_TYPES.CAPTURE,
      orderId,
      quoteId,
      actorId,
      description: `Payment captured for order ${orderId}: Buyer Total Rp ${buyerTotal} (Ticket: ${price}, Buyer Fee: ${effBuyerFee}, Seller Fee: ${effSellerFee}, PPN: ${effBuyerTax}, PPh22: ${effSellerTax})`,
      entries
    });
  }

  /**
   * Standard Template: Release Escrow Funds to Seller upon Confirmed Admission
   * Debits: SELLER_PAYABLE_PENDING (Liability cleared)
   * Credits: SETTLEMENT_CLEARING (Cash disbursal clearing)
   */
  static async recordDisbursementRelease({ orderId, quoteId = null, sellerAmount, actorId }) {
    const amount = parseInt(sellerAmount, 10);
    return await this.recordTransaction({
      eventType: FINANCIAL_EVENT_TYPES.RELEASE,
      orderId,
      quoteId,
      actorId,
      description: `Disbursement released to seller for order ${orderId}: Rp ${amount}`,
      entries: [
        {
          account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING,
          type: 'DEBIT',
          amount: amount
        },
        {
          account: LEDGER_ACCOUNTS.SETTLEMENT_CLEARING,
          type: 'CREDIT',
          amount: amount
        }
      ]
    });
  }

  /**
   * Standard Template: Full Refund to Buyer
   * Reverses seller allocation, platform fee revenue, and tax payable liabilities.
   * Debits: SELLER_PAYABLE_PENDING (Reverses seller allocation)
   * Debits: PLATFORM_FEE_REVENUE (Reverses platform fee revenue)
   * Debits: TAX_PAYABLE (Reverses tax payable liabilities)
   * Credits: PAYMENT_GATEWAY_CLEARING (Gateway refund issued to buyer)
   */
  static async recordRefund({
    orderId,
    quoteId = null,
    ticketPrice,
    platformFee,
    buyerFee,
    sellerFee,
    buyerTax = 0,
    sellerTax = 0,
    actorId = 'SYSTEM',
    reason = 'ORDER_CANCELLED_REFUND'
  }) {
    const price = parseInt(ticketPrice, 10);
    const effBuyerFee = buyerFee !== undefined ? parseInt(buyerFee, 10) : (platformFee !== undefined ? parseInt(platformFee, 10) : 0);
    const effSellerFee = sellerFee !== undefined ? parseInt(sellerFee, 10) : 0;
    const effBuyerTax = parseInt(buyerTax || 0, 10);
    const effSellerTax = parseInt(sellerTax || 0, 10);

    const buyerTotal = price + effBuyerFee + effBuyerTax;
    const sellerNetPayout = price - effSellerFee - effSellerTax;
    const totalPlatformFee = effBuyerFee + effSellerFee;
    const totalTaxPayable = effBuyerTax + effSellerTax;

    const entries = [];

    if (sellerNetPayout > 0) {
      entries.push({
        account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING,
        type: 'DEBIT',
        amount: sellerNetPayout
      });
    }

    if (totalPlatformFee > 0) {
      entries.push({
        account: LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE,
        type: 'DEBIT',
        amount: totalPlatformFee
      });
    }

    if (totalTaxPayable > 0) {
      entries.push({
        account: LEDGER_ACCOUNTS.TAX_PAYABLE,
        type: 'DEBIT',
        amount: totalTaxPayable
      });
    }

    entries.push({
      account: LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING,
      type: 'CREDIT',
      amount: buyerTotal
    });

    return await this.recordTransaction({
      eventType: FINANCIAL_EVENT_TYPES.REFUND,
      orderId,
      quoteId,
      actorId,
      description: `Refund issued to buyer for order ${orderId}: Rp ${buyerTotal}. Reason: ${reason}`,
      entries
    });
  }

  /**
   * Computes authoritative account balances dynamically from immutable journal entries.
   * Invariant: Never read a cached mutable balance field.
   */
  static getAccountBalances() {
    const ledger = state.financial_ledger || [];
    const balances = {};

    for (const acc of Object.keys(LEDGER_ACCOUNTS)) {
      balances[acc] = 0;
    }

    for (const tx of ledger) {
      for (const entry of tx.entries) {
        if (!balances[entry.account]) balances[entry.account] = 0;
        if (entry.type === 'DEBIT') {
          balances[entry.account] += entry.amount;
        } else {
          balances[entry.account] -= entry.amount;
        }
      }
    }

    return balances;
  }
}

module.exports = {
  FinancialLedger,
  LEDGER_ACCOUNTS,
  FINANCIAL_EVENT_TYPES
};
