# EPIC 73D - Feature Preview certification

Date: 2026-11-06 (Asia/Jakarta). Verdict: **PARTIAL / NOT CERTIFIED**.

## Push and provenance

- Executed `git push origin main:refs/heads/feature/midtrans-sandbox-preview` with the existing pre-push hook active. Remote branch was absent before push. No force, hook bypass, PR, merge, or push to main.
- Fetch and remote lookup verify feature HEAD `359767bb0647f6ae45e5216fbbd9f949bd456a03`, containing `5c7fa17`, `7d892a5`, `359767b`.
- Remote main remains `d0120666c42db0603d34d20bdd19963bfab1effa`.
- Vercel project `prj_X2hQwU5IqxSU3WpYKCNcRzslk47S` links to `agunsux/ARGUS`, repository ID `1293234660`; production branch is main.
- Git-triggered Preview: `dpl_DERrzFxdHxwpVEMfYnN91PonAfyJ`, https://argus-genqpejdx-shinerva.vercel.app . Vercel deployment gitSource confirms the exact feature branch and full SHA above. State READY, target null (Preview).
- Latest Production remains `dpl_Dr21GtBiycs4XnG3S2geeUYDyaEe`, SHA `d0120666c42db0603d34d20bdd19963bfab1effa`.

## Runtime and isolation evidence

- `/api/v1/payments/active-config`: is_production=false, marketplace_mode=PRELAUNCH_LISTING_ONLY, is_prelaunch=true, default provider doku.
- `/api/v1/payments/status`: Midtrans ACTIVE, message `Midtrans Sandbox payment rail active (Preview)`; real_money_active=false, settlement_active=false.
- `/api/v1/payments/midtrans/client-key`: isAvailable=true, isProduction=false, isSandbox=true; Sandbox client-key prefix verified without recording its value; snapUrl=https://app.sandbox.midtrans.com/snap/snap.js.
- Vercel env inventory: all three MIDTRANS variables scoped only to Preview. DATABASE_URL has separate Production and Preview entries. No environment variables changed.
- Environment API did not return decrypted values: database endpoint separation and direct Midtrans API authentication were NOT independently verified. Empty returned secret values are not evidence of invalid deployed credentials.
- Provider healthCheck only checks configuration; ACTIVE is not proof of authentication with Midtrans.
- Payment flow remains blocked by prelaunch guard. No paid transaction, refund, payout, or production database operation performed. No safety gate relaxed.

## Checks on unchanged commit

Tests ran with NODE_ENV=test; isolation suite confirms in-memory defaults. Logs: `%TEMP%/epic73d-*.log`.

| Check | Result |
| --- | --- |
| Database isolation | PASS 8/8 |
| Preview environment guard | PASS 19/19 |
| Midtrans smoke | FAIL: client-key expected 200, received 403 |
| Provider contracts | FAIL: DOKU payout expected rejection missing, line 125 |
| Inventory concurrency | FAIL: expected 201/409, received 403/403 |
| Payment inventory safety | FAIL: 7/8; expected 503, received 403 |
| npm test | FAIL at provider contract suite; later chained suites not run |
| MVP security | FAIL: 4/7; KYC assertion and prelaunch listing restrictions |
| Auth security | PASS 56/56 |
| Phase 22 security | PASS 5/5 |
| npm run build | PASS: 324 JS syntax checks and homepage guard |
| Typecheck | NOT AVAILABLE: no package script or tsconfig |
| npm audit | FAIL: 1 critical, 3 high, 2 moderate |
| git diff --check | PASS |

Audit packages: proxy-addr critical; body-parser, multer, zod high; qs, uuid moderate. Machine-readable results: `%TEMP%/epic73d-audit-retry.json`. No automatic dependency fixes applied.

Initial Node TLS failures resolved by NODE_USE_SYSTEM_CA=1; certificate verification was not disabled. Build-generated sitemap restored byte-for-byte. Existing R2/R3 untracked reports preserved. No application source changes or new commits.

## Remaining gates

Certification requires resolving regression/security failures, defining the typecheck requirement, independently proving Preview database isolation and Sandbox authentication, and completing actual Sandbox payment/webhook/idempotency flow. The deployed commit intentionally blocks payment creation in prelaunch mode; enabling a certification flow requires a reviewed approach that preserves Production Safety Freeze. READY and mock tests do not satisfy these gates. Integration remains NO-GO.
