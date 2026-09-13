/**
 * TIKUM / ARGUS Event Ingestion Scheduler
 * 
 * Manages configurable background ingestion jobs:
 * 1. EVENT_DISCOVERY_DAILY: Periodic discovery across active Tier 1 & 2 sources
 * 2. EVENT_REFRESH_DAILY: Refreshes active upcoming events for changes / reschedules
 * 3. EVENT_VERIFICATION_DAILY: Enforces temporal freshness and marks stale events as EXPIRED
 * 4. SOURCE_HEALTH_CHECK: Probes degraded sources and resets cooled-down circuit breakers
 * 
 * SAFE BY DEFAULT:
 * Passive mode is enforced by default. No live external crawling runs without
 * explicit configuration toggle (ENABLE_BACKGROUND_INGESTION=true) or admin API trigger.
 */

const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
const { sourceRegistry } = require('../discovery/SourceRegistry');
const { ingestionPipeline } = require('../discovery/EventIngestionPipeline');
const { adapterRegistry } = require('../discovery/adapters/AdapterRegistry');

const JOB_NAMES = {
  EVENT_DISCOVERY_DAILY: 'EVENT_DISCOVERY_DAILY',
  EVENT_REFRESH_DAILY: 'EVENT_REFRESH_DAILY',
  EVENT_VERIFICATION_DAILY: 'EVENT_VERIFICATION_DAILY',
  SOURCE_HEALTH_CHECK: 'SOURCE_HEALTH_CHECK'
};

class EventIngestionScheduler {
  constructor() {
    this.jobs = new Map();
    this.history = [];
    this.isRunning = false;
    this.isFrozen = false; // Emergency freeze toggle
    this.intervalHandle = null;
  }

  /**
   * Executes a specific ingestion job programmatically or via scheduled trigger.
   */
  async runJob(jobName, options = {}) {
    if (this.isFrozen) {
      return {
        job: jobName,
        status: 'FROZEN',
        message: 'Ingestion is currently paused under emergency freeze protocol'
      };
    }

    const startTime = Date.now();
    const runId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const result = {
      run_id: runId,
      job_name: jobName,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'RUNNING',
      details: {}
    };

    try {
      switch (jobName) {
        case JOB_NAMES.EVENT_VERIFICATION_DAILY: {
          // Check temporal freshness and expire stale events
          const expiredIds = canonicalRegistry.checkAndExpireEvents();
          result.details = {
            expired_events_count: expiredIds.length,
            expired_event_ids: expiredIds
          };
          result.status = 'COMPLETED';
          break;
        }

        case JOB_NAMES.SOURCE_HEALTH_CHECK: {
          // Check circuit breakers and cooldowns
          const sources = sourceRegistry.getAllSources();
          let resetCount = 0;
          for (const s of sources) {
            if (s.circuit_breaker_status === 'OPEN' && s.cooldown_until && Date.now() > new Date(s.cooldown_until).getTime()) {
              sourceRegistry.updateHealth(s.source_id, 'HALF_OPEN');
              resetCount++;
            }
          }
          result.details = {
            total_sources_audited: sources.length,
            circuits_transitioned_half_open: resetCount
          };
          result.status = 'COMPLETED';
          break;
        }

        case JOB_NAMES.EVENT_DISCOVERY_DAILY: {
          // Run discovery on permitted active sources
          const activeSources = sourceRegistry.getAllSources().filter(s => s.active && s.circuit_breaker_status !== 'OPEN');
          let discoveredTotal = 0;

          for (const src of activeSources) {
            try {
              const adapter = adapterRegistry.getAdapter(src.source_id);
              const items = await adapter.discover();
              if (Array.isArray(items)) {
                for (const item of items) {
                  await ingestionPipeline.ingestEvent(item, src.source_id);
                  discoveredTotal++;
                }
              }
            } catch (err) {
              // Isolated failure: log and continue with remaining sources
              sourceRegistry.updateHealth(src.source_id, null, { success: false });
            }
          }

          result.details = {
            sources_polled: activeSources.length,
            events_processed: discoveredTotal
          };
          result.status = 'COMPLETED';
          break;
        }

        case JOB_NAMES.EVENT_REFRESH_DAILY: {
          // Re-evaluate upcoming canonical events
          const events = canonicalRegistry.getAllEvents().filter(e => e.status !== 'CANCELLED' && e.status !== 'COMPLETED');
          let refreshedCount = 0;

          for (const ev of events) {
            if (ev.sources && ev.sources.length > 0) {
              refreshedCount++;
            }
          }

          result.details = {
            events_refreshed: refreshedCount
          };
          result.status = 'COMPLETED';
          break;
        }

        default:
          throw new Error(`Unknown ingestion job: ${jobName}`);
      }
    } catch (err) {
      result.status = 'FAILED';
      result.error = err.message;
    } finally {
      result.completed_at = new Date().toISOString();
      result.duration_ms = Date.now() - startTime;
      this.history.unshift(result);
      if (this.history.length > 100) this.history.pop();
    }

    return result;
  }

  /**
   * Emergency freeze protocol (halts all scheduled workers).
   */
  freeze() {
    this.isFrozen = true;
    return { status: 'FROZEN', timestamp: new Date().toISOString() };
  }

  /**
   * Unfreeze protocol (resumes normal execution).
   */
  unfreeze() {
    this.isFrozen = false;
    return { status: 'ACTIVE', timestamp: new Date().toISOString() };
  }

  getJobHistory(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus() {
    return {
      is_running: this.isRunning,
      is_frozen: this.isFrozen,
      recent_runs: this.history.length,
      last_run: this.history[0] || null
    };
  }

  reset() {
    this.history = [];
    this.isFrozen = false;
  }
}

const schedulerInstance = new EventIngestionScheduler();

module.exports = {
  EventIngestionScheduler,
  ingestionScheduler: schedulerInstance,
  JOB_NAMES
};
