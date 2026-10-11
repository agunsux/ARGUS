# TIKUM — W4: NATIONAL SOURCE COVERAGE & IMAGE AVAILABILITY REPORT

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Target Modules:**
- `src/discovery/SourceRegistry.js` (129 registered sources)
- `src/discovery/adapters/AdapterRegistry.js` (10 specialized adapter classes + `GenericAdapter`)
- `src/discovery/supply/LoketDiscoverySource.js`
- `src/discovery/supply/OfficialEventDiscoverySource.js`
- `src/discovery/OfficialSourceSnapshotStore.js`
- `src/discovery/EventVisualProvenanceService.js`
- `src/discovery/fixtures/verified_event_image_provenance.json`

---

## 1. Truth Matrix of Indonesian & Regional Event Sources + Image Availability (`W4.1` & Image Audit)

Per Section 4.1 and the Image Coverage Extension, we audited both the runtime event-ingestion status and the event-banner availability (`HTTP 200` + `Content-Type: image/*`) of every ticketing platform, promoter source, venue source, and regional discovery radar in the codebase:

| Source Platform / Category | Registered `source_id`(s) | Operational Status | Access Method | Canonical Events in `neondb` | Verified Working Images (`HTTP 200`, `image/*`) | Image Source Type & Status Breakdown |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **LOKET.com** | `src-loket` | **`ACTIVE_LIVE_API`** | Live HTTP GET (`https://rest.loket.com/fusio/api/v1/public/discover?p=<page>`) + JSON-LD `schema.org/Event` detail parser | **18** (live API) + **1** (`Men I Trust` snapshot corroborated) | **18 / 18** upcoming (**100%**) | `AUTHORIZED_TICKET_SELLER` / `VERIFIED_AUTHORIZED_SELLER` (`assets.loket.com` CDN banners verified `HTTP 200` `image/jpeg` & `image/png`) |
| **Official Festival & Event Websites** (`LaLaLa`, `Synchronize`, `DWP`, `Pestapora`, `MotoGP Mandalika`, `Joyland`) | `src-official-lalalafest`, `src-official-synchronize`, `src-official-dwp`, `src-official-motogp`, `src-official-joyland`, `src-official-verified` | **`STATIC_CURATED_SEED` + `SNAPSHOT_BACKED`** | Curated official registry (`OfficialEventDiscoverySource.js`) + committed snapshot (`official_event_snapshot.json`) | **6** (4 upcoming, 2 archived) | **5 / 6** (**83.3%**) | **5** `VERIFIED_OFFICIAL` (`lalalafest.com`, `synchronizefestival.com`, `dwpfest.com`, `pestapora.com`, `cdn.themandalikagp.com`) + **1** `SOURCE_LINK_ONLY` (`Joyland Festival Bali 2026` — official site verified, no 2026 poster published yet) |
| **Live Nation Asia / TEM Presents / PK Entertainment** | `src-livenation`, `src-promoter-tem`, `src-promoter-pk` | **`SNAPSHOT_BACKED`** | Committed snapshot (`official_event_snapshot.json`) | **7** (6 upcoming, 1 archived) | **5 / 7** (**71.4%**) | **5** `VERIFIED_AUTHORIZED_SELLER` (`Kanye West`, `LANY Night 1`, `LANY Night 2`, `Maroon 5`, `The Weeknd` archived) + **2** `BROKEN` (`BABYMONSTER`, `BIGBANG` — `404` on `cdn.ruangevent.id`, rendered with branded fallback) |
| **BBO (`bbo.co.id`) / Plainsong / Color Asia / Ismaya** | `src-bbo`, `src-promoter-plainsong`, `src-promoter-colorasia`, `src-promoter-ismaya` | **`SNAPSHOT_BACKED` + `PASSIVE_PARTNER_FEED`** | Committed snapshot + LOKET cross-source corroboration | **5** (3 upcoming, 2 archived) | **1 / 5** (**20.0%**) | **1** `VERIFIED_AUTHORIZED_SELLER` (`Men I Trust` corroborated via `assets.loket.com`) + **3** `BROKEN` (`Touché Amoré`, `Maddix`, `The Script 2026` archived — `404` on `cdn.ruangevent.id`) + **1** `SOURCE_LINK_ONLY` (`NCT 127` archived) |
| **TipTip / Megatix / GOERS / Comika (Comedy & 2027 Tours)** | `src-official-comedy`, `src-official-comika`, `src-official-thescript` | **`STATIC_CURATED_SEED`** | Curated official registry (`OfficialEventDiscoverySource.js`) | **5** (5 upcoming) | **0 / 5** (`SOURCE_LINK_ONLY`) | **5** `SOURCE_LINK_ONLY` (`Morgan Jay`, `Atsuko Okatsuka`, `Abdur Arsyad`, `Pandji Pragiwaksono`, `The Script 2027` — official links verified, no direct poster URL scraped; UI renders clean branded fallback + official link) |
| **Tiket.com** | `src-tiketcom` | **`BLOCKED_WAF_PASSIVE_ADAPTER`** | Passive partner feed (`TIKETCOM_FEED_URL`) | *(Covered via Live Nation / PK snapshot)* | — | Public web protected by Akamai/Cloudflare WAF (`robots.txt` restricts `/to-do/search`). |
| **Traveloka (Xperience)** | `src-traveloka` | **`BLOCKED_WAF_NOT_INTEGRATED`** | Registered in `SourceRegistry.js`; returns `DATA_UNAVAILABLE` | **0** | **0** | Protected by AWS WAF / bot challenge; no public unauthenticated event feed. |
| **Yesplis / Artatix / Dewatiket / KiosTix / XTIX / BookMyShow ID / Eratix** | `src-yesplis`, `src-artatix`, `src-dewatiket`, `src-kiostix`, `src-xtix`, `src-bookmyshow`, `src-eratix` | **`PASSIVE_ADAPTER_STUB` / `PASSIVE_UNCONFIGURED`** | Passive partner feed or fixture injection | **0** | **0** | Explicitly reported as `DATA_UNAVAILABLE` in `source_outcomes`. |
| **Unverified Legacy Seed Rows** | `src-loket` (legacy seed) | **`QUARANTINED_UNVERIFIED_SEED`** | Legacy bootstrap rows (`is_verified: false`, `public_visibility: false`) | **22** (blocked from public) | **0 / 22** | **13** `SOURCE_LINK_ONLY` + **9** `MISSING` (never exposed on any public route). |

---

## 2. Summary of Image Availability Across All 63 Canonical Events & 34 Public Upcoming Events

| Scope | Total Events | `VERIFIED_OFFICIAL` | `VERIFIED_AUTHORIZED_SELLER` | Total Verified Working Images (`HTTP 200`, `image/*`) | `BROKEN` (Honest Fallback) | `SOURCE_LINK_ONLY` (Honest Fallback) | `MISSING` (Quarantined Seed) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **All 63 Canonical Events (`neondb`)** | **63** | **5** | **23** | **28 (44.4%)** | **5** | **21** | **9** |
| **All 34 Unique Public Upcoming Events** | **34** | **3** | **21** | **24 (70.6%)** | **4** | **6** | **0** |

---

## 3. Instagram & Blocked Ticketing Platform Fallback Workflow (`W4.2`)

1. **Curated Official Watchlist (`src/discovery/SourceRegistry.js`)**:
   - Registers 80+ verified official Indonesian promoter, festival, and artist Instagram handles (`@pkentertainment.id`, `@ismayalive`, `@ravelentertainment`, `@soundrhythm`, `@plainsonglive`, `@akselerasi.ent`, `@lalalafest`, `@djakarta_warehouse_project`, `@synchronizefest`, `@pestapora`, `@prambananjazz`, `@standupindo`, `@comika.id`, etc.).
2. **Candidate Submission & Review Queue (`src/discovery/discoveryRouter.js` & `MarketSupplyExpansionService.js`)**:
   - Events discovered via social announcements or blocked platforms (`Tiket.com`, `Traveloka`, `GOERS`) enter the pipeline with `verification_status: 'UNVERIFIED'` and `image_status: 'NEEDS_REVIEW'` (or `SOURCE_LINK_ONLY`) and are surfaced on `GET /api/discovery/supply/review-queue` and `GET /api/admin/trust/event-supply`.
3. **Strict Verification Gate (`EventVerificationService.js` & `EventVisualProvenanceService.js`)**:
   - Neither event identity nor event poster is marked verified from an uncorroborated social account alone.

---

## 4. Honest Telemetry Guarantee (`W4.3`)

In `src/discovery/EventIngestionScheduler.js` (`runChunkedDiscoveryJob` & `runImageHealthCheckChunk`):
- Every polled source records an explicit entry in `summary.source_outcomes` with `status` (`SCANNED_OK`, `DATA_UNAVAILABLE`, `BLOCKED`, `ERROR`, `TIMEOUT`).
- Bounded image health checks (`JOB_TYPES.IMAGE_HEALTH_CHECK`) verify `HTTP 200` + `Content-Type: image/*` and transition dead image URLs (`404`/`410`) to `image_status = BROKEN` (`image_url: null`, `broken_image_url` preserved) without ever cancelling, archiving, or un-verifying an active event.
