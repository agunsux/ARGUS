-- Migration 008: Editorial Articles & Durable Publishing Scheduler Schema
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Idempotent execution (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
--   - Non-destructive (Never DROP, never TRUNCATE)
--   - Distributed lock and transactional audit logs for serverless publishing

-- 1. Editorial Articles Table
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

-- 2. Editorial Article Audit Logs
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

-- 3. Editorial Scheduler State (Distributed Lease Lock & Pause/Resume Control)
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

-- 4. Editorial Scheduler Execution Logs
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
