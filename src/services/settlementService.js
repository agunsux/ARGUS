const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { ESCROW_STATUS } = require('./escrowService');

class SettlementService {
  /**
   * Execute settlement disbursement to seller account
   */
  static async executeSettlement({ orderId, sellerId, officerId, idempotencyKey, bankAccount }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) throw new Error('Escrow not found');

    if (escrow.status !== ESCROW_STATUS.RELEASED) {
      const err = new Error(`Cannot execute settlement: Escrow status must be RELEASED (current: ${escrow.status})`);
      err.code = 'ESCROW_NOT_RELEASED';
      throw err;
    }

    // Idempotency check
    const existing = state.settlements.find(s => s.idempotency_key === idempotencyKey);
    if (existing) {
      return { settlement: existing, idempotent: true };
    }

    const settlementId = `stl-${uuidv4()}`;
    const settlement = {
      id: settlementId,
      order_id: orderId,
      seller_id: sellerId,
      amount: escrow.amount,
      status: 'EXECUTED',
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

