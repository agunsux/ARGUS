const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { ESCROW_STATUS } = require('./escrowService');

class SettlementService {
  /**
   * Execute settlement disbursement to seller account
   * SIMULATED / PILOT-ONLY until real payment provider integrated.
   * Server-side amount only — client cannot override price/fee/settlement.
   */
  static async executeSettlement({ orderId, sellerId, officerId, idempotencyKey, bankAccount }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) throw new Error('Escrow not found');

    if (sellerId && order.seller_id !== sellerId) {
      const err = new Error('Security violation: seller mismatch for settlement');
      err.code = 'SELLER_MISMATCH';
      throw err;
    }

    if (officerId) {
      const officer = state.users.find(u => u.id === officerId);
      if (!officer || officer.role !== 'admin') {
        const err = new Error('Forbidden: settlement requires admin officer');
        err.code = 'SETTLEMENT_FORBIDDEN';
        throw err;
      }
    }

    // Idempotency check (same key)
    const existing = state.settlements.find(s => s.idempotency_key === idempotencyKey);
    if (existing) {
      return { settlement: existing, idempotent: true };
    }

    // Duplicate settlement prevention per order (different key, same order)
    const existingForOrder = state.settlements.find(s => s.order_id === orderId);
    if (existingForOrder) {
      return { settlement: existingForOrder, idempotent: true, duplicatePrevented: true };
    }

    const settlementId = `stl-${uuidv4()}`;
    const settlement = {
      id: settlementId,
      order_id: orderId,
      seller_id: order.seller_id,
      amount: escrow.amount,
      status: 'EXECUTED',
      mode: 'SIMULATED',
      settlement_mode: 'SIMULATED',
      payout_ref: `disb-${Date.now()}`,
      bank_account: bankAccount || 'BCA 1234567890 (a.n Budi Santoso)',
      idempotency_key: idempotencyKey,
      executed_at: new Date().toISOString()
    };
    state.settlements.push(settlement);

    await recordAuditLog('SETTLEMENT', settlementId, 'EXECUTED', officerId, {
      order_id: orderId,
      seller_id: sellerId,
      amount: settlement.amount,
      payout_ref: settlement.payout_ref
    });

    return { settlement, idempotent: false };
  }
}

module.exports = { SettlementService };

