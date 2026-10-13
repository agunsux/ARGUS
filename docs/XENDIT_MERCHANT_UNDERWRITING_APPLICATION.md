# PT SHINERVA PRAJNA TEJAS — XENDIT MERCHANT ONBOARDING & UNDERWRITING APPLICATION

**Target Recipient:** Xendit Merchant Onboarding & Risk Underwriting Team (`help@xendit.co` / Assigned Account Executive)
**Legal Entity:** PT SHINERVA PRAJNA TEJAS
**Platform / Product:** TIKUM (`https://tikum.app`)
**Application Type:** Merchant Gateway Activation, xenPlatform Marketplace Underwriting & High-Risk Category Clearance
**Date of Application:** October 2026
**Document Classification:** Confidential — Commercial Underwriting Package

---

## 1. Executive Summary & Corporate Profile

PT SHINERVA PRAJNA TEJAS is an Indonesian technology enterprise operating **TIKUM** (`https://tikum.app`), an advanced verified secondary ticketing marketplace for music concerts, performing arts, and major live entertainment events across Indonesia.

Unlike unregulated peer-to-peer social media ticket resale (such as "wts" listings on X/Twitter and Telegram), TIKUM is powered by the **ARGUS Trust Engine**—a comprehensive fraud prevention, biometric/KTP identity verification, and turnstile gate admission protocol that eliminates counterfeit tickets, double-spending, and scalper fraud.

TIKUM is integrating Xendit's **xenPlatform** to process domestic consumer payments via QRIS, Virtual Accounts (BCA, Mandiri, BNI, BRI, Permata), e-Wallets (OVO, DANA, ShopeePay), and Credit Cards.

---

## 2. Business Model & Risk Classification Acknowledgement

### 2.1 Industry Category
* **Primary Category:** Secondary Ticket Marketplace / Ticket Resale Platform
* **MCC (Merchant Category Code):** 7922 (Theatrical Producers & Ticket Agencies) / 7999 (Recreation Services)
* **Risk Classification:** High-Risk (Secondary Ticketing)

### 2.2 Frank Risk Disclosure
PT SHINERVA PRAJNA TEJAS explicitly acknowledges that secondary ticketing carries elevated chargeback, friendly fraud, and event-cancellation risks for payment gateways and card networks. TIKUM has been architected from the ground up to mitigate every vector of secondary ticketing fraud.

### 2.3 Transparent Fund Custody & xenPlatform Model Disclosure
* TIKUM acknowledges that standard Xendit payment collection rails capture funds directly and that **Xendit does not act as a licensed third-party milestone escrow trustee**.
* Under the xenPlatform marketplace architecture:
  1. The platform captures gross order value from the buyer.
  2. Platform fees (nominal 6% + service fee) and applicable tax withholdings (PPN 11%, PPh 22) are split into the platform treasury.
  3. Net seller proceeds are designated for disbursement only after physical venue admission is verified.
* Until explicit milestone escrow holding is contractually enabled by Xendit, TIKUM maintains internal ledger custody and will manage seller payouts via Xendit Disbursements or xenPlatform subaccounts strictly following gate admission verification.

---

## 3. ARGUS Trust Engine: Four-Pillar Fraud Prevention

TIKUM rejects 100% of unverified listings. Every secondary listing on TIKUM must pass four strict gates before appearing in the marketplace:

### Pillar 1: KYC & Identity Verification
* **Mandatory Seller KYC:** Sellers must submit Indonesian National ID (KTP) / passport, verified mobile number, and active bank account in the seller's legal name.
* **Reputation & Fraud Scoring:** ARGUS assigns a composite trust score (0–100) based on KYC status, historical sales, dispute history, and promoter verification records.

### Pillar 2: Primary Ticket Authenticity Verification
* **Original Booking Proof Required:** Sellers must upload official promoter invoice/receipt (Loket.com, Tiket.com, TipTip, Megatix, etc.) showing order number and matching buyer identity.
* **Face-Value Price Cap:** TIKUM enforces fair pricing policies to suppress predatory scalping and prevent high-ticket chargeback spikes.

### Pillar 3: Cryptographic Barcode De-duplication (Anti-Double-Selling)
* **SHA-256 Unique Barcode Fingerprinting:** The raw barcode/QR serial is hashed upon upload. The ARGUS database enforces strict uniqueness constraints—identical ticket barcodes cannot be listed or sold twice under any circumstance.
* **Multi-Ticket Seat Verification:** Sellers listing 1 to 4 tickets must specify individual seating (Section, Row, Seat) or explicit General Admission quotas.

### Pillar 4: Physical Venue PIC (Person-in-Charge) & Turnstile Handshake
* **Operational Cells:** TIKUM deploys trained field operations staff (PICs) at major event gates.
* **Dual-Handshake Admission Protocol:**
  - Upon physical arrival at the venue gate, the buyer presents a time-limited admission challenge code.
  - The TIKUM PIC verifies the turnstile scan on the promoter's official scanner, validates buyer identity, enters the handshake code, and captures mandatory photo evidence.
  - Admission status transitions to `ENTRY_CONFIRMED`.
  - Only after `ENTRY_CONFIRMED` is recorded does the system authorize seller payout.

---

## 4. Fulfillment Models & Delivery Governance

Sellers select one of two explicit fulfillment modes upon listing:

| Fulfillment Mode | Description | Risk Level | Payout Release Trigger |
| :--- | :--- | :--- | :--- |
| **`TIKUM_VENUE_PIC`** (Recommended) | TIKUM field staff meets buyer/seller at venue, supervises wristband exchange or ticket scanning. | Lowest | Official PIC gate verification + photo evidence bundle. |
| **`SELLER_MANAGED`** | Seller transfers electronic PDF/QR or ships physical wristband directly to buyer. | Medium | Buyer positive confirmation OR H+24 hours post-event without reported dispute. |

---

## 5. Dispute Resolution, Refunds & Chargeback Guarantees

### 5.1 100% Buyer Guarantee
If a buyer is rejected at the venue turnstile due to a counterfeit, duplicate, or promoter-invalidated ticket:
1. The buyer triggers the **Fast Gate Dispute** feature in the TIKUM mobile application.
2. The on-site PIC or Admin Operations Control Center investigates immediately.
3. If gate rejection is verified, the buyer receives a **100% refund of the total purchase amount**.
4. Seller payout is permanently blocked, seller KYC is revoked, and the seller account is blacklisted.

### 5.2 Chargeback Target & History
* **Target Chargeback Ratio:** `< 0.3%` of total transaction volume (well below card scheme 0.9% thresholds).
* **Chargeback Evidence Automation:** TIKUM logs full audit trails for every order—including IP address, device fingerprint, promoter proof of purchase, buyer handshake codes, and PIC gate admission timestamps—enabling immediate chargeback representation winning.

---

## 6. Projections & Processing Profile (Indonesia Pilot)

* **Launch Events:** Major 2026 music concerts in Greater Jakarta (GBK, ICE BSD, JIExpo, Beach City International Stadium).
* **Estimated Monthly Volume (Pilot Phase):** IDR 500,000,000 – IDR 2,500,000,000
* **Average Transaction Value:** IDR 1,500,000 – IDR 3,500,000
* **Maximum Allowed Single Transaction:** IDR 15,000,000
* **Currencies Requested:** IDR (Domestic Indonesian Rupiah)
* **Channels Requested:**
  - QRIS (Instant dynamic QR)
  - Virtual Accounts: BCA, Mandiri, BNI, BRI, Permata
  - e-Wallets: OVO, DANA, ShopeePay
  - Credit Cards: Visa, Mastercard (with 3D-Secure mandatory)

---

## 7. Company Documentation Checklist (Attached Upon Submission)

- [x] Akta Pendirian Perseroan Terbatas (PT SHINERVA PRAJNA TEJAS) & SK Kemenkumham
- [x] Nomor Induk Berusaha (NIB) / OSS RBA
- [x] NPWP Badan (Tax Identification Number) PT SHINERVA PRAJNA TEJAS
- [x] KTP & NPWP Direktur Utama / Penanggung Jawab
- [x] Rekening Koran Perusahaan (3 bulan terakhir)
- [x] Kebijakan Privasi & Syarat Ketentuan Layanan TIKUM (`https://tikum.app/terms`, `https://tikum.app/privacy`)
- [x] Kebijakan Pengembalian Dana & Pembatalan Tiket (`https://tikum.app/refund-policy`)
- [x] Technical Architecture & Sandbox Smoke Test Verification Report (`test_xendit_sandbox_smoke.js` — 19/19 Passed)

---

## 8. Authoritative Sign-Off

**Submitted by:**
Direksi PT SHINERVA PRAJNA TEJAS
Email: `help@tikum.app` / `admin@tikum.app`
Corporate Website: `https://tikum.app`
Operations Center: Jakarta, Indonesia
