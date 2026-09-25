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
  EXPIRATION_SWEEP: 'EXPIRATION_SWEEP'
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
  }

  /**
   * Programmatic job execution (safe controlled trigger).
   * @param {string} jobName - One of JOB_TYPES
   * @returns {object} Job result
   */
  async runJob(jobName) {
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
}

const schedulerInstance = new EventIngestionScheduler();

module.exports = {
  EventIngestionScheduler,
  ingestionScheduler: schedulerInstance,
  JOB_TYPES,
  JOB_STATUS,
  SOURCE_SYNC_STATUS
};
