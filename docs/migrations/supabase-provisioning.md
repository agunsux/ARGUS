# TIKUM / ARGUS — Supabase Provisioning & Connectivity Report

**Date:** 2026-10-26 (Asia/Jakarta)  
**Epic:** TIKUM DATABASE MIGRATION — NEON → SUPABASE POSTGRESQL  
**Status:** Provisioning Strategy & Readiness Established (Phase 2 Complete)

---

## 1. Supabase Account & Organization Assessment

Inspeksi via Supabase CLI (`npx supabase orgs list` & `npx supabase projects list`):

### Organisasi yang Terdeteksi:
1. `oodkibcemzwvbmhqrsat` (`SHINERVA`)
2. `vercel_icfg_wsNm0yEMo0UJCe17MgCLu6OK` (`agunsux's projects`)

### Proyek yang Terdeteksi Saat Ini:
1. `rgkrfzxipkrwqccfuqfq` (`HandicapLab` — Region `ap-southeast-2`, ACTIVE)
2. `uldyyzarmoslfvdyysoi` (`agunsux's Project` — Region `ap-northeast-2`, INACTIVE)
3. `xsiobpqrttiggqhghibb` (`supabase-cobalt-saddle` — Region `us-east-1`, INACTIVE)

> [!NOTE]
> Proyek database khusus untuk **TIKUM** (`argus-tikum` atau sejenisnya) belum dialokasikan di organisasi `SHINERVA`. Karena kuota Supabase Free Plan membatasi maksimal 2 proyek aktif per organisasi, pembuatan proyek baru memerlukan alokasi proyek di Supabase Dashboard atau mengaktifkan/mengubah proyek yang ada.

---

## 2. Parameter Arsitektur & Rekomendasi Region

- **Rekomendasi Region:** `ap-southeast-1` (Singapore)
  - Alasan: Pengguna Tikum mayoritas berada di Indonesia (WIB/WITA/WIT). Serverless Vercel edge/function regional Jakarta/Singapore memiliki latensi jaringan <20ms ke AWS Singapore `ap-southeast-1`.
- **Engine Version:** PostgreSQL 15, 16, atau 17.
- **Port & Connection Pooler Mode:**
  - **Transaction Pooler (Port 6543 / Supavisor):** Direkomendasikan untuk Vercel Serverless Production guna mencegah *connection exhaustion* saat lonjakan traffic konser.
  - **Direct / Session Connection (Port 5432):** Digunakan untuk menjalankan migrasi DDL besar (`scripts/migrate_all_schemas.js`).

---

## 3. Checklist Kredensial yang Dibutuhkan untuk Cutover

Untuk menghubungkan TIKUM ke Supabase tanpa mengekspos kredensial ke publik:

1. **`DATABASE_URL` (Supabase Connection String):**
   - Format: `postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&supavisor=true`
   - Dikonfigurasi langsung di **Vercel Project Settings > Environment Variables > `DATABASE_URL`** (Production & Preview).
2. **Kerahasiaan Kredensial:**
   - Password database **tidak boleh** ditaruh di chat, file Git, commit, maupun dokumen publik.
   - Variabel `DATABASE_URL` ditandai sebagai `Secret / Sensitive` di Vercel Dashboard.
