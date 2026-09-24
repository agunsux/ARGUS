# TIKUM — OFFICIAL EVENT SUPPLY PIPELINE
**Audited Source-to-Surface Pipeline for Verified Upcoming Events**  
**Version:** 1.0.0  
**Compliance Authority:** SHINERVA HQ Core Infrastructure

---

## 1. Purpose

This document specifies how TIKUM (`https://tikum.app`) populates its public **Upcoming
Events** surface from official event channels, with reconstructable evidence for every claim
and **zero live network access during request handling**.

```
[AUDITED SOURCES] --out-of-band--> [SNAPSHOT + EVIDENCE] --boot--> [INGESTION PIPELINE]
        --> [VERIFIED CANONICAL EVENTS] --> [/api/events · home-feed · /events/:slug]
```

---

## 2. Source Audit Matrix (executed 2026-09-24)

| Source | robots.txt | Live probe result | Decision |
| :--- | :--- | :--- | :--- |
| `livenation.asia` (`@livenationasia`) | Disallows only `/myln /subscription /account /culture /health /login /register` | HTTP 200; per-event blocks (`href`, `dateTime`, city, venue, title) + poster CDN | **PERMITTED_CRAWL** |
| `loket.com` | `User-agent: *` → `Allow: /` | HTTP 200; event detail pages embed `schema.org/Event` JSON-LD (name, start/end + tz, location, image, IDR price range, organizer) | **PERMITTED_CRAWL** |
| `bbo.co.id` | `User-agent: *` → `Disallow:` (empty ⇒ permitted) | HTTP 200; server-rendered event cards (poster on `storage.googleapis.com/bbo-images`, day/month, title) | **PERMITTED_CRAWL (observations only)** |
| `goersapp.com` | Permissive | `/events` + `sitemap.xml` → **HTTP 403** (Cloudflare WAF); homepage SPA shell | **PARTNER FEED ONLY** |
| `tiket.com` | Permissive + official sitemaps | `/en-id`, `/id-id/to-do`, sitemap, `llms.txt` → **HTTP 403** | **PARTNER FEED ONLY** |
| `artatix.co.id` | `robots.txt` → 404 | `/explore` is a Next.js SPA: zero server-rendered event data | **PARTNER FEED ONLY** |
| `ticketmaster.asia` (`@ticketmasterasia`) | — | DNS does not resolve; `ticketmaster.sg` → **HTTP 401** | **API KEY REQUIRED** |
| `instagram.com/*` (`@infokonser`, `@livenationasia`, `@ticketmasterasia`) | n/a | Login-gated; Meta ToS prohibit automated collection | **TIER 3 SIGNAL ONLY — never crawled** |

> **Non-negotiable:** no CAPTCHA/WAF bypass, no login, no private endpoints, no proxy rotation,
> no header masquerading. A WAF `403` is treated as an absolute technical barrier.

---

## 3. Evidence Model

Every snapshot record carries two independently verifiable evidence chains:

| Field | Meaning |
| :--- | :--- |
| `discovery_source_id` / `discovery_source_url` | Where the event was first observed (Tier 1 promoter or Tier 2 platform) |
| `discovery_evidence_hash` | SHA-256 of the raw response that produced the claim |
| `authoritative_source_id` / `authoritative_source_url` | The official **Indonesian authority** channel (promoter / organizer / official event website) |
| `authoritative_evidence_hash` | SHA-256 of the authority page response |
| `corroboration_result` | `AUTHORITATIVE_TOKENS_VERIFIED` only when every required factual token is present |
| `image_url` / `image_source_type` / `image_source_url` / `image_credit` | Official poster with provenance and attribution |

**Fail-closed rule:** if the authority page cannot be fetched, or any expected factual token is
missing, the record is downgraded to `DISCOVERY_ONLY`. Discovery-only records are retained for the
operator verification queue and can **never** appear publicly.

**Explicit corroboration rules** live in `src/discovery/OfficialEventSnapshotBuilder.js`
(`EVIDENCE_RULES`). Each rule names the authority source, the evidence URL and the factual tokens
that must be present. There is no fuzzy matching and no fabricated data.

---

## 4. Runtime Architecture

| Component | Responsibility |
| :--- | :--- |
| `scripts/refresh_official_event_snapshot.js` | Out-of-band CLI: refreshes the snapshot (staged or full) |
| `src/discovery/OfficialEventSnapshotBuilder.js` | Allow-listed polite crawler, parsers, corroboration rules, snapshot assembly |
| `src/discovery/fixtures/official_event_snapshot.json` | Committed snapshot: corroborated records + discovery-only observations |
| `src/discovery/fixtures/social_discovery_signals.json` | Tier 3 ledger for the registered Instagram handles |
| `src/discovery/OfficialSourceSnapshotStore.js` | Read-only snapshot accessor (fails closed, never throws) |
| `src/discovery/RealSourceSeedService.js` | Boot-time materialisation through the real ingestion pipeline |
| `src/discovery/adapters/{LoketAdapter,BboAdapter,LiveNationAdapter}.js` | Per-source parsers + snapshot-backed `discover()` |

### Bootstrap sequence

1. `initializeDatabase()` → `seedOfficialEventSupply()` (gated, see §5).
2. Per corroborated record:
   1. ingest **authoritative** claim → creates the canonical event with the official poster;
   2. ingest **discovery** claim → adds independent corroboration + official ticket destination;
   3. attach Tier 3 Instagram **discovery linkage** (provenance only, `can_verify: false`).
3. `EventTemporalLifecycleEngine.reconcileAllEvents()` then `canonicalRegistry.syncToState(state.events)`.

**Ordering invariant:** the authority claim is ingested first, because image provenance is resolved
at canonical-event creation and must therefore originate from the official Tier 1 channel.

### Public gate (enforced in `discoveryRouter.js` / `mvpRouter.js`)

```js
is_verified === true
  && verification_status ∈ { VERIFIED, PRIMARY_SOURCE_VERIFIED }
  && source_url && evidence_hash && verified_at
  && event_end_at > now
  && lifecycle ∉ { LIVE, COMPLETED, ARCHIVED, CANCELLED }
```

---

## 5. Configuration

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `ARGUS_REAL_SOURCE_SEED` | auto | `true` forces bootstrap seeding; `false` disables it |
| `VERCEL` / `NODE_ENV` | — | Seeding auto-enables on production/Vercel runtimes |
| `NODE_ENV=test` | — | Seeding is always disabled, preserving deterministic test baselines |
| `LOKET_FEED_URL`, `TIKET_COM_FEED_URL`, `GOERS_FEED_URL`, `ARTATIX_FEED_URL`, `TICKETMASTER_API_KEY` | unset | Activate the partner-feed / API paths where crawling is not permitted |

---

## 6. Operations

```bash
# Full refresh of every audited source, then write the snapshot
node scripts/refresh_official_event_snapshot.js

# Incremental / polite batched refresh (1.1s per-host spacing)
node scripts/refresh_official_event_snapshot.js --stage=loket
node scripts/refresh_official_event_snapshot.js --stage=ln --pages=lany-tickets-adp771408,the-weeknd-tickets-adp474869

# Inspect what would be published without writing the snapshot
node scripts/refresh_official_event_snapshot.js --dry-run

# Materialise the snapshot into canonical events and print the public catalogue
node scripts/seed_real_sources.js
node scripts/seed_real_sources.js --json

# Guard the discovery homepage markup + inline JS
node scripts/check_homepage_surface.js
```

---

## 7. Verified Supply (snapshot 2026-09-24, Indonesia scope)

| Event | Date | City / Venue | Discovery | Authority | Official poster |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Pestapora 2026 | 25–27 Sep 2026 | Jakarta — Gambir Expo / JIExpo Kemayoran | `src-loket` | `src-event-pestapora-web` | ✅ Pestapora |
| The Weeknd: After Hours Til Dawn Tour | 26 Sep 2026 | Jakarta — Jakarta International Stadium | `src-livenation` | `src-event-theweekndinjakarta-web` | ✅ TEM Presents |
| LANY: soft world tour — Night 1 | 29 Oct 2026 | Jakarta — Indonesia Arena, Senayan | `src-livenation` | `src-event-lanyinjakarta-web` | ✅ TEM Presents |
| LANY: soft world tour — Night 2 | 30 Oct 2026 | Jakarta — Indonesia Arena, Senayan | `src-livenation` | `src-event-lanyinjakarta-web` | ✅ TEM Presents |
| DWP 2026 | 11–13 Dec 2026 | Jakarta — JIExpo Kemayoran | `src-loket` | `src-event-dwp-web` | ✅ Ismaya Live |
| Maroon 5 Asia 2027 in Jakarta | 5 Feb 2027 | Jakarta — Jakarta International Stadium | `src-livenation` | `src-event-maroon5jakarta-web` | ✅ TEM Presents |

Most recent full sweep: **6 corroborated records / 13 discovery-only observations**.

Every public event additionally carries a Tier 3 Instagram discovery linkage
(`@infokonser` for LOKET-sourced events, `@livenationasia` for Live Nation-sourced events)
with `can_verify: false`.

### Known limitations (deliberate, fail-closed)

- **LOKET** listing surfaces are client-rendered, so only publicly linked event URLs are discovered.
  The full catalogue requires the LOKET partner feed.
- **BBO** cards publish day and month but never the calendar year; BBO records are therefore stored
  as observations and cannot be promoted until the year is independently resolved.
- **Instagram** discovery signals carry `capture_status: HANDLE_REGISTERED_NO_POST_CAPTURED` because
  no compliant post-level collection is possible. Operator-supplied post URLs (with a real
  `post_url`) will attach to the canonical event as provenance without ever granting verification.

---

## 8. Verification & Tests

| Test | Coverage |
| :--- | :--- |
| `test_real_source_upcoming_events.js` | 19 checks: snapshot integrity, seeding, public gate, poster provenance, Tier 3 invariant, home feed, detail surface, state projection |
| `test_real_event_supply.js` | Zero-fabrication contract for every commercial adapter path |
| `test_provenance_route_regression.js` | Public routes must never leak unverified events |
| `test_event_temporal_integrity.js` | No past/archived event may appear as Upcoming |
| `test_seo_domination.js` | Structured data, canonical tags, indexation gating |
| `scripts/check_homepage_surface.js` | Homepage inline-JS syntax + required structural hooks |

All suites pass with bootstrap seeding disabled under `NODE_ENV=test`, guaranteeing that the
deterministic zero-public-event baseline used by the regression suites is preserved.

