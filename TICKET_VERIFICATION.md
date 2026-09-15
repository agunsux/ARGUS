# TIKUM / ARGUS — Ticket Verification & Evidence System

## 1. Canonical Ticket Model
A ticket on ARGUS is defined by:
- `ticket_id`, `event_id`, `seller_id`, `ticket_type`, `section`, `row`, `seat`, `face_value`, `currency`
- `ownership_evidence`: Array of cryptographic evidence item references
- `transferability_status`: `TRANSFERABLE_DIGITAL`, `PHYSICAL_WRISTBAND`, `IDENTITY_BOUND`, `NON_TRANSFERABLE`
- `verification_status`: `SUBMITTED`, `EVIDENCE_REQUIRED`, `UNDER_REVIEW`, `VERIFIED`, `CONDITIONALLY_VERIFIED`, `REJECTED`, `EXPIRED`, `CANCELLED`
- `risk_status`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

## 2. Invariant: No Image-Only Verification
A ticket is NEVER verified simply because a seller uploaded a screenshot or photo.
Verification requires matching:
1. `PRIMARY_PURCHASE_CONFIRMATION`: Invoice/booking confirmation from promoter ticketing partner.
2. `OFFICIAL_TICKETING_RECORD`: Ticketing account proof or seat confirmation.
3. Cryptographic hash verification of barcode/QR string with duplicate prevention.

## 3. Evidence Storage & Indonesia UU PDP Minimization
Evidence types:
- `PRIMARY_PURCHASE_CONFIRMATION`
- `OFFICIAL_TICKETING_RECORD`
- `TRANSFER_CONFIRMATION`
- `TICKET_METADATA`
- `VENUE_INSTRUCTIONS`
- `PROMOTER_INSTRUCTIONS`
- `IDENTITY_DOCUMENTATION` (Sensitive PII)
- `OFFICER_CONFIRMATION`
- `BARCODE_VERIFICATION_RECORD`

### UU PDP Privacy Enforcement
- Identity documentation is hashed upon ingestion (`hash` stored, PII masked).
- Public and counterparty APIs return redacted evidence metadata with notice:
  `"PII redacted under Indonesia UU PDP No. 27/2022"`.
- Raw decryption and viewing requires role `admin` or active assigned `pic` during the operational window.
