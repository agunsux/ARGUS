# TIKUM / ARGUS — Production Readiness & iPaymu Readiness Gate

## 1. iPaymu 12-Criteria Readiness Gate (Epic S)

Payment provider cannot become `ACTIVE` until all 12 criteria are satisfied:

| # | Readiness Criterion | Current Status | Blocker Notes |
| :---: | :--- | :---: | :--- |
| 1 | **Merchant Verification** | ⏳ PENDING | Awaiting iPaymu compliance verification for Shinerva HQ. |
| 2 | **Production Credentials** | ⏳ PENDING | Production API key & VA awaiting merchant activation. |
| 3 | **Webhook Endpoint Validated** | ✅ PASSED | Endpoint configured at `/api/mvp/payment/webhook`. |
| 4 | **Signature Validation** | ✅ PASSED | HMAC-SHA256 timing-safe signature verification implemented. |
| 5 | **Duplicate Webhook Idempotency** | ✅ PASSED | Idempotent duplicate protection active. |
| 6 | **Refund Behavior Validated** | ⏳ PENDING | Requires live staging test with real merchant account. |
| 7 | **Cancellation Behavior Validated** | ⏳ PENDING | Requires live staging test with real merchant account. |
| 8 | **Failure Behavior Validated** | ⏳ PENDING | Requires gateway timeout and error mapping validation. |
| 9 | **Timeout Behavior Validated** | ⏳ PENDING | Requires 2-hour payment window expiration validation. |
| 10 | **Reconciliation Validated** | ⏳ PENDING | Requires batch settlement statement reconciliation. |
| 11 | **Settlement Semantics Validated** | ⏳ PENDING | Escrow holding vs. instant disburse rules confirmed. |
| 12 | **Controlled Real Transaction Passed** | ⏳ PENDING | Final Rp 10.000 test transaction pending merchant activation. |

### Operational Status
```text
STATUS = PENDING_VERIFICATION
ACTIVATION = BLOCKED
```

## 2. Production Safety Invariants
- `NO_REAL_PAYMENT`: Enforced by `PaymentService`.
- `NO_REAL_SETTLEMENT`: Enforced by `EscrowStateMachine` and `FinancialLedger`.
- `NO_FAKE_PAYMENT_SUCCESS`: Zero synthetic payments in production.
- `NO_FAKE_ESCROW_BALANCE`: All balances derived dynamically from double-entry ledger.
- `NO_FAKE_GMV`: Admin dashboard reports real database order values only.
