# TIKUM — SEO & Information Architecture Audit Report

**Target Brand**: TIKUM (`https://tikum.app`)  
**Parent Entity**: SHINERVA HQ  
**Audit Date**: 2026-09-12  
**Auditor**: Antigravity SEO & Security Engineering

---

## 1. Current State Assessment

TIKUM is an Indonesia-first secondary ticket marketplace designed around trust, verification, transparent transactions, escrow holding, dispute resolution, and on-site event venue presence.

### 1.1 Architecture & Stack
* **Framework**: Node.js with Express 5.2.1 (`src/server.js`).
* **Rendering Model**:
  * **Static Public HTML**: Core landing, transaction, and legal pages (`index.html`, `pay.html`, `create.html`, `track.html`, `offers.html`, `faq.html`, `terms.html`, `privacy.html`, `refund-policy.html`, `contact.html`) served from `public/`.
  * **Server-Side Rendered (SSR)**: Dynamic event discovery and promoter registry pages rendered in `src/discovery/discoveryRouter.js` using `EventSEOService.js` (`/events`, `/events/:slug`, `/promoters/apmi`, `/promoters/apmi/:slug`).
* **Canonical Domain**: Strict 301 redirection from legacy development/Vercel hostnames to `https://tikum.app`.
* **Database & Persistence**: In-memory database state (`src/database.js`) simulating relational tables (`events`, `venues`, `promoters`, `listings`, `orders`, `escrows`, `audit_logs`).

---

## 2. SEO Strengths

1. **Fast SSR Delivery**: The event discovery engine renders lightweight, server-side HTML without heavy client-side hydrate overhead, yielding fast TTFB and high crawlability for search engine spiders.
2. **Canonical Domain Enforcement**: Robust middleware redirecting legacy Vercel domains to `https://tikum.app` prevents domain dilution and duplicate content penalties.
3. **Strict Brand Separation**: Zero exposure of internal infrastructure identifiers on customer-facing surfaces, strictly presenting the consumer brand **TIKUM**.
4. **Initial Structured Data**: `EventSEOService.js` already produces Schema.org `Event`, `MusicEvent`, and `SportsEvent` schemas separating primary ticketing links from secondary resale listings.
5. **Real-world Verification Protocol**: Events contain explicit admission protocols (e.g., `BARCODE_PLUS_ID`, `PHYSICAL_WRISTBAND`), reinforcing genuine trust signals and high-intent commercial value.

---

## 3. SEO Weaknesses & Technical Blockers

1. **Static, Under-indexed Sitemap (`public/sitemap.xml`)**:
   * Contains only 10 hardcoded URLs.
   * Completely omits dynamic event URLs (`/events/:slug`), APMI promoter profiles (`/promoters/apmi/:slug`), and entity pages.
   * Lacks dynamic `<lastmod>`, `<changefreq>`, and `<priority>` signals based on real database updates.
2. **Minimal robots.txt (`public/robots.txt`)**:
   * Only declares basic Disallow for `/admin` and `/api/`.
   * Does not specify crawl directives or handle faceted search query parameters.
3. **Structured Data Gaps**:
   * Homepage lacks `Organization` and `WebSite` schemas (with Sitelinks Searchbox).
   * Hierarchical pages lack `BreadcrumbList` schema.
   * FAQ and policy pages lack `FAQPage` schema.
   * No `Article` / `BlogPosting` structured data exists because editorial publishing is not yet implemented.
4. **Redirect-Only Facets**:
   * `/events/city/:city` and `/events/category/:category` currently issue HTTP 302 redirects to query parameter URLs (`/events?city=...`), which causes search engines to waste crawl budget and fail to rank dedicated city/category landing hubs.
5. **Absence of Dedicated Trust Authority URLs**:
   * Pages like `/how-it-works`, `/buyer-protection`, `/seller-protection`, `/ticket-verification`, `/escrow`, and `/disputes` are referenced in marketing copy but do not exist as dedicated, indexable landing pages.

---

## 4. Content & Data Blockers

1. **No Editorial Engine**:
   * No content repository, article models, editorial calendar, or publishing pipelines exist.
2. **Artist Model Immaturity**:
   * Artists currently exist only as raw strings within the `artists: []` array on `event` records. There is no dedicated artist registry, meaning generating artist pages prematurely would create thin, unverified pages.
3. **Risk of Thin Doorway Pages**:
   * If city or category pages are generated blindly without verifying whether active events exist in that city, Google may penalize the domain for doorway/thin pages.

---

## 5. Risk Assessment

| Risk Category | Severity | Current Status | Remediation Plan |
| :--- | :--- | :--- | :--- |
| **Indexation Risk** | HIGH | Search engines discover filtered search URLs (`?q=`, `?city=`) as duplicate paths. | Enforce strict `noindex, follow` on search/filter query strings and provide canonical links pointing to clean canonical URLs. |
| **Thin Content Risk** | HIGH | Generating pages for empty cities, artists without upcoming events, or empty venues. | Implement strict grounding: only render and index entity pages if backed by real events. All empty entities return `404` or `noindex`. |
| **Duplicate Content Risk** | MEDIUM | Trailing slashes, uppercase slugs, or duplicate category redirects. | Implement slug normalization (`toLowerCase().trim().replace(...)`) and canonical tags on all indexable surfaces. |
| **Structured Data Risk** | MEDIUM | Potential invalid JSON-LD when optional fields (e.g. `end_date`, `image`) are null. | Deploy `StructuredDataFactory` with strict schema validation and null-coalescing guards. |
| **Performance Risk** | LOW | SSR is currently lightweight. Adding blog and entity routes must maintain $<50$ms server response time. | Use in-memory registry caching and minimal string templating. |
| **Security Risk** | CRITICAL | AI drafting or admin content publishing could accidentally expose private user data, transactions, or payment credentials. | Complete isolation: AI content engine operates with zero access to payment/user tables. Content admin routes require admin authentication and step-up authorization. |

---

## 6. Recommended SEO Architecture

```text
https://tikum.app/
├── / (Homepage with WebSite & Organization JSON-LD)
│
├── /events (Catalog Hub)
│    └── /events/[slug] (Canonical Event Pages with Event & Breadcrumb JSON-LD)
│
├── /venues (Venue Directory)
│    └── /venues/[slug] (Grounded Venue Hubs with Place JSON-LD)
│
├── /cities/[slug] (Curated City Hubs — Jakarta, Bandung, Surabaya, Bali)
│
├── /categories/[slug] (Category Hubs — Concert, Festival, Sports)
│
├── /promoters/apmi (APMI Accredited Promoters Directory)
│    └── /promoters/apmi/[slug] (Promoter Profile & Schedule)
│
├── Trust Authority Hubs (FAQPage & Breadcrumb JSON-LD):
│    ├── /how-it-works
│    ├── /buyer-protection
│    ├── /seller-protection
│    ├── /ticket-verification
│    ├── /escrow
│    ├── /disputes
│    └── /faq
│
├── Editorial Publication:
│    ├── /blog (Magazine Index)
│    └── /blog/[slug] (In-depth Educational Articles with Article JSON-LD)
│
└── Technical Infrastructure:
     ├── /robots.txt (Dynamic)
     ├── /sitemap.xml (Dynamic Index)
     ├── /sitemaps/events.xml
     ├── /sitemaps/entities.xml
     ├── /sitemaps/trust.xml
     └── /sitemaps/blog.xml
```

---

## 7. Conclusion

TIKUM's architecture provides an excellent, fast SSR foundation. By eliminating static sitemap limitations, grounding programmatic pages in real database records, establishing authoritative trust pages, and launching a disciplined 2x/week editorial engine with a human approval gate, TIKUM can achieve organic acquisition dominance while preserving 100% data integrity and brand trust.

