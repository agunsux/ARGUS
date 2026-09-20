/**
 * TIKUM / ARGUS — Canonical Ticket Inventory Service (Epic 6, Phase 1A)
 *
 * The single authoritative ticket asset creation and lifecycle layer.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Ticket is the canonical asset. Listing is an offer against a ticket.
 * 2. Ownership belongs to the ticket (current_owner_id), NEVER to the listing.
 * 3. ALL ticket creation — including legacy ListingService flows — MUST converge
 *    through this service internally.
 * 4. Ticket status lifecycle is strictly ordered and auditable.
 *
 * PERSISTENCE_BOUNDARY: All state mutations in this file are in-memory only.
 * Production-grade durable persistence is a mandatory prerequisite before
 * enabling real marketplace transactions. See ADR: PERSISTENCE_BOUNDARY.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../../database');
const { TicketTrustService, TICKET_VERIFICATION_STATUS, TRANSFERABILITY_STATUS } = require('../../trust/TicketTrustService');

/**
 * Canonical ticket statuses for marketplace lifecycle.
 * Superset of trust verification statuses — covers the full
 * inventory lifecycle from creation to settlement.
 */
const TICKET_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  LISTED: 'LISTED',
  LOCKED: 'LOCKED',
  SOLD: 'SOLD',
  TRANSFER_PENDING: 'TRANSFER_PENDING',
  TRANSFERRED: 'TRANSFERRED',
  USED: 'USED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED'
};

/**
 * Allowed ticket status transitions. Each key maps to the set of states
 * reachable from that state. Any transition not listed here is illegal.
 */
const ALLOWED_TRANSITIONS = {
  [TICKET_STATUS.DRAFT]:                [TICKET_STATUS.PENDING_VERIFICATION, TICKET_STATUS.CANCELLED],
  [TICKET_STATUS.PENDING_VERIFICATION]: [TICKET_STATUS.VERIFIED, TICKET_STATUS.REJECTED, TICKET_STATUS.CANCELLED],
  [TICKET_STATUS.VERIFIED]:             [TICKET_STATUS.LISTED, TICKET_STATUS.CANCELLED],
  'ACTIVE':                             [TICKET_STATUS.LISTED, TICKET_STATUS.LOCKED, TICKET_STATUS.CANCELLED], // legacy alias
  [TICKET_STATUS.LISTED]:               [TICKET_STATUS.LOCKED, TICKET_STATUS.VERIFIED, TICKET_STATUS.CANCELLED],
  [TICKET_STATUS.LOCKED]:               [TICKET_STATUS.SOLD, TICKET_STATUS.LISTED], // LISTED = reservation expired/released
  [TICKET_STATUS.SOLD]:                 [TICKET_STATUS.TRANSFER_PENDING],
  'ESCROWED':                           [TICKET_STATUS.TRANSFER_PENDING, TICKET_STATUS.TRANSFERRED, TICKET_STATUS.USED, 'SETTLED', 'REDEEMED', 'VERIFIED_AT_VENUE'],
  [TICKET_STATUS.TRANSFER_PENDING]:     [TICKET_STATUS.TRANSFERRED, TICKET_STATUS.SOLD], // SOLD = transfer failed, retry
  [TICKET_STATUS.TRANSFERRED]:          [TICKET_STATUS.USED],
  [TICKET_STATUS.USED]:                 [], // terminal
  [TICKET_STATUS.CANCELLED]:            [], // terminal
  [TICKET_STATUS.REJECTED]:             [] // terminal
};

/**
 * Supported ticket formats (how the ticket is stored/delivered).
 */
const TICKET_FORMAT = {
  E_TICKET: 'E_TICKET',
  PDF: 'PDF',
  PHYSICAL: 'PHYSICAL',
  MOBILE_APP: 'MOBILE_APP',
  WRISTBAND: 'WRISTBAND'
};

/**
 * Supported transfer methods (how the ticket changes hands).
 */
const TRANSFER_METHOD = {
  MOBILE_TRANSFER: 'MOBILE_TRANSFER',
  PDF: 'PDF',
  QR: 'QR',
  WALLET_TRANSFER: 'WALLET_TRANSFER',
  MANUAL_HANDOFF: 'MANUAL_HANDOFF'
};

class TicketInventoryService {
  /**
   * Creates a canonical ticket inventory unit.
   *
   * This is the ONLY authorized path for creating marketplace tickets.
   * Delegates to TicketTrustService.registerTicket for trust/verification metadata.
   *
   * @PERSISTENCE_BOUNDARY — state.tickets mutation
   *
   * @param {Object} params
   * @param {string} params.sellerId - Authenticated seller user ID
   * @param {string} params.canonicalEventId - Canonical event ID from CanonicalEventRegistry
   * @param {string} [params.ticketType='GENERAL_ADMISSION'] - e.g. GENERAL_ADMISSION, VIP, VVIP
   * @param {string} [params.section] - Section/area within venue
   * @param {string} [params.row] - Row identifier
   * @param {string} [params.seat] - Seat number
   * @param {number} [params.quantity=1] - Number of tickets (usually 1)
   * @param {number} params.faceValue - Original face value in smallest currency unit
   * @param {string} [params.currency='IDR'] - ISO 4217 currency code
   * @param {string} [params.ticketFormat='E_TICKET'] - One of TICKET_FORMAT
   * @param {string} [params.transferMethod='MOBILE_TRANSFER'] - One of TRANSFER_METHOD
   * @param {string} [params.barcodeHash] - SHA-256 hash of barcode/QR content
   * @param {string} [params.rawBarcode] - Raw barcode (will be hashed)
   * @returns {Object} Created ticket object
   */
  static async createTicket({
    sellerId,
    canonicalEventId,
    ticketType = 'GENERAL_ADMISSION',
    section = null,
    row = null,
    seat = null,
    quantity = 1,
    faceValue,
    currency = 'IDR',
    ticketFormat = TICKET_FORMAT.E_TICKET,
    transferMethod = TRANSFER_METHOD.MOBILE_TRANSFER,
    barcodeHash = null,
    rawBarcode = null
  }) {
    // 1. Validate seller exists and is ACTIVE
    const seller = state.users.find(u => u.id === sellerId);
    if (!seller) {
      const err = new Error(`Seller '${sellerId}' not found`);
      err.code = 'SELLER_NOT_FOUND';
      throw err;
    }

    const sellerProfile = state.seller_profiles
      ? state.seller_profiles.find(p => p.user_id === sellerId)
      : null;

    // Seller must have a profile (can be PENDING for ticket creation, but not for listing)
    // Suspended sellers cannot create tickets
    if (sellerProfile && sellerProfile.suspended) {
      const err = new Error('Seller is SUSPENDED. Cannot create ticket inventory.');
      err.code = 'SELLER_SUSPENDED';
      throw err;
    }

    // 2. Validate canonical event exists and is not CANCELLED
    const event = state.events.find(e => e.id === canonicalEventId);
    if (!event) {
      const err = new Error(`Canonical event '${canonicalEventId}' not found`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    if (event.status === 'CANCELLED') {
      const err = new Error(`Cannot create ticket for CANCELLED event '${canonicalEventId}'`);
      err.code = 'EVENT_CANCELLED';
      throw err;
    }

    // 3. Validate face value
    const parsedFaceValue = parseInt(faceValue, 10);
    if (isNaN(parsedFaceValue) || parsedFaceValue < 0) {
      const err = new Error('Face value must be a non-negative integer');
      err.code = 'INVALID_FACE_VALUE';
      throw err;
    }

    // 4. Compute barcode hash if raw barcode provided
    let effectiveBarcodeHash = barcodeHash;
    if (!effectiveBarcodeHash && rawBarcode) {
      const crypto = require('crypto');
      effectiveBarcodeHash = crypto.createHash('sha256').update(rawBarcode.trim()).digest('hex');
    }

    // 5. Determine transferability from event admission protocol
    let transferabilityStatus = TRANSFERABILITY_STATUS.TRANSFERABLE_DIGITAL;
    if (event.admission_protocol) {
      if (event.admission_protocol.handoff_type === 'PHYSICAL_WRISTBAND') {
        transferabilityStatus = TRANSFERABILITY_STATUS.PHYSICAL_WRISTBAND;
      }
    }

    // 6. Delegate to TicketTrustService for canonical registration
    //    This handles: duplicate barcode detection, trust metadata, evidence scaffolding
    const ticketId = `tkt-${uuidv4()}`;

    const canonicalTicket = await TicketTrustService.registerTicket({
      ticketId,
      eventId: canonicalEventId,
      sellerId,
      ticketType,
      section,
      row,
      seat,
      faceValue: parsedFaceValue,
      currency,
      source: 'MARKETPLACE_LISTING',
      transferabilityStatus,
      barcodeHash: effectiveBarcodeHash
    });

    // 7. @PERSISTENCE_BOUNDARY — Enrich ticket with marketplace inventory fields
    //    TicketTrustService.registerTicket already pushed to state.tickets,
    //    so we find and extend the existing record.
    const ticket = state.tickets.find(t => (t.ticket_id === ticketId || t.id === ticketId));
    if (ticket) {
      ticket.status = TICKET_STATUS.DRAFT;
      ticket.quantity = parseInt(quantity, 10) || 1;
      ticket.ticket_format = ticketFormat;
      ticket.transfer_method = transferMethod;
      ticket.marketplace_created = true;
      ticket.updated_at = new Date().toISOString();
    }

    await recordAuditLog('TICKET_INVENTORY', ticketId, 'CREATED', sellerId, {
      event_id: canonicalEventId,
      ticket_type: ticketType,
      section,
      row,
      seat,
      face_value: parsedFaceValue,
      currency,
      ticket_format: ticketFormat,
      transfer_method: transferMethod,
      status: TICKET_STATUS.DRAFT
    });

    return ticket || canonicalTicket;
  }

  /**
   * Submits a DRAFT ticket for verification.
   *
   * Transition: DRAFT → PENDING_VERIFICATION
   *
   * @PERSISTENCE_BOUNDARY — state.tickets mutation
   *
   * @param {string} ticketId
   * @param {string} sellerId - Must be the current owner
   * @param {string} [evidenceBundleId] - Optional evidence bundle reference
   * @returns {Object} Updated ticket
   */
  static async submitForVerification(ticketId, sellerId, evidenceBundleId = null) {
    const ticket = this.findTicket(ticketId);
    if (!ticket) {
      const err = new Error(`Ticket '${ticketId}' not found`);
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }

    // Ownership check
    if (ticket.current_owner_id !== sellerId && ticket.seller_id !== sellerId) {
      const err = new Error('Unauthorized: only the ticket owner can submit for verification');
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    // Status transition validation
    this.validateTransition(ticket, TICKET_STATUS.PENDING_VERIFICATION);

    // @PERSISTENCE_BOUNDARY
    ticket.status = TICKET_STATUS.PENDING_VERIFICATION;
    ticket.verification_status = TICKET_VERIFICATION_STATUS.SUBMITTED;
    ticket.evidence_bundle_id = evidenceBundleId || ticket.evidence_bundle_id;
    ticket.updated_at = new Date().toISOString();

    await recordAuditLog('TICKET_INVENTORY', ticketId, 'SUBMITTED_FOR_VERIFICATION', sellerId, {
      evidence_bundle_id: evidenceBundleId,
      previous_status: 'DRAFT'
    });

    return ticket;
  }

  /**
   * Transitions a ticket to a new status with validation.
   *
   * @PERSISTENCE_BOUNDARY — state.tickets mutation
   *
   * @param {string} ticketId
   * @param {string} newStatus - Target status from TICKET_STATUS
   * @param {string} actorId - Who is performing the transition
   * @param {string} [reason] - Human-readable reason
   * @returns {Object} Updated ticket
   */
  static async transitionStatus(ticketId, newStatus, actorId, reason = null) {
    const ticket = this.findTicket(ticketId);
    if (!ticket) {
      const err = new Error(`Ticket '${ticketId}' not found`);
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }

    const previousStatus = ticket.status;
    this.validateTransition(ticket, newStatus);

    // @PERSISTENCE_BOUNDARY
    ticket.status = newStatus;
    ticket.updated_at = new Date().toISOString();

    // Sync verification_status for trust layer compatibility
    if (newStatus === TICKET_STATUS.VERIFIED) {
      ticket.verification_status = TICKET_VERIFICATION_STATUS.VERIFIED;
    } else if (newStatus === TICKET_STATUS.REJECTED) {
      ticket.verification_status = TICKET_VERIFICATION_STATUS.REJECTED;
    }

    await recordAuditLog('TICKET_INVENTORY', ticketId, `STATUS_${newStatus}`, actorId, {
      previous_status: previousStatus,
      new_status: newStatus,
      reason
    });

    return ticket;
  }

  /**
   * Retrieves a ticket by ID.
   * Looks up by both ticket_id and id for compatibility with TicketTrustService.
   */
  static findTicket(ticketId) {
    return state.tickets.find(t => t.ticket_id === ticketId || t.id === ticketId) || null;
  }

  /**
   * Retrieves all tickets owned by a seller.
   */
  static getSellerTickets(sellerId) {
    return state.tickets.filter(
      t => (t.current_owner_id === sellerId || t.seller_id === sellerId) && t.marketplace_created
    );
  }

  /**
   * Validates that a status transition is allowed.
   * Throws if the transition is illegal.
   */
  static validateTransition(ticket, targetStatus) {
    const currentStatus = ticket.status;

    if (!TICKET_STATUS[targetStatus]) {
      const err = new Error(`Invalid ticket status: '${targetStatus}'`);
      err.code = 'INVALID_TICKET_STATUS';
      throw err;
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      const err = new Error(
        `Illegal ticket status transition: ${currentStatus} → ${targetStatus}. ` +
        `Allowed from ${currentStatus}: [${(allowed || []).join(', ')}]`
      );
      err.code = 'ILLEGAL_STATUS_TRANSITION';
      throw err;
    }
  }
}

module.exports = {
  TicketInventoryService,
  TICKET_STATUS,
  ALLOWED_TRANSITIONS,
  TICKET_FORMAT,
  TRANSFER_METHOD
};

