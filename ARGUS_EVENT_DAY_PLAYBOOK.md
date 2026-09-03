# ARGUS Event Day Playbook (Controlled Pilot)

Scope: 1 event, 5–20 transaksi, 1–2 PIC. Tanpa bongkar DB, tanpa script manual.
Settlement: SIMULATED / PILOT-ONLY sampai payment provider real terintegrasi.

## H-1 — Persiapan

PIC terima assignment:
- Cek `GET /api/mvp/pic/events/:eventId/dashboard` dengan `x-user-id: <pic-id>`.
- Pastikan event, venue, date, gate_info benar.
- Review semua orders: buyer name/phone, seller name/phone, ticket/seat, escrow_status.

Hubungi buyer & seller (WA):
- Buyer: order confirmed, venue + meetup point, jam tiba H-2 jam, bawa KTP + order ID, temui PIC dulu, jangan ke gate sendiri.
- Seller: listing verified, instruksi handoff ke PIC, expected settlement amount, settlement H+1.

Ops readiness:
- `GET /api/mvp/admin/operations` (admin) — pending verifications = 0, escrow holding sesuai.
- PIC HP charged, backup contact Ops hotline siap.

## H-0 — Event Day

1. PIC tiba H-3 jam, tetapkan meetup point, lapor Ops.
2. Per order:
   1. Buka order di dashboard PIC.
   2. Verifikasi buyer (nama + order ID).
   3. Verifikasi seller/tiket handoff.
   4. Verifikasi tiket (fisik/QR/scanner panitia).
   5. Dampingi ke gate.
   6. `POST /api/mvp/pic/verify-entry` dengan `picUserId, orderId, gate, status, notes`.
      - Sukses masuk: `CONFIRMED`.
      - Masalah: `INVALID` / `TICKET_PROBLEM` / `GATE_REJECTION` / `DUPLICATE_ENTRY`.
      - No-show: `NO_SHOW_BUYER` / `NO_SHOW_SELLER`.
   7. Bukti minimal tercatat otomatis: order ID, event ID, PIC ID, timestamp, verification result, entry result.
3. PIC DILARANG hitung payout/fee manual. Sistem hitung: `ticketPrice + fee (10% single-source di escrowService.js) = total`.
4. Jika dispute: buyer `POST /api/mvp/buyer/dispute`, PIC `POST /api/mvp/pic/dispute-evidence`, escrow terkunci DISPUTED. PIC jangan janjikan refund di tempat.

Exception next_action:
- CONFIRMED → RELEASE_SETTLEMENT
- INVALID/TICKET_PROBLEM/GATE_REJECTION → OPEN_DISPUTE_INVESTIGATION
- DUPLICATE_ENTRY → REJECT_DUPLICATE_HOLD_ESCROW
- NO_SHOW_* → HOLD_ESCROW_AWAIT_OPS_REVIEW

## H+0 — Close Hari-H

- PIC pastikan semua CONFIRMED tercatat, yang pending diberi status exception jujur (jangan paksa CONFIRMED).
- Dokumentasikan dispute + evidence bundle.
- Ops cek `pendingSettlements`, `openDisputes` di ops console.

## H+1 — Settlement Review

- Admin `POST /api/mvp/admin/settlements/execute` hanya setelah ENTRY_CONFIRMED. Idempotency key wajib unik per order.
- Double-settlement dicegah server-side (per orderId). Settlement mode = SIMULATED.
- Refund hanya via `resolveDispute REFUND_BUYER`. Tidak ada release manual tanpa verifikasi gate (invariant ENTRY_NOT_CONFIRMED).
- Review audit_logs: SUBMITTED → VERIFIED → CREATED → FUNDS_LOCKED → ENTRY_VERIFICATION → FUNDS_RELEASED → EXECUTED.
