# TIKUM / ARGUS — Post-Cutover Acceptance & Rollback Runbook

**Date:** 2026-10-26 (Asia/Jakarta)  
**Epic:** TIKUM DATABASE MIGRATION — NEON → SUPABASE POSTGRESQL  
**Status:** Runbook Ready & Rollback Procedure Documented (Phase 6 & 7 Plan)

---

## 1. Prosedur Cutover Terkendali

Ketika target Supabase (`DATABASE_URL` Supabase) telah dialokasikan:

### Langkah 1: Eksekusi Migrasi Skema ke Supabase
Jalankan runner migrasi pada database target:
```bash
TARGET_DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&supavisor=true" node scripts/migrate_all_schemas.js
```
*Script ini akan memverifikasi koneksi, menjalankan 6 file migrasi DDL secara transaksional, dan memvalidasi keutuhan seluruh 31 tabel.*

### Langkah 2: Rekonstruksi & Seeding Katalog Event
Jalankan refresh katalog untuk memuat seluruh 36 event terverifikasi ke tabel `canonical_events`:
```bash
TARGET_DATABASE_URL="[supabase-connection-string]" node scripts/run_catalog_refresh.js --execute
```

### Langkah 3: Update Environment Variable di Vercel Production
Set variabel `DATABASE_URL` di Vercel ke connection string Supabase:
```bash
# Melalui Vercel CLI atau Vercel Dashboard (Project Settings > Environment Variables):
vercel env add DATABASE_URL production
```
*(Pastikan memilih opsi Secret/Sensitive agar nilai tidak terekspos).*

### Langkah 4: Trigger Production Redeploy & Smoke Test
```bash
npx vercel --prod
```
Segera setelah deployment berstatus `READY`, jalankan smoke test produksi:
- `GET https://tikum.app/api/mvp/listings` (Wajib mengembalikan HTTP 200, bukan HTTP 500).
- `GET https://tikum.app/events` (Memastikan event render dari database Supabase).
- `GET https://tikum.app/blog` (Memastikan blog & sitemap utuh).

---

## 2. Prosedur Rollback Terkendali

Jika setelah cutover terjadi anomali kritis (misalnya koneksi pooler Supabase terputus):

1. **Jalur Pemulihan Cepat (Vercel Rollback):**
   Vercel mendukung instant deployment rollback:
   ```bash
   vercel rollback dpl_6HdsDS8muezHh15HYyj1mmQWepTL
   ```
2. **Jalur Konfigurasi:**
   Kembalikan nilai `DATABASE_URL` di Vercel Dashboard ke connection string sebelumnya jika Neon telah di-upgrade atau kuota telah pulih.
3. **Integritas Data:**
   Karena Neon dipertahankan dalam mode read-only dan tidak dihapus, data historis tetap aman dan dapat diakses kembali sewaktu-waktu.
