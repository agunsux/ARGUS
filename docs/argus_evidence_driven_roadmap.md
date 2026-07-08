# ARGUS Evidence-Driven Roadmap

> **Evidence-Driven, bukan Feature-Driven.**
>
> Roadmap ini mengikuti siklus:
> `Hypothesis → Implementation → Measurement → Evidence → Architecture Update`
>
> Berdampingan dengan [ARGUS Implementation Roadmap (90 Hari)](argus_90_day_roadmap.md) yang tetap berlaku sebagai panduan eksekusi.
>
> *Referenced by: [ADR-014](architecture_decision_records.md#adr-014-evidence-beats-opinion)*

---

## Fase 1: Architecture-Centric ✅ COMPLETED

| Deliverable              | Status |
| ------------------------ | ------ |
| Vision                   | ✅     |
| Constitution             | ✅     |
| Style Guide              | ✅     |
| ADR 001–014              | ✅     |
| System Invariants        | ✅     |
| Architecture Review      | ✅     |
| Implementation Plan      | ✅     |
| Foundation Prototype     | ✅     |
| Automated Tests          | ✅     |

**Outcome:** Fondasi arsitektur lengkap. Siap uji lapangan.

---

## Fase 2: Alpha Field Pilot — v0.2 🟡 IN PROGRESS

**Goal:** Membuktikan bahwa Protocol of Trust dapat beroperasi di dunia nyata.
Bukan meluncurkan marketplace.

**Pertanyaan utama:** *"Asumsi mana yang paling berisiko dan harus dibuktikan lebih dulu?"*

### Aturan Pengembangan Alpha

> **Tidak ada fitur tanpa hipotesis, dan tidak ada hipotesis tanpa metrik keberhasilan.**

Setiap fitur baru harus dapat dijelaskan dalam format:

| Hipotesis | Metrik | Exit Criteria |
| --------- | ------ | ------------- |
| Escrow mengurangi fraud | Fraud rate | < 0,2% |
| Venue verification mengurangi dispute | Dispute rate | Turun ≥ 50% |
| Trust score mempercepat transaksi | Median transaction time | Turun ≥ 20% |

Jika sebuah fitur tidak memiliki hipotesis yang dapat diuji, fitur tersebut belum layak dibangun.

---

### Wave 1 — Core Trust Loop 🔴 PRIORITAS TERTINGGI

Alur minimum yang harus bekerja tanpa kompromi. Jika satu langkah belum stabil, jangan menambah fitur lain.

```
Seller → Ownership Verification → Listing → Buyer Match
→ Escrow → Transfer Verification → Venue Verification
→ Buyer Entry → Seller Settlement
```

| Hipotesis | Metrik | Exit Criteria |
| --------- | ------ | ------------- |
| Core loop selesai dalam < 30 menit | Median end-to-end time | < 30 menit |
| Ownership terbukti setiap saat | Ownership Integrity Rate | 100% |
| Setiap transfer menghasilkan chain of evidence | Evidence Completeness Rate | ≥ 95% |

**Evidence target:** [001-Field Observation](../evidence/001-field-observation.md), [007-Usability](../evidence/007-usability.md)

**Implementation spec:** [Core Trust Loop — State Machine](alpha_core_trust_loop.md)

---

### Wave 2 — Evidence Automation 🟡

Minimalkan input manual. Setiap transaksi otomatis menghasilkan:

- Transaction ID
- Ownership snapshot
- Device fingerprint
- Timestamp
- Payment state
- Verification log
- Venue verification result
- Settlement result

| Hipotesis | Metrik | Exit Criteria |
| --------- | ------ | ------------- |
| Automated evidence reduces manual ops | Manual Intervention Rate | < 10% |
| Structured audit trail speeds dispute resolution | Median dispute resolution | < 24 jam |

**Evidence target:** [005-Performance Benchmark](../evidence/005-performance-benchmark.md)

---

### Wave 3 — Operator Console 🟡

Sebelum AI mengambil peran besar, pastikan operator memiliki alat yang memadai.

Dashboard minimum:
- Active transactions
- Waiting verification
- Escrow status
- High-risk users
- Disputes
- Venue queue
- Evidence viewer

| Hipotesis | Metrik | Exit Criteria |
| --------- | ------ | ------------- |
| Console reduces operator error rate | Manual intervention error rate | < 1% |
| Console speeds up verification | Median Verification Time | < 5 menit |

**Evidence target:** [002-User Interviews](../evidence/002-user-interviews.md)

---

### Wave 4 — Trust Intelligence 🟡

Baru setelah tersedia data nyata dari Wave 1–3.

- Risk scoring
- Fraud prediction
- Reputation graph
- Behavioral anomaly detection

| Hipotesis | Metrik | Exit Criteria |
| --------- | ------ | ------------- |
| Risk score reduces fraud | Fraud rate | < 0,2% |
| Reputation graph speeds matching | Time to match buyer-seller | Turun ≥ 20% |

**Evidence target:** [004-Fraud Pattern](../evidence/004-fraud-pattern.md)

---

### Exit Criteria Alpha

| Area | Target |
| ---- | ------ |
| Verified transfers | ≥ 500 |
| Successful venue entry | ≥ 99% |
| Fraud incidents | ≤ 1 per 500 transaksi |
| Median dispute resolution | < 24 jam |
| Evidence completeness | ≥ 95% |

*Lihat detail lengkap di [Kill Criteria](kill_criteria.md).*

---

## Fase 3: Closed Beta — v0.3 🟡 PLANNED

**Goal:** 1–3 venue, promotor terbatas. 2000+ transaksi.

| Wave | Hypothesis | Evidence Target | Status |
| ---- | ---------- | --------------- | ------ |
| B-01 | Multi-venue support tanpa degradasi VSER | — | ⬜ |
| B-02 | Automated verification > manual accuracy | — | ⬜ |
| B-03 | PostgreSQL migration tanpa downtime | — | ⬜ |
| B-04 | Object storage lebih reliable | — | ⬜ |

### Milestone: Beta Complete

- Architecture Debt A-001 s/d A-004 resolved
- Kill Criteria Beta terpenuhi
- Siap public beta

---

## Fase 4: Public Beta — v0.4 🟡 PLANNED

**Goal:** Beberapa kota. Promotor independen. 10.000+ transaksi.

| Deliverable | Status |
| ----------- | ------ |
| Multi-region deployment | ⬜ |
| KMS/Vault integration | ⬜ |
| Public onboarding | ⬜ |
| Promoter API v1 | ⬜ |

---

## Fase 5: Indonesia Trust Network — v1.0 🟡 PLANNED

**Goal:** Cakupan nasional. Regulasi compliance. 100.000+ transaksi.

| Deliverable | Status |
| ----------- | ------ |
| Regulatory compliance (PPI/escrow) | ⬜ |
| SLA guarantee | ⬜ |
| National venue network | ⬜ |

---

## Fase 6: ASEAN Trust Infrastructure — v2.0 🟡 PLANNED

**Goal:** Ekspansi regional. Multi-currency. Multi-jurisdiction.

| Deliverable | Status |
| ----------- | ------ |
| Cross-border settlement | ⬜ |
| Regional compliance | ⬜ |
| Multi-currency escrow | ⬜ |

---

## Yang Tidak Ada di Roadmap Ini

- "User Stories" (diganti dengan Hypothesis)
- "Sprint Goals" (diganti dengan Evidence Target)
- "Feature List" (diganti dengan Architecture Update)

---

## Prinsip Roadmap

1. **Setiap siklus punya hypothesis** — bukan "build X", tapi "we believe X will improve Y"
2. **Setiap hypothesis punya measurement** — metrik North Star
3. **Setiap measurement menghasilkan evidence** — terdokumentasi di `/evidence`
4. **Setiap evidence bisa mengubah arsitektur** — update ADR jika diperlukan
5. **Kill Criteria selalu aktif** — tidak boleh diabaikan

---

*Roadmap hidup. Berubah setiap kali evidence baru masuk.*
