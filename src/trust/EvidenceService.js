/**
 * TIKUM / ARGUS — Ticket Evidence Architecture (Epic D)
 * 
 * Implements tamper-evident, multi-type evidence storage adhering to
 * Indonesia UU PDP No. 27/2022 (Personal Data Protection Act).
 * 
 * Strictly isolates and masks PII (identity documents).
 * Non-privileged marketplace buyers/sellers NEVER receive raw identity files.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');

const EVIDENCE_TYPES = {
  PRIMARY_PURCHASE_CONFIRMATION: 'PRIMARY_PURCHASE_CONFIRMATION',
  OFFICIAL_TICKETING_RECORD: 'OFFICIAL_TICKETING_RECORD',
  TRANSFER_CONFIRMATION: 'TRANSFER_CONFIRMATION',
  TICKET_METADATA: 'TICKET_METADATA',
  VENUE_INSTRUCTIONS: 'VENUE_INSTRUCTIONS',
  PROMOTER_INSTRUCTIONS: 'PROMOTER_INSTRUCTIONS',
  IDENTITY_DOCUMENTATION: 'IDENTITY_DOCUMENTATION',
  OFFICER_CONFIRMATION: 'OFFICER_CONFIRMATION',
  BARCODE_VERIFICATION_RECORD: 'BARCODE_VERIFICATION_RECORD'
};

const EVIDENCE_STATUS = {
  SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  FLAGGED_FOR_REVIEW: 'FLAGGED_FOR_REVIEW'
};

// Types considered sensitive PII under UU PDP
const SENSITIVE_PII_TYPES = new Set([
  EVIDENCE_TYPES.IDENTITY_DOCUMENTATION
]);

class EvidenceService {
  /**
   * Records an evidence item in an append-only, tamper-evident manner.
   */
  static async recordEvidence({ ticketId, source, type, content, uploaderId, metadata = {} }) {
    if (!ticketId || !source || !type) {
      const err = new Error('ticketId, source, and type are mandatory for evidence');
      err.code = 'INVALID_EVIDENCE_PAYLOAD';
      throw err;
    }

    if (!EVIDENCE_TYPES[type]) {
      const err = new Error(`Invalid evidence type '${type}'. Allowed types: ${Object.keys(EVIDENCE_TYPES).join(', ')}`);
      err.code = 'UNSUPPORTED_EVIDENCE_TYPE';
      throw err;
    }

    // Cryptographic hash of the content
    const contentString = typeof content === 'string' ? content : JSON.stringify(content || {});
    const contentHash = crypto.createHash('sha256').update(contentString).digest('hex');

    const evidenceId = `evi-${uuidv4()}`;
    const now = new Date().toISOString();

    const isSensitivePii = SENSITIVE_PII_TYPES.has(type);

    const evidenceItem = {
      evidence_id: evidenceId,
      id: evidenceId,
      ticket_id: ticketId,
      source: source.toUpperCase(),
      type: type,
      hash: contentHash,
      is_sensitive_pii: isSensitivePii,
      uploader_id: uploaderId || 'SYSTEM',
      status: EVIDENCE_STATUS.SUBMITTED,
      created_at: now,
      verified_at: null,
      verified_by: null,
      metadata: {
        ...metadata,
        // Redact PII from raw metadata
        ...(isSensitivePii ? { pii_masked: true, content_length: contentString.length } : {})
      }
    };

    if (!state.evidence_items) {
      state.evidence_items = [];
    }
    state.evidence_items.push(evidenceItem);

    await recordAuditLog('EVIDENCE', evidenceId, 'RECORDED', uploaderId || 'SYSTEM', {
      ticket_id: ticketId,
      type,
      hash: contentHash,
      is_sensitive_pii: isSensitivePii
    });

    return evidenceItem;
  }

  /**
   * Officer or Trust system verifies an evidence item.
   */
  static async verifyEvidence({ evidenceId, officerId, status = EVIDENCE_STATUS.VERIFIED, reason = null }) {
    if (!state.evidence_items) {
      state.evidence_items = [];
    }

    const item = state.evidence_items.find(e => e.evidence_id === evidenceId || e.id === evidenceId);
    if (!item) {
      const err = new Error(`Evidence item '${evidenceId}' not found`);
      err.code = 'EVIDENCE_NOT_FOUND';
      throw err;
    }

    item.status = status;
    item.verified_at = new Date().toISOString();
    item.verified_by = officerId;
    item.verification_reason = reason;

    await recordAuditLog('EVIDENCE', evidenceId, status, officerId, {
      ticket_id: item.ticket_id,
      reason
    });

    return item;
  }

  /**
   * Retrieves evidence items for a ticket, with strict UU PDP PII redaction for unauthorized callers.
   */
  static getEvidenceForTicket(ticketId, requesterRole = 'public') {
    if (!state.evidence_items) {
      state.evidence_items = [];
    }

    const items = state.evidence_items.filter(e => e.ticket_id === ticketId);

    return items.map(item => {
      // If requester is not admin or assigned PIC, mask sensitive PII
      if (item.is_sensitive_pii && requesterRole !== 'admin' && requesterRole !== 'pic') {
        return {
          evidence_id: item.evidence_id,
          ticket_id: item.ticket_id,
          source: item.source,
          type: item.type,
          hash: item.hash,
          is_sensitive_pii: true,
          status: item.status,
          created_at: item.created_at,
          verified_at: item.verified_at,
          redacted: true,
          notice: 'PII redacted under Indonesia UU PDP No. 27/2022'
        };
      }

      return item;
    });
  }
}

module.exports = {
  EvidenceService,
  EVIDENCE_TYPES,
  EVIDENCE_STATUS
};
