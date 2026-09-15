/**
 * TIKUM / ARGUS — Incident Management Engine (Epic K)
 * 
 * First-class Incident Management for field operations & dispute intelligence.
 * 
 * Invariants:
 * - Every incident must have an owner, status, severity, timeline, and audit trail.
 * - Incidents can attach cryptographic evidence bundles.
 * - Resolution requires recorded justification and authorized operator ID.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');

const INCIDENT_TYPES = {
  FAKE_TICKET: 'FAKE_TICKET',
  DUPLICATE_TICKET: 'DUPLICATE_TICKET',
  WRONG_EVENT: 'WRONG_EVENT',
  WRONG_DATE: 'WRONG_DATE',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  TRANSFER_FAILURE: 'TRANSFER_FAILURE',
  ENTRY_FAILURE: 'ENTRY_FAILURE',
  SELLER_NO_SHOW: 'SELLER_NO_SHOW',
  BUYER_NO_SHOW: 'BUYER_NO_SHOW',
  VENUE_POLICY_CONFLICT: 'VENUE_POLICY_CONFLICT',
  PAYMENT_ISSUE: 'PAYMENT_ISSUE',
  OTHER: 'OTHER'
};

const INCIDENT_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const INCIDENT_STATUS = {
  REPORTED: 'REPORTED',
  INVESTIGATING: 'INVESTIGATING',
  CONTAINED: 'CONTAINED',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED'
};

class IncidentService {
  /**
   * Records a new first-class incident from field ops or buyers.
   */
  static async reportIncident({
    type,
    severity = INCIDENT_SEVERITY.MEDIUM,
    orderId = null,
    eventId,
    venueId = null,
    ticketId = null,
    reporterId,
    reporterRole = 'pic',
    description,
    evidenceBundleId = null
  }) {
    if (!type || !eventId || !reporterId || !description) {
      const err = new Error('type, eventId, reporterId, and description are required for incident reporting');
      err.code = 'INVALID_INCIDENT_PAYLOAD';
      throw err;
    }

    if (!INCIDENT_TYPES[type]) {
      const err = new Error(`Invalid incident type: '${type}'`);
      err.code = 'INVALID_INCIDENT_TYPE';
      throw err;
    }

    const incidentId = `inc-${uuidv4()}`;
    const now = new Date().toISOString();

    const incident = {
      incident_id: incidentId,
      id: incidentId,
      type,
      severity,
      status: INCIDENT_STATUS.REPORTED,
      order_id: orderId,
      event_id: eventId,
      venue_id: venueId,
      ticket_id: ticketId,
      reporter_id: reporterId,
      reporter_role: reporterRole,
      owner_id: reporterId, // Initial owner is reporting officer/PIC
      description,
      evidence_bundle_id: evidenceBundleId,
      timeline: [
        {
          timestamp: now,
          action: 'INCIDENT_REPORTED',
          actor_id: reporterId,
          notes: description
        }
      ],
      resolution: null,
      created_at: now,
      updated_at: now
    };

    if (!state.incidents) {
      state.incidents = [];
    }
    state.incidents.push(incident);

    await recordAuditLog('INCIDENT', incidentId, 'REPORTED', reporterId, {
      type,
      severity,
      order_id: orderId,
      event_id: eventId
    });

    return incident;
  }

  /**
   * Updates incident status, reassigns owner, or records timeline updates.
   */
  static async updateIncident({ incidentId, actorId, status, notes, assignedOwnerId = null }) {
    if (!state.incidents) state.incidents = [];
    const incident = state.incidents.find(i => i.incident_id === incidentId || i.id === incidentId);
    if (!incident) {
      const err = new Error(`Incident '${incidentId}' not found`);
      err.code = 'INCIDENT_NOT_FOUND';
      throw err;
    }

    const now = new Date().toISOString();

    if (status && INCIDENT_STATUS[status]) {
      incident.status = status;
    }
    if (assignedOwnerId) {
      incident.owner_id = assignedOwnerId;
    }
    incident.updated_at = now;

    incident.timeline.push({
      timestamp: now,
      action: status || 'TIMELINE_NOTE',
      actor_id: actorId,
      notes: notes || null
    });

    await recordAuditLog('INCIDENT', incidentId, status || 'UPDATED', actorId, {
      status: incident.status,
      assigned_owner_id: incident.owner_id,
      notes
    });

    return incident;
  }

  /**
   * Resolves the incident with evidence-backed justification.
   */
  static async resolveIncident({ incidentId, resolverId, resolutionNotes, outcome }) {
    if (!state.incidents) state.incidents = [];
    const incident = state.incidents.find(i => i.incident_id === incidentId || i.id === incidentId);
    if (!incident) {
      const err = new Error(`Incident '${incidentId}' not found`);
      err.code = 'INCIDENT_NOT_FOUND';
      throw err;
    }

    if (!resolutionNotes || resolutionNotes.trim().length < 10) {
      const err = new Error('Resolution notes must be provided with minimum 10 characters');
      err.code = 'RESOLUTION_NOTES_REQUIRED';
      throw err;
    }

    const now = new Date().toISOString();
    incident.status = INCIDENT_STATUS.RESOLVED;
    incident.resolution = {
      resolved_at: now,
      resolved_by: resolverId,
      resolution_notes: resolutionNotes,
      outcome: outcome || 'CLOSED'
    };
    incident.updated_at = now;

    incident.timeline.push({
      timestamp: now,
      action: 'INCIDENT_RESOLVED',
      actor_id: resolverId,
      notes: resolutionNotes
    });

    await recordAuditLog('INCIDENT', incidentId, 'RESOLVED', resolverId, {
      outcome: incident.resolution.outcome,
      resolution_notes: resolutionNotes
    });

    return incident;
  }

  static getIncidentsForEvent(eventId) {
    if (!state.incidents) return [];
    return state.incidents.filter(i => i.event_id === eventId);
  }
}

module.exports = {
  IncidentService,
  INCIDENT_TYPES,
  INCIDENT_SEVERITY,
  INCIDENT_STATUS
};
