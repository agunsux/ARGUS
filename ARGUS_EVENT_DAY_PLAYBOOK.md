# ARGUS Event Day Playbook (Controlled Pilot)
# ARGUS Event-Day Operational Playbook

Scope: 1 event, 5–20 transaksi, 1–2 PIC. Tanpa bongkar DB, tanpa script manual.
Settlement: SIMULATED / PILOT-ONLY sampai payment provider real terintegrasi.
> **Operational Unit: EVENT + VENUE + DATE**  
> Target Pilot: 1 Event, 1 Venue, 1 Operations Cell, 1–2 PICs, 5–20 Orders.  
> **Core Principle:** Physical presence + evidence-based verification. ARGUS is an intermediary, not the venue gatekeeper.

## H-1 — Persiapan
---

PIC terima assignment:
- Cek `GET /api/mvp/pic/events/:eventId/dashboard` dengan `x-user-id: <pic-id>`.
- Pastikan event, venue, date, gate_info benar.
- Review semua orders: buyer name/phone, seller name/phone, ticket/seat, escrow_status.
## H-1 (Day Before Event) — Briefing & Cell Initialization

Hubungi buyer & seller (WA):
- Buyer: order confirmed, venue + meetup point, jam tiba H-2 jam, bawa KTP + order ID, temui PIC dulu, jangan ke gate sendiri.
- Seller: listing verified, instruksi handoff ke PIC, expected settlement amount, settlement H+1.
### 1. Assignment & Cell Verification
* [ ] PIC opens ARGUS Operations Console / Cell view: `/api/mvp/pic/events/:eventId/dashboard`.
* [ ] Verify event details: Event Title, Venue Name, Target Date, Gate / Turnstile location.
* [ ] Inspect configured **Admission Protocol**:
  * Check type: `BARCODE_PLUS_ID`, `PHYSICAL_WRISTBAND`, `DIGITAL_APP_TRANSFER`, etc.
  * Review required items (e.g. e-voucher PDF, original physical KTP/passport, order ID).
  * Confirm promotor / turnstile rules and hours of entry.

Ops readiness:
- `GET /api/mvp/admin/operations` (admin) — pending verifications = 0, escrow holding sesuai.
- PIC HP charged, backup contact Ops hotline siap.
### 2. Orders & Counterparty Inspection
* [ ] Review list of all orders assigned to the cell (5–20 orders).
* [ ] Verify buyer and seller contact numbers.
* [ ] Check ticket verification status (`TICKET_VERIFIED`). Confirm which tickets are already in handoff vs requiring in-person exchange.
* [ ] Confirm primary physical Meetup Point (e.g. *"Pintu 3 Utara GBK — Depan Patung Panahan"*).
* [ ] Confirm Emergency / Escalation Contact with ARGUS Operations Lead (`ops@argus.id` / Hotline: `081234567890`).

## H-0 — Event Day
---

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
## EVENT DAY — On-Site Execution

Exception next_action:
- CONFIRMED → RELEASE_SETTLEMENT
- INVALID/TICKET_PROBLEM/GATE_REJECTION → OPEN_DISPUTE_INVESTIGATION
- DUPLICATE_ENTRY → REJECT_DUPLICATE_HOLD_ESCROW
- NO_SHOW_* → HOLD_ESCROW_AWAIT_OPS_REVIEW
### 1. Arrive at Venue (H-3 Hours before Gate Opens)
* [ ] PIC arrives at designated meetup point wearing ARGUS identification.
* [ ] Broadcast / SMS meetup point confirmation to all buyers and sellers for the event:
  > *"Halo [Nama Buyer], saya [Nama PIC] PIC resmi ARGUS untuk konser [Nama Event]. Standby di Pintu 3 GBK. Tunjukkan Order ID Anda saat tiba."*
* [ ] Status update: `CONTACTED` $\rightarrow$ `MEETUP_CONFIRMED`.

## H+0 — Close Hari-H
### 2. Meetup & In-Person Verification (H-2 Hours to H-0)
* [ ] **Buyer Check:** Verify Buyer identity matches order details (KTP/ID check).
* [ ] **Seller / Ticket Check:**
  * For digital ticket: verify barcode/QR code and e-voucher legitimacy.
  * For physical wristband: assist with promotor wristband exchange.
* [ ] **Execute Ticket Verification:**
  * Record `POST /api/mvp/pic/verify-ticket` $\rightarrow$ status: **`TICKET_VERIFIED`**.
  * ⚠️ **CRITICAL RULE:** `TICKET_VERIFIED` does **NOT** release escrow. Seller funds remain securely locked in `ESCROWED`. Escrow cannot be released until buyer actually passes through the gate.

- PIC pastikan semua CONFIRMED tercatat, yang pending diberi status exception jujur (jangan paksa CONFIRMED).
- Dokumentasikan dispute + evidence bundle.
- Ops cek `pendingSettlements`, `openDisputes` di ops console.
### 3. Gate Escort & Admission Attempt
* [ ] Accompany buyer to venue gate / turnstile according to event admission protocol.
* [ ] Observe admission scan by venue / promoter security.
* [ ] **Case A: Successful Entry**
  * Turnstile green / wristband stamped $\rightarrow$ Buyer enters venue.
  * PIC records: `POST /api/mvp/pic/verify-entry` with `status: 'CONFIRMED'`.
  * System transitions: Order $\rightarrow$ `ENTRY_CONFIRMED`, Escrow $\rightarrow$ `RELEASE_PENDING`.
* [ ] **Case B: Gate Issue / Rejection**
  * Turnstile red / scanner error / barcode already scanned.
  * **DO NOT ARGUE WITH VENUE SECURITY.** The venue is the sole authority governing entry.
  * PIC immediately photographs the scanner error screen / rejection slip.
  * Record: `POST /api/mvp/pic/verify-entry` with `status: 'GATE_REJECTION'` or `TICKET_PROBLEM`.
  * Escalate to dispute desk: `POST /api/mvp/pic/dispute-evidence` with photo bundle.
  * Escrow is frozen in `DISPUTED`. No funds are released to seller.
* [ ] **Case C: No-Show Handling**
  * Buyer no-show (H+30 mins past agreed meetup): record `status: 'NO_SHOW_BUYER'`.
  * Seller no-show (failed to deliver ticket): record `status: 'NO_SHOW_SELLER'`.
  * Escrow held awaiting Ops review / refund.

## H+1 — Settlement Review
---

- Admin `POST /api/mvp/admin/settlements/execute` hanya setelah ENTRY_CONFIRMED. Idempotency key wajib unik per order.
- Double-settlement dicegah server-side (per orderId). Settlement mode = SIMULATED.
- Refund hanya via `resolveDispute REFUND_BUYER`. Tidak ada release manual tanpa verifikasi gate (invariant ENTRY_NOT_CONFIRMED).
- Review audit_logs: SUBMITTED → VERIFIED → CREATED → FUNDS_LOCKED → ENTRY_VERIFICATION → FUNDS_RELEASED → EXECUTED.
## H+0 (Event Start) — Immediate Wrap-Up

* [ ] Review cell dashboard: tally completed entries, exceptions, and open disputes.
* [ ] Confirm that all successfully entered orders are in `ENTRY_CONFIRMED`.
* [ ] Ensure all photographic evidence of rejections or exceptions is uploaded to evidence bundles.
* [ ] Check that no disputed orders were accidentally moved to release.

---

## H+1 (Day After Event) — Settlement & Dispute Resolution

* [ ] Ops Admin reviews all `ENTRY_CONFIRMED` orders $\rightarrow$ Triggers idempotent settlement disbursement to sellers.
* [ ] Ops Admin opens Dispute Resolution Desk:
  * Review PIC photo evidence & turnstile rejection logs.
  * If ticket was duplicate/invalid: issue `REFUND_BUYER` (100% refund, seller gets 0).
  * If buyer was at wrong gate and later entered: issue `RELEASE_SELLER`.
* [ ] Submit Final Event Operations Cell Report:
  * Total Orders: ___
  * Successful Entries: ___
  * Gate Rejections: ___
  * No-Shows: ___
  * Settled Amount: ___
  * Refunded Amount: ___
