# ARGUS Pilot Readiness Checklist (Controlled Pilot: 1 event, 5–20 transaksi)
# ARGUS Pilot Readiness Assessment

Verdict terakhir: PILOT READY — PAYMENT INTEGRATION PENDING (software verified, real payment belum).
> **Scope: Controlled Pilot (1 Event, 1 Venue, 1 PIC Cell, 5–20 Orders)**  
> This document distinguishes between code maturity, financial escrow reality, on-site operations, and regulatory clearance.

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
---

## Payment / escrow — SIMULATED
- [ ] Payment mechanism ready (REAL provider belum — saat ini mock `providerRef`)
- [ ] Escrow mechanism verified REAL (saat ini `prov-esc-*` SIMULATED)
- Settlement mode = SIMULATED / PILOT-ONLY. Jangan klaim uang real.
## 1. Pilot Readiness Checklist

## Ops
- [x] Meetup instructions sent (via `pic_instructions` di buyer/pay + WA manual)
- [x] Backup contact procedure exists (Ops hotline + `contact_phone` PIC)
- [x] Playbook exists (`ARGUS_EVENT_DAY_PLAYBOOK.md`)
- [x] **Event exists**: `event-coldplay` configured with date, venue, category.
- [x] **Venue configured**: `venue-gbk` (Gelora Bung Karno) with turnstile/gate details.
- [x] **Event date/time configured**: Valid date representation with timezone safety.
- [x] **Event admission protocol defined**: Event-specific (`BARCODE_PLUS_ID`, `PHYSICAL_WRISTBAND`) with required items and turnstile rules.
- [x] **PIC assigned**: `pic-1` assigned to `event-coldplay` + `venue-gbk`.
- [x] **PIC can access assigned event**: Accessible via `/api/mvp/pic/events/:eventId/dashboard` with authorization checks.
- [x] **Sellers verified according to current process**: Profile KYC validation & active listing limits enforced.
- [x] **Tickets verified according to current process**: Admin listing approval + SHA-256 duplicate barcode check.
- [x] **Buyer orders confirmed**: Order creation with upfront transparent fee breakdown.
- [x] **Payment mechanism identified**: Midtrans Snap / Bank Virtual Account webhook integration mapping.
- [x] **Escrow mechanism identified**: Provider-managed holding account / split disbursement escrow.
- [x] **Meetup instructions available**: Buyer receive PIC phone, gate meetup point, and instruction banner.
- [x] **PIC workflow tested**: Multi-stage progression (`CONTACTED -> MEETUP -> TICKET_VERIFIED -> ENTRY_CONFIRMED`).
- [x] **Ticket verification tested**: Mandatory separation: `TICKET_VERIFIED != ENTRY_CONFIRMED`.
- [x] **Entry confirmation tested**: Gated strictly to assigned PIC; buyer/seller cannot forge entry.
- [x] **Dispute tested**: Evidence dossier preservation, field photo upload, admin decision engine.
- [x] **Refund path tested**: 100% refund execution on confirmed invalid tickets.
- [x] **Settlement tested**: Server-calculated net payout, released only after confirmed entry.
- [x] **Duplicate settlement prevented**: Idempotency key + order-level duplicate disbursement lockout.
- [x] **Audit trail verified**: Immutable append-only log across all transaction, verification, and dispute events.
- [x] **Authorization tests passed**: IDOR protection, role checks, and PIC cell scope enforcement.
- [x] **Security tests passed**: 100% pass on 7 security regression checks.
- [x] **Event-day playbook completed**: `ARGUS_EVENT_DAY_PLAYBOOK.md` covering H-1 to H+1.
- [x] **Emergency / escalation contact defined**: `ops@argus.id` / PIC Hotline: `081234567890`.

## Blockers ke Real Pilot
1. Integrasi payment/escrow real (ganti mock).
2. Auth pilot (x-user-id) naik ke session/token sebelum skala >20 transaksi.
3. Legal/regulatory readiness — di luar scope software, belum diverifikasi.
---

## Cara verifikasi ulang
## 2. Four Independent Readiness Levels

```text
================================================================================
A. SOFTWARE READINESS: PILOT READY
================================================================================
```
node test_mvp_transaction_loop.js
node test_mvp_dispute_loop.js
node test_mvp_security.js
node test_pilot_multi_order_10.js
node test_flow.js
* **Status:** **READY for Controlled Pilot.**
* **Details:**
  * All 72 tests across 5 test suites pass with 0 failures (`npm test`).
  * Core state machines (Listing, Escrow, Operational Stages, Dispute) operate deterministically.
  * Invariant `TICKET_VERIFIED != ENTRY_CONFIRMED` is strictly enforced in code.
  * Barcode duplicate prevention with uppercase normalization protects against double-listing.
  * Multi-order pilot scenario (10 orders, 5 sellers, 10 buyers, 1 PIC) runs completely without manual database intervention.

```text
================================================================================
B. PAYMENT READINESS: REAL PAYMENT INTEGRATION PENDING (SIMULATED ESCROW)
================================================================================
```
Semua harus 0 failed.
* **Status:** **SIMULATED ESCROW — NOT REAL MONEY.**
* **Details:**
  * Software state transitions (`PENDING_PAYMENT -> PAID -> ESCROWED -> RELEASED / REFUNDED`) are fully wired and safe.
  * However, funds are currently tracked in-memory with mock provider references (`pilot-pay-X`).
  * No live bank debit, escrow trust account, or payment gateway webhook signature verification is attached.
  * **Requirement for Live Real-Money:** Plug in a licensed Payment Gateway (e.g. Midtrans Escrow / Xendit Split Payment) using the existing `recordPayment` webhook entry point.

```text
================================================================================
C. OPERATIONAL READINESS: READY FOR CONTROLLED FIELD PILOT
================================================================================
```
* **Status:** **READY for 1 Event Pilot (5–20 Orders).**
* **Details:**
  * Operational unit is strictly event-centric (`EVENT -> VENUE -> DATE -> PIC`).
  * PIC has a clean mobile-ready interface to view all attendees, meetup status, and gate outcomes.
  * Event-Day Playbook (`ARGUS_EVENT_DAY_PLAYBOOK.md`) defines exact procedures for H-1, Event Day, H+0, and H+1.
  * PIC does not perform manual financial calculations; all fees and payouts are governed by server logic.

```text
================================================================================
D. LEGAL / REGULATORY READINESS: PENDING JURISDICTIONAL STRUCTURING
================================================================================
```
* **Status:** **PENDING REVIEW.**
* **Details:**
  * Secondary ticket resale and intermediation regulations in Indonesia (Undang-Undang Perlindungan Konsumen & ITE) require clear terms:
    1. ARGUS acts solely as a technological and operational verification intermediary, not the event promotor or ticket issuer.
    2. Holding public funds legally requires partnership with a licensed PJP (Penyelenggara Jasa Pembayaran) / Bank Kustodian / Escrow Partner under Bank Indonesia oversight.
    3. User Terms of Service must clearly state venue admission rules remain governed by the promoter.

---

## 3. Pilot Deployment Recommendation

| Deployment Tier | Readiness Verdict | Permitted Activity |
|---|---|---|
| **Local / Staging** | **PILOT READY** | Sandbox testing, staff training, simulation runs |
| **Controlled Closed Pilot (5–20 Orders)** | **PILOT READY (Real Payment Pending)** | Free/subsidized pilot with internal/trusted participants, testing physical PIC handoff & gate protocol |
| **Public Commercial Launch** | **NOT PILOT READY** | Must complete real PJP escrow webhook integration & legal terms review first |
