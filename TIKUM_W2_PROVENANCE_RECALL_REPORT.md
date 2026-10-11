# TIKUM — W2: PROVENANCE & RECALL TRUTH AUDIT REPORT

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Previous Rollback Target:** `5d5a34517fbef55b23ad3be7e7ad18df83e94850` (`5d5a345`)
**Production Database:** Neon PostgreSQL (`ep-wispy-salad-b3in9yw3-pooler.c-4.ap-southeast-1.aws.neon.tech:5432/neondb`, read-only inspection)

---

## 1. Executive Summary & Provenance Breakdown of All 63 Database Events

A complete row-by-row inspection of `SELECT * FROM events` (63 rows) and `SELECT * FROM event_source_links` (27 rows) in the live Neon PostgreSQL database (`neondb`) proves that the 63 canonical events originate from **4 distinct mechanisms**—not a single automated pipeline:

| Origin Classification | Total Events in `neondb` | Publicly Visible in Baseline (`76b4d92`) | Publicly Visible After W1 `FILTER_BUG` Fix | Future Events (`start_date >= 2026-10-12`) | Past / Concluded Events (`start_date < 2026-10-12`) | Exact Mechanism / Code Path |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`LIVE_PIPELINE_DISCOVERED` (`PIPELINE_LOKET`)** | **18** | **1** (`ev-can-588c5da8`, corroborated by curated registry) | **18** *(17 after W3 cross-source dedup of `Men I Trust`)* | 18 | 0 | Automated HTTP GET from `https://rest.loket.com/fusio/api/v1/public/discover` via `src/discovery/supply/LoketDiscoverySource.js` during reconciliation run `c2463a2a-0fe3-4444-89ef-1961be2fd016`. |
| **`STATIC_CODE_SEED` (`Curated Official Registry`)** | **7** *(+2 merged into existing rows: `ev-can-588c5da8` DWP & `event-joyland-2026`)* | **6** | **6** | 6 | 1 (`ev-can-8b8154c9` MotoGP) | Hardcoded JS array `verifiedOfficialEvents` in `src/discovery/supply/OfficialEventDiscoverySource.js` ingested during `MarketSupplyExpansionService.runPipeline({ dryRun: false })`. |
| **`SNAPSHOT_FIXTURE` (`Committed JSON Snapshot`)** | **12** | **10** | **10** | 10 | 2 (`ev-can-2f5e5765` NCT 127, `ev-can-4c335748` The Script 2026) | Committed static JSON file `src/discovery/fixtures/official_event_snapshot.json` loaded by `src/discovery/RealSourceSeedService.js`. |
| **`STATIC_CODE_SEED` (`SEED_LEGACY`)** | **26** | **1** (`event-joyland-2026`, promoted by curated registry) | **1** | 13 (12 unverified + 1 verified) | 13 | Hardcoded initial array in `src/database.js` (`seedInitialEvents`). |
| **TOTAL** | **63** | **18** | **35** *(**34** unique public cards after W3 cross-source dedup)* | **47** (35 verified + 12 unverified) | **16** | — |

### Key Truth Findings (No Inflation)
1. **Only 18 of the 63 events (28.6%) were genuinely discovered by live automated HTTP polling** (`LoketDiscoverySource` hitting `https://rest.loket.com/fusio/api/v1/public/discover`).
2. **Why baseline `76b4d92` only displayed 1 of the 18 live LOKET events (`ev-can-588c5da8` DWP)**: `LoketDiscoverySource` had `trust_score: 90` (`tier: 2` in `AdapterRegistry` vs `tier: 1` in `EventVerificationService`), causing 17 single-source LOKET discoveries to receive `verification_status = 'PARTIALLY_VERIFIED'` while `is_verified = true`. `discoveryRouter.js` (`handleGetEvents`) previously filtered out `PARTIALLY_VERIFIED` (`FILTER_BUG`), hiding all 17 live-discovered LOKET events from `/api/discovery/events`!
3. **None of the 7 standalone events in `OfficialEventDiscoverySource.js` (`LaLaLa Festival Jakarta 2027`, `MotoGP Mandalika 2026`, `Atsuko Okatsuka`, `Morgan Jay`, `The Script 2027`, `Abdur Arsyad: Kontras`, `Pandji Pragiwaksono: Mens Rea`) were discovered by live web scraping.** They were hardcoded in `src/discovery/supply/OfficialEventDiscoverySource.js` and persisted into Neon PostgreSQL when `MarketSupplyExpansionService.runPipeline()` executed.
4. **Remediated in W2 (`src/discovery/supply/OfficialEventDiscoverySource.js` & `src/discovery/models/DiscoveredEvent.js`)**: Every record emitted by `OfficialEventDiscoverySource.js` now carries explicit provenance tags:
   - `source_origin: "STATIC_CURATED_OFFICIAL_SEED"`
   - `discovery_method: "CURATED_STATIC_REGISTRY"`
   This prevents curated static entries from ever masquerading as automated live scraper discoveries.

---

## 2. Specific Event Provenance Verification (`W2.2`)

Per Section 2.2, the exact provenance of each target event / tour in the production database is documented below:

| Target Event / Tour | Canonical `id` in `neondb` | Origin Classification | `source_id` / `event_source_links` | `official_event_url` / `official_ticket_url` | `evidence_hash` | `created_at` / `updated_at` | Honest Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **LaLaLa Festival Jakarta 2027** (Olivia Dean, St. Vincent) | `ev-can-e21741a2` | **`STATIC_CODE_SEED`** (`OfficialEventDiscoverySource.js`) | `src-official-lalalafest` (`lalalafest-jakarta-2027`) | Event: `https://lalalafest.com/jakarta`<br>Ticket: `https://www.loket.com` (generic root URL, not a deep event link) | `54be16fd519db229c2bf8c503c29aa357fd6d7cfbe32b3460d5df4451bfcfcc8` | `2026-10-11T05:31:57.997Z` | **Manually curated in code** (`OfficialEventDiscoverySource.js` lines 27–86). Grounded in real public facts, but **not** discovered by an automated HTML/JSON-LD scraper. |
| **Atsuko Okatsuka: The Big Bowl Tour Jakarta** | `ev-can-438df259` | **`STATIC_CODE_SEED`** (`OfficialEventDiscoverySource.js`) | `src-official-comedy` (`atsuko-okatsuka-jakarta-2026`) | Event: `https://atsukookatsuka.com`<br>Ticket: `https://tiptip.id` (generic root domain) | `42be36d6cf9f5d7873f38c26d8201297a0f99d218733eb8e20bb576dc152e16a` | `2026-10-11T05:31:59.286Z` | **Manually curated in code** (`OfficialEventDiscoverySource.js` lines 133–172). Not discovered by automated TipTip or artist site scraping. |
| **Morgan Jay: The Goofy Guy Tour Jakarta** | `ev-can-fd86cf7d` | **`STATIC_CODE_SEED`** (`OfficialEventDiscoverySource.js`) | `src-official-comedy` (`morgan-jay-jakarta-2026`) | Event: `https://morganjay.com`<br>Ticket: `https://megatix.com.au` (generic root domain) | `c9bf5a2cc5bb09561c72f921700898ab6672dbeb0e6d04d5a79573691bf0b8fd` | `2026-10-11T05:31:59.932Z` | **Manually curated in code** (`OfficialEventDiscoverySource.js` lines 176–213). Not discovered by automated Megatix scraping. |
| **Abdur Arsyad: Kontras Special Tour Jakarta** | `ev-can-03e3ecd2` | **`STATIC_CODE_SEED`** (`OfficialEventDiscoverySource.js`) | `src-official-standupindo` (`abdur-arsyad-kontras-jakarta-2026`) | Event: `https://standupindo.id`<br>Ticket: `https://goersapp.com` (generic root domain) | `124ba8c4e550e729a973e8b02390b247e1ba74d5a3fb9a93dc6bd164abbf57fb` | `2026-10-11T05:32:01.213Z` | **Manually curated in code** (`OfficialEventDiscoverySource.js` lines 258–295). Note: Legacy seed also has `event-standup-abdur-2026` (`2026-08-29`, archived/past). |
| **Pandji Pragiwaksono: Mens Rea Jakarta** | `ev-can-168f2b20` | **`STATIC_CODE_SEED`** (`OfficialEventDiscoverySource.js`) | `src-official-comika` (`pandji-mens-rea-jakarta-2026`) | Event: `https://comika.id`<br>Ticket: `https://comika.id/mens-rea` | `6f94e1c4a9cb6c77df369db22949fb4cb12cb7e80f874fc2630fc897d2c683a2` | `2026-10-11T05:32:01.855Z` | **Manually curated in code** (`OfficialEventDiscoverySource.js` lines 299–336). Not discovered by automated Comika scraping. |
| **Pertamina Grand Prix of Indonesia 2026 (MotoGP Mandalika)** | `ev-can-8b8154c9` | **`STATIC_CODE_SEED`** (`OfficialEventDiscoverySource.js`) | `src-official-motogp` (`motogp-mandalika-2026`) | Event: `https://themandalikagp.com`<br>Ticket: `https://gpticket.themandalikagp.com` | `5b8d83f5b228661f12106172fd732763a2811743c70f6f836d6e6180cc6ce485` | `2026-10-11T05:31:58.641Z` | **Manually curated in code** (`OfficialEventDiscoverySource.js` lines 90–129). Concluded on `2026-10-11`; excluded from upcoming public feed as of `2026-10-12`. |
| **The Script: Man in the Arena Tour 2027 Jakarta** | `ev-can-47275b5f` | **`STATIC_CODE_SEED`** (`OfficialEventDiscoverySource.js`) | `src-official-thescript` (`thescript-jakarta-2027`) | Event: `https://thescriptmusic.com`<br>Ticket: `https://tiptip.id` | `075049ef4732946fc21b91e044932cf0bc3b9fc654ec4445d4df1cf4dc5b0bc3` | `2026-10-11T05:32:00.573Z` | **Manually curated in code** (`OfficialEventDiscoverySource.js` lines 217–254). Note: Snapshot fixture also contains a past 2026 entry (`ev-can-4c335748`, `2026-10-10`). |
| **Djakarta Warehouse Project (DWP) 2026** | `ev-can-588c5da8` | **`LIVE_PIPELINE_DISCOVERED` + `STATIC_CODE_SEED`** | `src-loket` (`loket-dwp-2026`) + `src-official-dwp` (`dwp-jakarta-2026`) | Event: `https://dwpfest.com`<br>Ticket: `https://www.loket.com/event/djakarta-warehouse-project-2026_DWP26` | `d59cf5e794c4c39e0593691a8be41dfec8274d8e5f9c0268a4d30431887d52ab` | `2026-10-11T05:32:02.497Z` | Discovered via LOKET (`ev-can-588c5da8`, `2026-12-11`–`2026-12-13`), enriched and corroborated by `OfficialEventDiscoverySource.js` (`dwp-jakarta-2026`). |
| **Joyland Festival Jakarta 2026** | `event-joyland-2026` | **`STATIC_CODE_SEED`** (Legacy seed promoted by Curated Registry) | `src-official-joyland` (`joyland-jakarta-2026`) | Event: `https://joylandfest.com`<br>Ticket: `https://www.loket.com` | `4c9be8061a6bc3b794a918967bc4ca70f9bc699e1a37b105f7be0e11c8bf9b0e` | `2026-10-11T05:32:03.141Z` | Originally in `src/database.js` (`event-joyland-2026`, `2026-11-27`), matched and promoted to `PRIMARY_SOURCE_VERIFIED` by `OfficialEventDiscoverySource.js`. Plus `ev-can-dc3d0f9f` (`Joyland Sessions 2026`, `2026-11-28`) discovered via live LOKET API. |
| **Synchronize Festival 2026** | `ev-can-db1a668f` | **`SNAPSHOT_FIXTURE` + `STATIC_CODE_SEED`** | `src-loket` (`loket-synchronize-2026`) + `src-official-synchronize` | Event: `https://www.synchronizefestival.com/`<br>Ticket: `https://www.loket.com/event/synchronize-festival-2026_Sync26` | `3cf079438cf22e91f1a0bc9d1d1c8b347a73f12cb4f26b4201f74df73e154c3e` | `2026-10-11T05:32:03.781Z` | Loaded from `official_event_snapshot.json` (`2026-10-16`–`2026-10-18`) and corroborated by `OfficialEventDiscoverySource.js`. |
| **Men I Trust — Equus Tour 2026 in Jakarta** | `ev-can-4cc7e9d0` (Live LOKET) & `ev-can-c79bb221` (Snapshot) | **`LIVE_PIPELINE_DISCOVERED`** (`ev-can-4cc7e9d0`) & **`SNAPSHOT_FIXTURE`** (`ev-can-c79bb221`) | `src-loket` (`bbo8`) & `src-bbo` (`bbo-men-i-trust-equus-jkt-2026`) | Live LOKET: `https://www.loket.com/event/men-i-trust-asia-tour-2026-live-in-jakarta_bbo8` (`2026-11-12`)<br>Snapshot: `2026-10-20` | `751e4370...` (Live LOKET) | `2026-10-11T05:31:51.404Z` | **Genuinely discovered via live LOKET API** (`ev-can-4cc7e9d0`, `2026-11-12`), while a second row (`ev-can-c79bb221`, `2026-10-20`) came from `official_event_snapshot.json`. Merged on the public surface in W3. |
| **Maddix — Live at Phantom PIK 2** | `ev-can-3efa2aba` | **`SNAPSHOT_FIXTURE`** | `src-loket` (`D4baD`) | Ticket: `https://www.loket.com/event/maddix_D4baD` (`2026-11-14`) | `36923f8a...` | `2026-10-11T05:31:50.118Z` | Loaded from `official_event_snapshot.json` with verified LOKET deep URL (`maddix_D4baD`). |
| **Touché Amoré Live in Jakarta** | `ev-can-9c3bf173` | **`SNAPSHOT_FIXTURE`** | `src-bbo` + `src-loket` (`bboU`) | Ticket: `https://www.loket.com/event/touche-amore-live-in-jakarta_bboU` (`2026-11-06`) | `1e8ef6b1...` | `2026-10-11T05:31:50.761Z` | Loaded from `official_event_snapshot.json` with verified BBO/LOKET deep URL (`touche-amore-live-in-jakarta_bboU`). |

---

## 3. Complete 18 Live-Discovered Events from LOKET Public API (`LIVE_PIPELINE_DISCOVERED` / `PIPELINE_LOKET`)

During reconciliation run `c2463a2a-0fe3-4444-89ef-1961be2fd016`, `LoketDiscoverySource.js` queried `https://rest.loket.com/fusio/api/v1/public/discover` and ingested 18 live events with real LOKET event URLs (`/event/<slug>_<code_id>`).

### A. 17 Single-Source Live LOKET Discoveries (Previously Hidden by `FILTER_BUG` in `76b4d92`, Now Publicly Visible After W1 Fix)
1. `ev-can-86d64d00` — **ROSETOPIA ASIA TOUR 2026 IN JAKARTA** (`2026-10-23`, Balai Sarbini Jakarta, Rp 1.250.000)
2. `ev-can-d7e5a585` — **OFFSIDE FEST** (`2026-10-24`, Jakarta International Velodrome, Rp 350.000)
3. `ev-can-11f0cca5` — **A Tribute to Teresa Teng Orchestra Concert** (`2026-10-28`, Ciputra Artpreneur Theater Jakarta, Rp 850.000)
4. `ev-can-cbd1b6af` — **Alunan Musik Nostalgia (Memories Of The Soul) Vol. 01** (`2026-10-31`, Gedung Kesenian Jakarta, Rp 450.000)
5. `ev-can-97ad5478` — **Raisa Handmade Night** (`2026-11-04`, Bengkel Space SCBD Jakarta, Rp 500.000)
6. `ev-can-5d352439` — **INTIMATE NIGHT WITH KAHITNA** (`2026-11-05`, Trans Luxury Hotel Bandung, Rp 650.000)
7. `ev-can-6b2378ac` — **HYBRID RACE SIMULATION @ ISFEX 2026** (`2026-11-05`, ICE BSD City Tangerang, Rp 400.000)
8. `ev-can-9e6eaaf7` — **Into the New World: Symphonic Reimagination of K-Pop** (`2026-11-07`, Jakarta Concert Hall iNews Tower, Rp 550.000)
9. `ev-can-4cc7e9d0` — **Men I Trust Asia Tour 2026: Live In Jakarta** (`2026-11-12`, GBK Basketball Hall Senayan Jakarta, Rp 950.000 — *merged with `ev-can-c79bb221` on public feed in W3*)
10. `ev-can-c6b3c201` — **Takase Toya ∞ Asia Tour 2026** (`2026-11-15`, Soehanna Hall Jakarta, Rp 750.000)
11. `ev-can-b407b9e6` — **LOMBA SIHIR: KONSER UJUNG DUNIA** (`2026-11-21`, Tennis Indoor Senayan Jakarta, Rp 350.000)
12. `ev-can-dc3d0f9f` — **Joyland Sessions 2026** (`2026-11-28`, GBK Senayan Jakarta, Rp 650.000)
13. `ev-can-f4cea794` — **WLT Day - Bandung** (`2026-11-28`, Eldorado Dome Bandung, Rp 300.000)
14. `ev-can-8d41cb50` — **FIA Rallycross World Cup Indonesia 2026** (`2026-12-05`, Jakarta International E-Prix Circuit Ancol, Rp 750.000)
15. `ev-can-dda9f5f5` — **Boyz II Men + Dewa19 Feat Ari Lasso Virzha Live in Jakarta** (`2026-12-09`, Indonesia Arena GBK Senayan Jakarta, Rp 1.250.000)
16. `ev-can-2f40ea4f` — **Fun Run** (`2026-12-19`, QBig BSD City Tangerang, Rp 300.000)
17. `ev-can-9182098c` — **Blue Island Eco Fest 2026** (`2026-12-20`, Pantai Carnaval Ancol Jakarta, Rp 450.000)

### B. 1 Multi-Source Live LOKET Discovery (`VERIFIED` in Baseline `76b4d92` and After W1 Fix)
18. `ev-can-588c5da8` — **Djakarta Warehouse Project (DWP) 2026** (`2026-12-11`–`2026-12-13`, JIExpo Kemayoran Jakarta, Rp 1.900.000)

---

## 4. Measurable Recall Benchmark Against Golden Set (`W2.3`)

To measure true pipeline recall without circular self-validation, we evaluated a **30-event Indonesian Golden Benchmark Set** spanning major concerts, festivals, comedy tours, sports, and regional cities (Jakarta, Tangerang/BSD, Bandung, Surabaya, Yogyakarta/Sleman, Bali, Lombok) across both `>= Rp500.000` (P0/P1) and `< Rp500.000` (P2) price bands:

| Recall Metric | Golden Benchmark Count | Present in `neondb` (All Origins) | Genuine Live Pipeline Recall (`LIVE_PIPELINE_DISCOVERED` Only) | Catalog Recall (Live + Snapshot + Curated Official) | Root Cause of Live Pipeline Recall Gap |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Overall Golden Set** | **30** | **26 / 30 (86.7%)** | **12 / 30 (40.0%)** | **26 / 30 (86.7%)** | Only LOKET (`src-loket`) has an active live HTTP API parser; Tiket.com, Traveloka, GOERS, TipTip, Megatix, and Comika do not have active live public web scrapers (WAF-blocked or passive adapters). |
| **High-Value Tier (`>= Rp500.000`)** | **22** | **19 / 22 (86.4%)** | **8 / 22 (36.4%)** | **19 / 22 (86.4%)** | Stadium/arena concerts sold exclusively on Tiket.com (`BABYMONSTER`, `Maroon 5`), promoter microsites (`Kanye West`, `LANY`, `LaLaLa Fest`), or TipTip/Comika/Megatix (`Atsuko`, `Morgan Jay`, `Pandji`) are not listed on LOKET's public discover API. |
| **Standard Tier (`Rp300.000 – Rp499.999`)** | **8** | **7 / 8 (87.5%)** | **4 / 8 (50.0%)** | **7 / 8 (87.5%)** | Mid-tier concerts and festivals frequently use LOKET (`src-loket`), yielding higher live automated recall. |

---

## 5. Dead URL vs. Cancelled Event Safeguard (`W2.4`)

In `src/discovery/EventVerificationService.js` (lines 420–453), we enforced the strict rule that **an unreachable URL or HTTP 4xx/5xx error is a source-availability state (`SOURCE_URL_UNAVAILABLE` / `STALE`), never an event cancellation (`CANCELLED`)**:
- When `source_fetch_status === 'SOURCE_URL_UNAVAILABLE'` or `http_status >= 400`, `EventVerificationService.evaluateEvent()` appends `'SOURCE_URL_UNAVAILABLE'` to `flags` and transitions the verification status to `STALE`.
- Even if an upstream caller passes `status: 'CANCELLED'` with a dead-URL reason (`cancellation_reason: 'HTTP 404 dead_url'`) without `official_cancellation_evidence`, `EventVerificationService` blocks the false cancellation, appends `'DEAD_URL_CANNOT_INFER_CANCELLATION'`, and sets `verification_status = 'STALE'`.
- Verified by `W2.2` and `W2.3` in `test_w2_w7_comprehensive_audit.js` (100% PASS).
