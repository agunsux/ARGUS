# Architecture Debt Register

> **Bukan Technical Debt. Architecture Debt.**
>
> Keputusan arsitektur yang **sengaja** diambil sebagai kompromi sementara, dengan exit criteria dan rencana migrasi yang jelas.
>
> *Referenced by: [ADR-014](architecture_decision_records.md#adr-014-evidence-beats-opinion)*

---

## Register

| ID     | Debt                       | Why Accepted        | Exit Criteria                 | Target     | Status |
| ------ | -------------------------- | ------------------- | ----------------------------- | ---------- | ------ |
| A-001  | SQLite                     | Bootstrap only      | Migrasi ke PostgreSQL         | Alpha v2   | 🟡     |
| A-002  | Local file storage         | MVP                 | Migrasi ke Object Storage     | Alpha v2   | 🟡     |
| A-003  | Single node deployment     | MVP                 | Multi-node / multi-region     | Beta       | 🟡     |
| A-004  | Manual verification        | Learning            | Automated verification pipeline| Beta      | 🟡     |
| A-005  | No rate limiting           | Early adopter only  | Token bucket rate limiter     | Alpha v2   | 🟡     |
| A-006  | Plaintext secrets in config| Internal dev only   | Vault / KMS integration       | Pre-prod   | 🟡     |
| A-007  | Monolith API               | Speed of iteration  | Modular service boundary      | Beta       | 🟡     |

---

## Status Legend

| Status | Arti                                          |
| ------ | --------------------------------------------- |
| 🟡     | Accepted — belum waktunya diselesaikan         |
| 🟠     | In Progress — sedang dimigrasikan              |
| 🟢     | Resolved — debt sudah dilunasi                 |
| 🔴     | Overdue — melebihi target, perlu eskalasi      |

---

## Prinsip

1. **Setiap architecture debt HARUS punya exit criteria yang terukur**
2. **Setiap architecture debt HARUS punya target penyelesaian**
3. **Jangan menambah debt baru tanpa mendiskusikan di Architecture Review**
4. **Review register ini setiap sprint retrospective**

---

## Debt vs Permanent Decision

| Architecture Debt                                     | Permanent Decision                     |
| ----------------------------------------------------- | -------------------------------------- |
| SQLite → PostgreSQL (A-001)                            | Event Sourcing sebagai source of truth |
| Local storage → Object Storage (A-002)                 | Immutable evidence chain               |
| Single node → Multi-node (A-003)                       | Ownership Integrity Rate = 100%        |
| Manual → Automated verification (A-004)                | Cryptographic verifiable claims        |

---

*Sadar mana yang sementara, mana yang prinsip permanen.*
