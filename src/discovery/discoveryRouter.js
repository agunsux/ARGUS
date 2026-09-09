/**
 * ARGUS Discovery Router (Epic: Event Discovery & SEO Engine)
 * 
 * Delivers:
 * - Public SSR Landing Pages (/events, /events/:slug, /events/city/:city)
 * - Public Discovery REST APIs (/api/discovery/events, /api/discovery/demand)
 * - Ingestion & Admin Control Center APIs
 */

const express = require('express');
const router = express.Router();
const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { ingestionPipeline } = require('./EventIngestionPipeline');
const { sourceRegistry } = require('./SourceRegistry');
const { demandCapture } = require('./DemandCaptureService');
const { AdminEventControlService } = require('./AdminEventControlService');
const { EventSEOService } = require('./EventSEOService');
const { ListingService } = require('../services/listingService');
const { state, recordAuditLog } = require('../database');
const { renderFooterHtml } = require('../config/businessProfile');

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
  const event = canonicalRegistry.getEventBySlug(slug) || canonicalRegistry.getEventById(slug);

  if (!event) {
    // Fallback: search in state.events if not in registry
    const legacy = (state.events || []).find(e => e.id === slug || e.slug === slug);
    if (!legacy) {
      return res.status(404).send(`<!DOCTYPE html>
        <html><head><title>Event Not Found — ARGUS</title></head>
        <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:50px;">
          <h2>Event Tidak Ditemukan</h2>
          <p>Event yang Anda cari tidak terdaftar atau telah dipindahkan.</p>
          <a href="/events" style="color:#38bdf8;">Kembali ke Katalog Event</a>
        </body></html>`);
    }
    const converted = canonicalRegistry.createEvent(legacy);
    const listings = getActiveResaleListings(converted.event_id);
    const related = canonicalRegistry.getAllEvents().filter(e => e.city === converted.city && e.event_id !== converted.event_id);
    const html = EventSEOService.renderEventPageHtml(converted, listings, related);
    return res.type('html').send(html);
  }

  // Active resale listings attached to this canonical event
  const listings = getActiveResaleListings(event.event_id);
  const related = canonicalRegistry.getAllEvents().filter(e => e.city === event.city && e.event_id !== event.event_id);

  const html = EventSEOService.renderEventPageHtml(event, listings, related);
  res.type('html').send(html);
});

/**
 * GET /events
 * Main Event Discovery Catalog Hub
 */
router.get('/events', (req, res) => {
  const { q, city, category, status } = req.query;
  let allEvents = canonicalRegistry.getAllEvents();

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

  if (status && status.trim()) {
    allEvents = allEvents.filter(e => e.status === status);
  } else {
    // Exclude cancelled by default from public browsing unless asked
    allEvents = allEvents.filter(e => e.status !== 'CANCELLED');
  }

  // Sort upcoming first
  allEvents.sort((a, b) => (a.start_date || '9999-99-99').localeCompare(b.start_date || '9999-99-99'));

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
  <title>Katalog Event Indonesia — Temukan Jadwal Konser, Olahraga &amp; Tiket Terverifikasi | ARGUS</title>
  <meta name="description" content="Eksplorasi seluruh event musik, festival, sepak bola, basket, dan pertunjukan di Jakarta, Bandung, Surabaya, dan Bali. Dapatkan informasi tiket resmi dan transfer tiket terverifikasi.">
  <link rel="canonical" href="https://argus.id/events">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <div class="header-container">
      <a href="/" class="brand">
        <div class="brand-badge"><i class="fa-solid fa-shield-halved"></i></div>
        <div>
          <div class="brand-title">ARGUS</div>
          <span class="brand-subtitle">Event Discovery &amp; Verified Transfer</span>
        </div>
      </a>
      <nav class="main-nav">
        <a href="/events" class="nav-link active"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
        <a href="/offers" class="nav-link"><i class="fa-solid fa-handshake"></i> Tawaran Tiket</a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> Jual Tiket</a>
        <a href="/track" class="nav-link"><i class="fa-solid fa-magnifying-glass"></i> Lacak Status</a>
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

// ==========================================
// 2. PUBLIC DISCOVERY REST APIS
// ==========================================

/**
 * GET /api/discovery/events
 * JSON listing of canonical events with search, city, category filters
 */
router.get('/api/discovery/events', (req, res) => {
  const { q, city, category, status } = req.query;
  let allEvents = canonicalRegistry.getAllEvents();

  if (q && q.trim()) {
    const term = q.toLowerCase().trim();
    allEvents = allEvents.filter(e => 
      (e.canonical_name || '').toLowerCase().includes(term) ||
      (e.venue_name || '').toLowerCase().includes(term) ||
      (e.city || '').toLowerCase().includes(term)
    );
  }

  if (city && city.trim()) {
    allEvents = allEvents.filter(e => (e.city || '').toLowerCase().includes(city.toLowerCase().trim()));
  }

  if (category && category.trim()) {
    allEvents = allEvents.filter(e => (e.event_type || e.category || '').toUpperCase() === category.toUpperCase().trim());
  }

  if (status && status.trim()) {
    allEvents = allEvents.filter(e => e.status === status);
  }

  const eventsWithMetadata = allEvents.map(e => {
    const activeListings = getActiveResaleListings(e.event_id);
    return {
      ...e,
      active_listings_count: activeListings.length,
      min_price: activeListings.length > 0 ? Math.min(...activeListings.map(l => l.price)) : null
    };
  });

  res.json({
    success: true,
    total: eventsWithMetadata.length,
    events: eventsWithMetadata
  });
});

/**
 * GET /api/discovery/events/:slugOrId
 * Detailed JSON for a single canonical event
 */
router.get('/api/discovery/events/:slugOrId', (req, res) => {
  const param = req.params.slugOrId;
  const event = canonicalRegistry.getEventBySlug(param) || canonicalRegistry.getEventById(param);

  if (!event) {
    return res.status(404).json({ error: 'Event not found in Canonical Registry', code: 'EVENT_NOT_FOUND' });
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

module.exports = router;
