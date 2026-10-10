# TIKUM Route and Surface Localization Coverage Map

**Version:** 1.0.0  
**Status:** FULL COVERAGE VERIFIED  
**Date:** 2026-10-11  

---

## 1. Client-Side HTML Surfaces (17 / 17 Verified)

Every client-side HTML surface includes `<script src="/js/i18n.js">`, an interactive language switcher element (`#langToggle`, `#btnLangToggle`, or `.lang-toggle-btn`), and extensive `[data-i18n]` declarative hooks.

| File | URL Route | Toggle Element | Key Localized Components |
|:---|:---|:---:|:---|
| `public/index.html` | `/` | `#langToggle` | Header navigation, trust banner, search bar, category pills, city filters, event cards, waitlist CTA, footer |
| `public/login.html` | `/login` | `#langToggle` | Form labels, placeholder text, remember me, forgot password link, sign in button, error notifications |
| `public/signup.html` | `/signup` | `#langToggle` | Name, email, phone, password fields, terms acceptance, create account CTA, validation errors |
| `public/account.html` | `/account` | `#langToggle` | Profile summary, KYC verification status badge, active orders, listings history, logout |
| `public/admin.html` | `/admin` | `#langToggle` | KPI metrics, sidebar navigation, ledger reconciliation table, PIC dispatch status, disputes list, live status tags via `translateStatus()` |
| `public/admin-login.html`| `/admin/login` | `#langToggle` | Admin authentication form, security disclaimers, credentials error messages |
| `public/baton.html` | `/baton` | `#langToggle` | React SPA header, hero proposition, 3-stage escrow protocol cards, live transaction tracer, event grid |
| `public/contact.html` | `/contact` | `#langToggle` | Inquiry form fields, official contact channels, office location, submission feedback |
| `public/create.html` | `/create` | `#langToggle` | Listing creation wizard, event picker, seat/category details, pricing input, proof upload |
| `public/faq.html` | `/faq` | `#langToggle` | Help center categories, accordion questions/answers, support links |
| `public/hero.html` | `/hero` | `#langToggle` | Hero feature banner, trust highlights, discover events button |
| `public/offers.html` | `/offers` | `#langToggle` | Offer negotiation dashboard, incoming/outgoing bids, counter-offer forms, status indicators |
| `public/pay.html` | `/pay/:id` | `#langToggle` | Payment summary, VA/QRIS instructions, countdown timer, escrow lock reassurance |
| `public/privacy.html` | `/privacy` | `#langToggle` | Privacy policy compliant with Indonesian UU PDP, data handling terms |
| `public/terms.html` | `/terms` | `#langToggle` | Marketplace terms of service, user rights, prohibited actions |
| `public/refund-policy.html`| `/refund-policy`| `#langToggle`| 100% Escrow refund policy for cancelled events or gate turnstile rejections |
| `public/track.html` | `/track/:id` | `#langToggle` | Real-time order progress timeline, challenge codes, PIC contact badge, dispute reporting button |

---

## 2. Server-Rendered SSR Routers & Templates

Server-rendered routes dynamically serve pre-rendered HTML while injecting `/js/i18n.js` and language switcher controls for hydration.

| Router / Template File | Routes Handled | Switcher Element | Localized Elements |
|:---|:---|:---:|:---|
| `src/discovery/EventSEOService.js` | `/events/:slug` | `#btnLangToggle` | Header navigation, breadcrumbs (`Beranda > Event > City`), ticket availability notice, related events, footer |
| `src/discovery/discoveryRouter.js` | `/events`, `/events/city/:city`, `/events/category/:cat` | `#btnLangToggle` | Header navigation, filter rails, city headers, search feedback |
| `src/discovery/entityRouter.js` | `/promoters/:slug`, `/venues/:slug` | `#btnLangToggle` | Header navigation, verified promoter badges, venue details, associated events list |
| `src/trust/trustPagesRouter.js` | `/trust`, `/trust/anti-scam`, `/trust/escrow` | `#btnLangToggle` | Header navigation, escrow vault mechanism details, turnstile assistance workflow |
| `src/content/blogRouter.js` | `/blog`, `/blog/:slug` | `#btnLangToggle` | Header navigation, article headers, author information, back to blog links |
| `src/config/businessProfile.js` | Shared SSR `renderFooterHtml()` | `[data-i18n]` | Brand description, operational office address, official emails, legal links |

---

## 3. Transactional Email Templates (`src/services/emailTemplates.js`)

All transactional email templates evaluate `locale === 'en' || lang === 'en'` to generate completely localized subject lines, HTML bodies, and plain-text fallbacks with locale-appropriate brand footers.

| Template Key | Indonesian Subject | English Subject |
|:---|:---|:---|
| `ACCOUNT_WELCOME` | Selamat Datang di TIKUM, {name}! | Welcome to TIKUM, {name}! |
| `ACCOUNT_VERIFICATION`| Kode Verifikasi Akun TIKUM | TIKUM Account Verification Code |
| `PASSWORD_RESET` | Permintaan Reset Password Akun TIKUM | TIKUM Account Password Reset Request |
| `ORDER_CREATED` | Pesanan Dibuat #{id} — Menunggu Pembayaran | Order Created #{id} — Awaiting Payment |
| `ORDER_STATUS_CHANGED`| Update Status Pesanan #{id}: {status} | Order Status Update #{id}: {status} |
| `OFFER_RECEIVED` | Tawaran Baru Diterima: Rp {price} | New Offer Received: Rp {price} |
| `OFFER_ACCEPTED` | Tawaran Anda Diterima! Pesanan #{id} | Your Offer was Accepted! Order #{id} |
| `OFFER_REJECTED` | Pemberitahuan Tawaran Tiket | Ticket Offer Update |
| `COUNTER_OFFER` | Tawaran Balik dari Penjual: Rp {price} | Counter Offer from Seller: Rp {price} |
| `PAYMENT_INITIATED` | Instruksi Pembayaran Pesanan #{id} | Payment Instructions for Order #{id} |
| `PAYMENT_SUCCESSFUL` | Pembayaran Diterima #{id} — Dana Terkunci di Escrow | Payment Received #{id} — Funds Locked in Escrow |
| `PAYMENT_FAILED` | Pembayaran Gagal / Kedaluwarsa #{id} | Payment Failed / Expired #{id} |
| `SELLER_TICKET_SOLD` | Tiket Terjual! Siapkan Penyerahan #{id} | Ticket Sold! Prepare Handover #{id} |
| `BUYER_ENTRY_READY` | Panduan Masuk Venue #{id} — PIC TIKUM Standby | Venue Entry Guide #{id} — TIKUM PIC Standby |
| `DISPUTE_OPENED` | Pemberitahuan Sengketa #{id} — Investigasi Dimulai | Dispute Notice #{id} — Investigation Started |
| `DISPUTE_STATUS_CHANGED`| Keputusan Sengketa #{id}: {outcome} | Dispute Decision #{id}: {outcome} |
| `TICKET_DELIVERY` | Tiket Anda Siap Diunduh #{id} — {event} | Your Ticket is Ready for Download #{id} — {event} |
| `DELIVERY_CONFIRMATION`| Konfirmasi Penyerahan Tiket Selesai #{id} | Ticket Handover Confirmed #{id} |
| `EVENT_CANCELLATION` | Pemberitahuan Pembatalan Event: {event} | Event Cancellation Notice: {event} |
| `REFUND_CONFIRMATION` | Pengembalian Dana (Refund) Berhasil #{id} | Refund Successful #{id} |
| `CONTACT_CONFIRMATION_RECEIPT`| Konfirmasi Penerimaan Pesan: {subject} | Inquiry Received: {subject} |

---

## 4. URL Parameter and Routing Behavior

- **Explicit URL Parameter:** Navigating to `https://tikum.app/?lang=en` or `https://tikum.app/events/lany-jakarta?lang=en` automatically sets language to English and saves `'en'` to `localStorage`.
- **Query Parameter Override:** If a user with `localStorage['tikum_lang'] = 'id'` visits a link shared with `?lang=en`, the URL parameter takes immediate precedence.
- **Unsupported Locale Fallback:** Querying unsupported locales (e.g. `?lang=de`) falls back safely to default Indonesian (`'id'`).
