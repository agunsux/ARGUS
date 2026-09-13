# TIKUM — EVENT SOURCE LEGAL & COMPLIANCE POLICY
**Document ID:** `DOC-POL-2026-001`  
**Compliance Authority:** SHINERVA HQ Legal & Trust Infrastructure  
**Version:** 1.0.0  
**Status:** Mandatory Active Policy  

---

## 1. Purpose & Scope

This policy establishes mandatory operational and legal guardrails governing how TIKUM discovers, ingests, processes, and displays event information from third-party public, commercial, and social sources.

Every engineer, agent, adapter, and automated job operating within TIKUM must comply strictly with this document.

---

## 2. Core Legal Principle

> [!CAUTION]
> **TIKUM NEVER ASSUMES LEGAL IMMUNITY.**
> Terminology such as *"information aggregator"*, *"platform facilitator"*, or *"open directory"* does **NOT** automatically eliminate legal liability.
> The system must never encode speculative legal conclusions as business logic. Any situation involving trademark ambiguity, restrictive terms of service, or disputed event exclusivity must be routed to a `LEGAL_REVIEW_REQUIRED` state for formal counsel review.

---

## 3. Allowed Source Types & Authority Tiers

TIKUM recognizes three explicit tiers of sources:

### 3.1 Tier 1: Primary & Authoritative Sources
- **Official Event Promoters** (e.g., APMI accredited member promoters, PK Entertainment, Ismaya Live, Antarasuara).
- **Official Venues** (e.g., PPK GBK, JIExpo Kemayoran, ICE BSD, Taman Ismail Marzuki).
- **Primary Ticketing Partners** (e.g., authorized direct feeds or permitted public pages from Loket, Tiket.com, Goers).
- **Official Event/Artist Websites & Official Announcements**.
- **National Sports Governing Bodies** (e.g., IBL Indonesia, PT Liga Indonesia Baru).

*Permissions:* Discovery, corroboration, canonical truth determination, verified publishing.

### 3.2 Tier 2: Trusted Commercial & Institutional Sources
- Established event discovery platforms and licensed developer APIs (e.g., Bandsintown, Eventbrite API).
- Government tourism boards and municipal cultural calendars (e.g., Kemenparekraf Kharisma Event Nusantara).
- Established mainstream entertainment media publications.

*Permissions:* Candidate discovery, corroboration, and confidence scoring. Tier 2 cannot override Tier 1 authoritative truth.

### 3.3 Tier 3: Discovery Signals (Social Channels)
- Official promoter Instagram/TikTok/Facebook accounts.
- Official artist social media announcements.
- Official venue social media broadcasts.

*Permissions:* **DISCOVERY SIGNAL ONLY.** Tier 3 sources can flag potential events for investigation. A Tier 3 signal can **NEVER** solely verify an event or render it indexable. In the absence of corroborating Tier 1 evidence, Tier 3 events remain `UNVERIFIED` and `NOINDEX`.

---

## 4. API-First Strategy & Ingestion Precedence

TIKUM enforces an **API-First** hierarchy for all external interactions:
1. **Authorized Partner APIs & Feeds:** Always prefer direct, authenticated APIs or authorized data feeds where explicit terms govern access.
2. **Structured Public Feeds & Open Data:** Utilize publicly available RSS, JSON-LD, or structured sitemaps when permitted by platform terms.
3. **Safe Public Web Discovery:** Only inspect publicly accessible web pages where:
   - Access is permitted by the domain's `robots.txt` file.
   - The platform terms do not expressly prohibit automated discovery for indexation.
   - No authentication, session token, paywall, or client obfuscation is required.
4. **Unsupported / Manual Sources:** When a source restricts crawling or provides no authorized API, it must be designated as:
   `STATUS: UNSUPPORTED / MANUAL SOURCE ONLY`.
   TIKUM must fail closed. **Automated extraction is strictly prohibited for these sources.**

---

## 5. Absolute Compliance Prohibitions (Zero Tolerance)

Under no circumstances shall any code, adapter, worker, or engineer implement, deploy, or utilize:

1. **NO CAPTCHA Bypass:** Never attempt to solve, evade, or bypass CAPTCHA, reCAPTCHA, Cloudflare Turnstile, or any human verification challenge.
2. **NO Anti-Bot Evasion:** Never employ headless browser spoofing, fingerprint evasion, or behavioral masking to deceive web protection systems.
3. **NO Credential Harvesting:** Never scrape or capture user credentials, session cookies, private auth headers, or personal account tokens.
4. **NO Proxy Rotation Networks:** Never utilize rotating residential or commercial proxy networks designed to circumvent IP rate limits or geo-restrictions.
5. **NO Private / Reverse-Engineered APIs:** Never intercept, inspect, or invoke undocumented mobile app APIs or obfuscated private endpoints.
6. **NO Ticket Inventory Scraping:** TIKUM discovers events, not ticket seats. Never scrape seat maps, barcode values, seat availability grids, or ticket cart tokens.

---

## 6. Robots.txt, Rate Limiting & Crawl Hygiene

Every automated source interaction must adhere to responsible crawling protocols:
- **Respect `robots.txt` Directives:** Honor `Disallow` paths and declare explicit User-Agent headers (`TIKUM-EventBot/1.0 (+https://tikum.app/bot)`).
- **Strict Rate Limits:** By default, no source may receive more than 1 request per 2 seconds (maximum 30 requests/minute).
- **Exponential Backoff with Jitter:** On encountering HTTP 429 (Too Many Requests) or HTTP 503, immediately back off exponentially with randomized jitter:
  $$\Delta t = 2^n \times \text{base} + \text{rand}(0, 1000\text{ms})$$
- **Circuit Breakers:** If an adapter encounters 3 consecutive failures or any 403 Forbidden / 401 Unauthorized response, the circuit breaker must open (`STATUS: CIRCUIT_OPEN`), isolating the source and alerting admin operators.

---

## 7. Copyright Minimization & Fair Data Retention

To respect intellectual property rights and minimize copyright exposure:
1. **Factual Data Extraction Only:** Extract only objective factual data points: event title, date, start time, canonical venue name, city, official organizer name, and official ticket destination URL.
2. **No Wholesale Copying of Editorial Content:** Never copy or mirror promotional paragraphs, marketing copy, copyrighted event write-ups, or proprietary artist biographies.
3. **Descriptions Synthesized Factually:** Event descriptions displayed on TIKUM must be neutrally synthesized factual summaries (e.g., *"Konser resmi Bruno Mars diselenggarakan di Gelora Bung Karno, Jakarta pada 15 November 2026."*).
4. **Attribution Required:** Public event pages must clearly identify the primary ticketing partner or promoter with prominent attribution.
5. **Raw Observation Retention:** Store only the minimum structured JSON payload necessary to preserve the factual provenance chain.

---

## 8. Ticket URL Safety & Consumer Protection

External ticket links on TIKUM must adhere to consumer protection rules:
- Clearly distinguish **Official Primary Ticket Sources** from secondary resale listings.
- Label an external link as *"Kanal Tiket Resmi"* **ONLY** when verified against Tier 1 authoritative records.
- All external links must feature clear destination domains and include `rel="noopener noreferrer nofollow"`.
- Deceptive redirects, affiliate domain cloaking, or ambiguous referral chains are strictly prohibited.

---

## 9. Policy Enforcement & Auditability

1. Every source in `SourceRegistry` must maintain a `terms_reference` and `robots_policy` audit field.
2. All manual overrides or status changes must be logged in `state.audit_logs` with the responsible officer ID and rationale.
3. Any system failure to obtain authoritative evidence must fail closed to `UNVERIFIED`.
