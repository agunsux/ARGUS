-- ============================================================================
-- Migration: 006_compliance_and_dual_authorization.sql
-- Description: Financial Dual Authorization (Maker-Checker), Verified Bank Disbursement,
--              and Strict Settlement Audit Trail
-- Operating Entity: PT SHINERVA PRAJNA TEJAS (Tikum Marketplace)
--
-- Invariants:
-- 1. High-risk financial operations strictly require dual authorization (maker_id != checker_id).
-- 2. Authorization is bound to exact order_id, amount, currency, and payout destination.
-- 3. Approvals cannot be reused: execution atomically marks authorization as CONSUMED.
-- 4. Settlements cannot claim DISBURSED status without verified bank reference and evidence.
-- 5. Duplicate bank reference reuse within the same bank account is forbidden.
-- ============================================================================

-- 1. Dual Authorization Table (Maker-Checker Gate)
CREATE TABLE IF NOT EXISTS financial_authorizations (
  id VARCHAR(64) PRIMARY KEY,
  authorization_id VARCHAR(64) UNIQUE NOT NULL,
  order_id VARCHAR(64) NOT NULL REFERENCES financial_orders(id),
  action_type VARCHAR(64) NOT NULL,
  maker_id VARCHAR(100) NOT NULL REFERENCES users(id),
  checker_id VARCHAR(100) REFERENCES users(id),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL',
  amount BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  payout_destination VARCHAR(255),
  reason TEXT NOT NULL,
  approval_notes TEXT,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  consumed_by_settlement_id VARCHAR(64),
  CONSTRAINT chk_maker_checker_distinct CHECK (checker_id IS NULL OR maker_id <> checker_id),
  CONSTRAINT chk_valid_status CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONSUMED', 'REVOKED'))
);

CREATE INDEX IF NOT EXISTS idx_fin_auth_order ON financial_authorizations(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_auth_status ON financial_authorizations(status);
CREATE INDEX IF NOT EXISTS idx_fin_auth_action ON financial_authorizations(action_type);
CREATE INDEX IF NOT EXISTS idx_fin_auth_maker ON financial_authorizations(maker_id);
CREATE INDEX IF NOT EXISTS idx_fin_auth_checker ON financial_authorizations(checker_id);
CREATE INDEX IF NOT EXISTS idx_fin_auth_destination ON financial_authorizations(payout_destination);

-- Partial index: at most ONE pending authorization per order and action type
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_auth_pending_order_action
  ON financial_authorizations(order_id, action_type)
  WHERE status = 'PENDING_APPROVAL';

-- 2. Additive columns for financial_settlements (Disbursement Verification)
ALTER TABLE financial_settlements
  ADD COLUMN IF NOT EXISTS bank_reference_number VARCHAR(128),
  ADD COLUMN IF NOT EXISTS proof_document_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_verified_by VARCHAR(100) REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS authorization_id VARCHAR(64) REFERENCES financial_authorizations(authorization_id),
  ADD COLUMN IF NOT EXISTS authorized_by VARCHAR(100) REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS confirmed_by_officer VARCHAR(100) REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_fin_settlements_bank_ref ON financial_settlements(bank_reference_number);
CREATE INDEX IF NOT EXISTS idx_fin_settlements_auth_id ON financial_settlements(authorization_id);

-- Enforce unique bank reference per bank account to prevent duplicate disbursement reuse
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_settlements_account_bank_ref
  ON financial_settlements(bank_account, bank_reference_number)
  WHERE bank_reference_number IS NOT NULL AND status = 'DISBURSED';
