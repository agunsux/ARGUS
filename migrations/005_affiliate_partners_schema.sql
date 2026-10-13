-- ============================================================================
-- TIKUM / ARGUS — Migration 005: Official Ticketing Partners & Affiliate Schema
--
-- Status: PROPOSED / DRAFTED SAFELY (DO NOT APPLY TO PRODUCTION WITHOUT AUTHORIZATION)
-- Compatibility: Fully backward compatible. Non-destructive additive tables.
-- Isolation: Strictly isolated from secondary marketplace escrows, orders, and tickets.
-- ============================================================================

-- 1. Official Ticketing Partners Table
CREATE TABLE IF NOT EXISTS ticketing_partners (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  partner_type VARCHAR(64) NOT NULL,
  official_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  integration_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  country_code VARCHAR(8) NOT NULL DEFAULT 'ID',
  supported_currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  affiliate_program_url TEXT,
  commission_config JSONB NOT NULL DEFAULT '{"type":"UNCONFIGURED","rate_pct":null,"fixed_amount":null}'::jsonb,
  webhook_secret TEXT,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticketing_partners_status ON ticketing_partners(status);
CREATE INDEX IF NOT EXISTS idx_ticketing_partners_slug ON ticketing_partners(slug);

-- 2. Event-to-Partner Official Offers Table
CREATE TABLE IF NOT EXISTS event_partner_offers (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  partner_id VARCHAR(64) NOT NULL REFERENCES ticketing_partners(id),
  external_event_id VARCHAR(128),
  destination_url TEXT NOT NULL,
  link_type VARCHAR(64) NOT NULL,
  is_affiliate BOOLEAN NOT NULL DEFAULT FALSE,
  ticket_category VARCHAR(128),
  price_min BIGINT,
  price_max BIGINT,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  availability_status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
  verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED',
  affiliate_subid_param VARCHAR(64),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_partner_offers_event_id ON event_partner_offers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_partner_offers_partner_id ON event_partner_offers(partner_id);
CREATE INDEX IF NOT EXISTS idx_event_partner_offers_active ON event_partner_offers(is_active);

-- 3. Privacy-Safe Outbound Click Tracking Table
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id VARCHAR(64) PRIMARY KEY,
  click_id VARCHAR(64) NOT NULL UNIQUE,
  partner_id VARCHAR(64) NOT NULL REFERENCES ticketing_partners(id),
  event_id VARCHAR(64) NOT NULL,
  offer_id VARCHAR(64) NOT NULL REFERENCES event_partner_offers(id),
  link_type VARCHAR(64) NOT NULL,
  is_affiliate BOOLEAN NOT NULL DEFAULT FALSE,
  ip_hash VARCHAR(64),
  user_agent VARCHAR(512),
  referrer VARCHAR(512),
  session_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_click_id ON affiliate_clicks(click_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_partner_date ON affiliate_clicks(partner_id, created_at);

-- 4. Authenticated Partner Conversions & Commission Attribution Table
CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id VARCHAR(64) PRIMARY KEY,
  partner_id VARCHAR(64) NOT NULL REFERENCES ticketing_partners(id),
  event_id VARCHAR(64),
  click_id VARCHAR(64),
  order_ref VARCHAR(128) NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  commission_amount BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  conversion_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_affiliate_partner_order_ref UNIQUE(partner_id, order_ref)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_status ON affiliate_conversions(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_partner ON affiliate_conversions(partner_id);

-- 5. Partner Administrative Audit Trail Table
CREATE TABLE IF NOT EXISTS partner_audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  action VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_audit_logs_actor ON partner_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_partner_audit_logs_created_at ON partner_audit_logs(created_at);

-- ============================================================================
-- ROLLBACK STRATEGY:
-- DROP TABLE IF EXISTS partner_audit_logs CASCADE;
-- DROP TABLE IF EXISTS affiliate_conversions CASCADE;
-- DROP TABLE IF EXISTS affiliate_clicks CASCADE;
-- DROP TABLE IF EXISTS event_partner_offers CASCADE;
-- DROP TABLE IF EXISTS ticketing_partners CASCADE;
-- ============================================================================
