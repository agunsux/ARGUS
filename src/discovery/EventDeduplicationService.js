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
 * - Multi-Night Residency Disambiguation:
 *   Distinct show dates (e.g. LANY 29 Oct vs 30 Oct at Indonesia Arena) are TWO SEPARATE canonical events!
 *   They MUST NOT collapse into one event.
 * - Multi-City Tour Disambiguation (Sheila on 7 in Bandung vs Pekanbaru vs Makassar)
 * - Multi-Hall Spatial Collision Prevention (Same venue + same date, distinct artists/halls)
 * - Conflict Detection & Non-Destructive Reconciliation
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
    const isExplicitReschedule = incomingRecord.status === 'RESCHEDULED' || incomingRecord.is_reschedule === true;

    for (const canonical of existingCanonicalEvents) {
      const canonicalDate = canonical.start_date || (canonical.start_datetime ? canonical.start_datetime.substring(0, 10) : canonical.date);
      const canonicalVenue = canonical.venue_id || (canonical.venue_name || canonical.venue || '').toLowerCase().trim();
      const canonicalCity = (canonical.city || canonical.venue_city || '').toLowerCase().trim();
      const canonicalNormTitle = EventNormalizationService.normalizeTitle(canonical.canonical_name || canonical.name || canonical.title);
      const canonicalArtists = (Array.isArray(canonical.artists) ? canonical.artists : (canonical.artist ? [canonical.artist] : [])).map(a => a.toLowerCase().trim());

      // ==========================================
      // 1. MULTI-CITY TOUR DISAMBIGUATION
      // Same artist in different cities on different dates are separate tour stops
      // ==========================================
      if (incomingCity && canonicalCity && incomingCity !== canonicalCity) {
        continue; // Different city -> distinct tour stop
      }

      // ==========================================
      // 2. EXACT EXTERNAL SOURCE IDENTIFIER MATCH
      // ==========================================
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

      const isSameDate = incomingDate && canonicalDate && incomingDate === canonicalDate;
      const isSameVenue = (incomingRecord.venue_id && canonical.venue_id && incomingRecord.venue_id === canonical.venue_id) ||
                          (incomingVenue && canonicalVenue && (incomingVenue.includes(canonicalVenue) || canonicalVenue.includes(incomingVenue)));
      const titleSim = this.calculateTokenSimilarity(incomingNormTitle, canonicalNormTitle);

      // ==========================================
      // 3. DATE DISCREPANCY vs MULTI-NIGHT RESIDENCY SEPARATION
      // CRITICAL INVARIANT: Distinct show dates for concerts (e.g. LANY 29 Oct vs 30 Oct)
      // MUST NOT collapse into one event unless explicitly marked as a RESCHEDULE!
      // ==========================================
      if (incomingDate && canonicalDate && incomingDate !== canonicalDate) {
        if (!isExplicitReschedule) {
          // Check for residency / multi-night indicators:
          const incomingHasResidency = hasResidencyIndicator(incomingNormTitle);
          const canonicalHasResidency = hasResidencyIndicator(canonicalNormTitle);
          const incomingDayNum = extractDayOrNight(incomingNormTitle);
          const canonicalDayNum = extractDayOrNight(canonicalNormTitle);

          // If day numbers differ (e.g. Day 1 vs Day 2) or residency tags indicate separate shows
          if ((incomingDayNum && canonicalDayNum && incomingDayNum !== canonicalDayNum) ||
              (incomingHasResidency && !canonicalHasResidency && incomingDayNum !== '1') ||
              (!incomingHasResidency && canonicalHasResidency && canonicalDayNum !== '1') ||
              (incomingHasResidency && canonicalHasResidency)) {
            continue; // Distinct residency show, do not collapse!
          }
        }
      }

      // ==========================================
      // 4. MULTI-HALL SPATIAL COLLISION DISAMBIGUATION
      // Same Venue + Same Date, but distinct non-overlapping acts in different halls
      // ==========================================
      if (isSameDate && isSameVenue && titleSim < 0.25) {
        const hasArtistOverlap = incomingArtists.length > 0 && canonicalArtists.length > 0 &&
          incomingArtists.some(ia => canonicalArtists.includes(ia));
        if (!hasArtistOverlap) {
          continue; // Two distinct events in different halls of the same venue on the same night!
        }
      }

      // ==========================================
      // 5. DETERMINISTIC & PROBABILISTIC MATCHING (SAME DATE)
      // ==========================================
      if (isSameDate) {
        // Exact match
        if (isSameVenue && incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase()) {
          return {
            isMatch: true,
            confidence: 98,
            matchReason: 'EXACT_VENUE_DATE_AND_TITLE',
            canonicalEvent: canonical
          };
        }

        // High token similarity on same venue
        if (isSameVenue && titleSim >= 0.4) {
          return {
            isMatch: true,
            confidence: Math.round(75 + titleSim * 20),
            matchReason: `HIGH_TOKEN_SIMILARITY_SAME_VENUE (${Math.round(titleSim * 100)}%)`,
            canonicalEvent: canonical
          };
        }

        // Artist overlap on same venue
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

        // Venue move or discrepancy in same city on same date
        const hasCommonArtist = incomingArtists.length > 0 && canonicalArtists.length > 0 &&
          incomingArtists.some(a => canonicalArtists.includes(a));

        if (isSameCityOrMetro(incomingCity, canonicalCity) && (incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase() || titleSim >= 0.6 || hasCommonArtist)) {
          return {
            isMatch: true,
            confidence: hasCommonArtist ? 88 : 92,
            matchReason: 'VENUE_MOVE_OR_DISCREPANCY_SAME_DATE',
            canonicalEvent: canonical
          };
        }
      }

      // ==========================================
      // 6. CONFLICT DETECTION: Same Title & Venue with Different Dates
      // ==========================================
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

      // ==========================================
      // 7. RESCHEDULE & SAME-CITY EVENT UPDATES (ACROSS DATES)
      // ==========================================
      const isExactTitle = incomingNormTitle.toLowerCase() === canonicalNormTitle.toLowerCase();
      const isHighTitleSim = titleSim >= 0.80;

      if (isSameCityOrMetro(incomingCity, canonicalCity) && (isExactTitle || isHighTitleSim)) {
        if (incomingDate && canonicalDate && incomingDate !== canonicalDate) {
          const isSameOrganizer = incomingRecord.organizer_name && canonical.organizer_name &&
            incomingRecord.organizer_name.toLowerCase().trim() === canonical.organizer_name.toLowerCase().trim();
          const isSameSource = incomingRecord.source_id && canonical.sources &&
            canonical.sources.some(s => s.source_id === incomingRecord.source_id);

          if (isExplicitReschedule || isSameOrganizer || isSameSource) {
            return {
              isMatch: true,
              confidence: isExplicitReschedule ? 95 : 88,
              matchReason: isExplicitReschedule ? 'EXPLICIT_RESCHEDULE_SAME_EVENT' : 'PROMOTER_EVENT_UPDATE_SAME_CITY',
              canonicalEvent: canonical
            };
          }

          if (isExactTitle) {
            return {
              isMatch: true,
              confidence: 88,
              matchReason: 'SOURCE_DATE_CONFLICT_SAME_EVENT_IN_CITY',
              canonicalEvent: canonical
            };
          }
        }
      }

      // 8. Multi-Day Festival Edition Match
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

      // 9. Ambiguous match check (quarantine signal)
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

function isSameCityOrMetro(cityA, cityB) {
  if (!cityA || !cityB) return true;
  const a = cityA.toLowerCase().trim();
  const b = cityB.toLowerCase().trim();
  return a === b || a.includes(b) || b.includes(a);
}

function hasResidencyIndicator(title) {
  if (!title) return false;
  return /(?:day|night|show|hari\s*ke|edition|part)\s*([0-9]+|one|two|three|satu|dua|tiga)|added\s*date|additional\s*(show|date)/i.test(title);
}

function extractDayOrNight(title) {
  if (!title) return null;
  const m = title.match(/(?:day|night|show|hari\s*ke-?)\s*([0-9]+)/i);
  return m ? m[1] : null;
}

module.exports = {
  EventDeduplicationService
};
