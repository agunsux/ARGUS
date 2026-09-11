# TIKUM — SCRAPING, DATA RETRIEVAL & COMPLIANCE POLICY
**Legal & Ethical Data Ingestion Guardrails**  
**Version:** 1.0.0  
**Enforcement Authority:** SHINERVA HQ Legal, Compliance & Security Operations

---

## 1. Non-Negotiable Core Tenet

> **TIKUM WILL NEVER ENGAGE IN COVERT SCRAPING, ANTI-BOT EVASION, AUTHENTICATION BYPASS, OR UNAUTHORIZED COMMERCIAL DATA HARVESTING.**

TIKUM's mission is to be Indonesia's most trusted event intelligence layer. Trust cannot be built upon brittle, unauthorized, or deceptive data collection techniques. All data ingestion must operate transparently, legally, and within explicit contractual or public policy parameters.

---

## 2. Strictly Prohibited Engineering Practices

Engineers, automated agents, subagents, and ingestion adapters are **STRICTLY PROHIBITED** from implementing or utilizing any of the following:

1. **CAPTCHA Bypass & Solving:**
   No integration with 2Captcha, Anti-Captcha, CapSolver, or custom OCR/ML models to solve challenges. Any source presenting a CAPTCHA is immediately deemed inaccessible via automation and marked `NOT_ALLOWED`.
2. **Anti-Bot & WAF Circumvention:**
   No spoofing of Cloudflare, Akamai, DataDome, PerimeterX, or AWS WAF tokens. No browser fingerprint evasion or canvas spoofing.
3. **Authentication & Paywall Bypass:**
   No unauthorized account generation, session token theft, or cookie stuffing to reach restricted pages.
4. **Private / Reverse-Engineered APIs:**
   No scraping of undocumented private mobile application endpoints, internal microservice tokens, or hidden GraphQL routes.
5. **Residential Proxy Rotation & Header Masquerading:**
   No proxy pool rotation designed to evade IP bans or rate limiters. TIKUM crawlers identify themselves with a transparent User-Agent string containing contact info:
   `User-Agent: TikumEventBot/1.0 (+https://tikum.app/bot-info; ops@tikum.app)`
6. **Commercial Terms Violation:**
   If a platform's published Terms of Service explicitly forbids commercial aggregation or automated indexing without a partnership agreement, the platform **MUST NOT** be scraped.

---

## 3. Mandatory Ingestion Compliance Protocols

1. **Hierarchy of Data Preference:**
   $$\text{Official APIs / Feeds} > \text{Licensed Datasets} > \text{Official Promoters / Venues} > \text{Permitted Public Feeds}$$
2. **Robots.txt is a Minimum Standard, Not Complete Legal Permission:**
   - A permissive `robots.txt` (`Allow: /`) indicates lack of technical blockage, but does **not** grant automatic commercial copyright license.
   - A restrictive `robots.txt` (`Disallow: /`) is an **absolute technical barrier**. Adapters must respect `Disallow` directives unconditionally.
3. **Respect Rate Limits & Crawl Delays:**
   Every adapter enforces strict per-domain token-bucket rate limiting. Minimum request spacing is $1.0\text{ second}$. Maximum rate per domain is strictly governed by `SourceRegistry.rate_limit`.
4. **Fail-Safe Behavior:**
   If a source's legal status is `UNKNOWN`, the system treats it as `NOT_ALLOWED`. **UNKNOWN MUST NEVER BE TREATED AS PERMITTED.**

---

## 4. Machine-Readable Source Compliance Schema

Before any ingestion runner invokes an adapter, it verifies the source's compliance configuration:

```json
{
  "$schema": "https://tikum.app/schemas/source-policy.json",
  "source_id": "src-promoter-pk-ent",
  "compliance_profile": {
    "commercial_use_allowed": true,
    "scraping_allowed": false,
    "api_allowed": true,
    "license_required": false,
    "permission_status": "AUTHORIZED_API",
    "terms_url": "https://pk-ent.com/terms",
    "robots_url": "https://pk-ent.com/robots.txt",
    "rate_limit_req_per_minute": 30,
    "max_consecutive_failures": 3,
    "cooldown_period_minutes": 30
  }
}
```

### Execution Guardrail Rules:
- If `permission_status == "NOT_ALLOWED" || permission_status == "UNKNOWN"` $\rightarrow$ **Execution Rejected.**
- If `scraping_allowed == false && api_allowed == false` $\rightarrow$ **Execution Rejected.**
- If `license_required == true && license_active == false` $\rightarrow$ **Execution Rejected.**

---

## 5. Personal Data & Privacy Protection (UU PDP Compliance)

In accordance with Indonesian Law No. 27 of 2022 on Personal Data Protection (UU Pelindungan Data Pribadi):

1. **Zero PII Ingestion:**
   The Event Intelligence Layer ingests **events**, not people.
   Under no circumstances may an adapter extract, store, or log:
   - Nomor Induk Kependudukan (NIK / KTP)
   - Passport Numbers
   - Personal Phone Numbers / WhatsApp Contacts
   - Personal Email Addresses
   - Ticket Buyer / Attendee Identifiers
   - Bank Account / Credit Card Credentials
2. **Sanitization Filter:**
   Every incoming raw observation passes through a strict PII sanitizer that strips Regex matches for Indonesian NIKs (`\b[0-9]{16}\b`), phone patterns (`\b(08|628)[0-9]{8,12}\b`), and personal emails.

---

## 6. Copyright, Facts, and Attribution Policy

1. **Canonical Facts vs. Creative Expression:**
   TIKUM stores non-copyrightable factual data: Artist name, concert date, venue location, city, start time, ticket tier names, face-value pricing, and official links.
2. **No Description Scraping:**
   TIKUM **never** scrapes full creative marketing descriptions, blog articles, or unauthorized artist biographies. TIKUM generates concise, standardized factual summaries.
3. **Source Attribution:**
   Wherever an observation originates from a primary ticketing partner, promoter, or licensed API, TIKUM displays explicit attribution:
   *"Informasi tiket resmi disediakan oleh [Source Name] melalui tautan resmi [URL]."*
