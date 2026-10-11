# TIKUM — EVENT IMAGE RENDERING & UI ACCEPTANCE REPORT

**Date:** 2026-10-12 (WIB)
**Environment Verified:** Local Server connected to Neon PostgreSQL (`neondb`, Read-Only Mode `ARGUS_DB_READ_ONLY=true`)
**Automated Acceptance Suite:** `node --env-file=.env.local test_image_pipeline_and_rendering.js` (**14 / 14 PASS**)

---

## 1. Live Endpoint & UI Surface Verification

All public HTML and JSON surfaces were verified against the hydrated Neon PostgreSQL catalog + canonical hero concerts:

| Route / Endpoint | HTTP Status | Public Upcoming Events | With Verified Image (`HTTP 200`, `image/*`) | Honest Branded Fallback (`BROKEN` / `SOURCE_LINK_ONLY`) | Past / Unverified Leaked |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `GET /` (`public/index.html`) | `200 OK` | **35** (via `/api/events/home-feed`) | **25** (`4 VERIFIED_OFFICIAL` + `21 VERIFIED_AUTHORIZED_SELLER`) | **10** (`4 BROKEN` + `6 SOURCE_LINK_ONLY`) | **0** |
| `GET /events` (SSR Catalog Hub) | `200 OK` | **35** | **25** (`.catalog-card-media img`) | **10** (`.catalog-card-fallback`) | **0** |
| `GET /api/events/home-feed` | `200 OK` | **35** (`meta.total_verified_upcoming: 35`) | **25** | **10** | **0** |
| `GET /api/discovery/events` | `200 OK` | **35** (`total: 35`) | **25** | **10** | **0** |
| `GET /hero` + `GET /api/discovery/hero-concerts` | `200 OK` | **2** Hero Concerts | **2** (`/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg` + Ye LOKET banner) | — | **0** |
| `GET /events/king-nassar-lost-in-the-jungle-jakarta-2026` | `200 OK` | 1 (Detail SSR) | **1** (`/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg`, `VERIFIED_OFFICIAL`) | — | **0** |
| `GET /events/synchronize-festival-2026-jakarta` | `200 OK` | 1 (Detail SSR) | **1** (`https://synchronizefestival.com/assets/images/main.png`, `VERIFIED_OFFICIAL`) | — | **0** |
| `GET /events/lalala-festival-jakarta-2027-tangerang-2027-01-17` | `200 OK` | 1 (Detail SSR) | **1** (`https://lalalafest.com/images/og-image.webp`, `VERIFIED_OFFICIAL`) | — | **0** |
| `GET /events/dwp-2026-bali-2026-12-11` | `200 OK` | 1 (Detail SSR) | **1** (`https://dwpfest.com/icons/richlink.jpg`, `VERIFIED_OFFICIAL`) | — | **0** |
| `GET /events/men-i-trust-live-in-jakarta-2026-jakarta` | `200 OK` | 1 (Detail SSR) | **1** (`https://assets.loket.com/neo/production/images/banner/20260517111454_6a0940bed96d2.jpeg`, `VERIFIED_AUTHORIZED_SELLER`) | — | **0** |
| `GET /events/babymonster-see-you-there-choom-tour-jakarta-2026-tangerang` | `200 OK` | 1 (Detail SSR) | — | **1** (`BROKEN` -> `.event-poster-fallback` + official source link) | **0** |
| `GET /events/morgan-jay-this-one-s-for-you-tour-jakarta-2026-jakarta-pusat-2026-11-11` | `200 OK` | 1 (Detail SSR) | — | **1** (`SOURCE_LINK_ONLY` -> `.event-poster-fallback` + official source link) | **0** |

---

## 2. Frontend Rendering & Resilience Rules Verified (Section 6)

1. **No High-Resolution Gate**:
   - Low/medium-resolution official and authorized-seller banners (`og:image`, LOKET event banners, official site logos/banners) are accepted and rendered with `object-fit: cover` inside consistent aspect-ratio containers (`4:5` on homepage cards, `168px` fixed-height media header on `/events` SSR cards, `max-height: 420px` hero banner on `/events/:slug`).
2. **Broken Image Protection (`onerror` Swap)**:
   - Every `<img>` on `/`, `/events`, and `/events/:slug` includes:
     ```html
     loading="lazy" decoding="async"
     onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
     ```
   - If any remote CDN URL fails at runtime in the user's browser, the `<img>` hides immediately and reveals the sibling branded fallback card header without ever displaying a broken image icon or collapsing card layout.
3. **Honest Fallback Placeholder**:
   - Events with `image_status = SOURCE_LINK_ONLY` (6 upcoming events) or `image_status = BROKEN` (4 upcoming events) render a clean dark-slate branded fallback displaying the category icon, event title, venue/city, and honest status label (`Poster Resmi Belum Tersedia · Sumber Terverifikasi`) alongside the clickable official source/ticket link.
   - Neither API responses nor the UI ever claim that a fallback placeholder is a verified official poster (`is_fallback_image: true`, `image_url: null`).
4. **URL & SSRF Safety**:
   - `EventVisualProvenanceService.validateImageUrl()` strictly rejects `javascript:`, `data:`, `file:`, `localhost`, `127.0.0.1`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, and `169.254.169.254`.

---

## 3. Section 8 Automated Test Results (14 / 14 Gates Passed)

Executed via `node --env-file=.env.local test_image_pipeline_and_rendering.js`:

| Gate | Requirement Tested | Result |
| :---: | :--- | :---: |
| **T01** | Adapter extracts official/authorized `image_url` when present in source fixture (`LoketAdapter`, `OfficialEventDiscoverySource`) | **PASS** |
| **T02** | Normalization (`DiscoveredEvent -> toCanonicalEventPayload`) preserves `image_url`, `image_source_url`, `image_source_type`, and `image_status` | **PASS** |
| **T03** | Repository upsert/update preserves existing verified image when a weaker or `null` update arrives | **PASS** |
| **T04** | Deduplication merge keeps the higher-priority verified image (`OFFICIAL_ORGANIZER` > `OFFICIAL_VENUE` > `AUTHORIZED_TICKET_SELLER`) | **PASS** |
| **T05** | Event with no source image gets `image_status = SOURCE_LINK_ONLY` or `MISSING`, never a fabricated image | **PASS** |
| **T06** | Event with 404 image gets `image_status = BROKEN` and UI renders branded fallback placeholder | **PASS** |
| **T07** | Event with timeout/503 image failure keeps event `ACTIVE` and `VERIFIED` (strictly decoupled from event cancellation/archival) | **PASS** |
| **T08** | Invalid URL schemes (`javascript:`, `data:`, `file:`, `localhost`, private IPs) are strictly rejected | **PASS** |
| **T09** | `/api/events/home-feed` and `/api/discovery/events` return image fields consistently across all **35** public upcoming events (**25** verified `HTTP 200` `image/*`, **10** honest fallback) | **PASS** |
| **T10** | `/events/:slug` includes verified image or fallback metadata and official source link | **PASS** |
| **T11** | Frontend card renders `<img>` with `alt`, `loading="lazy"`, `decoding="async"`, and swaps to fallback on `onerror` | **PASS** |
| **T12** | Frontend card renders clean branded fallback when `image_url` is `null` or `BROKEN` | **PASS** |
| **T13** | Past/archived events (`Pestapora 2026`, `The Weeknd 2026`, `MotoGP 2026`) remain excluded from default public feed regardless of having verified images | **PASS** |
| **T14** | Unverified events remain excluded from default public feed even if they carry an image URL | **PASS** |
