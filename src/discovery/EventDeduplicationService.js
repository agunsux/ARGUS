/**
 * ARGUS Event Deduplication Service
 * 
 * Deterministic + Probabilistic Duplicate Detection.
 * Groups multiple independent source records into ONE Canonical Event.
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
   * Deterministic duplicate key.
   * e.g., slug + date or venue_id + date + normalized_name
   */
  static buildDeterministicKey(event) {
    const normName = EventNormalizationService.normalizeTitle(event.canonical_name || event.name || event.title).toLowerCase();
    const date = event.start_date || (event.start_datetime ? event.start_datetime.substring(0, 10) : event.date) || '';
    const venue = event.venue_id || (event.venue_name || event.venue || '').toLowerCase().trim();
    return `${normName}::${venue}::${date}`;
  }

  /**
   * Evaluates if incoming event source record matches an existing canonical event.
   * Returns: { isMatch: boolean, confidence: number, matchReason: string, canonicalEvent: object|null }
   */
  static findDuplicateCandidate(incomingRecord, existingCanonicalEvents) {
    const incomingNormTitle = EventNormalizationService.normalizeTitle(incomingRecord.name || incomingRecord.title || incomingRecord.canonical_name);
    const incomingDate = incomingRecord.start_date || (incomingRecord.start_datetime ? incomingRecord.start_datetime.substring(0, 10) : incomingRecord.date);
    const incomingVenue = incomingRecord.venue_id || (incomingRecord.venue_name || incomingRecord.venue || '').toLowerCase().trim();

    for (const canonical of existingCanonicalEvents) {
      // 1. External Source ID Match (if from same source)
      if (canonical.sources && Array.isArray(canonical.sources)) {
        const matchingSource = canonical.sources.find(s => 
          s.source_id === incomingRecord.source_id && 
          s.source_event_identifier && 
          s.source_event_identifier === incomingRecord.source_event_identifier
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

      // 2. Exact Deterministic Match (Name + Venue + Date)
      const canonicalDate = canonical.start_date || (canonical.start_datetime ? canonical.start_datetime.substring(0, 10) : canonical.date);
      const canonicalVenue = canonical.venue_id || (canonical.venue_name || canonical.venue || '').toLowerCase().trim();
      const canonicalNormTitle = EventNormalizationService.normalizeTitle(canonical.canonical_name || canonical.name || canonical.title);

      if (incomingDate && canonicalDate && incomingDate === canonicalDate) {
        // Same date: check venue and title
        const isSameVenue = (incomingRecord.venue_id && canonical.venue_id && incomingRecord.venue_id === canonical.venue_id) ||
                            (incomingVenue && canonicalVenue && (incomingVenue.includes(canonicalVenue) || canonicalVenue.includes(incomingVenue)));

        const titleSim = this.calculateTokenSimilarity(incomingNormTitle, canonicalNormTitle);

        // Exact match
        if (isSameVenue && incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase()) {
          return {
            isMatch: true,
            confidence: 98,
            matchReason: 'EXACT_VENUE_DATE_AND_TITLE',
            canonicalEvent: canonical
          };
        }

        // Fuzzy match on same venue & same date with >= 50% token overlap
        // e.g. "Persib vs Persija" vs "Persib Bandung vs Persija Jakarta"
        if (isSameVenue && titleSim >= 0.4) {
          return {
            isMatch: true,
            confidence: Math.round(75 + titleSim * 20),
            matchReason: `HIGH_TOKEN_SIMILARITY_SAME_VENUE (${Math.round(titleSim * 100)}%)`,
            canonicalEvent: canonical
          };
        }

        // Artist overlap match on same date & same city
        if (incomingRecord.artists && canonical.artists && Array.isArray(incomingRecord.artists) && Array.isArray(canonical.artists)) {
          const commonArtists = incomingRecord.artists.filter(a => 
            canonical.artists.some(ca => ca.toLowerCase() === a.toLowerCase())
          );
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

      // 3. Conflict Detection: Same Title & Venue with Different Dates (Section 22: DATA_CONFLICT)
      const incomingVenueName = (incomingRecord.venue_name || incomingRecord.venue || '').toLowerCase().trim();
      const canonicalVenueName = (canonical.venue_name || canonical.venue || '').toLowerCase().trim();
      const isSameVenue = (incomingRecord.venue_id && canonical.venue_id && incomingRecord.venue_id === canonical.venue_id) ||
                          (incomingVenueName && canonicalVenueName && (incomingVenueName.includes(canonicalVenueName) || canonicalVenueName.includes(incomingVenueName))) ||
                          (incomingVenue && canonicalVenue && (incomingVenue.includes(canonicalVenue) || canonicalVenue.includes(incomingVenue)));
      const titleSim = this.calculateTokenSimilarity(incomingNormTitle, canonicalNormTitle);

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

      // 4. "Follow the Promoter": Same Title & City Updates (Venue Change or Reschedule)
      const isSameCity = (incomingRecord.city && canonical.city && 
                          incomingRecord.city.toLowerCase().trim() === canonical.city.toLowerCase().trim()) ||
                         (!incomingRecord.city || !canonical.city);
      const isExactTitle = incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase();
      const isHighTitleSim = titleSim >= 0.8;

      if (isSameCity && (isExactTitle || isHighTitleSim)) {
        // Same date, different venue in same city -> Venue Move
        if (incomingDate && canonicalDate && incomingDate === canonicalDate) {
          return {
            isMatch: true,
            confidence: 92,
            matchReason: 'VENUE_MOVE_SAME_DATE',
            canonicalEvent: canonical
          };
        }

        // Same exact event in same city with conflicting date -> Date Conflict / Reschedule
        if (isExactTitle && incomingDate && canonicalDate && incomingDate !== canonicalDate) {
          return {
            isMatch: true,
            confidence: 88,
            matchReason: 'SOURCE_DATE_CONFLICT_SAME_EVENT_IN_CITY',
            canonicalEvent: canonical
          };
        }

        // Same organizer/promoter updating date or venue -> Promoter Event Update / Reschedule
        const isSameOrganizer = (incomingRecord.organizer_name && canonical.organizer_name &&
                                incomingRecord.organizer_name.toLowerCase() === canonical.organizer_name.toLowerCase());
        const isSameSource = incomingRecord.source_id && canonical.sources && 
                             canonical.sources.some(s => s.source_id === incomingRecord.source_id);

        if (isSameOrganizer || isSameSource || isSameVenue) {
          return {
            isMatch: true,
            confidence: 90,
            matchReason: 'PROMOTER_EVENT_UPDATE_RESCHEDULE',
            canonicalEvent: canonical
          };
        }
      }
    }

    return {
      isMatch: false,
      confidence: 0,
      matchReason: 'NO_MATCH',
      canonicalEvent: null
    };
  }
}

module.exports = {
  EventDeduplicationService
};
