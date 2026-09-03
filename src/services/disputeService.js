const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { EscrowService, ESCROW_STATUS } = require('./escrowService');

const DISPUTE_STATUS = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  DECISION_PENDING: 'DECISION_PENDING',
  RESOLVED: 'RESOLVED'
};

const DISPUTE_OUTCOME = {
  REFUND_BUYER: 'REFUND_BUYER',
  RELEASE_SELLER: 'RELEASE_SELLER',
  PARTIAL_REFUND: 'PARTIAL_REFUND',
  ESCALATE: 'ESCALATE'
};

class DisputeService {
  /**
   * Buyer reports an issue (e.g. ticket invalid at gate)
   */
  static async openDispute({ orderId, buyerId, reason, initialEvidenceBundleId }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (order.buyer_id !== buyerId) {
      const err = new Error('Unauthorized: only the buyer can open a dispute for this order');
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    // Check if dispute already exists for this order
    const existing = state.disputes.find(d => d.order_id === orderId);
    if (existing) {
      return { dispute: existing, alreadyOpen: true };
    }

    // Find assigned PIC for this event
    const picAssign = state.event_pics.find(ep => ep.event_id === order.event_id && ep.status === 'ACTIVE');
    const picId = picAssign ? picAssign.pic_user_id : null;

    // Lock Escrow into DISPUTED state immediately
    await EscrowService.markDisputed(orderId, buyerId, reason);

    const disputeId = `dsp-${uuidv4()}`;
    const dispute = {
      id: disputeId,
      order_id: orderId,
      buyer_id: buyerId,
      seller_id: order.seller_id,
      ticket_id: order.ticket_id,
      event_id: order.event_id,
      pic_id: picId,
      status: DISPUTE_STATUS.OPEN,
      outcome: null,
      reason: reason || 'TICKET_INVALID_AT_GATE',
      decision_notes: null,
      evidence_bundle_id: initialEvidenceBundleId || null,
      pic_evidence_bundle_id: null,
      pic_notes: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null
    };
    state.disputes.push(dispute);

    await recordAuditLog('DISPUTE', disputeId, 'OPENED', buyerId, {
      order_id: orderId,
      reason: dispute.reason,
      pic_id: picId
    });

    return { dispute, alreadyOpen: false };
  }

  /**
   * Event PIC submits physical field evidence / investigation notes
   */
  static async submitPicInvestigation({ disputeId, picUserId, notes, evidenceBundleId, gateStatus }) {
    const dispute = state.disputes.find(d => d.id === disputeId);
    if (!dispute) throw new Error('Dispute not found');

    // PIC authorization: must be assigned ACTIVE to this event
    const assignment = state.event_pics.find(
      ep => ep.pic_user_id === picUserId && ep.event_id === dispute.event_id && ep.status === 'ACTIVE'
    );
    if (!assignment) {
      const err = new Error('Unauthorized: PIC not assigned to this event');
      err.code = 'PIC_UNAUTHORIZED';
      throw err;
    }

    dispute.status = DISPUTE_STATUS.DECISION_PENDING;
    dispute.pic_id = picUserId;
    dispute.pic_notes = notes;
    dispute.pic_evidence_bundle_id = evidenceBundleId || null;

    // If gateStatus provided, update/record entry verification
    if (gateStatus) {
      const existingEntry = state.entry_verifications.find(ev => ev.order_id === dispute.order_id);
      if (existingEntry) {
        existingEntry.status = gateStatus;
        existingEntry.notes = notes;
      } else {
        state.entry_verifications.push({
          id: `ent-${uuidv4()}`,
          order_id: dispute.order_id,
          ticket_id: dispute.ticket_id,
          pic_id: picUserId,
          status: gateStatus,
          gate: 'Dispute Gate Inspection',
          verified_at: new Date().toISOString(),
          notes
        });
      }
    }

    await recordAuditLog('DISPUTE', disputeId, 'PIC_EVIDENCE_SUBMITTED', picUserId, {
      notes,
      evidence_bundle_id: evidenceBundleId,
      gateStatus
    });

    return dispute;
  }

  /**
   * ARGUS Admin resolves the dispute based on evidence and policy
   */
  static async resolveDispute({ disputeId, officerId, outcome, decisionReason, decisionNotes }) {
    const dispute = state.disputes.find(d => d.id === disputeId);
    if (!dispute) throw new Error('Dispute not found');

    if (dispute.status === DISPUTE_STATUS.RESOLVED) {
      throw new Error('Dispute already resolved');
    }

    if (![DISPUTE_OUTCOME.REFUND_BUYER, DISPUTE_OUTCOME.RELEASE_SELLER, DISPUTE_OUTCOME.PARTIAL_REFUND].includes(outcome)) {
      throw new Error(`Invalid dispute resolution outcome: ${outcome}`);
    }

    if (!decisionReason) {
      throw new Error('Decision reason is required');
    }

    dispute.status = DISPUTE_STATUS.RESOLVED;
    dispute.outcome = outcome;
    dispute.decision_notes = `${decisionReason}. ${decisionNotes || ''}`.trim();
    dispute.resolved_at = new Date().toISOString();
    dispute.resolved_by = officerId;

    const order = state.orders.find(o => o.id === dispute.order_id);
    const escrow = state.escrows.find(e => e.order_id === dispute.order_id);

    if (outcome === DISPUTE_OUTCOME.REFUND_BUYER) {
      // Refund buyer in full
      await EscrowService.refundToBuyer(dispute.order_id, officerId, dispute.decision_notes);
    } else if (outcome === DISPUTE_OUTCOME.RELEASE_SELLER) {
      // Force confirmed entry if evidence proved ticket was actually valid
      let verification = state.entry_verifications.find(ev => ev.order_id === dispute.order_id);
      if (!verification) {
        verification = {
          id: `ent-${uuidv4()}`,
          order_id: dispute.order_id,
          ticket_id: dispute.ticket_id,
          pic_id: officerId,
          status: 'CONFIRMED',
          gate: 'Admin Resolution',
          verified_at: new Date().toISOString(),
          notes: 'Confirmed by Admin dispute resolution'
        };
        state.entry_verifications.push(verification);
      } else {
        verification.status = 'CONFIRMED';
      }

      // Transition escrow back to RELEASE_PENDING and release
      escrow.status = ESCROW_STATUS.RELEASE_PENDING;
      await EscrowService.releaseToSeller(dispute.order_id, officerId);
    }

    await recordAuditLog('DISPUTE', disputeId, 'RESOLVED', officerId, {
      outcome,
      decisionReason,
      resolved_at: dispute.resolved_at
    });

    return { dispute, escrow, order };
  }

  /**
   * Get complete dossier for a dispute
   */
  static getDisputeDossier(disputeId) {
    const dispute = state.disputes.find(d => d.id === disputeId);
    if (!dispute) return null;

    const order = state.orders.find(o => o.id === dispute.order_id) || {};
    const buyer = state.users.find(u => u.id === dispute.buyer_id) || {};
    const seller = state.users.find(u => u.id === dispute.seller_id) || {};
    const ticket = state.tickets.find(t => t.id === dispute.ticket_id) || {};
    const event = state.events.find(e => e.id === dispute.event_id) || {};
    const venue = state.venues.find(v => v.id === event.venue_id) || {};
    const escrow = state.escrows.find(e => e.order_id === dispute.order_id) || {};
    const payments = state.payments.filter(p => p.order_id === dispute.order_id);
    const entryVerifications = state.entry_verifications.filter(ev => ev.order_id === dispute.order_id);
    const auditLogs = state.audit_logs.filter(
      al => al.entity_id === disputeId || al.entity_id === dispute.order_id || al.entity_id === dispute.ticket_id
    );

    return {
      dispute,
      buyer: { id: buyer.id, name: buyer.name, phone: buyer.phone },
      seller: { id: seller.id, name: seller.name, phone: seller.phone },
      order,
      escrow,
      payments,
      ticket,
      event,
      venue,
      entryVerifications,
      auditLogs
    };
  }
}

module.exports = { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME };

