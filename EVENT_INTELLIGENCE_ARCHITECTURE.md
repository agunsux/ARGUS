# TIKUM — EVENT INTELLIGENCE ARCHITECTURE
**Architecture Design Document (ADD)**  
**Target:** Indonesia-First Multi-Source Event Discovery & Verification Engine  
**Status:** Approved for Production  
**Document Version:** 1.0.0

---

## 1. Architectural Mission: "Follow the Promoter, Not the Ticketing Platform"

TIKUM operates on a fundamental market reality in Indonesia: **the promoter is the origin of the event**. 

Promoters frequently break news, dates, venues, presale schedules, reschedules, and cancellations on their verified official Instagram channels long before static websites or ticketing platforms update.

TIKUM's Event Intelligence Engine enforces an exact four-tier authority hierarchy:

```
+-------------------------------------------------------------------------+
|                  TIKUM 4-TIER EVENT INTELLIGENCE HIERARCHY              |
+-------------------------------------------------------------------------+

[ 1. PRIMARY EVENT SOURCES — TIER S ]
  - Verified Official Promoter Instagram (@antara.suara, @boss.creator, etc.)
  - Verified Official Promoter Website / Event Portal
  Authority: CAN directly create & update Canonical Events (PRIMARY_SOURCE_VERIFIED)

[ 2. CORROBORATING SOURCES — TIER S / TIER A ]
  - Official Venue Authority (PPK GBK, JIExpo, ICE BSD)
  - Official Artist / Tour Management
  - Official Festival Channel
  - APMI (Promoter Identity & Accreditation Authority)
  - Authorized Ticketing Platform Catalog
  - Licensed Event Discovery APIs (Bandsintown, Eventbrite)
  Authority: Confirms bookings, validates promoter accreditation, adds secondary signals

[ 3. TRANSACTION SOURCE ]
  - Official Ticketing Platform URL (Loket, tiket.com, GOERS)
  Authority: Destination for ticket purchase, face-value tiers, and availability status

[ 4. DISCOVERY SIGNALS ]
  - Unverified social accounts, search engines, news media, community posts
  Authority: Event candidate detection only (requires primary source verification)
```

```
       +-------------------------------------------------------------+
       |             VERIFIED OFFICIAL PROMOTER INSTAGRAM            |
       |                (TIER S PRIMARY EVENT SOURCE)                |
       +-------------------------------------------------------------+
                                      │
                                      ▼
                        [ Event Ingestion Pipeline ]
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │ (Corroboration)            │ (Corroboration)            │ (Transaction Link)
         ▼                            ▼                            ▼
+------------------+         +------------------+         +------------------+
| Official Venue   |         | Official Artist  |         | Official Ticket  |
| (GBK, ICE BSD)   |         | & APMI Roster    |         | Partner (Loket)  |
+------------------+         +------------------+         +------------------+
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      │
                                      ▼
                    +-----------------------------------+
                    |         CANONICAL EVENT           |
                    |  - Status: PRIMARY_SOURCE_VERIFIED|
                    |  - Field-Level Provenance         |
                    |  - Field-Aware Confidence         |
                    +-----------------------------------+
```
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+-------------------------------+                         +-------------------------------+
|    CANONICAL EVENT STORAGE    |                         |   EVENT PROVENANCE LEDGER     |
|  - Canonical Event Facts      |                         |  - Source Observations        |
|  - Normalized Name & Venue    |                         |  - Audit History / Diffs      |
|  - Verification Confidence    |                         |  - Source Conflicts           |
|  - Official vs Resale Links   |                         |  - Content Hash Checksums     |
+-------------------------------+                         +-------------------------------+
         |                                                         |
         +----------------------------+----------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+-------------------------------+                         +-------------------------------+
|   PUBLIC SEO & DISCOVERY UI   |                         |  MARKETPLACE LISTING ATTACH   |
|  - SSR Canonical Pages        |                         |  - Strict Event Validation    |
|  - City & Category Guides     |                         |  - Instant Invalidation upon  |
|  - Historical Archive Hub     |                         |    Official Cancellation      |
|  - Schema.org JSON-LD Meta    |                         |  - Zero Unverified Listings   |
+-------------------------------+                         +-------------------------------+
```

---

## 2. Ingestion & Provenance Architecture

### 2.1 The Seven Storage Layers
To guarantee auditable answers to critical trust questions (*"Why do we believe this event exists?", "Where did this date come from?", "What changed?"*), data storage is strictly partitioned into 7 distinct collections:

1. **Source Registry (`source_registry`):**
   Defines registered data feeds, their permissions, rate limits, sync frequencies, and circuit-breaker telemetry.
2. **Event Source Observations (`event_source_observations`):**
   Immutable raw observation logs from each individual source. Stores source URL, exact observed fields, retrieved timestamp, content hash, and observation confidence.
3. **Canonical Events (`canonical_events`):**
   The single source of truth containing reconciled facts (name, artists, venue, dates, official ticket links, verification status, and confidence score).
4. **Event Changes (`event_changes`):**
   Field-level diff records capturing changes detected across sync runs (`field_changed`, `old_value`, `new_value`, `source_id`, `detected_at`).
5. **Event Status History (`event_status_history`):**
   Auditable log of status transitions (e.g. `ANNOUNCED` $\rightarrow$ `ON_SALE` $\rightarrow$ `COMPLETED` $\rightarrow$ `ARCHIVED`), including date changes for rescheduled events.
6. **Event Conflict Register (`event_conflicts`):**
   Explicit tracking of inter-source contradictions (e.g., promoter vs ticket platform date mismatch), preventing automatic publishing of corrupted facts.
7. **Event Archive (`event_archive`):**
   Permanent historical catalog of completed and past events, preserved for SEO indexing, historical price discovery, and venue operations reference.

---

## 3. Entity Resolution & Deduplication Pipeline

When multiple sources announce the same event using different naming conventions (e.g., *"Bruno Mars Live in Jakarta 2026"* vs *"Bruno Mars World Tour Jakarta"* vs *"Bruno Mars — GBK"*):

### 3.1 The Deterministic Fingerprint
Before any fuzzy matching or probabilistic logic runs, every event computes an exact deterministic fingerprint:

$$\text{Fingerprint} = \text{normalized\_artist} \mathbin{\Vert} \text{normalized\_name} \mathbin{\Vert} \text{venue\_id} \mathbin{\Vert} \text{city} \mathbin{\Vert} \text{start\_at}$$

1. **Step 1: Noise & Sponsor Stripping:**
   - Strips title noise (e.g., tournament sponsors `BRI Liga 1:`, `Pegadaian Liga 2:`, `Live in Jakarta`, `Official Tickets`, `[OFFICIAL]`).
   - Normalizes versus indicators (`v`, `v.`, `VS` $\rightarrow$ `vs`).
2. **Step 2: Canonical Venue & City Normalization:**
   - Evaluates aliases against the Indonesian Venue Registry (`gbk`, `gelora bung karno senayan`, `sugbk` $\rightarrow$ `Gelora Bung Karno (Main Stadium)`, Jakarta).
   - Validates Indonesian province and timezones (`WIB` for Java/Sumatra, `WITA` for Bali/Sulawesi/Kalimantan, `WIT` for Maluku/Papua).
3. **Step 3: Exact Fingerprint Lookup:**
   - If exact fingerprint matches an existing canonical event, the observation is linked immediately without mutation of immutable facts.

### 3.2 Secondary Corroboration & Explainable Merge
If the fingerprint does not match exactly:
- **Artist Overlap Check:** Same primary artist + same venue + same date $\rightarrow$ Match candidate with high confidence ($90\%+$).
- **Token Set Jaccard Similarity:** Overlap $\ge 0.50$ between title tokens on same venue + date $\rightarrow$ Corroborated.
- **Explainability Requirement:** Every merge emits a structured merge explanation logged to `audit_logs` and observation records. AI or fuzzy heuristics are **never** permitted to execute silent, unexplainable merges.

---

## 4. Multi-Source Conflict Arbitration

When two independent sources disagree on event facts:
```
                CONFLICT DETECTED (e.g. Date or Venue Mismatch)
                                        |
                 +----------------------+----------------------+
                 |                                             |
Tier S vs Tier B (e.g. Promoter vs Listing)   Tier S vs Tier S (e.g. Promoter vs Venue)
                 |                                             |
                 v                                             v
Higher-Tier Authority Prevails Deterministically      Halt Automatic Reconciliation
Canonical Record adopts Tier S fact.                  Status := DATA_CONFLICT
Observation retained with precedence note.            Admin Trust Officer Alert Triggered
Verification Confidence := High                       Public Warning Displayed
```

### Hierarchy of Authority
1. **Tier S (1.00 - 0.92):** Official Promoter, Official Venue Authority, Official Artist Tour Site, Authorized Primary Ticketing Partner API.
2. **Tier A (0.85 - 0.80):** Licensed discovery APIs (Bandsintown, Eventbrite partner feeds).
3. **Tier B (0.65 - 0.50):** Public tourism board listings, validated news wires, verified official social feeds.
4. **Tier C (0.30 - 0.00):** Secondary listings, resale pages, community forum mentions. **Tier C never overrides or sets canonical truth.**

---

## 5. Circuit Breaker & Reliability Architecture

External data feeds can fail, throttle, or return invalid schemas. TIKUM isolates every external source using standard resilience patterns:

```
[ CLOSED ] --(3 consecutive failures)--> [ OPEN ]
     ^                                       |
     |                                (30 min cooldown)
     |                                       |
     +-----(1 successful probe)------ [ HALF_OPEN ]
```

1. **Exponential Backoff:** Retries on $2^n \times 1000\text{ ms}$ with a maximum of 3 attempts.
2. **Circuit Breaker:** After 3 consecutive network or schema failures, the source is marked `DEGRADED` / `OPEN` and throttled for a 30-minute cooldown.
3. **Graceful Degradation:** A source outage **never** deletes, corrupts, or invalidates previously verified canonical events.

---

## 6. Integration with TIKUM Marketplace (Non-Negotiable Safety)

1. **Marketplace Invariant Bridge (`syncToState`):**
   Canonical events are continuously synchronized into `state.events`. Existing `ListingService`, `OrderService`, and escrow calculation modules interact with canonical events without requiring modification to their internal interfaces.
2. **Event Cancellation Cascade:**
   When an event is officially marked `CANCELLED` by the Event Intelligence Engine:
   - All active resale listings linked to that `event_id` are transitioned to `CANCELLED`.
   - Sellers are notified with the official cancellation reason.
   - Buyers with active orders are protected via the TIKUM Escrow refund guarantee.
3. **Rescheduled Event Stability:**
   The canonical `event_id` is preserved. `EventStatusHistory` records the date modification. Existing verified listings remain valid under the updated date unless sellers request withdrawal.
