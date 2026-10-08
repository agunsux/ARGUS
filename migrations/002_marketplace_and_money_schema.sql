-- Migration 002: Marketplace Inventory and Durable Money Schema
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Idempotent execution (IF NOT EXISTS)
--   - Non-destructive (Never DROP, never TRUNCATE)
--   - Minor integer units for financial amounts (BIGINT)
--   - Explicit domain boundaries between Marketplace and Money tiers

-- ============================================================================
-- 1. MARKETPLACE & INVENTORY TIER
-- ============================================================================

-- 1.1 Canonical Ticket Assets (Ownership & Physical Asset Identity)
CREATE TABLE IF NOT EXISTS marketplace_tickets (
  id VARCHAR(64) PRIMARY KEY,
  seller_id VARCHAR(64) NOT NULL,
  current_owner_id VARCHAR(64) NOT NULL,
  canonical_event_id VARCHAR(64) NOT NULL REFERENCES canonical_events(id),
  ticket_type VARCHAR(64) NOT NULL DEFAULT 'GENERAL_ADMISSION',
  section VARCHAR(64),
  row_id VARCHAR(64),
  seat VARCHAR(64),
  quantity INT NOT NULL DEFAULT 1,
  face_value BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ticket_format VARCHAR(32) NOT NULL DEFAULT 'E_TICKET',
  transfer_method VARCHAR(32) NOT NULL DEFAULT 'MOBILE_TRANSFER',
  status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED',
  locked_by VARCHAR(64),
  locked_until TIMESTAMPTZ,
  barcode_hash VARCHAR(64),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_tickets_seller ON marketplace_tickets(seller_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tickets_owner ON marketplace_tickets(current_owner_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tickets_event ON marketplace_tickets(canonical_event_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tickets_status ON marketplace_tickets(status);

-- 1.2 Marketplace Listings (Offers Against Ticket Assets)
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id VARCHAR(64) PRIMARY KEY,
  ticket_id VARCHAR(64) NOT NULL REFERENCES marketplace_tickets(id),
  seller_id VARCHAR(64) NOT NULL,
  canonical_event_id VARCHAR(64) NOT NULL REFERENCES canonical_events(id),
  price BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ,
  pricing_policy_version VARCHAR(64) DEFAULT 'TIKUM_FEE_POLICY_V1',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_listings_ticket ON marketplace_listings(ticket_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_event ON marketplace_listings(canonical_event_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_seller ON marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_status ON marketplace_listings(status);

-- Invariant: A ticket can have at most ONE active or reserved listing
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_active_ticket_listing
  ON marketplace_listings (ticket_id)
  WHERE status IN ('ACTIVE', 'RESERVED');

-- 1.3 Inventory Reservations (Temporary Concurrency Holds)
CREATE TABLE IF NOT EXISTS marketplace_reservations (
  id VARCHAR(64) PRIMARY KEY,
  listing_id VARCHAR(64) NOT NULL REFERENCES marketplace_listings(id),
  ticket_id VARCHAR(64) NOT NULL REFERENCES marketplace_tickets(id),
  buyer_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expired_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mkt_reservations_buyer ON marketplace_reservations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_mkt_reservations_status ON marketplace_reservations(status, expires_at);

-- Invariant: At most ONE pending reservation per listing at any time
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_pending_reservation
  ON marketplace_reservations (listing_id)
  WHERE status = 'PENDING';

-- 1.4 Ticket Deliveries (Digital Fulfillment & Gate Admission)
CREATE TABLE IF NOT EXISTS marketplace_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  ticket_id VARCHAR(64) NOT NULL REFERENCES marketplace_tickets(id),
  recipient_user_id VARCHAR(64) NOT NULL,
  delivery_method VARCHAR(32) NOT NULL DEFAULT 'MOBILE_TRANSFER',
  delivery_reference VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  delivered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  verified_at_venue TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_deliveries_order ON marketplace_deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_mkt_deliveries_ticket ON marketplace_deliveries(ticket_id);

-- ============================================================================
-- 2. FINANCIAL & MONEY TIER
-- ============================================================================

-- 2.1 Financial Quotes (Immutable Mathematical Price Locks)
CREATE TABLE IF NOT EXISTS financial_quotes (
  quote_id VARCHAR(64) PRIMARY KEY,
  listing_id VARCHAR(64) NOT NULL REFERENCES marketplace_listings(id),
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  ticket_price BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  buyer_fee BIGINT NOT NULL DEFAULT 0,
  seller_fee BIGINT NOT NULL DEFAULT 0,
  buyer_tax BIGINT NOT NULL DEFAULT 0,
  seller_tax BIGINT NOT NULL DEFAULT 0,
  payment_fee BIGINT NOT NULL DEFAULT 0,
  buyer_total BIGINT NOT NULL,
  seller_payout BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  pricing_policy_version VARCHAR(64) NOT NULL,
  tax_policy_version VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fin_quotes_listing ON financial_quotes(listing_id);
CREATE INDEX IF NOT EXISTS idx_fin_quotes_status ON financial_quotes(status, expires_at);

-- 2.2 Financial Orders (Binding Purchase Contracts)
CREATE TABLE IF NOT EXISTS financial_orders (
  id VARCHAR(64) PRIMARY KEY,
  idempotency_key VARCHAR(128) UNIQUE,
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  listing_id VARCHAR(64) NOT NULL REFERENCES marketplace_listings(id),
  ticket_id VARCHAR(64) NOT NULL REFERENCES marketplace_tickets(id),
  canonical_event_id VARCHAR(64) NOT NULL REFERENCES canonical_events(id),
  quote_id VARCHAR(64) REFERENCES financial_quotes(quote_id),
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  total_amount BIGINT NOT NULL,
  buyer_total BIGINT NOT NULL,
  seller_payout BIGINT NOT NULL,
  service_fee BIGINT NOT NULL DEFAULT 0,
  buyer_tax BIGINT NOT NULL DEFAULT 0,
  seller_tax BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  payment_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_orders_buyer ON financial_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_fin_orders_seller ON financial_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_fin_orders_event ON financial_orders(canonical_event_id);
CREATE INDEX IF NOT EXISTS idx_fin_orders_status ON financial_orders(status);

-- 2.3 Canonical Payments (Gateway Payment Intents)
CREATE TABLE IF NOT EXISTS financial_payments (
  id VARCHAR(64) PRIMARY KEY,
  internal_payment_id VARCHAR(64) UNIQUE NOT NULL,
  order_id VARCHAR(64) NOT NULL REFERENCES financial_orders(id),
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'doku',
  provider_transaction_id VARCHAR(128),
  provider_reference VARCHAR(128) UNIQUE,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  gross_amount BIGINT NOT NULL,
  provider_fee BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'PAYMENT_PENDING',
  money_state VARCHAR(32) NOT NULL DEFAULT 'PAYMENT_PENDING',
  payment_method VARCHAR(64) DEFAULT 'QRIS',
  idempotency_key VARCHAR(128) UNIQUE,
  paid_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_payments_order ON financial_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_payments_provider_ref ON financial_payments(provider_reference);
CREATE INDEX IF NOT EXISTS idx_fin_payments_status ON financial_payments(status);

-- 2.4 Payment Routing Attempts (Multi-Rail Auditing)
CREATE TABLE IF NOT EXISTS financial_payment_attempts (
  id VARCHAR(64) PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL REFERENCES financial_payments(id),
  order_id VARCHAR(64) NOT NULL REFERENCES financial_orders(id),
  provider VARCHAR(32) NOT NULL,
  channel VARCHAR(32) NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  provider_ref VARCHAR(128),
  error_code VARCHAR(64),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_attempts_payment ON financial_payment_attempts(payment_id);

-- 2.5 Provider Webhook Ledger (Replay-Proof Gateway Audit)
CREATE TABLE IF NOT EXISTS financial_provider_webhooks (
  id VARCHAR(64) PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  provider_event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'PAYMENT_EVENT',
  payload_hash VARCHAR(64) NOT NULL,
  signature_status VARCHAR(32) NOT NULL DEFAULT 'VALID',
  processing_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  -- Hard Invariant: Provider event can be recorded only ONCE
  CONSTRAINT uq_fin_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_webhooks_status ON financial_provider_webhooks(processing_status);

-- 2.6 Escrow Accounts (Trust Hold & Release Engine)
CREATE TABLE IF NOT EXISTS financial_escrows (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) UNIQUE NOT NULL REFERENCES financial_orders(id),
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_PAYMENT',
  held_by VARCHAR(64) NOT NULL DEFAULT 'DOKU_ESCROW',
  provider_escrow_id VARCHAR(128),
  dispute_hold BOOLEAN NOT NULL DEFAULT FALSE,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  funded_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_escrows_order ON financial_escrows(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_escrows_status ON financial_escrows(status);

-- 2.7 Settlements (Seller Payout Disbursals)
CREATE TABLE IF NOT EXISTS financial_settlements (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) UNIQUE NOT NULL REFERENCES financial_orders(id),
  seller_id VARCHAR(64) NOT NULL,
  officer_id VARCHAR(64),
  amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  settlement_mode VARCHAR(64) NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
  payout_ref VARCHAR(128),
  bank_account VARCHAR(255),
  idempotency_key VARCHAR(128) UNIQUE,
  disbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_settlements_seller ON financial_settlements(seller_id);
CREATE INDEX IF NOT EXISTS idx_fin_settlements_status ON financial_settlements(status);

-- 2.8 Disputes (Contested Claims & Operational Holds)
CREATE TABLE IF NOT EXISTS financial_disputes (
  id VARCHAR(64) PRIMARY KEY,
  dispute_id VARCHAR(64) UNIQUE NOT NULL,
  order_id VARCHAR(64) UNIQUE NOT NULL REFERENCES financial_orders(id),
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  ticket_id VARCHAR(64) NOT NULL REFERENCES marketplace_tickets(id),
  canonical_event_id VARCHAR(64) NOT NULL REFERENCES canonical_events(id),
  pic_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  outcome VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  reason VARCHAR(64) NOT NULL,
  claim_details TEXT,
  decision_notes TEXT,
  evidence_bundle_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fin_disputes_order ON financial_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_disputes_status ON financial_disputes(status);

-- 2.9 Chargebacks (Payment Gateway Reversals)
CREATE TABLE IF NOT EXISTS financial_chargebacks (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES financial_orders(id),
  provider VARCHAR(32) NOT NULL,
  provider_ref VARCHAR(128) NOT NULL,
  amount BIGINT NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fin_chargebacks_order ON financial_chargebacks(order_id);

-- 2.10 Financial Ledger Transactions (Append-Only Journal Transactions)
CREATE TABLE IF NOT EXISTS financial_ledger_transactions (
  transaction_id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  quote_id VARCHAR(64),
  event_type VARCHAR(32) NOT NULL,
  total_amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  description TEXT NOT NULL,
  actor_id VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_ledger_tx_order ON financial_ledger_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_ledger_tx_event ON financial_ledger_transactions(event_type);
CREATE INDEX IF NOT EXISTS idx_fin_ledger_tx_created ON financial_ledger_transactions(created_at);

-- 2.11 Financial Ledger Entries (Append-Only Balancing Debits/Credits)
CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  entry_id VARCHAR(128) PRIMARY KEY,
  transaction_id VARCHAR(64) NOT NULL REFERENCES financial_ledger_transactions(transaction_id) ON DELETE CASCADE,
  order_id VARCHAR(64) NOT NULL,
  ledger_account VARCHAR(64) NOT NULL,
  entry_type VARCHAR(10) NOT NULL, -- 'DEBIT' or 'CREDIT'
  amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  source_event VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ledger_entry_type CHECK (entry_type IN ('DEBIT', 'CREDIT')),
  CONSTRAINT chk_ledger_entry_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_fin_ledger_entries_tx ON financial_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fin_ledger_entries_order ON financial_ledger_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_ledger_entries_account ON financial_ledger_entries(ledger_account);

-- 2.12 Generic Operation Idempotency Records
CREATE TABLE IF NOT EXISTS financial_idempotency_records (
  key VARCHAR(128) PRIMARY KEY,
  scope VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fin_idempotency_scope ON financial_idempotency_records(scope);
