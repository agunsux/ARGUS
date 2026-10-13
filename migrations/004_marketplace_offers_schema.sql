-- Migration 004: Durable Marketplace Offers, Negotiations & Offer Audit Trail
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Idempotent execution (IF NOT EXISTS)
--   - Non-destructive (Never DROP, never TRUNCATE existing tables)
--   - Minor integer units for financial amounts (BIGINT > 0)
--   - Enforces at most 1 PENDING offer per (listing_id, buyer_id)
--   - Enforces at most 1 ACCEPTED offer per listing_id
--   - Enforces self-offer prohibition (buyer_id <> seller_id)
--   - Enforces maximum 5 negotiation proposals per (listing_id, buyer_id)
--
-- Rollout Plan:
--   1. Apply this migration to Neon PostgreSQL before deploying offer-persistence code.
--   2. Verify tables and indexes via information_schema.tables and pg_indexes.
--   3. Deploy application release.
--
-- Rollback Plan (Only if zero production offers need preservation or after archival):
--   DROP TABLE IF EXISTS marketplace_offer_audit_logs;
--   DROP TABLE IF EXISTS marketplace_offers;
--   DROP TABLE IF EXISTS marketplace_negotiations;

-- ============================================================================
-- 1. MARKETPLACE NEGOTIATIONS (Bounded 5-Proposal Negotiation Sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_negotiations (
  id VARCHAR(128) PRIMARY KEY,
  listing_id VARCHAR(64) NOT NULL,
  ticket_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  buyer_id VARCHAR(100) NOT NULL,
  seller_id VARCHAR(100) NOT NULL,
  listing_price BIGINT NOT NULL CHECK (listing_price > 0),
  proposal_count INT NOT NULL DEFAULT 0 CHECK (proposal_count >= 0 AND proposal_count <= 5),
  max_proposals INT NOT NULL DEFAULT 5 CHECK (max_proposals = 5),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (
    status IN (
      'ACTIVE',
      'ACCEPTED',
      'REJECTED',
      'CANCELLED_BY_BUYER',
      'NEGOTIATION_LIMIT_REACHED'
    )
  ),
  current_amount BIGINT CHECK (current_amount IS NULL OR current_amount > 0),
  current_turn VARCHAR(16) CHECK (current_turn IS NULL OR current_turn IN ('BUYER', 'SELLER')),
  active_offer_id VARCHAR(64),
  proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_mkt_negotiations_no_self_deal CHECK (buyer_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_negotiations_listing_buyer
  ON marketplace_negotiations (listing_id, buyer_id);

CREATE INDEX IF NOT EXISTS idx_mkt_negotiations_seller
  ON marketplace_negotiations (seller_id, updated_at DESC);

-- ============================================================================
-- 2. MARKETPLACE OFFERS (Structured Price Offers & Counter-Offers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_offers (
  id VARCHAR(64) PRIMARY KEY,
  listing_id VARCHAR(64) NOT NULL,
  ticket_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  buyer_id VARCHAR(100) NOT NULL,
  seller_id VARCHAR(100) NOT NULL,
  negotiation_id VARCHAR(128) REFERENCES marketplace_negotiations(id) ON DELETE SET NULL,
  original_price BIGINT NOT NULL CHECK (original_price > 0),
  offer_amount BIGINT NOT NULL CHECK (offer_amount > 0),
  counter_amount BIGINT CHECK (counter_amount IS NULL OR counter_amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN (
      'PENDING',
      'ACCEPTED',
      'DECLINED',
      'EXPIRED',
      'WITHDRAWN',
      'SUPERSEDED',
      'COUNTERED',
      'NEGOTIATION_LIMIT_REACHED'
    )
  ),
  decline_reason VARCHAR(64) CHECK (
    decline_reason IS NULL OR decline_reason IN (
      'PRICE_TOO_LOW',
      'CHANGED_MIND_NOT_SELLING',
      'PREFER_ANOTHER_BUYER',
      'LISTING_WILL_BE_UPDATED',
      'OTHER'
    )
  ),
  sequence_number INT NOT NULL DEFAULT 1 CHECK (sequence_number >= 1 AND sequence_number <= 5),
  proposal_count INT NOT NULL DEFAULT 1 CHECK (proposal_count >= 1 AND proposal_count <= 5),
  max_proposals INT NOT NULL DEFAULT 5 CHECK (max_proposals = 5),
  negotiation_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  accepted_order_id VARCHAR(64),
  order_id VARCHAR(64),
  version INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  countered_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_mkt_offers_no_self_offer CHECK (buyer_id <> seller_id),
  CONSTRAINT chk_mkt_offers_below_original CHECK (offer_amount <= original_price),
  CONSTRAINT chk_mkt_offers_counter_cap CHECK (counter_amount IS NULL OR counter_amount <= original_price)
);

CREATE INDEX IF NOT EXISTS idx_mkt_offers_listing_status
  ON marketplace_offers (listing_id, status);

CREATE INDEX IF NOT EXISTS idx_mkt_offers_buyer_status
  ON marketplace_offers (buyer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mkt_offers_seller_status
  ON marketplace_offers (seller_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mkt_offers_expires
  ON marketplace_offers (status, expires_at)
  WHERE status = 'PENDING';

-- Invariant: At most 1 PENDING offer per buyer per listing
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_offers_active_buyer_listing
  ON marketplace_offers (listing_id, buyer_id)
  WHERE status = 'PENDING';

-- Invariant: At most 1 ACCEPTED offer per listing
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_offers_accepted_listing
  ON marketplace_offers (listing_id)
  WHERE status = 'ACCEPTED';

-- ============================================================================
-- 3. MARKETPLACE OFFER AUDIT LOGS (Immutable Offer State Transition Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_offer_audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  offer_id VARCHAR(64) NOT NULL REFERENCES marketplace_offers(id) ON DELETE RESTRICT,
  actor_id VARCHAR(100) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  ip_address VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_offer_audit_offer
  ON marketplace_offer_audit_logs (offer_id, created_at ASC);
