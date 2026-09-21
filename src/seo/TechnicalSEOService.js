/**
 * TIKUM Technical SEO Service
 * Manages Dynamic XML Sitemaps, robots.txt, Indexation Rules, and SEO Metadata.
 */

const { businessProfile } = require('../config/businessProfile');
const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
const { apmiPromoterRegistry } = require('../discovery/ApmiPromoterRegistry');

class TechnicalSEOService {
  /**
   * Generates dynamic robots.txt content
   */
  static generateRobotsTxt() {
    const origin = businessProfile.canonicalDomain || 'https://tikum.app';
    return `# TIKUM Robots.txt — https://tikum.app
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /uploads/
Disallow: /pay
Disallow: /pay/*
Disallow: /*?*q=
Disallow: /*?*sort=
Disallow: /*?*status=

# Crawl Delay
Crawl-delay: 1

# Dynamic Sitemap Declaration
Sitemap: ${origin}/sitemap.xml
`;
  }

  /**
   * Determines indexation directives (robots meta & X-Robots-Tag)
   */
  static getIndexationDirectives(req, options = {}) {
    const query = req.query || {};
    const hasSearchOrFilter = Boolean(query.q || query.sort || query.filter || (query.city && !options.isCityLanding) || (query.category && !options.isCategoryLanding));
    const isThin = Boolean(options.isEmpty || options.isThin);
    const isPrivate = Boolean(options.isPrivate || req.path?.startsWith('/admin') || req.path?.startsWith('/pay') || req.path?.startsWith('/api/'));

    if (isPrivate) {
      return {
        robotsMeta: 'noindex, nofollow',
        isIndexable: false,
        reason: 'PRIVATE_SURFACE'
      };
    }

    if (hasSearchOrFilter) {
      return {
        robotsMeta: 'noindex, follow',
        isIndexable: false,
        reason: 'FILTERED_QUERY_PARAMETER'
      };
    }

    if (isThin) {
      return {
        robotsMeta: 'noindex, follow',
        isIndexable: false,
        reason: 'THIN_OR_EMPTY_ENTITY'
      };
    }

    return {
      robotsMeta: 'index, follow',
      isIndexable: true,
      reason: 'CANONICAL_INDEXABLE'
    };
  }

  /**
   * Generates Dynamic XML Sitemap
   * @param {Object} providers Optional data providers
   */
  static generateSitemapXml(providers = {}) {
    const origin = businessProfile.canonicalDomain || 'https://tikum.app';
    const nowIso = new Date().toISOString().substring(0, 10);

    const urls = [];

    // 1. Core Static Pages
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/events', priority: '0.9', changefreq: 'hourly' },
      { loc: '/offers', priority: '0.8', changefreq: 'daily' },
      { loc: '/create', priority: '0.7', changefreq: 'monthly' },
      { loc: '/track', priority: '0.6', changefreq: 'daily' },
      { loc: '/faq', priority: '0.7', changefreq: 'weekly' },
      { loc: '/terms', priority: '0.5', changefreq: 'monthly' },
      { loc: '/refund-policy', priority: '0.5', changefreq: 'monthly' },
      { loc: '/privacy', priority: '0.5', changefreq: 'monthly' },
      { loc: '/contact', priority: '0.5', changefreq: 'monthly' }
    ];

    for (const p of staticPages) {
      urls.push({
        loc: `${origin}${p.loc}`,
        lastmod: nowIso,
        changefreq: p.changefreq,
        priority: p.priority
      });
    }

    // 2. Trust Authority Pages
    const trustPages = [
      { loc: '/how-it-works', priority: '0.8', changefreq: 'weekly' },
      { loc: '/buyer-protection', priority: '0.8', changefreq: 'weekly' },
      { loc: '/seller-protection', priority: '0.8', changefreq: 'weekly' },
      { loc: '/ticket-verification', priority: '0.8', changefreq: 'weekly' },
      { loc: '/escrow', priority: '0.8', changefreq: 'weekly' },
      { loc: '/disputes', priority: '0.8', changefreq: 'weekly' }
    ];

    for (const tp of trustPages) {
      urls.push({
        loc: `${origin}${tp.loc}`,
        lastmod: nowIso,
        changefreq: tp.changefreq,
        priority: tp.priority
      });
    }

    // 3. Dynamic Canonical Events (P0 Gate: Only fully VERIFIED events enter sitemap)
    try {
      const events = canonicalRegistry.getAllEvents();
      for (const ev of events) {
        const isEligible = (ev.verification_status === 'VERIFIED' || ev.verification_status === 'PRIMARY_SOURCE_VERIFIED') &&
                           ev.is_verified === true &&
                           ev.status !== 'CANCELLED' &&
                           ev.status !== 'POSTPONED' &&
                           ev.slug;
        if (isEligible) {
          const { EventTemporalLifecycleEngine } = require('../discovery/EventTemporalLifecycleEngine');
          const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(ev);
          urls.push({
            loc: `${origin}/events/${ev.slug}`,
            lastmod: ev.updated_at ? ev.updated_at.substring(0, 10) : nowIso,
            changefreq: isUpcoming ? 'daily' : 'monthly',
            priority: isUpcoming ? '0.9' : '0.4'
          });
        }
      }
    } catch (e) {
      // safe fallback
    }

    // 4. APMI Promoters
    try {
      urls.push({
        loc: `${origin}/promoters/apmi`,
        lastmod: nowIso,
        changefreq: 'weekly',
        priority: '0.8'
      });

      const promoters = apmiPromoterRegistry.getAllPromoters();
      for (const p of promoters) {
        if (p.slug) {
          urls.push({
            loc: `${origin}/promoters/apmi/${p.slug}`,
            lastmod: nowIso,
            changefreq: 'weekly',
            priority: '0.7'
          });
        }
      }
    } catch (e) {
      // safe fallback
    }

    // 5. Grounded Venues & Artists
    urls.push({
      loc: `${origin}/venues`,
      lastmod: nowIso,
      changefreq: 'weekly',
      priority: '0.8'
    });
    urls.push({
      loc: `${origin}/artists`,
      lastmod: nowIso,
      changefreq: 'weekly',
      priority: '0.8'
    });
    urls.push({
      loc: `${origin}/cities`,
      lastmod: nowIso,
      changefreq: 'weekly',
      priority: '0.8'
    });

    if (providers.getVenues) {
      try {
        const venues = providers.getVenues();
        for (const v of venues) {
          if (v.slug && v.event_count > 0) {
            urls.push({
              loc: `${origin}/venues/${v.slug}`,
              lastmod: nowIso,
              changefreq: 'weekly',
              priority: '0.7'
            });
          }
        }
      } catch (e) {}
    }

    // 6. Grounded Cities (Only cities with events)
    if (providers.getCities) {
      try {
        const cities = providers.getCities();
        for (const c of cities) {
          if (c.slug && c.event_count > 0) {
            urls.push({
              loc: `${origin}/cities/${c.slug}`,
              lastmod: nowIso,
              changefreq: 'weekly',
              priority: '0.7'
            });
          }
        }
      } catch (e) {}
    }

    // 7. Grounded Categories
    if (providers.getCategories) {
      try {
        const categories = providers.getCategories();
        for (const cat of categories) {
          if (cat.slug && cat.event_count > 0) {
            urls.push({
              loc: `${origin}/categories/${cat.slug}`,
              lastmod: nowIso,
              changefreq: 'weekly',
              priority: '0.7'
            });
          }
        }
      } catch (e) {}
    }

    // 8. Published Blog / Editorial Articles
    if (providers.getPublishedArticles) {
      try {
        urls.push({
          loc: `${origin}/blog`,
          lastmod: nowIso,
          changefreq: 'daily',
          priority: '0.8'
        });

        const articles = providers.getPublishedArticles();
        for (const art of articles) {
          if (art.slug && art.status === 'published') {
            urls.push({
              loc: `${origin}/blog/${art.slug}`,
              lastmod: (art.updated_at || art.published_at || nowIso).substring(0, 10),
              changefreq: 'weekly',
              priority: '0.8'
            });
          }
        }
      } catch (e) {}
    }

    // Render XML
    const xmlEntries = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
  }

  /**
   * Helper to render standardized SEO <head> HTML snippet
   */
  static renderHeadMeta({
    title,
    description,
    canonicalPath = '',
    ogType = 'website',
    image = 'https://tikum.app/icons/icon-512x512.png',
    noindex = false,
    jsonLd = null
  }) {
    const origin = businessProfile.canonicalDomain || 'https://tikum.app';
    const canonicalUrl = canonicalPath.startsWith('http') ? canonicalPath : `${origin}${canonicalPath}`;
    const robots = noindex ? 'noindex, follow' : 'index, follow';

    return `
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- OpenGraph / Facebook -->
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:site_name" content="Tikum">
  <meta property="og:image" content="${image}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  ${jsonLd ? `\n  <script type="application/ld+json">\n  ${typeof jsonLd === 'string' ? jsonLd : JSON.stringify(jsonLd, null, 2)}\n  </script>` : ''}
`;
  }
}

module.exports = {
  TechnicalSEOService
};
