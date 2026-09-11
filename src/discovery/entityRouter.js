/**
 * TIKUM Entity SEO Router
 * Delivers Server-Rendered Landing Hubs for:
 * - /venues & /venues/:slug
 * - /artists & /artists/:slug
 * - /cities & /cities/:slug
 * - /categories & /categories/:slug
 *
 * Grounding Invariant:
 * Only generates and indexes pages supported by real underlying data.
 * Zero thin pages. Empty entities return 404 or noindex.
 */

const express = require('express');
const router = express.Router();
const { VenueRegistry } = require('./VenueRegistry');
const { ArtistRegistry } = require('./ArtistRegistry');
const { CityRegistry } = require('./CityRegistry');
const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { TechnicalSEOService } = require('../seo/TechnicalSEOService');
const { StructuredDataFactory } = require('../seo/StructuredDataFactory');
const { renderFooterHtml } = require('../config/businessProfile');

// Common navigation header HTML helper
function renderNavHeader(activeSection = '') {
  return `
  <header class="site-header">
    <div class="header-container">
      <a href="/" class="brand">
        <div class="brand-badge"><i class="fa-solid fa-shield-halved"></i></div>
        <div>
          <div class="brand-title">Tikum</div>
          <span class="brand-subtitle">Event Discovery &amp; Verified Marketplace</span>
        </div>
      </a>
      <nav class="main-nav">
        <a href="/events" class="nav-link ${activeSection === 'events' ? 'active' : ''}"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
        <a href="/venues" class="nav-link ${activeSection === 'venues' ? 'active' : ''}"><i class="fa-solid fa-building"></i> Venue</a>
        <a href="/cities" class="nav-link ${activeSection === 'cities' ? 'active' : ''}"><i class="fa-solid fa-city"></i> Kota</a>
        <a href="/blog" class="nav-link ${activeSection === 'blog' ? 'active' : ''}"><i class="fa-solid fa-newspaper"></i> Panduan</a>
        <a href="/how-it-works" class="nav-link ${activeSection === 'trust' ? 'active' : ''}"><i class="fa-solid fa-shield-check"></i> Cara Kerja</a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> Jual Tiket</a>
      </nav>
    </div>
  </header>`;
}

// -------------------------------------------------------------
// 1. VENUE DIRECTORY & LANDING PAGES
// -------------------------------------------------------------

router.get('/venues', (req, res) => {
  const venues = VenueRegistry.getAllVenues().filter(v => v.event_count > 0);
  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Daftar Venue', url: '/venues' }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: 'Daftar Gedung & Venue Konser Musik Indonesia | Tikum',
    description: 'Direktori venue konser dan stadion olahraga terkemuka di Jakarta, Bandung, Surabaya, dan Bali dengan jadwal event terverifikasi.',
    canonicalPath: '/venues',
    jsonLd
  });

  const cardsHtml = venues.map(v => `
    <div class="venue-card" style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px; display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">VENUE RESMI</span>
        <h3 style="font-size:20px; font-weight:800; color:#f8fafc; margin:10px 0 6px;">
          <a href="/venues/${v.slug}" style="color:inherit; text-decoration:none;">${v.canonical_name}</a>
        </h3>
        <div style="font-size:13px; color:#38bdf8; margin-bottom:12px;"><i class="fa-solid fa-location-dot"></i> ${v.city}, ${v.province}</div>
        <p style="color:#94a3b8; font-size:13px; line-height:1.5;">Venue resmi penyelenggaraan acara langsung dan konser musik terverifikasi.</p>
      </div>
      <div style="border-top:1px solid #1e293b; padding-top:14px; margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:#10b981; font-weight:700;"><i class="fa-solid fa-calendar-check"></i> ${v.event_count} Jadwal Event</span>
        <a href="/venues/${v.slug}" class="btn btn-sm btn-primary">Lihat Jadwal</a>
      </div>
    </div>
  `).join('');

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
  ${renderNavHeader('venues')}
  <main class="container" style="padding-top:40px; padding-bottom:60px;">
    <div style="text-align:center; max-width:800px; margin:0 auto 36px;">
      <div class="hero-pill"><i class="fa-solid fa-building"></i> DIREKTORI VENUE INDONESIA</div>
      <h1 style="font-size:32px; font-weight:800; margin:14px 0;">Venue Konser, Stadion &amp; Arena Pertunjukan</h1>
      <p style="color:#94a3b8; font-size:15px;">Daftar arena pertunjukan dan stadion di Indonesia dengan integrasi verifikasi gerbang tiket resmi dan resale terpercaya.</p>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:24px;">
      ${cardsHtml}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

router.get('/venues/:slug', (req, res) => {
  const venue = VenueRegistry.getVenueBySlug(req.params.slug);
  if (!venue || venue.event_count === 0) {
    return res.status(404).send(`<!DOCTYPE html>
      <html><head><title>Venue Tidak Ditemukan — Tikum</title><meta name="robots" content="noindex, follow"></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Venue Tidak Ditemukan</h2>
        <p>Venue yang Anda cari belum memiliki event aktif terverifikasi di Tikum.</p>
        <a href="/venues" style="color:#38bdf8;">Kembali ke Direktori Venue</a>
      </body></html>`);
  }

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Venue', url: '/venues' },
    { name: venue.canonical_name, url: `/venues/${venue.slug}` }
  ];

  const placeJsonLd = StructuredDataFactory.createPlaceSchema(venue, venue.events);
  const breadcrumbsJsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: `Jadwal Konser di ${venue.canonical_name} (${venue.city}) — Tiket Resmi &amp; Resale | Tikum`,
    description: `Jadwal acara, konser musik, dan pertandingan terkini di ${venue.canonical_name}, ${venue.city}. Informasi pintu gerbang dan transfer tiket terverifikasi di Tikum.`,
    canonicalPath: `/venues/${venue.slug}`,
    jsonLd: [placeJsonLd, breadcrumbsJsonLd]
  });

  const eventsHtml = venue.events.map(e => `
    <div style="background:#131d31; border:1px solid #1e293b; border-radius:10px; padding:18px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span class="badge badge-sm">${e.category || e.event_type}</span>
          <span style="font-size:12px; color:#94a3b8;"><i class="fa-solid fa-calendar-day"></i> ${e.start_date || e.date}</span>
        </div>
        <h4 style="font-size:18px; margin:0; color:#f8fafc;">${e.canonical_name}</h4>
      </div>
      <a href="/events/${e.slug}" class="btn btn-sm btn-primary">Lihat Tiket</a>
    </div>
  `).join('');

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
  ${renderNavHeader('venues')}
  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:900px;">
    <div style="margin-bottom:24px;">
      <a href="/venues" style="color:#38bdf8; text-decoration:none; font-size:14px;"><i class="fa-solid fa-arrow-left"></i> Kembali ke Daftar Venue</a>
    </div>

    <div style="background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:32px; margin-bottom:30px;">
      <span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">VENUE TERAKREDITASI</span>
      <h1 style="font-size:30px; font-weight:800; color:#f8fafc; margin:10px 0 6px;">${venue.canonical_name}</h1>
      <div style="color:#38bdf8; font-size:15px; margin-bottom:16px;"><i class="fa-solid fa-location-dot"></i> ${venue.city}, ${venue.province}</div>
      <p style="color:#cbd5e1; font-size:15px; line-height:1.6;">
        Lokasi penyelenggaraan acara pertunjukan langsung terkemuka di ${venue.city}. Seluruh transaksi tiket sekunder untuk event di ${venue.canonical_name} dilindungi oleh escrow dan verifikasi fisik di gerbang.
      </p>
    </div>

    <div>
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:16px;">
        <i class="fa-solid fa-calendar-days"></i> Jadwal Acara di Venue Ini (${venue.event_count} Event)
      </h2>
      ${eventsHtml}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 2. ARTIST DIRECTORY & LANDING PAGES (STRICTLY GROUNDED)
// -------------------------------------------------------------

router.get('/artists', (req, res) => {
  const artists = ArtistRegistry.getAllArtists().filter(a => a.event_count > 0);
  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Musisi & Artis', url: '/artists' }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: 'Daftar Musisi & Konser Artis di Indonesia | Tikum',
    description: 'Jelajahi jadwal tur konser artis internasional dan musisi Indonesia. Dapatkan akses tiket resmi dan transfer tiket sekunder terverifikasi.',
    canonicalPath: '/artists',
    jsonLd
  });

  const cardsHtml = artists.map(a => `
    <div class="artist-card" style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px; display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <span class="badge badge-sm" style="background:#a855f7; color:#fff; font-weight:700;">LINEUP RESMI</span>
        <h3 style="font-size:20px; font-weight:800; color:#f8fafc; margin:10px 0 6px;">
          <a href="/artists/${a.slug}" style="color:inherit; text-decoration:none;">${a.name}</a>
        </h3>
        <p style="color:#94a3b8; font-size:13px; line-height:1.5;">Jadwal konser dan pertunjukan panggung di Indonesia terverifikasi di Tikum.</p>
      </div>
      <div style="border-top:1px solid #1e293b; padding-top:14px; margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:#10b981; font-weight:700;"><i class="fa-solid fa-calendar-check"></i> ${a.event_count} Jadwal Konser</span>
        <a href="/artists/${a.slug}" class="btn btn-sm btn-primary">Lihat Konser</a>
      </div>
    </div>
  `).join('');

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
  ${renderNavHeader('events')}
  <main class="container" style="padding-top:40px; padding-bottom:60px;">
    <div style="text-align:center; max-width:800px; margin:0 auto 36px;">
      <div class="hero-pill"><i class="fa-solid fa-guitar"></i> LINEUP MUSISI &amp; ARTIS</div>
      <h1 style="font-size:32px; font-weight:800; margin:14px 0;">Jadwal Konser Musisi di Indonesia</h1>
      <p style="color:#94a3b8; font-size:15px;">Daftar musisi dan band yang memiliki jadwal tur konser terverifikasi di kota-kota besar Indonesia.</p>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:24px;">
      ${cardsHtml}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

router.get('/artists/:slug', (req, res) => {
  const artist = ArtistRegistry.getArtistBySlug(req.params.slug);
  if (!artist || artist.event_count === 0) {
    return res.status(404).send(`<!DOCTYPE html>
      <html><head><title>Artis Tidak Ditemukan — Tikum</title><meta name="robots" content="noindex, follow"></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Artis Tidak Ditemukan</h2>
        <p>Belum ada jadwal konser resmi untuk artis ini di kalender terverifikasi Tikum.</p>
        <a href="/artists" style="color:#38bdf8;">Kembali ke Direktori Artis</a>
      </body></html>`);
  }

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Musisi', url: '/artists' },
    { name: artist.name, url: `/artists/${artist.slug}` }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: `Tiket Konser ${artist.name} Indonesia — Jadwal &amp; Info Harga | Tikum`,
    description: `Jadwal tur konser ${artist.name} di Indonesia. Cek informasi tanggal, lokasi venue, tiket resmi, dan perlindungan tiket resale terverifikasi di Tikum.`,
    canonicalPath: `/artists/${artist.slug}`,
    jsonLd
  });

  const eventsHtml = artist.events.map(e => `
    <div style="background:#131d31; border:1px solid #1e293b; border-radius:10px; padding:18px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span class="badge badge-sm">${e.category || e.event_type}</span>
          <span style="font-size:12px; color:#38bdf8;"><i class="fa-solid fa-location-dot"></i> ${e.city}</span>
          <span style="font-size:12px; color:#94a3b8;"><i class="fa-solid fa-calendar-day"></i> ${e.start_date || e.date}</span>
        </div>
        <h4 style="font-size:18px; margin:0; color:#f8fafc;">${e.canonical_name}</h4>
        <div style="font-size:13px; color:#64748b; margin-top:4px;">${e.venue_name}</div>
      </div>
      <a href="/events/${e.slug}" class="btn btn-sm btn-primary">Lihat Tiket</a>
    </div>
  `).join('');

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
  ${renderNavHeader('events')}
  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:900px;">
    <div style="margin-bottom:24px;">
      <a href="/artists" style="color:#38bdf8; text-decoration:none; font-size:14px;"><i class="fa-solid fa-arrow-left"></i> Kembali ke Daftar Musisi</a>
    </div>

    <div style="background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:32px; margin-bottom:30px;">
      <span class="badge badge-sm" style="background:#a855f7; color:#fff; font-weight:700;">MUSISI / BAND TERVERIFIKASI</span>
      <h1 style="font-size:30px; font-weight:800; color:#f8fafc; margin:10px 0 6px;">Konser ${artist.name} di Indonesia</h1>
      <p style="color:#cbd5e1; font-size:15px; line-height:1.6;">
        Temukan jadwal pertunjukan dan tur resmi ${artist.name} di Indonesia. Beli dan jual tiket sekunder dengan garansi rekening escrow dan pendampingan verifikasi tiket di pintu masuk acara.
      </p>
    </div>

    <div>
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:16px;">
        <i class="fa-solid fa-calendar-days"></i> Jadwal Konser Terdaftar (${artist.event_count} Event)
      </h2>
      ${eventsHtml}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 3. CITY LANDING HUBS
// -------------------------------------------------------------

router.get('/cities', (req, res) => {
  const cities = CityRegistry.getAllCities().filter(c => c.event_count > 0);
  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Kota Event', url: '/cities' }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: 'Daftar Kota Event &amp; Konser Musik di Indonesia | Tikum',
    description: 'Temukan jadwal konser dan festival musik di Jakarta, Bandung, Surabaya, Tangerang, dan Bali dengan perlindungan transaksi tiket terpercaya.',
    canonicalPath: '/cities',
    jsonLd
  });

  const cardsHtml = cities.map(c => `
    <div class="city-card" style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px; display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <span class="badge badge-sm" style="background:#38bdf8; color:#0f172a; font-weight:700;">KOTA EVENT</span>
        <h3 style="font-size:22px; font-weight:800; color:#f8fafc; margin:10px 0 6px;">
          <a href="/cities/${c.slug}" style="color:inherit; text-decoration:none;">${c.name}</a>
        </h3>
        <p style="color:#94a3b8; font-size:13px; line-height:1.5;">${c.description}</p>
      </div>
      <div style="border-top:1px solid #1e293b; padding-top:14px; margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:#10b981; font-weight:700;"><i class="fa-solid fa-ticket"></i> ${c.event_count} Event Aktif</span>
        <a href="/cities/${c.slug}" class="btn btn-sm btn-primary">Eksplorasi Kota</a>
      </div>
    </div>
  `).join('');

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
  ${renderNavHeader('cities')}
  <main class="container" style="padding-top:40px; padding-bottom:60px;">
    <div style="text-align:center; max-width:800px; margin:0 auto 36px;">
      <div class="hero-pill"><i class="fa-solid fa-city"></i> KOTA DESTINASI EVENT</div>
      <h1 style="font-size:32px; font-weight:800; margin:14px 0;">Eksplorasi Event Berdasarkan Kota</h1>
      <p style="color:#94a3b8; font-size:15px;">Pilih kota destinasi untuk menemukan jadwal konser, festival musik, dan acara olahraga terverifikasi.</p>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:24px;">
      ${cardsHtml}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

router.get('/cities/:slug', (req, res) => {
  const city = CityRegistry.getCityBySlug(req.params.slug);
  if (!city || city.event_count === 0) {
    return res.status(404).send(`<!DOCTYPE html>
      <html><head><title>Kota Tidak Ditemukan — Tikum</title><meta name="robots" content="noindex, follow"></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Kota Tidak Ditemukan</h2>
        <p>Belum ada event aktif yang terdaftar di kota ini.</p>
        <a href="/cities" style="color:#38bdf8;">Kembali ke Direktori Kota</a>
      </body></html>`);
  }

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Kota', url: '/cities' },
    { name: city.name, url: `/cities/${city.slug}` }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: `Tiket Konser &amp; Event di ${city.name} — Jadwal Lengkap | Tikum`,
    description: `Daftar lengkap konser musik, festival, dan acara olahraga di ${city.name}. Beli tiket resmi dan tiket resale terverifikasi dengan proteksi escrow Tikum.`,
    canonicalPath: `/cities/${city.slug}`,
    jsonLd
  });

  const eventsHtml = city.events.map(e => `
    <div style="background:#131d31; border:1px solid #1e293b; border-radius:10px; padding:18px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span class="badge badge-sm">${e.category || e.event_type}</span>
          <span style="font-size:12px; color:#94a3b8;"><i class="fa-solid fa-calendar-day"></i> ${e.start_date || e.date}</span>
        </div>
        <h4 style="font-size:18px; margin:0; color:#f8fafc;">${e.canonical_name}</h4>
        <div style="font-size:13px; color:#64748b; margin-top:4px;"><i class="fa-solid fa-building"></i> ${e.venue_name}</div>
      </div>
      <a href="/events/${e.slug}" class="btn btn-sm btn-primary">Lihat Event</a>
    </div>
  `).join('');

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
  ${renderNavHeader('cities')}
  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:900px;">
    <div style="margin-bottom:24px;">
      <a href="/cities" style="color:#38bdf8; text-decoration:none; font-size:14px;"><i class="fa-solid fa-arrow-left"></i> Kembali ke Daftar Kota</a>
    </div>

    <div style="background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:32px; margin-bottom:30px;">
      <span class="badge badge-sm" style="background:#38bdf8; color:#0f172a; font-weight:700;">DESTINASI TERVERIFIKASI</span>
      <h1 style="font-size:30px; font-weight:800; color:#f8fafc; margin:10px 0 6px;">Jadwal Konser &amp; Event di ${city.name}</h1>
      <p style="color:#cbd5e1; font-size:15px; line-height:1.6;">
        ${city.description} Seluruh transaksi tiket sekunder untuk event di ${city.name} dilindungi sistem escrow Tikum dan verifikasi gerbang venue.
      </p>
    </div>

    <div>
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:16px;">
        <i class="fa-solid fa-list-check"></i> Event Aktif di ${city.name} (${city.event_count} Event)
      </h2>
      ${eventsHtml}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 4. CATEGORIES DIRECTORY & LANDING HUBS
// -------------------------------------------------------------

router.get('/categories', (req, res) => {
  res.redirect('/events');
});

router.get('/categories/:slug', (req, res) => {
  const slug = req.params.slug.toLowerCase().trim();
  const catMap = {
    'konser': 'CONCERT',
    'concert': 'CONCERT',
    'festival': 'FESTIVAL',
    'sepak-bola': 'FOOTBALL',
    'football': 'FOOTBALL',
    'basket': 'BASKETBALL',
    'comedy': 'COMEDY'
  };

  const targetCategory = catMap[slug] || slug.toUpperCase();
  const allEvents = canonicalRegistry.getAllEvents().filter(e => 
    (e.event_type || e.category || '').toUpperCase() === targetCategory && e.status !== 'CANCELLED'
  );

  if (allEvents.length === 0) {
    return res.status(404).send(`<!DOCTYPE html>
      <html><head><title>Kategori Tidak Ditemukan — Tikum</title><meta name="robots" content="noindex, follow"></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Kategori Tidak Ditemukan</h2>
        <p>Belum ada event aktif pada kategori ini.</p>
        <a href="/events" style="color:#38bdf8;">Kembali ke Katalog Event</a>
      </body></html>`);
  }

  const breadcrumbs = [
    { name: 'Beranda', url: '/' },
    { name: 'Event', url: '/events' },
    { name: targetCategory, url: `/categories/${slug}` }
  ];
  const jsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title: `Tiket ${targetCategory} di Indonesia — Jadwal &amp; Info Harga | Tikum`,
    description: `Temukan seluruh jadwal acara ${targetCategory} terverifikasi di Indonesia. Transaksi aman dengan garansi rekening escrow dan tiket resmi.`,
    canonicalPath: `/categories/${slug}`,
    jsonLd
  });

  const eventsHtml = allEvents.map(e => `
    <div style="background:#131d31; border:1px solid #1e293b; border-radius:10px; padding:18px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span style="font-size:12px; color:#38bdf8;"><i class="fa-solid fa-location-dot"></i> ${e.city}</span>
          <span style="font-size:12px; color:#94a3b8;"><i class="fa-solid fa-calendar-day"></i> ${e.start_date || e.date}</span>
        </div>
        <h4 style="font-size:18px; margin:0; color:#f8fafc;">${e.canonical_name}</h4>
        <div style="font-size:13px; color:#64748b; margin-top:4px;"><i class="fa-solid fa-building"></i> ${e.venue_name}</div>
      </div>
      <a href="/events/${e.slug}" class="btn btn-sm btn-primary">Lihat Event</a>
    </div>
  `).join('');

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
  ${renderNavHeader('events')}
  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:900px;">
    <div style="margin-bottom:24px;">
      <a href="/events" style="color:#38bdf8; text-decoration:none; font-size:14px;"><i class="fa-solid fa-arrow-left"></i> Kembali ke Katalog Event</a>
    </div>

    <div style="background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:32px; margin-bottom:30px;">
      <span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">KATEGORI ACARA</span>
      <h1 style="font-size:30px; font-weight:800; color:#f8fafc; margin:10px 0 6px;">Jadwal Acara ${targetCategory} di Indonesia</h1>
      <p style="color:#cbd5e1; font-size:15px; line-height:1.6;">
        Katalog terverifikasi untuk acara ${targetCategory}. Beli dan jual tiket dengan perlindungan anti penipuan dan sistem rekening escrow internal.
      </p>
    </div>

    <div>
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:16px;">
        <i class="fa-solid fa-list-check"></i> Daftar Acara (${allEvents.length} Event)
      </h2>
      ${eventsHtml}
    </div>
  </main>
  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

module.exports = router;

