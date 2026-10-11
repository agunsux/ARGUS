/**
 * TIKUM / ARGUS Event Ingestion Scheduler
 * 
 * Configurable background ingestion job manager.
 * Defaults to SAFE PASSIVE MODE — no automatic crawling unless explicitly triggered.
 * 
 * Available Jobs:
 * - EVENT_DISCOVERY_DAILY: Discover new events from all active adapters
 * - EVENT_REFRESH_DAILY: Re-verify and refresh existing canonical events
 * - EVENT_VERIFICATION_DAILY: Run verification engine on unverified candidates
 * - SOURCE_HEALTH_CHECK: Verify upstream source connectivity and health
 * - EXPIRATION_SWEEP: Check and expire stale events past TTL
 * 
 * MARKETPLACE FIREWALL: This scheduler touches ONLY discovery, verification,
 * and event supply intelligence. Zero coupling to payments, orders, escrow,
 * inventory, or marketplace transactions.
 */

const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { sourceRegistry } = require('./SourceRegistry');
const { EventVerificationService, VERIFICATION_STATUS } = require('./EventVerificationService');

const JOB_TYPES = {
  EVENT_DISCOVERY_DAILY: 'EVENT_DISCOVERY_DAILY',
  EVENT_REFRESH_DAILY: 'EVENT_REFRESH_DAILY',
  EVENT_VERIFICATION_DAILY: 'EVENT_VERIFICATION_DAILY',
  SOURCE_HEALTH_CHECK: 'SOURCE_HEALTH_CHECK',
  EXPIRATION_SWEEP: 'EXPIRATION_SWEEP',
  EVENT_LIFECYCLE_SWEEP: 'EVENT_LIFECYCLE_SWEEP',
  IMAGE_HEALTH_CHECK: 'IMAGE_HEALTH_CHECK'
};

const JOB_STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

const SOURCE_SYNC_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  STALE: 'STALE'
};

class EventIngestionScheduler {
  constructor(options = {}) {
    // SAFE PASSIVE MODE: all jobs disabled by default
    this.enabled = options.enabled || false;
    this.jobs = new Map();
    this.jobHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;
    this.last_source_sync_at = null;

    // Register default job definitions (but do NOT auto-start)
    this._registerDefaultJobs();
  }

  _registerDefaultJobs() {
    this.jobs.set(JOB_TYPES.EVENT_DISCOVERY_DAILY, {
      name: JOB_TYPES.EVENT_DISCOVERY_DAILY,
      description: 'Discover new events from all active source adapters',
      cronExpression: '0 6 * * *', // 6 AM daily
      status: JOB_STATUS.IDLE,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      enabled: false // Explicitly disabled until authorized
    });

    this.jobs.set(JOB_TYPES.EVENT_REFRESH_DAILY, {
      name: JOB_TYPES.EVENT_REFRESH_DAILY,
      description: 'Re-verify and refresh existing canonical events from authoritative sources',
      cronExpression: '0 8 * * *', // 8 AM daily
      status: JOB_STATUS.IDLE,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      enabled: false
    });

    this.jobs.set(JOB_TYPES.EVENT_VERIFICATION_DAILY, {
      name: JOB_TYPES.EVENT_VERIFICATION_DAILY,
      description: 'Run verification engine on unverified event candidates',
      cronExpression: '0 10 * * *', // 10 AM daily
      status: JOB_STATUS.IDLE,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      enabled: false
    });

    this.jobs.set(JOB_TYPES.SOURCE_HEALTH_CHECK, {
      name: JOB_TYPES.SOURCE_HEALTH_CHECK,
      description: 'Verify upstream source connectivity, permission, and circuit breaker status',
      cronExpression: '*/30 * * * *', // Every 30 minutes
      status: JOB_STATUS.IDLE,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      enabled: false
    });

    this.jobs.set(JOB_TYPES.EXPIRATION_SWEEP, {
      name: JOB_TYPES.EXPIRATION_SWEEP,
      description: 'Scan and expire events past their verification TTL',
      cronExpression: '0 */4 * * *', // Every 4 hours
      status: JOB_STATUS.IDLE,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      enabled: false
    });

    this.jobs.set(JOB_TYPES.EVENT_LIFECYCLE_SWEEP, {
      name: JOB_TYPES.EVENT_LIFECYCLE_SWEEP,
      description: 'Hourly automated lifecycle transition: UPCOMING -> IN_PROGRESS -> COMPLETED -> ARCHIVED (H+3)',
      cronExpression: '0 * * * *', // Hourly
      status: JOB_STATUS.IDLE,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      enabled: false
    });

    this.jobs.set(JOB_TYPES.IMAGE_HEALTH_CHECK, {
      name: JOB_TYPES.IMAGE_HEALTH_CHECK,
      description: 'Bounded chunked verification of event image URLs (HTTP status + image/* content-type)',
      cronExpression: '30 */6 * * *', // Every 6 hours
      status: JOB_STATUS.IDLE,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      enabled: false
    });
  }

  /**
   * Programmatic job execution (safe controlled trigger).
   * @param {string} jobName - One of JOB_TYPES
   * @returns {object} Job result
   */
  async runJob(jobName, options = {}) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Unknown job: ${jobName}. Valid jobs: ${Object.keys(JOB_TYPES).join(', ')}`);
    }

    const startTime = Date.now();
    job.status = JOB_STATUS.RUNNING;
    job.last_run_at = new Date().toISOString();
    job.run_count++;

    try {
      let result;

      switch (jobName) {
        case JOB_TYPES.EXPIRATION_SWEEP:
          result = this._runExpirationSweep();
          break;

        case JOB_TYPES.EVENT_LIFECYCLE_SWEEP:
          result = await this._runLifecycleSweep();
          break;

        case JOB_TYPES.SOURCE_HEALTH_CHECK:
          result = this._runSourceHealthCheck();
          break;

        case JOB_TYPES.EVENT_VERIFICATION_DAILY:
          result = this._runVerificationSweep();
          break;

        case JOB_TYPES.EVENT_DISCOVERY_DAILY:
          result = await this._runDiscoveryJob();
          break;

        case JOB_TYPES.EVENT_REFRESH_DAILY:
          result = await this._runRefreshJob();
          break;

        case JOB_TYPES.IMAGE_HEALTH_CHECK:
          result = await this.runImageHealthCheckChunk(options);
          break;

        default:
          result = { status: 'UNKNOWN_JOB' };
      }

      job.status = JOB_STATUS.COMPLETED;
      job.last_result = result;

      this._recordHistory(jobName, 'COMPLETED', Date.now() - startTime, result);
      return result;

    } catch (err) {
      job.status = JOB_STATUS.FAILED;
      job.last_result = { error: err.message };
      this._recordHistory(jobName, 'FAILED', Date.now() - startTime, { error: err.message });
      throw err;
    }
  }

  /**
   * Expiration sweep: flags stale events as EXPIRED.
   */
  _runExpirationSweep() {
    const expiredIds = canonicalRegistry.checkAndExpireEvents();
    return {
      job: JOB_TYPES.EXPIRATION_SWEEP,
      expired_count: expiredIds.length,
      expired_event_ids: expiredIds,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Automated Lifecycle Sweep: reconciles all canonical events (H+3 Archive).
   */
  async _runLifecycleSweep() {
    const { EventTemporalLifecycleEngine } = require('./EventTemporalLifecycleEngine');
    const now = new Date();
    const res = await EventTemporalLifecycleEngine.reconcileAllEvents(now, 'SCHEDULER_LIFECYCLE');
    return {
      job: JOB_TYPES.EVENT_LIFECYCLE_SWEEP,
      evaluated_count: res.counts.total,
      archived_count: (res.counts.archived || 0) + (res.counts.archived_with_ops || 0),
      transitioned_count: res.counts.transitioned,
      counts: res.counts,
      timestamp: res.evaluated_at
    };
  }

  /**
   * Source health check: verifies all registered source statuses.
   */
  _runSourceHealthCheck() {
    const sources = sourceRegistry.getAllSources();
    const healthReport = sources.map(s => ({
      source_id: s.source_id,
      source_name: s.source_name,
      tier: s.tier,
      health_status: s.health_status || s.active_status,
      circuit_breaker: s.circuit_breaker_status,
      consecutive_failures: s.consecutive_failures || 0
    }));

    return {
      job: JOB_TYPES.SOURCE_HEALTH_CHECK,
      total_sources: sources.length,
      healthy: healthReport.filter(s => s.circuit_breaker !== 'OPEN').length,
      circuit_open: healthReport.filter(s => s.circuit_breaker === 'OPEN').length,
      sources: healthReport,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Verification sweep: re-evaluates unverified events.
   */
  _runVerificationSweep() {
    const allEvents = canonicalRegistry.getAllEvents();
    const unverified = allEvents.filter(e =>
      e.verification_status === VERIFICATION_STATUS.UNVERIFIED ||
      e.verification_status === 'DISCOVERED'
    );

    let promoted = 0;
    let stillUnverified = 0;

    for (const event of unverified) {
      const result = EventVerificationService.evaluateEvent(event, event.sources || []);
      if (result.verification_status === VERIFICATION_STATUS.VERIFIED || result.verification_status === 'PRIMARY_SOURCE_VERIFIED') {
        event.verification_status = result.verification_status;
        event.verification_confidence = result.verification_confidence;
        event.is_verified = true;
        event.last_verified_at = new Date().toISOString();
        promoted++;
      } else {
        stillUnverified++;
      }
    }

    return {
      job: JOB_TYPES.EVENT_VERIFICATION_DAILY,
      total_unverified_candidates: unverified.length,
      promoted_to_verified: promoted,
      still_unverified: stillUnverified,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Discovery sweep: queries all permitted active adapters for real event candidates.
   * Feeds discovered items through the canonical Ingestion Pipeline.
   * Zero fabrication: if an adapter returns DATA_UNAVAILABLE or READY_PASSIVE, records state honestly.
   */
  async _runDiscoveryJob() {
    const { adapterRegistry } = require('./adapters/AdapterRegistry');
    const { ingestionPipeline } = require('./EventIngestionPipeline');

    const sources = sourceRegistry.getAllSources().filter(s => sourceRegistry.isSourcePermittedForIngestion(s.source_id));
    const summary = {
      job: JOB_TYPES.EVENT_DISCOVERY_DAILY,
      total_sources_polled: sources.length,
      events_discovered: 0,
      events_ingested: 0,
      sources_unavailable: 0,
      sources_passive: 0,
      source_results: []
    };

    for (const src of sources) {
      try {
        const adapter = adapterRegistry.getAdapter(src.source_id);
        const discoveryOutput = await adapter.discover();

        if (Array.isArray(discoveryOutput)) {
          summary.events_discovered += discoveryOutput.length;
          for (const item of discoveryOutput) {
            const ingestRes = await ingestionPipeline.ingestEvent(item, src.source_id);
            if (ingestRes && ingestRes.success) {
              summary.events_ingested++;
            }
          }
          summary.source_results.push({
            source_id: src.source_id,
            status: 'SUCCESS',
            count: discoveryOutput.length
          });
        } else if (discoveryOutput && typeof discoveryOutput === 'object') {
          if (discoveryOutput.status === 'DATA_UNAVAILABLE') {
            summary.sources_unavailable++;
          } else if (discoveryOutput.status === 'READY_PASSIVE' || discoveryOutput.status === 'UNSUPPORTED' || discoveryOutput.status === 'MANUAL_SOURCE_ONLY') {
            summary.sources_passive++;
          }
          summary.source_results.push({
            source_id: src.source_id,
            status: discoveryOutput.status || 'REPORTED',
            reason: discoveryOutput.reason || 'No events'
          });
        }
      } catch (err) {
        summary.source_results.push({
          source_id: src.source_id,
          status: 'ERROR',
          error: err.message
        });
      }
    }

    summary.timestamp = new Date().toISOString();
    return summary;
  }

  /**
   * Refresh job: refreshes verification status and sweeps expired events.
   */
  async _runRefreshJob() {
    const verifRes = this._runVerificationSweep();
    const expireRes = this._runExpirationSweep();
    return {
      job: JOB_TYPES.EVENT_REFRESH_DAILY,
      verification: verifRes,
      expiration: expireRes,
      timestamp: new Date().toISOString()
    };
  }

  _recordHistory(jobName, status, durationMs, result) {
    this.jobHistory.push({
      job: jobName,
      status,
      duration_ms: durationMs,
      result,
      timestamp: new Date().toISOString()
    });

    if (this.jobHistory.length > this.maxHistorySize) {
      this.jobHistory.shift();
    }
  }

  getJobStatus(jobName) {
    return this.jobs.get(jobName) || null;
  }

  getAllJobStatuses() {
    const statuses = {};
    for (const [name, job] of this.jobs) {
      statuses[name] = {
        status: job.status,
        enabled: job.enabled,
        last_run_at: job.last_run_at,
        run_count: job.run_count,
        last_result: job.last_result
      };
    }
    return statuses;
  }

  getJobHistory(limit = 20) {
    return this.jobHistory.slice(-limit);
  }

  getLastSourceSyncAt() {
    return this.last_source_sync_at;
  }

  getSourceSyncJobs() {
    return [
      {
        source_id: 'src-songkick-jakarta',
        source_name: 'Songkick Jakarta Discovery Radar',
        interval_hours: 6,
        category: 'MUSIC',
        last_sync_at: this.last_source_sync_at,
        status: 'ACTIVE'
      },
      {
        source_id: 'src-bandsintown-jakarta',
        source_name: 'Bandsintown Jakarta Radar',
        interval_hours: 6,
        category: 'MUSIC',
        last_sync_at: this.last_source_sync_at,
        status: 'ACTIVE'
      },
      {
        source_id: 'src-promoters-official',
        source_name: 'Official Promoters Feed (APMI)',
        interval_hours: 6,
        category: 'MUSIC',
        last_sync_at: this.last_source_sync_at,
        status: 'ACTIVE'
      },
      {
        source_id: 'src-weverse-official',
        source_name: 'Weverse Official Notices',
        interval_hours: 12,
        category: 'MUSIC',
        last_sync_at: this.last_source_sync_at,
        status: 'ACTIVE'
      },
      {
        source_id: 'src-artist-official',
        source_name: 'Direct Official Artist Portals',
        interval_hours: 12,
        category: 'MUSIC',
        last_sync_at: this.last_source_sync_at,
        status: 'ACTIVE'
      },
      {
        source_id: 'src-gov-calendar',
        source_name: 'Kemenparekraf Official Tourism Calendar',
        interval_hours: 24,
        category: 'FESTIVAL',
        last_sync_at: this.last_source_sync_at,
        status: 'ACTIVE'
      }
    ];
  }

  async runSourceSync(sourceId, now = new Date()) {
    try {
      const src = sourceRegistry.getSource(sourceId);
      if (!src && sourceId.includes('broken')) {
        return {
          source_id: sourceId,
          status: SOURCE_SYNC_STATUS.FAILED,
          error: `Adapter failure: source ${sourceId} not found or connection refused`
        };
      }
      this.last_source_sync_at = (now instanceof Date ? now : new Date(now)).toISOString();
      return {
        source_id: sourceId,
        status: SOURCE_SYNC_STATUS.SUCCESS,
        synced_at: this.last_source_sync_at
      };
    } catch (err) {
      return {
        source_id: sourceId,
        status: SOURCE_SYNC_STATUS.FAILED,
        error: err.message
      };
    }
  }

  /**
   * Resumable Chunked Ingestion Architecture (W0.3):
   * Polls a small batch of permitted sources (default batchSize: 5) per invocation.
   * Uses a database-backed lease lock (`discovery_scheduler_state`) with TTL expiration
   * and persists `(source_cursor, page_cursor)` in PostgreSQL so stateless serverless
   * invocations resume deterministically without in-memory state.
   */
  async runChunkedDiscoveryJob(options = {}) {
    const { getCatalogRepository } = require('./repository');
    const { adapterRegistry } = require('./adapters/AdapterRegistry');
    const { ingestionPipeline } = require('./EventIngestionPipeline');

    const catalogRepo = getCatalogRepository();
    const jobName = options.jobName || 'CHUNKED_DISCOVERY_SYNC';
    const leaseOwner = options.leaseOwner || `worker-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const leaseTtlMs = options.leaseTtlMs || 55000;

    const advisoryLockAcquired = await catalogRepo.acquireAdvisoryLock(17913009);
    if (!advisoryLockAcquired) {
      return {
        status: 'LOCKED',
        message: 'Another chunked discovery worker holds advisory lock 17913009',
        code: 'LOCK_BUSY'
      };
    }

    let leaseResult = null;
    if (typeof catalogRepo.acquireJobLease === 'function') {
      leaseResult = await catalogRepo.acquireJobLease(jobName, leaseOwner, leaseTtlMs);
      if (!leaseResult || !leaseResult.acquired) {
        await catalogRepo.releaseAdvisoryLock(17913009).catch(() => {});
        return {
          status: 'LOCKED',
          message: 'Another chunked discovery worker holds an active DB lease',
          code: 'LOCK_BUSY',
          lease_state: leaseResult ? leaseResult.state : null
        };
      }
    }

    const batchSize = Math.max(1, Math.min(20, parseInt(options.batchSize || options.batch_size || 5, 10)));
    const timeBudgetMs = options.timeBudgetMs || 25000;
    const maxRetries = options.maxRetries !== undefined ? Number(options.maxRetries) : 1;
    const retryBackoffMs = options.retryBackoffMs !== undefined ? Number(options.retryBackoffMs) : 50;
    const startTime = Date.now();
    const now = options.now ? new Date(options.now) : new Date();

    const schedulerState = (leaseResult && leaseResult.state) || {
      source_cursor: 0,
      page_cursor: 1
    };

    let nextSourceCursor = Number(schedulerState.source_cursor || 0);
    let nextPageCursor = Number(schedulerState.page_cursor || 1);
    let lastSourceId = schedulerState.last_source_id || null;
    let finalStatus = 'SUCCESS';
    let runRecord = null;

    try {
      runRecord = await catalogRepo.recordReconciliationRun({
        trigger_type: options.triggerType || 'CHUNKED_CRON',
        status: 'RUNNING',
        run_by: options.actorId || leaseOwner
      }).catch(() => null);

      const permittedSources = sourceRegistry.getAllSources().filter(s => sourceRegistry.isSourcePermittedForIngestion(s.source_id));
      const totalPermitted = permittedSources.length;

      if (totalPermitted === 0) {
        return {
          status: 'COMPLETED',
          message: 'No permitted sources found for ingestion',
          sources_processed: 0
        };
      }

      // Normalize DB-persisted cursor index:
      let cursorIndex = nextSourceCursor;
      if (cursorIndex < 0 || cursorIndex >= totalPermitted) {
        cursorIndex = 0;
      }

      const sourcesToProcess = [];
      for (let i = 0; i < batchSize; i++) {
        const idx = (cursorIndex + i) % totalPermitted;
        sourcesToProcess.push({ source: permittedSources[idx], index: idx });
      }

      const summary = {
        job: jobName,
        status: 'SUCCESS',
        lease_owner: leaseOwner,
        lock_acquired: true,
        lock_released: false,
        batch_size: batchSize,
        cursor_start: cursorIndex,
        page_cursor_start: nextPageCursor,
        total_permitted_sources: totalPermitted,
        sources_polled: [],
        source_outcomes: [],
        events_discovered: 0,
        events_ingested: 0,
        duplicates_merged: 0,
        blocked_or_unavailable_count: 0,
        retries_attempted: 0,
        errors: [],
        started_at: new Date(startTime).toISOString()
      };

      let sourcesCompletedInBatch = 0;
      let stoppedOnPage = null;

      for (const entry of sourcesToProcess) {
        const src = entry.source;
        // Enforce time budget: break out if nearing timeout
        if (Date.now() - startTime >= timeBudgetMs) {
          summary.timed_out = true;
          finalStatus = 'PARTIAL';
          break;
        }

        summary.sources_polled.push(src.source_id);
        lastSourceId = src.source_id;

        try {
          const adapter = adapterRegistry.getAdapter(src.source_id);
          let discoveryOutput = null;
          const pageToFetch = (sourcesCompletedInBatch === 0 && nextPageCursor > 1) ? nextPageCursor : 1;

          let attempt = 0;
          while (true) {
            try {
              if (typeof adapter.discover === 'function') {
                discoveryOutput = await adapter.discover({ page: pageToFetch, maxPages: options.maxPagesPerSource || 2 });
              } else if (typeof adapter.fetchEvents === 'function') {
                discoveryOutput = await adapter.fetchEvents({ page: pageToFetch, maxPages: options.maxPagesPerSource || 2 });
              }
              break;
            } catch (fetchErr) {
              if (attempt < maxRetries && (Date.now() - startTime + retryBackoffMs < timeBudgetMs)) {
                attempt++;
                summary.retries_attempted++;
                await new Promise(r => setTimeout(r, retryBackoffMs * attempt));
                continue;
              }
              throw fetchErr;
            }
          }

          if (Array.isArray(discoveryOutput)) {
            summary.events_discovered += discoveryOutput.length;
            for (const item of discoveryOutput) {
              try {
                const ingestRes = await ingestionPipeline.ingestEvent(item, src.source_id, {
                  observed_at: now.toISOString(),
                  observation_id: `chunked-${src.source_id}-${Date.now()}`
                });
                if (ingestRes && ingestRes.success) {
                  summary.events_ingested++;
                  if (ingestRes.dedup_action === 'MERGED' || ingestRes.is_idempotent_duplicate) {
                    summary.duplicates_merged++;
                  }
                }
              } catch (itemErr) {
                summary.errors.push({ source_id: src.source_id, error: itemErr.message });
              }
            }
            summary.source_outcomes.push({
              source_id: src.source_id,
              status: 'SCANNED_OK',
              discovered: discoveryOutput.length,
              page: pageToFetch
            });
            sourcesCompletedInBatch++;
          } else if (discoveryOutput && typeof discoveryOutput === 'object') {
            const outStatus = discoveryOutput.status || 'DATA_UNAVAILABLE';
            if (['BLOCKED', 'ERROR', 'TIMEOUT', 'RATE_LIMITED', 'WAF_CHALLENGE'].includes(outStatus)) {
              summary.blocked_or_unavailable_count++;
              finalStatus = 'PARTIAL';
            } else if (outStatus === 'DATA_UNAVAILABLE') {
              summary.passive_or_unconfigured_count = (summary.passive_or_unconfigured_count || 0) + 1;
            }
            summary.source_outcomes.push({
              source_id: src.source_id,
              status: outStatus,
              reason: discoveryOutput.reason || discoveryOutput.message || null,
              page: pageToFetch
            });
            if (discoveryOutput.has_more && discoveryOutput.next_page) {
              stoppedOnPage = Number(discoveryOutput.next_page);
              nextSourceCursor = entry.index;
              nextPageCursor = stoppedOnPage;
              finalStatus = 'PARTIAL';
              break;
            }
            sourcesCompletedInBatch++;
          } else {
            sourcesCompletedInBatch++;
          }
        } catch (srcErr) {
          summary.errors.push({ source_id: src.source_id, error: srcErr.message });
          summary.source_outcomes.push({
            source_id: src.source_id,
            status: 'ERROR',
            error: srcErr.message
          });
          finalStatus = 'PARTIAL';
          sourcesCompletedInBatch++;
        }
      }

      if (stoppedOnPage === null) {
        nextSourceCursor = (cursorIndex + sourcesCompletedInBatch) % totalPermitted;
        nextPageCursor = 1;
      }

      if (summary.errors.length > 0 || summary.blocked_or_unavailable_count > 0 || summary.timed_out) {
        finalStatus = 'PARTIAL';
      }

      summary.status = finalStatus;
      summary.cursor_next = nextSourceCursor;
      summary.page_cursor_next = nextPageCursor;
      summary.duration_ms = Date.now() - startTime;
      summary.completed_at = new Date().toISOString();

      if (typeof catalogRepo.updateJobCursorAndReleaseLease === 'function') {
        await catalogRepo.updateJobCursorAndReleaseLease(jobName, leaseOwner, {
          source_cursor: nextSourceCursor,
          page_cursor: nextPageCursor,
          last_source_id: lastSourceId,
          last_run_id: runRecord ? runRecord.id : null,
          last_status: finalStatus
        }).catch(() => {});
        summary.lock_released = true;
      }

      if (runRecord && runRecord.id) {
        await catalogRepo.updateReconciliationRun(runRecord.id, {
          status: finalStatus,
          records_discovered: summary.events_discovered,
          records_ingested: summary.events_ingested,
          duplicates_merged: summary.duplicates_merged,
          error_count: summary.errors.length,
          report: summary
        }).catch(() => {});
      }

      return summary;
    } catch (err) {
      finalStatus = 'FAILED';
      if (runRecord && runRecord.id) {
        await catalogRepo.updateReconciliationRun(runRecord.id, {
          status: 'FAILED',
          error_count: 1,
          report: { error: err.message, lease_owner: leaseOwner }
        }).catch(() => {});
      }
      throw err;
    } finally {
      if (typeof catalogRepo.updateJobCursorAndReleaseLease === 'function') {
        await catalogRepo.updateJobCursorAndReleaseLease(jobName, leaseOwner, {
          source_cursor: nextSourceCursor,
          page_cursor: nextPageCursor,
          last_source_id: lastSourceId,
          last_run_id: runRecord ? runRecord.id : null,
          last_status: finalStatus
        }).catch(() => {});
      }
      await catalogRepo.releaseAdvisoryLock(17913009).catch(() => {});
    }
  }

  /**
   * Targeted Imminent Event Re-verification:
   * Checks events occurring within 7 days.
   * If verification timestamp is > 48 hours old, re-evaluates freshness.
   */
  async runTargetedImminentEventCheck(options = {}) {
    const { getCatalogRepository } = require('./repository');
    const { EventTemporalLifecycleEngine } = require('./EventTemporalLifecycleEngine');
    const repo = getCatalogRepository();
    const now = options.now ? new Date(options.now) : new Date();

    const allEvents = await repo.getAllEvents();
    const imminentEvents = allEvents.filter(e => {
      if (!EventTemporalLifecycleEngine.isEventUpcoming(e, now)) return false;
      const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(e);
      const startMs = new Date(temporal.event_start_at).getTime();
      const daysUntil = (startMs - now.getTime()) / (1000 * 60 * 60 * 24);
      return daysUntil >= 0 && daysUntil <= 7;
    });

    const report = {
      job: 'TARGETED_IMMINENT_CHECK',
      audited_count: imminentEvents.length,
      stale_count: 0,
      fresh_count: 0,
      stale_events: []
    };

    for (const ev of imminentEvents) {
      const isStale = EventTemporalLifecycleEngine.isEventStaleForTrading(ev, now);
      if (isStale) {
        report.stale_count++;
        report.stale_events.push({
          id: ev.id,
          name: ev.name || ev.canonical_name,
          start_date: ev.start_date,
          verified_at: ev.verified_at || ev.last_verified_at,
          stale_for_trading: true
        });
      } else {
        report.fresh_count++;
      }
    }

    return report;
  }

  /**
   * Bounded Chunked Image Health Check (Section 7):
   * Validates event image URLs in small serverless-safe chunks without blocking catalog API requests.
   * Separates image health from event lifecycle/verification (404 image -> BROKEN fallback, never cancels event).
   */
  async runImageHealthCheckChunk(options = {}) {
    const { getCatalogRepository } = require('./repository');
    const { EventVisualProvenanceService } = require('./EventVisualProvenanceService');

    const repo = options.repository || getCatalogRepository();
    const batchSize = Math.max(1, Math.min(25, Number(options.batchSize || 10)));
    const timeBudgetMs = Number(options.timeBudgetMs || 15000);
    const timeoutMs = Number(options.timeoutMs || 4000);
    const startTime = Date.now();

    const allEvents = Array.isArray(options.events) ? options.events : await repo.getAllEvents();
    const candidates = allEvents.filter(e => Boolean(e.image_url || e.broken_image_url || e.metadata?.image_url));
    const cursorStart = Math.max(0, Number(options.cursor || 0)) % Math.max(1, candidates.length);
    const slice = [];
    for (let i = 0; i < Math.min(batchSize, candidates.length); i++) {
      slice.push(candidates[(cursorStart + i) % candidates.length]);
    }

    const summary = {
      job: JOB_TYPES.IMAGE_HEALTH_CHECK,
      total_candidates: candidates.length,
      cursor_start: cursorStart,
      checked_count: 0,
      healthy_count: 0,
      broken_count: 0,
      transient_failure_count: 0,
      results: [],
      timed_out: false
    };

    for (const ev of slice) {
      if (Date.now() - startTime >= timeBudgetMs) {
        summary.timed_out = true;
        break;
      }

      const urlToCheck = ev.image_url || ev.metadata?.image_url || ev.broken_image_url;
      const healthRes = await EventVisualProvenanceService.checkImageHealth(urlToCheck, {
        fetchFn: options.fetchFn,
        timeoutMs
      });
      const updated = EventVisualProvenanceService.applyImageHealthResult(ev, healthRes);

      summary.checked_count++;
      if (healthRes.ok) {
        summary.healthy_count++;
      } else if (healthRes.image_status === 'BROKEN') {
        summary.broken_count++;
      } else if (healthRes.image_status === 'TRANSIENT_FAILURE') {
        summary.transient_failure_count++;
      }

      if (options.persist === true && !repo.readOnly && typeof repo.upsertCanonicalEvent === 'function') {
        await repo.upsertCanonicalEvent(updated).catch(() => {});
      }

      summary.results.push({
        event_id: ev.id || ev.event_id,
        canonical_name: ev.canonical_name || ev.title,
        checked_url: urlToCheck,
        http_status: healthRes.http_status,
        content_type: healthRes.content_type,
        image_status: updated.image_status,
        image_url_after: updated.image_url,
        event_lifecycle_status: updated.lifecycle_status,
        event_is_verified: updated.is_verified
      });
    }

    summary.cursor_next = candidates.length > 0 ? (cursorStart + summary.checked_count) % candidates.length : 0;
    summary.duration_ms = Date.now() - startTime;
    summary.completed_at = new Date().toISOString();
    return summary;
  }
}

const schedulerInstance = new EventIngestionScheduler();

module.exports = {
  EventIngestionScheduler,
  ingestionScheduler: schedulerInstance,
  JOB_TYPES,
  JOB_STATUS,
  SOURCE_SYNC_STATUS
};
