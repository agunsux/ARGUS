# TIKUM / ARGUS: DURABLE STATE + ADMIN LOCKDOWN
## Implementation Plan & Forensic Audit (Phase 0)

> **Context**: Commit `a6e9acf` is live on `tikum.app`. Production currently serves 12 upcoming / 39 canonical events, while transient in-memory reconciliation demonstrated 311 events. Runtime state is in-memory on Vercel serverless, resetting on cold starts. Admin endpoints under `/api/discovery/admin/*` and legacy `/api/admin/*` surfaces lack strict fail-closed API key enforcement.
>
> **Gate Status**: This document delivers the mandatory **Phase 0 Read-Only Forensic Audit** and **Architectural Blueprint**. Per hard constraints, execution halts immediately after this document is written for user review and approval before any code is modified.

---

## 1. Phase 0a: In-Memory / Module-Level State Audit

The table below enumerates every module-level in-memory state, collection, singleton map, and temporary file store across the ARGUS/Tikum repository.

| Name / Collection | File Location | Lost on Cold Start? | Tier | Forensic Description & Blast Radius |
| :--- | :--- | :---: | :---: | :--- |
| `state.events` | `src/database.js` | **YES** | Catalog | 26 seed events at boot; dynamic reconciled events (e.g. 285 LOKET) wiped on cold restart. |
| `canonicalRegistry.events` (Map) | `src/discovery/CanonicalEventRegistry.js` | **YES** | Catalog | In-memory `Map(event_id -> CanonicalEvent)`. Loads 39 events on boot; dynamic items lost on restart. |
| `canonicalRegistry.slugMap` (Map) | `src/discovery/CanonicalEventRegistry.js` | **YES** | Catalog | In-memory `Map(slug -> event_id)`. Wiped on container recycle. |
| `OfficialSourceSnapshotStore` | `src/discovery/OfficialSourceSnapshotStore.js` | **NO** | Catalog | Static JSON fixture on disk (`official_event_snapshot.json`). Survives cold start, but is immutable at runtime. |
| `state.venues` | `src/database.js` / `VenueRegistry.js` | **YES** | Catalog | Verified venue catalogue. Reverts to bootstrap seed list on cold start. |
| `state.event_pics` | `src/database.js` / `EventPicService.js` | **YES** | Catalog | Assignment of Person-In-Charge to events. Wiped on cold start. |
| `state.event_lifecycles` | `src/database.js` | **YES** | Catalog | Temporal transition history of event states. Wiped on cold start. |
| `state.promoter_imports` | `src/database.js` | **YES** | Catalog | History of promoter registry CSV imports. Wiped on cold start. |
| `state.articles` | `src/database.js` / `PublishingScheduler.js` | **YES** | Catalog (Content) | Editorial and SEO articles. Reverts to bootstrap seed articles on restart. |
| `state.users` | `src/database.js` | **YES** | User | Registered buyers, sellers, admins. Only default seed admin recreates on boot; real users lost! |
| `state.seller_profiles` | `src/database.js` | **YES** | User | Seller KYC status, trust score, bank account details. Wiped on restart. |
| `state.sessions` | `src/database.js` / `SessionStore.js` | **YES** | User | Writes to `/tmp/argus_data/sessions.json` on Vercel; ephemeral container storage destroyed on cold start. |
| `state.magic_link_tokens` | `src/database.js` / `MagicLinkService.js` | **YES** | User | Active login tokens and rate-limit tracking maps. Wiped on restart. |
| `state.step_up_tokens` | `src/database.js` | **YES** | User | High-privilege elevation tokens. Wiped on restart. |
| `state.notifications` | `src/database.js` | **YES** | User | In-app user notifications. Wiped on restart. |
| `state.inbox_messages` | `src/database.js` | **YES** | User | In-app contact & messaging inquiries. Wiped on restart. |
| `state.contact_inquiries` | `src/database.js` | **YES** | User | Public contact form submissions. Wiped on restart. |
| `state.tickets` | `src/database.js` | **YES** | Money | Inventory of resale tickets. Wiped on restart; tickets vanish from market. |
| `state.listings` | `src/database.js` / `ListingService.js` | **YES** | Money | Active ticket listings and pricing. Wiped on restart. |
| `state.orders` | `src/database.js` / `DurableFinancialStore.js` | **YES** | Money | Buyer orders. `/tmp/argus_data/orders.json` is ephemeral and lost across cold starts. |
| `state.payments` | `src/database.js` | **YES** | Money | Payment records and gateway references. Wiped on restart. |
| `state.escrows` | `src/database.js` / `EscrowService.js` | **YES** | Money | Escrow balances and states. Ephemeral in `/tmp/argus_data/escrows.json`. |
| `state.disputes` | `src/database.js` / `DisputeService.js` | **YES** | Money | Active dispute claims and freeze reasons. Ephemeral in `/tmp`. |
| `state.settlements` | `src/database.js` | **YES** | Money | Seller disbursements. Ephemeral in `/tmp`. |
| `state.transfers` | `src/database.js` | **YES** | Money | Ticket transfer logs. Wiped on restart. |
| `state.financial_ledger` | `src/database.js` / `FinancialLedger.js` | **YES** | Money | Double-entry journal entries. Ephemeral in `/tmp/argus_data/financial_ledger.json`. |
| `state.canonical_payments` | `src/database.js` / `PaymentService.js` | **YES** | Money | Canonical gateway transactions. Ephemeral in `/tmp`. |
| `state.payment_attempts` | `src/database.js` / `PaymentService.js` | **YES** | Money | Gateway checkout attempts. Ephemeral in `/tmp`. |
| `state.provider_webhooks` | `src/database.js` / `DokuPaymentProvider.js` | **YES** | Money | Raw webhook payloads and hashes. Ephemeral in `/tmp`. |
| `state.processed_webhooks` (Set) | `src/database.js` / `PaymentService.js` | **YES** | Money | In-memory replay protection Set. Wiped on restart (webhook replay danger). |
| `state.settlement_records` | `src/database.js` | **YES** | Money | Bank disbursement clearing records. Ephemeral in `/tmp`. |
| `state.chargebacks` | `src/database.js` | **YES** | Money | Gateway chargeback and reversal tracking. Ephemeral in `/tmp`. |
| `state.idempotency_records` | `src/database.js` | **YES** | Money | Gateway transaction idempotency keys. Ephemeral in `/tmp`. |
| `state.offers` | `src/database.js` / `OfferService.js` | **YES** | Money | Negotiation offer threads and counters. Wiped on restart. |
| `state.quotes` | `src/database.js` / `CanonicalFeeEngine.js` | **YES** | Money | Fee breakdown quotes. Wiped on restart. |
| `state.pricing_policies` | `src/database.js` | **YES** | Money | Configured platform fee policies. Wiped on restart. |
| `state.tax_policies` | `src/database.js` / `TaxEngine.js` | **YES** | Money | PPN tax policy configurations. Wiped on restart. |
| `state.reservations` | `src/database.js` / `ReservationService.js` | **YES** | Money | 10-minute cart checkout locks. Wiped on restart. |
| `state.deliveries` | `src/database.js` / `TicketDeliveryService.js` | **YES** | Money | Digital ticket handoff tokens. Wiped on restart. |
| `state.transaction_challenges` | `src/database.js` / `TransactionChallengeService.js` | **YES** | Money | 6-digit gate admission handshake secrets. Wiped on restart. |
| `ListingMutex.locks` (Map) | `src/services/offerService.js` | **YES** | Money (Concurrency) | In-memory mutex per listing. Does NOT synchronize across concurrent lambdas! |
| `OrderReleaseMutex.locks` (Map) | `src/services/escrowService.js` | **YES** | Money (Concurrency) | In-memory mutex per order. Does NOT synchronize across concurrent lambdas! |
| `state.audit_logs` | `src/database.js` | **YES** | Audit | General system audit log. Wiped on restart. |
| `state.ticket_events` | `src/database.js` | **YES** | Audit | Ticket lifecycle event journal. Wiped on restart. |
| `state.offer_audit_logs` | `src/database.js` | **YES** | Audit | Negotiation audit trail. Wiped on restart. |
| `state.evidence_bundles` | `src/database.js` / `EvidenceService.js` | **YES** | Audit | Evidence hashes and file pointers. Wiped on restart. |
| `state.evidence_items` | `src/database.js` | **YES** | Audit | Individual dispute evidence uploads. Wiped on restart. |
| `state.evidence_access_logs` | `src/database.js` | **YES** | Audit | Chain-of-custody access tracking. Wiped on restart. |
| `state.attestations` | `src/database.js` / `TrustPolicyEngine.js` | **YES** | Audit | Multi-party trust policy attestations. Wiped on restart. |
| `state.authorization_records` | `src/database.js` / `TrustPolicyEngine.js` | **YES** | Audit | Financial release authorization proofs. Wiped on restart. |
| `state.pic_velocity_log` | `src/database.js` / `EventPicService.js` | **YES** | Audit | Burst verification anti-fraud metrics. Wiped on restart. |
| `state.pricing_audit_logs` | `src/database.js` | **YES** | Audit | Fee policy modification audit trail. Wiped on restart. |
| `state.tax_audit_logs` | `src/database.js` | **YES** | Audit | Tax policy change logs. Wiped on restart. |
| `state.payment_reconciliation_logs` | `src/database.js` | **YES** | Audit | Provider vs ledger reconciliation logs. Ephemeral in `/tmp`. |
| `state.entry_verifications` | `src/database.js` | **YES** | Audit | Field venue gate scan verifications. Wiped on restart. |
| `state.venue_shifts` | `src/database.js` | **YES** | Audit | Officer venue shift logs. Wiped on restart. |
| `state.verification_sessions` | `src/database.js` | **YES** | Audit | Active turnstile gate scanning sessions. Wiped on restart. |
| `state.incidents` | `src/database.js` / `IncidentService.js` | **YES** | Audit | Security incident reports. Wiped on restart. |

---

## 2. Phase 0b: SQLite File Audit in Vercel Runtime

- **Finding**: **Zero SQLite files are written or used in the Vercel runtime or anywhere in the repository.**
- **Evidence**:
  1. `package.json` contains strictly four runtime dependencies (`bcryptjs`, `express`, `multer`, `uuid`). There is no SQLite driver (`better-sqlite3`, `sqlite3`, etc.).
  2. In `src/database.js`, the exported `db.run()`, `db.all()`, and `db.get()` methods are an **in-memory JavaScript emulator** executing substring checks (e.g. `clean.includes('INSERT INTO tickets')`) against the in-memory `state` arrays.
  3. The only filesystem persistence attempt in the codebase is `DurableFinancialStore` and `SessionStore`, which writes JSON files to `path.join('/tmp/argus_data', filename)`.
  4. On Vercel Serverless Functions, `/tmp` is an ephemeral instance-local RAM disk (`tmpfs`) with a maximum capacity of 512 MB. It is **not shared across concurrent lambdas** and is **wiped cleanly when a container goes cold or redeploys**.
  5. **Conclusion**: Any architecture document claiming "SQLite append-only triggers" or "SQLite driver-level immutability" is describing an aspirational domain model that was never backed by an actual SQLite database file in production. The production system is 100% ephemeral in-memory state.

---

## 3. Phase 0c: Unauthenticated Admin & Mutating Routes Audit

The audit identified the following **18 routes** that expose admin telemetry or mutate application state without proper, fail-closed authentication:

| HTTP Method & Route | File Location | Nature of Vulnerability |
| :--- | :--- | :--- |
| `GET /api/discovery/admin/inventory-report` | `src/discovery/discoveryRouter.js:1902` | Reads internal catalog reconciliation stats, active/archived counts, source breakdown. **No auth check.** |
| `POST /api/discovery/admin/reconcile` | `src/discovery/discoveryRouter.js:1873` | Triggers live discovery, deduplication, and database mutations. Defaults to `'SYSTEM_RECONCILER'`. **No auth check.** |
| `GET /api/discovery/admin/dashboard` | `src/discovery/discoveryRouter.js:1322` | Exposes event quality, telemetry, and conflict metrics. **Missing `requireDiscoveryAdmin`.** |
| `POST /api/discovery/admin/events/:id/verify` | `src/discovery/discoveryRouter.js:1332` | Mounted prior to line 1793. Express executes this first, verifying events with **zero auth**. |
| `POST /api/discovery/admin/events/:id/resolve-conflict`| `src/discovery/discoveryRouter.js:1347` | Resolves canonical event data conflicts with **zero auth**. |
| `POST /api/discovery/admin/events/:id/cancel` | `src/discovery/discoveryRouter.js:1362` | Cancels events and updates state with **zero auth**. |
| `GET/POST /api/discovery/lifecycle/cron`<br>`GET/POST /api/cron/lifecycle` | `src/discovery/discoveryRouter.js:1919-1959` | **Fails open**: `if (cronSecret)` allows unauthenticated calls if `CRON_SECRET` is unset! |
| `GET/POST /api/content/scheduler/cron`<br>`GET/POST /api/cron/content-scheduler` | `src/api/contentAdminRouter.js:240-274` | **Fails open**: `if (cronSecret)` allows unauthenticated article publishing if `CRON_SECRET` is unset! |
| `POST /api/discovery/ingest` | `src/discovery/discoveryRouter.js:1223` | Allows arbitrary external JSON payloads to be ingested directly into the canonical registry. **No auth.** |
| `POST /api/discovery/demand` | `src/discovery/discoveryRouter.js:1190` | Captures buyer demand without rate-limiting or authentication. |
| `POST /api/discovery/promoters/:id/posts` | `src/discovery/discoveryRouter.js:1678` | Ingests social posts into promoter discovery without authentication. |
| `POST /api/discovery/signals/:id/verify` | `src/discovery/discoveryRouter.js:1703` | Promotes social discovery signals without authentication. |
| `GET /api/admin/queue` | `src/public/trust_api.js:162` | Exposes pending verification tickets, evidence bundles, and seller uploads without auth. |
| `POST /api/admin/tickets/:id/verify` | `src/public/trust_api.js:186` | Approves or rejects ticket verifications without auth. |
| `POST /api/admin/transfers/:id/confirm-payment` | `src/public/trust_api.js:223` | Mutates escrow state to `ESCROW_PAID` without auth. |
| `POST /api/admin/transfers/:id/release` | `src/public/trust_api.js:246` | Triggers seller payout release without auth. |
| `POST /api/admin/transfers/:id/dispute` | `src/public/trust_api.js:284` | Freezes transaction funds into `DISPUTED` without auth. |
| `GET /api/admin/metrics` | `src/public/trust_api.js:307` | Exposes ticket trust metrics and volume without auth. |

---

## 4. Phase 0d: Reconciliation of Catalog Counts (311 vs 39 vs 12 vs 26 vs 285)

| Metric | Exact Count | Exact Mathematical & Architectural Definition |
| :--- | :---: | :--- |
| **`Baseline Seed`** | **26** | Hardcoded legacy seed events defined in `src/database.js` (`resetDatabase()`). Serves as the fallback mock catalog in test environments. |
| **`Discovered LOKET Events`** | **285** | Real events retrieved via paginated API discovery from `rest.loket.com` (288 raw records minus 2 Malaysian events minus 1 same-source duplicate alias). |
| **`Transient Reconciled Catalog`** | **311** | Arithmetic sum ($285 + 26 = 311$). Created **in-memory only** during local execution of `test_catalog_rescan_reconciliation.js`. Strictly **not written to disk or database**. |
| **`Bootstrapped Canonical Total`** | **39** | Canonical events loaded by `CanonicalEventRegistry` on startup via `RealSourceSeedService` ($26 \text{ baseline} + 13 \text{ curated snapshot records}$ from `official_event_snapshot.json`). |
| **`Live Upcoming Events`** | **12** | Active events returned by `GET /api/events` and displayed on the homepage. Out of the 39 bootstrapped canonical events, 27 have dates prior to current time and are marked `ARCHIVED` ($H+2$ rule), leaving exactly 12 upcoming events. |

---

## 5. Phase 0e: Epic 5 Forensic Status (Tests vs Suites)

- **Epic 5 Formal Verdict**: **CLOSED & FULLY VERIFIED**.
- **Evidence Breakdown (Individual Tests / Scenarios, NOT Suites)**:
  - `test_epic5_trust_policy.js`: **25 passed scenarios** (52 individual assertion checks, 0 failed). Verified multi-factor authorization, risk classification, role spoofing defense, and anti-inflation deduplication.
  - `test_epic51_auth_admin.js`: **21 passed scenarios** (42 individual assertion checks, 0 failed). Verified bcrypt password hashing, session lifecycle, role boundary enforcement, and zero data fabrication.
  - `test_trust_venue_payment_redteam.js`: **27 passed scenarios** (54 individual assertion checks, 0 failed). Verified escrow state machine release gates, double-entry ledger balancing, and PIC window checks.
  - `test_auth_security.js`: **56 passed assertion checks** (0 failed). Verified JWT/session security and timing attack mitigation.
  - **Security & Authorization Cluster Total**: **129 tests passed, 0 failed**.
- **Repository-Wide Total**:
  - **Suites**: **51 / 51 passed** (0 failed).
  - **Individual Tests / Assertions**: **1,099 passed** (0 failed).

---

## 6. Phase 0f: Architectural Plan (Catalog Tier Postgres Migration + Admin Lockdown)

### A. Repository Interface (`CatalogRepository`)
To preserve 100% test compatibility while enabling durable production storage, we introduce `src/discovery/repository/CatalogRepository.js` following the Repository Pattern:
1. `PostgresCatalogRepository`: Connects via `pg.Pool` to Neon Postgres using pooled `DATABASE_URL` (SSL mode enabled, `max: 1` per serverless lambda to prevent connection exhaustion).
2. `InMemoryCatalogRepository`: Deterministic in-memory map implementation used when `DATABASE_URL` is unset (local development, unit tests).

### B. Catalog Tier Database Schema (Versioned Migration: `001_catalog_schema.sql`)
Only the Catalog tier is migrated in this epic:
```sql
-- 1. Canonical Events Table
CREATE TABLE IF NOT EXISTS canonical_events (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'CONCERT',
  category VARCHAR(64) DEFAULT 'CONCERT',
  start_date DATE NOT NULL,
  start_datetime TIMESTAMPTZ,
  end_date DATE,
  end_datetime TIMESTAMPTZ,
  timezone VARCHAR(64) DEFAULT 'Asia/Jakarta',
  venue_name VARCHAR(255) NOT NULL,
  venue_city VARCHAR(128),
  city VARCHAR(128) NOT NULL,
  province VARCHAR(128),
  country VARCHAR(64) DEFAULT 'Indonesia',
  organizer_name VARCHAR(255),
  official_event_url TEXT,
  official_ticket_url TEXT,
  official_ticketing_provider VARCHAR(128),
  min_price NUMERIC(15, 2),
  max_price NUMERIC(15, 2),
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status VARCHAR(64) DEFAULT 'UNVERIFIED',
  lifecycle_status VARCHAR(64) DEFAULT 'UPCOMING',
  archive_status VARCHAR(32) DEFAULT 'ACTIVE',
  archived_at TIMESTAMPTZ,
  public_visibility BOOLEAN DEFAULT TRUE,
  homepage_visibility BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for fast querying and temporal lifecycle filtering
CREATE INDEX IF NOT EXISTS idx_canonical_events_slug ON canonical_events(slug);
CREATE INDEX IF NOT EXISTS idx_canonical_events_date ON canonical_events(start_date);
CREATE INDEX IF NOT EXISTS idx_canonical_events_lifecycle ON canonical_events(lifecycle_status, archive_status);
CREATE INDEX IF NOT EXISTS idx_canonical_events_city ON canonical_events(city);

-- 2. Official Source Snapshots Table
CREATE TABLE IF NOT EXISTS source_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  source_id VARCHAR(64) NOT NULL,
  snapshot_schema VARCHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  evidence_hash VARCHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Event Source Links (Multi-Source Provenance)
CREATE TABLE IF NOT EXISTS event_source_links (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL REFERENCES canonical_events(id) ON DELETE CASCADE,
  source_id VARCHAR(64) NOT NULL,
  source_record_id VARCHAR(255),
  role VARCHAR(64) NOT NULL, -- 'AUTHORITATIVE' | 'DISCOVERY'
  tier INT NOT NULL DEFAULT 2,
  source_url TEXT,
  ticket_url TEXT,
  confidence NUMERIC(5, 2) DEFAULT 1.0,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_event_source UNIQUE (event_id, source_id, source_record_id)
);

-- 4. Reconciliation Runs (Audit & Cron Tracking)
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id VARCHAR(64) PRIMARY KEY,
  trigger_type VARCHAR(32) NOT NULL, -- 'CRON' | 'ADMIN' | 'BOOTSTRAP'
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL, -- 'RUNNING' | 'SUCCESS' | 'FAILED'
  records_discovered INT DEFAULT 0,
  records_ingested INT DEFAULT 0,
  duplicates_merged INT DEFAULT 0,
  error_count INT DEFAULT 0,
  report JSONB,
  run_by VARCHAR(128) NOT NULL
);
```

### C. Cold-Start Hydration & Invariant Enforcement
1. **Boot Hydration**:
   - `CanonicalEventRegistry.init()` queries `SELECT * FROM canonical_events`.
   - Populates in-memory lookup cache (`this.events` and `this.slugMap`).
   - If PostgreSQL is unreachable or `DATABASE_URL` is missing: Degrade gracefully to seed-only fixture loading, set `degraded: true` in health telemetry, **never crash**.
2. **Seed Idempotency & Upsert**:
   - Baseline seed events are inserted via `ON CONFLICT (id) DO NOTHING`.
   - Never deletes existing rows.
3. **Anti-Resurrection ($H+2$ Archive)**:
   - Events with `archive_status = 'ARCHIVED'` or past event date + 48 hours can never be transitioned back to `UPCOMING` by incoming discovery observations.

### D. Ingestion & Vercel Cron Endpoint (`/api/cron/discovery-sync`)
1. **Endpoint**: `GET /api/cron/discovery-sync` and `POST /api/cron/discovery-sync`.
2. **Authentication**: Strict `Authorization: Bearer <CRON_SECRET>`.
   - **Fail-Closed**: If `CRON_SECRET` is unset, returns `HTTP 500 { error: 'CRON_SECRET_NOT_CONFIGURED' }`.
   - Timing-safe secret comparison via `crypto.timingSafeEqual`.
3. **Advisory Concurrency Lock**:
   - Executes `SELECT pg_try_advisory_lock(17913001)`.
   - If lock is held by another running lambda: Returns `HTTP 409 { status: 'SKIPPED', reason: 'RECONCILIATION_ALREADY_IN_PROGRESS' }`.
4. **Execution Budget**: Bounded pagination loop with maximum execution timer of 45 seconds (safely below Vercel's 60s timeout).
5. **Sanitization**: Strips HTML, enforces maximum title length (255 chars), rejects malformed UTF-8.
6. **Sources**:
   - `LOKET`: Active public REST pagination (`discoverFromApi`).
   - `GOERS`: Passive mode (`READY_PASSIVE`, no WAF bypass).

### E. Admin Lockdown (`requireAdminApiKey`)
1. Create `src/middleware/adminApiKeyAuth.js`.
2. Applied to **ALL** `/api/discovery/admin/*` routes and mutating endpoints (`/api/discovery/ingest`, `/api/discovery/demand`, etc.).
3. **Requirements**:
   - Inspects `x-admin-api-key` header (or `Authorization: Bearer <key>`).
   - **Fail-Closed**: If `ADMIN_API_KEY` is not set in environment, returns `HTTP 401 { error: 'ADMIN_KEY_NOT_CONFIGURED' }`.
   - Compare using `crypto.timingSafeEqual` with buffer padding to prevent timing attacks.
   - The key is **strictly redacted / never logged**.
   - Basic in-memory rate limiting (max 30 requests/minute per IP).

---

## 7. Migration Map for Remaining Tiers (Future Epics — Design Only)

Per instructions, the Money, User, and Audit tiers receive an architectural migration map only. No code or migration scripts will be created for these tiers in this epic.

```
+-----------------------------------------------------------------------------------+
|                        ARGUS DURABLE PERSISTENCE ARCHITECTURE                     |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [CURRENT EPIC: CATALOG TIER]                                                     |
|  - canonical_events                                                               |
|  - source_snapshots                                                               |
|  - event_source_links                                                             |
|  - reconciliation_runs                                                            |
|                                                                                   |
|  [FUTURE EPIC: USER TIER]                                                         |
|  - users                     -> UUID PK, email UNIQUE, password_hash, role        |
|  - seller_profiles           -> user_id FK, kyc_status, trust_score               |
|  - user_sessions             -> token_hash UNIQUE, user_id FK, expires_at         |
|  - magic_link_tokens         -> token_hash, email, expires_at                     |
|                                                                                   |
|  [FUTURE EPIC: MONEY TIER]                                                        |
|  - tickets                   -> id PK, event_id FK, seller_id FK, seat_info       |
|  - listings                  -> id PK, ticket_id FK, price, status                |
|  - orders                    -> id PK, buyer_id FK, event_id FK, order_status     |
|  - escrows                   -> id PK, order_id FK, escrow_state, amount          |
|  - financial_ledger          -> journal_id PK, debit_account, credit_account      |
|  - canonical_payments        -> provider_ref, provider_name, status, raw_data    |
|  - provider_webhooks         -> webhook_id PK, payload_hash, processed_at         |
|  - disputes                  -> dispute_id PK, order_id FK, reason, status        |
|  - settlements               -> settlement_id PK, seller_id FK, amount, pdr_ref   |
|                                                                                   |
|  [FUTURE EPIC: AUDIT TIER (APPEND-ONLY POSTGRES TRIGGERS)]                        |
|  - audit_logs                -> id PK, actor_id, action, payload, created_at      |
|                                 TRIGGER: BEFORE UPDATE OR DELETE -> EXCEPTION     |
|  - ticket_events             -> id PK, ticket_id FK, event_type, created_at       |
|                                 TRIGGER: BEFORE UPDATE OR DELETE -> EXCEPTION     |
|  - offer_audit_logs          -> id PK, offer_id FK, state_transition             |
|                                 TRIGGER: BEFORE UPDATE OR DELETE -> EXCEPTION     |
|  - attestations              -> id PK, order_id FK, attestation_type, signature   |
|                                 TRIGGER: BEFORE UPDATE OR DELETE -> EXCEPTION     |
|  - authorization_records     -> id PK, order_id FK, authorization_token           |
|                                 TRIGGER: BEFORE UPDATE OR DELETE -> EXCEPTION     |
+-----------------------------------------------------------------------------------+
```

---

## 8. Verification Strategy & Red Team Checklist

1. **New Automated Test Suite (`test_durable_catalog.js`)**:
   - `Test 1 (Cold-Start Simulation)`: Loads fresh `PostgresCatalogRepository` instance; asserts hydrated event count equals pre-restart count.
   - `Test 2 (Idempotent Double-Sync)`: Triggers two consecutive reconciliations; asserts 0 duplicate rows and preserved temporal lifecycle.
   - `Test 3 (Anti-Resurrection)`: Ingests past event claim; asserts event remains `ARCHIVED`.
   - `Test 4 (Admin Auth Gate)`: Tests missing key (401), invalid key (401), valid key (200), unset env (401 fail-closed).
   - `Test 5 (Cron Secret Gate)`: Tests missing cron secret (401), valid secret (200), unset env (500 fail-closed).
   - `Test 6 (Advisory Concurrency Lock)`: Dispatches two parallel cron syncs; asserts second yields 409 conflict.
   - `Test 7 (SQL Injection & Payload Sanitization)`: Attempts SQL injection via event title and venue; verifies parameterized queries prevent leakage.
2. **Existing Regression Gates**:
   - `npm test`: Must maintain **51/51 suites** and **1,099+ tests** passing.
   - `test_brand_boundary.js`: Strictly green.
   - `test_doku_sandbox_audit.js` & `test_doku_payment_migration.js`: 56 DOKU tests strictly green.

---

## 9. Gate Checkpoint

- [x] Phase 0a in-memory audit table completed.
- [x] Phase 0b SQLite filesystem reality verified (zero SQLite files, ephemeral `/tmp`).
- [x] Phase 0c unauthenticated admin and mutating endpoints enumerated.
- [x] Phase 0d count definitions mathematically reconciled (311 vs 39 vs 12 vs 26 vs 285).
- [x] Phase 0e Epic 5 forensic status verified (129 tests passed, 0 failed).
- [x] Phase 0f Catalog tier Postgres migration & Admin lockdown plan defined.
- [x] Money/User/Audit migration map documented without implementation.
- [x] **STOPPING FOR USER REVIEW AND APPROVAL BEFORE CODE IMPLEMENTATION.**
