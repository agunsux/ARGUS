# TIKUM / ARGUS Database Migration Baseline — Neon to Supabase

**Date:** 2026-10-26 (Asia/Jakarta)  
**Epic:** TIKUM DATABASE MIGRATION — NEON → SUPABASE POSTGRESQL  
**Status:** Baseline Established (Phase 0 Complete)

---

## 1. Git & Deployment Checkpoint

- **Repository:** `ARGUS` (`https://github.com/agunsux/ARGUS.git`)
- **Active Branch:** `main`
- **Initial Baseline Commit:** `c3dbc58` (`feat(blog): publish Nassar live performance essay and schedule K-pop industry analysis`)
- **Working Tree:** Clean (zero uncommitted files at baseline)
- **Active Production Deployment:**
  - Deployment ID: `dpl_6HdsDS8muezHh15HYyj1mmQWepTL`
  - Target: `production`
  - Production URL: `https://tikum.app` (Aliased)
  - Vercel Deployment Host: `https://argus-kkvhf5lsh-shinerva.vercel.app`
  - State: `READY`

---

## 2. Environments Inspected

1. **Local Environment (`.env.local`):**
   - Configured Database Host: `ep-wispy-salad-b3in9yw3-pooler.c-4.ap-southeast-1.aws.neon.tech` (Neon AWS Singapore)
   - Unpooled Host: `ep-wispy-salad-b3in9yw3.c-4.ap-southeast-1.aws.neon.tech`
   - Database: `/neondb`
2. **Vercel Production Environment (`shinerva/argus`):**
   - Variables present: `DATABASE_URL`, `CRON_SECRET`, `ADMIN_API_KEY`, `DOKU_*`, `RCB_*`, `RESEND_API_KEY`
   - Supabase variables (`SUPABASE_URL`, `SUPABASE_KEY`): **ABSENT**
   - Firebase variables: **ABSENT**
3. **Runtime Serverless Lambda (`api/index` on Vercel `iad1`):**
   - Runtime Driver: `pg` (node-postgres connection pool)
   - Connection behavior: Read-only probe fails closed with HTTP 500 / 503 (`DATABASE_ERROR`) when Neon quota limit is active.

---

## 3. Database Access Components Inventory

### Data Repositories
1. **Unified Storage Factory ([`src/storage/index.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/storage/index.js)):**
   - Resolves target via `DATABASE_URL` or instantiates fallback in non-production.
   - Enforces fail-closed in production (`isProductionRuntime()`).
2. **Marketplace & Inventory ([`src/storage/PostgresMarketplaceRepository.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/storage/PostgresMarketplaceRepository.js)):**
   - Tickets, listings, reservations, deliveries.
   - ACID concurrency locks via `SELECT ... FOR UPDATE`.
3. **Financial & Money Tier ([`src/storage/PostgresMoneyRepository.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/storage/PostgresMoneyRepository.js)):**
   - Quotes, orders, payments, attempts, provider webhooks, escrows, settlements, disputes, chargebacks, double-entry financial ledger.
4. **Users & Auth ([`src/storage/PostgresUserRepository.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/storage/PostgresUserRepository.js)):**
   - Users, user roles, sessions, auth audit events.
5. **Event Catalog & Discovery ([`src/discovery/repository/PostgresCatalogRepository.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/discovery/repository/PostgresCatalogRepository.js)):**
   - Canonical events, source snapshots, source links, reconciliation runs, scheduler lease locks.

---

## 4. Migration & Schema Inventory

The ARGUS schema consists of 5 sequential idempotent SQL files + runtime auth DDL:

| Migration File | Primary Tables Defined | Notes |
| :--- | :--- | :--- |
| `src/storage/PostgresUserRepository.js` | `users`, `user_roles`, `sessions`, `auth_audit_events` | Auto-run during `init()` |
| [`migrations/001_catalog_schema.sql`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/migrations/001_catalog_schema.sql) | `canonical_events`, `source_snapshots`, `event_source_links`, `reconciliation_runs`, `discovery_scheduler_state` | Catalog & discovery tier |
| [`migrations/002_marketplace_and_money_schema.sql`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/migrations/002_marketplace_and_money_schema.sql) | `marketplace_tickets`, `marketplace_listings`, `marketplace_reservations`, `marketplace_deliveries`, `financial_quotes`, `financial_orders`, `financial_payments`, `financial_payment_attempts`, `financial_provider_webhooks`, `financial_escrows`, `financial_settlements`, `financial_disputes`, `financial_chargebacks`, `financial_ledger_transactions`, `financial_ledger_entries`, `financial_idempotency_records` | Marketplace & double-entry ledger |
| [`migrations/003_demand_alerts_schema.sql`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/migrations/003_demand_alerts_schema.sql) | `demand_alerts` | Waitlist & PDP Act compliance |
| [`migrations/004_marketplace_offers_schema.sql`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/migrations/004_marketplace_offers_schema.sql) | `marketplace_negotiations`, `marketplace_offers`, `marketplace_offer_audit_logs` | Negotiation & offer bounds |
| [`migrations/005_affiliate_partners_schema.sql`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/migrations/005_affiliate_partners_schema.sql) | `ticketing_partners`, `event_partner_offers`, `affiliate_click_events` | Partner ticketing & referrals |

**Total core tables:** 29 tables across catalog, marketplace, finance, auth, and partners.

---

## 5. Audit Boundaries & Invariants

- **Read-Only / Zero Disruption Rule:** Do not modify Neon data or destructive commands.
- **Credential Protection:** Never print secrets or full database URLs.
- **Fail-Closed Rule:** Database unavailability must return `DATABASE_ERROR` (HTTP 500/503) in production; no silent fallback to in-memory for transactional data.
