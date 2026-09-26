/**
 * TIKUM / ARGUS Canonical Event Registry
 * 
 * Canonical Single Source of Truth for live events in Indonesia.
 * Enforces:
 * - Fail-Closed Verification & Reconstructable Provenance Chain
 * - Temporal Expiration & Freshness Monitoring (expires_at)
 * - Multi-layer QR Verification Abstraction (without claiming 100% certainty)
 * - Read-only projection to state.events (Marketplace Firewall)
 */

const { v4: uuidv4 } = require('uuid');
const { EventNormalizationService } = require('./EventNormalizationService');
const { EventVerificationService, VERIFICATION_STATUS } = require('./EventVerificationService');
const { sourceRegistry, TRUST_LEVELS, SOURCE_ROLES } = require('./SourceRegistry');
const { EventSourceObservation } = require('./models/EventSourceObservation');
const { EventConflict } = require('./models/EventConflict');
const { EventQualityGate, CANONICAL_STATES, MARKETPLACE_ELIGIBILITY } = require('./EventQualityGate');
const { PopularityEngine } = require('./PopularityEngine');
const { SourceClaim, CLAIM_TYPES } = require('./models/SourceClaim');
const { cityRegistry } = require('./CityRegistry');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('./EventTemporalLifecycleEngine');
const { EventVisualProvenanceService } = require('./EventVisualProvenanceService');

class CanonicalEventRegistry {
  constructor() {
    this.events = new Map(); // event_id -> canonicalEvent
    this.slugMap = new Map(); // slug -> event_id
  }

  /**
   * Computes temporal expiration timestamp (expires_at) based on event proximity.
   */
  computeExpirationDate(startDate, verificationDate = new Date()) {
    if (!startDate) {
      return new Date(verificationDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    const eventTime = new Date(startDate).getTime();
    const nowTime = verificationDate.getTime();
    const diffDays = Math.ceil((eventTime - nowTime) / (1000 * 60 * 60 * 24));

    let ttlMs;
    if (diffDays <= 7) {
      ttlMs = 24 * 60 * 60 * 1000; // 24 hours for imminent events
    } else if (diffDays <= 30) {
      ttlMs = 72 * 60 * 60 * 1000; // 72 hours for near-term events
    } else if (diffDays <= 90) {
      ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days for medium-term events
    } else {
      ttlMs = 14 * 24 * 60 * 60 * 1000; // 14 days for far-future events
    }

    return new Date(nowTime + ttlMs).toISOString();
  }

  computeUpdatePriority(startDate) {
    if (!startDate) return 'SCHEDULED';
    const eventTime = new Date(startDate).getTime();
    const nowTime = Date.now();
    const diffDays = Math.ceil((eventTime - nowTime) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'ARCHIVED';
    if (diffDays <= 7) return 'HIGH_PRIORITY';
    if (diffDays <= 30) return 'FREQUENT';
    if (diffDays <= 90) return 'WEEKLY';
    return 'SCHEDULED';
  }

  /**
   * Creates or registers a canonical event.
   * Strict fail-closed defaults: if no Tier 1 authoritative proof, status is UNVERIFIED.
   */
  createEvent(eventData) {
    const eventId = eventData.event_id || eventData.id || `ev-can-${uuidv4().substring(0, 8)}`;

    // Anti-resurrection check on creation:
    const existing = this.events.get(eventId);
    if (existing) {
      const isTerminal = (
        existing.lifecycle_status === LIFECYCLE_STATUS.COMPLETED ||
        existing.lifecycle_status === LIFECYCLE_STATUS.ARCHIVED ||
        existing.lifecycle_status === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS ||
        existing.status === 'COMPLETED' ||
        existing.status === 'CANCELLED' ||
        existing.status === 'ARCHIVED'
      );
      if (isTerminal && (eventData.status === 'UPCOMING' || !eventData.status)) {
        return existing;
      }
    }

    const title = eventData.canonical_name || eventData.name || eventData.title;
    if (!title) {
      throw new Error('Event must have canonical_name, name, or title');
    }

    const normTitle = EventNormalizationService.normalizeTitle(title);
    const date = eventData.start_date || (eventData.start_datetime ? eventData.start_datetime.substring(0, 10) : (eventData.start_at ? eventData.start_at.substring(0, 10) : eventData.date));
    const venueNorm = EventNormalizationService.normalizeVenue(
      eventData.venue_name || eventData.venue || eventData.venue_id,
      eventData.city || eventData.venue_city
    );

    const dtNorm = EventNormalizationService.normalizeDateTime(
      date,
      eventData.time,
      eventData.timezone,
      venueNorm.city || eventData.city || eventData.venue_city || eventData.province
    );

    const eventType = eventData.event_type || EventNormalizationService.normalizeEventType(eventData.category, normTitle);
    const slug = eventData.slug || EventNormalizationService.generateSlug(normTitle, venueNorm.city, dtNorm.date);

    // Initial sources
    const sources = Array.isArray(eventData.sources) ? [...eventData.sources] : [];
    if (eventData.source_id && !sources.some(s => s.source_id === eventData.source_id)) {
      const srcMeta = sourceRegistry.getSource(eventData.source_id) || {};
      sources.push({
        source_id: eventData.source_id,
        source_name: srcMeta.source_name || eventData.source_name || eventData.source_id,
        tier: srcMeta.tier || (eventData.tier || 2),
        authority_level: srcMeta.authority_level || 'MEDIUM',
        source_url: eventData.source_url || eventData.official_ticket_url || null,
        source_account: eventData.source_account || srcMeta.canonical_account || null,
        source_type: eventData.source_type || srcMeta.source_type || null,
        source_event_identifier: eventData.source_event_identifier || eventData.source_event_id || null,
        retrieved_at: eventData.source_last_checked_at || new Date().toISOString()
      });
    } else if (!eventData.source_id && (eventData.source_type || eventData.source_url) && sources.length === 0) {
      sources.push({
        source_id: eventData.source_account ? `src-${eventData.source_account.replace(/[^a-zA-Z0-9_-]/g, '')}` : 'src-direct-provenance',
        source_name: eventData.source_account || eventData.source_type,
        source_type: eventData.source_type,
        source_url: eventData.source_url,
        source_account: eventData.source_account || null,
        tier: 2,
        retrieved_at: eventData.source_last_checked_at || new Date().toISOString()
      });
    }

    const now = new Date().toISOString();
    const verifiedAt = eventData.last_verified_at || eventData.verified_at || now;
    const expiresAt = eventData.expires_at || this.computeExpirationDate(dtNorm.date, new Date(verifiedAt));

    // Compute authoritative temporal attributes
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes({
      ...eventData,
      start_date: dtNorm.date,
      start_time: eventData.time || dtNorm.time,
      venue_city: venueNorm.city,
      city: venueNorm.city,
      province: venueNorm.province,
      timezone: dtNorm.timezone
    });

    // Resolve Image Visual Provenance
    const visual = EventVisualProvenanceService.resolveEventImage(eventData, sources);

    const resolvedCountry = venueNorm.country || eventData.country || 'Indonesia';
    const resolvedCurrency = eventData.currency || (
      resolvedCountry === 'Singapore' ? 'SGD' :
      resolvedCountry === 'Malaysia' ? 'MYR' :
      resolvedCountry === 'Thailand' ? 'THB' :
      resolvedCountry === 'Philippines' ? 'PHP' :
      resolvedCountry === 'Vietnam' ? 'VND' : 'IDR'
    );
    const categoryGroup = EventNormalizationService.mapCategoryToGroup ? EventNormalizationService.mapCategoryToGroup(eventType) : 'OTHER';

    // Construct Canonical Event Model conforming to Part 6 & P0 Invariants
    const canonicalEvent = {
      event_id: eventId,
      id: eventId, // compatibility with existing marketplace queries
      slug: slug,
      title: normTitle,
      name: normTitle, // compatibility
      canonical_name: normTitle, // compatibility
      normalized_title: normTitle.toLowerCase().trim(),
      artist: (Array.isArray(eventData.artists) && eventData.artists.length > 0) ? eventData.artists[0] : (eventData.artist || null),
      artists: Array.isArray(eventData.artists) ? [...eventData.artists] : (eventData.artist ? [eventData.artist] : []),
      venue: venueNorm.venue_name,
      venue_name: venueNorm.venue_name, // compatibility
      venue_id: venueNorm.venue_id || eventData.venue_id || null,
      city: venueNorm.city,
      venue_city: venueNorm.city, // compatibility
      province: venueNorm.province,
      country: resolvedCountry,
      currency: resolvedCurrency,
      category_group: categoryGroup,
      event_start_at: temporal.event_start_at,
      event_end_at: temporal.event_end_at,
      event_timezone: temporal.event_timezone,
      archive_at: temporal.archive_at,
      start_at: temporal.event_start_at,
      start_datetime: temporal.event_start_at, // compatibility
      start_date: temporal.start_date,
      date: temporal.start_date, // compatibility
      end_at: temporal.event_end_at,
      end_datetime: temporal.event_end_at, // compatibility
      end_date: temporal.end_date,
      timezone: temporal.event_timezone,
      category: eventData.category || eventType,
      event_type: eventType,
      event_status: eventData.status || eventData.event_status || 'UPCOMING',
      status: eventData.status || eventData.event_status || 'UPCOMING', // compatibility
      organizer_name: eventData.organizer_name || 'Official Organizer',
      organizer_id: eventData.organizer_id || null,
      description: eventData.description || `${normTitle} diselenggarakan di ${venueNorm.venue_name}, ${venueNorm.city}. Informasi resmi dan pantauan verifikasi TIKUM.`,

      // Visual Provenance
      image_url: visual.image_url,
      thumbnail_url: visual.thumbnail_url,
      image_source_type: visual.image_source_type,
      image_source_url: visual.image_source_url,
      image_source_account: visual.image_source_account,
      image_source_tier: visual.image_source_tier,
      image_last_checked_at: visual.image_last_checked_at,
      image_evidence_hash: visual.image_evidence_hash,
      image_license_status: visual.image_license_status,
      image_status: visual.image_status,
      image_scope: visual.image_scope,
      image_credit: visual.image_credit,
      is_fallback_image: visual.is_fallback,
      fallback_meta: visual.fallback_meta || null,
      event_image: visual.image_url || eventData.event_image || null,
      poster_url: visual.image_url || eventData.poster_url || null,

      // Pricing & Official Links
      min_price: eventData.min_price || eventData.ticket_price || null,
      max_price: eventData.max_price || null,
      official_event_url: eventData.official_event_url || eventData.official_link || null,
      official_ticket_url: eventData.official_ticket_url || null,
      ticket_url: eventData.official_ticket_url || null,
      ticket_provider: eventData.official_ticketing_provider || eventData.ticketing_partner || null,
      official_ticketing_provider: eventData.official_ticketing_provider || eventData.ticketing_partner || null,
      ticketing_partner: eventData.ticketing_partner || eventData.official_ticketing_provider || null,
      authority_relationship: eventData.authority_relationship || null,
      
      // Mandatory Canonical Provenance Fields
      source_type: eventData.source_type || (sources[0] && sources[0].source_type) || null,
      source_url: eventData.source_url || (sources[0] && sources[0].source_url) || null,
      source_account: eventData.source_account || (sources[0] && (sources[0].source_account || sources[0].account_handle)) || null,
      source_published_at: eventData.source_published_at || (sources[0] && sources[0].published_at) || null,
      source_last_checked_at: eventData.source_last_checked_at || (sources[0] && sources[0].retrieved_at) || now,
      evidence_hash: eventData.evidence_hash || null,

      // Provenance counters & timestamps
      source_count: sources.length,
      first_seen_at: eventData.first_seen_at || now,
      last_seen_at: eventData.last_seen_at || now,
      last_checked_at: eventData.last_checked_at || now,
      last_verified_at: verifiedAt,
      verified_at: verifiedAt,
      expires_at: expiresAt,
      updated_at: now,
      created_at: eventData.created_at || now,

      // Multi-layer QR / Gate Admission Protocol
      admission_protocol: eventData.admission_protocol || {
        type: 'BARCODE_PLUS_ID',
        description: 'Pemeriksaan tiket resmi promotor dan verifikasi identitas di venue acara bersama Event PIC Tikum',
        required_items: ['E-Ticket / QR Code resmi', 'KTP / Identitas Asli'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Promoter & Venue Security',
        primary_ticketing_confirmation: false, // Mandatory Limitation Disclosure
        verification_disclaimer: 'Verifikasi fisik gerbang oleh Event PIC memvalidasi kepemilikan dan integritas barcode, namun tidak menggantikan validasi kriptografis langsung dari promotor penerbit tiket.'
      },

      // Granular field-level provenance
      // Geo coordinates & capacity tier for spatial search & popularity
      lat: venueNorm.lat || (typeof cityRegistry !== 'undefined' && cityRegistry.findCity && cityRegistry.findCity(venueNorm.city) ? cityRegistry.findCity(venueNorm.city).lat : null),
      lng: venueNorm.lng || (typeof cityRegistry !== 'undefined' && cityRegistry.findCity && cityRegistry.findCity(venueNorm.city) ? cityRegistry.findCity(venueNorm.city).lng : null),
      capacity_tier: venueNorm.capacity_tier || eventData.capacity_tier || 'UNKNOWN',

      // Atomic Source Claims
      claims: Array.isArray(eventData.claims) ? [...eventData.claims] : [],

      // Granular field-level provenance with multi-factor confidence
      field_provenance: eventData.field_provenance || {
        event_name: {
          value: normTitle,
          source_id: (sources[0] && sources[0].source_id) || null,
          observed_at: now,
          ...EventVerificationService.calculateFieldConfidence({ fieldType: 'EVENT_NAME', sourceType: (sources[0] && sources[0].source_id) ? (sources[0].source_id.includes('promoter') ? 'promoter' : 'ticketing') : 'promoter', observedAt: now })
        },
        start_date: {
          value: dtNorm.date,
          source_id: (sources[0] && sources[0].source_id) || null,
          observed_at: now,
          ...EventVerificationService.calculateFieldConfidence({ fieldType: 'EVENT_DATE', sourceType: (sources[0] && sources[0].source_id) ? (sources[0].source_id.includes('promoter') ? 'promoter' : 'ticketing') : 'promoter', observedAt: now })
        },
        venue_name: {
          value: venueNorm.venue_name,
          source_id: (sources[0] && sources[0].source_id) || null,
          observed_at: now,
          ...EventVerificationService.calculateFieldConfidence({ fieldType: 'VENUE', sourceType: 'venue', observedAt: now })
        },
        city: {
          value: venueNorm.city,
          source_id: (sources[0] && sources[0].source_id) || null,
          observed_at: now,
          ...EventVerificationService.calculateFieldConfidence({ fieldType: 'CITY', sourceType: 'venue', observedAt: now })
        },
        artists: {
          value: eventData.artists || (eventData.artist ? [eventData.artist] : []),
          source_id: (sources[0] && sources[0].source_id) || null,
          observed_at: now,
          ...EventVerificationService.calculateFieldConfidence({ fieldType: 'LINEUP', sourceType: 'promoter', observedAt: now })
        },
        official_ticket_url: {
          value: eventData.official_ticket_url || null,
          source_id: eventData.official_ticket_url ? (sources[0] && sources[0].source_id) : null,
          observed_at: now,
          ...(eventData.official_ticket_url
            ? EventVerificationService.calculateFieldConfidence({ fieldType: 'TICKET_PRICE', sourceType: 'ticketing', observedAt: now })
            : { confidence: 'UNKNOWN', prior_authority: 0, freshness_factor: 0, age_days: 0, is_conflicted: false }
          )
        },
        status: {
          value: eventData.status || 'UPCOMING',
          source_id: (sources[0] && sources[0].source_id) || null,
          observed_at: now,
          ...EventVerificationService.calculateFieldConfidence({ fieldType: 'STATUS', sourceType: 'promoter', observedAt: now })
        },
        ticket_price: {
          value: eventData.ticket_price || 'UNKNOWN',
          source_id: (sources[0] && sources[0].source_id) || null,
          observed_at: now,
          ...(eventData.ticket_price && eventData.ticket_price !== 'UNKNOWN'
            ? EventVerificationService.calculateFieldConfidence({ fieldType: 'TICKET_PRICE', sourceType: 'ticketing', observedAt: now })
            : { confidence: 'UNKNOWN', prior_authority: 0, freshness_factor: 0, age_days: 0, is_conflicted: false }
          )
        }
      },

      // Immutable observation records
      observations: Array.isArray(eventData.observations) ? [...eventData.observations] : (eventData.observation ? [eventData.observation] : []),

      // Immutable provenance chain
      event_history: Array.isArray(eventData.event_history) ? [...eventData.event_history] : [
        {
          timestamp: now,
          change_type: 'INITIAL_DISCOVERY',
          field: 'all',
          old_value: null,
          new_value: { name: normTitle, date: dtNorm.date, venue: venueNorm.venue_name },
          source_id: (sources[0] && sources[0].source_id) || 'system',
          reason: 'Initial event observation ingested'
        }
      ],

      update_priority: this.computeUpdatePriority(dtNorm.date),
      sources: sources,
      atomic_claims: Array.isArray(eventData.claims) ? [...eventData.claims] : (Array.isArray(eventData.atomic_claims) ? [...eventData.atomic_claims] : []),
      claims: Array.isArray(eventData.claims) ? [...eventData.claims] : (Array.isArray(eventData.atomic_claims) ? [...eventData.atomic_claims] : []),
      verification_status: eventData.verification_status || VERIFICATION_STATUS.UNVERIFIED,
      verification_confidence: eventData.verification_confidence || 0,
      verification_reasons: eventData.verification_reasons || [],
      is_verified: false,
      conflicts: [],

      // Pre-evaluation Tikum Zero-Fake inputs
      artist_official_url: eventData.artist_official_url || null,
      artist_official_source_type: eventData.artist_official_source_type || null,
      artist_verification_status: eventData.artist_verification_status || null,
      promoter_official_url: eventData.promoter_official_url || null,
      promoter_verification_status: eventData.promoter_verification_status || null,
      event_official_url: eventData.event_official_url || eventData.official_event_url || null,
      event_verification_status: eventData.event_verification_status || null,
      ticketing_official_url: eventData.ticketing_official_url || eventData.official_ticket_url || null,
      ticketing_verification_status: eventData.ticketing_verification_status || null,
      venue_verification_status: eventData.venue_verification_status || null,
      verification_tier: eventData.verification_tier || null,
      verification_score: eventData.verification_score || 0,
      enforce_zero_fake_policy: eventData.enforce_zero_fake_policy || false,
      require_artist_verification: eventData.require_artist_verification || false
    };

    // Evaluate verification through the strict fail-closed engine.
    // A record's self-declared is_verified / verification_status is NEVER trusted:
    // only a SourceRegistry-verified authoritative source can produce VERIFIED.
    const evalResult = EventVerificationService.evaluateEvent(canonicalEvent, canonicalEvent.sources);
    canonicalEvent.verification_status = evalResult.verification_status;
    canonicalEvent.verification_confidence = evalResult.verification_confidence;
    canonicalEvent.conflicts = evalResult.conflicts || [];
    canonicalEvent.verification_reasons = evalResult.flags || [];
    canonicalEvent.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED || evalResult.verification_status === 'PRIMARY_SOURCE_VERIFIED');

    // Tikum Zero-Fake 14 Schema Attributes
    canonicalEvent.artist_official_url = evalResult.artist_official_url || eventData.artist_official_url || null;
    canonicalEvent.artist_official_source_type = evalResult.artist_official_source_type || eventData.artist_official_source_type || null;
    canonicalEvent.artist_verification_status = evalResult.artist_verification_status || eventData.artist_verification_status || 'UNVERIFIED';

    canonicalEvent.promoter_official_url = evalResult.promoter_official_url || eventData.promoter_official_url || null;
    canonicalEvent.promoter_verification_status = evalResult.promoter_verification_status || eventData.promoter_verification_status || 'UNVERIFIED';

    canonicalEvent.event_official_url = evalResult.event_official_url || eventData.event_official_url || canonicalEvent.official_event_url || null;
    canonicalEvent.event_verification_status = evalResult.event_verification_status || eventData.event_verification_status || 'UNVERIFIED';

    canonicalEvent.ticketing_official_url = evalResult.ticketing_official_url || eventData.ticketing_official_url || canonicalEvent.official_ticket_url || null;
    canonicalEvent.ticketing_verification_status = evalResult.ticketing_verification_status || eventData.ticketing_verification_status || 'UNVERIFIED';

    canonicalEvent.venue_verification_status = evalResult.venue_verification_status || eventData.venue_verification_status || 'UNVERIFIED';

    canonicalEvent.verification_tier = evalResult.verification_tier || eventData.verification_tier || 'TIER_C_DISCOVERY_ONLY';
    canonicalEvent.verification_score = typeof evalResult.verification_score === 'number' ? evalResult.verification_score : (eventData.verification_score || 0);

    canonicalEvent.last_verified_at = evalResult.last_verified_at || eventData.last_verified_at || verifiedAt;
    canonicalEvent.next_verification_at = evalResult.next_verification_at || eventData.next_verification_at || null;

    // Ground-Truth Popularity Scoring
    const popResult = PopularityEngine.calculatePopularity(canonicalEvent, eventData.popularity_signals || {});
    canonicalEvent.popularity_score = popResult.popularity_score;
    canonicalEvent.popularity_confidence = popResult.popularity_confidence;
    canonicalEvent.popularity_signals = popResult.popularity_signals;
    canonicalEvent.context_signals = popResult.context_signals;

    // Deterministic LOCAL_GEMS Evaluation
    const localGemResult = PopularityEngine.evaluateLocalGem(canonicalEvent);
    canonicalEvent.is_local_gem = localGemResult.is_eligible;
    canonicalEvent.local_gems_score = localGemResult.local_gems_score;
    canonicalEvent.local_gems_factors = localGemResult.factors || null;

    // Epic B: Deterministic Event Quality Gate
    const qualityResult = EventQualityGate.evaluateEventQuality(canonicalEvent, canonicalEvent.sources);
    canonicalEvent.event_quality_score = qualityResult.event_quality_score;
    canonicalEvent.marketplace_eligibility = qualityResult.marketplace_eligibility;
    canonicalEvent.quality_factors = qualityResult.quality_factors;
    canonicalEvent.block_reasons = qualityResult.block_reasons;

    // Epic: Authoritative Temporal Lifecycle Resolution
    const resolvedLifecycle = EventTemporalLifecycleEngine.resolveLifecycleStatus(canonicalEvent);
    canonicalEvent.lifecycle_status = resolvedLifecycle;
    if (resolvedLifecycle === LIFECYCLE_STATUS.COMPLETED ||
        resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED ||
        resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS ||
        resolvedLifecycle === LIFECYCLE_STATUS.CANCELLED) {
      canonicalEvent.status = resolvedLifecycle;
      canonicalEvent.event_status = resolvedLifecycle;
    } else if (resolvedLifecycle === LIFECYCLE_STATUS.LIVE) {
      canonicalEvent.status = 'LIVE';
      canonicalEvent.event_status = 'LIVE';
    }

    const isTerminalState = (resolvedLifecycle === LIFECYCLE_STATUS.COMPLETED || resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED || resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS || resolvedLifecycle === LIFECYCLE_STATUS.CANCELLED || canonicalEvent.status === 'CANCELLED');
    canonicalEvent.public_visibility = Boolean(canonicalEvent.is_verified && !isTerminalState);
    canonicalEvent.homepage_visibility = EventTemporalLifecycleEngine.isEventHomepageEligible(canonicalEvent);
    canonicalEvent.public_upcoming = EventTemporalLifecycleEngine.isEventUpcoming(canonicalEvent);
    canonicalEvent.archive_status = (resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED || resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS)
      ? resolvedLifecycle
      : (resolvedLifecycle === LIFECYCLE_STATUS.CANCELLED ? 'CANCELLED' : 'ACTIVE');

    this.events.set(eventId, canonicalEvent);
    this.slugMap.set(slug, eventId);

    try {
      const { state } = require('../database');
      if (state && Array.isArray(state.events)) {
        this.syncToState(state.events);
      }
    } catch (_) {}

    return canonicalEvent;
  }

  /**
   * Updates an existing canonical event from an incoming observation.
   * Enforces:
   * 1. Dual-level authority: Tier 1 Authoritative > Tier 2 Commercial > Tier 3 Social
   * 2. Freshness precedence: newer announcement > older announcement
   * 3. Discrepancies spawn EventConflict entities without silent overwrites
   */
  updateEventFromObservation(eventId, incomingRecord, sourceId, observation = {}) {
    const event = this.getEventById(eventId);
    if (!event) return null;

    // Anti-resurrection guard:
    const isTerminal = (
      event.lifecycle_status === LIFECYCLE_STATUS.COMPLETED ||
      event.lifecycle_status === LIFECYCLE_STATUS.ARCHIVED ||
      event.lifecycle_status === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS ||
      event.status === 'COMPLETED' ||
      event.status === 'CANCELLED' ||
      event.status === 'ARCHIVED'
    );
    if (isTerminal) {
      return {
        event,
        changes: [],
        rejected: 'RESURRECTION_REJECTED_FOR_TERMINAL_EVENT',
        reason: `Event ${eventId} is in terminal lifecycle status ${event.lifecycle_status || event.status} and cannot be resurrected.`
      };
    }

    const srcMeta = sourceRegistry.getSource(sourceId) || {};
    const incomingTier = srcMeta.tier || incomingRecord.tier || 2;
    const now = new Date().toISOString();
    const observedAt = observation.observed_at || now;
    const publishedAt = observation.published_at || incomingRecord.published_at || null;
    const postUrl = observation.post_url || incomingRecord.source_url || null;

    const changes = [];

    // Helper: compares incoming source authority against existing field source authority
    const isFresherThan = (existingFieldMeta) => {
      if (!existingFieldMeta || !existingFieldMeta.value) return true;
      const existingSrc = sourceRegistry.getSource(existingFieldMeta.source_id) || {};
      const existingTier = existingSrc.tier || 2;

      // 1. Tier 1 takes precedence over Tier 2 or 3
      if (incomingTier < existingTier) return true;
      // 2. Lower tier NEVER silently overwrites a higher tier
      if (incomingTier > existingTier) return false;

      // 3. For equal tier, compare published_at or observed_at
      if (publishedAt && existingFieldMeta.published_at) {
        return new Date(publishedAt).getTime() >= new Date(existingFieldMeta.published_at).getTime();
      }
      if (observedAt && existingFieldMeta.observed_at) {
        return new Date(observedAt).getTime() >= new Date(existingFieldMeta.observed_at).getTime();
      }
      return true;
    };

    // 1. Date Change / Reschedule Check
    const incomingDate = incomingRecord.start_date || incomingRecord.date;
    if (incomingDate && incomingDate !== event.start_date) {
      const existingFieldSrc = event.field_provenance?.start_date?.source_id;
      const existingSrc = sourceRegistry.getSource(existingFieldSrc) || {};
      const incomingSrc = sourceRegistry.getSource(sourceId) || {};
      const existingTier = existingSrc.tier || 2;
      const isExplicitReschedule = incomingRecord.status === 'RESCHEDULED';
      const isAuthoritative = sourceRegistry.isAuthoritativeSource(sourceId) || incomingTier === 1;

      const isPromoterOrArtist = (src) => {
        if (!src) return false;
        if (src.trust_level === TRUST_LEVELS.TIER_S) return true;
        if (src.source_id && src.source_id.startsWith('src-promoter-')) return true;
        const type = String(src.source_type || '').toUpperCase();
        return type.includes('PROMOTER') || type.includes('ARTIST') || type.includes('ORGANIZER');
      };

      const isExistingPromoter = isPromoterOrArtist(existingSrc);
      const isIncomingPromoter = isPromoterOrArtist(incomingSrc);

      const canOverwrite = (!isExistingPromoter || isIncomingPromoter)
        ? ((incomingTier < existingTier) || (incomingTier === existingTier && (isExplicitReschedule || isAuthoritative) && isFresherThan(event.field_provenance?.start_date)))
        : isExplicitReschedule;
      if (canOverwrite) {
        const oldDate = event.start_date;
        event.start_date = incomingDate;
        event.date = incomingDate;
        event.end_date = incomingRecord.end_date || incomingDate;
        event.start_at = incomingRecord.start_datetime || `${incomingDate}T19:00:00+07:00`;
        event.start_datetime = event.start_at;
        event.event_start_at = event.start_at;
        event.end_at = incomingRecord.end_datetime || `${incomingDate}T23:00:00+07:00`;
        event.end_datetime = event.end_at;
        event.event_end_at = event.end_at;

        event.lifecycle_status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event);
        if (event.is_verified) {
          event.public_visibility = true;
        }

        const changeType = (incomingRecord.status === 'RESCHEDULED' || event.status === 'RESCHEDULED') ? 'RESCHEDULED' : 'DATE_RESCHEDULED';
        if (incomingRecord.status === 'RESCHEDULED' || changeType === 'RESCHEDULED') {
          event.status = 'RESCHEDULED';
          event.event_status = 'RESCHEDULED';
        }

        event.event_history.push({
          timestamp: now,
          change_type: changeType,
          field: 'start_date',
          old_value: oldDate,
          new_value: incomingDate,
          source_id: sourceId,
          observed_at: observedAt,
          published_at: publishedAt,
          reason: 'Authoritative source announced new date / reschedule'
        });
        changes.push(changeType);

        event.field_provenance.start_date = {
          value: incomingDate,
          source_id: sourceId,
          source_url: postUrl,
          observed_at: observedAt,
          published_at: publishedAt,
          confidence: 'HIGH'
        };
      } else {
        // Discrepancy from secondary/equal tier source -> spawn EventConflict
        // unless incoming observation is older/superseded by current authoritative publication
        const isStaleObservation = publishedAt && event.field_provenance?.start_date?.published_at &&
          new Date(publishedAt).getTime() < new Date(event.field_provenance.start_date.published_at).getTime() &&
          incomingTier >= existingTier;

        if (!isStaleObservation) {
          this.addConflict(event, {
            field: 'start_date',
            source_a: event.field_provenance?.start_date?.source_id || 'existing',
            value_a: event.start_date,
            source_b: sourceId,
            value_b: incomingDate,
            source_a_tier: existingTier,
            source_b_tier: incomingTier,
            reason: `Conflicting event date from source ${sourceId}: ${incomingDate} vs ${event.start_date}`
          });
        }
      }
    }

    // 2. Venue Change Check
    const incomingVenue = incomingRecord.venue_name || incomingRecord.venue;
    if (incomingVenue && incomingVenue.toLowerCase().trim() !== (event.venue_name || '').toLowerCase().trim()) {
      const existingFieldSrc = event.field_provenance?.venue_name?.source_id;
      const existingSrc = sourceRegistry.getSource(existingFieldSrc) || {};
      const existingTier = existingSrc.tier || 2;
      const canOverwrite = (incomingTier < existingTier) || (incomingTier === existingTier && isFresherThan(event.field_provenance?.venue_name));

      if (canOverwrite) {
        const oldVenue = event.venue_name;
        event.venue_name = incomingVenue;
        event.venue = incomingVenue;
        if (incomingRecord.venue_id) event.venue_id = incomingRecord.venue_id;
        if (incomingRecord.city) {
          event.city = incomingRecord.city;
          event.venue_city = incomingRecord.city;
        }

        event.event_history.push({
          timestamp: now,
          change_type: 'VENUE_CHANGED',
          field: 'venue_name',
          old_value: oldVenue,
          new_value: incomingVenue,
          source_id: sourceId,
          observed_at: observedAt,
          published_at: publishedAt,
          reason: 'Authoritative source announced venue relocation'
        });
        changes.push('VENUE_CHANGED');

        event.field_provenance.venue_name = {
          value: incomingVenue,
          source_id: sourceId,
          source_url: postUrl,
          observed_at: observedAt,
          published_at: publishedAt,
          confidence: 'HIGH'
        };
      } else {
        const isStaleObservation = publishedAt && event.field_provenance?.venue_name?.published_at &&
          new Date(publishedAt).getTime() < new Date(event.field_provenance.venue_name.published_at).getTime() &&
          incomingTier >= existingTier;

        if (!isStaleObservation) {
          this.addConflict(event, {
            field: 'venue_name',
            source_a: event.field_provenance?.venue_name?.source_id || 'existing',
            value_a: event.venue_name,
            source_b: sourceId,
            value_b: incomingVenue,
            source_a_tier: existingTier,
            source_b_tier: incomingTier,
            reason: `Conflicting event venue from source ${sourceId}: ${incomingVenue} vs ${event.venue_name}`
          });
        }
      }
    }

    // 3. Lineup / Artists Check
    const incomingArtists = Array.isArray(incomingRecord.artists) ? incomingRecord.artists : (incomingRecord.artist ? [incomingRecord.artist] : []);
    if (incomingArtists.length > 0) {
      const existingArtists = event.artists || [];
      const newArtists = incomingArtists.filter(a => !existingArtists.some(ea => ea.toLowerCase().trim() === a.toLowerCase().trim()));
      if (newArtists.length > 0) {
        const mergedArtists = [...existingArtists, ...newArtists];
        event.artists = mergedArtists;
        event.event_history.push({
          timestamp: now,
          change_type: 'LINEUP_CHANGED',
          field: 'artists',
          old_value: existingArtists,
          new_value: mergedArtists,
          source_id: sourceId,
          observed_at: observedAt,
          published_at: publishedAt,
          reason: `Added artists to lineup: ${newArtists.join(', ')}`
        });
        changes.push('LINEUP_CHANGED');

        event.field_provenance.artists = {
          value: mergedArtists,
          source_id: sourceId,
          source_url: postUrl,
          observed_at: observedAt,
          published_at: publishedAt,
          confidence: 'HIGH'
        };
      }
    }

    // 4. Ticket URL Check
    const incomingTicketUrl = incomingRecord.official_ticket_url || incomingRecord.ticket_url;
    if (incomingTicketUrl && incomingTicketUrl !== event.official_ticket_url) {
      const oldUrl = event.official_ticket_url;
      event.official_ticket_url = incomingTicketUrl;
      event.ticket_url = incomingTicketUrl;

      event.event_history.push({
        timestamp: now,
        change_type: 'TICKET_INFO_CHANGED',
        field: 'official_ticket_url',
        old_value: oldUrl,
        new_value: incomingTicketUrl,
        source_id: sourceId,
        observed_at: observedAt,
        published_at: publishedAt,
        reason: 'Updated official ticketing partner URL'
      });
      changes.push('TICKET_INFO_CHANGED');

      event.field_provenance.official_ticket_url = {
        value: incomingTicketUrl,
        source_id: sourceId,
        source_url: postUrl,
        observed_at: observedAt,
        published_at: publishedAt,
        confidence: 'HIGH'
      };
    }

    // 3. Cancellation Check
    if (incomingRecord.status === 'CANCELLED') {
      const oldStatus = event.status;
      event.status = 'CANCELLED';
      event.event_status = 'CANCELLED';
      event.lifecycle_status = LIFECYCLE_STATUS.CANCELLED;
      event.public_visibility = false;
      event.verification_status = VERIFICATION_STATUS.CANCELLED;
      event.is_verified = false;

      event.event_history.push({
        timestamp: now,
        change_type: 'CANCELLED',
        field: 'status',
        old_value: oldStatus,
        new_value: 'CANCELLED',
        source_id: sourceId,
        observed_at: observedAt,
        published_at: publishedAt,
        reason: 'Official source announced event cancellation'
      });
      changes.push('CANCELLED');

      event.field_provenance.status = {
        value: 'CANCELLED',
        source_id: sourceId,
        source_url: postUrl,
        observed_at: observedAt,
        published_at: publishedAt,
        confidence: 'HIGH'
      };
    }

    // 4. Postponement Check
    if (incomingRecord.status === 'POSTPONED' && event.status !== 'POSTPONED') {
      if (isFresherThan(event.field_provenance.status)) {
        const oldStatus = event.status;
        event.status = 'POSTPONED';
        event.event_status = 'POSTPONED';
        event.verification_status = VERIFICATION_STATUS.POSTPONED;

        event.event_history.push({
          timestamp: now,
          change_type: 'POSTPONED',
          field: 'status',
          old_value: oldStatus,
          new_value: 'POSTPONED',
          source_id: sourceId,
          observed_at: observedAt,
          published_at: publishedAt,
          reason: 'Authoritative source announced event postponement'
        });
        changes.push('POSTPONED');
      }
    }

    // 5. Append Observation
    const obsRecord = new EventSourceObservation({
      source_id: sourceId,
      source_url: postUrl,
      source_external_id: incomingRecord.source_event_identifier || incomingRecord.source_event_id,
      raw_title: incomingRecord.name || incomingRecord.title,
      raw_venue: incomingRecord.venue_name || incomingRecord.venue,
      raw_city: incomingRecord.city || incomingRecord.venue_city,
      raw_start_at: incomingDate,
      raw_ticket_url: incomingRecord.official_ticket_url || null,
      raw_status: incomingRecord.status || 'UPCOMING',
      observed_at: observedAt,
      published_at: publishedAt,
      raw_payload_reference: observation.observation_id || null
    });

    event.observations.push(obsRecord.toJSON());
    this.addSourceRecord(eventId, incomingRecord);

    if (postUrl && !event.source_url) {
      event.source_url = postUrl;
    }
    const hash = (observation && observation.content_hash) || (obsRecord && obsRecord.content_hash);
    if (hash && !event.evidence_hash) {
      event.evidence_hash = hash;
    }
    if (event.is_verified && !event.verified_at) {
      event.verified_at = now;
    }

    event.last_seen_at = now;
    event.last_checked_at = now;
    event.updated_at = now;
    event.expires_at = this.computeExpirationDate(event.start_date, new Date(now));
    event.update_priority = this.computeUpdatePriority(event.start_date);

    if (incomingRecord.artist_official_url) event.artist_official_url = incomingRecord.artist_official_url;
    if (incomingRecord.artist_official_source_type) event.artist_official_source_type = incomingRecord.artist_official_source_type;
    if (incomingRecord.artist_verification_status) event.artist_verification_status = incomingRecord.artist_verification_status;
    if (incomingRecord.promoter_official_url) event.promoter_official_url = incomingRecord.promoter_official_url;
    if (incomingRecord.promoter_verification_status) event.promoter_verification_status = incomingRecord.promoter_verification_status;
    if (incomingRecord.official_event_url) event.event_official_url = incomingRecord.official_event_url;
    if (incomingRecord.official_ticket_url) event.ticketing_official_url = incomingRecord.official_ticket_url;

    if (event.status !== 'CANCELLED' && event.lifecycle_status !== LIFECYCLE_STATUS.CANCELLED) {
      const reEval = EventVerificationService.evaluateEvent(event, event.sources || []);
      event.verification_status = reEval.verification_status;
      event.verification_confidence = reEval.verification_confidence;
      event.is_verified = (reEval.verification_status === VERIFICATION_STATUS.VERIFIED || reEval.verification_status === 'PRIMARY_SOURCE_VERIFIED');
      event.artist_official_url = reEval.artist_official_url || event.artist_official_url;
      event.artist_official_source_type = reEval.artist_official_source_type || event.artist_official_source_type;
      event.artist_verification_status = reEval.artist_verification_status || event.artist_verification_status;
      event.promoter_official_url = reEval.promoter_official_url || event.promoter_official_url;
      event.promoter_verification_status = reEval.promoter_verification_status || event.promoter_verification_status;
      event.event_official_url = reEval.event_official_url || event.event_official_url;
      event.event_verification_status = reEval.event_verification_status || event.event_verification_status;
      event.ticketing_official_url = reEval.ticketing_official_url || event.ticketing_official_url;
      event.ticketing_verification_status = reEval.ticketing_verification_status || event.ticketing_verification_status;
      event.venue_verification_status = reEval.venue_verification_status || event.venue_verification_status;
      event.verification_tier = reEval.verification_tier || event.verification_tier;
      event.verification_score = typeof reEval.verification_score === 'number' ? reEval.verification_score : event.verification_score;
      event.last_verified_at = reEval.last_verified_at || event.last_verified_at;
      event.next_verification_at = reEval.next_verification_at || event.next_verification_at;
    } else {
      event.verification_status = VERIFICATION_STATUS.CANCELLED;
      event.is_verified = false;
      event.public_visibility = false;
      event.lifecycle_status = LIFECYCLE_STATUS.CANCELLED;
      event.status = 'CANCELLED';
    }

    return { event, changes };
  }

  addConflict(event, conflictData) {
    event.conflicts = event.conflicts || [];
    const existing = event.conflicts.find(c => c.field === conflictData.field && c.source_b === conflictData.source_b);
    if (!existing) {
      const conflict = new EventConflict({
        event_id: event.event_id,
        ...conflictData
      });
      event.conflicts.push(conflict.toJSON());
    }
    const evalResult = EventVerificationService.evaluateEvent(event, event.sources || []);
    event.verification_status = evalResult.verification_status;
    event.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED || evalResult.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    event.verification_tier = evalResult.verification_tier;
    event.verification_score = evalResult.verification_score;
  }

  addSourceRecord(eventId, sourceRecord) {
    const event = this.getEventById(eventId);
    if (!event) return null;

    const existingIdx = event.sources.findIndex(s => s.source_id === sourceRecord.source_id);
    if (existingIdx >= 0) {
      event.sources[existingIdx] = {
        ...event.sources[existingIdx],
        ...sourceRecord,
        retrieved_at: new Date().toISOString()
      };
    } else {
      event.sources.push({
        ...sourceRecord,
        source_id: sourceRecord.source_id,
        source_name: sourceRecord.source_name || sourceRecord.source_id,
        tier: sourceRecord.tier || 2,
        trust_level: sourceRecord.trust_level || TRUST_LEVELS.TIER_5,
        source_url: sourceRecord.source_url || null,
        source_event_identifier: sourceRecord.source_event_identifier || null,
        start_date: sourceRecord.start_date || sourceRecord.date || null,
        venue_name: sourceRecord.venue_name || null,
        retrieved_at: new Date().toISOString()
      });
    }

    event.source_count = event.sources.length;
    event.updated_at = new Date().toISOString();

    // Visual provenance re-resolution: when new evidence carrying official poster
    // art arrives, the official image supersedes a missing or placeholder visual.
    // Mirrors the verification re-evaluation below (evidence-driven, never fabricated).
    if (sourceRecord.image_url || sourceRecord.poster_url || sourceRecord.event_image) {
      try {
        const visual = EventVisualProvenanceService.resolveEventImage(event, event.sources);
        if (visual && visual.image_url && visual.is_fallback !== true) {
          event.image_url = visual.image_url;
          event.thumbnail_url = visual.thumbnail_url;
          event.image_source_type = visual.image_source_type;
          event.image_source_url = visual.image_source_url;
          event.image_source_account = visual.image_source_account;
          event.image_source_tier = visual.image_source_tier;
          event.image_last_checked_at = visual.image_last_checked_at;
          event.image_evidence_hash = visual.image_evidence_hash;
          event.image_license_status = visual.image_license_status;
          event.image_status = visual.image_status;
          event.image_scope = visual.image_scope;
          event.image_credit = visual.image_credit;
          event.is_fallback_image = false;
          event.fallback_meta = null;
          event.event_image = visual.image_url;
          event.poster_url = visual.image_url;
        }
      } catch (_) {
        // Visual provenance failure must never block canonical reconciliation.
      }
    }

    // Re-evaluate verification
    const evalResult = EventVerificationService.evaluateEvent(event, event.sources);
    if (event.status !== 'CANCELLED' && event.status !== 'POSTPONED') {
      if (evalResult.conflicts && evalResult.conflicts.length > 0) {
        event.conflicts = evalResult.conflicts;
        event.verification_status = evalResult.verification_status;
        event.verification_confidence = evalResult.verification_confidence;
        event.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED || evalResult.verification_status === 'PRIMARY_SOURCE_VERIFIED');
      } else if (!event.conflicts || event.conflicts.length === 0) {
        event.verification_status = evalResult.verification_status;
        event.verification_confidence = evalResult.verification_confidence;
        event.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED || evalResult.verification_status === 'PRIMARY_SOURCE_VERIFIED');
      }
    }

    const qualityResult = EventQualityGate.evaluateEventQuality(event, event.sources);
    event.event_quality_score = qualityResult.event_quality_score;
    event.marketplace_eligibility = qualityResult.marketplace_eligibility;
    event.quality_factors = qualityResult.quality_factors;
    event.block_reasons = qualityResult.block_reasons;

    // Epic: Authoritative Temporal Lifecycle Resolution
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    event.event_start_at = temporal.event_start_at;
    event.event_end_at = temporal.event_end_at;
    event.event_timezone = temporal.event_timezone;
    event.archive_at = temporal.archive_at;
    event.start_datetime = temporal.event_start_at;
    event.end_datetime = temporal.event_end_at;

    const resolvedLifecycle = EventTemporalLifecycleEngine.resolveLifecycleStatus(event);
    event.lifecycle_status = resolvedLifecycle;
    if (resolvedLifecycle === LIFECYCLE_STATUS.COMPLETED ||
        resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED ||
        resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS ||
        resolvedLifecycle === LIFECYCLE_STATUS.CANCELLED) {
      event.status = resolvedLifecycle;
      event.event_status = resolvedLifecycle;
    } else if (resolvedLifecycle === LIFECYCLE_STATUS.LIVE) {
      event.status = 'LIVE';
      event.event_status = 'LIVE';
    }

    const isTerminalState = (resolvedLifecycle === LIFECYCLE_STATUS.COMPLETED || resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED || resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS || resolvedLifecycle === LIFECYCLE_STATUS.CANCELLED || event.status === 'CANCELLED');
    event.public_visibility = Boolean(event.is_verified && !isTerminalState);
    event.homepage_visibility = EventTemporalLifecycleEngine.isEventHomepageEligible(event);
    event.public_upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event);
    event.archive_status = (resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED || resolvedLifecycle === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS)
      ? resolvedLifecycle
      : (resolvedLifecycle === LIFECYCLE_STATUS.CANCELLED ? 'CANCELLED' : 'ACTIVE');

    return event;
  }

  /**
   * Temporal expiration scanner.
   * Flags stale events past expires_at as EXPIRED.
   */
  checkAndExpireEvents() {
    const now = Date.now();
    const expiredEvents = [];

    for (const event of this.events.values()) {
      if (event.status === 'CANCELLED' || event.status === 'COMPLETED' || event.verification_status === VERIFICATION_STATUS.EXPIRED) {
        continue;
      }
      if (event.expires_at && now > new Date(event.expires_at).getTime()) {
        event.verification_status = VERIFICATION_STATUS.EXPIRED;
        event.is_verified = false;
        event.verification_reasons.push('Verification expired due to temporal TTL threshold');
        event.event_history.push({
          timestamp: new Date().toISOString(),
          change_type: 'VERIFICATION_EXPIRED',
          field: 'verification_status',
          old_value: 'VERIFIED',
          new_value: 'EXPIRED',
          reason: 'Authoritative evidence TTL elapsed without corroborating sync'
        });
        const qualityResult = EventQualityGate.evaluateEventQuality(event, event.sources);
        event.event_quality_score = qualityResult.event_quality_score;
        event.marketplace_eligibility = qualityResult.marketplace_eligibility;
        event.quality_factors = qualityResult.quality_factors;
        event.block_reasons = qualityResult.block_reasons;
        expiredEvents.push(event.event_id);
      }
    }
    return expiredEvents;
  }

  getEventById(id) {
    return this.events.get(id) || null;
  }

  getEventBySlug(slug) {
    const id = this.slugMap.get(slug);
    if (id) return this.events.get(id) || null;
    return this.events.get(slug) || null;
  }

  getAllEvents() {
    return Array.from(this.events.values());
  }

  getUpcomingEvents(now = new Date()) {
    return this.getAllEvents().filter(e => EventTemporalLifecycleEngine.isEventUpcoming(e, now));
  }

  getHomepageEvents(now = new Date()) {
    return this.getAllEvents().filter(e => EventTemporalLifecycleEngine.isEventHomepageEligible(e, now));
  }

  getArchivedEvents(now = new Date()) {
    return this.getAllEvents().filter(e => 
      e.archive_status === 'ARCHIVED' || 
      e.archive_status === 'ARCHIVED_WITH_OPEN_OPERATIONS' || 
      e.lifecycle_status === 'ARCHIVED' || 
      e.lifecycle_status === 'ARCHIVED_WITH_OPEN_OPERATIONS'
    );
  }

  /**
   * Synchronizes with state.events (Marketplace Invariant Bridge).
   * Ensures that all canonical events exist inside state.events for marketplace queries,
   * without creating listings, inventory, or coupling orders.
   */
  syncToState(stateEventsArray) {
    if (!Array.isArray(stateEventsArray)) return;

    for (const canonical of this.events.values()) {
      const existingIdx = stateEventsArray.findIndex(e => e.id === canonical.event_id || e.id === canonical.id);
      if (existingIdx >= 0) {
        stateEventsArray[existingIdx] = {
          ...stateEventsArray[existingIdx],
          ...canonical,
          id: canonical.event_id,
          name: canonical.canonical_name || stateEventsArray[existingIdx].name,
          title: canonical.canonical_name || stateEventsArray[existingIdx].title,
          event_start_at: canonical.event_start_at,
          event_end_at: canonical.event_end_at,
          event_timezone: canonical.event_timezone,
          archive_at: canonical.archive_at,
          lifecycle_status: canonical.lifecycle_status,
          is_verified: canonical.is_verified,
          verification_status: canonical.verification_status,
          source_url: canonical.source_url,
          evidence_hash: canonical.evidence_hash,
          verified_at: canonical.verified_at,
          status: canonical.status,
          archive_status: canonical.archive_status,
          homepage_visibility: canonical.homepage_visibility,
          public_upcoming: canonical.public_upcoming
        };
      } else {
        stateEventsArray.push({
          ...canonical,
          id: canonical.event_id,
          archive_status: canonical.archive_status,
          homepage_visibility: canonical.homepage_visibility,
          public_upcoming: canonical.public_upcoming
        });
      }
    }
  }

  /**
   * Imports existing legacy/seeded events from state.events into Canonical Registry.
   */
  importLegacyEvents(legacyEvents) {
    if (!Array.isArray(legacyEvents)) return;

    for (const leg of legacyEvents) {
      const normTitle = EventNormalizationService.normalizeTitle(leg.name || leg.title);
      const venueNorm = EventNormalizationService.normalizeVenue(leg.venue_name || leg.venue, leg.venue_city || leg.city);
      const dtNorm = EventNormalizationService.normalizeDateTime(leg.start_date || leg.date);

      // Seed / legacy records are CLAIMS ONLY. They are never treated as authoritative
      // evidence: they are stored against the non-authoritative legacy-seed source and
      // can only become public through a separate verified evidence record.
      const sources = [{
        source_id: 'src-legacy-seed',
        source_name: 'Legacy / Seed Claim (Unverified)',
        tier: 4,
        authority_level: 'NONE',
        trust_level: TRUST_LEVELS.TIER_5,
        source_url: leg.source_url || leg.official_link || null,
        source_account: leg.source_account || null,
        source_type: leg.source_type || null,
        retrieved_at: leg.source_last_checked_at || new Date().toISOString()
      }];

      this.createEvent({
        event_id: leg.id,
        slug: leg.slug,
        canonical_name: normTitle,
        category: leg.category,
        start_date: leg.start_date || dtNorm.date,
        start_time: leg.start_time || null,
        start_datetime: leg.start_datetime || leg.event_start_at || null,
        event_start_at: leg.event_start_at || leg.start_datetime || null,
        end_date: leg.end_date || null,
        end_time: leg.end_time || null,
        end_datetime: leg.end_datetime || leg.event_end_at || null,
        event_end_at: leg.event_end_at || leg.end_datetime || null,
        archive_at: leg.archive_at || null,
        venue_id: leg.venue_id || venueNorm.venue_id,
        venue_name: leg.venue_name || venueNorm.venue_name,
        city: leg.venue_city || venueNorm.city,
        admission_protocol: leg.admission_protocol,
        status: leg.status || 'UPCOMING',
        official_event_url: leg.official_link,
        official_ticket_url: leg.official_link,
        official_event_url: leg.official_link || leg.official_event_url,
        official_ticket_url: leg.official_link || leg.official_ticket_url,
        sources: sources,
        source: leg.source || 'SEED',
        is_verified: leg.is_verified === true,
        verification_status: leg.is_verified ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: leg.is_verified ? 95 : 30,
        claimed_source_id: leg.source_id || null,
        claimed_verification_status: leg.verification_status || (leg.is_verified ? 'VERIFIED' : 'UNVERIFIED'),
        claimed_official_link: leg.official_link || null,
        source_type: leg.source_type || null,
        source_url: leg.source_url || null,
        source_account: leg.source_account || null,
        source_published_at: leg.source_published_at || null,
        source_last_checked_at: leg.source_last_checked_at || null,
        evidence_hash: null,
        verified_at: null,
        inventory_class: leg.inventory_class || null,
        artists: leg.artists || []
      });
    }
  }

  /**
   * Refreshes freshness and evaluates STALE / EXPIRED lifecycle transitions
   */
  refreshFreshness(now = new Date()) {
    const nowObj = (now instanceof Date) ? now : new Date(now);
    let staleCount = 0;
    let expiredCount = 0;

    for (const event of this.events.values()) {
      EventTemporalLifecycleEngine.reconcileEvent(event, nowObj);
      const evalResult = EventVerificationService.evaluateEvent(event, event.sources || [], { now: nowObj });
      if (evalResult.verification_status === VERIFICATION_STATUS.STALE) {
        staleCount++;
        const hasAuthoritative = (event.sources || []).some(s => sourceRegistry.isAuthoritativeSource(s.source_id));
        if (hasAuthoritative) {
          event.last_verified_at = nowObj.toISOString();
          event.verification_status = VERIFICATION_STATUS.VERIFIED;
          event.is_verified = true;
        } else {
          event.verification_status = VERIFICATION_STATUS.STALE;
          event.is_verified = false;
        }
      } else if (evalResult.verification_status === VERIFICATION_STATUS.EXPIRED) {
        expiredCount++;
        event.verification_status = VERIFICATION_STATUS.EXPIRED;
        event.is_verified = false;
        event.public_visibility = false;
      }
    }

    return { stale_count: staleCount, expired_count: expiredCount, total_events: this.events.size };
  }

  reset() {
    this.events.clear();
    this.slugMap.clear();
  }
}

const canonicalRegistryInstance = new CanonicalEventRegistry();

module.exports = {
  CanonicalEventRegistry,
  canonicalRegistry: canonicalRegistryInstance
};
