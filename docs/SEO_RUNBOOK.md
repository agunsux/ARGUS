# TIKUM — SEO & Editorial Operations Runbook

**Brand**: TIKUM (`https://tikum.app`)  
**Target Audience**: Content Managers, Trust Officers, and Technical Administrators

---

## 1. Weekly Editorial Rhythm

| Day & Time | Action | Responsible Role | Target Output |
| :--- | :--- | :--- | :--- |
| **Monday 10:00 WIB** | Topic Selection & Brief Generation | Content Lead | 2 Briefs selected from `SEO_KEYWORD_MAP.md` |
| **Monday 15:00 WIB** | Drafting & Fact Verification | Editor / AI Engine | 2 Drafts saved in `review` status |
| **Tuesday 08:30 WIB** | Human Approval Gate for Post #1 | Trust Officer | Article #1 marked `approved` |
| **Tuesday 09:00 WIB** | Automatic Publish Cycle #1 | Publishing Scheduler | Article #1 transitions to `published` |
| **Thursday 16:00 WIB** | Human Approval Gate for Post #2 | Trust Officer | Article #2 marked `approved` |
| **Friday 09:00 WIB** | Automatic Publish Cycle #2 | Publishing Scheduler | Article #2 transitions to `published` |
| **Friday 15:00 WIB** | Weekly Health & Indexation Check | Technical Admin | Sitemap and 404 audit |

---

## 2. Standard Operating Procedures (SOP)

### SOP-01: Creating and Drafting a New Article
1. Choose an unassigned topic from `docs/SEO_KEYWORD_MAP.md`.
2. Send `POST /api/admin/content/articles` with admin session token:
   ```json
   {
     "title": "Cara Menghindari Penipuan Tiket Konser di Media Sosial",
     "description": "Pelajari modus penipuan tiket konser di Twitter/X dan Instagram...",
     "category": "SAFETY",
     "keywords": ["penipuan tiket konser", "rekening escrow"],
     "content": "<h2>...</h2><p>...</p>",
     "target_event_id": null
   }
   ```
3. The article is saved in `draft` status.

### SOP-02: Quality & Fact Scoring
1. Send `POST /api/admin/content/articles/:id/score`.
2. Inspect returned report:
   * Ensure `fact_check_passed === true`.
   * Verify `seo_score >= 70`.
   * Verify `trust_score >= 70`.
   * Address any actionable items listed in `flags`.

### SOP-03: Executing Human Approval Gate
1. Review the rendered preview text to ensure tone matches TIKUM brand guidelines.
2. Confirm no false guarantees or unsupported promoter relationships are claimed.
3. Send `POST /api/admin/content/articles/:id/approve` with admin credentials:
   ```json
   {
     "admin_id": "admin-1"
   }
   ```
4. Article status transitions to `approved`.

### SOP-04: Scheduling Publication
1. Send `POST /api/admin/content/articles/:id/schedule`:
   ```json
   {
     "targetDate": "2026-09-15T09:00:00+07:00"
   }
   ```
2. The scheduler will pick up the article during its next Tuesday or Friday 09:00 WIB cycle.

### SOP-05: Handling Publishing Failures
1. If an article status becomes `failed`, inspect the `publish_error` field via `GET /api/admin/content/articles/:id`.
2. Correct the underlying issue (e.g. invalid slug, missing event reference, HTML formatting).
3. Re-approve the article (`POST /api/admin/content/articles/:id/approve`).
4. Trigger immediate retry via `POST /api/admin/content/articles/:id/publish`.

---

## 3. Indexation & Technical SEO Verification

### Inspecting Dynamic Sitemap
Access `https://tikum.app/sitemap.xml`:
* Verify that new published articles appear immediately with valid `<lastmod>`.
* Verify that deleted or archived articles are automatically removed from the XML output.

### Inspecting Dynamic Robots.txt
Access `https://tikum.app/robots.txt`:
* Confirm `Disallow: /*?*q=` is active to protect crawl budget.
* Confirm `Sitemap: https://tikum.app/sitemap.xml` is present.

