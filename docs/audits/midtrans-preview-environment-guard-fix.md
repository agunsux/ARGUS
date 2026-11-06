# TIKUM / ARGUS — MIDTRANS PREVIEW ENVIRONMENT GUARD AUDIT & IMPLEMENTATION REPORT

**Date:** 2026-11-06T18:05:00+07:00 (Western Indonesia Time)  
**Project:** ARGUS / TIKUM  
**Vercel Project:** `shinerva/argus` (`prj_X2hQwU5IqxSU3WpYKCNcRzslk47S`)  
**Active Branch:** `main`  
**Baseline Commit:** `d012066`  
**Security Classification:** P0 Security Hardening & Environment Isolation  
**Final Status:** `PARTIAL — LOCAL FIX PASSED, DEPLOYMENT NOT VERIFIED`  

---

## 1. REPOSITORY BASELINE RECONCILIATION

### 1.1 Penelusuran Identitas Repository dan Remotes
Pemeriksaan menyeluruh dilakukan untuk memverifikasi struktur git dan asal-usul commit:
- **Repository Root:** `C:/Users/RYZEN/.antigravity-ide/ARGUS`
- **Git Remote:** `origin` $\rightarrow$ `https://github.com/agunsux/ARGUS.git` (juga alias identik dengan `agunsux/CALO.git`).
- **Active Branch:** `main` (up to date dengan `origin/main`).
- **Head Commit:** `d012066 feat(i18n): Complete Bilingual Localization (ID + EN), Cookie Sync & SSR Parity (#3)`.

### 1.2 Investigasi terhadap `15da5c4` dan `midtrans-phase-3`
- Pencarian dilakukan di seluruh cabang lokal (`git branch -a`), remote GitHub (`git ls-remote origin`), reflog (`git reflog`), packfiles (`git verify-pack`), dan seluruh objek `.git/objects`.
- Hasil: Commit hash `15da5c4` dan nama cabang `midtrans-phase-3` **tidak ada** dalam sejarah objek Git di repo ini maupun repo sibling manapun di mesin lokal.
- Berkas `docs/audits/midtrans-phase3-final-audit.md` juga tidak pernah ada di repo.

### 1.3 Verifikasi Implementasi Midtrans "Phase 3"
Forensic audit membuktikan bahwa implementasi fungsional Midtrans yang dimaksud dalam perencanaan "Phase 3" **sudah terintegrasi sepenuhnya ke dalam branch `main` (`d012066`)**:
1. Commit `3eb5483` (*feat(payments): atomic inventory reservation and payment safety fail-closed gates*) memperkenalkan:
   - `src/services/payment/MidtransPaymentProvider.js`
   - `test_midtrans_sandbox_smoke.js` (10 Fase pengujian Sandbox)
   - Integrasi Snap JS pada `public/pay.html`
   - Route webhook & client-key pada `src/api/paymentRouter.js`.
2. Commit `8df2932` (*fix(security): harden Tikum financial authorization and ARGUS settlement integrity*) mengunci status payout ke `PENDING_BANK_EXECUTION` dan `HELD_INTERNAL`.
3. Seluruh commit tersebut telah dimerge ke `main` via PR #2 (`88bc598`) dan PR #3 (`d012066`).
4. Tidak ada regresi atau penghapusan kode pembayaran antara `8df2932` dan `d012066`. Baseline `main` (`d012066`) adalah basis implementasi yang valid dan lengkap.

---

## 2. ROOT CAUSE OF ENVIRONMENT BLOCKERS

### 2.1 Conflation `process.env.VERCEL` dengan Live Production
Kode lama:
```javascript
const isProductionEnv = process.env.NODE_ENV === 'production' || process.env.VERCEL;
```
- Pada platform Vercel, `process.env.VERCEL="1"` diset pada **seluruh** deployment (Preview, Production, maupun Dev).
- `vercel.json` secara eksplisit menyetel `"NODE_ENV": "production"`.
- Akibatnya, deployment Preview (`VERCEL_ENV=preview`) secara keliru dianggap sebagai live Production, sehingga memicu guard `SANDBOX_PROHIBITED_IN_PRODUCTION`.

### 2.2 Blocking Endpoint Client-Key oleh `PRELAUNCH_LISTING_ONLY`
Kode lama:
```javascript
if (isPrelaunchListingMode()) {
  return res.status(403).json({ ...PRELAUNCH_ERROR_RESPONSE, isAvailable: false });
}
```
- Endpoint `/api/v1/payments/midtrans/client-key` diblokir total oleh mode prelaunch, sehingga frontend pada Preview tidak dapat memuat script Snap SDK untuk keperluan Sandbox Certification.

---

## 3. FILES CHANGED

| Berkas | Perubahan | Tujuan |
| :--- | :--- | :--- |
| `src/config/deploymentEnv.js` | **Baru (New)** | Centralized environment resolver & Midtrans config validator |
| `src/services/payment/MidtransPaymentProvider.js` | Dimodifikasi | Menggunakan `deploymentEnv`, memaksa Sandbox di Preview, memblokir Sandbox di Production |
| `src/api/paymentRouter.js` | Dimodifikasi | Pengecualian terbatas untuk Preview pada `/client-key` tanpa membuka transaksi live |
| `test_midtrans_preview_environment_guard.js` | **Baru (New)** | Suite uji deterministik untuk klasifikasi environment & guard keamanan |

---

## 4. ENVIRONMENT RESOLVER DESIGN (`src/config/deploymentEnv.js`)

Resolver menggunakan hierarki deterministik tanpa menduplikasi logika di berbagai berkas:

```
Runtime Check
  ├── Test Runner (NODE_ENV=test tanpa Vercel flags) ──> TEST
  ├── Vercel Platform (VERCEL=1 atau VERCEL_ENV)
  │     ├── VERCEL_ENV === 'preview'     ──> PREVIEW
  │     ├── VERCEL_ENV === 'production'  ──> PRODUCTION
  │     ├── VERCEL_ENV === 'development' ──> DEVELOPMENT
  │     └── Missing / Unrecognized       ──> UNKNOWN (FAIL CLOSED)
  └── Non-Vercel Standalone
        ├── NODE_ENV === 'production'    ──> PRODUCTION
        └── Otherwise                    ──> DEVELOPMENT
```

### Invarian Keamanan Midtrans:
1. `isVercelPreview()`:
   - `this.isProduction` dipaksa `false`.
   - `apiBaseUrl` terkunci ke `https://api.sandbox.midtrans.com`.
   - Jika `MIDTRANS_IS_PRODUCTION=true` atau `ENABLE_MIDTRANS_PRODUCTION=true`, status menjadi `BLOCKED` dan operasi pembayaran ditolak.
   - Jika Server Key atau Client Key tidak diawali `SB-Mid-`, status menjadi `BLOCKED`.
2. `isProductionDeployment()`:
   - Jika Server Key diawali `SB-Mid-`, status gagal-tutup dengan `SANDBOX_PROHIBITED_IN_PRODUCTION`.
   - Transaksi live hanya diizinkan jika `ENABLE_MIDTRANS_PRODUCTION=true`, `MIDTRANS_IS_PRODUCTION=true`, dan credential produksi valid terkonfigurasi.
3. `UNKNOWN` Environment:
   - Seluruh operasi Midtrans ditolak fail-closed dengan HTTP 503 `UNKNOWN_ENVIRONMENT`.

---

## 5. MIDTRANS ENDPOINT SAFETY VERIFICATION

Pada Vercel Preview, seluruh URL dipastikan terisolasi pada Midtrans Sandbox:

- **Snap API URL:** `https://app.sandbox.midtrans.com/snap/v1`
- **Core API URL:** `https://api.sandbox.midtrans.com`
- **Snap JS URL:** `https://app.sandbox.midtrans.com/snap/snap.js`
- **Status Inquiry:** `https://api.sandbox.midtrans.com/v2/{orderId}/status`
- **Refund API:** `https://api.sandbox.midtrans.com/v2/{targetRef}/refund`
- **Webhook Endpoint:** `/api/v1/payments/webhook/midtrans` dengan verifikasi signature SHA-512 anti-tampering (`crypto.timingSafeEqual`).

Tidak ada kemungkinan jatuh (fallback) ke Production endpoint Midtrans secara tidak sengaja.

---

## 6. CLIENT KEY ENDPOINT AUTHORIZATION (NARROW EXCEPTION)

Endpoint `GET /api/v1/payments/midtrans/client-key` kini mengimplementasikan **Narrowly Scoped Exception**:
- **Production Environment:** Prelaunch protection tetap absolut (`HTTP 403 MARKETPLACE_PRELAUNCH_ONLY`).
- **Preview Environment:** Diizinkan **hanya jika**:
  1. `isVercelPreview()` terverifikasi `true`.
  2. `isProduction` bernilai `false`.
  3. `MIDTRANS_CLIENT_KEY` ada dan berformat Sandbox (`SB-Mid-client-***`).
  4. Server Key (jika diset) adalah Sandbox key.
  5. `ServerKey` **TIDAK PERNAH DIBOCORKAN** dalam respons JSON.
- **Respons JSON Preview:**
  ```json
  {
    "clientKey": "SB-Mid-client-***",
    "isProduction": false,
    "isSandbox": true,
    "isAvailable": true,
    "snapUrl": "https://app.sandbox.midtrans.com/snap/snap.js"
  }
  ```

---

## 7. AUTOMATED SECURITY TEST RESULTS

Pengujian deterministik dijalankan via `test_midtrans_preview_environment_guard.js`:

```text
================================================================
  TIKUM — MIDTRANS PREVIEW ENVIRONMENT GUARD VERIFICATION
================================================================

── Section 1: Environment Classification Matrix ──
  ✓ [PASS] 1.1 Vercel Preview with NODE_ENV=production resolves strictly to PREVIEW
  ✓ [PASS] 1.2 Vercel Production with NODE_ENV=production resolves strictly to PRODUCTION
  ✓ [PASS] 1.3 Vercel Development resolves strictly to DEVELOPMENT
  ✓ [PASS] 1.4 Local development without VERCEL flags resolves to DEVELOPMENT
  ✓ [PASS] 1.5 VERCEL=1 with missing VERCEL_ENV fails closed to UNKNOWN
  ✓ [PASS] 1.6 Unrecognized VERCEL_ENV fails closed to UNKNOWN
  ✓ [PASS] 1.7 Invariant verified: VERCEL=1 alone never implies PRODUCTION

── Section 2: Provider Selection & Midtrans Endpoint Safety ──
  ✓ [PASS] 2.1 Preview correctly selects Sandbox URLs and reports ACTIVE verified status
  ✓ [PASS] 2.2 Attempting to enable MIDTRANS_IS_PRODUCTION in Preview is BLOCKED
  ✓ [PASS] 2.3 Non-sandbox server key detected on Preview is strictly BLOCKED
  ✓ [PASS] 2.4 Production without production credentials fails closed
  ✓ [PASS] 2.5 Sandbox credentials in Production are rejected with SANDBOX_PROHIBITED_IN_PRODUCTION

── Section 3: Client Key Endpoint Narrow Authorization ──
  ✓ [PASS] 3.1 Valid Preview + Sandbox configuration is granted access to Client Key (no server key leak)
  ✓ [PASS] 3.2 Preview with MIDTRANS_IS_PRODUCTION=true is rejected with HTTP 503
  ✓ [PASS] 3.3 Production in prelaunch mode strictly returns HTTP 403 MARKETPLACE_PRELAUNCH_ONLY
  ✓ [PASS] 3.4 Unknown/corrupt environment fails closed with HTTP 503 UNKNOWN_ENVIRONMENT
  ✓ [PASS] 3.5 Missing Client Key in Preview returns HTTP 503 MIDTRANS_NOT_CONFIGURED
  ✓ [PASS] 3.6 Active-config confirms Preview is NOT production and prelaunch remains true

── Section 4: Regression Tests ──
  ✓ [PASS] 4.1 All security assertions executed with zero leakage

================================================================
  ALL 19/19 SECURITY & ENVIRONMENT GUARD TESTS PASSED!
================================================================
```

---

## 8. REGRESSION TEST RESULTS

Seluruh rangkaian pengujian regresi dan konkurensi dijalankan dan berhasil 100%:

| Test Suite | Hasil | Cakupan |
| :--- | :--- | :--- |
| `test_midtrans_preview_environment_guard.js` | **19/19 PASS** | Environment resolver, client key exception, fail-closed guards |
| `test_midtrans_sandbox_smoke.js` | **16/16 PASS** | 10 Fase Midtrans sandbox smoke test |
| `test_payment_provider_contracts.js` | **36/36 PASS** | Kontrak 4 payment providers (DOKU, Midtrans, Xendit, iPaymu) |
| `test_inventory_concurrency_race.js` | **11/11 PASS** | Atomic inventory reservation, release, dan race conditions |
| `test_p0_p1_payment_inventory_safety.js` | **9/9 PASS** | Double-release protection, cancellation, idempotency |
| `test_syntax_check.js` | **324/324 PASS** | Validasi sintaks seluruh berkas JS di `src/` |

---

## 9. DEPLOYMENT EVIDENCE & STATUS

- **Status Deployment Saat Ini:** `PARTIAL — LOCAL FIX PASSED, DEPLOYMENT NOT VERIFIED`
- Perbaikan telah diuji dan tervalidasi secara lokal.
- Sesuai instruksi: **Tidak ada commit, push, atau deployment Vercel yang dilakukan tanpa izin eksplisit.**
- Deployment Preview aktif di Vercel saat ini masih menjalankan commit lama (`17:10 WIB`), sehingga memerlukan redeployment Preview setelah user memberikan otorisasi.

---

## 10. REMAINING BLOCKERS & NEXT STEPS

Sebelum Midtrans Sandbox Certification dapat dimulai:
1. **Otorisasi User:** Meminta izin untuk melakukan commit perbaikan ini ke branch kerja dan memicu Preview redeploy.
2. **Preview Redeployment:** Memicu redeploy Preview (hanya Preview, bukan Production) agar Vercel Serverless Functions memuat kode `deploymentEnv.js` yang baru.
3. **Verifikasi Runtime Pasca-Deploy:** Memanggil `/api/v1/payments/midtrans/client-key` pada URL Preview yang baru dideploy untuk memastikan status HTTP 200 dengan public `clientKey` Sandbox.
4. **Mulai Sandbox Certification:** Setelah verifikasi runtime Preview sukses, rangkaian sertifikasi Sandbox Midtrans dapat segera dimulai.

---

## 11. PRODUCTION SAFETY GATES (Wajib Tetap)

- **Production credentials:** NOT PROVIDED.
- **Production checkout:** DISABLED.
- **Real payments:** DISABLED.
- **Seller payout:** DISABLED.
- **iPaymu:** DEFERRED.
- **Custody approval:** PENDING.
- **Production deployment:** NO-GO.
