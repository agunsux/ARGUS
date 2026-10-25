# TIKUM / ARGUS — Data Migration & Source Recovery Assessment

**Date:** 2026-10-26 (Asia/Jakarta)  
**Epic:** TIKUM DATABASE MIGRATION — NEON → SUPABASE POSTGRESQL  
**Status:** Source Audit Completed & Data Reconstruction Path Documented (Phase 4 Complete)

---

## 1. Status Pemulihan Sumber Data (Neon PostgreSQL)

| Parameter | Status | Keterangan |
| :--- | :--- | :--- |
| **Koneksi TCP Direct (5432)** | **BLOCKED (53000)** | Quota exceeded: direct connection ditolak gateway |
| **Koneksi TCP Pooler (5432)** | **BLOCKED (53000)** | Quota exceeded: connection pooler ditolak gateway |
| **Neon Management HTTP API** | **BLOCKED (402)** | HTTP 402 Payment Required pada eksekusi SQL |
| **Live `pg_dump` Availability** | **NOT AVAILABLE** | Membutuhkan upgrade akun di Neon Console atau menunggu reset 1 Nov 2026 |

---

## 2. Analisis Klasifikasi & Rekonstruksi Data

Berdasarkan konteks bisnis: **"Belum ada transaksi riil yang harus dipertahankan dan listing masih dinamis"**, berikut audit klasifikasi data:

### A. Data Transaksi & Keuangan (Orders, Payments, Escrows, Settlements, Disputes)
- **Status di Neon:** Belum ada transaksi riil (hanya test fixtures & mock data dari pengujian sandbox).
- **Strategi:** Tabel keuangan di Supabase diinisialisasi bersih (*clean state*). Seluruh invariant double-entry ledger dan skema escrow siap menerima transaksi baru tanpa membawa sisa mock test lama.

### B. Data Katalog Event & Verifikasi Musisi
- **Sumber Rekonstruksi:**
  - File snapshot terverifikasi: [`src/discovery/fixtures/official_event_snapshot.json`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/discovery/fixtures/official_event_snapshot.json)
  - Modul kurasi primer: [`src/discovery/CanonicalEventRegistry.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/discovery/CanonicalEventRegistry.js)
  - Runner otomatis: [`scripts/run_catalog_refresh.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/scripts/run_catalog_refresh.js)
- **Status:** **DAPAT DIREKONSTRUKSI 100% SECARA DETERMINISTIK**. Semua 36 event terverifikasi dapat langsung di-seed ke tabel `canonical_events` di Supabase.

### C. Data Konten Blog & Edukasi
- **Sumber Rekonstruksi:**
  - Snapshot otoritatif: [`src/content/fixtures/articles_snapshot.json`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/content/fixtures/articles_snapshot.json)
  - Seed campaign & kurasi: [`src/content/seeds/curatedArticles.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/content/seeds/curatedArticles.js)
- **Status:** **TERLINDUNGI PENUH**. 33 artikel editorial lengkap tidak bergantung pada Neon karena dikelola via `DurableArticleStore`.

### D. Data Pengguna & Akun Admin
- **Sumber Rekonstruksi:**
  - Akun demo & admin baseline di-seed via `PostgresUserRepository.seedBaselineUsers()` dengan hashing `bcrypt` aman.
  - Untuk produksi, akun admin menggunakan variabel `ADMIN_PASSWORD` / `ARGUS_ADMIN_PASSWORD` yang diatur di Vercel.

### E. Dynamic Ticket Listings
- **Status:** Listing tiket resale di secondary market masih dinamis dan belum terikat kontrak transaksi berjalan.
- **Rekomendasi:** Ketika target Supabase aktif dan skema selesai dimigrasikan, listing dapat diinisialisasi ulang melalui portal penjual (`/sell`) atau seed partner resmi tanpa risiko *ghost inventory*.
