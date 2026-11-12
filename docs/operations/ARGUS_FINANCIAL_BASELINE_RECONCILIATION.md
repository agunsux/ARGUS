# P0-A baseline reconciliation — 2026-11-13

Status: financial gate FAIL; test-setup-only remediation authorized; no production release.

## Repository proof
- Original baseline: 959376a3b0319468e8f5452c935981f054495e62.
- Implementation HEAD: 3fe288db6fe5384b4606876b37ce24f3e5972a2d.
- Branch: feat/argus-control-plane.
- merge-base --is-ancestor 959376a 3fe288d: exit 0.
- Only intervening commit changes two lines in escrowService.js: rename email-local
  `event` to `emailEvent`, retaining the email payload key. No provider contract change.
- 52 protected original-worktree file hashes match the saved manifest.
- Existing uncommitted automation patch preserved; checkpoint under isolated scratch/.
- Baseline archives are inside the isolated worktree; original repository not used as scratch.

## Reproducible test execution
New forensic runner: scripts/run_financial_forensics.cjs.
It executes all twelve selected suites without fail-fast, saves stdout/stderr, duration,
exit code and signal. It deliberately does not inherit financial/database credentials.
Preload scripts/offline-test-guard.cjs blocks non-loopback fetch/HTTP/socket/DNS access.
These are local simulation tests, not external sandbox or production verification.

Commands (from isolated worktree, NODE_PATH referencing existing installed dependencies):

```text
node scripts/run_financial_forensics.cjs
node scripts/run_financial_forensics.cjs scratch/baseline-959376a scratch/financial-baseline
node scripts/run_financial_forensics.cjs scratch/baseline-3fe288d scratch/financial-repaired-baseline
```

Every runner completed with aggregate exit 1; no timeout/unknown child exit codes.

| Suite | Original baseline | Repaired baseline | Current |
| --- | --- | --- | --- |
| test_payment_provider_contracts.js | FAIL | FAIL | FAIL |
| test_mvp_transaction_loop.js | FAIL | FAIL | FAIL |
| test_inventory_concurrency_race.js | FAIL | FAIL | FAIL |
| test_pricing_tax_ledger_engine.js | FAIL | FAIL | FAIL |
| test_ipaymu_compliance.js | FAIL | FAIL | FAIL |
| test_ipaymu_argus_lifecycle.js | PASS | PASS | PASS |
| test_refund_state_machine_and_provider_confirmation.js | FAIL | PASS | PASS |
| test_p0_p1_payment_inventory_safety.js | FAIL | FAIL | FAIL |
| test_payment_sandbox_e2e_matrix.js | FAIL | FAIL | FAIL |
| test_doku_payment_migration.js | FAIL | FAIL | FAIL |
| test_mvp_dispute_loop.js | FAIL | PASS | PASS |
| test_transaction_control_center_red_yellow_green.js | FAIL | FAIL | FAIL |

Original baseline escrow-dependent suites cannot load due to duplicate const event.
Repair resolves this parse error; current outcomes match the clean repaired baseline.
This establishes no new suite-outcome regression in this selected set, not full financial acceptance.

## Failure analysis
1. Provider contract assertion at test_payment_provider_contracts.js:125 requires
   CapabilityUnsupportedError when payout capability is false. DOKU declares false
   unless contract/environment activation is present, but enables simulation by default
   under NODE_ENV=test and returns PENDING_BANK_EXECUTION with simulated:true.
   Same failure reproduced on original baseline. Test also uses positional payout arguments
   while DOKU implementation accepts an object. Do not change production capability claims
   or allow a simulated pending result to count as a completed payout.
2. MVP transaction, DOKU migration and payment matrix expect ACTIVE listings but receive
   APPROVED_PRELAUNCH. marketplaceMode.js explicitly defaults to PRELAUNCH_LISTING_ONLY,
   even in tests. Tests do not establish their required LIVE fixture environment.
3. Inventory concurrency gets [403,403] instead of [201,409]. Test lacks LIVE setup and
   creates event-race-joyland without any verified schedule. Relaxing production eligibility
   would be the wrong repair; fixture prerequisites need correction and another run.
4. Pricing/ledger refund setup and payment-inventory suite fail EVENT_NOT_UPCOMING.
   Fixed-date fixture eligibility must be reconciled; downstream assertions remain untested.
5. iPaymu compliance expects literal Jl. Pasirluyu No. 79 on homepage. Failure is an
   existing public-surface/profile mismatch, not evidence of a ledger defect. Merchant
   profile changes are protected and require explicit reconciliation, not guessed addresses.
6. Transaction control center: 17/22 pass. Two listing-window assertions conflict with
   prelaunch collection allowance; three payout/incident assertions encounter the prelaunch
   gate before payout eligibility. No payout execution bypass is proposed.

Passing current suites: iPaymu lifecycle 22/22, refund integrity 16/16, dispute loop 9/9.
The refund suite intentionally injects ledger failure; its expected diagnostic is not a test failure.

## Boundary and remaining evidence
No financial implementation or financial assertion has been changed.
No database query performed: financial database consistency NOT VERIFIED.
Full financial test inventory is not exhausted; additional suites and deeper assertions may
uncover further failures after fixture corrections. No deferral authorization assumed.
No commit, push, merge, deployment or financial external operation performed.

The user explicitly authorized test-setup-only remediation during this run. Provider/service/
merchant code and assertions remain untouched. Residual implementation changes require separate authorization.

## Authorized fixture remediation results

Command: `node scripts/run_financial_forensics.cjs . scratch/financial-after-fixtures`
Aggregate exit 1; all 12 suites executed: 6 PASS, 6 FAIL.

Changes: explicit test-only LIVE mode in transactional suites; synthetic future event fixtures
for inventory and refund accounting; non-simulation provider instances for capability rejection.
Historical canonical events and production seeds were not moved into the future.

Now PASS: provider contracts 36/36; inventory concurrency 11/11; payment/inventory safety 9/9;
iPaymu lifecycle 22/22; refund integrity 16/16; dispute loop 9/9. Each suite exits 0.

Still FAIL (each exits 1):
- MVP transaction: 7/10; missing trust attestations, missing maker-checker authorization,
  and consequent absent release audit action.
- Pricing/ledger: refund assertions now execute; API preview later returns 1,890,000 while
  the unchanged assertion expects 1,900,000. No tax/fee assertion weakened.
- DOKU migration: reaches legitimate webhook assertion; actual PAID_PLATFORM_HELD versus
  expected PAID_ESCROWED. No provider-held escrow claim fabricated.
- Payment sandbox matrix: reaches settlement but lacks approved dual authorization.
- Transaction control center: 19/22; payout cases lack approved dual authorization.
- iPaymu compliance: unchanged homepage merchant-address assertion mismatch.

These are newly reached failures, not demonstrated new financial implementation regressions.
Additional setup/contract reconciliation and remaining financial suites are still required.