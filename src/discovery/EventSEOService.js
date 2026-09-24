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
      resaleHtml = `
        <div class="resale-card verified-active">
          <div class="badge-row">
            <span class="badge badge-success"><i class="fa-solid fa-shield-check"></i> ${activeListings.length} Tiket Resale Terverifikasi</span>
            <span class="badge badge-cyan">Mulai Rp ${minPrice.toLocaleString('id-ID')}</span>
          </div>
          <p class="resale-desc">Setiap tiket dilindungi anti-duplikasi barcode, dana tertahan di rekening escrow, dan verifikasi fisik Event PIC di gate ${venue}.</p>
          <div class="resale-grid">
            ${activeListings.map(l => `
              <div class="listing-pill">
                <div>
                  <strong>${l.seat_info || 'General Admission'}</strong>
                  <span class="text-muted"> (Nominal: Rp ${(l.face_value || l.price).toLocaleString('id-ID')})</span>
                </div>
                <div class="listing-action">
                  <span class="price">Rp ${l.price.toLocaleString('id-ID')}</span>
                  <a href="/pay?listing_id=${l.id}" class="btn btn-sm btn-primary">Beli Aman</a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      resaleHtml = `
        <div class="resale-card zero-inventory">
          <div class="zero-state-icon"><i class="fa-solid fa-ticket-simple"></i></div>
          <h3>Saat Ini Belum Ada Tiket Resale Terverifikasi</h3>
          <p>Belum ada pengguna yang mendaftarkan penjualan tiket untuk event ini, atau seluruh tiket secondary sudah terjual.</p>
          <div class="demand-capture-box">
            <p><strong>Ingin notifikasi saat tiket terverifikasi tersedia?</strong></p>
            <form id="demandForm" onsubmit="handleDemandSubmit(event, '${event.event_id}')" class="demand-form">
              <input type="text" id="demandContact" class="form-input" placeholder="Masukkan WhatsApp atau Email Anda" required />
              <button type="submit" class="btn btn-cyan"><i class="fa-solid fa-bell"></i> Ingatkan Saya</button>
            </form>
            <div id="demandFeedback" class="demand-feedback" style="display:none;"></div>
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
          <span class="brand-subtitle">Verified Ticket Marketplace</span>
        </div>
      </a>
      <nav class="main-nav">
        <a href="/events" class="nav-link"><i class="fa-solid fa-calendar-days"></i> Katalog Event</a>
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

  <main class="event-seo-container">
    <nav style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
      <a href="/" style="color: #94a3b8; text-decoration: none;">Beranda</a> &rsaquo; 
      <a href="/events" style="color: #94a3b8; text-decoration: none;">Event</a> &rsaquo; 
      <a href="/events/city/${encodeURIComponent(city.toLowerCase())}" style="color: #94a3b8; text-decoration: none;">${city}</a> &rsaquo; 
      <span style="color: #f8fafc;">${event.canonical_name}</span>
    </nav>

    <article class="event-hero">
      ${event.image_url && event.is_fallback_image !== true ? `
        <figure class="event-poster">
          <img src="${event.image_url}" alt="Poster resmi ${event.canonical_name}" loading="lazy"
               onerror="this.parentElement.style.display='none'">
          <figcaption>
            Poster resmi${event.image_credit ? ` — ${event.image_credit}` : ''}
            ${event.image_source_url ? ` · <a href="${event.image_source_url}" target="_blank" rel="noopener noreferrer nofollow">sumber resmi</a>` : ''}
          </figcaption>
        </figure>
      ` : ''}
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
      <h2 style="font-size: 18px; margin-bottom: 12px;"><i class="fa-solid fa-ticket"></i> Kanal Tiket Resmi</h2>
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
      <h2 style="font-size: 18px; margin-bottom: 12px;"><i class="fa-solid fa-shield-halved"></i> Tiket Resale Terverifikasi di Tikum</h2>
      ${resaleHtml}
    </section>

    <!-- Admission & Trust Protocol -->
    <section class="card" style="background: #0f172a; border-color: #1e293b; padding: 20px; margin-top: 30px;">
      <h3 style="font-size: 16px; margin-bottom: 8px;"><i class="fa-solid fa-user-shield"></i> Protokol Verifikasi Gerbang (TIKUM PIC)</h3>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
        Tipe Tiket: <strong>${event.admission_protocol?.type || 'BARCODE_PLUS_ID'}</strong>. 
        ${event.admission_protocol?.description || 'Verifikasi tiket digital dan fisik di gate acara bersama Event PIC Tikum.'}
      </p>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px; border-top: 1px solid #1e293b; padding-top: 6px;">
        <em>${event.admission_protocol?.verification_disclaimer || 'Verifikasi fisik gerbang memvalidasi kepemilikan dan integritas tiket, namun tidak menggantikan validasi kriptografis langsung dari promotor penerbit tiket.'}</em>
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
      const contact = document.getElementById('demandContact').value;
      const feedback = document.getElementById('demandFeedback');
      
      try {
        const res = await fetch('/api/discovery/demand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, contactInfo: contact })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          feedback.style.display = 'block';
          feedback.style.color = '#10b981';
          feedback.innerHTML = '<i class="fa-solid fa-check-circle"></i> Permintaan dicatat! Kami akan menghubungi Anda segera setelah tiket resale terverifikasi tersedia.';
          document.getElementById('demandContact').value = '';
        } else {
          feedback.style.display = 'block';
          feedback.style.color = '#ef4444';
          feedback.innerText = data.error || 'Gagal mendaftar waitlist.';
        }
      } catch (err) {
        feedback.style.display = 'block';
        feedback.style.color = '#ef4444';
        feedback.innerText = 'Terjadi gangguan koneksi.';
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
