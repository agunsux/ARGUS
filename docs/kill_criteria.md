# Kill Criteria

> **Mencegah sunk cost fallacy.**
>
> Jika metrik operasional melewati ambang batas setelah jumlah transaksi tertentu, hentikan rollout dan lakukan redesign.
>
> *Referenced by: [ADR-014](architecture_decision_records.md#adr-014-evidence-beats-opinion)*

---

## Alpha Field Pilot — Exit Criteria

**Target: setelah ≥ 500 verified transfers**

Alpha adalah fase **pembelajaran**, bukan pertumbuhan.
Keberhasilan diukur dari kemampuan ARGUS membuktikan mekanisme kepercayaannya.

| Area | Target | Arti |
| ---- | ------ | ---- |
| **Verified transfers** | **≥ 500** | Volume transaksi minimum untuk statistik bermakna |
| **Successful venue entry** | **≥ 99%** | Buyer yang terverifikasi berhasil masuk venue |
| **Fraud incidents** | **≤ 1 per 500 transaksi** | Maksimal 1 insiden fraud dalam seluruh Alpha |
| **Median dispute resolution** | **< 24 jam** | Waktu penyelesaian sengketa dari laporan hingga putusan |
| **Evidence completeness** | **≥ 95%** | Persentase transaksi dengan audit trail lengkap |

Jika lima metrik ini tercapai, ARGUS telah membuktikan proposisi teknisnya sebagai trust infrastructure.

### Pertanyaan yang harus dapat dijawab setelah Alpha

1. Apakah ownership dapat dibuktikan setiap saat?
2. Apakah setiap transfer menghasilkan chain of evidence yang lengkap?
3. Apakah sengketa dapat diselesaikan menggunakan bukti, bukan opini?
4. Apakah model operasional masih berjalan ketika terjadi kasus yang tidak ideal (keterlambatan, pembatalan, identitas tidak cocok, tiket bermasalah)?

Jika jawabannya "ya" — ARGUS telah membuktikan fondasi yang sulit ditiru.

---

## Kill Criteria (Ambang Batas Gagal)

**Jika metrik di bawah ini terlampaui, hentikan rollout dan lakukan redesign.**

### Alpha Kill Thresholds

**Trigger: setelah 500 transaksi nyata**

| # | Metrik | Ambang Batas | Aksi jika terlampaui |
| - | ------ | ------------- | -------------------- |
| 1 | Dispute Rate | > 8% | Hentikan rollout, redesign dispute flow |
| 2 | Verification Failure Rate | > 15% | Hentikan rollout, redesign verification pipeline |
| 3 | Settlement Failure Rate | > 3% | Hentikan rollout, audit settlement engine |
| 4 | Ownership Integrity Rate | < 100% | Hentikan SEMUA, ini invariant |
| 5 | Median Verification Time | > 30 menit | Hentikan rollout, optimasi pipeline |

### Beta Kill Thresholds

**Trigger: setelah 2000 transaksi nyata**

| # | Metrik | Ambang Batas | Aksi jika terlampaui |
| - | ------ | ------------- | -------------------- |
| 1 | Dispute Rate | > 5% | Redesign dispute resolution |
| 2 | Verification Failure Rate | > 8% | Redesign verification pipeline |
| 3 | Settlement Failure Rate | > 1% | Audit dan hardening settlement |
| 4 | P95 Verification Time | > 10 menit | Optimasi pipeline |
| 5 | User Churn (promoter) | > 20% | Investigasi UX dan trust |

---

## Prosedur Kill

1. Monitoring dashboard mendeteksi metrik melewati threshold
2. On-call engineer memverifikasi — apakah anomaly atau tren
3. Jika tren: **immediate feature freeze** — tidak ada fitur baru sampai masalah selesai
4. Root cause analysis (5 Whys)
5. Redesign proposal dengan evidence baru
6. Architecture Review Board menyetujui redesign
7. Rollout ulang dengan metrik baru

---

## Yang Tidak Termasuk Kill Criteria

- Jumlah pengguna
- Revenue
- Rating App Store
- Jumlah transaksi

Ini adalah metrik bisnis, bukan metrik kualitas sistem.
Kill Criteria fokus pada **kesehatan arsitektur**, bukan pertumbuhan bisnis.

---

*Kill early, learn fast, rebuild better.*
