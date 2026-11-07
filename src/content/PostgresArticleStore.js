/**
 * TIKUM / ARGUS — PostgreSQL Persistent Article Store & Distributed Scheduler Lease
 *
 * Provides shared, ACID-compliant, crash-safe, restart-safe persistence for
 * Tikum editorial articles and distributed scheduler lease management.
 *
 * Invariants:
 * - Atomic compare-and-set publication with optimistic concurrency versioning.
 * - Distributed lease locking with TTL across serverless / multi-instance nodes.
 * - Complete audit history of publication and status changes.
 * - Safe fail-closed operation on serverless when database connection is missing.
 * - Zero leaking of unapproved, draft, or scheduled articles.
 */

const { Pool } = require('pg');
const { InMemoryArticleStore } = require('./InMemoryArticleStore');
const { CONTENT_STATUS } = require('./ContentModel');
const path = require('path');
const fs = require('fs');

class PostgresArticleStore {
  constructor(options = {}) {
    this.connectionString = options.connectionString || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
    this.pool = null;
    this.fallbackRepo = new InMemoryArticleStore();
    this.degraded = false;
    this.initialized = false;
    this.initPromise = null;
  }

  isTestRuntime() {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.npm_lifecycle_event === 'test') return true;
    const entryScript = String((process.argv && process.argv[1]) || '');
    return /[\\/]test_[^\\/]+\.js$/i.test(entryScript) || /^test_[^\\/]+\.js$/i.test(entryScript);
  }

  async ensureInitialized() {
    if (this.initialized) {
      if (this.degraded && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
        throw new Error('[PostgresArticleStore] Production database is degraded or unavailable.');
      }
      return;
    }
    await this.init();
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;

      // In test mode: strictly default to InMemory UNLESS TEST_DATABASE_URL or TEST_DATABASE_SCHEMA is set
      if (this.isTestRuntime() && !process.env.TEST_DATABASE_URL && !process.env.TEST_DATABASE_SCHEMA) {
        this.degraded = true;
        await this.fallbackRepo.init(this.loadSnapshotFixtures());
        this.initialized = true;
        return false;
      }

      if (!this.connectionString) {
        if (isProduction) {
          this.degraded = true;
          this.initialized = true;
          throw new Error('[PostgresArticleStore] Production configuration error: DATABASE_URL is missing.');
        }
        this.degraded = true;
        await this.fallbackRepo.init(this.loadSnapshotFixtures());
        this.initialized = true;
        return false;
      }

      try {
        let cleanConnStr = this.connectionString.trim();
        if (cleanConnStr.startsWith('"') && cleanConnStr.endsWith('"')) cleanConnStr = cleanConnStr.slice(1, -1);
        if (cleanConnStr.startsWith("'") && cleanConnStr.endsWith("'")) cleanConnStr = cleanConnStr.slice(1, -1);
        try {
          const u = new URL(cleanConnStr);
          u.searchParams.delete('channel_binding');
          u.searchParams.delete('sslmode');
          cleanConnStr = u.toString();
        } catch (_) {}

        const isLocalhost = cleanConnStr.includes('localhost') || cleanConnStr.includes('127.0.0.1');
        const ssl = isLocalhost ? undefined : { rejectUnauthorized: false };

        this.pool = new Pool({
          connectionString: cleanConnStr,
          ssl,
          max: 5,
          idleTimeoutMillis: this.isTestRuntime() ? 500 : 10000,
          connectionTimeoutMillis: 10000
        });

        const client = await this.pool.connect();
        try {
          await this.runMigrations(client);
          await this.ensureSeedData(client);
        } finally {
          client.release();
        }

        this.initialized = true;
        this.degraded = false;
        return true;
      } catch (err) {
        if (isProduction) {
          this.degraded = true;
          this.initialized = true;
          throw new Error(`[PostgresArticleStore] Production database connection failed: ${err.message}`);
        }
        console.warn(`[PostgresArticleStore] DB connection failed, falling back to memory: ${err.message}`);
        this.degraded = true;
        await this.fallbackRepo.init(this.loadSnapshotFixtures());
        this.initialized = true;
        return false;
      }
    })();

    return this.initPromise;
  }

  loadSnapshotFixtures() {
    try {
      const snapPath = path.resolve(__dirname, 'fixtures/articles_snapshot.json');
      if (fs.existsSync(snapPath)) {
        const content = fs.readFileSync(snapPath, 'utf8');
        return JSON.parse(content || '[]');
      }
    } catch (_) {}
    return [];
  }

  async runMigrations(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS editorial_articles (
        id VARCHAR(128) PRIMARY KEY,
        slug VARCHAR(255) NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(64) NOT NULL,
        search_intent VARCHAR(32) NOT NULL DEFAULT 'informational',
        primary_keyword VARCHAR(128),
        secondary_keywords JSONB DEFAULT '[]'::jsonb,
        seo_title TEXT,
        meta_description TEXT,
        image TEXT,
        image_alt TEXT,
        content TEXT NOT NULL,
        author VARCHAR(128) NOT NULL DEFAULT 'Tim Editorial Tikum',
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        human_approved_by VARCHAR(128),
        human_approved_at TIMESTAMPTZ,
        scheduled_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        publish_error TEXT,
        faq JSONB DEFAULT '[]'::jsonb,
        internal_links JSONB DEFAULT '[]'::jsonb,
        quality_score INT,
        seo_score INT,
        trust_score INT,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_articles_slug ON editorial_articles(slug);
      CREATE INDEX IF NOT EXISTS idx_editorial_articles_status_pub ON editorial_articles(status, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_editorial_articles_scheduled ON editorial_articles(status, scheduled_at ASC);

      CREATE TABLE IF NOT EXISTS editorial_article_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        article_id VARCHAR(128) NOT NULL,
        action VARCHAR(64) NOT NULL,
        performed_by VARCHAR(128) NOT NULL,
        from_status VARCHAR(32),
        to_status VARCHAR(32),
        changes JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_editorial_article_audit_art ON editorial_article_audit_logs(article_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS editorial_scheduler_state (
        job_name VARCHAR(64) PRIMARY KEY,
        lease_owner VARCHAR(128),
        lease_acquired_at TIMESTAMPTZ,
        lease_expires_at TIMESTAMPTZ,
        last_run_id VARCHAR(64),
        last_status VARCHAR(32),
        last_run_report JSONB,
        is_paused BOOLEAN NOT NULL DEFAULT FALSE,
        retry_count INT NOT NULL DEFAULT 0,
        next_retry_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS editorial_scheduler_execution_logs (
        id BIGSERIAL PRIMARY KEY,
        job_name VARCHAR(64) NOT NULL,
        run_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        published_count INT NOT NULL DEFAULT 0,
        published_articles JSONB DEFAULT '[]'::jsonb,
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_editorial_scheduler_exec_time ON editorial_scheduler_execution_logs(started_at DESC);
    `);
  }

  async ensureSeedData(client) {
    const countRes = await client.query('SELECT COUNT(*) FROM editorial_articles');
    const count = parseInt(countRes.rows[0].count, 10);
    if (count === 0) {
      const fixtures = this.loadSnapshotFixtures();
      for (const art of fixtures) {
        await client.query(`
          INSERT INTO editorial_articles (
            id, slug, title, description, category, search_intent,
            primary_keyword, secondary_keywords, seo_title, meta_description,
            image, image_alt, content, author, status, human_approved_by,
            human_approved_at, scheduled_at, published_at, faq, internal_links,
            quality_score, seo_score, trust_score, version, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26, $27
          ) ON CONFLICT (id) DO NOTHING
        `, [
          art.id, art.slug, art.title, art.description, art.category, art.search_intent || 'informational',
          art.primary_keyword || null, JSON.stringify(art.secondary_keywords || []), art.seo_title || null, art.meta_description || null,
          art.image || null, art.image_alt || null, art.content, art.author || 'Tim Editorial Tikum', art.status || 'draft', art.human_approved_by || null,
          art.human_approved_at ? new Date(art.human_approved_at).toISOString() : null,
          art.scheduled_at ? new Date(art.scheduled_at).toISOString() : null,
          art.published_at ? new Date(art.published_at).toISOString() : null,
          JSON.stringify(art.faq || []), JSON.stringify(art.internal_links || []),
          art.quality_score || null, art.seo_score || null, art.trust_score || null,
          art.version || 1,
          art.created_at ? new Date(art.created_at).toISOString() : new Date().toISOString(),
          art.updated_at ? new Date(art.updated_at).toISOString() : new Date().toISOString()
        ]);
      }
    }
  }

  async query(text, params = []) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[PostgresArticleStore] Database operation rejected while degraded in production.');
      }
      return null;
    }
    return await this.pool.query(text, params);
  }

  mapRowToArticle(row) {
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      category: row.category,
      search_intent: row.search_intent,
      primary_keyword: row.primary_keyword,
      secondary_keywords: Array.isArray(row.secondary_keywords) ? row.secondary_keywords : (typeof row.secondary_keywords === 'string' ? JSON.parse(row.secondary_keywords || '[]') : []),
      seo_title: row.seo_title,
      meta_description: row.meta_description,
      image: row.image,
      image_alt: row.image_alt,
      content: row.content,
      author: row.author,
      status: row.status,
      human_approved_by: row.human_approved_by,
      human_approved_at: row.human_approved_at instanceof Date ? row.human_approved_at.toISOString() : (row.human_approved_at || null),
      scheduled_at: row.scheduled_at instanceof Date ? row.scheduled_at.toISOString() : (row.scheduled_at || null),
      published_at: row.published_at instanceof Date ? row.published_at.toISOString() : (row.published_at || null),
      publish_error: row.publish_error || null,
      faq: Array.isArray(row.faq) ? row.faq : (typeof row.faq === 'string' ? JSON.parse(row.faq || '[]') : []),
      internal_links: Array.isArray(row.internal_links) ? row.internal_links : (typeof row.internal_links === 'string' ? JSON.parse(row.internal_links || '[]') : []),
      quality_score: row.quality_score,
      seo_score: row.seo_score,
      trust_score: row.trust_score,
      version: Number(row.version || 1),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || new Date().toISOString()),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || new Date().toISOString())
    };
  }

  async loadArticles() {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.loadArticles();

    const res = await this.pool.query('SELECT * FROM editorial_articles ORDER BY updated_at DESC');
    return res.rows.map(r => this.mapRowToArticle(r));
  }

  async getArticleById(id) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.getArticleById(id);

    const res = await this.pool.query('SELECT * FROM editorial_articles WHERE id = $1', [id]);
    return res.rows.length ? this.mapRowToArticle(res.rows[0]) : null;
  }

  async getArticleBySlug(slug) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.getArticleBySlug(slug);

    const res = await this.pool.query('SELECT * FROM editorial_articles WHERE slug = $1', [slug]);
    return res.rows.length ? this.mapRowToArticle(res.rows[0]) : null;
  }

  async saveArticle(articleData, auditInfo = {}) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.saveArticle(articleData, auditInfo);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check slug uniqueness
      const slugCheck = await client.query('SELECT id FROM editorial_articles WHERE slug = $1', [articleData.slug]);
      if (slugCheck.rows.length > 0 && slugCheck.rows[0].id !== articleData.id) {
        throw new Error(`Article with slug '${articleData.slug}' already exists (ID: ${slugCheck.rows[0].id})`);
      }

      // Check previous version
      const prevRes = await client.query('SELECT * FROM editorial_articles WHERE id = $1 FOR UPDATE', [articleData.id]);
      const previous = prevRes.rows.length ? this.mapRowToArticle(prevRes.rows[0]) : null;
      const version = (previous?.version || 0) + 1;
      const nowIso = new Date().toISOString();

      const merged = {
        ...previous,
        ...articleData,
        version,
        updated_at: nowIso,
        created_at: previous?.created_at || articleData.created_at || nowIso
      };

      const res = await client.query(`
        INSERT INTO editorial_articles (
          id, slug, title, description, category, search_intent,
          primary_keyword, secondary_keywords, seo_title, meta_description,
          image, image_alt, content, author, status, human_approved_by,
          human_approved_at, scheduled_at, published_at, publish_error,
          faq, internal_links, quality_score, seo_score, trust_score,
          version, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28
        )
        ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          search_intent = EXCLUDED.search_intent,
          primary_keyword = EXCLUDED.primary_keyword,
          secondary_keywords = EXCLUDED.secondary_keywords,
          seo_title = EXCLUDED.seo_title,
          meta_description = EXCLUDED.meta_description,
          image = EXCLUDED.image,
          image_alt = EXCLUDED.image_alt,
          content = EXCLUDED.content,
          author = EXCLUDED.author,
          status = EXCLUDED.status,
          human_approved_by = EXCLUDED.human_approved_by,
          human_approved_at = EXCLUDED.human_approved_at,
          scheduled_at = EXCLUDED.scheduled_at,
          published_at = EXCLUDED.published_at,
          publish_error = EXCLUDED.publish_error,
          faq = EXCLUDED.faq,
          internal_links = EXCLUDED.internal_links,
          quality_score = EXCLUDED.quality_score,
          seo_score = EXCLUDED.seo_score,
          trust_score = EXCLUDED.trust_score,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `, [
        merged.id, merged.slug, merged.title, merged.description, merged.category, merged.search_intent || 'informational',
        merged.primary_keyword || null, JSON.stringify(merged.secondary_keywords || []), merged.seo_title || null, merged.meta_description || null,
        merged.image || null, merged.image_alt || null, merged.content, merged.author || 'Tim Editorial Tikum', merged.status || 'draft',
        merged.human_approved_by || null, merged.human_approved_at, merged.scheduled_at, merged.published_at, merged.publish_error || null,
        JSON.stringify(merged.faq || []), JSON.stringify(merged.internal_links || []),
        merged.quality_score || null, merged.seo_score || null, merged.trust_score || null,
        version, merged.created_at, nowIso
      ]);

      await client.query(`
        INSERT INTO editorial_article_audit_logs (
          article_id, action, performed_by, from_status, to_status, changes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        merged.id,
        auditInfo.action || (previous ? 'UPDATED' : 'CREATED'),
        auditInfo.performed_by || 'system',
        previous?.status || null,
        merged.status,
        JSON.stringify(auditInfo.changes || {})
      ]);

      await client.query('COMMIT');
      return this.mapRowToArticle(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async publishArticle(id, options = {}, auditInfo = {}) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.publishArticle(id, options, auditInfo);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const prevRes = await client.query('SELECT * FROM editorial_articles WHERE id = $1 FOR UPDATE', [id]);
      if (prevRes.rows.length === 0) {
        throw new Error('Article not found');
      }

      const article = this.mapRowToArticle(prevRes.rows[0]);

      if (article.status === CONTENT_STATUS.PUBLISHED) {
        await client.query('COMMIT');
        return { success: true, alreadyPublished: true, article };
      }

      if (article.status !== CONTENT_STATUS.APPROVED && article.status !== CONTENT_STATUS.SCHEDULED) {
        throw new Error(`Cannot publish article with status '${article.status}'. Human approval is required.`);
      }

      const publishedAt = new Date(options.publishedAt || Date.now()).toISOString();
      const version = (article.version || 0) + 1;

      const updateRes = await client.query(`
        UPDATE editorial_articles
        SET status = 'published',
            published_at = $2,
            publish_error = NULL,
            version = $3,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, publishedAt, version]);

      const updatedArticle = this.mapRowToArticle(updateRes.rows[0]);

      await client.query(`
        INSERT INTO editorial_article_audit_logs (
          article_id, action, performed_by, from_status, to_status, changes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        id,
        'PUBLISHED',
        auditInfo.performed_by || article.human_approved_by || 'scheduler',
        article.status,
        CONTENT_STATUS.PUBLISHED,
        JSON.stringify({ published_at: publishedAt })
      ]);

      await client.query('COMMIT');
      return { success: true, alreadyPublished: false, article: updatedArticle };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async unpublishArticle(id, auditInfo = {}) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.unpublishArticle(id, auditInfo);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const prevRes = await client.query('SELECT * FROM editorial_articles WHERE id = $1 FOR UPDATE', [id]);
      if (prevRes.rows.length === 0) throw new Error('Article not found');
      const article = this.mapRowToArticle(prevRes.rows[0]);

      const updateRes = await client.query(`
        UPDATE editorial_articles
        SET status = 'draft',
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);

      await client.query(`
        INSERT INTO editorial_article_audit_logs (
          article_id, action, performed_by, from_status, to_status, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [id, 'UNPUBLISHED', auditInfo.performed_by || 'system', article.status, CONTENT_STATUS.DRAFT]);

      await client.query('COMMIT');
      return this.mapRowToArticle(updateRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async acquireSchedulerLease(jobName, leaseOwner, ttlMs = 55000) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.acquireSchedulerLease(jobName, leaseOwner, ttlMs);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // First check if paused
    const checkRes = await this.pool.query('SELECT is_paused FROM editorial_scheduler_state WHERE job_name = $1', [jobName]);
    if (checkRes.rows.length > 0 && checkRes.rows[0].is_paused) {
      return { acquired: false, paused: true, reason: 'SCHEDULER_PAUSED' };
    }

    const res = await this.pool.query(`
      INSERT INTO editorial_scheduler_state (
        job_name, lease_owner, lease_acquired_at, lease_expires_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $3)
      ON CONFLICT (job_name) DO UPDATE SET
        lease_owner = EXCLUDED.lease_owner,
        lease_acquired_at = EXCLUDED.lease_acquired_at,
        lease_expires_at = EXCLUDED.lease_expires_at,
        updated_at = EXCLUDED.updated_at
      WHERE (editorial_scheduler_state.lease_owner IS NULL
         OR editorial_scheduler_state.lease_expires_at <= $3
         OR editorial_scheduler_state.lease_owner = $2)
        AND editorial_scheduler_state.is_paused = FALSE
      RETURNING *
    `, [jobName, leaseOwner, now.toISOString(), expiresAt.toISOString()]);

    if (res.rows && res.rows.length > 0) {
      return { acquired: true, paused: false, state: res.rows[0] };
    }

    const current = await this.getSchedulerStatus(jobName);
    return { acquired: false, paused: Boolean(current?.is_paused), reason: current?.is_paused ? 'SCHEDULER_PAUSED' : 'LEASE_HELD_BY_ANOTHER_INSTANCE', state: current };
  }

  async renewSchedulerLease(jobName, leaseOwner, ttlMs = 55000) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.renewSchedulerLease(jobName, leaseOwner, ttlMs);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const res = await this.pool.query(`
      UPDATE editorial_scheduler_state
      SET lease_expires_at = $2,
          updated_at = $3
      WHERE job_name = $1
        AND lease_owner = $4
        AND is_paused = FALSE
      RETURNING *
    `, [jobName, expiresAt.toISOString(), now.toISOString(), leaseOwner]);

    if (res.rows && res.rows.length > 0) {
      return { renewed: true, state: res.rows[0] };
    }
    return { renewed: false, reason: 'LEASE_NOT_RENEWED' };
  }

  async releaseSchedulerLease(jobName, leaseOwner, status = 'SUCCESS', report = {}) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.releaseSchedulerLease(jobName, leaseOwner, status, report);

    const res = await this.pool.query(`
      UPDATE editorial_scheduler_state
      SET lease_owner = NULL,
          lease_expires_at = NULL,
          last_status = $2,
          last_run_report = $3,
          updated_at = NOW()
      WHERE job_name = $1 AND (lease_owner = $4 OR lease_owner IS NULL)
      RETURNING *
    `, [jobName, status, JSON.stringify(report), leaseOwner]);

    return { released: res.rows.length > 0, state: res.rows[0] || null };
  }

  async pauseScheduler(jobName, pausedBy = 'admin') {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.pauseScheduler(jobName, pausedBy);

    const res = await this.pool.query(`
      INSERT INTO editorial_scheduler_state (job_name, is_paused, updated_at)
      VALUES ($1, TRUE, NOW())
      ON CONFLICT (job_name) DO UPDATE SET
        is_paused = TRUE,
        updated_at = NOW()
      RETURNING *
    `, [jobName]);
    return res.rows[0];
  }

  async resumeScheduler(jobName, resumedBy = 'admin') {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.resumeScheduler(jobName, resumedBy);

    const res = await this.pool.query(`
      INSERT INTO editorial_scheduler_state (job_name, is_paused, updated_at)
      VALUES ($1, FALSE, NOW())
      ON CONFLICT (job_name) DO UPDATE SET
        is_paused = FALSE,
        updated_at = NOW()
      RETURNING *
    `, [jobName]);
    return res.rows[0];
  }

  async recordSchedulerExecution(jobName, runId, status, publishedCount = 0, publishedArticles = [], error = null) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.recordSchedulerExecution(jobName, runId, status, publishedCount, publishedArticles, error);

    const res = await this.pool.query(`
      INSERT INTO editorial_scheduler_execution_logs (
        job_name, run_id, status, published_count, published_articles, error_message, started_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [
      jobName, runId, status, publishedCount,
      JSON.stringify(publishedArticles),
      error ? (error.message || String(error)) : null
    ]);
    return res.rows[0];
  }

  async getSchedulerStatus(jobName) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.getSchedulerStatus(jobName);

    const res = await this.pool.query('SELECT * FROM editorial_scheduler_state WHERE job_name = $1', [jobName]);
    return res.rows.length ? res.rows[0] : null;
  }

  async getSchedulerHistory(jobName, limit = 20) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.getSchedulerHistory(jobName, limit);

    const res = await this.pool.query('SELECT * FROM editorial_scheduler_execution_logs WHERE job_name = $1 ORDER BY started_at DESC LIMIT $2', [jobName, limit]);
    return res.rows;
  }

  async getArticleAuditHistory(articleId, limit = 50) {
    await this.ensureInitialized();
    if (this.degraded) return this.fallbackRepo.getArticleAuditHistory(articleId, limit);

    const res = await this.pool.query('SELECT * FROM editorial_article_audit_logs WHERE article_id = $1 ORDER BY created_at DESC LIMIT $2', [articleId, limit]);
    return res.rows;
  }
}

module.exports = {
  PostgresArticleStore
};
