# TIKUM — W6: EVENT LIFECYCLE, STALENESS & PUBLIC VISIBILITY REPORT

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Target Modules:**
- `src/discovery/EventTemporalLifecycleEngine.js`
- `src/discovery/EventVerificationService.js`
- `src/discovery/discoveryRouter.js`
- `src/discovery/CanonicalEventRegistry.js`

---

## 1. Accounting for All 63 Events: Exact Reason Codes (`W6.1` & `W6.2`)

Every single row in the 63-event Neon PostgreSQL database (`neondb`) is accounted for below with a deterministic visibility status and exclusion reason code as of **2026-10-12 WIB**:

| Visibility / Exclusion Category | Reason Code | Row Count in Baseline (`76b4d92`) | Row Count After W1 `FILTER_BUG` Fix | Public Feed Card Count (`/api/discovery/events`) | Explanation & Exact Row Breakdown |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **1. Publicly Visible Upcoming Events** | `PUBLIC_VISIBLE` | **18** | **35** | **34** *(after W3 cross-source dedup of `Men I Trust`)* | Pass all 3 Triple-Gate checks (`is_verified = true`, `public_visibility = true`, `start_date >= 2026-10-12` or `end_date >= 2026-10-12`, and complete provenance `{source_url, evidence_hash, verified_at}`). Includes **18** baseline verified events (`10` upcoming `SNAPSHOT_FIXTURE` + `6` upcoming `STATIC_CODE_SEED` from `OfficialEventDiscoverySource` + `1` `ev-can-588c5da8` DWP + `1` `event-joyland-2026`) **plus 17** live LOKET discoveries (`ev-can-86d64d00` through `ev-can-9182098c`) restored after fixing the `PARTIALLY_VERIFIED` filter bug. |
| **2. Live LOKET Events Hidden by `PARTIALLY_VERIFIED` Filter Bug** | `FILTER_BUG` | **17** | **0** *(Restored to `PUBLIC_VISIBLE`)* | — | Single-source live LOKET API discoveries (`src-loket`, `trust_score: 90`) had `is_verified = true` and `public_visibility = true`, but `verification_status = 'PARTIALLY_VERIFIED'`. Fixed in `src/discovery/discoveryRouter.js` and `src/discovery/supply/LoketDiscoverySource.js`. |
| **3. Past / Concluded Events (`start_date < 2026-10-12`)** | `PAST` (`EXCLUDED_PAST_EVENT` / `EXCLUDED_ARCHIVED`) | **16** | **16** | **0** | Concluded events (`start_date` and `end_date` strictly before `2026-10-12`) are blocked from the upcoming public catalog by `EventTemporalLifecycleEngine.isEventUpcoming(e, now)`.<br>- **13 Legacy Archived Seeds** (`event-gigs-local-past`, `event-theater-past`, `event-persija-persib-2026`, `event-ibl-finals-2026`, `event-marathon-bali-2026`, `event-badminton-open-2026`, `event-hammersonic-2026`, `event-java-jazz-2026`, `event-prambanan-jazz-2026`, `event-standup-pandji-2026`, `event-standup-abdur-2026`, `event-pestapora-2026`, `event-we-the-fest-2026`).<br>- **2 Past Snapshot Events** (`ev-can-2f5e5765` NCT 127 `2026-10-03`, `ev-can-4c335748` The Script `2026-10-10`).<br>- **1 Concluded Curated Event** (`ev-can-8b8154c9` MotoGP Mandalika `2026-10-09`–`2026-10-11`). |
| **4. Unverified Future Legacy Seeds (`is_verified = false`, `public_visibility = false`)** | `UNVERIFIED` (`EXCLUDED_UNVERIFIED`) | **12** | **12** | **0** | Future-dated placeholder seeds from `src/database.js` (`event-proliga-finals-2026`, `event-esports-mpl-2026`, `event-green-day-jakarta-2026`, `event-linkin-park-jakarta-2026`, `event-yoasobi-jakarta-2026`, `event-one-ok-rock-jakarta-2026`, `event-raisa-gbk-2026`, `event-sheila-on-7-bandung-2026`, `event-tulus-tur-manusia-2026`, `event-dewa19-allstars-2026`, `event-musical-jikustik-2026`, `event-wayang-orang-bharata-2026`). Intentionally quarantined (`verification_status = 'UNVERIFIED'`, `is_verified = false`, `public_visibility = false`) under the Zero-Fake Policy because no Tier-1 official source link has corroborated them. |
| **TOTAL** | **100% Accounted For** | **63** | **63** | **34** | **Zero silent filter drops; every excluded row has an explicit, verifiable reason code (`35 PUBLIC_VISIBLE + 16 PAST + 12 UNVERIFIED = 63`).** |

---

## 2. Why Live Production (`https://tikum.app`) Returned 18 vs. Local Code Returning 34 (`W1.3` & `W6.1`)

1. **Why Live Production (`76b4d92` on `2026-10-11` / `2026-10-12`) Showed 18 Events**:
   - In commit `76b4d92`, `discoveryRouter.js` (`handleGetEvents`) checked `['VERIFIED', 'PRIMARY_SOURCE_VERIFIED'].includes(vStatus)` and excluded `PARTIALLY_VERIFIED`, even when `e.is_verified === true` and `e.public_visibility === true`.
   - Because `LoketDiscoverySource` had `trust_score: 90` (`tier: 2` in `AdapterRegistry` vs `tier: 1` in `EventVerificationService`), all 17 single-source live LOKET discoveries were assigned `verification_status = 'PARTIALLY_VERIFIED'` and silently dropped (`18 + 17 = 35`).
2. **How Our Local Code Fixes This (`src/discovery/discoveryRouter.js` & `src/discovery/supply/LoketDiscoverySource.js`)**:
   - `discoveryRouter.js` (`handleGetEvents`) now includes `PARTIALLY_VERIFIED` when `e.is_verified === true` and `e.public_visibility === true` (`['VERIFIED', 'PRIMARY_SOURCE_VERIFIED', 'PARTIALLY_VERIFIED']`).
   - `LoketDiscoverySource.js` is aligned to `tier: 1` (`trust_score: 95`) as Indonesia's primary official ticketing platform.
   - `handleGetEvents` also runs cross-source deduplication (`EventDeduplicationService.findDuplicateCandidate`), merging the duplicate `Men I Trust` snapshot row (`ev-can-c79bb221`) and live LOKET row (`ev-can-4cc7e9d0`) into a single card—yielding **34 unique, verified upcoming public events**.

---

## 3. Lifecycle State Machine & Staleness Rules (`W6.1` & `W6.3`)

1. **Temporal Lifecycle Transitions (`EventTemporalLifecycleEngine.js`)**:
   - `UPCOMING` / `ON_SALE`: `now < start_datetime`
   - `LIVE` / `IN_PROGRESS`: `start_datetime <= now <= end_datetime`
   - `COMPLETED`: `now > end_datetime`
   - `ARCHIVED`: `now > end_datetime + 24h` (or `ARCHIVED_WITH_OPEN_OPERATIONS` if an active escrow order or open dispute references the event, protecting financial resolution).
   - **Anti-Resurrection Invariant**: Once an event reaches `COMPLETED` or `ARCHIVED`, re-ingestion cannot resurrect it to `UPCOMING` unless an explicit `RESCHEDULED` signal with a new future date is verified.
2. **Proximity-Aware Freshness & Staleness (`EventVerificationService.js` lines 59–71 & `EventTemporalLifecycleEngine.isEventStale`)**:
   - Imminent events (`<= 7` days away): **6-hour** verification TTL (`runTargetedImminentEventCheck()` re-evaluates events occurring within 7 days).
   - Near-term events (`8–30` days away): **18-hour** verification TTL.
   - Far-future events (`> 30` days away): **48-hour** verification TTL (and hard 45-day staleness gate on `isEventStale`).
3. **Cancellation vs. Dead URL (`EventVerificationService.js` lines 420–453)**:
   - `CANCELLED` requires explicit official cancellation evidence (`official_cancellation_evidence`).
   - Dead URLs / HTTP 404 / fetch timeouts set `flags: ['SOURCE_URL_UNAVAILABLE']` and `verification_status: 'STALE'`, never `CANCELLED`.
