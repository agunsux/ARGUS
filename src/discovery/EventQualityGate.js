/**
 * TIKUM / ARGUS — Event Quality Gate & Truth Engine
 * 
 * Deterministic Backend Quality Gate enforcing:
 * - Canonical verification states: DISCOVERED, NORMALIZED, VERIFIED, UNVERIFIED, CONFLICT, EXPIRED, REJECTED
 * - Valid state transitions (rejects illegal state jumps)
 * - Deterministic event_quality_score (0 - 100)
 * - Authoritative marketplace_eligibility: ELIGIBLE, CONDITIONALLY_ELIGIBLE, UNVERIFIED, BLOCKED
 * 
 * Strict boundary: Discovery & Supply -> Event Truth -> Marketplace.
 * UI logic is NOT allowed to independently decide event truth.
 */

const { sourceRegistry, TRUST_LEVELS } = require('./SourceRegistry');

const CANONICAL_STATES = {
  DISCOVERED: 'DISCOVERED',
  NORMALIZED: 'NORMALIZED',
  VERIFIED: 'VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
  CONFLICT: 'CONFLICT',
  EXPIRED: 'EXPIRED',
  REJECTED: 'REJECTED'
};

const MARKETPLACE_ELIGIBILITY = {
  ELIGIBLE: 'ELIGIBLE',
  CONDITIONALLY_ELIGIBLE: 'CONDITIONALLY_ELIGIBLE',
  UNVERIFIED: 'UNVERIFIED',
  BLOCKED: 'BLOCKED'
};

/**
 * Valid allowed state transitions:
 * DISCOVERED -> NORMALIZED, REJECTED
 * NORMALIZED -> VERIFIED (with authoritative evidence), UNVERIFIED (lacks Tier 1), CONFLICT (disagreements), REJECTED
 * UNVERIFIED -> VERIFIED (only after authoritative Tier 1 evidence added), CONFLICT, EXPIRED, REJECTED
 * CONFLICT -> VERIFIED (only after conflict resolved with authoritative evidence), REJECTED, EXPIRED
 * EXPIRED -> VERIFIED (only after fresh authoritative observation), REJECTED
 * VERIFIED -> CONFLICT, EXPIRED, REJECTED
 * REJECTED -> Terminal. Must NEVER silently re-enter canonical marketplace!
 */
const ALLOWED_TRANSITIONS = {
  [CANONICAL_STATES.DISCOVERED]: new Set([
    CANONICAL_STATES.NORMALIZED,
    CANONICAL_STATES.REJECTED
  ]),
  [CANONICAL_STATES.NORMALIZED]: new Set([
    CANONICAL_STATES.VERIFIED,
    CANONICAL_STATES.UNVERIFIED,
    CANONICAL_STATES.CONFLICT,
    CANONICAL_STATES.REJECTED
  ]),
  [CANONICAL_STATES.UNVERIFIED]: new Set([
    CANONICAL_STATES.VERIFIED,
    CANONICAL_STATES.CONFLICT,
    CANONICAL_STATES.EXPIRED,
    CANONICAL_STATES.REJECTED
  ]),
  [CANONICAL_STATES.CONFLICT]: new Set([
    CANONICAL_STATES.VERIFIED,
    CANONICAL_STATES.EXPIRED,
    CANONICAL_STATES.REJECTED
  ]),
  [CANONICAL_STATES.EXPIRED]: new Set([
    CANONICAL_STATES.VERIFIED,
    CANONICAL_STATES.REJECTED
  ]),
  [CANONICAL_STATES.VERIFIED]: new Set([
    CANONICAL_STATES.CONFLICT,
    CANONICAL_STATES.EXPIRED,
    CANONICAL_STATES.REJECTED
  ]),
  [CANONICAL_STATES.REJECTED]: new Set([
    // Terminal state. No silent re-entry.
  ])
};

class EventQualityGate {
  /**
   * Validates state transition according to Epic A invariants.
   * Throws on illegal state jump.
   */
  static validateTransition(currentState, nextState, context = {}) {
    const from = (currentState || CANONICAL_STATES.DISCOVERED).toUpperCase();
    const to = nextState.toUpperCase();

    if (from === to) {
      return true;
    }

    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed || !allowed.has(to)) {
      const err = new Error(
        `Illegal event state transition: cannot jump from '${from}' to '${to}'. ` +
        (from === CANONICAL_STATES.REJECTED ? 'REJECTED events must never silently re-enter the canonical marketplace.' : '')
      );
      err.code = 'ILLEGAL_STATE_TRANSITION';
      err.fromState = from;
      err.toState = to;
      throw err;
    }

    // Specific transition requirements:
    if (to === CANONICAL_STATES.VERIFIED) {
      if (from === CANONICAL_STATES.CONFLICT && !context.hasResolvedConflict) {
        const err = new Error('Cannot transition from CONFLICT to VERIFIED without formal conflict resolution evidence.');
        err.code = 'UNRESOLVED_CONFLICT_GUARD';
        throw err;
      }
      if (from === CANONICAL_STATES.EXPIRED && !context.isFreshObservation) {
        const err = new Error('Cannot transition from EXPIRED to VERIFIED without fresh authoritative observation.');
        err.code = 'EXPIRED_REQUIRES_FRESH_PROOF';
        throw err;
      }
      if (!context.hasAuthoritativeEvidence && !context.hasTier1Source) {
        const err = new Error('Cannot transition to VERIFIED without authoritative Tier 1 evidence or promoter verification.');
        err.code = 'AUTHORITATIVE_EVIDENCE_REQUIRED';
        throw err;
      }
    }

    return true;
  }

  /**
   * Deterministic Evaluation of Event Quality and Marketplace Eligibility.
   * Exposes event_quality_score (0-100) and marketplace_eligibility.
   */
  static evaluateEventQuality(canonicalEvent, sources = []) {
    let score = 0;
    const qualityFactors = [];
    const blockReasons = [];

    if (!canonicalEvent || typeof canonicalEvent !== 'object') {
      return {
        event_quality_score: 0,
        marketplace_eligibility: MARKETPLACE_ELIGIBILITY.BLOCKED,
        quality_factors: ['INVALID_EVENT_OBJECT'],
        block_reasons: ['Event object is null or invalid']
      };
    }

    // Factor 1: Valid Event Identity (Title) - up to 20 pts
    const title = canonicalEvent.title || canonicalEvent.name || canonicalEvent.canonical_name;
    if (title && typeof title === 'string' && title.trim().length >= 3) {
      score += 20;
      qualityFactors.push('VALID_IDENTITY');
    } else {
      blockReasons.push('Event title is missing or too short');
    }

    // Factor 2: Temporal Sanity & Date/Time - up to 20 pts
    const startDate = canonicalEvent.start_date || canonicalEvent.date;
    if (startDate) {
      const parsedDate = new Date(startDate);
      if (!isNaN(parsedDate.getTime())) {
        score += 15;
        qualityFactors.push('VALID_DATE');

        // Check if event is in the future
        const now = Date.now();
        const eventTime = parsedDate.getTime();
        if (eventTime > now - 24 * 60 * 60 * 1000) {
          score += 5;
          qualityFactors.push('TEMPORAL_FUTURE_ACTIVE');
        } else {
          qualityFactors.push('TEMPORAL_PAST');
        }
      } else {
        blockReasons.push('Event start date is malformed or invalid');
      }
    } else {
      blockReasons.push('Event start date is required');
    }

    // Factor 3: Spatial Authority (Venue & City) - up to 20 pts
    const venue = canonicalEvent.venue || canonicalEvent.venue_name;
    const city = canonicalEvent.city || canonicalEvent.venue_city;
    if (venue && venue.trim().length > 2) {
      score += 10;
      qualityFactors.push('VALID_VENUE');
    } else {
      blockReasons.push('Event venue is required for secondary trust');
    }
    if (city && city.trim().length > 2) {
      score += 10;
      qualityFactors.push('VALID_CITY');
    } else {
      blockReasons.push('Event city is required');
    }

    // Factor 4: Provenance & Freshness - up to 20 pts
    const eventSources = Array.isArray(sources) && sources.length > 0
      ? sources
      : (Array.isArray(canonicalEvent.sources) ? canonicalEvent.sources : []);

    let hasTier1 = false;
    let hasTier2 = false;

    for (const src of eventSources) {
      const meta = sourceRegistry.getSource(src.source_id) || {};
      const tier = src.tier || meta.tier || 2;
      if (tier === 1 || meta.trust_level === TRUST_LEVELS.TIER_1) {
        hasTier1 = true;
      } else if (tier === 2 || meta.trust_level === TRUST_LEVELS.TIER_2) {
        hasTier2 = true;
      }
    }

    if (hasTier1) {
      score += 20;
      qualityFactors.push('AUTHORITATIVE_TIER_1_SOURCE');
    } else if (hasTier2) {
      score += 12;
      qualityFactors.push('COMMERCIAL_TIER_2_SOURCE');
    } else if (eventSources.length > 0) {
      score += 5;
      qualityFactors.push('COMMUNITY_TIER_3_SOURCE');
    } else {
      blockReasons.push('Zero provenance sources recorded');
    }

    // Check Freshness / Expiration
    if (canonicalEvent.expires_at) {
      const expiresTime = new Date(canonicalEvent.expires_at).getTime();
      if (Date.now() > expiresTime) {
        blockReasons.push('Verification proof has expired (stale observation)');
        qualityFactors.push('PROOF_EXPIRED');
      } else {
        qualityFactors.push('PROOF_FRESH');
      }
    }

    // Factor 5: Conflict & Status Check - up to 20 pts
    const conflicts = Array.isArray(canonicalEvent.conflicts) ? canonicalEvent.conflicts : [];
    const hasUnresolvedConflict = conflicts.some(c => !c.resolved && c.status !== 'RESOLVED');

    if (hasUnresolvedConflict) {
      blockReasons.push('Unresolved critical conflict exists across observation sources');
      qualityFactors.push('CRITICAL_CONFLICT_PRESENT');
    } else {
      score += 20;
      qualityFactors.push('NO_UNRESOLVED_CONFLICTS');
    }

    // Explicit Status Overrides
    const status = (canonicalEvent.status || canonicalEvent.event_status || '').toUpperCase();
    if (status === 'CANCELLED') {
      blockReasons.push('Event has been cancelled by organizer');
    }

    // Determine Marketplace Eligibility
    let eligibility;
    if (blockReasons.length > 0 || status === 'CANCELLED') {
      eligibility = MARKETPLACE_ELIGIBILITY.BLOCKED;
    } else if (hasTier1 && score >= 80) {
      eligibility = MARKETPLACE_ELIGIBILITY.ELIGIBLE;
    } else if (hasTier2 && score >= 60) {
      eligibility = MARKETPLACE_ELIGIBILITY.CONDITIONALLY_ELIGIBLE;
    } else {
      eligibility = MARKETPLACE_ELIGIBILITY.UNVERIFIED;
    }

    return {
      event_quality_score: Math.min(100, Math.max(0, score)),
      marketplace_eligibility: eligibility,
      quality_factors: qualityFactors,
      block_reasons: blockReasons,
      evaluated_at: new Date().toISOString()
    };
  }
}

module.exports = {
  EventQualityGate,
  CANONICAL_STATES,
  MARKETPLACE_ELIGIBILITY,
  ALLOWED_TRANSITIONS
};
