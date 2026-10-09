/**
 * TIKUM / ARGUS — Partner & Supply Validation Register (P0.3)
 * 
 * Provides verifiable supply partner governance, consignment authorization,
 * and inventory tracking for controlled pilot operations in Jabodetabek and Bandung.
 * 
 * NON-NEGOTIABLE INVARIANTS:
 * 1. Zero Fake Partners: Informal conversations or regional PIC presence do NOT constitute supply authorization.
 * 2. Strict State Machine: IDENTIFIED -> CONTACTED -> INTEREST_CONFIRMED -> AUTHORITY_VERIFIED -> TERMS_AGREED -> PILOT_APPROVED.
 * 3. Authority Gate: Inventory CANNOT be marked VERIFIED or approved for listing without verified proof of authority.
 * 4. Zero Real Money: All consignment agreements remain simulated / non-payment pilot until payment gateway approval.
 * 5. PII & Barcode Masking: Raw tax IDs (NPWP), NIK, or raw ticket credentials are never returned in public payloads.
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { state, recordAuditLog } = require('../database');

const PARTNER_TYPES = {
  PROMOTER: 'PROMOTER',
  AUTHORIZED_DISTRIBUTOR: 'AUTHORIZED_DISTRIBUTOR',
  CONSIGNOR: 'CONSIGNOR',
  PRIMARY_TICKET_HOLDER: 'PRIMARY_TICKET_HOLDER',
  OPERATIONAL_PARTNER: 'OPERATIONAL_PARTNER'
};

const PARTNER_STATUS = {
  IDENTIFIED: 'IDENTIFIED',
  CONTACTED: 'CONTACTED',
  INTEREST_CONFIRMED: 'INTEREST_CONFIRMED',
  AUTHORITY_VERIFIED: 'AUTHORITY_VERIFIED',
  TERMS_AGREED: 'TERMS_AGREED',
  PILOT_APPROVED: 'PILOT_APPROVED',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED'
};

const ALLOWED_PARTNER_TRANSITIONS = {
  [PARTNER_STATUS.IDENTIFIED]: [PARTNER_STATUS.CONTACTED, PARTNER_STATUS.REJECTED],
  [PARTNER_STATUS.CONTACTED]: [PARTNER_STATUS.INTEREST_CONFIRMED, PARTNER_STATUS.REJECTED],
  [PARTNER_STATUS.INTEREST_CONFIRMED]: [PARTNER_STATUS.AUTHORITY_VERIFIED, PARTNER_STATUS.REJECTED],
  [PARTNER_STATUS.AUTHORITY_VERIFIED]: [PARTNER_STATUS.TERMS_AGREED, PARTNER_STATUS.REJECTED, PARTNER_STATUS.SUSPENDED],
  [PARTNER_STATUS.TERMS_AGREED]: [PARTNER_STATUS.PILOT_APPROVED, PARTNER_STATUS.REJECTED, PARTNER_STATUS.SUSPENDED],
  [PARTNER_STATUS.PILOT_APPROVED]: [PARTNER_STATUS.SUSPENDED, PARTNER_STATUS.REJECTED],
  [PARTNER_STATUS.SUSPENDED]: [PARTNER_STATUS.AUTHORITY_VERIFIED, PARTNER_STATUS.PILOT_APPROVED, PARTNER_STATUS.REJECTED],
  [PARTNER_STATUS.REJECTED]: []
};

const INVENTORY_STATUS = {
  PROPOSED: 'PROPOSED',
  DOCUMENTED: 'DOCUMENTED',
  VERIFIED: 'VERIFIED',
  LISTED: 'LISTED',
  EXHAUSTED: 'EXHAUSTED',
  REVOKED: 'REVOKED'
};

class PartnerValidationService {
  static getPartnerCollection() {
    if (!state.partners) {
      state.partners = [];
    }
    return state.partners;
  }

  static getInventoryCollection() {
    if (!state.partner_inventory) {
      state.partner_inventory = [];
    }
    return state.partner_inventory;
  }

  /**
   * Registers a new partner candidate into the register.
   */
  static async registerPartner({
    partnerId = null,
    businessName,
    legalName = null,
    partnerType = PARTNER_TYPES.CONSIGNOR,
    geographicCoverage = ['Jabodetabek'],
    representativeName,
    contactEmail,
    contactPhone,
    notes = null,
    registeredBy = 'admin-1'
  }) {
    if (!businessName || !representativeName) {
      const err = new Error('businessName and representativeName are required');
      err.code = 'INVALID_PARTNER_PAYLOAD';
      throw err;
    }

    if (!PARTNER_TYPES[partnerType]) {
      const err = new Error(`Invalid partner type: '${partnerType}'`);
      err.code = 'INVALID_PARTNER_TYPE';
      throw err;
    }

    const partners = this.getPartnerCollection();
    const id = partnerId || `prt-${uuidv4()}`;

    // Duplicate check by business name
    const existing = partners.find(p => p.business_name.toLowerCase() === businessName.toLowerCase().trim());
    if (existing) {
      const err = new Error(`Partner '${businessName}' is already registered (ID: ${existing.id})`);
      err.code = 'DUPLICATE_PARTNER';
      throw err;
    }

    const now = new Date().toISOString();
    const partner = {
      id,
      partner_id: id,
      business_name: businessName.trim(),
      legal_name: legalName ? legalName.trim() : null,
      partner_type: partnerType,
      geographic_coverage: Array.isArray(geographicCoverage) ? geographicCoverage : [geographicCoverage],
      representative_name: representativeName.trim(),
      contact_email: contactEmail ? contactEmail.trim().toLowerCase() : null,
      contact_phone: contactPhone ? contactPhone.trim() : null,
      status: PARTNER_STATUS.IDENTIFIED,
      authority_evidence: null,
      authority_verified_at: null,
      authority_verified_by: null,
      agreed_transfer_mechanisms: [],
      commercial_terms: null,
      agreement_doc_hash: null,
      agreement_signed_at: null,
      risk_notes: notes || null,
      created_at: now,
      updated_at: now
    };

    partners.push(partner);

    await recordAuditLog('PARTNER', id, 'PARTNER_REGISTRATION', registeredBy, {
      business_name: partner.business_name,
      partner_type: partner.partner_type,
      geographic_coverage: partner.geographic_coverage
    });

    return partner;
  }

  /**
   * Advances partner validation lifecycle status with strict transition checks.
   */
  static async updatePartnerStatus(partnerId, newStatus, { actorId = 'admin-1', reason = null, metadata = {} } = {}) {
    const partner = this.getPartnerById(partnerId);
    if (!partner) {
      const err = new Error(`Partner '${partnerId}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }

    if (!PARTNER_STATUS[newStatus]) {
      const err = new Error(`Invalid partner status: '${newStatus}'`);
      err.code = 'INVALID_PARTNER_STATUS';
      throw err;
    }

    const currentStatus = partner.status;
    const allowed = ALLOWED_PARTNER_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      const err = new Error(`Illegal partner status transition from '${currentStatus}' to '${newStatus}'`);
      err.code = 'ILLEGAL_STATUS_TRANSITION';
      err.currentStatus = currentStatus;
      err.targetStatus = newStatus;
      throw err;
    }

    partner.status = newStatus;
    partner.updated_at = new Date().toISOString();
    if (reason) {
      partner.risk_notes = partner.risk_notes ? `${partner.risk_notes} | ${reason}` : reason;
    }

    await recordAuditLog('PARTNER', partnerId, 'PARTNER_STATUS_UPDATE', actorId, {
      previous_status: currentStatus,
      new_status: newStatus,
      reason,
      ...metadata
    });

    return partner;
  }

  /**
   * Records verified authority evidence (e.g. promoter allocation MOU, primary ticket invoice).
   */
  static async verifyPartnerAuthority(partnerId, {
    evidenceType,
    documentHash,
    referenceNumber,
    issuerName,
    validUntil = null,
    officerId = 'admin-1',
    notes = null
  }) {
    const partner = this.getPartnerById(partnerId);
    if (!partner) {
      const err = new Error(`Partner '${partnerId}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }

    if (!evidenceType || !documentHash) {
      const err = new Error('evidenceType and documentHash are required for authority verification');
      err.code = 'INVALID_EVIDENCE_PAYLOAD';
      throw err;
    }

    const now = new Date().toISOString();
    partner.authority_evidence = {
      evidence_type: evidenceType,
      document_hash: documentHash,
      reference_number: referenceNumber || null,
      issuer_name: issuerName || null,
      valid_until: validUntil,
      verified_at: now,
      verified_by: officerId,
      notes: notes || null
    };
    partner.authority_verified_at = now;
    partner.authority_verified_by = officerId;

    // Transition partner status if in INTEREST_CONFIRMED
    if (partner.status === PARTNER_STATUS.INTEREST_CONFIRMED) {
      await this.updatePartnerStatus(partnerId, PARTNER_STATUS.AUTHORITY_VERIFIED, {
        actorId: officerId,
        reason: `Authority verified via ${evidenceType} (${referenceNumber || documentHash.slice(0, 8)})`
      });
    }

    return partner;
  }

  /**
   * Records agreed commercial terms and pilot scope.
   */
  static async recordAgreedTerms(partnerId, {
    consignmentCommissionPct = 6.0,
    agreedTransferMechanisms = ['PHYSICAL_WRISTBAND'],
    agreementDocHash,
    settlementTiming = 'POST_GATE_ADMISSION',
    officerId = 'admin-1'
  }) {
    const partner = this.getPartnerById(partnerId);
    if (!partner) {
      const err = new Error(`Partner '${partnerId}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }

    if (partner.status !== PARTNER_STATUS.AUTHORITY_VERIFIED && partner.status !== PARTNER_STATUS.TERMS_AGREED) {
      const err = new Error(`Partner authority must be verified before agreeing terms (Current: ${partner.status})`);
      err.code = 'AUTHORITY_NOT_VERIFIED';
      throw err;
    }

    const now = new Date().toISOString();
    partner.commercial_terms = {
      consignment_commission_pct: consignmentCommissionPct,
      settlement_timing: settlementTiming,
      agreed_at: now,
      agreed_by: officerId
    };
    partner.agreed_transfer_mechanisms = agreedTransferMechanisms;
    partner.agreement_doc_hash = agreementDocHash;
    partner.agreement_signed_at = now;

    if (partner.status === PARTNER_STATUS.AUTHORITY_VERIFIED) {
      await this.updatePartnerStatus(partnerId, PARTNER_STATUS.TERMS_AGREED, {
        actorId: officerId,
        reason: 'Commercial consignment terms and transfer protocols finalized'
      });
    }

    return partner;
  }

  /**
   * Registers a proposed consignment inventory batch (5–10 tickets for controlled pilot).
   */
  static async registerConsignedInventory({
    partnerId,
    eventId,
    ticketCategory,
    quantity,
    faceValue,
    consignmentPrice,
    transferMethod,
    seatOrSectionDetails = [],
    evidenceBundleId = null,
    officerId = 'admin-1'
  }) {
    const partner = this.getPartnerById(partnerId);
    if (!partner) {
      const err = new Error(`Partner '${partnerId}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }

    // Verify event exists and is upcoming
    const event = (state.events || []).find(e => e.id === eventId || e.event_id === eventId);
    if (!event) {
      const err = new Error(`Event '${eventId}' not found in canonical registry`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    const { EventTemporalLifecycleEngine } = require('../discovery/EventTemporalLifecycleEngine');
    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, new Date());
    if (!isUpcoming) {
      const err = new Error(`Cannot consign inventory for non-upcoming or concluded event '${eventId}'`);
      err.code = 'EVENT_NOT_UPCOMING';
      throw err;
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      const err = new Error('Quantity must be a positive integer');
      err.code = 'INVALID_QUANTITY';
      throw err;
    }

    // Gating: Partner must be at least AUTHORITY_VERIFIED or PILOT_APPROVED to propose verified inventory
    const isAuthorized = [PARTNER_STATUS.AUTHORITY_VERIFIED, PARTNER_STATUS.TERMS_AGREED, PARTNER_STATUS.PILOT_APPROVED].includes(partner.status);
    const initialStatus = isAuthorized ? INVENTORY_STATUS.VERIFIED : INVENTORY_STATUS.PROPOSED;

    const inventoryId = `inv-bat-${uuidv4()}`;
    const now = new Date().toISOString();

    const batch = {
      id: inventoryId,
      inventory_id: inventoryId,
      partner_id: partnerId,
      partner_name: partner.business_name,
      event_id: eventId,
      event_title: event.name || event.title || event.canonical_name,
      ticket_category: ticketCategory,
      quantity: parsedQty,
      available_quantity: parsedQty,
      allocated_quantity: 0,
      face_value: parseInt(faceValue, 10),
      consignment_price: parseInt(consignmentPrice, 10),
      transfer_method: transferMethod,
      seat_or_section_details: seatOrSectionDetails,
      evidence_bundle_id: evidenceBundleId,
      status: initialStatus,
      created_at: now,
      updated_at: now
    };

    const inventories = this.getInventoryCollection();
    inventories.push(batch);

    await recordAuditLog('CONSIGNED_INVENTORY', inventoryId, 'CONSIGNED_INVENTORY_REGISTRATION', officerId, {
      partner_id: partnerId,
      event_id: eventId,
      quantity: parsedQty,
      status: initialStatus
    });

    return batch;
  }

  static getPartnerById(partnerId) {
    const partners = this.getPartnerCollection();
    return partners.find(p => p.id === partnerId || p.partner_id === partnerId) || null;
  }

  static listPartners(filter = {}) {
    let partners = [...this.getPartnerCollection()];
    if (filter.status) {
      partners = partners.filter(p => p.status === filter.status);
    }
    if (filter.partnerType) {
      partners = partners.filter(p => p.partner_type === filter.partnerType);
    }
    if (filter.region) {
      partners = partners.filter(p => p.geographic_coverage.some(r => r.toLowerCase().includes(filter.region.toLowerCase())));
    }
    return partners;
  }

  static getInventoryForEvent(eventId) {
    const inventories = this.getInventoryCollection();
    return inventories.filter(i => i.event_id === eventId);
  }

  static getInventoryById(inventoryId) {
    const inventories = this.getInventoryCollection();
    return inventories.find(i => i.id === inventoryId || i.inventory_id === inventoryId) || null;
  }

  /**
   * Promotes an inventory batch to VERIFIED once partner authority is confirmed.
   */
  static async verifyConsignedBatch(inventoryId, { officerId = 'admin-1', notes = null } = {}) {
    const batch = this.getInventoryById(inventoryId);
    if (!batch) {
      const err = new Error(`Inventory batch '${inventoryId}' not found`);
      err.code = 'INVENTORY_NOT_FOUND';
      throw err;
    }

    const partner = this.getPartnerById(batch.partner_id);
    if (!partner) {
      const err = new Error(`Partner '${batch.partner_id}' not found for inventory batch`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }

    const isAuthorized = [PARTNER_STATUS.AUTHORITY_VERIFIED, PARTNER_STATUS.TERMS_AGREED, PARTNER_STATUS.PILOT_APPROVED].includes(partner.status);
    if (!isAuthorized) {
      const err = new Error(`Cannot verify inventory batch: partner status is '${partner.status}' (must be AUTHORITY_VERIFIED or higher)`);
      err.code = 'PARTNER_AUTHORITY_REQUIRED';
      throw err;
    }

    batch.status = INVENTORY_STATUS.VERIFIED;
    batch.updated_at = new Date().toISOString();
    if (notes) {
      batch.verification_notes = notes;
    }

    await recordAuditLog('CONSIGNED_INVENTORY', inventoryId, 'CONSIGNED_INVENTORY_VERIFIED', officerId, {
      partner_id: batch.partner_id,
      notes
    });

    return batch;
  }

  /**
   * Allocates tickets from an authorized consignment batch to a marketplace listing.
   * Enforces strict inventory availability and prevents over-allocation.
   */
  static async allocateInventoryItem(inventoryId, { quantity = 1, listingId = null, actorId = 'system' } = {}) {
    const batch = this.getInventoryById(inventoryId);
    if (!batch) {
      const err = new Error(`Inventory batch '${inventoryId}' not found`);
      err.code = 'INVENTORY_NOT_FOUND';
      throw err;
    }

    if (batch.status !== INVENTORY_STATUS.VERIFIED && batch.status !== INVENTORY_STATUS.LISTED) {
      const err = new Error(`Cannot allocate from batch in status '${batch.status}'`);
      err.code = 'INVENTORY_NOT_LISTABLE';
      throw err;
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      const err = new Error('Allocation quantity must be a positive integer');
      err.code = 'INVALID_QUANTITY';
      throw err;
    }

    if (batch.available_quantity < parsedQty) {
      const err = new Error(`Insufficient inventory in batch: requested ${parsedQty}, available ${batch.available_quantity}`);
      err.code = 'INSUFFICIENT_INVENTORY';
      err.availableQuantity = batch.available_quantity;
      throw err;
    }

    batch.available_quantity -= parsedQty;
    batch.allocated_quantity += parsedQty;
    batch.status = batch.available_quantity === 0 ? INVENTORY_STATUS.EXHAUSTED : INVENTORY_STATUS.LISTED;
    batch.updated_at = new Date().toISOString();

    if (listingId) {
      batch.allocated_listings = batch.allocated_listings || [];
      batch.allocated_listings.push({
        listing_id: listingId,
        quantity: parsedQty,
        allocated_at: new Date().toISOString()
      });
    }

    await recordAuditLog('CONSIGNED_INVENTORY', inventoryId, 'INVENTORY_ALLOCATION', actorId, {
      allocated_quantity: parsedQty,
      remaining_available: batch.available_quantity,
      listing_id: listingId
    });

    return batch;
  }

  /**
   * Generates a consolidated summary report of partner validation and consignment inventory.
   */
  static getConsignmentReport() {
    const partners = this.getPartnerCollection();
    const inventories = this.getInventoryCollection();

    const byStatus = {};
    for (const p of partners) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    }

    let totalConsigned = 0;
    let totalAvailable = 0;
    let totalAllocated = 0;

    for (const inv of inventories) {
      totalConsigned += inv.quantity || 0;
      totalAvailable += inv.available_quantity || 0;
      totalAllocated += inv.allocated_quantity || 0;
    }

    return {
      total_partners: partners.length,
      partners_by_status: byStatus,
      total_inventories: inventories.length,
      total_tickets_consigned: totalConsigned,
      total_tickets_available: totalAvailable,
      total_tickets_allocated: totalAllocated,
      partners: partners.map(p => ({
        id: p.id,
        business_name: p.business_name,
        partner_type: p.partner_type,
        status: p.status,
        geographic_coverage: p.geographic_coverage,
        authority_evidence: p.authority_evidence ? {
          type: p.authority_evidence.evidence_type,
          verified_at: p.authority_evidence.verified_at
        } : null
      }))
    };
  }
}

module.exports = {
  PartnerValidationService,
  PARTNER_TYPES,
  PARTNER_STATUS,
  INVENTORY_STATUS,
  ALLOWED_PARTNER_TRANSITIONS
};
