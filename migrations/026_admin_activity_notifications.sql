-- Migration 026: Admin Activity Notifications & Delivery Audit Log
-- Durable tracking for all operational and user activity alerts sent to administrators.

CREATE TABLE IF NOT EXISTS admin_activity_notifications (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(128) UNIQUE NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  priority VARCHAR(16) NOT NULL,
  user_id VARCHAR(64),
  user_email VARCHAR(255),
  recipients TEXT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON admin_activity_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notif_type ON admin_activity_notifications (event_type);
CREATE INDEX IF NOT EXISTS idx_admin_notif_user ON admin_activity_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notif_status ON admin_activity_notifications (status);
