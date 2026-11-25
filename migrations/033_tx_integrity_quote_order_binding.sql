-- Migration 033: Transaction Integrity, Quote-to-Order Binding, Fulfillment & Ledger Uniqueness
-- Target: Neon Postgres / PostgreSQL 14+
-- Invariants:
--   - Strictly additive & idempotent (IF NOT EXISTS / DO $$ ... END $$)
--   - Non-destructive (never DROP or TRUNCATE)
--   - Never coerce missing/unknown fulfillment_type rows silently to SELLER_MANAGED

DO $$
DECLARE
  v_schema TEXT := current_schema();
BEGIN
  -- 1. marketplace_listings: typed fulfillment_type (nullable for legacy audit clarity; no silent coercion)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'marketplace_listings' AND column_name = 'fulfillment_type'
  ) THEN
    ALTER TABLE marketplace_listings ADD COLUMN fulfillment_type VARCHAR(32);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = v_schema AND table_name = 'marketplace_listings' AND constraint_name = 'chk_mkt_listings_fulfillment_type'
  ) THEN
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT chk_mkt_listings_fulfillment_type
      CHECK (fulfillment_type IN ('SELLER_MANAGED', 'TIKUM_VENUE_PIC'));
  END IF;

  -- Clean backfill ONLY where metadata already contains an authoritative valid value
  UPDATE marketplace_listings
  SET fulfillment_type = UPPER(TRIM(COALESCE(NULLIF(metadata->>'fulfillment_type', ''), NULLIF(metadata->>'fulfillment_option', ''))))
  WHERE fulfillment_type IS NULL
    AND UPPER(TRIM(COALESCE(NULLIF(metadata->>'fulfillment_type', ''), NULLIF(metadata->>'fulfillment_option', '')))) IN ('SELLER_MANAGED', 'TIKUM_VENUE_PIC');

  -- 2. financial_quotes: canonical binding fields & single-use order link
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_quotes' AND column_name = 'gross_ticket_value'
  ) THEN
    ALTER TABLE financial_quotes ADD COLUMN gross_ticket_value BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_quotes' AND column_name = 'fulfillment_option'
  ) THEN
    ALTER TABLE financial_quotes ADD COLUMN fulfillment_option VARCHAR(32);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = v_schema AND table_name = 'financial_quotes' AND constraint_name = 'chk_fin_quotes_fulfillment_option'
  ) THEN
    ALTER TABLE financial_quotes
      ADD CONSTRAINT chk_fin_quotes_fulfillment_option
      CHECK (fulfillment_option IN ('SELLER_MANAGED', 'TIKUM_VENUE_PIC'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_quotes' AND column_name = 'offer_id'
  ) THEN
    ALTER TABLE financial_quotes ADD COLUMN offer_id VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_quotes' AND column_name = 'consumed_by_order_id'
  ) THEN
    ALTER TABLE financial_quotes ADD COLUMN consumed_by_order_id VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = v_schema AND table_name = 'financial_quotes' AND constraint_name = 'uq_fin_quotes_consumed_by_order_id'
  ) THEN
    ALTER TABLE financial_quotes
      ADD CONSTRAINT uq_fin_quotes_consumed_by_order_id UNIQUE (consumed_by_order_id);
  END IF;

  -- Backfill gross_ticket_value where historical ticket_price & quantity exist
  UPDATE financial_quotes
  SET gross_ticket_value = ticket_price * quantity
  WHERE gross_ticket_value IS NULL
    AND ticket_price IS NOT NULL
    AND quantity IS NOT NULL;

  -- 3. financial_orders: canonical pricing snapshot & quote uniqueness
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_orders' AND column_name = 'ticket_price'
  ) THEN
    ALTER TABLE financial_orders ADD COLUMN ticket_price BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_orders' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE financial_orders ADD COLUMN quantity INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = v_schema AND table_name = 'financial_orders' AND constraint_name = 'chk_fin_orders_quantity_positive'
  ) THEN
    ALTER TABLE financial_orders
      ADD CONSTRAINT chk_fin_orders_quantity_positive CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_orders' AND column_name = 'gross_ticket_value'
  ) THEN
    ALTER TABLE financial_orders ADD COLUMN gross_ticket_value BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_orders' AND column_name = 'fulfillment_option'
  ) THEN
    ALTER TABLE financial_orders ADD COLUMN fulfillment_option VARCHAR(32);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = v_schema AND table_name = 'financial_orders' AND constraint_name = 'chk_fin_orders_fulfillment_option'
  ) THEN
    ALTER TABLE financial_orders
      ADD CONSTRAINT chk_fin_orders_fulfillment_option
      CHECK (fulfillment_option IN ('SELLER_MANAGED', 'TIKUM_VENUE_PIC'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_orders' AND column_name = 'buyer_fee'
  ) THEN
    ALTER TABLE financial_orders ADD COLUMN buyer_fee BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_orders' AND column_name = 'seller_fee'
  ) THEN
    ALTER TABLE financial_orders ADD COLUMN seller_fee BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'financial_orders' AND column_name = 'fee_policy_version'
  ) THEN
    ALTER TABLE financial_orders ADD COLUMN fee_policy_version VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = v_schema AND table_name = 'financial_orders' AND constraint_name = 'uq_fin_orders_quote_id'
  ) THEN
    ALTER TABLE financial_orders
      ADD CONSTRAINT uq_fin_orders_quote_id UNIQUE (quote_id);
  END IF;
END $$;

-- 4. financial_ledger_transactions: single CAPTURE & single RELEASE per order_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_ledger_capture_order
  ON financial_ledger_transactions (order_id)
  WHERE event_type = 'CAPTURE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_ledger_release_order
  ON financial_ledger_transactions (order_id)
  WHERE event_type = 'RELEASE';
