# Architecture Decision Records (ADR) — ARGUS Trust Infrastructure

This document outlines the core architectural decisions that govern the development and operation of the ARGUS Trust Infrastructure. These decisions are permanently binding and cannot be altered without a formal RFC.

---

## ADR-001: Immutable Ownership Model

* **Status:** Approved
* **Context:** Traditional ticket systems change the "owner" field directly on a ticket record. This makes tracing ownership history difficult, prone to concurrency bugs, and complicates auditing.
* **Decision:** Ticket ownership is strictly immutable. A ticket transfer does not overwrite the old owner's record. Instead, every transfer appends a new state record or ownership node in the ledger.
* **Consequence:** The current owner is derived by querying the latest valid state record. Historical ownership records remain untouched, readable, and permanently auditable.

---

## ADR-002: Append-Only Evidence

* **Status:** Approved
* **Context:** Dispute resolution and trust verification rely on uploaded evidence (e.g., KTP files, promoter emails, bank transfer receipts). Deleting or modifying evidence undermines the integrity of the audit logs.
* **Decision:** All evidence records and files are strictly append-only. The system must not provide any API or database operations to delete or modify evidence files once they are recorded. If a correction is needed, a new evidence record must be appended.
* **Consequence:** Ensures evidence integrity. Storage grows monotonically, which is managed via storage lifecycle policies rather than database deletion.

---

## ADR-003: Write-Only Audit Log

* **Status:** Approved
* **Context:** The system must guarantee that neither administrators nor malicious actors can rewrite history to cover up fraudulent transfers or overrides.
* **Decision:** The `audit_logs` records are write-only. Database permissions and application logic must prevent any `UPDATE` or `DELETE` operations on this table.
* **Consequence:** Provides a complete and tamper-proof chronicle of all transaction states and operator actions.

---

## ADR-004: Immutable Ticket Identity

* **Status:** Approved
* **Context:** Tickets are traded, transferred, and verified, but the ticket identity itself (represented by the primary ticket reference and original event details) must remain constant.
* **Decision:** Once a Ticket ID is generated or registered in the ARGUS system, its identifier and core properties (event, seat, category) are immutable. Only the ownership states and verification status are mutable.
* **Consequence:** Prevents tickets from being "re-keyed" or disguised to bypass resale limits or fraud detection.

---

## ADR-005: Reproducible Transfer History

* **Status:** Approved
* **Context:** In the event of a dispute, ARGUS must prove who owned the ticket at any point in time.
* **Decision:** The history of a ticket must be fully reproducible. An auditor must be able to reconstruct the entire path of a ticket from original listing to final gate redemption by querying the chronological chain of state records.
* **Consequence:** Allows automated validation of ticket ancestry and verification of the custody chain.

---

## ADR-006: Deterministic Pricing and Settlement (No Information Asymmetry)

* **Status:** Approved
* **Context:** Information asymmetry (e.g., hidden service fees, dynamic pricing updates at checkout, or fake urgency timers) damages trust.
* **Decision:** All transaction prices, escrow holds, transfer fees, and final payout settlements must be deterministic. The system will calculate and display fees upfront. Opaque fees or dynamic checkout markups are prohibited.
* **Consequence:** Clear, upfront pricing for buyers and sellers, adhering to the constitutional rule: *ARGUS will never profit from information asymmetry.*

---

## ADR-007: Advisory Trust Score

* **Status:** Approved
* **Context:** Automated trust or fraud scores (e.g. AI-driven risk signals) help prioritize verification queues, but if used blindly as the sole decision maker, they lead to false positives and lack of accountability.
* **Decision:** All automated trust, reputation, and fraud scores are advisory. A final status transition to `VERIFIED` or the release of escrow funds must always be backed by verifiable, human-checked, or cryptographically proven evidence.
* **Consequence:** Prevents "black-box" rejections and forces the presence of concrete evidence for all high-privilege status transitions.

---

## ADR-008: Audited Human Override

* **Status:** Approved
* **Context:** When operators manually override automated limits, clear disputes, or reverse transaction states, it introduces security vulnerabilities.
* **Decision:** Any manual override of transaction logic, verification, or status transitions must generate an audit log record containing the operator ID, timestamp, explanation of the change, and references to the specific evidence prompting the override.
* **Consequence:** Complete operational accountability.

---

## ADR-009: The Right to Explain (System Explainability)

* **Status:** Approved
* **Context:** Opaque messages like "Transaction Failed" or "Transfer Rejected" lead to frustration and distrust. Users must know exactly why the system took a specific action.
* **Decision:** Any rejection, warning, block, or dispute resolution must store and present concrete, structured, human-readable reasons (e.g., "KTP verification expired", "Ticket category mismatch").
* **Consequence:** Complete transparency in operations, enabling users to correct problems and build confidence in the system.

---

## ADR-010: ARGUS Never Depends on Exclusive Control (Anti Lock-in)

* **Status:** Approved
* **Context:** Ticketing history shows that exclusive control over distribution channels leads to monopoly power, higher fees, and poor user experience. As a trust infrastructure provider, ARGUS should facilitate integration rather than lock users into a closed platform.
* **Decision:** ARGUS will never depend on exclusive control or proprietary vertical integration. The system must support and work with multiple payment providers, identity validation APIs, primary ticketing platforms, promoters, and venue scanning networks.
* **Consequence:** Ensures ARGUS acts as a strategic trust layer, making integration appealing and simple for any ecosystem player.

---

## ADR-011: Append-Only Ownership Ledger

* **Status:** Approved
* **Context:** Relying solely on CRUD updates to a `current_owner_id` database column creates a weak audit trail and is vulnerable to database tampering.
* **Decision:** Current ticket ownership must be derived by replaying a stream of immutable ticket ledger events (e.g., `TicketCreated`, `OwnershipAssigned`, `TransferRequested`, `VerificationPassed`, `SettlementCompleted`, `OwnershipTransferred`). Direct CRUD updates on the primary ownership model are prohibited without generating an accompanying state event in the log.
* **Consequence:** Uncompromised audit trail and deterministic replayability of ownership history without introducing full Event Sourcing engine overhead.

---

## ADR-012: Hashed Evidence Bundles

* **Status:** Approved
* **Context:** Storing loose verification documents separately makes validating the integrity of a complete evidence set difficult and vulnerable to single-file manipulation.
* **Decision:** All transaction evidence files (ID scan, ticket PDF, purchase screenshot, selfie, etc.) must be uploaded and stored as a structured "Evidence Bundle". The metadata and individual files of the bundle must be hashed together into a single SHA-256 cryptographic hash stored in the ledger.
* **Consequence:** If any file in the verification set is altered, deleted, or replaced, the bundle hash check fails, triggering an instant security audit.

---

## ADR-013: Data Outlives Code (Migration Philosophy)

* **Status:** Approved
* **Context:** Applications, backend languages, and frontend frameworks are frequently rewritten or replaced over the lifecycle of a business. However, transaction data and ownership ledgers represent the permanent value, record, and legal history of the company.
* **Decision:** The ledger data model and database schema must be designed with the assumption that the data will outlive the codebase. Every database migration, schema expansion, or platform rewrite must guarantee that the historical meaning, auditable sequence, and integrity of the ledger remains intact and interpretable. Code is transient; the ledger is permanent.
* **Consequence:** Forces strict backward compatibility standards for data migration design, and prevents migrations from rewriting past ledger events.

---

## ADR-014: Evidence Beats Opinion

* **Status:** Approved
* **Author:** Architecture Review Board
* **Date:** 2026-07-09
* **Supersedes:** None
* **Superseded by:** None

### Context

ARGUS telah menyelesaikan fase **Architecture-Centric** — vision, constitution, style guide, ADR 001–013, system invariants, architecture review, implementation plan, foundation prototype, dan automated tests semuanya sudah lengkap.

Risiko terbesar sekarang adalah **analysis paralysis**: terus menambah dokumen tanpa validasi operasional.

Fase berikutnya harus berbasis bukti, bukan opini.

### Decision

Semua perubahan pada area berikut:

- Domain model
- API
- Verification
- Settlement
- Dispute
- Pricing
- Trust

**wajib** memenuhi minimal satu dari empat kondisi berikut:

| # | Kondisi | Contoh |
| - | ------- | ------ |
| 1 | Menjaga system invariant | Ownership Integrity Rate harus tetap 100% |
| 2 | Diperlukan oleh regulasi | Perubahan compliance PPI/escrow |
| 3 | Didukung data operasional | "93% dispute berasal dari ketidakjelasan bukti upload" |
| 4 | Memperbaiki bug kritis | Settlement gagal pada edge case tertentu |

Jika sebuah usulan perubahan **tidak memenuhi salah satu dari empat kondisi di atas**, maka perubahan tersebut **tidak boleh diimplementasikan**.

### Consequences

**Positif:**
- Setiap perubahan memiliki justifikasi yang dapat diaudit
- Mencegah feature creep dan gold-plating
- Mengarahkan energi tim ke hal yang benar-benar berdampak
- Mempercepat pembelajaran dari data nyata

**Negatif:**
- Beberapa ide bagus mungkin tertunda karena belum ada evidence
- Membutuhkan disiplin tinggi dalam pengumpulan data operasional
- Tim harus nyaman mengatakan "belum ada bukti, kita tunda dulu"

### Evidence Reference

Evidence yang mendukung ADR ini akan dikumpulkan di folder `/evidence` dan digunakan sebagai dasar justifikasi kondisi #3 (data operasional).

### Related

- [Architecture Debt Register](architecture_debt_register.md)
- [Kill Criteria](kill_criteria.md)
- [North Star Dashboard](north_star_dashboard.md)
- [Evidence Directory](../evidence/)


