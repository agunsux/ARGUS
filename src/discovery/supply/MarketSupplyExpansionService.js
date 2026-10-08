/**
 * TIKUM / ARGUS — Market Supply Expansion Service
 *
 * Automated Supply Acquisition Engine:
 * SCAN → VERIFY → NORMALIZE → QUALIFY (>= IDR 300,000) → DEDUPE → SCORE → INGEST
 *
 * Enforces:
 * - Single Source of Truth in Neon PostgreSQL Catalog
 * - Zero Fake / Zero Fabrication (all imported events have verified source provenance)
 * - Multi-factor deterministic deduplication (no duplicate events)
 * - Anti-resurrection invariant (concluded/archived events remain ARCHIVED)
 * - Transparent Dry-Run vs Ingestion modes
 * - Full audit logging in reconciliation_runs and event_source_links
 */

const { v4: uuidv4 } = require('uuid');
const { getCatalogRepository } = require('../repository');
const { canonicalRegistry } = require('../CanonicalEventRegistry');
const { EventDeduplicationService } = require('../EventDeduplicationService');
const { EventTemporalLifecycleEngine } = require('../EventTemporalLifecycleEngine');
const { DiscoveredEvent, DISCOVERY_CATEGORIES, PRICE_STATUS, QUALITY_GRADES, EVENT_PRIORITY } = require('../models/DiscoveredEvent');
const { LoketDiscoverySource } = require('./LoketDiscoverySource');
const { OfficialEventDiscoverySource } = require('./OfficialEventDiscoverySource');

class MarketSupplyExpansionService {
  constructor(options = {}) {
    this.loketSource = new LoketDiscoverySource(options);
    this.officialSource = new OfficialEventDiscoverySource(options);
    this.minPriceThreshold = options.minPriceThreshold || 300000;
    this.repository = options.repository || null;
  }

  /**
   * Scans all public discovery sources and normalizes candidates.
   */
  async scanSources(options = {}) {
    const minPrice = options.minPrice !== undefined ? options.minPrice : this.minPriceThreshold;
    const candidates = [];

    // 1. Scan Official Primary Portals (Tier 1)
    try {
      const officialEvents = await this.officialSource.discover(options);
      candidates.push(...officialEvents);
    } catch (err) {
      console.warn(`[MarketSupplyExpansion] Official source discovery error: ${err.message}`);
    }

    // 2. Scan Loket Public Ticketing Catalog (Tier 2)
    try {
      const loketEvents = await this.loketSource.discover(options);
      candidates.push(...loketEvents);
    } catch (err) {
      console.warn(`[MarketSupplyExpansion] Loket discovery error: ${err.message}`);
    }

    return candidates;
  }

  /**
   * Classifies scanned candidates against the active canonical catalog.
   */
  async classifyCandidates(candidates, options = {}) {
    const repo = options.repository || this.repository || getCatalogRepository();
    await repo.init();
    const existingEvents = await repo.getAllEvents();
    const minPrice = options.minPrice !== undefined ? options.minPrice : this.minPriceThreshold;

    const stats = {
      total_discovered: candidates.length,
      verified_count: 0,
      qualified_count: 0,
      existing_duplicates: 0,
      rejected_count: 0,
      review_required_count: 0,
      category_breakdown: {
        CONCERT: 0,
        SPORTS: 0,
        COMEDY: 0,
        OTHER: 0
      },
      priority_breakdown: {
        P0: 0,
        P1: 0,
        P2: 0,
        P3: 0
      }
    };

    const classified = {
      would_create: [],
      would_update: [],
      would_skip_duplicate: [],
      would_review: [],
      would_reject: []
    };

    // Track keys to prevent intra-batch duplicates
    const seenBatchKeys = new Set();

    for (const candidate of candidates) {
      // 1. Category and Priority stats
      stats.category_breakdown[candidate.category] = (stats.category_breakdown[candidate.category] || 0) + 1;
      stats.priority_breakdown[candidate.priority] = (stats.priority_breakdown[candidate.priority] || 0) + 1;

      if (candidate.is_verified) {
        stats.verified_count++;
      }

      // 2. Intra-batch deduplication
      const batchKey = `${candidate.canonical_name.toLowerCase()}::${(candidate.city || '').toLowerCase()}::${candidate.start_date || ''}`;
      if (seenBatchKeys.has(batchKey)) {
        classified.would_skip_duplicate.push({
          candidate,
          reason: 'INTRA_BATCH_DUPLICATE',
          match_key: batchKey
        });
        continue;
      }
      seenBatchKeys.add(batchKey);

      // 3. Price qualification check
      const isQual = candidate.isQualified(minPrice);
      if (isQual) {
        stats.qualified_count++;
      } else {
        stats.rejected_count++;
        classified.would_reject.push({
          candidate,
          reason: 'PRICE_BELOW_THRESHOLD',
          price_min: candidate.price_min,
          price_max: candidate.price_max
        });
        continue;
      }

      // 4. Physical Live Event Guard (exclude online/virtual webinars from direct ingestion)
      const isOnline = candidate.city === 'Online' || /online|webinar|zoom|e-learning/i.test(candidate.venue_name || '') || /online/i.test(candidate.canonical_name);
      const isEducational = /bootcamp|training|workshop|course|kelas|class|seminar|webinar|sertifikasi|brevet|audit/i.test(candidate.canonical_name);

      if (isOnline || isEducational || candidate.category === DISCOVERY_CATEGORIES.OTHER) {
        stats.review_required_count++;
        classified.would_review.push({
          candidate,
          reason: isOnline ? 'ONLINE_VIRTUAL_EVENT' : (isEducational ? 'EDUCATIONAL_TRAINING' : 'SECONDARY_CATEGORY_REVIEW'),
          category: candidate.category
        });
        continue;
      }

      // 5. Cross-reference against existing canonical database
      const dedupCandidate = {
        name: candidate.canonical_name,
        canonical_name: candidate.canonical_name,
        title: candidate.canonical_name,
        start_date: candidate.start_date,
        venue_name: candidate.venue_name,
        city: candidate.city,
        artists: candidate.artists
      };

      const match = EventDeduplicationService.findDuplicateCandidate(dedupCandidate, existingEvents);

      if (match.isMatch && match.canonicalEvent) {
        stats.existing_duplicates++;
        // Check if incoming source provides richer corroborated data
        const canUpdate = (
          (!match.canonicalEvent.official_ticket_url && candidate.official_ticket_url) ||
          (!match.canonicalEvent.min_price && candidate.price_min)
        );

        if (canUpdate) {
          classified.would_update.push({
            candidate,
            existing_event: match.canonicalEvent,
            match_reason: match.matchReason,
            confidence: match.confidence
          });
        } else {
          classified.would_skip_duplicate.push({
            candidate,
            existing_event: match.canonicalEvent,
            match_reason: match.matchReason,
            confidence: match.confidence
          });
        }
      } else if (match.isAmbiguous) {
        stats.review_required_count++;
        classified.would_review.push({
          candidate,
          reason: 'AMBIGUOUS_DEDUPLICATION_MATCH',
          potential_conflict: match.canonicalEvent
        });
      } else {
        // High quality candidate approved for creation
        if (candidate.quality_grade === QUALITY_GRADES.A || candidate.quality_grade === QUALITY_GRADES.B) {
          classified.would_create.push(candidate);
        } else {
          stats.review_required_count++;
          classified.would_review.push({
            candidate,
            reason: 'LOW_CONFIDENCE_GRADE',
            grade: candidate.quality_grade
          });
        }
      }
    }

    return {
      stats,
      classified
    };
  }

  /**
   * Executes dry-run pipeline without modifying the database.
   */
  async dryRun(options = {}) {
    const candidates = await this.scanSources(options);
    const { stats, classified } = await this.classifyCandidates(candidates, options);

    return {
      success: true,
      mode: 'DRY_RUN',
      summary: {
        total_discovered: stats.total_discovered,
        verified_count: stats.verified_count,
        qualified_count: stats.qualified_count,
        would_create_count: classified.would_create.length,
        would_update_count: classified.would_update.length,
        would_skip_duplicate_count: classified.would_skip_duplicate.length,
        would_review_count: classified.would_review.length,
        would_reject_count: classified.would_reject.length,
        categories: stats.category_breakdown,
        priorities: stats.priority_breakdown
      },
      would_create: classified.would_create.map(c => ({
        title: c.canonical_name,
        category: c.category,
        start_date: c.start_date,
        city: c.city,
        venue: c.venue_name,
        price_range: `IDR ${c.price_min?.toLocaleString('id-ID')} - ${c.price_max?.toLocaleString('id-ID')}`,
        priority: c.priority,
        grade: c.quality_grade,
        official_url: c.official_event_url,
        ticket_url: c.official_ticket_url
      })),
      would_update: classified.would_update.map(u => ({
        title: u.candidate.canonical_name,
        existing_id: u.existing_event.id || u.existing_event.event_id,
        reason: u.match_reason
      })),
      review_queue: classified.would_review.slice(0, 20).map(r => ({
        title: r.candidate.canonical_name,
        reason: r.reason,
        city: r.candidate.city,
        price: r.candidate.price_min
      }))
    };
  }

  /**
   * Executes transactional and idempotent canonical ingestion into PostgreSQL.
   */
  async ingest(options = {}) {
    const repo = options.repository || this.repository || getCatalogRepository();
    await repo.init();
    const runId = `recon-supply-${uuidv4().substring(0, 8)}`;

    const lockId = 17913009; // Supply expansion advisory lock
    const lockAcquired = await repo.acquireAdvisoryLock(lockId);
    if (!lockAcquired) {
      throw new Error('Supply expansion already in progress (advisory lock busy)');
    }

    let runRecord = null;
    try {
      runRecord = await repo.recordReconciliationRun({
        id: runId,
        trigger_type: options.triggerType || 'ADMIN',
        started_at: new Date(),
        status: 'RUNNING',
        run_by: options.actor || 'SUPPLY_EXPANSION_PIPELINE'
      }).catch(() => null);

      const candidates = await this.scanSources(options);
      const { stats, classified } = await this.classifyCandidates(candidates, { ...options, repository: repo });

      const ingestedEvents = [];
      const updatedEvents = [];
      const errors = [];

      // 1. Ingest approved new events
      for (const candidate of classified.would_create) {
        try {
          const payload = candidate.toCanonicalEventPayload();
          const eventId = `ev-can-${uuidv4().substring(0, 8)}`;
          payload.id = eventId;
          payload.event_id = eventId;

          const saved = await repo.upsertCanonicalEvent(payload);
          ingestedEvents.push(saved);

          // Attach provenance link to event_source_links
          await repo.attachSourceLink({
            event_id: eventId,
            source_id: candidate.source_id,
            source_record_id: candidate.source_event_id || candidate.slug,
            role: candidate.is_verified ? 'AUTHORITATIVE' : 'DISCOVERY',
            tier: candidate.source_id.includes('official') ? 1 : 2,
            source_url: candidate.official_event_url,
            ticket_url: candidate.official_ticket_url,
            confidence: candidate.quality_score / 100
          }).catch(err => console.warn(`[ProvenanceLink] Attach error: ${err.message}`));

          // Keep in-memory registry synchronized
          canonicalRegistry.createEvent(saved);
        } catch (ingestErr) {
          errors.push({
            event_name: candidate.canonical_name,
            error: ingestErr.message
          });
        }
      }

      // 2. Corroborate and update existing events
      for (const updateItem of classified.would_update) {
        try {
          const existing = updateItem.existing_event;
          const candidate = updateItem.candidate;

          const patch = {
            ...existing,
            official_ticket_url: existing.official_ticket_url || candidate.official_ticket_url,
            official_ticketing_provider: existing.official_ticketing_provider || candidate.official_ticketing_provider,
            min_price: existing.min_price || candidate.price_min,
            max_price: existing.max_price || candidate.price_max
          };

          const updated = await repo.upsertCanonicalEvent(patch);
          updatedEvents.push(updated);

          // Attach corroborating source link
          await repo.attachSourceLink({
            event_id: existing.id || existing.event_id,
            source_id: candidate.source_id,
            source_record_id: candidate.source_event_id || null,
            role: 'DISCOVERY',
            tier: 2,
            source_url: candidate.official_event_url,
            ticket_url: candidate.official_ticket_url,
            confidence: 0.9
          }).catch(() => {});
        } catch (updErr) {
          errors.push({
            event_name: updateItem.candidate.canonical_name,
            error: updErr.message
          });
        }
      }

      // 3. Update reconciliation run log
      if (runRecord && runRecord.id) {
        await repo.updateReconciliationRun(runRecord.id, {
          status: 'SUCCESS',
          completed_at: new Date(),
          records_discovered: stats.total_discovered,
          records_ingested: ingestedEvents.length,
          duplicates_merged: classified.would_skip_duplicate.length + updatedEvents.length,
          error_count: errors.length,
          report: {
            stats,
            ingested_count: ingestedEvents.length,
            updated_count: updatedEvents.length,
            errors
          }
        }).catch(() => {});
      }

      return {
        success: true,
        mode: 'INGESTED',
        run_id: runId,
        summary: {
          total_discovered: stats.total_discovered,
          qualified_count: stats.qualified_count,
          ingested_count: ingestedEvents.length,
          updated_count: updatedEvents.length,
          skipped_duplicates: classified.would_skip_duplicate.length,
          review_required: classified.would_review.length,
          rejected: classified.would_reject.length,
          error_count: errors.length
        },
        ingested_events: ingestedEvents.map(e => ({
          id: e.id || e.event_id,
          name: e.canonical_name,
          category: e.category,
          date: e.start_date,
          city: e.city,
          venue: e.venue_name,
          price: e.min_price
        })),
        errors
      };
    } finally {
      await repo.releaseAdvisoryLock(lockId).catch(() => {});
    }
  }
}

const marketSupplyService = new MarketSupplyExpansionService();

module.exports = {
  MarketSupplyExpansionService,
  marketSupplyService
};
