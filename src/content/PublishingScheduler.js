/**
 * TIKUM Publishing Scheduler
 * Manages the 2x/Week publication pipeline (Tuesday & Friday cadence).
 * 
 * Strict Invariants:
 * - Quality over quantity: Maximum 2 publications per week; skips tick if no approved topic exists.
 * - Human Approval Gate: Only approved/scheduled articles can be published.
 * - Idempotency: Retrying a scheduled execution never generates duplicate articles or overwrites existing publications.
 * - Safe Failures: Errors are logged, draft retained, never marked published on error.
 */

const { articleRepository } = require('./ArticleRepository');
const { CONTENT_STATUS } = require('./ContentModel');

class PublishingScheduler {
  constructor(options = {}) {
    this.scheduleDays = options.scheduleDays || [2, 5]; // 2 = Tuesday, 5 = Friday
    this.publishHourWib = options.publishHourWib || 9; // 09:00 WIB
    this.autoPublishEvergreen = Boolean(options.autoPublishEvergreen); // Default false: human approval required
    this.logs = [];
  }

  /**
   * Evaluates if current day matches the Tuesday or Friday schedule
   */
  isScheduledDay(date = new Date()) {
    // Convert to Asia/Jakarta (UTC+7)
    const wibDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    const day = wibDate.getUTCDay();
    return this.scheduleDays.includes(day);
  }

  /**
   * Main publication cycle execution
   * @param {Object} options execution overrides (forceRun for admin or tests)
   */
  async runCycle(options = {}) {
    const now = new Date();
    const isScheduled = options.forceRun || this.isScheduledDay(now);

    if (!isScheduled) {
      return {
        executed: false,
        reason: 'NOT_SCHEDULED_DAY',
        message: 'Publishing cycle only triggers on scheduled days (Tuesday & Friday).'
      };
    }

    // Find the highest-priority approved or scheduled article ready for publication
    const allArticles = articleRepository.getAllArticles();
    const candidates = allArticles.filter(a => {
      if (a.status === CONTENT_STATUS.SCHEDULED) {
        // If scheduled_at is set, verify scheduled time has passed (or forced)
        if (!a.scheduled_at || options.forceRun) return true;
        return new Date(a.scheduled_at) <= now;
      }
      if (a.status === CONTENT_STATUS.APPROVED && (options.forceRun || this.autoPublishEvergreen)) {
        return true;
      }
      return false;
    });

    if (candidates.length === 0) {
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
    candidates.sort((a, b) => {
      if ((b.quality_score || 0) !== (a.quality_score || 0)) {
        return (b.quality_score || 0) - (a.quality_score || 0);
      }
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    const targetArticle = candidates[0];

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

module.exports = {
  PublishingScheduler,
  publishingScheduler: publishingSchedulerInstance
};

