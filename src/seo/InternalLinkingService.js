/**
 * TIKUM Semantic Internal Linking Service
 * Builds and injects high-value semantic links between Articles, Trust Pages, Events, and Venues.
 *
 * Rules:
 * - Never keyword-stuff.
 * - Maximum 3 - 5 contextual links per article.
 * - Links must be genuinely helpful to users and search engine crawlers.
 */

const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
const { VenueRegistry } = require('../discovery/VenueRegistry');

class InternalLinkingService {
  /**
   * Generates recommended links for an article based on its topic and target entities
   */
  static getRecommendedLinks(article) {
    const links = [];

    // 1. Trust Page Links based on intent
    const category = article.category || '';
    if (category === 'SAFETY' || category === 'TICKET_BUYING') {
      links.push({
        anchor: 'perlindungan pembeli Tikum',
        url: '/buyer-protection',
        title: 'Pelajari Jaminan Perlindungan Pembeli Tikum'
      });
      links.push({
        anchor: 'verifikasi barcode dan tiket',
        url: '/ticket-verification',
        title: 'Standar Verifikasi Tiket'
      });
    }

    if (category === 'RESALE_EDUCATION') {
      links.push({
        anchor: 'rekening penampungan escrow',
        url: '/escrow',
        title: 'Mekanisme Rekening Escrow Tikum'
      });
      links.push({
        anchor: 'prosedur resolusi sengketa',
        url: '/disputes',
        title: 'Prosedur Penyelesaian Sengketa'
      });
    }

    // 2. Event Links if specified or matching
    if (article.target_event_id) {
      const ev = canonicalRegistry.getEventById(article.target_event_id);
      if (ev) {
        links.push({
          anchor: `jadwal tiket ${ev.canonical_name}`,
          url: `/events/${ev.slug}`,
          title: `Halaman Resmi Event ${ev.canonical_name}`
        });
      }
    }

    // 3. Venue Links if specified
    if (article.target_venue_id) {
      const v = VenueRegistry.getVenueBySlug(article.target_venue_id);
      if (v) {
        links.push({
          anchor: `panduan venue ${v.canonical_name}`,
          url: `/venues/${v.slug}`,
          title: `Informasi dan Jadwal di ${v.canonical_name}`
        });
      }
    }

    // Always link to Event Catalog
    links.push({
      anchor: 'katalog event terverifikasi',
      url: '/events',
      title: 'Eksplorasi Seluruh Event Terverifikasi di Indonesia'
    });

    return links;
  }

  /**
   * Contextually enhances HTML content with verified internal links
   */
  static injectContextualLinks(htmlContent, links = []) {
    if (!htmlContent || links.length === 0) return htmlContent;

    let modified = htmlContent;
    let injectedCount = 0;
    const maxInjections = 4;

    for (const link of links) {
      if (injectedCount >= maxInjections) break;

      // Only match anchor text that is not already inside an <a> tag
      const escapedAnchor = link.anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?!(?:[^<]+>|[^>]+<\\/a>))\\b(${escapedAnchor})\\b`, 'i');

      if (regex.test(modified)) {
        modified = modified.replace(regex, `<a href="${link.url}" title="${link.title}" class="seo-internal-link">$1</a>`);
        injectedCount++;
      }
    }

    return modified;
  }
}

module.exports = {
  InternalLinkingService
};

