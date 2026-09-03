# ARGUS Pilot Readiness Checklist (Controlled Pilot: 1 event, 5–20 transaksi)

Verdict terakhir: PILOT READY — PAYMENT INTEGRATION PENDING (software verified, real payment belum).

## Software verified
- [x] Event created (`event-coldplay` / `event-gnr`)
- [x] Venue configured (`venue-gbk` + gate_info)
- [x] PIC assigned (`pic-assign-coldplay` ACTIVE H-1 s/d H+1)
- [x] PIC can access event (dashboard 1 event → N orders, `test_pilot_multi_order_10.js`)
- [x] Seller verified (KYC enforced, `test_mvp_security.js`)
- [x] Tickets verified (barcode unik, duplicate ditolak)
- [x] Buyer orders confirmed (order + escrow ESCROWED)
- [x] Event-day PIC workflow tested (CONFIRMED + 6 exception states)
- [x] Gate confirmation tested (ENTRY_CONFIRMED → RELEASE_PENDING → RELEASED)
- [x] Dispute tested (REFUND_BUYER + RELEASE_SELLER)
- [x] Settlement tested (idempoten same-key + different-key, amount server-side, SIMULATED)
- [x] Audit trail verified (immutable, append-only)
- [x] Security tests passed (26 MVP + 12 pilot + 33 flow = 71 PASS)
  - Buyer tidak bisa akses order buyer lain (403)
  - Seller tidak bisa akses listing seller lain (403)
  - PIC hanya assigned event (403)
  - Buyer/seller tidak bisa confirm entry sendiri (PIC_UNAUTHORIZED)
  - PIC tidak bisa ubah settlement amount (SELLER_MISMATCH + server amount)
  - Tidak ada override client-side price/fee/escrow/settlement

## Payment / escrow — SIMULATED
- [ ] Payment mechanism ready (REAL provider belum — saat ini mock `providerRef`)
- [ ] Escrow mechanism verified REAL (saat ini `prov-esc-*` SIMULATED)
- Settlement mode = SIMULATED / PILOT-ONLY. Jangan klaim uang real.

## Ops
- [x] Meetup instructions sent (via `pic_instructions` di buyer/pay + WA manual)
- [x] Backup contact procedure exists (Ops hotline + `contact_phone` PIC)
- [x] Playbook exists (`ARGUS_EVENT_DAY_PLAYBOOK.md`)

## Blockers ke Real Pilot
1. Integrasi payment/escrow real (ganti mock).
2. Auth pilot (x-user-id) naik ke session/token sebelum skala >20 transaksi.
3. Legal/regulatory readiness — di luar scope software, belum diverifikasi.

## Cara verifikasi ulang
```
node test_mvp_transaction_loop.js
node test_mvp_dispute_loop.js
node test_mvp_security.js
node test_pilot_multi_order_10.js
node test_flow.js
```
Semua harus 0 failed.
