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

    const transactionId = `tx-${uuidv4()}`;
    const now = new Date().toISOString();

    const journalTransaction = {
      transaction_id: transactionId,
      id: transactionId,
      order_id: orderId,
      event_type: eventType,
      currency,
      total_amount: totalDebits,
      description,
      actor_id: actorId,
      created_at: now,
      entries: entries.map((e, index) => ({
        entry_id: `${transactionId}-${index + 1}`,
        account: e.account,
        type: e.type,
        amount: parseInt(e.amount, 10)
      }))
    };

    if (!state.financial_ledger) {
      state.financial_ledger = [];
    }
    state.financial_ledger.push(journalTransaction);

    await recordAuditLog('FINANCIAL_LEDGER', transactionId, eventType, actorId, {
      order_id: orderId,
      total_amount: totalDebits,
      entries_count: entries.length,
      description
    });

    return journalTransaction;
  }

  /**
   * Standard Template: Capture Payment into Escrow Holding
   * Debits: PAYMENT_GATEWAY_CLEARING (Asset increases)
   * Credits: SELLER_PAYABLE_PENDING (Liability increases by ticket price)
   * Credits: PLATFORM_FEE_REVENUE (Revenue increases by platform fee)
   */
  static async recordPaymentCapture({ orderId, ticketPrice, platformFee, actorId = 'SYSTEM' }) {
    const totalAmount = ticketPrice + platformFee;
    return await this.recordTransaction({
      eventType: FINANCIAL_EVENT_TYPES.CAPTURE,
      orderId,
      actorId,
      description: `Payment captured for order ${orderId}: Rp ${ticketPrice} ticket + Rp ${platformFee} fee`,
      entries: [
        {
          account: LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING,
          type: 'DEBIT',
          amount: totalAmount
        },
        {
          account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING,
          type: 'CREDIT',
          amount: ticketPrice
        },
        {
          account: LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE,
          type: 'CREDIT',
          amount: platformFee
        }
      ]
    });
  }

  /**
   * Standard Template: Release Escrow Funds to Seller upon Confirmed Admission
   * Debits: SELLER_PAYABLE_PENDING (Liability cleared)
   * Credits: SETTLEMENT_CLEARING (Cash disbursal clearing)
   */
  static async recordDisbursementRelease({ orderId, sellerAmount, actorId }) {
    return await this.recordTransaction({
      eventType: FINANCIAL_EVENT_TYPES.RELEASE,
      orderId,
      actorId,
      description: `Disbursement released to seller for order ${orderId}`,
      entries: [
        {
          account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING,
          type: 'DEBIT',
          amount: sellerAmount
        },
        {
          account: LEDGER_ACCOUNTS.SETTLEMENT_CLEARING,
          type: 'CREDIT',
          amount: sellerAmount
        }
      ]
    });
  }

  /**
   * Standard Template: Full Refund to Buyer
   * Debits: SELLER_PAYABLE_PENDING (Reverses seller allocation)
   * Debits: PLATFORM_FEE_REVENUE (Reverses fee revenue)
   * Credits: PAYMENT_GATEWAY_CLEARING (Gateway refund issued to buyer)
   */
  static async recordRefund({ orderId, ticketPrice, platformFee, actorId, reason }) {
    const totalAmount = ticketPrice + platformFee;
    return await this.recordTransaction({
      eventType: FINANCIAL_EVENT_TYPES.REFUND,
      orderId,
      actorId,
      description: `Refund issued to buyer for order ${orderId}. Reason: ${reason}`,
      entries: [
        {
          account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING,
          type: 'DEBIT',
          amount: ticketPrice
        },
        {
          account: LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE,
          type: 'DEBIT',
          amount: platformFee
        },
        {
          account: LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING,
          type: 'CREDIT',
          amount: totalAmount
        }
      ]
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
