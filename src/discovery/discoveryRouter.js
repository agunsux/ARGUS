/**
 * ARGUS Discovery Router (Epic: Event Discovery & SEO Engine)
 * 
 * Delivers:
 * - Public SSR Landing Pages (/events, /events/:slug, /events/city/:city)
 * - Public Discovery REST APIs (/api/discovery/events, /api/discovery/demand)
 * - Ingestion & Admin Control Center APIs
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { SessionStore } = require('../services/sessionStore');
const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { ingestionPipeline } = require('./EventIngestionPipeline');
const { sourceRegistry } = require('./SourceRegistry');
const { demandCapture } = require('./DemandCaptureService');
const { AdminEventControlService } = require('./AdminEventControlService');
const { EventNormalizationService } = require('./EventNormalizationService');
const { EventSEOService } = require('./EventSEOService');
const { ListingService } = require('../services/listingService');
const { apmiPromoterRegistry } = require('./ApmiPromoterRegistry');
const { promoterRegistry, PROMOTER_STATUS, PROMOTER_AUTHORITY } = require('./PromoterDiscoveryRegistry');
const { PromoterImportService, MAX_CSV_BYTES } = require('./PromoterImportService');
const { discoverySignalService, SIGNAL_STATUS } = require('./EventDiscoverySignalService');
const { state, recordAuditLog } = require('../database');
const { renderFooterHtml } = require('../config/businessProfile');
const { cityRegistry, CityRegistry } = require('./CityRegistry');
const { PopularityEngine } = require('./PopularityEngine');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('./EventTemporalLifecycleEngine');

// ==========================================
// PROMOTER IMPORT ADMIN GUARD & CSV UPLOAD
// Admin-only surface for the promoter registry workflow (never public).
// ==========================================

function resolveDiscoveryActor(req) {
  const authHeader = req.header ? (req.header('authorization') || req.header('x-session-token')) : null;
  let token = null;
  if (authHeader) {
    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
  }

  if (token) {
    const session = SessionStore.findSession(token) ||
      (state.sessions || []).find(s => s.session_token === token && new Date(s.expires_at) > new Date() && !s.revoked);
    if (session) {
      const user = (state.users || []).find(u => u.id === session.user_id);
      if (user) return user;
    }
  }

  // Test mode only: allow x-user-id / explicit admin_id actor selection (no production spoofing)
  if (process.env.NODE_ENV === 'test') {
    const candidateId = (req.header ? req.header('x-user-id') : null) || req.body?.admin_id || req.body?.officerId;
    if (candidateId) {
      const user = (state.users || []).find(u => u.id === candidateId);
      if (user) return user;
    }
  }

  return null;
}

function requireDiscoveryAdmin(req, res, next) {
  const user = resolveDiscoveryActor(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required for promoter registry management', code: 'AUTH_REQUIRED' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: `Forbidden: role '${user.role}' cannot manage the promoter registry`, code: 'ADMIN_FORBIDDEN' });
  }
  req.adminUser = user;
  next();
}

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const okExt = name.endsWith('.csv');
    const okMime = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'].includes(mime);
    if (okExt || okMime) return cb(null, true);
    const err = new Error('Only .csv files are accepted');
    err.code = 'INVALID_FILE_TYPE';
    return cb(err);
  }
}).single('file');

function optionalCsvUpload(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return csvUpload(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        const message = err.code === 'LIMIT_FILE_SIZE' ? `CSV exceeds maximum size of ${MAX_CSV_BYTES} bytes` : err.message;
        return res.status(status).json({ error: message, code: err.code || 'UPLOAD_ERROR' });
      }
      return next();
    });
  }
  return next();
}

/**
 * Helper to get active marketplace listings for a canonical event.
 */
function getActiveResaleListings(eventId) {
  try {
    return ListingService.getActiveListings(eventId) || [];
  } catch (err) {
    // Fallback directly to state.listings if ListingService throws
    return (state.listings || []).filter(l => l.event_id === eventId && l.status === 'ACTIVE');
  }
}

// ==========================================
// 1. PUBLIC SSR SEO LANDING PAGES
// ==========================================

/**
 * GET /events/:slug
 * High-performance SSR landing page with Schema.org JSON-LD,
 * separated Official Ticket Provider, and ARGUS Resale Inventory.
 */
router.get('/events/:slug', (req, res, next) => {
  const slug = req.params.slug;
  const { include_past, scope } = req.query;
  const showAllOrPast = include_past === 'true' || scope === 'all' || scope === 'admin';
  const now = new Date();

  let event = canonicalRegistry.getEventBySlug(slug) || canonicalRegistry.getEventById(slug);

  if (!event) {
    // Fallback: search in state.events if not in registry
    const legacy = (state.events || []).find(e => e.id === slug || e.slug === slug || EventNormalizationService.generateSlug(e.name || e.title, e.venue_city || e.city, e.date || e.start_date) === slug);
    if (!legacy) {
      return res.status(404).send(`<!DOCTYPE html>
        <html><head><title>Event Not Found — Tikum</title></head>
        <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
          <h2>Event Tidak Ditemukan</h2>
          <p>Event yang Anda cari tidak terdaftar atau telah dipindahkan.</p>
          <a href="/events" style="color:#38bdf8;">Kembali ke Katalog Event</a>
        </body></html>`);
    }
    event = canonicalRegistry.createEvent(legacy);
  }

  // FAIL-CLOSED GATE FOR PUBLIC DETAIL PAGE
  if (!showAllOrPast) {
    const evStatus = (event.status || '').toUpperCase();
    const evLifecycle = (event.lifecycle_status || '').toUpperCase();
    const isCancelled = evStatus === 'CANCELLED' || evStatus === 'DIBATALKAN' || evLifecycle === 'CANCELLED';
    const isPast = !EventTemporalLifecycleEngine.isEventUpcoming(event, now);
    const isFinished = ['LIVE', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evLifecycle) ||
                       ['LIVE', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evStatus);
    const isVerified = event.is_verified === true &&
      (event.verification_status === 'VERIFIED' || event.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    const hasProvenance = Boolean(event.source_url && event.evidence_hash && event.verified_at);

    if (isCancelled || isPast || isFinished || !isVerified || !hasProvenance) {
      return res.status(404).send(`<!DOCTYPE html>
        <html><head><title>Event Tidak Tersedia — Tikum</title></head>
        <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
          <h2>Event Tidak Tersedia</h2>
          <p>Event yang Anda cari belum memiliki verifikasi resmi atau jadwal telah selesai.</p>
          <a href="/events" style="color:#38bdf8;">Kembali ke Katalog Event</a>
        </body></html>`);
    }
  }

  // Active resale listings attached to this canonical event
  const listings = getActiveResaleListings(event.event_id);
  const related = canonicalRegistry.getAllEvents().filter(e => {
    if (e.city !== event.city || e.event_id === event.event_id) return false;
    if (!showAllOrPast) {
      if (!EventTemporalLifecycleEngine.isEventUpcoming(e, now)) return false;
      if (e.is_verified !== true || (e.verification_status !== 'VERIFIED' && e.verification_status !== 'PRIMARY_SOURCE_VERIFIED')) return false;
      if (!Boolean(e.source_url && e.evidence_hash && e.verified_at)) return false;
    }
    return true;
  });

  const html = EventSEOService.renderEventPageHtml(event, listings, related);
  res.type('html').send(html);
});

/**
 * GET /events
 * Main Event Discovery Catalog Hub
 */
router.get('/events', (req, res) => {
  const { q, city, category, status, include_past, scope } = req.query;

  // Cache Integrity
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  let allEvents = canonicalRegistry.getAllEvents();
  const showAllOrPast = include_past === 'true' || scope === 'all';
  const now = new Date();

  if (q && q.trim()) {
    const term = q.toLowerCase().trim();
    allEvents = allEvents.filter(e => 
      (e.canonical_name || '').toLowerCase().includes(term) ||
      (e.venue_name || '').toLowerCase().includes(term) ||
      (e.city || '').toLowerCase().includes(term)
    );
  }

  if (city && city.trim()) {
    const cTerm = city.toLowerCase().trim();
    allEvents = allEvents.filter(e => (e.city || '').toLowerCase().includes(cTerm));
  }

  if (category && category.trim()) {
    const catTerm = category.toUpperCase().trim();
    allEvents = allEvents.filter(e => (e.event_type || e.category || '').toUpperCase() === catTerm);
  }

  if (!showAllOrPast) {
    allEvents = allEvents.filter(e => {
      const evStatus = (e.status || '').toUpperCase();
      const evLifecycle = (e.lifecycle_status || '').toUpperCase();
      if (evStatus === 'CANCELLED' || evStatus === 'DIBATALKAN' || evLifecycle === 'CANCELLED') return false;
      if (!EventTemporalLifecycleEngine.isEventUpcoming(e, now)) return false;
      if (['LIVE', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evLifecycle) ||
          ['LIVE', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evStatus)) return false;
      const isVerified = e.is_verified === true &&
        (e.verification_status === 'VERIFIED' || e.verification_status === 'PRIMARY_SOURCE_VERIFIED');
      const hasProvenance = Boolean(e.source_url && e.evidence_hash && e.verified_at);
      if (!isVerified || !hasProvenance) return false;
      if (status && status.trim()) {
        const qStatus = status.toUpperCase();
        if (qStatus !== 'UPCOMING' && qStatus !== 'ON_SALE' && evStatus !== qStatus && evLifecycle !== qStatus) return false;
      }
      return true;
    });
  } else {
    if (status && status.trim()) {
      const qStatus = status.toUpperCase();
      allEvents = allEvents.filter(e => (e.status || '').toUpperCase() === qStatus || (e.lifecycle_status || '').toUpperCase() === qStatus);
    }
  }

  // Sort upcoming first
  allEvents.sort((a, b) => {
    const isUpcomingA = EventTemporalLifecycleEngine.isEventUpcoming(a, now);
    const isUpcomingB = EventTemporalLifecycleEngine.isEventUpcoming(b, now);
    if (isUpcomingA && !isUpcomingB) return -1;
    if (!isUpcomingA && isUpcomingB) return 1;
    return (a.start_date || '9999-99-99').localeCompare(b.start_date || '9999-99-99');
  });

  const itemsHtml = allEvents.map(e => {
    const activeListings = getActiveResaleListings(e.event_id);
    const minPrice = activeListings.length > 0 ? Math.min(...activeListings.map(l => l.price)) : null;

    return `
      <div class="event-card-item" style="background:#131d31; border:1px solid #1e293b; border-radius:10px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span class="badge badge-sm">${e.event_type || e.category}</span>
            <span style="font-size:12px; color:#38bdf8;"><i class="fa-solid fa-location-dot"></i> ${e.city}</span>
          </div>
          <h3 style="font-size:18px; margin:6px 0; color:#f8fafc;"><a href="/events/${e.slug}" style="color:inherit; text-decoration:none;">${e.canonical_name}</a></h3>
          <div style="font-size:13px; color:#94a3b8; margin-bottom:12px;">
            <div><i class="fa-solid fa-calendar-day"></i> ${e.start_date || e.date}</div>
            <div><i class="fa-solid fa-building"></i> ${e.venue_name}</div>
          </div>
        </div>
        <div style="border-top:1px solid #1e293b; padding-top:14px; margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            ${activeListings.length > 0 ? 
              `<span style="color:#10b981; font-weight:700; font-size:13px;"><i class="fa-solid fa-ticket"></i> ${activeListings.length} Tiket Resale (Rp ${minPrice.toLocaleString('id-ID')})</span>` : 
              `<span style="color:#64748b; font-size:12px;">Tiket Resmi Tersedia</span>`}
          </div>
          <a href="/events/${e.slug}" class="btn btn-sm btn-primary">Lihat Event</a>
        </div>
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Katalog Event Indonesia — Temukan Jadwal Konser, Olahraga &amp; Tiket Terverifikasi | Tikum</title>
  <meta name="description" content="Eksplorasi seluruh event musik, festival, sepak bola, basket, dan pertunjukan di Jakarta, Bandung, Surabaya, dan Bali. Dapatkan informasi tiket resmi dan transfer tiket terverifikasi di Tikum.">
  <link rel="canonical" href="https://tikum.app/events">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
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
        <a href="/events" class="nav-link active"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
        <a href="/offers" class="nav-link"><i class="fa-solid fa-handshake"></i> Tawaran Tiket</a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> Jual Tiket</a>
        <a href="/track" class="nav-link"><i class="fa-solid fa-magnifying-glass"></i> Lacak Status</a>
        <div class="nav-controls" style="display: inline-flex; gap: 8px; margin-left: 12px; align-items: center;">
          <button id="btnLangToggle" class="btn btn-secondary btn-sm" style="padding: 4px 10px; font-size: 12px; font-weight: 700;">EN</button>
          <button id="btnThemeToggle" class="btn btn-secondary btn-sm" style="padding: 4px 10px; font-size: 12px;" title="Toggle Dark/Light Mode"><i class="fa-solid fa-moon"></i></button>
        </div>
      </nav>
    </div>
  </header>

  <main class="container" style="padding-top:40px; padding-bottom:60px;">
    <div style="text-align:center; max-width:700px; margin:0 auto 30px;">
      <div class="hero-pill"><i class="fa-solid fa-compass"></i> INDONESIA EVENT DISCOVERY REGISTRY</div>
      <h1 style="font-size:32px; font-weight:800; letter-spacing:-0.5px; margin:14px 0;">Temukan Acara Langsung &amp; Akses Tiket Terpercaya</h1>
      <p style="color:#94a3b8; font-size:15px;">
        Pusat direktori event terverifikasi dari berbagai kanal resmi promotor, venue, dan federasi di Indonesia.
      </p>
    </div>

    <!-- Search Form -->
    <form method="GET" action="/events" style="background:#0f172a; border:1px solid #1e293b; border-radius:10px; padding:16px; margin-bottom:30px; display:flex; gap:12px; flex-wrap:wrap;">
      <input type="text" name="q" value="${q || ''}" placeholder="Cari nama event, musisi, atau tempat..." class="form-control" style="flex:2; min-width:200px;" />
      <select name="city" class="form-control" style="flex:1; min-width:140px;">
        <option value="">Semua Kota</option>
        <option value="Jakarta" ${city === 'Jakarta' ? 'selected' : ''}>Jakarta</option>
        <option value="Bandung" ${city === 'Bandung' ? 'selected' : ''}>Bandung</option>
        <option value="Surabaya" ${city === 'Surabaya' ? 'selected' : ''}>Surabaya</option>
        <option value="Tangerang" ${city === 'Tangerang' ? 'selected' : ''}>Tangerang</option>
        <option value="Bali" ${city === 'Bali' ? 'selected' : ''}>Bali</option>
      </select>
      <select name="category" class="form-control" style="flex:1; min-width:140px;">
        <option value="">Semua Kategori</option>
        <option value="CONCERT" ${category === 'CONCERT' ? 'selected' : ''}>Konser</option>
        <option value="FESTIVAL" ${category === 'FESTIVAL' ? 'selected' : ''}>Festival</option>
        <option value="FOOTBALL" ${category === 'FOOTBALL' ? 'selected' : ''}>Sepak Bola</option>
        <option value="BASKETBALL" ${category === 'BASKETBALL' ? 'selected' : ''}>Bola Basket</option>
        <option value="COMEDY" ${category === 'COMEDY' ? 'selected' : ''}>Stand-Up Comedy</option>
      </select>
      <button type="submit" class="btn btn-cyan"><i class="fa-solid fa-magnifying-glass"></i> Filter</button>
    </form>

    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">
      ${itemsHtml.length > 0 ? itemsHtml : `<div style="grid-column:1/-1; text-align:center; padding:60px; color:#64748b;">Tidak ada event yang sesuai dengan filter pencarian.</div>`}
    </div>
  </main>

  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

/**
 * GET /events/city/:city
 * City Landing Page
 */
router.get('/events/city/:city', (req, res) => {
  res.redirect(`/events?city=${encodeURIComponent(req.params.city)}`);
});

/**
 * GET /events/category/:category
 * Category Landing Page
 */
router.get('/events/category/:category', (req, res) => {
  res.redirect(`/events?category=${encodeURIComponent(req.params.category)}`);
});

/**
 * GET /promoters & /promoters/apmi
 * APMI Promoters Directory & Verified Events Archive Hub
 */
router.get(['/promoters', '/promoters/apmi'], (req, res) => {
  const directory = apmiPromoterRegistry.getAllPromotersWithEvents(canonicalRegistry);
  const assoc = directory.association;

  const memberCardsHtml = directory.members.map(m => {
    return `
      <div class="promoter-card" style="background:#131d31; border:1px solid #1e293b; border-radius:12px; padding:24px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">APMI MEMBER</span>
              <h3 style="font-size:20px; font-weight:800; color:#f8fafc; margin:8px 0 4px;">
                <a href="/promoters/apmi/${m.slug}" style="color:inherit; text-decoration:none;">${m.name}</a>
              </h3>
              <div style="font-size:12px; color:#64748b;">${m.legal_name}</div>
            </div>
            ${m.website ? `<a href="${m.website}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary" style="font-size:11px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Web</a>` : ''}
          </div>

          <p style="color:#94a3b8; font-size:13px; line-height:1.5; margin-bottom:16px;">${m.bio}</p>

          <div style="margin-bottom:16px;">
            <div style="font-size:11px; font-weight:700; color:#cbd5e1; text-transform:uppercase; margin-bottom:6px;">Festival &amp; Konser Ikonik:</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${(m.signature_events || []).map(sig => `<span style="background:#1e293b; color:#38bdf8; font-size:11px; padding:3px 8px; border-radius:6px;">${sig}</span>`).join('')}
            </div>
          </div>
        </div>

        <div style="border-top:1px solid #1e293b; padding-top:14px; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:12px; color:#10b981; font-weight:700;">
            <i class="fa-solid fa-calendar-check"></i> ${m.event_metrics.total_events} Event Terdata (${m.event_metrics.upcoming_events} Mendatang)
          </div>
          <a href="/promoters/apmi/${m.slug}" class="btn btn-sm btn-primary" style="font-size:12px;">Lihat Jadwal Event</a>
        </div>
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Direktori Promotor Musik Indonesia (APMI) &amp; Arsip Jadwal Konser Resmi | Tikum</title>
  <meta name="description" content="Arsip direktori resmi asosiasi promotor musik Indonesia (APMI). Jelajahi daftar promotor resmi, festival musik, dan jadwal konser terverifikasi di Indonesia.">
  <link rel="canonical" href="https://tikum.app/promoters/apmi">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
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
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
        <a href="/promoters/apmi" class="nav-link active"><i class="fa-solid fa-users"></i> Promotor APMI</a>
        <a href="/offers" class="nav-link"><i class="fa-solid fa-handshake"></i> Tawaran Tiket</a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> Jual Tiket</a>
        <a href="/track" class="nav-link"><i class="fa-solid fa-magnifying-glass"></i> Lacak Status</a>
      </nav>
    </div>
  </header>

  <main class="container" style="padding-top:40px; padding-bottom:60px;">
    <div style="text-align:center; max-width:800px; margin:0 auto 36px;">
      <div class="hero-pill"><i class="fa-solid fa-certificate"></i> ASOSIASI PROMOTOR MUSIK INDONESIA (APMI)</div>
      <h1 style="font-size:32px; font-weight:800; letter-spacing:-0.5px; margin:14px 0;">Direktori Promotor Resmi &amp; Ekosistem Musik Indonesia</h1>
      <p style="color:#94a3b8; font-size:15px; line-height:1.6;">
        Arsip terakreditasi asosiasi promotor musik Indonesia (APMI). Temukan profil promotor resmi, rekam jejak festival legendaris, dan jadwal konser resmi yang diselenggarakan di seluruh Indonesia.
      </p>
      <div style="display:flex; justify-content:center; gap:16px; margin-top:16px; font-size:13px; color:#38bdf8;">
        <span><i class="fa-solid fa-building"></i> ${directory.total_members} Promotor Terakreditasi</span>
        <span>&bull;</span>
        <span><a href="https://apmi.co.id/#members" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:underline;">Kunjungi Portal Resmi APMI</a></span>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:24px;">
      ${memberCardsHtml}
    </div>
  </main>

  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

/**
 * GET /promoters/apmi/:slug
 * Individual APMI Promoter Profile & Event Showcase Page
 */
router.get('/promoters/apmi/:slug', (req, res) => {
  const result = apmiPromoterRegistry.getEventsForPromoter(req.params.slug, canonicalRegistry);
  if (!result) {
    return res.status(404).send(`<!DOCTYPE html>
      <html><head><title>Promotor Tidak Ditemukan — Tikum</title></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
        <h2>Promotor APMI Tidak Ditemukan</h2>
        <p>Promotor yang Anda cari tidak terdaftar dalam direktori resmi APMI.</p>
        <a href="/promoters/apmi" style="color:#38bdf8;">Kembali ke Direktori APMI</a>
      </body></html>`);
  }

  const { promoter, events } = result;

  const eventsListHtml = events.all.length > 0 ? events.all.map(e => `
    <div style="background:#131d31; border:1px solid #1e293b; border-radius:10px; padding:18px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span class="badge badge-sm">${e.event_type || e.category}</span>
          <span style="font-size:12px; color:#38bdf8;"><i class="fa-solid fa-location-dot"></i> ${e.city}</span>
          <span style="font-size:12px; color:#94a3b8;"><i class="fa-solid fa-calendar-day"></i> ${e.start_date || e.date}</span>
        </div>
        <h4 style="font-size:16px; margin:0; color:#f8fafc;">${e.canonical_name}</h4>
        <div style="font-size:12px; color:#64748b; margin-top:4px;">${e.venue_name}</div>
      </div>
      <a href="/events/${e.slug}" class="btn btn-sm btn-primary">Lihat Detail Event</a>
    </div>
  `).join('') : `<div style="text-align:center; padding:40px; color:#64748b; background:#131d31; border-radius:10px;">Belum ada jadwal konser aktif dari promotor ini di kalender terverifikasi.</div>`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${promoter.name} — Profil Promotor Musik Resmi APMI &amp; Jadwal Event | Tikum</title>
  <meta name="description" content="Profil resmi ${promoter.name} (${promoter.legal_name}), anggota Asosiasi Promotor Musik Indonesia (APMI). Lihat rekam jejak festival dan jadwal konser terverifikasi.">
  <link rel="canonical" href="https://tikum.app/promoters/apmi/${promoter.slug}">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
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
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
        <a href="/promoters/apmi" class="nav-link active"><i class="fa-solid fa-users"></i> Promotor APMI</a>
        <a href="/offers" class="nav-link"><i class="fa-solid fa-handshake"></i> Tawaran Tiket</a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> Jual Tiket</a>
      </nav>
    </div>
  </header>

  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:900px;">
    <div style="margin-bottom:24px;">
      <a href="/promoters/apmi" style="color:#38bdf8; text-decoration:none; font-size:14px;"><i class="fa-solid fa-arrow-left"></i> Kembali ke Direktori Promotor APMI</a>
    </div>

    <div style="background:#131d31; border:1px solid #1e293b; border-radius:14px; padding:32px; margin-bottom:30px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
        <div>
          <span class="badge badge-sm" style="background:#0ea5e9; color:#fff; font-weight:700;">PROMOTOR TERAKREDITASI APMI</span>
          <h1 style="font-size:28px; font-weight:800; color:#f8fafc; margin:10px 0 4px;">${promoter.name}</h1>
          <div style="color:#64748b; font-size:14px;">${promoter.legal_name}</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${promoter.website ? `<a href="${promoter.website}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary"><i class="fa-solid fa-globe"></i> Website Resmi</a>` : ''}
          ${promoter.instagram ? `<a href="${promoter.instagram}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary"><i class="fa-brands fa-instagram"></i> Instagram</a>` : ''}
        </div>
      </div>

      <p style="color:#cbd5e1; font-size:15px; line-height:1.6; margin-top:20px;">
        ${promoter.bio}
      </p>

      <div style="margin-top:24px; padding-top:20px; border-top:1px solid #1e293b;">
        <div style="font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:8px;">Festival &amp; Konser Ikonik:</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${(promoter.signature_events || []).map(s => `<span style="background:#1e293b; color:#38bdf8; font-size:13px; padding:4px 12px; border-radius:8px; font-weight:600;">${s}</span>`).join('')}
        </div>
      </div>
    </div>

    <div>
      <h2 style="font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:16px;">
        <i class="fa-solid fa-list-check"></i> Kalender Event Resmi (${events.total} Event)
      </h2>
      ${eventsListHtml}
    </div>
  </main>

  ${renderFooterHtml()}
  <script src="/js/i18n.js"></script>
</body>
</html>`;

  res.type('html').send(html);
});

// ==========================================
// 2. PUBLIC DISCOVERY REST APIS
// ==========================================

/**
 * GET /api/discovery/events
 * JSON listing of canonical events with search, city, category filters
 * Core canonical handler for GET /api/events and GET /api/discovery/events
 * Supports:
 * - Sorting:
 *   sort=nearest (Haversine distance ASC + event_date ASC)
 *   sort=upcoming (Strict chronological event_date ASC)
 *   sort=popular (popularity_score DESC)
 *   sort=trending (demand velocity)
 *   sort=local_gems (deterministic regional score DESC)
 * - Filtering: q, city, province, category, artist, venue, promoter, date_from, date_to, verified_only, status
 */
function handleGetEvents(req, res) {
  const {
    q, city, province, country, category, category_group, artist, venue, promoter,
    date_from, date_to, verified_only, status, include_past, scope,
    sort = 'nearest', lat, lng, user_city, limit = 100, page = 1
  } = req.query;

  // Cache Integrity
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  let allEvents = canonicalRegistry.getAllEvents();
  const showAllOrPast = include_past === 'true' || scope === 'all';
  const now = new Date();

  const searchTerm = (q || req.query.search || req.query.query || '').trim();

  // 1. Text search
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    allEvents = allEvents.filter(e =>
      (e.canonical_name || e.title || '').toLowerCase().includes(term) ||
      (e.venue_name || e.venue || '').toLowerCase().includes(term) ||
      (e.city || '').toLowerCase().includes(term) ||
      (e.country || '').toLowerCase().includes(term) ||
      (e.artist || '').toLowerCase().includes(term) ||
      (Array.isArray(e.artists) && e.artists.some(a => a.toLowerCase().includes(term)))
    );
  }

  // 2. City filter
  if (city && city.trim()) {
    const cleanCity = city.toLowerCase().trim();
    allEvents = allEvents.filter(e => (e.city || '').toLowerCase() === cleanCity || (e.city || '').toLowerCase().includes(cleanCity));
  }

  // 2b. Country filter (supports Indonesia, Singapore, Malaysia, Thailand, Philippines, Vietnam and ISO codes)
  if (country && country.trim()) {
    const cleanCountry = country.toLowerCase().trim();
    const countryCodeMap = {
      'id': 'indonesia',
      'sg': 'singapore',
      'my': 'malaysia',
      'th': 'thailand',
      'ph': 'philippines',
      'vn': 'vietnam'
    };
    const targetCountry = countryCodeMap[cleanCountry] || cleanCountry;
    allEvents = allEvents.filter(e => {
      const eCountry = (e.country || 'Indonesia').toLowerCase().trim();
      return eCountry === targetCountry || eCountry.includes(targetCountry);
    });
  }

  // 3. Province filter
  if (province && province.trim()) {
    const cleanProv = province.toLowerCase().trim();
    allEvents = allEvents.filter(e => (e.province || '').toLowerCase().includes(cleanProv));
  }

  // 4. Category filter (supports exact event_type, category, and broad category_group)
  const catFilter = (category || category_group || '').toUpperCase().trim();
  if (catFilter && catFilter !== 'ALL') {
    allEvents = allEvents.filter(e => {
      const eCat = (e.event_type || e.category || '').toUpperCase().trim();
      const eGroup = (e.category_group || '').toUpperCase().trim();
      return eCat === catFilter || eGroup === catFilter || (eGroup && eGroup.includes(catFilter));
    });
  }

  // 5. Artist filter
  if (artist && artist.trim()) {
    const cleanArtist = artist.toLowerCase().trim();
    allEvents = allEvents.filter(e =>
      (e.artist || '').toLowerCase().includes(cleanArtist) ||
      (Array.isArray(e.artists) && e.artists.some(a => a.toLowerCase().includes(cleanArtist)))
    );
  }

  // 6. Venue filter
  if (venue && venue.trim()) {
    const cleanVenue = venue.toLowerCase().trim();
    allEvents = allEvents.filter(e => (e.venue_name || e.venue || '').toLowerCase().includes(cleanVenue));
  }

  // 7. Promoter filter
  if (promoter && promoter.trim()) {
    const cleanPromoter = promoter.toLowerCase().trim();
    allEvents = allEvents.filter(e => (e.organizer_name || '').toLowerCase().includes(cleanPromoter));
  }

  // 8. Date range filters
  if (date_from) {
    allEvents = allEvents.filter(e => (e.start_date || e.date) >= date_from);
  }
  if (date_to) {
    allEvents = allEvents.filter(e => (e.start_date || e.date) <= date_to);
  }

  // 9. Status & Fail-Closed Triple Gate (Temporal + Lifecycle + Provenance)
  if (!showAllOrPast) {
    allEvents = allEvents.filter(e => {
      const evStatus = (e.status || '').toUpperCase();
      const evLifecycle = (e.lifecycle_status || '').toUpperCase();
      if (evStatus === 'CANCELLED' || evStatus === 'DIBATALKAN' || evLifecycle === 'CANCELLED') return false;
      if ((e.start_date || e.date || '') < '2026-09-24') return false;
      if (!EventTemporalLifecycleEngine.isEventUpcoming(e, now)) return false;
      if (['LIVE', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evLifecycle) ||
          ['LIVE', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evStatus)) return false;
      const isVerified = e.is_verified === true &&
        (e.verification_status === 'VERIFIED' || e.verification_status === 'PRIMARY_SOURCE_VERIFIED');
      const hasProvenance = Boolean(e.source_url && e.evidence_hash && e.verified_at);
      if (!isVerified || !hasProvenance) return false;
      if (status && status.trim()) {
        const qStatus = status.toUpperCase();
        if (qStatus !== 'UPCOMING' && qStatus !== 'ON_SALE' && evStatus !== qStatus && evLifecycle !== qStatus) return false;
      }
      return true;
    });
  } else {
    if (status && status.trim()) {
      const qStatus = status.toUpperCase();
      allEvents = allEvents.filter(e => (e.verification_status || '').toUpperCase() === qStatus || (e.status || '').toUpperCase() === qStatus || (e.lifecycle_status || '').toUpperCase() === qStatus);
    }
  }

  // Resolve user coordinates for spatial distance calculation
  let userLat = lat !== undefined && lat !== '' ? Number(lat) : null;
  let userLng = lng !== undefined && lng !== '' ? Number(lng) : null;

  if ((userLat === null || userLng === null) && user_city) {
    const matchedCity = cityRegistry.findCity(user_city);
    if (matchedCity) {
      userLat = matchedCity.lat;
      userLng = matchedCity.lng;
    }
  }

  // Enrich with distance_km if coordinates available
  const enriched = allEvents.map(e => {
    let dist = null;
    if (userLat !== null && userLng !== null) {
      const eLat = e.lat || (cityRegistry.findCity(e.city) ? cityRegistry.findCity(e.city).lat : null);
      const eLng = e.lng || (cityRegistry.findCity(e.city) ? cityRegistry.findCity(e.city).lng : null);
      if (eLat !== null && eLng !== null) {
        dist = CityRegistry.haversineDistanceKm(userLat, userLng, eLat, eLng);
      }
    }
    const activeListings = getActiveResaleListings(e.event_id);
    return {
      ...e,
      distance_km: dist,
      active_listings_count: activeListings.length,
      price_min: activeListings.length > 0 ? Math.min(...activeListings.map(l => l.price)) : (e.min_price || null),
      price_max: activeListings.length > 0 ? Math.max(...activeListings.map(l => l.price)) : (e.max_price || null),
      demand_score: e.popularity_score || 0,
      ticketing_status: e.status === 'SOLD_OUT' ? 'SOLD_OUT' : (e.official_ticket_url ? 'ON_SALE' : 'UPCOMING'),
      start_time: e.start_time || (e.event_start_at ? e.event_start_at.split('T')[1]?.substring(0, 5) : null),
      end_time: e.end_time || (e.event_end_at ? e.event_end_at.split('T')[1]?.substring(0, 5) : null)
    };
  });

  // Sorting
  const sortMode = String(sort).toLowerCase().trim();
  if (sortMode === 'nearest') {
    // If user coordinates available: sort by distance_km ASC, then event_date ASC
    // If coordinates NOT available: sort by event_date ASC (chronological fallback)
    enriched.sort((a, b) => {
      if (a.distance_km !== null && b.distance_km !== null) {
        if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
      } else if (a.distance_km !== null) {
        return -1;
      } else if (b.distance_km !== null) {
        return 1;
      }
      const dateA = a.start_date || a.date || '9999-99-99';
      const dateB = b.start_date || b.date || '9999-99-99';
      return dateA.localeCompare(dateB);
    });
  } else if (sortMode === 'upcoming') {
    // Strict chronological sort: event_date ASC
    enriched.sort((a, b) => {
      const dateA = a.start_date || a.date || '9999-99-99';
      const dateB = b.start_date || b.date || '9999-99-99';
      return dateA.localeCompare(dateB);
    });
  } else if (sortMode === 'popular') {
    // Ground-truth popularity score DESC
    enriched.sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
  } else if (sortMode === 'trending') {
    // Demand velocity / recency
    enriched.sort((a, b) => {
      const trendA = (a.popularity_score || 0) + (a.context_signals?.is_imminent ? 15 : 0);
      const trendB = (b.popularity_score || 0) + (b.context_signals?.is_imminent ? 15 : 0);
      return trendB - trendA;
    });
  } else if (sortMode === 'local_gems') {
    // Deterministic local gems score DESC
    enriched.sort((a, b) => (b.local_gems_score || 0) - (a.local_gems_score || 0));
  } else if (sortMode === 'newest') {
    // Ingestion recency
    enriched.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  res.json({
    success: true,
    total: enriched.length,
    sort: sortMode,
    user_location: (userLat !== null && userLng !== null) ? { lat: userLat, lng: userLng, city: user_city || null } : null,
    events: enriched
  });
}

// Canonical Discovery REST API endpoints
router.get('/api/events', handleGetEvents);
router.get('/api/discovery/events', handleGetEvents);

/**
 * GET /api/events/home-feed
 * Delivers structured landing sections:
 * - coming_soon
 * - trending
 * - just_announced
 * - concerts
 * - sports
 * - festivals
 */
router.get('/api/events/home-feed', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const now = (req.query.now || req.headers['x-simulate-clock'] || process.env.SIMULATE_NOW)
    ? new Date(req.query.now || req.headers['x-simulate-clock'] || process.env.SIMULATE_NOW)
    : new Date();

  // Evaluate temporal and freshness transitions for all canonical events
  canonicalRegistry.refreshFreshness(now);

  const { city, lat, lng, country, category } = req.query;

  // Filter canonical events through strict temporal & verification gates
  let allEvents = canonicalRegistry.getAllEvents().filter(e => {
    const evStatus = (e.status || '').toUpperCase();
    const evLifecycle = (e.lifecycle_status || '').toUpperCase();
    if (evStatus === 'CANCELLED' || evStatus === 'DIBATALKAN' || evLifecycle === 'CANCELLED') return false;
    if (evStatus === 'EXPIRED' || evLifecycle === 'EXPIRED') return false;
    return EventTemporalLifecycleEngine.isEventHomepageEligible(e, now);
  });

  // Country filter if supplied
  if (country && country.trim()) {
    const cleanCountry = country.toLowerCase().trim();
    const countryCodeMap = {
      'id': 'indonesia',
      'sg': 'singapore',
      'my': 'malaysia',
      'th': 'thailand',
      'ph': 'philippines',
      'vn': 'vietnam'
    };
    const targetCountry = countryCodeMap[cleanCountry] || cleanCountry;
    allEvents = allEvents.filter(e => {
      const eCountry = (e.country || 'Indonesia').toLowerCase().trim();
      return eCountry === targetCountry || eCountry.includes(targetCountry);
    });
  }

  // Category filter if supplied
  if (category && category.trim() && category.toUpperCase().trim() !== 'ALL') {
    const cleanCat = category.toUpperCase().trim();
    allEvents = allEvents.filter(e => {
      const eCat = (e.event_type || e.category || '').toUpperCase().trim();
      const eGroup = (e.category_group || '').toUpperCase().trim();
      return eCat === cleanCat || eGroup === cleanCat || (eGroup && eGroup.includes(cleanCat));
    });
  }

  // Section 13 Canonical Formatting Helper
  function formatSection13(e) {
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(e);
    const activeListings = getActiveResaleListings(e.event_id || e.id);
    return {
      ...e,
      event_id: e.event_id || e.id,
      title: e.canonical_name || e.title || e.name,
      start_at: temporal.event_start_at,
      venue: e.venue_name || e.venue || 'Venue',
      city: e.city || e.venue_city || 'Jakarta',
      category: e.category || e.event_type || 'MUSIC',
      verification_status: e.verification_status || 'VERIFIED',
      verification_tier: e.verification_tier || 'TIER_A_DOUBLE_OFFICIAL',
      official_artist_url: e.artist_official_url || e.official_event_url || (e.sources && e.sources[0]?.source_url) || 'https://tikum.id',
      official_event_url: e.event_official_url || e.official_event_url || (e.sources && e.sources[0]?.source_url) || 'https://tikum.id',
      official_ticketing_url: e.ticketing_official_url || e.official_ticket_url || 'https://tikum.id',
      image_url: e.image_url || e.event_image || 'https://tikum.id/assets/default-poster.jpg',
      last_verified_at: e.last_verified_at || e.verified_at || now.toISOString(),
      source_last_seen_at: e.source_last_checked_at || e.last_seen_at || e.updated_at || now.toISOString(),
      price_min: activeListings.length > 0 ? Math.min(...activeListings.map(l => l.price)) : (e.min_price || null),
      price_max: activeListings.length > 0 ? Math.max(...activeListings.map(l => l.price)) : (e.max_price || null),
      demand_score: e.popularity_score || 0,
      ticketing_status: e.status === 'SOLD_OUT' ? 'SOLD_OUT' : (e.official_ticket_url ? 'ON_SALE' : 'UPCOMING'),
      start_time: e.start_time || (temporal.event_start_at ? temporal.event_start_at.split('T')[1]?.substring(0, 5) : null),
      end_time: e.end_time || (temporal.event_end_at ? temporal.event_end_at.split('T')[1]?.substring(0, 5) : null)
    };
  }

  // Segregate pools by temporal window
  const todayPool = allEvents
    .filter(e => EventTemporalLifecycleEngine.getHomepageTemporalWindow(e, now) === 'TODAY')
    .map(formatSection13);

  const upcomingPool = allEvents
    .filter(e => EventTemporalLifecycleEngine.getHomepageTemporalWindow(e, now) === 'UPCOMING')
    .sort((a, b) => (a.start_date || a.date || '9999').localeCompare(b.start_date || b.date || '9999'))
    .map(formatSection13);

  const recentPool = allEvents
    .filter(e => EventTemporalLifecycleEngine.getHomepageTemporalWindow(e, now) === 'RECENT')
    .map(formatSection13);

  const enrichedAll = allEvents.map(formatSection13);

  // 1. Trending Popular
  const popular = [...upcomingPool]
    .sort((a, b) => (b.popularity_score || b.demand_score || 0) - (a.popularity_score || a.demand_score || 0))
    .slice(0, 12);

  // 2. Near You (Filtered by user city or coordinates)
  let nearYou = [];
  if (city) {
    const cleanCity = city.toLowerCase().trim();
    nearYou = upcomingPool.filter(e => (e.city || '').toLowerCase() === cleanCity);
  } else if (lat && lng) {
    const uLat = Number(lat);
    const uLng = Number(lng);
    nearYou = upcomingPool
      .map(e => {
        const eLat = e.lat || (cityRegistry.findCity(e.city) ? cityRegistry.findCity(e.city).lat : null);
        const eLng = e.lng || (cityRegistry.findCity(e.city) ? cityRegistry.findCity(e.city).lng : null);
        const dist = (eLat && eLng) ? CityRegistry.haversineDistanceKm(uLat, uLng, eLat, eLng) : 9999;
        return { ...e, distance_km: dist };
      })
      .filter(e => e.distance_km <= 150)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 8);
  } else {
    nearYou = upcomingPool.slice(0, 6);
  }

  // 3. This Weekend
  const thisWeekend = upcomingPool.filter(e => {
    const d = e.start_date || e.date;
    if (!d) return false;
    const diffDays = (new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 4;
  }).slice(0, 8);

  // 4. Local Gems
  const localGems = upcomingPool
    .filter(e => e.is_local_gem)
    .sort((a, b) => (b.local_gems_score || 0) - (a.local_gems_score || 0))
    .slice(0, 8);

  // 5. Category Specific Sections
  const musicEvents = upcomingPool.filter(e => (e.category_group === 'MUSIC' || (e.category || '').toUpperCase().includes('CONCERT') || (e.category || '').toUpperCase().includes('MUSIC') || (e.category || '').toUpperCase() === 'KONSER')).slice(0, 8);
  const sportsEvents = upcomingPool.filter(e => (e.category_group === 'SPORTS' || (e.category || '').toUpperCase().includes('SPORT') || (e.category || '').toUpperCase() === 'OLAHRAGA' || (e.event_type || '').toUpperCase() === 'BADMINTON')).slice(0, 8);
  const festivalEvents = upcomingPool.filter(e => (e.category_group === 'FESTIVALS_EXPERIENCES' || (e.category || '').toUpperCase().includes('FESTIVAL') || (e.category || '').toUpperCase() === 'PAMERAN')).slice(0, 8);
  const comedyShows = upcomingPool.filter(e => (e.category_group === 'SHOWS_COMEDY' || (e.category || '').toUpperCase().includes('COMEDY') || (e.category || '').toUpperCase().includes('THEATER') || (e.category || '').toUpperCase() === 'STANDUP' || (e.category || '').toUpperCase() === 'TEATER')).slice(0, 8);
  const businessEvents = upcomingPool.filter(e => (e.category_group === 'BUSINESS_EDUCATION' || (e.category || '').toUpperCase().includes('CONFERENCE') || (e.category || '').toUpperCase() === 'SEMINAR')).slice(0, 8);

  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const coming_soon = [...upcomingPool]
    .filter(e => (e.start_date || e.date) <= sevenDaysFromNow)
    .sort((a, b) => (a.start_date || a.date || '9999').localeCompare(b.start_date || b.date || '9999'));

  const trending = [...upcomingPool]
    .sort((a, b) => (b.demand_score || 0) - (a.demand_score || 0))
    .slice(0, 8);

  const just_announced = [...upcomingPool]
    .sort((a, b) => new Date(b.verified_at || 0) - new Date(a.verified_at || 0))
    .slice(0, 8);

  const concerts = musicEvents;
  const sports = sportsEvents;
  const festivals = festivalEvents;

  res.json({
    success: true,
    generated_at: now.toISOString(),
    timezone: 'Asia/Jakarta',
    counts: {
      upcoming: upcomingPool.length,
      today: todayPool.length,
      recent: recentPool.length
    },
    events: upcomingPool,
    feed: upcomingPool,
    meta: {
      total_verified_upcoming: upcomingPool.length,
      country: country || 'ALL',
      category: category || 'ALL',
      countries: cityRegistry.getAllCountries ? cityRegistry.getAllCountries() : []
    },
    sections: {
      upcoming: upcomingPool,
      today: todayPool,
      recent: recentPool,
      upcoming_nearest: upcomingPool,
      trending_popular: popular,
      popular_events: popular,
      near_you: nearYou,
      this_weekend: thisWeekend,
      local_gems: localGems,
      music: musicEvents,
      sports: sportsEvents,
      festivals_experiences: festivalEvents,
      shows_comedy: comedyShows,
      business_education: businessEvents,
      coming_soon,
      trending,
      just_announced,
      concerts,
      festivals
    },
    coming_soon,
    trending,
    just_announced,
    concerts,
    sports,
    festivals
  });
});


/**
 * GET /api/discovery/events/:slugOrId
 * Detailed JSON for a single canonical event
 */
router.get('/api/discovery/events/:slugOrId', (req, res) => {
  const param = req.params.slugOrId;
  const { include_past, scope } = req.query;
  const showAllOrPast = include_past === 'true' || scope === 'all' || scope === 'admin';
  const now = new Date();

  const event = canonicalRegistry.getEventBySlug(param) || canonicalRegistry.getEventById(param);

  if (!event) {
    return res.status(404).json({ error: 'Event not found in Canonical Registry', code: 'EVENT_NOT_FOUND' });
  }

  if (!showAllOrPast) {
    const evStatus = (event.status || '').toUpperCase();
    const evLifecycle = (event.lifecycle_status || '').toUpperCase();
    const isCancelled = evStatus === 'CANCELLED' || evStatus === 'DIBATALKAN' || evLifecycle === 'CANCELLED';
    const isPast = !EventTemporalLifecycleEngine.isEventUpcoming(event, now);
    const isFinished = ['LIVE', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evLifecycle) ||
                       ['LIVE', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS'].includes(evStatus);
    const isVerified = event.is_verified === true &&
      (event.verification_status === 'VERIFIED' || event.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    const hasProvenance = Boolean(event.source_url && event.evidence_hash && event.verified_at);

    if (isCancelled || isPast || isFinished || !isVerified || !hasProvenance) {
      return res.status(404).json({ error: 'Event is unverified, expired, or unavailable for public discovery', code: 'EVENT_NOT_AVAILABLE' });
    }
  }

  const activeListings = getActiveResaleListings(event.event_id);
  const demands = demandCapture.getDemandForEvent(event.event_id);

  res.json({
    success: true,
    event,
    resale_inventory: {
      active_count: activeListings.length,
      listings: activeListings
    },
    demand_intelligence: {
      waitlist_count: demands.length
    }
  });
});

/**
 * POST /api/discovery/demand
 * Register demand notification waitlist for zero-resale events
 */
router.post('/api/discovery/demand', (req, res) => {
  try {
    const { eventId, contactInfo, targetCategory, maxBudget } = req.body;
    if (!eventId || !contactInfo) {
      return res.status(400).json({ error: 'eventId and contactInfo are required', code: 'VALIDATION_ERROR' });
    }

    const event = canonicalRegistry.getEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }

    const record = demandCapture.registerInterest({
      eventId,
      contactInfo,
      targetCategory,
      maxBudget
    });

    res.status(201).json({
      success: true,
      message: 'Waitlist notification registered successfully',
      demand: record
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/ingest
 * Ingestion entry point for multi-source event records
 */
router.post('/api/discovery/ingest', async (req, res) => {
  try {
    const { payload, source_id } = req.body;
    if (!payload || !source_id) {
      return res.status(400).json({ error: 'payload and source_id are required', code: 'VALIDATION_ERROR' });
    }

    const result = await ingestionPipeline.ingestEvent(payload, source_id);
    
    // Sync canonical registry to state.events so marketplace immediately recognizes it
    canonicalRegistry.syncToState(state.events);

    res.status(201).json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'INGESTION_ERROR' });
  }
});

/**
 * GET /api/discovery/sources
 * List registered data sources & status
 */
router.get('/api/discovery/sources', (req, res) => {
  res.json({
    success: true,
    sources: sourceRegistry.getAllSources()
  });
});

/**
 * GET /api/discovery/telemetry
 * Pipeline metrics & observability
 */
router.get('/api/discovery/telemetry', (req, res) => {
  res.json({
    success: true,
    metrics: ingestionPipeline.getMetrics(),
    recent_logs: ingestionPipeline.getRecentLogs(20)
  });
});

// ==========================================
// 2.5 APMI PROMOTER DIRECTORY APIS
// ==========================================

/**
 * GET /api/discovery/promoters/apmi
 * Returns full APMI directory, leadership board, member list, and event counts
 */
router.get('/api/discovery/promoters/apmi', (req, res) => {
  const directory = apmiPromoterRegistry.getAllPromotersWithEvents(canonicalRegistry);
  res.json({
    success: true,
    ...directory
  });
});

/**
 * GET /api/discovery/promoters/apmi/:slug
 * Detailed APMI member promoter profile and their associated canonical events
 */
router.get('/api/discovery/promoters/apmi/:slug', (req, res) => {
  const result = apmiPromoterRegistry.getEventsForPromoter(req.params.slug, canonicalRegistry);
  if (!result) {
    return res.status(404).json({ error: 'APMI promoter not found', code: 'PROMOTER_NOT_FOUND' });
  }
  res.json({
    success: true,
    ...result
  });
});

/**
 * GET /api/discovery/promoters/apmi/:slug/events
 * Categorized events for an APMI promoter
 */
router.get('/api/discovery/promoters/apmi/:slug/events', (req, res) => {
  const result = apmiPromoterRegistry.getEventsForPromoter(req.params.slug, canonicalRegistry);
  if (!result) {
    return res.status(404).json({ error: 'APMI promoter not found', code: 'PROMOTER_NOT_FOUND' });
  }
  res.json({
    success: true,
    promoter_name: result.promoter.name,
    slug: result.promoter.slug,
    events: result.events
  });
});

// ==========================================
// 3. ADMIN CONTROL CENTER APIS
// ==========================================

/**
 * GET /api/discovery/admin/dashboard
 */
router.get('/api/discovery/admin/dashboard', (req, res) => {
  res.json({
    success: true,
    ...AdminEventControlService.getControlDashboard()
  });
});

/**
 * POST /api/discovery/admin/events/:id/verify
 */
router.post('/api/discovery/admin/events/:id/verify', (req, res) => {
  try {
    const officerId = req.headers['x-user-id'] || 'admin-1';
    const notes = req.body?.notes || '';
    const event = AdminEventControlService.verifyEvent(req.params.id, officerId, notes);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/admin/events/:id/resolve-conflict
 */
router.post('/api/discovery/admin/events/:id/resolve-conflict', (req, res) => {
  try {
    const officerId = req.headers['x-user-id'] || 'admin-1';
    const chosenFields = req.body || {};
    const event = AdminEventControlService.resolveConflict(req.params.id, officerId, chosenFields);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/admin/events/:id/cancel
 */
router.post('/api/discovery/admin/events/:id/cancel', (req, res) => {
  try {
    const officerId = req.headers['x-user-id'] || 'admin-1';
    const reason = req.body?.reason || 'Event cancelled by promoter';
    const event = AdminEventControlService.cancelEvent(req.params.id, officerId, reason);

    // Flag / cancel active listings for this event according to existing marketplace rules
    const activeListings = (state.listings || []).filter(l => l.event_id === event.event_id && l.status === 'ACTIVE');
    for (const listing of activeListings) {
      listing.status = 'CANCELLED';
      listing.rejection_reason = `Event dibatalkan oleh pihak resmi: ${reason}`;
    }

    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event, cancelled_listings_count: activeListings.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 4. PROMOTER DISCOVERY & INTELLIGENCE APIS
// ==========================================

/**
 * GET /api/discovery/promoters
 * List promoters with optional filters (verification_status, category, city, apmi_member)
 */
router.get('/api/discovery/promoters', (req, res) => {
  const filter = {
    verification_status: req.query.verification_status,
    category: req.query.category,
    city: req.query.city,
    apmi_member: req.query.apmi_member === 'true'
  };
  const list = promoterRegistry.getAllPromoters(filter);
  res.json({ success: true, count: list.length, promoters: list });
});

/**
 * GET /api/discovery/promoters/dashboard
 * Complete coverage statistics by status, category, city, and duplicate count
 */
router.get('/api/discovery/promoters/dashboard', (req, res) => {
  const stats = promoterRegistry.getDashboardStats();
  res.json({ success: true, ...stats });
});

/**
 * Helper: upcoming canonical events tied to a promoter (by organizer name or source id).
 */
function promoterUpcomingEvents(promoter) {
  const today = new Date().toISOString().substring(0, 10);
  const sourceIds = promoter.source_ids || (promoter.source_id ? [promoter.source_id] : []);
  const name = (promoter.canonical_name || '').toLowerCase();
  return canonicalRegistry.getAllEvents().filter(e => {
    if (e.status === 'CANCELLED') return false;
    const date = e.start_date || e.date;
    if (!date || date < today) return false;
    const orgMatch = e.organizer_name && name && e.organizer_name.toLowerCase().includes(name);
    const srcMatch = (e.sources || []).some(s => s.source_id && sourceIds.includes(s.source_id));
    return Boolean(orgMatch || srcMatch);
  });
}

/**
 * GET /api/discovery/promoters/verification-queue
 * ADMIN ONLY. Bulk review queue: DISCOVERED / IDENTITY_MATCHED / POSSIBLE_DUPLICATE
 * with the evidence/source links the admin needs. Never auto-verifies.
 */
router.get('/api/discovery/promoters/verification-queue', requireDiscoveryAdmin, (req, res) => {
  const queue = promoterRegistry.getVerificationQueue();
  res.json({ success: true, count: queue.length, queue });
});

/**
 * GET /api/discovery/promoters/admin/registry
 * ADMIN ONLY. Registry view with TIKUM filter tokens + operational columns.
 */
router.get('/api/discovery/promoters/admin/registry', requireDiscoveryAdmin, (req, res) => {
  const filter = {
    status: req.query.status || 'ALL',
    category: req.query.category,
    city: req.query.city
  };
  const list = promoterRegistry.queryPromoters(filter);

  const promoters = list.map(p => {
    const upcoming = promoterUpcomingEvents(p);
    return {
      promoter_id: p.promoter_id,
      canonical_name: p.canonical_name,
      instagram_handle: p.instagram_handle,
      instagram_url: p.instagram_url,
      website_url: p.website_url,
      city: p.city,
      category: p.category,
      apmi_member: !!p.apmi_member,
      verification_status: p.verification_status,
      authority_level: p.authority_level,
      last_verified_at: p.last_verified_at || null,
      updated_at: p.updated_at || null,
      upcoming_events_count: upcoming.length,
      possible_duplicates_count: (p.duplicate_candidates || []).length
    };
  });

  res.json({ success: true, count: promoters.length, filter: filter.status, promoters });
});

/**
 * GET /api/discovery/promoters/import/history
 * ADMIN ONLY. Recent admin CSV import audit records.
 */
router.get('/api/discovery/promoters/import/history', requireDiscoveryAdmin, (req, res) => {
  const imports = PromoterImportService.getImportHistory(Number(req.query.limit) || 50);
  res.json({ success: true, count: imports.length, imports });
});

/**
 * POST /api/discovery/promoters/import/preview
 * ADMIN ONLY. Accepts multipart CSV upload (field: file) or JSON { csv_content }.
 * Validates + previews WITHOUT importing. Admin must explicitly confirm next.
 */
router.post('/api/discovery/promoters/import/preview', requireDiscoveryAdmin, optionalCsvUpload, (req, res) => {
  try {
    let csvContent = req.body?.csv_content;
    let filename = req.body?.filename || null;

    if (req.file) {
      csvContent = req.file.buffer.toString('utf8');
      filename = req.file.originalname || filename;
    }
    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ error: 'csv_content or a CSV file upload (field "file") is required', code: 'NO_CONTENT' });
    }
    if (Buffer.byteLength(csvContent, 'utf8') > MAX_CSV_BYTES) {
      return res.status(413).json({ error: `CSV exceeds maximum size of ${MAX_CSV_BYTES} bytes`, code: 'FILE_TOO_LARGE' });
    }

    const preview = PromoterImportService.previewImport(csvContent, { filename });
    res.json({ success: true, ...preview });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

/**
 * POST /api/discovery/promoters/import/confirm
 * ADMIN ONLY. Applies a previously previewed CSV (preview_id) or raw csv_content
 * to the PromoterDiscoveryRegistry. Idempotent, non-destructive, never auto-verifies.
 */
router.post('/api/discovery/promoters/import/confirm', requireDiscoveryAdmin, (req, res) => {
  try {
    const csvContent = req.body?.csv_content;
    const previewId = req.body?.preview_id || null;

    if (!csvContent && !previewId) {
      return res.status(400).json({ error: 'csv_content or preview_id is required to confirm the import', code: 'NO_CONTENT' });
    }
    if (csvContent && Buffer.byteLength(csvContent, 'utf8') > MAX_CSV_BYTES) {
      return res.status(413).json({ error: `CSV exceeds maximum size of ${MAX_CSV_BYTES} bytes`, code: 'FILE_TOO_LARGE' });
    }

    const report = PromoterImportService.confirmImport({
      csv_content: csvContent || null,
      preview_id: previewId,
      filename: req.body?.filename || null,
      admin_id: req.adminUser.id,
      source: req.body?.source || 'ADMIN_CSV_IMPORT'
    });

    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, ...report });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code, structure_errors: err.structure_errors });
  }
});

/**
 * GET /api/discovery/promoters/:id
 * Single promoter profile with provenance claims and linked canonical events
 */
router.get('/api/discovery/promoters/:id', (req, res) => {
  const promoter = promoterRegistry.getPromoterById(req.params.id) || 
                   promoterRegistry.getPromoterBySlug(req.params.id) ||
                   promoterRegistry.getPromoterByHandle(req.params.id);
  if (!promoter) {
    return res.status(404).json({ error: `Promoter ${req.params.id} not found` });
  }

  // Find canonical events associated with this promoter
  const events = canonicalRegistry.getAllEvents().filter(e => {
    return (e.organizer_name && e.organizer_name.toLowerCase().includes(promoter.canonical_name.toLowerCase())) ||
           (e.sources && e.sources.some(s => s.source_id && (promoter.source_ids || []).includes(s.source_id)));
  });

  res.json({ success: true, promoter, events });
});

/**
 * POST /api/discovery/promoters/import
 * ADMIN ONLY (legacy low-level import). Prefer the preview → confirm workflow at
 * /api/discovery/promoters/import/preview + /import/confirm.
 */
router.post('/api/discovery/promoters/import', requireDiscoveryAdmin, (req, res) => {
  try {
    let candidates = [];
    if (req.body.csv_content) {
      candidates = PromoterImportService.parseCSV(req.body.csv_content);
    } else if (Array.isArray(req.body.candidates)) {
      candidates = req.body.candidates;
    } else if (req.body.canonical_name || req.body.promoter_name) {
      candidates = [req.body];
    } else {
      return res.status(400).json({ error: 'Request body must contain csv_content, candidates array, or single candidate' });
    }

    const report = PromoterImportService.importCandidates(candidates);
    res.json({ success: true, ...report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/promoters
 * Registers a single promoter candidate
 */
router.post('/api/discovery/promoters', requireDiscoveryAdmin, (req, res) => {
  try {
    const result = promoterRegistry.registerCandidate(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/promoters/:id/verify
 * Elevates promoter to VERIFIED_OFFICIAL_PROMOTER_ACCOUNT (Tier S Primary Source)
 */
router.post('/api/discovery/promoters/:id/verify', requireDiscoveryAdmin, (req, res) => {
  try {
    const officerId = req.adminUser.id;
    const evidence = req.body?.evidence || 'Verified through official domain / APMI cross-reference';
    const website_match = req.body?.website_match === true;
    const promoter = promoterRegistry.verifyPromoter(req.params.id, { evidence, verified_by: officerId, website_match });
    res.json({ success: true, promoter });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/promoters/:id/match-identity
 * Advances candidate to IDENTITY_MATCHED
 */
router.post('/api/discovery/promoters/:id/match-identity', requireDiscoveryAdmin, (req, res) => {
  try {
    const website_url = req.body?.website_url;
    const evidence = req.body?.evidence;
    const promoter = promoterRegistry.matchIdentity(req.params.id, { website_url, evidence });
    res.json({ success: true, promoter });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/promoters/:id/reject
 */
router.post('/api/discovery/promoters/:id/reject', requireDiscoveryAdmin, (req, res) => {
  try {
    const reason = req.body?.reason || 'Failed identity verification';
    const promoter = promoterRegistry.rejectPromoter(req.params.id, reason);
    res.json({ success: true, promoter });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/promoters/:id/inactivate
 */
router.post('/api/discovery/promoters/:id/inactivate', requireDiscoveryAdmin, (req, res) => {
  try {
    const reason = req.body?.reason || 'Ceased live event production';
    const promoter = promoterRegistry.inactivatePromoter(req.params.id, reason);
    res.json({ success: true, promoter });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/promoters/merge
 */
router.post('/api/discovery/promoters/merge', requireDiscoveryAdmin, (req, res) => {
  try {
    const { target_id, duplicate_id, reason } = req.body;
    if (!target_id || !duplicate_id) {
      return res.status(400).json({ error: 'target_id and duplicate_id are required' });
    }
    const merged = promoterRegistry.mergePromoters(target_id, duplicate_id, reason);
    res.json({ success: true, promoter: merged });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/promoters/:id/posts
 * Ingests a promoter social post announcement.
 * If account is verified official promoter, directly creates/updates CanonicalEvent!
 */
router.post('/api/discovery/promoters/:id/posts', async (req, res) => {
  try {
    const result = await discoverySignalService.processSocialPost(req.body, req.params.id);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/discovery/signals
 */
router.get('/api/discovery/signals', (req, res) => {
  const filter = {
    status: req.query.status,
    promoter_id: req.query.promoter_id
  };
  const list = discoverySignalService.getAllSignals(filter);
  res.json({ success: true, count: list.length, signals: list });
});

/**
 * POST /api/discovery/signals/:id/verify
 */
router.post('/api/discovery/signals/:id/verify', async (req, res) => {
  try {
    const officerId = req.headers['x-user-id'] || 'admin-1';
    const result = await discoverySignalService.verifySignal(req.params.id, {
      verified_by: officerId,
      overridePayload: req.body
    });
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/discovery/events/:id/provenance
 * Returns full field-level provenance, observation snapshots, and change history for an event
 */
router.get('/api/discovery/events/:id/provenance', (req, res) => {
  const provenance = AdminEventControlService.getEventProvenance(req.params.id);
  if (!provenance) {
    return res.status(404).json({ error: `Event ${req.params.id} not found` });
  }

  res.json({
    success: true,
    ...provenance
  });
});

/**
 * GET /api/discovery/conflicts
 * Returns events that currently have conflicts flagged for review
 */
router.get('/api/discovery/conflicts', (req, res) => {
  const conflictingEvents = canonicalRegistry.getAllEvents().filter(e => e.conflicts && e.conflicts.length > 0);
  res.json({
    success: true,
    count: conflictingEvents.length,
    conflicts: conflictingEvents.map(e => ({
      event_id: e.event_id,
      canonical_name: e.canonical_name,
      verification_status: e.verification_status,
      conflicts: e.conflicts,
      primary_source: (e.sources || []).find(s => s.trust_level === 'TIER_S' || s.source_type === 'PROMOTER_OFFICIAL_SOCIAL')
    }))
  });
});

/**
 * GET /api/discovery/admin/intelligence
 * Comprehensive event intelligence dashboard (Real database state only)
 */
router.get('/api/discovery/admin/intelligence', requireDiscoveryAdmin, (req, res) => {
  try {
    const dashboard = AdminEventControlService.getControlDashboard();
    res.json({ success: true, ...dashboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/discovery/admin/sources/health
 * Returns telemetry and circuit-breaker status for all sources
 */
router.get('/api/discovery/admin/sources/health', requireDiscoveryAdmin, (req, res) => {
  try {
    const allSources = sourceRegistry.getAllSources();
    res.json({
      success: true,
      sources: allSources.map(s => ({
        source_id: s.source_id,
        source_name: s.source_name,
        tier: s.tier,
        health_status: s.health_status,
        circuit_breaker: s.circuit_breaker_status,
        consecutive_failures: s.consecutive_failures,
        telemetry: s.telemetry
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/admin/events/:id/verify
 * Officer manually verifies an event with mandatory notes
 */
router.post('/api/discovery/admin/events/:id/verify', requireDiscoveryAdmin, (req, res) => {
  try {
    const officerId = req.adminUser.id;
    const notes = req.body?.notes || req.body?.verification_notes || '';
    const updated = AdminEventControlService.verifyEvent(req.params.id, officerId, notes);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/admin/events/:id/reject
 * Officer manually rejects an event
 */
router.post('/api/discovery/admin/events/:id/reject', requireDiscoveryAdmin, (req, res) => {
  try {
    const officerId = req.adminUser.id;
    const reason = req.body?.reason || req.body?.rejection_reason || 'Manually rejected by officer';
    const updated = AdminEventControlService.rejectEvent(req.params.id, officerId, reason);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/admin/events/:id/conflict/resolve
 * Officer resolves conflicting data fields
 */
router.post('/api/discovery/admin/events/:id/conflict/resolve', requireDiscoveryAdmin, (req, res) => {
  try {
    const officerId = req.adminUser.id;
    const chosenFields = req.body?.chosen_fields || req.body;
    const updated = AdminEventControlService.resolveConflict(req.params.id, officerId, chosenFields);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/admin/events/:id/cancel
 * Cancels an event officially
 */
router.post('/api/discovery/admin/events/:id/cancel', requireDiscoveryAdmin, (req, res) => {
  try {
    const officerId = req.adminUser.id;
    const reason = req.body?.reason || 'Official event cancellation';
    const updated = AdminEventControlService.cancelEvent(req.params.id, officerId, reason);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/discovery/admin/events/:id/expire
 * Marks event as EXPIRED for scheduled re-verification
 */
router.post('/api/discovery/admin/events/:id/expire', requireDiscoveryAdmin, (req, res) => {
  try {
    const officerId = req.adminUser.id;
    const updated = AdminEventControlService.markExpired(req.params.id, officerId);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
