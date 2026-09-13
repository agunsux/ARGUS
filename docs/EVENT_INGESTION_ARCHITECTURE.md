# TIKUM — EVENT INGESTION ARCHITECTURE SPECIFICATION
**Document ID:** `DOC-ARCH-2026-001`  
**Compliance Authority:** SHINERVA HQ Core Infrastructure  
**Version:** 1.0.0  
**Status:** Canonical System Design  

---

## 1. System Topology & Architectural Invariants

TIKUM's Event Supply Intelligence layer provides an authoritative, factual discovery engine for live events across Indonesia. It operates strictly upstream from transactional marketplace activities.

```
+-------------------------------------------------------------------------------+
|                         TIKUM EVENT SUPPLY TOPOLOGY                           |
+-------------------------------------------------------------------------------+
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
   [ TIER 1 SOURCES ]           [ TIER 2 SOURCES ]           [ TIER 3 SOURCES ]
  Official Promoters           Ticketing Platforms          Social Discovery Signals
  Official Venues              Licensed APIs                (Instagram, X, TikTok)
  Sports Leagues               Tourism Calendars            (DISCOVERY ONLY)
           │                            │                            │
           └────────────────────────────┼────────────────────────────┘
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |     STAGE 1: SECURITY BARRIER     |
                      |  - HTML Stripping / XSS Defense   |
                      |  - SSRF Domain & Protocol Check   |
                      |  - Payload Size & Depth Bounds    |
                      +───────────────────────────────────+
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |   STAGE 2: DATA QUALITY & SCHEMA  |
                      |  - Required Fields Completeness   |
                      |  - Indonesian Timezone Parsing    |
                      |  - Date Range & Sanity Assertion  |
                      +───────────────────────────────────+
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |   STAGE 3: NORMALIZATION ENGINE   |
                      |  - Title Noise & Sponsor Removal  |
                      |  - Canonical Venue / City Lookup  |
                      |  - 20 Standard Event Categories   |
                      +───────────────────────────────────+
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |   STAGE 4: RAW PROVENANCE CAPTURE |
                      |  - EventSourceObservation Created |
                      |  - SHA-256 Content Fingerprinting |
                      |  - Immutable Traceability Log     |
                      +───────────────────────────────────+
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |   STAGE 5: MULTI-FACTOR DEDUP     |
                      |  - Source External ID Match       |
                      |  - Lineup + City + Date Window    |
                      |  - Reschedule / Venue Move Match  |
                      |  - Ambiguous -> REVIEW_REQUIRED   |
                      +───────────────────────────────────+
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |   STAGE 6: CANONICAL EVENT MODEL  |
                      |  - Field Provenance Assignment    |
                      |  - Source Counter & Array Update  |
                      +───────────────────────────────────+
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
      +─────────────────────────────+       +─────────────────────────────+
      | STAGE 7: CONFLICT ENGINE    |       | STAGE 8: VERIFICATION      |
      | - Field Disagreement Check  |       | - Tier 1 Authority Precedence|
      | - EventConflict Persistence |       | - Temporal Freshness Window |
      | - Admin Queue Notification  |       | - Status (VERIFIED/UNVERIF) |
      +─────────────────────────────+       +─────────────────────────────+
                     │                                     │
                     └──────────────────┬──────────────────┘
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |   STAGE 9: SEO & SITEMAP GATEWAY  |
                      |  - VERIFIED -> /sitemap.xml (200) |
                      |  - UNVERIFIED/CONFLICT -> NOINDEX |
                      |  - CANCELLED -> Notice + NOINDEX  |
                      +───────────────────────────────────+
                                        │
                                        ▼
                      +───────────────────────────────────+
                      |     MARKETPLACE ISOLATION GATE    |
                      |  (Read-only projection to state)  |
                      |  - ZERO ticket inventory created  |
                      |  - ZERO payment / escrow coupling |
                      +───────────────────────────────────+
```

---

## 2. Stage-by-Stage Ingestion Pipeline

### Stage 1: Security Sanitization (`SecuritySanitizer`)
External payloads are treated as hostile, untrusted inputs:
- **XSS & Code Injection:** All text strings are stripped of HTML tags, scripts, and iframe injections.
- **SSRF Defense:** Ticket URLs and official links must match strictly `http:` or `https:` and resolve only to public internet hostnames. Internal network addresses (e.g., `127.0.0.1`, `10.0.0.0/8`, `169.254.169.254`, `localhost`) are rejected immediately.
- **Payload Depth & Size Bounds:** JSON payloads exceeding 512 KB or nesting deeper than 10 levels are rejected to protect against Denial-of-Service and memory exhaustion.

### Stage 2: Data Quality & Schema Validation (`EventDataQualityValidator`)
Validates structural integrity before ingestion:
- **Required Fields:** Event title and valid start date are mandatory.
- **Temporal Sanity:** Events cannot be set in the distant past (> 365 days ago) or beyond 5 years into the future without flagging for review.
- **Timezone Resolution:** Formats start and end times into ISO-8601 with explicit Indonesian timezones (`Asia/Jakarta` [WIB], `Asia/Makassar` [WITA], or `Asia/Jayapura` [WIT]).

### Stage 3: Normalization Engine (`EventNormalizationService`)
- Standardizes titles by stripping sponsor prefixes (e.g. *"BRI Liga 1: "*), tour slogans, and redundant matchday annotations.
- Resolves colloquial venue and city names to canonical entities (e.g. *"Stadion GBK Senayan"* $\rightarrow$ *"Gelora Bung Karno (Main Stadium)"*, *"Jakarta"*).
- Categorizes events into one of 20 canonical categories (e.g., `CONCERT`, `FESTIVAL`, `FOOTBALL`, `BASKETBALL`, `COMEDY`, `THEATER`).

### Stage 4: Raw Provenance Capture (`EventSourceObservation`)
- Generates an immutable snapshot containing raw title, venue, date, ticket URL, source metadata, and SHA-256 fingerprint.
- Preserves full audit traceability: who reported the event, when, and under what source terms.

### Stage 5: Multi-Factor Deduplication (`EventDeduplicationService`)
Evaluates whether incoming observations match existing canonical events:
1. **Source Identifier Match:** Exact match on external platform ID.
2. **Canonical Slug & Venue ID:** Exact match on normalized slug and venue identifier.
3. **Lineup & Temporal Window:** Match on core artist/lineup and event date in the same city.
4. **Reschedule & Move Detection:** Identifies date changes or venue moves from the same organizer without spawning duplicate canonical records.
5. **Review Gate:** Ambiguous matches (similarity 40%-70%) are tagged as `REVIEW_REQUIRED` and held in quarantine.

### Stage 6: Canonical Event Entity Generation (`CanonicalEventRegistry`)
- Maps normalized fields to the canonical event model.
- Maintains complete field-level provenance tracking which source contributed each attribute.

### Stage 7: Conflict Resolution (`EventConflict`)
- Compares incoming claims with existing canonical data.
- If two sources of equal tier disagree on date, venue, or status, the system spawns an `EventConflict` record and flags the event as `CONFLICTED`.
- Never silently overwrites data.

### Stage 8: Fail-Closed Verification Engine (`EventVerificationService`)
- Evaluates evidence:
  - Tier 1 Authoritative Source $\rightarrow$ `VERIFIED` or `PRIMARY_SOURCE_VERIFIED`.
  - Tier 2 / Tier 3 only $\rightarrow$ `UNVERIFIED` (pending Tier 1 corroboration).
  - Stale verification ($> 14$ days without fresh authoritative corroboration) $\rightarrow$ `EXPIRED`.
- Never generates "100% verified" claims.

### Stage 9: SEO & Public Indexation Gating (`TechnicalSEOService`)
- Strict gatekeeper: **Only `VERIFIED` events are placed into `/sitemap.xml` and served with `<meta name="robots" content="index, follow">`.**
- `UNVERIFIED`, `CONFLICTED`, `EXPIRED`, and `CANCELLED` events receive `<meta name="robots" content="noindex, follow">` to protect search engine trust.

---

## 3. Marketplace Firewall Guarantee

TIKUM strictly separates event discovery from ticket commerce:
- Canonical events describe real-world occurrences (who is performing, where, and when).
- Marketplace listings represent individual secondary seller offers created by authenticated users.
- Ingesting 10,000 events creates **ZERO** ticket listings, **ZERO** orders, and **ZERO** payment records.
- Secondary sellers may attach listings to verified canonical events only through explicit user listing flows.
