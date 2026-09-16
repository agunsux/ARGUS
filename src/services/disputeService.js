/**
 * TIKUM / ARGUS — Canonical Dispute Infrastructure (Epic L)
 * 
 * Evidence-backed dispute resolution.
 * Non-Negotiable Invariants:
 * - A dispute must NEVER be resolved solely by free-text opinion.
 * - Every decision MUST reference verified evidence.
 * - Supports appeals for contested decisions.
 * - Canonical outcomes: BUYER_FAVORED, SELLER_FAVORED, PARTIAL, PLATFORM_ERROR, INSUFFICIENT_EVIDENCE, PENDING.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./escrowService');
const { emailService } = require('./emailService');

const DISPUTE_STATUS = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  DECISION_PENDING: 'DECISION_PENDING',
  RESOLVED: 'RESOLVED',
  APPEALED: 'APPEALED',
  CLOSED_FINAL: 'CLOSED_FINAL'
};

const DISPUTE_OUTCOME = {
  BUYER_FAVORED: 'BUYER_FAVORED',
  SELLER_FAVORED: 'SELLER_FAVORED',
  PARTIAL: 'PARTIAL',
  PLATFORM_ERROR: 'PLATFORM_ERROR',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  PENDING: 'PENDING',
  // Backward compatibility aliases matching exact string values
  REFUND_BUYER: 'REFUND_BUYER',
  RELEASE_SELLER: 'RELEASE_SELLER',
  PARTIAL_REFUND: 'PARTIAL_REFUND'
};

class DisputeService {
  /**
   * Buyer or seller opens a dispute on an order.
   */
  static async openDispute({ orderId, buyerId, reason, claimDetails = null, initialEvidenceBundleId = null }) {
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
    const now = new Date().toISOString();

    const dispute = {
      id: disputeId,
      dispute_id: disputeId,
      order_id: orderId,
      buyer_id: buyerId,
      seller_id: order.seller_id,
      ticket_id: order.ticket_id,
      event_id: order.event_id,
      pic_id: picId,
      status: DISPUTE_STATUS.OPEN,
      outcome: DISPUTE_OUTCOME.PENDING,
      reason: reason || 'TICKET_INVALID_AT_GATE',
      claim: {
        claimant_id: buyerId,
        claim_type: reason || 'TICKET_INVALID_AT_GATE',
        details: claimDetails || reason,
        submitted_at: now
      },
      decision_notes: null,
      decision_evidence_ids: [],
      evidence_bundle_id: initialEvidenceBundleId || null,
      pic_evidence_bundle_id: null,
      pic_notes: null,
      appeals: [],
      timeline: [
        {
          action: 'DISPUTE_OPENED',
          actor_id: buyerId,
          timestamp: now,
          notes: reason
        }
      ],
      created_at: now,
      resolved_at: null,
      resolved_by: null
    };
    state.disputes.push(dispute);

    await recordAuditLog('DISPUTE', disputeId, 'OPENED', buyerId, {
      order_id: orderId,
      reason: dispute.reason,
      pic_id: picId
    });

    // Secondary effect: Dispute opened notification
    const buyer = state.users.find(u => u.id === buyerId);
    const seller = state.users.find(u => u.id === order.seller_id);
    const pic = picId ? state.users.find(u => u.id === picId) : null;
    emailService.sendDisputeOpenedEmail({ dispute, order, buyer, seller, pic });

    return { dispute, alreadyOpen: false };
  }

  /**
   * Event PIC submits physical field evidence / investigation notes
   */
  static async submitPicInvestigation({ disputeId, picUserId, notes, evidenceBundleId, gateStatus }) {
    const dispute = state.disputes.find(d => d.id === disputeId || d.dispute_id === disputeId);
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

    if (!dispute.timeline) dispute.timeline = [];
    dispute.timeline.push({
      action: 'PIC_INVESTIGATION_SUBMITTED',
      actor_id: picUserId,
      timestamp: new Date().toISOString(),
      notes
    });

    // If gateStatus provided, update entry verification
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
   * ARGUS Officer resolves the dispute.
   * INVARIANT: Decision must reference evidence. Never resolve on free-text opinion alone.
   */
  static async resolveDispute({
    disputeId,
    officerId,
    outcome,
    decisionReason,
    decisionNotes = null,
    evidenceIds = []
  }) {
    const dispute = state.disputes.find(d => d.id === disputeId || d.dispute_id === disputeId);
    if (!dispute) throw new Error('Dispute not found');

    if (dispute.status === DISPUTE_STATUS.RESOLVED || dispute.status === DISPUTE_STATUS.CLOSED_FINAL) {
      throw new Error('Dispute already resolved');
    }

    // Normalize outcome
    const canonicalOutcome = DISPUTE_OUTCOME[outcome] || outcome;
    const validOutcomes = [
      'BUYER_FAVORED',
      'SELLER_FAVORED',
      'PARTIAL',
      'PLATFORM_ERROR',
      'INSUFFICIENT_EVIDENCE',
      'REFUND_BUYER',
      'RELEASE_SELLER',
      'PARTIAL_REFUND'
    ];

    if (!validOutcomes.includes(outcome)) {
      throw new Error(`Invalid dispute resolution outcome: ${outcome}`);
    }

    if (!decisionReason || decisionReason.trim().length < 5) {
      throw new Error('Decision reason is required and must explain the findings');
    }

    // Evidence requirement check: must have attached evidence or PIC inspection
    const attachedEvidence = [
      ...(Array.isArray(evidenceIds) ? evidenceIds : []),
      dispute.evidence_bundle_id,
      dispute.pic_evidence_bundle_id
    ].filter(Boolean);

    if (attachedEvidence.length === 0 && !dispute.pic_notes) {
      // Invariant: Resolution must have evidence backing
      const err = new Error('Evidence-backed dispute invariant violation: Resolution must reference at least one evidence item or PIC field report.');
      err.code = 'EVIDENCE_REFERENCE_MANDATORY';
      throw err;
    }

    const now = new Date().toISOString();
    dispute.status = DISPUTE_STATUS.RESOLVED;
    dispute.outcome = canonicalOutcome === 'BUYER_FAVORED' || outcome === 'REFUND_BUYER'
      ? 'REFUND_BUYER'
      : (canonicalOutcome === 'SELLER_FAVORED' || outcome === 'RELEASE_SELLER' ? 'RELEASE_SELLER' : canonicalOutcome);
    dispute.canonical_outcome = canonicalOutcome;
    dispute.decision_notes = `${decisionReason}. ${decisionNotes || ''}`.trim();
    dispute.decision_evidence_ids = attachedEvidence;
    dispute.resolved_at = now;
    dispute.resolved_by = officerId;

    if (!dispute.timeline) dispute.timeline = [];
    dispute.timeline.push({
      action: 'DISPUTE_RESOLVED',
      actor_id: officerId,
      timestamp: now,
      outcome: dispute.outcome,
      notes: dispute.decision_notes
    });

    const order = state.orders.find(o => o.id === dispute.order_id);
    const escrow = state.escrows.find(e => e.order_id === dispute.order_id);

    if (dispute.outcome === 'REFUND_BUYER' || canonicalOutcome === 'BUYER_FAVORED') {
      await EscrowService.refundToBuyer(dispute.order_id, officerId, dispute.decision_notes);
    } else if (dispute.outcome === 'RELEASE_SELLER' || canonicalOutcome === 'SELLER_FAVORED') {
      let verification = state.entry_verifications.find(ev => ev.order_id === dispute.order_id);
      if (!verification) {
        verification = {
          id: `ent-${uuidv4()}`,
          order_id: dispute.order_id,
          ticket_id: dispute.ticket_id,
          pic_id: officerId,
          status: 'CONFIRMED',
          gate: 'Admin Resolution',
          verified_at: now,
          notes: 'Confirmed by Admin dispute resolution'
        };
        state.entry_verifications.push(verification);
      } else {
        verification.status = 'CONFIRMED';
      }

      if (order) {
        order.status = ORDER_STATUS.PAID_ESCROWED;
      }
      escrow.status = ESCROW_STATUS.RELEASE_PENDING;

      try {
        const { EscrowStateMachine, ESCROW_LIFECYCLE_STATE } = require('../settlement/EscrowStateMachine');
        if (escrow.state_machine_status === ESCROW_LIFECYCLE_STATE.DISPUTED) {
          await EscrowStateMachine.transition({
            orderId: dispute.order_id,
            targetState: ESCROW_LIFECYCLE_STATE.RELEASE_PENDING,
            actorId: officerId,
            actorRole: 'admin',
            reason: 'Dispute resolved in seller favor, pending release'
          });
        }
      } catch (e) {}

      try {
        const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../trust/TrustPolicyEngine');
        await TrustPolicyEngine.recordAttestation({
          orderId: dispute.order_id,
          attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
          actorId: dispute.pic_id || officerId,
          actorRole: dispute.pic_id ? 'pic' : 'admin',
          result: 'PASS',
          metadata: { dispute_id: disputeId, notes: dispute.decision_notes }
        });
        await TrustPolicyEngine.recordAttestation({
          orderId: dispute.order_id,
          attestationType: ATTESTATION_TYPE.VENUE_ENTRY_ATTESTATION,
          actorId: dispute.pic_id || officerId,
          actorRole: dispute.pic_id ? 'pic' : 'admin',
          result: 'PASS',
          metadata: { dispute_id: disputeId }
        });
        await TrustPolicyEngine.recordAttestation({
          orderId: dispute.order_id,
          attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION,
          actorId: dispute.buyer_id,
          actorRole: 'buyer',
          result: 'PASS',
          metadata: { dispute_id: disputeId, confirmed_via: 'DISPUTE_INVESTIGATION_SUCCESS' }
        });
      } catch (e) {}

      await EscrowService.releaseToSeller(dispute.order_id, officerId);
    }

    await recordAuditLog('DISPUTE', disputeId, 'RESOLVED', officerId, {
      outcome: dispute.outcome,
      canonical_outcome: canonicalOutcome,
      decisionReason,
      evidence_count: attachedEvidence.length,
      resolved_at: now
    });

    // Secondary effect: Dispute resolved notification
    const resolvedBuyer = state.users.find(u => u.id === dispute.buyer_id);
    const resolvedSeller = state.users.find(u => u.id === dispute.seller_id);
    emailService.sendDisputeResolvedEmail({
      dispute,
      outcome: dispute.outcome,
      decisionNotes: dispute.decision_notes,
      buyer: resolvedBuyer,
      seller: resolvedSeller
    });

    return { dispute, escrow, order };
  }

  /**
   * Contest a resolved dispute through formal Appeal.
   */
  static async fileAppeal({ disputeId, appellantId, appealReason, newEvidenceBundleId = null }) {
    const dispute = state.disputes.find(d => d.id === disputeId || d.dispute_id === disputeId);
    if (!dispute) throw new Error('Dispute not found');

    if (dispute.status !== DISPUTE_STATUS.RESOLVED) {
      throw new Error(`Cannot appeal dispute with status '${dispute.status}'. Only RESOLVED disputes can be appealed.`);
    }

    if (dispute.buyer_id !== appellantId && dispute.seller_id !== appellantId) {
      const err = new Error('Unauthorized: only the buyer or seller can file an appeal for this dispute');
      err.code = 'UNAUTHORIZED_APPEAL';
      throw err;
    }

    const appealId = `apl-${uuidv4()}`;
    const now = new Date().toISOString();

    const appeal = {
      appeal_id: appealId,
      appellant_id: appellantId,
      appeal_reason: appealReason,
      new_evidence_bundle_id: newEvidenceBundleId,
      submitted_at: now,
      status: 'PENDING_REVIEW'
    };

    if (!dispute.appeals) dispute.appeals = [];
    dispute.appeals.push(appeal);
    dispute.status = DISPUTE_STATUS.APPEALED;

    dispute.timeline.push({
      action: 'APPEAL_FILED',
      actor_id: appellantId,
      timestamp: now,
      notes: appealReason
    });

    await recordAuditLog('DISPUTE_APPEAL', appealId, 'FILED', appellantId, {
      dispute_id: disputeId,
      reason: appealReason
    });

    return { dispute, appeal };
  }

  /**
   * Complete dossier for a dispute
   */
  static getDisputeDossier(disputeId) {
    const dispute = state.disputes.find(d => d.id === disputeId || d.dispute_id === disputeId);
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
      auditLogs,
      appeals: dispute.appeals || [],
      timeline: dispute.timeline || []
    };
  }
}

module.exports = {
  DisputeService,
  DISPUTE_STATUS,
  DISPUTE_OUTCOME
};
