/**
 * TIKUM Admin Content Control Center Router
 * Provides administrative endpoints for editorial calendar, drafting, quality audits,
 * human approval gates, scheduler management, and real content telemetry.
 *
 * Strict Principles:
 * - Admin role authentication required.
 * - Real operational metrics only (NEVER mock Google Search Console figures).
 * - Zero access to payment/user/escrow private data.
 */

const express = require('express');
const router = express.Router();
const { articleRepository } = require('../content/ArticleRepository');
const { publishingScheduler } = require('../content/PublishingScheduler');
const { ContentQualityEngine } = require('../content/ContentQualityEngine');
const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
const { VenueRegistry } = require('../discovery/VenueRegistry');
const { CityRegistry } = require('../discovery/CityRegistry');
const { SessionStore } = require('../services/sessionStore');
const { state } = require('../database');

function resolveAdminActor(req) {
  const authHeader = req.header ? (req.header('authorization') || req.header('x-session-token')) : null;
  let token = null;
  if (authHeader) {
    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
  }

  if (token) {
    const session = SessionStore.findSession(token) ||
      (state.sessions || []).find(s => s.session_token === token && new Date(s.expires_at) > new Date() && !s.revoked);
    if (session) {
      const user = (state.users || []).find(u => u.id === session.user_id);
      if (user) return user;
    }
  }

  if (process.env.NODE_ENV === 'test') {
    const candidateId = (req.header ? req.header('x-user-id') : null) || req.body?.admin_id;
    if (candidateId) {
      const user = (state.users || []).find(u => u.id === candidateId);
      if (user) return user;
    }
  }

  return null;
}

function requireContentAdmin(req, res, next) {
  const user = resolveAdminActor(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required for content management', code: 'AUTH_REQUIRED' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: `Forbidden: role '${user.role}' cannot manage editorial content`, code: 'ADMIN_FORBIDDEN' });
  }
  req.adminUser = user;
  next();
}

// -------------------------------------------------------------
// 1. Articles List & Detail
// -------------------------------------------------------------
router.get('/api/admin/content/articles', requireContentAdmin, (req, res) => {
  const { status, category } = req.query;
  const articles = articleRepository.getAllArticles({ status, category });
  res.json({
    success: true,
    total: articles.length,
    articles
  });
});

router.get('/api/admin/content/articles/:id', requireContentAdmin, (req, res) => {
  const article = articleRepository.getArticleById(req.params.id);
  if (!article) {
    return res.status(404).json({ error: 'Article not found', code: 'ARTICLE_NOT_FOUND' });
  }
  res.json({
    success: true,
    article
  });
});

// -------------------------------------------------------------
// 2. Draft Creation & Update
// -------------------------------------------------------------
router.post('/api/admin/content/articles', requireContentAdmin, (req, res) => {
  try {
    const article = articleRepository.saveArticle({
      ...req.body,
      author: req.body.author || req.adminUser.name || 'Tim Editorial Tikum'
    });
    res.status(201).json({
      success: true,
      message: 'Article draft created successfully',
      article
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
  }
});

router.put('/api/admin/content/articles/:id', requireContentAdmin, (req, res) => {
  try {
    const existing = articleRepository.getArticleById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Article not found', code: 'ARTICLE_NOT_FOUND' });
    }

    const updated = articleRepository.saveArticle({
      ...existing,
      ...req.body,
      id: existing.id
    });

    res.json({
      success: true,
      message: 'Article updated successfully',
      article: updated
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
  }
});

// -------------------------------------------------------------
// 3. Quality & Fact Audit
// -------------------------------------------------------------
router.post('/api/admin/content/articles/:id/score', requireContentAdmin, (req, res) => {
  const article = articleRepository.getArticleById(req.params.id);
  if (!article) {
    return res.status(404).json({ error: 'Article not found', code: 'ARTICLE_NOT_FOUND' });
  }

  const evaluation = ContentQualityEngine.evaluate(article);
  res.json({
    success: true,
    article_id: article.id,
    evaluation
  });
});

// -------------------------------------------------------------
// 4. Human Approval Gate
// -------------------------------------------------------------
router.post('/api/admin/content/articles/:id/approve', requireContentAdmin, (req, res) => {
  try {
    const approved = articleRepository.approveArticle(req.params.id, req.adminUser.id);
    res.json({
      success: true,
      message: 'Article approved by human editor. Ready for scheduling.',
      article: approved
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'APPROVAL_FAILED' });
  }
});

// -------------------------------------------------------------
// 5. Scheduling & Publishing
// -------------------------------------------------------------
router.post('/api/admin/content/articles/:id/schedule', requireContentAdmin, (req, res) => {
  try {
    const { targetDate } = req.body;
    if (!targetDate) {
      return res.status(400).json({ error: 'targetDate is required', code: 'MISSING_DATE' });
    }
    const scheduled = articleRepository.scheduleArticle(req.params.id, targetDate);
    res.json({
      success: true,
      message: 'Article scheduled successfully',
      article: scheduled
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'SCHEDULING_FAILED' });
  }
});

router.post('/api/admin/content/articles/:id/publish', requireContentAdmin, (req, res) => {
  try {
    const result = articleRepository.publishArticle(req.params.id);
    res.json({
      success: true,
      message: result.alreadyPublished ? 'Article was already published (idempotent)' : 'Article published successfully',
      article: result.article
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'PUBLISH_FAILED' });
  }
});

// -------------------------------------------------------------
// 6. Scheduler Execution & Logs
// -------------------------------------------------------------
router.post('/api/admin/content/scheduler/run', requireContentAdmin, async (req, res) => {
  try {
    const force = Boolean(req.body?.forceRun);
    const result = await publishingScheduler.runCycle({ forceRun: force });
    res.json({
      success: true,
      cycle_result: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. Real Telemetry & Operational Analytics
// -------------------------------------------------------------
router.get('/api/admin/content/analytics', requireContentAdmin, (req, res) => {
  const allArticles = articleRepository.getAllArticles();
  const published = allArticles.filter(a => a.status === 'published');
  const scheduled = allArticles.filter(a => a.status === 'scheduled');
  const approved = allArticles.filter(a => a.status === 'approved');
  const drafts = allArticles.filter(a => a.status === 'draft' || a.status === 'review');

  const events = canonicalRegistry.getAllEvents().filter(e => e.status !== 'CANCELLED');
  const venues = VenueRegistry.getAllVenues().filter(v => v.event_count > 0);
  const cities = CityRegistry.getAllCities().filter(c => c.event_count > 0);

  // Calculate live indexable URL count
  const coreStaticPagesCount = 10;
  const trustPagesCount = 6;
  const totalIndexableUrls = coreStaticPagesCount + trustPagesCount + events.length + venues.length + cities.length + published.length;

  res.json({
    success: true,
    data_source: 'LIVE_DATABASE_STATE',
    content_funnel: {
      draft_and_review: drafts.length,
      approved_awaiting_schedule: approved.length,
      scheduled_queue: scheduled.length,
      published_total: published.length,
      total_articles: allArticles.length
    },
    quality_metrics: {
      average_seo_score: published.length > 0 ? Math.round(published.reduce((acc, a) => acc + (a.seo_score || 0), 0) / published.length) : 0,
      average_quality_score: published.length > 0 ? Math.round(published.reduce((acc, a) => acc + (a.quality_score || 0), 0) / published.length) : 0,
      average_trust_score: published.length > 0 ? Math.round(published.reduce((acc, a) => acc + (a.trust_score || 0), 0) / published.length) : 0
    },
    indexation_inventory: {
      total_indexable_urls: totalIndexableUrls,
      canonical_events_count: events.length,
      grounded_venues_count: venues.length,
      grounded_cities_count: cities.length,
      published_articles_count: published.length,
      trust_pages_count: trustPagesCount,
      static_core_pages_count: coreStaticPagesCount
    },
    scheduler_status: {
      schedule_days: ['Tuesday', 'Friday'],
      publish_hour: '09:00 WIB',
      recent_logs: publishingScheduler.getRecentLogs(10)
    }
  });
});

module.exports = router;

