-- 029_buyer_inquiries.sql
-- TIKUM Phase 1: Buyer Inquiries / Lead Capture & Operational Notification State
-- Stores buyer purchase interest submissions ("Saya Berminat") for manual WhatsApp/telephone follow-up

CREATE TABLE IF NOT EXISTS buyer_inquiries (
  id VARCHAR(100) PRIMARY KEY,
  listing_id VARCHAR(100) NOT NULL,
  buyer_id VARCHAR(100) NOT NULL,
  seller_id VARCHAR(100) NOT NULL,
  event_id VARCHAR(120),
  ticket_id VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  proposed_price BIGINT,
  message TEXT,
  buyer_name VARCHAR(150),
  buyer_email VARCHAR(255),
  contact_phone VARCHAR(60),
  follow_up_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_FOLLOWUP',
  admin_notes TEXT,
  notification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  notification_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_listing ON buyer_inquiries (listing_id);
CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_buyer ON buyer_inquiries (buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_seller ON buyer_inquiries (seller_id);
CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_status ON buyer_inquiries (follow_up_status);
