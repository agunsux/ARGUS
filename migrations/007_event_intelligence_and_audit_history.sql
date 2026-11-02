-- Migration 007: Event Intelligence, Discovery, Visual Provenance & Change History
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Idempotent execution (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)
--   - Non-destructive (Never DROP, never truncate)
--   - Full change auditing for continuous tracking engine (dates, prices, status, posters)

-- 1. Extend canonical_events with intelligence, strict pricing, visual provenance & admin locks
ALTER TABLE canonical_events
  ADD COLUMN IF NOT EXISTS price_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_status VARCHAR(64) DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS confidence_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS poster_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS poster_source_url TEXT,
  ADD COLUMN IF NOT EXISTS poster_attribution TEXT,
  ADD COLUMN IF NOT EXISTS poster_verification_status VARCHAR(64) DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS admin_lock_mask JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lowest_official_price NUMERIC(15, 2);

-- Indices for fast filtering by price qualification and poster status
CREATE INDEX IF NOT EXISTS idx_canonical_events_price_status ON canonical_events(price_status);
CREATE INDEX IF NOT EXISTS idx_canonical_events_poster_status ON canonical_events(poster_verification_status);

-- 2. Create event_change_history table for continuous tracking audit
CREATE TABLE IF NOT EXISTS event_change_history (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(128) NOT NULL,
  change_source VARCHAR(64) NOT NULL,
  reason TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_change_history_event_id ON event_change_history(event_id);
CREATE INDEX IF NOT EXISTS idx_event_change_history_field_name ON event_change_history(field_name);
CREATE INDEX IF NOT EXISTS idx_event_change_history_timestamp ON event_change_history(timestamp DESC);
