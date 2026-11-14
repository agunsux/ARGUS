# TIKUM authentication and DOKU verification — incomplete candidate

Date: 2026-11-14. **Not release-ready. No global PASS.** This report supersedes optimistic readiness statements only for the evidence described below. It does not certify deployment behavior.

## Baseline and scope

- Target checkout: `C:\Users\RYZEN\.antigravity-ide\ARGUS-control-plane`.
- Initial branch `main`, clean working tree, HEAD `84477c44d025b4d563c26c455639e7dc97a0b08d`.
- `9736595` and `449bff2` are ancestors of that HEAD (merge-base exit 0). No cherry-pick required.
- Feature branch created in the existing checkout: `fix/tikum-auth-doku-verification`.
- Original working checkout `C:\Users\RYZEN\.antigravity-ide\ARGUS`, branch `wip/active-session-work`, HEAD `959376a3b0319468e8f5452c935981f054495e62`, had extensive user modifications. None were edited, staged or committed by this work.
- No root AGENTS.md/CLAUDE.md found in tracked target files. Existing CommonJS/Express/pg conventions retained; no dependencies installed.
- Auth commit: `3d29bad6b3d5a65338bfe96c08f4c95e641d0223`.
- Payment commit: `04a648dd0e9ba2c44ea0ccc2a3f6b0ca82a45d51`.
- Runner/final source: `0e3ee54f2c6c1f1cdf907f518799101f830a6366`. Later report/evidence commits do not change runtime source.

## Deployment evidence (read-only; no deploy or push)

Project `argus`, project ID `prj_X2hQwU5IqxSU3WpYKCNcRzslk47S`, team `team_xhqWUuga9unawMGnTbAtm147`.

| Target | Evidence | Limitation |
|---|---|---|
| Canonical production `tikum.app`, `www.tikum.app` | Vercel inspect resolves to `argus-4azj6mrx6-shinerva.vercel.app`, deployment `dpl_Htayoj1HCnpfaGX8DREBXDNwR5YA`, Ready, production | Deployment API did not return source SHA/gitSource. Production SHA NOT VERIFIED; do not equate with local HEAD |
| Existing feature Preview | `argus-cr5sy1if2-shinerva.vercel.app`, deployment `dpl_DBFuBNeJnnovPpNvhPoGt12YPK6k` | Git source **449bff2d9ecfac6b42d9679c1447da053ac83a46**, branch `feat/argus-control-plane`; not final source |
| Preview branch alias | `argus-git-feat-argus-control-plane-shinerva.vercel.app` | Alias observed by inspect, not proof of webhook access |

An ordinary Node fetch (no Vercel CLI authentication/cookies/bypass token) POSTed `{}` to the existing Preview `/api/v1/payments/webhook/doku`. Response: HTTP 401, JSON, platform-authentication marker detected, no application-signature-error marker. This is **not verified provider reachability**. No valid financial event or payment was submitted.

The Preview deployment metadata explicitly identifies a GitHub deployment. Treat push as potentially deployment-triggering. No push, merge, promotion, deployment, credential pull, production transaction, outage injection or live rate-limit test performed. Candidate is not ready to request deployment approval.

## Proven issues and changes

1. User GET verification consumed tokens. GET now serves a confirmation page; POST consumes the token under an Origin gate. New email links carry fragments. The page clears the token from the visible URL before explicit button submission, has no analytics, and applies no-referrer/no-store/CSP. Existing query links can reach the landing page but cannot be removed retroactively from historical access logs.
2. Admin callback was hard-coded to Production. Shared origin resolution now gives Preview its VERCEL_URL and Production the canonical origin. Origin checks use the same resolution. Misconfigured Preview without an origin fails closed.
3. Public magic-link messages distinguished admin from ordinary accounts and claimed mailbox delivery. Messages now match and state that receipt is unconfirmed. Admin provider rejection cancels the pending token and returns the generic response, with a safe server diagnostic. Its security test still asserts token cancellation and now asserts response equivalence rather than an enumerating rejection.
4. User provider audit previously unconditionally recorded MAGIC_LINK_SENT. Audit now distinguishes mock acceptance, provider acceptance and failure. This does not validate the entire email infrastructure or delivery callbacks.
5. Public password-reset request now excludes admin identities/roles. The legacy public password-reset implementation is still process-local and requires further remediation (see remaining work).
6. Production magic-token lookup no longer resurrects a local token following authoritative lookup miss.
7. DOKU default payment mode no longer derives from NODE_ENV. Diagnostics expose node runtime, deployment environment and payment environment independently. `vercel.json` explicitly sets NODE_ENV=production, explaining why the old diagnostic could say production on Preview.
8. DOKU contractVerified/sandboxTested no longer become true merely from sandbox mode or hold-enabled configuration. Readiness no longer means credentials alone. Transport only permits the exact sandbox origin; production-enable flags cannot unlock the transport. Explicit simulation is disabled on hosted/production runtime.
9. `createHold` no longer fabricates a real remote HELD result; outside simulation it raises a capability error. Simulation returns `simulated: true`. Release requires an explicit contract flag as well as hold enablement, but no flag was activated here.
10. Durable acceptance suite now counts its two unavailable PostgreSQL cases as SKIPPED, not PASS. Existing failing authorization fixture was not weakened to hide its failure.

Changed runtime files: `src/config/authOrigin.js`, `src/api/authRouter.js`, `src/middleware/adminSecurity.js`, `src/services/adminMagicLinkService.js`, `src/services/magicLinkService.js`, `public/js/auth-verify.js`, `src/services/payment/DokuPaymentProvider.js`, `src/services/payment/PaymentService.js`.

Tests: `test_admin_identity_security.js`, `test_durable_user_auth.js`, new `test_tikum_unified_auth_e2e.js`, new `test_doku_verification_truthfulness.js`; runner `scripts/verify_tikum_auth_doku.js`. No migration added or applied.

## Route inventory and authorization

This is a grouped inventory, **not a completed per-handler audit**. The anonymous HTTP inventory discovers literal admin routes and ran 119 checks. That does not prove every authenticated role/ownership combination.

| Method/path | Access and identity/session | Rate limiting | Origin/CSRF and expected response |
|---|---|---|---|
| POST `/api/auth/signup`, `/register` | Public; repository-enforced BUYER; normalized admin excluded | No dedicated signup limiter proven | Same-origin required; 201 new, 409 duplicate, 403 reserved identity; enumeration remains |
| POST `/api/auth/login` | Public password; admin excluded; repository user/session | No dedicated password limiter proven | Same-origin; 200 ordinary valid credentials, 401 invalid; suspended response differs |
| POST `/api/auth/magic-link` | Public; excludes admin; hashed token repository + local state | Per-IP/per-email process-local | Same-origin; generic 200, invalid format 400, limit 429 |
| GET/HEAD `/api/auth/verify` | Public, never consumes | None | Landing page/HEAD 200; no session |
| POST `/api/auth/verify` | Public single-use token; authoritative repository in hosted runtime | No dedicated verification limiter proven | Same-origin; 200 + HttpOnly cookie, invalid/replayed token 401 |
| GET `/api/auth/me`, `/session` | Authenticated; authoritative user lookup and session middleware | Not established | No mutation; no-store; anonymous 401 |
| POST `/api/auth/logout` | Session revocation (user repository or admin store) | Not established | Same-origin; clears cookie; revocation errors are not success evidence |
| POST `/api/auth/password-reset/request`, `/confirm` | Public; admin requests excluded; reset tokens remain local | Not established | Same-origin; request generic; local reset architecture incomplete |
| POST `/api/admin/magic-link` | Public request; only canonical ACTIVE ADMIN from server store is eligible | Store-backed IP, identity, account cooldown | Same-origin; 202 generic, DB unavailable 503, limit 429 |
| POST `/api/admin/verify` | Public verification; atomic admin store consume + new session | Store-backed IP/token | Same-origin; 200 cookie, invalid 401, DB failure 503 |
| POST `/api/admin/logout` | Admin token revocation | Not established | Same-origin; 200 or 503 |
| POST `/api/admin/login` and password-reset variants | Legacy disabled | N/A | Same-origin gate then 410 |
| `/api/admin/**`, `/api/mvp/admin/**` | Global requireAdminIdentity; checks canonical email AND role/status and authoritative session | Per-handler audit incomplete | Server-side authorization, admin Origin gate on mutations; anonymous route tests 401 |
| `/api/admin/trust/**`, content/admin and email/admin routes | Included in source-discovered anonymous gate tests | Per-handler audit incomplete | Authenticated permission/ownership matrix NOT fully executed |
| Payment diagnostic/webhook | Existing payment routing | Webhook retry/limiter audit incomplete | Signed raw payload required; Preview access currently blocked at platform |

Roles observed include BUYER, SELLER, PIC and ADMIN. No role business rule changed. Unified test is **HTTP integration using in-memory repositories**, not real browser E2E. Admin magic-link suite is also a deterministic service/HTTP fixture, not real email/browser proof.

## Variables and external prerequisites (never secret values)

| Purpose | Source variables | Observed binding / action |
|---|---|---|
| Database | DATABASE_URL, TARGET_DATABASE_URL | Preview lists DATABASE_URL; Production lists both. Values not read; isolation cannot be inferred |
| Disposable integration | TEST_DATABASE_URL, TEST_DATABASE_SCHEMA | Not in process env; no psql/docker/local PostgreSQL command found. Admin suite requires fresh `admin_security_test_<unique>` and rejects application URL equality. Provision an explicitly disposable DB via secure environment, never reuse Production |
| Email | RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, EMAIL_SUPPORT, EMAIL_ADMIN, EMAIL_WEBHOOK_SECRET | RESEND_API_KEY listed only for Production. Configure Preview provider in project settings for approved controlled recipient; no secrets through chat |
| Callback | VERCEL_ENV, VERCEL_URL, APP_BASE_URL | Platform origin used for Preview; canonical production fixed. APP_BASE_URL only local/non-Vercel fallback |
| DOKU HMAC | DOKU_SANDBOX_CLIENT_ID / DOKU_CLIENT_ID, DOKU_SANDBOX_SECRET_KEY / DOKU_SECRET_KEY | Neither listed in Preview or process env. Production names exist but not retrieved/reused for sandbox |
| DOKU host | DOKU_ENV, DOKU_SANDBOX_BASE_URL / DOKU_BASE_URL / DOKU_API_BASE_URL | Use sandbox and exact `https://api-sandbox.doku.com`; transport forbids other origins |
| Webhook | DOKU_WEBHOOK_SECRET (fallback secretKey) | Verify merchant protocol; do not invent separate credentials |
| Capability facts | DOKU_CONTRACT_VERIFIED, DOKU_HOLD_RELEASE_ENABLED, DOKU_KYC_VERIFIED, DOKU_SANDBOX_TESTED, DOKU_PAYOUT_ENABLED | Do not enable merely for setup/tests. Require merchant evidence |
| Locks | ENABLE_DOKU_PRODUCTION, DOKU_PRODUCTION_ENABLED, MARKETPLACE_MODE | No settings changed. Maintain production disabled and PRELAUNCH_LISTING_ONLY |

Mailbox ownership/access not supplied. No real mail sent or mailbox opened. Provider acceptance, delivery events, mailbox receipt and click-through remain separate unproven stages. Production ADMIN_PASSWORD binding was observed, but not read or used; disabled code paths must remain disabled.

## DOKU documentation and limitations

Official DOKU pages reviewed: `developers.doku.com/accept-payments/doku-checkout-api/integration-guide/generate-signature`, `developers.doku.com/accept-payments/direct-api/hold-and-release`, and the official HTTP notification guidance. The hold/release page documents `/finance/v1/release` and signature components. Therefore endpoint existence is documented, **merchant eligibility and successful execution are not**. Current adapter uses HMAC Client-Id/Secret-Key, not evidence of a SNAP/RSA integration.

No actual sandbox payment, official simulator, provider webhook, reconciliation, hold or release performed. Pure signing/mocked HTTP tests cannot certify merchant capability. Remaining hard-coded capability/readiness claims elsewhere in the adapter are not yet fully removed. The existing 300-second webhook timestamp rejection, optional amount/currency checks, durable idempotency and transition behavior require further review against actual retry semantics before deployment. Do not loosen the timestamp rule without durable replay/idempotency validation.

Webhook owner action: establish a supported narrowly scoped Preview ingress/access mechanism usable by DOKU and test it with a normal unauthenticated client. Do not disable all deployment protection. The present 401 platform gate is not a verified application signature rejection.

## Test evidence and remaining failures

Working directory for all suites: target checkout above. Commands, source SHA, environment, exit code, native summaries and timeout fields are stored in `evidence/tikum-auth-doku-local.json`. Build components are stored separately in `evidence/tikum-auth-doku-build.json` when completed. Runner strips external credential variables and invokes each suite independently. No `npm test` global PASS is claimed; unlisted suites are NOT RUN. Counts in native summaries refer to each suite's own tests/gates, not aggregate assertions; exact assertion totals are unknown where the suite does not report them.

Known results: unified local HTTP 13/13; admin HTTP 119/119; DOKU truthfulness 9/9; DOKU environment isolation 9/9. Durable user: 27 passed, 1 failed, 2 skipped; the failure expects FORBIDDEN but receives MARKETPLACE_PRELAUNCH_ONLY. That run does not establish PostgreSQL durability.

Final regression run at source `0e3ee54`: **23 suites: 12 PASS, 10 FAIL, 1 BLOCKED**. Separately, all three build commands from package.json completed with exit 0: syntax check, homepage surface check, sitemap generation. These are component executions, not a claimed `npm run build` invocation. Build completion does not override the red regression status. Final evidence JSON has been checked for matching source SHA and exit statuses.

Remaining failures include old GET-consumption and password-admin expectations, missing Origin in older harnesses, prelaunch fixture conflicts, DOKU fixture mode/host conflicts, email/payment notification fixture failures, and fee regression (935000 actual vs 940000 expected). Baseline comparison for all these failures was not completed; do not classify all of them as pre-existing. No assertions were relaxed to claim success.

## Acceptance status matrix

| Area | Status | Evidence / unmet acceptance |
|---|---|---|
| User auth — local/integration | **FAIL** | New HTTP subset passes, but legacy/security regressions remain; PostgreSQL and real browser unproven |
| Admin auth — local/integration | **FAIL** | Identity/HTTP/magic fixtures pass, regression suite fails; PostgreSQL BLOCKED |
| User auth — Production | **NOT RUN** | No authorized controlled-account production flow; source SHA unverified |
| Admin auth — Production | **NOT RUN** | No real mailbox/click-through/session/revocation verification |
| DOKU sandbox payment + webhook | **BLOCKED** | Sandbox credentials absent in Preview; platform blocks unauthenticated webhook; no transaction |
| DOKU sandbox hold/release | **BLOCKED** | Merchant capability unverified; createHold has no confirmed remote operation |
| Regression/build | **FAIL** | Multiple independent regression failures; build component result is reported separately, never overrides failures |

## Unfinished independent engineering work — not external blockers

This implementation is partial, not completion of the directive. Before release: reconcile/update legacy test callers to POST explicit verification with Origin while retaining scanner tests; repair fixture conflicts without bypassing production gates; complete route-by-route authenticated role/IDOR matrix; add login/signup/verification rate limits; resolve signup enumeration and verify-email-before-password-login design; replace process-local password reset and finish session-file/fallback audit; validate all local bypass paths; finish DOKU retry/idempotency/amount/currency/transition audit and false capability claims; run real browser automation and full final regression. These items must not be represented as waiting only for credentials.

## Rollback and next verification

No deployment/database settings changed, so there is no production rollback to execute. Feature changes can be reverted in reverse dependency order on the feature branch (runner, payment, auth) after reviewing later work; do not hard-reset or modify the unrelated checkout. No schema rollback required. Do not push/deploy this red candidate. Once independent failures are fixed, use an isolated PostgreSQL database, approved Preview credentials and controlled mailbox, rerun final-source suites and browser flow, then request deployment authorization once and verify the actual resulting SHA.