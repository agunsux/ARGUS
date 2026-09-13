# TIKUM — EVENT SUPPLY ARCHITECTURE AUDIT
**Document ID:** `DOC-ESA-2026-001`  
**Target:** Event Supply Intelligence & Verified Ingestion Layer  
**Status:** Canonical Reference  

---

## 1. Executive Summary

This document establishes an exhaustive audit of the event data supply architecture in TIKUM (and underlying ARGUS engine). It details the current event flow, maps existing components and schema, identifies functional strengths and architectural gaps, and defines the boundary invariants between event intelligence and marketplace operations.

---

## 2. Current Event Flow Analysis

Before this Epic, the event lifecycle operated along the following pipeline:

```
[ EXTERNAL / SEED / SOCIAL POST ]
               │
               ▼
[ DISCOVERY ROUTER / SIGNAL SERVICE ]
               │
               ▼
[ NORMALIZATION SERVICE ]
   ├── Noise reduction (sponsor prefix removal)
   ├── Canonical venue and city mapping
   └── ISO datetime & timezone conversion
               │
               ▼
[ DEDUPLICATION & IDENTIFICATION ]
   ├── Source identifier match
   └── Token similarity & venue/date matching
               │
               ▼
[ CANONICAL EVENT REGISTRY ]
   ├── Generates slug (name-city-date)
   ├── Stores field_provenance & observations
   └── Evaluates confidence score
               │
               ▼
[ MARKETPLACE SYNC BRIDGE ]
   └── Mirrors canonical events into state.events (read-only)
               │
               ▼
[ SEO & PUBLIC LANDING ]
   ├── /events/:slug (SSR HTML + Schema.org JSON-LD)
   └── /sitemap.xml (dynamic sitemap generation)
```

---

## 3. Existing Components & Reuse Assessment

| Component | File Path | Existing Capabilities | Gaps Addressed in this Epic | Reusability |
| :--- | :--- | :--- | :--- | :--- |
| **`CanonicalEventRegistry`** | `src/discovery/CanonicalEventRegistry.js` | In-memory map of canonical events, slug routing, field provenance, sync to `state.events`. | Lacked explicit `expires_at` temporal TTL state, QR verification abstraction, and formal reconstructable provenance chain. | **Reused & Enhanced** |
| **`EventNormalizationService`** | `src/discovery/EventNormalizationService.js` | Title noise stripping, 20 standard event categories, Indonesian timezone normalization (WIB/WITA/WIT), canonical venue dictionary (GBK, JIS, ICE BSD, etc.). | Robust baseline. Needs integration with multi-day festival editions and linguistic normalization. | **Reused & Preserved** |
| **`EventVerificationService`** | `src/discovery/EventVerificationService.js` | Composite scoring (0-100), basic conflict detection on dates/venues. | Had permissive auto-verification defaults; lacked strict **fail-closed** states (`UNVERIFIED`), temporal expiry, and prohibited marketing claims ("100% verified"). | **Reused & Overhauled** |
| **`EventDeduplicationService`** | `src/discovery/EventDeduplicationService.js` | Token Jaccard similarity, deterministic name+venue+date keys. | Simplistic name+date fallback risked collapsing distinct events or missing venue/date relocations. Needs multi-factor heuristic engine. | **Reused & Upgraded** |
| **`EventIngestionPipeline`** | `src/discovery/EventIngestionPipeline.js` | 9-stage pipeline, in-memory telemetry, ring buffer logging. | Lacked input security sanitization (XSS, SSRF, prompt injection), restart-surviving idempotency, and explicit `EventConflict` entity creation. | **Reused & Hardened** |
| **`SourceRegistry`** | `src/discovery/SourceRegistry.js` | Registry of APMI promoters, venues, leagues, and discovery APIs. Basic health status. | Lacked explicit 3-tier hierarchy enforcement (Tier 1 vs 2 vs 3), granular error telemetry (parse errors, rate limit events), and circuit breaker isolation per source. | **Reused & Upgraded** |
| **`TechnicalSEOService`** | `src/seo/TechnicalSEOService.js` | Robots.txt generator, dynamic sitemap.xml. | Sitemap included unverified events as long as they were not `CANCELLED`. Needs strict indexability gating for `VERIFIED` events only. | **Reused & Gated** |
| **`EventSEOService`** | `src/discovery/EventSEOService.js` | SSR HTML generation, Schema.org JSON-LD (MusicEvent, SportsEvent), separated primary ticket box vs secondary resale box. | Rendered marketing badges without explicit QR verification limitation notice. Needs dynamic robots meta tags (`noindex` for unverified/conflicted/expired). | **Reused & Updated** |
| **`discoveryRouter`** | `src/discovery/discoveryRouter.js` | Public SSR pages, JSON APIs, admin endpoints, APMI directory. | Needs admin intelligence dashboard querying real database state for source health, conflicts, and provenance inspection. | **Reused & Extended** |
| **`database.js`** | `src/database.js` | In-memory ledger (`state.events`, `state.audit_logs`, `state.venues`). | Solid schema foundation. All transactional and payment tables remain completely untouched. | **Preserved 100%** |

---

## 4. Current Event Data Flow vs. Target Ingestion Flow

### Current Flow Gaps:
1. **Permissive Auto-Promotion:** Social posts from verified promoters previously bypassed secondary corroboration directly into canonical events without enforcing an explicit `UNVERIFIED` fail-closed gate when factual claims were incomplete.
2. **Sitemap Leakage:** Any event registered in `CanonicalEventRegistry` automatically entered `/sitemap.xml`, regardless of verification confidence.
3. **Absence of Input Security Barrier:** Ingested payloads were parsed as raw JSON without input sanitization against XSS, SSRF, or payload bombs.
4. **Fragile Deduplication:** Events sharing similar titles on the same date were vulnerable to false merges, while festival multi-day editions lacked structural representation.
5. **No Structured Conflict Model:** Source disagreements were logged as ad-hoc strings rather than first-class `EventConflict` domain entities with explicit resolution lifecycles.

### Target Flow (P0 Architecture):
```
EXTERNAL SOURCE / FEED / API / SOCIAL SIGNAL
                     │
                     ▼
       [ SECURITY SANITIZER (P0) ]
  (Stripping XSS, SSRF checks, payload depth)
                     │
                     ▼
     [ DATA QUALITY VALIDATOR (P0) ]
  (Temporal validity, schema completeness)
                     │
                     ▼
    [ SOURCE ADAPTER LAYER (Tiers 1-3) ]
  (Rate limited, retry, circuit breaker)
                     │
                     ▼
    [ IMMUTABLE OBSERVATION STORAGE ]
 (Full provenance: what, when, where, whom)
                     │
                     ▼
     [ MULTI-FACTOR DEDUPLICATION ]
  (Deterministic identifier, lineup, temporal)
                     │
                     ▼
          [ CANONICAL EVENT ]
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
[ TIER 1 VERIFICATION ]  [ CONFLICT ENGINE ]
    - Fail-closed            - EventConflict entity
    - verified_at            - Admin review queue
    - expires_at             - NOINDEX
    - NO absolute claims
         │
         ▼
[ SEO INDEXABILITY GATE ]
    - VERIFIED -> index, follow
    - UNVERIFIED / CONFLICTED / EXPIRED -> noindex
    - CANCELLED -> notice, noindex
         │
         ▼
[ READ-ONLY MARKETPLACE BRIDGE ]
    (Zero coupling to payments, escrow, or orders)
```

---

## 5. Non-Negotiable Invariants

1. **Zero Transaction Coupling:** Event discovery and verification are upstream intelligence services. Under no circumstances may this layer create seller listings, ticket inventory, orders, escrow locks, settlements, or dispute mutations.
2. **Zero Fabrication:** Neither event dates, venues, ticket prices, nor ticket availability may ever be guessed or hallucinated.
3. **Fail Closed:** In the absence of authoritative evidence, events remain `UNVERIFIED` and non-indexable.
4. **Evidence-Based Trust:** Trust is an output of verifiable evidence, not an arbitrary marketing label.
