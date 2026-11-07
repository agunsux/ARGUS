# Organic discovery execution — 7 November 2026 (Asia/Jakarta)

## Verdict: BLOCKED — partial implementation, not production live

No new article was published. No production cron was activated. No database migration,
commit, or deployment was performed. Do not confuse configuration edits with activation.

## Baseline and production evidence

- Branch: feature/midtrans-sandbox-preview; baseline: 359767b.
- Existing user changes: package-lock.json and untracked payment audit/test documents, untouched.
- Vercel CLI authentication works. Production inspection resolves tikum.app to deployment
  dpl_Dr21GtBiycs4XnG3S2geeUYDyaEe (Ready, created November 3).
- Do NOT promote this entire branch: unrelated payment preview changes differ from production.
- Live read-only probes: /blog 200, /robots.txt 200, /sitemap.xml 200,
  /api/admin/content/articles 401. Blog canonical is https://tikum.app/blog.
- Production sitemap listed two editorial article slugs (plus editorial standards/categories).

## Forensic audit

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Existing CMS | PASS | Express SSR blog, ArticleRepository, ContentModel, admin content router |
| Public blog | PASS | Production HTTP 200 |
| Admin authentication | PASS | Unauthenticated production API returns 401 |
| BlogPosting / OG / sitemap infrastructure | PASS locally | Existing factories and routes; not full production article validation |
| Publication durability | FAIL | DurableArticleStore uses /tmp/argus_data on Vercel; no shared transactional article store |
| Cross-instance idempotency | FAIL | Process-local Map and mutex, no database compare-and-set |
| Scheduled visibility | Fixed locally | Scheduled records no longer become publicly visible solely from elapsed time |
| Persistence errors | Fixed locally | Exceptions propagate; publish and save roll back in-memory changes on failure |
| Slug uniqueness | Fixed locally | Collision check uses normalized/generated slug |
| Invalid schedule date | Fixed locally | Validate timestamp before changing status |
| Production clock injection | Fixed locally | Cron simulation restricted to test environment |
| Trust claims in article CTA | Fixed locally | Removed unconditional escrow/gate-support promises and automatic verification byline |
| Cadence | Configured locally only | Existing cron changed to 0 3 * * 2,5; no second cron |
| Metrics truthfulness | Partial | Null GSC/AI metrics; existing indexable count remains an inventory estimate, not Google index coverage |
| CWV, image audit, expired event CTAs | NOT VERIFIED | No complete field/production audit |
| Durable retries, notification, pause/resume | FAIL / incomplete | Not implemented; serverless publishing now explicitly fails closed |

The existing ContentQualityEngine is heuristic, not independent factual verification.
No score from that engine proves event details, ticket availability, or search demand.

## Research evidence and blockers

GSC and Google Ads have no active connected account. OAuth requested; no metrics queried.
Google Trends explore for Indonesia could not be retrieved. Volume, CPC, competition,
ranking, impressions, clicks and trend remain unavailable, NOT zero. No winner selected.

Primary-source checks:
- https://gunsnroses.com/blogs/news/guns-n-roses-to-return-to-indonesia-for-a-historic-stadium-show-in-jakarta
  specifies Madya Stadium GBK, November 21, 2026.
- https://5centuries.jakarta.go.id/events/guns-n-roses-live-in-jakarta
  instead lists Indonesia Arena; this is a source conflict, not publishable confirmation.
- https://www.jakarta.go.id/siaran-pers/7146-SP-HMS-10-2026 reports the JRF
  marathon/10K on October 25. This verifies occurrence, not continuing demand.
- https://enjoy.jakarta.go.id/events is a discovery source, not keyword volume evidence.

### Twenty research opportunities (NOT a volume-ranked top 20)

All target Indonesia; confidence in current demand: NOT VERIFIED. City Jakarta except
general ticket education (national). Other event details require primary-source checks.

| Keyword | Classification | Intent | Evidence state |
| --- | --- | --- | --- |
| jadwal konser Jakarta November 2026 | upcoming | informational | Fallback candidate; calendar only |
| 5 Seconds of Summer Jakarta | upcoming | commercial | User candidate, primary check incomplete |
| Guns N Roses Jakarta 2026 | upcoming | commercial | Official date/venue found; demand missing |
| harga tiket Guns N Roses Jakarta | upcoming | commercial | Ticket-price verification required |
| Doh Kyung Soo Jakarta | upcoming | commercial | Primary check incomplete |
| My Chemical Romance Jakarta | upcoming | commercial | Primary check incomplete |
| harga tiket My Chemical Romance Jakarta | upcoming | commercial | Primary check incomplete |
| DWP 2026 | upcoming | commercial | Calendar discovery only |
| lineup DWP 2026 | upcoming | informational | Primary check incomplete |
| harga tiket DWP 2026 | upcoming | commercial | Primary check incomplete |
| YE Live in Jakarta 2026 | historical candidate | informational | Occurrence and residual demand unverified |
| setlist YE Jakarta 2026 | historical candidate | informational | Occurrence/setlist unverified |
| Jakarta Running Festival 2026 | historical | informational | Occurrence verified; residual demand missing |
| hasil Jakarta Running Festival 2026 | historical | informational | Official results and demand needed |
| harga tiket Coldplay Jakarta 2023 | historical candidate | informational | Historical price/source and demand needed |
| cara membeli tiket konser sold out | evergreen | commercial | Cannibalization check needed |
| cara menghindari penipuan tiket konser | evergreen | informational | Existing safety content overlaps |
| cara transfer tiket konser | evergreen | informational | Organizer-specific restrictions needed |
| cara cek tiket konser asli | evergreen | informational | Existing safety content overlaps |
| jual tiket konser resale | transactional | transactional | Inventory and capability checks needed |

OpportunityResearch keeps missing factors null. Weights: demand 25, momentum 15,
intent 20, competitiveness opportunity 15, inventory 15, conversion 10.
Incomplete candidates receive no overall score and cannot be declared winners.
Historical selection additionally requires confirmed occurrence. The module is a tested
planning utility, not an automated data ingestion pipeline or complete dashboard integration.

## First article

Selection, final title/body, preview and publication: BLOCKED, not completed.
Fallback remains "Jadwal Konser Jakarta November 2026: Daftar Artis, Tanggal, Venue dan Informasi Tiket".
No final URL or publication timestamp exists. Do not publish a calendar until each included
event has a verified primary source and ticket-status check. Do not call it most searched.

## Thirty-day proposed calendar (not queued for publication)

Existing seeded articles already occupy these slots. Reconcile them with the editor; do
not overwrite or create a second queue. Topics below are conditional research briefs.

| WIB slot | Proposed research target | Type |
| --- | --- | --- |
| Nov 10, 10:00 | November Jakarta concert calendar | Upcoming |
| Nov 13, 10:00 | JRF results/history if residual demand exists | Historical |
| Nov 17, 10:00 | Guns N Roses venue/ticket guide | Upcoming |
| Nov 20, 10:00 | Sold-out ticket purchase decision guide | Evergreen |
| Nov 24, 10:00 | November event archive, only after occurrence confirmation | Historical |
| Nov 27, 10:00 | DWP lineup and admission rules | Upcoming |
| Dec 1, 10:00 | DWP ticket/venue guide, avoid overlap with Nov 27 | Upcoming |
| Dec 4, 10:00 | Historical ticket-price comparison if demand validated | Historical |

Next configured slot: November 10, 2026 10:00 WIB = 03:00 UTC, conditional on completing
the first publication before it. Recompute after actual publication; no fixed activation promised.

## Validation and remaining work

- New isolated safety suite: PASS (visibility, scoring, historical eligibility, eight WIB
  slots, slug collision, invalid dates, persistence rollback, idempotency, one cron).
- Syntax: 325/325 src JavaScript files passed.
- git diff --check: passed (line-ending warnings only).
- Existing test_blog_seo_acceptance.js: 35 pass / 21 fail; legacy slug/date/CTA expectations
  and scheduled visibility assumptions conflict with current implementation. Not all failures
  are classified as pre-existing because no pristine-baseline comparison was executed.
- Existing test_seo_domination.js: stops at buyer-protection heading assertion.
- Full npm test/build and live post-deployment verification: NOT RUN / NOT VERIFIED.
- No payment or escrow implementation changed. No database mutations or migrations.

Required next: isolate SEO changes against production baseline; introduce shared transactional
article persistence and durable job leases/retries/audit/notifications/pause; integrate verified
research with approval workflow; reconcile old campaign; complete historical/technical checks;
resolve regression failures; publish only a verified selected article; verify production URL,
canonical, sitemap and worker persistence before declaring PRODUCTION LIVE.