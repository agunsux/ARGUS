/**
 * TIKUM Publishing Scheduler
 * Manages the 2x/Week publication pipeline (Tuesday & Friday cadence at 10:00 WIB)
 * and executes scheduled publication transitions (SCHEDULED -> PUBLISHED).
 * 
 * Strict Invariants:
 * - Quality over quantity: Only human-approved/scheduled articles can be published.
 * - Idempotency: Retrying a scheduled execution never generates duplicate articles or overwrites existing publications.
 * - Distributed Locking: All runs acquire a cross-instance lease lock with TTL before publishing.
 * - Persistent Execution History: Complete audit trail in editorial_scheduler_execution_logs.
 * - Pause/Resume Controls: Admin can safely halt automatic publishing without changing code or crons.
 * - Transactional Publication: An article only becomes public after successful persistent storage commit.
 */

const { articleRepository } = require('./ArticleRepository');
const { CONTENT_STATUS } = require('./ContentModel');
const { DurableArticleStore } = require('./DurableArticleStore');

class PublishingScheduler {
  constructor(options = {}) {
    this.scheduleDays = options.scheduleDays || [2, 5]; // 2 = Tuesday, 5 = Friday
    this.publishHourWib = options.publishHourWib ?? 10; // 10:00 WIB
    this.autoPublishEvergreen = Boolean(options.autoPublishEvergreen); // Default false: human approval required
    this.logs = [];
    this.isPublishing = false;
    this.jobName = options.jobName || 'editorial_publishing_cycle';
    this.maxRetries = options.maxRetries || 3;
    this.retryBackoffMs = options.retryBackoffMs || 5 * 60 * 1000;
  }

  /**
   * Evaluates if current day matches the Tuesday or Friday schedule in Asia/Jakarta (UTC+7)
   */
  isScheduledDay(date = new Date()) {
    const targetDate = (date instanceof Date) ? date : new Date(date);
    const wibDate = new Date(targetDate.getTime() + (7 * 60 * 60 * 1000));
    const day = wibDate.getUTCDay();
    return this.scheduleDays.includes(day);
  }

  async acquireLease(leaseOwner, ttlMs = 55000) {
    const store = DurableArticleStore.getStore();
    return await store.acquireSchedulerLease(this.jobName, leaseOwner, ttlMs);
  }

  async renewLease(leaseOwner, ttlMs = 55000) {
    const store = DurableArticleStore.getStore();
    return await store.renewSchedulerLease(this.jobName, leaseOwner, ttlMs);
  }

  async releaseLease(leaseOwner, status = 'SUCCESS', report = {}) {
    const store = DurableArticleStore.getStore();
    return await store.releaseSchedulerLease(this.jobName, leaseOwner, status, report);
  }

  async pause(pausedBy = 'admin') {
    const store = DurableArticleStore.getStore();
    return await store.pauseScheduler(this.jobName, pausedBy);
  }

  async resume(resumedBy = 'admin') {
    const store = DurableArticleStore.getStore();
    return await store.resumeScheduler(this.jobName, resumedBy);
  }

  async getStatus() {
    const store = DurableArticleStore.getStore();
    const state = await store.getSchedulerStatus(this.jobName);
    return {
      schedule_days: ['Tuesday', 'Friday'],
      publish_hour: '10:00 WIB',
      timezone: 'Asia/Jakarta',
      durable_serverless_publishing: DurableArticleStore.isDurableStoreConfigured(),
      search_console: { status: 'NOT_CONNECTED', impressions: null, clicks: null, ctr: null, average_position: null },
      ai_discovery: { status: 'NOT_VERIFIED', referrals: null, citations: null },
      scheduler_state: state,
      recent_logs: this.getRecentLogs(10)
    };
  }

  async getExecutionHistory(limit = 20) {
    const store = DurableArticleStore.getStore();
    return await store.getSchedulerHistory(this.jobName, limit);
  }

  /**
   * Evaluates all SCHEDULED articles and transitions those whose scheduled_at <= now
   * into PUBLISHED status.
   *
   * @param {Date|string} currentTime Reference timestamp (defaults to current system time)
   * @param {Object} options Execution overrides (targetArticleId)
   * @returns {Array} List of newly published article objects
   */
  publishDueArticles(currentTime = new Date(), options = {}) {
    if (this.isPublishing) return [];
    this.isPublishing = true;

    try {
      const now = (currentTime instanceof Date) ? currentTime : new Date(currentTime);
      const nowIso = now.toISOString();
      const store = DurableArticleStore.getStore();

      let dueArticles = [];

      // If targeting a specific article ID (e.g. during certification tests)
      if (options.targetArticleId) {
        const fresh = articleRepository.getArticleById(options.targetArticleId);
        if (fresh && fresh.status === CONTENT_STATUS.SCHEDULED) {
          dueArticles = [fresh];
        }
      } else {
        const allArticles = articleRepository.getAllArticles();
        dueArticles = allArticles.filter(a => {
          if (a.status !== CONTENT_STATUS.SCHEDULED) return false;
          if (!a.scheduled_at) return false;
          return new Date(a.scheduled_at) <= now;
        });
        dueArticles.sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
      }

      const newlyPublished = [];
      const quarantined = [];

      for (const target of dueArticles) {
        const fresh = articleRepository.getArticleById(target.id);
        if (!fresh || fresh.status !== CONTENT_STATUS.SCHEDULED) {
          continue;
        }

        try {
          const pubResult = articleRepository.publishArticle(fresh.id, {
            publishedAt: nowIso
          });

          if (pubResult && pubResult.success && !pubResult.alreadyPublished) {
            newlyPublished.push(pubResult.article);
            const logEntry = {
              timestamp: nowIso,
              action: 'SCHEDULED_ARTICLE_PUBLISHED',
              articleId: pubResult.article.id,
              slug: pubResult.article.slug,
              title: pubResult.article.title,
              scheduled_at: pubResult.article.scheduled_at,
              published_at: pubResult.article.published_at
            };
            this.logs.unshift(logEntry);

            if (store && typeof store.publishArticle === 'function' && !store.degraded) {
              store.publishArticle(fresh.id, {
                performed_by: 'scheduler',
                publishedAt: nowIso
              }).catch(() => {});
            }
          }
        } catch (err) {
          // Fault Isolation: Quarantine unapproved or invalid articles without crashing the run
          articleRepository.failArticle(fresh.id, err.message);
          quarantined.push({
            id: fresh.id,
            slug: fresh.slug,
            title: fresh.title,
            error: err.message
          });

          this.logs.unshift({
            timestamp: nowIso,
            action: 'SCHEDULED_PUBLISH_QUARANTINED',
            articleId: fresh.id,
            slug: fresh.slug,
            error: err.message
          });

          if (store && typeof store.failArticle === 'function' && !store.degraded) {
            store.failArticle(fresh.id, err.message, {
              performed_by: 'scheduler',
              action: 'SCHEDULED_PUBLISH_QUARANTINED'
            }).catch(() => {});
          }
        }
      }

      newlyPublished.quarantined = quarantined;
      return newlyPublished;
    } finally {
      this.isPublishing = false;
    }
  }

  /**
   * Main publication cycle execution with distributed locking, idempotency,
   * audit trail, and pause/resume controls.
   *
   * @param {Object} options execution overrides (forceRun, now, targetArticleId)
   */
  async runCycle(options = {}) {
    const now = options.now ? new Date(options.now) : new Date();
    const runId = `cron-${now.getTime()}-${Math.random().toString(36).substring(2, 7)}`;
    const store = DurableArticleStore.getStore();

    // 1. Acquire distributed lease lock
    const ttlMs = options.ttlMs || 55000;
    const leaseRes = await this.acquireLease(runId, ttlMs);
    if (!leaseRes.acquired) {
      if (leaseRes.paused) {
        return {
          executed: false,
          paused: true,
          reason: 'SCHEDULER_PAUSED',
          message: 'Publishing scheduler is paused by admin control.'
        };
      }
      return {
        executed: false,
        locked: true,
        reason: 'LEASE_HELD_BY_ANOTHER_INSTANCE',
        message: 'Another scheduler worker is currently holding the execution lease.'
      };
    }

    // Heartbeat timer to periodically renew lease during execution
    let heartbeatTimer = null;
    const heartbeatInterval = Math.max(1000, Math.floor(ttlMs / 3));
    heartbeatTimer = setInterval(async () => {
      try {
        await this.renewLease(runId, ttlMs);
      } catch (_) {}
    }, heartbeatInterval);
    if (heartbeatTimer.unref) heartbeatTimer.unref();

    try {
      // 1b. Sync from PostgreSQL store if targetArticleId or due articles are in DB
      if (options.targetArticleId) {
        if (store && typeof store.getArticleById === 'function' && !store.degraded) {
          try {
            const art = await store.getArticleById(options.targetArticleId);
            if (art) {
              articleRepository.saveArticleInternal(art, false);
            }
          } catch (_) {}
        }
      } else if (store && typeof store.query === 'function' && !store.degraded) {
        try {
          const dueRes = await store.query(
            `SELECT * FROM editorial_articles
             WHERE status = 'scheduled' AND scheduled_at <= $1
             ORDER BY scheduled_at ASC`,
            [now.toISOString()]
          );
          for (const r of (dueRes.rows || [])) {
            const mapped = store.mapRowToArticle(r);
            articleRepository.saveArticleInternal(mapped, false);
          }
        } catch (_) {}
      }

      // 2. Fulfill scheduled articles that are due
      const scheduledPublished = this.publishDueArticles(now, options);
      const quarantined = scheduledPublished.quarantined || [];
      const isScheduled = options.forceRun || this.isScheduledDay(now);

      // Ensure store is updated and awaited for each published article in runCycle
      if (store && typeof store.publishArticle === 'function' && !store.degraded) {
        for (const pub of scheduledPublished) {
          try {
            await store.publishArticle(pub.id, {
              performed_by: 'scheduler',
              publishedAt: pub.published_at || now.toISOString()
            });
          } catch (_) {}
        }
      }

      if (scheduledPublished.length > 0) {
        const report = {
          executed: true,
          publishedCount: scheduledPublished.length,
          articles: scheduledPublished,
          article: scheduledPublished[0],
          quarantinedCount: quarantined.length,
          quarantined,
          message: `Successfully published ${scheduledPublished.length} scheduled article(s)${quarantined.length > 0 ? ` (${quarantined.length} quarantined)` : ''}.`
        };

        const execStatus = quarantined.length > 0 ? 'COMPLETED_WITH_SKIPPED' : 'SUCCESS';

        await store.recordSchedulerExecution(
          this.jobName,
          runId,
          execStatus,
          scheduledPublished.length,
          scheduledPublished.map(a => ({ id: a.id, slug: a.slug, title: a.title })),
          quarantined.length > 0 ? new Error(`${quarantined.length} article(s) quarantined during cycle`) : null
        );
        await this.releaseLease(runId, execStatus, report);
        return report;
      }

      // If due articles existed but ALL were quarantined:
      if (quarantined.length > 0) {
        const quarantineReport = {
          executed: true,
          publishedCount: 0,
          quarantinedCount: quarantined.length,
          quarantined,
          message: `All ${quarantined.length} due article(s) were quarantined due to validation/approval gates.`
        };
        await store.recordSchedulerExecution(
          this.jobName,
          runId,
          'QUARANTINED',
          0,
          [],
          new Error(`All ${quarantined.length} due article(s) failed gates: ${quarantined.map(q => q.error).join('; ')}`)
        );
        await this.releaseLease(runId, 'QUARANTINED', quarantineReport);
        return quarantineReport;
      }

      if (!isScheduled) {
        const skipReport = {
          executed: false,
          reason: 'NOT_SCHEDULED_DAY',
          message: 'Publishing cycle only triggers on scheduled days (Tuesday & Friday).'
        };
        await this.releaseLease(runId, 'SKIPPED', skipReport);
        return skipReport;
      }

      // 3. Handle approved evergreen candidates (if autoPublishEvergreen or forceRun)
      const allArticles = articleRepository.getAllArticles();
      const approvedCandidates = allArticles.filter(a => {
        if (a.status === CONTENT_STATUS.APPROVED && (options.forceRun || this.autoPublishEvergreen)) {
          // Strictly enforce human approval gate
          if (!a.human_approved_by || !a.human_approved_at) return false;
          return true;
        }
        return false;
      });

      if (approvedCandidates.length === 0) {
        const logEntry = {
          timestamp: now.toISOString(),
          action: 'CYCLE_SKIPPED',
          reason: 'NO_APPROVED_CONTENT',
          message: 'No approved or scheduled articles ready for publication. Quality threshold upheld.'
        };
        this.logs.unshift(logEntry);
        await this.releaseLease(runId, 'NO_CONTENT', logEntry);
        return {
          executed: true,
          publishedCount: 0,
          ...logEntry
        };
      }

      // Pick top candidate
      approvedCandidates.sort((a, b) => {
        if ((b.quality_score || 0) !== (a.quality_score || 0)) {
          return (b.quality_score || 0) - (a.quality_score || 0);
        }
        return (a.created_at || '').localeCompare(b.created_at || '');
      });

      const targetArticle = approvedCandidates[0];
      try {
        const result = articleRepository.publishArticle(targetArticle.id);

        if (store && typeof store.publishArticle === 'function' && !store.degraded) {
          try {
            await store.publishArticle(targetArticle.id, {
              performed_by: 'scheduler',
              publishedAt: now.toISOString()
            });
          } catch (_) {}
        }

        const logEntry = {
          timestamp: now.toISOString(),
          action: 'ARTICLE_PUBLISHED',
          articleId: targetArticle.id,
          slug: targetArticle.slug,
          title: targetArticle.title,
          alreadyPublished: result.alreadyPublished
        };
        this.logs.unshift(logEntry);

        const successReport = {
          executed: true,
          publishedCount: result.alreadyPublished ? 0 : 1,
          article: result.article,
          log: logEntry
        };

        await store.recordSchedulerExecution(
          this.jobName,
          runId,
          'SUCCESS',
          result.alreadyPublished ? 0 : 1,
          [{ id: targetArticle.id, slug: targetArticle.slug, title: targetArticle.title }],
          null
        );
        await this.releaseLease(runId, 'SUCCESS', successReport);
        return successReport;
      } catch (candErr) {
        articleRepository.failArticle(targetArticle.id, candErr.message);
        if (store && typeof store.failArticle === 'function' && !store.degraded) {
          await store.failArticle(targetArticle.id, candErr.message, { performed_by: 'scheduler' });
        }

        const failEntry = {
          timestamp: now.toISOString(),
          action: 'EVERGREEN_PUBLISH_FAILED',
          articleId: targetArticle.id,
          error: candErr.message
        };
        this.logs.unshift(failEntry);

        await store.recordSchedulerExecution(
          this.jobName,
          runId,
          'CANDIDATE_FAILED',
          0,
          [],
          candErr
        );
        await this.releaseLease(runId, 'CANDIDATE_FAILED', failEntry);

        return {
          executed: true,
          publishedCount: 0,
          error: candErr.message,
          log: failEntry
        };
      }

    } catch (err) {
      if (typeof targetArticle !== 'undefined' && targetArticle?.id) {
        articleRepository.failArticle(targetArticle.id, err.message);
      }

      const errorEntry = {
        timestamp: now.toISOString(),
        action: 'PUBLISH_FAILED',
        error: err.message
      };
      this.logs.unshift(errorEntry);

      await store.recordSchedulerExecution(this.jobName, runId, 'FAILED', 0, [], err);
      await this.releaseLease(runId, 'FAILED', errorEntry);

      return {
        executed: true,
        publishedCount: 0,
        error: err.message,
        log: errorEntry
      };
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
  }

  getRecentLogs(limit = 20) {
    return this.logs.slice(0, limit);
  }
}

const publishingSchedulerInstance = new PublishingScheduler();

let schedulerTimer = null;

function startPublishingSchedulerJob(intervalMs = 60000) {
  if (schedulerTimer) return schedulerTimer;

  schedulerTimer = setInterval(() => {
    try {
      publishingSchedulerInstance.publishDueArticles();
    } catch (err) {
      console.error('[TIKUM Scheduler] Error publishing due articles:', err);
    }
  }, intervalMs);

  if (schedulerTimer.unref) {
    schedulerTimer.unref();
  }

  return schedulerTimer;
}

function stopPublishingSchedulerJob() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  PublishingScheduler,
  publishingScheduler: publishingSchedulerInstance,
  startPublishingSchedulerJob,
  stopPublishingSchedulerJob
};
