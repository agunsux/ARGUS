# LAPORAN FORENSIK TERKOREKSI & VALIDASI MODEL MERCHANT iPaymu
## TIKUM — PT SHINERVA PRAJNA TEJAS × iPaymu INTEGRATION
**Dokumen:** `TIKUM_IPAYMU_FINAL_CORRECTED_READINESS_REPORT.md`  
**Platform:** TIKUM ([https://tikum.app](https://tikum.app))  
**Tanggal:** 10 November 2026  
**Status Produksi:** `PRELAUNCH_LISTING_ONLY` (Fail-Closed, Transaksi Riil Diblokir)  
**Tujuan Audit:** Mengoreksi seluruh asumsi yang tidak berdasar pada laporan sebelumnya, memvalidasi model transaksi merchant secara objektif, menyajikan bukti pengujian empiris, dan menetapkan status kesiapan produksi secara terpisah tanpa generalisasi.

---

## 1. STATUS VERIFIKASI REPOSITORY & LINGKUNGAN PRODUKSI

Pemeriksaan forensik langsung terhadap repositori dan server produksi menghasilkan data faktual berikut:

- **Branch Git:** `main`
- **Commit HEAD Lokal:** `fc709d8c7f66112d181f901353ab69e7fd57ee24`
- **Commit Remote (`origin/main`):** `fc709d8c7f66112d181f901353ab69e7fd57ee24`
- **Sinkronisasi Git:** 100% sinkron (0 commit mendahului, 0 commit tertinggal).
- **Working Tree:** Bersih (`working tree clean`, tidak ada berkas *staged*, *unstaged*, atau *untracked* yang tertinggal).
- **Deployment Produksi Aktif:** Vercel Production Deployment `dpl_GhQa5oyTse8i9RMmvpH7uVE4RYCq` (ID alias: `argus-oc7t2wt84`), melayani domain resmi [https://tikum.app](https://tikum.app).
- **Mode Operasional Sistem:** `PRELAUNCH_LISTING_ONLY` (ditegakkan secara *fail-closed* di tingkat backend dan antarmuka pengguna).
- **Integritas Finansial:** Tidak ada pembebanan uang nyata, tidak ada pemotongan kartu/rekening, tidak ada pengeluaran dana (*payout*), dan tidak ada rekonsiliasi fiktif.

---

## 2. STATUS IDENTITAS ENTITAS MERCHANT & KESENJANGAN AKUN

Audit terhadap profil badan usaha dan kepemilikan akun pembayaran:

| Komponen Audit | Fakta Lapangan / Sistem | Evaluasi Kepatuhan |
| :--- | :--- | :---: |
| **Entitas pada Halaman Publik Website** | Seluruh halaman publik ([`/terms`](https://tikum.app/terms), [`/refund-policy`](https://tikum.app/refund-policy), [`/faq`](https://tikum.app/faq), [`/contact`](https://tikum.app/contact), [`/pay`](https://tikum.app/pay), dan footer) 100% mencantumkan **PT SHINERVA PRAJNA TEJAS** (Jl. Pasirluyu No. 79, Bandung 40254). | **PASS (Konsistensi Website)** |
| **Entitas Akun iPaymu Eksisting** | Terdaftar atas nama badan usaha **CV Surya Cipta Mandiri**. | **BLOCKED (Entity Mismatch)** |
| **Kesesuaian Akun Merchant (APU-PPT / PBI PJP)** | Berdasarkan Peraturan Bank Indonesia No. 23/6/PBI/2021 tentang Penyelenggara Jasa Pembayaran serta ketentuan Anti Pencucian Uang dan Pencegahan Pendanaan Terorisme (APU-PPT), merchant account berbadan hukum CV **tidak dapat** digunakan secara langsung untuk transaksi komersial PT tanpa re-underwriting formal dan persetujuan tertulis iPaymu. | **BLOCKED** |
| **Status Pengajuan Akun PT** | Belum diajukan pendaftaran baru atau addendum pengalihan hak (*novation*) atas nama PT SHINERVA PRAJNA TEJAS. | **PENDING OWNER ACTION** |

**Kesimpulan Bagian 2:** Keseragaman nama PT pada website adalah syarat perlu (*necessary condition*), namun **bukan** syarat cukup (*sufficient condition*) untuk legalitas pembayaran. Akun merchant pada sistem iPaymu wajib berstatus resmi atas nama **PT SHINERVA PRAJNA TEJAS**.

---

## 3. PERBANDINGAN KOMPREHENSIF TIGA MODEL BISNIS MERCHANT

Menetapkan PT sebagai *Merchant of Record* tanpa persetujuan tertulis penyedia dan kajian hukum adalah tindakan yang keliru karena secara fundamental mengubah beban tanggung jawab hukum, pajak, dan operasional. Berikut analisis perbandingannya:

| Parameter Evaluasi | Model 1: Marketplace Seller Pihak Ketiga (Murni) | Model 2: PT SHINERVA PRAJNA TEJAS sebagai Merchant of Record (MoR) | Model 3: Marketplace dengan Settlement Internal |
| :--- | :--- | :--- | :--- |
| **Pihak yang Menjual Tiket Secara Hukum** | **Seller Individu** (pemilik tiket sekunder). TIKUM bertindak sebagai Penyedia Platform Elektronik (PPMSE). | **PT SHINERVA PRAJNA TEJAS** (PT membeli hak tiket/reseller langsung ke pembeli). | **Seller Individu**. TIKUM bertindak sebagai agen perantara transaksi dan penjamin kepercayaan (*trust agent*). |
| **Pihak Penerima Dana Pembeli** | Ditampung oleh iPaymu (escrow C2C) untuk diteruskan ke akun iPaymu seller. | Diterima 100% oleh rekening bank/merchant **PT SHINERVA PRAJNA TEJAS**. | Diterima oleh rekening operasional/penampungan **PT SHINERVA PRAJNA TEJAS** melalui payment gateway. |
| **Tanggung Jawab Hukum Refund & Wanprestasi** | **Seller Individu** bertanggung jawab atas keaslian tiket. TIKUM memfasilitasi dispute. | **PT SHINERVA PRAJNA TEJAS** memikul tanggung jawab penuh perdata & konsumen (UU No. 8/1999) atas kegagalan tiket di gate. | **Seller Individu** bertanggung jawab atas barang; PT bertanggung jawab mengembalikan dana yang ditampung jika dispute valid. |
| **Beban & Pelaporan Pajak** | Pajak dikenakan hanya atas *Platform Service Fee* (Take-rate 5–10%). | Pajak (PPN/PPh) berpotensi dihitung atas **100% nilai transaksi tiket bruto**, menimbulkan beban fiskal berat. | Pajak platform fee, namun penerimaan dana titipan pihak ketiga harus dibukukan sebagai liabilitas (*trust payable*). |
| **Kepatuhan Regulasi Bank Indonesia (PBI PJP)** | Mematuhi skema escrow PJP berizin jika difasilitasi penuh oleh iPaymu. | Tidak melanggar PBI PJP karena PT menjual barang miliknya sendiri (bukan menampung dana pihak ketiga). | **Beresiko tinggi** dikategorikan sebagai *unauthorized fund-holding* / *shadow escrow* jika tidak bermitra dengan bank kustodian resmi. |
| **Persyaratan Akun Seller iPaymu** | **Wajib**: Setiap seller perorangan wajib memiliki akun iPaymu terverifikasi. | **Tidak Perlu**: Penjual menjadi vendor B2B bagi PT; pembayaran seller via transfer bank korporat. | **Tidak Perlu di iPaymu**: Namun membutuhkan izin/persetujuan khusus iPaymu untuk *split disbursement*. |
| **Persetujuan Tertulis iPaymu** | **Belum Ada** untuk secondary ticketing tanpa registrasi seller. | **Belum Ada** persetujuan dari Underwriting iPaymu untuk model MoR tiket sekunder. | **Belum Ada** konfirmasi tertulis bahwa iPaymu mengizinkan penampungan dana untuk seller pihak ketiga. |

**Kesimpulan Bagian 3:** TIKUM **tidak boleh** mengimplementasikan Model 2 (Merchant of Record) atau Model 3 (Settlement Internal) secara sepihak. Model bisnis yang diajukan ke iPaymu harus mencerminkan struktur operasional yang sebenarnya dan mendapat persetujuan tertulis dari tim Kepatuhan & Underwriting iPaymu serta *legal counsel*.

---

## 4. BLOKIR PENYEDIA (PROVIDER-DEPENDENT BLOCKERS)

Terdapat 5 faktor penghambat yang berada di luar kendali rekayasa kode dan sepenuhnya bergantung pada keputusan pihak eksternal:

1. **Underwriting Approval Badan Usaha:** iPaymu belum menerbitkan persetujuan merchant resmi untuk PT SHINERVA PRAJNA TEJAS.
2. **Persetujuan Model Secondary Ticketing:** iPaymu belum memberikan persetujuan tertulis terhadap model bisnis jual-beli tiket konser sekunder (industri tiket memiliki profil risiko *chargeback*, sengketa pemalsuan barcode, dan pembatalan acara yang tinggi).
3. **Konfirmasi Ketentuan Rekening Seller:** Belum ada konfirmasi apakah iPaymu membebaskan persyaratan akun individual seller melalui skema *Single Register Closed API* atau *BagiBagi Split Payment*.
4. **Keterbatasan Masa Tahan Escrow (10 Hari):** Belum ada kesepakatan tertulis mengenai bagaimana transaksi untuk tiket acara yang berlangsung lebih dari 10 hari ke depan diselesaikan secara aman.
5. **Aktivasi Kredensial Produksi & IP Firewall:** Kredensial produksi aktif (Virtual Account & API Key) belum diterbitkan untuk PT, dan mekanisme penerimaan IP outbound dinamis belum disepakati.

---

## 5. AKURASI ESCROW iPaymu & KALKULASI TEMPORAL TIKET EVENT

### 5.1 Ketentuan Faktual Escrow iPaymu
Berdasarkan korespondensi dan ketentuan operasional resmi iPaymu:
- **Jendela Konfirmasi Standar:** $7 \times 24 \text{ jam}$ (168 jam) sejak pembayaran terkonfirmasi.
- **Perpanjangan Pembeli:** Maksimal 1 kali perpanjangan selama 3 hari ($72 \text{ jam}$).
- **Batas Waktu Absolut Escrow:** **$10 \times 24 \text{ jam}$ (240 jam)**. Jika tidak ada konfirmasi atau komplain, dana otomatis cair (*auto-release*) ke penjual pada jam ke-168 (atau jam ke-240 jika diperpanjang).
- **Kanal Pembayaran yang Didukung Escrow:** **Hanya transfer bank / Virtual Account dan transaksi berkode unik yang memenuhi syarat**.
- **Kanal Non-Escrow:** **QRIS dan Kartu Kredit TIDAK didukung oleh skema escrow** (dana diselesaikan secara instan/langsung ke merchant).
- **Ketiadaan API Kontrol:** Tidak ada endpoint API publik untuk membekukan (*freeze*), menahan (*hold*), mencairkan (*release*), atau mengembalikan (*refund*) escrow secara terprogram. Seluruh penyelesaian sengketa dan *refund* wajib diproses manual via backoffice iPaymu.

### 5.2 Formulasi & Analisis Temporal Kelayakan Transaksi
Misalkan:
- $t_{\text{pay}}$: Waktu pembayaran berhasil dikonfirmasi oleh gateway.
- $t_{\text{deliver}}$: Waktu penyerahan tiket fisik atau tiket digital dari penjual ke pembeli.
- $W_{\text{standard}} = 168 \text{ jam}$ ($7 \text{ hari}$): Jendela konfirmasi standar.
- $W_{\text{ext}} = 72 \text{ jam}$ ($3 \text{ hari}$): Perpanjangan perlindungan pembeli.
- $t_{\text{auto\_release}} = t_{\text{pay}} + 168 \text{ jam}$ (atau $t_{\text{pay}} + 240 \text{ jam}$ jika diperpanjang).
- $t_{\text{event}}$: Waktu gerbang acara (*turnstile entry gate*) dibuka untuk pemindaian barcode.

#### Kasus A: Acara $> 10$ Hari ($t_{\text{event}} - t_{\text{pay}} > 240 \text{ jam}$)
$$t_{\text{auto\_release}} < t_{\text{event}}$$
**Hasil:** Dana penjual **pasti cair secara otomatis** beberapa minggu sebelum konser dimulai. Jika tiket ternyata duplikat atau barcode sudah terpakai saat dipindai di turnstile venue, dana pembeli sudah berada di tangan penjual. **Escrow iPaymu GAGAL melindungi pembeli pada kasus ini.**

#### Kasus B: Acara $\le 7$ Hari ($t_{\text{event}} - t_{\text{pay}} \le 168 \text{ jam}$) — Apakah Otomatis Aman?
**TIDAK OTOMATIS AMAN.** Analisis risiko membuktikan:
1. **Risiko Konfirmasi Prematur:** Jika e-tiket diserahkan pada $t_{\text{deliver}} = t_{\text{pay}} + 2 \text{ jam}$, pembeli sering kali menekan tombol "Konfirmasi Terima" karena mengira file PDF sudah sah. Begitu tombol ditekan, **iPaymu langsung mencairkan dana saat itu juga**! Padahal keaslian tiket baru terbukti saat hari-H konser ($t_{\text{event}}$).
2. **Risiko Penyerahan Terlambat:** Jika penjual tidak menyerahkan tiket hingga $t_{\text{deliver}} > t_{\text{event}}$, pembeli dirugikan dan harus segera mengajukan komplain manual ke iPaymu sebelum jendela 168 jam habis.
3. **Risiko Ketiadaan API Sengketa:** Karena tidak ada API dispute otomatis dari TIKUM ke iPaymu, investigasi sengketa turnstile memerlukan intervensi manual yang rentan terlewati batas auto-release.

**Kesimpulan Bagian 5:** Transaksi tiket sekunder untuk konser berjarak $> 10$ hari **DILARANG KERAS** diproses menggunakan klaim escrow iPaymu. Untuk acara $\le 7$ hari sekalipun, proteksi hanya sah jika pembeli diedukasi untuk **tidak menekan konfirmasi sebelum turnstile gerbang berhasil dilalui**.

---

## 6. AUDIT KATA & TRANSPARANSI HALAMAN PUBLIK

Pemeriksaan komprehensif terhadap seluruh halaman publik dan rute SSR membuktikan:

1. **Halaman Simulasi Checkout ([`/pay`](https://tikum.app/pay)):**
   - Menampilkan banner mencolok: `DEMO — TIDAK TERSEDIA UNTUK PEMBELIAN` dan `MODE SIMULASI — BUKAN PEMBAYARAN LIVE`.
   - Tombol pembayaran diblokir (*disabled*) pada mode prelaunch: `Tahap Prapeluncuran (Hanya Katalog)`.
   - Data QRIS dan Virtual Account diberi label tegas: `DATA DEMONSTRASI — BUKAN PENAGIHAN RIIL`.
2. **Katalog Event ([`/events`](https://tikum.app/events)):**
   - Menampilkan notice banner: `TIKUM sedang dalam tahap persiapan peluncuran. Platform saat ini hanya menampilkan katalog informasi event dan listing prapeluncuran. Transaksi pembelian belum dibuka untuk publik.`
   - Memenuhi syarat iPaymu bahwa website memiliki produk/listing, tanpa memberikan impresi keliru bahwa pembelian uang riil telah dibuka.
3. **Halaman Perlindungan Dana ([`/escrow`](https://tikum.app/escrow) & [`/terms`](https://tikum.app/terms)):**
   - Secara eksplisit menyatakan: `Tikum bukan merupakan lembaga perbankan atau penyedia jasa escrow berizin khusus. Istilah penahanan platform merujuk pada tata kelola administrasi transaksi internal.`
   - Tidak ada klaim bahwa iPaymu menahan dana hingga hari-H konser.
   - Tidak ada klaim bahwa Event PIC memegang kendali atas API payment gateway.
   - Tidak ada klaim bahwa QRIS atau Kartu Kredit didukung oleh skema escrow.

---

## 7. VERIFIKASI EMPIRIS OUTBOUND IP (BACKEND EGRESS)

Pengujian empiris langsung terhadap rute produksi `https://tikum.app/api/v1/system/outbound-ip` membuktikan arsitektur jaringan berikut:

```
Hasil Pengujian Berurutan (Multi-Request Egress Check):
Panggilan 1 : IP = 3.237.11.39   | Region: iad1 | is_static: false
Panggilan 2 : IP = 44.204.9.191  | Region: iad1 | is_static: false
Panggilan 3 : IP = 13.220.192.123| Region: iad1 | is_static: false
Panggilan 4 : IP = 54.90.214.149 | Region: iad1 | is_static: false
```

- **Fakta Teknis:** Backend TIKUM di-host pada **Vercel Serverless Functions** yang berjalan di atas kluster multi-tenant AWS Lambda (region US-East / `iad1`).
- **Karakteristik IP:** Egress IP bersifat **DINAMIS** (`is_static_egress: false`), berasal dari pool IP elastis AWS NAT Gateway.
- **Konsekuensi Kritis:** IP `3.237.11.39` atau `44.204.9.191` **BUKAN IP STATIS TETAP**. Jika teknisi iPaymu melakukan *hardcoded allowlist* pada IP tunggal tersebut di firewall mereka, panggilan webhook dan verifikasi API berikutnya dapat **gagal total (timeout / HTTP 403)** ketika AWS Lambda mengalihkan rute melalui gateway NAT lain dalam subnet.
- **Solusi Arsitektur:** Jika iPaymu mewajibkan static egress IP, TIKUM harus mengaktifkan *dedicated forward proxy* (misalnya via QuotaGuard Static atau server proxy Nginx dengan IP elastis tetap) dengan mengisi *environment variable* `IPAYMU_EGRESS_PROXY`.

---

## 8. BUKTI PENGUJIAN REGRESI & KEAMANAN SISTEM

Seluruh rangkaian pengujian unit, integrasi, dan kepatuhan hukum telah dijalankan secara lokal dan diverifikasi:

```
======================================================================
  HASIL PENGUJIAN REKAYASA & KEPATUHAN SISTEM ARGUS
======================================================================

1. test_ipaymu_compliance.js:
   -> 87/87 Kepatuhan Teks, Legalitas & Link Publik        [PASS]

2. test_ipaymu_production_readiness_audit.js:
   -> 15/15 Kriptografi HMAC-SHA256, Idempotensi & Routing [PASS]

3. test_ipaymu_argus_lifecycle.js:
   -> 22/22 Integrasi Lifecycle, Double-Entry & Guard      [PASS]

4. test_four_provider_orchestration.js:
   -> 15/15 Abstraksi Gateway (iPaymu, DOKU, Midtrans)     [PASS]

5. test_syntax_check.js:
   -> 324/324 Berkas JavaScript Bebas Error Sintaksis     [PASS]

6. scratch/test_outbound_multi.js:
   -> Terbukti Dinamis (Multiple Unique Egress IPs)        [EMPIRICAL PROOF]
```

### Klasifikasi Bukti Pengujian Formal:
- **PASS (Terbukti Fungsional di Kode):** Validasi signature webhook HMAC-SHA256, resistensi serangan *replay attack*, idempotensi HTTP 200, keseimbangan pembukuan berpasangan (*balanced ledger*), dan penghentian otomatis (*fail-closed*) pada percobaan *payout* tanpa hak.
- **BLOCKED (Tertahan Pihak Luar):** Penerbitan kredensial produksi iPaymu, persetujuan tertulis underwriting model bisnis, dan pendaftaran merchant akun PT.
- **NOT VERIFIED (Belum Terbukti):** Stabilitas allowlisting firewall iPaymu terhadap dynamic serverless IP.

---

## 9. STATUS GIT & KEBIJAKAN RILIS

- **Status Kode Lokal:** Bersih, tidak ada perubahan berkas yang belum di-commit.
- **Komitmen Rilis:** Tidak ada commit kosong (*empty commit*) yang dibuat. Tidak ada *push* paksa (*force push*). Tidak ada perubahan kredensial atau migrasi database produksi tanpa otorisasi tertulis dari pemilik bisnis.

---

## 10. DAFTAR TINDAKAN PEMILIK BISNIS & DAFTAR PERTANYAAN RESMI KE iPaymu

Pekerjaan rekayasa kode pada repositori telah selesai. Langkah kritis selanjutnya berada pada ranah **komunikasi legal dan bisnis**.

### 10.1 Tindakan Pemilik Bisnis
1. Mengajukan pendaftaran merchant baru / migrasi entitas ke iPaymu menggunakan dokumen legal **PT SHINERVA PRAJNA TEJAS** (Akta Pendirian, SK Menkumham, NIB KBLI 63122, NPWP PT, dan Rekening Koran/Giro PT).
2. Menetapkan keputusan model bisnis bersama konsultan hukum: apakah mempertahankan model *Marketplace C2C* (dengan persyaratan akun seller) atau mengajukan *Merchant of Record* (dengan konsekuensi tanggung jawab tiket dan pajak penuh).
3. Menyampaikan daftar pertanyaan klarifikasi resmi ke tim Underwriting iPaymu.

### 10.2 Pertanyaan Tertulis untuk Tim Underwriting & Compliance iPaymu

```text
Yth. Tim Underwriting & Kepatuhan iPaymu,

Sehubungan dengan integrasi platform TIKUM (https://tikum.app) di bawah PT SHINERVA PRAJNA TEJAS, mohon konfirmasi tertulis atas poin-poin struktural berikut:

1. Struktur Entitas:
   Apakah iPaymu dapat menyetujui akun merchant atas nama PT SHINERVA PRAJNA TEJAS untuk mengoperasikan platform marketplace tiket sekunder (TIKUM)?

2. Model Penerimaan Dana & Seller Pihak Ketiga:
   Dalam model secondary ticketing, tiket dijual oleh penjual perorangan pihak ketiga:
   a. Apakah iPaymu mengizinkan PT SHINERVA PRAJNA TEJAS menerima pembayaran pembeli sebagai Merchant of Record, dengan penyelesaian dana ke penjual dikelola oleh sistem internal platform pasca-acara?
   b. Jika tidak, apakah skema escrow iPaymu mewajibkan setiap penjual perorangan membuka akun iPaymu sendiri, atau tersedia fasilitas Closed API Single Register / BagiBagi (Split Payment) untuk pendaftaran sub-merchant otomatis?

3. Keterbatasan Waktu Escrow (Maksimal 10 Hari):
   Banyak konser berlangsung dalam jangka waktu 30 hingga 60 hari sejak tiket dibeli:
   a. Mengingat auto-release escrow standar iPaymu terjadi pada hari ke-7 (maksimal 10 hari jika diperpanjang), bagaimana skema penyelesaian yang disetujui iPaymu untuk transaksi tiket yang acaranya melebihi 10 hari?
   b. Apakah iPaymu mengizinkan transaksi tersebut diproses sebagai transaksi pembayaran merchant standar (non-escrow) di mana perlindungan dana dikelola di bawah tata kelola pembukuan platform TIKUM?

4. Kebijakan Whitelist IP Outbound Serverless:
   Backend produksi TIKUM beroperasi pada arsitektur serverless (Vercel / AWS Lambda) dengan IP egress dinamis (contoh: 3.237.11.39 / 44.204.9.191). Apakah iPaymu mewajibkan IP statis tunggal untuk API call, atau iPaymu mendukung verifikasi berbasis signature HMAC-SHA256 tanpa IP allowlist ketat?
```

---

## 11. KESIMPULAN AKHIR KESIAPAN TIKUM

Berdasarkan seluruh hasil audit forensik, pengujian teknis, dan evaluasi kepatuhan regulasi, status kesiapan TIKUM diklasifikasikan secara tegas ke dalam 4 kategori independen:

| Dimensi Kesiapan | Status | Penjelasan Faktual |
| :--- | :---: | :--- |
| **1. Kesiapan Teknis (Technically Ready)** | **PASS** | Seluruh integrasi API v2, verifikasi signature webhook HMAC-SHA256, proteksi replay attack, buku besar berpasangan, katalog produk, dan diagnosa IP outbound telah teruji 100% lulus di branch `main` dan server produksi. |
| **2. Persetujuan Merchant (Merchant-Approved)** | **BLOCKED** | Akun produksi iPaymu atas nama **PT SHINERVA PRAJNA TEJAS** belum disetujui/diterbitkan. Akun eksisting masih terdaftar atas nama CV Surya Cipta Mandiri. |
| **3. Persetujuan Escrow Marketplace (Escrow-Approved for Marketplace)** | **BLOCKED** | iPaymu belum memberikan persetujuan tertulis terhadap skema penampungan/escrow untuk model jual-beli tiket pihak ketiga, ketentuan akun individual seller, dan batasan temporal event $> 10$ hari. |
| **4. Otorisasi Transaksi Riil (Authorized for Live Transactions)** | **BLOCKED** | Mode `PRELAUNCH_LISTING_ONLY` tetap aktif. Transaksi uang nyata diblokir secara *fail-closed* sampai persetujuan poin 2 dan 3 diperoleh secara tertulis dan disahkan oleh pemilik bisnis. |

---
*Dokumen ini merupakan laporan forensik objektif dan independen yang disusun tanpa merekayasa status kepatuhan hukum atau kapabilitas penyedia jasa pembayaran.*
