# TIKUM — Production Email Infrastructure Specification & Runbook
**Official Email Identity: `@tikum.app` &bull; Zero-Cost Architecture (Rp0/month)**  
*Parent Entity: SHINERVA HQ &bull; Domain & DNS Host: Cloudflare DNS*

---

## 1. Executive Summary & Core Invariant

Tikum requires a production-grade, coherent email system built around `@tikum.app` as its official institutional identity. A critical architectural distinction is enforced throughout:

> [!IMPORTANT]
> **API Sending vs. Inbound Routing vs. Real Human Inbox**
> - **Resend**: Transactional and application delivery engine (API outbound & webhook inbound relay). Resend does *not* provide an IMAP/POP3 webmail mailbox for humans.
> - **Cloudflare Email Routing**: Inbound DNS MX routing & forwarding engine. Forwarding alone is *not* a mailbox.
> - **Real Human Inbox**: Operational surface where support staff can open incoming emails, view threads, and send direct replies as `@tikum.app`.
> - **No Gmail Dependency**: Gmail is strictly prohibited as the primary customer-facing email infrastructure.

---

## 2. System Architecture

```
                       TIKUM.APP DOMAIN IDENTITY
                                   │
                           Cloudflare DNS
               (SPF, DKIM, DMARC, MX, DNSSEC Security)
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
OUTBOUND APPLICATION DELIVERY                      INBOUND CORRESPONDENCE
         │                                                   │
  EmailService (Node.js)                       ┌─────────────┴─────────────┐
(Quota Guard: 100/day, 3,000/mo)               │                           │
         │                                     ▼                           ▼
  Resend API (Free Tier: Rp0)        Public /contact Form         Resend Inbound Webhook
(DKIM aligned, return-path SPF)                │                  (or Cloudflare Routing)
         │                                     ▼                           │
         ▼                               /api/contact                      ▼
   Customer Inbox                              │                  /api/email/webhook
                                               └─────────────┬─────────────┘
                                                             │
                                                             ▼
                                                    state.inbox_messages
                                                    (Persistent DB Table)
                                                             │
                                                             ▼
                                                 TIKUM ADMIN HUMAN INBOX
                                                   (/admin?tab=inbox)
                                                             │
                                                       Staff Replies
                                                             │
                                                             ▼
                                                    EmailService.send()
                                                 (From: support@tikum.app)
```

---

## 3. Operational Addresses

Only the minimum, strictly useful set of institutional email addresses is provisioned:

| Address | Purpose | Display Identity | Default Reply-To |
|---|---|---|---|
| `support@tikum.app` | Customer support, ticket inquiries, disputes, gate help | `TIKUM Support <support@tikum.app>` | `support@tikum.app` (or user for inquiries) |
| `hello@tikum.app` | General inquiries, promoter partnerships | `TIKUM <hello@tikum.app>` | `hello@tikum.app` |
| `admin@tikum.app` | System alerts, admin password resets, security notifications | `TIKUM Operations <admin@tikum.app>` | `admin@tikum.app` |

---

## 4. Provider Comparison & Cost Evaluation

| Provider | Purpose | Monthly Cost | Quota (Send/Receive) | Mailbox Interface | IMAP/SMTP | Limitations |
|---|---|---|---|---|---|---|
| **Resend (Free)** | Transactional Outbound & Webhook Inbound | **Rp0** ($0) | 3,000 emails/mo, 100/day | API / Inbound Webhook only (No Webmail) | Outbound SMTP relay; No IMAP/POP3 | Shared daily quota across send & receive |
| **Cloudflare Email Routing** | Inbound MX routing | **Rp0** ($0) | Unlimited custom addresses | Forwarding only (No Webmail) | None | Forwarding only; cannot reply directly from personal destination without complex alias setup |
| **Tikum Admin Inbox (`/admin/inbox`)** | **Primary Human Inbox** | **Rp0** ($0) | Uses existing database & Resend | **Full Web UI in Admin Console** | Direct application API dispatch | Admin authenticated; internal support team use |
| **Zoho Mail (Forever Free)** | Alternative Standalone Webmail | **Rp0** ($0) | 5 users, 5GB/user, 50 sent/day | **Real Webmail (`mail.zoho.com`)** & Mobile Apps | Webmail & official apps only (no 3rd party IMAP) | Requires MX to point to Zoho instead of Cloudflare/Resend |

### Architectural Decision:
- **Primary Operational Solution (Rp0/month)**: **Resend Free + Tikum Admin Inbox (`/admin?tab=inbox`) + Cloudflare DNS**.
  - All customer inquiries from `/contact` and inbound emails automatically flow into the database.
  - Tikum staff can open `/admin?tab=inbox`, read messages, toggle read/unread, archive, and send official replies using `@tikum.app` via Resend API.
- **Standalone Webmail Alternative (Rp0/month)**: **Zoho Mail Forever Free**. If staff prefer an external desktop/mobile webmail portal outside the Tikum Admin Console, Zoho Mail can host `@tikum.app` with webmail at `mail.zoho.com`.

---

## 5. Domain Authentication & DNS Configuration (Cloudflare DNS)

All DNS records must be configured in Cloudflare Dashboard (`tikum.app`) with **Proxy Status: DNS Only (Grey Cloud)** for mail records.

### A. SPF (Sender Policy Framework)
> [!CAUTION]
> **Single Authoritative SPF Record**: Never create multiple TXT records starting with `v=spf1`. Multiple SPF records cause permanent authentication failure (PermError).

- **Host**: `@` (`tikum.app`)
- **Type**: `TXT`
- **Primary Configuration (Cloudflare Routing + Resend)**:
  ```txt
  v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all
  ```
- *(If using Zoho Mail instead of Cloudflare Routing)*:
  ```txt
  v=spf1 include:zoho.com include:amazonses.com ~all
  ```

### B. DKIM (DomainKeys Identified Mail)
- **Host**: `resend._domainkey` (or exact selector from Resend Dashboard)
- **Type**: `TXT`
- **Value**: Generated public key from Resend Dashboard (`k=rsa; p=...`)
- *(If using Zoho Mail for external webmail)*: Add second selector `zoho._domainkey` with Zoho's public key. Multiple DKIM records with different selectors are valid and do not conflict.

### C. DMARC (Domain-based Message Authentication, Reporting & Conformance)
- **Host**: `_dmarc` (`_dmarc.tikum.app`)
- **Type**: `TXT`
- **Value**:
  ```txt
  v=DMARC1; p=none; rua=mailto:admin@tikum.app; pct=100; sp=none
  ```
  *(Starts safely at `p=none` for telemetry observation before moving to `p=quarantine` or `p=reject`).*

### D. MX Records (Incoming Mail Routing)
Choose exactly ONE incoming MX destination to prevent delivery conflicts:

#### Option 1: Cloudflare Email Routing (Default Zero-Cost Routing)
- Host: `@` | Priority: `93` | Value: `route1.mx.cloudflare.net`
- Host: `@` | Priority: `21` | Value: `route2.mx.cloudflare.net`
- Host: `@` | Priority: `9`  | Value: `route3.mx.cloudflare.net`

#### Option 2: Zoho Mail (Standalone Webmail Hosting)
- Host: `@` | Priority: `10` | Value: `mx.zoho.com`
- Host: `@` | Priority: `20` | Value: `mx2.zoho.com`
- Host: `@` | Priority: `50` | Value: `mx3.zoho.com`

---

## 6. From & Reply-To Policy

Strict deliverability rules are hardcoded in `src/services/emailService.js` and `src/api/emailRouter.js`:

1. **Transactional Email**:
   - `FROM`: `TIKUM <support@tikum.app>`
   - `REPLY-TO`: `support@tikum.app`
2. **Administrative / Security Alerts**:
   - `FROM`: `TIKUM Operations <admin@tikum.app>`
   - `REPLY-TO`: `admin@tikum.app`
3. **Contact / Support Form Submission (`/contact`)**:
   - `FROM`: `TIKUM Support <support@tikum.app>` (Authoritative system identity)
   - `REPLY-TO`: User's validated email address (e.g. `budi@example.com`)
   - *CRITICAL*: The user's email is **never** injected into `FROM`. This guarantees SPF and DKIM signatures remain valid and prevents email spoofing.
4. **Admin Inbox Reply**:
   - `FROM`: `TIKUM Support <support@tikum.app>`
   - `REPLY-TO`: `support@tikum.app`
   - Headers: Includes `In-Reply-To` and `References` tracking the original message ID.

---

## 7. Webhook & Inbound Configuration

The endpoint `POST /api/email/webhook` handles Resend webhook notifications:

1. **Inbound Email (`email.received`)**:
   - Parses `from`, `to`, `subject`, `text`, `html`, `attachments`.
   - Stores the correspondence into `state.inbox_messages` with status `UNREAD`.
   - Message immediately becomes visible in `/admin?tab=inbox`.
2. **Delivery Status (`email.delivered`)**:
   - Updates `state.email_logs` status to `DELIVERED` with timestamp.
3. **Bounces & Complaints (`email.bounced`, `email.complained`)**:
   - Updates `state.email_logs` to `BOUNCED` or `COMPLAINED`.
   - Records an operational audit trail via `recordAuditLog`.
4. **Security Verification**:
   - Supports `EMAIL_WEBHOOK_SECRET` for HMAC-SHA256 signature verification.

---

## 8. Environment Variables

Store in production deployment environment (Vercel / Cloud Run / VPS). **Never commit secrets to git.**

```bash
# Server Runtime
NODE_ENV=production

# Transactional Email (Resend API)
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM="TIKUM <support@tikum.app>"
EMAIL_REPLY_TO=support@tikum.app
EMAIL_SUPPORT=support@tikum.app
EMAIL_ADMIN=admin@tikum.app
EMAIL_WEBHOOK_SECRET=your_webhook_signing_secret_here

# Admin Authentication
ADMIN_EMAIL=admin@tikum.app
ADMIN_PASSWORD=your_secure_admin_password
```

---

## 9. Testing & Verification Procedure

The repository provides automated test suites covering 100% of the email requirements:

```bash
# 1. Core 13-point email service tests (idempotency, quota guards, fail-closed)
node test_email_service.js

# 2. Comprehensive 17-point email infrastructure tests (templates, headers, anti-spoofing)
node test_email_infrastructure.js

# 3. 12-point contact form, inbound webhook & admin human inbox tests
node test_contact_form_and_inbox.js
```

### Manual Verification Checklist (Post-DNS Activation)
1. **Send Test**: Trigger test ping from Admin Control Center (`POST /api/mvp/admin/email-test`) &rarr; Check email headers for `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
2. **Receive Test**: Submit inquiry on `https://tikum.app/contact` &rarr; Verify ticket receipt arrives at visitor email and notification arrives at `support@tikum.app`.
3. **Inbox Test**: Open `https://tikum.app/admin?tab=inbox` &rarr; Verify message appears in list &rarr; Open detail &rarr; Type reply &rarr; Send &rarr; Verify visitor receives reply from `support@tikum.app`.

---

## 10. Cost Breakdown & Budget Guarantee

| Service Component | Provider | Quota / Tier | Monthly Cost (IDR) | Monthly Cost (USD) |
|---|---|---|---|---|
| **Sending Delivery** | Resend | 3,000 emails/mo, 100/day | Rp 0 | $0.00 |
| **Inbound Routing** | Cloudflare Email Routing | Unlimited incoming routes | Rp 0 | $0.00 |
| **Operational Inbox** | Tikum Admin Human Inbox | Internal DB + Resend API | Rp 0 | $0.00 |
| **DNS Management** | Cloudflare Free DNS | Enterprise-grade anycast DNS | Rp 0 | $0.00 |
| **TOTAL** | | | **Rp 0 / bulan** | **$0.00 / mo** |

*Target achieved: 100% production-ready at Rp0/month.*
