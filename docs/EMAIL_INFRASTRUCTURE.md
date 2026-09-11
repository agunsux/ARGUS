# TIKUM — Professional Email Infrastructure Runbook
**Zero-Cost First (Rp0/month) &bull; Cloudflare Email Routing + Resend Free**

Domain: `https://tikum.app`

---

## 1. High-Level Architecture

```
INCOMING (Business Routing):
Customer / External Sender
          │
          ▼
[hello | support | admin | pic]@tikum.app
          │
          ▼
Cloudflare Email Routing (MX records at apex tikum.app)
          │
          ▼
Verified Destination Inbox (agunsux@gmail.com)

OUTGOING (Transactional Delivery):
TIKUM Application (Event-driven side effect)
          │
          ▼
EmailService (Centralized singleton, Idempotency check, Free-tier guard)
          │
          ▼
Resend Free API (Server-side only with RESEND_API_KEY)
          │
          ▼
From: "TIKUM <support@tikum.app>", Reply-To: "support@tikum.app"
          │
          ▼
Customer / User Inbox (DKIM + SPF + DMARC aligned)
```

---

## 2. Inbound: Cloudflare Email Routing Configuration

### DNS Responsibility
Cloudflare Email Routing handles inbound delivery to `@tikum.app` addresses without incurring mailbox hosting costs.

### Authoritative DNS Baseline
Authoritative nameservers for `tikum.app`:
- `pedro.ns.cloudflare.com`
- `jamie.ns.cloudflare.com`

Existing apex record:
- `A` &rarr; `76.76.21.21` (**Vercel Production DNS &mdash; DO NOT TOUCH**)

### Step-by-Step Dashboard Setup
1. Log in to **Cloudflare Dashboard** &rarr; Select `tikum.app`.
2. Go to **Email Routing** (under the domain menu).
3. Click **Enable Email Routing**. Cloudflare will automatically display the required records:
   - **MX Records**:
     - `route1.mx.cloudflare.net`
     - `route2.mx.cloudflare.net`
     - `route3.mx.cloudflare.net`
   - **SPF TXT Record**:
     - Name: `tikum.app`
     - Value: `v=spf1 include:_spf.mx.cloudflare.net ~all`
4. Go to **Destination Addresses** &rarr; Add `agunsux@gmail.com`.
   - Open Gmail, find the verification email from Cloudflare, and click the confirmation link.
5. Go to **Routing Rules** &rarr; Create 4 custom routing rules:
   - `hello@tikum.app` &rarr; `agunsux@gmail.com`
   - `support@tikum.app` &rarr; `agunsux@gmail.com`
   - `admin@tikum.app` &rarr; `agunsux@gmail.com`
   - `pic@tikum.app` &rarr; `agunsux@gmail.com`

---

## 3. Outbound: Resend Free Configuration

### DNS Responsibility
Resend handles outbound transactional email delivery for events triggered by the TIKUM application.

### Important DNS Rule (Do NOT Invent or Guess Records)
- Resend generates domain-specific DNS records inside the Resend dashboard.
- **DKIM**: Typically configured on a selector subdomain, e.g. `resend._domainkey.tikum.app`.
- **Return-Path / Bounce**: Scoped to a dedicated bounce subdomain (e.g. `bounces.tikum.app` or `send.tikum.app`), preventing SPF collision on apex `tikum.app`.
- If Resend instructs an apex record merge, follow the exact dashboard guidance. Never create two separate SPF TXT records for the same hostname.

### Step-by-Step Dashboard Setup
1. Log in to [Resend Dashboard](https://resend.com/domains).
2. Click **Add Domain** &rarr; Enter `tikum.app`.
3. Add the exact DNS records provided by Resend into Cloudflare DNS:
   - **DKIM TXT Record**:
     - Type: `TXT`
     - Host: `resend._domainkey` (or exact name provided)
     - Value: `p=...` (exact public key provided)
   - **Bounce Subdomain Records**:
     - MX / TXT records according to Resend's instructions for the return-path subdomain.
4. Add **DMARC Record**:
   - Type: `TXT`
   - Host: `_dmarc`
   - Value: `v=DMARC1; p=none; rua=mailto:admin@tikum.app`
5. Click **Verify Domain** in Resend.
6. Generate an API Key under **API Keys** &rarr; Set as `RESEND_API_KEY` in Vercel / server production environment variables.

---

## 4. DMARC Alignment Roadmap

TIKUM follows a progressive 3-phase DMARC enforcement policy:

1. **Phase 1: Monitoring (Launch / Current)**
   `v=DMARC1; p=none; rua=mailto:admin@tikum.app`
   *Purpose: Collect aggregate delivery telemetry without impacting deliverability.*
2. **Phase 2: Quarantine (After 14 Days Clean Telemetry)**
   `v=DMARC1; p=quarantine; pct=100; rua=mailto:admin@tikum.app`
   *Purpose: Direct unauthenticated spoofing attempts to spam/junk folders.*
3. **Phase 3: Reject (Strict Anti-Spoofing & Brand Protection)**
   `v=DMARC1; p=reject; rua=mailto:admin@tikum.app`
   *Purpose: Block fraudulent senders pretending to be @tikum.app.*

---

## 5. Sender & Recipient Architecture

| Address | Role | Direction | Handled By |
|---|---|---|---|
| `support@tikum.app` | Customer Support & Transactional Replies | Inbound & Outbound | Cloudflare Routing &rarr; `agunsux@gmail.com` / Resend |
| `hello@tikum.app` | General Inquiries & Public Inbound | Inbound | Cloudflare Routing &rarr; `agunsux@gmail.com` |
| `admin@tikum.app` | Operational Alerts & Infrastructure Health | Inbound & Outbound | Cloudflare Routing &rarr; `agunsux@gmail.com` / Resend |
| `pic@tikum.app` | On-site Field & Venue Coordination | Inbound | Cloudflare Routing &rarr; `agunsux@gmail.com` |
| `TIKUM <support@tikum.app>` | Primary Canonical Transactional Sender | Outbound | Resend API |

---

## 6. Payment & Order Safety Invariants

Email delivery is strictly a **secondary effect**:
- Transaction state transitions (e.g. order reservation, payment verification, escrow lock, settlement, dispute resolution) execute completely and commit to state **before** any email dispatch.
- Email dispatch is completely non-blocking (`.catch()` handled).
- Email failure, rate-limiting, or missing API keys will **NEVER**:
  - Roll back an order
  - Change payment state
  - Block escrow hold or release
  - Block dispute opening or resolution
  - Alter iPaymu integration flow

---

## 7. Free-Tier Safeguards (Rp0 Cost Guarantee)

Resend Free tier limits:
- Max 100 emails/day
- Max 3,000 emails/month

`EmailService` actively tracks usage and enforces these limits internally:
- If either quota threshold is reached, outgoing transactional emails are suppressed and logged as `QUOTA_EXCEEDED` / `QUOTA_SUPPRESSED`.
- The system will **never** silently generate paid overages or bill charges.
