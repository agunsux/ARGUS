# TIKUM / ARGUS — System Architecture

## 1. Product Positioning & Layer Separation

TIKUM is a secondary-ticket transaction infrastructure for Indonesia, eventually ASEAN.
- **ARGUS**: The underlying trust and verification infrastructure layer.
- **TIKUM**: The consumer marketplace layer (`https://tikum.app`).

### Canonical Boundaries
```text
DISCOVERY / SUPPLY
External Sources → Source Adapter → Observation → Normalization → Deduplication → Conflict Detection → Verification → Canonical Event
       │
       ▼
EVENT TRUTH & QUALITY GATE
Canonical Event → Deterministic Quality Scoring (0-100) → Marketplace Eligibility Gating
       │
       ▼
TRUST & VERIFICATION
Identity Trust → Ticket Evidence → Risk Signals → Verification Officer → Physical Venue PIC
       │
       ▼
MARKETPLACE (FIREWALLED)
Canonical Event → Active Listing → Order → Transaction Challenge
       │
       ▼
MONEY & ESCROW (GATED)
Domain Escrow State Machine → Double-Entry Financial Ledger
(Payment Provider: PENDING_VERIFICATION)
```

## 2. Decoupled Subsystems

1. **Discovery & Supply**: Ingests external event observations from official promoters (APMI), venue calendars, and ticketing partners without creating listings or inventory.
2. **Event Truth**: Authoritative registry enforcing canonical states (`DISCOVERED`, `NORMALIZED`, `VERIFIED`, `UNVERIFIED`, `CONFLICT`, `EXPIRED`, `REJECTED`) and blocking illegal transitions.
3. **Trust & Verification**: Multi-factor ticket verification, cryptographic evidence hashing, and explainable 4-pillar seller trust.
4. **Venue Operations**: Physical venue PIC presence, shifts, turnstile gate verification sessions, and dual-confirmation challenge codes.
5. **Money & Escrow**: Domain-level state machine and double-entry ledger. Real money activation remains strictly gated while iPaymu verification is `PENDING_VERIFICATION`.
