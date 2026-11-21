# TIKUM × iPaymu Sandbox forensic execution report

## A. Executive decision: SANDBOX FAIL

Audit date: 2026-11-10. No Sandbox payment was initiated. Configuration verification blocked safe initiation; offline execution additionally reproduced critical security/state failures. This is NOT a completed Sandbox E2E certification. Recommendation is **SANDBOX FAIL**, rather than PASS WITH LIMITATIONS, because critical failures were actually reproduced.

Root for all repository-relative locations below: `C:\Users\RYZEN\.antigravity-ide\ARGUS`.
Branch: `main`. HEAD: `91139ebea0bb08f035c206c3f4e21dfa2cb4787a`.
Initial tracked staged/unstaged changes: none. Pre-existing untracked user files preserved:
`TIKUM_IPAYMU_FINAL_CORRECTED_READINESS_REPORT.md`, `TIKUM_IPAYMU_IMPLEMENTATION_READINESS.md`.
Recent commits inspected: `91139eb`, `fc709d8`, `d012066`, `ed63e3d`, `a896845`, `88bc598`.

Only an offline audit runner, its sanitized evidence, and this report were added. No application code, provider registration, credentials, database, webhook configuration, or deployment changed. No commit: relevant tests are not all green and the directive conditions committing on passing tests.

## B. Configuration evidence and stop condition

Read-only command executed: `vercel env ls preview --no-color` (CLI 59.17.0).
Linked project: shinerva/argus. Values were hidden; no secrets were pulled or printed.

| Variable | Preview listing | Application reads it | Validation |
|---|---|---|---|
| IPAYMU_ENV | Present, Secret, Preview | No | FAIL: ignored |
| IPAYMU_BASE_URL | Present, Secret, Preview | No | FAIL: ignored |
| IPAYMU_VA | Present, Secret, Preview | Yes | Presence only; provenance/value unverified |
| IPAYMU_API_KEY | Present, Secret, Preview | Yes | Presence only; provenance/value unverified |
| IPAYMU_WEBHOOK_URL | Absent from Preview listing | Yes | Production callback default exists |
| DEFAULT_PAYMENT_PROVIDER | Absent from Preview listing | Yes | Registry default is DOKU |
| MARKETPLACE_MODE | Present, Secret, Preview | Yes | Value not retrieved |
| DATABASE_URL | Present, Secret, Preview | Yes | Database isolation unverified |

Local `.env.local` has no iPaymu keys; it contains database configuration whose values were not printed. Process has no iPaymu credentials. `.env.example` includes API key, VA and webhook names, but not IPAYMU_ENV or IPAYMU_BASE_URL.

`src/services/payment/IPaymuProvider.js:34-46` reads credentials but derives mode from constructor config or NODE_ENV. `vercel.json:27-29` sets NODE_ENV=production, including Preview. A no-argument adapter therefore selects Production, independently of Preview IPAYMU_ENV. The production enablement gate currently blocks real execution; do NOT turn it on to bypass this problem. Default callback/return/cancel destinations point to tikum.app. A current deployed Preview instance and its effective configuration were NOT inspected.

Required correction before any payment request: explicitly consume and validate IPAYMU_ENV/IPAYMU_BASE_URL; reject missing/ambiguous modes and mismatched hosts; require Preview-local callback/return/cancel destinations; establish Sandbox credential provenance and separate test database; separate Sandbox readiness from Production merchant activation without disabling production guards. No remote environment corrections were made.

## C. Actual architecture and dependency map

Buyer -> `src/api/paymentRouter.js` / `src/api/mvpRouter.js`
-> `src/services/marketplace/MarketplaceOrderService.js`
-> `src/services/payment/PaymentService.js`
-> `src/services/payment/index.js` / `PaymentRoutingService.js`
-> `IPaymuProvider.js`
-> `/api/v1/payments/webhook/ipaymu`
-> `PaymentService.handleWebhook` (signature, parse, inquiry)
-> `src/services/escrowService.js`
-> `src/settlement/FinancialLedger.js`
-> `src/trust/TrustPolicyEngine.js`
-> existing fulfillment/venue/dispute gates.

Existing providers: DOKU, Midtrans, Xendit, iPaymu; deterministic test provider under NODE_ENV=test. RCB is already excluded by existing registry and has a legacy route; this audit did not remove/replace it.
Existing supporting services located: `src/trust/TicketTrustService.js`, `src/trust/SellerTrustService.js`, `src/services/disputeService.js`, `src/venue/IncidentService.js`, `src/venue/VenueOperationsService.js`, `src/services/eventPicService.js`.
Existing monitoring: `src/services/admin/TransactionControlCenterService.js`, `src/api/adminRouter.js`, `src/api/adminTrustRouter.js`. Do not create another dashboard. Full browser behavior/role coverage and all requested monitoring fields remain unverified.
Persistence: `src/storage/PostgresMoneyRepository.js` and InMemoryMoneyRepository, plus `src/settlement/DurableFinancialStore.js` JSON cache. PostgreSQL code contains transactions, row locks, and webhook `(provider, provider_event_id)` conflict handling. These do not establish cross-operation atomicity. DurableFinancialStore uses /tmp on Vercel and swallows write errors; it cannot alone prove durable financial integrity.

## D. Official API contract comparison

Official sources retrieved November 10, 2026 (addresses below are source identifiers, not endpoints called by this audit):
- D1: docs.ipaymu.com/en/docs/getting-started
- D2: docs.ipaymu.com/en/docs/signature
- D3: docs.ipaymu.com/en/docs/payment/redirect-payment
- D4: docs.ipaymu.com/en/docs/payment/direct-payment
- D5: docs.ipaymu.com/en/docs/callback
- D6: docs.ipaymu.com/id/docs/transaction/check-transaction
- D7: ipaymu.com/en/secure-transaction-escrow/
- D8: ipaymu.com/en/user-agreement/

| Contract item | Official requirement / implementation comparison | Result |
|---|---|---|
| Sandbox base | sandbox.ipaymu.com/api/v2; adapter has this constant but ignores deployment env variables | FAIL configuration |
| Authentication | Environment-specific VA and API Key; server-side adapter reads both | PASS static only |
| VA/API Key use | Separate Sandbox and Production credentials required; actual provenance unknown | UNKNOWN operational |
| Request signature | D2 HMAC-SHA256 with API Key over method:VA:body hash:API key; matching formula in adapter | PASS static only |
| Headers | Content-Type, va, signature, timestamp implemented | PASS static only |
| Creation endpoint | D3 POST /payment, D4 POST /payment/direct implemented | PASS static only |
| Request body | Redirect product/qty/price/referenceId and direct amount/method/channel present; full method contract not certified | UNKNOWN full coverage |
| Success schema | Adapter reads Data, but malformed HTTP 200 is accepted and reference fabricated | FAIL P01 |
| Error schema | Non-2xx and non-200 Status checked; null JSON bypasses validation | FAIL P01 |
| Redirect URL | Data.Url extracted; URL host/reference validity not established | NOT VERIFIED |
| Callback mechanism | Existing route; JSON/form behavior against actual provider not tested | NOT VERIFIED |
| Callback signature | D5 normalized types, additional_info default, sorted fields, VA-key HMAC; code hashes raw payload and accepts API-key fallback | FAIL S01/S02 |
| Status inquiry | D6 POST /transaction exists; code swallows errors into simulated pending result | FAIL P02 |
| Refund/eligibility | Implementation returns manual pending; complete official automated-refund contract not established | UNKNOWN, not proof of absence |
| Sandbox channels | Adapter hardcodes channels; no live channel discovery or official payment completion performed | UNKNOWN |
| Timeout/retry | Local HTTP timeout 10 seconds; D5 callback retries require idempotency; cadence/create retry guarantee unverified | PARTIAL / UNKNOWN |
| Provider idempotency | Callback guidance documented; payment-creation idempotency guarantee not established | UNKNOWN |
| Sandbox restrictions | D1 separates credentials and does not require Production verification for Sandbox; deployed readiness conflates activation | FAIL operational gate |

D5 signature normalization was reproduced using synthetic data, not captured merchant data. Callback payload amount remains string; trx_id/status_code are integers and additional_info=[] is added. No real signature or VA appears in evidence.

## E. Executed tests

Runner: `scripts/audit_ipaymu_sandbox.js`.
Evidence: `evidence/ipaymu-sandbox-forensic-audit.json`.
Reproduce: `node C:\Users\RYZEN\.antigravity-ide\ARGUS\scripts\audit_ipaymu_sandbox.js`.
Exit 1 is intentional when security expectations fail; do not relabel failure as PASS.

Runner copies tracked source to a disposable OS temp directory, excludes env files, supplies a minimal process environment with no provider/database credentials, forces test runtime, isolates financial data per child process, and blocks external socket/fetch destinations. Local HTTP tests are allowed. No original sitemap or financial data is overwritten. Fixture payload definitions and assertions are in the runner; evidence records outcomes without credential/signature/request-body dumps. Authentication is stubbed ONLY in W01/W02 to isolate state-machine behavior; those are simulated orchestration tests, not authenticated callbacks.

| Selected existing suite | Executed result | Interpretation |
|---|---|---|
| test_ipaymu_argus_lifecycle.js | PASS, 22/22 | Synthetic, not Sandbox |
| test_ipaymu_final_integration_alignment.js | PASS, 24/24 | Synthetic policy/ledger assertions, not escrow certification |
| test_ipaymu_production_readiness_audit.js | BLOCKED at outbound-IP probe, process exit 1 | External networking intentionally denied; preceding checks ran |
| test_payment_provider_contracts.js | FAIL | Existing DOKU payout capability expectation fails |
| test_pricing_tax_ledger_engine.js | FAIL | Existing refund assertion 4.4 fails |
| test_refund_state_machine_and_provider_confirmation.js | PASS | Local fixtures only |
| test_ipaymu_compliance.js | PASS, 87/87 | Local HTTP/public page checks |
| package build steps | PASS, all three | Syntax (326 files), homepage, sitemap; isolated NODE_ENV=test copy |

This is not the entire npm test suite. No configured lint or typecheck scripts were found in package.json. Production-runtime build/deployment was not executed; all package build commands ran separately in the isolated test runtime.

### Security expectation matrix (actual execution)

| ID | Expected result | Actual result |
|---|---|---|
| G01 | Preview env selects Sandbox despite NODE_ENV=production | FAIL: Production selected |
| G02 | Sandbox mode rejects Production API host | FAIL: signing succeeds |
| G03 | Production mode rejects Sandbox API host | FAIL: signing succeeds |
| G04 | Ambiguous mode rejected | FAIL: signing succeeds |
| G05 | Missing API key and VA reject initiation | PASS |
| S01 | Documented normalized callback accepted | FAIL |
| S02 | Undocumented API-key callback fallback rejected | FAIL |
| S03 | Invalid signature rejected | PASS |
| P01 | HTTP 200 malformed JSON rejected | FAIL |
| P02 | Inquiry transport failure propagated, never simulated | FAIL |
| W01 | Pending notification does not suppress later paid notification | FAIL: later notification deemed duplicate |
| W02 | Amount mismatch leaves canonical payment pending | FAIL: canonical marked paid before rejection |
| R01 | Reconciliation queries provider and detects discrepancy | FAIL: local-only match |

Security probes: 2 PASS / 11 FAIL. No security fixes applied in this configuration-blocked audit.

### Requested end-to-end acceptance matrix

| Test | Result | Evidence |
|---|---|---|
| Sandbox API connectivity | BLOCKED / NOT EXECUTED | Configuration stop condition |
| Payment creation | BLOCKED real; FAIL malformed-response fixture | P01 |
| Sandbox payment completion | NOT EXECUTED | No official test payment used |
| Callback delivery | NOT EXECUTED | No provider transaction |
| Signature verification | FAIL local documented-contract fixture | S01/S02 |
| Duplicate callback protection | FAIL ordered-notification fixture; true concurrent DB behavior untested | W01 |
| Amount validation | FAIL state-integrity fixture | W02 |
| Order state integrity | NOT CERTIFIED | Canonical mutation precedes verification |
| Financial Ledger posting | Local balancing passes; existing tax/refund suite fails; real exactly-once untested | Suite results |
| ARGUS integration | Synthetic lifecycle passes; payment creates ticket-evidence PASS without separate proof in inspected path | Static finding |
| Reconciliation | FAIL | R01 |
| Refund flow | Local state-machine suite passes; tax/ledger refund suite fails; real provider refund untested | Suite results |
| Production isolation | No production operation by this audit; deployed isolation NOT VERIFIED | Runner/no deployment |
| Build | PASS isolated build steps; Production runtime NOT VERIFIED | Evidence JSON |

Browser success/failure/close/refresh/revisit, real pending/failed/expired transitions, unknown order rejection, merchant/currency/transaction mismatch, concurrent creation, forged callback over Preview HTTP, missing callback recovery, failed local update recovery, and refund eligibility were NOT fully executed. Do not infer PASS from nearby tests.

## F. Defect register

| ID / priority | Root cause / component | Impact and evidence | Fix / remaining risk |
|---|---|---|---|
| F01 P0 | IPaymuProvider ignores IPAYMU_ENV/BASE_URL; permits mismatched config | Wrong environment target; G01-G04 | Not fixed; keep initiation blocked |
| F02 P1 | Default notify/return/cancel URLs use Production domain | Sandbox/Production mixing risk | Not fixed; require explicit Preview URLs |
| F03 P0 | Raw-body callback HMAC and API-key fallback | Rejects documented callback; expands accepted authentication contracts; S01/S02 | Not fixed; implement only official normalized contract |
| F04 P0 | Canonical mutation before inquiry/amount validation | Rejected callback leaves canonical paid; W02 | Not fixed; validate bound transaction/order/amount/currency/merchant first, then atomic state+ledger |
| F05 P0 | Inquiry catches failure and returns simulated; orchestrator accepts simulated | Missing verification may be treated as evidence; P02/static | Not fixed; fail closed outside explicit fixtures |
| F06 P1 | Dedup key based on transaction, inserted before completed processing | Pending blocks paid; retry after failure suppressed; W01 | Not fixed; durable event/state-aware retry processing |
| F07 P1 | Null JSON bypasses creation validation; fallback transaction reference | Fabricated successful initiation metadata; P01 | Not fixed; validate required response fields and identifiers |
| F08 P1 | reconcileTransactions compares local arrays only | Cannot detect remote discrepancy/missing callback; R01 | Not fixed; authenticated inquiry and discrepancy workflow |
| F09 P0 | EscrowService catches ledger/attestation failures and emits ticket-evidence PASS on payment | Paid state without guaranteed journal; ticket trust conflation | Static finding, fault injection not run; not fixed |
| F10 P1 | Provider call before durable payment/idempotency claim | Concurrent external charge risk | Static finding; concurrency not tested; not fixed |
| F11 P1 | No explicit environment in inspected ledger posting/canonical creation | Sandbox contamination cannot be excluded on shared database | Static finding; deployed DB separation unverified |
| F12 P2 | Existing DOKU contract and tax/refund tests fail | Regression readiness not green | Not fixed; preserve unrelated provider behavior |

Financial mapping inspected: double-entry journal has buyer escrow holding, seller payable pending, platform fee revenue, tax payable and clearing/fee accounts. Capture call forwards ticket value, buyer/seller fees and taxes. This is an internal accounting model, not proof of provider escrow custody. Amount equation, fee provenance, one capture per actual provider transaction, failure atomicity and Sandbox reporting separation still require database-backed verification.

## G. Escrow capability matrix

| Requirement | Finding |
|---|---|
| Merchant eligibility | REQUIRES IPAYMU WRITTEN CONFIRMATION for this merchant; agreement not supplied |
| Secondary ticket marketplace eligibility | REQUIRES IPAYMU WRITTEN CONFIRMATION |
| Escrow availability | VERIFIED SUPPORTED as a general published iPaymu product, NOT merchant-specific activation |
| Seller payout control by TIKUM | REQUIRES IPAYMU WRITTEN CONFIRMATION; adapter payout disabled |
| Split settlement for this merchant | REQUIRES IPAYMU WRITTEN CONFIRMATION; local split metadata is not execution proof |
| Arbitrary event-based hold/release | Standard published timer is NOT an event-based guarantee; REQUIRES IPAYMU WRITTEN CONFIRMATION for a custom arrangement |
| H-10 protection | REQUIRES IPAYMU WRITTEN CONFIRMATION; 10-day timer does not establish H-10 policy |
| Postponement/cancellation | REQUIRES IPAYMU WRITTEN CONFIRMATION; provider handling NOT TESTED |
| Invalid entry/dispute | REQUIRES IPAYMU WRITTEN CONFIRMATION; not proven by internal dispute fixtures |

D7 describes buyer confirmation, automatic confirmation after 7x24 hours, and optional 3-day extension, with VA/qualifying unique-code methods and exclusions including QRIS/cards. It does not establish TIKUM control until an arbitrary future event. Actual fund custody, settlement and contractual eligibility were NOT TESTABLE in this audit. No fake payout or escrow balance was created to claim provider success.

## H. Safety and next gate

No real credentials loaded by tests, no payment gateway call, no real customer charge, no seller payout, no remote ledger write/migration, no webhook/environment modification, and no Production/Preview deployment performed by this audit. Vercel environment metadata was read only. Independent Production configuration and historical activity were not fetched, so no claim is made about unrelated changes outside this session.

Remediation order: environment guard and Preview database isolation -> official callback contract -> fail-closed inquiry and response validation -> atomic transaction/order/ledger verification -> retry-safe notifications/concurrent initiation -> provider-backed reconciliation -> remove payment-derived ticket proof -> regression suites -> actual Preview Sandbox payment and callback evidence -> report and conditional focused commit. Keep Production disabled throughout.