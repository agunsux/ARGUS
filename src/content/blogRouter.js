/**
 * TIKUM Blog & Editorial Router
 * Delivers Server-Side Rendered (SSR) magazine and educational content:
 * - /blog & /blog/:slug
 * - /blog/category/:category
 * - /blog/editorial-standards (E-E-A-T author and editorial disclosure)
 * - /blog/rss.xml (Syndication feed for search engines and aggregators)
 * - /guides & /guides/:slug
 *
 * Strict Principles:
 * - High-speed SSR HTML.
 * - JSON-LD Article + Breadcrumbs + FAQ schema (only when FAQ content exists).
 * - Dynamic reading time calculation.
 * - Related articles section.
 * - Per-article og:image support.
 * - Enforces indexation rules (unapproved/scheduled drafts are never public/indexed).
 */

const express = require('express');
const router = express.Router();
const { articleRepository } = require('./ArticleRepository');
const { CONTENT_STATUS, CATEGORY_MAP, CATEGORY_METADATA } = require('./ContentModel');
const { TechnicalSEOService } = require('../seo/TechnicalSEOService');
const { StructuredDataFactory } = require('../seo/StructuredDataFactory');
const { InternalLinkingService } = require('../seo/InternalLinkingService');
const { renderFooterHtml, businessProfile } = require('../config/businessProfile');

// -------------------------------------------------------------
// Utility: Reading Time
// -------------------------------------------------------------
function calculateReadingTime(htmlContent) {
  if (!htmlContent) return 1;
  const plainText = htmlContent.replace(/<[^>]*>/gm, ' ');
  const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200)); // 200 WPM average
}

// -------------------------------------------------------------
// Utility: Format date to Indonesian locale
// -------------------------------------------------------------
function formatDateId(isoDate) {
  if (!isoDate) return 'Tim Editorial Tikum';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return (isoDate || '').substring(0, 10);
  }
}

// -------------------------------------------------------------
// Utility: Normalize category slug
// -------------------------------------------------------------
function resolveCategorySlug(cat) {
  if (!cat) return 'secondary-ticketing';
  return CATEGORY_MAP[cat] || CATEGORY_MAP[cat.toLowerCase()] || cat.toLowerCase().replace(/_/g, '-');
}

// -------------------------------------------------------------
// Utility: Related Articles HTML (excludes current slug, same-category prioritized)
// -------------------------------------------------------------
function renderRelatedArticles(currentSlug, category) {
  const allPublished = articleRepository.getPublishedArticles();
  const currentCatSlug = resolveCategorySlug(category);

  const related = allPublished
    .filter(a => a.slug !== currentSlug)
    .sort((a, b) => {
      const aCatSlug = resolveCategorySlug(a.category);
      const bCatSlug = resolveCategorySlug(b.category);
      const aSameCat = aCatSlug === currentCatSlug ? 1 : 0;
      const bSameCat = bCatSlug === currentCatSlug ? 1 : 0;
      if (bSameCat !== aSameCat) return bSameCat - aSameCat;
      return (b.published_at || b.updated_at || '').localeCompare(a.published_at || a.updated_at || '');
    })
    .slice(0, 3);

  if (related.length === 0) return '';

  const cards = related.map(a => {
    const rt = calculateReadingTime(a.content);
    const date = formatDateId(a.published_at);
    const catSlug = resolveCategorySlug(a.category);
    const catLabel = CATEGORY_METADATA[catSlug]?.title || a.category.replace(/_/g, ' ');
    return `
      <a href="/blog/${a.slug}" style="display:block; background:#131d31; border:1px solid #1e293b; border-radius:10px; padding:16px 18px; text-decoration:none; transition:border-color 0.2s;" onmouseover="this.style.borderColor='#0284c7'" onmouseout="this.style.borderColor='#1e293b'">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; font-weight:700; color:#38bdf8; text-transform:uppercase; letter-spacing:0.5px;">${catLabel}</span>
          <span style="font-size:11px; color:#64748b;">${rt} menit baca</span>
        </div>
        <h3 style="font-size:15px; font-weight:700; color:#f8fafc; margin:0 0 6px; line-height:1.4;">${a.title}</h3>
        <p style="font-size:13px; color:#94a3b8; margin:0 0 8px; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${a.description}</p>
        <div style="font-size:12px; color:#64748b;"><i class="fa-solid fa-calendar-day" style="margin-right:4px;"></i>${date}</div>
      </a>
    `;
  }).join('');

  return `
    <section style="margin-top:48px; padding-top:32px; border-top:1px solid #1e293b;" aria-label="Artikel Terkait">
      <h2 style="font-size:20px; font-weight:800; color:#f8fafc; margin:0 0 20px;">Artikel Terkait</h2>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px;">
        ${cards}
      </div>
    </section>
  `;
}

// -------------------------------------------------------------
// Utility: Render FAQ section HTML from article.faq[]
// -------------------------------------------------------------
function renderFaqSection(faq) {
  if (!Array.isArray(faq) || faq.length === 0) return '';

  const items = faq.map((item) => `
    <div style="border-bottom:1px solid #1e293b; padding:16px 0;" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <h3 itemprop="name" style="font-size:16px; font-weight:700; color:#f8fafc; margin:0 0 8px; cursor:pointer;" onclick="const a=this.nextElementSibling; a.style.display=a.style.display==='none'?'block':'none'">
        <i class="fa-solid fa-circle-question" style="color:#38bdf8; margin-right:8px;"></i>${item.q}
      </h3>
      <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer" style="display:block;">
        <p itemprop="text" style="font-size:14px; color:#94a3b8; margin:0; line-height:1.7;">${item.a}</p>
      </div>
    </div>
  `).join('');

  return `
    <section style="margin-top:40px;" itemscope itemtype="https://schema.org/FAQPage" aria-label="FAQ">
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin:0 0 16px;">
        <i class="fa-solid fa-circle-question" style="color:#38bdf8; margin-right:8px;"></i>Pertanyaan Umum
      </h2>
      ${items}
    </section>
  `;
}

// -------------------------------------------------------------
// Utility: Nav Header
// -------------------------------------------------------------
function renderBlogNavHeader(activeCategory = null) {
  return `
  <header class="site-header">
    <div class="header-container">
      <a href="/" class="brand">
        <div class="brand-badge"><i class="fa-solid fa-shield-halved"></i></div>
        <div>
          <div class="brand-title">Tikum</div>
          <span class="brand-subtitle">Editorial &amp; Event Guides</span>
        </div>
      </a>
      <nav class="main-nav">
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> <span data-i18n="nav.events">Katalog Event</span></a>
        <a href="/blog" class="nav-link active"><i class="fa-solid fa-newspaper"></i> <span data-i18n="nav.blog">Panduan &amp; Artikel</span></a>
        <a href="/how-it-works" class="nav-link"><i class="fa-solid fa-circle-nodes"></i> <span data-i18n="footer.how">Cara Kerja</span></a>
        <a href="/buyer-protection" class="nav-link"><i class="fa-solid fa-shield-check"></i> <span data-i18n="footer.buyerProt">Perlindungan</span></a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> <span data-i18n="nav.sellTicket">Jual Tiket</span></a>
        <button id="btnLangToggle" class="btn btn-secondary btn-sm" onclick="window.TikumI18n ? window.TikumI18n.toggleLang() : null" style="padding: 4px 10px; font-size: 11px; font-weight: 700; margin-left: 8px;">ID</button>
      </nav>
    </div>
  </header>`;
}

// -------------------------------------------------------------
// Utility: Category Pills Navigation
// -------------------------------------------------------------
function renderCategoryPills(activeSlug = null) {
  const categories = [
    { slug: 'all', title: 'Semua Artikel', url: '/blog' },
    { slug: 'ticket-safety', title: 'Keamanan Tiket', url: '/blog/category/ticket-safety' },
    { slug: 'secondary-ticketing', title: 'Secondary Ticketing', url: '/blog/category/secondary-ticketing' },
    { slug: 'scam-prevention', title: 'Pencegahan Scam', url: '/blog/category/scam-prevention' },
    { slug: 'ticket-guides', title: 'Panduan Tiket', url: '/blog/category/ticket-guides' },
    { slug: 'tikum', title: 'Tentang Tikum', url: '/blog/category/tikum' }
  ];

  const pills = categories.map(c => {
    const isActive = activeSlug ? c.slug === activeSlug : c.slug === 'all';
    const bg = isActive ? '#0284c7' : '#1e293b';
    const color = isActive ? '#fff' : '#94a3b8';
    return `<a href="${c.url}" style="display:inline-block; padding:6px 14px; border-radius:20px; background:${bg}; color:${color}; text-decoration:none; font-size:13px; font-weight:600; margin:4px; transition:all 0.2s;">${c.title}</a>`;
  }).join('');

  return `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:4px; margin-bottom:32px;">${pills}</div>`;
}

// -------------------------------------------------------------
// 1. /blog/editorial-standards (E-E-A-T Author & Standards Page)
// -------------------------------------------------------------
router.get(['/blog/editorial-standards', '/blog/tentang-editorial', '/blog/author'], (req, res) => {
  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: 'Standar Editorial & Tim Riset', url: '/blog/editorial-standards' }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: 'Standar Editorial, Kebijakan Fakta & Tim Riset Keamanan | Tikum',
    description: 'Pedoman editorial Tikum: bagaimana tim riset kami memverifikasi fakta keamanan tiket konser, menguji modus penipuan, dan mengedukasi ekosistem secondary ticketing di Indonesia.',
    canonicalPath: '/blog/editorial-standards',
    jsonLd
  });

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMeta}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .editorial-container { max-width: 820px; margin: 0 auto; padding: 40px 16px 60px; line-height: 1.8; color: #cbd5e1; }
    .editorial-container h2 { color: #f8fafc; font-size: 22px; font-weight: 800; margin: 32px 0 14px; border-bottom: 1px solid #1e293b; padding-bottom: 8px; }
    .editorial-container h3 { color: #f8fafc; font-size: 17px; font-weight: 700; margin: 20px 0 10px; }
    .editorial-container p { margin-bottom: 18px; font-size: 15px; }
    .editorial-container ul { margin: 0 0 20px 24px; padding: 0; }
    .editorial-container li { margin-bottom: 8px; font-size: 15px; }
    .card-box { background: #131d31; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin: 20px 0; }
  </style>
</head>
<body>
  ${renderBlogNavHeader()}
  <main class="editorial-container">
    <nav aria-label="breadcrumb" style="font-size: 13px; color: #64748b; margin-bottom: 20px;">
      <a href="/" style="color: #94a3b8; text-decoration: none;">Beranda</a> &rsaquo;
      <a href="/blog" style="color: #94a3b8; text-decoration: none;">Blog</a> &rsaquo;
      <span style="color: #f8fafc;">Standar Editorial &amp; Tim Riset</span>
    </nav>

    <div style="text-align:center; margin-bottom: 36px;">
      <div class="hero-pill"><i class="fa-solid fa-shield-halved"></i> E-E-A-T &amp; TRUST STANDARDS</div>
      <h1 style="font-size: 32px; font-weight: 800; color: #f8fafc; margin: 14px 0;">Standar Editorial &amp; Integritas Riset Tikum</h1>
      <p style="color: #94a3b8; font-size: 16px;">Membangun kepercayaan publik melalui edukasi berbasis fakta, transparansi operasional, dan kepatuhan regulasi.</p>
    </div>

    <div class="card-box">
      <h3 style="margin-top:0; color:#38bdf8;"><i class="fa-solid fa-users-gear" style="margin-right:8px;"></i>Siapa yang Memproduksi Konten Tikum?</h3>
      <p>Artikel dan panduan di Tikum diproduksi secara kolaboratif oleh <strong>Tim Editorial Tikum</strong> bersama <strong>Tim Riset Keamanan Tikum</strong> (Ground Operations &amp; Trust Team). Konten kami tidak ditulis oleh bot otomatis yang menghasilkan spam, melainkan diriset oleh praktisi yang memahami dinamika lapangan konser di Indonesia.</p>
    </div>

    <h2>1. Pedoman Pemeriksaan Fakta &amp; Disiplin Klaim</h2>
    <p>Kepercayaan adalah nilai inti Tikum. Oleh karena itu, kami menerapkan disiplin ketat dalam setiap publikasi:</p>
    <ul>
      <li><strong>Tanpa Klaim Berlebihan:</strong> Kami tidak pernah mengklaim diri sebagai "penjual tiket pertama di Indonesia", "marketplace terbesar", atau "100% bebas scam". Kami menyajikan fakta apa adanya bahwa penipuan diminimalisasi secara sistematis melalui escrow dan verifikasi.</li>
      <li><strong>Rujukan Sumber Otoritatif:</strong> Setiap analisis hukum, statistik kejahatan siber, dan panduan industri merujuk pada sumber sah seperti Asosiasi Promotor Musik Indonesia (APMI), Patroli Siber Bareskrim Polri, Kementerian Perdagangan RI, dan pengumuman resmi promotor.</li>
      <li><strong>Penetapan Batasan:</strong> Kami secara jelas membedakan apa yang menjadi kewenangan Tikum dan apa yang menjadi hak prerogatif penyelenggara konser (promotor resmi).</li>
    </ul>

    <h2>2. Pengungkapan Komersial (Commercial Disclosure)</h2>
    <p>Tikum adalah platform secondary ticket marketplace independen dengan perlindungan pembayaran (escrow) dan operasional lapangan. Tikum bukan promotor konser, bukan vendor tiket primer resmi untuk seluruh event, dan tidak berafiliasi secara eksklusif dengan musisi kecuali dinyatakan dalam perjanjian kerja sama tertulis yang sah.</p>

    <h2>3. Kebijakan Pembaruan &amp; Koreksi</h2>
    <p>Regulasi penukaran tiket dan tata tertib venue dapat berubah sewaktu-waktu sesuai arahan promotor atau otoritas kepolisian. Tim kami secara berkala memperbarui artikel panduan untuk memastikan keakuratan informasi. Jika pembaca menemukan ketidaksesuaian data, silakan laporkan ke <a href="mailto:support@tikum.app" style="color:#38bdf8;">support@tikum.app</a> untuk peninjauan dan revisi segera.</p>

    <div style="margin-top: 40px; padding: 20px; background: #0b1329; border: 1px solid #0284c7; border-radius: 10px; text-align: center;">
      <h3 style="margin-top:0; color:#fff;">Punya Pertanyaan Seputar Keamanan Tiket?</h3>
      <p style="color:#94a3b8; font-size:14px; margin-bottom:16px;">Jelajahi seluruh panduan edukasi kami atau hubungi tim operasional Tikum.</p>
      <a href="/blog" class="btn btn-sm btn-primary">Kembali ke Indeks Blog</a>
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 2. /blog/rss.xml (RSS Feed for Crawlers and Readers)
// -------------------------------------------------------------
router.get(['/blog/rss.xml', '/blog/feed.xml'], (req, res) => {
  const origin = businessProfile.canonicalDomain || 'https://tikum.app';
  const publishedArticles = articleRepository.getPublishedArticles();

  const itemsXml = publishedArticles.map(a => `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${origin}/blog/${a.slug}</link>
      <guid isPermaLink="true">${origin}/blog/${a.slug}</guid>
      <description><![CDATA[${a.description}]]></description>
      <pubDate>${new Date(a.published_at || a.created_at).toUTCString()}</pubDate>
      <author><![CDATA[${a.author}]]></author>
      <category><![CDATA[${resolveCategorySlug(a.category)}]]></category>
    </item>
  `).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tikum Blog — Edukasi &amp; Keamanan Secondary Ticketing Indonesia</title>
    <link>${origin}/blog</link>
    <description>Panduan resmi jual beli tiket konser aman, sistem escrow tiket, dan pencegahan penipuan di Indonesia.</description>
    <language>id</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${origin}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    ${itemsXml}
  </channel>
</rss>`;

  res.type('application/xml').send(rss);
});

// -------------------------------------------------------------
// 3. /blog/category/:category (Category Landing Pages)
// -------------------------------------------------------------
router.get('/blog/category/:category', (req, res) => {
  const rawCat = (req.params.category || '').toLowerCase().trim();
  const catSlug = CATEGORY_MAP[rawCat] || rawCat;
  const meta = CATEGORY_METADATA[catSlug];

  if (!meta) {
    return res.status(404).send(`<!DOCTYPE html>
      <html lang="id"><head><title>Kategori Tidak Ditemukan — Tikum</title><meta name="robots" content="noindex, nofollow"></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Kategori Tidak Ditemukan</h2>
        <p>Kategori blog yang Anda cari tidak tersedia.</p>
        <a href="/blog" style="color:#38bdf8;">Kembali ke Halaman Blog</a>
      </body></html>`);
  }

  const allPublished = articleRepository.getPublishedArticles();
  const articles = allPublished.filter(a => {
    const aCatSlug = resolveCategorySlug(a.category);
    return aCatSlug === catSlug;
  });

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: meta.title, url: `/blog/category/${catSlug}` }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: `${meta.title} — Panduan & Artikel | Tikum Blog`,
    description: meta.description,
    canonicalPath: `/blog/category/${catSlug}`,
    jsonLd
  });

  const cardsHtml = articles.map(a => {
    const dateFormatted = formatDateId(a.published_at);
    const readingTime = calculateReadingTime(a.content);
    return `
      <article class="blog-card" style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">${meta.title}</span>
            <span style="font-size:12px; color:#64748b;"><i class="fa-solid fa-calendar-day"></i> ${dateFormatted}</span>
          </div>
          <h2 style="font-size:20px; font-weight:800; color:#f8fafc; margin:8px 0 10px; line-height:1.4;">
            <a href="/blog/${a.slug}" style="color:inherit; text-decoration:none;">${a.title}</a>
          </h2>
          <p style="color:#94a3b8; font-size:14px; line-height:1.6; margin-bottom:16px;">${a.description}</p>
        </div>
        <div style="border-top:1px solid #1e293b; padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:12px; color:#cbd5e1;"><i class="fa-solid fa-user-pen"></i> ${a.author}</span>
            <span style="font-size:12px; color:#64748b;"><i class="fa-solid fa-clock"></i> ${readingTime} menit</span>
          </div>
          <a href="/blog/${a.slug}" class="btn btn-sm btn-primary">Baca Selengkapnya</a>
        </div>
      </article>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMeta}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${renderBlogNavHeader(catSlug)}
  <main class="container" style="padding-top:40px; padding-bottom:60px;">
    <div style="text-align:center; max-width:800px; margin:0 auto 28px;">
      <nav aria-label="breadcrumb" style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
        <a href="/" style="color: #94a3b8; text-decoration: none;">Beranda</a> &rsaquo;
        <a href="/blog" style="color: #94a3b8; text-decoration: none;">Blog</a> &rsaquo;
        <span style="color: #f8fafc;">${meta.title}</span>
      </nav>
      <div class="hero-pill"><i class="fa-solid fa-layer-group"></i> KATEGORI BLOG TIKUM</div>
      <h1 style="font-size:32px; font-weight:800; margin:14px 0;">${meta.title}</h1>
      <p style="color:#94a3b8; font-size:15px; line-height:1.6;">${meta.description}</p>
    </div>

    ${renderCategoryPills(catSlug)}

    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:24px;">
      ${cardsHtml.length > 0 ? cardsHtml : '<div style="grid-column:1/-1; text-align:center; padding:60px; color:#64748b;">Belum ada artikel yang dipublikasikan pada kategori ini.</div>'}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 4. /blog Index Page
// -------------------------------------------------------------
router.get(['/blog', '/guides'], (req, res) => {
  const { category, q } = req.query;
  let articles = articleRepository.getPublishedArticles();

  // Sort by published_at descending (newest first)
  articles = articles.sort((a, b) =>
    (b.published_at || b.updated_at || '').localeCompare(a.published_at || a.updated_at || '')
  );

  if (category && category.trim()) {
    const targetSlug = resolveCategorySlug(category);
    articles = articles.filter(a => resolveCategorySlug(a.category) === targetSlug);
  }

  if (q && q.trim()) {
    const term = q.toLowerCase().trim();
    articles = articles.filter(a =>
      (a.title || '').toLowerCase().includes(term) ||
      (a.description || '').toLowerCase().includes(term) ||
      (Array.isArray(a.keywords) && a.keywords.some(k => k.toLowerCase().includes(term)))
    );
  }

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Panduan & Blog', url: '/blog' }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  // If query params are active, apply noindex
  const isFiltered = Boolean(q || category);
  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: 'Panduan Tiket, Konser & Keamanan Transaksi Event | Tikum Blog',
    description: 'Pusat edukasi penonton konser Indonesia: tips menghindari penipuan calo, panduan secondary ticketing yang aman, escrow tiket, dan cara memastikan transaksi tiket event terlindungi.',
    canonicalPath: '/blog',
    noindex: isFiltered,
    jsonLd
  });

  const cardsHtml = articles.map(a => {
    const dateFormatted = formatDateId(a.published_at);
    const readingTime = calculateReadingTime(a.content);
    const catSlug = resolveCategorySlug(a.category);
    const catLabel = CATEGORY_METADATA[catSlug]?.title || a.category.replace(/_/g, ' ');
    return `
      <article class="blog-card" style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <a href="/blog/category/${catSlug}" style="text-decoration:none;"><span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">${catLabel}</span></a>
            <span style="font-size:12px; color:#64748b;"><i class="fa-solid fa-calendar-day"></i> ${dateFormatted}</span>
          </div>
          <h2 style="font-size:20px; font-weight:800; color:#f8fafc; margin:8px 0 10px; line-height:1.4;">
            <a href="/blog/${a.slug}" style="color:inherit; text-decoration:none;">${a.title}</a>
          </h2>
          <p style="color:#94a3b8; font-size:14px; line-height:1.6; margin-bottom:16px;">${a.description}</p>
        </div>
        <div style="border-top:1px solid #1e293b; padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:12px;">
            <a href="/blog/editorial-standards" style="font-size:12px; color:#cbd5e1; text-decoration:none;"><i class="fa-solid fa-user-pen"></i> ${a.author}</a>
            <span style="font-size:12px; color:#64748b;"><i class="fa-solid fa-clock"></i> ${readingTime} menit</span>
          </div>
          <a href="/blog/${a.slug}" class="btn btn-sm btn-primary">Baca Selengkapnya</a>
        </div>
      </article>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMeta}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${renderBlogNavHeader()}
  <main class="container" style="padding-top:40px; padding-bottom:60px;">
    <div style="text-align:center; max-width:800px; margin:0 auto 28px;">
      <div class="hero-pill"><i class="fa-solid fa-newspaper"></i> TIKUM EDITORIAL PUBLICATION</div>
      <h1 style="font-size:32px; font-weight:800; margin:14px 0;">Panduan, Edukasi &amp; Keamanan Tiket Konser</h1>
      <p style="color:#94a3b8; font-size:15px;">Pelajari cara membeli dan menjual tiket konser dengan aman, menghindari calo penipu, dan memahami mekanisme perlindungan transaksi di pasar tiket Indonesia.</p>
    </div>

    ${renderCategoryPills(category ? resolveCategorySlug(category) : 'all')}

    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:24px;">
      ${cardsHtml.length > 0 ? cardsHtml : '<div style="grid-column:1/-1; text-align:center; padding:60px; color:#64748b;">Belum ada artikel yang dipublikasikan pada kategori ini.</div>'}
    </div>

    <div style="text-align:center; margin-top:40px; font-size:13px; color:#64748b;">
      Diteliti dan diverifikasi oleh <a href="/blog/editorial-standards" style="color:#38bdf8; text-decoration:underline;">Tim Editorial &amp; Riset Keamanan Tikum</a> &bull; <a href="/blog/rss.xml" style="color:#94a3b8;"><i class="fa-solid fa-rss"></i> RSS Feed</a>
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 5. /blog/:slug Article Page
// -------------------------------------------------------------
router.get(['/blog/:slug', '/guides/:slug'], (req, res) => {
  const article = articleRepository.getArticleBySlug(req.params.slug);

  // If not found or not published (preview requires query param `preview=1` for testing)
  const isPreview = req.query.preview === '1' && process.env.NODE_ENV === 'test';
  const nowIso = new Date().toISOString();
  const isPublishedNow = article && article.status === CONTENT_STATUS.PUBLISHED && (!article.published_at || article.published_at <= nowIso);

  if (!article || (!isPublishedNow && !isPreview)) {
    return res.status(404).send(`<!DOCTYPE html>
      <html lang="id"><head><title>Artikel Tidak Ditemukan — Tikum</title><meta name="robots" content="noindex, nofollow"></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Artikel Tidak Ditemukan</h2>
        <p>Artikel yang Anda cari tidak tersedia atau belum dipublikasikan.</p>
        <a href="/blog" style="color:#38bdf8;">Kembali ke Halaman Blog</a>
      </body></html>`);
  }

  const catSlug = resolveCategorySlug(article.category);
  const catLabel = CATEGORY_METADATA[catSlug]?.title || article.category.replace(/_/g, ' ');

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: catLabel, url: `/blog/category/${catSlug}` },
    { name: article.title, url: `/blog/${article.slug}` }
  ];

  const articleJsonLd = StructuredDataFactory.createArticleSchema(article);
  const breadcrumbsJsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  // Build JSON-LD array — add FAQ schema only when FAQ content actually exists
  const jsonLdArray = [articleJsonLd, breadcrumbsJsonLd];
  if (Array.isArray(article.faq) && article.faq.length > 0) {
    jsonLdArray.push(StructuredDataFactory.createFAQSchema(article.faq));
  }

  // Per-article og:image (falls back to site default)
  const ogImage = article.image || article.ogImage ||
    'https://tikum.app/icons/icon-512x512.png';

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: `${article.title} | Tikum`,
    description: article.description,
    canonicalPath: `/blog/${article.slug}`,
    ogType: 'article',
    image: ogImage,
    noindex: isPreview,
    jsonLd: jsonLdArray
  });

  // Inject semantic contextual internal links
  const contentWithLinks = InternalLinkingService.injectContextualLinks(article.content, article.internal_links);

  // Dynamic reading time
  const readingTime = calculateReadingTime(article.content);
  const publishDateFormatted = formatDateId(article.published_at);
  const publishDateIso = article.published_at ? article.published_at.substring(0, 10) : '';

  // Related articles & FAQ sections
  const relatedHtml = renderRelatedArticles(article.slug, article.category);
  const faqHtml = renderFaqSection(article.faq);

  // Intent-matched CTA content
  let ctaTitle = 'Temukan Tiket Konser Terverifikasi di Tikum';
  let ctaDesc = 'Transaksi aman dengan perlindungan pembayaran escrow dan pendampingan di gerbang venue.';
  let ctaBtn1 = '<a href="/events" class="btn btn-sm btn-primary">Lihat Event</a>';
  let ctaBtn2 = '<a href="/how-it-works" class="btn btn-sm btn-secondary">Pelajari Escrow</a>';

  if (article.search_intent === 'commercial' || (article.keywords && article.keywords.some(k => k.includes('jual')))) {
    ctaTitle = 'Punya Tiket dan Berhalangan Hadir? Jual dengan Aman di Tikum';
    ctaDesc = 'Pembayaran pembeli terkunci aman di escrow sebelum Anda menyerahkan tiket.';
    ctaBtn1 = '<a href="/create" class="btn btn-sm btn-primary">Mulai Jual Tiket</a>';
    ctaBtn2 = '<a href="/seller-protection" class="btn btn-sm btn-secondary">Proteksi Penjual</a>';
  }

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMeta}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .article-container { max-width: 820px; margin: 0 auto; padding: 40px 16px 60px; }
    .article-header { margin-bottom: 30px; border-bottom: 1px solid #1e293b; padding-bottom: 24px; }
    .article-body { font-size: 16px; line-height: 1.8; color: #cbd5e1; }
    .article-body h2 { font-size: 24px; font-weight: 800; color: #f8fafc; margin: 36px 0 16px; border-bottom: 1px solid #1e293b; padding-bottom: 8px; }
    .article-body h3 { font-size: 19px; font-weight: 700; color: #f8fafc; margin: 24px 0 12px; }
    .article-body p { margin-bottom: 20px; }
    .article-body ul, .article-body ol { margin: 0 0 20px 24px; padding: 0; }
    .article-body li { margin-bottom: 8px; }
    .article-body a { color: #38bdf8; text-decoration: underline; }
    .article-body table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .cta-banner { background: #131d31; border: 1px solid #0284c7; border-radius: 12px; padding: 24px; margin-top: 40px; }
  </style>
</head>
<body>
  ${renderBlogNavHeader()}
  <main class="article-container">
    <nav aria-label="breadcrumb" style="font-size: 13px; color: #64748b; margin-bottom: 20px;">
      <a href="/" style="color: #94a3b8; text-decoration: none;">Beranda</a> &rsaquo;
      <a href="/blog" style="color: #94a3b8; text-decoration: none;">Blog</a> &rsaquo;
      <a href="/blog/category/${catSlug}" style="color: #94a3b8; text-decoration: none;">${catLabel}</a> &rsaquo;
      <span style="color: #f8fafc;">${article.title}</span>
    </nav>

    <header class="article-header">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap;">
        <a href="/blog/category/${catSlug}" style="text-decoration:none;"><span class="badge badge-primary">${catLabel}</span></a>
        <time datetime="${publishDateIso}" style="font-size:13px; color:#94a3b8;">
          <i class="fa-solid fa-calendar-day"></i> ${publishDateFormatted}
        </time>
        <span style="font-size:13px; color:#94a3b8;">&bull;</span>
        <span style="font-size:13px; color:#94a3b8;"><i class="fa-solid fa-clock"></i> ${readingTime} menit baca</span>
      </div>
      <h1 style="font-size: 32px; font-weight: 800; color: #f8fafc; line-height: 1.3; margin: 10px 0 14px;">${article.title}</h1>
      <p style="font-size: 17px; color: #94a3b8; line-height: 1.6; margin: 0;">${article.description}</p>
      <div style="margin-top: 16px; font-size: 13px; color: #cbd5e1;">
        Penulis: <a href="/blog/editorial-standards" style="color:#38bdf8; text-decoration:underline;">${article.author}</a> | Verifikasi: <strong>Tim Keamanan Tikum</strong>
      </div>
    </header>

    <article class="article-body">
      ${contentWithLinks}
    </article>

    ${faqHtml}

    <div class="cta-banner">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <h3 style="font-size:18px; font-weight:800; color:#f8fafc; margin:0 0 6px;">${ctaTitle}</h3>
          <p style="font-size:13px; color:#94a3b8; margin:0;">${ctaDesc}</p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${ctaBtn1}
          ${ctaBtn2}
        </div>
      </div>
    </div>

    ${relatedHtml}
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

module.exports = router;
