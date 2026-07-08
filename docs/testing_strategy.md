# Testing Strategy — v0.2 Alpha Field Pilot

> **Fondasi ARGUS sangat kuat jika sebuah transaksi dapat:**
>
> 1. dimulai,
> 2. dihentikan di state mana pun,
> 3. dilanjutkan,
> 4. gagal,
> 5. dipulihkan,
> 6. diaudit,
> 7. direkonstruksi 100%.
>
> Tanpa intervensi manual terhadap database.
>
> *Referenced by: [Core Trust Loop](alpha_core_trust_loop.md)*

---

## North Star Engineering

> **Zero undocumented state transitions.**

Artinya:
- Setiap state terdokumentasi
- Setiap transisi memiliki aturan
- Setiap event memiliki evidence
- Setiap failure memiliki recovery path

---

## Engineering Gate v0.2

Setiap pull request yang mengubah Core Trust Loop harus menjawab tujuh pertanyaan berikut:

| Gate | Pertanyaan |
| ---- | ---------- |
| **State** | Apakah perubahan ini menambah atau mengubah state machine? |
| **Transition** | Apakah semua transisi tetap valid? |
| **Invariant** | Apakah ada invariant yang dapat dilanggar? |
| **Evidence** | Evidence baru apa yang dihasilkan? |
| **Replay** | Dapatkah transaksi direkonstruksi dari event saja? |
| **Recovery** | Bagaimana jika proses gagal di tengah jalan? |
| **Metrics** | Hipotesis apa yang sedang diuji? |

**Jika satu saja tidak bisa dijawab, PR belum siap di-merge.**

---

## Level 1 — Unit Test

Menguji setiap komponen secara terisolasi.

| Area | Contoh Skenario |
|------|----------------|
| **State Transition** | Setiap transisi valid/invalid dari transition matrix |
| **Invariant** | Setiap 5 invariant dicek: ownership ganda, escrow sebelum transfer, dll |
| **Escrow** | Dana masuk, dana ditahan, dana dilepas, dana dikembalikan |
| **Ownership** | Immutable ownership, append-only ledger, replay consistency |

---

## Level 2 — Integration Test

Menguji alur lengkap dari hulu ke hilir.

```
Seller
  ↓
Buyer
  ↓
Escrow
  ↓
Transfer
  ↓
Venue
  ↓
Settlement
```

Setiap langkah harus lolos:
- Input valid → state berubah sesuai matrix
- Input invalid → state tetap atau masuk Exception
- Data persist setelah restart

---

## Level 3 — Chaos Test

Menguji ketahanan terhadap kegagalan nyata.

| Skenario | Cara Uji | Expected Behavior |
|----------|----------|-------------------|
| Payment timeout | Pembayaran tidak masuk dalam batas waktu | State → Exception, refund otomatis |
| Duplicate webhook | Webhook yang sama dikirim dua kali | Idempotent — state tidak berubah |
| Venue offline | Scanner tidak bisa terhubung | Operator dapat verifikasi manual |
| Seller disconnect | Seller putus koneksi saat upload evidence | State tetap, resume setelah koneksi pulih |
| Buyer cancel | Buyer batalkan setelah escrow | State → Exception, refund escrow |
| QR scan dua kali | Tiket dipindai dua kali di venue | Entry hanya sekali, keduanya ditolak |
| Operator restart | Sistem restart di tengah transaksi | State bertahan, replay aman |
| Network partition | Server terisolasi sementara | State tetap, recovery setelah koneksi pulih |

---

## Level 4 — Replay Test

Menguji determinisme model event.

**Prosedur:**

1. Ambil satu transaksi nyata dari produksi.
2. Catat seluruh event yang dihasilkan.
3. Hapus projection / state akhir.
4. Replay seluruh event dari awal.
5. Bandingkan state akhir dengan state asli.

**Expected:**
- State akhir harus **identik** dengan state asli.
- Jika berbeda, ada cacat pada model event.

**Frekuensi:**
- Setiap kali state machine berubah
- Setiap minggu di staging (automated)

---

## Test Coverage Target

| Level | Target Coverage | Gate |
|-------|----------------|------|
| Unit Test | 100% state transitions + 100% invariants | Wajib lolos sebelum merge |
| Integration Test | 100% Core Trust Loop paths | Wajib lolos sebelum deploy |
| Chaos Test | 8 skenario minimum | Wajib lolos sebelum Alpha launch |
| Replay Test | 100% transaksi Alpha | Continuous validation |
