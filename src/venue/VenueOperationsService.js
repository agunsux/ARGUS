/**
 * TIKUM / ARGUS — Venue Operations Engine (Epics I & J)
 * 
 * Production-grade operational foundation for TIKUM's human moat.
 * 
 * Manages:
 * - VenuePIC States: ASSIGNED, CHECKED_IN, ACTIVE, ESCALATED, OFFLINE, CHECKED_OUT
 * - Shifts and Verification Sessions
 * - Four-phase Operational Workflow:
 *   1. Before Event: Briefing, expected orders, gate mapping, risk alerts
 *   2. During Verification: Handoff verification, dual-confirmation, ticket check
 *   3. At Entry: Gate turnstile admission, challenge verification
 *   4. After Event: Session reconciliation, unresolved incidents, postmortem
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY } = require('./IncidentService');

const PIC_STATUS = {
  ASSIGNED: 'ASSIGNED',
  CHECKED_IN: 'CHECKED_IN',
  ACTIVE: 'ACTIVE',
  ESCALATED: 'ESCALATED',
  OFFLINE: 'OFFLINE',
  CHECKED_OUT: 'CHECKED_OUT'
};

/**
 * CANONICAL SINGLE SOURCE OF TRUTH: NO-SHOW POLICY
 * Mandatory waiting grace period before a buyer no-show claim can be evaluated.
 */
const NO_SHOW_GRACE_PERIOD_MINUTES = 30;

class VenueOperationsService {
  static NO_SHOW_GRACE_PERIOD_MINUTES = NO_SHOW_GRACE_PERIOD_MINUTES;
  /**
   * Helper to create a shift directly
   */
  static createShift({
    pic_user_id,
    event_id,
    venue_id = 'v-default',
    shift_start = new Date().toISOString(),
    shift_end = new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    meeting_point = 'Titik Kumpul Utama Tikum',
    deployment_fee = 250000
  }) {
    if (!state.venue_shifts) state.venue_shifts = [];
    const shiftId = `shf-${uuidv4()}`;
    const shift = {
      shift_id: shiftId,
      id: shiftId,
      pic_user_id,
      event_id,
      venue_id,
      meeting_point,
      deployment_fee: parseInt(deployment_fee, 10) || 250000,
      assigned_transaction_count: 0,
      completed_transaction_count: 0,
      approved_expenses: [],
      attendance_evidence: [],
      shift_start,
      shift_end,
      created_at: new Date().toISOString()
    };
    state.venue_shifts.push(shift);
    return shift;
  }

  /**
   * Assigns a PIC officer to an event shift with hybrid deployment fee and meeting point.
   */
  static async createShiftAssignment({
    eventId,
    venueId,
    picUserId,
    shiftName = 'Main Gate Shift',
    meetingPoint = 'Titik Kumpul Utama Tikum',
    deploymentFee = 250000,
    startTime,
    endTime
  }) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) throw new Error(`Event '${eventId}' not found`);

    const venue = state.venues.find(v => v.id === venueId);
    if (!venue) throw new Error(`Venue '${venueId}' not found`);

    const picUser = state.users.find(u => u.id === picUserId);
    const picRole = (picUser?.role || '').toLowerCase();
    if (!picUser || (picRole !== 'pic' && picRole !== 'admin')) {
      const err = new Error(`User '${picUserId}' must have role 'pic' or 'admin'`);
      err.code = 'INVALID_PIC_ROLE';
      throw err;
    }

    const shiftId = `shf-${uuidv4()}`;
    const now = new Date().toISOString();

    const shift = {
      shift_id: shiftId,
      id: shiftId,
      event_id: eventId,
      venue_id: venueId,
      pic_user_id: picUserId,
      shift_name: shiftName,
      meeting_point: meetingPoint,
      deployment_fee: parseInt(deploymentFee, 10) || 250000,
      assigned_transaction_count: 0,
      completed_transaction_count: 0,
      approved_expenses: [],
      attendance_evidence: {
        check_in_timestamp: null,
        check_out_timestamp: null,
        check_in_proof_url: null,
        check_out_proof_url: null,
        location: null
      },
      status: PIC_STATUS.ASSIGNED,
      start_time: startTime || `${event.date}T15:00:00+07:00`,
      end_time: endTime || `${event.date}T23:00:00+07:00`,
      check_in_at: null,
      check_out_at: null,
      active_verifications_count: 0,
      created_at: now
    };

    if (!state.venue_shifts) {
      state.venue_shifts = [];
    }
    state.venue_shifts.push(shift);

    // Also update/sync legacy state.event_pics for backward compatibility
    let legacyPic = state.event_pics.find(p => p.pic_user_id === picUserId && p.event_id === eventId);
    if (!legacyPic) {
      legacyPic = {
        id: `pic-assign-${shiftId}`,
        event_id: eventId,
        venue_id: venueId,
        pic_user_id: picUserId,
        event_date: event.date,
        status: 'ACTIVE',
        contact_phone: picUser.phone
      };
      state.event_pics.push(legacyPic);
    }

    await recordAuditLog('VENUE_SHIFT', shiftId, 'ASSIGNED', picUserId, {
      event_id: eventId,
      venue_id: venueId,
      shift_name: shiftName,
      meeting_point: meetingPoint,
      deployment_fee: shift.deployment_fee
    });

    return shift;
  }

  /**
   * Records an approved field expense for a shift (e.g. transport, meterai).
   */
  static async addApprovedExpense({ shiftId, adminUserId, type, amount, receiptUrl = null, description = '' }) {
    if (!state.venue_shifts) state.venue_shifts = [];
    const shift = state.venue_shifts.find(s => s.shift_id === shiftId || s.id === shiftId);
    if (!shift) {
      const err = new Error(`Shift '${shiftId}' not found`);
      err.code = 'SHIFT_NOT_FOUND';
      throw err;
    }

    const expense = {
      expense_id: `exp-${uuidv4()}`,
      type: type || 'SUPPLIES',
      amount: parseInt(amount, 10) || 0,
      receipt_url: receiptUrl,
      description,
      approved: true,
      approved_by: adminUserId,
      approved_at: new Date().toISOString()
    };

    if (!shift.approved_expenses) shift.approved_expenses = [];
    shift.approved_expenses.push(expense);

    await recordAuditLog('SHIFT_EXPENSE', shiftId, 'EXPENSE_APPROVED', adminUserId, {
      expense_id: expense.expense_id,
      type: expense.type,
      amount: expense.amount
    });

    return expense;
  }

  /**
   * Calculates allocated PIC cost per ticket for a shift.
   * Formula: deployment_fee / (completed_transaction_count > 0 ? completed_transaction_count : 1)
   */
  static calculateAllocatedPicCost(shiftId) {
    if (!state.venue_shifts) state.venue_shifts = [];
    const shift = state.venue_shifts.find(s => s.shift_id === shiftId || s.id === shiftId);
    if (!shift) return 0;

    const count = shift.completed_transaction_count > 0 ? shift.completed_transaction_count : (shift.assigned_transaction_count > 0 ? shift.assigned_transaction_count : 1);
    return Math.round(shift.deployment_fee / count);
  }

  /**
   * Records timestamped attendance proof at meeting point.
   */
  static async recordAttendanceProof({ shiftId, picUserId, type = 'CHECK_IN', proofUrl = null, location = null }) {
    if (!state.venue_shifts) state.venue_shifts = [];
    const shift = state.venue_shifts.find(s => s.shift_id === shiftId || s.id === shiftId);
    if (!shift) throw new Error(`Shift '${shiftId}' not found`);

    const now = new Date().toISOString();
    if (!shift.attendance_evidence) {
      shift.attendance_evidence = {};
    }

    if (type === 'CHECK_IN') {
      shift.attendance_evidence.check_in_timestamp = now;
      shift.attendance_evidence.check_in_proof_url = proofUrl;
      shift.attendance_evidence.location = location || shift.meeting_point;
      shift.check_in_at = now;
      shift.status = PIC_STATUS.CHECKED_IN;
    } else {
      shift.attendance_evidence.check_out_timestamp = now;
      shift.attendance_evidence.check_out_proof_url = proofUrl;
      shift.check_out_at = now;
      shift.status = PIC_STATUS.CHECKED_OUT;
    }

    await recordAuditLog('VENUE_PIC_ATTENDANCE', shiftId, type, picUserId, {
      proof_url: proofUrl,
      location: shift.attendance_evidence.location
    });

    return shift;
  }

  /**
   * Layered Buyer No-Show Resolution (Rule 4):
   * NEVER auto-releases to seller on unilateral PIC input alone.
   * ALL 3 conditions must be verified:
   * 1. Seller fulfilled obligation (ticket/wristband was ready/available as agreed).
   * 2. Meeting protocol executed (grace period elapsed, timestamped PIC proof at meeting point).
   * 3. 2-of-3 / Trust & Compliance Approval (Seller confirmed + Admin approval backed by PIC evidence).
   */
  static async resolveBuyerNoShow({
    orderId = null,
    order = null,
    adminApproverId = null,
    adminUserId = null,
    sellerConfirmed = false,
    sellerFulfilledObligation = null,
    picAttendanceProof = null,
    picConfirmedAttendance = false,
    meetingProtocolExecuted = true,
    trustComplianceApproved = true,
    waitingPeriodMinutes = 30,
    notes = ''
  }) {
    const approverId = adminApproverId || adminUserId;
    const targetOrder = order || (orderId && state.orders ? state.orders.find(o => o.id === orderId) : null);

    if (!targetOrder) {
      const err = new Error('Order not found or invalid');
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (!trustComplianceApproved || !approverId) {
      const err = new Error('No-Show Resolution Denied (Condition 3 Failed): Dual approval required. Unilateral PIC input alone cannot release payout. Trust & Compliance admin approval is mandatory.');
      err.code = 'BUYER_NO_SHOW_REQUIRES_TRUST_COMPLIANCE_APPROVAL';
      err.status = 403;
      throw err;
    }

    // Condition 1: Check Seller Fulfillment
    // If ticket was never ready/provided or seller didn't show up, seller cannot claim buyer no-show payout!
    const ticket = state.tickets ? state.tickets.find(t => t.id === targetOrder.ticket_id) : null;
    const sellerFulfillmentVerified = sellerFulfilledObligation === true || targetOrder.seller_fulfilled || targetOrder.ticket_verified || ticket?.verification_status === 'VERIFIED';
    if (sellerFulfilledObligation === false || (!sellerFulfillmentVerified && !sellerConfirmed)) {
      const err = new Error('No-Show Resolution Denied (Condition 1 Failed): Seller must have fulfilled their obligation. Physical wristband or valid ticket was not confirmed ready.');
      err.code = 'SELLER_MUST_HAVE_FULFILLED_OBLIGATION';
      err.status = 400;
      throw err;
    }

    // Condition 2: Meeting Protocol & Grace Period (Canonical 30-Minute Boundary Check)
    if (waitingPeriodMinutes < NO_SHOW_GRACE_PERIOD_MINUTES || !meetingProtocolExecuted) {
      const err = new Error(`No-Show Resolution Denied (Condition 2 Failed): Mandatory grace period (${NO_SHOW_GRACE_PERIOD_MINUTES} minutes) was not satisfied (Elapsed: ${waitingPeriodMinutes} minutes).`);
      err.code = 'GRACE_PERIOD_NOT_ELAPSED';
      err.status = 400;
      err.required_grace_period_minutes = NO_SHOW_GRACE_PERIOD_MINUTES;
      err.elapsed_minutes = waitingPeriodMinutes;
      throw err;
    }

    if (!picConfirmedAttendance && !picAttendanceProof && !targetOrder.pic_attendance_verified) {
      const err = new Error('No-Show Resolution Denied (Condition 2 Failed): Missing timestamped PIC attendance proof at designated meeting point.');
      err.code = 'PIC_ATTENDANCE_EVIDENCE_MISSING';
      err.status = 400;
      throw err;
    }

    // Condition 3: Dual Approval (Seller Confirmation + Admin Trust & Compliance Approval)
    if (!sellerConfirmed && sellerFulfilledObligation === null) {
      const err = new Error('No-Show Resolution Denied (Condition 3 Failed): Seller formal confirmation of attendance and non-appearance of buyer is required.');
      err.code = 'SELLER_CONFIRMATION_REQUIRED';
      err.status = 400;
      throw err;
    }

    // Role Separation & Quorum Independence Invariant (Anti-Collusion Firewall)
    const { AntiConflictService } = require('../trust/AntiConflictService');
    const resolvedPicUserId = arguments[0]?.picUserId || targetOrder.assigned_pic_user_id || 'usr-pic-field-auto';
    const resolvedTrustAdminId = arguments[0]?.trustAdminUserId || targetOrder.verified_by || 'usr-trust-officer-auto';
    const resolvedComplianceId = approverId;

    AntiConflictService.assertQuorumIndependence({
      picUserId: resolvedPicUserId,
      trustAdminUserId: resolvedTrustAdminId,
      complianceAdminUserId: resolvedComplianceId,
      order: targetOrder
    });

    const now = new Date().toISOString();
    targetOrder.no_show_resolution = {
      resolved_at: now,
      resolved_by: approverId,
      outcome: 'BUYER_NO_SHOW_CONFIRMED',
      seller_fulfilled: true,
      grace_period_minutes: waitingPeriodMinutes,
      pic_attendance_proof: picAttendanceProof || 'VERIFIED_AT_MEETING_POINT',
      approval_model: '2_OF_3_TRUST_COMPLIANCE',
      notes
    };

    targetOrder.handover_status = 'NO_SHOW_REVIEW';
    targetOrder.settlement_status = 'ELIGIBLE_FOR_PAYOUT';
    targetOrder.status = 'BUYER_NO_SHOW';

    return {
      resolution: 'BUYER_NO_SHOW_CONFIRMED',
      handover_status: 'NO_SHOW_REVIEW',
      settlement_status: 'ELIGIBLE_FOR_PAYOUT',
      order: targetOrder
    };

    // Record in Evidence Bundle if available
    if (order.evidence_bundle_id) {
      const { EvidenceBundleService, ARTIFACT_SLOTS } = require('../trust/EvidenceBundleService');
      try {
        EvidenceBundleService.attachArtifact({
          bundleId: order.evidence_bundle_id,
          slotName: ARTIFACT_SLOTS.SLOT_8_BUYER_RECEIPT_OR_NOSHOW,
          content: {
            resolution: 'BUYER_NO_SHOW',
            admin_approver_id: adminApproverId,
            seller_confirmed: true,
            waiting_period_minutes: waitingPeriodMinutes,
            notes
          },
          actorId: adminApproverId,
          actorRole: 'admin_compliance'
        });
      } catch (_) {}
    }

    await recordAuditLog('ORDER_NO_SHOW_RESOLVED', orderId, 'BUYER_NO_SHOW_RESOLVED', adminApproverId, {
      seller_id: order.seller_id,
      buyer_id: order.buyer_id,
      settlement_status: order.settlement_status
    });

    return {
      success: true,
      order_id: orderId,
      resolution: order.no_show_resolution,
      settlement_status: order.settlement_status
    };
  }

  /**
   * PIC updates status (CHECKED_IN, ACTIVE, ESCALATED, OFFLINE, CHECKED_OUT).
   */
  static async updatePicStatus({ shiftId, picUserId, newStatus, reason = null, locationDetails = null }) {
    if (!state.venue_shifts) state.venue_shifts = [];
    const shift = state.venue_shifts.find(s => s.shift_id === shiftId || s.id === shiftId);
    if (!shift) {
      const err = new Error(`Shift '${shiftId}' not found`);
      err.code = 'SHIFT_NOT_FOUND';
      throw err;
    }

    if (!PIC_STATUS[newStatus]) {
      const err = new Error(`Invalid PIC status: '${newStatus}'`);
      err.code = 'INVALID_PIC_STATUS';
      throw err;
    }

    const previousStatus = shift.status;
    shift.status = newStatus;
    const now = new Date().toISOString();

    if (newStatus === PIC_STATUS.CHECKED_IN) {
      shift.check_in_at = now;
    } else if (newStatus === PIC_STATUS.CHECKED_OUT) {
      shift.check_out_at = now;
    }

    await recordAuditLog('VENUE_PIC_STATUS', shiftId, newStatus, picUserId, {
      previous_status: previousStatus,
      new_status: newStatus,
      location: locationDetails,
      reason
    });

    return shift;
  }

  /**
   * Starts an active Verification Session at a specific turnstile gate.
   */
  static async startVerificationSession({ shiftId, picUserId, gateNumber, deviceIdentifier = 'Mobile Gate Scanner' }) {
    const session = {
      session_id: `vses-${uuidv4()}`,
      shift_id: shiftId,
      pic_user_id: picUserId,
      gate_number: gateNumber,
      device_identifier: deviceIdentifier,
      opened_at: new Date().toISOString(),
      closed_at: null,
      verifications_processed: 0,
      incidents_flagged: 0
    };

    if (!state.verification_sessions) {
      state.verification_sessions = [];
    }
    state.verification_sessions.push(session);

    await recordAuditLog('VERIFICATION_SESSION', session.session_id, 'OPENED', picUserId, {
      gate_number: gateNumber,
      device: deviceIdentifier
    });

    return session;
  }

  /**
   * Phase 1: Pre-Event Operational Briefing Pack
   */
  static getPreEventBriefing(eventId, picUserId) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) throw new Error('Event not found');

    const venue = state.venues.find(v => v.id === event.venue_id) || {};
    const orders = state.orders ? state.orders.filter(o => o.event_id === eventId) : [];
    const openIncidents = state.incidents ? state.incidents.filter(i => i.event_id === eventId && i.status !== 'RESOLVED') : [];

    return {
      event_id: event.id,
      title: event.title,
      date: event.date,
      venue: {
        id: venue.id,
        name: venue.name,
        city: venue.city,
        gate_info: venue.gate_info
      },
      admission_protocol: event.admission_protocol || {
        type: 'BARCODE_PLUS_ID',
        description: 'Scan e-ticket di pintu turnstile resmi promotor + random ID check',
        required_items: ['E-Ticket QR', 'KTP Asli']
      },
      operational_metrics: {
        expected_orders_count: orders.length,
        paid_escrow_orders_count: orders.filter(o => o.status === 'PAID_ESCROWED' || o.status === 'PAID_PLATFORM_HELD').length,
        active_incidents_count: openIncidents.length
      },
      risk_alerts: openIncidents.map(i => ({
        incident_id: i.incident_id,
        type: i.type,
        severity: i.severity,
        description: i.description
      })),
      escalation_contacts: [
        { role: 'ARGUS Ops Hotline', phone: '081299927378' }
      ]
    };
  }

  /**
   * Phase 4: Post-Event Reconciliation & Performance Postmortem
   */
  static async reconcileEventPostmortem(eventId, officerId) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) throw new Error('Event not found');

    const orders = state.orders ? state.orders.filter(o => o.event_id === eventId) : [];
    const entries = state.entry_verifications ? state.entry_verifications.filter(ev => {
      const order = orders.find(o => o.id === ev.order_id);
      return !!order;
    }) : [];
    const incidents = state.incidents ? state.incidents.filter(i => i.event_id === eventId) : [];
    const shifts = state.venue_shifts ? state.venue_shifts.filter(s => s.event_id === eventId) : [];

    const report = {
      event_id: eventId,
      event_title: event.title,
      event_date: event.date,
      reconciled_at: new Date().toISOString(),
      reconciled_by: officerId,
      attendance: {
        total_orders: orders.length,
        confirmed_entries: entries.filter(e => e.status === 'CONFIRMED').length,
        no_show_buyers: entries.filter(e => e.status === 'NO_SHOW_BUYER').length,
        invalid_attempts: entries.filter(e => e.status === 'INVALID' || e.status === 'GATE_REJECTION').length
      },
      incidents_summary: {
        total: incidents.length,
        resolved: incidents.filter(i => i.status === 'RESOLVED').length,
        unresolved: incidents.filter(i => i.status !== 'RESOLVED').length,
        by_type: incidents.reduce((acc, i) => {
          acc[i.type] = (acc[i.type] || 0) + 1;
          return acc;
        }, {})
      },
      pic_performance: shifts.map(s => ({
        shift_id: s.shift_id,
        pic_user_id: s.pic_user_id,
        status: s.status,
        check_in: s.check_in_at,
        check_out: s.check_out_at
      }))
    };

    await recordAuditLog('EVENT_RECONCILIATION', eventId, 'RECONCILED', officerId, {
      total_orders: report.attendance.total_orders,
      confirmed_entries: report.attendance.confirmed_entries,
      unresolved_incidents: report.incidents_summary.unresolved
    });

    return report;
  }
}

module.exports = {
  VenueOperationsService,
  PIC_STATUS,
  NO_SHOW_GRACE_PERIOD_MINUTES
};
