-- Migration 003: Demand Alerts Schema
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Idempotent execution (IF NOT EXISTS)
--   - Non-destructive (Never DROP, never TRUNCATE)
--   - Full compliance with UU Perlindungan Data Pribadi (UU PDP No. 27/2022)

CREATE TABLE IF NOT EXISTS demand_alerts (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  contact VARCHAR(255) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  max_price NUMERIC(15, 2),
  status VARCHAR(32) NOT NULL DEFAULT 'WAITING',
  notified_at TIMESTAMPTZ,
  consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_demand_alerts_event_id ON demand_alerts(event_id);
CREATE INDEX IF NOT EXISTS idx_demand_alerts_status ON demand_alerts(status);
CREATE INDEX IF NOT EXISTS idx_demand_alerts_contact ON demand_alerts(contact);
CREATE INDEX IF NOT EXISTS idx_demand_alerts_created_at ON demand_alerts(created_at);
