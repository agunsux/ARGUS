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
 * Never invents nonexistent capabilities.
 */

const express = require('express');
const router = express.Router();
const { TechnicalSEOService } = require('../seo/TechnicalSEOService');
const { StructuredDataFactory } = require('../seo/StructuredDataFactory');
const { renderFooterHtml } = require('../config/businessProfile');

function renderTrustNavHeader(activePath = '') {
  return `
  <header class="site-header">
    <div class="header-container">
      <a href="/" class="brand">
        <div class="brand-badge"><i class="fa-solid fa-shield-halved"></i></div>
        <div>
          <div class="brand-title">Tikum</div>
          <span class="brand-subtitle">Verified Ticket Marketplace</span>
        </div>
      </a>
      <nav class="main-nav">
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
        <a href="/how-it-works" class="nav-link ${activePath === '/how-it-works' ? 'active' : ''}"><i class="fa-solid fa-circle-nodes"></i> Cara Kerja</a>
        <a href="/buyer-protection" class="nav-link ${activePath === '/buyer-protection' ? 'active' : ''}"><i class="fa-solid fa-shield-heart"></i> Perlindungan Pembeli</a>
        <a href="/ticket-verification" class="nav-link ${activePath === '/ticket-verification' ? 'active' : ''}"><i class="fa-solid fa-qrcode"></i> Verifikasi Tiket</a>
        <a href="/escrow" class="nav-link ${activePath === '/escrow' ? 'active' : ''}"><i class="fa-solid fa-lock"></i> Rekening Escrow</a>
        <a href="/disputes" class="nav-link ${activePath === '/disputes' ? 'active' : ''}"><i class="fa-solid fa-scale-balanced"></i> Resolusi Sengketa</a>
      </nav>
    </div>
  </header>`;
}

function renderTrustLayout({ title, description, canonicalPath, h1, subtitle, breadcrumbs, faqPairs = [], contentHtml }) {
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
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:20px;"><i class="fa-solid fa-circle-question" style="color:#38bdf8;"></i> Pertanyaan yang Sering Diajukan (FAQ)</h2>
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
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMeta}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${renderTrustNavHeader(canonicalPath)}
  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:920px;">
    <nav style="font-size:13px; color:#64748b; margin-bottom:20px;">
      <a href="/" style="color:#94a3b8; text-decoration:none;">Beranda</a> &rsaquo; 
      <span style="color:#f8fafc;">${breadcrumbs[breadcrumbs.length - 1].name}</span>
    </nav>

    <div style="background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:36px; margin-bottom:30px;">
      <div class="hero-pill"><i class="fa-solid fa-shield-halved"></i> TRUST &amp; SAFETY INFRASTRUCTURE</div>
      <h1 style="font-size:32px; font-weight:800; color:#f8fafc; margin:14px 0 8px;">${h1}</h1>
      <p style="color:#94a3b8; font-size:16px; line-height:1.6;">${subtitle}</p>
    </div>

    ${contentHtml}
    ${faqSectionHtml}

    <div style="margin-top:40px; background:#0f172a; border:1px solid #0284c7; border-radius:12px; padding:28px; text-align:center;">
      <h3 style="font-size:20px; font-weight:800; color:#f8fafc; margin-bottom:8px;">Siap Menjelajahi Tiket Terverifikasi?</h3>
      <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;">Temukan event favorit Anda atau jual tiket secara aman tanpa khawatir penipuan.</p>
      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <a href="/events" class="btn btn-primary"><i class="fa-solid fa-calendar-days"></i> Lihat Katalog Event</a>
        <a href="/create" class="btn btn-secondary"><i class="fa-solid fa-plus-circle"></i> Jual Tiket Saya</a>
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
  const contentHtml = `
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

  const faqPairs = [
    { q: 'Apakah Tikum menjual tiket langsung sebagai promotor?', a: 'Bukan. Tikum adalah marketplace sekunder terverifikasi yang menyediakan infrastruktur escrow dan perlindungan transaksi antar penggemar acara langsung.' },
    { q: 'Kapan dana saya dicairkan jika saya seorang penjual?', a: 'Dana dicairkan setelah pembeli berhasil terverifikasi masuk ke lokasi acara atau jendela verifikasi berakhir tanpa adanya klaim dispute.' }
  ];

  const html = renderTrustLayout({
    title: 'Cara Kerja Tikum — Transaksi Tiket Aman dengan Escrow & Verifikasi | Tikum',
    description: 'Pelajari mekanisme transaksi tiket konser dan event di Tikum: mulai dari pendaftaran tiket, pembayaran escrow, verifikasi gerbang venue, hingga pencairan dana aman.',
    canonicalPath: '/how-it-works',
    h1: 'Bagaimana Tikum Melindungi Transaksi Anda',
    subtitle: 'Alur transaksi tiket konser dan event langsung yang dirancang tanpa celah penipuan.',
    breadcrumbs: [
      { name: 'Beranda', url: '/' },
      { name: 'Cara Kerja', url: '/how-it-works' }
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
  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#131d31; border:1px solid #10b981; border-radius:12px; padding:24px;">
        <h3 style="color:#10b981; font-size:18px; margin:0 0 8px;"><i class="fa-solid fa-shield-check"></i> Jaminan Uang Kembali 100% (Escrow Guarantee)</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">
          Uang Anda ditahan di rekening penampungan internal Tikum dan tidak diberikan ke penjual sebelum Anda dipastikan dapat masuk ke area konser. Jika tiket palsu atau ditolak di pintu gerbang, dana Anda dikembalikan penuh.
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

  const faqPairs = [
    { q: 'Bagaimana jika tiket saya ditolak di pintu masuk venue?', a: 'Anda dapat langsung mengajukan dispute melalui halaman pelacakan status dan menghubungi Event PIC Tikum di lokasi. Jika tiket terbukti tidak valid, dana 100% direfund.' },
    { q: 'Apakah pembeli dikenakan biaya tambahan untuk perlindungan escrow?', a: 'Biaya proteksi sudah tertera transparan pada rincian pesanan saat Anda melakukan pembayaran, tanpa biaya tersembunyi.' }
  ];

  const html = renderTrustLayout({
    title: 'Perlindungan Pembeli — Garansi Tiket Asli & Pengembalian Dana 100% | Tikum',
    description: 'Pelajari sistem garansi perlindungan pembeli Tikum: rekening escrow aman, pencegahan tiket ganda, dan jaminan uang kembali jika tiket tidak valid.',
    canonicalPath: '/buyer-protection',
    h1: 'Perlindungan Menyeluruh untuk Pembeli Tiket',
    subtitle: 'Beli tiket konser favorit tanpa rasa cemas tertipu calo atau barcode palsu.',
    breadcrumbs: [
      { name: 'Beranda', url: '/' },
      { name: 'Perlindungan Pembeli', url: '/buyer-protection' }
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
  const contentHtml = `
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

  const faqPairs = [
    { q: 'Berapa lama waktu pencairan dana ke rekening bank penjual?', a: 'Setelah pembeli terverifikasi masuk atau melewati batas waktu pasca-acara (maksimal 24 jam setelah acara selesai), dana langsung ditransfer ke rekening bank penjual.' },
    { q: 'Apakah penjual harus menyerahkan KTP fisik?', a: 'Sesuai protokol acara, jika tiket membutuhkan surat kuasa penukaran, penjual wajib menyediakan dokumen pendukung resmi yang aman.' }
  ];

  const html = renderTrustLayout({
    title: 'Perlindungan Penjual — Jaminan Dana Cair & Transaksi Aman | Tikum',
    description: 'Jual tiket konser dan event dengan tenang di Tikum: jaminan pembayaran pasti sebelum kirim tiket, perlindungan dari penipuan pembeli, dan transfer dana transparan.',
    canonicalPath: '/seller-protection',
    h1: 'Perlindungan Transaksi untuk Penjual Tiket',
    subtitle: 'Jual tiket yang tidak terpakai dengan jaminan pembayaran pasti dan bebas klaim palsu.',
    breadcrumbs: [
      { name: 'Beranda', url: '/' },
      { name: 'Perlindungan Penjual', url: '/seller-protection' }
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
  const contentHtml = `
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

  const faqPairs = [
    { q: 'Bagaimana jika nama di tiket berbeda dengan nama pembeli baru?', a: 'Tikum memastikan jenis tiket mendukung transfer pihak ketiga atau dilengkapi surat kuasa resmi bermeterai sesuai ketentuan promotor.' }
  ];

  const html = renderTrustLayout({
    title: 'Standar Verifikasi Tiket Konser & Event | Tikum',
    description: 'Pelajari standar verifikasi tiket di Tikum: validasi barcode digital, penukaran wristband gelang RFID fisik, surat kuasa resmi, dan pendampingan Event PIC di lokasi.',
    canonicalPath: '/ticket-verification',
    h1: 'Standar & Protokol Verifikasi Tiket',
    subtitle: 'Pemeriksaan berlapis untuk memastikan setiap tiket sah dan diterima di pintu gerbang venue.',
    breadcrumbs: [
      { name: 'Beranda', url: '/' },
      { name: 'Verifikasi Tiket', url: '/ticket-verification' }
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
  const contentHtml = `
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

  const faqPairs = [
    { q: 'Apakah penjual bisa meminta uang muka sebelum acara dimulai?', a: 'Tidak bisa. Seluruh transaksi di Tikum wajib melalui sistem escrow penuh tanpa uang muka di luar platform.' }
  ];

  const html = renderTrustLayout({
    title: 'Sistem Rekening Escrow Tikum — Penahanan Dana Transparan & Netral | Tikum',
    description: 'Pahami cara kerja rekening penampungan escrow Tikum: dana pembeli aman terlindungi sampai selesai verifikasi gerbang konser dan dicairkan ke penjual sah.',
    canonicalPath: '/escrow',
    h1: 'Infrastruktur Escrow: Penahanan Dana Aman',
    subtitle: 'Sistem rekening netral yang menjamin uang Anda aman sampai tiket berhasil dipakai.',
    breadcrumbs: [
      { name: 'Beranda', url: '/' },
      { name: 'Rekening Escrow', url: '/escrow' }
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
  const contentHtml = `
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
          Tim Trust Officer Tikum memvalidasi bukti dalam 1x24 jam. Jika dispute disetujui, dana escrow dikembalikan 100% ke pembeli dan akun penjual dikenakan sanksi penangguhan permanen.
        </p>
      </div>
    </div>
  `;

  const faqPairs = [
    { q: 'Berapa lama proses penyelesaian dispute berlangsung?', a: 'Penyelidikan dispute turnstile di lokasi selesai dalam 1x24 jam setelah bukti lengkap diterima.' }
  ];

  const html = renderTrustLayout({
    title: 'Pusat Resolusi Sengketa (Dispute Resolution) &amp; Bukti Tiket | Tikum',
    description: 'Prosedur pengajuan dispute dan investigasi tiket bermasalah di Tikum: bukti verifikasi turnstile, penahanan dana escrow, dan garansi pengembalian dana 100%.',
    canonicalPath: '/disputes',
    h1: 'Prosedur Resolusi Sengketa (Dispute)',
    subtitle: 'Mekanisme netral berbasis bukti untuk menyelesaikan kendala tiket dan mengembalikan dana pembeli.',
    breadcrumbs: [
      { name: 'Beranda', url: '/' },
      { name: 'Resolusi Sengketa', url: '/disputes' }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

module.exports = router;

