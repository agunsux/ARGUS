/**
 * TIKUM Semantic Internal Linking Service
 * Builds and injects high-value semantic links between Articles, Trust Pages, Events, and Venues.
 *
 * Rules:
 * - Never keyword-stuff.
 * - Maximum 3 - 6 contextual links per article.
 * - Topical cluster graph: Supporting articles link to Pillar Page, and Pillar links out to cluster.
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
    const slug = article.slug || '';
    const category = (article.category || '').toLowerCase();

    // 1. Pillar Link: Every supporting article should link back to the pillar guide
    if (slug !== 'panduan-lengkap-secondary-ticketing-di-indonesia') {
      links.push({
        anchor: 'Panduan Lengkap Secondary Ticketing',
        url: '/blog/panduan-lengkap-secondary-ticketing-di-indonesia',
        title: 'Baca Panduan Lengkap Secondary Ticketing di Indonesia'
      });
    }

    // 2. Trust Page Links based on intent and category
    if (category.includes('safety') || category.includes('scam')) {
      links.push({
        anchor: 'perlindungan pembeli Tikum',
        url: '/buyer-protection',
        title: 'Pelajari Jaminan Perlindungan Pembeli Tikum'
      });
      links.push({
        anchor: 'verifikasi tiket',
        url: '/ticket-verification',
        title: 'Standar Verifikasi Tiket'
      });
      links.push({
        anchor: 'rekening penampungan escrow',
        url: '/escrow',
        title: 'Mekanisme Rekening Escrow Tikum'
      });
    } else if (category.includes('resale') || category.includes('secondary')) {
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
      links.push({
        anchor: 'perlindungan pembeli Tikum',
        url: '/buyer-protection',
        title: 'Perlindungan Pembeli Tikum'
      });
    } else if (category.includes('tikum')) {
      links.push({
        anchor: 'cara kerja Tikum',
        url: '/how-it-works',
        title: 'Pelajari Cara Kerja Tikum'
      });
      links.push({
        anchor: 'rekening penampungan escrow',
        url: '/escrow',
        title: 'Infrastruktur Escrow Tikum'
      });
      links.push({
        anchor: 'perlindungan penjual',
        url: '/seller-protection',
        title: 'Jaminan Perlindungan Penjual'
      });
    } else {
      // General ticket guides
      links.push({
        anchor: 'perlindungan pembeli Tikum',
        url: '/buyer-protection',
        title: 'Perlindungan Pembeli Tikum'
      });
      links.push({
        anchor: 'rekening penampungan escrow',
        url: '/escrow',
        title: 'Infrastruktur Escrow Tikum'
      });
    }

    // 3. Cluster Cross-Links for specific high-value topics
    if (slug.includes('escrow')) {
      links.push({
        anchor: 'escrow vs transfer langsung',
        url: '/blog/escrow-vs-transfer-langsung-mana-yang-lebih-aman',
        title: 'Perbandingan Escrow vs Transfer Langsung'
      });
    }

    if (slug.includes('scam') || slug.includes('penipuan')) {
      links.push({
        anchor: 'double selling tiket',
        url: '/blog/apa-itu-double-selling-tiket-modus-scam',
        title: 'Pahami Modus Double Selling Tiket'
      });
      links.push({
        anchor: 'checklist anti scam tiket',
        url: '/blog/checklist-anti-scam-sebelum-membeli-tiket-konser-online',
        title: 'Checklist Anti Scam Tiket Konser'
      });
    }

    // 4. Event Links if specified or matching
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

    // 5. Venue Links if specified
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

    // Filter out unpublished or scheduled blog articles
    let safeLinks = links;
    try {
      const { articleRepository } = require('../content/ArticleRepository');
      const nowIso = new Date().toISOString();
      safeLinks = links.filter(link => {
        if (!link.url || !link.url.startsWith('/blog/')) return true;
        if (link.url.includes('/blog/category/') || link.url.includes('/blog/editorial-standards') || link.url === '/blog') {
          return true;
        }
        const slug = link.url.replace('/blog/', '').split(/[?#]/)[0];
        const art = articleRepository.getArticleBySlug(slug);
        if (!art) return false;
        if (art.status !== 'published') return false;
        if (art.published_at && art.published_at > nowIso) return false;
        return true;
      });
    } catch (_) {}

    let modified = htmlContent;
    let injectedCount = 0;
    const maxInjections = 5;

    for (const link of safeLinks) {
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
