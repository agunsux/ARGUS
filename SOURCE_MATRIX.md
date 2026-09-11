# TIKUM — SOURCE MATRIX & AUDIT REGISTER
**Version:** 1.0.0  
**Domain:** Indonesia Event Intelligence & Multi-Source Discovery  
**Compliance Authority:** SHINERVA HQ Legal & Trust Operations  
**Last Updated:** September 2026

---

## 1. Executive Summary & Audit Methodology

TIKUM's Event Intelligence Engine strictly prohibits blind web scraping, anti-bot circumvention, credential harvesting, and terms-of-service violations. Every candidate source undergoes a multi-dimensional risk and compliance audit before ingestion adapters are permitted.

Sources are classified into three operational statuses:
- 🟢 **GREEN (Authorized / Licensed):** Contractual API access, authorized public structured feeds, or official promoter/venue partnerships. Permitted for automatic continuous ingestion.
- 🟡 **YELLOW (Conditional / Manual Review):** Public discovery feeds or press releases where commercial rights require explicit operator review or attribution agreements. Permitted only with rate-limiting and human verification review.
- 🔴 **RED (Prohibited / Do Not Ingest):** Sources with explicit anti-scraping terms, CAPTCHAs, private APIs, resale/scalper forums, or unverified secondary listing scrapers. **STRICTLY PROHIBITED FROM AUTOMATED INGESTION.**

---

## 2. Source Classification & Audit Matrix

| Source ID | Source Name & Entity | Canonical URL | Category | Indonesia Coverage | Access Method | Permission Status | Commercial Use Rights | Scraping Allowed | Robots.txt Policy | Rate Limit | Attribution Required | Risk Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src-assoc-apmi` | **APMI** (Asosiasi Promotor Musik Indonesia)| `https://apmi.co.id` | Music Promoters Apex Association | National (All Indonesia) | AUTHORIZED_API / FEED | AUTHORIZED_API | Official Association Data | N/A (Official Roster) | Permitted | 30 req/min | Yes (APMI Citation) | 🟢 GREEN |
| `src-promoter-boss-creator` | **Boss Creator** (Pestapora / APMI) | `https://bosscreator.id` | Official Promoter (APMI Member) | Jakarta Metro, Bandung | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-promoter-antarasuara` | **Antarasuara** (Sheila on 7 Tour / APMI) | `https://antarasuara.com` | Official Promoter (APMI Member) | National (5+ Cities) | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-promoter-otello-asia` | **Otello Asia** (Dewa 19 All Stars / APMI) | `https://otelloasia.com` | Official Promoter (APMI Member) | Jakarta, Solo, Bandung | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-promoter-plainsong` | **Plainsong Live** (Joyland Fest / APMI) | `https://joylandfest.com` | Official Promoter (APMI Member) | Bali, Jakarta | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-promoter-aloka` | **ALOKA** (Asian Pop & K-Pop / APMI) | `https://aloka.co.id` | Official Promoter (APMI Member) | Jakarta, Tangerang | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-promoter-pk-ent` | **PK Entertainment** (Official Promoter / APMI) | `https://pk-ent.com` | Official Promoter | Jakarta Metro, National | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-promoter-sound-rh` | **Sound Rhythm** (Official Promoter / APMI) | `https://soundrhythm.id` | Official Promoter | Jakarta, Bali | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-promoter-isb-live` | **Ismaya Live** (We The Fest, DWP / APMI) | `https://ismayalive.com` | Official Promoter | Jakarta, Bali | AUTHORIZED_API / FEED | AUTHORIZED_API | Licensed / Authorized | N/A (Official Feed) | Permitted | 30 req/min | Yes (Promoter Credit) | 🟢 GREEN |
| `src-venue-ppk-gbk` | **PPK Gelora Bung Karno** (Official Complex) | `https://gbk.id` | Official Venue Authority | Jakarta | AUTHORIZED_API | AUTHORIZED_API | Public Gov / Partner | N/A (API) | Permitted | 60 req/min | Yes (Venue Credit) | 🟢 GREEN |
| `src-venue-jiexpo` | **PT Jakarta International Expo** | `https://jiexpo.com` | Official Venue Authority | Jakarta | AUTHORIZED_API | AUTHORIZED_API | Public Commercial | N/A (API) | Permitted | 30 req/min | Yes (Venue Credit) | 🟢 GREEN |
| `src-venue-ice-bsd` | **PT Indonesia International Expo (ICE)**| `https://ice-indonesia.com`| Official Venue Authority | Tangerang, Banten | AUTHORIZED_API | AUTHORIZED_API | Public Commercial | N/A (API) | Permitted | 30 req/min | Yes (Venue Credit) | 🟢 GREEN |
| `src-league-ibl` | **IBL Indonesia** (Basketball League) | `https://iblindonesia.com` | Official Sports League | National (10+ cities) | AUTHORIZED_API | AUTHORIZED_API | Official Partner | N/A (API) | Permitted | 60 req/min | Yes (League Credit) | 🟢 GREEN |
| `src-league-lib` | **PT Liga Indonesia Baru** (Liga 1 & 2) | `https://ligaindonesiabaru.com`| Official Sports League | National (All provinces)| AUTHORIZED_API | AUTHORIZED_API | Official Partner | N/A (API) | Permitted | 60 req/min | Yes (League Credit) | 🟢 GREEN |
| `src-fed-pb-pbsi` | **PBSI** (Indonesia Open / Masters) | `https://pbsi.id` | Official Sports Federation | Jakarta, Bali | AUTHORIZED_API | AUTHORIZED_API | Official Federation | N/A (API) | Permitted | 30 req/min | Yes (Federation Credit)| 🟢 GREEN |
| `src-disc-bandsintown`| **Bandsintown API** | `https://bandsintown.com` | Licensed Discovery API | National (All major cities)| AUTHORIZED_API | LICENSED_DATA | Licensed Commercial | N/A (API) | Permitted | 120 req/min | Yes (Bandsintown Link) | 🟢 GREEN |
| `src-disc-eventbrite` | **Eventbrite Public API** | `https://www.eventbrite.com`| Authorized Discovery API | Jakarta, Bali, Bandung | AUTHORIZED_API | AUTHORIZED_API | Commercial Dev Terms | N/A (API) | Permitted | 60 req/min | Yes (Eventbrite Link) | 🟢 GREEN |
| `src-gov-kemenparekraf`| **Kemenparekraf Kharisma Event** | `https://kemenparekraf.go.id`| Government Tourism Board | All 38 Provinces | PUBLIC_DISCOVERY_ONLY | PERMITTED_CRAWL | Public Open Data | Permitted (Structured)| Allowed (`/events/`) | 10 req/min | Yes (Gov Attribution) | 🟡 YELLOW |
| `src-gov-jakarta-tourism`| **Enjoy Jakarta (Disparekraf DKI)** | `https://jakarta-tourism.go.id`| Regional Tourism Board | DKI Jakarta | PUBLIC_DISCOVERY_ONLY | PERMITTED_CRAWL | Public Open Data | Permitted (Structured)| Allowed (`/agenda/`) | 10 req/min | Yes (Gov Attribution) | 🟡 YELLOW |
| `src-news-antaranews` | **Antara News Hiburan & Olahraga** | `https://antaranews.com` | National News Wire | National | PUBLIC_DISCOVERY_ONLY | MANUAL_REVIEW | Media Fair Dealing | Disallowed for scrape | Strict Bot Blocking | 5 req/min | Yes (News Credit) | 🟡 YELLOW |
| `src-media-billboard-id`| **Billboard Indonesia News** | `https://billboardindonesia.com`| Music Media | National | PUBLIC_DISCOVERY_ONLY | MANUAL_REVIEW | Media Fair Dealing | Disallowed for scrape | Strict Bot Blocking | 5 req/min | Yes (Media Credit) | 🟡 YELLOW |
| `src-tiket-com` | **tiket.com** (Primary OTA) | `https://www.tiket.com` | Ticketing Platform | National | AUTHORIZED_API / FEED | MANUAL_REVIEW | Partner Agreement Req | Prohibited w/o Partner| Disallow `/` for bot | N/A | Yes | 🟡 YELLOW |
| `src-loket` | **LOKET** (Primary Ticketing) | `https://www.loket.com` | Ticketing Platform | National | AUTHORIZED_API / FEED | MANUAL_REVIEW | Partner Agreement Req | Prohibited w/o Partner| Disallow `/` for bot | N/A | Yes | 🟡 YELLOW |
| `src-goers` | **GOERS App** (Ticketing) | `https://goersapp.com` | Ticketing Platform | National | AUTHORIZED_API / FEED | MANUAL_REVIEW | Partner Agreement Req | Prohibited w/o Partner| Disallow `/` for bot | N/A | Yes | 🟡 YELLOW |
| `src-carousell-resale` | **Carousell Resale Listings** | `https://carousell.id` | Secondary Resale Forum | Local User Listings | NOT_ALLOWED | NOT_ALLOWED | None | STRICTLY FORBIDDEN | Disallow `/` | 0 | Prohibited | 🔴 RED |
| `src-twitter-scalpers` | **Twitter / X Jual Tiket Feeds** | `https://x.com` | Social Scalper Signal | Unstructured Social | NOT_ALLOWED | NOT_ALLOWED | None | STRICTLY FORBIDDEN | Strict API Paywall | 0 | Prohibited | 🔴 RED |
| `src-viagogo` | **Viagogo Secondary Marketplace** | `https://viagogo.com` | Secondary Marketplace | Global / Resale | NOT_ALLOWED | NOT_ALLOWED | None | STRICTLY FORBIDDEN | Cloudflare Anti-Bot | 0 | Prohibited | 🔴 RED |
| `src-stubhub` | **StubHub International** | `https://stubhub.com` | Secondary Marketplace | Global / Resale | NOT_ALLOWED | NOT_ALLOWED | None | STRICTLY FORBIDDEN | Cloudflare Anti-Bot | 0 | Prohibited | 🔴 RED |

---

## 3. Strict Action Plan per Classification

### 3.1 🟢 GREEN Sources (Automated Pipelines)
1. Ingested via direct developer API tokens or signed webhooks.
2. Ingestion frequency configured per source tier (Daily for S-Tier promoters/venues, Every 3 Days for licensed discovery APIs).
3. Canonical facts extracted (Artists, Venue, Start Date, Ticket Status, Official Link). No copyright-protected text or high-resolution marketing assets copied without permission.
4. Continuous health check and circuit-breaker telemetry enabled.

### 3.2 🟡 YELLOW Sources (Supervised / Attributed / Partner Feeds)
1. Requires explicit written partner confirmation or operator-approved public feed parsing.
2. If accessed via HTTP, strictly checks `robots.txt` before every run.
3. If `robots.txt` disallows or changes, the adapter immediately halts and alerts compliance officer.
4. Any event discovered from a YELLOW source enters `PENDING_REVIEW` or `DISCOVERED` state; it **CANNOT** achieve `VERIFIED` status without corroborating Tier-S evidence or manual human officer sign-off.

### 3.3 🔴 RED Sources (Zero Automated Ingestion)
1. **Zero scraping adapters permitted.** No crawler or script may target these URLs.
2. No CAPTCHA solving, IP proxy rotation, user-agent spoofing, or headless stealth browsers allowed.
3. If an event is only mentioned on RED sources (e.g. scalper forums), the event **DOES NOT EXIST** in canonical TIKUM registry.
