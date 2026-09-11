# TIKUM — PROMOTER DISCOVERY SOURCE & COMPLIANCE POLICY
**Social Discovery, Provenance & Scraping Boundaries**  
**Version:** 1.0.0  
**Authority:** SHINERVA HQ Legal, Trust & Security Operations

---

## 1. Source Hierarchy: "Follow the Promoter"

In the Indonesian live event market, promoters break announcements, presales, venue changes, and cancellations on their official Instagram channels first. TIKUM enforces an exact 4-tier source of truth hierarchy:

| Role | Source Domain | Technical Authority | Evidence Weight |
| :--- | :--- | :--- | :--- |
| **PRIMARY EVENT SOURCE (Tier S)** | Verified official promoter Instagram (`@antara.suara`, `@boss.creator`), Verified official promoter website | Lineup, date, time, venue, city, announcements, reschedules, cancellations | **HIGH (Tier S Primary)** |
| **CORROBORATING SOURCES (Tier S / A)** | Official venue (GBK, ICE), Official artist, APMI, Authorized ticketing API, Licensed event API | Corroborates dates, venue booking, promoter affiliation, and artist confirmation | **HIGH (Corroborating)** |
| **TRANSACTION SOURCE** | Official ticketing platform (Loket, tiket.com, GOERS) | Ticket checkout URL, tier pricing, ticket availability | **HIGH (Transaction)** |
| **DISCOVERY SIGNALS** | Unverified Instagram accounts, public listings, search engines, news media, community posts | Event candidate detection (requires corroboration) | **CANDIDATE (Discovery)** |

### Crucial Account Verification Requirement:
An Instagram account does **NOT** automatically possess Tier S authority. It must first complete the verification gate:
$$\text{DISCOVERED} \longrightarrow \text{IDENTITY\_MATCHED} \longrightarrow \text{VERIFIED\_OFFICIAL\_PROMOTER\_ACCOUNT}$$
Only accounts with verified identity (via official website backlink, APMI accreditation, corporate registration, and established history) are granted **Tier S Primary Event Source** authority.

### Direct Ingestion from Verified Promoter Instagram:
Posts from a **VERIFIED official promoter account** may directly create or update canonical events through the `EventIngestionPipeline` with `event_verification_status: PRIMARY_SOURCE_VERIFIED` and `source_confidence: HIGH` without requiring a second source prior to creation.

### Field-Aware Source Confidence:
Source confidence is tracked at the **field level**. If a verified promoter Instagram post confirms the event title, date, and venue, but has not yet announced ticket prices:
- `event_name`: CONFIRMED (HIGH)
- `start_at`: CONFIRMED (HIGH)
- `venue`: CONFIRMED (HIGH)
- `ticket_price`: UNKNOWN (Pending announcement)
The event's overall confidence remains **HIGH**; it is **NEVER** downgraded simply because secondary transaction details have not yet been released.

---

## 2. Prohibition of Aggressive Social Media Scraping

Under no circumstances shall TIKUM engineering or automated collectors implement:
1. **Login & Session Hijacking:** No automated logging into Instagram using bot accounts, dummy credentials, or session cookies.
2. **Anti-Bot & CAPTCHA Circumvention:** No browser canvas fingerprinting, WebGL spoofing, or automated challenge solvers.
3. **Private Endpoint Scraping:** No reverse-engineering of internal mobile API endpoints (`i.instagram.com`).
4. **Proxy Pool Evasion:** No rotating residential proxy services designed to bypass platform rate limits.
5. **Private Data Ingestion:** No scraping of user comments, direct messages, phone numbers, WhatsApp links, or follower identities.

---

## 3. Machine-Readable Source Permission Registry

Every social discovery source must be registered with an explicit permission status:

```json
{
  "source_id": "src-promoter-antarasuara-instagram",
  "platform": "INSTAGRAM",
  "account_handle": "@antara.suara",
  "profile_url": "https://www.instagram.com/antara.suara/",
  "source_type": "PROMOTER_OFFICIAL_SOCIAL",
  "authority_scope": "EVENT",
  "authority_level": "TIER_S",
  "source_role": "PRIMARY_EVENT_SOURCE",
  "permission_status": "MANUAL_ENTRY",
  "commercial_use_status": "FAIR_DISCOVERY_ATTRIBUTION",
  "enabled": true,
  "last_checked": null,
  "last_success": null,
  "last_failure": null
}
```

### Permission Status Definitions:
- `MANUAL_ENTRY`: Profile added manually by an operator via CSV/JSON import or admin portal. Permitted as a verified social handle.
- `AUTHORIZED_API`: Official Meta Graph API access or signed partner webhook.
- `LICENSED`: Licensed commercial social media intelligence data feed.
- `PERMITTED_PUBLIC_SOURCE`: Public discovery feed operating under permissive robot policies.
- `UNKNOWN`: Unverified or newly scraped handle. **AUTOMATED COLLECTION BLOCKED.**
- `DISALLOWED`: Handle requested removal or terms explicitly disallow ingestion. **PERMANENTLY BLOCKED.**

---

## 4. Provenance & Evidence Model

Every claim attached to a promoter record must retain immutable provenance:

### Example A: APMI Accreditation Provenance
```json
{
  "promoter_id": "prm-antarasuara",
  "source": "src-assoc-apmi",
  "source_url": "https://apmi.co.id/#members",
  "claim": "APMI Accredited Member Promoter",
  "authority_scope": "PROMOTER",
  "confidence": "HIGH",
  "retrieved_at": "2026-09-11T12:00:00+07:00"
}
```

### Example B: Instagram Social Identity Provenance
```json
{
  "promoter_id": "prm-antarasuara",
  "source": "src-ig-antarasuara",
  "source_url": "https://www.instagram.com/antara.suara/",
  "claim": "Official Instagram Handle @antara.suara",
  "authority_scope": "SOCIAL_IDENTITY",
  "confidence": "HIGH",
  "evidence": "Website https://antarasuara.com backlinks to @antara.suara",
  "retrieved_at": "2026-09-11T12:00:00+07:00"
}
```

---

## 5. Personal Data Protection (UU PDP Guardrails)

In compliance with Law No. 27 of 2022 on Personal Data Protection:
1. Only corporate, organizational, and business contact data (office email, corporate domain, registered company name) may be stored.
2. Individual personal data (PIC national identity numbers, personal cell phone numbers, private home addresses) must never be scraped or saved in promoter discovery registers.
