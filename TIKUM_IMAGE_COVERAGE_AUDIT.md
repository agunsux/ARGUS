# TIKUM — EVENT IMAGE COVERAGE AUDIT REPORT (W0–W9 EXTENSION)

**Audit Timestamp:** 2026-10-12T01:55:00+07:00 (WIB)
**Database Audited:** Neon PostgreSQL (`neondb` on `ep-fancy-math-a1833223-pooler.ap-southeast-1.aws.neon.tech`, Read-Only Mode `ARGUS_DB_READ_ONLY=true`)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Rollback Target:** `5d5a34517fbef55b23ad3be7e7ad18df83e94850` (`5d5a345`)

---

## 1. Executive Summary & Exact Before/After Counts

Every single one of the **63 canonical events** in `neondb` and all **35 deduplicated public upcoming events** (including **King Nassar: Lost In The Jungle** hydrated from canonical hero & official discovery registry) served by `GET /api/discovery/events`, `GET /api/events/home-feed`, `GET /events`, and `GET /` were audited end-to-end across all 7 pipeline stages (**Authorized Source → Adapter/Discovery → Normalized `DiscoveredEvent` → Canonical Repository → API Response → Frontend Card/Detail → Browser HTTP Reachability**).

### 1.1 All 63 Canonical Events in `neondb` (Before vs. After Fix)

| Metric / Classification | Before Fix (Raw `neondb`) | After Fix (Hydrated Catalog) | Delta / Explanation |
| :--- | :---: | :---: | :--- |
| **Total Canonical Events** | **63** | **63** *(+1 Hero hydrated in memory: `event-nassar-lost-in-the-jungle-2026`)* | Read-only production freeze respected (`0` DB mutations) |
| **`VERIFIED_OFFICIAL`** (`HTTP 200`, `image/*` from official organizer/event site) | **0** | **5** *(+1 King Nassar in hydrated catalog)* | `LaLaLa Festival 2027`, `Synchronize Festival 2026`, `DWP 2026`, `Pestapora 2026` (archived), `MotoGP Mandalika 2026` (archived), plus `King Nassar: Lost In The Jungle` (`/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg`) |
| **`VERIFIED_AUTHORIZED_SELLER`** (`HTTP 200`, `image/*` from LOKET / Live Nation / TEM) | **5** *(+7 false positives)* | **23** | **17** live LOKET upcoming banners restored + `Men I Trust` corroborated + `Kanye West` + `LANY Night 1` + `LANY Night 2` + `Maroon 5` + `The Weeknd` (archived) |
| **Total Working Verified Images (`HTTP 200`, `Content-Type: image/*`)** | **5 / 63 (7.9%)** | **28 / 63 (44.4%)** *(29 / 64 with King Nassar)* | **+24 verified working official/authorized event banners** |
| **`BROKEN`** (`HTTP 404` on `cdn.ruangevent.id`, `image_url: null` + fallback) | **7** *(falsely marked verified)* | **5** | `Synchronize 2026` & `Men I Trust` upgraded to verified live banners; remaining 5 (`The Script 2026` archived, `BABYMONSTER`, `Touché Amoré`, `Maddix`, `BIGBANG`) honestly marked `BROKEN` |
| **`SOURCE_LINK_ONLY`** (Verified source link present, no official poster URL) | **0** *(unclassified `NONE`)* | **21** | **6** upcoming verified events (4 comedy tours + `The Script 2027` + `Joyland 2026`) + `NCT 127` archived + **14** unverified legacy seed rows with `source_url` |
| **`MISSING`** (No `image_url` and no `source_url`) | **51** *(all null rows lumped together)* | **9** | **9** unverified legacy seed rows with neither `image_url` nor `source_url` (blocked from public feed) |
| **Sum Check** | **5 + 7 + 51 = 63** | **5 + 23 + 5 + 21 + 9 = 63** | **100% Reconciled** |

### 1.2 All 35 Unique Public Upcoming Events (Before vs. After Fix)

| Metric / Classification | Before Fix | After Fix | Notes |
| :--- | :---: | :---: | :--- |
| **Total Unique Public Upcoming Events** | **34** | **35** | After `Men I Trust` cross-source deduplication + `King Nassar: Lost In The Jungle` (`event-nassar-lost-in-the-jungle-2026`) hydrated into public feed |
| **`VERIFIED_OFFICIAL`** (`HTTP 200`, `image/*`) | **0** | **4** | `King Nassar: Lost In The Jungle` (`/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg`), `LaLaLa Festival Jakarta 2027`, `Synchronize Festival 2026`, `DWP 2026` |
| **`VERIFIED_AUTHORIZED_SELLER`** (`HTTP 200`, `image/*`) | **5** | **21** | 17 LOKET live events (incl. corroborated `Men I Trust`) + `Kanye West`, `LANY Night 1`, `LANY Night 2`, `Maroon 5` |
| **Total Public Upcoming Events with Verified Reachable Banners** | **5 / 34 (14.7%)** | **25 / 35 (71.4%)** | **+20 public upcoming events now render verified official/authorized posters** |
| **`BROKEN`** (`HTTP 404` upstream -> clean branded fallback) | **6** *(rendered broken `<img>`)* | **4** | `BABYMONSTER`, `Touché Amoré`, `Maddix`, `BIGBANG` render clean branded fallback without broken icons |
| **`SOURCE_LINK_ONLY`** (No upstream poster -> clean branded fallback + official link) | **23** *(unclassified)* | **6** | `Morgan Jay`, `Atsuko Okatsuka`, `Abdur Arsyad`, `Pandji Pragiwaksono`, `The Script 2027`, `Joyland Festival 2026` |
| **Sum Check** | **5 + 6 + 23 = 34** | **4 + 21 + 4 + 6 = 35** | **100% Reconciled** |

---

## 2. Root Causes Identified Across the 7-Stage Pipeline

1. **Stage 3 Bug (`DiscoveredEvent.prototype.toCanonicalEventPayload()` Dropped All Image Fields)**:
   - `LoketDiscoverySource` and `OfficialEventDiscoverySource` extracted `image_url` and `thumbnail_url` into `DiscoveredEvent`, and `DiscoveredEvent`'s constructor assigned `this.image_url`.
   - However, `DiscoveredEvent.prototype.toCanonicalEventPayload()` (lines 384–413 of `src/discovery/models/DiscoveredEvent.js`) omitted `image_url`, `thumbnail_url`, `image_source_url`, `image_source_type`, `image_verified_at`, and `image_status` when constructing the payload passed to `PostgresCatalogRepository.upsertCanonicalEvent()`.
   - As a result, all **17 live LOKET upcoming events** and **`LaLaLa Festival Jakarta 2027`** were inserted into `neondb` with `metadata.image_url = null`, even though their live LOKET API payload (`banners.desktop`) and official site (`https://lalalafest.com/images/og-image.webp`) had valid `HTTP 200` `image/*` banners.
2. **Stage 1/4 Bug (7 Broken `cdn.ruangevent.id` URLs Falsely Marked `VERIFIED_AUTHORIZED_SELLER`)**:
   - `src/discovery/fixtures/official_event_snapshot.json` contained 12 URLs on `cdn.ruangevent.id`. Live HTTP verification proved only **4** of those URLs return `HTTP 200` `image/*` (`The Weeknd`, `LANY Night 1`, `LANY Night 2`, `Maroon 5`), whereas **8** return `HTTP 404` (`text/html`).
   - `PostgresCatalogRepository.mapRowToEvent()` blindly trusted any non-null `meta.image_url` and set `image_status: 'VERIFIED_AUTHORIZED_SELLER'`, causing browser `<img>` tags to fail with 404 errors.
3. **Stage 5 Bug (Cold-Start Hydration Skipped in `discoveryRouter.js` When Legacy Seed Pre-Populated `canonicalRegistry`)**:
   - When `src/server.js` loaded `src/database.js`, 26 unverified legacy seed rows were synchronously added to `canonicalRegistry`.
   - `ensureRegistryHydrated` in `src/discovery/discoveryRouter.js` only checked `if (canonicalRegistry.getAllEvents().length === 0)`, which evaluated to `false` (`26 !== 0`), skipping PostgreSQL hydration on serverless cold start unless `hydrateFromRepository()` was called explicitly.
4. **Stage 6/7 Bug (SSR Catalog `GET /events` Lacked Poster Rendering & Detail Page `GET /events/:slug` Lacked `onerror` Fallback)**:
   - `GET /events` in `src/discovery/discoveryRouter.js` rendered text-only cards without any `<img>` or branded fallback media block.
   - `EventSEOService.renderEventPageHtml()` (`GET /events/:slug`) rendered `<figure class="event-poster">` only when `image_url` was truthy, without an `onerror` swap handler or an honest fallback banner when `image_status` was `SOURCE_LINK_ONLY` or `BROKEN`.

---

## 3. Complete 63-Event Image Provenance Table (`neondb`)

| # | Event ID | Event Name | City | Start Date | Lifecycle | Verification | Before Fix (Raw DB `image_url`) | After Fix `image_status` | After Fix `image_source_type` | After Fix Verified `image_url` / Fallback |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- | :---: | :--- |
| 1 | `event-gnr` | Guns N Roses: Not In This Lifetime | Jakarta | `2018-11-05` | `ARCHIVED` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 2 | `event-mamamoo-jkt` | MAMAMOO: World Tour in Jakarta | Tangerang | `2023-02-06` | `ARCHIVED` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 3 | `event-dewa19-surabaya` | Dewa 19: All Stars Stadium Tour Surabaya | Surabaya | `2023-08-23` | `ARCHIVED` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 4 | `event-coldplay` | Coldplay Music of the Spheres | Jakarta | `2023-11-12` | `ARCHIVED` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 5 | `event-twice-jkt` | TWICE: 5th World Tour Jakarta | Jakarta | `2023-12-20` | `ARCHIVED` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 6 | `event-so7-bandung` | Sheila On 7: Tunggu Aku Di Bandung | Bandung | `2024-09-25` | `ARCHIVED` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 7 | `event-raditya-dika-standup` | Raditya Dika: Cerita Cintaku Stand-Up Special | Jakarta | `2026-09-16` | `ARCHIVED` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 8 | `event-ibl-finals-2026` | Indonesian Basketball League (IBL) Finals 2026 | Jakarta | `2026-09-19` | `ARCHIVED` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 9 | `event-pestapora-2026` | Pestapora 2026 | Jakarta | `2026-09-24` | `ARCHIVED` | `VERIFIED` | NULL | `VERIFIED_OFFICIAL` | `OFFICIAL_EVENT_WEB` | `https://www.pestapora.com/thumbnail-pestapora.jpg` |
| 10 | `event-the-weeknd-jis` | The Weeknd: After Hours Til Dawn Tour | Jakarta | `2026-09-25` | `ARCHIVED` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_EVENT_WEB` | `https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg` |
| 11 | `event-synchronize-2026` | Synchronize Fest 2026 | Jakarta | `2026-09-29` | `ARCHIVED` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 12 | `ev-can-2f5e5765` | NCT 127 — NEO CITY: THE REDLINE Jakarta | Jakarta | `2026-10-02` | `ARCHIVED` | `VERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 13 | `event-lany-jakarta-2026` | LANY: 'a beautiful blur' Tour Jakarta | Jakarta | `2026-10-06` | `ARCHIVED` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 14 | `event-pandji-surabaya` | Pandji Pragiwaksono: Mens Rea Stand-Up Tour | Surabaya | `2026-10-07` | `ARCHIVED` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 15 | `ev-can-8b8154c9` | Pertamina Grand Prix of Indonesia 2026 (MotoGP Mandalika) | Mataram | `2026-10-08` | `COMPLETED` | `PRIMARY_SOURCE_VERIFIED` | NULL | `VERIFIED_OFFICIAL` | `OFFICIAL_EVENT_WEB` | `https://cdn.themandalikagp.com/storage/content/2025/05/22/1747884527_82a621adba2b63c248f3.webp` |
| 16 | `ev-can-4c335748` | The Script — Satellites World Tour Jakarta 2026 | Jakarta | `2026-10-09` | `COMPLETED` | `VERIFIED` | HTTP 404 BROKEN (thescript-satellites-jakarta-banner.jpg) | `BROKEN` | `OFFICIAL_EVENT_WEB` | `NULL` (Branded Fallback) |
| 17 | `event-bali-world-music` | Bali International World Music Festival 2026 | Badung | `2026-10-14` | `UPCOMING` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 18 | `ev-can-db1a668f` | Synchronize Festival 2026 | Jakarta | `2026-10-15` | `UPCOMING` | `VERIFIED` | HTTP 404 BROKEN (synchronize-festival-2026-poster.jpg) | `VERIFIED_OFFICIAL` | `OFFICIAL_EVENT_WEB` | `https://synchronizefestival.com/assets/images/main.png` |
| 19 | `event-maliq-surabaya-2026` | Maliq & D'Essentials: Konser Tunggal Surabaya | Surabaya | `2026-10-15` | `UPCOMING` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 20 | `ev-can-7886a183` | BABYMONSTER — 2026-27 WORLD TOUR [춤 (CHOOM)] Jakarta | Jakarta | `2026-10-16` | `UPCOMING` | `VERIFIED` | HTTP 404 BROKEN (babymonster-choom-jakarta-banner.jpg) | `BROKEN` | `OFFICIAL_ARTIST_WEB` | `NULL` (Branded Fallback) |
| 21 | `ev-can-c79bb221` | Men I Trust — Live in Jakarta 2026 | Jakarta | `2026-10-19` | `UPCOMING` | `VERIFIED` | HTTP 404 BROKEN (men-i-trust-jakarta-official-poster.jpg) | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260517111454_6a0940bed96d2.jpeg` |
| 22 | `ev-can-86d64d00` | ROSETOPIA ASIA TOUR 2026 IN JAKARTA | Jakarta | `2026-10-22` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260713100423_6a5455b7de053.jpeg` |
| 23 | `event-sheila-2026-bandung` | Sheila On 7: Live in Bandung 2026 | Bandung | `2026-10-22` | `UPCOMING` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 24 | `ev-can-d7e5a585` | OFFSIDE FEST | Jakarta | `2026-10-23` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261002152203_6abf69abf3cc3.jpg` |
| 25 | `ev-can-e4838a33` | Kanye West — Ye Tour 2026 in Jakarta | Jakarta | `2026-10-23` | `UPCOMING` | `VERIFIED` | HTTP 200 image/* | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/lp/sdk/prod/assets/banner/banner_1788163846_6a953706d288e.jpg` |
| 26 | `ev-can-11f0cca5` | A Tribute to Teresa Teng Orchestra Concert | Jakarta | `2026-10-27` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261001192320_6abe50b8a23bd.png` |
| 27 | `event-standup-special-2026` | Abdur Arsyad: Kontras Stand-Up Special | Jakarta | `2026-10-27` | `UPCOMING` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 28 | `ev-can-897e135b` | LANY: soft world tour – Night 1 (2026-10-29) | Jakarta | `2026-10-28` | `UPCOMING` | `VERIFIED` | HTTP 200 image/* | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg` |
| 29 | `ev-can-776cb0e4` | LANY: soft world tour – Night 2 (2026-10-30) | Jakarta | `2026-10-29` | `UPCOMING` | `VERIFIED` | HTTP 200 image/* | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg` |
| 30 | `event-bruno-mars-2026` | Bruno Mars: Live in Jakarta 2026 | Jakarta | `2026-10-29` | `UPCOMING` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 31 | `ev-can-cbd1b6af` | Alunan Musik Nostalgia (Memories Of The Soul) Vol. 01 | Jakarta | `2026-10-30` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260721113228_6a5ef65c616bf.jpg` |
| 32 | `ev-can-97ad5478` | Raisa Handmade Night | Jakarta | `2026-11-03` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261008184142_6ac781766c0b6.jpeg` |
| 33 | `ev-can-5d352439` | INTIMATE NIGHT WITH KAHITNA | Bandung | `2026-11-04` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261006145130_6ac4a88293487.jpg` |
| 34 | `ev-can-6b2378ac` | HYBRID RACE SIMULATION @ ISFEX 2026 | Tangerang | `2026-11-04` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261008112046_6ac71a1e16654.jpg` |
| 35 | `event-teater-koma-2026` | Teater Koma: Lakon Suksesi Republik | Jakarta | `2026-11-04` | `UPCOMING` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 36 | `ev-can-9c3bf173` | Touché Amoré — Asia Tour Jakarta 2026 | Jakarta | `2026-11-05` | `UPCOMING` | `VERIFIED` | HTTP 404 BROKEN (touche-amore-jakarta-banner.jpg) | `BROKEN` | `OFFICIAL_PROMOTER_WEB` | `NULL` (Branded Fallback) |
| 37 | `ev-can-9e6eaaf7` | Into the New World: Symphonic Reimagination of K-Pop | Jakarta | `2026-11-06` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260923130215_6ab36b67cab93.jpeg` |
| 38 | `event-dwp-2026` | Djakarta Warehouse Project (DWP) 2026 | Jakarta | `2026-11-09` | `UPCOMING` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 39 | `ev-can-fd86cf7d` | Morgan Jay: The Goofy Guy Tour Jakarta | Jakarta | `2026-11-10` | `UPCOMING` | `PRIMARY_SOURCE_VERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 40 | `ev-can-4cc7e9d0` | Men I Trust Asia Tour 2026: Live In Jakarta | Jakarta | `2026-11-11` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260517111454_6a0940bed96d2.jpeg` |
| 41 | `event-hindia-bandung-2026` | Hindia: Lagipula Hidup Akan Berakhir Bandung | Bandung | `2026-11-11` | `UPCOMING` | `UNVERIFIED` | NULL | `MISSING` | `NONE` | `NULL` (Branded Fallback) |
| 42 | `ev-can-3efa2aba` | Maddix — Live in Tangerang 2026 | Tangerang | `2026-11-13` | `UPCOMING` | `VERIFIED` | HTTP 404 BROKEN (maddix-live-tangerang-banner.jpg) | `BROKEN` | `OFFICIAL_PROMOTER_WEB` | `NULL` (Branded Fallback) |
| 43 | `ev-can-c6b3c201` | Takase Toya ∞ Asia Tour 2026 | Jakarta | `2026-11-14` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260908164640_6a9fd98011a97.jpg` |
| 44 | `ev-can-438df259` | Atsuko Okatsuka: The Big Bowl Tour Jakarta | Jakarta | `2026-11-19` | `UPCOMING` | `PRIMARY_SOURCE_VERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 45 | `ev-can-b407b9e6` | LOMBA SIHIR: KONSER UJUNG DUNIA | Jakarta | `2026-11-20` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260730155721_6a6b11f106315.png` |
| 46 | `event-joyland-2026` | Joyland Festival Jakarta 2026 | Jakarta | `2026-11-26` | `UPCOMING` | `PRIMARY_SOURCE_VERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 47 | `ev-can-03e3ecd2` | Abdur Arsyad: Kontras Special Tour Jakarta | Jakarta | `2026-11-27` | `UPCOMING` | `PRIMARY_SOURCE_VERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 48 | `ev-can-dc3d0f9f` | Joyland Sessions 2026 | Jakarta | `2026-11-27` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260929110808_6abb39a877f97.jpeg` |
| 49 | `ev-can-f4cea794` | WLT Day - Bandung | Bandung | `2026-11-27` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261005122518_6ac334be82f82.jpg` |
| 50 | `event-teater-koma-desember-2026` | Teater Koma: Opera Ular Putih Akhir Tahun | Jakarta | `2026-12-02` | `UPCOMING` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 51 | `ev-can-8d41cb50` | FIA Rallycross World Cup Indonesia 2026 | Jakarta | `2026-12-04` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260813130840_6a7d5f681f720.jpeg` |
| 52 | `ev-can-dda9f5f5` | Boyz II Men + Dewa19 Feat Ari Lasso Virzha Live in Jakarta | Jakarta | `2026-12-08` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20260923114022_6ab35836e53f1.jpeg` |
| 53 | `event-tulus-bandung` | Tulus: Konser Intim Akhir Tahun 2026 | Bandung | `2026-12-09` | `UPCOMING` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 54 | `ev-can-588c5da8` | DWP 2026 | Jakarta | `2026-12-10` | `UPCOMING` | `VERIFIED` | HTTP 200 image/* | `VERIFIED_OFFICIAL` | `OFFICIAL_EVENT_WEB` | `https://dwpfest.com/icons/richlink.jpg` |
| 55 | `event-java-jazz-on-the-move-2026` | Java Jazz Festival: On The Move 2026 | Jakarta | `2026-12-12` | `UPCOMING` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 56 | `ev-can-168f2b20` | Pandji Pragiwaksono: Mens Rea Jakarta | Jakarta | `2026-12-18` | `UPCOMING` | `PRIMARY_SOURCE_VERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 57 | `ev-can-2f40ea4f` | Fun Run | Tangerang | `2026-12-18` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261011173821_6acb671d6eb1e.jpg` |
| 58 | `ev-can-9182098c` | Blue Island Eco Fest 2026 | Jakarta | `2026-12-19` | `UPCOMING` | `VERIFIED` | NULL | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://assets.loket.com/neo/production/images/banner/20261004005654_6ac141e65f6c2.jpg` |
| 59 | `event-big-bang-2026` | Big Bang Festival Jakarta 2026 | Jakarta | `2026-12-19` | `UPCOMING` | `UNVERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 60 | `ev-can-9d176655` | BIGBANG 2026–27 WORLD TOUR in Jakarta | Jakarta | `2027-01-15` | `UPCOMING` | `VERIFIED` | HTTP 404 BROKEN (bigbang-world-tour-jakarta-banner.jpg) | `BROKEN` | `OFFICIAL_EVENT_WEB` | `NULL` (Branded Fallback) |
| 61 | `ev-can-e21741a2` | LaLaLa Festival Jakarta 2027 | Tangerang | `2027-01-16` | `UPCOMING` | `PRIMARY_SOURCE_VERIFIED` | NULL | `VERIFIED_OFFICIAL` | `OFFICIAL_EVENT_WEB` | `https://lalalafest.com/images/og-image.webp` |
| 62 | `ev-can-7fdfa844` | Maroon 5 Asia 2027 in Jakarta | Jakarta | `2027-02-04` | `UPCOMING` | `VERIFIED` | HTTP 200 image/* | `VERIFIED_AUTHORIZED_SELLER` | `OFFICIAL_TICKETING` | `https://cdn.ruangevent.id/temgmt/maroon5/main-cover-maroon5.webp` |
| 63 | `ev-can-47275b5f` | The Script: Man in the Arena Tour 2027 Jakarta | Jakarta | `2027-04-02` | `UPCOMING` | `PRIMARY_SOURCE_VERIFIED` | NULL | `SOURCE_LINK_ONLY` | `NONE` | `NULL` (Branded Fallback) |
| 64 *(Hero Hydrated)* | `event-nassar-lost-in-the-jungle-2026` | King Nassar: Lost In The Jungle | Jakarta | `2026-11-07` | `UPCOMING` | `VERIFIED` | Not in `neondb` snapshot | `VERIFIED_OFFICIAL` | `OFFICIAL_PROMOTER_WEB` | `/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg` (`281,882` bytes, Boss Creator & VINDES official poster) |
