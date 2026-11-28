-- =============================================================================
-- Migration 034: Pre-Launch Ticket Waitlist, Anti-Duplicate Booking Hash Registry,
--                and Admin PIC Field Dispatch Metadata (Strictly Additive)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ticket_waitlist_requests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_title TEXT NOT NULL,
  contact_whatsapp TEXT NOT NULL,
  seat_preference TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  max_budget_idr BIGINT,
  locale TEXT NOT NULL DEFAULT 'id',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_waitlist_event_wa
  ON public.ticket_waitlist_requests (event_id, contact_whatsapp);

CREATE INDEX IF NOT EXISTS idx_ticket_waitlist_event_status
  ON public.ticket_waitlist_requests (event_id, status);

CREATE TABLE IF NOT EXISTS public.ticket_booking_code_hashes (
  hash_sha256 TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  listing_id TEXT,
  seller_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_booking_hashes_event_status
  ON public.ticket_booking_code_hashes (event_id, status);

CREATE INDEX IF NOT EXISTS idx_ticket_booking_hashes_listing_id
  ON public.ticket_booking_code_hashes (listing_id);

CREATE TABLE IF NOT EXISTS public.event_pic_dispatch (
  event_id TEXT PRIMARY KEY,
  pic_officer_name TEXT,
  pic_officer_whatsapp TEXT,
  gate_meeting_point TEXT,
  standby_time_wib TEXT,
  dispatch_status TEXT NOT NULL DEFAULT 'UNASSIGNED',
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_pic_dispatch_status
  ON public.event_pic_dispatch (dispatch_status);
