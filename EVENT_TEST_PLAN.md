# TIKUM — EVENT TEST PLAN & VALIDATION SUITE
**Quality Assurance & Acceptance Criteria Reference**  
**Version:** 1.0.0  
**Target:** 18-Scenario Automated Verification Suite

---

## 1. Test Strategy Overview

The Event Intelligence Engine is tested across unit, integration, and end-to-end boundaries. Zero test mocks are permitted for core entity resolution, deduplication, conflict arbitration, or state transition logic.

The test suite validates the system against **18 mandatory operational scenarios**:

```
+-------------------------------------------------------------------------+
|                  18 MANDATORY EVENT TEST SCENARIOS                      |
+-------------------------------------------------------------------------+
  1. Duplicate Event Fingerprint Detection
  2. Same Event from 5 Independent Sources (Multi-Source Convergence)
  3. Rescheduled Event Handling (Date Mutation with ID Preservation)
  4. Cancelled Event Cascade (Status Update + Resale Invalidation)
  5. Indonesian Timezone Normalization (WIB, WITA, WIT)
  6. Canonical Venue Alias Resolution (GBK, ICE BSD, GBLA)
  7. Artist Alias & Multi-Artist Grouping (Feat / Collaborations)
  8. Inter-Source Date Mismatch (Conflict Arbitration)
  9. Inter-Source Ticket URL Disagreement
 10. Source Failure & Graceful Degradation
 11. Robots.txt Disallow Denial (Scraper Halt)
 12. Permission Status Denial (NOT_ALLOWED & UNKNOWN Rejection)
 13. Stale Source Freshness Expiry (Mark STALE after 14 Days)
 14. Completed Event Auto-Transition (now > end_at)
 15. Archive Lifecycle Promotion (Completed -> Archived)
 16. Reappearing Event Ingestion (No Ghost Duplicates)
 17. Multi-Day Festival Representation (Pestapora / DWP 3-Day Windows)
 18. Same Artist, Same City, Distinct Events (2-Night Residency Separation)
```

---

## 2. Test Scenario Matrix & Explicit Assertions

| # | Scenario Name | Test Input Condition | Expected Result & Assertions |
| :--- | :--- | :--- | :--- |
| **1** | **Duplicate Event Fingerprint** | Two payloads with identical artist, venue, and date but slightly different marketing titles | `dedup_action == "MERGED"`, single canonical event ID, `source_count == 2` |
| **2** | **Same Event from 5 Sources** | Ingest same concert from 1 promoter, 1 venue, 2 ticketing feeds, 1 discovery API | Merged into 1 canonical event, `source_count == 5`, `verification_confidence >= 95%`, `is_verified == true` |
| **3** | **Rescheduled Event** | Promoter updates date from `2026-10-15` to `2026-11-20` for existing event | Preserves canonical `event_id`, status becomes `RESCHEDULED`, `EventStatusHistory` created with old/new dates |
| **4** | **Cancelled Event Cascade** | Official promoter marks event `CANCELLED` | Event status becomes `CANCELLED`, active resale listings cascade to `CANCELLED`, buyers refunded |
| **5** | **Timezone Normalization** | Events in Bali (WITA: +08:00), Jakarta (WIB: +07:00), and Jayapura (WIT: +09:00) | Correct ISO-8601 offset preserved, stored with canonical Indonesian timezone identifier |
| **6** | **Venue Alias Resolution** | Inputs `"sugbk"`, `"gelora bung karno senayan"`, `"GBK Main Stadium"` | All resolve to canonical `venue-gbk` (`Gelora Bung Karno (Main Stadium)`) |
| **7** | **Artist Alias & Multi-Billing**| Input `"Coldplay ft. Rahmania Astrini"` vs `"Coldplay"` | Resolves primary artist `Coldplay`, stores supporting artists in `artists[]` array |
| **8** | **Date Mismatch Conflict** | Source A says `2026-10-20`, Source B says `2026-10-21` | Conflict detected, status transitions to `DATA_CONFLICT`, prevented from auto-publishing without resolution |
| **9** | **Ticket URL Mismatch** | Ticketing platform A vs B report different booking links | Higher trust tier link selected as primary, secondary retained in provenance observation |
| **10** | **Source Network Failure** | Ingestion adapter encounters 3 consecutive timeouts/errors | Source marked `DEGRADED`, circuit breaker trips `OPEN`, previously saved events remain 100% intact |
| **11** | **Robots.txt Denial** | Target domain `robots.txt` specifies `Disallow: /` | Compliance guardrail halts ingestion before request, throws `COMPLIANCE_ERROR` |
| **12** | **Permission Status Denial** | Attempt ingestion with `permission_status: "NOT_ALLOWED"` or `"UNKNOWN"` | Ingestion strictly rejected with HTTP 403 / validation error |
| **13** | **Stale Source Freshness** | Event last synced > 14 days ago without re-confirmation | Verification status automatically demoted from `VERIFIED` to `STALE` |
| **14** | **Completed Event Auto-Transition**| Event with `end_at < now` | Status automatically transitions from `ON_SALE` to `COMPLETED` |
| **15** | **Archive Promotion** | Completed event past 24h grace window | Status transitions to `ARCHIVED`, indexable archive permalink rendered |
| **16** | **Reappearing Event** | Source re-broadcasts already completed/archived event | Identified by fingerprint, does not resurrect past event into upcoming catalog |
| **17** | **Multi-Day Festival** | Ingest 3-day festival (e.g. Pestapora `2026-09-25` to `2026-09-27`) | Correct `start_at` and `end_at` spanned across 3 days, singular canonical entity |
| **18** | **Same Artist / City / 2-Night Residency** | Artist plays Jakarta Day 1 (`2026-11-15`) and Jakarta Day 2 (`2026-11-16`) | Deterministic fingerprint treats as **TWO SEPARATE** canonical events |

---

## 3. Execution & CI/CD Integration

The test plan is executed using Node.js native assert framework:
```bash
node test_epic_event_discovery_v2.js
```
The test suite must achieve **100% pass rate** before deployment to staging or production.
