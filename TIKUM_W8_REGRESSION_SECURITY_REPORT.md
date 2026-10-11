# TIKUM — W8: BILINGUAL, MARKETPLACE, IMAGE PIPELINE, FINANCIAL ISOLATION & SECURITY REGRESSION REPORT

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Previous Rollback Target:** `5d5a34517fbef55b23ad3be7e7ad18df83e94850` (`5d5a345`)

---

## 1. Financial, Escrow, Order & Payment Isolation Proof (`W8.3` & Section 0)

Per the strict safety boundary in Section 0 and Section 8.3:
> *"Do not modify payment, order, escrow, webhook, settlement, dispute, or financial-ledger files while working on discovery/catalog/scheduler tasks."*

We inspected `git status --short` and `git diff --stat` to verify that **zero** financial, payment, order, escrow, webhook, settlement, dispute, or ledger files were touched:

| Modified / Added File in Working Tree | Domain / Subsystem | Touches Payment / Escrow / Order / Ledger / Auth? |
| :--- | :--- | :---: |
| `migrations/001_catalog_schema.sql` | Discovery Scheduler Schema (`discovery_scheduler_state`) | **NO** |
| `public/index.html` | Homepage Event Card Poster & Branded Fallback Rendering (`renderPosterMedia`) | **NO** |
| `src/database.js` | Discovery Cold-Start Hydration (`hydrateFromRepository` / `refreshFreshness`) | **NO** |
| `src/discovery/CanonicalEventRegistry.js` | Discovery Registry Hydration (`_hydratedFromRepo`) & Date-Clobber Protection | **NO** |
| `src/discovery/EventDeduplicationService.js` | Cross-Source Entity Resolution, Past-vs-Upcoming Guard & `mergeCanonicalPair` | **NO** |
| `src/discovery/EventIngestionScheduler.js` | Serverless Chunked Reconciliation, Durable Lease Lock & `IMAGE_HEALTH_CHECK` | **NO** |
| `src/discovery/EventNormalizationService.js` | Title, Artist Alias & Venue Normalization | **NO** |
| `src/discovery/EventSEOService.js` | Detail Page (`GET /events/:slug`) Verified Poster & Honest Fallback Rendering | **NO** |
| `src/discovery/EventVerificationService.js` | Dead-URL vs. Cancelled Safeguard (`SOURCE_URL_UNAVAILABLE` -> `STALE`) | **NO** |
| `src/discovery/EventVisualProvenanceService.js` | 7-State Image Provenance Classifier, Priority Selection & `checkImageHealth` | **NO** |
| `src/discovery/adapters/LoketAdapter.js` | LOKET Banner Provenance Extraction | **NO** |
| `src/discovery/discoveryRouter.js` | Cold-Start Hydration Fix, `deduplicateAndEnrichPublicEvents` & `/events` SSR Media | **NO** |
| `src/discovery/fixtures/verified_event_image_provenance.json` | HTTP-Verified (`200`, `image/*`) Official & Authorized-Seller Event Banner Registry | **NO** |
| `src/discovery/models/DiscoveredEvent.js` | `toCanonicalEventPayload` Image Provenance Preservation & `PRICE_PARTIAL` | **NO** |
| `src/discovery/repository/CatalogRepository.js` | Repository Lease Lock Interface | **NO** |
| `src/discovery/repository/InMemoryCatalogRepository.js` | In-Memory Lease Lock, Cursor & Verified Image Preservation | **NO** |
| `src/discovery/repository/PostgresCatalogRepository.js` | PostgreSQL Lease Lock, UTC+07:00 Date Fix, Zero-Fabrication Tiers & Image Provenance | **NO** |
| `src/discovery/supply/LoketDiscoverySource.js` | Tier-1 (`trust_score: 95`) Alignment, Null-Date Honesty & Banner Provenance | **NO** |
| `src/discovery/supply/MarketSupplyExpansionService.js` | Duplicate Candidate Image Upgrade & Preservation | **NO** |
| `src/discovery/supply/OfficialEventDiscoverySource.js` | Explicit `STATIC_CURATED_OFFICIAL_SEED` & Official Event Banner Provenance | **NO** |
| `test_image_pipeline_and_rendering.js` | 14-Gate End-to-End Image Pipeline & UI Rendering Acceptance Suite | **NO** |
| `test_real_source_upcoming_events.js` | Real-Source Upcoming Events & Honest Image Fallback Acceptance Suite | **NO** |
| `test_chunked_ingestion_and_staleness.js` | Automated Test Suite for Chunked Scheduler & Staleness | **NO** |
| `test_durable_catalog.js` | Automated Test Suite for Durable Catalog Repository | **NO** |
| `test_market_supply_expansion.js` | Automated Test Suite for Market Supply & Deduplication | **NO** |

- **`ENABLE_DOKU_PRODUCTION`**: Verified `false` (untouched).
- **Order / Escrow / Payment / Settlement / Dispute / Auth files modified**: **`0`**.

---

## 2. Complete Automated Test & Regression Matrix (19 Suites — 100% PASS)

All **19** image pipeline, visual forensic, bilingual, discovery, lifecycle, security, auth, and financial test suites were executed directly against the read-only `neondb` environment (`ARGUS_DB_READ_ONLY=true`) and passed with **0 failures**:

| # | Test Suite Command | Scope Covered | Assertions / Tests | Result |
| :---: | :--- | :--- | :---: | :---: |
| 1 | `node --env-file=.env.local test_image_pipeline_and_rendering.js` | **Section 8 Mandatory 14 Gates**: Adapter image extraction, `DiscoveredEvent` normalization, repository upsert image preservation, deduplication image priority (`OFFICIAL_ORGANIZER` > `OFFICIAL_VENUE` > `AUTHORIZED_TICKET_SELLER`), `SOURCE_LINK_ONLY` / `MISSING` honesty, `404` -> `BROKEN` fallback, `503`/timeout decoupled from event lifecycle, SSRF/scheme rejection, `/api/events/home-feed` & `/api/discovery/events` 34-event consistency (`24` verified `HTTP 200` `image/*` + `10` fallback), `/events/:slug` detail rendering, frontend `<img>` + `onerror` fallback, past/unverified exclusion | **14 / 14** | **PASS** |
| 2 | `node test_epic_image_verification_gate.js` | Visual Forensic Gate: entity normalization, multi-city/year/tribute collision guards, source hierarchy priority, wrong artist/festival/city/year image rejection, multi-night residency exception, `@infokonser` discovery gate, decoupled verification invariant | **32 / 32** | **PASS** |
| 3 | `node test_real_source_upcoming_events.js` | Snapshot integrity, real ingestion pipeline seeding, `/api/events` & `/api/events/home-feed` provenance, official image host allow-list, Tier 3 Instagram invariant, state projection | **19 / 19** | **PASS** |
| 4 | `node test_p0_6_image_rendering_and_performance.js` | Local placeholder SVG/PNG asset integrity, CLS prevention (`width`/`height`, `loading="lazy"`, `decoding="async"`), CSS layout containment | **13 / 13** | **PASS** |
| 5 | `node test_chunked_ingestion_and_staleness.js` | W6 & W7 Chunked serverless job (`limit=2`), cursor advancement, concurrent lock rejection, dead-link staleness demotion | **7 / 7** | **PASS** |
| 6 | `node test_market_supply_expansion.js` | W2–W5 Discovery pipeline, Rp300K/Rp500K price qualification, cross-source deduplication, LOKET & BBO parsing | **25 / 25** | **PASS** |
| 7 | `node test_durable_catalog.js` | W1 & W7 Durable catalog repository, idempotent upsert, provenance persistence, admin API key & cron lockdown | **13 / 13** | **PASS** |
| 8 | `node test_epic_event_discovery.js` | End-to-end discovery normalization, venue resolution, verification, and public feed gating | **11 / 11** | **PASS** |
| 9 | `node test_tikum_zero_fake_policy.js` | Zero-Fake Policy enforcement: unverified/synthetic events quarantined (`public_visibility = false`), verified events exposed | **13 / 13** | **PASS** |
| 10 | `node test_tikum_event_temporal_lifecycle.js` | W6 Temporal lifecycle (`UPCOMING`, `ON_SALE`, `LIVE`, `COMPLETED`, `ARCHIVED`), anti-resurrection invariant, active escrow protection | **19 / 19** | **PASS** |
| 11 | `node test_catalog_rescan_reconciliation.js` | W6 & W7 Rescan reconciliation, stale detection (`45`-day / proximity TTL), source-link preservation | **12 / 12** | **PASS** |
| 12 | `node test_i18n_bilingual_full_application.js` | W8.1 Bilingual (`id`/`en`) dictionary parity (`1,093` keys across `52` namespaces), zero raw keys, SSR & client surfaces | **11 / 11** | **PASS** |
| 13 | `node test_mvp_security.js` | W8.4 KYC enforcement, seller limits, duplicate barcode prevention, escrow release guard, audit log immutability | **7 / 7** | **PASS** |
| 14 | `node test_auth_security.js` | W8.4 Admin HTTP authorization boundary, Magic Link passwordless auth, rate limiting, open-redirect defense | **56 / 56** | **PASS** |
| 15 | `node test_durable_user_auth.js` | Durable user authentication, bcrypt cost-12 hashing, SHA-256 session tokens, concurrent session limits | **30 / 30** | **PASS** |
| 16 | `node test_durable_money_state.js` | W8.3 Financial state machine, concurrent reservation serialization, webhook replay deduplication, double-entry ledger balance | **13 / 13** | **PASS** |
| 17 | `node test_p0_trust_transaction_readiness.js` | W8.3 P0 trust, 4-provider payment gateway fail-closed lock, escrow freeze on dispute, barcode hashing, PIC privacy | **19 / 19** | **PASS** |
| 18 | `node test_canonical_fee_engine_v1.js` | W8.3 Canonical fee engine v1 (6% fee, Rp 10K floor, Rp 300K cap) and integer IDR precision | **20 / 20** | **PASS** |
| 19 | `node test_syntax_check.js` | Syntax validation across all **301** JS files in `src/` | **301 / 301** | **PASS** |
