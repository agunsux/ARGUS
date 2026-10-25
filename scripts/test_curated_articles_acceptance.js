/**
 * TIKUM Acceptance Test: Curated Editorial Blog Articles
 * Verifies publication of Article 1 (Nassar) and scheduling of Article 2 (K-pop).
 */

const assert = require('assert');
const http = require('http');
const app = require('../src/server');
const { articleRepository, ArticleRepository } = require('../src/content/ArticleRepository');
const { ContentQualityEngine } = require('../src/content/ContentQualityEngine');
const { CURATED_ARTICLES } = require('../src/content/seeds/curatedArticles');
const fs = require('fs');
const path = require('path');

let server;
let baseUrl;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

function request(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runAcceptance() {
  console.log('=== TIKUM CURATED BLOG ARTICLES ACCEPTANCE TEST ===\n');
  await startServer();

  try {
    // 1. Article 1 (Nassar) Metadata & Quality Check
    console.log('--- 1. Article 1 (Nassar) ---');
    const nassar = articleRepository.getArticleBySlug('kenapa-nassar-layak-ditonton-live');
    assert.ok(nassar, 'Article 1 (Nassar) must exist in repository');
    assert.strictEqual(nassar.status, 'published', 'Article 1 must have status "published"');
    assert.strictEqual(nassar.published_at, '2026-10-25T12:00:00+07:00');
    assert.strictEqual(nassar.scheduled_at, null);

    const nassarReport = ContentQualityEngine.evaluate(nassar);
    console.log('  Nassar SEO Score:', nassarReport.seo_score);
    console.log('  Nassar Quality Score:', nassarReport.quality_score);
    console.log('  Nassar Trust Score:', nassarReport.trust_score);
    console.log('  Nassar Readability Score:', nassarReport.readability_score);
    assert.strictEqual(nassarReport.seo_score, 100);
    assert.strictEqual(nassarReport.quality_score, 100);
    assert.strictEqual(nassarReport.trust_score, 100);
    assert.strictEqual(nassarReport.readability_score, 100);
    assert.strictEqual(nassarReport.flags.length, 0);

    const nassarDue = ArticleRepository.isArticleDue(nassar, new Date('2026-10-25T22:00:00+07:00'));
    assert.strictEqual(nassarDue, true, 'Nassar article must be due for publication on 2026-10-25');
    console.log('  [PASS] Article 1 quality & due evaluation passed');

    // 2. Article 1 (Nassar) Route Check
    const resNassar = await request('/blog/kenapa-nassar-layak-ditonton-live');
    assert.strictEqual(resNassar.statusCode, 200, 'GET /blog/kenapa-nassar-layak-ditonton-live must return HTTP 200');
    assert.ok(resNassar.body.includes(nassar.title), 'Body must contain article title');
    assert.ok(resNassar.body.includes('<h1'), 'Body must contain H1 element');
    assert.ok(resNassar.body.includes('https://schema.org'), 'Body must contain Schema.org');
    assert.ok(resNassar.body.includes('BlogPosting') || resNassar.body.includes('Article'), 'Body must contain Article/BlogPosting schema');
    assert.ok(resNassar.body.includes('BreadcrumbList'), 'Body must contain BreadcrumbList schema');
    assert.ok(resNassar.body.includes('FAQPage'), 'Body must contain FAQPage schema');
    assert.ok(resNassar.body.includes('https://tikum.app/events'), 'Body must contain contextual link to events');
    console.log('  [PASS] Article 1 SSR response 200 with complete Schema.org and content verified');

    // 3. Article 2 (K-pop) Metadata & Quality Check
    console.log('\n--- 2. Article 2 (K-pop) ---');
    const kpop = articleRepository.getArticleBySlug('masa-depan-kpop-apakah-akan-berakhir');
    assert.ok(kpop, 'Article 2 (K-pop) must exist in repository');
    assert.strictEqual(kpop.status, 'scheduled', 'Article 2 must have status "scheduled"');
    assert.strictEqual(kpop.scheduled_at, '2026-10-28T09:00:00+07:00');
    assert.strictEqual(kpop.published_at, null);

    const kpopReport = ContentQualityEngine.evaluate(kpop);
    console.log('  K-pop SEO Score:', kpopReport.seo_score);
    console.log('  K-pop Quality Score:', kpopReport.quality_score);
    console.log('  K-pop Trust Score:', kpopReport.trust_score);
    console.log('  K-pop Readability Score:', kpopReport.readability_score);
    assert.strictEqual(kpopReport.seo_score, 100);
    assert.strictEqual(kpopReport.quality_score, 100);
    assert.strictEqual(kpopReport.trust_score, 100);
    assert.strictEqual(kpopReport.readability_score, 100);
    assert.strictEqual(kpopReport.flags.length, 0);

    const kpopDueNow = ArticleRepository.isArticleDue(kpop, new Date('2026-10-25T22:00:00+07:00'));
    assert.strictEqual(kpopDueNow, false, 'K-pop article must NOT be due on 2026-10-25');

    const kpopDueFuture = ArticleRepository.isArticleDue(kpop, new Date('2026-10-28T09:00:00+07:00'));
    assert.strictEqual(kpopDueFuture, true, 'K-pop article must automatically be due on 2026-10-28T09:00:00+07:00');
    console.log('  [PASS] Article 2 scheduling and time-travel due evaluation passed');

    // 4. Article 2 (K-pop) Invisibility / Gate Check
    const resKpop = await request('/blog/masa-depan-kpop-apakah-akan-berakhir');
    assert.strictEqual(resKpop.statusCode, 404, 'GET /blog/masa-depan-kpop-apakah-akan-berakhir must return HTTP 404 before scheduled time');
    assert.ok(resKpop.body.includes('Artikel Tidak Ditemukan'), 'Body must show 404 not found message');

    const resBlogIndex = await request('/blog');
    assert.strictEqual(resBlogIndex.statusCode, 200);
    assert.ok(resBlogIndex.body.includes(nassar.title), 'Public /blog must include Nassar article');
    assert.ok(!resBlogIndex.body.includes(kpop.title), 'Public /blog must NOT include K-pop scheduled article');
    assert.ok(!resBlogIndex.body.includes('masa-depan-kpop-apakah-akan-berakhir'), 'Public /blog must NOT leak K-pop slug');
    console.log('  [PASS] Article 2 invisibility gate verified (HTTP 404 + excluded from /blog index)');

    // 5. Sitemap Verification
    console.log('\n--- 3. Sitemap Verification ---');
    const sitemapContent = fs.readFileSync(path.resolve(__dirname, '../public/sitemap.xml'), 'utf8');
    assert.ok(sitemapContent.includes('https://tikum.app/blog/kenapa-nassar-layak-ditonton-live'), 'Sitemap must contain Nassar article URL');
    assert.ok(!sitemapContent.includes('masa-depan-kpop-apakah-akan-berakhir'), 'Sitemap must NOT contain K-pop scheduled article URL');
    console.log('  [PASS] Sitemap contains Nassar article and excludes K-pop scheduled article');

    console.log('\n>>> ALL CURATED ARTICLES ACCEPTANCE CHECKS PASSED SUCCESSFULLY! <<<');
  } finally {
    await stopServer();
  }
}

runAcceptance().catch(err => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
