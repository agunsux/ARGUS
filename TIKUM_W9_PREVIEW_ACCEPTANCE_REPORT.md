# TIKUM — W9: PREVIEW DEPLOYMENT, IMAGE RENDERING & ACCEPTANCE VERIFICATION REPORT

**Date:** 2026-10-12 (WIB)
**Current Production Baseline:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Previous Rollback Target:** `5d5a34517fbef55b23ad3be7e7ad18df83e94850` (`5d5a345`)
**Production Freeze Status:** **ENFORCED** (Zero production deploys, zero git commits/pushes, zero production DB mutations)

---

## 1. Environment Isolation Check & Safe Blocker Determination (`W9.1`)

Per Section 0 and Section 10 of the governing prompt:
> *"If preview and production share a database, treat preview database writes as production writes. Keep the workflow read-only until a genuinely isolated test database is available."*
> *"Do not run `vercel deploy --prod`. Do not deploy even a preview if it would run write-enabled ingestion or migrations against the production database. First verify whether Preview and Production share `DATABASE_URL`."*

### A. Proof from Vercel Environment Inspection (`npx vercel env ls`)
We inspected the Vercel project environment bindings via `npx vercel env ls`:
```text
name                      value               environments                        created
ENABLE_DOKU_PRODUCTION    Encrypted           Preview                             25h ago
CRON_SECRET               Encrypted           Development, Preview, Production    2d ago
SESSION_SECRET            Encrypted           Development, Preview, Production    2d ago
ARGUS_ADMIN_KEY           Encrypted           Development, Preview, Production    2d ago
DATABASE_URL              Encrypted           Development, Preview, Production    2d ago
```
And verified the Neon PostgreSQL database (`neondb` on `ep-fancy-math-a1833223-pooler.ap-southeast-1.aws.neon.tech`):
- `DATABASE_URL` is bound identically across **`Development, Preview, Production`**.
- Deploying a remote Vercel preview (`npx vercel deploy`) without first isolating `DATABASE_URL` for `Preview` (or setting `ARGUS_DB_READ_ONLY=true` in the `Preview` environment) would connect the preview deployment directly to the live production Neon database (`neondb`).

### B. Safety Action Taken
In strict compliance with Section 0 and Section 10:
1. **We stopped before executing `npx vercel deploy`** so that no remote Vercel preview instance could write to the shared production `DATABASE_URL`.
2. **We executed the full W9 Preview + Image Rendering Acceptance Suite locally against an ephemeral local server running with `ARGUS_DB_READ_ONLY=true`**, hydrated from the live 63-row Neon catalog (`0` writes to `neondb`).

---

## 2. Local Read-Only Preview & UI Image Acceptance Results (`W9.2` & Section 10)

Executed via `node --env-file=.env.local test_image_pipeline_and_rendering.js` and `verify_w9_local_preview.js` (`ARGUS_DB_READ_ONLY=true`):

| Acceptance Gate | Endpoint / Surface | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1. Homepage Surface & Card Posters** | `GET /` (`public/index.html`) | `HTTP 200`, renders bilingual UI shell + `renderPosterMedia` with `loading="lazy"`, `decoding="async"`, `onerror` fallback swap | `HTTP 200` | **PASS** |
| **2. Events Catalog SSR Page & Posters** | `GET /events` | `HTTP 200`, renders **34** deduplicated upcoming event cards: **24** with `.catalog-card-media img` (`HTTP 200` `image/*`) and **10** with `.catalog-card-fallback` (`0` broken image URLs rendered) | `HTTP 200`<br>`24` verified `<img>` + `10` branded fallbacks | **PASS** |
| **3. Event Detail SSR Page (Verified Official Image)** | `GET /events/synchronize-festival-2026-jakarta`<br>`GET /events/lalala-festival-jakarta-2027-tangerang-2027-01-17`<br>`GET /events/dwp-2026-bali-2026-12-11` | `HTTP 200`, renders `<figure class="event-poster">` with verified official `<img>`, `onerror` handler, credit attribution, and official ticket link | `HTTP 200` | **PASS** |
| **4. Event Detail SSR Page (Verified Seller Image)** | `GET /events/men-i-trust-live-in-jakarta-2026-jakarta`<br>`GET /events/kanye-west-ye-tour-2026-in-jakarta-jakarta` | `HTTP 200`, renders verified LOKET banner (`assets.loket.com`), credit attribution, and official ticket link | `HTTP 200` | **PASS** |
| **5. Event Detail SSR Page (Honest Fallback for `BROKEN` / `SOURCE_LINK_ONLY`)** | `GET /events/babymonster-see-you-there-choom-tour-jakarta-2026-tangerang`<br>`GET /events/morgan-jay-this-one-s-for-you-tour-jakarta-2026-jakarta-pusat-2026-11-11` | `HTTP 200`, renders `.event-poster-fallback` (`Poster Resmi Belum Tersedia dari Sumber`) + clickable official source link, never a broken `404` `<img>` | `HTTP 200` | **PASS** |
| **6. Public Home Feed API** | `GET /api/events/home-feed` | `HTTP 200`, `feed.length === 34`, **24** with verified `image_url` (`3 VERIFIED_OFFICIAL` + `21 VERIFIED_AUTHORIZED_SELLER`), **10** with `image_url: null` (`4 BROKEN` + `6 SOURCE_LINK_ONLY`) | `HTTP 200`<br>`34` events (`24` verified images + `10` honest fallback) | **PASS** |
| **7. Public Discovery Catalog API** | `GET /api/discovery/events` | `HTTP 200`, `events.length === 34`, 100% field parity with `/api/events/home-feed` | `HTTP 200`<br>`total: 34` | **PASS** |
| **8. Reconciliation & Provenance Status API** | `GET /api/discovery/reconciliation/status` | `HTTP 200`, reports `63` total canonical events and per-source health | `HTTP 200`<br>`total_canonical: 63` | **PASS** |
| **9. Duplicate Event Check (`Men I Trust`)** | `GET /api/discovery/events` | `menITrustCount === 1` (snapshot `ev-can-c79bb221` + live LOKET `ev-can-4cc7e9d0` merged into 1 card with verified `assets.loket.com` banner) | `menITrustCount: 1` | **PASS** |
| **10. Multi-Night Residency Preservation (`LANY`)** | `GET /api/discovery/events` | `lanyCount === 2` (`Night 1` `2026-10-29` and `Night 2` `2026-10-30` kept distinct, both with verified `HTTP 200` banner) | `lanyCount: 2` | **PASS** |
| **11. Past & Unverified Events Excluded** | `GET /api/discovery/events`<br>`GET /api/events/home-feed` | `0` past events (`Pestapora 2026`, `The Weeknd 2026`, `MotoGP 2026`, `NCT 127`, `The Script 2026` excluded even when they have verified images) and `0` unverified events | `0` past / `0` unverified leaked | **PASS** |
| **12. Protected Cron & Admin Endpoints** | `GET /api/discovery/cron/sync`<br>`GET /api/discovery/jobs/chunked-sync`<br>`POST /api/discovery/supply/ingest` | Reject unauthenticated calls with `HTTP 401` | `401 Unauthorized` | **PASS** |

---

## 3. Exact Steps to Unblock Isolated Remote Vercel Preview (`W9.1`)

Before running `npx vercel deploy` for a remote Preview URL, isolate the `Preview` database environment using one of the two options below:

### Option A (Recommended): Create an Isolated Neon Branch for Vercel `Preview`
1. Create a copy-on-write Neon branch from `main` (`neondb`):
   ```powershell
   npx neonctl branches create --name preview-w2-w9
   ```
2. Bind the new branch's connection string exclusively to the Vercel `Preview` environment:
   ```powershell
   npx vercel env rm DATABASE_URL preview
   npx vercel env add DATABASE_URL preview
   ```
3. Run the migration (`migrations/001_catalog_schema.sql`) on the `preview-w2-w9` branch and deploy to Vercel Preview:
   ```powershell
   npx vercel deploy
   ```

### Option B: Enforce Read-Only DB Mode on Vercel `Preview`
If a separate Neon branch is not used, set `ARGUS_DB_READ_ONLY=true` in the Vercel `Preview` environment before running `npx vercel deploy`:
```powershell
npx vercel env add ARGUS_DB_READ_ONLY preview
# Enter value: true
npx vercel deploy
```

---

## 4. Release Readiness Recommendation (`Section 12`)

- **Current Verdict**: **`YELLOW — CODE & LOCAL VERIFICATION 100% READY / HOLD REMOTE DEPLOY UNTIL PREVIEW DB ISOLATION IS CONFIGURED`**
- **Summary**:
  1. All W0–W8 engineering requirements and the complete **7-stage Event Image Coverage & Rendering Pipeline** are implemented and verified locally (`19/19` test suites passing, `28/63` canonical events and `24/34` unique public upcoming events serving live `HTTP 200` `image/*` official/authorized banners, and `10/34` public upcoming events rendering honest branded fallback cards without broken image icons).
  2. Remote Vercel Preview deployment (`npx vercel deploy`) and Production promotion remain held solely on the infrastructure isolation step above (`DATABASE_URL` shared between `Preview` and `Production`) and explicit user approval.
