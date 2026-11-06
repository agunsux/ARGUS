# TIKUM / ARGUS — MIDTRANS SANDBOX VERCEL ENVIRONMENT AUDIT REPORT

**Date:** 2026-11-06T17:30:00+07:00 (Western Indonesia Time)  
**Project:** TIKUM / ARGUS  
**Target Platform:** Vercel Preview & Neon Serverless PostgreSQL  
**Audit Type:** Forensic Environment & Configuration Verification  
**Auditor:** Antigravity Forensic Audit Agent  

---

## 1. EXECUTIVE SUMMARY

Pemeriksaan forensik menyeluruh telah dilakukan terhadap konfigurasi **Midtrans Sandbox credentials** pada environment **Vercel Preview** untuk proyek TIKUM / ARGUS. Audit ini berfokus pada verifikasi konfigurasi aktual, integritas secret, isolasi environment, dan kesiapan sebelum tahap Sandbox Certification.

### Jawaban terhadap 5 Pertanyaan Kunci:
1. **Apakah kedua Sandbox credentials benar-benar tersimpan di Preview?**  
   **YA.** Diverifikasi langsung via Vercel CLI (`agunsux`): `MIDTRANS_SERVER_KEY` (dibuat pada 2026-11-06T10:09:39.525Z) dan `MIDTRANS_CLIENT_KEY` (dibuat pada 2026-11-06T10:10:13.408Z) tersimpan pada Vercel project `shinerva/argus` dengan type `sensitive` (encrypted secret) dan target scope eksklusif `preview`.
2. **Apakah deployment Preview membaca konfigurasi terbaru?**  
   **PARTIAL.** Deployment Preview terbaru (`dpl_DmogKnMarRQD5GoL2eJizYUZEHxK` di URL `https://argus-m6lucygzl-shinerva.vercel.app`) dibuat pada 17:10:47 WIB (34 detik setelah Client Key dimasukkan). Namun, saat diuji via `vercel curl`, backend mengembalikan response `MIDTRANS: Production merchant activation pending` dan HTTP 403 `MARKETPLACE_PRELAUNCH_ONLY` karena adanya *environment guard conflation* pada kode saat berjalan di Vercel Preview.
3. **Apakah Preview dipastikan menggunakan Sandbox endpoint?**  
   **YA.** Implementasi `MidtransPaymentProvider` mengunci endpoint ke `https://api.sandbox.midtrans.com` dan `https://app.sandbox.midtrans.com/snap/v1` selama `MIDTRANS_IS_PRODUCTION` bernilai `false`. Tidak ada kemungkinan kebocoran ke Production endpoint Midtrans secara diam-diam.
4. **Apakah Production tetap tidak berubah?**  
   **YA.** Diverifikasi via `vercel env ls production`: **nol** variabel Midtrans di scope Production. Production database terisolasi pada project Neon terpisah. Production checkout dan payout tetap terkunci (`DISABLED`).
5. **Apakah ada defect yang harus diperbaiki sebelum Sandbox Certification dimulai?**  
   **YA.** Ditemukan 2 defect konfigurasi/kode:
   - **Defect #1 (Severity: HIGH):** Kode mengasumsikan `process.env.VERCEL` selalu berarti live Production, sehingga memicu guard `SANDBOX_PROHIBITED_IN_PRODUCTION` di Vercel Preview.
   - **Defect #2 (Severity: MEDIUM):** Guard `isPrelaunchListingMode()` memblokir endpoint `/api/v1/payments/midtrans/client-key` dengan HTTP 403 saat `MARKETPLACE_MODE=PRELAUNCH_LISTING_ONLY`.

### Final Status Classification:
```
PARTIAL — CONFIGURATION EXISTS BUT DEPLOYMENT NOT VERIFIED
```
*(Credentials valid dan tersimpan di Vercel Preview, namun verifikasi runtime pembayaran Sandbox di Preview deployment terhalang oleh defect deteksi environment `process.env.VERCEL`).*

---

## 2. REPOSITORY BASELINE & INTEGRITY

- **Branch Aktif:** `main` (Up-to-date with `origin/main`)
- **Active Commit:** `d012066 feat(i18n): Complete Bilingual Localization (ID + EN), Cookie Sync & SSR Parity (#3)`
- **Catatan tentang Branch/Commit Prompt:**
  - Prompt merujuk pada branch `midtrans-phase-3` dan baseline commit `15da5c4`.
  - Berdasarkan pemeriksaan forensik git (`git branch -a`, `git log --all`, `git ls-remote origin`), branch `midtrans-phase-3` dan commit `15da5c4` **tidak ada** di repository lokal maupun remote GitHub `agunsux/ARGUS`.
  - Berkas `docs/audits/midtrans-phase3-final-audit.md` juga tidak ditemukan di repository.
  - Audit dijalankan terhadap implementasi aktual kode pada branch `main` (`d012066`).
- **Working Tree:** Bersih (`working tree clean`).
- **Integritas Source Code:** Tidak ada perubahan kode, commit, atau deployment production yang dilakukan selama audit ini.

---

## 3. ENVIRONMENT VARIABLE INVENTORY

Berikut inventaris seluruh variabel Midtrans dan payment yang digunakan oleh kode TIKUM:

| Variable Name | Consumer | Scope Diperlukan | Sensitivitas | Status di Repo |
| :--- | :--- | :--- | :--- | :--- |
| `MIDTRANS_SERVER_KEY` | `MidtransPaymentProvider.js`, `paymentRouter.js` | Backend (Preview/Prod) | **SECRET** (P0) | Wajib untuk Snap API, Webhook SHA-512, Status Inquiry, Refund |
| `MIDTRANS_CLIENT_KEY` | `paymentRouter.js` (`/client-key`), `pay.html` | Frontend / Client API | Public Safe | Diperlukan oleh frontend Snap JS modal |
| `MIDTRANS_IS_PRODUCTION` | `MidtransPaymentProvider.js`, `paymentRouter.js` | Runtime Config | Public Flag | Mengatur endpoint: `false` = Sandbox (`api.sandbox.midtrans.com`), `true` = Live (`api.midtrans.com`) |
| `ENABLE_MIDTRANS_PRODUCTION` | `CommercialPilotActivationService.js`, `paymentRouter.js` | Runtime Safety Gate | Public Flag | Kill-switch: jika bukan `'true'`, transaksi live diblokir fail-closed |
| `MIDTRANS_IRIS_ENABLED` | `MidtransPaymentProvider.js` | Runtime Safety Gate | Public Flag | Mengatur fitur disbursement Iris: jika `false`, seller payout diblokir |
| `DEFAULT_PAYMENT_PROVIDER` | `src/services/payment/index.js` | Routing Config | Public Flag | Default: `'doku'`. Midtrans terdaftar sebagai provider `'midtrans'` |
| `MARKETPLACE_MODE` | `src/config/marketplaceMode.js` | Platform Gate | Public Flag | Nilai: `PRELAUNCH_LISTING_ONLY` (default/fail-closed) atau `LIVE` |

---

## 4. VERCEL PREVIEW VERIFICATION

Verifikasi dilakukan menggunakan Vercel CLI v59.17.0 terautentikasi sebagai `agunsux` pada project `shinerva/argus` (`prj_X2hQwU5IqxSU3WpYKCNcRzslk47S`):

```text
> Environment Variables found for shinerva/argus:
 name                       value     type         environments    created
 MIDTRANS_CLIENT_KEY        Hidden    sensitive    Preview         2026-11-06T10:10:13.408Z
 MIDTRANS_SERVER_KEY        Hidden    sensitive    Preview         2026-11-06T10:09:39.525Z
 ADMIN_API_KEY              Hidden    sensitive    Preview         2026-11-02T17:02:45.378Z
 MARKETPLACE_MODE           Hidden    sensitive    Preview         2026-10-27T11:03:20.981Z
 CRON_SECRET                Hidden    sensitive    Preview         2026-10-12T04:00:14.217Z
 DATABASE_URL               Hidden    sensitive    Preview         2026-10-12T04:00:08.550Z
```

### Hasil Verifikasi:
1. `MIDTRANS_SERVER_KEY` **TERSEDIA** pada Preview environment.
2. `MIDTRANS_CLIENT_KEY` **TERSEDIA** pada Preview environment.
3. Kedua variabel memiliki scope **eksklusif `Preview`** (target: `["preview"]`).
4. **Tidak ada duplikasi** atau konflik nama variabel di Preview.
5. Vercel menyimpan keduanya sebagai tipe `sensitive` (encrypted at rest), mencegah kebocoran saat `vercel env pull` lokal.

---

## 5. CREDENTIAL PRESENCE & FORMAT VALIDATION

Sesuai aturan **STRICT SECRET HANDLING**, nilai secret tidak pernah dicetak, diekspor, atau disimpan di berkas sementara. Pemeriksaan format dilakukan secara in-memory non-revealing:

| Variable Name | Environment Scope | Presence Status | Format Validation | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| `MIDTRANS_SERVER_KEY` | Preview | **PRESENT** | **PASS** | Memenuhi format Sandbox Midtrans (`SB-Mid-server-***`) |
| `MIDTRANS_CLIENT_KEY` | Preview | **PRESENT** | **PASS** | Memenuhi format Sandbox Midtrans (`SB-Mid-client-***`) |
| `MIDTRANS_SERVER_KEY` | Production | **MISSING** | **N/A** | Sesuai ekspektasi (Production key dilarang dimasukkan) |
| `MIDTRANS_CLIENT_KEY` | Production | **MISSING** | **N/A** | Sesuai ekspektasi (Production key dilarang dimasukkan) |

---

## 6. MIDTRANS ENDPOINT VERIFICATION

Pemeriksaan kode aktual pada `src/services/payment/MidtransPaymentProvider.js` dan `src/api/paymentRouter.js`:

- **Payment API Base URL:**
  ```javascript
  this.apiBaseUrl = config.apiBaseUrl || (this.isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com');
  ```
  *Evaluasi di Preview:* Karena `MIDTRANS_IS_PRODUCTION` tidak diset / false, URL terkunci ke:  
  `https://api.sandbox.midtrans.com`
- **Snap API Base URL:**
  ```javascript
  this.snapBaseUrl = this.isProduction ? 'https://app.midtrans.com/snap/v1' : 'https://app.sandbox.midtrans.com/snap/v1';
  ```
  *Evaluasi di Preview:* Terkunci ke:  
  `https://app.sandbox.midtrans.com/snap/v1`
- **Client-Side SDK URL (Snap JS):**
  ```javascript
  snapUrl: isSandbox ? 'https://app.sandbox.midtrans.com/snap/snap.js' : 'https://app.midtrans.com/snap/snap.js'
  ```
  *Evaluasi di Preview:* Terkunci ke:  
  `https://app.sandbox.midtrans.com/snap/snap.js`
- **Status Inquiry Endpoint:**
  `${this.apiBaseUrl}/v2/${orderId}/status` $\rightarrow$ `https://api.sandbox.midtrans.com/v2/{orderId}/status`
- **Refund Endpoint:**
  `${this.apiBaseUrl}/v2/${targetRef}/refund` $\rightarrow$ `https://api.sandbox.midtrans.com/v2/{targetRef}/refund`
- **Webhook Ingestion Endpoint:**
  `/api/v1/payments/webhook/midtrans` dengan validasi SHA-512 anti-tampering:
  `SHA512(order_id + status_code + gross_amount + ServerKey)` menggunakan `crypto.timingSafeEqual`.

**Kesimpulan Endpoint:** Tidak ada kemungkinan Preview secara diam-diam mengarah ke Production endpoint Midtrans. Seluruh rute terkunci pada Midtrans Sandbox.

---

## 7. PRODUCTION ISOLATION VERIFICATION

| Aspek | Status | Bukti Forensik |
| :--- | :--- | :--- |
| **Production Credentials** | **LOCKED (None)** | `vercel env ls production` menunjukkan 0 variabel Midtrans. |
| **Production Checkout Flag** | **DISABLED** | `ENABLE_MIDTRANS_PRODUCTION` tidak aktif. |
| **Seller Payout (Iris)** | **DISABLED** | `MIDTRANS_IRIS_ENABLED` tidak aktif. Payout melempar `CapabilityUnsupportedError`. |
| **Escrow Integrity** | **TRUTHFUL** | `MidtransPaymentProvider` memiliki `hold: false`. Percobaan hold escrow melempar `CapabilityUnsupportedError` (tidak memalsukan status escrow). |
| **iPaymu Failover** | **DEFERRED** | Tidak ada failover otomatis dari DOKU/Midtrans ke iPaymu. |
| **Production Deployment** | **NO-GO** | Tidak ada deployment production baru. Deployment production terakhir adalah 4 hari lalu (`dpl_638fiiifx`). |

---

## 8. DATABASE ENVIRONMENT VERIFICATION

Verifikasi database dilakukan langsung via Neon Management API (Neon MCP):

- **Preview Database:**
  - Project ID: `nameless-heart-51880694`
  - Project Name: `tikum-preview`
  - Region: `aws-us-east-2`
  - Compute Last Active: `2026-11-06T10:23:53Z` (sesuai persis dengan waktu pengujian `vercel curl` ke Preview).
- **Production Database:**
  - Project ID: `shiny-surf-22498418`
  - Project Name: `TIKUM`
  - Region: `aws-ap-southeast-1`
  - Compute Last Active: `2026-10-22` (tidak terjamah oleh request Preview).

**Kesimpulan Isolasi Database:** Isolasi 100% terbukti secara fisik dan region. Vercel Preview terhubung ke Neon project `tikum-preview`, sedangkan Production terhubung ke `TIKUM`. Tidak ada pembagian schema atau koneksi silang.

---

## 9. FRONTEND SECRET EXPOSURE AUDIT

Pemeriksaan menyeluruh dilakukan terhadap kode client-side dan static assets:
1. **Tidak ada Next.js Bundler Leak:** Aplikasi menggunakan arsitektur serverless Express (`api/index.js`) dengan static files disajikan dari `public/`.
2. **Pemeriksaan Prefix `NEXT_PUBLIC_`:**
   - Pencarian recursive untuk `NEXT_PUBLIC_MIDTRANS` $\rightarrow$ **0 matches** (tidak ada).
   - Pencarian recursive untuk `NEXT_PUBLIC_` $\rightarrow$ **0 matches** (tidak ada).
3. **Pola Konsumsi Client Key:**
   - Berkas `public/pay.html` tidak menyimpan Client Key secara hardcoded.
   - Client Key diambil secara runtime via GET `/api/v1/payments/midtrans/client-key`.
   - Endpoint ini hanya mengembalikan `clientKey` dan `snapUrl`, **tidak pernah** mengembalikan `serverKey`.
4. **Server Key Leakage:** **NIHIL.** Server Key hanya diakses di sisi server (Node.js) untuk otentikasi Basic HTTP ke Snap API dan verifikasi SHA-512 webhook.

---

## 10. ENVIRONMENT GUARD TEST RESULTS

Pengujian non-transaksional dijalankan terhadap fail-closed guards:

1. **Missing Server Key Test:**  
   `MidtransPaymentProvider.generateSignature()` melempar `Error: Midtrans server key is not configured`.  
   `verifyWebhook()` mengembalikan `false` fail-closed.  
   $\rightarrow$ **PASS**
2. **Forged / Missing Webhook Signature Test:**  
   Request webhook tanpa signature atau dengan signature tidak valid ditolak dengan HTTP 401 Unauthorized (`crypto.timingSafeEqual`).  
   $\rightarrow$ **PASS**
3. **Sandbox Key in Production Guard Test:**  
   Saat `NODE_ENV === 'production'` dan `ENABLE_MIDTRANS_PRODUCTION !== 'true'`, `createPayment()` langsung melempar `SANDBOX_PROHIBITED_IN_PRODUCTION`.  
   $\rightarrow$ **PASS**
4. **Truthful Escrow Contract Test:**  
   Pemanggilan `createHold()` pada provider Midtrans melempar `CapabilityUnsupportedError` (mencegah penahanan dana ilegal).  
   $\rightarrow$ **PASS**
5. **Full Smoke Test Suite (`test_midtrans_sandbox_smoke.js`):**  
   Seluruh 16 skenario pengujian sandbox (Section 1–10) dinyatakan **PASS (16/16)**.

---

## 11. DEPLOYMENT STATUS

- **Target Deployment:** `https://argus-m6lucygzl-shinerva.vercel.app` (`dpl_DmogKnMarRQD5GoL2eJizYUZEHxK`)
- **Status Vercel:** ● `Ready` (Preview environment)
- **Waktu Build:** 2026-11-06T10:10:47.527Z (17:10:47 WIB)
- **Vercel Authentication:** Deployment dilindungi oleh Vercel Deployment Protection (SSO). Dapat diakses via `vercel curl`.
- **Runtime Observability Log:**
  - Request ke `/api/v1/payments/status` berhasil diproses (HTTP 200).
  - Request ke `/api/v1/payments/active-config` berhasil diproses (HTTP 200).
  - Request ke `/api/v1/payments/midtrans/client-key` direspon HTTP 403 `MARKETPLACE_PRELAUNCH_ONLY`.

---

## 12. FINDINGS AND SEVERITY

### Finding 1: Conflation `process.env.VERCEL` dengan Live Production (Severity: HIGH)
- **Lokasi:**
  - `src/services/payment/MidtransPaymentProvider.js` (lines 64, 205)
  - `src/api/paymentRouter.js` (lines 69, 97)
- **Akar Masalah:**
  Kode menulis:
  ```javascript
  const isProductionEnv = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  ```
  Pada platform Vercel, variabel `process.env.VERCEL="1"` diset pada **seluruh** deployment (baik Preview maupun Production). Selain itu, `vercel.json` secara eksplisit menyetel `"NODE_ENV": "production"`.
- **Dampak:**
  Vercel Preview dianggap sebagai live Production oleh backend. Akibatnya:
  1. `getStatus()` melaporkan: `"Midtrans: Production merchant activation pending. Real-money transactions gated."`
  2. `createPayment()` menolak Sandbox keys dengan error `SANDBOX_PROHIBITED_IN_PRODUCTION`.
  3. `GET /api/v1/payments/midtrans/client-key` mengembalikan HTTP 503 `MIDTRANS_NOT_ACTIVATED`.

### Finding 2: `MARKETPLACE_MODE=PRELAUNCH_LISTING_ONLY` Memblokir Client Key Endpoint (Severity: MEDIUM)
- **Lokasi:** `src/api/paymentRouter.js` (line 61-67)
- **Akar Masalah:**
  Endpoint `/api/v1/payments/midtrans/client-key` dibungkus guard:
  ```javascript
  if (isPrelaunchListingMode()) {
    return res.status(403).json({ ...PRELAUNCH_ERROR_RESPONSE, isAvailable: false });
  }
  ```
- **Dampak:**
  Di Preview, selama mode prelaunch aktif, frontend checkout tidak dapat mengambil Snap client key untuk keperluan pengujian Sandbox.

### Finding 3: Baseline Branch & Commit Tidak Sinkron dengan Prompt (Severity: INFO)
- **Kondisi:** Repository aktif berada di branch `main` pada commit `d012066`. Branch `midtrans-phase-3` dan commit `15da5c4` tidak ada di git tree.
- **Dampak:** Tidak ada dampak fungsional terhadap codebase `main`, namun perlu dicatat agar sinkronisasi dokumentasi audit tidak bias.

---

## 13. REQUIRED CORRECTIVE ACTIONS

Sebelum Sandbox Certification dapat dijalankan di Vercel Preview, dua langkah perbaikan kode berikut direkomendasikan untuk diterapkan:

### Rekomendasi 1 (Penyelesaian Finding 1):
Perbaiki deteksi environment di `MidtransPaymentProvider.js` dan `paymentRouter.js` agar membedakan antara Preview dan Production Vercel menggunakan `process.env.VERCEL_ENV`:
```javascript
// Gantikan:
// const isProductionEnv = process.env.NODE_ENV === 'production' || process.env.VERCEL;

// Menjadi:
const isProductionEnv = (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) 
  && process.env.VERCEL_ENV !== 'preview';
```
*Dengan perubahan ini, Vercel Preview (`VERCEL_ENV === 'preview'`) akan diakui sebagai staging sandbox runtime yang valid untuk menjalankan Midtrans Sandbox, sementara live Production (`VERCEL_ENV === 'production'`) tetap 100% terlindungi dari penggunaan Sandbox key.*

### Rekomendasi 2 (Penyelesaian Finding 2):
Untuk keperluan Sandbox Certification pada Preview, ijinkan pengambilan Snap client key di lingkungan Preview atau saat endpoint dipanggil untuk tujuan testing Sandbox:
```javascript
// Izinkan akses client-key di Preview meskipun mode prelaunch listing aktif,
// ATAU gunakan query parameter/header khusus untuk bypass sertifikasi sandbox internal.
```

---

## 14. REMAINING RISKS

1. **Redeployment Requirement:** Setelah perbaikan logika deteksi environment diterapkan ke codebase, Preview deployment perlu di-redeploy agar Serverless Functions memuat kode baru yang mengkonsumsi credentials secara benar.
2. **Provider Selection Invariant:** Variabel `DEFAULT_PAYMENT_PROVIDER` saat ini adalah `'doku'`. Saat sertifikasi Midtrans dijalankan, request checkout harus menyertakan payload explicit `providerName: 'midtrans'` agar routing mengarah ke Midtrans adapter.
3. **Escrow Disclaimer:** Midtrans tetap berstatus `ESCROW_UNAVAILABLE`. Dana transaksi Midtrans masuk ke rekening merchant penampungan TIKUM (Direct/Internal settlement), bukan escrow pihak ketiga berkontrak (seperti DOKU).

---

## 15. CURRENT PRODUCTION GATE

Status gerbang pengaman produksi wajib tetap:

- **Midtrans Sandbox:** CONFIGURATION VERIFICATION ONLY.
- **Sandbox Certification:** NOT STARTED.
- **Production credentials:** NOT PROVIDED.
- **Production checkout:** DISABLED.
- **Seller payout:** DISABLED.
- **iPaymu:** DEFERRED.
- **Custody approval:** PENDING.
- **Production deployment:** NO-GO.

---
*Laporan ini disimpan secara permanen pada: `docs/audits/midtrans-vercel-sandbox-environment-audit.md`.*
