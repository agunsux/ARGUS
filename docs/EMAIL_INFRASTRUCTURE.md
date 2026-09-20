# TIKUM — Professional Email Infrastructure Runbook
**Zero-Cost First (Rp0/month) &bull; Cloudflare Email Routing + Resend Free**
Domain: `https://tikum.app`
Parent Entity: `SHINERVA HQ`

---

## 1. System Readiness & Scope Boundary Declaration

> [!IMPORTANT]
> **Email Infrastructure Code**: Production-ready pending external DNS configuration and provider credential activation.
>
> **TIKUM Marketplace Overall**: **NOT YET PRODUCTION-READY** for real financial transactions. Real transactions require completing durable database persistence (PostgreSQL / Cloud SQL migration from in-memory fixtures), distributed locking for escrow/gate validation, and durable idempotency mechanisms.
>
> **Scope Lock**: The email infrastructure layer does NOT alter marketplace financial state machines, ticket lifecycle rules, or escrow settlement flows. Email dispatch is strictly an isolated secondary effect.

---

## 2. High-Level Architecture & Boundary Separation

```
INBOUND ROUTING (Zero-Cost Inbound Custom Domain):
Customer / External Sender / Admin
          │
          ▼
[admin | support | hello | no-reply]@tikum.app
          │
          ▼
Cloudflare Email Routing (Apex MX at tikum.app)
          │
          ▼
Configured Destination Inbox (e.g. agunsux@gmail.com)

OUTBOUND TRANSACTIONAL (Zero-Cost Outbound Delivery):
Application Layer (Auth / Order / Payment / Dispute / Alert)
          │
          ▼
EmailService (Singleton Abstraction, Idempotency Deduplication, Quota Guard)
          │
          ▼
EmailProvider Resolution Matrix:
  - NODE_ENV === 'test'                      ──▶ TestEmailProvider (in-memory, network isolated)
  - NODE_ENV === 'development' (no key)      ──▶ TestEmailProvider (sandbox mode)
  - NODE_ENV === 'production' (no key)       ──▶ FAIL CLOSED (UnconfiguredEmailProvider, status: NOT_CONFIGURED)
  - NODE_ENV === 'production' (with key)     ──▶ ResendEmailProvider (HTTPS POST https://api.resend.com/emails)
          │
          ▼
Resend Free API (3,000 emails/mo, 100 emails/day)
          │
          ▼
DKIM (resend._domainkey) + SPF (bounces/return-path) + DMARC Alignment
          │
          ▼
Recipient Inbox
```

---

## 3. Provider Resolution & Fail-Closed Invariant

To prevent catastrophic silent delivery simulation in production (e.g., users assuming password reset or ticket delivery emails were sent when credentials were forgotten):

| Environment | `RESEND_API_KEY` | Resolved Provider | Delivery Behavior | Result Status |
|---|---|---|---|---|
| `test` | Any / None | `TestEmailProvider` | In-memory array capture; ZERO network calls | `MOCKED` (success: true) |
| `development` | Absent | `TestEmailProvider` | In-memory sandbox; ZERO network calls | `MOCKED` (success: true) |
| `development` | Present | `ResendEmailProvider` | Live delivery to recipient via Resend API | `DELIVERED` (success: true) |
| `production` | **Absent** | **`UnconfiguredEmailProvider`** | **FAIL CLOSED**. Never instantiates `TestEmailProvider`. Never simulates delivery. | **`NOT_CONFIGURED`** (success: false, code: `EMAIL_PROVIDER_NOT_CONFIGURED`) |
| `production` | **Present** | **`ResendEmailProvider`** | Live delivery via Resend API (`api.resend.com`) | `DELIVERED` (success: true) |

---

## 4. Inbound: Cloudflare Email Routing Configuration (Operator-Pending)

### Status: PENDING OPERATOR ACTIVATION IN CLOUDFLARE DASHBOARD

### Responsibilities
- Receives inbound emails sent to `@tikum.app` addresses.
- Forwards them directly to the configured operator inbox without requiring paid mailbox hosting (e.g. Google Workspace / Microsoft 365).

### Authoritative Nameservers
- `pedro.ns.cloudflare.com`
- `jamie.ns.cloudflare.com`

*Apex Record*: `A tikum.app -> 76.76.21.21` (Vercel Production DNS — **DO NOT TOUCH**).

### Required Cloudflare Email Routing Rules
Configure in Cloudflare Dashboard &rarr; **Email Routing** &rarr; **Routing Rules**:

| Inbound Custom Address | Action | Destination Address | Purpose |
|---|---|---|---|
| `admin@tikum.app` | Forward | `<operator_admin_email>` | Admin alerts, password resets, operational notices |
| `support@tikum.app` | Forward | `<operator_support_email>` | Customer service inquiries, dispute communications |
| `hello@tikum.app` | Forward | `<operator_business_email>` | General business inquiries |
| `no-reply@tikum.app` | Drop / Forward | Drop (or blackhole inbox) | Inbound blackhole for automated notices |

### Cloudflare MX Baseline
When Email Routing is enabled, Cloudflare automatically prompts to add authoritative apex MX records:
- `route1.mx.cloudflare.net` (Priority 93)
- `route2.mx.cloudflare.net` (Priority 21)
- `route3.mx.cloudflare.net` (Priority 9)
- SPF TXT: `v=spf1 include:_spf.mx.cloudflare.net ~all`

> [!WARNING]
> Do NOT point apex MX records to Resend. Resend uses a dedicated subdomain return-path (e.g., `send.tikum.app`), which completely avoids MX collisions on `tikum.app`.

---

## 5. Outbound: Resend DNS Records (Operator-Pending)

### Status: PENDING OPERATOR SETUP IN RESEND & CLOUDFLARE DASHBOARD

> [!CAUTION]
> **Do NOT invent or hardcode SPF/DKIM records.** The exact DKIM selector, public key, and return-path subdomain MUST be copied directly from the Resend Dashboard after adding the domain `tikum.app`.

### Operator Setup Procedure:
1. Log in to [Resend Dashboard](https://resend.com/domains).
2. Click **Add Domain** &rarr; Input `tikum.app` &rarr; Select Region (`ap-southeast-1` or `us-east-1`).
3. Resend generates specific DNS records for your domain. **Copy the exact values provided by Resend into Cloudflare DNS**:

| Record Type | Name / Host | Expected Value Source | Proxy Status |
|---|---|---|---|
| **TXT (DKIM)** | `resend._domainkey` (or selector from Resend) | `p=<EXACT_PUBLIC_KEY_FROM_RESEND_DASHBOARD>` | DNS Only (Grey Cloud) |
| **MX (Return-Path)** | `send` or `bounces` (subdomain from Resend) | Exact feedback SMTP hostname provided by Resend | DNS Only (Grey Cloud) |
| **TXT (SPF)** | `send` or `bounces` (subdomain from Resend) | `v=spf1 include:amazonses.com ~all` (as specified by Resend) | DNS Only (Grey Cloud) |
| **TXT (DMARC)** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@tikum.app; pct=100; sp=none` | DNS Only (Grey Cloud) |

4. Click **Verify Domain** in Resend. Wait for status `Verified`.
5. Under **API Keys**, create a restricted API key:
   - Name: `tikum-prod-outbound`
   - Permission: `Sending access` (restricted to domain `tikum.app`)
6. Store key as `RESEND_API_KEY` in production environment secrets.

---

## 6. Environment Variables Inventory

| Variable | Recommended Production Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enforces fail-closed provider selection |
| `ADMIN_EMAIL` | `admin@tikum.app` | Canonical admin identity (NOT a credential) |
| `ADMIN_PASSWORD` | `<secure-16+-character-secret>` | Hashed admin credential seed |
| `EMAIL_FROM` | `TIKUM <no-reply@tikum.app>` | Default transactional sender identity |
| `EMAIL_REPLY_TO` | `support@tikum.app` | Default reply-to for transactional emails |
| `EMAIL_ADMIN_FROM` | `TIKUM Admin <admin@tikum.app>` | Sender identity for administrative & security notices |
| `RESEND_API_KEY` | `re_...` (From Resend Dashboard) | Server-side only Resend API token |

---

## 7. Security & Isolation Controls

1. **Fail-Closed Production Guard**: If `RESEND_API_KEY` is missing in `NODE_ENV=production`, `emailService` returns `{ success: false, status: 'NOT_CONFIGURED', code: 'EMAIL_PROVIDER_NOT_CONFIGURED' }`. Never silently simulates delivery.
2. **Server-Side Secret Isolation**: `RESEND_API_KEY` is strictly server-side. It is never exposed in browser bundles, HTML responses, public API endpoints, or logs.
3. **From Address Anti-Spoofing**: Callers cannot specify arbitrary `From` addresses. Senders are strictly validated and clamped to authorized `@tikum.app` identities.
4. **CRLF Header Injection Protection**: All dynamic recipient emails, subjects, and headers are stripped of `\r` and `\n` characters before dispatch.
5. **HTML Template Escaping**: User-supplied values (e.g. names, notes, event titles) are escaped using `escapeHtml` to prevent HTML/XSS injection.
6. **Secondary Effect Guarantee**: Email sending is strictly a secondary effect. Network timeout or missing API keys NEVER rolls back or mutates an order, payment, or escrow state.
7. **Persistence Boundary (`@PERSISTENCE_BOUNDARY`)**: Structured email logs in `state.email_logs` are currently in-memory. They must be migrated to a durable PostgreSQL / Cloud SQL ledger before enterprise scale.

---

## 8. Controlled Production Smoke-Test Procedure

Only after DNS verification is complete in Resend and `RESEND_API_KEY` is set in production:

1. Send **one controlled smoke-test email** to the operator inbox (`admin@tikum.app`) via authenticated admin test endpoint:
   ```bash
   curl -X POST https://tikum.app/api/mvp/admin/email-test \
     -H "Content-Type: application/json" \
     -H "Cookie: session_token=<admin_session>" \
     -d '{"officerId":"admin-1","recipient":"admin@tikum.app"}'
   ```
2. Inspect inbox headers:
   - `From: TIKUM <support@tikum.app>` or `TIKUM <no-reply@tikum.app>`
   - `Reply-To: support@tikum.app`
   - Authentication-Results: `dkim=pass`, `spf=pass`, `dmarc=pass`.
3. Do NOT claim live email deliverability until this live test passes with verified headers.
