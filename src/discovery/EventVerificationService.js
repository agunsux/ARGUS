/**
 * TIKUM / ARGUS Event Verification Service
 * 
 * Strict Fail-Closed Evidence-Based Verification Engine:
 * - Computes Confidence Score (0 - 98%, never claims 100% certainty)
 * - Assigns Verification Status:
 *   UNVERIFIED, PARTIALLY_VERIFIED, VERIFIED, CONFLICTED, CHANGED, CANCELLED, POSTPONED, EXPIRED, LEGAL_REVIEW_REQUIRED, REJECTED
 * - Enforces Tier 3 Gating: Social channels can DISCOVER, but CANNOT SOLELY VERIFY
 * - Enforces Conflict Detection: Source disagreements trigger CONFLICTED status and block indexation
 * - Enforces Temporal Freshness & Expiration (expires_at)
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
  EXPIRED: 'EXPIRED',
  STALE: 'EXPIRED', // backward compatibility alias
  LEGAL_REVIEW_REQUIRED: 'LEGAL_REVIEW_REQUIRED',
  REJECTED: 'REJECTED',
  BLOCKED: 'REJECTED', // backward compatibility alias
  UNKNOWN: 'UNKNOWN'
};

const FRESHNESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days default maximum TTL

class EventVerificationService {
  /**
   * Computes evidence-based confidence score and status.
   * STRICT FAIL CLOSED: Without Tier 1 evidence, events remain UNVERIFIED.
   * @param {object} canonicalEvent
   * @param {Array} sourceRecords
   * @returns {object} { verification_status, verification_confidence, conflicts, flags }
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
        flags: ['NO_SOURCES_RECORDED', 'FAIL_CLOSED_UNVERIFIED']
      };
    }

    // 1. Check Source Authority Tiers
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

    // 2. Conflict Detection across distinct sources
    const dates = new Map(); // date -> source_id
    const venues = new Map(); // venue -> source_id

    for (const record of sourceRecords) {
      const d = record.start_date || (record.start_datetime ? record.start_datetime.substring(0, 10) : record.date);
      if (d && !dates.has(d)) dates.set(d, record.source_id);

      const v = record.venue_id || (record.venue_name || '').toLowerCase().trim();
      if (v) {
        // Strip common whitespace/punctuation for canonical alias matching
        const normalizedKey = v.replace(/[^a-z0-9]/g, '');
        if (normalizedKey && !venues.has(normalizedKey)) {
          venues.set(normalizedKey, { raw: record.venue_name || record.venue, source_id: record.source_id });
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
      if (hasTier1 && sourceRecords.some(s => s.source_type === 'PROMOTER_OFFICIAL_SOCIAL' || s.source_id.includes('promoter'))) {
        flags.push('PRIMARY_PROMOTER_PRECEDENCE');
        return {
          verification_status: VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED,
          verification_confidence: 85,
          conflicts,
          flags
        };
      } else {
        return {
          verification_status: VERIFICATION_STATUS.CONFLICTED,
          verification_confidence: 45,
          conflicts,
          flags: ['CONFLICT_BLOCKS_VERIFICATION']
        };
      }
    }

    // 3. TIER 3 ONLY DISCOVERY RULE:
    // Social channels can discover, but CANNOT solely verify!
    if (onlyTier3 && !hasTier1 && !hasTier2) {
      return {
        verification_status: VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: 30,
        conflicts: [],
        flags: ['TIER_3_SOCIAL_DISCOVERY_ONLY', 'PENDING_TIER_1_CORROBORATION']
      };
    }

    // 4. Source Tier Base Scoring
    if (hasTier1) {
      score += 55; // Tier 1 Official Promoter / Venue / League
      flags.push('TIER_1_OFFICIAL_AUTHORITY_CONFIRMED');
    } else if (hasTier2) {
      score += 35; // Tier 2 Commercial Ticketing Platform / Discovery API
      flags.push('TIER_2_COMMERCIAL_SOURCE_CONFIRMED');
    }

    // 5. Independent Multi-Source Corroboration
    const uniqueSourceIds = new Set(sourceRecords.map(s => s.source_id));
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
    if (status === VERIFICATION_STATUS.VERIFIED || status === VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED) {
      const now = Date.now();
      if (canonicalEvent.expires_at && now > new Date(canonicalEvent.expires_at).getTime()) {
        status = VERIFICATION_STATUS.EXPIRED;
        flags.push('EXPIRED_BY_TEMPORAL_TTL');
      } else if (canonicalEvent.last_verified_at) {
        const lastVerifTime = new Date(canonicalEvent.last_verified_at).getTime();
        if (now - lastVerifTime > FRESHNESS_WINDOW_MS) {
          status = VERIFICATION_STATUS.EXPIRED;
          flags.push('VERIFICATION_EXPIRED_STALE');
        }
      }
    }

    return {
      verification_status: status,
      verification_confidence: confidence,
      conflicts,
      flags
    };
  }
}

module.exports = {
  EventVerificationService,
  VERIFICATION_STATUS,
  FRESHNESS_WINDOW_MS
};
