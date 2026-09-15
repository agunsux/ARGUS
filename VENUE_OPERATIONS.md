# TIKUM / ARGUS — Venue Operations Engine

## 1. Physical Human Moat
TIKUM's strongest moat against online fraud and informal secondary market scalping is the physical presence of verified Venue Person-In-Charge (PIC) officers at event gates.

## 2. Core Entities & Relationships
```text
Event ── Venue ── VenuePIC ── Shift ── VerificationSession ── Ticket ── Evidence ── Incident ── Resolution ── Audit Trail
```

## 3. PIC Lifecycle States
- `ASSIGNED`: Scheduled for event shift.
- `CHECKED_IN`: Arrived at venue, verified location.
- `ACTIVE`: Actively scanning and assisting at turnstile gate.
- `ESCALATED`: Handling a high-severity entry dispute or incident.
- `OFFLINE`: Shift break or connection lost.
- `CHECKED_OUT`: Shift completed, session reconciled.

## 4. Four-Phase Operational Workflow
1. **Before Event (Briefing)**:
   - Review venue admission protocol (RFID Wristband vs. E-ticket QR vs. ID check).
   - Expected transaction volume and buyer meetup locations.
   - Escalation contacts and gate mapping.
2. **During Verification (Handoff)**:
   - Verify ticket details and seller handoff.
   - Dual-confirmation: PIC verifies seller handoff challenge code.
   - Mark order `HANDOFF_READY` or `TICKET_VERIFIED`. Note: Ticket verification does NOT disburse escrow!
3. **At Entry (Turnstile Gate)**:
   - Buyer generates 6-digit `ENTRY_CONFIRMED` challenge on their phone.
   - PIC enters code at the turnstile gate alongside gate photo verification.
   - Dual confirmation transitions order to `ENTRY_CONFIRMED`.
4. **After Event (Reconciliation)**:
   - Reconcile total admissions against verified orders.
   - Review unresolved incidents and evidence completeness.
   - Record postmortem audit trail.
