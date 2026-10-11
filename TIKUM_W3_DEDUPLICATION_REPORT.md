# TIKUM — W3: CROSS-SOURCE DEDUPLICATION & ENTITY RESOLUTION REPORT

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Target Modules:**
- `src/discovery/EventNormalizationService.js`
- `src/discovery/EventDeduplicationService.js`
- `src/discovery/discoveryRouter.js`

---

## 1. Non-Circular Deduplication Audit of Live `neondb` Catalog (`W3.1`)

Previous audits relied on a circular duplicate check (`normalized_name + city + start_date`), which failed whenever two sources formatted the event title differently or reported conflicting dates for the same tour stop.

In W3, we audited all 63 rows in `neondb` using **entity-level blocking keys** (`artist_alias + city + year` and `venue_id + year`) independent of raw title formatting. This uncovered **2 cross-source duplicate/conflict pairs** in the 63-row database:

| Pair # | Row A (`id`, Name, Date, Origin) | Row B (`id`, Name, Date, Origin) | Why Previous Dedup Missed It | W3 Resolution |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `ev-can-c79bb221`<br>**`Men I Trust — Equus Tour 2026 Jakarta`**<br>Date: `2026-10-20`<br>Venue: `GBK Basketball Hall, Senayan`<br>Origin: `SNAPSHOT_FIXTURE` (`src-bbo`) | `ev-can-4cc7e9d0`<br>**`Men I Trust Asia Tour 2026: Live In Jakarta`**<br>Date: `2026-11-12`<br>Venue: `GBK Basketball Hall, Senayan`<br>Origin: `LIVE_PIPELINE_DISCOVERED` (`src-loket`, `bbo8`) | 1. Title differed (`"— Equus Tour 2026 Jakarta"` vs `"Asia Tour 2026: Live In Jakarta"`).<br>2. Date differed (`2026-10-20` in snapshot vs `2026-11-12` on live LOKET).<br>3. Both were publicly visible (`is_verified = true`, `public_visibility = true`), which would cause **2 cards for Men I Trust** on the public feed once `PARTIALLY_VERIFIED` LOKET events were enabled! | **Fixed in W3**:<br>1. `EventNormalizationService.normalizeCanonicalComparisonTitle()` normalizes both titles to `"men i trust 2026"` / shared artist token `"men i trust"`.<br>2. `EventDeduplicationService.findDuplicateCandidate()` matches them via `SOURCE_DATE_CONFLICT_SAME_EVENT` (`isDateConflict: true`, confidence `88`).<br>3. `discoveryRouter.js` (`handleGetEvents`) merges both records on the public feed into a single card, attaching both `src-loket` and `src-bbo` in `sources`. Public feed count drops from **35** eligible rows to **34 unique public cards**. |
| **2** | `event-standup-abdur-2026`<br>**`Abdur Arsyad: Kontras Stand-Up Special`**<br>Date: `2026-08-29` (`PAST`,legacy seed)<br>Venue: `Usmar Ismail Hall`<br>Origin: `STATIC_CODE_SEED` (`src/database.js`) | `ev-can-03e3ecd2`<br>**`Abdur Arsyad: Kontras Special Tour Jakarta`**<br>Date: `2026-11-28` (`UPCOMING`, verified)<br>Venue: `Pusat Perfilman H. Usmar Ismail (Usmar Ismail Hall)`<br>Origin: `STATIC_CODE_SEED` (`OfficialEventDiscoverySource.js`) | Legacy seed had placeholder date `2026-08-29` (now `PAST` with `public_visibility = false`), while `OfficialEventDiscoverySource` had `2026-11-28` with title `"Kontras Special Tour Jakarta"` vs `"Kontras Stand-Up Special"`. | **Fixed in W3**:<br>`EventNormalizationService.extractArtistTokens()` maps `'abdur arsyad'` <-> `'kontras'`, and `EventDeduplicationService` rule `7b (UNVERIFIED_SEED_DATE_RESOLUTION)` matches unverified seed placeholders when `hasSharedArtistAlias` is true in the same city/venue. Only `ev-can-03e3ecd2` (`2026-11-28`) is publicly visible. |

### Legitimate Multi-Night, Related-Brand & Multi-Edition Pairs Verified as Distinct (Zero False Over-Merging)
- **`LANY — a beautiful blur: the world tour Jakarta (Night 1)`** (`ev-can-897e135b`, `2026-10-29`) vs **`(Night 2)`** (`ev-can-776cb0e4`, `2026-10-30`): Separate tickets per night -> **Kept as 2 distinct canonical events**.
- **`Joyland Festival Jakarta 2026`** (`event-joyland-2026`, `2026-11-27`) vs **`Joyland Sessions 2026`** (`ev-can-dc3d0f9f`, `2026-11-28`): Distinct ticketed listings (`Joyland Festival` vs `Joyland Sessions` on LOKET) -> **Kept as 2 distinct canonical events**.
- **`The Script — Satellites World Tour Jakarta`** (`ev-can-4c335748`, `2026-10-10`, past 2026 tour) vs **`The Script: Man in the Arena Tour 2027 Jakarta`** (`ev-can-47275b5f`, `2027-04-03`, 2027 tour): Different tour years (`2026` vs `2027`) -> **Kept as 2 distinct canonical events**.

---

## 2. Deduplication Engine Upgrades Implemented (`W3.2`)

1. **Sponsor Prefix & Marketing Noise Stripping (`src/discovery/EventNormalizationService.js` lines 802–858)**:
   - Strips arbitrary `"<Sponsor/Promoter> Presents:"` and `"Presented by <Sponsor>:"` prefixes.
   - Added `EventNormalizationService.normalizeCanonicalComparisonTitle(rawTitle)` which canonicalizes Indonesian festival acronyms (`DWP` <-> `Djakarta Warehouse Project`, `Synchronize Fest` <-> `Synchronize Festival`, `JJF` <-> `Java Jazz Festival`, `Joyland Fest` <-> `Joyland Festival`, `LaLaLa Fest` <-> `LaLaLa Festival`) and strips city/tour filler (`"Live in Jakarta"`, `"in Jakarta"`, `"Special Tour"`, `"World Tour"`) while preserving year and residency (`Day 1`, `Night 1`, `Vol. 9`).
2. **Artist & Festival Alias Token Resolution (`src/discovery/EventNormalizationService.js` lines 1262–1325)**:
   - Expanded `extractArtistTokens()` with Indonesian festival and comedy tour aliases (`dwp`, `synchronize`, `joyland`, `lalala`, `abdur arsyad`, `pandji pragiwaksono`, `atsuko okatsuka`, `morgan jay`).
3. **Venue Canonical ID Matching & Date-Conflict Detection (`src/discovery/EventDeduplicationService.js` lines 189–370)**:
   - Normalizes both incoming and canonical venues through `EventNormalizationService.normalizeVenue()` before comparing `venue_id`.
   - Detects cross-source date conflicts (`SOURCE_DATE_CONFLICT_SAME_EVENT`, `isDateConflict: true`) when two sources report the same artist/event at the same venue/city within 120 days (and `> 3` days apart so consecutive multi-night residencies are never collapsed).
4. **Public Feed Cross-Source Deduplication (`src/discovery/discoveryRouter.js` lines 763–795)**:
   - Collapses pre-existing cross-source duplicate rows on `/api/discovery/events`, selecting the canonical record with a deep `/event/` ticket link and combining both `sources` arrays.

---

## 3. W3 Automated Verification Matrix (8 Required Scenarios)

Executed via `test_w2_w7_comprehensive_audit.js` (`W3.1` through `W3.8`) and `test_market_supply_expansion.js`:

| Test ID | Scenario | Input A | Input B | Expected Outcome | Actual Outcome | Status |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **`W3.1`** | Cross-source punctuation & city suffix variation | `"Men I Trust — Equus Tour 2026 Live in Jakarta"` (`GBK Basketball Hall, Senayan`, `2026-11-12`) | `"Men I Trust: Equus Tour 2026 Jakarta"` (`Basket Hall GBK Senayan`, `2026-11-12`) | **MERGE** (`isMatch: true`) | `isMatch: true`, `confidence: 98` (`EXACT_VENUE_DATE_AND_TITLE`) | **PASS** |
| **`W3.2`** | Sponsor / promoter prefix variation | `"Touché Amoré Live in Jakarta"` (`Hard Rock Cafe Jakarta`, `2027-02-09`) | `"Bank Mandiri Presents: Touche Amore Live"` (`Hard Rock Cafe Jakarta`, `2027-02-09`) | **MERGE** (`isMatch: true`) | `isMatch: true`, `confidence: 98` (`EXACT_VENUE_DATE_AND_TITLE`) | **PASS** |
| **`W3.3`** | Festival acronym vs full name (`DWP`) | `"DWP 2026"` (`JIExpo Kemayoran`, `2026-12-11`) | `"Djakarta Warehouse Project 2026"` (`Gambir Expo / JIExpo Kemayoran`, `2026-12-11`) | **MERGE** (`isMatch: true`) | `isMatch: true`, `confidence: 91` (`HIGH_TOKEN_SIMILARITY_SAME_VENUE`) | **PASS** |
| **`W3.4`** | Festival shorthand vs full name (`Synchronize`) | `"Synchronize Fest 2026"` (`Gambir Expo Kemayoran`, `2026-10-02`) | `"Synchronize Festival 2026"` (`JIExpo Kemayoran`, `2026-10-02`) | **MERGE** (`isMatch: true`) | `isMatch: true`, `confidence: 98` (`EXACT_VENUE_DATE_AND_TITLE`) | **PASS** |
| **`W3.5`** | Multi-night residency (`Night 1` vs `Night 2`) | `"LANY — a beautiful blur Jakarta (Night 1)"` (`Indonesia Arena`, `2026-10-29`) | `"LANY — a beautiful blur Jakarta (Night 2)"` (`Indonesia Arena`, `2026-10-30`) | **DO NOT MERGE** (`isMatch: false`) | `isMatch: false` (`DISTINCT_RESIDENCY`) | **PASS** |
| **`W3.6`** | Multi-city tour (`Jakarta` vs `Surabaya`) | `"Sheila on 7: Tunggu Aku Di Jakarta"` (`JIExpo`, `2026-11-15`) | `"Sheila on 7: Tunggu Aku Di Surabaya"` (`Jatim Expo`, `2026-11-22`) | **DO NOT MERGE** (`isMatch: false`) | `isMatch: false` (`CITY_COLLISION_PREVENTED`) | **PASS** |
| **`W3.7`** | Different artists at same venue on consecutive dates | `"Raisa Live at Indonesia Arena"` (`Indonesia Arena`, `2026-11-10`) | `"Tulus Live at Indonesia Arena"` (`Indonesia Arena`, `2026-11-11`) | **DO NOT MERGE** (`isMatch: false`) | `isMatch: false` | **PASS** |
| **`W3.8`** | Same festival across different years (`2026` vs `2027`) | `"LaLaLa Festival Jakarta 2026"` (`JIExpo`, `2026-08-22`) | `"LaLaLa Festival Jakarta 2027"` (`JIExpo`, `2027-01-17`) | **DO NOT MERGE** (`isMatch: false`) | `isMatch: false` (`YEAR_COLLISION_PREVENTED`) | **PASS** |
