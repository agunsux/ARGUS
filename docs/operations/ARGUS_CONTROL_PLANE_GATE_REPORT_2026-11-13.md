# ARGUS control plane — partial safety remediation

## A. Executive verdict
NOT ACCEPTED. This is a partial implementation, not the requested completed EPIC.
No commit, push, PR, merge, migration or deployment was performed.

## B. Repository forensics
- Original repository: C:\Users\RYZEN\.antigravity-ide\ARGUS
- Original branch/HEAD: main / 959376a3b0319468e8f5452c935981f054495e62.
- Original dirty work: 34 tracked modifications plus untracked iPaymu remediation work.
- Recovery backup: C:\Users\RYZEN\AppData\Local\Temp\argus-control-baseline-20261113
- Backup includes binary diffs, status, HEAD, copies and SHA-256 manifest for 52 files.
- Implementation worktree: C:\Users\RYZEN\.antigravity-ide\ARGUS-control-plane
- Branch: feat/argus-control-plane, based on existing repair commit 3fe288d.
- That existing repair disambiguates an escrow variable; no payment/escrow changes were authored here.
- Original 52-file manifest comparison returned zero changed files.
- Actual production deployment ID/SHA and live database schema were not verified.

## C. LANGGAM reference
Inspected local HEAD 5107fdc33bdf6cb8939c6e180d668db32929121c, repository instructions,
component inventory and AdminExecutiveOverview. Relevant patterns: period selection,
null-aware number formatting, drill-down, explicit loading/error states. No components copied.
Broader drawer/responsive/API review remains incomplete.

## D–E. Control center and automation
Existing Express/CommonJS app, static admin page, pg repository adapters and Vercel cron configuration.
No new dashboard or durable worker implemented. Existing scheduler has in-memory jobs/history;
chunked discovery has persisted leases/cursors but swallows some persistence failures.
Current configured cron entries are daily, not the requested sub-daily schedules.

Implemented:
- Shared fail-closed bearer authorization across ten discovery cron aliases.
- Missing CRON_SECRET returns 503; missing/incorrect bearer returns 401.
- Query-string credentials no longer authorize these endpoints.
- Manual catalog refresh is guarded by existing discovery admin role authorization.
- Manual refresh no longer mistakes admin session bearer tokens for cron credentials.
- Non-test automation rejects clock overrides, including SIMULATE_NOW.

## F. Event intelligence
Source audit now uses current time by default rather than hardcoded 2026-10-10;
invalid audit reference times throw. No live source discovery/verification performed.
Coldplay and Sheila on 7 regression suite passed. No event counts claimed.

## G. Image intelligence
Image persistence errors now propagate to FAILED job history rather than being swallowed.
Persist requests reject read-only/missing-write repositories. PostgreSQL adapter fallback
behavior still needs independent hardening: a resolved fallback is not proof of durable write.
No official image rights or live image identity verification performed.

## H. Lifecycle
Existing engine explicitly uses 48 hours; legacy tests also encode day-based grace behavior.
Requested one-hour policy has NOT been implemented. Requires coordinated engine, persisted
metadata, API, listing/purchase eligibility and regression changes; no silent policy switch.

## I–J. Venue, trust and finance
No PIC assignment, venue readiness or incident workflow changes. No financial implementation
changes. Complete financial isolation and ledger/escrow regression acceptance remains open.
Protected original iPaymu work preserved, but not imported into this worktree or validated here.

## K. Test evidence
Commands run in implementation worktree with NODE_ENV=test and NODE_PATH pointing to
C:\Users\RYZEN\.antigravity-ide\ARGUS\node_modules. No .env files copied.

| Command | Outcome |
| --- | --- |
| node --test test_automation_safety_gates.js | Exit 0; 6 pass, 0 fail, 0 skip; includes 40 denied HTTP combinations |
| node test_admin_auth_regression.js | Exit 0; 9 pass, 0 fail |
| node test_tikum_zero_wrong_date_forensics.js | Exit 0; 17 pass, 0 fail |
| node test_payment_provider_contracts.js | Exit 1; 7 checks pass then DOKU payout expected-rejection failure |
| node test_tikum_catalog_refresh_and_hero_lifecycle.js | Exit 1; 8 pass, 3 fail (price threshold, secondary hero, hero endpoint) |
| node scripts/run_all_tests.js | Exit 1; first suite 12 pass/1 fail; remaining 76 suites not executed by fail-fast runner |
| npm run build | Tool timed out at 30 seconds; no captured final exit code; not accepted |
| node test_syntax_check.js | Separate process output reports all 329 src JS files valid; final exit code not captured |
| node scripts/check_homepage_surface.js | Exit 0; 1 inline script, 16 hooks |
| node --check (four changed source files) | Each exit 0 |
| git diff --check | Exit 0 |

The attempted node -e targeted runner failed due to PowerShell quoting before running tests;
the four targeted commands were rerun directly, with results above.
No responsive browser QA or screenshots produced. No restart/concurrency database proof.
Build generated sitemap changes are excluded from this patch.

## L. Git and deployment
Changes remain uncommitted on isolated branch. No production verification or payment/payout calls.
Production release is blocked, regardless of the passing targeted safety tests.

## M. Remaining risks / next owner action
1. P0 — Release owner: reconcile protected financial repairs and failing provider contract before release.
2. P0 — Backend: durable fail-closed persistence, retry/lease recovery, authorization/audit integration.
3. P1 — Event operations/backend: explicitly migrate 48-hour policy to one-hour archival with tests.
4. P1 — Catalog owner: reconcile price and hero expectations against approved current policy, not blind fixture changes.
5. P1 — Frontend/backend: implement remaining control-center pages, real metric queries and granular RBAC.
6. P1 — Operations: verify actual production SHA, Vercel plan and safe isolated database target.
7. P1 — QA: complete full suite, production-equivalent build, financial and responsive gates.
8. P1 — Event operations: live source provenance, lawful images, PIC readiness and reporting remain unverified.

Smallest safe continuation: fix/reconcile the failing baseline gates first, then build durable
execution on the existing catalog repository rather than introducing a competing scheduler.