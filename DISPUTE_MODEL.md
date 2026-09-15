# TIKUM / ARGUS — Dispute & Incident Model

## 1. Incident Management as First-Class Entities
Incidents are formally recorded events that occur before, during, or after event admission.

### Incident Types
- `FAKE_TICKET`
- `DUPLICATE_TICKET`
- `WRONG_EVENT`
- `WRONG_DATE`
- `IDENTITY_MISMATCH`
- `TRANSFER_FAILURE`
- `ENTRY_FAILURE`
- `SELLER_NO_SHOW`
- `BUYER_NO_SHOW`
- `VENUE_POLICY_CONFLICT`
- `PAYMENT_ISSUE`
- `OTHER`

### Severities
- `LOW`: Informational / minor delay.
- `MEDIUM`: Seat discrepancy or minor gate delay resolved on-site.
- `HIGH`: Gate rejection, duplicate barcode scan.
- `CRITICAL`: Forged ticket, fraudulent seller duplicate entry.

## 2. Evidence-Backed Dispute Resolution
Disputes are never resolved based on subjective claims or free-text opinions alone.
- Every decision requires attached evidence references (`evidence_bundle_id`, `decision_evidence_ids`, or formal PIC field inspection report).
- Canonical Outcomes:
  - `BUYER_FAVORED` (Full refund to buyer)
  - `SELLER_FAVORED` (Release funds to seller post-investigation)
  - `PARTIAL` (Partial settlement / split)
  - `PLATFORM_ERROR` (System discrepancy compensation)
  - `INSUFFICIENT_EVIDENCE` (Requires further documentation)
  - `PENDING` (Under active investigation)

## 3. Appeal Lifecycle
A buyer or seller whose dispute was resolved may file an appeal within the appeal window by providing new evidence bundles (`fileAppeal`), moving the dispute into `APPEALED` status for senior officer review.
