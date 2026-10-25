# TIKUM / ARGUS — Supabase Migration Execution Plan & Pre-Flight Audit

**Tanggal:** 26 Oktober 2026 (Asia/Jakarta)  
**Target:** Migrasi Database TIKUM dari Neon ke Supabase PostgreSQL  
**Repository:** ARGUS  
**Production Domain:** `https://tikum.app`  
**Status Gate:** AWAITING_SUPABASE_PROVISIONING (Menunggu pembuatan project di Supabase Console)

---

## 1. Audit Ketersediaan Proyek Supabase

Hasil inspeksi Supabase CLI (`npx supabase projects list`):
- `rgkrfzxipkrwqccfuqfq` (`HandicapLab` — Region `ap-southeast-2` Sydney): **STRICT EXCLUSION — JANGAN DISENTUH.**
- `uldyyzarmoslfvdyysoi` (`agunsux's Project` — Region `ap-northeast-2` Seoul): **INACTIVE.**
- `xsiobpqrttiggqhghibb` (`supabase-cobalt-saddle` — Region `us-east-1`): **INACTIVE.**

**Temuan:** Proyek database khusus untuk **TIKUM** belum tersedia di Supabase.

---

## 2. Tindakan Minimum di Supabase Console

Pengguna perlu membuat proyek database baru melalui [Supabase Dashboard](https://supabase.com/dashboard) dengan parameter berikut:

1. **Organization:** Pilih `SHINERVA` (`oodkibcemzwvbmhqrsat`).
2. **Project Name:** `tikum-db` (atau `argus-db`).
3. **Database Password:** Generate password yang kuat (simpan di password manager, **jangan dibagikan ke publik atau chat**).
4. **Region:** **`ap-southeast-1` (Singapore)** *(Wajib untuk latensi <20ms ke Edge Vercel & pengguna di Indonesia)*.
5. **Ambil Connection URI:**
   - Masuk ke **Project Settings > Database > Connection string > URI**.
   - **Mode Transaction Pooler (Port 6543):**
     `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&supavisor=true`
   - **Mode Direct (Port 5432):**
     `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require`

---

## 3. Audit Skrip Migrasi (`scripts/migrate_all_schemas.js`) & SQL Files

Kami telah mengaudit dan menyempurnakan `scripts/migrate_all_schemas.js`:

1. **Schema History Tracking:**
   - Menambahkan tabel `schema_migrations` dengan tracking `version`, `name`, `applied_at`, `checksum` (SHA-256), dan `execution_time_ms`.
   - Bersifat idempotent: jika migrasi sudah pernah diterapkan, skrip otomatis melewati (`[SKIP]`).
2. **Koreksi Discrepancy Nama Tabel:**
   - Mengoreksi penamaan tabel `affiliate_clicks` (sebelumnya tercatat `affiliate_click_events`).
   - Menambahkan `affiliate_conversions` dan `partner_audit_logs` ke daftar verifikasi schema.
   - Total tabel target bertambah menjadi **34 tabel**.
3. **Kompatibilitas Transaction Pooler:**
   - DDL dibungkus per-file dalam blok transaksi `BEGIN ... COMMIT` tanpa prepared statement yang bergantung pada session state.
4. **Urutan Topologis Schema (Topological Order):**
   - `000_user_and_auth_schema` (users, user_roles, sessions, auth_audit_events)
   - `001_catalog_schema` (canonical_events, source_snapshots, event_source_links, reconciliation_runs, discovery_scheduler_state)
   - `002_marketplace_and_money_schema` (marketplace_tickets, marketplace_listings, marketplace_reservations, marketplace_deliveries, financial_quotes, financial_orders, financial_payments, financial_payment_attempts, financial_provider_webhooks, financial_escrows, financial_settlements, financial_disputes, financial_chargebacks, financial_ledger_transactions, financial_ledger_entries, financial_idempotency_records)
   - `003_demand_alerts_schema` (demand_alerts)
   - `004_marketplace_offers_schema` (marketplace_negotiations, marketplace_offers, marketplace_offer_audit_logs)
   - `005_affiliate_partners_schema` (ticketing_partners, event_partner_offers, affiliate_clicks, affiliate_conversions, partner_audit_logs)

---

## 4. Audit Data Rekonstruksi vs Data Tidak Terpulihkan (Neon Lockout)

### Data yang Dapat Direkonstruksi Secara Deterministik:
1. **Katalog Event:** `src/discovery/fixtures/official_event_snapshot.json` (31 event; 15 verified + 16 discovery).
2. **Konten Editorial:** `src/content/fixtures/articles_snapshot.json` (33 artikel editorial lengkap).
3. **Akun Admin:** Di-bootstrap ulang via `ARGUS_ADMIN_PASSWORD` (tanpa membuat user fiktif).

### Inventori Data yang Tidak Dapat Dipulihkan dari Neon:
1. **Transaksi / Order Sandbox:** Transaksi dummy/testing internal di masa pengembangan hilang. Karena belum ada transaksi uang riil, tidak ada kerugian finansial pengguna.
2. **Listing Secondary Seller Dinamis:** Listing tiket sekunder yang dibuat saat fase uji coba di Neon hilang. Seller dapat me-relist tiket saat marketplace dibuka kembali. **Tidak ada tiket fiktif yang akan di-seed.**
3. **Session Tokens & Login Sandbox:** Sesi login pengguna sandbox kadaluarsa dan dibersihkan.
4. **Log Webhook Historis:** Webhook payment gateway testing internal dibersihkan; audit log dimulai dari state bersih.

---

## 5. Hasil Verifikasi Kode & Test Suite

Semua test suite dan build lokal telah diverifikasi dengan hasil **100% LULUS**:
- `test_inventory_concurrency_race.js`: **11/11 PASSED** (Atomic reservation, multi-quantity race condition, release idempotency).
- `test_p0_p1_payment_inventory_safety.js`: **9/9 PASSED** (Failed/expired payment release, duplicate webhook defense, fail-closed Midtrans).
- `test_mvp_transaction_loop.js`: **10/10 PASSED** (End-to-end marketplace escrow trust loop).
- `npm run build`: **PASSED** (314 JS files syntax check, homepage surface guard, sitemap generator).

---

## 6. Prosedur Eksekusi Pasca-Provisioning

Segera setelah project Supabase dibuat:

1. **Uji Koneksi Aman:**
   ```bash
   $env:TARGET_DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&supavisor=true"
   node scripts/test_target_connection.js
   ```
2. **Eksekusi Schema Migration:**
   ```bash
   node scripts/migrate_all_schemas.js
   ```
3. **Seed Data Esensial:**
   ```bash
   node scripts/run_catalog_refresh.js --execute
   ```
4. **Cutover Vercel Environment:**
   Perbarui `DATABASE_URL` di Vercel Production ke Transaction Pooler Supabase.
5. **Runtime Verification:**
   Audit endpoint live: `https://tikum.app/api/mvp/listings`.
