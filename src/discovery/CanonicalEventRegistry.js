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
    } else {
      const evalResult = EventVerificationService.evaluateEvent(canonicalEvent, canonicalEvent.sources);
      canonicalEvent.verification_status = evalResult.verification_status;
      canonicalEvent.verification_confidence = evalResult.verification_confidence;
      canonicalEvent.conflicts = evalResult.conflicts;
      canonicalEvent.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED);
    }

    this.events.set(eventId, canonicalEvent);
    this.slugMap.set(slug, eventId);

    return canonicalEvent;
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
    event.conflicts = evalResult.conflicts;
    event.is_verified = (evalResult.verification_status === VERIFICATION_STATUS.VERIFIED);

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
