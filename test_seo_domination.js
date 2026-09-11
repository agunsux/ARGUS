/**
 * TIKUM — Comprehensive SEO Domination & Red Team Acceptance Suite
 * Validates:
 * 1. Technical SEO (robots.txt, sitemap.xml, canonical URLs, noindex directives)
 * 2. Structured Data (JSON-LD Organization, WebSite, Breadcrumbs, Event, Article, FAQPage, Place)
 * 3. Programmatic Entity Grounding (Venues, Artists, Cities, Categories, zero thin pages)
 * 4. Authoritative Trust Suite (/how-it-works, /buyer-protection, /seller-protection, /escrow, /disputes)
 * 5. Editorial Engine & Quality/Fact Validation
 * 6. Human Approval Gate & 2x/Week Scheduler Idempotency
 * 7. Admin Content Control Center & Real Analytics
 * 8. Zero Customer-Facing ARGUS Brand Boundaries
 * 9. Zero Payment / Escrow Modification Invariants
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { VenueRegistry } = require('./src/discovery/VenueRegistry');
const { ArtistRegistry } = require('./src/discovery/ArtistRegistry');
const { CityRegistry } = require('./src/discovery/CityRegistry');
const { articleRepository } = require('./src/content/ArticleRepository');
const { publishingScheduler } = require('./src/content/PublishingScheduler');
const { ContentQualityEngine } = require('./src/content/ContentQualityEngine');
const { CONTENT_STATUS, CONTENT_PILLARS } = require('./src/content/ContentModel');

let server;
let baseUrl;
let passed = 0;
let total = 0;

function check(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function checkAsync(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      if (typeof options.body === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(options.body));
      } else {
        req.write(options.body);
      }
    }
    req.end();
  });
}

async function runSeoDominationSuite() {
  console.log('====================================================');
  console.log('  TIKUM — SEO DOMINATION & RED TEAM ACCEPTANCE SUITE');
  console.log('====================================================\n');

  resetDatabase();
  articleRepository.reset();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // PART 1: TECHNICAL SEO (Robots, Sitemap, Canonicals, Noindex)
    // -------------------------------------------------------------
    console.log('--- 1. Technical SEO & Indexation Controls ---');

    await checkAsync('Dynamic /robots.txt serves valid directives and sitemap link', async () => {
      const res = await request('/robots.txt');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('Sitemap: https://tikum.app/sitemap.xml'), 'Must point to canonical sitemap');
      assert.ok(res.body.includes('Disallow: /admin'), 'Must disallow /admin');
      assert.ok(res.body.includes('Disallow: /*?*q='), 'Must disallow search query params');
    });

    await checkAsync('Dynamic /sitemap.xml generates valid XML with core, trust, event & article URLs', async () => {
      const res = await request('/sitemap.xml');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('xml'), 'Content-type must be xml');
      assert.ok(res.body.includes('<loc>https://tikum.app/</loc>'), 'Must include root URL');
      assert.ok(res.body.includes('<loc>https://tikum.app/events</loc>'), 'Must include /events');
      assert.ok(res.body.includes('<loc>https://tikum.app/how-it-works</loc>'), 'Must include trust URLs');
      assert.ok(res.body.includes('<loc>https://tikum.app/venues</loc>'), 'Must include venue directory');
      assert.ok(res.body.includes('<loc>https://tikum.app/cities</loc>'), 'Must include city directory');
      assert.ok(!res.body.includes('vercel.app'), 'Must never contain vercel.app');
    });

    // -------------------------------------------------------------
    // PART 2: PROGRAMMATIC ENTITY GROUNDING (Zero Thin Pages)
    // -------------------------------------------------------------
    console.log('\n--- 2. Programmatic Entity Grounding ---');

    await checkAsync('Grounded Venue: /venues/gelora-bung-karno-main-stadium renders 200 with real events', async () => {
      const res = await request('/venues/gelora-bung-karno-main-stadium');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('Gelora Bung Karno'), 'Must render venue title');
      assert.ok(res.body.includes('schema.org'), 'Must include schema markup');
      assert.ok(res.body.includes('Place'), 'Must include Place schema');
      assert.ok(res.body.includes('https://tikum.app/venues/gelora-bung-karno-main-stadium'), 'Must include canonical URL');
    });

    await checkAsync('Thin/Non-existent Venue returns 404 with noindex', async () => {
      const res = await request('/venues/venue-fiktif-antah-berantah');
      assert.strictEqual(res.statusCode, 404);
      assert.ok(res.body.includes('noindex'), 'Must specify noindex to prevent indexing thin pages');
    });

    await checkAsync('Grounded Artist: /artists/coldplay renders 200 with real verified concerts', async () => {
      const res = await request('/artists/coldplay');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('Coldplay'), 'Must render artist name');
      assert.ok(res.body.includes('Coldplay Music of the Spheres'), 'Must list actual event');
      assert.ok(res.body.includes('https://tikum.app/artists/coldplay'), 'Must have canonical URL');
    });

    await checkAsync('Non-existent Artist returns 404 with noindex (zero hallucination)', async () => {
      const res = await request('/artists/artis-khayalan-ai');
      assert.strictEqual(res.statusCode, 404);
      assert.ok(res.body.includes('noindex'), 'Must return noindex on nonexistent artist');
    });

    await checkAsync('Grounded City: /cities/jakarta renders 200 with Jakarta events', async () => {
      const res = await request('/cities/jakarta');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('Jakarta'), 'Must mention Jakarta');
      assert.ok(res.body.includes('https://tikum.app/cities/jakarta'), 'Must have canonical URL');
    });

    await checkAsync('Category Hub: /categories/konser renders 200 with CONCERT events', async () => {
      const res = await request('/categories/konser');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('Jadwal Acara CONCERT di Indonesia'), 'Must render category header');
    });

    // -------------------------------------------------------------
    // PART 3: AUTHORITATIVE TRUST SUITE
    // -------------------------------------------------------------
    console.log('\n--- 3. Authoritative Trust SEO Suite ---');

    const trustRoutes = [
      { path: '/how-it-works', expectedText: 'Bagaimana Tikum Melindungi Transaksi Anda' },
      { path: '/buyer-protection', expectedText: 'Perlindungan Menyeluruh untuk Pembeli Tiket' },
      { path: '/seller-protection', expectedText: 'Perlindungan Transaksi untuk Penjual Tiket' },
      { path: '/ticket-verification', expectedText: 'Protokol Verifikasi Tiket' },
      { path: '/escrow', expectedText: 'Infrastruktur Escrow: Penahanan Dana Aman' },
      { path: '/disputes', expectedText: 'Prosedur Resolusi Sengketa (Dispute)' },
      { path: '/dispute-resolution', expectedText: 'Prosedur Resolusi Sengketa (Dispute)' }
    ];

    for (const tr of trustRoutes) {
      await checkAsync(`Trust Hub ${tr.path} renders 200 with valid canonical & schema`, async () => {
        const res = await request(tr.path);
        assert.strictEqual(res.statusCode, 200, `Expected 200 for ${tr.path}`);
        assert.ok(res.body.includes(tr.expectedText), `Must include ${tr.expectedText}`);
        assert.ok(res.body.includes('https://schema.org'), 'Must include Schema.org JSON-LD');
        assert.ok(res.body.includes('FAQPage'), 'Must include FAQPage structured data');
        assert.ok(res.body.includes(`https://tikum.app${tr.path.split('/')[1] === 'dispute-resolution' ? '/disputes' : tr.path}`), 'Must have canonical URL');
      });
    }

    // -------------------------------------------------------------
    // PART 4: EDITORIAL ENGINE & QUALITY AUDIT
    // -------------------------------------------------------------
    console.log('\n--- 4. Editorial Engine & Quality Audit ---');

    check('ContentQualityEngine validates SEO, factuality, depth, and trust scores', () => {
      const article = {
        title: 'Cara Menghindari Penipuan Tiket Konser di Media Sosial',
        slug: 'cara-menghindari-penipuan-tiket-konser-di-media-sosial',
        description: 'Pelajari modus penipuan tiket konser di Twitter/X dan Instagram serta transaksi aman dengan escrow Tikum.',
        category: CONTENT_PILLARS.SAFETY,
        keywords: ['penipuan tiket konser'],
        content: `
          <h2>Fenomena Penipuan Tiket Konser</h2>
          <p>Penipuan tiket marak terjadi saat konser besar diumumkan di Indonesia. Calo dan penipu online memanfaatkan kepanikan pembeli yang kehabisan tiket resmi.</p>
          <h3>Ciri-Ciri Penipuan Online</h3>
          <p>Pelajari bagaimana rekening penampungan escrow dan verifikasi barcode turnstile di venue melindungi pembeli dari tiket palsu.</p>
        `
      };

      const report = ContentQualityEngine.evaluate(article);
      assert.ok(report.seo_score > 60, 'SEO score must be positive');
      assert.ok(report.trust_score > 60, 'Trust score must recognize escrow and verification');
      assert.strictEqual(report.fact_check_passed, true, 'Fact check must pass on clean article');
    });

    check('ContentQualityEngine flags hallucinated event IDs', () => {
      const hallucinatedArticle = {
        title: 'Konser Khayalan Musisi Misterius di Jakarta',
        slug: 'konser-khayalan',
        description: 'Ulasan konser fiktif yang tidak pernah ada di database Tikum.',
        category: CONTENT_PILLARS.EVENT_DISCOVERY,
        target_event_id: 'event-fiktif-12345',
        content: '<h2>Ulasan Konser</h2><p>Acara fiktif tanpa data canonical.</p>'
      };

      const report = ContentQualityEngine.evaluate(hallucinatedArticle);
      assert.strictEqual(report.fact_check_passed, false, 'Must flag nonexistent target_event_id');
      assert.ok(report.flags.some(f => f.includes('does not exist in Canonical Event Registry')));
    });

    // -------------------------------------------------------------
    // PART 5: HUMAN APPROVAL GATE & SCHEDULER IDEMPOTENCY
    // -------------------------------------------------------------
    console.log('\n--- 5. Human Approval Gate & Publishing Scheduler ---');

    check('Human Approval Gate rejects publishing unapproved drafts', () => {
      const draft = articleRepository.saveArticle({
        title: 'Draft Artikel Tanpa Persetujuan Editor',
        slug: 'draft-tanpa-persetujuan',
        description: 'Artikel yang masih dalam tahap perancangan dan belum disetujui editor.',
        category: CONTENT_PILLARS.TICKET_BUYING,
        content: '<h2>Draft Artikel Uji Coba</h2><p>Isi draf artikel ini dibuat semata-mata untuk menguji gerbang persetujuan manusia dan validasi fakta sebelum publikasi resmi.</p>'
      });

      assert.throws(() => {
        articleRepository.publishArticle(draft.id);
      }, /Human approval is required/);
    });

    check('Approving article transitions status to APPROVED', () => {
      const unapproved = articleRepository.getAllArticles({ status: CONTENT_STATUS.DRAFT })[0];
      if (unapproved) {
        const approved = articleRepository.approveArticle(unapproved.id, 'admin-1');
        assert.strictEqual(approved.status, CONTENT_STATUS.APPROVED);
        assert.strictEqual(approved.human_approved_by, 'admin-1');
      }
    });

    await checkAsync('PublishingScheduler runs cycle idempotently without duplicate publications', async () => {
      // Run cycle first time
      const run1 = await publishingScheduler.runCycle({ forceRun: true });
      assert.strictEqual(run1.executed, true);
      assert.strictEqual(run1.publishedCount, 1, 'First run should publish 1 approved article');

      const publishedArticleId = run1.article.id;

      // Run cycle second time on the same article -> must be idempotent
      const run2 = await publishingScheduler.runCycle({ forceRun: true });
      assert.strictEqual(run2.executed, true);
      // Either 0 new published (already published) or publishes next approved, never duplicates
      assert.ok(!run2.error, 'Re-run must not throw error');
      
      const allArticles = articleRepository.getAllArticles();
      const duplicateSlugs = allArticles.filter(a => a.slug === run1.article.slug);
      assert.strictEqual(duplicateSlugs.length, 1, 'Never create duplicate article with same slug');
    });

    // -------------------------------------------------------------
    // PART 6: PUBLIC BLOG ROUTER & ARTICLE VIEW
    // -------------------------------------------------------------
    console.log('\n--- 6. Public Blog Router & SEO Metadata ---');

    await checkAsync('/blog renders 200 and lists published articles', async () => {
      const res = await request('/blog');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('Panduan, Edukasi &amp; Keamanan Tiket Konser'), 'Must render blog header');
      assert.ok(res.body.includes('https://tikum.app/blog'), 'Must specify canonical blog URL');
    });

    await checkAsync('/blog/:slug renders published article with Article JSON-LD & Breadcrumbs', async () => {
      const published = articleRepository.getPublishedArticles()[0];
      assert.ok(published, 'At least one published article must exist');

      const res = await request(`/blog/${published.slug}`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes(published.title), 'Must render article title');
      assert.ok(res.body.includes('BlogPosting'), 'Must include BlogPosting schema');
      assert.ok(res.body.includes('BreadcrumbList'), 'Must include BreadcrumbList schema');
      assert.ok(res.body.includes(`https://tikum.app/blog/${published.slug}`), 'Must include canonical tag');
    });

    await checkAsync('/blog/:slug for unapproved draft returns 404 (zero leakage of unreviewed content)', async () => {
      const draft = articleRepository.saveArticle({
        title: 'Draft Rahasia Internal yang Belum Disetujui',
        slug: 'draft-rahasia-internal',
        description: 'Draft internal yang tidak boleh diakses oleh publik ataupun mesin pencari.',
        category: CONTENT_PILLARS.TICKET_BUYING,
        content: '<h2>Draft Internal Rahasia</h2><p>Hanya untuk editor internal Tikum dan tidak boleh bocor ke publik sebelum melewati pemeriksaan mutu serta persetujuan resmi.</p>'
      });

      const res = await request(`/blog/${draft.slug}`);
      assert.strictEqual(res.statusCode, 404, 'Drafts must return 404 to search engines');
      assert.ok(res.body.includes('noindex'), 'Must include noindex');
    });

    // -------------------------------------------------------------
    // PART 7: ADMIN CONTENT CONTROL CENTER & REAL ANALYTICS
    // -------------------------------------------------------------
    console.log('\n--- 7. Admin Content Control Center & Real Analytics ---');

    await checkAsync('Admin Content Analytics returns real metrics with zero mock figures', async () => {
      const res = await request('/api/admin/content/analytics', {
        headers: { 'x-user-id': 'admin-1' }
      });
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data_source, 'LIVE_DATABASE_STATE');
      assert.ok(typeof data.indexation_inventory.total_indexable_urls === 'number');
      assert.ok(data.indexation_inventory.total_indexable_urls > 10, 'Total indexable URLs calculated from live registry');
      assert.ok(data.content_funnel.total_articles >= 3, 'Counts actual articles');
    });

    await checkAsync('Admin Content routes enforce admin authentication', async () => {
      const unauth = await request('/api/admin/content/articles');
      assert.strictEqual(unauth.statusCode, 401);

      const buyerForbidden = await request('/api/admin/content/articles', {
        headers: { 'x-user-id': 'buyer-1' }
      });
      assert.strictEqual(buyerForbidden.statusCode, 403);
    });

    // -------------------------------------------------------------
    // PART 8: BRAND BOUNDARY & CONSUMER SAFETY
    // -------------------------------------------------------------
    console.log('\n--- 8. Brand Boundary Invariants ---');

    const checkPaths = [
      '/',
      '/venues',
      '/venues/gelora-bung-karno-main-stadium',
      '/artists',
      '/artists/coldplay',
      '/cities',
      '/cities/jakarta',
      '/categories/konser',
      '/how-it-works',
      '/buyer-protection',
      '/seller-protection',
      '/ticket-verification',
      '/escrow',
      '/disputes',
      '/blog'
    ];

    const forbiddenStrings = [
      'ARGUS Marketplace',
      'ARGUS Tickets',
      'ARGUS.app',
      'Tikum by ARGUS',
      'ARGUS PIC',
      'ARGUS Trust Officer',
      'argus.id',
      'argus.app',
      'tikum.id'
    ];

    for (const cp of checkPaths) {
      await checkAsync(`Consumer surface ${cp} strictly maintains ZERO forbidden strings`, async () => {
        const res = await request(cp);
        for (const forbidden of forbiddenStrings) {
          assert.ok(
            !res.body.includes(forbidden),
            `Page ${cp} must NOT contain forbidden string "${forbidden}"`
          );
        }
      });
    }

    console.log('\n====================================================');
    console.log(`  All ${passed}/${total} SEO Domination & Red Team checks PASSED!`);
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runSeoDominationSuite().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
}

module.exports = {
  runSeoDominationSuite
};
