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

class VenueOperationsService {
  /**
   * Assigns a PIC officer to an event shift.
   */
  static async createShiftAssignment({ eventId, venueId, picUserId, shiftName = 'Main Gate Shift', startTime, endTime }) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) throw new Error(`Event '${eventId}' not found`);

    const venue = state.venues.find(v => v.id === venueId);
    if (!venue) throw new Error(`Venue '${venueId}' not found`);

    const picUser = state.users.find(u => u.id === picUserId);
    if (!picUser || (picUser.role !== 'pic' && picUser.role !== 'admin')) {
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
      shift_name: shiftName
    });

    return shift;
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
        paid_escrow_orders_count: orders.filter(o => o.status === 'PAID_ESCROWED').length,
        active_incidents_count: openIncidents.length
      },
      risk_alerts: openIncidents.map(i => ({
        incident_id: i.incident_id,
        type: i.type,
        severity: i.severity,
        description: i.description
      })),
      escalation_contacts: [
        { role: 'Event Lead PIC', name: 'Agus Hendra', phone: '081199887766' },
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
  PIC_STATUS
};
