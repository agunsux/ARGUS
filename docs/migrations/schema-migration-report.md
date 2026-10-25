# TIKUM / ARGUS — Schema Migration Analysis & Compatibility Audit

**Date:** 2026-10-26 (Asia/Jakarta)  
**Epic:** TIKUM DATABASE MIGRATION — NEON → SUPABASE POSTGRESQL  
**Status:** Schema Audit Completed & Runner Verified (Phase 3 Complete)

---

## 1. Urutan & Dependensi Eksekusi Migrasi

Seluruh migrasi DDL dirancang bersifat **idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)** dan dijalankan dalam urutan topologis:

```
[000_user_and_auth_schema] (users, user_roles, sessions, auth_audit_events)
            │
            ▼
[001_catalog_schema] (canonical_events, source_snapshots, event_source_links, reconciliation_runs, discovery_scheduler_state)
            │
            ▼
[002_marketplace_and_money_schema] (tickets, listings, reservations, deliveries, quotes, orders, payments, escrows, ledger, idempotency)
            │
            ▼
[003_demand_alerts_schema] (demand_alerts)
            │
            ▼
[004_marketplace_offers_schema] (marketplace_negotiations, marketplace_offers, marketplace_offer_audit_logs)
            │
            ▼
[005_affiliate_partners_schema] (ticketing_partners, event_partner_offers, affiliate_click_events)
```

---

## 2. Audit Kompatibilitas PostgreSQL: Neon vs Supabase

### A. Ekstensi dan Proprietary Features
- **Neon-specific features:** Tidak ada kode ARGUS yang menggunakan fitur eksklusif Neon (seperti Neon branching via SQL).
- **Ekstensi:** Skema ARGUS murni menggunakan tipe data inti PostgreSQL tanpa dependensi C extension pihak ketiga.

### B. Tipe Data, Constraints, dan Indeks
1. **Financial Integers (`BIGINT`):**
   - Nilai finansial di `financial_orders`, `financial_quotes`, `marketplace_listings`, dan `financial_ledger_entries` disimpan dalam satuan minor (IDR Rupiah bulat). Bebas dari floating-point error.
2. **Partial Unique Indexes (Concurrrency Invariants):**
   - `marketplace_listings`: `CREATE UNIQUE INDEX uq_mkt_active_ticket_listing ON marketplace_listings (ticket_id) WHERE status IN ('ACTIVE', 'RESERVED');` (Mencegah listing ganda untuk tiket yang sama).
   - `marketplace_reservations`: `CREATE UNIQUE INDEX uq_mkt_pending_reservation ON marketplace_reservations (listing_id) WHERE status = 'PENDING';` (Mencegah double-booking pada race condition simultan).
   - `financial_provider_webhooks`: `UNIQUE (provider, provider_event_id)` (Mencegah replay attack pada webhook pembayaran).
   - Seluruh partial index di atas didukung 100% oleh PostgreSQL standar di Supabase.

### C. Concurrency Locking & Atomisitas Inventori
- Pada [`src/storage/PostgresMarketplaceRepository.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/storage/PostgresMarketplaceRepository.js), operasi reservasi tiket mengeksekusi:
  ```sql
  SELECT * FROM marketplace_listings WHERE id = $1 FOR UPDATE;
  ```
- **Kompatibilitas:** Didukung penuh oleh Supabase PostgreSQL. Jika menggunakan connection pooler, mode Transaction Pooler (Supavisor) mendukung `SELECT ... FOR UPDATE` selama query berada di dalam transaksi (`BEGIN ... COMMIT`).

---

## 3. Automation Tooling
Telah dibuat script otomatis:
[`scripts/migrate_all_schemas.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/scripts/migrate_all_schemas.js)
- Mengeksekusi 6 tahap migrasi secara transaksional.
- Memvalidasi keberadaan seluruh 31 tabel target.
- Tidak membocorkan password/koneksi pada log output.
