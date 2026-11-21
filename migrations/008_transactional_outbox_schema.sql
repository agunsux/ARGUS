-- Migration 008: Transactional Outbox Schema for Asynchronous Component Delivery
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Idempotent execution (IF NOT EXISTS)
--   - Non-destructive (Never DROP, never TRUNCATE)
--   - Events persisted atomically within financial transaction boundary
--   - Safe claiming via FOR UPDATE SKIP LOCKED

CREATE TABLE IF NOT EXISTS financial_outbox (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(128) UNIQUE NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_outbox_dispatch ON financial_outbox(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_fin_outbox_aggregate ON financial_outbox(aggregate_type, aggregate_id);
