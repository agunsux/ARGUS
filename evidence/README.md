# Evidence Directory

> **Bukan evidence transaksi. Evidence engineering.**
>
> Setiap perubahan besar pada ARGUS harus mengacu pada minimal satu evidence di folder ini.
>
> *Referenced by: [ADR-014](docs/architecture_decision_records.md#adr-014-evidence-beats-opinion)*

---

## Evidence Schema

Setiap evidence **wajib** mengikuti format ini agar dapat ditelusuri kembali ke hipotesis dan keputusan yang diambil.

| Field | Deskripsi | Wajib |
| ----- | --------- | ----- |
| **ID** | Nomor unik (001–999) | ✅ |
| **Date** | Tanggal observasi | ✅ |
| **Event** | Peristiwa yang diamati | ✅ |
| **Hypothesis** | Asumsi yang ingin divalidasi | ✅ |
| **Observation** | Temuan lapangan | ✅ |
| **Evidence Attached** | File pendukung (log, screenshot, video) | ✅ |
| **Decision** | Keputusan yang diambil berdasarkan evidence | ✅ |
| **Follow-up ADR** | Nomor ADR jika memicu perubahan arsitektur | ⬜ |
| **Owner** | Penanggung jawab evidence | ✅ |

---

## Daftar Evidence

| ID | Judul | Status | Tanggal | Hypothesis | Decision | Owner | ADR |
| -- | ----- | ------ | ------- | ---------- | -------- | ----- | --- |
| 001 | Field Observation | 🟡 Planned | — | — | — | — | — |
| 002 | User Interviews | 🟡 Planned | — | — | — | — | — |
| 003 | Dispute Analysis | 🟡 Planned | — | — | — | — | — |
| 004 | Fraud Pattern | 🟡 Planned | — | — | — | — | — |
| 005 | Performance Benchmark | 🟡 Planned | — | — | — | — | — |
| 006 | Load Test | 🟡 Planned | — | — | — | — | — |
| 007 | Usability | 🟡 Planned | — | — | — | — | — |
| 008 | Promoter Feedback | 🟡 Planned | — | — | — | — | — |
| 009 | Venue Feedback | 🟡 Planned | — | — | — | — | — |
| 010 | Postmortem | 🟡 Planned | — | — | — | — | — |

---

## Cara Menggunakan

1. Pilih template yang sesuai
2. Isi data dari observasi / wawancara / eksperimen
3. Update status dari `Planned` → `In Progress` → `Completed`
4. Referensikan dari ADR atau proposal perubahan

---

## Prinsip

- **Satu evidence, satu insight utama**
- **Selalu cantumkan jumlah sampel (N)**
- **Selalu cantumkan confidence level jika ada**
- **Jangan campur opini dengan data**

---

*Evidence-driven decisions, not opinion-driven architecture.*
