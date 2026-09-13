/**
 * TIKUM / ARGUS Event Deduplication Service
 * 
 * Multi-Factor Deterministic & Probabilistic Deduplication Engine:
 * - External Source Identifier matching
 * - Canonical slug and venue token matching
 * - Artist overlap and lineup resolution
 * - Reschedule and venue relocation tracking
 * - Multi-day festival topology resolution
 * - Spatial & entity collision prevention (Multi-hall, multi-city tours)
 * - Ambiguous match quarantine (REVIEW_REQUIRED)
 */

const { EventNormalizationService } = require('./EventNormalizationService');

class EventDeduplicationService {
  /**
   * Calculate Jaccard similarity between two token sets.
   */
  static calculateTokenSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const tokens1 = new Set(
      str1.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );
    const tokens2 = new Set(
      str2.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    let intersection = 0;
    for (const t of tokens1) {
      if (tokens2.has(t)) intersection++;
    }

    const union = tokens1.size + tokens2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Multi-factor deterministic duplicate key.
   */
  static buildDeterministicKey(event) {
    const normName = EventNormalizationService.normalizeTitle(event.canonical_name || event.name || event.title).toLowerCase().trim();
    const date = event.start_date || (event.start_datetime ? event.start_datetime.substring(0, 10) : event.date) || '';
    const venue = event.venue_id || (event.venue_name || event.venue || '').toLowerCase().trim();
    const city = (event.city || event.venue_city || '').toLowerCase().trim();
    return `${normName}::${venue}::${city}::${date}`;
  }

  /**
   * Evaluates if incoming event source record matches an existing canonical event.
   * Returns: { isMatch: boolean, confidence: number, matchReason: string, canonicalEvent: object|null, isAmbiguous?: boolean }
   */
  static findDuplicateCandidate(incomingRecord, existingCanonicalEvents) {
    const incomingNormTitle = EventNormalizationService.normalizeTitle(incomingRecord.name || incomingRecord.title || incomingRecord.canonical_name);
    const incomingDate = incomingRecord.start_date || (incomingRecord.start_datetime ? incomingRecord.start_datetime.substring(0, 10) : incomingRecord.date);
    const incomingVenue = incomingRecord.venue_id || (incomingRecord.venue_name || incomingRecord.venue || '').toLowerCase().trim();
    const incomingCity = (incomingRecord.city || incomingRecord.venue_city || '').toLowerCase().trim();
    const incomingArtists = (Array.isArray(incomingRecord.artists) ? incomingRecord.artists : (incomingRecord.artist ? [incomingRecord.artist] : [])).map(a => a.toLowerCase().trim());

    for (const canonical of existingCanonicalEvents) {
      // 1. External Source ID Match (exact match for same source)
      if (canonical.sources && Array.isArray(canonical.sources)) {
        const matchingSource = canonical.sources.find(s => 
          s.source_id === incomingRecord.source_id && 
          (s.source_event_identifier || s.source_event_id) && 
          (s.source_event_identifier || s.source_event_id) === (incomingRecord.source_event_identifier || incomingRecord.source_event_id)
        );
        if (matchingSource) {
          return {
            isMatch: true,
            confidence: 100,
            matchReason: 'EXACT_SOURCE_IDENTIFIER',
            canonicalEvent: canonical
          };
        }
      }

      const canonicalDate = canonical.start_date || (canonical.start_datetime ? canonical.start_datetime.substring(0, 10) : canonical.date);
      const canonicalVenue = canonical.venue_id || (canonical.venue_name || canonical.venue || '').toLowerCase().trim();
      const canonicalCity = (canonical.city || canonical.venue_city || '').toLowerCase().trim();
      const canonicalNormTitle = EventNormalizationService.normalizeTitle(canonical.canonical_name || canonical.name || canonical.title);
      const canonicalArtists = (Array.isArray(canonical.artists) ? canonical.artists : (canonical.artist ? [canonical.artist] : [])).map(a => a.toLowerCase().trim());

      // ==========================================
      // SPATIAL & ENTITY COLLISION PREVENTION
      // ==========================================

      // Collision Rule A: Multi-City Tour (Same Artist, Different Cities)
      // If same artist performs in Jakarta vs Singapore or Bandung on different dates, they are DISTINCT events!
      if (incomingCity && canonicalCity && incomingCity !== canonicalCity) {
        if (incomingDate !== canonicalDate) {
          continue; // Distinct tour stops, do NOT merge!
        }
      }

      // Collision Rule B: Multi-Hall Spatial Collision (Same Venue + Same Date, Distinct Artists)
      // e.g. Exhibition Hall A hosts Act 1, Exhibition Hall B hosts Act 2 on the same night
      const isSameDate = incomingDate && canonicalDate && incomingDate === canonicalDate;
      const isSameVenue = (incomingRecord.venue_id && canonical.venue_id && incomingRecord.venue_id === canonical.venue_id) ||
                          (incomingVenue && canonicalVenue && (incomingVenue.includes(canonicalVenue) || canonicalVenue.includes(incomingVenue)));

      const titleSim = this.calculateTokenSimilarity(incomingNormTitle, canonicalNormTitle);

      if (isSameDate && isSameVenue && titleSim < 0.25) {
        const hasArtistOverlap = incomingArtists.length > 0 && canonicalArtists.length > 0 &&
          incomingArtists.some(ia => canonicalArtists.includes(ia));
        if (!hasArtistOverlap) {
          continue; // Two distinct events in different halls of the same venue on the same night!
        }
      }

      // ==========================================
      // DETERMINISTIC & PROBABILISTIC MATCHING
      // ==========================================

      // 2. Exact Deterministic Match (Title + Venue + Date)
      if (isSameDate) {
        if (isSameVenue && incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase()) {
          return {
            isMatch: true,
            confidence: 98,
            matchReason: 'EXACT_VENUE_DATE_AND_TITLE',
            canonicalEvent: canonical
          };
        }

        // 3. High Token Similarity on Same Venue + Date (e.g. "Persib vs Persija" vs "Persib Bandung vs Persija Jakarta")
        if (isSameVenue && titleSim >= 0.4) {
          return {
            isMatch: true,
            confidence: Math.round(75 + titleSim * 20),
            matchReason: `HIGH_TOKEN_SIMILARITY_SAME_VENUE (${Math.round(titleSim * 100)}%)`,
            canonicalEvent: canonical
          };
        }

        // 4. Artist Overlap Match on Same Venue & Same Date
        if (incomingArtists.length > 0 && canonicalArtists.length > 0) {
          const commonArtists = incomingArtists.filter(a => canonicalArtists.includes(a));
          if (commonArtists.length > 0 && isSameVenue) {
            return {
              isMatch: true,
              confidence: 90,
              matchReason: `ARTIST_OVERLAP_SAME_VENUE (${commonArtists.join(', ')})`,
              canonicalEvent: canonical
            };
          }
        }
      }

      // 5. Conflict Detection: Same Title & Venue with Different Dates (Disagreement on date)
      if (isSameVenue && (incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase() || titleSim >= 0.75)) {
        if (incomingDate && canonicalDate && incomingDate !== canonicalDate) {
          return {
            isMatch: true,
            confidence: 85,
            matchReason: 'SOURCE_DATE_CONFLICT_SAME_EVENT',
            canonicalEvent: canonical
          };
        }
      }

      // 6. Reschedule & Venue Move Detection: Same Title & Same City
      const isSameCityOrMetro = (incomingCity && canonicalCity && (incomingCity === canonicalCity || incomingCity.includes(canonicalCity) || canonicalCity.includes(incomingCity))) ||
                                (!incomingCity || !canonicalCity);
      const isExactTitle = incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase();
      const isHighTitleSim = titleSim >= 0.8;

      if (isSameCityOrMetro && (isExactTitle || isHighTitleSim)) {
        // Same date, different venue in same city -> Venue Move
        if (isSameDate) {
          return {
            isMatch: true,
            confidence: 92,
            matchReason: 'VENUE_MOVE_SAME_DATE',
            canonicalEvent: canonical
          };
        }

        // Same exact event title in same city with different date -> Reschedule or Date Discrepancy
        if (isExactTitle && incomingDate && canonicalDate && incomingDate !== canonicalDate) {
          return {
            isMatch: true,
            confidence: 88,
            matchReason: 'SOURCE_DATE_CONFLICT_SAME_EVENT_IN_CITY',
            canonicalEvent: canonical
          };
        }

        // Same organizer/promoter updating date or venue
        const isSameOrganizer = incomingRecord.organizer_name && canonical.organizer_name &&
          incomingRecord.organizer_name.toLowerCase().trim() === canonical.organizer_name.toLowerCase().trim();
        const isSameSource = incomingRecord.source_id && canonical.sources && 
          canonical.sources.some(s => s.source_id === incomingRecord.source_id);

        if (isSameOrganizer || isSameSource) {
          return {
            isMatch: true,
            confidence: 86,
            matchReason: 'PROMOTER_EVENT_UPDATE_SAME_CITY',
            canonicalEvent: canonical
          };
        }
      }

      // 7. Multi-Day Festival Edition Match
      // e.g. "Pestapora 2026" (3-day) vs "Pestapora 2026 Day 1"
      if (titleSim >= 0.6 && isSameVenue) {
        const isMultiDayPass = /day\s*\d|daily\s*pass|3-day|weekend/i.test(incomingRecord.name || '');
        const isParentFestival = /day\s*\d|daily\s*pass|3-day|weekend/i.test(canonical.canonical_name || '') === false;
        if (isMultiDayPass && isParentFestival) {
          return {
            isMatch: true,
            confidence: 85,
            matchReason: 'FESTIVAL_DAILY_EDITION_ATTACHMENT',
            canonicalEvent: canonical
          };
        }
      }

      // 8. Ambiguous match check (quarantine signal)
      if (titleSim >= 0.45 && titleSim < 0.75 && isSameDate) {
        return {
          isMatch: false,
          isAmbiguous: true,
          confidence: Math.round(titleSim * 100),
          matchReason: `AMBIGUOUS_MATCH_REQUIRES_REVIEW (${Math.round(titleSim * 100)}% token similarity)`,
          canonicalEvent: canonical
        };
      }
    }

    return {
      isMatch: false,
      confidence: 0,
      matchReason: 'NO_MATCH_FOUND',
      canonicalEvent: null
    };
  }
}

module.exports = {
  EventDeduplicationService
};
