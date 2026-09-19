/**
 * TIKUM / ARGUS Source Claim Model
 * 
 * Atomic representation of an individual factual assertion made by an external source.
 * Answers: WHO claims WHAT fact, at WHAT time, with WHAT evidence hash, and with WHAT authority.
 * 
 * Supports:
 * - Granular per-field provenance
 * - Multi-source conflict detection (never silently overwrite)
 * - Cryptographic evidence hashing
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const CLAIM_TYPES = {
  EVENT_NAME: 'EVENT_NAME',
  LINEUP: 'LINEUP',
  EVENT_DATE: 'EVENT_DATE',
  VENUE: 'VENUE',
  CITY: 'CITY',
  TICKET_PRICE: 'TICKET_PRICE',
  SALE_STATUS: 'SALE_STATUS',
  DOORS_TIME: 'DOORS_TIME',
  STATUS: 'STATUS'
};

class SourceClaim {
  constructor(data = {}) {
    this.claim_id = data.claim_id || `clm-${uuidv4().substring(0, 10)}`;
    this.source_id = data.source_id || 'src-unknown';
    this.source_url = data.source_url || null;
    this.canonical_event_id = data.canonical_event_id || null;
    this.claim_type = data.claim_type || CLAIM_TYPES.EVENT_NAME;
    this.value = data.value !== undefined ? data.value : null;
    this.observed_at = data.observed_at || new Date().toISOString();
    this.source_authority_tier = data.source_authority_tier !== undefined ? Number(data.source_authority_tier) : 2;
    this.raw_payload_snippet = data.raw_payload_snippet || null;
    
    // Deterministic cryptographic evidence fingerprint
    this.evidence_hash = data.evidence_hash || this.computeEvidenceHash();
  }

  /**
   * Computes SHA-256 over canonical claim tuple
   */
  computeEvidenceHash() {
    const payload = {
      source_id: this.source_id,
      claim_type: this.claim_type,
      value: this.value,
      observed_at: this.observed_at
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  isConflictingWith(otherClaim) {
    if (!otherClaim || otherClaim.claim_type !== this.claim_type) {
      return false;
    }
    
    // Stringify values for comparison
    const valA = JSON.stringify(this.value);
    const valB = JSON.stringify(otherClaim.value);
    
    return valA !== valB;
  }

  /**
   * Evaluates conflict details
   */
  conflictsWith(otherClaim) {
    const isConflict = this.isConflictingWith(otherClaim);
    return {
      isConflict,
      field: this.claim_type,
      source_a: this.source_id,
      source_b: otherClaim?.source_id,
      value_a: this.value,
      value_b: otherClaim?.value
    };
  }

  /**
   * Authority precedence comparison (Tier 1 > Tier 2 > Tier 3)
   */
  takesPrecedenceOver(otherClaim) {
    if (!otherClaim) return true;
    const tierA = this.source_authority_tier !== undefined ? Number(this.source_authority_tier) : 2;
    const tierB = otherClaim.source_authority_tier !== undefined ? Number(otherClaim.source_authority_tier) : 2;
    return tierA < tierB;
  }

  toJSON() {
    return {
      claim_id: this.claim_id,
      source_id: this.source_id,
      source_url: this.source_url,
      canonical_event_id: this.canonical_event_id,
      claim_type: this.claim_type,
      value: this.value,
      observed_at: this.observed_at,
      evidence_hash: this.evidence_hash,
      source_authority_tier: this.source_authority_tier,
      raw_payload_snippet: this.raw_payload_snippet
    };
  }
}

module.exports = {
  SourceClaim,
  CLAIM_TYPES
};
