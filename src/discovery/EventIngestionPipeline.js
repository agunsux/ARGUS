/**
 * ARGUS Event Ingestion Pipeline
 * 
 * Executes observable multi-stage pipeline:
 * SOURCE -> FETCH -> PARSE -> NORMALIZE -> IDENTIFY -> DEDUPLICATE -> ENRICH -> VERIFY -> PUBLISH
 * 
 * Captures telemetry and stage-level error boundaries.
 */

const crypto = require('crypto');
const { sourceRegistry, TRUST_LEVELS } = require('./SourceRegistry');
const { EventNormalizationService } = require('./EventNormalizationService');
const { EventDeduplicationService } = require('./EventDeduplicationService');
const { EventVerificationService, VERIFICATION_STATUS } = require('./EventVerificationService');
const { canonicalRegistry } = require('./CanonicalEventRegistry');

class EventIngestionPipeline {
  constructor() {
    this.metrics = {
      events_discovered: 0,
      events_created: 0,
      duplicates_detected: 0,
      events_merged: 0,
      events_verified: 0,
      events_rejected: 0,
      conflicts_detected: 0,
      source_failures: 0,
      last_run_at: null
    };
    this.stageLogs = [];
  }

  logStage(stage, eventKey, status, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      stage,
      eventKey,
      status,
      details
    };
    this.stageLogs.push(entry);
    if (this.stageLogs.length > 500) {
      this.stageLogs.shift(); // keep bounded ring buffer
    }
  }

  /**
   * Ingests a raw event payload from any source into ARGUS.
   * @param {object} rawPayload - Raw incoming data from source
   * @param {string} sourceId - Registered source ID (e.g. 'src-tiket-com', 'src-loket', 'src-promoter-antarasuara-instagram')
   * @param {object} observationMeta - Optional social post observation metadata (post_url, observed_at, published_at, fingerprint)
   */
  async ingestEvent(rawPayload, sourceId, observationMeta = {}) {
    this.metrics.last_run_at = new Date().toISOString();
    this.metrics.events_discovered++;

    // Stage 1: SOURCE VALIDATION
    const source = sourceRegistry.getSource(sourceId);
    if (!source) {
      this.metrics.source_failures++;
      this.logStage('SOURCE', rawPayload.name || 'unknown', 'FAILED', { error: `Unregistered source_id: ${sourceId}` });
      throw new Error(`Source ${sourceId} is not registered in ARGUS Source Registry`);
    }

    // Stage 2: PARSE & VALIDATE
    if (!rawPayload.name && !rawPayload.title) {
      this.metrics.events_rejected++;
      this.logStage('PARSE', 'missing_title', 'REJECTED', { error: 'Missing name or title' });
      throw new Error('Event must contain a name or title');
    }

    const rawTitle = rawPayload.name || rawPayload.title;
    const rawDate = rawPayload.start_date || rawPayload.date || rawPayload.start_datetime;
    if (!rawDate) {
      this.metrics.events_rejected++;
      this.logStage('PARSE', rawTitle, 'REJECTED', { error: 'Missing event start date' });
      throw new Error('Event must contain a valid start date');
    }

    // Stage 3: NORMALIZE
    const normTitle = EventNormalizationService.normalizeTitle(rawTitle);
    const venueNorm = EventNormalizationService.normalizeVenue(
      rawPayload.venue_name || rawPayload.venue || rawPayload.venue_id,
      rawPayload.city || rawPayload.venue_city
    );
    const dtNorm = EventNormalizationService.normalizeDateTime(
      rawDate,
      rawPayload.time,
      rawPayload.timezone
    );
    const eventType = rawPayload.event_type || EventNormalizationService.normalizeEventType(rawPayload.category, normTitle);
    const slug = EventNormalizationService.generateSlug(normTitle, venueNorm.city, dtNorm.date);

    const normalizedRecord = {
      source_id: source.source_id,
      source_name: source.source_name,
      trust_level: source.trust_level,
      source_type: source.source_type,
      source_role: source.source_role,
      source_url: observationMeta.post_url || rawPayload.official_ticket_url || rawPayload.url || rawPayload.source_url || null,
      source_event_identifier: rawPayload.source_event_id || rawPayload.external_id || null,
      name: normTitle,
      canonical_name: normTitle,
      venue_id: venueNorm.venue_id,
      venue_name: venueNorm.venue_name,
      city: venueNorm.city,
      province: venueNorm.province,
      start_datetime: dtNorm.start_datetime,
      start_date: dtNorm.date,
      date: dtNorm.date,
      event_type: eventType,
      category: rawPayload.category || eventType,
      description: rawPayload.description,
      official_ticket_url: rawPayload.official_ticket_url || null,
      official_ticketing_provider: source.source_role === 'TRANSACTION_SOURCE' ? source.source_name : (rawPayload.official_ticketing_provider || null),
      official_event_url: rawPayload.official_event_url || null,
      organizer_name: rawPayload.organizer_name || 'Promoter',
      artists: Array.isArray(rawPayload.artists) ? rawPayload.artists : [],
      status: rawPayload.status || 'UPCOMING'
    };

    this.logStage('NORMALIZE', normTitle, 'SUCCESS', { slug, eventType, venue: venueNorm.venue_name });

    // Build Observation Snapshot
    const fingerprint = observationMeta.content_fingerprint || 
      crypto.createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex').substring(0, 16);

    const obsRecord = {
      observation_id: observationMeta.observation_id || `obs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      source_id: source.source_id,
      post_url: observationMeta.post_url || rawPayload.post_url || rawPayload.source_url || rawPayload.url || null,
      observed_at: observationMeta.observed_at || new Date().toISOString(),
      published_at: observationMeta.published_at || rawPayload.published_at || null,
      content_fingerprint: fingerprint,
      claims: {
        title: normTitle,
        date: dtNorm.date,
        venue: venueNorm.venue_name,
        city: venueNorm.city,
        status: rawPayload.status || 'UPCOMING',
        ticket_url: rawPayload.official_ticket_url || null
      }
    };

    // Stage 4 & 5: IDENTIFY & DEDUPLICATE
    const existingEvents = canonicalRegistry.getAllEvents();
    const dedupResult = EventDeduplicationService.findDuplicateCandidate(normalizedRecord, existingEvents);

    let canonicalEvent;
    let changesDetected = [];

    if (dedupResult.isMatch && dedupResult.canonicalEvent) {
      // DUPLICATE DETECTED -> MERGE INTO ONE CANONICAL EVENT WITH OBSERVATION UPDATE
      this.metrics.duplicates_detected++;
      this.metrics.events_merged++;
      canonicalEvent = dedupResult.canonicalEvent;

      this.logStage('DEDUPLICATE', normTitle, 'MERGED', {
        target_canonical_id: canonicalEvent.event_id,
        reason: dedupResult.matchReason,
        confidence: dedupResult.confidence
      });

      // Stage 6: ENRICH WITH OBSERVATION UPDATE & CHANGE DETECTION
      const updateResult = canonicalRegistry.updateEventFromObservation(
        canonicalEvent.event_id,
        normalizedRecord,
        source.source_id,
        obsRecord
      );
      if (updateResult && updateResult.changes) {
        changesDetected = updateResult.changes;
        if (changesDetected.length > 0) {
          this.logStage('ENRICH', normTitle, 'CHANGES_RECORDED', {
            changes: changesDetected
          });
        }
      }
    } else {
      // Stage 6 & 7: CREATE NEW CANONICAL EVENT & VERIFY
      const isPrimary = source.trust_level === TRUST_LEVELS.TIER_S || 
                        source.source_type === 'PROMOTER_OFFICIAL_SOCIAL' || 
                        source.source_role === 'PRIMARY_EVENT_SOURCE';

      canonicalEvent = canonicalRegistry.createEvent({
        ...normalizedRecord,
        slug,
        sources: [normalizedRecord],
        verification_status: isPrimary ? VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED : undefined,
        verification_confidence: isPrimary ? 90 : undefined,
        observations: [obsRecord]
      });
      this.metrics.events_created++;

      this.logStage('IDENTIFY', normTitle, 'NEW_CANONICAL_CREATED', {
        canonical_id: canonicalEvent.event_id,
        slug,
        is_primary_source: isPrimary
      });
    }

    // Stage 8: VERIFY & CONFLICT CHECK
    if (canonicalEvent.verification_status === VERIFICATION_STATUS.DATA_CONFLICT) {
      this.metrics.conflicts_detected++;
      this.logStage('VERIFY', canonicalEvent.canonical_name, 'DATA_CONFLICT', {
        conflicts: canonicalEvent.conflicts
      });
    } else if (canonicalEvent.verification_status === VERIFICATION_STATUS.VERIFIED || canonicalEvent.verification_status === VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED) {
      this.metrics.events_verified++;
      this.logStage('VERIFY', canonicalEvent.canonical_name, canonicalEvent.verification_status, {
        confidence: canonicalEvent.verification_confidence
      });
    } else {
      this.logStage('VERIFY', canonicalEvent.canonical_name, canonicalEvent.verification_status, {
        confidence: canonicalEvent.verification_confidence
      });
    }

    // Stage 9: PUBLISH
    this.logStage('PUBLISH', canonicalEvent.canonical_name, 'PUBLISHED', {
      slug: canonicalEvent.slug,
      is_verified: canonicalEvent.is_verified,
      total_sources: canonicalEvent.source_count
    });

    // Update source health
    sourceRegistry.updateHealth(source.source_id, null, { success: true });

    return {
      success: true,
      canonical_event: canonicalEvent,
      dedup_action: dedupResult.isMatch ? 'MERGED' : 'CREATED',
      match_confidence: dedupResult.confidence,
      verification_status: canonicalEvent.verification_status,
      verification_confidence: canonicalEvent.verification_confidence
    };
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getRecentLogs(limit = 50) {
    return this.stageLogs.slice(-limit);
  }

  reset() {
    this.metrics = {
      events_discovered: 0,
      events_created: 0,
      duplicates_detected: 0,
      events_merged: 0,
      events_verified: 0,
      events_rejected: 0,
      conflicts_detected: 0,
      source_failures: 0,
      last_run_at: null
    };
    this.stageLogs = [];
  }
}

const pipelineInstance = new EventIngestionPipeline();

module.exports = {
  EventIngestionPipeline,
  ingestionPipeline: pipelineInstance
};
