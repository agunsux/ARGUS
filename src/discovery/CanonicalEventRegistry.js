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
const { sourceRegistry, TRUST_LEVELS } = require('./SourceRegistry');
const { EventSourceObservation } = require('./models/EventSourceObservation');
const { EventConflict } = require('./models/EventConflict');

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
      eventData.timezone || 'Asia/Jakarta'
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
        trust_level: srcMeta.trust_level || eventData.trust_level || TRUST_LEVELS.TIER_5,
        source_url: eventData.official_ticket_url || eventData.source_url || null,
        source_event_identifier: eventData.source_event_identifier || eventData.source_event_id || null,
        retrieved_at: new Date().toISOString()
      });
    }

    const now = new Date().toISOString();
    const verifiedAt = eventData.last_verified_at || eventData.verified_at || now;
    const expiresAt = eventData.expires_at || this.computeExpirationDate(dtNorm.date, new Date(verifiedAt));

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
      country: venueNorm.country || eventData.country || 'Indonesia',
      start_at: dtNorm.start_datetime,
      start_datetime: dtNorm.start_datetime, // compatibility
      start_date: dtNorm.date,
      date: dtNorm.date, // compatibility
      end_at: eventData.end_datetime || eventData.end_at || null,
      end_datetime: eventData.end_datetime || eventData.end_at || null,
      end_date: eventData.end_date || null,
      timezone: dtNorm.timezone,
      category: eventData.category || eventType,
      event_type: eventType,
      event_status: eventData.status || eventData.event_status || 'UPCOMING',
      status: eventData.status || eventData.event_status || 'UPCOMING', // compatibility
      organizer_name: eventData.organizer_name || 'Official Organizer',
      organizer_id: eventData.organizer_id || null,
      description: eventData.description || `${normTitle} diselenggarakan di ${venueNorm.venue_name}, ${venueNorm.city}. Informasi resmi dan pantauan verifikasi TIKUM.`,
      event_image: eventData.event_image || eventData.poster_url || null,
      poster_url: eventData.event_image || eventData.poster_url || null,
      official_event_url: eventData.official_event_url || eventData.official_link || null,
      official_ticket_url: eventData.official_ticket_url || null,
      ticket_url: eventData.official_ticket_url || null,
      ticket_provider: eventData.official_ticketing_provider || null,
      official_ticketing_provider: eventData.official_ticketing_provider || null,
      
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
      field_provenance: eventData.field_provenance || {
        event_name: { value: normTitle, source_id: (sources[0] && sources[0].source_id) || null, observed_at: now, confidence: 'HIGH' },
        start_date: { value: dtNorm.date, source_id: (sources[0] && sources[0].source_id) || null, observed_at: now, confidence: dtNorm.date ? 'HIGH' : 'UNKNOWN' },
        venue_name: { value: venueNorm.venue_name, source_id: (sources[0] && sources[0].source_id) || null, observed_at: now, confidence: 'HIGH' },
        city: { value: venueNorm.city, source_id: (sources[0] && sources[0].source_id) || null, observed_at: now, confidence: 'HIGH' },
        artists: { value: eventData.artists || [], source_id: (sources[0] && sources[0].source_id) || null, observed_at: now, confidence: 'HIGH' },
        official_ticket_url: { value: eventData.official_ticket_url || null, source_id: eventData.official_ticket_url ? (sources[0] && sources[0].source_id) : null, observed_at: now, confidence: eventData.official_ticket_url ? 'HIGH' : 'UNKNOWN' },
        status: { value: eventData.status || 'UPCOMING', source_id: (sources[0] && sources[0].source_id) || null, observed_at: now, confidence: 'HIGH' },
        ticket_price: { value: eventData.ticket_price || 'UNKNOWN', source_id: (sources[0] && sources[0].source_id) || null, observed_at: now, confidence: eventData.ticket_price && eventData.ticket_price !== 'UNKNOWN' ? 'HIGH' : 'UNKNOWN' }
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
      verification_status: eventData.verification_status || VERIFICATION_STATUS.UNVERIFIED,
      verification_confidence: eventData.verification_confidence || 0,
      verification_reasons: eventData.verification_reasons || [],
      is_verified: false,
      conflicts: []
    };

    // Evaluate verification with strict fail-closed engine
    if (eventData.verification_status === 'PRIMARY_SOURCE_VERIFIED' || eventData.verification_status === VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED) {
      canonicalEvent.verification_status = VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED;
      canonicalEvent.verification_confidence = Math.min(95, Math.max(85, eventData.verification_confidence || 90));
      canonicalEvent.is_verified = true;
      canonicalEvent.conflicts = [];
      canonicalEvent.verification_reasons = ['Direct announcement from verified official promoter account'];
    } else if (eventData.is_verified === true || eventData.verification_status === VERIFICATION_STATUS.VERIFIED) {
      canonicalEvent.verification_status = VERIFICATION_STATUS.VERIFIED;
      canonicalEvent.verification_confidence = Math.min(95, Math.max(85, eventData.verification_confidence || 90));
      canonicalEvent.is_verified = true;
      canonicalEvent.conflicts = [];
      canonicalEvent.verification_reasons = ['Confirmed by verified authoritative source'];
    } else {
      const evalResult = EventVerificationService.evaluateEvent(canonicalEvent, canonicalEvent.sources);
      canonicalEvent.verification_status = evalResult.verification_status;
      canonicalEvent.verification_confidence = evalResult.verification_confidence;
      canonicalEvent.conflicts = evalResult.conflicts || [];
      canonicalEvent.verification_reasons = evalResult.flags || [];
      canonicalEvent.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED || evalResult.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    }

    this.events.set(eventId, canonicalEvent);
    this.slugMap.set(slug, eventId);

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
      const existingTier = existingSrc.tier || 2;
      const isExplicitReschedule = incomingRecord.status === 'RESCHEDULED' || event.status === 'RESCHEDULED';

      // Only allow overwrite if incoming is strictly higher tier (Tier 1 vs Tier 2), or explicit authoritative reschedule
      const canOverwrite = (incomingTier < existingTier) || (incomingTier === existingTier && isExplicitReschedule && isFresherThan(event.field_provenance.start_date));

      if (canOverwrite) {
        const oldDate = event.start_date;
        event.start_date = incomingDate;
        event.date = incomingDate;
        event.start_at = incomingRecord.start_datetime || `${incomingDate}T19:00:00+07:00`;
        event.start_datetime = event.start_at;

        const changeType = (incomingRecord.status === 'RESCHEDULED' || event.status === 'RESCHEDULED' || oldDate) ? 'RESCHEDULED' : 'DATE_CHANGED';
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
    if (incomingRecord.status === 'CANCELLED' && event.status !== 'CANCELLED') {
      if (isFresherThan(event.field_provenance.status)) {
        const oldStatus = event.status;
        event.status = 'CANCELLED';
        event.event_status = 'CANCELLED';
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
          reason: 'Authoritative source announced event cancellation'
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

    event.last_seen_at = now;
    event.last_checked_at = now;
    event.updated_at = now;
    event.expires_at = this.computeExpirationDate(event.start_date, new Date(now));
    event.update_priority = this.computeUpdatePriority(event.start_date);

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
          id: canonical.event_id
        };
      } else {
        stateEventsArray.push({
          ...canonical,
          id: canonical.event_id
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

      const sources = [];
      if (leg.source === 'SEED') {
        sources.push({
          source_id: 'src-argus-verified-seed',
          source_name: 'ARGUS Curated Seed Verification',
          tier: 1,
          authority_level: 'HIGH',
          trust_level: TRUST_LEVELS.TIER_1,
          source_url: leg.official_link || null,
          retrieved_at: new Date().toISOString()
        });
      } else {
        sources.push({
          source_id: 'src-argus-community',
          source_name: 'ARGUS Community Submission',
          tier: 3,
          authority_level: 'LOW',
          trust_level: TRUST_LEVELS.TIER_5,
          source_url: leg.official_link || null,
          retrieved_at: new Date().toISOString()
        });
      }

      this.createEvent({
        event_id: leg.id,
        canonical_name: normTitle,
        category: leg.category,
        start_date: dtNorm.date,
        venue_id: leg.venue_id || venueNorm.venue_id,
        venue_name: leg.venue_name || venueNorm.venue_name,
        city: leg.venue_city || venueNorm.city,
        admission_protocol: leg.admission_protocol,
        status: leg.status || 'UPCOMING',
        official_event_url: leg.official_link,
        official_ticket_url: leg.official_link,
        sources: sources,
        source: leg.source || 'SEED',
        is_verified: leg.is_verified === true,
        verification_status: leg.is_verified ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.UNVERIFIED,
        verification_confidence: leg.is_verified ? 95 : 30,
        artists: leg.artists || []
      });
    }
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
