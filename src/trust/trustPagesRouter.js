/**
 * TIKUM Trust Authority Pages Router
 * Delivers authoritative SSR trust infrastructure pages:
 * - /how-it-works
 * - /buyer-protection
 * - /seller-protection
 * - /ticket-verification
 * - /escrow
 * - /disputes (and /dispute-resolution)
 *
 * Grounding Invariant:
 * Strictly documents real TIKUM escrow, gate verification, and dispute resolution mechanisms.
 * Never invents nonexistent capabilities. Truthful copy without absolute claims.
 */

const express = require('express');
const router = express.Router();
const { TechnicalSEOService } = require('../seo/TechnicalSEOService');
const { StructuredDataFactory } = require('../seo/StructuredDataFactory');
const { renderFooterHtml } = require('../config/businessProfile');

function renderTrustNavHeader(activePath = '', lang = 'id') {
  const isEn = lang === 'en';
  return `
  <header class="site-header">
    <div class="header-container">
      <a href="/" class="brand">
        <div class="brand-badge"><i class="fa-solid fa-shield-halved"></i></div>
        <div>
          <div class="brand-title">Tikum</div>
          <span class="brand-subtitle" data-i18n="brand.subtitle">${isEn ? 'Verified Event Ticket Marketplace' : 'Pasar Tiket Event Terverifikasi'}</span>
        </div>
      </a>
      <nav class="main-nav">
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> <span data-i18n="nav.events">${isEn ? 'Events' : 'Katalog Event'}</span></a>
        <a href="/blog" class="nav-link ${activePath === '/blog' ? 'active' : ''}"><i class="fa-solid fa-newspaper"></i> <span data-i18n="nav.blog">Blog</span></a>
        <a href="/how-it-works" class="nav-link ${activePath === '/how-it-works' ? 'active' : ''}"><i class="fa-solid fa-circle-nodes"></i> <span data-i18n="footer.how">${isEn ? 'How It Works' : 'Cara Kerja'}</span></a>
        <a href="/buyer-protection" class="nav-link ${activePath === '/buyer-protection' ? 'active' : ''}"><i class="fa-solid fa-shield-heart"></i> <span data-i18n="footer.buyerProt">${isEn ? 'Buyer Protection' : 'Perlindungan Pembeli'}</span></a>
        <a href="/ticket-verification" class="nav-link ${activePath === '/ticket-verification' ? 'active' : ''}"><i class="fa-solid fa-qrcode"></i> <span data-i18n="footer.verifInfo">${isEn ? 'Ticket Verification' : 'Verifikasi Tiket'}</span></a>
        <a href="/escrow" class="nav-link ${activePath === '/escrow' ? 'active' : ''}"><i class="fa-solid fa-lock"></i> <span data-i18n="escrow.title">${isEn ? 'Escrow Account' : 'Rekening Escrow'}</span></a>
        <a href="/disputes" class="nav-link ${activePath === '/disputes' ? 'active' : ''}"><i class="fa-solid fa-scale-balanced"></i> <span data-i18n="disputes.title">${isEn ? 'Dispute Resolution' : 'Resolusi Sengketa'}</span></a>
        <button id="btnLangToggle" class="btn btn-secondary btn-sm" onclick="window.TikumI18n ? window.TikumI18n.toggleLang() : null" style="padding: 4px 10px; font-size: 11px; font-weight: 700; margin-left: 8px;">${lang.toUpperCase()}</button>
      </nav>
    </div>
  </header>`;
}

function renderTrustLayout({ lang = 'id', title, description, canonicalPath, h1, subtitle, breadcrumbs, faqPairs = [], contentHtml }) {
  const isEn = lang === 'en';
  const breadcrumbJsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);
  const faqJsonLd = faqPairs.length > 0 ? StructuredDataFactory.createFAQSchema(faqPairs) : null;
  const jsonLd = faqJsonLd ? [breadcrumbJsonLd, faqJsonLd] : breadcrumbJsonLd;

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title,
    description,
    canonicalPath,
    jsonLd
  });

  const faqSectionHtml = faqPairs.length > 0 ? `
    <section style="margin-top:40px; background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:32px;">
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:20px;"><i class="fa-solid fa-circle-question" style="color:#38bdf8;"></i> ${isEn ? 'Frequently Asked Questions (FAQ)' : 'Pertanyaan yang Sering Diajukan (FAQ)'}</h2>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${faqPairs.map(pair => `
          <div style="background:#0f172a; border:1px solid #1e293b; border-radius:10px; padding:20px;">
            <h3 style="font-size:16px; font-weight:700; color:#f8fafc; margin:0 0 8px;">${pair.q}</h3>
            <p style="font-size:14px; color:#cbd5e1; line-height:1.6; margin:0;">${pair.a}</p>
          </div>
        `).join('')}
      </div>
    </section>
  ` : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMeta}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${renderTrustNavHeader(canonicalPath, lang)}
  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:920px;">
    <nav style="font-size:13px; color:#64748b; margin-bottom:20px;">
      <a href="/" style="color:#94a3b8; text-decoration:none;" data-i18n="nav.home">${isEn ? 'Home' : 'Beranda'}</a> &rsaquo;
      <span style="color:#f8fafc;">${breadcrumbs[breadcrumbs.length - 1].name}</span>
    </nav>

    <div style="background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:36px; margin-bottom:30px;">
      <div class="hero-pill" data-i18n="trust.badge"><i class="fa-solid fa-shield-halved"></i> TRUST &amp; SAFETY INFRASTRUCTURE</div>
      <h1 style="font-size:32px; font-weight:800; color:#f8fafc; margin:14px 0 8px;">${h1}</h1>
      <p style="color:#94a3b8; font-size:16px; line-height:1.6;">${subtitle}</p>
    </div>

    ${contentHtml}
    ${faqSectionHtml}

    <div style="margin-top:40px; background:#0f172a; border:1px solid #0284c7; border-radius:12px; padding:28px; text-align:center;">
      <h3 style="font-size:20px; font-weight:800; color:#f8fafc; margin-bottom:8px;" data-i18n="trust.readyHeading">${isEn ? 'Ready to Explore Verified Tickets?' : 'Siap Menjelajahi Tiket Terverifikasi?'}</h3>
      <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;" data-i18n="trust.readySubtitle">${isEn ? 'Find your favorite event tickets or sell safely with escrow protection.' : 'Temukan event favorit Anda atau jual tiket secara aman tanpa khawatir penipuan.'}</p>
      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <a href="/events" class="btn btn-primary"><i class="fa-solid fa-calendar-days"></i> <span data-i18n="events.title">${isEn ? 'Browse Event Catalog' : 'Lihat Katalog Event'}</span></a>
        <a href="/create" class="btn btn-secondary"><i class="fa-solid fa-plus-circle"></i> <span data-i18n="nav.sellTicket">${isEn ? 'Sell My Ticket' : 'Jual Tiket Saya'}</span></a>
      </div>
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;
}

// -------------------------------------------------------------
// 1. /how-it-works
// -------------------------------------------------------------
router.get('/how-it-works', (req, res) => {
  const isEn = (req.query.lang || '').toLowerCase() === 'en';
  const lang = isEn ? 'en' : 'id';

  const contentHtml = isEn ? `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">1</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Sellers List Verified Tickets</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Sellers upload genuine e-voucher proofs, unique barcode identifiers, and seat categories. Tikum validates data structure and prevents duplicate ticket submissions.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">2</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Buyers Pay via Escrow Account</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Buyer funds are held safely in Tikum internal escrow holding. Money is <strong>not released directly</strong> to the seller until the buyer successfully enters the event venue.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">3</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Ticket Handover &amp; Venue Gate Verification (Event PIC)</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Buyers receive e-voucher documents or exchange physical wristbands. Tikum Event PIC officers are present at designated venues to guide gate entry when issues arise.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#10b981; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">4</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Transaction Settlement &amp; Seller Payout</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Following confirmed turnstile entry or expiration of the verification window with no dispute, escrow funds are automatically disbursed to the seller.
            </p>
          </div>
        </div>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">1</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Penjual Mendaftarkan Tiket Terverifikasi</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Penjual mengunggah bukti e-voucher asli, nomor barcode unik, dan kategori tempat duduk. Sistem Tikum memvalidasi format data dan mencegah duplikasi tiket yang sama didaftarkan berkali-kali.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">2</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Pembeli Membayar Melalui Rekening Escrow</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Dana pembeli ditahan secara aman di rekening penampungan internal (escrow) Tikum. Uang <strong>tidak langsung dikirim</strong> kepada penjual sampai pembeli berhasil masuk ke venue acara.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">3</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Penyerahan Tiket &amp; Verifikasi Gerbang Venue (Event PIC)</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Pembeli menerima dokumen e-voucher atau melakukan penukaran wristband fisik. Petugas Event PIC Tikum hadir di area venue untuk memandu verifikasi gerbang jika terjadi kendala akses.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#10b981; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">4</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Penyelesaian Transaksi &amp; Pencairan Dana Penjual</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Setelah konfirmasi masuk gerbang atau berakhirnya batas waktu verifikasi tanpa ada sengketa (dispute), dana escrow dicairkan secara otomatis ke rekening penjual.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'Does Tikum sell tickets directly as a promoter?', a: 'No. Tikum is a verified secondary marketplace providing escrow infrastructure and transaction protection between live event fans.' },
    { q: 'When are funds released if I am a seller?', a: 'Funds are disbursed after the buyer is verified through the venue gate or after the post-event dispute window closes without claims.' }
  ] : [
    { q: 'Apakah Tikum menjual tiket langsung sebagai promotor?', a: 'Bukan. Tikum adalah marketplace sekunder terverifikasi yang menyediakan infrastruktur escrow dan perlindungan transaksi antar penggemar acara langsung.' },
    { q: 'Kapan dana saya dicairkan jika saya seorang penjual?', a: 'Dana dicairkan setelah pembeli berhasil terverifikasi masuk ke lokasi acara atau jendela verifikasi berakhir tanpa adanya klaim dispute.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'How Tikum Works — Safe Ticket Transactions with Escrow & Gate Verification | Tikum' : 'Cara Kerja Tikum — Transaksi Tiket Aman dengan Escrow & Verifikasi | Tikum',
    description: isEn ? 'Learn how concert and live event ticket transactions work on Tikum: verified listing, escrow protection, gate verification, and secure settlement.' : 'Pelajari mekanisme transaksi tiket konser dan event di Tikum: mulai dari pendaftaran tiket, pembayaran escrow, verifikasi gerbang venue, hingga pencairan dana aman.',
    canonicalPath: '/how-it-works',
    h1: isEn ? 'How Tikum Protects Your Transactions' : 'Bagaimana Tikum Melindungi Transaksi Anda',
    subtitle: isEn ? 'A concert and live event ticket flow built with neutral escrow hold and physical gate verification.' : 'Alur transaksi tiket konser dan event langsung yang dirancang dengan perlindungan escrow dan verifikasi gerbang.',
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Beranda', url: '/' },
      { name: isEn ? 'How It Works' : 'Cara Kerja', url: '/how-it-works' }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 2. /buyer-protection
// -------------------------------------------------------------
router.get('/buyer-protection', (req, res) => {
  const isEn = (req.query.lang || '').toLowerCase() === 'en';
  const lang = isEn ? 'en' : 'id';

  const contentHtml = isEn ? `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #10b981; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-shield-check"></i> Escrow Refund Guarantee</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Your payment is held in Tikum neutral escrow holding and never released to the seller before successful venue admission. If a ticket is proven invalid or rejected at the gate, your payment is refunded in full under escrow policy.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-barcode"></i> Barcode Format Validation &amp; Anti-Duplication</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Every submitted ticket undergoes hash validation and unique barcode checks to prevent duplicate sales across multiple buyers.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#f59e0b; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-user-shield"></i> On-Site Event PIC Support</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Tikum deploys Event Persons-in-Charge (PIC) at supported major venue gates to assist with physical ticket checks and real-time evidence gathering during disputes.
        </p>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #10b981; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-shield-check"></i> Jaminan Pengembalian Dana Escrow (Escrow Guarantee)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Uang Anda ditahan di rekening penampungan internal Tikum dan tidak diberikan ke penjual sebelum Anda dipastikan dapat masuk ke area konser. Jika tiket palsu atau ditolak di pintu gerbang, dana Anda dikembalikan penuh sesuai ketentuan escrow.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-barcode"></i> Verifikasi Format Barcode &amp; Anti Duplikasi</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Setiap tiket yang didaftarkan melalui proses validasi hash dan nomor barcode unik untuk mencegah satu tiket dijual ke beberapa orang sekaligus.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#f59e0b; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-user-shield"></i> Dukungan Event PIC di Lokasi Venue</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Tikum menempatkan Event Person-in-Charge (PIC) di area venue acara-acara besar untuk membantu pengecekan fisik tiket dan memberikan bukti verifikasi langsung jika terjadi sengketa.
        </p>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'What if my ticket is rejected at the gate?', a: 'You can open a dispute immediately from the order tracking page and connect with our on-site Event PIC. If the ticket is verified invalid, funds are refunded under escrow policy.' },
    { q: 'Are there hidden fees for escrow protection?', a: 'Protection fees are itemized transparently in the checkout breakdown with no hidden charges.' }
  ] : [
    { q: 'Bagaimana jika tiket saya ditolak di pintu masuk venue?', a: 'Anda dapat langsung mengajukan dispute melalui halaman pelacakan status dan menghubungi Event PIC Tikum di lokasi. Jika tiket terbukti tidak valid, dana direfund penuh sesuai ketentuan escrow.' },
    { q: 'Apakah pembeli dikenakan biaya tambahan untuk perlindungan escrow?', a: 'Biaya proteksi sudah tertera transparan pada rincian pesanan saat Anda melakukan pembayaran, tanpa biaya tersembunyi.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'Buyer Protection — Genuine Ticket Guarantee & Escrow Refund | Tikum' : 'Perlindungan Pembeli — Garansi Tiket Asli & Pengembalian Dana Escrow | Tikum',
    description: isEn ? 'Discover Tikum buyer protection: secure escrow holding, duplicate barcode prevention, and guaranteed escrow refund if a ticket is invalid.' : 'Pelajari sistem garansi perlindungan pembeli Tikum: rekening escrow aman, pencegahan tiket ganda, dan jaminan uang kembali jika tiket tidak valid.',
    canonicalPath: '/buyer-protection',
    h1: isEn ? 'Comprehensive Protection for Ticket Buyers' : 'Perlindungan Menyeluruh untuk Pembeli Tiket',
    subtitle: isEn ? 'Purchase live event tickets with confidence backed by neutral escrow and turnstile entry verification.' : 'Beli tiket konser favorit tanpa rasa cemas tertipu calo atau barcode palsu.',
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Beranda', url: '/' },
      { name: isEn ? 'Buyer Protection' : 'Perlindungan Pembeli', url: '/buyer-protection' }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 3. /seller-protection
// -------------------------------------------------------------
router.get('/seller-protection', (req, res) => {
  const isEn = (req.query.lang || '').toLowerCase() === 'en';
  const lang = isEn ? 'en' : 'id';

  const contentHtml = isEn ? `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #10b981; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-money-bill-transfer"></i> Guaranteed Escrow Settlement</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          You only transfer ticket credentials after the buyer has completed payment into the secure escrow account. Zero risk of phantom transfers or unpaid handovers.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-file-shield"></i> Protection Against Baseless Buyer Claims</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Dispute claims require authentic turnstile rejection slips or on-site Event PIC verification. Buyers cannot cancel unilaterally without objective evidence.
        </p>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #10b981; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-money-bill-transfer"></i> Jaminan Pembayaran Masuk (Guaranteed Settlement)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Anda hanya mengirimkan dokumen tiket setelah pembeli menyelesaikan pembayaran ke rekening escrow. Tidak ada risiko pembeli kabur atau bukti transfer palsu.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-file-shield"></i> Perlindungan dari Klaim Palsu Pembeli</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Klaim pembeli hanya dapat diproses dengan bukti fisik penolakan turnstile resmi promotor atau verifikasi Event PIC. Pembeli tidak dapat membatalkan pesanan sepihak tanpa bukti sah.
        </p>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'How fast are seller proceeds disbursed?', a: 'Once entry is verified or the post-event review window elapses (maximum 24 hours post-event), funds are disbursed directly to your registered bank account.' },
    { q: 'Do sellers have to provide physical national ID (KTP)?', a: 'When event promoters require power of attorney (surat kuasa) for wristband collection, sellers provide authorized encrypted delegation documents.' }
  ] : [
    { q: 'Berapa lama waktu pencairan dana ke rekening bank penjual?', a: 'Setelah pembeli terverifikasi masuk atau melewati batas waktu pasca-acara (maksimal 24 jam setelah acara selesai), dana langsung ditransfer ke rekening bank penjual.' },
    { q: 'Apakah penjual harus menyerahkan KTP fisik?', a: 'Sesuai protokol acara, jika tiket membutuhkan surat kuasa penukaran, penjual wajib menyediakan dokumen pendukung resmi yang aman.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'Seller Protection — Guaranteed Settlement & Safe Ticket Selling | Tikum' : 'Perlindungan Penjual — Jaminan Dana Cair & Transaksi Aman | Tikum',
    description: isEn ? 'Sell unused concert and event tickets safely: verified escrow funding before ticket handover, fraud protection against false claims, and prompt bank payout.' : 'Jual tiket konser dan event dengan tenang di Tikum: jaminan pembayaran pasti sebelum kirim tiket, perlindungan dari penipuan pembeli, dan transfer dana transparan.',
    canonicalPath: '/seller-protection',
    h1: isEn ? 'Transaction Protection for Ticket Sellers' : 'Perlindungan Transaksi untuk Penjual Tiket',
    subtitle: isEn ? 'Sell unused tickets with guaranteed escrow funding and protection against baseless claims.' : 'Jual tiket yang tidak terpakai dengan jaminan pembayaran pasti dan bebas klaim palsu.',
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Beranda', url: '/' },
      { name: isEn ? 'Seller Protection' : 'Perlindungan Penjual', url: '/seller-protection' }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 4. /ticket-verification
// -------------------------------------------------------------
router.get('/ticket-verification', (req, res) => {
  const isEn = (req.query.lang || '').toLowerCase() === 'en';
  const lang = isEn ? 'en' : 'id';

  const contentHtml = isEn ? `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-fingerprint"></i> Digital Barcode &amp; E-Ticket Protocol</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          The platform registers unique identifier hashes of e-voucher files (PDF / QR code) and validates ticket category, seat number, and event dates against canonical event records.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#a855f7; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-id-card"></i> Physical Wristband Redemption &amp; Power of Attorney</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          For events requiring physical RFID wristband exchanges (e.g. GBK or JIExpo), Tikum provides standardized stamped power-of-attorney documents and encrypted ID documentation.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-users-viewfinder"></i> On-Site Ground Verification with Event PIC</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Tikum Event PICs stand by at designated meeting points near venue gates to assist buyers during official turnstile admission.
        </p>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-fingerprint"></i> Protokol Barcode &amp; E-Ticket Digital</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Sistem mencatat identitas unik file e-voucher (PDF / gambar QR) dan memverifikasi kesesuaian kategori tiket, nomor kursi, dan tanggal event dengan database canonical Tikum.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#a855f7; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-id-card"></i> Penukaran Wristband &amp; Surat Kuasa Fisik</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Untuk konser yang mewajibkan penukaran gelang fisik RFID (seperti di GBK atau JIExpo), Tikum memfasilitasi kelengkapan template surat kuasa resmi bermeterai dan fotokopi KTP terenkripsi.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-users-viewfinder"></i> Verifikasi Lapangan Bersama Event PIC</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Event PIC Tikum bersiaga di titik kumpul sekitar gate venue untuk mendampingi pembeli dalam proses scanning turnstile resmi.
        </p>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'What if the original ticket name differs from the new buyer?', a: 'Tikum verifies whether ticket terms allow third-party entry or provides compliant authorization letters conforming to organizer rules.' }
  ] : [
    { q: 'Bagaimana jika nama di tiket berbeda dengan nama pembeli baru?', a: 'Tikum memastikan jenis tiket mendukung transfer pihak ketiga atau dilengkapi surat kuasa resmi bermeterai sesuai ketentuan promotor.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'Ticket Verification Standards & Protocols | Tikum' : 'Standar Verifikasi Tiket Konser & Event | Tikum',
    description: isEn ? 'Learn Tikum ticket verification standards: digital barcode validation, physical RFID wristband redemption, power of attorney templates, and on-site Event PIC assistance.' : 'Pelajari standar verifikasi tiket di Tikum: validasi barcode digital, penukaran wristband gelang RFID fisik, surat kuasa resmi, dan pendampingan Event PIC di lokasi.',
    canonicalPath: '/ticket-verification',
    h1: isEn ? 'Ticket Verification Standards & Gate Protocols' : 'Standar & Protokol Verifikasi Tiket',
    subtitle: isEn ? 'Multi-layer verification ensuring ticket validity and authorized gate admission.' : 'Pemeriksaan berlapis untuk memastikan setiap tiket sah dan diterima di pintu gerbang venue.',
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Beranda', url: '/' },
      { name: isEn ? 'Ticket Verification' : 'Verifikasi Tiket', url: '/ticket-verification' }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 5. /escrow
// -------------------------------------------------------------
router.get('/escrow', (req, res) => {
  const isEn = (req.query.lang || '').toLowerCase() === 'en';
  const lang = isEn ? 'en' : 'id';

  const contentHtml = isEn ? `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-vault"></i> Neutral Escrow Holding Principles</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Escrow is a neutral custody mechanism. When a buyer pays, funds are secured in Tikum dedicated escrow accounts rather than private seller wallets. Payout occurs only after successful event entry.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-lock"></i> Structural Fraud Elimination</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          This model removes secondary ticketing fraud incentives: bad actors cannot flee with buyer funds because money remains locked until turnstile validation passes.
        </p>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-vault"></i> Prinsip Rekening Penampungan Internal (Escrow)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Escrow adalah sistem penahanan dana netral. Ketika pembeli membayar tiket, uang disimpan di rekening penampungan resmi Tikum (bukan di dompet pribadi penjual). Dana baru dilepaskan setelah acara berlangsung dan pembeli terkonfirmasi masuk.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-lock"></i> Kunci Keamanan Anti Penipuan</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Model ini memotong motif penipuan calo online: penjual nakal tidak bisa membawa kabur uang pembeli karena uang masih terkunci sampai turnstile venue berhasil dilewati.
        </p>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'Can sellers request advance deposits outside the platform?', a: 'No. All transactions must run through complete escrow custody with zero off-platform deposits permitted.' }
  ] : [
    { q: 'Apakah penjual bisa meminta uang muka sebelum acara dimulai?', a: 'Tidak bisa. Seluruh transaksi di Tikum wajib melalui sistem escrow penuh tanpa uang muka di luar platform.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'Tikum Escrow Infrastructure — Neutral & Transparent Fund Holding | Tikum' : 'Sistem Rekening Escrow Tikum — Penahanan Dana Transparan & Netral | Tikum',
    description: isEn ? 'Understand Tikum neutral escrow holding: buyer funds remain safe until event admission is confirmed, then disbursed securely to legitimate sellers.' : 'Pahami cara kerja rekening penampungan escrow Tikum: dana pembeli aman terlindungi sampai selesai verifikasi gerbang konser dan dicairkan ke penjual sah.',
    canonicalPath: '/escrow',
    h1: isEn ? 'Escrow Infrastructure: Secure Holding' : 'Infrastruktur Escrow: Penahanan Dana Aman',
    subtitle: isEn ? 'A neutral holding system ensuring your funds stay protected until ticket admission succeeds.' : 'Sistem rekening netral yang menjamin uang Anda aman sampai tiket berhasil dipakai.',
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Beranda', url: '/' },
      { name: isEn ? 'Escrow Account' : 'Rekening Escrow', url: '/escrow' }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 6. /disputes & /dispute-resolution
// -------------------------------------------------------------
router.get(['/disputes', '/dispute-resolution'], (req, res) => {
  const isEn = (req.query.lang || '').toLowerCase() === 'en';
  const lang = isEn ? 'en' : 'id';

  const contentHtml = isEn ? `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #ef4444; border-radius:12px; padding:24px;">
        <h3 style="color:#ef4444; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-triangle-exclamation"></i> When Can a Dispute Be Opened?</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          A dispute can be initiated if:
          <br>&bull; The ticket barcode is rejected at the turnstile as "already scanned" or duplicate.
          <br>&bull; The ticket category differs from the purchased listing.
          <br>&bull; The seller fails to deliver required ticket credentials before the agreed deadline.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-camera"></i> Required Evidence Bundle</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Buyers provide scanner error photos/videos, turnstile operator rejection slips, or an incident record with the on-site Tikum Event PIC.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-scale-balanced"></i> Resolution Decision &amp; Refund</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Tikum Trust Officers evaluate evidence within 24 hours. Upon dispute approval, escrow funds are refunded in full to the buyer, and fraudulent seller accounts face permanent suspension.
        </p>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #ef4444; border-radius:12px; padding:24px;">
        <h3 style="color:#ef4444; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-triangle-exclamation"></i> Kapan Dispute Dapat Diajukan?</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Dispute dapat dibuka jika:
          <br>&bull; Barcode tiket ditolak turnstile dengan notifikasi "already used" / duplikat.
          <br>&bull; Kategori tiket tidak sesuai dengan apa yang dibeli.
          <br>&bull; Penjual tidak menyerahkan dokumen tiket sesuai batas waktu kesepakatan.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-camera"></i> Bukti yang Diperlukan (Evidence Bundle)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Pembeli wajib melampirkan foto/video layar scanner turnstile, slip penolakan gatekeeper, atau laporan berita acara bersama Event PIC Tikum di lokasi.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-scale-balanced"></i> Keputusan Resolusi &amp; Refund</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Tim Trust Officer Tikum memvalidasi bukti dalam 1x24 jam. Jika dispute disetujui, dana escrow dikembalikan penuh ke pembeli dan akun penjual dikenakan sanksi penangguhan permanen.
        </p>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'How long does dispute investigation take?', a: 'Turnstile gate disputes are typically resolved within 24 hours of receiving complete evidence.' }
  ] : [
    { q: 'Berapa lama proses penyelesaian dispute berlangsung?', a: 'Penyelidikan dispute turnstile di lokasi selesai dalam 1x24 jam setelah bukti lengkap diterima.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'Dispute Resolution Center & Gate Evidence Standards | Tikum' : 'Pusat Resolusi Sengketa (Dispute Resolution) & Bukti Tiket | Tikum',
    description: isEn ? 'Official dispute procedures and ticket investigation at Tikum: turnstile validation evidence, escrow hold, and full escrow refund guarantee.' : 'Prosedur pengajuan dispute dan investigasi tiket bermasalah di Tikum: bukti verifikasi turnstile, penahanan dana escrow, dan garansi pengembalian dana escrow.',
    canonicalPath: '/disputes',
    h1: isEn ? 'Dispute Resolution Procedures' : 'Prosedur Resolusi Sengketa (Dispute)',
    subtitle: isEn ? 'An evidence-based neutral mechanism to resolve ticket access issues and refund buyer funds.' : 'Mekanisme netral berbasis bukti untuk menyelesaikan kendala tiket dan mengembalikan dana pembeli.',
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Beranda', url: '/' },
      { name: isEn ? 'Dispute Resolution' : 'Resolusi Sengketa', url: '/disputes' }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

module.exports = router;
