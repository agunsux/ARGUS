# TIKUM — W7: SERVERLESS SCHEDULER RELIABILITY, CONCURRENCY & FAULT-INJECTION REPORT

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Target Modules:**
- `vercel.json`
- `migrations/001_catalog_schema.sql`
- `src/discovery/EventIngestionScheduler.js`
- `src/discovery/repository/PostgresCatalogRepository.js`
- `src/discovery/repository/InMemoryCatalogRepository.js`
- `src/discovery/discoveryRouter.js`

---

## 1. Vercel Serverless Reality & Architectural Remediation (`W7.1` & `W7.2`)

### A. Vercel Hosting Constraints Audited
1. **Cron Configuration (`vercel.json`)**:
   - Schedule: `"0 19 * * 1,3,5"` -> Mondays, Wednesdays, and Fridays at `19:00 UTC` (`02:00 WIB` Tue/Thu/Sat) invoking `GET /api/discovery/cron/sync`.
2. **Why Committed `76b4d92` Had Ephemeral Cursor Drift**:
   - In committed `76b4d92`, `EventIngestionScheduler.js` stored `this._chunkCursor = 0` on the Node.js instance in memory (`this._chunkCursor = (cursor + batchSize) % totalPermitted`).
   - Because Vercel serverless functions spin up fresh stateless isolates across invocations, `this._chunkCursor` reset to `0` on every cold start—polling only the first 5 sources repeatedly and never reaching the remaining 123 sources in `SourceRegistry.js`!

### B. Durable Database-Backed State & Lease Lock Implemented
1. **Schema (`migrations/001_catalog_schema.sql` & `PostgresCatalogRepository._ensureSchedulerStateTable`)**:
   ```sql
   CREATE TABLE IF NOT EXISTS discovery_scheduler_state (
       job_name TEXT PRIMARY KEY,
       source_cursor INTEGER NOT NULL DEFAULT 0,
       page_cursor INTEGER NOT NULL DEFAULT 1,
       last_source_id TEXT,
       lease_owner TEXT,
       lease_acquired_at TIMESTAMPTZ,
       lease_expires_at TIMESTAMPTZ,
       last_run_id TEXT,
       last_status TEXT,
       updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
   );
   ```
2. **Dual Concurrency Protection (`EventIngestionScheduler.runChunkedDiscoveryJob`, lines 490–513)**:
   - Acquires PostgreSQL session-level advisory lock `17913009` (`acquireAdvisoryLock(17913009)`) **AND** atomic row-level TTL lease (`acquireJobLease(jobName, leaseOwner, leaseTtlMs)`).
   - If another worker holds either the advisory lock or an unexpired DB lease (`lease_expires_at > NOW()`), the second worker immediately returns `{ status: 'LOCKED', code: 'LOCK_BUSY' }` without duplicating work.
   - If a worker crashes mid-run, its lease automatically expires after `leaseTtlMs` (default `55000ms`), allowing the next scheduled invocation to reclaim the lease (`WHERE lease_owner IS NULL OR lease_expires_at <= $3`).
3. **Deterministic `(source_cursor, page_cursor)` Checkpoint Persistence**:
   - Before releasing the lease in `finally`, `updateJobCursorAndReleaseLease()` atomically persists `source_cursor`, `page_cursor`, `last_source_id`, `last_run_id`, and `last_status` in `discovery_scheduler_state`.
   - If a paginated source returns `{ has_more: true, next_page: N }`, the runner saves `source_cursor = currentIndex` and `page_cursor = N` and marks `status = 'PARTIAL'` so the next invocation resumes at page `N` of that exact source.
4. **Bounded Retry with Backoff (Lines 603–621)**:
   - Transient adapter fetch errors are retried up to `maxRetries` (default `1`) with linear backoff (`retryBackoffMs * attempt`) only while remaining within `timeBudgetMs` (`25000ms`).

---

## 2. Fault-Injection Verification Results (`W7.3`)

We executed 6 fault-injection and concurrency scenarios across `test_durable_catalog.js` (Tests 8–10), `test_chunked_ingestion_and_staleness.js` (Tests 6–7), and `test_w2_w7_comprehensive_audit.js` (`W7.1`–`W7.2`) with `ARGUS_DB_READ_ONLY=true`:

| Fault-Injection Scenario | Test Location | Injected Condition | Observed Result | Verdict |
| :--- | :--- | :--- | :--- | :---: |
| **1. Cold-Start Stateless Cursor Continuation** | `test_durable_catalog.js` (Test 8) | Batch 1 polls 3 sources (`cursor: 0 -> 3`), then a fresh invocation runs Batch 2 (`batchSize: 3`). | Batch 1 persisted `source_cursor = 3, page_cursor = 1`; Batch 2 started at `cursor_start = 3` and advanced to `cursor_next = 6`. | **PASS** |
| **2. Concurrent Invocation Contention** | `test_durable_catalog.js` (Test 9) & `test_chunked_ingestion_and_staleness.js` (Test 7) | Worker A holds active lease (`ttl: 30000ms`) or advisory lock `17913009`; Worker B invokes `runChunkedDiscoveryJob()` concurrently. | Worker B immediately returned `{ status: "LOCKED", code: "LOCK_BUSY" }` with zero duplicate ingestion. | **PASS** |
| **3. Crashed Worker Stale Lease Takeover** | `test_w2_w7_comprehensive_audit.js` (`W7.1`) | `worker-alpha` acquires lease with `ttlMs = 50ms` and crashes (never releases); after `70ms`, `worker-beta` requests the lease. | `worker-beta` reclaimed the expired lease (`acquired: true, lease_owner: "worker-beta"`) while preserving cursor state. | **PASS** |
| **4. Upstream Timeout & Bounded Retry Recovery** | `test_w2_w7_comprehensive_audit.js` (`W7.2`) | Adapter throws `SIMULATED_UPSTREAM_TIMEOUT` on attempt 1 and succeeds on retry attempt 2. | Runner executed 1 bounded retry (`retries_attempted: 1`), recovered `src-weverse-official`, and continued the batch. | **PASS** |
| **5. Blocked Source (Cloudflare 403 WAF) Reporting** | `test_w2_w7_comprehensive_audit.js` (`W7.2`) | Adapter returns `{ status: "BLOCKED", reason: "Simulated Cloudflare WAF 403 Challenge" }`. | Run recorded `blocked_or_unavailable_count: 1`, marked run `status: "PARTIAL"` (never false `SUCCESS`), and released the lease in `finally`. | **PASS** |
| **6. Imminent Event 7-Day Targeted Freshness Check** | `test_tikum_event_temporal_lifecycle.js` (Section 3) & `EventIngestionScheduler.runTargetedImminentEventCheck` | Event occurring within `<= 7` days evaluated against 48-hour staleness check. | `runTargetedImminentEventCheck()` identifies imminent events within 7 days and refreshes or flags stale records. | **PASS** |
