# TIKUM — LAPORAN KESIAPAN AKUISISI MITRA TIKET RESMI & AFILIASI
**Dokumen:** `docs/PARTNER_ACQUISITION_READINESS_REPORT.md`
**Klasifikasi:** Internal Operations & Commercial Strategy
**Tanggal Verifikasi:** 13 Oktober 2026
**Otoritas:** TIKUM / ARGUS Trust Infrastructure
**Prinsip Utama:** *Zero Fake Partners. No Fabricated Commissions. Truthful Technical Readiness.*

---

## 1. RINGKASAN EKSEKUTIF

TIKUM berevolusi menjadi pasar tiket hibrida (*hybrid ticket marketplace*) yang menggabungkan:
1. **Penemuan Tiket Resmi (Primary Official Tickets & Affiliate Sales):** Mengarahkan calon pembeli ke mitra resmi untuk event yang tiket primernya masih tersedia, dengan atribusi transparan dan pengalihan aman (*safe outbound redirect* via `/go/:partnerSlug/:offerId`).
2. **Pasar Sekunder Terverifikasi (Secondary Resale Marketplace):** Memfasilitasi jual beli tiket sekunder terverifikasi dengan rekening bersama (*escrow*), pendampingan operasional PIC di gate, dan protokol anti-penipuan ARGUS.

Laporan ini menyajikan hasil audit teknis dan komersial terhadap kandidat platform tiket utama di Indonesia guna mempersiapkan program kemitraan resmi dan afiliasi.

---

## 2. MATRIKS KESIAPAN MITRA (PARTNER READINESS MATRIX)

| Mitra | Tipe Entitas | Status Kesiapan | Tipe Integrasi Saat Ini | Pelaporan Konversi | Istilah Komisi | Kebutuhan Utama |
|---|---|---|---|---|---|---|
| **LOKET** (PT Global Tiket Network) | Primary Ticketing Platform | `READY_TO_APPLY` | `DIRECT_OFFICIAL_LINK` | Dashboard Export / Custom Webhook | `UNCONFIGURED` (Estimasi industri 1–3%, wajib MoU tertulis) | Pendaftaran program kemitraan B2B / affiliasi resmi |
| **Tiket.com** (PT Global Tiket Network / Blibli) | Online Travel Agent & Events | `READY_TO_APPLY` | `DIRECT_OFFICIAL_LINK` | Tiket.com Affiliate Network / HasOffers API | `UNCONFIGURED` (Kategori To-Do / Event memerlukan persetujuan khusus) | Akun Tiket Affiliate Publisher terverifikasi |
| **TipTip** (PT TipTip Komunitas Juara) | Community Ticketing & Creator Platform | `RESEARCH_REQUIRED` | `DIRECT_OFFICIAL_LINK` | Manual Reconciliation | `UNCONFIGURED` (Model bagi hasil promotor/kreator) | Kontak BD promotor & MoU kemitraan promosi |
| **Megatix Indonesia** (PT Megatix Asia) | Event Ticketing Platform | `RESEARCH_REQUIRED` | `DIRECT_OFFICIAL_LINK` | Custom Tracking / Manual Invoicing | `UNCONFIGURED` (Tidak ada program afiliasi publik; butuh reseller agreement) | Kontak direct business development |
| **Live Nation Asia** | International Promoter Network | `NOT_SUPPORTED` (Public Affiliate) | `DIRECT_OFFICIAL_LINK` | N/A (Kanal Promotor Langsung) | Non-komersial (Hanya tautan informasi resmi) | Hubungan korporat promotor |

---

## 3. AUDIT RINCI KANDIDAT MITRA

### A. LOKET (loket.com)
* **Badan Usaha:** PT Global Tiket Network (ekosistem GoTo / Blibli)
* **URL Resmi:** `https://www.loket.com`
* **Cakupan Pasar Indonesia:** Nasional (Jabodetabek, Surabaya, Bandung, Bali, Medan, Yogyakarta, dll.). Pangsa pasar festival musik dan konser arena terbesar di Indonesia.
* **Kategori Event:** Konser internasional (Pestapora, DWP, konser stadium), festival seni, seminar, olahraga.
* **Ketersediaan Program Afiliasi:**
  * LOKET tidak memiliki halaman self-service affiliate terbuka untuk umum.
  * Kemitraan media dan distribution ticketing ditangani melalui unit *LOKET Distribution Partner* atau ekosistem kemitraan promotor Boss Creator / Ismaya.
* **Mekanisme Pelacakan Teknis:**
  * Parameter URL standar mitra: `ref` atau `utm_source=tikum&utm_medium=affiliate&utm_campaign={event_slug}`.
  * Dukungan sub-ID: Memerlukan persetujuan custom query parameter dari tim teknis LOKET.
* **Pelaporan Konversi:**
  * Laporan berkala bulanan (*monthly reconciliation CSV*) atau integrasi webhook khusus mitra B2B berlisensi.
* **Status TIKUM Saat Ini:**
  * 4 event di katalog snapshot TIKUM menggunakan URL LOKET terverifikasi (`VERIFIED_OFFICIAL`).
  * Integrasi diatur sebagai `DIRECT_OFFICIAL_LINK` (non-afiliasi). TIKUM tidak mengklaim komisi atau tautan afiliasi sebelum perjanjian kemitraan resmi ditandatangani.

---

### B. Tiket.com (tiket.com)
* **Badan Usaha:** PT Global Tiket Network
* **URL Program:** `https://www.tiket.com/affiliate`
* **Cakupan Pasar Indonesia:** Nasional dan regional Asia Tenggara.
* **Kategori Event:** Atraksi, wahana, pertunjukan, konser musik (`Event & To-Do`).
* **Ketersediaan Program Afiliasi:**
  * Tersedia program Tiket Affiliate resmi dengan pendaftaran portal bisnis.
  * *Catatan Kritis:* Kategori konser musik bertiket eksklusif sering kali dikecualikan dari komisi standar atraksi (0.5%–2%) kecuali promotor secara eksplisit menyetujui anggaran atribusi pemasaran.
* **Mekanisme Pelacakan Teknis:**
  * Tautan afiliasi menggunakan domain tracking `go.tiket.com` atau parameter `slink` / `af_sub1={click_id}`.
* **Pelaporan Konversi:**
  * Dashboard portal publisher Tiket.com dengan siklus rekonsiliasi $T+30$ hari.
* **Status TIKUM Saat Ini:**
  * Telah dikonfigurasi sebagai partner di sistem TIKUM dengan domain allowlist `['tiket.com', 'www.tiket.com']`.
  * Status integrasi: `DIRECT_OFFICIAL_LINK` (pending approval publisher account).

---

### C. TipTip (tiptip.id)
* **Badan Usaha:** PT TipTip Komunitas Juara
* **URL Resmi:** `https://tiptip.id`
* **Cakupan Pasar Indonesia:** Komunitas kreatif, seminar daring/luring, konser independen, fan-meeting.
* **Ketersediaan Program Afiliasi:**
  * Memiliki fitur *Creator Affiliate* di dalam platform (kreator mempromosikan sesi kreatif), namun belum ada program terbuka untuk agregator pasar tiket sekunder.
* **Mekanisme Pelacakan:**
  * Referral code berbasis akun pengguna.
* **Status TIKUM Saat Ini:**
  * Terdaftar di registry TIKUM dengan status `ACTIVE` untuk direct link. Tautan dikelola sebagai `DIRECT_OFFICIAL_LINK`.

---

### D. Megatix Indonesia (megatix.co.id)
* **Badan Usaha:** PT Megatix Asia
* **URL Resmi:** `https://megatix.co.id`
* **Cakupan Pasar Indonesia:** Bali, Jakarta, Bandung (klub, festival musik elektronik, beach club events, konser lifestyle).
* **Ketersediaan Program Afiliasi:**
  * Tidak ada self-service affiliate portal. Penjualan tiket pihak ketiga harus melalui perjanjian keagenan resmi promotor (*official ticket promoter outlet*).
* **Status TIKUM Saat Ini:**
  * Domain `megatix.co.id` masuk allowlist. Status: `DIRECT_OFFICIAL_LINK`.

---

### E. Live Nation Asia (livenation.asia)
* **Badan Usaha:** Live Nation Entertainment
* **URL Resmi:** `https://www.livenation.asia`
* **Cakupan Pasar:** Asia Tenggara (Indonesia, Singapura, Malaysia, Thailand, Filipina).
* **Model Operasi:** Promotor utama (*tour promoter*). Live Nation tidak bertindak sebagai affiliate network; mereka mengarahkan pengunjung ke ticketing platform resmi yang ditunjuk di masing-masing kota (misalnya LOKET di Jakarta, Ticketmaster di Singapura).
* **Status TIKUM Saat Ini:**
  * Terdaftar sebagai `PROMOTER` di TIKUM. Tautan berfungsi sebagai portal navigasi otoritatif (`DIRECT_OFFICIAL_LINK`).

---

## 4. INVARIAN INTEGRITAS & PEMISAHAN KEUANGAN TIKUM

1. **Pemisahan Finansial Mutlak:**
   Transaksi tiket resmi berlangsung 100% di luar infrastruktur TIKUM. TIKUM tidak memotong dana, tidak menahan escrow, dan tidak menerbitkan tiket untuk pembelian tiket resmi primer.
2. **Nol Klaim Pendapatan Palsu:**
   Dashboard admin TIKUM menampilkan `Belum ada data konversi partner` jika belum ada bukti webhook atau laporan pembayaran komisi resmi dari mitra.
3. **Pencegahan Open-Redirect:**
   Semua tautan keluar melalui endpoint `/go/:partnerSlug/:offerId` divalidasi ketat terhadap allowlist domain resmi mitra. Tautan ke domain luar yang tidak terdaftar ditolak dengan pesan kesalahan HTTP 400.
4. **Perlindungan Data Pribadi (UU PDP):**
   TIKUM tidak pernah meneruskan data identitas pengguna (nama, email, nomor ponsel, NIK) ke URL pelacakan mitra. Hanya token `click_id` anonim dan tidak berulang yang digunakan.

---

## 5. LANGKAH KONKRET BERIKUTNYA UNTUK TIM BISNIS & OPERASIONAL

1. **Aplikasi Resmi Tiket.com Affiliate:**
   Mendaftarkan entitas bisnis resmi TIKUM/SHINERVA ke portal afiliasi Tiket.com untuk kategori To-Do & Event.
2. **Audiensi Kemitraan Distribusi LOKET:**
   Mengajukan proposal integrasi resmi ke tim kemitraan B2B LOKET sebagai portal penemuan (*discovery engine*) terverifikasi untuk mengarahkan traffic pembeli konser.
3. **Pembaruan Konfigurasi Admin Pasca-Persetujuan:**
   Setelah MoU atau persetujuan akun publisher diperoleh:
   * Perbarui status integrasi di Admin Control Center (`/admin`) dari `DIRECT_OFFICIAL_LINK` menjadi `APPROVED_AFFILIATE_LINK`.
   * Masukkan parameter pelacakan resmi (`sub_id` / `af_sub1`) dan persentase komisi yang disepakati ke `commission_config`.
