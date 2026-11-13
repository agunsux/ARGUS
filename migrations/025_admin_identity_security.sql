-- Additive migration. Apply explicitly before releasing admin magic-link authentication.
-- No account promotion, payment changes, or legacy session deletion.
CREATE TABLE IF NOT EXISTS admin_magic_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  consumed_at TIMESTAMPTZ,
  accepted BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS admin_auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '8 hours'),
  revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS admin_auth_limits (
  key_hash CHAR(64) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0)
);