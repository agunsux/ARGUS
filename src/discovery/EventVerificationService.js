/**
 * ARGUS Event Verification Service
 * 
 * Evidence-Based Verification Engine:
 * - Computes Confidence Score (0 - 100)
 * - Assigns Verification Status (DISCOVERED, PENDING_REVIEW, VERIFIED, STALE, CANCELLED, BLOCKED, DATA_CONFLICT)
 * - Detects source conflicts (e.g., date mismatch) and marks DATA_CONFLICT
 * - Detects stale events past freshness window
 */

const { TRUST_LEVELS } = require('./SourceRegistry');

const VERIFICATION_STATUS = {
  DISCOVERED: 'DISCOVERED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  STALE: 'STALE',
  CANCELLED: 'CANCELLED',
  BLOCKED: 'BLOCKED',
  DATA_CONFLICT: 'DATA_CONFLICT'
};

const FRESHNESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

class EventVerificationService {
  /**
   * Computes evidence-based confidence score and status.
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
        verification_status: VERIFICATION_STATUS.DISCOVERED,
        verification_confidence: 20,
        conflicts: [],
        flags: ['NO_SOURCES_RECORDED']
      };
    }

    // 1. Conflict Detection between independent sources
    const dates = new Set();
    const venues = new Set();

    for (const record of sourceRecords) {
      const d = record.start_date || (record.start_datetime ? record.start_datetime.substring(0, 10) : record.date);
      if (d) dates.add(d);

      const v = record.venue_id || (record.venue_name || '').toLowerCase().trim();
      if (v) venues.add(v);
    }

    if (dates.size > 1) {
      conflicts.push({
        field: 'start_date',
        values: Array.from(dates),
        reason: 'Different sources report conflicting event dates'
      });
    }

    if (venues.size > 1) {
      // Check if they are truly different or aliases handled by normalization
      const uniqueNormalizedVenues = new Set(
        Array.from(venues).map(v => v.replace(/[^a-z0-9]/g, ''))
      );
      if (uniqueNormalizedVenues.size > 1) {
        conflicts.push({
          field: 'venue',
          values: Array.from(venues),
          reason: 'Different sources report conflicting event venues'
        });
      }
    }

    // If source conflict exists, do NOT silently publish as VERIFIED!
    if (conflicts.length > 0) {
      return {
        verification_status: VERIFICATION_STATUS.DATA_CONFLICT,
        verification_confidence: 50,
        conflicts,
        flags: ['SOURCE_DATA_CONFLICT_DETECTED']
      };
    }

    // 2. Source Tier Scoring
    const hasTier1 = sourceRecords.some(s => s.trust_level === TRUST_LEVELS.TIER_1);
    const hasTier2 = sourceRecords.some(s => s.trust_level === TRUST_LEVELS.TIER_2);
    const hasTier3 = sourceRecords.some(s => s.trust_level === TRUST_LEVELS.TIER_3);

    if (hasTier1) {
      score += 45; // Official Organizer, Venue, or League
      flags.push('TIER_1_OFFICIAL_AUTHORITY_CONFIRMED');
    } else if (hasTier2) {
      score += 35; // Established ticketing platform
      flags.push('TIER_2_TICKETING_PLATFORM_CONFIRMED');
    } else if (hasTier3) {
      score += 20; // Government calendar
      flags.push('TIER_3_GOVERNMENT_CALENDAR');
    } else {
      score += 10; // Community / social
      flags.push('TIER_5_COMMUNITY_SUBMISSION');
    }

    // 3. Independent Source Confirmation (+25 for 2+ distinct sources)
    const uniqueSourceIds = new Set(sourceRecords.map(s => s.source_id));
    if (uniqueSourceIds.size >= 3) {
      score += 30;
      flags.push('MULTIPLE_INDEPENDENT_SOURCES_3_PLUS');
    } else if (uniqueSourceIds.size >= 2) {
      score += 25;
      flags.push('INDEPENDENT_SOURCE_CORROBORATION');
    }

    // 4. Official Ticket URL validity (+15)
    if (canonicalEvent.official_ticket_url && /^https?:\/\//i.test(canonicalEvent.official_ticket_url)) {
      score += 15;
      flags.push('OFFICIAL_TICKET_URL_VERIFIED');
    }

    // 5. Venue and Date integrity (+15)
    if (canonicalEvent.venue_name && canonicalEvent.start_datetime) {
      score += 15;
      flags.push('COMPLETE_TEMPORAL_SPATIAL_DATA');
    }

    // Cap at 100
    const confidence = Math.min(100, Math.max(0, score));

    // Determine status based on confidence & source rules
    let status = VERIFICATION_STATUS.DISCOVERED;
    if (canonicalEvent.status === 'CANCELLED') {
      status = VERIFICATION_STATUS.CANCELLED;
    } else if (confidence >= 80) {
      status = VERIFICATION_STATUS.VERIFIED;
    } else if (confidence >= 60) {
      status = VERIFICATION_STATUS.PENDING_REVIEW;
    } else {
      status = VERIFICATION_STATUS.DISCOVERED;
    }

    // Check freshness
    if (status === VERIFICATION_STATUS.VERIFIED && canonicalEvent.last_verified_at) {
      const lastVerifTime = new Date(canonicalEvent.last_verified_at).getTime();
      const now = Date.now();
      if (now - lastVerifTime > FRESHNESS_WINDOW_MS) {
        status = VERIFICATION_STATUS.STALE;
        flags.push('VERIFICATION_EXPIRED_STALE');
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
  VERIFICATION_STATUS
};
