/**
 * TIKUM Publishing Scheduler
 * Manages the 2x/Week publication pipeline (Tuesday & Friday cadence)
 * and executes scheduled publication transitions (SCHEDULED -> PUBLISHED).
 * 
 * Strict Invariants:
 * - Quality over quantity: Only human-approved/scheduled articles can be published.
 * - Idempotency: Retrying a scheduled execution never generates duplicate articles or overwrites existing publications.
 * - Scheduled article fulfillment: An article scheduled for a specific timestamp automatically
 *   transitions to PUBLISHED when scheduled_at <= current_time.
 * - Concurrency Safe: Mutex and status gates prevent double publication across multiple instances.
 */

const { articleRepository } = require('./ArticleRepository');
const { CONTENT_STATUS } = require('./ContentModel');

class PublishingScheduler {
  constructor(options = {}) {
    this.scheduleDays = options.scheduleDays || [2, 5]; // 2 = Tuesday, 5 = Friday
    this.publishHourWib = options.publishHourWib || 9; // 09:00 WIB
    this.autoPublishEvergreen = Boolean(options.autoPublishEvergreen); // Default false: human approval required
    this.logs = [];
    this.isPublishing = false;
  }

  /**
   * Evaluates if current day matches the Tuesday or Friday schedule
   */
  isScheduledDay(date = new Date()) {
    // Convert to Asia/Jakarta (UTC+7)
    const targetDate = (date instanceof Date) ? date : new Date(date);
    const wibDate = new Date(targetDate.getTime() + (7 * 60 * 60 * 1000));
    const day = wibDate.getUTCDay();
    return this.scheduleDays.includes(day);
  }

  /**
   * Evaluates all SCHEDULED articles and transitions those whose scheduled_at <= now
   * into PUBLISHED status.
   *
   * @param {Date|string} currentTime Reference timestamp (defaults to current system time)
   * @returns {Array} List of newly published article objects
   */
  publishDueArticles(currentTime = new Date()) {
    if (this.isPublishing) return [];
    this.isPublishing = true;

    try {
      const now = (currentTime instanceof Date) ? currentTime : new Date(currentTime);
      const allArticles = articleRepository.getAllArticles();
      const dueArticles = allArticles.filter(a => {
        if (a.status !== CONTENT_STATUS.SCHEDULED) return false;
        if (!a.scheduled_at) return false;
        return new Date(a.scheduled_at) <= now;
      });

      // Sort by scheduled_at ascending (oldest due first)
      dueArticles.sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));

      const newlyPublished = [];

      for (const target of dueArticles) {
        // Re-fetch to ensure fresh state under concurrency
        const fresh = articleRepository.getArticleById(target.id);
        if (!fresh || fresh.status !== CONTENT_STATUS.SCHEDULED) {
          continue;
        }

        const pubResult = articleRepository.publishArticle(fresh.id, {
          publishedAt: new Date().toISOString()
        });

        if (pubResult && pubResult.success && !pubResult.alreadyPublished) {
          newlyPublished.push(pubResult.article);
          const logEntry = {
            timestamp: now.toISOString(),
            action: 'SCHEDULED_ARTICLE_PUBLISHED',
            articleId: fresh.id,
            slug: fresh.slug,
            title: fresh.title,
            scheduled_at: fresh.scheduled_at,
            published_at: pubResult.article.published_at
          };
          this.logs.unshift(logEntry);
        }
      }

      return newlyPublished;
    } finally {
      this.isPublishing = false;
    }
  }

  /**
   * Main publication cycle execution
   * @param {Object} options execution overrides (forceRun, now)
   */
  async runCycle(options = {}) {
    const now = options.now ? new Date(options.now) : new Date();

    // 1. First, always fulfill any scheduled articles that are due
    const scheduledPublished = this.publishDueArticles(now);

    const isScheduled = options.forceRun || this.isScheduledDay(now);

    if (scheduledPublished.length > 0) {
      return {
        executed: true,
        publishedCount: scheduledPublished.length,
        articles: scheduledPublished,
        article: scheduledPublished[0],
        message: `Successfully published ${scheduledPublished.length} scheduled article(s).`
      };
    }

    if (!isScheduled) {
      return {
        executed: false,
        reason: 'NOT_SCHEDULED_DAY',
        message: 'Publishing cycle only triggers on scheduled days (Tuesday & Friday).'
      };
    }

    // 2. Handle approved evergreen candidates (if autoPublishEvergreen or forceRun)
    const allArticles = articleRepository.getAllArticles();
    const approvedCandidates = allArticles.filter(a => {
      if (a.status === CONTENT_STATUS.APPROVED && (options.forceRun || this.autoPublishEvergreen)) {
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
      return {
        executed: true,
        publishedCount: 0,
        ...logEntry
      };
    }

    // Pick top candidate (highest quality score, then oldest approved)
    approvedCandidates.sort((a, b) => {
      if ((b.quality_score || 0) !== (a.quality_score || 0)) {
        return (b.quality_score || 0) - (a.quality_score || 0);
      }
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    const targetArticle = approvedCandidates[0];

    try {
      const result = articleRepository.publishArticle(targetArticle.id);

      const logEntry = {
        timestamp: now.toISOString(),
        action: 'ARTICLE_PUBLISHED',
        articleId: targetArticle.id,
        slug: targetArticle.slug,
        title: targetArticle.title,
        alreadyPublished: result.alreadyPublished
      };
      this.logs.unshift(logEntry);

      return {
        executed: true,
        publishedCount: result.alreadyPublished ? 0 : 1,
        article: result.article,
        log: logEntry
      };
    } catch (err) {
      articleRepository.failArticle(targetArticle.id, err.message);

      const errorEntry = {
        timestamp: now.toISOString(),
        action: 'PUBLISH_FAILED',
        articleId: targetArticle.id,
        error: err.message
      };
      this.logs.unshift(errorEntry);

      return {
        executed: true,
        publishedCount: 0,
        error: err.message,
        log: errorEntry
      };
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
