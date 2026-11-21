# iPaymu P0 remediation — partial hardening, NOT READY

Verdict: **NOT READY — P0 DEFECTS REMAIN**.

## Baseline and reproduction

Root: `C:\Users\RYZEN\.antigravity-ide\ARGUS`; branch main; HEAD `91139ebea0bb08f035c206c3f4e21dfa2cb4787a`.
No tracked changes or staged changes at start. Five existing untracked artifacts preserved: two root readiness reports, original forensic report, original evidence JSON, original audit runner. Original forensic runner executed using a redirected output filename without editing original artifacts. Evidence: `evidence/ipaymu-p0-baseline.json`. Baseline failures reproduced, including DOKU, tax/refund, and 11/13 security expectations.

All relative paths below are under the absolute root above. No commit, push, deployment, environment update, database migration, or real Sandbox transaction performed.

## Defect-to-code mapping and implemented scope

| Defect | Actual file / function | Original test | Implementation / result |
|---|---|---|---|
| Environment | src/services/payment/IPaymuProvider.js constructor, buildSignedRequest, createPayment | G01–G05 | Reads IPAYMU_ENV and IPAYMU_BASE_URL; validates exact paired URLs, credentials, deployment scope, activation; NODE_ENV does not select gateway. Explicit simulator only in test runtime. PASS new fixtures |
| Signature | same file, verifyWebhook | S01/S02 | Official normalized field types and sorted JSON, VA HMAC only, X-Signature, fixed-length timing-safe comparison, documented slash encodings. PASS new complete fixtures |
| Atomicity | src/services/payment/PaymentService.js createPayment/handleWebhook; src/services/escrowService.js recordPayment; src/storage/PostgresMoneyRepository.js recordLedgerTransaction | W02 | NOT IMPLEMENTED. PaymentService explicitly blocks iPaymu before initiation or callback mutation; authenticated callbacks return retryable 503, not success |
| Ordering | PaymentService.handleWebhook | W01 | NOT IMPLEMENTED. Block occurs before dedup insertion, so no new poisoned idempotency records; no claim that pending-to-success works |
| Inquiry/reconciliation | IPaymuProvider.getPaymentStatus / PaymentService.reconcileTransactions | P02/R01 | Real HTTP adapter contract; errors explicit, no simulated fallback. Reconciliation invokes inquiry but reports discrepancies only; no durable automatic repair |

Additional hardening: malformed creation response rejected; fake fallback transaction reference removed; provider redirect origin checked; response error bodies not included in thrown errors; Sandbox callback/return/cancel URLs must match deployment-specific VERCEL_URL under VERCEL_ENV=preview. No Production domain fallback remains in createPayment payloads.

Configuration contract: IPAYMU_ENV, IPAYMU_BASE_URL, IPAYMU_API_KEY, IPAYMU_VA, existing IPAYMU_WEBHOOK_URL; optional explicit IPAYMU_RETURN_URL and IPAYMU_CANCEL_URL. Sandbox derives URLs only from Preview VERCEL_URL and rejects overrides to another origin. Production requires independent explicit URLs. Missing configuration leaves the provider registered but BLOCKED and rejects operations; it does not break registration of other providers. Actual Preview secrets were not fetched or validated during remediation.

## Official contract review

Retrieved during this remediation: docs.ipaymu.com/en/docs/callback, docs.ipaymu.com/en/docs/signature, docs.ipaymu.com/en/docs/payment/redirect-payment, docs.ipaymu.com/en/docs/payment/direct-payment, docs.ipaymu.com/id/docs/transaction/check-transaction.

Callback uses X-Signature, HMAC-SHA256 with VA, sorted keys; integer trx_id/status_code/transaction_status_code/paid_off, boolean is_escrow, array additional_info (default []), string other values. The documented PHP example removes payload signature before signing. Both slash serializations documented. Required TIKUM policy fields are trx_id, sid, reference_id, status, status_code, amount, merchant; these are an application requirement, not a claim that all are universally mandatory for every iPaymu notification.

Inquiry: POST /transaction with transactionId. Validates HTTP, Status=200, Success=true, Data.TransactionId, SessionId, numeric status and amount. Documented status mapping: 0 pending; 1 paid; 2 cancelled; 3 refunded; 4/5 failed; 6 paid unconfirmed; 7 escrow; -2 expired. Raw status retained. Numeric status 6 is NOT permission to post a ledger entry or certify settlement. This mapping is adapter-only; financial processing remains blocked.

The documented inquiry example does not contain currency or merchant VA. Return these as null instead of inventing verified fields. Merchant binding through credentials plus authenticated callback and an immutable account/environment identity needs design and validation; do not assume the sample MerchantName is a VA. SessionId vs TransactionId must remain distinct, particularly for redirect creation before a transaction ID is known. The generic creation orchestrator still has legacy reference fallback behavior; its iPaymu gate prevents using it until repaired.

## Architectural blocker: stop condition invoked

EscrowService.recordPayment mutates state arrays, then writes payment/order/escrow through separate repository calls, then marketplace inventory through a separate repository, then ledger and ARGUS attestations. Ledger transaction owns its own PostgreSQL connection/BEGIN/COMMIT. Errors in capture/attestations are swallowed. Existing code also generates TICKET_EVIDENCE_ATTESTATION PASS as a consequence of payment.

An in-memory lock or restoring arrays cannot roll back already committed SQL or coordinate multiple instances. Implementing shared transactional payment commit, durable notification ownership/retry and an outbox/post-commit trust effect requires extending the current repository transaction boundary. This was not implemented or represented as safe within this targeted patch. No duplicate service/ledger was created. Existing DOKU/RCB/Midtrans/Xendit behavior was not changed.

Containment prevents newly processed iPaymu callbacks from reaching these unsafe writes. It is NOT a functional payment state machine. No successful callback, ledger capture or ARGUS payment evidence is emitted by the blocked path. Durable forensic callback storage/redacted raw-payload retention, durable incident recording and actual database failure/concurrency tests remain pending. Reconciliation currently reads cached canonical payments, returns persisted=false and reconciled_count=0, and never silently declares a successful repair. This limitation is explicit, not production-ready reconciliation.

## Executed tests

Run: `node C:\Users\RYZEN\.antigravity-ide\ARGUS\scripts\run_ipaymu_p0_audit.js`.
Evidence: `evidence/ipaymu-p0-remediation.json`. Original audit runner and evidence remain unchanged. Wrapper executes the original runner with changed evidence target and extra fixture; it guards expected source anchors. Temporary tracked-source copy, no .env files, no payment/database credentials, no external network. New untracked regression file explicitly included.

| Group | Previous | New |
|---|---|---|
| Environment | FAIL | New positive/negative fixtures PASS |
| Callback contract | FAIL | New complete documented-shape fixtures PASS; legacy fixtures fail |
| Amount mismatch atomicity | FAIL | BLOCKED; containment leaves all state unchanged, not atomic success proof |
| Callback ordering | FAIL | BLOCKED; no accepted financial transitions |
| Inquiry | FAIL | Mock HTTP contract/error/status fixtures PASS; no actual API call |
| Reconciliation | FAIL | Diagnostic inquiries PASS; durable recovery BLOCKED |
| Ledger | Tax/refund FAIL | Same failure; capture atomicity not implemented |
| ARGUS lifecycle suite | 22 fixture checks PASS | FAIL after strict signature contract; legacy raw-body assumptions not updated |
| Integration alignment | 24 PASS | 24 PASS, fixtures only |
| Refund integrity | 16 PASS | 16 PASS |
| Compliance | 87 PASS | 87 PASS |
| New adapter/containment suite | Absent | 46 PASS |
| Provider contract | DOKU FAIL | Same FAIL |
| Production readiness suite | BLOCKED outbound IP | FAIL earlier after tightened contract; outbound IP remains NOT VERIFIED/BLOCKED |
| Build steps | PASS isolated test runtime | PASS all 3; syntax 326 files, homepage, sitemap |

Original forensic security suite remains failing and is preserved as-is; incomplete callback fixtures, lack of explicit base URL and expectations of functional transitions must not be treated as new API acceptance tests. New tests use independently constructed signature oracle with documented-shape values, not provider-captured evidence. They cover environment pairing, missing settings, production gates, Preview URLs, missing/malformed signatures, changed fields/key, field ordering, inquiry status/errors/timeouts, malformed creation after transport, concurrent/replayed blocked callbacks and repeated diagnostic reconciliation.

No full npm test execution. No configured lint/typecheck scripts in existing package.json; no new dependency introduced. All build commands executed in isolated NODE_ENV=test, NOT Production runtime certification. No DB-backed atomicity/idempotency tests executed. No frontend bundle secret audit beyond status serialization test and source review; full guarantee remains unverified.

## Independent existing failures

- DOKU: contract suite expects unsupported createPayout to reject when capabilities.payout=false, but provider permits an explicitly simulated PENDING_BANK_EXECUTION in test runtime. Test also calls an object-parameter method with positional arguments. This is an existing simulation/contract mismatch, not caused by iPaymu changes. No DOKU tests removed or weakened; production contract needs separate reviewed correction.
- Refund: pricing/tax test expects immediate REFUNDED and reversal after refundToBuyer. Existing service requires authoritative provider confirmation and otherwise leaves REFUND_PENDING. Do not make refunds auto-confirm merely for this assertion. Test needs an explicitly confirmed provider fixture or the separate confirmation lifecycle while retaining monetary reversal checks. Not changed in this blocked partial remediation.
- Outbound IP remains externally blocked, never PASS.
- Merchant-specific secondary ticket resale, escrow, split settlement, event-based release and H-10 remain unconfirmed. No custody or payout claims.

## Git disposition and next gate

Tracked edits limited to IPaymuProvider.js and PaymentService.js. Added test, wrapper, baseline/after evidence and this report. All original untracked files preserved. No staging or commit. Recommendation: do not commit as completed remediation; do not deploy or authorize payment.

Next required work: approve/review a minimal shared transaction boundary in existing MoneyRepository, durable per-notification claims with retry state, atomic canonical/order/ledger commit, post-commit ARGUS evidence independent of ticket verification, durable discrepancy recovery, then update legacy contract fixtures and execute database-backed concurrency/failure tests. This does not require replacing providers or building a new payment system, but is more than reordering statements in PaymentService. Human authorization remains mandatory after all readiness gates pass.