# TIKUM / ARGUS — MIDTRANS PREVIEW DEPLOYMENT & RUNTIME VERIFICATION REPORT

**Date:** 2026-11-06T18:25:00+07:00 (Western Indonesia Time)  
**Project:** ARGUS / TIKUM  
**Vercel Project:** `shinerva/argus` (`prj_X2hQwU5IqxSU3WpYKCNcRzslk47S`)  
**Original Baseline Commit:** `d012066`  
**Final Local Commit:** `7d892a5` (`fix(midtrans): sanitize quotes and refine diagnostic reason codes for preview keys`)  
**Deployment ID:** `dpl_BRPAvhDCTYQ93iX8To7YA5c11qNq`  
**Preview Deployment URL:** `https://argus-gz4swkp5u-shinerva.vercel.app`  
**Deployment Target:** `Preview` (iad1 – Washington, D.C., USA)  
**Final Status:** `PREVIEW DEPLOYED — VERIFICATION PARTIAL`  

---

## 1. EXECUTIVE SUMMARY & FORENSIC DISCOVERY

Deployment Vercel Preview telah berhasil dideploy dan diverifikasi secara read-only. Perbaikan environment resolver (`src/config/deploymentEnv.js`) bekerja dengan sukses 100% di runtime serverless Vercel:
1. **Deteksi Environment Sukses:** Endpoint `/api/v1/payments/active-config` kini secara akurat mengenali lingkungan sebagai Preview dengan `"is_production": false` (tidak lagi keliru mengira Vercel sebagai Production).
2. **Penemuan Kritis P0 di Runtime (Forensic Finding):**
   Saat endpoint `/api/v1/payments/midtrans/client-key` dan `/api/v1/payments/status` dipanggil pada Preview runtime, guard keamanan menolak inisialisasi dengan status:
   ```json
   {
     "name": "midtrans",
     "status": "BLOCKED",
     "is_verified": false,
     "message": "Live production server key (Mid-server-*) detected on Preview environment. Sandbox key (SB-Mid-server-*) required."
   }
   ```
   **Akar Masalah:** Kredensial `MIDTRANS_SERVER_KEY` yang dimasukkan ke Vercel Preview ternyata berawalan `Mid-server-***` (format resmi Midtrans untuk **Live Production Server Key**), bukan `SB-Mid-server-***` (format resmi untuk **Sandbox Server Key**).
3. **Fail-Closed Guard Bekerja Sempurna:** Guard keamanan yang baru kita terapkan berhasil mencegat kunci produksi ini di lingkungan Preview, mengunci status ke `BLOCKED`, dan menolak mengekspos client key atau memproses pembayaran. Platform berhasil dilindungi dari risiko transaksi live tidak sengaja pada Preview!

---

## 2. REPOSITORY COMMITS & CHANGED FILES

- **Baseline Commit:** `d012066`
- **Intermediary Commit:** `5c7fa17` (`fix(midtrans): enforce safe Vercel preview environment`)
- **Final Commit:** `7d892a5` (`fix(midtrans): sanitize quotes and refine diagnostic reason codes for preview keys`)

### Berkas yang Berubah:
1. `src/config/deploymentEnv.js` (Baru): Centralized environment resolver & Midtrans credential format validator.
2. `src/services/payment/MidtransPaymentProvider.js` (Dimodifikasi): Integrasi resolver terpusat, isolasi paksa Sandbox di Preview, blokir Sandbox di Production.
3. `src/api/paymentRouter.js` (Dimodifikasi): Narrowly scoped client-key exception untuk Preview + sanitasi quote.
4. `test_midtrans_preview_environment_guard.js` (Baru): 19 pengujian deterministik otomatis.
5. `docs/audits/midtrans-preview-environment-guard-fix.md`: Dokumen audit implementasi.

---

## 3. TEST EVIDENCE & CLASSIFICATION

Seluruh pengujian lokal telah dijalankan sebelum deployment:

| Test Suite | Hasil | Klasifikasi Uji | Keterangan |
| :--- | :--- | :--- | :--- |
| `test_midtrans_preview_environment_guard.js` | **19/19 PASS** | Local configuration & HTTP matrix | Menguji seluruh variasi Vercel Preview, Prod, Dev, Unknown, dan fail-closed guards. |
| `test_midtrans_sandbox_smoke.js` | **16/16 PASS** | Mock/stub-based simulation test | Menguji alur Snap token, idempotency, truthful non-escrow, dan webhook signature tanpa outbound HTTP ke Midtrans live. |
| `test_payment_provider_contracts.js` | **36/36 PASS** | Interface contract conformance | Memverifikasi polimorfisme dan deklarasi fail-closed 4 payment provider (DOKU, Midtrans, Xendit, iPaymu). |
| `test_inventory_concurrency_race.js` | **11/11 PASS** | Database integration test | Menguji atomisitas reservasi tiket, lock inventory, dan rollback pada race conditions. |
| `test_p0_p1_payment_inventory_safety.js` | **9/9 PASS** | Financial safety & double-entry ledger | Menguji proteksi double-release, late webhook routing, dan pencegahan double-selling. |
| `test_syntax_check.js` | **324/324 PASS** | Static syntax validation | Memvalidasi sintaks seluruh 324 berkas JavaScript di `src/`. |

---

## 4. VERCEL DEPLOYMENT TARGET & PREVIEW ISOLATION

- **Project Name:** `shinerva/argus`
- **Project ID:** `prj_X2hQwU5IqxSU3WpYKCNcRzslk47S`
- **Deployment ID:** `dpl_BRPAvhDCTYQ93iX8To7YA5c11qNq`
- **Target URL:** `https://argus-gz4swkp5u-shinerva.vercel.app`
- **Build Timestamp:** 2026-11-06T18:22:28Z (18:22 WIB)
- **Deployment Scope:** Eksklusif **Preview**. Perintah `--prod` **TIDAK DIGUNAKAN**.
- **Production Isolation:** Domain produksi (`tikum.app`, `argus-638fiiifx-shinerva.vercel.app`) tidak mengalami perubahan dan tetap mengarah pada build Production 4 hari yang lalu.

---

## 5. DATABASE ENVIRONMENT VERIFICATION

- **Preview Database Target:** Terhubung ke Neon Project `tikum-preview` (`nameless-heart-51880694`, region `aws-us-east-2`).
- **Production Database Target:** Terhubung ke Neon Project `TIKUM` (`shiny-surf-22498418`, region `aws-ap-southeast-1`).
- **Pemeriksaan Akses:** Tidak ada kueri atau mutasi yang dikirimkan ke Production database selama deployment maupun pengujian runtime.

---

## 6. POST-DEPLOYMENT RUNTIME VERIFICATION (READ-ONLY)

Verifikasi dilakukan via `vercel curl` secara read-only terhadap deployment aktif:

### 1. Endpoint `/api/v1/payments/active-config`
```text
HTTP 200 OK
{
  "active_provider": "doku",
  "status": "PENDING_VERIFICATION",
  "is_verified": false,
  "is_production": false,
  "marketplace_mode": "PRELAUNCH_LISTING_ONLY",
  "is_prelaunch": true,
  "requires_escrow": false
}
```
*Hasil:* Terkonfirmasi bahwa deployment diakui sebagai **`is_production: false`** (Preview). Proteksi mode prelaunch tetap aktif (`is_prelaunch: true`).

### 2. Endpoint `/api/v1/payments/status` (Midtrans Provider Status)
```text
HTTP 200 OK
{
  "name": "midtrans",
  "status": "BLOCKED",
  "is_verified": false,
  "message": "Live production server key (Mid-server-*) detected on Preview environment. Sandbox key (SB-Mid-server-*) required."
}
```
*Hasil:* Provider Midtrans terkunci `BLOCKED` fail-closed karena mendeteksi kunci live production.

### 3. Endpoint `/api/v1/payments/midtrans/client-key`
```text
HTTP 503 Service Unavailable
{
  "error": "Live production server key (Mid-server-*) detected on Preview environment. Sandbox key (SB-Mid-server-*) required.",
  "code": "MIDTRANS_NOT_ACTIVATED",
  "isAvailable": false
}
```
*Hasil:* Tidak ada pembocoran Server Key. Client Key tidak dipulangkan selama konfigurasi belum tervalidasi sebagai Sandbox murni.

---

## 7. CRITICAL ACTION REQUIRED BEFORE SANDBOX CERTIFICATION

Untuk membuka endpoint Sandbox di Vercel Preview:
1. Buka Vercel Dashboard $\rightarrow$ Project `argus` $\rightarrow$ Settings $\rightarrow$ Environment Variables.
2. Edit variabel `MIDTRANS_SERVER_KEY` pada scope **Preview**:
   - Gantikan nilai yang berawalan `Mid-server-***` dengan **Midtrans Sandbox Server Key** yang berawalan `SB-Mid-server-***`.
3. Periksa juga variabel `MIDTRANS_CLIENT_KEY` pada scope **Preview**:
   - Pastikan nilainya berawalan `SB-Mid-client-***`.
4. Setelah environment variables diperbarui di Vercel, serverless container akan membaca kunci Sandbox yang benar dan status Midtrans akan otomatis beralih menjadi `ACTIVE` (Sandbox).

---

## 8. PRODUCTION SAFETY GATES (TETAP TERKUNCI)

- **Production credentials:** NOT PROVIDED / NOT SET.
- **Production checkout:** DISABLED.
- **Real-money payments:** DISABLED.
- **Seller payouts:** DISABLED.
- **iPaymu:** DEFERRED.
- **Custody approval:** PENDING.
- **Production deployment:** NO-GO.
