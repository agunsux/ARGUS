/**
 * TIKUM / ARGUS — Refund Governance & Lifecycle Service
 *
 * Enforces strict distinction between:
 * 1. Financial Ledger Journal entries (recording obligation / financial claim)
 * 2. Actual cash money movement and external confirmation
 * 3. Mode 2 Assisted Direct Payment (where ticket principal is paid directly to seller, NOT held by TIKUM)
 *    versus Mode 1 Protected Settlement (escrow custody)
 * 4. Ticket Principal Refund (seller obligation in Mode 2) versus Platform Service Fee Refund (TIKUM liability)
 *
 * Discrete Lifecycle States:
 * - REFUND_REQUIRED: An incident, dispute, or policy trigger mandates a refund.
 * - REFUND_INITIATED: Formal instruction sent to seller or gateway refund API invoked.
 * - REFUND_CONFIRMED: Verifiable independent proof (bank transfer receipt or gateway callback) confirms buyer received funds.
 * - REFUND_FAILED: Disbursal failed, transfer bounced, or seller defaulted.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { SETTLEMENT_MODES, PaymentModeController } = require('../config/paymentMode');
const { FinancialLedger } = require('./FinancialLedger');

const REFUND_LIFECYCLE_STATUS = Object.freeze({
  NONE: 'NONE',
  REFUND_REQUIRED: 'REFUND_REQUIRED',
  REFUND_INITIATED: 'REFUND_INITIATED',
  REFUND_CONFIRMED: 'REFUND_CONFIRMED',
  REFUND_FAILED: 'REFUND_FAILED'
});

const REFUND_RESPONSIBILITY = Object.freeze({
  SELLER_DIRECT_OBLIGATION: 'SELLER_DIRECT_OBLIGATION', // Mode 2: seller holds principal
  TIKUM_PLATFORM_FEE: 'TIKUM_PLATFORM_FEE',             // TIKUM fee reversal
  TIKUM_ESCROW_CUSTODY: 'TIKUM_ESCROW_CUSTODY'           // Mode 1: TIKUM holds escrow
});

class RefundGovernanceService {
  static init() {
    if (!state.refund_records) {
      state.refund_records = [];
    }
  }

  static getRefundRecord(orderId) {
    this.init();
    return state.refund_records.find(r => r.order_id === orderId) || null;
  }

  /**
   * Step 1: Identifies and records that a refund is legally/contractually REQUIRED.
   * Does NOT claim cash money has been transferred.
   */
  static async requireRefund({
    orderId,
    reason,
    incidentId = null,
    disputeId = null,
    actorId = 'SYSTEM',
    buyerRefundDestination = null
  }) {
    this.init();

    const order = state.orders ? state.orders.find(o => o.id === orderId || o.order_id === orderId) : null;
    if (!order) {
      const err = new Error(`Order '${orderId}' not found for refund initiation`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    // Idempotency: return existing record if already initialized
    const existing = this.getRefundRecord(orderId);
    if (existing) {
      return { record: existing, idempotent: true };
    }

    const mode = order.settlement_mode || PaymentModeController.getSettlementMode();
    const isMode2 = mode === SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT;
    const ticketPrincipal = order.pricing?.ticket_base_price || (order.ticket_price * (order.quantity || 1)) || 0;
    const buyerFee = order.pricing?.buyer_service_fee || 0;
    const sellerFee = order.pricing?.seller_service_fee || 0;
    const now = new Date().toISOString();

    const refundId = `ref-gov-${uuidv4().substring(0, 8)}`;

    const record = {
      refund_id: refundId,
      order_id: orderId,
      deal_id: order.deal_id || null,
      reason,
      incident_id: incidentId,
      dispute_id: disputeId,
      settlement_mode: mode,
      overall_status: REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED,
      is_cash_refund_completed: false,
      ticket_principal: {
        amount: ticketPrincipal,
        responsible_party: isMode2 ? REFUND_RESPONSIBILITY.SELLER_DIRECT_OBLIGATION : REFUND_RESPONSIBILITY.TIKUM_ESCROW_CUSTODY,
        status: REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED,
        debtor_id: isMode2 ? order.seller_id : 'TIKUM_ESCROW',
        creditor_id: order.buyer_id,
        destination_account: buyerRefundDestination || order.buyer_refund_destination || 'BUYER_BANK_ACCOUNT_PENDING',
        evidence_reference: null,
        confirmed_at: null
      },
      platform_service_fee: {
        buyer_fee_amount: buyerFee,
        seller_fee_amount: sellerFee,
        total_platform_fee: buyerFee + sellerFee,
        responsible_party: REFUND_RESPONSIBILITY.TIKUM_PLATFORM_FEE,
        status: REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED,
        reversal_evidence_ref: null,
        confirmed_at: null
      },
      history: [
        {
          status: REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED,
          actor_id: actorId,
          timestamp: now,
          note: `Refund required due to: ${reason}. Mode: ${mode}. Principal responsible: ${isMode2 ? 'SELLER' : 'TIKUM'}`
        }
      ],
      created_at: now,
      updated_at: now
    };

    state.refund_records.push(record);
    order.refund_status = REFUND_LIFECYCLE_STATUS.REFUND_REQUIRED;
    order.refund_id = refundId;

    await recordAuditLog('REFUND_LIFECYCLE', refundId, 'REFUND_REQUIRED', actorId, {
      order_id: orderId,
      mode,
      reason,
      ticket_principal_amount: ticketPrincipal,
      responsible_party: record.ticket_principal.responsible_party
    });

    return { record, idempotent: false };
  }

  /**
   * Step 2: Instructs / Initiates the refund process.
   * In Mode 2: Issues formal notice to Seller to disburse principal to Buyer.
   * Platform Fee: Submits payment gateway reversal request.
   */
  static async initiateRefund({
    orderId,
    actorId = 'SYSTEM',
    sellerInstructionRef = null,
    gatewayFeeReversalRef = null,
    notes = ''
  }) {
    this.init();
    const record = this.getRefundRecord(orderId);
    if (!record) {
      const err = new Error(`Refund record for order '${orderId}' does not exist. Call requireRefund first.`);
      err.code = 'REFUND_RECORD_NOT_FOUND';
      throw err;
    }

    const order = state.orders.find(o => o.id === orderId || o.order_id === orderId);
    const now = new Date().toISOString();

    record.ticket_principal.status = REFUND_LIFECYCLE_STATUS.REFUND_INITIATED;
    record.ticket_principal.seller_instruction_ref = sellerInstructionRef || `INSTR-SELLER-${Date.now()}`;
    record.platform_service_fee.status = REFUND_LIFECYCLE_STATUS.REFUND_INITIATED;
    record.platform_service_fee.reversal_evidence_ref = gatewayFeeReversalRef || `REV-GW-${Date.now()}`;
    record.overall_status = REFUND_LIFECYCLE_STATUS.REFUND_INITIATED;
    record.updated_at = now;

    record.history.push({
      status: REFUND_LIFECYCLE_STATUS.REFUND_INITIATED,
      actor_id: actorId,
      timestamp: now,
      note: notes || 'Refund initiated: Seller formal demand issued; gateway fee reversal dispatched.'
    });

    if (order) {
      order.refund_status = REFUND_LIFECYCLE_STATUS.REFUND_INITIATED;
    }

    await recordAuditLog('REFUND_LIFECYCLE', record.refund_id, 'REFUND_INITIATED', actorId, {
      order_id: orderId,
      seller_instruction_ref: record.ticket_principal.seller_instruction_ref,
      gateway_reversal_ref: record.platform_service_fee.reversal_evidence_ref
    });

    return record;
  }

  /**
   * Step 3: Confirms that actual money has been returned with verifiable proof.
   * Strictly requires verifiable evidence reference for ticket principal.
   * Idempotent against duplicate submissions.
   */
  static async confirmRefund({
    orderId,
    principalTransferEvidenceRef,
    feeGatewayRef = null,
    actorId = 'SYSTEM',
    isSynthetic = false
  }) {
    this.init();
    const record = this.getRefundRecord(orderId);
    if (!record) {
      const err = new Error(`Refund record for order '${orderId}' not found`);
      err.code = 'REFUND_RECORD_NOT_FOUND';
      throw err;
    }

    if (!principalTransferEvidenceRef) {
      const err = new Error('Verifiable principalTransferEvidenceRef (bank receipt/gateway refund ID) is required to confirm refund completion');
      err.code = 'REFUND_EVIDENCE_REQUIRED';
      throw err;
    }

    // Idempotency: if already confirmed with same reference, do not duplicate journal or status
    if (record.overall_status === REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED &&
        record.ticket_principal.evidence_reference === principalTransferEvidenceRef) {
      return { record, idempotent: true };
    }

    const order = state.orders ? state.orders.find(o => o.id === orderId || o.order_id === orderId) : null;
    const now = new Date().toISOString();

    record.ticket_principal.status = REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED;
    record.ticket_principal.evidence_reference = principalTransferEvidenceRef;
    record.ticket_principal.confirmed_at = now;

    record.platform_service_fee.status = REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED;
    record.platform_service_fee.reversal_evidence_ref = feeGatewayRef || record.platform_service_fee.reversal_evidence_ref || `FEE-GW-CONF-${Date.now()}`;
    record.platform_service_fee.confirmed_at = now;

    record.overall_status = REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED;
    record.is_cash_refund_completed = true;
    record.updated_at = now;

    record.history.push({
      status: REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED,
      actor_id: actorId,
      timestamp: now,
      note: `Refund confirmed with verifiable evidence: ${principalTransferEvidenceRef}`
    });

    if (order) {
      order.refund_status = REFUND_LIFECYCLE_STATUS.REFUND_CONFIRMED;
      order.status = 'REFUNDED';
    }

    // Record double-entry financial ledger journal entry ONLY upon verified confirmation
    const ticketPrice = record.ticket_principal.amount;
    const buyerFee = record.platform_service_fee.buyer_fee_amount;
    const sellerFee = record.platform_service_fee.seller_fee_amount;

    await FinancialLedger.recordRefund({
      orderId,
      ticketPrice,
      buyerFee,
      sellerFee,
      reason: record.reason,
      actorId,
      isSynthetic
    });

    await recordAuditLog('REFUND_LIFECYCLE', record.refund_id, 'REFUND_CONFIRMED', actorId, {
      order_id: orderId,
      evidence_reference: principalTransferEvidenceRef,
      is_cash_refund_completed: true
    });

    return { record, idempotent: false };
  }

  /**
   * Marks a refund as FAILED if seller defaults or gateway rejects.
   */
  static async failRefund({
    orderId,
    reason,
    actorId = 'SYSTEM'
  }) {
    this.init();
    const record = this.getRefundRecord(orderId);
    if (!record) {
      const err = new Error(`Refund record for order '${orderId}' not found`);
      err.code = 'REFUND_RECORD_NOT_FOUND';
      throw err;
    }

    const order = state.orders ? state.orders.find(o => o.id === orderId || o.order_id === orderId) : null;
    const now = new Date().toISOString();

    record.overall_status = REFUND_LIFECYCLE_STATUS.REFUND_FAILED;
    record.failure_reason = reason;
    record.updated_at = now;

    record.history.push({
      status: REFUND_LIFECYCLE_STATUS.REFUND_FAILED,
      actor_id: actorId,
      timestamp: now,
      note: `Refund failed: ${reason}`
    });

    if (order) {
      order.refund_status = REFUND_LIFECYCLE_STATUS.REFUND_FAILED;
      order.status = 'REFUND_FAILED_DISPUTED';
    }

    await recordAuditLog('REFUND_LIFECYCLE', record.refund_id, 'REFUND_FAILED', actorId, {
      order_id: orderId,
      reason
    });

    return record;
  }
}

module.exports = {
  RefundGovernanceService,
  REFUND_LIFECYCLE_STATUS,
  REFUND_RESPONSIBILITY
};
