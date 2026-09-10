# P0 Production Smoke Test Report

## Executive Verdict

**NO-GO**

*(Payment & Settlement Lifecycle Stages are additionally **BLOCKED** due to missing live gateway integrations and unconfigured infrastructure credentials.)*

---

## Production Identity

* **Production URL:** `https://argus-trust-infrastructure.vercel.app`
* **Git Commit:** `2728f0d` (`feat: establish Tikum brand and public trust boundary`)
* **Vercel Deployment ID:** `dpl_EZHTH2uzhodWFJFwUBwAhup94r45`
* **Runtime & Architecture:** Express.js on AWS Lambda / Vercel Serverless Function (`api/index.js` -> `src/server.js`)
* **Database / Persistence Layer:** In-Memory JavaScript Object (`state` in `src/database.js`) + Instance-local ephemeral `/tmp` session storage (`/tmp/argus_data/sessions.json`). **No persistent external database (PostgreSQL/Cloud SQL/Firestore/Supabase) is connected.**
* **Payment Environment:** **Simulated Mock Gateway Only.** `src/services/payment/IPaymuProvider.js` generates simulated VA numbers (`8800...`) and mock QRIS strings in memory. No outbound network requests are made to iPaymu API (`https://my.ipaymu.com` or sandbox). No live payment keys (`IPAYMU_API_KEY`, `IPAYMU_VA`) are active.
* **Test Timestamp:** `2026-09-09T18:37:04Z` (Local Time: `2026-09-10T01:37:04+07:00`)

---

## Test Accounts

* **Seller Account:** `seller-1` (Budi Santoso, `budi.seller@example.com`) — KYC: `VERIFIED`
* **Buyer Account:** `buyer-1` (Dewi Lestari, `dewi.buyer@example.com`)
* **Admin / Trust Officer:** `admin-1` (Trust Officer ARGUS, `ops@argus.id`)
* **Operational / PIC Account:** `pic-1` (Agus Hendra, `agus.pic@argus.id`)

---

## Test Artifacts

* **Listing ID (Buy Now Track):** `list-b42c3f9b-f2b6-4adb-93cb-862dfaaf7d86` (Ticket: `tkt-85c17b2a-e84f-4644-8471-c6399f904833`)
* **Listing ID (Offer Track):** `list-0d86f288-ac5b-47a3-af7a-2d8a49a96de2` (Ticket: `tkt-a1bf5268-11cc-447c-9304-b07c01ef3151`)
* **Offer ID:** `ofr-08231bbc-d9fb-4c45-bd41-3ce36658f7aa`
* **Order ID (Buy Now):** `ord-989a27ef-7c73-4dc6-a98d-c737c8388c6e` (Escrow: `esc-50d8d154-17dd-4a6a-994e-8b32be439059`)
* **Order ID (Accepted Counter-Offer):** `ord-d4d341dc-2582-4187-8fe3-ebe625219460` (Escrow: `esc-719ce5a0-8d99-4b08-8735-54400bde061a`)
* **Payment Reference (Simulated):** `IPAYMU-SIM-1788979029942` & `IPAYMU-MOCK-1788979061413`
* **Webhook Reference:** None (All webhook endpoints returned HTTP 404 Not Found)
* **Dispute ID:** `dsp-5af06c2d-dfc9-4406-bf7b-9bbd8eaf0f3a`
* **Settlement ID:** None (Settlement execution failed with HTTP 500 `ADMIN_PASSWORD_NOT_CONFIGURED`)

---

## Lifecycle Result

| Stage | Result | Evidence |
| :--- | :---: | :--- |
| **Seller Auth** | **PASS** | `POST /api/mvp/auth/login` returned HTTP 200 with session token `ses-14440da2-d9bb-4484-8f8e-f77c58e5b388`. `GET /api/mvp/auth/me` with Bearer token returned seller identity. |
| **Create Listing** | **PASS** | `POST /api/mvp/seller/listing` returned HTTP 201 with `list-b42c3f9b-f2b6-4adb-93cb-862dfaaf7d86` and ticket `tkt-85c17b2a-e84f-4644-8471-c6399f904833`. Initial status: `PENDING_VERIFICATION`. Admin approval via `POST /api/mvp/admin/listings/:id/verify` successfully transitioned to `ACTIVE`. |
| **Buyer Discovery** | **PASS** | `GET /api/mvp/listings` and `GET /api/mvp/listings/:id` returned active verified listing from backend state with price IDR 850,000 + 10% fee (total IDR 935,000). |
| **Buy Now** | **PASS** | `POST /api/mvp/buyer/order` returned HTTP 201 with order `ord-989a27ef-7c73-4dc6-a98d-c737c8388c6e` (`PENDING_PAYMENT`) and escrow `esc-50d8d154-17dd-4a6a-994e-8b32be439059`. Listing status reserved. |
| **Make Offer** | **PASS** | Free-text messages correctly rejected with HTTP 400 `FREE_TEXT_NOT_ALLOWED`. Pure structured numeric offer (`offer_amount: 1400000`) on `list-0d86f288-ac5b-47a3-af7a-2d8a49a96de2` created `ofr-08231bbc-d9fb-4c45-bd41-3ce36658f7aa` in status `PENDING`. |
| **Accept/Reject/Counter** | **PASS** | Illegal transition: Buyer attempting to accept own offer was rejected with HTTP 403 `UNAUTHORIZED_ACTION`. Seller countered to IDR 1,450,000 via `POST /api/offers/:id/counter` (status changed to `COUNTERED`). |
| **Offer → Order** | **PASS** | Buyer accepted counter via `POST /api/offers/:id/accept-counter` -> automatically created Order `ord-d4d341dc-2582-4187-8fe3-ebe625219460` and Escrow `esc-719ce5a0-8d99-4b08-8735-54400bde061a` with agreed price IDR 1,450,000 + IDR 145,000 platform fee. |
| **Payment** | **BLOCKED / FAIL** | `POST /api/mvp/buyer/pay` directly mutates order to `PAID_ESCROWED`. **No live payment gateway call is made.** Gateway integration is simulated in-memory. Under P0 Rule 2 & Rule 10, mocked payment is not acceptable as proof. |
| **Webhook** | **FAIL** | All probe targets (`/api/mvp/payments/webhook`, `/api/payments/webhook`, `/webhook`) returned **HTTP 404 Not Found**. No webhook handler exists in production Express routes. Webhooks are completely bypassed. |
| **Order State** | **PASS** | State transitions: `PENDING_PAYMENT` -> `PAID_ESCROWED` -> `DISPUTED`. States and timestamps accurately recorded in in-memory database audit log. |
| **Buyer Lifecycle** | **PASS** | Buyer views own orders via `GET /api/mvp/orders/:id` and `GET /api/mvp/buyer/:id/orders`. Status reflects current order state (`PAID_ESCROWED` and `DISPUTED`). |
| **Seller Lifecycle** | **PASS** | Seller views own listings via `GET /api/mvp/seller/:id/listings`, receives offers, and executes counter-offers. |
| **PIC / Admin Lifecycle** | **FAIL** | Calling `POST /api/mvp/pic/verify-entry` returned **HTTP 403 `OPERATIONAL_WINDOW_CLOSED`** (`PIC is only active H-1 to H+1 of event date`). For events not on current date, PIC gate verification cannot be executed in production. |
| **Dispute** | **PASS** | Buyer initiated dispute via `POST /api/mvp/buyer/dispute` -> returned HTTP 201 `dsp-5af06c2d-dfc9-4406-bf7b-9bbd8eaf0f3a`. Order and escrow states immediately locked into `DISPUTED`. |
| **Settlement Gate** | **BLOCKED / FAIL** | `POST /api/mvp/admin/settlements/execute` returned **HTTP 500 `ADMIN_PASSWORD_NOT_CONFIGURED`** (`ARGUS_ADMIN_PASSWORD environment variable is required in production`). Even if configured, code confirms `settlement_mode: 'SIMULATED'`; no banking API exists. |
| **Refresh / Persistence** | **FAIL** | State only persists as long as the Vercel serverless Lambda container stays warm in memory. A cold start, concurrent container scale-out, or container recycle completely clears created listings, orders, and escrows. `/tmp` session storage is ephemeral. |
| **Authorization** | **FAIL (CRITICAL)** | 1. `POST /api/mvp/seller/listing` does NOT verify session token/bearer auth; an unauthenticated user can create listings by specifying `sellerId: 'seller-1'`.<br>2. `POST /api/mvp/buyer/pay` has NO authentication check; any anonymous caller can mark an order paid. |
| **Idempotency** | **PASS** | Re-submitting payment with identical `idempotencyKey` returned cached payment without duplicate escrow locking (`idempotent: true`). |

---

## Actual State Transition

The observed state machine transitions in the live deployment:

### 1. Listing State Machine
$$\text{DRAFT} \rightarrow \text{PENDING\_VERIFICATION} \rightarrow \text{ACTIVE} \rightarrow \text{RESERVED} \rightarrow \text{SOLD} \rightarrow (\text{SETTLED})$$
* Listing created in `PENDING_VERIFICATION`.
* Admin verified listing to `ACTIVE`.
* Order creation moved listing to `RESERVED`.
* Payment receipt moved listing to `SOLD`.

### 2. Offer State Machine
$$\text{PENDING} \rightarrow \text{COUNTERED} \rightarrow \text{ACCEPTED} \rightarrow \text{ORDER\_CREATED}$$
* Buyer created offer with IDR 1,400,000 -> `PENDING`.
* Buyer attempting to accept own offer rejected with HTTP 403 `UNAUTHORIZED_ACTION`.
* Seller countered with IDR 1,450,000 -> `COUNTERED`.
* Buyer accepted counter -> `ACCEPTED`, generating Order `ord-d4d341dc-2582-4187-8fe3-ebe625219460`.

### 3. Order & Escrow State Machine
$$\text{PENDING\_PAYMENT} \rightarrow \text{PAID\_ESCROWED} \rightarrow \text{DISPUTED} \xrightarrow{\text{BLOCKED}} \text{SETTLED}$$
* Order created in `PENDING_PAYMENT` with Escrow in `PENDING_PAYMENT`.
* Client called `/api/mvp/buyer/pay` -> Order moved to `PAID_ESCROWED` and Escrow moved to `ESCROWED`.
* Buyer opened dispute -> Order moved to `DISPUTED` and Escrow locked to `DISPUTED`.
* Settlement to `SETTLED` was **BLOCKED** by missing PIC entry confirmation and missing `ARGUS_ADMIN_PASSWORD`.

---

## Payment Evidence

* **Category:** **BLOCKED / SIMULATED IN-MEMORY**
* **Finding:**
  The deployed application does **NOT** connect to live banking, virtual account, or QRIS payment infrastructure.
  - `src/services/payment/IPaymuProvider.js` contains a mock provider implementation that returns fabricated virtual account numbers (`vaNumber: "8800..."`) and mock QRIS strings (`00020101021226...MOCK_QRIS_${orderId}`) without making HTTP requests to iPaymu API endpoints (`https://my.ipaymu.com/api/v2/payment` or sandbox).
  - The live checkout flow bypasses gateway verification: the client frontend directly calls `POST /api/mvp/buyer/pay` with arbitrary `providerRef` and `amountPaid`.
  - No webhook endpoint exists in Express (`/api/mvp/payments/webhook` returns HTTP 404).
  - **Verdict:** Real production payment cannot be proven and is strictly blocked.

---

## Database Evidence

* **Category:** **EPHEMERAL SERVERLESS IN-MEMORY OBJECT**
* **Finding:**
  - In `src/database.js`, database state is stored in a JavaScript variable `const state = { users: [], listings: [], orders: [], escrows: [], ... }`.
  - On Vercel Serverless Functions (AWS Lambda), memory is isolated per lambda instance and lost when containers scale down or recycle.
  - During our test, warm container reuse allowed `GET /api/mvp/orders/ord-989a27ef-7c73-4dc6-a98d-c737c8388c6e` to return HTTP 200 within the same execution session.
  - However, there is no persistent relational database or document store (PostgreSQL, Supabase, Cloud SQL, Firestore, etc.).
  - `SessionStore` writes session tokens to `/tmp/argus_data/sessions.json`, which is an ephemeral container-local scratch directory that does not survive cold starts or share state across instances.

---

## Failures & Forensic Findings

### Failure 1: Payment Gateway & Webhook Missing (P0 Blocker)
* **Symptom:** Webhook routes (`/api/mvp/payments/webhook`, `/api/payments/webhook`) return HTTP 404. Payment is recorded via client-side call to `/api/mvp/buyer/pay`.
* **Root Cause:** No webhook route is mounted in Express routers (`src/server.js`, `src/api/mvpRouter.js`). `IPaymuProvider.js` is a local mock with no outbound network calls to iPaymu API.
* **Impact:** System cannot receive asynchronous payment notifications from payment providers; payments cannot be verified cryptographically in production.
* **Severity:** **P0 — Critical Blocker**
* **Recommended Next Action:** Implement real iPaymu API integration (`POST /api/v2/payment`), mount `/api/payments/webhook` with HMAC SHA-256 signature verification, and remove unauthenticated client-direct `/buyer/pay` status forcing.

### Failure 2: Admin Password Not Configured for Settlement (P0 Blocker)
* **Symptom:** `POST /api/mvp/admin/settlements/execute` crashes with HTTP 500: `ARGUS_ADMIN_PASSWORD environment variable is required in production`.
* **Root Cause:** Environment variable `ARGUS_ADMIN_PASSWORD` has not been set in Vercel project environment variables.
* **Impact:** No admin step-up authentication can occur; settlements cannot be executed in production under any circumstance.
* **Severity:** **P0 — Critical Blocker**
* **Recommended Next Action:** Configure `ARGUS_ADMIN_PASSWORD` in Vercel dashboard and integrate real disbursement gateway API for payouts.

### Failure 3: PIC Operational Window Rejection (P0 Blocker)
* **Symptom:** `POST /api/mvp/pic/verify-entry` returns HTTP 403: `Operational window closed. PIC is only active H-1 to H+1 of event date (2026-11-15)`.
* **Root Cause:** Hardcoded window validation in `src/services/eventPicService.js` strictly compares current date against event date. Since all seeded events are in October–December 2026, verification at gate fails. Additionally, only `event-coldplay` has a PIC assigned in `state.event_pics`.
* **Impact:** PICs cannot verify tickets or attendees at gates for test events outside the 3-day event window, which in turn blocks escrow release to sellers (`ENTRY_NOT_CONFIRMED`).
* **Severity:** **P0 — Critical Lifecycle Blocker**
* **Recommended Next Action:** Add support for dynamic event operational staging and test window overrides for certified internal test events.

### Failure 4: Ephemeral In-Memory Database on Serverless Infrastructure (P0 Blocker)
* **Symptom:** Created listings, orders, and payments vanish across Lambda cold starts and cannot be shared across multi-region or concurrent serverless instances.
* **Root Cause:** The application relies on `const state = { ... }` in Node.js heap memory rather than a managed persistent database.
* **Impact:** Total transaction data loss whenever Vercel spins down or recycles lambda containers.
* **Severity:** **P0 — Architectural Blocker**
* **Recommended Next Action:** Connect an external production database (e.g., PostgreSQL / Supabase / Neon / Cloud SQL) and migrate `src/database.js` queries to persistent storage.

---

## Security Findings

### Security Vulnerability 1: Unauthenticated Listing Creation
* **Endpoint:** `POST /api/mvp/seller/listing`
* **Finding:** The endpoint does not call `resolveAuth(req)` or verify bearer tokens. It merely checks `if (!findUser(sellerId))` using the JSON body. Any unauthenticated caller can create listings impersonating any seller ID.
* **Tested:** An unauthenticated request without tokens or headers succeeded with HTTP 201 Created.

### Security Vulnerability 2: Unauthenticated Order Payment Mutation
* **Endpoint:** `POST /api/mvp/buyer/pay`
* **Finding:** The endpoint does not call `resolveAuth(req)` or verify ownership. Any unauthenticated party (or the seller themselves) can invoke this endpoint to mark an order `PAID_ESCROWED` with arbitrary payment references.

### Security Vulnerability 3: Missing Admin Passwords Defaulting to Null
* **Endpoint:** `POST /api/mvp/auth/login`
* **Finding:** In production, `state.users` passwords default to `null` if environment variables like `ARGUS_SELLER_PASSWORD` are not set. The login logic `if (user.password && password && !verifyPassword(...))` skips verification when `user.password` is null, allowing login without password verification.

---

## Scope Changes

**No feature development performed during certification.**

Verification was performed strictly against the deployed production system (`https://argus-trust-infrastructure.vercel.app`) using autonomous diagnostic scripts executing real HTTPS requests.

---

## Final Certification

### **NO-GO**

**Certification Summary:**
The currently deployed application at `https://argus-trust-infrastructure.vercel.app` is **NOT production-ready** for live commercial transactions. While the business presentation layer, structured offer negotiation, fee calculation, and dispute state machines are functionally coherent, the core transaction infrastructure suffers from four fatal P0 defects:
1. **Zero Real Payment Integration:** Payment processing is mocked in-memory; no gateway or webhook exists.
2. **Settlement Blocked:** Missing production environment variables (`ARGUS_ADMIN_PASSWORD`) cause financial endpoints to return HTTP 500.
3. **Gate Verification Blocked:** PIC operational window constraints block venue entry verification for non-same-day events.
4. **Ephemeral Memory:** Application state resides in ephemeral Lambda RAM without a persistent database backend.

Production readiness is **REJECTED**. The system must remediate these P0 blockers before commercial certification can be granted.
