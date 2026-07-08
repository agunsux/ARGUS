# North Star Dashboard

> **Lima angka. Hanya lima.**
>
> Jika kelimanya sehat, hampir semua metrik bisnis lain ikut membaik.
>
> *Referenced by: [ADR-014](architecture_decision_records.md#adr-014-evidence-beats-opinion)*

---

## The Five

| # | Metrik                          | Target      | Definisi |
| - | ------------------------------- | ----------- | -------- |
| 1 | **Ownership Integrity Rate**    | **100%**    | Persentase tiket yang ownership-nya terverifikasi tanpa cacat |
| 2 | **Verified Successful Entry Rate (VSER)** | ≥ 95% | Persentase transaksi yang berhasil diverifikasi dan buyer berhasil masuk venue |
| 3 | **Median Verification Time**    | < 5 menit   | Waktu median dari upload evidence sampai hasil verifikasi |
| 4 | **Dispute Rate**                | < 5%        | Persentase transaksi yang berujung dispute |
| 5 | **Evidence Completeness Rate**  | ≥ 98%       | Persentase transaksi dengan evidence lengkap (tidak ada field wajib yang kosong) |

---

## Kenapa Hanya Lima?

1. **Ownership Integrity Rate** adalah invariant sistem. Harus 100%. Tidak bisa dikompromikan.
2. **VSER** adalah proxy terbaik untuk value delivery — buyer benar-benar masuk venue.
3. **Median Verification Time** mengukur kecepatan trust pipeline.
4. **Dispute Rate** adalah proxy untuk kualitas verification and settlement.
5. **Evidence Completeness Rate** mengukur kualitas data yang masuk ke sistem.

---

## North Star Hierarchy

Metrik dibedakan menjadi tiga lapis. Urutan ini menjaga tim tetap fokus pada misi utama sebelum mengejar pertumbuhan.

### Level 1 — Mission Metrics

Ini yang **tidak boleh dikompromikan**. Jika salah satu dari ini merah, tidak ada metrik lain yang relevan.

| Metrik | Target | Alasan |
| ------ | ------ | ------ |
| **Successful Entry Rate** | ≥ 99% | Buyer benar-benar masuk venue |
| **Verified Ownership Rate** | 100% | Setiap tiket memiliki owner yang jelas |
| **Seller Payment Success Rate** | ≥ 99% | Seller menerima pembayaran tepat waktu |

### Level 2 — Operational Metrics

Mengukur **efisiensi operasi**. Penting untuk skala, tetapi tidak mengorbankan Level 1.

| Metrik | Target |
| ------ | ------ |
| Verification Latency | < 5 menit (median) |
| Manual Intervention Rate | < 10% |
| Dispute Rate | < 5% |
| Evidence Completeness | ≥ 98% |
| Trust Officer Utilization | — |

### Level 3 — Business Metrics

Baru relevan **setelah trust terbukti**. Tidak diukur selama Alpha.

| Metrik |
| ------ |
| GMV |
| Take Rate |
| CAC |
| LTV |
| Repeat Buyers |
| Repeat Sellers |

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  NORTH STAR — ARGUS ALPHA FIELD PILOT                       │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  Ownership   │    VSER      │ Median Verif │  Dispute      │
│  Integrity   │              │    Time      │  Rate         │
│              │              │              │               │
│   100%  ✅   │   97.3% ✅   │   3.2m  ✅   │   2.1%   ✅   │
│  (target:    │  (target:    │  (target:    │  (target:     │
│   100%)      │   ≥95%)      │   <5m)       │   <5%)        │
├──────────────┴──────────────┴──────────────┴───────────────┤
│  Evidence Completeness Rate                                 │
│                                                             │
│  ████████████████████████████████████  99.1%  ✅            │
│  (target: ≥98%)                                             │
├─────────────────────────────────────────────────────────────┤
│  Status: 🟢 ALL METRICS HEALTHY                             │
│  Last updated: 2026-07-09 14:30 WIB                         │
│  Sample: 127 transactions                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Warna Status

| Warna | Arti                         |
| ----- | ---------------------------- |
| 🟢    | Di atas / sesuai target       |
| 🟡    | Mendekati threshold (warning) |
| 🔴    | Di bawah target / kill criteria triggered |

---

## Yang Tidak Ada di Dashboard Ini

- Jumlah pengguna
- GMV (Gross Merchandise Value)
- Rating
- Retention rate
- NPS

Itu dashboard bisnis, bukan North Star arsitektur.

---

*If you can't measure it, you can't improve it. If you measure too many things, you improve nothing.*
