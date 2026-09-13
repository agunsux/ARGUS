# TIKUM — EVENT SUPPLY THREAT MODEL & FRAUD SCENARIO CATALOG
**Document ID:** `DOC-THR-2026-001`  
**Compliance Authority:** SHINERVA HQ Trust & Security Infrastructure  
**Version:** 1.0.0  
**Status:** Canonical Extensible Catalog (Scalable to 300+ Scenarios)  

---

## 1. Overview & Threat Architecture

The TIKUM Event Supply Intelligence layer ingests, deduplicates, and verifies real-world event data. Because event data drives buyer discovery, SEO landing pages, and downstream ticket liquidity, the ingestion perimeter is subject to deliberate adversarial attacks, data poisoning, and upstream platform desynchronization.

This catalog establishes a formal, extensible taxonomy engineered to scale to **300+ fraud scenarios**. The 20 highest-priority P0 scenarios (`THR-001` through `THR-020`) are immediately implemented as automated regression tests in `test_event_supply_redteam.js`. Subsequent scenarios (`THR-021` to `THR-300+`) can be added declaratively using the standard scenario runner interface without architectural modifications.

---

## 1.1 P0.1 — Mandatory Distinction: Red-Team Tests vs. Fraud Threat Catalog

> [!IMPORTANT]
> **The 20 automated red-team scenarios (`THR-001` — `THR-020`) are the mandatory P0 acceptance/regression test suite.**
>
> **They are NOT the complete fraud threat catalog.**
>
> This document maintains a separate, living threat-model catalog capable of expanding to **300+ fraud scenarios** over time.
>
> The initial implementation covers the **20 highest-priority attack classes**.
>
> Future fraud scenarios MUST be convertible into automated tests **without redesigning the core architecture**.
>
> **20 = automated P0 acceptance tests**
> **300+ = evolving threat intelligence catalog**

---

## 2. Threat Classification Taxonomy (Classes A — G)

```
+-------------------------------------------------------------------------+
|                    EVENT SUPPLY THREAT TAXONOMY                         |
+-------------------------------------------------------------------------+
Class A: IDENTITY & IMPERSONATION
         Spoofed promoters, fake venue authorities, lookalike social handles.
Class B: TEMPORAL MANIPULATION
         Ghost dates, premature announcements, unannounced reschedules, reanimated events.
Class C: SPATIAL & GEO FRAUD
         Renamed venues, phantom halls, conflicting regional venues, multi-hall collisions.
Class D: TICKETING & PRIMARY PROVIDER FRAUD
         Phishing ticket URLs, secondary disguised as primary, fake ticketing partner claims.
Class E: CONTENT & DATA POISONING
         Malicious HTML/XSS, SSRF redirect loops, prompt injection, oversized payload bombs.
Class F: CROSS-SOURCE DESYNCHRONIZATION
         Split-brain dates, contradictory event status feeds, race condition ingestions.
Class G: STATE & AVAILABILITY TAMPERING
         Fake sold-out badges, false cancellation announcements, spoofed postponements.
```

---

## 3. Extensible Threat Registration Schema

Every scenario in this catalog conforms to the following standard specification:

```typescript
interface ThreatScenarioDefinition {
  threat_id: string;               // e.g. 'THR-001'
  threat_name: string;             // Short descriptive title
  threat_class: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  severity: 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';
  attack_vector: string;           // How the attack is executed
  blast_radius: string;            // Downstream consequences if unmitigated
  argus_defense_layer: string;     // Component enforcing prevention/mitigation
  expected_outcome: string;        // Safe failure or quarantine state
  automated_test_id: string;       // Linked test case in test_event_supply_redteam.js
}
```

---

## 4. P0 Mandatory Attack Suite (`THR-001` to `THR-020`)

The table below catalogs the 20 highest-priority attack classes implemented in the automated regression suite:

| Threat ID | Threat Name | Class | Severity | Attack Description | ARGUS Defense Layer | Expected Safe State |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **`THR-001`** | Multi-Source Convergence | F | P0 | 10 distinct sources ingest the same concert with slight variations. | `EventDeduplicationService` | Merges into 1 canonical event; creates 10 observations; zero duplicates. |
| **`THR-002`** | Linguistic Variation Attack | A | P1 | Same event reported in English, Indonesian, and colloquial abbreviations. | `EventNormalizationService` | Normalized to single canonical entity; no duplicate canonical events. |
| **`THR-003`** | Spatial Relocation (Venue Move) | C | P0 | Promoter moves concert to a larger stadium 3 weeks prior. | `CanonicalEventRegistry` | Updates canonical venue; records `VENUE_CHANGED` history; no duplicate. |
| **`THR-004`** | Temporal Displacement (Reschedule) | B | P0 | Promoter postpones tour to a new date next month. | `CanonicalEventRegistry` | Updates start date; flags `RESCHEDULED`; retains historical provenance. |
| **`THR-005`** | Lifecycle Invalidation (Cancellation)| B | P0 | Promoter cancels tour due to illness. | `EventVerificationService` | Transitions to `CANCELLED`; injects `noindex`; flags attached listings. |
| **`THR-006`** | Indefinite Delay (Postponement) | B | P1 | Event postponed without announced date. | `EventVerificationService` | Transitions to `POSTPONED`; sets `noindex`; clears deceptive dates. |
| **`THR-007`** | Duplicate Ingestion Restart | F | P0 | Identical batch ingested twice across worker process restarts. | `EventIngestionPipeline` | Content hash match suppresses duplicates; zero duplicate observations. |
| **`THR-008`** | Split-Brain Conflict | F | P0 | Promoter says Date A, Ticketing platform says Date B. | `EventConflict` | Spawns `EventConflict`; marks `CONFLICTED`; drops from sitemap. |
| **`THR-009`** | Upstream Fault Isolation | F | P1 | Remote provider returns HTTP 500 internal server error. | `EventSourceAdapter` | Error isolated to provider; circuit breaker increments; pipeline continues. |
| **`THR-010`** | Rate Quota Exhaustion | F | P1 | Upstream provider returns HTTP 429 Too Many Requests. | `EventSourceAdapter` | Exponential backoff triggered; respect retry-after; no crawler crash. |
| **`THR-011`** | Network Latency Boundary | F | P1 | Upstream request times out after socket hangup. | `EventSourceAdapter` | AbortController terminates cleanly; logs failure; pipeline safe. |
| **`THR-012`** | Payload Corruption & Truncation | E | P0 | Source returns malformed HTML or truncated JSON stream. | `SecuritySanitizer` | Parser boundary catches error; transitions to `REJECTED`; logs error. |
| **`THR-013`** | Social Gating Bypass Attempt | A | P0 | Unverified TikTok/Instagram account announces fake festival. | `EventVerificationService` | Tagged as Tier 3 `DISCOVERY_SIGNAL`; remains `UNVERIFIED`; `NOINDEX`. |
| **`THR-014`** | Missing Proof Gate (Fail Closed) | A | P0 | Commercial listing created without any promoter evidence. | `EventVerificationService` | Fails closed to `UNVERIFIED`; gap preserved; zero public SEO indexation. |
| **`THR-015`** | Temporal Expiration (Stale Proof) | B | P1 | Event has not been corroborated for 15 days. | `CanonicalEventRegistry` | Automatically transitions to `EXPIRED`; dropped from `/sitemap.xml`. |
| **`THR-016`** | Event Reanimation | B | P2 | Previously cancelled tour is re-announced with new promoter evidence. | `CanonicalEventRegistry` | Reactivated to `VERIFIED` with fresh observation; audit log committed. |
| **`THR-017`** | Multi-Day Festival Topology | C | P1 | 3-day festival ingested alongside single-day pass claims. | `EventDeduplicationService` | Preserves multi-day parent festival without merging day passes into chaos. |
| **`THR-018`** | Entity Collision (Same Artist) | A | P0 | Same artist playing consecutive nights in Jakarta and Singapore. | `EventDeduplicationService` | Differentiates by country/city; prevents collapsing into 1 event. |
| **`THR-019`** | Spatial Collision (Multi-Hall) | C | P1 | Same venue hosting two different concerts on the same night. | `EventDeduplicationService` | Distinguishes by artist and hall identifier; prevents false merge. |
| **`THR-020`** | Adversarial Payload Injection | E | P0 | Attacker injects `<script>`, SSRF localhost URLs, and prompt injection. | `SecuritySanitizer` | Strips scripts, blocks private IPs, sanitizes text; zero code execution. |

---

## 5. Extensibility Roadmap (`THR-021` to `THR-300+`)

Future threat expansions are organized by domain categories:
- **`THR-021` — `THR-050`:** Advanced Ticketing Fraud (Deceptive checkout redirects, affiliate URL cloaking, spoofed ticketing providers).
- **`THR-051` — `THR-100`:** Social Impersonation (Compromised promoter accounts, spoofed verification badges, coordinated bot announcements).
- **`THR-101` — `THR-150`:** Spatial Discrepancies (Seating tier inflation, unbuilt venue halls, unpermitted festival grounds).
- **`THR-151` — `THR-200`:** Dynamic Tour Changes (Secret guest announcements, unexpected opening act removals, multi-city route changes).
- **`THR-201` — `THR-250`:** Regulatory & Licensing Conflicts (Canceled police permits, visa revocation for foreign acts, noise curfew shutdowns).
- **`THR-251` — `THR-300+`:** Distributed Network Adversaries (DDoS crawl attempts, poisoned cache attacks, search engine cloaking attempts).
