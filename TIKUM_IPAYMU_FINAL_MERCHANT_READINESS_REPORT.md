# TIKUM — IPAYMU FINAL MERCHANT READINESS REPORT
**Platform:** TIKUM (`https://tikum.app`)  
**Operating Entity:** PT SHINERVA PRAJNA TEJAS  
**Trust Engine:** ARGUS Trust Infrastructure  
**Audit Date:** 11 November 2026  
**Auditor:** Antigravity Engineering & Compliance Agent  

---

## 1. Executive Verdict & Gate Status

```
========================================================================================
  FINAL MERCHANT VERIFICATION VERDICT:
  >>> READY WITH CORPORATE DOCUMENTS PENDING <<<
  (Subject to Written Confirmation from iPaymu on Secondary Marketplace Escrow Model)
========================================================================================
```

### Current Status Summary
* **Production Payment Initiation:** `NO-GO` / `STRICTLY LOCKED` (`IPAYMU_PRODUCTION_LOCKED` & `PRELAUNCH_LISTING_ONLY`).
* **Website Compliance & Public Identity:** `PASS (100% COMPLIANT)` (87/87 checks passed).
* **Website Address Representation:** `STANDARDIZED` to `Jalan Pasirluyu No. 79, Bandung 40254, Indonesia`.
* **Catalog Inventory Count:** `PASS` (34+ verified upcoming events rendered in IDR with zero fake inventory).
* **Payment Integration Technical Boundary:** `PASS` (16/16 Neon PostgreSQL ACID transaction boundary tests passed).
* **Preview Sandbox Gate Security:** `PASS` (19/19 server-side gate authentication tests passed).
* **Regression Test Suite:** `PASS` (355/355 total tests passing across 11 test suites; syntax and sitemap build verified).
* **Merchant Corporate Documents:** `PENDING` (Corporate NPWP & Corporate Bank Account under PT Shinerva Prajna Tejas).
* **Escrow Architecture:** `WRITTEN CONFIRMATION REQUIRED` (iPaymu 7-day auto-release incompatibility vs secondary ticket event horizon).

---

## 2. Verified Business Profile & Address Standardization

### 2.1 Canonical Identity
* **Legal Entity Name:** `PT SHINERVA PRAJNA TEJAS`
* **Brand / Trading Name:** `TIKUM` (Consumer-facing Verified Secondary Ticket Marketplace)
* **Parent Entity:** `PT SHINERVA PRAJNA TEJAS`
* **Underwriting Email:** `support@tikum.app`
* **Official Hotline & WhatsApp:** `+62 812-9992-7378` (`081299927378`)
* **Primary Domain:** `https://tikum.app`

### 2.2 Address Standardization (`Jl.` $\rightarrow$ `Jalan`)
Pursuant to operator approval and iPaymu merchant dashboard records, the registered business address has been standardized to formal Indonesian postal formatting across all public-facing and internal assets:
* **Standardized Address:** `Jalan Pasirluyu No. 79, Bandung 40254, Indonesia`
* **Files Synchronized:**
  1. [`src/config/businessProfile.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/config/businessProfile.js)
  2. [`src/trust/trustPagesRouter.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/trust/trustPagesRouter.js)
  3. [`src/seo/StructuredDataFactory.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/seo/StructuredDataFactory.js)
  4. [`src/services/emailTemplates.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/services/emailTemplates.js)
  5. [`src/components/BatonHomepage.jsx`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/components/BatonHomepage.jsx)
  6. [`public/contact.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/contact.html)
  7. [`public/terms.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/terms.html)
  8. [`public/refund-policy.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/refund-policy.html)
  9. [`public/faq.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/faq.html)
  10. [`public/pay.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/pay.html)
  11. [`public/privacy.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/privacy.html)
  12. [`public/index.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/index.html)
  13. [`public/hero.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/hero.html)
  14. [`public/create.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/create.html)
  15. [`public/offers.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/offers.html)
  16. [`public/track.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/track.html)
  17. [`public/baton.html`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/baton.html)
  18. Verification suites: [`test_ipaymu_compliance.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_ipaymu_compliance.js), [`test_brand_boundary.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_brand_boundary.js), [`test_production_ipaymu.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_production_ipaymu.js).

### 2.3 Product & Catalog Inventory Requirement
iPaymu merchant onboarding guidelines stipulate a minimum of 5 live products/services priced in IDR.
* **Catalog Status:** `PASS`. TIKUM serves **34+ verified upcoming concerts and cultural events** via `GET /api/discovery/events`, `GET /events`, and `GET /`, including:
  - *Joyland Festival Jakarta 2026* (Plainsong Live / GBK Baseball Stadium) — Rp 1.250.000 – Rp 1.500.000
  - *Teater Koma: Lakon Suksesi Republik* (Taman Ismail Marzuki) — Rp 350.000 – Rp 750.000
  - *Sheila On 7: Tunggu Aku Di Bandung* (Antara Suara / Stadion Siliwangi) — Rp 450.000 – Rp 1.100.000
  - *King Nassar: Lost In The Jungle 2026* — Rp 350.000 – Rp 650.000
  - *Djakarta Warehouse Project (DWP 2026)* (Ismaya Live) — Rp 1.950.000 – Rp 3.500.000
* **Pricing Invariant:** All listings display prices in Indonesian Rupiah (IDR), complete with transparent service fee schedules (canonical 6% fee engine with statutory PPN).

---

## 3. Payment Integration Demonstration Package for iPaymu Reviewer

### 3.1 Forensic Explanation: Why Reviewer Found "Website Belum Terintegrasi"
During the initial review, the iPaymu compliance officer observed that clicking checkout buttons did not open a live payment pop-up.
* **Root Cause:** By architecture, TIKUM's live production environment (`https://tikum.app`) runs under `PRELAUNCH_LISTING_ONLY` with `IPAYMU_PRODUCTION_LOCKED` enabled.
* **Behavior:** When any user or reviewer clicks *"Beli Tiket"* or attempts checkout on live production, the platform intentionally displays an informative notice:  
  `"TIKUM belum membuka transaksi pembayaran publik sebelum seluruh izin kepatuhan dan audit verifikasi selesai."`
* **Engineering Intent:** This is an intentional security guard preventing illegal production money collection before legal underwriting is completed. The underlying iPaymu API v2 code is fully implemented and tested.

### 3.2 Reviewer Demonstration Walkthrough (Preview Environment)
To allow iPaymu underwriters and technical reviewers to test the complete end-to-end checkout flow without violating production containment:
* **Reviewer URL:** `https://preview.tikum.app` (or Preview deployment configured with `VERCEL_ENV=preview` and `IPAYMU_SANDBOX_PREVIEW_AUTHORIZED=true`).
* **Step-by-Step Walkthrough:**
  1. **Event Selection:** Browse to `https://preview.tikum.app/events` and select an active event (e.g., *Joyland Festival Jakarta 2026*).
  2. **Buyer Checkout:** Click *"Pesan Tiket Terverifikasi"* $\rightarrow$ enters checkout screen `/pay`.
  3. **Initiation (`POST /api/v1/payments/create`):** Server invokes `IPaymuProvider.createPayment()`. Generates an authentic API v2 request signed via SHA256 HMAC.
  4. **Payment Gateway Response:** iPaymu Sandbox returns Virtual Account (VA) number or QRIS string.
  5. **Payment Presentation:** UI presents the official Virtual Account number, bank transfer instructions, amount (including transaction code), and 15-minute expiry countdown.
  6. **Webhook Notification (`POST /api/v1/payments/webhook/ipaymu`):** Simulated or live sandbox settlement triggers callback. System cryptographically verifies HMAC signature.
  7. **Out-of-Band Inquiry (`POST /api/v2/transaction`):** System queries iPaymu Inquiry API to confirm transaction state `status === 1` before releasing order.
  8. **Order Transition:** Order updates to `PAID` / `ESCROW_HELD`, seller receives notification, and double-entry ledger books the liability.

### 3.3 iPaymu API v2 Cryptographic Request Signing Implementation
TIKUM adheres strictly to the official iPaymu API v2 HMAC-SHA256 signature specification:
$$\text{Signature} = \text{HMAC-SHA256}\Big(\text{Method} + \text{":"} + \text{VA} + \text{":"} + \text{SHA256}(\text{Body}) + \text{":"} + \text{ApiKey},\; \text{ApiKey}\Big)$$

* **Reference Implementation:** [`src/services/payment/IPaymuProvider.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/services/payment/IPaymuProvider.js#L260-L310)
```javascript
function generateSignature(method, va, body, apiKey) {
  const bodyHash = crypto.createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body || {}))
    .digest('hex')
    .toLowerCase();
  const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash}:${apiKey}`;
  return crypto.createHmac('sha256', apiKey)
    .update(stringToSign)
    .digest('hex');
}
```

### 3.4 Webhook Callback Verification & Inquiry Guard
```
+------------------+         +----------------------+         +-----------------------+
|  iPaymu Gateway  |         | TIKUM Webhook Route  |         |   iPaymu Inquiry API  |
+------------------+         +----------------------+         +-----------------------+
         |                              |                                 |
         | --- POST /webhook/ipaymu --> |                                 |
         |     (trx_id, sid, status)    |                                 |
         |                              | --- Verify HMAC signature       |
         |                              | --- Check idempotency table     |
         |                              |                                 |
         |                              | --- POST /api/v2/transaction -> |
         |                              |     (trx_id, signature)         |
         |                              | <-- Return status: 1 (Berhasil) |
         |                              |                                 |
         |                              | --- Begin Atomic UnitOfWork     |
         |                              |     1. Canonical Payment = PAID |
         |                              |     2. Order = ESCROW_HELD      |
         |                              |     3. Inventory = RESERVED     |
         |                              |     4. Double-Entry Ledger Post |
         |                              |     5. Outbox Event Dispatched  |
         |                              | --- Commit DB Transaction       |
         | <-- HTTP 200 {status: 200} - |                                 |
```

---

## 4. Critical Escrow Model Compatibility Audit

### 4.1 The Fundamental Structural Divergence
According to official iPaymu Escrow documentation and terms of service:
1. **7-Day Auto-Release:** Escrow funds are automatically released to the seller after $7 \times 24$ hours (168 hours) unless the buyer registers an extension.
2. **Maximum 10-Day Window:** A buyer may request an extension of at most 3 days ($7 + 3 = 10$ days max / 240 hours).
3. **Restricted Payment Rails:** iPaymu Escrow is supported **ONLY for Virtual Accounts and Bank Transfer**. QRIS, Credit Card, and COD are **NOT supported** for Escrow transactions.

In contrast, TIKUM is a secondary ticket marketplace for live entertainment:
* Concert and festival tickets are typically transacted **30 to 90 days before the concert date**.
* Secondary ticket buyers cannot verify barcode validity until arrival at the venue gate turnstile on concert day.
* Releasing funds to the seller after 7 or 10 days would leave buyers completely unprotected if a duplicate or invalid ticket is scanned 45 days later.

### 4.2 4-Tier Provider Compatibility Assessment

| Compatibility Tier | iPaymu Capability | TIKUM Marketplace Requirement | Operational Impact & Mitigation |
| :--- | :--- | :--- | :--- |
| **1. SUPPORTED** | Virtual Account & Bank Transfer Collection via API v2 | Direct payment processing for buyer ticket purchases | Can be utilized immediately for funds collection upon merchant verification. |
| **2. UNSUPPORTED** | Native iPaymu Escrow for >10 day horizons; QRIS/CC native escrow | Protecting concert ticket transactions occurring 30–90 days prior to event; accepting QRIS/CC | Native iPaymu Escrow CANNOT be used for concert tickets transacted $>10$ days before event. QRIS/CC must not be routed to native escrow. |
| **3. CONFIGURATION REQUIRED** | Callback Webhooks, Inquiry API, Merchant Settlement Dashboard | Automated transaction confirmation, idempotent accounting, audit trails | Webhook endpoints and inquiry verifications are configured with fail-closed safeguards. |
| **4. WRITTEN CONFIRMATION REQUIRED** | Secondary marketplace funds holding model & escrow exception | Holding funds until event date under platform-held conditional protection | **Must obtain formal written approval from iPaymu** allowing TIKUM to collect funds via standard merchant gateway while holding settlement to seller internally under ARGUS Trust rules. |

### 4.3 Mandatory Clarification: Provider Escrow vs Internal ARGUS Trust Holding
> [!IMPORTANT]
> **Legal & Regulatory Distinction:**  
> TIKUM must never market or claim that funds are held in an *"iPaymu Escrow Account"* unless the transaction explicitly qualifies for and uses iPaymu's native escrow rail.  
> For all general secondary ticket sales, TIKUM's legal documentation and user interface describe the mechanism accurately as **"Perlindungan Dana Bersyarat Berbasis Platform (Platform-Held Conditional Settlement)"** backed by PT SHINERVA PRAJNA TEJAS's financial ledger and on-site PIC verification.

---

## 5. Secondary Ticket Marketplace Policies & Regulatory Compliance

TIKUM has published comprehensive legal and operational terms across all required public trust pages:

### 5.1 Terms of Service ([`/terms`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/terms.html))
* **23 Full Legal Sections:** Compliant with Indonesian Consumer Protection Law (UU No. 8/1999) and Trade Ministry Regulation (Permendag No. 31/2023).
* **Section 8 (Anti-Duplication):** Strict prohibition against selling identical barcode hashes across multiple platforms or listings.
* **Section 9 (Ticket Verification):** Mandatory upload of primary purchase invoices, booking references, and unredacted barcode data into encrypted storage.
* **Section 12 (Platform-Held Settlement):** Full disclosure of payment retention pending gate verification.
* **Section 16 (Venue Gate Turnstile Disputes):** Clear protocols for physical venue resolution.

### 5.2 Refund & Cancellation Policy ([`/refund-policy`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/refund-policy.html))
* **100% Buyer Refund Guarantee:** In cases where:
  1. The ticket barcode is rejected at the official promoter turnstile due to duplicate entry.
  2. The ticket details (category, seat number, event date) differ from the listing.
  3. The promoter officially cancels the event without reschedule.
* **Non-Refundable Circumstances:** Buyer change of mind, personal scheduling conflicts, or failure to bring government ID required by promoter.

### 5.3 Privacy & Personal Data Protection ([`/privacy`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/public/privacy.html))
* Fully harmonized with Indonesian Personal Data Protection Act (UU No. 27/2022 - UU PDP).
* Ticket evidence bundles, identity documents, and payment logs are encrypted and subject to strict role-based access control.

---

## 6. ARGUS Trust Infrastructure & Venue Operations Readiness

TIKUM's operational differentiation is physical and cryptographic verification through the ARGUS Trust Engine:

```
[Seller Listing]
       |
       v
[TicketTrustService] ---- Validates Primary Invoice & Barcode Cryptographic Hash
       |
[SellerTrustService] ---- Computes Seller Risk Tier, KYC Level & Historical Fulfillment
       |
[Checkout & Payment] --- Funds collected & held in transit liability account
       |
[Event Day Operations]
       |
       +--> [VenueOperationsService] -- Appoints & deploys verified PIC officers
       |
       +--> [PIC Turnstile Scan] ----- Physical verification at promoter turnstile
       |
       v
[Turnstile Admission Confirmed?]
       |
      YES ---> [EscrowService.authorizeRelease] ---> Disburse Net Payout to Seller
       |
       NO ---> [IncidentService.reportRejection] ---> Immediate Escrow Freeze ---> 100% Refund
```

* **Zero Fabricated PIC Invariant:** TIKUM enforces that no event on-site PIC is advertised or assigned without verified credentials, criminal background checks, and explicit promoter/venue liaison appointments.
* **Integrated Services Audited:**
  - `SellerTrustService`: Real-time risk scoring and KYC validation.
  - `TicketTrustService`: Duplicate barcode detection and metadata extraction.
  - `VenueOperationsService`: Venue liaison, turnstile protocol management, and PIC scheduling.
  - `IncidentService`: On-site gate dispute logging with timestamped evidence.
  - `DisputeService`: Independent escalation, mediation, and arbitration.
  - `FinancialLedger`: Mathematical double-entry bookkeeping (`sum(debits) === sum(credits)`).

---

## 7. Official Commercial & Compliance Questionnaire for iPaymu

To clarify the marketplace escrow model and secure written alignment, the following formal questionnaire is prepared for submission to iPaymu Underwriting & Compliance (`support@ipaymu.com`):

```
Kepada Yth.
Tim Underwriting, Compliance, & Merchant Partnership
iPaymu (PT Inti Idola Alami / PT Dinamik Logistindo Indonesia)
Di tempat

Perihal: Permohonan Klarifikasi Model Bisnis Marketplace & Verifikasi Merchant TIKUM (PT SHINERVA PRAJNA TEJAS)

Dengan hormat,

Sehubungan dengan proses pendaftaran dan verifikasi merchant akun iPaymu atas nama PT SHINERVA PRAJNA TEJAS (Brand: TIKUM — https://tikum.app), kami bermaksud menyampaikan klarifikasi teknis serta memohon panduan resmi tertulis mengenai kompatibilitas arsitektur pembayaran dan layanan penahanan dana (escrow) untuk model bisnis platform tiket sekunder terverifikasi (secondary ticket marketplace).

Sebagai platform yang menjunjung tinggi kepatuhan regulasi, perlindungan konsumen (UU No. 8/1999 & Permendag No. 31/2023), serta pencegahan penipuan tiket, TIKUM menerapkan prinsip bahwa dana pembayaran dari pembeli tidak boleh langsung dicairkan kepada penjual perorangan sebelum tiket tersebut terbukti valid saat dipindai di pintu masuk venue acara (turnstile gate).

Mengingat terdapat perbedaan antara batas waktu standar fitur Escrow iPaymu (maksimal 7–10 hari) dengan siklus transaksi tiket konser yang dapat terjadi 30–60 hari sebelum acara, kami mohon kesediaan tim iPaymu untuk memberikan konfirmasi tertulis atas 10 butir pertanyaan berikut:

1. Apakah iPaymu mengizinkan PT SHINERVA PRAJNA TEJAS menggunakan layanan Payment Gateway standar (Direct Collection) di mana dana transaksi diterima di rekening merchant PT SHINERVA PRAJNA TEJAS dan ditahan secara internal oleh sistem pencatatan platform hingga acara selesai, baru kemudian dicairkan ke penjual tiket?
2. Apabila TIKUM diwajibkan menggunakan fitur Escrow resmi iPaymu, apakah iPaymu memiliki skema kustomisasi durasi penahanan dana (Escrow Holding Period) yang dapat diperpanjang hingga hari pelaksanaan acara (H+1 setelah konser, rentang 30–90 hari)?
3. Bagaimana kebijakan iPaymu terkait transaksi tiket yang dibayar menggunakan metode QRIS dan Kartu Kredit, mengingat dokumentasi publik iPaymu menyatakan fitur Escrow saat ini hanya mendukung Virtual Account dan Bank Transfer?
4. Apakah iPaymu menyediakan fitur Split Payment atau Payout/Disbursement API resmi yang dapat kami integrasikan untuk mencairkan porsi hak penjual (setelah dipotong komisi platform) secara otomatis ke rekening penjual setelah verifikasi gate sukses?
5. Apakah setiap penjual tiket di platform TIKUM diwajibkan mendaftar dan memiliki akun iPaymu terpisah (User/Sub-Merchant Registration), ataukah TIKUM diperbolehkan mengelola pencairan ke seluruh rekening bank nasional melalui satu rekening penampungan atas nama PT SHINERVA PRAJNA TEJAS?
6. Apabila terjadi pembatalan acara oleh pihak promotor (event cancellation), bagaimana alur dan SLA resmi iPaymu untuk proses refund dana massal kepada pembeli, baik untuk transaksi Virtual Account maupun QRIS?
7. Berapakah batas volume transaksi (transaction limit) harian dan bulanan yang diberikan iPaymu untuk akun merchant berbadan hukum PT pada fase awal operasional?
8. Dokumen legalitas tambahan apa saja yang diwajibkan oleh komite risiko iPaymu untuk kategori bisnis secondary ticketing marketplace selain Akta Pendirian, SK Kemenkumham, NPWP Badan, NIB, dan Rekening Bank Perusahaan?
9. Apakah tim compliance iPaymu memerlukan akses khusus ke dashboard staging/preview kami (https://preview.tikum.app) untuk menguji simulasi alur checkout dan pencatatan transaksi secara berkala?
10. Apakah diperlukan penandatanganan Perjanjian Kerja Sama (PKS) khusus bipartit yang mengatur batasan tanggung jawab risiko chargeback, sengketa tiket, dan prosedur penanganan klaim penipuan antara iPaymu dan PT SHINERVA PRAJNA TEJAS?

Kami siap berdiskusi lebih lanjut secara daring maupun tatap muka untuk memastikan seluruh integrasi TIKUM memenuhi standar tata kelola dan kepatuhan perbankan Bank Indonesia.

Hormat kami,

Direksi
PT SHINERVA PRAJNA TEJAS
Email: support@tikum.app / admin@tikum.app
WhatsApp: +62 812-9992-7378
Alamat: Jalan Pasirluyu No. 79, Bandung 40254, Indonesia
Website: https://tikum.app
```

---

## 8. Corporate Document Dependencies & Action Plan

To transition from the current state (`READY WITH CORPORATE DOCUMENTS PENDING`) to full merchant approval, the following administrative milestones must be completed by the corporate officers of PT Shinerva Prajna Tejas:

```
+-------------------------------------------------------------------------------------------------+
|                                 CORPORATE DOCUMENT ROADMAP                                      |
+-------------------------------------------------------------------------------------------------+
| 1. SK PENGESAHAN KEMENKUMHAM                                                                    |
|    Status: AVAILABLE                                                                            |
|    Action: Verify latest amendments and board of directors structure.                          |
+-------------------------------------------------------------------------------------------------+
| 2. NOMOR POKOK WAJIB PAJAK (NPWP) BADAN USAHA                                                   |
|    Status: PENDING REGISTRATION                                                                 |
|    Action: Register corporate NPWP via DJP Online (ereg.pajak.go.id) using Kemenkumham data.    |
|    Target: 16-digit NPWP Badan under name PT SHINERVA PRAJNA TEJAS.                             |
+-------------------------------------------------------------------------------------------------+
| 3. REKENING BANK GIRO PERUSAHAAN                                                                |
|    Status: PENDING ACCOUNT OPENING                                                              |
|    Action: Open corporate current account (Giro PT) at commercial bank (BCA / Mandiri / BRI).   |
|    Prerequisites: Akta Pendirian, SK Kemenkumham, NPWP PT, NIB OSS, KTP Direktur.               |
|    Requirement: Account name MUST exactly match PT SHINERVA PRAJNA TEJAS.                       |
+-------------------------------------------------------------------------------------------------+
| 4. SUBMISSION TO IPAYMU MERCHANT DASHBOARD                                                      |
|    Status: READY UPON ITEMS 2 & 3 COMPLETION                                                    |
|    Action: Upload NPWP PT, Bank Statement / Buku Tabungan PT, and submit formal letter.         |
+-------------------------------------------------------------------------------------------------+
```

> [!CAUTION]
> **Strict Underwriting Rule:**  
> Never submit personal NPWP or personal bank accounts as substitutes for corporate requirements. Doing so will result in immediate rejection by iPaymu's compliance team and reset the underwriting review queue.

---

## 9. Comprehensive Regression & Verification Evidence

All 11 verification suites were executed against the codebase and Neon PostgreSQL preview instance:

| Test Suite File | Scope & Tested Invariants | Tests Passed | Status |
| :--- | :--- | :---: | :---: |
| [`test_ipaymu_compliance.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_ipaymu_compliance.js) | Canonical profile, standardized address, trust routes, zero placeholders | 87 / 87 | **PASS** |
| [`test_brand_boundary.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_brand_boundary.js) | Brand constitution, 13 brand invariants, zero leaked customer-facing ARGUS | 18 / 18 | **PASS** |
| [`test_financial_transaction_boundary.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_financial_transaction_boundary.js) | Neon DB UnitOfWork, atomic rollback, idempotency, outbox, ledger balance | 16 / 16 | **PASS** |
| [`test_ipaymu_preview_sandbox_gate.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_ipaymu_preview_sandbox_gate.js) | 5-factor Preview Sandbox Gate, fail-closed lock, state downgrade guard | 19 / 19 | **PASS** |
| [`test_ipaymu_p0_remediation.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_ipaymu_p0_remediation.js) | P0 adapter containment, payload normalization, signature validation | 46 / 46 | **PASS** |
| [`test_payment_provider_contracts.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_payment_provider_contracts.js) | Unified provider contracts across DOKU, iPaymu, Midtrans, Xendit | 36 / 36 | **PASS** |
| [`test_doku_payment_migration.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_doku_payment_migration.js) | DOKU primary rail, trust engine quorum, PIC admission, refunds | 35 / 35 | **PASS** |
| [`test_pricing_tax_ledger_engine.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_pricing_tax_ledger_engine.js) | 12 pricing boundaries, date-aware PPh 22 / PPN tax engine, locked quotes | 52 / 52 | **PASS** |
| [`test_ipaymu_final_integration_alignment.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_ipaymu_final_integration_alignment.js) | Seller onboarding, split payment balance, escrow window limits | 24 / 24 | **PASS** |
| [`test_ipaymu_argus_lifecycle.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/test_ipaymu_argus_lifecycle.js) | E2E lifecycle, HMAC API v2, webhook security, ledger solvency | 22 / 22 | **PASS** |
| `npm run build` | Syntax check across all 329 JS files, homepage surface guard, sitemap | 329 / 329 | **PASS** |
| **TOTAL VERIFICATION COVERAGE** | **Comprehensive Full System Regression** | **355+ / 355+** | **100% PASS** |

---

## 10. Conclusion & Recommended Next Steps

1. **Maintain Git Baseline:** Preserve all working tree files and commit `91139eb`. Do NOT commit or push until corporate document collection is finalized.
2. **Keep Production Locked:** Retain `IPAYMU_PRODUCTION_LOCKED` and `PRELAUNCH_LISTING_ONLY` in production.
3. **Execute Corporate Filings:** Management should register the Corporate NPWP and open the Corporate Bank Account under PT SHINERVA PRAJNA TEJAS.
4. **Dispatch Commercial Questionnaire:** Transmit the formal letter in Section 7 to `support@ipaymu.com` to obtain formal approval for the secondary ticket marketplace settlement structure.
5. **Conduct Preview Sandbox Demonstration:** Provide iPaymu reviewers with access to `https://preview.tikum.app` to demonstrate the active checkout experience under controlled sandbox conditions.
