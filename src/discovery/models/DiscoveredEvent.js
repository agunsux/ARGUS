/**
 * TIKUM / ARGUS — Discovered Event Domain Model
 *
 * Universal normalized discovery event contract.
 * Bridges external discovery sources (Loket, official sites, promoters, venues, ticketing)
 * into a rigorously qualified, verifiable, and deduplicatable candidate for canonical ingestion.
 *
 * Enforces:
 * - Deterministic field normalization
 * - Provenance tracking (official_source, ticket_source, promoter_source, venue_source)
 * - Price qualification (>= IDR 300,000 threshold, tier tracking, actual ranges)
 * - Multidimensional Quality Scoring (A: MUST INGEST, B: INGEST, C: REVIEW, D: REJECT)
 * - Strict Zero Fabrication: Missing data defaults to NULL / UNKNOWN.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { EventNormalizationService } = require('../EventNormalizationService');

const DISCOVERY_CATEGORIES = {
  CONCERT: 'CONCERT',
  SPORTS: 'SPORTS',
  COMEDY: 'COMEDY',
  OTHER: 'OTHER'
};

const PRICE_STATUS = {
  QUALIFIED: 'QUALIFIED',
  PRICE_TIERED: 'PRICE_TIERED',
  EXCLUDED_PRICE_TOO_LOW: 'EXCLUDED_PRICE_TOO_LOW',
  UNKNOWN: 'UNKNOWN'
};

const QUALITY_GRADES = {
  A: 'A', // MUST INGEST
  B: 'B', // INGEST
  C: 'C', // REVIEW
  D: 'D'  // REJECT
};

const EVENT_PRIORITY = {
  P0: 'P0', // Major concerts/festivals, international artists, major sports, major stand-up
  P1: 'P1', // Strong commercial events >= Rp 300k
  P2: 'P2', // Other verified events
  P3: 'P3'  // Low-price / low-demand
};

class DiscoveredEvent {
  constructor(data = {}) {
    this.discovered_id = data.discovered_id || `disc-${uuidv4().substring(0, 8)}`;
    this.source_id = data.source_id || 'src-unknown';
    this.source_event_id = data.source_event_id || null;

    // Title & Naming
    const rawTitle = data.title || data.event_name || data.name || data.canonical_name || '';
    this.raw_title = rawTitle;
    this.canonical_name = EventNormalizationService.normalizeTitle(rawTitle);
    this.slug = data.slug || null;

    // Classification
    this.category = this.normalizeCategory(data.category, rawTitle, data.organizer_name);
    this.subcategory = data.subcategory || null;

    // Artists & Performers
    const rawArtists = Array.isArray(data.artists)
      ? data.artists
      : (data.artist ? [data.artist] : (data.performer ? (Array.isArray(data.performer) ? data.performer.map(p => p.name || p) : [data.performer]) : []));
    this.artists = rawArtists.filter(a => typeof a === 'string' && a.trim().length > 0).map(a => a.trim());
    this.artist = this.artists.length > 0 ? this.artists[0] : (data.artist || null);

    // Temporal attributes
    this.start_date = data.start_date || (data.start_datetime ? data.start_datetime.substring(0, 10) : data.date || null);
    this.end_date = data.end_date || (data.end_datetime ? data.end_datetime.substring(0, 10) : null);
    this.start_time = data.start_time || data.time || null;
    this.end_time = data.end_time || null;
    this.start_datetime = data.start_datetime || null;
    this.end_datetime = data.end_datetime || null;
    this.timezone = data.timezone || 'Asia/Jakarta';

    // Geographic & Venue attributes
    const venueNorm = EventNormalizationService.normalizeVenue(
      data.venue_name || data.venue || data.location_name,
      data.city || data.venue_city
    );
    this.venue_name = venueNorm.venue_name || data.venue_name || 'TBA';
    this.venue_id = venueNorm.venue_id || data.venue_id || null;
    this.city = venueNorm.city || data.city || 'Jakarta';
    this.province = venueNorm.province || data.province || null;
    this.country = venueNorm.country || data.country || 'Indonesia';

    // Stakeholders
    this.organizer_name = data.organizer_name || data.promoter || data.organization_name || null;

    // URLs & Channels
    this.official_event_url = data.official_event_url || data.official_url || null;
    this.official_ticket_url = data.official_ticket_url || data.ticket_url || null;
    this.official_ticketing_provider = data.official_ticketing_provider || data.ticketing_provider || null;

    // Pricing Qualification
    this.price_currency = data.price_currency || data.currency || 'IDR';
    this.price_min = data.price_min !== undefined && data.price_min !== null
      ? Number(data.price_min)
      : (data.min_price !== undefined && data.min_price !== null ? Number(data.min_price) : (data.price !== undefined && data.price !== null ? Number(data.price) : null));
    this.price_max = data.price_max !== undefined && data.price_max !== null
      ? Number(data.price_max)
      : (data.max_price !== undefined && data.max_price !== null ? Number(data.max_price) : this.price_min);
    this.price_tiers = Array.isArray(data.price_tiers) ? data.price_tiers : [];
    this.price_source = data.price_source || this.source_id;
    this.price_checked_at = data.price_checked_at || new Date().toISOString();
    this.price_status = data.price_status || this.evaluatePriceStatus();

    // Lifecycle & Verification
    this.event_status = data.event_status || data.status || 'UPCOMING';
    this.verification_status = data.verification_status || 'UNVERIFIED';
    this.is_verified = data.is_verified === true;

    // Provenance Graph
    this.provenance = {
      official_source: data.provenance?.official_source || this.official_event_url,
      ticket_source: data.provenance?.ticket_source || this.official_ticket_url,
      promoter_source: data.provenance?.promoter_source || (this.organizer_name ? `promoter:${this.organizer_name}` : null),
      venue_source: data.provenance?.venue_source || (this.venue_name ? `venue:${this.venue_name}` : null),
      discovery_source: data.provenance?.discovery_source || this.source_id,
      notes: data.provenance?.notes || []
    };

    // Images / Banners
    this.image_url = data.image_url || data.banner_url || data.poster_url || null;
    this.evidence_hash = data.evidence_hash || this.computeEvidenceHash();

    // Scoring & Priority
    this.quality_score = data.quality_score !== undefined ? data.quality_score : this.computeQualityScore();
    this.quality_grade = data.quality_grade || this.computeQualityGrade();
    this.priority = data.priority || this.computePriority();

    this.discovered_at = data.discovered_at || new Date().toISOString();
    this.verified_at = data.verified_at || null;
  }

  normalizeCategory(rawCategory, title = '', organizer = '') {
    if (rawCategory && Object.values(DISCOVERY_CATEGORIES).includes(rawCategory.toUpperCase())) {
      return rawCategory.toUpperCase();
    }
    const combined = `${title} ${organizer} ${rawCategory || ''}`.toLowerCase();
    if (/konser|concert|festival|fest|music|musik|orchestra|symphony|band|live|tour|recital/i.test(combined)) {
      return DISCOVERY_CATEGORIES.CONCERT;
    }
    if (/marathon|run|race|rally|rallycross|motogp|match|league|tournament|sport|badminton|football|soccer|basketball|tennis|f1|championship/i.test(combined)) {
      return DISCOVERY_CATEGORIES.SPORTS;
    }
    if (/stand up|standup|comedy|komedi|lucu|tawa/i.test(combined)) {
      return DISCOVERY_CATEGORIES.COMEDY;
    }
    return DISCOVERY_CATEGORIES.OTHER;
  }

  evaluatePriceStatus(minThreshold = 300000) {
    if (this.price_min === null && this.price_max === null && this.price_tiers.length === 0) {
      return PRICE_STATUS.UNKNOWN;
    }

    const minP = this.price_min !== null ? this.price_min : 0;
    const maxP = this.price_max !== null ? this.price_max : minP;

    if (minP >= minThreshold) {
      return PRICE_STATUS.QUALIFIED;
    }

    if (maxP >= minThreshold && minP < minThreshold) {
      return PRICE_STATUS.PRICE_TIERED;
    }

    if (maxP > 0 && maxP < minThreshold) {
      return PRICE_STATUS.EXCLUDED_PRICE_TOO_LOW;
    }

    return PRICE_STATUS.UNKNOWN;
  }

  isQualified(minThreshold = 300000) {
    const status = this.evaluatePriceStatus(minThreshold);
    return status === PRICE_STATUS.QUALIFIED || status === PRICE_STATUS.PRICE_TIERED;
  }

  computeQualityScore() {
    let score = 0;

    // 1. Source Confidence (0 - 30 pts)
    const hasOfficial = Boolean(this.official_event_url);
    const hasTicket = Boolean(this.official_ticket_url);
    if (hasOfficial && hasTicket) score += 30;
    else if (hasOfficial || hasTicket) score += 20;
    else if (this.source_id === 'src-loket') score += 18;
    else score += 10;

    // 2. Price Value (0 - 25 pts)
    const effectivePrice = Math.max(this.price_min || 0, this.price_max || 0);
    if (effectivePrice >= 1000000) score += 25;
    else if (effectivePrice >= 500000) score += 20;
    else if (effectivePrice >= 300000) score += 15;
    else if (effectivePrice > 0) score += 5;

    // 3. Category & Demand Signal (0 - 25 pts)
    if (this.category === DISCOVERY_CATEGORIES.CONCERT) {
      score += 25;
    } else if (this.category === DISCOVERY_CATEGORIES.SPORTS) {
      score += 22;
    } else if (this.category === DISCOVERY_CATEGORIES.COMEDY) {
      score += 20;
    } else {
      score += 8;
    }

    // 4. Performer & Venue Scale (0 - 20 pts)
    if (this.artists.length > 0) score += 10;
    if (this.venue_name && !/TBA|unknown/i.test(this.venue_name)) score += 10;

    return Math.min(100, score);
  }

  computeQualityGrade() {
    const score = this.computeQualityScore();
    const isQual = this.isQualified(300000);

    if (score >= 75 && isQual) {
      return QUALITY_GRADES.A; // MUST INGEST
    }
    if (score >= 50 && isQual) {
      return QUALITY_GRADES.B; // INGEST
    }
    if (isQual || score >= 40) {
      return QUALITY_GRADES.C; // REVIEW
    }
    return QUALITY_GRADES.D; // REJECT
  }

  computePriority() {
    const grade = this.computeQualityGrade();
    const isPriorityCategory = this.category === DISCOVERY_CATEGORIES.CONCERT ||
      this.category === DISCOVERY_CATEGORIES.SPORTS ||
      this.category === DISCOVERY_CATEGORIES.COMEDY;
    const isQual = this.isQualified(300000);
    const effectivePrice = Math.max(this.price_min || 0, this.price_max || 0);

    // Filter out corporate workshops, training, bootcamps from P0/P1
    const isEducationalOrTraining = /bootcamp|training|workshop|course|kelas|class|seminar|webinar|conference|summit|sertifikasi/i.test(this.canonical_name);

    if (isPriorityCategory && isQual && grade === QUALITY_GRADES.A) {
      return EVENT_PRIORITY.P0;
    }
    if (isPriorityCategory && isQual) {
      return EVENT_PRIORITY.P1;
    }
    if (!isEducationalOrTraining && isQual && effectivePrice >= 500000) {
      return EVENT_PRIORITY.P1;
    }
    if (isQual) {
      return EVENT_PRIORITY.P2;
    }
    return EVENT_PRIORITY.P3;
  }

  computeEvidenceHash() {
    const canonicalTuple = {
      title: this.canonical_name,
      date: this.start_date,
      venue: this.venue_name,
      city: this.city,
      min_price: this.price_min,
      max_price: this.price_max,
      source: this.source_id,
      official_event_url: this.official_event_url,
      official_ticket_url: this.official_ticket_url
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonicalTuple)).digest('hex');
  }

  toCanonicalEventPayload() {
    const slug = this.slug || EventNormalizationService.generateSlug(this.canonical_name, this.city, this.start_date);
    return {
      canonical_name: this.canonical_name,
      title: this.canonical_name,
      name: this.canonical_name,
      slug: slug,
      category: this.category,
      event_type: this.category,
      artist: this.artist,
      artists: this.artists,
      start_date: this.start_date,
      start_datetime: this.start_datetime,
      end_date: this.end_date,
      end_datetime: this.end_datetime,
      timezone: this.timezone,
      venue_name: this.venue_name,
      venue_id: this.venue_id,
      venue_city: this.city,
      city: this.city,
      province: this.province,
      country: this.country,
      organizer_name: this.organizer_name || 'Official Promoter',
      official_event_url: this.official_event_url,
      official_ticket_url: this.official_ticket_url,
      official_ticketing_provider: this.official_ticketing_provider,
      min_price: this.price_min,
      max_price: this.price_max,
      is_verified: this.is_verified,
      verification_status: this.verification_status,
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      public_visibility: true,
      homepage_visibility: this.quality_grade === QUALITY_GRADES.A || this.priority === EVENT_PRIORITY.P0,
      metadata: {
        price_min: this.price_min,
        price_max: this.price_max,
        price_currency: this.price_currency,
        price_status: this.price_status,
        price_tiers: this.price_tiers,
        price_checked_at: this.price_checked_at,
        price_source: this.price_source,
        quality_score: this.quality_score,
        quality_grade: this.quality_grade,
        priority: this.priority,
        artists: this.artists,
        artist: this.artist,
        provenance: this.provenance,
        evidence_hash: this.evidence_hash,
        discovered_at: this.discovered_at,
        verified_at: this.verified_at
      }
    };
  }
}

module.exports = {
  DiscoveredEvent,
  DISCOVERY_CATEGORIES,
  PRICE_STATUS,
  QUALITY_GRADES,
  EVENT_PRIORITY
};
