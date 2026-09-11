/**
 * ARGUS Canonical Event Registry (Epic: Event Discovery & SEO Engine)
 * 
 * Canonical Single Source of Truth for events in Indonesia.
 * Maintains canonical event entities, multiple source records (provenance),
 * and syncs with state.events for seamless marketplace listing attachment.
 */

const { v4: uuidv4 } = require('uuid');
const { EventNormalizationService, EVENT_TYPES } = require('./EventNormalizationService');
const { EventVerificationService, VERIFICATION_STATUS } = require('./EventVerificationService');
const { sourceRegistry, TRUST_LEVELS } = require('./SourceRegistry');

class CanonicalEventRegistry {
  constructor() {
    this.events = new Map(); // slug or event_id -> canonicalEvent
    this.slugMap = new Map(); // slug -> event_id
  }

  /**
   * Creates or registers a canonical event.
   */
  createEvent(eventData) {
    const eventId = eventData.event_id || eventData.id || `ev-can-${uuidv4().substring(0, 8)}`;
    const title = eventData.canonical_name || eventData.name || eventData.title;
    if (!title) {
      throw new Error('Event must have canonical_name or title');
    }

    const normTitle = EventNormalizationService.normalizeTitle(title);
    const date = eventData.start_date || (eventData.start_datetime ? eventData.start_datetime.substring(0, 10) : eventData.date);
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
        trust_level: srcMeta.trust_level || eventData.trust_level || TRUST_LEVELS.TIER_5,
        source_url: eventData.official_ticket_url || eventData.source_url || null,
        source_event_identifier: eventData.source_event_identifier || null,
        retrieved_at: new Date().toISOString()
      });
    }

    const now = new Date().toISOString();
    const canonicalEvent = {
      event_id: eventId,
      id: eventId, // compatibility with marketplace
      canonical_name: normTitle,
      name: normTitle, // compatibility
      title: normTitle, // compatibility
      slug: slug,
      event_type: eventType,
      category: eventData.category || eventType, // compatibility
      description: eventData.description || `${normTitle} diselenggarakan di ${venueNorm.venue_name}, ${venueNorm.city}. Dapatkan informasi resmi dan tiket terverifikasi di Tikum.`,
      start_datetime: dtNorm.start_datetime,
      start_date: dtNorm.date,
      date: dtNorm.date, // compatibility
      end_datetime: eventData.end_datetime || null,
      end_date: eventData.end_date || null,
      timezone: dtNorm.timezone,
      venue_id: venueNorm.venue_id || eventData.venue_id || null,
      venue_name: venueNorm.venue_name,
      venue: venueNorm.venue_name, // compatibility
      city: venueNorm.city,
      venue_city: venueNorm.city, // compatibility
      province: venueNorm.province,
      country: venueNorm.country,
      organizer_id: eventData.organizer_id || null,
      organizer_name: eventData.organizer_name || 'Official Organizer',
      status: eventData.status || 'UPCOMING',
      event_image: eventData.event_image || eventData.poster_url || null,
      poster_url: eventData.event_image || eventData.poster_url || null,
      official_event_url: eventData.official_event_url || eventData.official_link || null,
      official_ticket_url: eventData.official_ticket_url || null,
      official_ticketing_provider: eventData.official_ticketing_provider || null,
      admission_protocol: eventData.admission_protocol || {
        type: 'BARCODE_PLUS_ID',
        description: 'Pemeriksaan tiket resmi promotor dan verifikasi identitas di venue acara oleh Event PIC Tikum',
        required_items: ['E-Ticket / QR Code resmi', 'KTP / Identitas Asli'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Promoter & Venue Security'
      },
      field_provenance: eventData.field_provenance || {
        event_name: {
          value: normTitle,
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || null,
          source_url: eventData.source_url || (sources[0] && sources[0].source_url) || null,
          observed_at: now,
          published_at: eventData.published_at || null,
          confidence: 'HIGH'
        },
        start_date: {
          value: dtNorm.date,
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || null,
          source_url: eventData.source_url || (sources[0] && sources[0].source_url) || null,
          observed_at: now,
          published_at: eventData.published_at || null,
          confidence: dtNorm.date ? 'HIGH' : 'UNKNOWN'
        },
        start_time: {
          value: eventData.time || null,
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || null,
          source_url: eventData.source_url || null,
          observed_at: now,
          confidence: eventData.time ? 'HIGH' : 'UNKNOWN'
        },
        venue_name: {
          value: venueNorm.venue_name,
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || null,
          source_url: eventData.source_url || null,
          observed_at: now,
          confidence: venueNorm.venue_name ? 'HIGH' : 'UNKNOWN'
        },
        city: {
          value: venueNorm.city,
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || null,
          source_url: eventData.source_url || null,
          observed_at: now,
          confidence: venueNorm.city ? 'HIGH' : 'UNKNOWN'
        },
        artists: {
          value: eventData.artists || [],
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || null,
          source_url: eventData.source_url || null,
          observed_at: now,
          confidence: (eventData.artists && eventData.artists.length > 0) ? 'HIGH' : 'UNKNOWN'
        },
        official_ticket_url: {
          value: eventData.official_ticket_url || null,
          source_id: eventData.official_ticket_url ? (eventData.source_id || (sources[0] && sources[0].source_id)) : null,
          source_url: eventData.official_ticket_url || null,
          observed_at: eventData.official_ticket_url ? now : null,
          confidence: eventData.official_ticket_url ? 'HIGH' : 'UNKNOWN'
        },
        ticket_price: {
          value: eventData.ticket_price || 'UNKNOWN',
          source_id: eventData.ticket_price ? eventData.source_id : null,
          source_url: null,
          observed_at: eventData.ticket_price ? now : null,
          confidence: eventData.ticket_price ? 'HIGH' : 'UNKNOWN'
        },
        status: {
          value: eventData.status || 'UPCOMING',
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || null,
          source_url: eventData.source_url || null,
          observed_at: now,
          confidence: 'HIGH'
        }
      },
      observations: Array.isArray(eventData.observations) ? [...eventData.observations] : (eventData.observation ? [eventData.observation] : []),
      event_history: Array.isArray(eventData.event_history) ? [...eventData.event_history] : [
        {
          timestamp: now,
          change_type: 'INITIAL_ANNOUNCEMENT',
          field: 'all',
          old_value: null,
          new_value: { name: normTitle, date: dtNorm.date, venue: venueNorm.venue_name },
          source_id: eventData.source_id || (sources[0] && sources[0].source_id) || 'system',
          reason: 'Initial canonical event created'
        }
      ],
      update_priority: this.computeUpdatePriority(dtNorm.date),
      sources: sources,
      source_count: sources.length,
      verification_status: eventData.verification_status || VERIFICATION_STATUS.DISCOVERED,
      verification_confidence: eventData.verification_confidence || 0,
      is_verified: false, // will evaluate below
      conflicts: [],
      created_at: eventData.created_at || now,
      updated_at: now,
      last_verified_at: eventData.last_verified_at || now,
      artists: eventData.artists || []
    };

    // Evaluate verification and confidence
    if (eventData.is_verified === true || eventData.verification_status === VERIFICATION_STATUS.VERIFIED) {
      canonicalEvent.verification_status = VERIFICATION_STATUS.VERIFIED;
      canonicalEvent.verification_confidence = Math.max(90, eventData.verification_confidence || 95);
      canonicalEvent.is_verified = true;
      canonicalEvent.conflicts = [];
    } else if (eventData.verification_status === VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED) {
      canonicalEvent.verification_status = VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED;
      canonicalEvent.verification_confidence = Math.max(85, eventData.verification_confidence || 90);
      canonicalEvent.is_verified = true;
      canonicalEvent.conflicts = [];
    } else {
      const evalResult = EventVerificationService.evaluateEvent(canonicalEvent, canonicalEvent.sources);
      canonicalEvent.verification_status = evalResult.verification_status;
      canonicalEvent.verification_confidence = evalResult.verification_confidence;
      canonicalEvent.conflicts = evalResult.conflicts;
      canonicalEvent.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED || evalResult.verification_status === VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED);
    }

    this.events.set(eventId, canonicalEvent);
    this.slugMap.set(slug, eventId);

    return canonicalEvent;
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
   * Updates an existing canonical event from an incoming observation.
   * Enforces dual-level authority:
   * 1. Account authority (Tier S vs Secondary)
   * 2. Observation freshness (newer post > older post, never let stale post overwrite newer announcement)
   * Maintains immutable event history and preserves all observations.
   */
  updateEventFromObservation(eventId, incomingRecord, sourceId, observation = {}) {
    const event = this.getEventById(eventId);
    if (!event) return null;

    const now = new Date().toISOString();
    const obsId = observation.observation_id || `obs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const observedAt = observation.observed_at || now;
    const publishedAt = observation.published_at || incomingRecord.published_at || null;
    const postUrl = observation.post_url || incomingRecord.source_url || null;
    const fingerprint = observation.content_fingerprint || null;

    const isPrimarySource = incomingRecord.trust_level === TRUST_LEVELS.TIER_S || 
                            incomingRecord.source_type === 'PROMOTER_OFFICIAL_SOCIAL' || 
                            incomingRecord.source_role === 'PRIMARY_EVENT_SOURCE';

    const changes = [];

    // Helper to test if incoming observation is fresher than current field observation
    const isFresherThan = (existingFieldMeta) => {
      if (!existingFieldMeta || !existingFieldMeta.value) return true;

      const existingIsTierS = existingFieldMeta.source_id && 
        (existingFieldMeta.source_id.includes('promoter') || existingFieldMeta.source_id.includes('apmi'));

      // 1. Tier S Primary Source takes precedence over secondary source
      if (isPrimarySource && !existingIsTierS) {
        return true;
      }
      // 2. Secondary source NEVER overrides a verified Tier S primary source!
      if (!isPrimarySource && existingIsTierS) {
        return false;
      }

      // 3. For sources of equal tier, compare published_at first, then observed_at
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
      if (isFresherThan(event.field_provenance.start_date)) {
        const oldDate = event.start_date;
        event.start_date = incomingDate;
        event.date = incomingDate;
        if (incomingRecord.start_datetime) event.start_datetime = incomingRecord.start_datetime;

        const changeType = (incomingRecord.status === 'RESCHEDULED' || event.status === 'RESCHEDULED' || oldDate) ? 'RESCHEDULED' : 'DATE_CHANGED';
        if (incomingRecord.status === 'RESCHEDULED' || changeType === 'RESCHEDULED') {
          event.status = 'RESCHEDULED';
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
          reason: 'Promoter announced new date / reschedule'
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
        // Conflicting observation from secondary source!
        event.conflicts = event.conflicts || [];
        const existingConf = event.conflicts.find(c => c.field === 'start_date');
        if (existingConf) {
          if (!existingConf.values.includes(incomingDate)) existingConf.values.push(incomingDate);
        } else {
          event.conflicts.push({
            field: 'start_date',
            values: [event.start_date, incomingDate],
            primary_value: event.start_date,
            conflicting_source_id: sourceId,
            reason: `Conflicting event date from source ${sourceId}: ${incomingDate} vs ${event.start_date}`
          });
        }
      }
    }

    // 2. Venue Change Check
    const incomingVenue = incomingRecord.venue_name || incomingRecord.venue;
    if (incomingVenue && incomingVenue.toLowerCase().trim() !== (event.venue_name || '').toLowerCase().trim()) {
      if (isFresherThan(event.field_provenance.venue_name)) {
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
          reason: 'Promoter announced venue change'
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
        if (incomingRecord.city) {
          event.field_provenance.city = {
            value: incomingRecord.city,
            source_id: sourceId,
            source_url: postUrl,
            observed_at: observedAt,
            published_at: publishedAt,
            confidence: 'HIGH'
          };
        }
      }
    }

    // 3. Cancellation Check
    if (incomingRecord.status === 'CANCELLED' && event.status !== 'CANCELLED') {
      if (isFresherThan(event.field_provenance.status)) {
        const oldStatus = event.status;
        event.status = 'CANCELLED';
        event.event_history.push({
          timestamp: now,
          change_type: 'CANCELLED',
          field: 'status',
          old_value: oldStatus,
          new_value: 'CANCELLED',
          source_id: sourceId,
          observed_at: observedAt,
          published_at: publishedAt,
          reason: 'Promoter announced event cancellation'
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

    // 4. Lineup Change Check
    if (incomingRecord.artists && Array.isArray(incomingRecord.artists) && incomingRecord.artists.length > 0) {
      const existingArtists = new Set((event.artists || []).map(a => a.toLowerCase()));
      const newArtists = incomingRecord.artists.filter(a => !existingArtists.has(a.toLowerCase()));
      if (newArtists.length > 0 && isFresherThan(event.field_provenance.artists)) {
        const oldArtists = [...(event.artists || [])];
        event.artists = [...oldArtists, ...newArtists];
        event.event_history.push({
          timestamp: now,
          change_type: 'LINEUP_CHANGED',
          field: 'artists',
          old_value: oldArtists,
          new_value: event.artists,
          source_id: sourceId,
          observed_at: observedAt,
          published_at: publishedAt,
          reason: 'Lineup announcement / additional artists'
        });
        changes.push('LINEUP_CHANGED');

        event.field_provenance.artists = {
          value: event.artists,
          source_id: sourceId,
          source_url: postUrl,
          observed_at: observedAt,
          published_at: publishedAt,
          confidence: 'HIGH'
        };
      }
    }

    // 5. Ticket URL / Transaction Link Check
    if (incomingRecord.official_ticket_url && incomingRecord.official_ticket_url !== event.official_ticket_url) {
      if (isFresherThan(event.field_provenance.official_ticket_url)) {
        const oldUrl = event.official_ticket_url;
        event.official_ticket_url = incomingRecord.official_ticket_url;
        event.event_history.push({
          timestamp: now,
          change_type: 'TICKET_INFO_CHANGED',
          field: 'official_ticket_url',
          old_value: oldUrl,
          new_value: incomingRecord.official_ticket_url,
          source_id: sourceId,
          observed_at: observedAt,
          published_at: publishedAt,
          reason: 'Official ticketing URL announced or updated'
        });
        changes.push('TICKET_INFO_CHANGED');

        event.field_provenance.official_ticket_url = {
          value: incomingRecord.official_ticket_url,
          source_id: sourceId,
          source_url: postUrl,
          observed_at: observedAt,
          published_at: publishedAt,
          confidence: 'HIGH'
        };
      }
    }

    // Append observation snapshot (CRITICAL DATA INTEGRITY: Never overwrite historical source observations!)
    event.observations.push({
      observation_id: obsId,
      source_id: sourceId,
      post_url: postUrl,
      observed_at: observedAt,
      published_at: publishedAt,
      content_fingerprint: fingerprint,
      claims: {
        title: incomingRecord.canonical_name || incomingRecord.name,
        date: incomingDate,
        venue: incomingVenue,
        status: incomingRecord.status || 'UPCOMING',
        ticket_url: incomingRecord.official_ticket_url || null
      },
      changes_detected: changes
    });

    // Update source record
    this.addSourceRecord(eventId, incomingRecord);

    event.updated_at = now;
    event.last_verified_at = now;
    event.update_priority = this.computeUpdatePriority(event.start_date);

    return { event, changes };
  }

  /**
   * Attaches an additional source record to an existing canonical event (Multi-Source Enrichment).
   */
  addSourceRecord(eventId, sourceRecord) {
    const event = this.getEventById(eventId);
    if (!event) return null;

    const existingIdx = event.sources.findIndex(s => s.source_id === sourceRecord.source_id);
    if (existingIdx >= 0) {
      // Update existing source record
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
    event.last_verified_at = new Date().toISOString();

    // Enrich fields if not present
    if (!event.official_ticket_url && sourceRecord.official_ticket_url) {
      event.official_ticket_url = sourceRecord.official_ticket_url;
      event.official_ticketing_provider = sourceRecord.source_name;
    }
    if (!event.official_event_url && sourceRecord.official_event_url) {
      event.official_event_url = sourceRecord.official_event_url;
    }

    // Re-evaluate verification status
    const evalResult = EventVerificationService.evaluateEvent(event, event.sources);
    event.verification_status = evalResult.verification_status;
    event.verification_confidence = evalResult.verification_confidence;

    // Merge conflicts from evaluateEvent into event.conflicts without wiping existing
    event.conflicts = event.conflicts || [];
    if (evalResult.conflicts && evalResult.conflicts.length > 0) {
      for (const c of evalResult.conflicts) {
        const exist = event.conflicts.find(ec => ec.field === c.field);
        if (exist) {
          for (const v of c.values) {
            if (!exist.values.includes(v)) exist.values.push(v);
          }
        } else {
          event.conflicts.push(c);
        }
      }
    }
    event.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED || evalResult.verification_status === VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED);

    return event;
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
   * Ensures that all canonical events exist inside state.events for marketplace queries.
   */
  syncToState(stateEventsArray) {
    if (!Array.isArray(stateEventsArray)) return;

    for (const canonical of this.events.values()) {
      const existingIdx = stateEventsArray.findIndex(e => e.id === canonical.event_id || e.id === canonical.id);
      if (existingIdx >= 0) {
        // Update in-place while keeping any marketplace-specific fields
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
          trust_level: TRUST_LEVELS.TIER_1,
          source_url: leg.official_link || null,
          retrieved_at: new Date().toISOString()
        });
      } else {
        sources.push({
          source_id: 'src-argus-community',
          source_name: 'ARGUS Community Submission',
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
        verification_status: leg.is_verified ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.PENDING_REVIEW,
        verification_confidence: leg.is_verified ? 95 : 40,
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
