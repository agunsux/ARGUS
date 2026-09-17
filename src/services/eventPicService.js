const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { EscrowService } = require('./escrowService');

class EventPicService {
  static ALLOWED_ENTRY_STATUS = [
    'CONFIRMED',
    'INVALID',
    'DUPLICATE_ENTRY',
    'NO_SHOW_BUYER',
    'NO_SHOW_SELLER',
    'TICKET_PROBLEM',
    'GATE_REJECTION'
  ];

  static NEXT_ACTION_MAP = {
    CONFIRMED: 'RELEASE_SETTLEMENT',
    INVALID: 'OPEN_DISPUTE_INVESTIGATION',
    DUPLICATE_ENTRY: 'REJECT_DUPLICATE_HOLD_ESCROW',
    NO_SHOW_BUYER: 'HOLD_ESCROW_AWAIT_OPS_REVIEW',
    NO_SHOW_SELLER: 'HOLD_ESCROW_AWAIT_OPS_REVIEW',
    TICKET_PROBLEM: 'OPEN_DISPUTE_INVESTIGATION',
    GATE_REJECTION: 'OPEN_DISPUTE_INVESTIGATION'
  };
  /**
   * Check if PIC is assigned and active for an event (H-1 to H+1 window)
   */
  static isPicActiveForEvent(picUserId, eventId, currentDateStr = null) {
    const assignment = state.event_pics.find(
      ep => ep.pic_user_id === picUserId && ep.event_id === eventId && ep.status === 'ACTIVE'
    );
    if (!assignment) {
      return { active: false, reason: 'PIC not assigned to this event' };
    }

    const event = state.events.find(e => e.id === eventId);
    if (!event) {
      return { active: false, reason: 'Event not found' };
    }

    // Check window if currentDateStr is explicitly passed, or if in real production mode
    if (currentDateStr) {
      const now = new Date(currentDateStr);
      const eventDate = new Date(event.date);
      const diffTime = Math.abs(now.getTime() - eventDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 2) {
        return {
          active: false,
          reason: `Operational window closed. PIC is only active H-1 to H+1 of event date (${event.date})`,
          eventDate: event.date
        };
      }
    } else if (process.env.NODE_ENV !== 'test') {
      const now = new Date();
      const eventDate = new Date(event.date);
      const diffTime = Math.abs(now.getTime() - eventDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 2) {
        return {
          active: false,
          reason: `Operational window closed. PIC is only active H-1 to H+1 of event date (${event.date})`,
          eventDate: event.date
        };
      }
    }

    return { active: true, assignment, event };
  }

  /**
   * Assign PIC to an event, venue, and date
   */
  static assignPic({ eventId, venueId, picUserId, contactPhone }) {
    const user = state.users.find(u => u.id === picUserId);
    if (!user || user.role !== 'pic') {
      const err = new Error('User must exist and have role "pic"');
      err.code = 'INVALID_PIC_USER';
      throw err;
    }

    const event = state.events.find(e => e.id === eventId);
    if (!event) throw new Error('Event not found');

    const venue = state.venues.find(v => v.id === venueId);
    if (!venue) throw new Error('Venue not found');

    const id = `pic-assign-${uuidv4().substring(0, 8)}`;
    const assignment = {
      id,
      event_id: eventId,
      venue_id: venueId,
      pic_user_id: picUserId,
      event_date: event.date,
      status: 'ACTIVE',
      contact_phone: contactPhone || user.phone
    };
    state.event_pics.push(assignment);

    return assignment;
  }

  /**
   * Get operational cell dashboard for a PIC at an event
   * Groups all orders by EVENT -> VENUE -> DATE -> PIC
   */
  static getPicEventDashboard(picUserId, eventId, currentDateStr = null) {
    const activeCheck = this.isPicActiveForEvent(picUserId, eventId, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(activeCheck.reason);
      err.code = 'PIC_NOT_ACTIVE';
      throw err;
    }

    const event = activeCheck.event;
    const venue = state.venues.find(v => v.id === event.venue_id) || {};

    // Get all orders for this event
    const eventOrders = state.orders.filter(o => o.event_id === eventId);

    const ordersDetails = eventOrders.map(order => {
      const ticket = state.tickets.find(t => t.id === order.ticket_id) || {};
      const buyer = state.users.find(u => u.id === order.buyer_id) || {};
      const seller = state.users.find(u => u.id === order.seller_id) || {};
      const escrow = state.escrows.find(e => e.order_id === order.id) || {};
      const verification = state.entry_verifications.find(ev => ev.order_id === order.id) || null;

      return {
        order_id: order.id,
        status: order.status,
        ticket_id: ticket.id,
        seat_info: ticket.seat_info,
        face_value: ticket.face_value,
        price: order.ticket_price,
        buyer_name: buyer.name,
        buyer_phone: buyer.phone,
        seller_name: seller.name,
        seller_phone: seller.phone,
        escrow_status: escrow.status,
        entry_status: verification ? verification.status : 'PENDING_ENTRY',
        operational_stage: order.operational_stage || (verification ? verification.status : 'ASSIGNED'),
        ticket_verified: !!order.ticket_verified,
        gate: verification ? verification.gate : null,
        verified_at: verification ? verification.verified_at : null
      };
    });

    return {
      operational_cell: {
        pic_id: picUserId,
        event_id: event.id,
        event_title: event.title,
        event_date: event.date,
        venue_id: venue.id,
        venue_name: venue.name,
        venue_city: venue.city,
        gate_info: venue.gate_info,
        admission_protocol: event.admission_protocol || null
      },
      stats: {
        total_orders: ordersDetails.length,
        entered: ordersDetails.filter(o => o.entry_status === 'CONFIRMED').length,
        pending: ordersDetails.filter(o => o.entry_status === 'PENDING_ENTRY').length,
        issues: ordersDetails.filter(o => o.entry_status === 'INVALID' || o.status === 'DISPUTED').length
      },
      orders: ordersDetails
    };
  }

  /**
   * PIC verifies buyer at venue and confirms physical entry through gate
   */
  static async recordEntryVerification({ picUserId, orderId, gate, notes, status = 'CONFIRMED', reason = null, nextAction = null, evidenceBundleId = null, currentDateStr = null }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (!this.ALLOWED_ENTRY_STATUS.includes(status)) {
      const err = new Error(`Invalid entry status: ${status}. Allowed: ${this.ALLOWED_ENTRY_STATUS.join(', ')}`);
      err.code = 'INVALID_ENTRY_STATUS';
      throw err;
    }

    const activeCheck = this.isPicActiveForEvent(picUserId, order.event_id, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(`Unauthorized: ${activeCheck.reason}`);
      err.code = 'PIC_UNAUTHORIZED';
      throw err;
    }

    // Trust Policy PC-1, PC-2 & PC-4 validation
    const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../trust/TrustPolicyEngine');
    TrustPolicyEngine.validatePicConflictOfInterest({ picUserId, orderId });
    TrustPolicyEngine.validatePicShiftAndWindow({ picUserId, orderId, gate, timestampStr: currentDateStr });
    const velocityCheck = TrustPolicyEngine.checkPicBurstVelocity({ picUserId, gate });
    if (velocityCheck.anomalyDetected) {
      order.velocity_anomaly = true;
    }

    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    if (!ticket) throw new Error('Ticket not found');

    // Check if duplicate entry already recorded
    const existingEntry = state.entry_verifications.find(ev => ev.order_id === orderId);
    if (existingEntry && existingEntry.status === 'CONFIRMED') {
      const err = new Error('Entry already confirmed for this order');
      err.code = 'DUPLICATE_ENTRY_CONFIRMATION';
      throw err;
    }

    const verificationId = `ent-${uuidv4()}`;
    const verification = {
      id: verificationId,
      order_id: orderId,
      ticket_id: order.ticket_id,
      pic_id: picUserId,
      actor: picUserId,
      status: status, // CONFIRMED, INVALID, DUPLICATE_ENTRY, NO_SHOW_BUYER, NO_SHOW_SELLER, TICKET_PROBLEM, GATE_REJECTION
      gate: gate || 'Main Gate',
      verified_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      notes: notes || null,
      reason: reason || notes || status,
      evidence_bundle_id: evidenceBundleId || null,
      next_action: nextAction || this.NEXT_ACTION_MAP[status] || 'OPS_REVIEW'
    };
    state.entry_verifications.push(verification);

    await recordAuditLog('ENTRY_VERIFICATION', verificationId, status, picUserId, {
      order_id: orderId,
      ticket_id: order.ticket_id,
      gate: verification.gate,
      notes
    });

    if (status === 'CONFIRMED') {
      order.status = 'ENTRY_CONFIRMED';
      order.operational_stage = 'ENTRY_CONFIRMED';
      ticket.status = 'REDEEMED';

      const escrow = state.escrows.find(e => e.order_id === orderId);
      if (escrow && escrow.status === 'ESCROWED') {
        escrow.status = 'RELEASE_PENDING';
      }

      // Record PIC, VENUE_ENTRY, and BUYER attestations in TrustPolicyEngine
      try {
        await TrustPolicyEngine.recordAttestation({
          orderId,
          attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
          actorId: picUserId,
          actorRole: 'pic',
          result: 'PASS',
          evidenceRef: evidenceBundleId,
          metadata: { gate: verification.gate }
        });
        await TrustPolicyEngine.recordAttestation({
          orderId,
          attestationType: ATTESTATION_TYPE.VENUE_ENTRY_ATTESTATION,
          actorId: picUserId,
          actorRole: 'pic',
          result: 'PASS',
          evidenceRef: evidenceBundleId,
          metadata: { gate: verification.gate }
        });
        await TrustPolicyEngine.recordAttestation({
          orderId,
          attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION,
          actorId: order.buyer_id,
          actorRole: 'buyer',
          result: 'PASS',
          metadata: { gate: verification.gate }
        });
      } catch (e) {}
    } else {
      order.operational_stage = status;
    }

    return verification;
  }

  static OPERATIONAL_STAGES = [
    'ASSIGNED',
    'CONTACTED',
    'MEETUP_CONFIRMED',
    'HANDOFF_READY',
    'TICKET_VERIFIED',
    'AT_VENUE',
    'ADMISSION_ATTEMPTED',
    'ENTRY_CONFIRMED',
    'BUYER_NO_SHOW',
    'SELLER_NO_SHOW',
    'TICKET_PROBLEM',
    'GATE_REJECTION',
    'DISPUTE_OPEN'
  ];

  /**
   * Separate Ticket Verification from Entry Confirmation:
   * TICKET_VERIFIED means ticket/handoff passed verification.
   * ENTRY_CONFIRMED means buyer gained admission to venue.
   * TICKET_VERIFIED does NOT release escrow!
   */
  static async recordTicketVerification({ picUserId, orderId, notes = null, evidenceBundleId = null, photoFile = null, requirePhoto = false, currentDateStr = null }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (requirePhoto && !evidenceBundleId && !photoFile) {
      const err = new Error('Mandatory photo evidence required for TICKET_VERIFIED');
      err.code = 'EVIDENCE_PHOTO_MANDATORY';
      throw err;
    }

    const activeCheck = this.isPicActiveForEvent(picUserId, order.event_id, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(`Unauthorized: ${activeCheck.reason}`);
      err.code = 'PIC_UNAUTHORIZED';
      throw err;
    }

    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    if (!ticket) throw new Error('Ticket not found');

    order.operational_stage = 'TICKET_VERIFIED';
    order.ticket_verified = true;
    order.ticket_verified_at = new Date().toISOString();
    order.ticket_verified_by = picUserId;
    ticket.status = 'VERIFIED_AT_VENUE';

    // Verify Invariant: Escrow MUST NOT be released on ticket verification alone!
    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (escrow && (escrow.status === 'RELEASED' || escrow.status === 'RELEASE_PENDING')) {
      throw new Error('Fatal invariant breach: escrow released before entry confirmation');
    }

    await recordAuditLog('TICKET_VERIFICATION', orderId, 'TICKET_VERIFIED', picUserId, {
      order_id: orderId,
      ticket_id: order.ticket_id,
      notes: notes || 'Ticket handoff verified by PIC at meetup point',
      evidence_bundle_id: evidenceBundleId
    });

    return {
      success: true,
      order_id: orderId,
      ticket_id: order.ticket_id,
      stage: 'TICKET_VERIFIED',
      ticket_verified: true,
      escrow_status: escrow ? escrow.status : null,
      notes
    };
  }

  /**
   * PIC updates operational stage for an order through the event lifecycle
   */
  static async updateOperationalStage({ picUserId, orderId, stage, notes = null, reason = null, evidenceBundleId = null, currentDateStr = null }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (!this.OPERATIONAL_STAGES.includes(stage)) {
      const err = new Error(`Invalid operational stage: ${stage}. Allowed: ${this.OPERATIONAL_STAGES.join(', ')}`);
      err.code = 'INVALID_OPERATIONAL_STAGE';
      throw err;
    }

    const activeCheck = this.isPicActiveForEvent(picUserId, order.event_id, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(`Unauthorized: ${activeCheck.reason}`);
      err.code = 'PIC_UNAUTHORIZED';
      throw err;
    }

    const previousStage = order.operational_stage || 'ASSIGNED';

    if (stage === 'TICKET_VERIFIED') {
      return await this.recordTicketVerification({ picUserId, orderId, notes, evidenceBundleId, currentDateStr });
    }

    if (stage === 'ENTRY_CONFIRMED') {
      const entryRes = await this.recordEntryVerification({ picUserId, orderId, notes, status: 'CONFIRMED', currentDateStr });
      order.operational_stage = 'ENTRY_CONFIRMED';
      return entryRes;
    }

    // Exception stages
    if (['BUYER_NO_SHOW', 'SELLER_NO_SHOW', 'TICKET_PROBLEM', 'GATE_REJECTION'].includes(stage)) {
      const entryRes = await this.recordEntryVerification({
        picUserId,
        orderId,
        notes: notes || reason || stage,
        status: stage,
        reason: reason || notes,
        evidenceBundleId,
        currentDateStr
      });
      order.operational_stage = stage;
      return entryRes;
    }

    // Progression stages: CONTACTED, MEETUP_CONFIRMED, HANDOFF_READY, AT_VENUE, ADMISSION_ATTEMPTED
    order.operational_stage = stage;
    await recordAuditLog('ORDER_OPERATIONAL_STAGE', orderId, stage, picUserId, {
      order_id: orderId,
      previous_stage: previousStage,
      new_stage: stage,
      notes
    });

    return {
      success: true,
      order_id: orderId,
      previous_stage: previousStage,
      operational_stage: stage,
      notes
    };
  }

  /**
   * Dual Confirmation (ENTRY_CONFIRMED) - STEP 1 (BUYER):
   * Buyer generates a 6-digit entry challenge on their device to present to the PIC at the turnstile gate.
   * Cross-Party Invariant: BUYER generates -> PIC confirms. PIC CANNOT issue entry challenge!
   */
  static async generateBuyerEntryChallenge({ buyerId, orderId }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (order.buyer_id !== buyerId) {
      const err = new Error('Forbidden: buyer ID mismatch for this order');
      err.code = 'BUYER_MISMATCH';
      err.status = 403;
      throw err;
    }

    if (order.status !== 'PAID_ESCROWED') {
      const err = new Error(`Cannot admit order with status '${order.status}'. Order must be PAID_ESCROWED.`);
      err.code = 'ORDER_NOT_IN_ESCROW';
      err.status = 403;
      throw err;
    }

    if (!order.ticket_verified && order.operational_stage !== 'TICKET_VERIFIED' && order.operational_stage !== 'HANDOFF_READY') {
      const err = new Error('State jump rejected: Ticket must be verified (TICKET_VERIFIED) before gate admission can be attempted');
      err.code = 'TICKET_NOT_YET_VERIFIED';
      err.status = 403;
      throw err;
    }

    if (order.status === 'ENTRY_CONFIRMED') {
      const err = new Error('Entry already confirmed for this order');
      err.code = 'DUPLICATE_ENTRY_CONFIRMATION';
      err.status = 409;
      throw err;
    }

    const { TransactionChallengeService } = require('./transactionChallengeService');
    const challenge = await TransactionChallengeService.createChallenge({
      orderId: order.id,
      eventId: order.event_id,
      actionType: 'ENTRY_CONFIRMED',
      issuingActorRole: 'buyer',
      issuingActorId: buyerId,
      confirmingActorRole: 'pic'
    });

    order.operational_stage = 'ADMISSION_ATTEMPTED';

    await recordAuditLog('ORDER_OPERATIONAL_STAGE', order.id, 'ADMISSION_ATTEMPTED', buyerId, {
      challenge_id: challenge.challengeId,
      expires_at: challenge.expiresAt
    });

    return {
      success: true,
      orderId: order.id,
      challengeCode: challenge.rawCode,
      expiresAt: challenge.expiresAt,
      message: 'Show this 6-digit code to the TIKUM PIC at the turnstile gate'
    };
  }

  /**
   * Dual Confirmation (ENTRY_CONFIRMED) - STEP 2 (PIC):
   * PIC enters the 6-digit code displayed on BUYER's screen, accompanied by mandatory turnstile gate photo evidence.
   */
  static async confirmEntryWithCode({ picUserId, orderId, handshakeCode, gate = 'Main Gate', notes = null, evidenceBundleId = null, photoFile = null, currentDateStr = null }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../trust/TrustPolicyEngine');
    // PC-1: Conflict of interest validation
    TrustPolicyEngine.validatePicConflictOfInterest({ picUserId, orderId });

    // PC-2: Shift Geofence & Operational Window
    TrustPolicyEngine.validatePicShiftAndWindow({ picUserId, orderId, gate, timestampStr: currentDateStr });

    // PC-4: Burst Velocity Check
    const velocityCheck = TrustPolicyEngine.checkPicBurstVelocity({ picUserId, gate });
    if (velocityCheck.anomalyDetected) {
      order.velocity_anomaly = true;
    }

    const activeCheck = this.isPicActiveForEvent(picUserId, order.event_id, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(`Unauthorized: ${activeCheck.reason}`);
      err.code = 'PIC_UNAUTHORIZED';
      err.status = 403;
      throw err;
    }

    // State jump guard: Ticket must be verified before entry can be confirmed
    if (!order.ticket_verified && order.operational_stage !== 'TICKET_VERIFIED' && order.operational_stage !== 'ADMISSION_ATTEMPTED' && order.operational_stage !== 'HANDOFF_READY') {
      const err = new Error('State jump rejected: Ticket must be verified (TICKET_VERIFIED) before entry can be confirmed');
      err.code = 'TICKET_NOT_YET_VERIFIED';
      err.status = 403;
      throw err;
    }

    // Mandatory photo evidence check at entry gate
    if (!evidenceBundleId && !photoFile) {
      const err = new Error('Mandatory photo evidence (buyer + ticket at gate) required for ENTRY');
      err.code = 'GATE_PHOTO_MANDATORY';
      err.status = 400;
      throw err;
    }

    // Verify and consume the buyer-issued challenge as PIC (detects replay with CHALLENGE_ALREADY_CONSUMED)
    const { TransactionChallengeService } = require('./transactionChallengeService');
    await TransactionChallengeService.verifyAndConsumeChallenge({
      orderId: order.id,
      actionType: 'ENTRY_CONFIRMED',
      providedCode: handshakeCode,
      consumingActorId: picUserId,
      consumingActorRole: 'pic'
    });

    if (order.status === 'ENTRY_CONFIRMED') {
      const err = new Error('Entry already confirmed for this order');
      err.code = 'DUPLICATE_ENTRY_CONFIRMATION';
      err.status = 409;
      throw err;
    }

    if (order.status !== 'PAID_ESCROWED') {
      const err = new Error(`Cannot admit order with status '${order.status}'. Order must be PAID_ESCROWED.`);
      err.code = 'ORDER_NOT_IN_ESCROW';
      err.status = 403;
      throw err;
    }

    const verification = await this.recordEntryVerification({
      picUserId,
      orderId: order.id,
      gate: gate || 'Pintu Utama',
      notes: notes ? `${notes} (Dual confirmed with buyer entry code)` : 'Dual confirmed with buyer entry code',
      status: 'CONFIRMED',
      evidenceBundleId,
      currentDateStr
    });

    order.dual_confirmed = true;
    order.operational_stage = 'ENTRY_CONFIRMED';

    return {
      success: true,
      orderId: order.id,
      status: 'ENTRY_CONFIRMED',
      verification,
      dualConfirmed: true
    };
  }

  /**
   * Blocked legacy method: PIC cannot issue entry challenge!
   */
  static async prepareGateAdmission() {
    const err = new Error('PIC cannot generate ENTRY_CONFIRMED challenge. The entry challenge must be generated by the Buyer.');
    err.code = 'PIC_CANNOT_ISSUE_ENTRY_CHALLENGE';
    err.status = 403;
    throw err;
  }

  /**
   * Blocked legacy method: Buyer cannot unilaterally confirm entry!
   */
  static async completeDualConfirmedEntry() {
    const err = new Error('Buyer cannot confirm entry. PIC must verify turnstile admission and enter Buyer code.');
    err.code = 'BUYER_CANNOT_CONFIRM_ENTRY';
    err.status = 403;
    throw err;
  }

  /**
   * Dual Confirmation (HANDOFF_READY):
   * PIC enters the 6-digit code displayed on SELLER's device.
   */
  static async confirmHandoffWithCode({ picUserId, orderId, handshakeCode, currentDateStr = null }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const activeCheck = this.isPicActiveForEvent(picUserId, order.event_id, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(`Unauthorized: ${activeCheck.reason}`);
      err.code = 'PIC_UNAUTHORIZED';
      throw err;
    }

    const { TransactionChallengeService } = require('./transactionChallengeService');
    await TransactionChallengeService.verifyAndConsumeChallenge({
      orderId: order.id,
      actionType: 'HANDOFF_READY',
      providedCode: handshakeCode,
      consumingActorId: picUserId,
      consumingActorRole: 'pic'
    });

    order.operational_stage = 'HANDOFF_READY';
    order.handoff_confirmed_at = new Date().toISOString();
    order.handoff_confirmed_by = picUserId;

    await recordAuditLog('ORDER_OPERATIONAL_STAGE', orderId, 'HANDOFF_READY', picUserId, {
      order_id: orderId,
      handoff_confirmed: true
    });

    return {
      success: true,
      orderId: order.id,
      stage: 'HANDOFF_READY',
      dualConfirmed: true
    };
  }
}

module.exports = { EventPicService };

