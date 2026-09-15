/**
 * TIKUM / ARGUS — Ticket Trust Model (Epic C)
 * 
 * Canonical Ticket Trust Model & Verification Lifecycle.
 * 
 * Invariants:
 * - A ticket is NEVER verified by image upload alone.
 * - Evidence quality determines transition from SUBMITTED to VERIFIED.
 * - Strict verification state machine:
 *   SUBMITTED -> EVIDENCE_REQUIRED / UNDER_REVIEW -> VERIFIED / CONDITIONALLY_VERIFIED / REJECTED
 * - Terminal states: REJECTED, EXPIRED, CANCELLED.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { EvidenceService, EVIDENCE_TYPES, EVIDENCE_STATUS } = require('./EvidenceService');

const TICKET_VERIFICATION_STATUS = {
  SUBMITTED: 'SUBMITTED',
  EVIDENCE_REQUIRED: 'EVIDENCE_REQUIRED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  CONDITIONALLY_VERIFIED: 'CONDITIONALLY_VERIFIED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

const RISK_STATUS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const TRANSFERABILITY_STATUS = {
  TRANSFERABLE_DIGITAL: 'TRANSFERABLE_DIGITAL',
  PHYSICAL_WRISTBAND: 'PHYSICAL_WRISTBAND',
  IDENTITY_BOUND: 'IDENTITY_BOUND',
  NON_TRANSFERABLE: 'NON_TRANSFERABLE',
  UNKNOWN: 'UNKNOWN'
};

class TicketTrustService {
  /**
   * Registers a new canonical ticket with trust metadata.
   */
  static async registerTicket({
    ticketId,
    eventId,
    sellerId,
    ticketType = 'GENERAL_ADMISSION',
    section = null,
    row = null,
    seat = null,
    faceValue = 0,
    currency = 'IDR',
    source = 'PRIMARY_PURCHASE',
    transferabilityStatus = TRANSFERABILITY_STATUS.TRANSFERABLE_DIGITAL,
    barcodeHash = null
  }) {
    if (!eventId || !sellerId) {
      const err = new Error('eventId and sellerId are mandatory for ticket registration');
      err.code = 'INVALID_TICKET_DATA';
      throw err;
    }

    const id = ticketId || `tkt-${uuidv4()}`;
    const now = new Date().toISOString();

    // Check duplicate barcode hash if provided
    if (barcodeHash) {
      const existingTicket = state.tickets.find(t => t.barcode_hash === barcodeHash && t.id !== id);
      if (existingTicket) {
        const err = new Error('Duplicate ticket barcode detected: ticket already registered on ARGUS');
        err.code = 'DUPLICATE_TICKET_BARCODE';
        throw err;
      }
    }

    const canonicalTicket = {
      ticket_id: id,
      id: id, // compatibility
      event_id: eventId,
      seller_id: sellerId,
      current_owner_id: sellerId,
      ticket_type: ticketType,
      section: section || 'General',
      row: row || null,
      seat: seat || null,
      seat_info: `${section || 'GA'}${row ? `, Row ${row}` : ''}${seat ? `, Seat ${seat}` : ''}`,
      face_value: parseInt(faceValue, 10) || 0,
      price: parseInt(faceValue, 10) || 0,
      currency: currency || 'IDR',
      source: source,
      barcode_hash: barcodeHash || `hash-${id}`,
      ownership_evidence: [],
      transferability_status: transferabilityStatus,
      verification_status: TICKET_VERIFICATION_STATUS.SUBMITTED,
      risk_status: RISK_STATUS.MEDIUM,
      risk_signals: [],
      created_at: now,
      updated_at: now
    };

    // Store in state.tickets
    state.tickets.push(canonicalTicket);

    await recordAuditLog('TICKET_TRUST', id, 'REGISTERED', sellerId, {
      event_id: eventId,
      verification_status: canonicalTicket.verification_status,
      risk_status: canonicalTicket.risk_status
    });

    return canonicalTicket;
  }

  /**
   * Attaches evidence to a ticket and updates verification status.
   */
  static async attachEvidence({ ticketId, source, type, content, uploaderId, metadata = {} }) {
    const ticket = state.tickets.find(t => t.ticket_id === ticketId || t.id === ticketId);
    if (!ticket) {
      const err = new Error(`Ticket '${ticketId}' not found`);
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }

    // Record evidence via EvidenceService
    const evidenceItem = await EvidenceService.recordEvidence({
      ticketId,
      source,
      type,
      content,
      uploaderId,
      metadata
    });

    if (!ticket.ownership_evidence) {
      ticket.ownership_evidence = [];
    }
    ticket.ownership_evidence.push(evidenceItem.evidence_id);

    // Re-evaluate verification status:
    // Image alone or unverified metadata -> UNDER_REVIEW
    // Primary purchase confirmation or official ticketing record -> UNDER_REVIEW / VERIFIED by officer
    if (type === EVIDENCE_TYPES.PRIMARY_PURCHASE_CONFIRMATION || type === EVIDENCE_TYPES.OFFICIAL_TICKETING_RECORD) {
      ticket.verification_status = TICKET_VERIFICATION_STATUS.UNDER_REVIEW;
      ticket.risk_status = RISK_STATUS.LOW;
    } else {
      ticket.verification_status = TICKET_VERIFICATION_STATUS.EVIDENCE_REQUIRED;
    }
    ticket.updated_at = new Date().toISOString();

    return { ticket, evidence: evidenceItem };
  }

  /**
   * Verification officer decisions.
   * Invariant: Requires verified evidence to reach VERIFIED state.
   */
  static async setVerificationStatus({
    ticketId,
    officerId,
    status,
    reason,
    riskStatus = null
  }) {
    const ticket = state.tickets.find(t => t.ticket_id === ticketId || t.id === ticketId);
    if (!ticket) {
      const err = new Error(`Ticket '${ticketId}' not found`);
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }

    if (!TICKET_VERIFICATION_STATUS[status]) {
      const err = new Error(`Invalid ticket verification status '${status}'`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    // Invariant: Do not claim VERIFIED merely because seller uploaded an unreviewed image
    if (status === TICKET_VERIFICATION_STATUS.VERIFIED) {
      const evidence = EvidenceService.getEvidenceForTicket(ticketId, 'admin');
      const hasAuthoritativeProof = evidence.some(e =>
        (e.type === EVIDENCE_TYPES.PRIMARY_PURCHASE_CONFIRMATION ||
         e.type === EVIDENCE_TYPES.OFFICIAL_TICKETING_RECORD ||
         e.type === EVIDENCE_TYPES.OFFICER_CONFIRMATION) &&
        e.status === EVIDENCE_STATUS.VERIFIED
      );

      if (!hasAuthoritativeProof) {
        const err = new Error(
          'Cannot verify ticket without verified primary purchase confirmation, official ticketing record, or officer gate verification.'
        );
        err.code = 'AUTHORITATIVE_EVIDENCE_REQUIRED';
        throw err;
      }
    }

    const previousStatus = ticket.verification_status;
    ticket.verification_status = status;
    if (riskStatus) ticket.risk_status = riskStatus;
    ticket.updated_at = new Date().toISOString();
    ticket.status = status === TICKET_VERIFICATION_STATUS.VERIFIED ? 'VERIFIED' : ticket.status;

    await recordAuditLog('TICKET_TRUST', ticketId, status, officerId, {
      previous_status: previousStatus,
      new_status: status,
      reason: reason || 'Officer verification evaluation'
    });

    return ticket;
  }

  /**
   * Retrieves complete trust profile of a ticket.
   */
  static getTicketTrustProfile(ticketId, requesterRole = 'public') {
    const ticket = state.tickets.find(t => t.ticket_id === ticketId || t.id === ticketId);
    if (!ticket) return null;

    const evidence = EvidenceService.getEvidenceForTicket(ticketId, requesterRole);

    return {
      ticket_id: ticket.ticket_id || ticket.id,
      event_id: ticket.event_id,
      seller_id: ticket.seller_id,
      ticket_type: ticket.ticket_type,
      seat_info: ticket.seat_info,
      face_value: ticket.face_value,
      currency: ticket.currency,
      verification_status: ticket.verification_status,
      risk_status: ticket.risk_status,
      transferability_status: ticket.transferability_status,
      evidence_count: evidence.length,
      evidence_summary: evidence.map(e => ({
        type: e.type,
        status: e.status,
        created_at: e.created_at,
        is_sensitive_pii: e.is_sensitive_pii || false
      }))
    };
  }
}

module.exports = {
  TicketTrustService,
  TICKET_VERIFICATION_STATUS,
  RISK_STATUS,
  TRANSFERABILITY_STATUS
};
