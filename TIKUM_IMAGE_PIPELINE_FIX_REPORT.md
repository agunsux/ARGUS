# TIKUM — EVENT IMAGE PIPELINE FIX REPORT (W0–W9 EXTENSION)

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Rollback Target:** `5d5a34517fbef55b23ad3be7e7ad18df83e94850` (`5d5a345`)

---

## 1. End-to-End 7-Stage Pipeline Diagnosis & Engineering Fixes

We traced and repaired every stage of the event image lifecycle:
`Authorized source -> adapter/discovery -> normalized event -> canonical database record -> API response -> frontend event card/detail -> browser image rendering`.

### Stage 1: Authorized Source & Provenance Registry (`src/discovery/fixtures/verified_event_image_provenance.json`)
- **Finding**:
  - `neondb` had 51 canonical events with `image_url = null`, and 12 events with `image_url` populated from `official_event_snapshot.json`, of which **7** pointed to synthetic `cdn.ruangevent.id` URLs returning `HTTP 404` (`text/html`).
  - Live verification against LOKET's public REST API (`https://rest.loket.com/fusio/api/v1/public/discover`), official event websites (`lalalafest.com`, `synchronizefestival.com`, `dwpfest.com`, `pestapora.com`, `themandalikagp.com`), and the official Boss Creator & VINDES concert poster for **King Nassar: Lost In The Jungle** (`/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg`, `281,882` bytes) confirmed **29** canonical/hero events (**25** upcoming + **4** archived) have authentic, reachable (`HTTP 200`, `Content-Type: image/*`) official or authorized-seller banners.
- **Fix**:
  - Created `src/discovery/fixtures/verified_event_image_provenance.json` storing SHA-256 evidence hashes, HTTP status (`200`), `Content-Type` (`image/jpeg`, `image/png`, `image/webp`), `image_source_url`, `image_source_type`, and `image_status` (`VERIFIED_OFFICIAL` / `VERIFIED_AUTHORIZED_SELLER`) for all **29** verified events (including `event-nassar-lost-in-the-jungle-2026`), plus explicit `known_broken_urls` entries for the 8 `HTTP 404` `cdn.ruangevent.id` URLs and 1 `text/html` URL.

### Stage 2: Source Adapters (`src/discovery/adapters/LoketAdapter.js`, `src/discovery/supply/LoketDiscoverySource.js`, `src/discovery/supply/OfficialEventDiscoverySource.js`)
- **Finding**:
  - `LoketAdapter.parse()` extracted `image_url` from `raw.banners.desktop` / `raw.banners.banner`, but did not populate `image_source_type`, `image_source_url`, `image_status`, or `image_credit`.
  - `OfficialEventDiscoverySource` had `LaLaLa Festival Jakarta 2027`, `MotoGP Mandalika 2026`, `DWP 2026`, and `Synchronize Festival 2026` without their verified `og:image` / official banner URLs, and needed `King Nassar: Lost In The Jungle` (`event-nassar-lost-in-the-jungle-2026`) with its official Boss Creator & VINDES poster.
- **Fix**:
  - Updated `LoketAdapter.js` and `LoketDiscoverySource.js` to attach `image_url`, `thumbnail_url`, `image_source_url`, `image_source_type: 'OFFICIAL_TICKETING'`, and `image_status: 'VERIFIED_AUTHORIZED_SELLER'`.
  - Updated `OfficialEventDiscoverySource.js` to attach HTTP-verified (`200`, `image/*`) official event banners (`VERIFIED_OFFICIAL`) for `King Nassar: Lost In The Jungle` (`/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg`), `LaLaLa Festival Jakarta 2027` (`https://lalalafest.com/images/og-image.webp`), `MotoGP Mandalika 2026` (`https://cdn.themandalikagp.com/storage/content/2025/05/22/1747884527_82a621adba2b63c248f3.webp`), `DWP 2026` (`https://dwpfest.com/icons/richlink.jpg`), and `Synchronize Festival 2026` (`https://synchronizefestival.com/assets/images/main.png`), while honestly setting `image_status: 'SOURCE_LINK_ONLY'` (`image_url: null`) for events whose official page does not publish a direct poster URL (`Morgan Jay`, `Atsuko Okatsuka`, `Abdur Arsyad`, `Pandji Pragiwaksono`, `The Script 2027`, `Joyland Festival 2026`).

### Stage 3: Normalization & Supply Expansion (`src/discovery/models/DiscoveredEvent.js`, `src/discovery/supply/MarketSupplyExpansionService.js`)
- **Finding**:
  - **Root-Cause Bug**: `DiscoveredEvent.prototype.toCanonicalEventPayload()` stripped `this.image_url`, `this.thumbnail_url`, `this.image_source_url`, `this.image_source_type`, `this.image_verified_at`, and `this.image_status` when building the canonical payload for `upsertCanonicalEvent()`, and set `homepage_visibility` only for `P0`/`P1` events.
- **Fix**:
  - Updated `DiscoveredEvent.js` to normalize and preserve all image provenance fields at both top-level and inside `metadata` in `toCanonicalEventPayload()`, and set `homepage_visibility = true` for all verified Grade A/B events.
  - Updated `MarketSupplyExpansionService.js` so `classifyCandidate()` and `ingest()` preserve or upgrade `image_url` when a duplicate candidate carries a higher-priority verified image.

### Stage 4: Deduplication & Repository Persistence (`src/discovery/EventDeduplicationService.js`, `src/discovery/EventVisualProvenanceService.js`, `src/discovery/repository/PostgresCatalogRepository.js`, `src/discovery/repository/InMemoryCatalogRepository.js`)
- **Finding**:
  - `EventDeduplicationService.findDuplicateCandidate()` lacked a guard preventing upcoming future events (`LANY — Soft World Tour 2026-10-29`) from matching concluded/archived past events (`LANY: 'a beautiful blur' Tour 2026-10-06`).
  - `PostgresCatalogRepository.upsertCanonicalEvent()` could overwrite an existing verified image with `null` on partial updates, and `mapRowToEvent()` labeled broken `404` `cdn.ruangevent.id` URLs as `VERIFIED_AUTHORIZED_SELLER`.
- **Fix**:
  - Added anti-overmerge guard in `EventDeduplicationService.findDuplicateCandidate()` so upcoming future events never merge into concluded/archived past events, and added `EventDeduplicationService.mergeCanonicalPair(existing, incoming)` to merge `sources` and select the higher-priority verified image (`OFFICIAL_ORGANIZER` > `OFFICIAL_VENUE` > `AUTHORIZED_TICKET_SELLER`).
  - Added `getImageSourcePriorityRank()`, `selectPreferredImage()`, `resolveCatalogEventImageProvenance()`, `checkImageHealth()`, and `applyImageHealthResult()` to `EventVisualProvenanceService.js`.
  - Updated `PostgresCatalogRepository.js` and `InMemoryCatalogRepository.js` to preserve existing higher-priority verified images on upsert and resolve all 7 required `image_status` states (`VERIFIED_OFFICIAL`, `VERIFIED_AUTHORIZED_SELLER`, `SOURCE_LINK_ONLY`, `MISSING`, `BROKEN`, `BLOCKED_BY_SOURCE`, `NEEDS_REVIEW`) on hydration.

### Stage 5: Cold-Start Hydration & Public API Endpoints (`src/discovery/CanonicalEventRegistry.js`, `src/discovery/discoveryRouter.js`)
- **Finding**:
  - `ensureRegistryHydrated` in `src/discovery/discoveryRouter.js` only checked `if (canonicalRegistry.getAllEvents().length === 0)`. Because `src/database.js` synchronously seeded 26 unverified legacy events on module load, `getAllEvents().length` was `26`, skipping PostgreSQL hydration on serverless cold start.
  - `GET /events`, `GET /api/discovery/events`, and `GET /api/events/home-feed` did not share a single deduplication + image-enrichment helper.
- **Fix**:
  - Added `_hydratedFromRepo` tracking on `CanonicalEventRegistry` and updated `ensureRegistryHydrated` in `src/discovery/discoveryRouter.js` so PostgreSQL hydration always executes on cold start when `DATABASE_URL` is configured.
  - Added `deduplicateAndEnrichPublicEvents()` in `src/discovery/discoveryRouter.js` and wired it across `GET /events`, `GET /api/discovery/events`, `GET /api/events/home-feed`, `GET /events/:slug`, and `GET /api/discovery/events/:slugOrId`.

### Stage 6 & 7: Frontend UI Rendering & Scheduler Health Check (`public/index.html`, `src/discovery/EventSEOService.js`, `src/discovery/EventIngestionScheduler.js`)
- **Fix**:
  - Updated `public/index.html` (`renderPosterMedia`), `src/discovery/discoveryRouter.js` (`GET /events`), and `src/discovery/EventSEOService.js` (`GET /events/:slug`) to render `<img>` tags with `loading="lazy"`, `decoding="async"`, meaningful `alt` text (`"{event_name} — {venue_name}, {city}"`), `onerror` handlers that automatically reveal the clean branded fallback without broken browser image icons, and honest status text (`Poster Resmi Belum Tersedia · Sumber Terverifikasi`) when `image_url` is `null` or `BROKEN`.
  - Added `JOB_TYPES.IMAGE_HEALTH_CHECK` and `runImageHealthCheckChunk(options)` to `src/discovery/EventIngestionScheduler.js` to verify image reachability (`HTTP 200` + `Content-Type: image/*`) in bounded serverless chunks while strictly decoupling image failures from event lifecycle/verification status.
