/**
 * TIKUM Blog & Editorial Router
 * Delivers Server-Side Rendered (SSR) magazine and educational content:
 * - /blog & /blog/:slug
 * - /guides & /guides/:slug
 *
 * Strict Principles:
 * - High-speed SSR HTML.
 * - JSON-LD Article & Breadcrumbs schema.
 * - Enforces indexation rules (unapproved drafts are never public/indexed).
 */

const express = require('express');
const router = express.Router();
const { articleRepository } = require('./ArticleRepository');
const { CONTENT_STATUS } = require('./ContentModel');
const { TechnicalSEOService } = require('../seo/TechnicalSEOService');
const { StructuredDataFactory } = require('../seo/StructuredDataFactory');
const { InternalLinkingService } = require('../seo/InternalLinkingService');
const { renderFooterHtml } = require('../config/businessProfile');

function renderBlogNavHeader() {
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
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
        <a href="/blog" class="nav-link active"><i class="fa-solid fa-newspaper"></i> Panduan &amp; Artikel</a>
        <a href="/how-it-works" class="nav-link"><i class="fa-solid fa-circle-nodes"></i> Cara Kerja</a>
        <a href="/buyer-protection" class="nav-link"><i class="fa-solid fa-shield-check"></i> Perlindungan</a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> Jual Tiket</a>
      </nav>
    </div>
  </header>`;
}

// -------------------------------------------------------------
// 1. /blog Index Page
// -------------------------------------------------------------
router.get(['/blog', '/guides'], (req, res) => {
  const { category, q } = req.query;
  let articles = articleRepository.getPublishedArticles();

  if (category && category.trim()) {
    articles = articles.filter(a => (a.category || '').toUpperCase() === category.toUpperCase().trim());
  }

  if (q && q.trim()) {
    const term = q.toLowerCase().trim();
    articles = articles.filter(a => 
      (a.title || '').toLowerCase().includes(term) ||
      (a.description || '').toLowerCase().includes(term)
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
    title: 'Panduan Tiket, Konser &amp; Keamanan Transaksi Event | Tikum Blog',
    description: 'Pusat edukasi penonton konser Indonesia: tips menghindari penipuan calo, panduan tiket presale, regulasi turnstile venue, dan sistem rekening escrow.',
    canonicalPath: '/blog',
    noindex: isFiltered,
    jsonLd
  });

  const cardsHtml = articles.map(a => {
    const dateFormatted = a.published_at ? a.published_at.substring(0, 10) : 'Tikum Editorial';
    return `
      <article class="blog-card" style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">${a.category}</span>
            <span style="font-size:12px; color:#64748b;"><i class="fa-solid fa-calendar-day"></i> ${dateFormatted}</span>
          </div>
          <h2 style="font-size:20px; font-weight:800; color:#f8fafc; margin:8px 0 10px; line-height:1.4;">
            <a href="/blog/${a.slug}" style="color:inherit; text-decoration:none;">${a.title}</a>
          </h2>
          <p style="color:#94a3b8; font-size:14px; line-height:1.6; margin-bottom:16px;">${a.description}</p>
        </div>
        <div style="border-top:1px solid #1e293b; padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; color:#cbd5e1;"><i class="fa-solid fa-user-pen"></i> ${a.author}</span>
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
    <div style="text-align:center; max-width:800px; margin:0 auto 36px;">
      <div class="hero-pill"><i class="fa-solid fa-newspaper"></i> TIKUM EDITORIAL PUBLICATION</div>
      <h1 style="font-size:32px; font-weight:800; margin:14px 0;">Panduan, Edukasi &amp; Keamanan Tiket Konser</h1>
      <p style="color:#94a3b8; font-size:15px;">Pelajari cara membeli dan menjual tiket konser dengan aman, menghindari calo penipu, dan memahami protokol verifikasi di venue Indonesia.</p>
    </div>

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
// 2. /blog/:slug Article Page
// -------------------------------------------------------------
router.get(['/blog/:slug', '/guides/:slug'], (req, res) => {
  const article = articleRepository.getArticleBySlug(req.params.slug);

  // If not found or not published (preview requires query param `preview=1` for testing)
  const isPreview = req.query.preview === '1' && process.env.NODE_ENV === 'test';
  if (!article || (article.status !== CONTENT_STATUS.PUBLISHED && !isPreview)) {
    return res.status(404).send(`<!DOCTYPE html>
      <html><head><title>Artikel Tidak Ditemukan — Tikum</title><meta name="robots" content="noindex, follow"></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Artikel Tidak Ditemukan</h2>
        <p>Artikel yang Anda cari tidak tersedia atau belum dipublikasikan.</p>
        <a href="/blog" style="color:#38bdf8;">Kembali ke Halaman Blog</a>
      </body></html>`);
  }

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: article.title, url: `/blog/${article.slug}` }
  ];

  const articleJsonLd = StructuredDataFactory.createArticleSchema(article);
  const breadcrumbsJsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: `${article.title} | Tikum`,
    description: article.description,
    canonicalPath: `/blog/${article.slug}`,
    ogType: 'article',
    noindex: isPreview,
    jsonLd: [articleJsonLd, breadcrumbsJsonLd]
  });

  // Inject semantic contextual internal links
  const contentWithLinks = InternalLinkingService.injectContextualLinks(article.content, article.internal_links);

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
    .cta-banner { background: #131d31; border: 1px solid #0284c7; border-radius: 12px; padding: 24px; margin-top: 40px; }
  </style>
</head>
<body>
  ${renderBlogNavHeader()}
  <main class="article-container">
    <nav style="font-size: 13px; color: #64748b; margin-bottom: 20px;">
      <a href="/" style="color: #94a3b8; text-decoration: none;">Beranda</a> &rsaquo; 
      <a href="/blog" style="color: #94a3b8; text-decoration: none;">Blog</a> &rsaquo; 
      <span style="color: #f8fafc;">${article.title}</span>
    </nav>

    <header class="article-header">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">
        <span class="badge badge-primary">${article.category}</span>
        <span style="font-size:13px; color:#94a3b8;"><i class="fa-solid fa-calendar-day"></i> ${article.published_at ? article.published_at.substring(0, 10) : '2026'}</span>
        <span style="font-size:13px; color:#94a3b8;">&bull;</span>
        <span style="font-size:13px; color:#94a3b8;"><i class="fa-solid fa-clock"></i> 4 menit baca</span>
      </div>
      <h1 style="font-size: 32px; font-weight: 800; color: #f8fafc; line-height: 1.3; margin: 10px 0 14px;">${article.title}</h1>
      <p style="font-size: 17px; color: #94a3b8; line-height: 1.6; margin: 0;">${article.description}</p>
      <div style="margin-top: 16px; font-size: 13px; color: #cbd5e1;">
        Penulis: <strong>${article.author}</strong> | Verifikasi: <strong>Tim Keamanan Tikum</strong>
      </div>
    </header>

    <div class="article-body">
      ${contentWithLinks}
    </div>

    <div class="cta-banner">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <h3 style="font-size:18px; font-weight:800; color:#f8fafc; margin:0 0 6px;">Cari Tiket Konser Terverifikasi?</h3>
          <p style="font-size:13px; color:#94a3b8; margin:0;">Transaksi aman dengan penahanan dana di rekening escrow dan pendampingan di gerbang venue.</p>
        </div>
        <div style="display:flex; gap:10px;">
          <a href="/events" class="btn btn-sm btn-primary">Lihat Event</a>
          <a href="/how-it-works" class="btn btn-sm btn-secondary">Pelajari Escrow</a>
        </div>
      </div>
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

module.exports = router;

