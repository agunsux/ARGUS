/**
 * TIKUM / ARGUS — In-Memory Article Store & Scheduler Lease Emulation
 *
 * Provides a fully compliant in-memory implementation of the article persistence
 * and distributed scheduler locking contract. Used during unit/acceptance tests
 * and as offline/degraded fallback.
 */

const { CONTENT_STATUS } = require('./ContentModel');

class InMemoryArticleStore {
  constructor() {
    this.articles = new Map(); // id -> article
    this.slugMap = new Map(); // slug -> id
    this.auditLogs = [];
    this.schedulerState = new Map(); // job_name -> state
    this.executionLogs = [];
    this.initialized = false;
  }

  async init(initialArticles = []) {
    this.articles.clear();
    this.slugMap.clear();
    for (const art of initialArticles) {
      this.articles.set(art.id, { ...art });
      if (art.slug) this.slugMap.set(art.slug, art.id);
    }
    this.initialized = true;
    return true;
  }

  async loadArticles() {
    return Array.from(this.articles.values());
  }

  async getPublishedArticles(now = new Date()) {
    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
    return Array.from(this.articles.values()).filter(a => a.status === CONTENT_STATUS.PUBLISHED && a.published_at <= nowIso);
  }

  async deleteArticle(id) {
    const art = this.articles.get(id);
    if (!art) return false;
    this.articles.delete(id);
    if (art.slug) this.slugMap.delete(art.slug);
    this.auditLogs = this.auditLogs.filter(l => l.article_id !== id);
    return true;
  }

  async getArticleById(id) {
    const art = this.articles.get(id);
    return art ? { ...art } : null;
  }

  async getArticleBySlug(slug) {
    const id = this.slugMap.get(slug);
    if (!id) return null;
    const art = this.articles.get(id);
    return art ? { ...art } : null;
  }

  async saveArticle(articleData, auditInfo = {}) {
    const existingSlugId = this.slugMap.get(articleData.slug);
    if (existingSlugId && existingSlugId !== articleData.id) {
      throw new Error(`Article with slug '${articleData.slug}' already exists (ID: ${existingSlugId})`);
    }

    const previous = this.articles.get(articleData.id);
    const version = (previous?.version || 0) + 1;
    const nowIso = new Date().toISOString();

    const saved = {
      ...previous,
      ...articleData,
      version,
      updated_at: nowIso,
      created_at: previous?.created_at || articleData.created_at || nowIso
    };

    // If slug changed, clear old slug mapping
    if (previous && previous.slug && previous.slug !== saved.slug) {
      this.slugMap.delete(previous.slug);
    }

    this.articles.set(saved.id, saved);
    if (saved.slug) this.slugMap.set(saved.slug, saved.id);

    this.auditLogs.unshift({
      id: this.auditLogs.length + 1,
      article_id: saved.id,
      action: auditInfo.action || (previous ? 'UPDATED' : 'CREATED'),
      performed_by: auditInfo.performed_by || 'system',
      from_status: previous?.status || null,
      to_status: saved.status,
      changes: auditInfo.changes || {},
      created_at: nowIso
    });

    return { ...saved };
  }

  async publishArticle(id, options = {}, auditInfo = {}) {
    const article = this.articles.get(id);
    if (!article) throw new Error('Article not found');

    if (article.status === CONTENT_STATUS.PUBLISHED) {
      return { success: true, alreadyPublished: true, article: { ...article } };
    }

    if (article.status !== CONTENT_STATUS.APPROVED && article.status !== CONTENT_STATUS.SCHEDULED) {
      throw new Error(`Cannot publish article with status '${article.status}'. Human approval is required.`);
    }

    const publishedAt = new Date(options.publishedAt || Date.now()).toISOString();
    const fromStatus = article.status;
    const nowIso = new Date().toISOString();

    article.status = CONTENT_STATUS.PUBLISHED;
    article.published_at = publishedAt;
    article.publish_error = null;
    article.version = (article.version || 0) + 1;
    article.updated_at = nowIso;

    this.auditLogs.unshift({
      id: this.auditLogs.length + 1,
      article_id: article.id,
      action: 'PUBLISHED',
      performed_by: auditInfo.performed_by || article.human_approved_by || 'scheduler',
      from_status: fromStatus,
      to_status: CONTENT_STATUS.PUBLISHED,
      changes: { published_at: publishedAt },
      created_at: nowIso
    });

    return { success: true, alreadyPublished: false, article: { ...article } };
  }

  async unpublishArticle(id, auditInfo = {}) {
    const article = this.articles.get(id);
    if (!article) throw new Error('Article not found');
    const fromStatus = article.status;
    const nowIso = new Date().toISOString();

    article.status = CONTENT_STATUS.DRAFT;
    article.version = (article.version || 0) + 1;
    article.updated_at = nowIso;

    this.auditLogs.unshift({
      id: this.auditLogs.length + 1,
      article_id: article.id,
      action: 'UNPUBLISHED',
      performed_by: auditInfo.performed_by || 'system',
      from_status: fromStatus,
      to_status: CONTENT_STATUS.DRAFT,
      created_at: nowIso
    });

    return { ...article };
  }

  async failArticle(id, errorReason, auditInfo = {}) {
    const article = this.articles.get(id);
    if (!article) return null;
    const fromStatus = article.status;
    const nowIso = new Date().toISOString();

    article.status = CONTENT_STATUS.FAILED;
    article.publish_error = errorReason;
    article.version = (article.version || 0) + 1;
    article.updated_at = nowIso;

    this.auditLogs.unshift({
      id: this.auditLogs.length + 1,
      article_id: article.id,
      action: auditInfo.action || 'PUBLISH_FAILED',
      performed_by: auditInfo.performed_by || 'scheduler',
      from_status: fromStatus,
      to_status: CONTENT_STATUS.FAILED,
      changes: { error: errorReason },
      created_at: nowIso
    });

    return { ...article };
  }

  async acquireSchedulerLease(jobName, leaseOwner, ttlMs = 55000) {
    const now = Date.now();
    const state = this.schedulerState.get(jobName) || {
      job_name: jobName,
      lease_owner: null,
      lease_acquired_at: null,
      lease_expires_at: null,
      is_paused: false,
      retry_count: 0,
      next_retry_at: null
    };

    if (state.is_paused) {
      return { acquired: false, paused: true, reason: 'SCHEDULER_PAUSED', state: { ...state } };
    }

    const currentOwner = state.lease_owner;
    const expiresMs = state.lease_expires_at ? new Date(state.lease_expires_at).getTime() : 0;
    const isExpired = expiresMs <= now;

    if (!currentOwner || isExpired || currentOwner === leaseOwner) {
      state.lease_owner = leaseOwner;
      state.lease_acquired_at = new Date(now).toISOString();
      state.lease_expires_at = new Date(now + ttlMs).toISOString();
      state.updated_at = new Date(now).toISOString();
      this.schedulerState.set(jobName, state);
      return { acquired: true, paused: false, state: { ...state } };
    }

    return { acquired: false, paused: false, reason: 'LEASE_HELD_BY_ANOTHER_INSTANCE', state: { ...state } };
  }

  async renewSchedulerLease(jobName, leaseOwner, ttlMs = 55000) {
    const state = this.schedulerState.get(jobName);
    if (!state) return { renewed: false, reason: 'NOT_FOUND' };
    if (state.is_paused) return { renewed: false, paused: true, reason: 'SCHEDULER_PAUSED' };
    if (state.lease_owner !== leaseOwner) {
      return { renewed: false, reason: 'LEASE_NOT_OWNED' };
    }
    const now = Date.now();
    state.lease_expires_at = new Date(now + ttlMs).toISOString();
    state.updated_at = new Date(now).toISOString();
    this.schedulerState.set(jobName, state);
    return { renewed: true, state: { ...state } };
  }

  async releaseSchedulerLease(jobName, leaseOwner, status = 'SUCCESS', report = {}) {
    const state = this.schedulerState.get(jobName);
    if (!state) return null;
    if (state.lease_owner && state.lease_owner !== leaseOwner) {
      return { released: false, reason: 'LEASE_NOT_OWNED' };
    }

    state.lease_owner = null;
    state.lease_expires_at = null;
    state.last_status = status;
    state.last_run_report = report;
    state.updated_at = new Date().toISOString();
    this.schedulerState.set(jobName, state);
    return { released: true, state: { ...state } };
  }

  async pauseScheduler(jobName, pausedBy = 'admin') {
    const state = this.schedulerState.get(jobName) || { job_name: jobName, retry_count: 0 };
    state.is_paused = true;
    state.paused_by = pausedBy;
    state.updated_at = new Date().toISOString();
    this.schedulerState.set(jobName, state);
    return { ...state };
  }

  async resumeScheduler(jobName, resumedBy = 'admin') {
    const state = this.schedulerState.get(jobName) || { job_name: jobName, retry_count: 0 };
    state.is_paused = false;
    state.resumed_by = resumedBy;
    state.updated_at = new Date().toISOString();
    this.schedulerState.set(jobName, state);
    return { ...state };
  }

  async recordSchedulerExecution(jobName, runId, status, publishedCount = 0, publishedArticles = [], error = null) {
    const entry = {
      id: this.executionLogs.length + 1,
      job_name: jobName,
      run_id: runId,
      status,
      published_count: publishedCount,
      published_articles: publishedArticles,
      error_message: error ? (error.message || String(error)) : null,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };
    this.executionLogs.unshift(entry);
    if (this.executionLogs.length > 200) this.executionLogs.pop();
    return entry;
  }

  async getSchedulerStatus(jobName) {
    const state = this.schedulerState.get(jobName) || {
      job_name: jobName,
      lease_owner: null,
      is_paused: false,
      retry_count: 0,
      last_status: null
    };
    return { ...state };
  }

  async getSchedulerHistory(jobName, limit = 20) {
    return this.executionLogs.filter(e => !jobName || e.job_name === jobName).slice(0, limit);
  }

  async getArticleAuditHistory(articleId, limit = 50) {
    return this.auditLogs.filter(l => !articleId || l.article_id === articleId).slice(0, limit);
  }
}

module.exports = {
  InMemoryArticleStore
};
