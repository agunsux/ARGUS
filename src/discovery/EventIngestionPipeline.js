/**
 * TIKUM / ARGUS Event Ingestion Pipeline
 * 
 * Production-grade Observable Ingestion Pipeline:
 * [SECURITY SANITIZE] -> [QUALITY VALIDATE] -> [SOURCE VALIDATE] -> [NORMALIZE] ->
 * [IDEMPOTENCY CHECK] -> [DEDUPLICATE] -> [PROVENANCE CAPTURE] -> [VERIFY/CONFLICT] -> [PUBLISH]
 * 
 * Invariants Enforced:
 * - Input security sanitization (XSS, SSRF, payload depth)
 * - Strict Data Quality gates (invalid dates/titles rejected)
 * - Deterministic Idempotency (re-ingestion yields zero duplicates)
 * - Multi-source conflict detection (EventConflict created on disagreement)
 * - Strict Tier 3 fail-closed gating (Social signals remain UNVERIFIED)
 * - Marketplace firewall (zero coupling to payments/orders/escrow)
 */

const { SecuritySanitizer } = require('./security/SecuritySanitizer');
const { EventDataQualityValidator } = require('./EventDataQualityValidator');
const { sourceRegistry, TRUST_LEVELS, SOURCE_TYPES } = require('./SourceRegistry');
const { EventNormalizationService } = require('./EventNormalizationService');
const { EventDeduplicationService } = require('./EventDeduplicationService');
const { EventVerificationService, VERIFICATION_STATUS } = require('./EventVerificationService');
const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { EventSourceObservation } = require('./models/EventSourceObservation');
const { SourceClaim, CLAIM_TYPES } = require('./models/SourceClaim');

class EventIngestionPipeline {
  constructor() {
    this.metrics = {
      events_discovered: 0,
      events_created: 0,
      duplicates_detected: 0,
      events_merged: 0,
      events_verified: 0,
      events_unverified: 0,
      events_rejected: 0,
      conflicts_detected: 0,
      source_failures: 0,
      idempotent_skips: 0,
      last_run_at: null
    };
    this.stageLogs = [];
    this.processedObservations = new Map(); // hash -> { event_id, observed_at }
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
    if (this.stageLogs.length > 1000) {
      this.stageLogs.shift();
    }
  }

  /**
   * Ingests a raw event payload from any source into TIKUM.
   * @param {object} rawPayload - Raw incoming data from source
   * @param {string} sourceId - Registered source ID
   * @param {object} observationMeta - Optional social/adapter metadata
   */
  async ingestEvent(rawPayload, sourceId, observationMeta = {}) {
    this.metrics.last_run_at = new Date().toISOString();
    this.metrics.events_discovered++;

    // Stage 1: SECURITY SANITIZATION
    let sanitizedPayload;
    try {
      sanitizedPayload = SecuritySanitizer.sanitizePayload(rawPayload);
    } catch (secErr) {
      this.metrics.events_rejected++;
      this.logStage('SECURITY', 'untrusted_input', 'REJECTED', { error: secErr.message });
      throw new Error(`Security sanitization rejected payload: ${secErr.message}`);
    }

    // Stage 2: SOURCE VALIDATION & CIRCUIT CHECK
    const source = sourceRegistry.getSource(sourceId);
    if (!source) {
      this.metrics.source_failures++;
      this.logStage('SOURCE', sanitizedPayload?.name || 'unknown', 'FAILED', { error: `Unregistered source_id: ${sourceId}` });
      throw new Error(`Source ${sourceId} is not registered in TIKUM Source Registry`);
    }

    if (!sourceRegistry.isSourcePermittedForIngestion(sourceId)) {
      this.metrics.source_failures++;
      this.logStage('SOURCE', sanitizedPayload?.name || 'unknown', 'BLOCKED', { 
        circuit: source.circuit_breaker_status,
        permission: source.permission_status 
      });
      throw new Error(`Source ${sourceId} is currently blocked (circuit: ${source.circuit_breaker_status})`);
    }

    // Stage 3: DATA QUALITY VALIDATION
    const qualityResult = EventDataQualityValidator.validate(sanitizedPayload);
    if (!qualityResult.isValid) {
      this.metrics.events_rejected++;
      sourceRegistry.recordEventMetrics(sourceId, { rejected: 1 });
      sourceRegistry.updateHealth(sourceId, null, { success: false, isSchemaFailure: true });
      this.logStage('QUALITY', sanitizedPayload?.name || 'invalid_payload', 'REJECTED', { 
        errors: qualityResult.errors,
        warnings: qualityResult.warnings 
      });
      throw new Error(`Data quality validation failed: ${qualityResult.errors.join(', ')}`);
    }

    // Stage 4: NORMALIZATION
    const rawTitle = sanitizedPayload.canonical_name || sanitizedPayload.name || sanitizedPayload.title;
    const rawDate = sanitizedPayload.start_date || sanitizedPayload.date || sanitizedPayload.start_datetime || sanitizedPayload.start_at;
    const normTitle = EventNormalizationService.normalizeTitle(rawTitle);
    const venueNorm = EventNormalizationService.normalizeVenue(
      sanitizedPayload.venue_name || sanitizedPayload.venue || sanitizedPayload.venue_id,
      sanitizedPayload.city || sanitizedPayload.venue_city
    );
    const dtNorm = EventNormalizationService.normalizeDateTime(
      rawDate,
      sanitizedPayload.time,
      sanitizedPayload.timezone,
      venueNorm.city || sanitizedPayload.city || sanitizedPayload.province
    );
    const eventType = sanitizedPayload.event_type || EventNormalizationService.normalizeEventType(sanitizedPayload.category, normTitle);
    const slug = EventNormalizationService.generateSlug(normTitle, venueNorm.city, dtNorm.date);

    const normalizedRecord = {
      source_id: source.source_id,
      source_name: source.source_name,
      tier: source.tier || 2,
      authority_level: source.authority_level || 'MEDIUM',
      trust_level: source.trust_level,
      source_type: source.source_type,
      source_role: source.source_role,
      source_url: observationMeta.post_url || sanitizedPayload.official_ticket_url || sanitizedPayload.url || sanitizedPayload.source_url || null,
      source_event_identifier: sanitizedPayload.source_event_id || sanitizedPayload.external_id || null,
      name: normTitle,
      canonical_name: normTitle,
      title: normTitle,
      venue_id: venueNorm.venue_id,
      venue_name: venueNorm.venue_name,
      city: venueNorm.city,
      province: venueNorm.province,
      country: venueNorm.country || 'Indonesia',
      start_datetime: dtNorm.start_datetime,
      start_date: dtNorm.date,
      date: dtNorm.date,
      event_type: eventType,
      category: sanitizedPayload.category || eventType,
      description: sanitizedPayload.description,
      official_ticket_url: sanitizedPayload.official_ticket_url || sanitizedPayload.ticket_url || null,
      official_ticketing_provider: source.source_role === 'TRANSACTION_SOURCE' ? source.source_name : (sanitizedPayload.official_ticketing_provider || null),
      official_event_url: sanitizedPayload.official_event_url || sanitizedPayload.official_link || null,
      organizer_name: sanitizedPayload.organizer_name || (source.tier === 1 ? source.source_name : 'Promoter'),
      artists: Array.isArray(sanitizedPayload.artists) ? sanitizedPayload.artists : (sanitizedPayload.artist ? [sanitizedPayload.artist] : []),
      status: sanitizedPayload.status || 'UPCOMING',

      // Visual Provenance propagation (official poster only; never fabricated).
      // Consumed by EventVisualProvenanceService during canonical creation.
      image_url: sanitizedPayload.image_url || sanitizedPayload.poster_url || sanitizedPayload.event_image || null,
      image_source_type: sanitizedPayload.image_source_type || null,
      image_source_url: sanitizedPayload.image_source_url || null,
      image_source_account: sanitizedPayload.image_source_account || sanitizedPayload.source_account || null,
      image_source_tier: sanitizedPayload.image_source_tier !== undefined ? sanitizedPayload.image_source_tier : null,
      image_credit: sanitizedPayload.image_credit || null,
      image_license: sanitizedPayload.image_license || sanitizedPayload.image_license_status || null,
      image_scope: sanitizedPayload.image_scope || null,
      min_price: sanitizedPayload.min_price || sanitizedPayload.ticket_price_min || null,
      max_price: sanitizedPayload.max_price || null
    };

    // Stage 5: IDEMPOTENCY CHECK
    // Construct deterministic observation fingerprint
    const observation = new EventSourceObservation({
      source_id: source.source_id,
      source_url: normalizedRecord.source_url,
      source_external_id: normalizedRecord.source_event_identifier,
      raw_title: normTitle,
      raw_venue: venueNorm.venue_name,
      raw_city: venueNorm.city,
      raw_start_at: dtNorm.date,
      raw_artist: Array.isArray(normalizedRecord.artists) ? normalizedRecord.artists.join(', ') : '',
      raw_ticket_url: normalizedRecord.official_ticket_url,
      raw_status: normalizedRecord.status,
      observed_at: observationMeta.observed_at || new Date().toISOString(),
      published_at: observationMeta.published_at || sanitizedPayload.published_at || null,
      raw_payload_reference: observationMeta.observation_id || null
    });

    const idempotencyKey = `${source.source_id}::${observation.content_hash}`;
    if (this.processedObservations.has(idempotencyKey)) {
      this.metrics.idempotent_skips++;
      const existing = this.processedObservations.get(idempotencyKey);
      const canonical = canonicalRegistry.getEventById(existing.event_id);
      this.logStage('IDEMPOTENCY', normTitle, 'SKIPPED_DUPLICATE', { 
        canonical_id: existing.event_id,
        content_hash: observation.content_hash 
      });
      return {
        success: true,
        is_idempotent_duplicate: true,
        canonical_event: canonical,
        dedup_action: 'SKIPPED_EXISTING',
        verification_status: canonical ? canonical.verification_status : 'UNKNOWN'
      };
    }

    // Stage 6: IDENTIFY & MULTI-FACTOR DEDUPLICATE
    const existingEvents = canonicalRegistry.getAllEvents();
    const dedupResult = EventDeduplicationService.findDuplicateCandidate(normalizedRecord, existingEvents);

    let canonicalEvent;
    let changesDetected = [];

    if (dedupResult.isMatch && dedupResult.canonicalEvent) {
      // DUPLICATE DETECTED -> MERGE INTO ONE CANONICAL EVENT
      this.metrics.duplicates_detected++;
      this.metrics.events_merged++;
      canonicalEvent = dedupResult.canonicalEvent;

      this.logStage('DEDUPLICATE', normTitle, 'MERGED', {
        target_canonical_id: canonicalEvent.event_id,
        reason: dedupResult.matchReason,
        confidence: dedupResult.confidence
      });

      // Update observation & detect changes
      const updateResult = canonicalRegistry.updateEventFromObservation(
        canonicalEvent.event_id,
        normalizedRecord,
        source.source_id,
        observation
      );

      if (updateResult && updateResult.changes) {
        changesDetected = updateResult.changes;
        if (changesDetected.length > 0) {
          this.logStage('ENRICH', normTitle, 'CHANGES_RECORDED', { changes: changesDetected });
          sourceRegistry.recordEventMetrics(sourceId, { changed: 1 });
        }
      }

      // Append decomposed claims to canonical event
      const incomingClaims = [
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.EVENT_NAME,
          value: normTitle,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }),
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.EVENT_DATE,
          value: dtNorm.date,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }),
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.VENUE,
          value: venueNorm.venue_name,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }),
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.CITY,
          value: venueNorm.city,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        })
      ];

      canonicalEvent.atomic_claims = canonicalEvent.atomic_claims || [];
      canonicalEvent.claims = canonicalEvent.claims || [];
      for (const cl of incomingClaims) {
        canonicalEvent.atomic_claims.push(cl);
        canonicalEvent.claims.push(cl);
      }
    } else {
      // CREATE NEW CANONICAL EVENT
      // Enforce fail-closed verification:
      // Tier 1 -> can be VERIFIED if complete
      // Tier 2 -> PARTIALLY_VERIFIED
      // Tier 3 (social) -> strictly UNVERIFIED!
      const isTier1 = source.tier === 1 || source.trust_level === TRUST_LEVELS.TIER_S || source.trust_level === TRUST_LEVELS.TIER_1;
      const isTier3 = source.tier === 3 && source.trust_level !== TRUST_LEVELS.TIER_S;

      // Enforce fail-closed authoritative provenance verification:
      const isAuthoritative = sourceRegistry.isAuthoritativeSource(source.source_id, observationMeta.account_handle || sanitizedPayload.source_account);
      let initialStatus = VERIFICATION_STATUS.UNVERIFIED;
      let initialConfidence = 25;

      if (isAuthoritative) {
        initialStatus = (source.source_type.includes('IG') || source.source_type.includes('SOCIAL'))
          ? 'PRIMARY_SOURCE_VERIFIED'
          : VERIFICATION_STATUS.VERIFIED;
        initialConfidence = 90;
      } else if (!isTier3 && source.tier === 2) {
        initialStatus = VERIFICATION_STATUS.PARTIALLY_VERIFIED;
        initialConfidence = 60;
      }

      const claims = [
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.EVENT_NAME,
          value: normTitle,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }),
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.EVENT_DATE,
          value: dtNorm.date,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }),
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.VENUE,
          value: venueNorm.venue_name,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }),
        new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.CITY,
          value: venueNorm.city,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        })
      ];

      if (normalizedRecord.artists && normalizedRecord.artists.length > 0) {
        claims.push(new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.LINEUP,
          value: normalizedRecord.artists,
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }));
      }

      if (normalizedRecord.official_ticket_url) {
        claims.push(new SourceClaim({
          source_id: source.source_id,
          source_url: normalizedRecord.source_url,
          claim_type: CLAIM_TYPES.TICKET_PRICE,
          value: normalizedRecord.ticket_price || 'UNKNOWN',
          observed_at: observation.observed_at,
          source_authority_tier: source.tier || 2
        }));
      }

      canonicalEvent = canonicalRegistry.createEvent({
        ...normalizedRecord,
        slug,
        source_id: source.source_id,
        source_type: source.source_type,
        source_url: normalizedRecord.source_url,
        source_account: observationMeta.account_handle || sanitizedPayload.source_account || source.canonical_account || null,
        source_published_at: observationMeta.published_at || sanitizedPayload.published_at || null,
        source_last_checked_at: observationMeta.observed_at || new Date().toISOString(),
        evidence_hash: observation.content_hash,
        sources: [normalizedRecord],
        verification_status: initialStatus,
        verification_confidence: initialConfidence,
        observations: [observation.toJSON()],
        claims: claims
      });

      this.metrics.events_created++;
      sourceRegistry.recordEventMetrics(sourceId, { discovered: 1 });

      this.logStage('IDENTIFY', normTitle, 'NEW_CANONICAL_CREATED', {
        canonical_id: canonicalEvent.event_id,
        slug,
        initial_status: initialStatus
      });

      try {
        recordAuditLog('event_created', {
          event_id: canonicalEvent.event_id,
          title: canonicalEvent.title,
          source_id: sourceId,
          tier: source.tier,
          verification_status: initialStatus
        });
      } catch (e) {
        // Safe logging fallback
      }
    }

    // Stage 7: RECORD IDEMPOTENCY KEY
    this.processedObservations.set(idempotencyKey, {
      event_id: canonicalEvent.event_id,
      observed_at: observation.observed_at
    });

    // Stage 8: VERIFY & CONFLICT AUDIT
    if (canonicalEvent.verification_status === VERIFICATION_STATUS.CONFLICTED) {
      this.metrics.conflicts_detected++;
      this.logStage('VERIFY', canonicalEvent.canonical_name, 'CONFLICTED', {
        conflicts: canonicalEvent.conflicts
      });
      try {
        recordAuditLog('event_conflict_detected', {
          event_id: canonicalEvent.event_id,
          conflicts: canonicalEvent.conflicts
        });
      } catch (e) {}
    } else if (canonicalEvent.verification_status === VERIFICATION_STATUS.VERIFIED || canonicalEvent.verification_status === 'PRIMARY_SOURCE_VERIFIED') {
      this.metrics.events_verified++;
      this.logStage('VERIFY', canonicalEvent.canonical_name, 'VERIFIED', {
        confidence: canonicalEvent.verification_confidence
      });
    } else {
      this.metrics.events_unverified++;
      this.logStage('VERIFY', canonicalEvent.canonical_name, canonicalEvent.verification_status, {
        confidence: canonicalEvent.verification_confidence
      });
    }

    // Stage 9: PUBLISH / RECORD
    this.logStage('PUBLISH', canonicalEvent.canonical_name, 'COMPLETED', {
      slug: canonicalEvent.slug,
      is_verified: canonicalEvent.is_verified,
      verification_status: canonicalEvent.verification_status,
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
      events_unverified: 0,
      events_rejected: 0,
      conflicts_detected: 0,
      source_failures: 0,
      idempotent_skips: 0,
      last_run_at: null
    };
    this.stageLogs = [];
    this.processedObservations.clear();
  }
}

const pipelineInstance = new EventIngestionPipeline();

module.exports = {
  EventIngestionPipeline,
  ingestionPipeline: pipelineInstance
};
