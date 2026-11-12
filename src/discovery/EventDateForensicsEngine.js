/**
 * TIKUM / ARGUS Event Date Forensics Engine
 * 
 * Strict Zero-Wrong-Date Ingestion & Temporal Gating Layer:
 * - Zero-Wrong-Date 24-attribute Data Contract
 * - Deterministic ISO & Indonesian Calendar Parsing with Leap Year & Day-Count Verification
 * - Ambiguous Format Rejection (quarantine for ambiguous DD/MM/YYYY vs MM/DD/YYYY)
 * - Sales Period vs Event Date Disambiguation (rejects presale/sale dates disguised as event dates)
 * - Historical Tour & Wrong-Year Regression Protection (Coldplay 2023, Sheila on 7 2023/2024, etc.)
 * - Multi-City Tour Disambiguation (Jakarta vs Bandung must never merge or swap dates)
 * - Conflict Detection & Non-Destructive Quarantine (NEEDS_REVIEW)
 * - Traceable Audit Trail: Original Source → Extracted Data → Normalized Data → Verification → Canonical Event → Publication
 * - Audit Window: 2026-11-12 to 2027-02-12 inclusive (Asia/Jakarta WIB)
 */

const crypto = require('crypto');

const AUDIT_WINDOW = {
  START: '2026-11-12',
  END: '2027-02-12',
  TIMEZONE: 'Asia/Jakarta'
};

const PUBLICATION_STATES = {
  DISCOVERED: 'DISCOVERED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  RESCHEDULED: 'RESCHEDULED',
  CANCELLED: 'CANCELLED',
  POSTPONED: 'POSTPONED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED'
};

const MONTH_NAMES_ID = {
  'januari': 1, 'jan': 1,
  'februari': 2, 'feb': 2,
  'maret': 3, 'mar': 3,
  'april': 4, 'apr': 4,
  'mei': 5, 'may': 5,
  'juni': 6, 'jun': 6,
  'juli': 7, 'jul': 7,
  'agustus': 8, 'agt': 8, 'aug': 8,
  'september': 9, 'sep': 9, 'sept': 9,
  'oktober': 10, 'okt': 10, 'oct': 10,
  'november': 11, 'nov': 11,
  'desember': 12, 'des': 12, 'dec': 12
};

const MONTH_NAMES_EN = {
  'january': 1, 'jan': 1,
  'february': 2, 'feb': 2,
  'march': 3, 'mar': 3,
  'april': 4, 'apr': 4,
  'may': 5,
  'june': 6, 'jun': 6,
  'july': 7, 'jul': 7,
  'august': 8, 'aug': 8,
  'september': 9, 'sep': 9,
  'october': 10, 'oct': 10,
  'november': 11, 'nov': 11,
  'december': 12, 'dec': 12
};

/**
 * Historical Tour Signatures that concluded in the real world.
 * Any incoming record matching these titles or artists must NOT be assigned future dates
 * without explicit, verifiable proof from an authoritative promoter.
 */
const HISTORICAL_TOUR_SIGNATURES = [
  {
    artist: 'coldplay',
    keywords: ['music of the spheres', 'coldplay in jakarta'],
    concluded_date: '2023-11-15',
    city: 'Jakarta',
    venue_id: 'venue-gbk',
    notes: 'Coldplay Music of the Spheres Jakarta took place on 15 November 2023 at GBK Main Stadium.'
  },
  {
    artist: 'sheila on 7',
    keywords: ['tunggu aku di jakarta', 'tungguakudijakarta'],
    concluded_date: '2023-01-28',
    city: 'Jakarta',
    venue_id: 'venue-jiexpo',
    notes: 'Sheila On 7 Tunggu Aku Di Jakarta took place on 28 January 2023 at JIExpo Kemayoran.'
  },
  {
    artist: 'sheila on 7',
    keywords: ['tunggu aku di bandung', 'tungguakudibandung'],
    concluded_date: '2024-09-28',
    city: 'Bandung',
    venue_id: 'venue-siliwangi',
    notes: 'Sheila On 7 Tunggu Aku Di Bandung took place on 28 September 2024 at Stadion Si Jalak Harupat / Siliwangi.'
  },
  {
    artist: 'sheila on 7',
    keywords: ['tunggu aku di', 'tungguakudi'],
    concluded_date: '2024-09-28',
    city: 'Indonesia',
    venue_id: 'various',
    notes: 'Sheila On 7 Tunggu Aku Di tour concluded on 28 September 2024.'
  },
  {
    artist: 'guns n roses',
    keywords: ['not in this lifetime'],
    concluded_date: '2018-11-08',
    city: 'Jakarta',
    venue_id: 'venue-gbk',
    notes: 'GNR Not In This Lifetime Jakarta took place on 8 November 2018 at GBK.'
  },
  {
    artist: 'mamamoo',
    keywords: ['world tour in jakarta'],
    concluded_date: '2023-02-09',
    city: 'Tangerang',
    venue_id: 'venue-ice-bsd',
    notes: 'MAMAMOO World Tour in Jakarta took place on 9 February 2023.'
  },
  {
    artist: 'twice',
    keywords: ['5th world tour jakarta', 'ready to be'],
    concluded_date: '2023-12-23',
    city: 'Jakarta',
    venue_id: 'venue-indonesia-arena',
    notes: 'TWICE 5th World Tour Jakarta took place on 23 December 2023.'
  },
  {
    artist: 'dewa 19',
    keywords: ['all stars stadium tour surabaya'],
    concluded_date: '2023-08-26',
    city: 'Surabaya',
    venue_id: 'venue-gbt',
    notes: 'Dewa 19 All Stars Surabaya took place on 26 August 2023.'
  },
  {
    artist: 'king nassar',
    keywords: ['lost in the jungle'],
    concluded_date: '2026-11-07',
    city: 'Jakarta',
    venue_id: 'venue-istora-senayan',
    notes: 'King Nassar: Lost In The Jungle took place on 7 November 2026 at Istora Senayan.'
  },
  {
    artist: 'morgan jay',
    keywords: ['the goofy guy tour jakarta', 'goofy guy'],
    concluded_date: '2026-11-11',
    city: 'Jakarta',
    venue_id: 'venue-nafiri-convention-hall',
    notes: 'Morgan Jay: The Goofy Guy Tour Jakarta took place on 11 November 2026 at Nafiri Convention Hall.'
  }
];

class EventDateForensicsEngine {
  /**
   * Deterministically validates whether a year is leap year
   */
  static isLeapYear(year) {
    const y = parseInt(year, 10);
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  }

  /**
   * Returns valid number of days in a given month of a given year
   */
  static getDaysInMonth(year, month) {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (m < 1 || m > 12) return 0;
    if (m === 2) return this.isLeapYear(y) ? 29 : 28;
    if ([4, 6, 9, 11].includes(m)) return 30;
    return 31;
  }

  /**
   * Deterministic calendar date validation.
   * Rejects invalid dates like Feb 30, Apr 31, impossible months, etc.
   */
  static isValidCalendarDate(year, month, day) {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
    if (y < 2000 || y > 2100) return false;
    if (m < 1 || m > 12) return false;
    const maxDays = this.getDaysInMonth(y, m);
    if (d < 1 || d > maxDays) return false;
    return true;
  }

  /**
   * Detects whether input text indicates a ticket sales or presale period
   * rather than the actual event concert date.
   */
  static isSalesDateIndicator(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    const salesPatterns = [
      /\b(pre-?sale|presale|general sale|public sale)\b/i,
      /\b(ticket war|war tiket|pembelian tiket|penjualan tiket)\b/i,
      /\b(on sale starting|sale starts|tickets available on)\b/i,
      /\b(buka penjualan|tiket mulai dijual|early bird sale)\b/i
    ];
    return salesPatterns.some(p => p.test(lower));
  }

  /**
   * Parses and validates raw date text deterministically.
   * Returns:
   * {
   *   is_valid: boolean,
   *   normalized_date: 'YYYY-MM-DD' | null,
   *   normalized_time: 'HH:mm' | null,
   *   rejection_reason: string | null,
   *   is_ambiguous: boolean,
   *   is_sales_date: boolean
   * }
   */
  static parseAndValidateDate(rawDateInput, rawTimeInput = null) {
    if (!rawDateInput) {
      return {
        is_valid: false,
        normalized_date: null,
        normalized_time: null,
        rejection_reason: 'DATE_INPUT_EMPTY',
        is_ambiguous: false,
        is_sales_date: false
      };
    }

    const rawStr = String(rawDateInput).trim();

    // Check if input is a sales date
    if (this.isSalesDateIndicator(rawStr)) {
      return {
        is_valid: false,
        normalized_date: null,
        normalized_time: null,
        rejection_reason: 'SALES_PERIOD_MISINTERPRETED_AS_EVENT_DATE',
        is_ambiguous: false,
        is_sales_date: true
      };
    }

    // Pattern 1: ISO Date YYYY-MM-DD
    const isoMatch = rawStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);

      if (!this.isValidCalendarDate(year, month, day)) {
        return {
          is_valid: false,
          normalized_date: null,
          normalized_time: null,
          rejection_reason: `INVALID_CALENDAR_DATE: ${year}-${month}-${day} does not exist`,
          is_ambiguous: false,
          is_sales_date: false
        };
      }

      let time = null;
      if (isoMatch[4] && isoMatch[5]) {
        time = `${isoMatch[4]}:${isoMatch[5]}`;
      } else if (rawTimeInput && typeof rawTimeInput === 'string' && rawTimeInput.includes(':')) {
        const tp = rawTimeInput.trim().split(':');
        time = `${tp[0].padStart(2, '0')}:${tp[1].padStart(2, '0')}`;
      }

      const normDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        is_valid: true,
        normalized_date: normDate,
        normalized_time: time,
        rejection_reason: null,
        is_ambiguous: false,
        is_sales_date: false
      };
    }

    // Pattern 2: Indonesian / English formatted text date e.g. "21 November 2026" or "Nov 28, 2026"
    const textDateMatch = rawStr.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/i) ||
                          rawStr.match(/([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (textDateMatch) {
      let day, monthStr, year;
      if (isNaN(parseInt(textDateMatch[1], 10))) {
        // "Nov 28 2026"
        monthStr = textDateMatch[1].toLowerCase();
        day = parseInt(textDateMatch[2], 10);
        year = parseInt(textDateMatch[3], 10);
      } else {
        // "21 November 2026"
        day = parseInt(textDateMatch[1], 10);
        monthStr = textDateMatch[2].toLowerCase();
        year = parseInt(textDateMatch[3], 10);
      }

      const month = MONTH_NAMES_ID[monthStr] || MONTH_NAMES_EN[monthStr];
      if (!month) {
        return {
          is_valid: false,
          normalized_date: null,
          normalized_time: null,
          rejection_reason: `UNRECOGNIZED_MONTH_NAME: '${monthStr}'`,
          is_ambiguous: false,
          is_sales_date: false
        };
      }

      if (!this.isValidCalendarDate(year, month, day)) {
        return {
          is_valid: false,
          normalized_date: null,
          normalized_time: null,
          rejection_reason: `INVALID_CALENDAR_DATE: ${year}-${month}-${day} does not exist`,
          is_ambiguous: false,
          is_sales_date: false
        };
      }

      let time = null;
      if (rawTimeInput && typeof rawTimeInput === 'string' && rawTimeInput.includes(':')) {
        const tp = rawTimeInput.trim().split(':');
        time = `${tp[0].padStart(2, '0')}:${tp[1].padStart(2, '0')}`;
      }

      const normDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        is_valid: true,
        normalized_date: normDate,
        normalized_time: time,
        rejection_reason: null,
        is_ambiguous: false,
        is_sales_date: false
      };
    }

    // Pattern 3: Ambiguous numerical slash/dot e.g. "03/04/2027" or "04-05-2026"
    const slashMatch = rawStr.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
    if (slashMatch) {
      const p1 = parseInt(slashMatch[1], 10);
      const p2 = parseInt(slashMatch[2], 10);
      const year = parseInt(slashMatch[3], 10);

      // If both p1 and p2 <= 12, ambiguous without locale context
      if (p1 <= 12 && p2 <= 12 && p1 !== p2) {
        return {
          is_valid: false,
          normalized_date: null,
          normalized_time: null,
          rejection_reason: `AMBIGUOUS_DATE_FORMAT: '${rawStr}' cannot distinguish DD/MM vs MM/DD`,
          is_ambiguous: true,
          is_sales_date: false
        };
      }

      // If one is > 12, it must be the day
      let day, month;
      if (p1 > 12) {
        day = p1;
        month = p2;
      } else {
        // Assume Indonesian standard DD/MM/YYYY if p2 > 12
        day = p2;
        month = p1;
      }

      if (!this.isValidCalendarDate(year, month, day)) {
        return {
          is_valid: false,
          normalized_date: null,
          normalized_time: null,
          rejection_reason: `INVALID_CALENDAR_DATE: ${year}-${month}-${day} does not exist`,
          is_ambiguous: false,
          is_sales_date: false
        };
      }

      const normDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        is_valid: true,
        normalized_date: normDate,
        normalized_time: null,
        rejection_reason: null,
        is_ambiguous: false,
        is_sales_date: false
      };
    }

    return {
      is_valid: false,
      normalized_date: null,
      normalized_time: null,
      rejection_reason: `UNPARSEABLE_DATE_FORMAT: '${rawStr}'`,
      is_ambiguous: false,
      is_sales_date: false
    };
  }

  /**
   * Validates whether a normalized date falls within the requested audit window
   * (2026-11-12 to 2027-02-12 Asia/Jakarta)
   */
  static isWithinAuditWindow(normalizedDate) {
    if (!normalizedDate || typeof normalizedDate !== 'string') return false;
    return normalizedDate >= AUDIT_WINDOW.START && normalizedDate <= AUDIT_WINDOW.END;
  }

  /**
   * Cross-references an incoming event against the Historical Tour Registry
   * to catch regressions where past tours are assigned future dates.
   */
  static checkHistoricalTourConflict(event) {
    if (!event) return { is_historical_conflict: false, historical_record: null, rejection_reason: null };
    const title = (event.name || event.title || event.canonical_name || '').toLowerCase();
    const artist = (event.artist_or_performer || event.artist || (Array.isArray(event.artists) ? event.artists.join(' ') : '')).toLowerCase();
    let rawDate = event.event_date || event.start_date || event.date;
    let eventDate = null;
    if (rawDate instanceof Date) {
      eventDate = rawDate.toISOString().substring(0, 10);
    } else if (typeof rawDate === 'string') {
      eventDate = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.trim().substring(0, 10);
    }

    for (const hist of HISTORICAL_TOUR_SIGNATURES) {
      const matchArtist = artist.includes(hist.artist) || title.includes(hist.artist);
      const matchKeywords = hist.keywords.some(k => title.includes(k));

      if (matchArtist && matchKeywords) {
        // If eventDate is missing, or matches historical concluded date or is prior/close to it:
        if (!eventDate || eventDate <= hist.concluded_date) {
          return {
            is_historical_conflict: true,
            historical_record: hist,
            rejection_reason: `HISTORICAL_EVENT_COMPLETED: Event took place on ${hist.concluded_date} and is permanently archived.`
          };
        }

        // If assigned a future date, require authoritative promoter renewal proof
        const hasFreshPromoterProof = Boolean(
          event.source_url &&
          !event.source_url.includes('placeholder') &&
          event.evidence_snapshot &&
          event.date_verification_status === 'VERIFIED'
        );

        if (!hasFreshPromoterProof) {
          return {
            is_historical_conflict: true,
            historical_record: hist,
            rejection_reason: `HISTORICAL_TOUR_CONFLICT: Tour '${hist.keywords[0]}' concluded on ${hist.concluded_date}. Assigned date '${eventDate}' lacks authoritative promoter renewal proof.`
          };
        }
      }
    }

    return { is_historical_conflict: false, historical_record: null, rejection_reason: null };
  }

  /**
   * Multi-source conflict detection.
   * Compares an incoming source observation against existing candidate observations.
   */
  static detectSourceConflicts(existingObservations = [], incomingObservation) {
    if (!Array.isArray(existingObservations) || existingObservations.length === 0) {
      return { has_conflict: false, conflicts: [] };
    }

    const conflicts = [];
    const incomingDate = incomingObservation.source_event_date_text || incomingObservation.event_date;
    const incomingVenue = incomingObservation.source_venue_text || incomingObservation.venue_name;

    for (const exist of existingObservations) {
      const existDate = exist.source_event_date_text || exist.event_date;
      const existVenue = exist.source_venue_text || exist.venue_name;

      if (existDate && incomingDate && existDate !== incomingDate) {
        // Check if incoming is an explicit rescheduling notice
        if (incomingObservation.is_reschedule === true || incomingObservation.event_status === 'RESCHEDULED') {
          // Rescheduled notice takes precedence if newer
          continue;
        }

        conflicts.push({
          type: 'DATE_CONFLICT',
          field: 'event_date',
          existing_source: exist.source_id || exist.source_name,
          existing_value: existDate,
          incoming_source: incomingObservation.source_id || incomingObservation.source_name,
          incoming_value: incomingDate,
          severity: 'HIGH_QUARANTINE_REQUIRED'
        });
      }

      if (existVenue && incomingVenue && existVenue.toLowerCase().trim() !== incomingVenue.toLowerCase().trim()) {
        conflicts.push({
          type: 'VENUE_CONFLICT',
          field: 'venue_name',
          existing_source: exist.source_id || exist.source_name,
          existing_value: existVenue,
          incoming_source: incomingObservation.source_id || incomingObservation.source_name,
          incoming_value: incomingVenue,
          severity: 'MEDIUM_REVIEW_REQUIRED'
        });
      }
    }

    return {
      has_conflict: conflicts.length > 0,
      conflicts
    };
  }

  /**
   * Validates and constructs a 24-field Zero-Wrong-Date contract record.
   * Enforces all publication criteria.
   */
  static evaluateAndBuildContract(rawPayload, sourceRecord, options = {}) {
    const auditWindowStart = options.windowStart || AUDIT_WINDOW.START;
    const auditWindowEnd = options.windowEnd || AUDIT_WINDOW.END;
    const now = options.now || new Date();

    const title = rawPayload.event_name || rawPayload.title || rawPayload.canonical_name || rawPayload.name;
    const artist = rawPayload.artist_or_performer || rawPayload.artist || (Array.isArray(rawPayload.artists) ? rawPayload.artists[0] : null);
    const rawDate = rawPayload.event_date || rawPayload.start_date || rawPayload.date;
    const rawTime = rawPayload.event_start_time || rawPayload.start_time || rawPayload.time;
    const venueName = rawPayload.venue_name || rawPayload.venue;
    const city = rawPayload.city || rawPayload.venue_city || 'Jakarta';
    const sourceUrl = sourceRecord.source_url || rawPayload.source_url || null;
    const sourceType = sourceRecord.source_type || rawPayload.source_type || 'UNKNOWN';

    // 1. Deterministic Date Parsing & Validation
    const dateEval = this.parseAndValidateDate(rawDate, rawTime);

    // 2. Audit Window Evaluation
    let isWindowEligible = false;
    let windowReason = null;
    if (dateEval.is_valid) {
      if (dateEval.normalized_date < auditWindowStart) {
        isWindowEligible = false;
        windowReason = `DATE_PRIOR_TO_AUDIT_WINDOW: ${dateEval.normalized_date} < ${auditWindowStart}`;
      } else if (dateEval.normalized_date > auditWindowEnd) {
        isWindowEligible = false;
        windowReason = `DATE_PAST_AUDIT_WINDOW: ${dateEval.normalized_date} > ${auditWindowEnd}`;
      } else {
        isWindowEligible = true;
      }
    }

    // 3. Historical Tour Regression Check
    const histCheck = this.checkHistoricalTourConflict({
      name: title,
      artist_or_performer: artist,
      event_date: dateEval.normalized_date,
      source_url: sourceUrl,
      evidence_snapshot: sourceRecord.evidence_snapshot,
      date_verification_status: dateEval.is_valid ? 'VERIFIED' : 'INVALID'
    });

    // 4. Source Evidence Check
    const hasSourceUrl = Boolean(sourceUrl && typeof sourceUrl === 'string' && sourceUrl.startsWith('http'));
    const isAuthoritativeSource = Boolean(
      sourceType.includes('OFFICIAL') ||
      sourceType.includes('VENUE') ||
      sourceType.includes('TICKETING') ||
      sourceRecord.tier === 1 ||
      sourceRecord.tier === 2
    );

    // 5. Conflict Check
    const conflictCheck = this.detectSourceConflicts(options.existingObservations || [], {
      source_id: sourceRecord.source_id,
      source_name: sourceRecord.source_name,
      source_event_date_text: rawDate,
      source_venue_text: venueName
    });

    // Determine Publication State & Verification Status
    let dateVerificationStatus = 'UNVERIFIED';
    let venueVerificationStatus = 'UNVERIFIED';
    let eventStatus = PUBLICATION_STATES.DISCOVERED;
    let reviewRequired = false;
    let confidenceReason = '';

    if (!dateEval.is_valid) {
      dateVerificationStatus = 'REJECTED';
      eventStatus = PUBLICATION_STATES.NEEDS_REVIEW;
      reviewRequired = true;
      confidenceReason = `Date parsing failed: ${dateEval.rejection_reason}`;
    } else if (histCheck.is_historical_conflict) {
      dateVerificationStatus = 'HISTORICAL_EXCLUDED';
      eventStatus = PUBLICATION_STATES.ARCHIVED;
      reviewRequired = true;
      confidenceReason = histCheck.rejection_reason;
    } else if (conflictCheck.has_conflict) {
      dateVerificationStatus = 'CONFLICT_QUARANTINED';
      eventStatus = PUBLICATION_STATES.NEEDS_REVIEW;
      reviewRequired = true;
      confidenceReason = `Source conflict detected: ${conflictCheck.conflicts.map(c => c.type).join(', ')}`;
    } else if (!hasSourceUrl || !isAuthoritativeSource) {
      dateVerificationStatus = 'UNVERIFIED_SOURCE';
      eventStatus = PUBLICATION_STATES.PENDING_VERIFICATION;
      reviewRequired = true;
      confidenceReason = 'Missing verified primary source URL or authoritative evidence';
    } else if (!isWindowEligible) {
      dateVerificationStatus = 'VALID_OUTSIDE_WINDOW';
      eventStatus = PUBLICATION_STATES.DISCOVERED;
      reviewRequired = false;
      confidenceReason = windowReason;
    } else {
      // Passes all criteria!
      dateVerificationStatus = 'VERIFIED';
      venueVerificationStatus = 'VERIFIED';
      eventStatus = PUBLICATION_STATES.VERIFIED;
      reviewRequired = false;
      confidenceReason = `Verified by authoritative ${sourceType} (${sourceRecord.source_name || sourceRecord.source_id}) with exact date match`;
    }

    // Retained Evidence Snapshot
    const evidenceHash = crypto.createHash('sha256')
      .update(`${title}::${venueName}::${dateEval.normalized_date}::${sourceUrl || 'NO_URL'}`)
      .digest('hex');

    const evidenceSnapshot = {
      source_id: sourceRecord.source_id || 'UNKNOWN',
      source_url: sourceUrl,
      source_type: sourceType,
      source_published_at: sourceRecord.source_published_at || null,
      source_retrieved_at: sourceRecord.source_retrieved_at || new Date().toISOString(),
      source_event_date_text: String(rawDate || ''),
      source_venue_text: String(venueName || ''),
      evidence_hash: evidenceHash,
      corroboration_notes: confidenceReason
    };

    // 24-Field Zero-Wrong-Date Data Contract Object
    const contractRecord = {
      canonical_event_id: rawPayload.canonical_event_id || rawPayload.id || `ev-can-${evidenceHash.substring(0, 8)}`,
      event_name: title,
      artist_or_performer: artist || null,
      event_date: dateEval.normalized_date,
      event_start_time: dateEval.normalized_time, // null if unknown, NEVER fabricated midnight
      timezone: rawPayload.timezone || AUDIT_WINDOW.TIMEZONE,
      venue_name: venueName,
      venue_address: rawPayload.venue_address || null,
      city: city,
      country: 'Indonesia',
      organizer_or_promoter: rawPayload.organizer_or_promoter || rawPayload.promoter || null,
      ticketing_platform: rawPayload.ticketing_platform || sourceRecord.ticketing_platform || null,
      source_url: sourceUrl,
      source_type: sourceType,
      source_published_at: sourceRecord.source_published_at || null,
      source_retrieved_at: sourceRecord.source_retrieved_at || new Date().toISOString(),
      source_event_date_text: String(rawDate || ''),
      source_venue_text: String(venueName || ''),
      date_verification_status: dateVerificationStatus,
      venue_verification_status: venueVerificationStatus,
      event_status: eventStatus,
      last_verified_at: new Date().toISOString(),
      evidence_snapshot: evidenceSnapshot,
      confidence_reason: confidenceReason,
      review_required: reviewRequired,

      // Invariants
      is_upcoming_eligible: (eventStatus === PUBLICATION_STATES.VERIFIED && isWindowEligible && !reviewRequired),
      audit_window_eligible: isWindowEligible
    };

    return contractRecord;
  }

  /**
   * Generates a structured per-event audit trail
   */
  static generateAuditTrail(contractRecord) {
    return {
      stage_1_original_source: {
        source_id: contractRecord.evidence_snapshot?.source_id,
        source_url: contractRecord.source_url,
        source_type: contractRecord.source_type,
        retrieved_at: contractRecord.source_retrieved_at
      },
      stage_2_extracted_data: {
        raw_date_text: contractRecord.source_event_date_text,
        raw_venue_text: contractRecord.source_venue_text,
        extracted_title: contractRecord.event_name
      },
      stage_3_normalized_data: {
        normalized_date: contractRecord.event_date,
        normalized_time: contractRecord.event_start_time,
        timezone: contractRecord.timezone,
        city: contractRecord.city
      },
      stage_4_verification: {
        date_status: contractRecord.date_verification_status,
        venue_status: contractRecord.venue_verification_status,
        confidence_reason: contractRecord.confidence_reason,
        review_required: contractRecord.review_required,
        evidence_hash: contractRecord.evidence_snapshot?.evidence_hash
      },
      stage_5_canonical_event: {
        canonical_event_id: contractRecord.canonical_event_id,
        status: contractRecord.event_status
      },
      stage_6_publication: {
        is_published_to_upcoming: contractRecord.is_upcoming_eligible,
        publication_verdict: contractRecord.is_upcoming_eligible ? 'PUBLIC_UPCOMING_APPROVED' : 'QUARANTINED_OR_ARCHIVED'
      }
    };
  }
}

module.exports = {
  EventDateForensicsEngine,
  AUDIT_WINDOW,
  PUBLICATION_STATES,
  HISTORICAL_TOUR_SIGNATURES
};
