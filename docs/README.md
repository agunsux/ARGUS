# ARGUS Documentation Map

> **Satu repository. Satu arsitektur. Satu sumber kebenaran.**
>
> Dokumentasi ini adalah *source of truth* untuk seluruh ARGUS Trust Infrastructure.
> Setiap AI agent (DeepSeek, Codex, ChatGPT) dan setiap engineer harus mengacu pada
> versi yang ada di repository ini — bukan salinan di folder lain.
>
> *Canonical path:* `C:\Users\RYZEN\.antigravity-ide\ARGUS`
> *Tag baseline:* `v0.1-foundation`
>
> *Referenced by: [ADR-014](architecture_decision_records.md#adr-014-evidence-beats-opinion)*

---

## 00. Getting Started

| File | Deskripsi |
|------|-----------|
| `README.md` (root) | Ringkasan proyek ARGUS |
| `STYLE_GUIDE.md` | Konvensi bahasa dan terminologi yang digunakan |

---

## 01. Vision & Strategy

| File | Deskripsi |
|------|-----------|
| `project_argus_zero_to_one.md` | Vision document — dari nol ke satu, filosofi, first principles |
| `north_star_dashboard.md` | Lima metrik inti yang menjadi acuan kesehatan sistem |

---

## 02. Architecture

| File | Deskripsi |
|------|-----------|
| `architecture_decision_records.md` | ADR 001–014 — keputusan arsitektur yang permanently binding |
| `system_invariants.md` | 10 invariant sistem yang wajib dijamin setiap saat |
| `argus_architecture_review.md` | Hasil architecture review + final decision: APPROVED FOR ALPHA FIELD PILOT |
| `architecture_debt_register.md` | Daftar keputusan sementara yang perlu dimigrasi |

---

## 03. Product

| File | Deskripsi |
|------|-----------|
| `argus_mvp_prd.md` | Product Requirements Document untuk MVP |

---

## 04. Operations

| File | Deskripsi |
|------|-----------|
| `argus_operating_manual.md` | SOP operasional harian (manual/brute-force phase) |
| `kill_criteria.md` | Threshold yang memicu penghentian rollout |

---

## 05. Planning

| File | Deskripsi |
|------|-----------|
| `argus_90_day_roadmap.md` | Roadmap eksekusi 90 hari (Bulan 1–3) |
| `argus_evidence_driven_roadmap.md` | Roadmap evidence-driven untuk Alpha Field Pilot |

---

## 06. Evidence

| Folder | Deskripsi |
|--------|-----------|
| `../evidence/` | Observasi lapangan, eksperimen, postmortem, validasi hipotesis |

---

## 07. Research

| Folder | Deskripsi |
|--------|-----------|
| `../research/` | Analisis kompetitor, studi pasar, riset fraud, SWOT, benchmark |

---

## 08. Playbooks

| Folder | Deskripsi |
|--------|-----------|
| `../playbooks/` | Prosedur operasional yang sering berubah berdasarkan pengalaman |

---

## Knowledge Flow

```
Research                    →  "Apa yang kita ketahui?"
    ↓
Hypothesis                  →  "Apa yang kita percaya?"
    ↓
Build + Evidence            →  "Apa yang benar-benar terjadi?"
    ↓
ADR / Architecture Update   →  "Mengapa kita memilih ini?"
    ↓
Documentation               →  "Bagaimana sistem bekerja sekarang?"
```

---

## Aturan

1. **Tidak ada duplikasi** — setiap fakta hanya ada di satu file.
2. **Tidak ada refactor massal** — perubahan hanya jika diperlukan oleh implementasi.
3. **Setiap ADR lahir karena keputusan nyata**, bukan karena ingin menyempurnakan dokumen.
4. **Evidence beats opinion** — lihat ADR-014.

---

*Milestone berikutnya bukan Foundation, melainkan Alpha Field Pilot.*
