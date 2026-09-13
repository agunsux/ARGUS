# TIKUM — EVENT SOURCE REGISTRY SPECIFICATION
**Document ID:** `DOC-REG-2026-001`  
**Compliance Authority:** SHINERVA HQ Core Infrastructure  
**Version:** 1.0.0  
**Status:** Canonical System Design  

---

## 1. Registry Overview

The `SourceRegistry` serves as the centralized authority directory for all external entities providing event information to TIKUM. Every incoming observation must link to a recognized, active record in this registry.

---

## 2. Source Schema Definition

```typescript
interface EventSourceRecord {
  source_id: string;               // Unique primary key (e.g. 'src-promoter-pk-ent')
  name: string;                    // Formal display name
  type: SourceType;                // OFFICIAL_PROMOTER, OFFICIAL_VENUE, TICKETING_PLATFORM, etc.
  tier: 1 | 2 | 3;                 // 1: Authoritative, 2: Trusted Commercial, 3: Discovery Signal
  authority_level: 'HIGH' | 'MEDIUM' | 'LOW';
  country: string;                 // e.g. 'Indonesia'
  language: string;                // e.g. 'id', 'en'
  base_url: string;                // Canonical base URL
  adapter: string;                 // Name of adapter handling this source (e.g. 'PromoterAdapter')
  access_method: AccessMethod;     // AUTHORIZED_API, FEED, PERMITTED_CRAWL, MANUAL_REVIEW
  terms_reference: string;         // Compliance reference string
  robots_policy: string;           // e.g. 'HONOR_ROBOTS_TXT_DISALLOW'
  active: boolean;                 // Operational toggle
  health_status: HealthStatus;     // HEALTHY, DEGRADED, FAILING, CIRCUIT_OPEN
  
  // Real Database Telemetry (Zero Mocks)
  telemetry: {
    successful_fetches: number;
    failed_fetches: number;
    parse_failures: number;
    schema_failures: number;
    rate_limit_events: number;
    last_success: string | null;   // ISO-8601
    last_failure: string | null;   // ISO-8601
    average_latency_ms: number;
    events_discovered: number;
    events_changed: number;
    events_rejected: number;
    source_freshness: string | null;
  };

  circuit_breaker: {
    status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    consecutive_failures: number;
    cooldown_until: string | null;
  };
  
  notes: string;
}
```

---

## 3. Initial Catalog & Integration Status

| Source ID | Name | Tier | Type | Adapter | Operational Status |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `src-assoc-apmi` | APMI (Asosiasi Promotor Musik Indonesia) | 1 | Association | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-promoter-boss-creator` | Boss Creator (Pestapora) | 1 | Promoter | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-promoter-antarasuara` | Antarasuara (Sheila On 7 Tour) | 1 | Promoter | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-promoter-pk-ent` | PK Entertainment (Coldplay, Ed Sheeran) | 1 | Promoter | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-promoter-ismaya` | Ismaya Live (DWP, We The Fest) | 1 | Promoter | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-promoter-sound-rh` | Sound Rhythm | 1 | Promoter | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-promoter-otello-asia` | Otello Asia | 1 | Promoter | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-promoter-plainsong` | Plainsong Live (Joyland Festival) | 1 | Promoter | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-venue-gbk` | PPK GBK (Gelora Bung Karno) | 1 | Venue Authority | `VenueAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-league-ibl` | IBL Indonesia (Basketball League) | 1 | Sports Org | `VenueAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-argus-verified-seed` | ARGUS Verified Seed Fixture | 1 | Curated Seed | `PromoterAdapter` | **IMPLEMENTED & ACTIVE** |
| `src-tiket-com` | tiket.com | 2 | Ticketing Platform | `TiketComAdapter` | **READY (PASSIVE / FIXTURE)** |
| `src-loket` | LOKET | 2 | Ticketing Platform | `LoketAdapter` | **READY (PASSIVE / FIXTURE)** |
| `src-goers` | GOERS | 2 | Ticketing Platform | `GoersAdapter` | **READY (PASSIVE / FIXTURE)** |
| `src-disc-bandsintown` | Bandsintown API | 2 | Discovery API | `EventSourceAdapter` | **READY (PASSIVE / FIXTURE)** |
| `src-ticketmaster` | Ticketmaster Developer API | 2 | Ticketing Platform | `TicketmasterAdapter`| **REQUIRES AUTHORIZED KEY** |
| `src-livenation` | Live Nation Global Tours | 1 | Promoter | `LiveNationAdapter` | **UNSUPPORTED / MANUAL ONLY** |
| `src-promoter-social-signal`| Verified Promoter Instagram | 3 | Social Channel | `SocialDiscoveryAdapter` | **IMPLEMENTED (SIGNAL ONLY)**|
| `src-community-submission` | TIKUM User Submission | 3 | Community | `EventSourceAdapter` | **MANUAL REVIEW ONLY** |

---

## 4. Circuit Breaker & Health Rules

- **Tripping Threshold:** 3 consecutive fetch, parse, or connection errors trigger circuit state `OPEN`.
- **Cooldown Window:** When `OPEN`, the source is isolated for **15 minutes** before transitioning to `HALF_OPEN`.
- **Half-Open Probe:** A single canary request is dispatched. If successful, the circuit resets to `CLOSED`; if failed, it reopens for **30 minutes**.
- **Rate Limit Defense:** If HTTP 429 is encountered, the adapter halts requests for that source for the duration specified in the `Retry-After` header (or 60 seconds by default).
