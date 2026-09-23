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
   * Evaluates overall event verification status, confidence, and field provenance.
   * Core Invariant: NO SOURCE EVIDENCE = NO PUBLIC EVENT.
   */
  static evaluateEvent(canonicalEvent, sourceRecords = []) {
    let score = 0;
    const conflicts = [];
    const flags = [];

    // Missing required fields fail-closed immediately (DO NOT GUESS)
    // Missing temporal anchor fails closed immediately (DO NOT GUESS)
    const eventDate = canonicalEvent.start_date || canonicalEvent.date || canonicalEvent.start_datetime;
    const eventCity = canonicalEvent.venue_city || canonicalEvent.city;
    const hasEventData = canonicalEvent && Object.keys(canonicalEvent).length > 0;
    if (hasEventData && !eventDate) {
      return {
        verification_status: VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: 0,
        conflicts: [],
        flags: ['MISSING_REQUIRED_EVENT_DATA', 'FAIL_CLOSED_UNVERIFIED'],
        freshness_ttl_hours: 48
      };
    }
    if (!eventCity) {
      flags.push('MISSING_CITY_DATA');
    }

    if (!sourceRecords || sourceRecords.length === 0) {
      return {
        verification_status: VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: 10,
        conflicts: [],
        flags: ['NO_SOURCES_RECORDED', 'FAIL_CLOSED_UNVERIFIED'],
        freshness_ttl_hours: 48
      };
    }

    // 1. Authoritative Source Analysis (Official Promoter, Artist, Event - Web or Verified IG)
    // Authority is resolved EXCLUSIVELY through the SourceRegistry authority boundary.
    // Caller-provided tier/trust flags on the observation are NOT trusted on their own.
    let hasAuthoritative = false;
    let hasAuthoritativeSocial = false;
    let hasTier1 = false;
    let hasTier2 = false;

    for (const s of sourceRecords) {
      const account = s.account_handle || s.source_account || s.canonical_account;
      const srcMeta = sourceRegistry.getSource(s.source_id) || {};
      const isAuth = sourceRegistry.isAuthoritativeSource(s.source_id, account);
      if (isAuth) {
        hasAuthoritative = true;
        hasTier1 = true;
        const srcType = String(s.source_type || srcMeta.source_type || '').toUpperCase();
        if (srcType.includes('IG') || srcType.includes('SOCIAL')) {
          hasAuthoritativeSocial = true;
        }
        continue;
      }
      const tier = srcMeta.tier || s.tier || 2;
      if (tier === 1) {
        // Tier 1 claim without a verified registry registration: NOT authoritative.
        flags.push('UNREGISTERED_TIER_1_SOURCE_IGNORED');
      } else if (tier === 2 || s.trust_level === TRUST_LEVELS.TIER_A || s.trust_level === TRUST_LEVELS.TIER_2 || s.trust_level === TRUST_LEVELS.TIER_B) {
        hasTier2 = true;
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
      const authDates = new Map();
      for (const [d, sid] of dates.entries()) {
        if (sourceRegistry.isAuthoritativeSource(sid)) authDates.set(d, sid);
      }

      if (authDates.size > 1) {
        // Two authoritative sources report conflicting dates -> CONFLICTED!
        const dateEntries = Array.from(authDates.entries());
        conflicts.push({
          field: 'start_date',
          source_a: dateEntries[0][1],
          value_a: dateEntries[0][0],
          source_b: dateEntries[1][1],
          value_b: dateEntries[1][0],
          values: Array.from(authDates.keys()),
          reason: 'Different authoritative sources report conflicting event dates'
        });
      } else if (authDates.size === 1) {
        // Authoritative source takes precedence over secondary
        flags.push('AUTHORITATIVE_PROMOTER_PRECEDENCE_DATE');
      } else {
        const dateEntries = Array.from(dates.entries());
        conflicts.push({
          field: 'start_date',
          source_a: dateEntries[0][1],
          value_a: dateEntries[0][0],
          source_b: dateEntries[1][1],
          value_b: dateEntries[1][0],
          values: Array.from(dates.keys()),
          reason: 'Conflicting dates reported by discovery sources'
        });
      }
    }

    if (venues.size > 1) {
      const authVenues = new Map();
      for (const [normV, item] of venues.entries()) {
        if (sourceRegistry.isAuthoritativeSource(item.source_id)) authVenues.set(normV, item);
      }

      if (authVenues.size > 1) {
        const venueEntries = Array.from(authVenues.values());
        conflicts.push({
          field: 'venue',
          source_a: venueEntries[0].source_id,
          value_a: venueEntries[0].raw,
          source_b: venueEntries[1].source_id,
          value_b: venueEntries[1].raw,
          values: venueEntries.map(v => v.raw),
          reason: 'Different authoritative sources report conflicting event venues'
        });
      } else if (authVenues.size === 1) {
        flags.push('AUTHORITATIVE_PROMOTER_PRECEDENCE_VENUE');
      } else {
        const venueEntries = Array.from(venues.values());
        conflicts.push({
          field: 'venue',
          source_a: venueEntries[0].source_id,
          value_a: venueEntries[0].raw,
          source_b: venueEntries[1].source_id,
          value_b: venueEntries[1].raw,
          values: venueEntries.map(v => v.raw),
          reason: 'Conflicting venues reported by discovery sources'
        });
      }
    }

    // If authoritative source conflict exists:
    if (conflicts.length > 0) {
      flags.push('AUTHORITATIVE_DATA_CONFLICT_DETECTED');
      return {
        verification_status: VERIFICATION_STATUS.CONFLICTED,
        verification_confidence: 45,
        conflicts,
        flags: ['CONFLICT_BLOCKS_VERIFICATION'],
        freshness_ttl_hours: 48
      };
    }

    // 3. Fail-Closed: Without authoritative source evidence, event CANNOT be VERIFIED
    if (!hasAuthoritative) {
      const isSocialTier3 = sourceRecords.some(s => (s.tier === 3 || s.trust_level === TRUST_LEVELS.TIER_5 || (s.source_id && s.source_id.includes('social'))));
      const failFlags = ['SECONDARY_SOURCES_ONLY_NO_AUTHORITATIVE_PROOF'];
      if (isSocialTier3) {
        failFlags.push('TIER_3_SOCIAL_DISCOVERY_ONLY');
      }
      const eventCountry = (canonicalEvent.country || 'Indonesia').toLowerCase();
      if (eventCountry === 'indonesia' || eventCountry === 'id') {
        failFlags.push('INDONESIA_LOCAL_AUTHORITY_REQUIRED');
      }
      return {
        verification_status: VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: Math.min(50, score || (isSocialTier3 ? 30 : 50)),
        conflicts: [],
        flags: failFlags,
        freshness_ttl_hours: 48
      };
    }

    // 3b. Indonesia Specific Rule:
    // IF country == Indonesia, local promoter / official event / official IG is required for primary verification.
    // Regional discovery signals (StubHub, Viagogo) cannot verify an Indonesian event.
    const eventCountry = (canonicalEvent.country || 'Indonesia').toLowerCase();
    if (eventCountry === 'indonesia' || eventCountry === 'id') {
      const hasLocalIndoAuthority = sourceRecords.some(s => {
        const srcMeta = sourceRegistry.getSource(s.source_id) || {};
        const isAuth = sourceRegistry.isAuthoritativeSource(s.source_id, s.account_handle || s.source_account);
        if (!isAuth) return false;
        const c = (srcMeta.country || s.country || '').toLowerCase();
        const isIndo = c === 'indonesia' || c === 'id';
        const isArtistDirect = (srcMeta.source_type || '').includes('ARTIST');
        return isIndo || isArtistDirect;
      });

      if (!hasLocalIndoAuthority) {
        return {
          verification_status: VERIFICATION_STATUS.UNVERIFIED,
          verification_confidence: 45,
          conflicts: [],
          flags: ['INDONESIA_LOCAL_AUTHORITY_REQUIRED', 'REGIONAL_RADAR_NOT_LOCAL_PROOF'],
          freshness_ttl_hours: 48
        };
      }
    }

    // 4. Compute Base Confidence
    const uniqueSourceIds = new Set(sourceRecords.map(s => s.source_id));

    if (hasAuthoritative) {
      score += 65; // Authoritative Promoter / Venue / League / Verified IG (registry-verified only)
      flags.push('AUTHORITATIVE_SOURCE_CONFIRMED');
      flags.push('TIER_1_OFFICIAL_AUTHORITY_CONFIRMED');
    } else if (hasTier2) {
      score += 35;
      flags.push('TIER_2_COMMERCIAL_SOURCE_CONFIRMED');
    }

    // 5. Corroboration Boost
    if (uniqueSourceIds.size >= 3) {
      score += 20;
      flags.push('MULTIPLE_INDEPENDENT_SOURCES_3_PLUS');
    } else if (uniqueSourceIds.size >= 2) {
      score += 15;
      flags.push('INDEPENDENT_SOURCE_CORROBORATION');
    }

    // 6. Valid Official Ticket Destination URL (+10)
    if (canonicalEvent.official_ticket_url && /^https?:\/\//i.test(canonicalEvent.official_ticket_url)) {
      score += 10;
      flags.push('OFFICIAL_TICKET_URL_VERIFIED');
    }

    // 7. Complete Temporal & Spatial Integrity (+10)
    if (canonicalEvent.venue_name && (canonicalEvent.start_datetime || canonicalEvent.start_date)) {
      score += 10;
      flags.push('COMPLETE_TEMPORAL_SPATIAL_DATA');
    }

    // Cap confidence at 95%
    let confidence = Math.min(95, Math.max(10, score));
    if (hasAuthoritativeSocial) {
      // Direct announcement from a verified official promoter/artist/event IG account
      // is primary evidence and carries high confidence even without corroboration.
      confidence = Math.min(95, Math.max(85, confidence));
    }

    // Determine verification status
    let status = VERIFICATION_STATUS.UNVERIFIED;
    if (canonicalEvent.status === 'CANCELLED') {
      status = VERIFICATION_STATUS.CANCELLED;
    } else if (canonicalEvent.status === 'POSTPONED') {
      status = VERIFICATION_STATUS.POSTPONED;
    } else if (hasAuthoritative && confidence >= 65) {
      // Direct official announcement from a verified IG / official event channel is a primary proof.
      status = hasAuthoritativeSocial
        ? VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED
        : VERIFICATION_STATUS.VERIFIED;
      if (hasAuthoritativeSocial) {
        flags.push('PRIMARY_SOURCE_SOCIAL_CONFIRMED');
      }
    } else {
      status = VERIFICATION_STATUS.UNVERIFIED;
    }

    // 8. Temporal Freshness / Stale Check
    const ttlMs = getFreshnessTtlMs(eventDate);
    const lastCheckedTime = canonicalEvent.source_last_checked_at
      ? new Date(canonicalEvent.source_last_checked_at).getTime()
      : (canonicalEvent.last_verified_at
        ? new Date(canonicalEvent.last_verified_at).getTime()
        : (canonicalEvent.verified_at ? new Date(canonicalEvent.verified_at).getTime() : 0));

    if (lastCheckedTime > 0) {
      const ageSinceCheck = Date.now() - lastCheckedTime;
      if (ageSinceCheck > ttlMs && (status === VERIFICATION_STATUS.VERIFIED || status === 'PRIMARY_SOURCE_VERIFIED')) {
        status = VERIFICATION_STATUS.STALE;
        flags.push('FRESHNESS_TTL_EXPIRED_STALE');
      }
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

  /**
   * Helper alias method for evaluateEvent returning status, is_verified, and reason string.
   */
  static verifyEventWithRules(canonicalEvent, sourceRecords = []) {
    const res = this.evaluateEvent(canonicalEvent, sourceRecords);
    return {
      ...res,
      status: res.verification_status,
      is_verified: res.verification_status === VERIFICATION_STATUS.VERIFIED || res.verification_status === 'PRIMARY_SOURCE_VERIFIED',
      reason: (res.flags || []).join(', ')
    };
  }
}

module.exports = {
  EventVerificationService,
  VERIFICATION_STATUS,
  FRESHNESS_WINDOW_MS,
  getFreshnessTtlMs
};
