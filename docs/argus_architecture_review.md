# ARGUS Architecture Review v1.0
**Independent Architectural Stress-Test & Red Team Audit**

**Date:** July 9, 2026  
**Status:** Architecture Gate Audit  
**Panelists:** 
- *Distinguished Engineer, Stripe Payments Infrastructure*
- *Head of Trust & Safety, Airbnb*
- *Core Maintainer, SQLite Project*
- *Distributed Systems Architect, Amazon Web Services*
- *Edge Networks Engineer, Cloudflare*
- *Lead Forensic Investigator, Digital Security Agency*

---

## 1. Executive Summary

This review subjects the ARGUS Trust Infrastructure (v0.1) design to an architectural stress-test. The target is evaluating if the system can scale from a localized proof-of-concept to a global ticketing protocol handling **100 million transactions**, maintaining absolute trust, data integrity, and low latencies.

While the conceptual evolution from a "Marketplace" to a "Trust Infrastructure" is highly sound, the MVP implementation contains critical vulnerabilities in database choice, event sorting, network partitioning, and domain coupling that must be resolved prior to production launch.

---

## 2. Architectural Strengths

1. **Constitutional Alignment:** The strict enforcement of *No Information Asymmetry* (ADR-006) and *The Right to Explain* (ADR-009) distinguishes ARGUS from traditional rent-seeking ticket platforms.
2. **Database-Level Immutability (ADR-003, ADR-011):** Enforcing write-only constraints on `audit_logs` and `ticket_events` via SQLite triggers ensures the data layers match strategic promises at the driver level.
3. **Deterministic State Derivation (ADR-001):** The decision to derive ownership from chronological logs (Event Sourcing Lite) prevents classic CRUD concurrency bugs and provides an absolute audit log.

---

## 3. Critical Risks Matrix

| Risk ID | Title | Impact | Probability | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **CR-01** | SQLite Write Contention | High | High | Migrate to Postgres with partitioned Event Logs. |
| **CR-02** | Chronological Race Conditions | High | Medium | Enforce optimistic concurrency control on sequence numbers. |
| **CR-03** | Localized Edge Outages at Venue Gates | Critical | High | Implement local-first offline verification engine. |
| **CR-04** | Evidence Tampering in Transit | High | Low | Sign evidence metadata cryptographically at uploader client. |
| **CR-05** | Distributed Clock Drift | Medium | High | Rely on sequence ordering instead of server timestamps. |

---

## 4. Domain Model Review

### The Review
*The current domain architecture links Settlement and Verification closely to the Ticket model.*

### Critiques
1. **Verification-Ticket Coupling:** The `Verification Context` should not have direct write access to ticket models. Verification is an *asynchronous evaluation sub-protocol*. The ticket model should only query if a valid, unexpired trust token or KYC signature exists.
2. **Settlement Dependency:** Escrow and payouts are coupled directly to ticket status. This creates a risk where database schema changes in event categories break payment systems. Payment ledger entities must operate on a decoupled ledger schema.

---

## 5. Domain-Driven Design (DDD) Bounded Contexts Audit

The defined contexts are sound, but the execution exposes several boundary leaks:

```
[Identity Context] ---------> [Verification Context] 
      │                                │
      ▼                                ▼
[Ownership Context] --------> [Settlement Context] (Financial transactions)
      │
      ▼
[Risk Context] (Advisory trust scoring)
```

### Invariant Checks
* **KYC & Session:** Should exist completely outside the ownership transfer lifecycle.
* **Escrow isolation:** Payout states must depend on payment event signals, not structural check-ins. If the ticket transfer fails, the settlement context must process refunds independently based on transaction state, keeping financial code isolated.

---

## 6. Event Sourcing Lite Review

### Critique by Event Sourcing Expert
The current design is "Event Sourcing Lite" because it maintains a cached `tickets` read model alongside the event log `ticket_events`.

1. **Replay Overhead:** Performing a full chronological database fetch and javascript loop replay on every lookup (`GET /ticket/:id/verify`) will degrade rapidly. At 100 events per ticket (multiple transfer attempts, checks, disputes), the database roundtrips and CPU cycles will cause verification gate latency to skyrocket.
2. **CQRS Separation:** We must explicitly decouple the Command layer (writing events to `ticket_events`) from the Query layer (reading from the projected `tickets` table). The `tickets` table should be updated asynchronously or via database triggers, and reads should hit the projection model directly, reserving replay loops strictly for forensic audits.

---

## 7. Ledger Review: Is SQLite Enough?

### Critique by SQLite Maintainer & Distributed Systems Architect
For local, single-server operations, SQLite is exceptionally fast and clean. However, for a global trust infrastructure, it has massive limits:

1. **Concurrency Limits:** SQLite serializes all writes. Under a burst load (e.g., ticket release for a massive tour with 10,000 requests per second), SQLite's write lock will cause queue times to explode, resulting in SQLITE_BUSY timeouts.
2. **Distributed Nodes:** SQLite is embedded. We cannot run multiple API instances across multiple availability zones or Cloudflare edge networks without a shared database. Running SQLite over network drives (NFS/EFS) causes index corruption.
3. **Resolution:** Maintain SQLite solely for local gate scanning caches (Local-First Architecture) and migrate the primary trust ledger to **PostgreSQL** with row-level locking or a distributed ledger like Amazon Aurora.

---

## 8. Security & Digital Forensics Review

### Critique by Forensic Investigator
The SHA-256 hashing of evidence bundles (ADR-012) is a strong foundation, but it lacks proof-of-time integrity.

1. **Backdating Evidence:** A compromised admin account could write historical records directly if the database triggers are bypassed or modified by someone with raw root access.
2. **Merkle Anchoring:** To be a true "Trust Infrastructure", the generated SHA-256 hashes of the Evidence Bundles should be structured into a Merkle Tree, and the root hash should be anchored hourly to a public ledger (e.g. Ethereum/Solana) or a public timestamping service. This provides cryptographically verifiable proof that the evidence existed in that exact state at that exact time, making backdating impossible.
3. **Decentralized Storage:** Storing evidence files on local disks (`uploads/`) is a severe security risk. Evidence must be moved to encrypted Object Storage (e.g., AWS S3 with Object Lock enabled in compliance mode) to ensure files cannot be overwritten even by administrators.

---

## 9. API Design Review

### Critique by Payment Architect
1. **Idempotency Keys:** None of the POST endpoints accept an idempotency key. In distributed networks (mobile venue gates, buyer checkouts), network drops are common. Without an `Idempotency-Key` header, clients retrying `POST /api/ownership/transfer` will emit duplicate events, risking double-debits or concurrency locks.
2. **Strict REST Versioning:** API paths must be versioned (e.g., `/v1/verify` instead of `/api/ticket/:id/verify`) to ensure clients using older integration protocols do not break when schemas evolve.

---

## 10. Scalability & Event Replay Failure Scenarios

### Scenario A: 20 Events Arrive Simultaneously (Race Conditions)
* **Problem:** If a seller attempts to transfer a ticket to two different buyers at the exact same millisecond, concurrent request threads will read the database, calculate the current owner, see it is still valid, and execute both writes.
* **Failure:** Double-transfer occurred.
* **Fix:** Enforce Optimistic Concurrency Control (OCC). Every state modification must submit the expected sequence number or version. If the sequence number in the database has advanced, the update fails.

### Scenario B: Distributed Clock Drift
* **Problem:** Two servers process events for the same ticket. Server A's clock is 2 seconds behind Server B's clock.
* **Failure:** Events are written with reversed timestamps, breaking event order.
* **Fix:** Rely strictly on sequential, transactionally-incremented sequence integers, completely ignoring server system clocks for state sequence verification.

### Scenario C: Partial Upload & Interrupted Network Connection
* **Problem:** A seller uploads KTP and Invoice, but the connection drops before the ticket PDF finishes uploading.
* **Failure:** An incomplete evidence bundle is registered, or temporary files accumulate on disk.
* **Fix:** Multi-file uploads must go to a staging bucket, and the evidence bundle registration must be atomic: only once all files are validated does the system generate the bundle hash and commit the transaction.

---

## 11. Trust Model Review: Is Trust Score Needed?

**Question:** *Can the system run without a Trust Score?*
* **Answer:** Yes. The core loop of ARGUS is deterministic verification (Evidence -> Settlement -> Transfer). The Trust Score is merely a heuristic optimization for operations to sort and fast-track entries.
* **Recommendation:** Keep Trust Score completely out of the core protocol logic. It must remain a downstream analytical query (Risk Context), never an invariant in the execution path.

---

## 12. Alternative Architectures

### CQRS + Event Ledger Architecture (Stripe/Amazon Pattern)
```
[Client Request] 
      │
      ▼
[Write Model] (Postgres SQL Ledger) ──(Emit Event)──► [Event Stream] (Kafka / EventLog)
      │                                                     │
      ▼ (Async Projection)                                  ▼ (Forensic Audit)
[Read Model] (Optimized Cache / Redis)              [Hashed Evidence Storage]
```
This separates write performance from read retrieval, guaranteeing gate validations take <10ms.

---

## 13. What Tech Giants Would Change

### Stripe:
1. Implement double-entry ledger transactions: every transfer is a balance transfer (Debit Seller Ticket Balance -> Credit Buyer Ticket Balance).
2. Mandate `Idempotency-Key` middleware.
3. Isolate identity verification to a separate, asynchronous API (similar to Stripe Identity).

### Amazon:
1. Prohibit database-level triggers for business rules. Use application-level verification pipelines running on microservices.
2. Replace SQLite with DynamoDB for the read model, using eventual consistency for non-critical lookups and strict transaction blocks for transfers.

### Cloudflare:
1. Run verify logic at the edge. Replicated read-only ticket caches inside edge key-value databases (Cloudflare KV) near venue gates to ensure sub-millisecond check-ins.
2. Cryptographic signature validation on ticket tokens directly at the edge worker.

### Linear:
1. Build local-first client databases inside scanner devices. Devices work completely offline at venue gates and sync bidirectionally using conflict-free replicated data types (CRDTs).

---

## 14. Go / No-Go Decision

### Status: CONDITIONAL GO FOR FOUNDATION SPRINT 2

The current architecture is highly robust for the **MVP/v0.1** scope and is approved for development under the following conditions:

1. **Migration to Postgres for Multi-Node Testing:** While SQLite remains active in v0.1 for local runs, the schema and database connectors must remain dialect-neutral to prepare for Postgres integration in Sprint 2B.
2. **Enforce Optimistic Concurrency:** Introduce a `version` or `sequence_id` field constraint on the `tickets` cached model to block concurrent double-transfer attempts.
3. **Idempotency Keys:** Integrate basic idempotency key checking in all post endpoints to protect against network retry mutations.
4. **Decouple Trust Score:** Ensure the Trust Score is defined purely as an advisory attribute in the Risk Context, and never used as a database gate for transactions.

---

## 15. Final Decision: Evidence-Centric Transition

### Status: APPROVED FOR ALPHA FIELD PILOT

Bukan production. Bukan public launch.

**Alpha Field Pilot** — target: **ratusan transaksi nyata berkualitas tinggi** yang menghasilkan data untuk menyempurnakan desain.

### Yang Diizinkan

- Deployment ke lingkungan terbatas (invite-only)
- Maksimal 500 transaksi
- Monitoring North Star Dashboard secara real-time
- Pengumpulan evidence (field observation, interview, dispute analysis, dsb.)
- Iterasi berdasarkan data operasional

### Yang Tidak Diizinkan

- Public launch / App Store
- Marketing masif
- Onboarding tanpa seleksi
- Fitur baru tanpa evidence (lihat ADR-014)

### Aturan Baru: Never Create Another ARGUS Folder

> **There must always be exactly ONE canonical ARGUS repository.**

Semua AI (DeepSeek, Codex, ChatGPT, Antigravity) harus mengacu ke:
```
C:\Users\RYZEN\.antigravity-ide\ARGUS
```

### Dokumentasi Evidence-Centric yang Ditambahkan

| Dokumen | Status | Referensi |
| ------- | ------ | --------- |
| ADR-014: Evidence Beats Opinion | ✅ | `docs/architecture_decision_records.md` |
| Architecture Debt Register | ✅ | `docs/architecture_debt_register.md` |
| Kill Criteria | ✅ | `docs/kill_criteria.md` |
| North Star Dashboard | ✅ | `docs/north_star_dashboard.md` |
| Evidence Directory (10 templates) | ✅ | `evidence/` |
| Evidence-Driven Roadmap | ✅ | `docs/argus_evidence_driven_roadmap.md` |
