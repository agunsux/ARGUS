-- Migration 001: Catalog Tier Schema
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Idempotent execution (IF NOT EXISTS)
--   - Non-destructive (Never DROP, never truncate)
--   - Parameterized and index-optimized for query performance

-- 1. Canonical Events Table
CREATE TABLE IF NOT EXISTS canonical_events (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'CONCERT',
  category VARCHAR(64) DEFAULT 'CONCERT',
  start_date DATE NOT NULL,
  start_datetime TIMESTAMPTZ,
  end_date DATE,
  end_datetime TIMESTAMPTZ,
  timezone VARCHAR(64) DEFAULT 'Asia/Jakarta',
  venue_name VARCHAR(255) NOT NULL,
  venue_city VARCHAR(128),
  city VARCHAR(128) NOT NULL,
  province VARCHAR(128),
  country VARCHAR(64) DEFAULT 'Indonesia',
  organizer_name VARCHAR(255),
  official_event_url TEXT,
  official_ticket_url TEXT,
  official_ticketing_provider VARCHAR(128),
  min_price NUMERIC(15, 2),
  max_price NUMERIC(15, 2),
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status VARCHAR(64) DEFAULT 'UNVERIFIED',
  lifecycle_status VARCHAR(64) DEFAULT 'UPCOMING',
  archive_status VARCHAR(32) DEFAULT 'ACTIVE',
  archived_at TIMESTAMPTZ,
  public_visibility BOOLEAN DEFAULT TRUE,
  homepage_visibility BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for fast lookups and temporal lifecycle scans
CREATE INDEX IF NOT EXISTS idx_canonical_events_slug ON canonical_events(slug);
CREATE INDEX IF NOT EXISTS idx_canonical_events_date ON canonical_events(start_date);
CREATE INDEX IF NOT EXISTS idx_canonical_events_lifecycle ON canonical_events(lifecycle_status, archive_status);
CREATE INDEX IF NOT EXISTS idx_canonical_events_city ON canonical_events(city);

-- 2. Official Source Snapshots Table
CREATE TABLE IF NOT EXISTS source_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  source_id VARCHAR(64) NOT NULL,
  snapshot_schema VARCHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  evidence_hash VARCHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_source_id ON source_snapshots(source_id);

-- 3. Event Source Links (Multi-Source Provenance)
CREATE TABLE IF NOT EXISTS event_source_links (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL REFERENCES canonical_events(id) ON DELETE CASCADE,
  source_id VARCHAR(64) NOT NULL,
  source_record_id VARCHAR(255),
  role VARCHAR(64) NOT NULL, -- 'AUTHORITATIVE' | 'DISCOVERY'
  tier INT NOT NULL DEFAULT 2,
  source_url TEXT,
  ticket_url TEXT,
  confidence NUMERIC(5, 2) DEFAULT 1.0,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_event_source UNIQUE (event_id, source_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_event_source_links_event_id ON event_source_links(event_id);
CREATE INDEX IF NOT EXISTS idx_event_source_links_source_id ON event_source_links(source_id);

-- 4. Reconciliation Runs (Audit & Cron Tracking)
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id VARCHAR(64) PRIMARY KEY,
  trigger_type VARCHAR(32) NOT NULL, -- 'CRON' | 'ADMIN' | 'BOOTSTRAP'
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL, -- 'RUNNING' | 'SUCCESS' | 'FAILED'
  records_discovered INT DEFAULT 0,
  records_ingested INT DEFAULT 0,
  duplicates_merged INT DEFAULT 0,
  error_count INT DEFAULT 0,
  report JSONB,
  run_by VARCHAR(128) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_started ON reconciliation_runs(started_at DESC);
