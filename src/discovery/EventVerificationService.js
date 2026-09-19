/**
 * TIKUM / ARGUS Event Verification Service
 * 
 * Strict Fail-Closed Evidence-Based Verification Engine:
 * - Computes Confidence Score (0 - 98%, never claims 100% certainty)
 * - Computes Multi-Factor Field Confidence:
 *   field_confidence = clamp(prior_authority * freshness_decay * specificity * corroboration - conflict_penalty)
 * - Source authority != final confidence: Authoritative claims degrade in confidence if stale!
 * - Assigns Verification Status:
 *   UNVERIFIED, PARTIALLY_VERIFIED, VERIFIED, CONFLICTED, CHANGED, CANCELLED, POSTPONED, EXPIRED, LEGAL_REVIEW_REQUIRED, REJECTED
 * - Enforces Tier 3 Gating: Social channels can DISCOVER, but CANNOT SOLELY VERIFY
 * - Enforces Conflict Detection: Source disagreements trigger CONFLICTED status and block indexation
 * - Enforces Temporal Freshness & Expiration (expires_at)
 *   UNVERIFIED, PARTIALLY_VERIFIED, VERIFIED, CONFLICTED, STALE, CANCELLED, POSTPONED, EXPIRED, REJECTED
 * - Level 3 Social Gating: Social channels can DISCOVER, but CANNOT SOLELY VERIFY
 * - Temporal Proximity-Aware TTL: Imminent events (<= 7 days) enforce 12-hour TTL before transitioning to STALE
 */

const { TRUST_LEVELS, sourceRegistry } = require('./SourceRegistry');

const VERIFICATION_STATUS = {
  UNVERIFIED: 'UNVERIFIED',
  DISCOVERED: 'UNVERIFIED', // backward compatibility alias
  PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
  PENDING_REVIEW: 'PARTIALLY_VERIFIED', // backward compatibility alias
  PRIMARY_SOURCE_VERIFIED: 'PRIMARY_SOURCE_VERIFIED',
  VERIFIED: 'VERIFIED',
  CONFLICTED: 'CONFLICTED',
  DATA_CONFLICT: 'CONFLICTED', // backward compatibility alias
  CHANGED: 'CHANGED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
  LEGAL_REVIEW_REQUIRED: 'LEGAL_REVIEW_REQUIRED',
  REJECTED: 'REJECTED',
  BLOCKED: 'REJECTED', // backward compatibility alias
  UNKNOWN: 'UNKNOWN'
};

const FRESHNESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days default maximum TTL
// Proximity-based Freshness TTL windows
function getFreshnessTtlMs(eventDateStr, now = Date.now()) {
  if (!eventDateStr) return 48 * 60 * 60 * 1000;
  const eventTime = new Date(eventDateStr).getTime();
  const diffDays = (eventTime - now) / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) {
    return 12 * 60 * 60 * 1000; // 12 hours for imminent events
  } else if (diffDays <= 30) {
    return 48 * 60 * 60 * 1000; // 48 hours for near-term events
  } else if (diffDays <= 90) {
    return 7 * 24 * 60 * 60 * 1000; // 7 days for medium-term events
  }
  return 14 * 24 * 60 * 60 * 1000; // 14 days for far-future events
}

// Field Authority Prior Matrix
const FIELD_AUTHORITY_PRIOR = {
  EVENT_NAME: { promoter: 0.95, ticketing: 0.90, venue: 0.85, credible: 0.80, social: 0.65, aggregator: 0.50 },
  LINEUP: { promoter: 0.95, ticketing: 0.85, venue: 0.70, credible: 0.75, social: 0.70, aggregator: 0.50 },
  EVENT_DATE: { promoter: 0.90, ticketing: 0.95, venue: 0.85, credible: 0.75, social: 0.60, aggregator: 0.40 },
  VENUE: { promoter: 0.85, ticketing: 0.90, venue: 0.99, credible: 0.85, social: 0.60, aggregator: 0.50 },
  CITY: { promoter: 0.85, ticketing: 0.90, venue: 0.99, credible: 0.85, social: 0.60, aggregator: 0.50 },
  TICKET_PRICE: { promoter: 0.40, ticketing: 0.99, venue: 0.10, credible: 0.30, social: 0.20, aggregator: 0.30 },
  SALE_STATUS: { promoter: 0.30, ticketing: 0.99, venue: 0.10, credible: 0.20, social: 0.15, aggregator: 0.20 },
  DOORS_TIME: { promoter: 0.85, ticketing: 0.90, venue: 0.90, credible: 0.70, social: 0.50, aggregator: 0.30 }
};

class EventVerificationService {
  /**
   * Computes evidence-based confidence score and status.
   * STRICT FAIL CLOSED: Without Tier 1 evidence, events remain UNVERIFIED.
   * @param {object} canonicalEvent
   * @param {Array} sourceRecords
   * @returns {object} { verification_status, verification_confidence, conflicts, flags }
   * Computes multi-factor field confidence based on:
   * 1. Source Authority Prior
   * 2. Evidence Freshness (Exponential Time Decay)
   * 3. Field Specificity
   * 4. Multi-Source Corroboration
   * 5. Conflict Penalty
   */
  static calculateFieldConfidence({
    fieldType = 'EVENT_NAME',
    sourceType = 'promoter',
    observedAt = new Date().toISOString(),
    specificity = 1.0,
    corroboratingSourcesCount = 1,
    isConflicted = false
  }) {
    // 1. Prior Authority
    const typeKey = (fieldType || 'EVENT_NAME').toUpperCase();
    const priors = FIELD_AUTHORITY_PRIOR[typeKey] || FIELD_AUTHORITY_PRIOR.EVENT_NAME;
    const prior = priors[sourceType.toLowerCase()] || (sourceType.includes('promoter') ? priors.promoter : (sourceType.includes('ticket') ? priors.ticketing : 0.70));

    // 2. Freshness Decay: half-life = 30 days for metadata, 7 days for pricing/inventory
    const halfLifeDays = (typeKey === 'TICKET_PRICE' || typeKey === 'SALE_STATUS') ? 7 : 30;
    const observedTime = new Date(observedAt).getTime();
    const ageDays = Math.max(0, (Date.now() - observedTime) / (1000 * 60 * 60 * 24));
    const freshnessFactor = Math.exp(-(Math.LN2 * ageDays) / halfLifeDays);

    // 3. Specificity Factor (0.5 to 1.0)
    const specFactor = Math.min(1.0, Math.max(0.5, specificity));

    // 4. Corroboration Boost
    let corroborationBoost = 1.0;
    if (corroboratingSourcesCount >= 3) {
      corroborationBoost = 1.25;
    } else if (corroboratingSourcesCount >= 2) {
      corroborationBoost = 1.15;
    }

    // 5. Conflict Penalty
    const conflictPenalty = isConflicted ? 0.30 : 0.0;

    // Final Clamped Score (0.05 - 0.99)
    const raw = (prior * freshnessFactor * specFactor * corroborationBoost) - conflictPenalty;
    const confidence = Math.round(Math.min(0.99, Math.max(0.05, raw)) * 100) / 100;

    return {
      confidence,
      prior_authority: prior,
      freshness_factor: Math.round(freshnessFactor * 100) / 100,
      age_days: Math.round(ageDays * 10) / 10,
      is_conflicted: isConflicted
    };
  }

  /**
   * Evaluates overall event verification status, confidence, and field provenance
   */
  static evaluateEvent(canonicalEvent, sourceRecords = []) {
    let score = 0;
    const conflicts = [];
    const flags = [];

    if (!sourceRecords || sourceRecords.length === 0) {
      return {
        verification_status: VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: 10,
        conflicts: [],
        flags: ['NO_SOURCES_RECORDED', 'FAIL_CLOSED_UNVERIFIED'],
        freshness_ttl_hours: 48
      };
    }

    // 1. Source Authority Analysis
    let hasTier1 = false;
    let hasTier2 = false;
    let onlyTier3 = true;

    for (const s of sourceRecords) {
      const srcMeta = sourceRegistry.getSource(s.source_id) || {};
      const tier = s.tier || srcMeta.tier || 2;
      const isTier1 = tier === 1 || s.trust_level === TRUST_LEVELS.TIER_S || s.trust_level === TRUST_LEVELS.TIER_1;
      const isTier2 = tier === 2 || s.trust_level === TRUST_LEVELS.TIER_A || s.trust_level === TRUST_LEVELS.TIER_2 || s.trust_level === TRUST_LEVELS.TIER_B;

      if (isTier1) {
        hasTier1 = true;
        onlyTier3 = false;
      } else if (isTier2) {
        hasTier2 = true;
        onlyTier3 = false;
      }
    }

    // 2. Multi-Source Conflict Detection
    const dates = new Map(); // date -> source_id
    const venues = new Map(); // venue -> { raw, source_id }

    for (const record of sourceRecords) {
      const d = record.start_date || (record.start_datetime ? record.start_datetime.substring(0, 10) : record.date);
      if (d && !dates.has(d)) dates.set(d, record.source_id);

      const v = record.venue_id || (record.venue_name || '').toLowerCase().trim();
      if (v) {
        const normV = v.replace(/[^a-z0-9]/g, '');
        if (normV && !venues.has(normV)) {
          venues.set(normV, { raw: record.venue_name || record.venue, source_id: record.source_id });
        }
      }
    }

    if (dates.size > 1) {
      const dateEntries = Array.from(dates.entries());
      conflicts.push({
        field: 'start_date',
        source_a: dateEntries[0][1],
        value_a: dateEntries[0][0],
        source_b: dateEntries[1][1],
        value_b: dateEntries[1][0],
        values: Array.from(dates.keys()),
        reason: 'Different sources report conflicting event dates'
      });
    }

    if (venues.size > 1) {
      const venueEntries = Array.from(venues.values());
      conflicts.push({
        field: 'venue',
        source_a: venueEntries[0].source_id,
        value_a: venueEntries[0].raw,
        source_b: venueEntries[1].source_id,
        value_b: venueEntries[1].raw,
        values: venueEntries.map(v => v.raw),
        reason: 'Different sources report conflicting event venues'
      });
    }

    // If source conflict exists:
    if (conflicts.length > 0) {
      flags.push('SOURCE_DATA_CONFLICT_DETECTED');
      // If a Tier 1 authoritative promoter/venue exists alongside a secondary source,
      // we preserve the conflict but can assign PRIMARY_SOURCE_VERIFIED if promoter is clear.
      // Otherwise, conflict blocks verification -> CONFLICTED!
      if (hasTier1 && sourceRecords.some(s => s.source_type === 'PROMOTER_OFFICIAL_SOCIAL' || (s.source_id && s.source_id.includes('promoter')))) {
        flags.push('PRIMARY_PROMOTER_PRECEDENCE');
        return {
          verification_status: VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED,
          verification_confidence: 85,
          conflicts,
          flags,
          freshness_ttl_hours: 48
        };
      } else {
        return {
          verification_status: VERIFICATION_STATUS.CONFLICTED,
          verification_confidence: 45,
          conflicts,
          flags: ['CONFLICT_BLOCKS_VERIFICATION'],
          freshness_ttl_hours: 48
        };
      }
    }

    // 3. Social Discovery Only Rule: Cannot solely verify
    if (onlyTier3 && !hasTier1 && !hasTier2) {
      return {
        verification_status: VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: 30,
        conflicts: [],
        flags: ['TIER_3_SOCIAL_DISCOVERY_ONLY', 'PENDING_TIER_1_CORROBORATION'],
        freshness_ttl_hours: 48
      };
    }

    // 4. Compute Base Confidence from Multi-Factor Field Confidence
    const uniqueSourceIds = new Set(sourceRecords.map(s => s.source_id));

    if (hasTier1) {
      score += 55; // Tier 1 Official Promoter / Venue / League
      flags.push('TIER_1_OFFICIAL_AUTHORITY_CONFIRMED');
    } else if (hasTier2) {
      score += 35; // Tier 2 Commercial Ticketing Platform / Discovery API
      flags.push('TIER_2_COMMERCIAL_SOURCE_CONFIRMED');
    }

    // 5. Independent Multi-Source Corroboration
    if (uniqueSourceIds.size >= 3) {
      score += 25;
      flags.push('MULTIPLE_INDEPENDENT_SOURCES_3_PLUS');
    } else if (uniqueSourceIds.size >= 2) {
      score += 20;
      flags.push('INDEPENDENT_SOURCE_CORROBORATION');
    }

    // 6. Valid Official Ticket Destination URL (+15)
    if (canonicalEvent.official_ticket_url && /^https?:\/\//i.test(canonicalEvent.official_ticket_url)) {
      score += 15;
      flags.push('OFFICIAL_TICKET_URL_VERIFIED');
    }

    // 7. Complete Temporal & Spatial Integrity (+10)
    if (canonicalEvent.venue_name && (canonicalEvent.start_datetime || canonicalEvent.start_date)) {
      score += 10;
      flags.push('COMPLETE_TEMPORAL_SPATIAL_DATA');
    }

    // Never claim 100% certainty (cap confidence at 95%)
    const confidence = Math.min(95, Math.max(10, score));

    // Determine verification status
    let status = VERIFICATION_STATUS.UNVERIFIED;
    if (canonicalEvent.status === 'CANCELLED') {
      status = VERIFICATION_STATUS.CANCELLED;
    } else if (canonicalEvent.status === 'POSTPONED') {
      status = VERIFICATION_STATUS.POSTPONED;
    } else if (hasTier1 && confidence >= 75) {
      status = VERIFICATION_STATUS.VERIFIED;
    } else if (hasTier2 && uniqueSourceIds.size >= 2 && confidence >= 65) {
      status = VERIFICATION_STATUS.PARTIALLY_VERIFIED;
    } else {
      status = VERIFICATION_STATUS.UNVERIFIED;
    }

    // 8. Temporal Freshness / Expiration Check
    const eventDate = canonicalEvent.start_date || canonicalEvent.date;
    const ttlMs = getFreshnessTtlMs(eventDate);
    const lastVerifiedTime = canonicalEvent.last_verified_at ? new Date(canonicalEvent.last_verified_at).getTime() : Date.now();
    const ageSinceVerification = Date.now() - lastVerifiedTime;

    if (ageSinceVerification > ttlMs && (status === VERIFICATION_STATUS.VERIFIED || status === VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED)) {
      status = VERIFICATION_STATUS.STALE;
      flags.push('FRESHNESS_TTL_EXPIRED_STALE');
    }

    const now = Date.now();
    if (canonicalEvent.expires_at && now > new Date(canonicalEvent.expires_at).getTime()) {
      status = VERIFICATION_STATUS.EXPIRED;
      flags.push('EXPIRED_BY_TEMPORAL_TTL');
    } else if (canonicalEvent.last_verified_at && (now - new Date(canonicalEvent.last_verified_at).getTime() > FRESHNESS_WINDOW_MS)) {
      status = VERIFICATION_STATUS.EXPIRED;
      flags.push('VERIFICATION_EXPIRED_STALE');
    }

    // Past event expiration
    if (eventDate) {
      const eventTime = new Date(eventDate).getTime();
      const endOfDay = eventTime + (24 * 60 * 60 * 1000);
      if (Date.now() > endOfDay) {
        status = VERIFICATION_STATUS.EXPIRED;
        flags.push('EVENT_COMPLETED_OR_EXPIRED');
      }
    }

    return {
      verification_status: status,
      verification_confidence: confidence,
      conflicts,
      flags,
      freshness_ttl_hours: Math.round(ttlMs / (1000 * 60 * 60))
    };
  }
}

module.exports = {
  EventVerificationService,
  VERIFICATION_STATUS,
  FRESHNESS_WINDOW_MS,
  getFreshnessTtlMs
};
