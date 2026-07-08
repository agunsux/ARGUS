# Core Trust Loop — State Machine Specification

> **Wave 1, Alpha Field Pilot (v0.2)**
>
> Keberhasilan ARGUS tidak ditentukan oleh banyaknya fitur, tetapi oleh apakah satu siklus
> transaksi dapat berjalan secara **deterministik, dapat diaudit, dan dapat dipulihkan**
> jika terjadi kegagalan.
>
> *Referenced by: [Evidence-Driven Roadmap](argus_evidence_driven_roadmap.md)*

---

## State Machine

```
Ownership Verified → Listed → Matched → Escrowed → Transfer Pending
                                                    ↓
                                            Transfer Verified
                                                    ↓
                                            Venue Verified
                                                    ↓
                                              Settled
                                                    ↓
                                              Closed

Any failure → Exception (operator intervention required)
```

---

## States, Triggers, Outputs, Evidence

| # | State | Trigger | Output | Evidence Wajib |
|---|-------|---------|--------|----------------|
| 1 | **Ownership Verified** | Seller lolos verifikasi identitas & kepemilikan tiket | Ownership Record | Identity (KTP/SIM) + Ownership Snapshot (tiket asli) |
| 2 | **Listed** | Seller membuat listing dengan harga dan kondisi | Listing ID | Listing Log (timestamp, harga, syarat) |
| 3 | **Matched** | Buyer menerima harga dan menyetujui transaksi | Match Record | Pricing Snapshot (harga final, fee, pajak) |
| 4 | **Escrowed** | Pembayaran buyer diterima dan diverifikasi | Escrow ID | Payment Proof (transfer receipt / payment gateway) |
| 5 | **Transfer Pending** | Seller mengirim tiket ke buyer | Transfer Token | Transfer Log (kirim tiket, timestamp) |
| 6 | **Transfer Verified** | Buyer mengkonfirmasi penerimaan tiket | Ownership v2 | Transfer Evidence (screenshot/scan tiket diterima) |
| 7 | **Venue Verified** | Tiket dipindai berhasil di venue | Entry Record | Scan Log + Timestamp + Venue Verification |
| 8 | **Settled** | Dana escrow dilepas ke seller | Settlement Record | Payment Receipt (mutasi rekening seller) |
| 9 | **Closed** | Masa sengketa berakhir, transaksi ditutup | Immutable Audit Record | Complete Chain of Evidence |
| — | **Exception** | Invariant dilanggar / state tidak bisa transisi | Exception Record | Diagnostic Log + Operator Note |


---

## Event Model

Setiap transisi state menghasilkan event yang eksplisit dan di-append ke ledger:

```
OwnershipVerified
ListingCreated
BuyerMatched
EscrowCreated
TransferInitiated
TransferVerified
VenueEntryVerified
SettlementReleased
TransactionClosed
```

Selaras dengan filosofi **append-only ledger** (ADR-001, ADR-011).

---

## Invariant

Invariant ini harus **selalu benar**. Jika salah satu dilanggar, transaksi masuk ke status **Exception**.

| # | Invariant | Pelanggaran = Exception |
|---|-----------|------------------------|
| 1 | Setiap tiket hanya memiliki **satu pemilik aktif** pada satu waktu | Ownership ganda terdeteksi |
| 2 | Dana escrow tidak dapat dilepas sebelum **Transfer Verified** | Settlement dicoba sebelum Transfer Verified |
| 3 | Ownership tidak dapat berubah tanpa menghasilkan **evidence baru** | Transfer tanpa evidence attachment |
| 4 | Setiap perubahan state bersifat **append-only**; tidak ada overwrite histori | Overwrite terdeteksi di ledger |
| 5 | Setiap transaksi dapat **direkonstruksi sepenuhnya** dari audit trail | Replay gagal mereproduksi state akhir |

---

## State Transition Matrix

```
From \ To          | OwnV | List | Match | Escr | TrPn | TrVf | VenV | Sett | Clos | Excp |
-------------------|------|------|-------|------|------|------|------|------|------|------|
Ownership Verified |  —   |  ✅  |       |      |      |      |      |      |      |  ✅  |
Listed             |      |  —   |  ✅   |      |      |      |      |      |      |  ✅  |
Matched            |      |      |   —   |  ✅  |      |      |      |      |      |  ✅  |
Escrowed           |      |      |       |  —   |  ✅  |      |      |      |      |  ✅  |
Transfer Pending   |      |      |       |      |  —   |  ✅  |      |      |      |  ✅  |
Transfer Verified  |      |      |       |      |      |  —   |  ✅  |      |      |  ✅  |
Venue Verified     |      |      |       |      |      |      |  —   |  ✅  |      |  ✅  |
Settled            |      |      |       |      |      |      |      |  —   |  ✅  |  ✅  |
Closed             |      |      |       |      |      |      |      |      |  —   |      |
Exception          |  ✅  |  ✅  |  ✅   |  ✅  |  ✅  |  ✅  |  ✅  |  ✅  |  ✅  |  —   |

✅ = valid transition
Kosong = invalid
Exception → any state = recovery path with operator intervention
```

---

## Definition of Done — Wave 1

| Kriteria | Metrik Verifikasi |
|----------|-------------------|
| Semua state dapat diuji secara otomatis | Test coverage untuk setiap state |
| Semua transisi memiliki validasi | Setiap transisi dicek terhadap transition matrix |
| Semua event menghasilkan audit trail | Event log lengkap untuk setiap transaksi |
| Semua kegagalan dapat dipulihkan tanpa kehilangan histori | Recovery path dari Exception ke state yang benar |
| Seluruh transaksi dapat diputar ulang (replay) dari event dan evidence | Replay test: event → state akhir identik |

---

## Aturan Engineering

> **Tidak boleh ada implementasi yang melompati Core Trust Loop.**

Artinya:

- ❌ Tidak ada AI recommendation sebelum ada data transaksi nyata.
- ❌ Tidak ada reputation engine sebelum ownership stabil.
- ❌ Tidak ada fair pricing sebelum marketplace menghasilkan histori transaksi.
- ❌ Tidak ada trust graph kompleks sebelum identitas, transfer, dan settlement telah terbukti berjalan.

Setiap lapisan baru dibangun di atas lapisan yang sudah tervalidasi.

---

## Related

- [Evidence-Driven Roadmap](argus_evidence_driven_roadmap.md) — Wave 1
- [Architecture Decision Records](architecture_decision_records.md) — ADR-001, ADR-011
- [System Invariants](system_invariants.md) — Invariant 1–10
- [Kill Criteria](kill_criteria.md) — Exit Criteria Alpha
- [Testing Strategy](testing_strategy.md) — Engineering Gate v0.2 + test levels
