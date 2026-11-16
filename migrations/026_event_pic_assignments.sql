-- 026_event_pic_assignments.sql
-- TIKUM / ARGUS Durable Event PIC Assignments Schema
-- Ensures Event PIC assignments persist across server restarts and serverless cold starts.

CREATE TABLE IF NOT EXISTS event_pic_assignments (
  id VARCHAR(100) PRIMARY KEY,
  event_id VARCHAR(100) NOT NULL,
  venue_id VARCHAR(100) NOT NULL,
  pic_user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  contact_phone VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_pic_assignments_event ON event_pic_assignments (event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_pic_assignments_user ON event_pic_assignments (pic_user_id, status);
CREATE INDEX IF NOT EXISTS idx_event_pic_assignments_date ON event_pic_assignments (event_date);
