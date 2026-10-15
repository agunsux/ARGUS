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
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Buyers Pay via Platform-Held Protection</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Buyer transactions are safeguarded by platform-held control. Funds are <strong>not disbursed to the seller</strong> until the ticket verification and handover requirements are satisfied.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">3</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Ticket Handover &amp; Gate Verification</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Buyers receive digital e-voucher documents or official wristband exchange instructions. For select events with active assignments, on-site Event PIC coordinators assist with documentation.
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
              Following successful ticket validation or expiration of the review window without dispute, proceeds are disbursed to the seller.
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
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Pembeli Membayar Melalui Perlindungan Platform-Held</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Dana pembayaran dikelola dengan sistem penahanan transaksi administratif platform (platform-held). Uang <strong>tidak langsung dikirim</strong> kepada penjual sampai serah terima dan validasi tiket terpenuhi.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">3</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Penyerahan Tiket &amp; Verifikasi Akses Gerbang</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Pembeli menerima dokumen e-voucher atau panduan penukaran wristband fisik. Untuk event tertentu dengan penugasan operasional resmi, koordinator lapangan (Event PIC) disiagakan untuk mendokumentasikan kendala tiket.
            </p>
          </div>
        </div>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; background:#10b981; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">4</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">Penyelesaian Transaksi &amp; Pencairan Penjual</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
              Setelah validasi tiket selesai atau berakhirnya batas waktu verifikasi tanpa ada sengketa (dispute), dana diteruskan ke rekening penjual.
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
// 2. /buyer-protection & /panduan-pembeli
// -------------------------------------------------------------
router.get(['/buyer-protection', '/panduan-pembeli'], (req, res) => {
  const isEn = (req.query.lang || '').toLowerCase() === 'en';
  const lang = isEn ? 'en' : 'id';

  const contentHtml = isEn ? `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #10b981; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-shield-check"></i> Platform-Held Payment Protection</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Your payment is managed under platform-held controls and is not disbursed to the seller before ticket delivery and validation terms are met. If a ticket is proven invalid or rejected at the turnstile gate, buyers may initiate an evidence-based dispute.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-barcode"></i> Barcode Format Validation &amp; Anti-Duplication</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Every submitted ticket undergoes hash validation and unique barcode checks to prevent duplicate sales across multiple buyers.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#f59e0b; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-user-shield"></i> On-Site Coordination (Select Verified Events)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          For select events with active assignments, Tikum coordinates with on-site Event PIC representatives to verify physical access evidence and assist with dispute intake.
        </p>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #10b981; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-shield-check"></i> Perlindungan Transaksi Platform (Platform-Held)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Dana transaksi dikelola dengan mekanisme penahanan administratif platform (platform-held) dan tidak dicairkan ke penjual sebelum serah terima dan validasi tiket terpenuhi. Jika tiket terbukti tidak valid di turnstile gerbang resmi, pembeli dapat mengajukan proses sengketa berbasis bukti.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-barcode"></i> Verifikasi Format Barcode &amp; Anti Duplikasi</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Setiap tiket yang didaftarkan melalui proses validasi hash dan nomor barcode unik untuk mencegah satu tiket dijual ke beberapa orang sekaligus.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#f59e0b; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-user-shield"></i> Koordinasi Lapangan (Event Terpilih)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Untuk event tertentu yang memiliki penugasan operasional resmi, koordinator lapangan (Event PIC) disiagakan untuk membantu dokumentasi bukti fisik saat terjadi penolakan turnstile.
        </p>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'What if my ticket is rejected at the gate?', a: 'You can open a dispute from the order tracking page and provide scanner rejection evidence. If verified invalid, the dispute is resolved in accordance with platform policies.' },
    { q: 'Are there hidden fees for buyer protection?', a: 'All applicable platform fees are itemized transparently in the checkout breakdown.' }
  ] : [
    { q: 'Bagaimana jika tiket saya ditolak di pintu masuk venue?', a: 'Anda dapat langsung mengajukan dispute melalui halaman pelacakan status dengan melampirkan bukti penolakan turnstile untuk diproses sesuai kebijakan resolusi platform.' },
    { q: 'Apakah pembeli dikenakan biaya tambahan untuk perlindungan transaksi?', a: 'Biaya layanan tertera transparan pada rincian pesanan saat Anda melakukan pembayaran, tanpa biaya tersembunyi.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'Buyer Protection — Genuine Ticket Verification & Platform Safeguards | Tikum' : 'Perlindungan Pembeli — Verifikasi Tiket & Perlindungan Transaksi | Tikum',
    description: isEn ? 'Discover Tikum buyer protection: platform-held transaction safeguards, duplicate barcode prevention, and evidence-based dispute resolution.' : 'Pelajari sistem perlindungan pembeli Tikum: tata kelola penahanan transaksi platform, pencegahan tiket ganda, dan resolusi sengketa berbasis bukti.',
    canonicalPath: '/buyer-protection',
    h1: isEn ? 'Comprehensive Protection for Ticket Buyers' : 'Perlindungan Menyeluruh untuk Pembeli Tiket',
    subtitle: isEn ? 'Purchase live event tickets with confidence backed by platform safeguards and ticket entry verification.' : 'Beli tiket konser favorit tanpa rasa cemas tertipu calo atau barcode palsu.',
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
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-vault"></i> Platform-Held Transaction Governance</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Tikum enforces a platform-held transaction structure. When a buyer pays, disbursement to the seller is held administratively until ticket verification conditions are met. Tikum is not a banking institution or independent licensed escrow agent; terms like platform-held refer strictly to internal transaction safeguards.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-lock"></i> Fraud Deterrence by Design</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          This mechanism removes malicious resale incentives: sellers cannot receive payouts on invalid or duplicate tickets, protecting buyers through structured dispute evidence protocols.
        </p>
      </div>
    </div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#38bdf8; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-vault"></i> Tata Kelola Transaksi Platform (Platform-Held)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Tikum menerapkan mekanisme perlindungan transaksi platform-held. Ketika pembeli menyelesaikan pembayaran, dana hasil penjualan ditahan secara administratif oleh platform dan tidak langsung diteruskan ke rekening penjual hingga verifikasi tiket terpenuhi. Tikum bukan merupakan lembaga perbankan atau penyedia jasa escrow berizin tersendiri.
        </p>
      </div>

      <div style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-lock"></i> Pencegahan Penipuan Terstruktur</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Mekanisme ini menghilangkan celah penipuan tiket sekunder: dana tidak dapat ditarik oleh penjual tiket fiktif karena transaksi diproteksi oleh tahapan verifikasi bukti dan prosedur resolusi sengketa.
        </p>
      </div>
    </div>
  `;

  const faqPairs = isEn ? [
    { q: 'Is Tikum a licensed banking or escrow company?', a: 'No. Tikum is a technology marketplace platform. Protection mechanisms operate under administrative platform-held transaction governance.' },
    { q: 'Can sellers demand direct off-platform transfers?', a: 'No. All purchases must proceed through authorized platform checkouts to maintain dispute protection.' }
  ] : [
    { q: 'Apakah Tikum merupakan lembaga perbankan atau escrow berizin?', a: 'Bukan. Tikum adalah platform marketplace teknologi. Mekanisme perlindungan transaksi beroperasi di bawah tata kelola administratif platform (platform-held).' },
    { q: 'Apakah penjual bisa meminta transfer langsung di luar platform?', a: 'Tidak. Seluruh transaksi wajib dilakukan melalui alur resmi platform agar hak perlindungan sengketa tetap berlaku.' }
  ];

  const html = renderTrustLayout({
    lang,
    title: isEn ? 'Tikum Escrow Infrastructure — Neutral & Transparent Fund Holding | Tikum' : 'Sistem Rekening Escrow Tikum — Penahanan Dana Transparan & Netral | Tikum',
    description: isEn ? 'Understand Tikum platform-held safeguards: transactions remain protected until ticket admission terms are verified.' : 'Pelajari tata kelola penahanan transaksi platform Tikum: perlindungan dana transaksi dan verifikasi tiket.',
    canonicalPath: '/escrow',
    h1: isEn ? 'Escrow Infrastructure: Secure Holding' : 'Infrastruktur Escrow: Penahanan Dana Aman',
    subtitle: isEn ? 'A platform-held protection model ensuring your transactions stay protected through ticket delivery.' : 'Model tata kelola transaksi terlindungi untuk menjamin keamanan serah terima tiket.',
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
