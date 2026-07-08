# System Invariants — ARGUS Trust Infrastructure

This document outlines the system invariants (business rules and domain assertions) that the ARGUS Trust Infrastructure must guarantee at all times. The implementation (database schema, application logic, and validation constraints) must strictly enforce these invariants.

---

## Invariant 1: Single Current Owner

* **Statement:** At any point in time, a registered ticket must belong to exactly one active owner.
* **Logic:** 
  $$\forall t \in \text{Tickets}, \quad |\{\text{current\_owner}(t)\}| == 1$$
* **Enforcement:** The database schema links a ticket to a single `current_owner_id` (foreign key to `users`). Any transfer transaction updates this reference in a single transaction block.

---

## Invariant 2: Ownership Change Appends History

* **Statement:** Any change of ownership must create a new ownership state record. Existing records must not be updated or overwritten.
* **Logic:** 
  $$\Delta(\text{current\_owner}(t)) \implies \text{append}(\text{ownership\_history}(t))$$
* **Enforcement:** The application layer must wrap owner updates in a transaction that updates the ticket's `current_owner_id` and inserts a new history row into `transfers`/`ownership_records` simultaneously.

---

## Invariant 3: Evidence Bundle Reference

* **Statement:** Every ownership transfer record must reference a valid, immutable evidence bundle containing the verification proof.
* **Logic:** 
  $$\forall r \in \text{OwnershipHistory}, \quad \exists e \in \text{EvidenceBundles} \quad \text{such that} \quad r.\text{evidence\_id} == e.\text{id}$$
* **Enforcement:** Database schema enforces a foreign key constraint linking historical ownership transitions to the corresponding evidence records.

---

## Invariant 4: Verification Before Settlement

* **Statement:** Escrow funds cannot be released to the seller (settled) before the ticket is verified and the buyer's payment is confirmed in escrow.
* **Logic:** 
  $$\text{settlement}(t) \implies (\text{ticket.status}(t) == \text{'VERIFIED'} \land \text{transfer.status}(t) == \text{'ESCROW\_PAID'})$$
* **Enforcement:** Application code check-guards: the endpoint `/api/admin/transfers/:id/release` must throw an error if the ticket status is not `VERIFIED` and the transfer status is not `ESCROW_PAID`.

---

## Invariant 5: Single Transfer Finalization

* **Statement:** A ticket transfer transaction can only be finalized (completed/settled) exactly once. Replays or double transfers are prohibited.
* **Logic:** 
  $$\text{state}(\text{transfer}) == \text{'TRANSFERRED'} \implies \text{state}(\text{transfer}) \text{ cannot transition to any active payment state.}$$
* **Enforcement:** Database locks and strict transition checks in `routes.js` that only allow finalization from the `ESCROW_HELD` state.

---

## Invariant 6: Immutable Audit Logs

* **Statement:** The audit log table is strictly append-only.
* **Logic:** 
  $$\forall l \in \text{AuditLogs}, \quad \text{update}(l) = \emptyset \land \text{delete}(l) = \emptyset$$
* **Enforcement:** Relational database triggers or application-level repository access objects that do not expose any update or delete methods on `AuditLogs`.

---

## Invariant 7: Immutable Evidence in Disputes

* **Statement:** Any dispute record must link to evidence files that are read-only and cannot be altered or removed.
* **Logic:** 
  $$\forall d \in \text{Disputes}, \quad d.\text{evidence} \implies \text{immutable\_storage\_path}$$
* **Enforcement:** File storage layer sets read-only permissions on uploaded dispute files. Database holds the unique URI and does not support updates.

---

## Invariant 8: Derivable Current Owner

* **Statement:** The current owner of a ticket must always be derivable by finding the latest valid ownership transfer entry in the historical ledger.
* **Logic:** 
  $$\text{current\_owner}(t) = \text{latest\_by\_timestamp}(\text{ownership\_history}(t).\text{new\_owner\_id})$$
* **Enforcement:** A unit test or database sanity check script will periodically verify that `ticket.current_owner_id` matches the latest entry in `transfers` where `status = 'TRANSFERRED'`.

---

## Invariant 9: VSER is the Ultimate Quality Gate

* **Statement:** The system's primary operational health metric is the Verified Successful Entry Rate (VSER), representing the ratio of dispute-free ticket entries to total check-ins.
* **Logic:** 
  $$VSER = \frac{\text{RedeemedTransfers}}{\text{RedeemedTransfers} + \text{DisputedTransfers}} \ge 0.999 \quad (\text{Target: } 99.9\%)$$
* **Enforcement:** Real-time analytics view aggregates `REDEEMED` status vs `DISPUTED` status. If VSER drops below 99.9%, a high-priority warning is flagged on the Admin Dashboard.

---

## Invariant 10: Ledger Replay Ownership Consistency

* **Statement:** Replaying the chronological stream of ledger events for a ticket must yield the exact same owner as the stored `current_owner_id` reference.
* **Logic:** 
  $$\text{current\_owner}(t) == \text{replay}(\text{ledger\_events}(t))$$
* **Enforcement:** Database transactions must write state-changing ledger events and update cached records simultaneously. Integration tests must validate that replaying the event table reproduces the exact state of the `tickets` table.

---

## System Failure Budgets & SLAs

The system enforces the following technical contract thresholds. Any breach of these thresholds represents an architectural failure:

| Metric | Target | Description | Enforcement Mechanism |
| :--- | :---: | :--- | :--- |
| **Ownership Integrity** | 100% | Zero double-ownerships, orphan tickets, or replay drifts. | Automated nightly ledger reconciliation scripts. |
| **Evidence Integrity** | 100% | Zero altered or untracked verification bundle documents. | SHA-256 integrity validation loops. |
| **Replay Determinism** | 100% | Identical replay state output across all execution zones. | Dialect-neutral SQL and sequence order checks. |
| **Audit Mutability** | 0% | Zero unauthorized edits/deletes on ledger logs. | Write-only triggers on database layers. |
| **Duplicate Settlement** | 0% | Zero double-escrow releases for any transfer. | State validation constraints in escrow context. |
| **Verification Availability** | ≥99.9% | Availability of operations check queues and tools. | System health probes and automated monitoring. |
| **API Availability** | ≥99.9% | Availability of endpoints to edge validation nodes. | Multi-zone failover and edge deployment configurations. |


