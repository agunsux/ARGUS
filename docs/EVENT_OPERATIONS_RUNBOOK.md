# TIKUM — EVENT SUPPLY OPERATIONS RUNBOOK
**Document ID:** `DOC-OPS-2026-001`  
**Compliance Authority:** SHINERVA HQ Core Infrastructure  
**Version:** 1.0.0  
**Status:** Canonical Standard Operating Procedures  

---

## 1. Scope & Roles

This runbook guides Trust Officers, System Operators, and Engineers in maintaining the health, factual accuracy, and compliance of the TIKUM Event Supply Intelligence Layer.

**Authorized Roles:**
- `admin`: Trust Officer / Operations Manager (can verify, reject, resolve conflicts, reset breakers).
- `system`: Automated background workers and ingestion runners.

---

## 2. Daily Operational Checklist

Every morning and afternoon, the on-duty Trust Officer must:
1. Review the **Source Health Telemetry Dashboard** via `GET /api/discovery/admin/intelligence`.
2. Inspect the **Manual Verification Queue** for `UNVERIFIED` and `REVIEW_REQUIRED` events.
3. Review and resolve all pending **Event Conflicts** (`GET /api/discovery/conflicts`).
4. Verify that no broken source has entered `CIRCUIT_OPEN` without an operational ticket.
5. Confirm that no unverified or conflicted event has leaked into `/sitemap.xml`.

---

## 3. Handling Data Conflicts (`EventConflict`)

When two sources report conflicting information (e.g., Tiket.com says Date X, Promoter says Date Y):

### Standard Procedure:
1. Navigate to the Conflict Review Console (`/api/discovery/conflicts`).
2. Examine the conflicting field, source authority tiers, and timestamp of observation.
3. **Authority Precedence Rule:**
   - If one source is **Tier 1 (Authoritative Promoter/Venue)** and the other is **Tier 2/3**, the Tier 1 value takes precedence.
   - If both sources are of equal tier (e.g., two ticketing platforms disagree), consult official promoter social channels or press releases.
4. Execute resolution via `POST /api/discovery/admin/events/:id/resolve-conflict`:
   ```json
   {
     "start_date": "2026-11-20",
     "reason": "Confirmed via official APMI promoter press release on 2026-09-13",
     "resolved_by": "admin-1"
   }
   ```
5. Confirm that the event transitions from `CONFLICTED` to `VERIFIED` and logs an audit record in `state.audit_logs`.

---

## 4. Circuit Breaker Recovery Protocol

When a source adapter enters `STATUS: CIRCUIT_OPEN`:

1. **Investigate Root Cause:** Check source telemetry for error codes (HTTP 429 rate limit, HTTP 503 maintenance, or DNS failure).
2. **Do NOT Spam the Remote Host:** Allow the 15-minute cooldown to elapse naturally.
3. **Canary Test:** If the upstream service is confirmed restored, dispatch a canary health check:
   ```bash
   POST /api/discovery/admin/sources/:id/probe
   ```
4. If healthy, reset the breaker via admin control:
   ```bash
   POST /api/discovery/admin/sources/:id/reset-breaker
   ```

---

## 5. Event Cancellation & Postponement Procedure

When an official cancellation or postponement is announced:

1. Locate the canonical event via `GET /api/discovery/events/:id`.
2. Trigger the cancellation action:
   ```bash
   POST /api/discovery/admin/events/:id/cancel
   Body: { "reason": "Promoter announced tour cancellation due to medical emergency" }
   ```
3. **Automated Secondary Effects Verified:**
   - Event status transitions to `CANCELLED`.
   - SEO robots directive switches to `noindex, follow` (preserving cancellation notice for searchers).
   - Any attached active secondary marketplace listings are automatically flagged and cancelled.
   - Audit entry is committed to `state.audit_logs`.

---

## 6. Emergency Ingestion Freeze

In the event of an anomalous influx of poisoned metadata, DDOS attempt, or upstream source corruption:

1. Instantly trigger the emergency kill switch:
   ```bash
   POST /api/discovery/admin/ingestion/freeze
   ```
2. This immediately suspends all ingestion pipeline workers and decouples scheduled tasks without stopping existing public read APIs.
3. Once the anomaly is purged and patched, unfreeze with:
   ```bash
   POST /api/discovery/admin/ingestion/unfreeze
   ```
