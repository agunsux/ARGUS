# TIKUM / ARGUS — Escrow State Machine & Double-Entry Ledger

## 1. Domain Escrow Lifecycle
```text
[ORDER_CREATED]
       │
       ▼
[PAYMENT_PENDING] ───► [CANCELLED] / [REJECTED]
       │
       ▼
    [FUNDED]
       │
       ▼
[TICKET_SUBMITTED]
       │
       ▼
[VERIFICATION_PENDING] ───► [REJECTED] ──► [REFUND_PENDING]
       │
       ▼
   [VERIFIED]
       │
       ▼
[DELIVERY_PENDING]
       │
       ▼
  [DELIVERED]
       │
       ▼
[ENTRY_CONFIRMED]
       │
       ▼
[RELEASE_PENDING]
       │
       ▼
   [RELEASED] (Terminal Success)
```

Branch Failure States:
- `DISPUTED`: Can occur from `FUNDED`, `DELIVERED`, or `ENTRY_CONFIRMED`.
- `REFUND_PENDING` → `REFUNDED` (Terminal Refund).
- `FROZEN`: Administrative hold during critical fraud investigation.

## 2. Invariant Rules
1. Every state transition requires: `previous_state`, `actor_id`, `actor_role`, `timestamp`, `reason`, `correlation_id`.
2. Direct arbitrary database mutation is prohibited.
3. Transitions to terminal release (`RELEASED`) require `admin` or `SYSTEM` authorization and confirmed entry.

## 3. Double-Entry Financial Ledger
Never use mutable balance fields as the authoritative model (`balance += amount` is forbidden).
Every financial event produces balanced debits and credits:
$$\sum \text{Debits} = \sum \text{Credits}$$

### Standard Accounts
- `BUYER_ESCROW_HOLDING` (Asset)
- `SELLER_PAYABLE_PENDING` (Liability)
- `PLATFORM_FEE_REVENUE` (Revenue)
- `PAYMENT_GATEWAY_CLEARING` (Clearing Asset)
- `SETTLEMENT_CLEARING` (Clearing Disbursal)
