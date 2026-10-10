# TIKUM — CURATED & CORROBORATED CATALOG POLICY
**Document ID:** `DOC-POL-2026-002`  
**Authority:** SHINERVA HQ Trust & Engineering Architecture  
**Status:** Canonical Active Policy  
**Effective Date:** 2026-10-10  
**Scope:** Event Discovery, Source Ingestion, Canonical Truth, Resale Availability  

---

## 1. Executive Mission & Philosophy

TIKUM differentiates itself in the Indonesian secondary ticketing ecosystem by **uncompromising trustworthiness, genuine ticket validity, transparent buyer protection, and accountable on-site operations** — not by inflating catalog vanity numbers through unverified scraping.

> [!IMPORTANT]
> **TIKUM operates as a CURATED + CORROBORATED Event Catalog.**
> We do NOT claim that our catalog is 100% automatically or continuously live-scraped across every commercial ticketing site in Indonesia. We tell users and partners the unvarnished truth about where data comes from, when it was observed, and what level of verification it has attained.

---

## 2. Source Ingestion Capability Matrix

Each ticketing and event source is formally classified with explicit operational boundaries:

| Source Identifier | Source Platform | Approved Operational Mode | Network Ingestion Truth | Anti-Bot & Compliance Policy | Fallback & Provenance Rule |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `src-loket` | **LOKET.com** | `LIVE_NETWORK_VERIFIED` (Targeted) / `SNAPSHOT_FALLBACK` | **Tested Live Network Operational**<br>Endpoint: `https://rest.loket.com/fusio/api/v1/public/discover`<br>Schema: `event_name`, `date`, `location`, `link`, `pricing` | Respects `robots.txt` (`Allow: /`). Crawl rate limited to max 30 req/min. User-Agent declared. | If rate-limited or offline, falls back to committed snapshot with `PROVENANCE_DEGRADED` tag. Never fakes live status. |
| `src-goers` | **GOERS / GOERSapp** | `READY_PASSIVE` / `OFFICIAL_PARTNER_FEED` | **No Direct Public Scraping**<br>Public endpoints return HTTP 403 (Cloudflare Bot Management Challenge). | **STRICT PROHIBITION**: Never attempt Cloudflare bypass, headless browser fingerprint evasion, or proxy rotation. | Ingestion operates exclusively via official partner feed (`GOERS_FEED_URL`) or verified snapshot. If feed is unconfigured, status reports `READY_PASSIVE`. |
| `src-bbo` | **BBO (bbo.co.id)** | `SNAPSHOT_ONLY` | **No Live Crawler Implemented**<br>Adapter has no active HTTP crawler or reverse-engineered API client. | **STRICT PROHIBITION**: No private mobile app sniffing or session scraping without contractual authorization. | Reads exclusively from committed snapshots in `OfficialSourceSnapshotStore` or fixtures. Explicitly reported as `SNAPSHOT_ONLY`. |
| `src-promoter-*` | **APMI Promoters & Tier S Accounts** | `PRIMARY_SOURCE_AUTHORITATIVE` | **Authoritative Primary Source**<br>Official websites, verified press releases, and promoter announcements. | Direct primary observation. High confidence, Tier 1 authority. | Promoter statements override secondary platform dates and venues in case of conflict. |

---

## 3. Strict Prohibitions & Invariants

1. **NEVER Label Snapshot as Live Ingestion**:
   - Any adapter, report, API response, or admin view that reads from local JSON, fixture, or snapshot MUST declare `source_mode: 'SNAPSHOT'` or `is_live: false`.
   - Falsely presenting cached or snapshot records as "live scraped" is a severe engineering violation.

2. **Zero Cloudflare / WAF Bypass**:
   - When an external platform returns HTTP 403, Cloudflare challenge, or CAPTCHA, the system MUST fail closed and log `FETCH_BLOCKED: CLOUDFLARE_WAF`.
   - Bypassing WAFs using rotating proxies or stealth drivers exposes TIKUM to legal liability and violates SHINERVA compliance policies.

3. **Separation of Concerns: Discovery vs. Verification vs. Resale Inventory**:
   TIKUM maintains three completely separated states for any event:
   - **Discovered Event (`DISCOVERED` / `UNVERIFIED`)**: Event observed from one or more sources. Excluded from public indexation (`noindex`) and active sales until verified.
   - **Verified Canonical Event (`VERIFIED_CANONICAL`)**: Grounded against authoritative promoter/ticketing sources with confirmed date, venue, and organizer. Eligible for public display and waitlist demand capture.
   - **Resale Inventory Available (`resale_available: true`)**: **STRICTLY CONDITIONAL** upon having at least 1 verified, active, non-expired ticket listing submitted by a KYC-verified seller and approved by admin. If `resale_inventory_count === 0`, the UI and API MUST return `resale_available: false` and render the official notice:
     > *"Belum ada tiket resale sekunder terverifikasi di TIKUM untuk event ini. TIKUM tidak membuat stok palsu atau harga fiktif."*

4. **Quarantine on Discrepancy & Conflict**:
   - If conflicting dates, cities, or venues are reported across distinct sources (e.g., source A says Oct 24, source B says Nov 1), the event MUST transition to `DATA_CONFLICT` or `QUARANTINED_FOR_REVIEW`.
   - Stale or lower-tier sources can NEVER silently overwrite newer authoritative schedules.
   - Quarantined events are suppressed from public discovery until an operator or Tier S promoter statement resolves the discrepancy.

---

## 4. Required Metadata per Event Record

Every canonical event record stored and served by TIKUM must include:
- `id` and `canonical_name`: Unique slug and normalized title.
- `start_date` and `end_date`: ISO-8601 YYYY-MM-DD.
- `venue_name` and `venue_city`: Normalized venue and Indonesian city.
- `organizer_name`: Verified promoter/organizer entity.
- `official_event_url`: Direct link to official event landing page.
- `official_ticket_url`: Direct link to primary ticketing checkout page.
- `observed_at`: Exact ISO-8601 timestamp when the fact was observed.
- `verification_status`: `VERIFIED`, `UNVERIFIED`, `EXPIRED`, or `CONFLICTED`.
- `provenance_history`: Append-only audit log tracking every update with `evidence_hash`.
- `resale_inventory_count`: Integer count of active secondary listings (strictly 0 when no listings exist).
