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

## Fase 2: Alpha Field Pilot 🟡 IN PROGRESS

**Goal:** 500 transaksi nyata. Bukan 500 pengguna. 500 transaksi.

| Siklus | Hypothesis | Evidence Target | Status |
| ------ | ---------- | --------------- | ------ |
| H-001  | Promoter dapat upload evidence dalam < 2 menit | [007-Usability](../evidence/007-usability.md) | 🟡 |
| H-002  | Dispute rate < 8% pada 500 transaksi pertama | [003-Dispute Analysis](../evidence/003-dispute-analysis.md) | 🟡 |
| H-003  | Verification pipeline menangani beban peak | [006-Load Test](../evidence/006-load-test.md) | 🟡 |
| H-004  | Seller menyelesaikan settlement tepat waktu | [002-User Interviews](../evidence/002-user-interviews.md) | 🟡 |
| H-005  | Fraud rate < 1% | [004-Fraud Pattern](../evidence/004-fraud-pattern.md) | 🟡 |
| H-006  | Venue puas dengan integrasi | [009-Venue Feedback](../evidence/009-venue-feedback.md) | 🟡 |
| H-007  | P95 latency < 500ms under load | [005-Performance Benchmark](../evidence/005-performance-benchmark.md) | 🟡 |
| H-008  | Promoter merekomendasikan ARGUS | [008-Promoter Feedback](../evidence/008-promoter-feedback.md) | 🟡 |

### Milestone: Alpha Complete

- 500 transaksi tercapai
- 10 evidence terdokumentasi
- 0 Kill Criteria terpicu
- North Star Dashboard hijau di semua metrik

---

## Fase 3: Beta 🟡 PLANNED

**Goal:** 2000+ transaksi. Multi-tenant. Scaled verification.

| Siklus | Hypothesis | Evidence Target | Status |
| ------ | ---------- | --------------- | ------ |
| H-101  | Multi-venue support tanpa degradasi VSER | — | ⬜ |
| H-102  | Automated verification > manual accuracy | — | ⬜ |
| H-103  | PostgreSQL migration tanpa downtime | — | ⬜ |
| H-104  | Object storage lebih reliable | — | ⬜ |

### Milestone: Beta Complete

- Architecture Debt A-001 s/d A-004 resolved
- Kill Criteria Beta terpenuhi
- Siap production readiness review

---

## Fase 4: Production 🟡 PLANNED

**Goal:** Public launch. Scale. Compliance.

| Deliverable | Status |
| ----------- | ------ |
| Multi-region deployment | ⬜ |
| KMS/Vault integration | ⬜ |
| Regulatory compliance (PPI/escrow) | ⬜ |
| SLA guarantee | ⬜ |

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
