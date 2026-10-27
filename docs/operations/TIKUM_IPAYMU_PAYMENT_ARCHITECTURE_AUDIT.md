# TIKUM × iPaymu Payment Architecture & ARGUS Trust Engine Audit

**Document Version:** 1.0.0  
**Date:** 2026-10-28  
**Repository:** `agunsux/ARGUS`  
**Current HEAD:** `0369c037bbe1987da9e5bf2c0a542d2a5e4d78d3`  
**Working Branch:** `dryrun/internal-listing-pilot`  
**Operating Mode:** `PRELAUNCH_LISTING_ONLY` (Strictly Enforced)  
**Intended Legal Entity:** `PT SHINERVA PRAJNA TEJAS`  
**Internal Trust Engine:** ARGUS Trust & Risk Engine  
**Primary Payment Gateways:** DOKU (Tier 1A Primary), iPaymu (Tier 1B Verified Backup), Midtrans (Tier 2A), Xendit (Tier 2B)

---

## 1. Executive Summary & Baseline Verdict

An exhaustive, evidence-driven audit of the TIKUM repository (`agunsux/ARGUS`) was conducted to establish the payment and transaction architecture for integrating the **iPaymu payment gateway (API v2)** under the **ARGUS Trust Engine** and the intended merchant entity **PT Shinerva Prajna Tejas**.

### Key Architectural Findings:
1. **Existing Architecture is Mature, Decoupled & Reusable:** TIKUM does not require a rewrite. The platform already incorporates a provider-agnostic abstraction layer (`PaymentProvider`), a multi-provider router (`PaymentRoutingService`), a unified orchestrator (`PaymentService`), an immutable double-entry bookkeeping engine (`FinancialLedger`), and a discrete four-domain state machine (`EscrowStateMachine`).
2. **iPaymu Provider Adapter (`IPaymuProvider.js`):** Implements official iPaymu API v2 specification with HMAC-SHA256 signature generation (`Method:Va:BodyHash:ApiKey`), timing-safe webhook verification (`crypto.timingSafeEqual`), direct Virtual Account issuance, direct QRIS, status inquiries, and strict capability guards.
3. **Milestone Escrow Reality & Invariant:**
   - **Critical Fact:** iPaymu API v2 **does NOT** provide programmable milestone escrow hold/release primitives.
   - **Architectural Solution:** Milestone escrow is managed exclusively by **TIKUM's internal ARGUS state machine**. Gateways (including iPaymu) act solely as collection and disbursement rails into the merchant account.
   - **Channel Restriction:** Escrow-backed transactions are restricted to Virtual Accounts (`_VA`). QRIS and instant payment rails strictly reject milestone escrow.
4. **Merchant Onboarding Status & Blocker:**
   - iPaymu account credentials exist in sandbox; merchant onboarding was initiated under CV and is currently undergoing formal legal transition to **PT Shinerva Prajna Tejas**.
   - Company corporate bank account establishment is in progress.
   - **Verdict:** Real-money live transactions **must remain strictly blocked** (`MARKETPLACE_MODE=PRELAUNCH_LISTING_ONLY`, HTTP 403 fail-closed). Sandbox and dry-run development is fully operational.

---

## 2. Business Entity & Merchant Context

| Parameter | Current Repository Profile | Legal Transition Target |
|---|---|---|
| **Company Legal Name** | `PT SHINERVA PRAJNA TEJAS` | PT Shinerva Prajna Tejas |
| **Brand Names** | TIKUM, ARGUS, Shinerva HQ, Salmo | TIKUM (Secondary Ticket Platform) |
| **Registered Address** | Jl. Pasirluyu No. 79, Bandung 40254, Indonesia | Validated across all legal pages |
| **Official Email** | `support@tikum.app` | Active domain mailbox |
| **Official Phone/WA** | `081299927378` (`+6281299927378`) | Active customer care line |
| **Merchant Status** | Pending Verification (`CV -> PT Shinerva`) | Awaiting formal approval from iPaymu |
| **Corporate Bank Account**| Pending Establishment | Required before live disbursement |

---

## 3. Verified iPaymu Capability Register (API v2)

| Capability | Supported by iPaymu API v2 | TIKUM / ARGUS Handling | Implementation Detail |
|---|---|---|---|
| **Payment Collection (VA)** | **YES** | **Primary Escrow Rail** | BCA, Mandiri, BNI, BRI, Permata VA via `/payment/direct` |
| **Payment Collection (QRIS)**| **YES** | **Non-Escrow Rail Only** | Dynamic QRIS via `/payment/direct`; rejects escrow hold |
| **Credit Card** | **YES** | **Non-Escrow Rail Only** | Direct card charge; rejects milestone escrow |
| **Programmable Escrow Hold** | **NO** | **Managed by ARGUS** | Gateway collects funds; ARGUS holds virtual ledger liability |
| **Programmable Escrow Release**| **NO** | **Managed by ARGUS** | Released upon Venue PIC turnstile admission |
| **Split Payment (BagiBagi)** | **YES (Sub-account only)**| **Roadmap (Post-Pilot)** | Requires sellers to register iPaymu sub-accounts |
| **Automated Payout API** | **NO / RESTRICTED** | **Manual / Dashboard** | Payout method throws `CapabilityUnsupportedError` (501) |
| **Cryptographic Webhook** | **YES** | **Implemented** | HMAC-SHA256 signature verified with `timingSafeEqual` |
| **Payment Status Inquiry** | **YES** | **Implemented** | S2S check via `/transaction` with `transactionId` |
| **Automated Refund API** | **NO / RESTRICTED** | **Controlled Reversal** | Reverses ledger entries; manual payout execution |
| **Chargeback / Dispute API**| **NO** | **Managed by ARGUS** | Full internal dispute lifecycle (`DisputeService.js`) |

---

## 4. Canonical 4-Domain State Machine

To prevent semantic conflation between money movements, user orders, physical tickets, and escrow obligations, TIKUM enforces four completely decoupled state domains:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ORDER STATE   │     │  PAYMENT STATE  │     │  TICKET STATE   │     │SETTLEMENT/ESCROW│
├─────────────────┤     ├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ DRAFT           │     │ PENDING         │     │ LISTED          │     │ UNFUNDED        │
│ RESERVED        │     │ AUTHORIZED      │     │ VERIFIED        │     │ ESCROW_HELD     │
│ CONFIRMED       │     │ PAID            │     │ LOCKED_IN_ESCROW│     │ ADMISSION_OK    │
│ COMPLETED       │     │ REFUNDED        │     │ ADMITTED_VENUE  │     │ SETTLED_RELEASED│
│ CANCELLED       │     │ CHARGEBACK      │     │ INVALIDATED     │     │ REFUNDED_BUYER  │
│ DISPUTED        │     │ EXPIRED         │     │ TRANSFERRED     │     │ FROZEN_DISPUTE  │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Core Invariants:
1. **`PAYMENT_STATE === PAID` does NOT authorize settlement:** When iPaymu confirms payment, money state transitions to `PAID`, but settlement state transitions to `ESCROW_HELD`. Funds are NEVER disbursed to seller upon checkout.
2. **Settlement Release Gate:** Settlement to seller (`SETTLED_RELEASED`) strictly requires:
   - Verified payment (`MONEY_STATE === PAID`).
   - Physical/Digital ticket locked in escrow.
   - **Venue PIC Turnstile Admission** verified or buyer explicit confirmation.
   - Dispute-free operational window (minimum 2 hours post-event admission).
3. **Dispute Freeze:** Any buyer dispute immediately halts settlement transition and moves settlement state to `FROZEN_DISPUTE`.

---

## 5. Security & Verification Architecture

### 5.1 Request Signing (iPaymu API v2)
Every outbound request to iPaymu is authenticated via HMAC-SHA256:
$$\text{Signature} = \text{HMAC-SHA256}_{ApiKey}(\text{Method} : \text{Va} : \text{BodyHash} : \text{ApiKey})$$
Where $\text{BodyHash} = \text{SHA256}(\text{rawRequestBody})$.

### 5.2 Webhook Verification & Non-Repudiation
- Inbound webhooks sent to `/api/v1/payments/webhook/ipaymu` are verified cryptographically.
- Signatures are compared using constant-time `crypto.timingSafeEqual` to prevent timing attacks.
- Replay protection: Inbound webhooks check `state.provider_webhooks` and `DurableFinancialStore` by `(provider, provider_event_id, payload_hash)`. Duplicate webhooks return `HTTP 200 { idempotent: true }` without touching the ledger.

### 5.3 Late Payment Quarantine
If a buyer pays after order reservation TTL has expired:
- Order status remains `EXPIRED`.
- Inbound funds are quarantined into `LATE_PAYMENT_PENDING_REVIEW`.
- Ticket is **never** revived or double-booked.
- Immediate automated notification is routed to operations queue for buyer refund.

---

## 6. Financial Ledger (Double-Entry Bookkeeping)

Authoritative balance is never computed via mutable `balance += amount`. Every event is an immutable journal transaction satisfying:
$$\sum \text{Debits} \equiv \sum \text{Credits}$$

### Standard Transaction Journal Mappings:

#### 1. Buyer Payment Capture (Rp 500.000 Ticket + Rp 25.000 Buyer Fee + Rp 2.750 PPN + Rp 3.500 Gateway Fee):
* **DEBIT:** `PAYMENT_GATEWAY_CLEARING` (Rp 531.250)
* **CREDIT:** `SELLER_PAYABLE_PENDING` (Rp 485.000) [Net seller payout after 3% seller fee]
* **CREDIT:** `PLATFORM_FEE_REVENUE` (Rp 40.000) [Buyer fee Rp 25.000 + Seller fee Rp 15.000]
* **CREDIT:** `TAX_PAYABLE` (Rp 2.750) [PPN 11% withheld for DJP]
* **CREDIT:** `PROVIDER_FEE_EXPENSE` (Rp 3.500) [iPaymu transaction fee]

#### 2. Escrow Disbursement Release (Post-Event Turnstile Admission):
* **DEBIT:** `SELLER_PAYABLE_PENDING` (Rp 485.000)
* **CREDIT:** `SETTLEMENT_CLEARING` (Rp 485.000)

#### 3. Full Buyer Refund (Event Cancellation / Invalid Barcode):
* **DEBIT:** `SELLER_PAYABLE_PENDING` (Rp 485.000)
* **DEBIT:** `PLATFORM_FEE_REVENUE` (Rp 40.000)
* **DEBIT:** `TAX_PAYABLE` (Rp 2.750)
* **CREDIT:** `PAYMENT_GATEWAY_CLEARING` (Rp 527.750)

---

## 7. Marketplace Fund-Flow Decision Matrix

| Model | Feasibility with iPaymu Today | ARGUS Architecture Fit | Recommendation |
|---|---|---|---|
| **Model A: Merchant Collection + ARGUS Internal Escrow** | **100% FEASIBLE** | **FULL FIT** | **Selected Default for TIKUM Pilot** |
| **Model B: BagiBagi Split Payment** | Requires seller sub-accounts | High friction for occasional sellers | Evaluate for enterprise promoters |
| **Model C: Native Gateway Escrow API** | **UNSUPPORTED BY IPAYMU** | Infeasible | Rejected; do not claim provider escrow |

---

## 8. Verification & Test Suite Results

| Test Suite | File | Checks | Status |
|---|---|---|---|
| **iPaymu Compliance & Trust** | `test_ipaymu_compliance.js` | 87/87 | **100% PASSED** |
| **Unified Provider Contracts** | `test_payment_provider_contracts.js` | 36/36 | **100% PASSED** |
| **Sandbox E2E & Negative Paths** | `test_payment_sandbox_e2e_matrix.js` | 15/15 | **100% PASSED** |
| **iPaymu × ARGUS Lifecycle** | `test_ipaymu_argus_lifecycle.js` | 22/22 | **100% PASSED** |
| **Syntax & Module Integrity** | `test_syntax_check.js` | 319/319 | **100% PASSED** |

---

## 9. Remaining Operational Blockers

Before switching `MARKETPLACE_MODE` from `PRELAUNCH_LISTING_ONLY` to `LIVE`:
1. **Merchant Verification Completion:** iPaymu compliance review for PT Shinerva Prajna Tejas must be completed and active.
2. **Corporate Bank Account:** PT corporate account must be linked to iPaymu for settlement withdrawals.
3. **Operational Personnel Assignment:** Primary moderator, backup moderator, and venue PIC must be officially designated per SOP.
