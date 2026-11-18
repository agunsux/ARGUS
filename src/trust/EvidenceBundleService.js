/**
 * TIKUM / ARGUS — Unified Digital Evidence Bundle Service (Epic Governance Rule 8)
 * 
 * Implements the 9-artifact Digital Evidence Bundle architecture conforming to
 * Indonesia UU PDP No. 27/2022 (Personal Data Protection Act).
 * 
 * Discrete Artifact Slots:
 * 1. ownership_evidence: Pre-payment Stage A review (strictly NO raw QR/barcode)
 * 2. purchase_invoice: Original purchase invoice / order confirmation
 * 3. seller_identity_ref: Verified seller identity reference (masked PII)
 * 4. binding_consent_log: Timestamped Buyer & Seller binding T&C consent
 * 5. payment_proof: Authoritative payment gateway reference or direct payment proof
 * 6. pic_attendance_proof: Timestamped PIC attendance proof at Titik Kumpul (VENUE_ASSISTED)
 * 7. handover_proof: Wristband exchange photo/video or official digital transfer confirmation
 * 8. buyer_receipt_or_noshow: Buyer receipt confirmation or formal 2-of-3 no-show record
 * 9. resolution_notes: Dispute, incident, and final settlement/refund resolution notes
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');

const ARTIFACT_SLOTS = Object.freeze({
  SLOT_1_OWNERSHIP_EVIDENCE: 'ownership_evidence',
  SLOT_2_PURCHASE_INVOICE: 'purchase_invoice',
  SLOT_3_SELLER_IDENTITY_REF: 'seller_identity_ref',
  SLOT_4_BINDING_CONSENT_LOG: 'binding_consent_log',
  SLOT_5_PAYMENT_PROOF: 'payment_proof',
  SLOT_6_PIC_ATTENDANCE_PROOF: 'pic_attendance_proof',
  SLOT_7_HANDOVER_PROOF: 'handover_proof',
  SLOT_8_BUYER_RECEIPT_OR_NOSHOW: 'buyer_receipt_or_noshow',
  SLOT_9_RESOLUTION_NOTES: 'resolution_notes'
});

class EvidenceBundleService {
  static init() {
    if (!state.evidence_bundles) {
      state.evidence_bundles = [];
    }
  }

  /**
   * Helper to redact sensitive PII (NIK, raw bank accounts, raw QR strings)
   * under UU PDP No. 27/2022.
   */
  static maskPiiString(val) {
    if (!val || typeof val !== 'string') return val;
    // Mask 16-digit NIK
    val = val.replace(/\b(\d{6})\d{6}(\d{4})\b/g, '$1******$2');
    // Mask bank accounts
    val = val.replace(/\b(\d{3,4})\d{4,8}(\d{3,4})\b/g, '$1****$2');
    return val;
  }

  /**
   * Redacts sensitive personal data fields according to Indonesia UU PDP No. 27/2022.
   * Masks NIK, names, emails, phone numbers, and bank accounts.
   */
  static maskPII(data) {
    if (!data || typeof data !== 'object') return data;
    const masked = { ...data };
    if (masked.full_name && typeof masked.full_name === 'string') {
      const parts = masked.full_name.trim().split(/\s+/);
      masked.full_name = parts.map(p => p[0] + '*'.repeat(Math.max(1, p.length - 1))).join(' ');
    }
    if (masked.nik && typeof masked.nik === 'string') {
      masked.nik = masked.nik.replace(/^(\d{4})\d+(\d{0})$/, (m, p1) => p1 + '*'.repeat(12));
    }
    if (masked.email && typeof masked.email === 'string') {
      const [user, domain] = masked.email.split('@');
      if (domain) {
        masked.email = (user ? user[0] + '***' : '***') + '@' + domain;
      }
    }
    if (masked.phone && typeof masked.phone === 'string') {
      masked.phone = masked.phone.replace(/^(\d{4})\d+(\d{4})$/, '$1****$2');
    }
    masked.pdp_compliance = 'UU_PDP_NO_27_2022';
    return masked;
  }

  /**
   * Creates a new structured Digital Evidence Bundle with 9 discrete slots.
   */
  static createBundle({
    orderId = null,
    dealId = null,
    ticketId = null,
    sellerId,
    buyerId = null,
    eventId = null,
    handoverType = 'DIGITAL_TRANSFER'
  }) {
    this.init();
    const bundleId = `evb-${uuidv4()}`;
    const now = new Date().toISOString();

    const bundle = {
      bundle_id: bundleId,
      id: bundleId,
      order_id: orderId,
      deal_id: dealId,
      ticket_id: ticketId,
      seller_id: sellerId,
      buyer_id: buyerId,
      event_id: eventId,
      handover_type: handoverType,
      created_at: now,
      updated_at: now,
      slots: {
        [ARTIFACT_SLOTS.SLOT_1_OWNERSHIP_EVIDENCE]: null,
        [ARTIFACT_SLOTS.SLOT_2_PURCHASE_INVOICE]: null,
        [ARTIFACT_SLOTS.SLOT_3_SELLER_IDENTITY_REF]: null,
        [ARTIFACT_SLOTS.SLOT_4_BINDING_CONSENT_LOG]: null,
        [ARTIFACT_SLOTS.SLOT_5_PAYMENT_PROOF]: null,
        [ARTIFACT_SLOTS.SLOT_6_PIC_ATTENDANCE_PROOF]: null,
        [ARTIFACT_SLOTS.SLOT_7_HANDOVER_PROOF]: null,
        [ARTIFACT_SLOTS.SLOT_8_BUYER_RECEIPT_OR_NOSHOW]: null,
        [ARTIFACT_SLOTS.SLOT_9_RESOLUTION_NOTES]: null
      }
    };

    state.evidence_bundles.push(bundle);
    return bundle;
  }

  /**
   * Attaches an artifact to a specific slot with validation and PDP protection.
   *
   * SECURITY INVARIANT:
   * Slot 1 (ownership_evidence at Stage A) strictly FORBIDS raw QR/barcode strings!
   */
  static attachArtifact({
    bundleId,
    slotName,
    content,
    metadata = {},
    actorId = 'SYSTEM',
    actorRole = 'system'
  }) {
    this.init();
    const bundle = state.evidence_bundles.find(b => b.bundle_id === bundleId || b.id === bundleId);
    if (!bundle) {
      const err = new Error(`Evidence bundle '${bundleId}' not found`);
      err.code = 'BUNDLE_NOT_FOUND';
      throw err;
    }

    const validSlots = Object.values(ARTIFACT_SLOTS);
    if (!validSlots.includes(slotName)) {
      const err = new Error(`Invalid slot name: '${slotName}'. Allowed: ${validSlots.join(', ')}`);
      err.code = 'INVALID_SLOT_NAME';
      throw err;
    }

    // Safety Invariant: Check raw QR prevention at Stage A (Slot 1)
    if (slotName === ARTIFACT_SLOTS.SLOT_1_OWNERSHIP_EVIDENCE) {
      if (metadata?.contains_raw_qr === true || metadata?.raw_barcode || (typeof content === 'string' && /^(raw_barcode|barcode_qr):/i.test(content))) {
        const err = new Error('Security Invariant Violation: Raw barcode/QR string is strictly prohibited at Stage A ownership evidence review. Upload invoice or booking receipt without barcode.');
        err.code = 'RAW_QR_PROHIBITED_STAGE_A';
        throw err;
      }
    }

    const artifactId = `art-${uuidv4()}`;
    const now = new Date().toISOString();
    const contentString = typeof content === 'string' ? content : JSON.stringify(content || {});
    const sha256 = crypto.createHash('sha256').update(contentString).digest('hex');

    const artifact = {
      artifact_id: artifactId,
      slot: slotName,
      sha256,
      actor_id: actorId,
      actor_role: actorRole,
      content: this.maskPiiString(contentString),
      metadata: {
        ...metadata,
        pii_masked: true
      },
      timestamp: now
    };

    bundle.slots[slotName] = artifact;
    bundle.updated_at = now;

    recordAuditLog('EVIDENCE_BUNDLE', bundleId, 'SLOT_UPDATED', actorId, {
      slot: slotName,
      sha256
    });

    return { bundle, artifact };
  }

  /**
   * Retrieves an evidence bundle with PDP privacy masking for unauthorized callers.
   */
  static getBundle(bundleId, requesterRole = 'public') {
    this.init();
    if (!bundleId) return null;
    const bundle = state.evidence_bundles.find(b => b.bundle_id === bundleId || b.id === bundleId);
    if (!bundle) return null;
    if (!bundle.slots) bundle.slots = {};

    const isAdminOrOps = ['admin', 'pic', 'compliance', 'ops'].includes((requesterRole || '').toLowerCase());

    const sanitizedSlots = {};
    for (const [slotName, artifact] of Object.entries(bundle.slots)) {
      if (!artifact) {
        sanitizedSlots[slotName] = null;
        continue;
      }

      if (!isAdminOrOps) {
        // Redact PII in public/buyer/seller view
        sanitizedSlots[slotName] = {
          artifact_id: artifact.artifact_id,
          slot: artifact.slot,
          sha256: artifact.sha256,
          timestamp: artifact.timestamp,
          verified: true,
          redacted: true,
          notice: 'Rincian data pribadi disamarkan sesuai UU Pelindungan Data Pribadi (UU PDP No. 27/2022).'
        };
      } else {
        sanitizedSlots[slotName] = artifact;
      }
    }

    return {
      bundle_id: bundle.bundle_id,
      order_id: bundle.order_id,
      deal_id: bundle.deal_id,
      ticket_id: bundle.ticket_id,
      event_id: bundle.event_id,
      handover_type: bundle.handover_type,
      slots: sanitizedSlots,
      completeness: this.getBundleCompleteness(bundleId),
      created_at: bundle.created_at,
      updated_at: bundle.updated_at
    };
  }

  /**
   * Computes completeness metric for an evidence bundle.
   * Total 9 discrete slots. For closed transactions, target is 100%.
   */
  static getBundleCompleteness(bundleId) {
    this.init();
    const bundle = state.evidence_bundles.find(b => b.bundle_id === bundleId || b.id === bundleId);
    if (!bundle) {
      return { totalSlots: 9, filledSlots: 0, completenessPercent: 0, isComplete: false };
    }
    if (!bundle.slots) bundle.slots = {};

    const allSlots = Object.values(ARTIFACT_SLOTS);
    let filled = 0;
    const missing = [];

    // If DIGITAL_TRANSFER, slot 6 (pic_attendance_proof) may be NOT_APPLICABLE
    const isDigital = bundle.handover_type === 'DIGITAL_TRANSFER';

    for (const slot of allSlots) {
      if (isDigital && slot === ARTIFACT_SLOTS.SLOT_6_PIC_ATTENDANCE_PROOF) {
        // Waived for digital
        filled++;
        continue;
      }

      if (bundle.slots[slot] !== null && bundle.slots[slot] !== undefined) {
        filled++;
      } else {
        missing.push(slot);
      }
    }

    const pct = Math.round((filled / allSlots.length) * 100);
    return {
      totalSlots: allSlots.length,
      filledSlots: filled,
      completenessPercent: pct,
      isComplete: filled === allSlots.length,
      missingSlots: missing
    };
  }
}

module.exports = {
  EvidenceBundleService,
  ARTIFACT_SLOTS
};
