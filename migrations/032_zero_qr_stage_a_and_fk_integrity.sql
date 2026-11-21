-- 032_zero_qr_stage_a_and_fk_integrity.sql
-- TIKUM: Relational Integrity & Stage A Zero-QR Support
-- Target: PostgreSQL 14+ / Supabase / Neon
-- Invariants:
--   1. Idempotent execution
--   2. Preserves foreign key constraints (marketplace_listings_ticket_id_fkey)
--   3. Guarantees barcode_hash is nullable on marketplace_tickets for Stage A Zero-QR submissions

DO $$
BEGIN
  -- 1. Ensure barcode_hash on marketplace_tickets is nullable (Zero-QR Stage A)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'marketplace_tickets' AND column_name = 'barcode_hash' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE marketplace_tickets ALTER COLUMN barcode_hash DROP NOT NULL;
  END IF;

  -- 2. Verify foreign key constraint marketplace_listings_ticket_id_fkey exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'marketplace_listings_ticket_id_fkey'
      AND table_name = 'marketplace_listings'
  ) THEN
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT marketplace_listings_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES marketplace_tickets(id) ON DELETE CASCADE;
  END IF;

  -- 3. Verify foreign key constraint marketplace_listings_canonical_event_id_fkey exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'marketplace_listings_canonical_event_id_fkey'
      AND table_name = 'marketplace_listings'
  ) THEN
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT marketplace_listings_canonical_event_id_fkey
      FOREIGN KEY (canonical_event_id) REFERENCES canonical_events(id);
  END IF;

  -- 4. Verify foreign key constraint marketplace_tickets_canonical_event_id_fkey exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'marketplace_tickets_canonical_event_id_fkey'
      AND table_name = 'marketplace_tickets'
  ) THEN
    ALTER TABLE marketplace_tickets
      ADD CONSTRAINT marketplace_tickets_canonical_event_id_fkey
      FOREIGN KEY (canonical_event_id) REFERENCES canonical_events(id);
  END IF;
END $$;

-- 5. Helpful indexes for performance and foreign key traversals
CREATE INDEX IF NOT EXISTS idx_mkt_listings_ticket ON marketplace_listings(ticket_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_event ON marketplace_listings(canonical_event_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tickets_event ON marketplace_tickets(canonical_event_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tickets_seller ON marketplace_tickets(seller_id);
