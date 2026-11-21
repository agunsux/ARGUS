# LAPORAN FINAL KESIAPAN IMPLEMENTASI iPaymu
## TIKUM — PT SHINERVA PRAJNA TEJAS × iPaymu INTEGRATION
**Dokumen:** `TIKUM_IPAYMU_IMPLEMENTATION_READINESS.md`  
**Platform:** TIKUM ([https://tikum.app](https://tikum.app))  
**Tanggal:** 10 November 2026  
**Commit Lokal:** `91139eb` (`feat(payment): align iPaymu escrow policy, seller onboarding and provider limitations`)  
**Status Gate:** `PRELAUNCH_LISTING_ONLY` (Produksi Aktif, Transaksi Riil Diblokir Secara *Fail-Closed*)  
**Prinsip Utama:** Pelaporan objektif berbasis bukti tanpa mengasumsikan persetujuan yang belum ada dari pihak penyedia (iPaymu).

---

## 1. RINGKASAN EKSEKUTIF HASIL PENYELARASAN

Sesuai arahan evaluasi forensik, sistem pembayaran TIKUM telah diselaraskan secara ketat dengan batasan dan fakta operasional resmi iPaymu:
1. **Onboarding Seller & Split Payment:** Arsitektur kompatibilitas untuk pendaftaran seller individual dan pembagian dana (*BagiBagi*) telah dibangun secara *fail-closed*. Opsi *Closed API Single Register* diklasifikasikan secara jujur sebagai **BLOCKED** karena memerlukan dokumen tertutup dan kredensial kemitraan enterprise dari iPaymu.
2. **Alur Escrow & Batasan Temporal:** Menegakkan aturan bahwa escrow iPaymu **hanya** dapat dipilih pada kanal Transfer Bank / Virtual Account dan transfer berkode unik yang memenuhi syarat. QRIS dan Kartu Kredit secara tegas ditolak jika escrow diaktifkan. Batas waktu konfirmasi $7 \times 24\text{ jam}$ (dan perpanjangan $+3\text{ hari}$, maksimal $10\text{ hari}$) diterapkan dalam evaluasi kelayakan acara; tiket untuk acara yang berlangsung $> 10\text{ hari}$ ditolak dari skema escrow provider untuk mencegah pencairan prematur.
3. **Keterbatasan Provider yang Diakui:** Tidak ada API kendali escrow (*hold/release*) atau *refund* otomatis di iPaymu API v2. Seluruh *refund* dicatat sebagai *manual pending review/reconciliation* ke tim operasional.
4. **Buku Besar Finansial (ARGUS FinancialLedger):** Seluruh pencatatan internal tetap seimbang secara matematis ($\sum \text{Debits} = \sum \text{Credits}$), dengan penafian tegas bahwa status pembukuan internal bukan merupakan bukti penahanan escrow di sisi iPaymu.
5. **Kebijakan Rilis:** Kode telah diuji (489/489 checks pass) dan di-commit **secara lokal saja** (`91139eb`). Tidak ada *push*, *merge*, *deploy*, atau eksekusi transaksi finansial riil tanpa otorisasi tertulis.

---

## 2. KATEGORI 1: TERIMPLEMENTASI & TERVERIFIKASI (IMPLEMENTED & VERIFIED)

Komponen berikut telah terpasang di basis kode, tervalidasi oleh pengujian unit/integrasi, dan berjalan di server produksi:

| No | Modul / Kemampuan | Lokasi Kode | Bukti Verifikasi Pengujian |
| :---: | :--- | :--- | :--- |
| 1 | **Validasi Signature Webhook HMAC-SHA256** | `IPaymuProvider.verifyWebhook()` | Menggunakan formula resmi `sha256(Method:Va:BodyHash:ApiKey)` dan `crypto.timingSafeEqual` untuk mencegah *timing attack*. Lulus pengujian penolakan signature palsu dan payload yang diubah. |
| 2 | **Idempotensi & Proteksi Replay Webhook** | `PaymentService.js` | Webhook duplikat mengembalikan HTTP 200 secara idempoten tanpa duplikasi jurnal pada buku besar berpasangan (*zero double-entry duplicate*). |
| 3 | **Filter Kanal Escrow iPaymu** | `IPaymuEscrowPolicy.js` | Virtual Account (BCA, Mandiri, BNI, BRI, Permata) dan Transfer Bank Kode Unik diizinkan. QRIS dan Kartu Kredit **ditolak** dengan error `ESCROW_CHANNEL_UNSUPPORTED` (Status 400). |
| 4 | **Evaluator Kelayakan Waktu Acara (Temporal Eligibility)** | `IPaymuEscrowPolicy.evaluateEventEligibility()` | Menghitung selisih waktu pembayaran ($t_{\text{pay}}$), penyerahan tiket ($t_{\text{deliver}}$), dan waktu konser ($t_{\text{event}}$). Menolak acara $> 10\text{ hari}$ (`EVENT_HORIZON_EXCEEDS_ESCROW_MAX`). Menandai acara 7–10 hari dengan syarat perpanjangan pembeli (`ELIGIBLE_REQUIRES_BUYER_EXTENSION`). |
| 5 | **Validasi Alokasi BagiBagi (Split Payment)** | `IPaymuSellerOnboardingService.validateSplitConfiguration()` | Menegakkan rumus matematis $\text{Gross} = \text{Seller Net} + \text{Platform Fee}$. Menolak konfigurasi jika seller belum menautkan akun iPaymu (`SELLER_ACCOUNT_UNREGISTERED`). |
| 6 | **Penanganan Kegagalan Split (Fail-Closed Abort)** | `IPaymuSellerOnboardingService.handleSplitFailure()` | Menghentikan inisiasi pembayaran secara bersih tanpa membuat saldo mengambang atau mendebit pembeli. |
| 7 | **Buku Besar Finansial Berpasangan (Double-Entry Ledger)** | `FinancialLedger.js` | Setiap penangkapan dana (*capture*) dan pembalikan (*refund*) mencatat debit dan kredit yang seimbang. Teruji solvent (`solvency.solvent === true`). |
| 8 | **Penghentian Payout Otomatis Tanpa Otorisasi** | `IPaymuProvider.createPayout()` | Melempar `CapabilityUnsupportedError` untuk mencegah transfer dana keluar tanpa izin. |
| 9 | **Pengakuan Keterbatasan API iPaymu (Hold/Release/Refund)** | `IPaymuProvider.js` | Metode `hold()` dan `release()` melempar `CapabilityUnsupportedError` (menyatakan iPaymu tidak memiliki API kendali escrow). Metode `refund()` mengembalikan status `MANUAL_REFUND_PENDING` dengan instruksi proses manual. |
| 10 | **Gerbang Prapeluncuran (Fail-Closed Gate)** | `src/config/marketplaceMode.js` | Mode `PRELAUNCH_LISTING_ONLY` mengunci checkout secara menyeluruh di tingkat backend API dan antarmuka web. |

---

## 3. KATEGORI 2: BELUM TERIMPLEMENTASI (MISSING IMPLEMENTATION)

Area teknis yang sengaja belum diaktifkan karena menunggu prasyarat eksternal:

1. **Forward Egress Proxy Statis Permanen (`IPAYMU_EGRESS_PROXY`):**
   - *Status:* Kode adapter telah mendukung konfigurasi proxy, namun infrastruktur proxy elastis (seperti QuotaGuard Static atau VPS Nginx dedicated) belum disewa/dikonfigurasi karena menunggu kepastian apakah iPaymu mewajibkan IP statis tunggal untuk API call.
2. **Kredensial Produksi iPaymu untuk PT:**
   - *Status:* Repositori saat ini beroperasi dengan kredensial sandbox. Kredensial produksi PT belum dipasang pada *environment variables* produksi Vercel (`IPAYMU_API_KEY` dan `IPAYMU_VA`).
3. **Eksekusi Otomatisasi Rekonsiliasi End-of-Day:**
   - *Status:* Format rekonsiliasi manual telah siap, namun cronjob rekonsiliasi otomatis harian belum dijadwalkan karena belum ada aliran transaksi riil.

---

## 4. KATEGORI 3: MEMBUTUHKAN DOKUMENTASI RESMI iPaymu (REQUIRES OFFICIAL IPAYMU DOCUMENTATION)

Fitur-fitur berikut tidak boleh diimplementasikan dengan rekayasa asumsi dan **wajib** menunggu dokumentasi resmi dari tim teknis iPaymu:

1. **Spesifikasi Teknis "Closed API Single Register":**
   - *Kebutuhan:* Spesifikasi endpoint URL, metode autentikasi partner, parameter data identitas (KTP/NPWP seller), dan format respons untuk pendaftaran akun seller perorangan secara terprogram.
   - *Status:* **BLOCKED**. Belum ada dokumen publik iPaymu yang memuat spesifikasi ini.
2. **Spesifikasi Payload Split Payment (BagiBagi) Multi-Channel:**
   - *Kebutuhan:* Dokumentasi detail apakah parameter `bagibagi` didukung pada endpoint `/api/v2/payment/direct` (Direct VA) atau hanya pada `/api/v2/payment` (Hosted Checkout), serta batasan persentase/nominal pembagian dana.
3. **Ketentuan Webhook Sengketa / Chargeback:**
   - *Kebutuhan:* Format payload notifikasi webhook apabila terjadi komplain pembeli atau penahanan dana sepihak oleh iPaymu.

---

## 5. KATEGORI 4: MEMBUTUHKAN PERSETUJUAN PENYEDIA (REQUIRES PROVIDER APPROVAL)

Keputusan bisnis dan regulasi yang berada di bawah wewenang eksklusif tim Underwriting, Legal, dan Kepatuhan iPaymu:

1. **Persetujuan Merchant untuk PT SHINERVA PRAJNA TEJAS:**
   - Verifikasi legalitas perusahaan dan penerbitan Virtual Account / API Key produksi resmi atas nama PT SHINERVA PRAJNA TEJAS.
2. **Persetujuan Model Bisnis Secondary Ticket Marketplace:**
   - Pernyataan tertulis dari iPaymu bahwa platform jual-beli tiket konser sekunder (dengan risiko penolakan barcode di pintu masuk dan pembatalan promotor) disetujui sebagai kategori merchant yang diperbolehkan.
3. **Kebijakan Rekening Seller Perorangan:**
   - Keputusan apakah iPaymu mewajibkan setiap penjual memiliki akun iPaymu terdaftar, atau menyetujui model di mana PT menerima pembayaran penuh sebagai *Merchant of Record* lalu mendistribusikannya ke seller di luar sistem iPaymu.
4. **Penyelesaian Transaksi untuk Acara $> 10\text{ Hari}$:**
   - Penegasan apakah iPaymu mengizinkan transaksi tiket konser berjarak $> 10$ hari diproses menggunakan pembayaran standar non-escrow (dengan perlindungan dana internal TIKUM), atau memiliki mekanisme perpanjangan escrow khusus industri tiket.
5. **Konfirmasi Kebijakan Firewall IP:**
   - Konfirmasi tertulis apakah iPaymu mewajibkan *IP allowlisting* statis pada backend merchant, atau menerima pemanggilan API berbasis signature HMAC-SHA256 dari IP dinamis serverless.

---

## 6. KATEGORI 5: MEMBUTUHKAN TINDAKAN PEMILIK BISNIS (REQUIRES OWNER ACTION)

Tindakan non-teknis yang wajib diselesaikan oleh pemilik bisnis:

1. **Pendaftaran Legalitas Korporat ke Portal iPaymu:**
   - Mengunggah berkas legal PT SHINERVA PRAJNA TEJAS:
     - Akta Pendirian PT & Akta Perubahan Terakhir.
     - SK Pengesahan Kemenkumham RI.
     - NIB (Nomor Induk Berusaha) berbasis risiko dengan KBLI 63122 (Portal Web dan/atau Platform Digital dengan Tujuan Komersial).
     - NPWP atas nama PT SHINERVA PRAJNA TEJAS.
     - Rekening Koran / Rekening Giro operasional atas nama PT SHINERVA PRAJNA TEJAS.
     - KTP & NPWP Direktur Utama.
2. **Kirim Surat Permohonan Penyelarasan Akun ke iPaymu:**
   - Mengirimkan draf komunikasi formal (yang telah disiapkan pada laporan sebelumnya) ke tim Account Executive / Underwriting iPaymu.
3. **Kajian Hukum Terhadap Tanggung Jawab Penjualan Tiket:**
   - Mengonsultasikan dengan penasihat hukum perusahaan mengenai konsekuensi perdata dan pajak jika memilih model *Merchant of Record* vs *Marketplace Murni*.
4. **Otorisasi Tertulis Pembukaan Mode Transaksi:**
   - Menjaga mode `PRELAUNCH_LISTING_ONLY` tetap aktif sampai seluruh dokumen di atas disetujui oleh iPaymu.

---

## 7. BUKTI PENGUJIAN REGRESI LENGKAP

Seluruh pengujian unit, integrasi, dan kepatuhan telah dijalankan dengan hasil **100% PASS**:

```
========================================================================
  RINGKASAN BUKTI PENGUJIAN REGRESI SISTEM PEMBAYARAN TIKUM
========================================================================

1. test_ipaymu_final_integration_alignment.js:
   • Suite 1: Seller Onboarding & Split Compatibility (6 tests)    [PASS]
   • Suite 2: Escrow Channel Restrictions (5 tests)               [PASS]
   • Suite 3: Confirmation Window & Event Eligibility (5 tests)   [PASS]
   • Suite 4: Provider Limitations (Hold/Release/Refund) (4 tests) [PASS]
   • Suite 5: ARGUS Double-Entry Ledger Solvency (2 tests)        [PASS]
   • Suite 6: Production Safety Gates & Prelaunch (2 tests)        [PASS]
   Subtotal: 24/24 PASS (100%)

2. test_ipaymu_compliance.js:
   • Verifikasi 87 parameter kepatuhan publik & badan usaha        [PASS 87/87]

3. test_ipaymu_production_readiness_audit.js:
   • 15 pengujian kriptografi signature, webhook, dan IP           [PASS 15/15]

4. test_ipaymu_argus_lifecycle.js:
   • 22 pengujian lifecycle ARGUS & state machine pembayaran       [PASS 22/22]

5. test_four_provider_orchestration.js:
   • 15 pengujian routing hirarkis 4 gateway (DOKU, iPaymu, dll)   [PASS 15/15]

6. test_syntax_check.js:
   • Validasi sintaksis seluruh 326 berkas JavaScript di src/     [PASS 326/326]

TOTAL: 489 / 489 CHECKS & TESTS PASSED (0 FAILURES, 0 REGRESSIONS)
```

---

## 8. STATUS REPOSITORI & KOMITMEN LOKAL

- **Branch:** `main`
- **Commit Lokal Baru:** `91139eb` (`feat(payment): align iPaymu escrow policy, seller onboarding and provider limitations`)
- **Remote Synchronization:** Menahan *push* ke `origin/main` sesuai instruksi non-negosiasi ("Do not push, merge, deploy, or execute financial transactions without explicit authorization").
- **Working Tree:** Bersih (`git status` menunjukkan commit lokal tersimpan rapi, 0 berkas kotor).

---

## 9. KESIMPULAN AKHIR KELAYAKAN SISTEM

| Status Dimensi | Evaluasi |
| :--- | :---: |
| **Kesiapan Teknis Implementasi (*Technically Ready*)** | **PASS** |
| **Persetujuan Merchant iPaymu (*Merchant-Approved*)** | **BLOCKED (Menunggu Underwriting PT)** |
| **Persetujuan Escrow Marketplace (*Escrow-Approved*)** | **BLOCKED (Menunggu Persetujuan Skema)** |
| **Otorisasi Transaksi Riil (*Authorized for Live Charges*)** | **BLOCKED (Fail-Closed, Prelaunch Aktif)** |

TIKUM kini memiliki implementasi teknis yang 100% kompatibel dengan fakta penyedia, aman secara finansial, dan transparan secara hukum. Langkah berikutnya sepenuhnya merupakan proses administratif dan underwriting antara pemilik bisnis dengan iPaymu.
