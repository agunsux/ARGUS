-- 000_user_and_auth_schema.sql
-- TIKUM / ARGUS User and Authentication Schema

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  normalized_email VARCHAR(255) UNIQUE,
  username VARCHAR(100) UNIQUE,
  normalized_username VARCHAR(100) UNIQUE,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(50) NOT NULL DEFAULT 'BUYER',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  password_hash VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (normalized_email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- 2. User Roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  assigned_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_role UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id);

-- 3. Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash VARCHAR(64) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  ip_address VARCHAR(100),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(100),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (expires_at, revoked);

-- 4. Auth Audit Events table
CREATE TABLE IF NOT EXISTS auth_audit_events (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100),
  event_type VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  ip_address VARCHAR(100),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_type ON auth_audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit_events (created_at DESC);
