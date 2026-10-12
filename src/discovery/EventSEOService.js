/**
 * ARGUS Event SEO Service
 * 
 * Generates:
 * - Schema.org JSON-LD Structured Data (Event, MusicEvent, SportsEvent)
 * - Meta Title, Descriptions, Canonical Tags, OpenGraph & Twitter Cards
 * - Fast Server-Rendered HTML for Google Search / Discover / AI Search Engines
 * - Internal Linking Graph
 */

const { renderFooterHtml } = require('../config/businessProfile');
const { EventTemporalLifecycleEngine } = require('./EventTemporalLifecycleEngine');
const { CanonicalFeeEngine } = require('../pricing/CanonicalFeeEngine');

class EventSEOService {
  /**
   * Builds Schema.org JSON-LD structured data for an event.
   */
  static buildStructuredData(event, activeListings = []) {
    let schemaType = 'Event';
    const evType = (event.event_type || event.category || '').toUpperCase();

    if (evType.includes('SPORT') || evType.includes('FOOTBALL') || evType.includes('BASKETBALL') || evType.includes('BADMINTON') || evType.includes('RUNNING')) {
      schemaType = 'SportsEvent';
    } else if (evType.includes('CONCERT') || evType.includes('MUSIC') || evType.includes('FESTIVAL')) {
      schemaType = 'MusicEvent';
    } else if (evType.includes('THEATER') || evType.includes('COMEDY')) {
      schemaType = 'TheaterEvent';
    }

    const isPastOrConcluded = !EventTemporalLifecycleEngine.isEventUpcoming(event);
    let schemaStatus = 'https://schema.org/EventScheduled';
    if (event.status === 'CANCELLED' || event.lifecycle_status === 'CANCELLED') {
      schemaStatus = 'https://schema.org/EventCancelled';
    } else if (event.status === 'POSTPONED' || event.lifecycle_status === 'POSTPONED') {
      schemaStatus = 'https://schema.org/EventPostponed';
    } else if (isPastOrConcluded) {
      schemaStatus = 'https://schema.org/EventCompleted';
    }

    const startDateIso = event.start_datetime || `${event.start_date || event.date}T19:00:00+07:00`;
    const endDateIso = event.end_datetime || (event.end_date ? `${event.end_date}T23:00:00+07:00` : null);

    const schema = {
      '@context': 'https://schema.org',
      '@type': schemaType,
      'name': event.canonical_name || event.name || event.title,
      'description': event.description,
      'startDate': startDateIso,
      'eventStatus': schemaStatus,
      'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
      'location': {
        '@type': 'Place',
        'name': event.venue_name || 'Venue',
        'address': {
          '@type': 'PostalAddress',
          'addressLocality': event.city || event.venue_city || 'Jakarta',
          'addressRegion': event.province || 'DKI Jakarta',
          'addressCountry': 'ID'
        }
      },
      'organizer': {
        '@type': 'Organization',
        'name': event.organizer_name || 'Promoter',
        'url': event.official_event_url || undefined
      }
    };

    if (endDateIso) {
      schema.endDate = endDateIso;
    }

    if (event.event_image || event.poster_url) {
      schema.image = [event.event_image || event.poster_url];
    }

    // Offers: Accurately distinguish official primary ticket from secondary resale
    const offers = [];
    if (!isPastOrConcluded) {
      if (event.official_ticket_url) {
        offers.push({
          '@type': 'Offer',
          'name': `Tiket Resmi (${event.official_ticketing_provider || 'Official Primary Provider'})`,
          'url': event.official_ticket_url,
          'availability': event.status === 'SOLD_OUT' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
          'priceCurrency': 'IDR',
          'validFrom': event.created_at || '2026-01-01'
        });
      }

      // If Tikum verified resale listings exist, list them as secondary market offers
      if (activeListings && activeListings.length > 0) {
        const minPrice = Math.min(...activeListings.map(l => l.price));
        offers.push({
          '@type': 'AggregateOffer',
          'name': 'Tikum Verified Resale Inventory',
          'url': `https://tikum.app/events/${event.slug}`,
          'priceCurrency': 'IDR',
          'lowPrice': minPrice,
          'offerCount': activeListings.length,
          'availability': 'https://schema.org/InStock'
        });
      }
    }

    if (offers.length > 0) {
      schema.offers = offers;
    }

    return schema;
  }

  /**
   * Generates complete SSR HTML for the event landing page.
   */
  static renderEventPageHtml(event, activeListings = [], relatedEvents = []) {
    const isPastOrConcluded = !EventTemporalLifecycleEngine.isEventUpcoming(event);
    const validRelated = (relatedEvents || []).filter(e => EventTemporalLifecycleEngine.isEventUpcoming(e));
    const jsonLd = JSON.stringify(this.buildStructuredData(event, activeListings));
    const title = `${event.canonical_name} — Jadwal, Lokasi, Tiket Resmi & Resale Terverifikasi | Tikum`;
    const metaDesc = `Informasi lengkap ${event.canonical_name} di ${event.venue_name}, ${event.city} tanggal ${event.start_date || event.date}. Cek ketersediaan tiket resmi dan perlindungan transfer tiket resale aman Tikum.`;
    const canonicalUrl = `https://tikum.app/events/${event.slug}`;

    let robotsDirective = 'noindex, follow';
    if ((event.verification_status === 'VERIFIED' || event.verification_status === 'PRIMARY_SOURCE_VERIFIED') && event.is_verified && event.status !== 'CANCELLED' && event.status !== 'POSTPONED') {
      robotsDirective = 'index, follow';
    } else if (event.verification_status === 'REJECTED') {
      robotsDirective = 'noindex, nofollow';
    } else {
      robotsDirective = 'noindex, follow';
    }

    const dateFormatted = event.start_date || event.date || 'TBA';
    const city = event.city || event.venue_city || 'Jakarta';
    const venue = event.venue_name || 'Venue TBA';
    const category = event.event_type || event.category || 'EVENT';
    const confidence = event.verification_confidence || 0;
    const isVerified = event.is_verified || false;

    // Resale section rendering
    let resaleHtml = '';
    if (isPastOrConcluded) {
      resaleHtml = `
        <div class="resale-card" style="background:#1e293b; border:1px solid #334155; text-align:center; padding:30px 20px; border-radius:12px; margin-bottom:24px;">
          <div style="font-size:36px; color:#94a3b8; margin-bottom:12px;"><i class="fa-solid fa-calendar-check"></i></div>
          <h3 style="color:#f8fafc; margin-bottom:8px;">Event Ini Telah Berakhir</h3>
          <p style="color:#94a3b8; font-size:14px; max-width:520px; margin:0 auto;">
            Acara ini telah terlaksana pada ${dateFormatted}. Seluruh transaksi tiket resale dan layanan escrow untuk event ini telah selesai dan ditutup.
          </p>
        </div>
      `;
    } else if (activeListings && activeListings.length > 0) {
      const minPrice = Math.min(...activeListings.map(l => l.price));
      const hasEventPic = Boolean(event.has_venue_assist || event.has_pic || event.venue_assist_status === 'PIC_AVAILABLE' || event.venue_assist_status === 'PIC_ON_SITE');
      const gateVerificationText = hasEventPic
        ? `verifikasi fisik Event PIC Tikum di gerbang ${venue}`
        : `validasi barcode resmi turnstile di gerbang ${venue}`;
      resaleHtml = `
        <div class="resale-card verified-active">
          <div class="badge-row">
            <span class="badge badge-success"><i class="fa-solid fa-shield-check"></i> ${activeListings.length} Tiket Resale Terverifikasi</span>
            <span class="badge badge-cyan">Mulai Rp ${minPrice.toLocaleString('id-ID')}</span>
          </div>
          <p class="resale-desc">Setiap tiket dilindungi anti-duplikasi barcode, dana tertahan di rekening escrow, dan ${gateVerificationText}.</p>
          <div class="resale-grid">
            ${activeListings.map(l => {
              const basePrice = Math.max(0, Math.round(l.price || 0));
              let fee = 0;
              let totalPrice = basePrice;
              if (basePrice > 0) {
                try {
                  const pricing = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: basePrice, quantity: 1 });
                  fee = pricing.buyer_fee;
                  totalPrice = pricing.buyer_total;
                } catch {
                  fee = Math.max(10000, Math.min(Math.floor((basePrice * 6) / 100), 300000));
                  totalPrice = basePrice + fee;
                }
              }
              const section = l.section || l.ticket_type || l.category || 'General Admission';
              const seat = l.seat_info || 'Festival / Free Standing';
              const hasEventPic = Boolean(event.has_venue_assist || event.has_pic || event.venue_assist_status === 'PIC_AVAILABLE' || event.venue_assist_status === 'PIC_ON_SITE');
              const picProtectionText = hasEventPic
                ? 'Dilindungi Rekening Escrow &amp; Event PIC Tikum di Gate'
                : 'Dilindungi Rekening Escrow &amp; Validasi Gate Turnstile';
              return `
              <div class="listing-pill" style="display:flex; flex-direction:column; gap:12px; padding:18px; border-radius:12px; background:var(--color-surface, #FFFFFF); border:1px solid var(--color-border, #E5E7EB); box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                  <div>
                    <div style="font-size:15px; font-weight:800; color:var(--color-text-primary, #111827);">${section}</div>
                    <div style="font-size:12.5px; color:var(--color-text-muted, #6B7280);"><i class="fa-solid fa-chair"></i> ${seat} &nbsp;·&nbsp; <i class="fa-solid fa-ticket"></i> Jumlah: 1 tiket</div>
                  </div>
                  <span class="badge badge-success" style="font-size:11px; font-weight:700;"><i class="fa-solid fa-user-check"></i> Penjual Terverifikasi</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; background:var(--color-surface-muted, #F8F9FA); padding:12px 14px; border-radius:8px; font-size:12px; border:1px solid var(--color-border-subtle, #F3F4F6);">
                  <div>
                    <span style="color:var(--color-text-muted, #6B7280); display:block; margin-bottom:2px;">Harga Penjual</span>
                    <strong style="font-size:13.5px; color:var(--color-text-primary, #111827);">Rp ${basePrice.toLocaleString('id-ID')}</strong>
                  </div>
                  <div>
                    <span style="color:var(--color-text-muted, #6B7280); display:block; margin-bottom:2px;">Biaya TIKUM (6% (minimum Rp35.000 per tiket))</span>
                    <strong style="font-size:13.5px; color:var(--color-text-secondary, #4B5563);">Rp ${fee.toLocaleString('id-ID')}</strong>
                  </div>
                  <div>
                    <span style="color:var(--color-brand-primary, #B8472F); font-weight:700; display:block; margin-bottom:2px;">Total Pembeli (All-In)</span>
                    <strong style="font-size:15px; font-weight:800; color:var(--color-brand-primary, #B8472F);">Rp ${totalPrice.toLocaleString('id-ID')}</strong>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding-top:6px;">
                  <div style="font-size:11.5px; color:#047857; font-weight:600; display:flex; align-items:center; gap:5px;">
                    <i class="fa-solid fa-shield-halved"></i> ${picProtectionText}
                  </div>
                  <a href="/pay?listing_id=${l.id}" class="btn btn-sm btn-primary" style="padding:10px 20px; font-weight:700; border-radius:8px; text-decoration:none;">
                    <i class="fa-solid fa-lock"></i> Beli Aman via Escrow
                  </a>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      const { demandCapture } = require('./DemandCaptureService');
      const demandStats = demandCapture.getPublicDemandStats(event.event_id || event.id);
      const demandBadgeHtml = demandStats.show_count
        ? `<div style="display:inline-flex; align-items:center; gap:6px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:6px 14px; border-radius:9999px; font-size:12.5px; font-weight:700; margin-bottom:12px;"><i class="fa-solid fa-users"></i> ${demandStats.badge_text}</div>`
        : `<div style="display:inline-flex; align-items:center; gap:6px; background:#f8fafc; color:#64748b; border:1px solid #e2e8f0; padding:6px 14px; border-radius:9999px; font-size:12px; font-weight:600; margin-bottom:12px;"><i class="fa-solid fa-bell"></i> ${demandStats.badge_text}</div>`;

      resaleHtml = `
        <div class="resale-card zero-inventory" style="padding:24px; border-radius:14px; background:var(--color-surface, #FFFFFF); border:1px solid var(--color-border, #E5E7EB); text-align:center;">
          <div class="zero-state-icon" style="font-size:32px; color:var(--color-brand-primary, #B8472F); margin-bottom:12px;"><i class="fa-solid fa-ticket-simple"></i></div>
          <h3 style="font-size:18px; font-weight:800; color:var(--color-text-primary, #111827); margin-bottom:6px;">Saat Ini Belum Ada Tiket Resale Terverifikasi</h3>
          <p style="font-size:13.5px; color:var(--color-text-muted, #6B7280); max-width:540px; margin:0 auto 16px;">Belum ada pengguna yang mendaftarkan penjualan tiket untuk event ini, atau seluruh tiket secondary sudah terjual.</p>

          <div class="demand-capture-box" style="background:var(--color-surface-muted, #F8F9FA); border:1px solid var(--color-border-subtle, #E5E7EB); border-radius:12px; padding:20px; max-width:520px; margin:0 auto; text-align:left;">
            <div style="text-align:center;">${demandBadgeHtml}</div>
            <p style="font-size:14px; font-weight:700; color:var(--color-text-primary, #111827); margin-bottom:12px; text-align:center;">Ingin dikabari segera saat tiket tersedia?</p>

            <form id="demandForm" onsubmit="handleDemandSubmit(event, '${event.event_id || event.id}')" class="demand-form" style="display:flex; flex-direction:column; gap:12px;">
              <div>
                <label for="demandContact" style="font-size:12px; font-weight:600; color:var(--color-text-secondary, #4B5563); display:block; margin-bottom:4px;">Kontak WhatsApp atau Email *</label>
                <input type="text" id="demandContact" class="form-input" placeholder="08123456789 atau nama@email.com" required style="width:100%; padding:10px 14px; border-radius:8px; border:1px solid var(--color-border, #D1D5DB); font-size:13.5px;" />
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                  <label for="demandQty" style="font-size:12px; font-weight:600; color:var(--color-text-secondary, #4B5563); display:block; margin-bottom:4px;">Jumlah Tiket *</label>
                  <select id="demandQty" class="form-input" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--color-border, #D1D5DB); font-size:13px;">
                    <option value="1">1 Tiket</option>
                    <option value="2" selected>2 Tiket</option>
                    <option value="3">3 Tiket</option>
                    <option value="4">4 Tiket</option>
                  </select>
                </div>
                <div>
                  <label for="demandMaxPrice" style="font-size:12px; font-weight:600; color:var(--color-text-secondary, #4B5563); display:block; margin-bottom:4px;">Budget Maksimal / Tiket</label>
                  <input type="text" id="demandMaxPrice" class="form-input" placeholder="Contoh: Rp 750.000 (opsional)" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--color-border, #D1D5DB); font-size:13px;" />
                </div>
              </div>

              <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; color:var(--color-text-muted, #6B7280); cursor:pointer; margin-top:2px;">
                <input type="checkbox" id="demandConsent" required checked style="margin-top:3px;" />
                <span>Saya setuju dihubungi Tikum via WhatsApp atau Email jika ada tiket tersedia (sesuai UU Perlindungan Data Pribadi).</span>
              </label>

              <button type="submit" class="btn btn-primary" style="padding:11px 18px; font-weight:700; border-radius:8px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; font-size:14px; margin-top:4px;">
                <i class="fa-solid fa-bell"></i> Kabari Saya / Ingatkan Saya Saat Tiket Tersedia
              </button>
            </form>
            <div id="demandFeedback" class="demand-feedback" style="display:none; padding:12px; border-radius:8px; margin-top:12px; font-size:13px; font-weight:600;"></div>
          </div>
        </div>
      `;
    }

    // Official ticket section
    let officialTicketHtml = '';
    if (isPastOrConcluded) {
      officialTicketHtml = `
        <div class="official-ticket-box" style="opacity:0.8;">
          <div class="official-header">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <div>
              <strong>Dokumentasi Acara Terlaksana</strong>
              <div class="text-muted">${event.organizer_name || 'Official Organizer'}</div>
            </div>
          </div>
          <div class="official-action">
            <span class="badge badge-slate">Acara Selesai</span>
          </div>
        </div>
      `;
    } else if (event.official_ticket_url) {
      officialTicketHtml = `
        <div class="official-ticket-box">
          <div class="official-header">
            <i class="fa-solid fa-building-circle-check"></i>
            <div>
              <strong>Sumber Tiket Resmi (Primary Provider)</strong>
              <div class="text-muted">${event.official_ticketing_provider || 'Penyelenggara / Mitra Resmi'}</div>
            </div>
          </div>
          <div class="official-action">
            <a href="${event.official_ticket_url}" target="_blank" rel="noopener noreferrer nofollow" class="btn btn-outline">
              Buka Halaman Tiket Resmi <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
          </div>
        </div>
      `;
    } else {
      officialTicketHtml = `
        <div class="official-ticket-box unverified">
          <div class="official-header">
            <i class="fa-solid fa-circle-info"></i>
            <div>
              <strong>Kanal Tiket Resmi Belum Terdaftar</strong>
              <div class="text-muted">Tikum sedang memverifikasi kanal penjualan tiket resmi dengan promotor terkait.</div>
            </div>
          </div>
        </div>
      `;
    }

    // Related events section
    let relatedHtml = '';
    if (validRelated && validRelated.length > 0) {
      relatedHtml = `
        <section class="related-events-section">
          <h3>Event Terkait di ${city}</h3>
          <div class="related-grid">
            ${validRelated.slice(0, 4).map(re => `
              <a href="/events/${re.slug}" class="related-card">
                <span class="badge badge-sm">${re.category || re.event_type}</span>
                <h4>${re.canonical_name || re.name}</h4>
                <div class="text-muted"><i class="fa-solid fa-calendar"></i> ${re.start_date || re.date}</div>
                <div class="text-muted"><i class="fa-solid fa-location-dot"></i> ${re.venue_name}</div>
              </a>
            `).join('')}
          </div>
        </section>
      `;
    }

    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${metaDesc}">
  <meta name="robots" content="${robotsDirective}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- OpenGraph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:site_name" content="Tikum">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${metaDesc}">
  
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/style.css">
  
  <script type="application/ld+json">
  ${jsonLd}
  </script>
  <style>
    .event-seo-container { max-width: 1000px; margin: 0 auto; padding: 24px 16px; }
    .event-hero { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 28px; margin-bottom: 24px; }
    .event-poster { margin: 0 0 20px; border-radius: 10px; overflow: hidden; border: 1px solid #1e293b; background: #0b1120; }
    .event-poster img { display: block; width: 100%; height: auto; max-height: 420px; object-fit: cover; }
    .event-poster figcaption { padding: 8px 12px; font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .event-poster figcaption a { color: inherit; text-decoration: underline; }
    .event-meta-strip { display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 0; color: #94a3b8; font-size: 14px; }
    .event-meta-item { display: flex; align-items: center; gap: 8px; }
    .official-ticket-box { background: #131d31; border: 1px solid #2563eb; border-radius: 10px; padding: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    .resale-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .resale-card.verified-active { border-color: #10b981; }
    .resale-grid { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
    .listing-pill { background: #1e293b; padding: 12px 18px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .demand-capture-box { background: #1a2333; padding: 18px; border-radius: 8px; margin-top: 14px; }
    .demand-form { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .demand-form input { flex: 1; min-width: 220px; padding: 10px 14px; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; }
    .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 16px; }
    .related-card { background: #131d31; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; text-decoration: none; color: inherit; display: block; }
    .badge-row { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  </style>
</head>
<body>

  <!-- Site Header -->
  <header class="site-header">
    <div class="header-container">
      <a href="/" class="brand">
        <div class="brand-badge"><i class="fa-solid fa-shield-halved"></i></div>
        <div>
          <div class="brand-title">Tikum</div>
          <span class="brand-subtitle" data-i18n="brand.subtitle">Pasar Tiket Event Terverifikasi</span>
        </div>
      </a>
      <nav class="main-nav">
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> <span data-i18n="nav.events">Katalog Event</span></a>
        <a href="/offers" class="nav-link"><i class="fa-solid fa-handshake"></i> <span data-i18n="nav.offers">Tawaran Tiket</span></a>
        <a href="/create" class="nav-link"><i class="fa-solid fa-plus-circle"></i> <span data-i18n="nav.sellTicket">Jual Tiket</span></a>
        <a href="/track" class="nav-link"><i class="fa-solid fa-magnifying-glass"></i> <span data-i18n="nav.track">Lacak Status</span></a>
        <div class="nav-controls" style="display: inline-flex; gap: 8px; margin-left: 12px; align-items: center;">
          <button id="btnLangToggle" class="btn btn-secondary btn-sm" onclick="window.TikumI18n ? window.TikumI18n.toggleLang() : null" style="padding: 4px 10px; font-size: 12px; font-weight: 700;">ID</button>
          <button id="btnThemeToggle" class="btn btn-secondary btn-sm" onclick="window.TikumI18n ? window.TikumI18n.toggleTheme() : null" style="padding: 4px 10px; font-size: 12px;" title="Toggle Dark/Light Mode"><i class="fa-solid fa-moon"></i></button>
        </div>
      </nav>
    </div>
  </header>

  <main class="event-seo-container">
    <nav style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
      <a href="/" style="color: #94a3b8; text-decoration: none;" data-i18n="nav.home">Beranda</a> &rsaquo;
      <a href="/events" style="color: #94a3b8; text-decoration: none;" data-i18n="nav.events">Event</a> &rsaquo;
      <a href="/events/city/${encodeURIComponent(city.toLowerCase())}" style="color: #94a3b8; text-decoration: none;">${city}</a> &rsaquo; 
      <span style="color: #f8fafc;">${event.canonical_name}</span>
    </nav>

    <article class="event-hero">
      ${(() => {
        const posterAlt = `${event.canonical_name} — ${venue}, ${city}`.replace(/"/g, '&quot;');
        const officialSrcUrl = event.image_source_url || event.official_event_url || event.official_ticket_url || event.source_url || null;
        const posterAttrText = event.image_attribution || (event.image_credit ? `Sumber: ${event.image_credit}` : (event.official_ticketing_provider ? `Sumber: ${event.official_ticketing_provider}` : 'Sumber resmi penyelenggara'));
        const hasVerifiedPoster = Boolean(event.image_url && event.is_fallback_image !== true && event.image_status !== 'FALLBACK' && event.image_status !== 'BROKEN');
        const fallbackBannerHtml = `
          <div class="event-poster-fallback" style="display:${hasVerifiedPoster ? 'none' : 'flex'}; flex-direction:column; align-items:center; justify-content:center; min-height:180px; padding:24px; background:linear-gradient(145deg,#131d31,#0b1120); text-align:center; gap:8px;">
            <div style="width:42px; height:42px; border-radius:50%; background:rgba(56,189,248,0.12); display:flex; align-items:center; justify-content:center; color:#38bdf8; font-size:18px;">
              <i class="fa-solid fa-ticket"></i>
            </div>
            <div style="font-size:14px; font-weight:700; color:#e2e8f0;">Poster Resmi Belum Tersedia dari Sumber</div>
            <div style="font-size:12px; color:#94a3b8; max-width:520px;">
              Event ini telah terverifikasi di katalog TIKUM (${event.image_status || 'SOURCE_LINK_ONLY'}). Silakan kunjungi halaman resmi penyelenggara atau mitra tiket untuk informasi visual terbaru.
            </div>
            ${officialSrcUrl ? `<a href="${officialSrcUrl}" target="_blank" rel="noopener noreferrer nofollow" style="margin-top:4px; font-size:12px; color:#38bdf8; font-weight:600; text-decoration:underline;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Lihat di Sumber Resmi</a>` : ''}
          </div>
        `;
        return `
          <figure class="event-poster" data-image-status="${event.image_status || (hasVerifiedPoster ? 'VERIFIED_AUTHORIZED_SELLER' : 'SOURCE_LINK_ONLY')}">
            ${hasVerifiedPoster ? `
              <img src="${event.image_url}" alt="${posterAlt}" loading="lazy" decoding="async"
                   onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
            ` : ''}
            ${fallbackBannerHtml}
            <figcaption>
              ${hasVerifiedPoster ? `Poster resmi · ${posterAttrText}` : `Status visual: ${event.image_status || 'SOURCE_LINK_ONLY'} · ${posterAttrText}`}
              ${officialSrcUrl ? ` · <a href="${officialSrcUrl}" target="_blank" rel="noopener noreferrer nofollow">sumber resmi</a>` : ''}
            </figcaption>
          </figure>
        `;
      })()}
      <div class="badge-row">
        <span class="badge badge-primary">${category}</span>
        ${isVerified ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Terverifikasi Tikum (${confidence}%)</span>` : `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Dalam Verifikasi (${confidence}%)</span>`}
      </div>

      <h1 style="font-size: 28px; font-weight: 800; margin: 12px 0;">${event.canonical_name}</h1>
      
      <div class="event-meta-strip">
        <div class="event-meta-item"><i class="fa-solid fa-calendar-day" style="color: #38bdf8;"></i> <span>${dateFormatted}</span></div>
        <div class="event-meta-item"><i class="fa-solid fa-location-dot" style="color: #f43f5e;"></i> <span>${venue}, ${city}</span></div>
        <div class="event-meta-item"><i class="fa-solid fa-user-group" style="color: #a855f7;"></i> <span>Penyelenggara: ${event.organizer_name}</span></div>
      </div>

      <p style="color: #cbd5e1; line-height: 1.6; margin-top: 16px;">${event.description}</p>
    </article>

    <!-- Section 1: Official Ticket Destination (Strictly Separated) -->
    <section>
      <h2 style="font-size: 18px; margin-bottom: 12px;"><i class="fa-solid fa-ticket"></i> <span data-i18n="events.officialTickets">Kanal Tiket Resmi</span></h2>
      ${officialTicketHtml}
    </section>

    <!-- Section 1b: Official source attribution (compliance policy §6.3) -->
    <section style="margin-top: 16px;">
      <p style="font-size: 11px; line-height: 1.8; color: #94a3b8; background: #0b1120; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 14px;">
        <strong style="color:#cbd5e1;">Atribusi sumber resmi.</strong>
        Data faktual event ini dihimpun dari kanal publik resmi penyelenggara dan mitra ticketing
        ${event.source_url ? `(<a href="${event.source_url}" target="_blank" rel="noopener noreferrer nofollow" style="color:#38bdf8;">sumber</a>)` : ''}
        ${event.verification_status ? `dan diverifikasi melalui kanal otoritatif resmi (status: ${event.verification_status}${event.verification_confidence ? `, keyakinan ${event.verification_confidence}%` : ''}).` : '.'}
        Tikum tidak menyalin materi promosi; hanya menyimpan nama event, jadwal, venue, kota, harga, tautan resmi, serta poster resmi dengan kredit penyelenggara.
      </p>
    </section>

    <!-- Section 2: Tikum Secondary Resale Market -->
    <section style="margin-top: 30px;">
      <h2 style="font-size: 18px; margin-bottom: 12px;"><i class="fa-solid fa-shield-halved"></i> <span data-i18n="events.resaleInventory">Tiket Resale Terverifikasi di Tikum</span></h2>
      ${resaleHtml}
    </section>

    <!-- Admission & Trust Protocol -->
    <section class="card" style="background: #0f172a; border-color: #1e293b; padding: 20px; margin-top: 30px; border-radius: 12px;">
      <h3 style="font-size: 16px; margin-bottom: 8px;"><i class="fa-solid fa-user-shield"></i> <span data-i18n="events.gateProtocol">Protokol Verifikasi Gerbang (TIKUM PIC)</span></h3>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
        Tipe Tiket: <strong>${event.admission_protocol?.type || 'BARCODE_PLUS_ID'}</strong>. 
        ${event.admission_protocol?.description || 'Verifikasi tiket digital dan fisik di gate acara bersama Event PIC Tikum.'}
      </p>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px; border-top: 1px solid #1e293b; padding-top: 6px;">
        <em>${event.admission_protocol?.verification_disclaimer || 'Verifikasi fisik gerbang memvalidasi kepemilikan dan integritas tiket, namun tidak menggantikan validasi kriptografis langsung dari promotor penerbit tiket.'}</em>
      </div>
    </section>

    <!-- FAQ Section -->
    <section style="margin-top: 30px;">
      <h3 style="font-size: 18px; margin-bottom: 14px;"><i class="fa-solid fa-circle-question"></i> Tanya Jawab Seputar Event Ini</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
        <div style="background: #0f172a; border: 1px solid #1e293b; padding: 16px; border-radius: 10px;">
          <h4 style="font-size: 13.5px; font-weight: 700; margin-bottom: 6px; color: #f8fafc;">Apakah tiket resale ini aman?</h4>
          <p style="font-size: 12.5px; color: #94a3b8; line-height: 1.5; margin: 0;">Ya. Setiap tiket sekunder diverifikasi identitas dan barcode kepemilikannya. Dana Anda tersimpan aman di rekening escrow hingga Anda sukses masuk gerbang acara.</p>
        </div>
        <div style="background: #0f172a; border: 1px solid #1e293b; padding: 16px; border-radius: 10px;">
          <h4 style="font-size: 13.5px; font-weight: 700; margin-bottom: 6px; color: #f8fafc;">Bagaimana peran staf PIC Tikum di lokasi?</h4>
          <p style="font-size: 12.5px; color: #94a3b8; line-height: 1.5; margin: 0;">Pada event dengan pendampingan aktif, staf operasional (Event PIC Tikum) siap mendampingi pembeli di sekitar venue jika terjadi hambatan saat penukaran gelang atau scanning barcode turnstile.</p>
        </div>
      </div>
    </section>

    <!-- Section 3: Related Events in Same City -->
    ${relatedHtml}
  </main>

  ${renderFooterHtml()}

  <script src="/js/i18n.js"></script>

  <script>
    async function handleDemandSubmit(e, eventId) {
      e.preventDefault();
      const contactInput = document.getElementById('demandContact');
      const qtyInput = document.getElementById('demandQty');
      const maxPriceInput = document.getElementById('demandMaxPrice');
      const consentInput = document.getElementById('demandConsent');
      const feedback = document.getElementById('demandFeedback');

      const contact = contactInput ? contactInput.value.trim() : '';
      const qty = qtyInput ? qtyInput.value : 1;
      const maxPrice = maxPriceInput ? maxPriceInput.value.trim() : null;
      const consent = consentInput ? consentInput.checked : false;

      if (!consent) {
        feedback.style.display = 'block';
        feedback.style.background = '#fef2f2';
        feedback.style.border = '1px solid #fecaca';
        feedback.style.color = '#dc2626';
        feedback.innerText = 'Persetujuan dihubungi wajib dicentang sesuai UU Pelindungan Data Pribadi.';
        return;
      }

      try {
        const res = await fetch('/api/discovery/demand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, contact, qty, maxPrice, consent })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          feedback.style.display = 'block';
          feedback.style.background = '#ecfdf5';
          feedback.style.border = '1px solid #a7f3d0';
          feedback.style.color = '#059669';
          feedback.innerHTML = '<i class="fa-solid fa-check-circle"></i> ' + (data.message || 'Permintaan dicatat! Kami akan menghubungi Anda segera setelah tiket terverifikasi tersedia.');
          contactInput.value = '';
          if (maxPriceInput) maxPriceInput.value = '';
        } else {
          feedback.style.display = 'block';
          feedback.style.background = '#fef2f2';
          feedback.style.border = '1px solid #fecaca';
          feedback.style.color = '#dc2626';
          feedback.innerText = data.error || 'Gagal mendaftar waitlist.';
        }
      } catch (err) {
        feedback.style.display = 'block';
        feedback.style.background = '#fef2f2';
        feedback.style.border = '1px solid #fecaca';
        feedback.style.color = '#dc2626';
        feedback.innerText = 'Terjadi gangguan koneksi. Silakan coba kembali.';
      }
    }
  </script>
</body>
</html>`;
  }
}

module.exports = {
  EventSEOService
};
