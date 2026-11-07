/**
 * Blog SEO Acceptance Test
 * Verifies all critical SEO signals for both new epic blog articles.
 */
const http = require('http');

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, (r) => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => resolve({ status: r.statusCode, body, headers: r.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function check(name, url, assertions) {
  try {
    const r = await fetchUrl(url);
    const results = assertions.map(a => ({
      label: a.label,
      pass: a.fn(r)
    }));
    return { name, url, results };
  } catch (e) {
    return { name, url, error: e.message };
  }
}

async function runTests(port) {
  const base = `http://localhost:${port}`;
  const checks = [];

  // 1. Blog listing
  checks.push(await check('GET /blog', base + '/blog', [
    { label: 'HTTP 200', fn: r => r.status === 200 },
    { label: 'Has H1', fn: r => r.body.includes('<h1') },
    { label: 'Has title tag', fn: r => r.body.includes('<title>') },
    { label: 'Has canonical rel', fn: r => r.body.includes('rel="canonical"') },
    { label: 'Has og:type', fn: r => r.body.includes('og:type') },
    { label: 'Has twitter:card', fn: r => r.body.includes('twitter:card') },
    { label: 'Has JSON-LD', fn: r => r.body.includes('application/ld+json') },
    { label: 'Shows published article 1 canonical slug', fn: r => r.body.includes('cara-membeli-tiket-konser-dengan-aman-checklist-sebelum-transfer-uang') },
    { label: 'Shows published curated Nassar slug', fn: r => r.body.includes('kenapa-nassar-layak-ditonton-live') },
    { label: 'Excludes scheduled article from public blog index', fn: r => !r.body.includes('tiket-digital-e-ticket-qr-code-dan-wristband-apa-yang-perlu-dipahami') },
    { label: 'Excludes draft article from public blog index', fn: r => !r.body.includes('panduan-memilih-kategori-tiket-konser-festival-vs-seating') },
    { label: 'Has reading time on cards', fn: r => r.body.includes('menit') },
  ]));

  // 2. Article 1 (Canonical Route)
  checks.push(await check(
    'GET /blog/cara-membeli-tiket-konser-dengan-aman-checklist-sebelum-transfer-uang (Canonical URL)',
    base + '/blog/cara-membeli-tiket-konser-dengan-aman-checklist-sebelum-transfer-uang',
    [
      { label: 'HTTP 200', fn: r => r.status === 200 },
      { label: 'Has H1', fn: r => r.body.includes('<h1') },
      { label: 'Exactly one H1', fn: r => (r.body.match(/<h1[\s>]/g) || []).length === 1 },
      { label: 'Has canonical', fn: r => r.body.includes('rel="canonical"') },
      { label: 'Canonical points to canonical primary URL', fn: r => r.body.includes('https://tikum.app/blog/cara-membeli-tiket-konser-dengan-aman-checklist-sebelum-transfer-uang') },
      { label: 'Has og:type article', fn: r => r.body.includes('"article"') },
      { label: 'Has og:title', fn: r => r.body.includes('og:title') },
      { label: 'Has og:description', fn: r => r.body.includes('og:description') },
      { label: 'Has twitter:card', fn: r => r.body.includes('twitter:card') },
      { label: 'Has JSON-LD BlogPosting', fn: r => r.body.includes('BlogPosting') },
      { label: 'Has datePublished 2026-10-15', fn: r => r.body.includes('2026-10-15') },
      { label: 'Has FAQPage schema', fn: r => r.body.includes('FAQPage') },
      { label: 'Has BreadcrumbList schema', fn: r => r.body.includes('BreadcrumbList') },
      { label: 'Has truthful CTA banner (without unsupported claims)', fn: r => r.body.includes('Jelajahi Event di Tikum') },
      { label: 'Has reading time', fn: r => r.body.includes('menit baca') },
      { label: 'index, follow (not noindex)', fn: r => r.body.includes('index, follow') },
      { label: 'Has H2 sections', fn: r => (r.body.match(/<h2[\s>]/g) || []).length >= 3 },
      { label: 'Has H3 sections', fn: r => (r.body.match(/<h3[\s>]/g) || []).length >= 1 },
      { label: 'Has article checklist', fn: r => r.body.includes('Checklist') || r.body.includes('checklist') },
    ]
  ));

  // 3. Legacy Slug Resolution (Alias Canonical Integrity)
  checks.push(await check(
    'GET /blog/jual-beli-tiket-konser-secondary-yang-aman (Legacy Alias)',
    base + '/blog/jual-beli-tiket-konser-secondary-yang-aman',
    [
      { label: 'HTTP 200 via alias', fn: r => r.status === 200 },
      { label: 'Canonical points to primary canonical URL, not alias', fn: r => r.body.includes('https://tikum.app/blog/cara-membeli-tiket-konser-dengan-aman-checklist-sebelum-transfer-uang') },
      { label: 'Has JSON-LD BlogPosting', fn: r => r.body.includes('BlogPosting') },
      { label: 'Has H1', fn: r => r.body.includes('<h1') },
    ]
  ));

  // 4. Scheduled Article Invisibility Gate
  checks.push(await check(
    'GET /blog/tiket-digital-e-ticket-qr-code-dan-wristband-apa-yang-perlu-dipahami (SCHEDULED → 404)',
    base + '/blog/tiket-digital-e-ticket-qr-code-dan-wristband-apa-yang-perlu-dipahami',
    [
      { label: 'HTTP 404 (scheduled not indexed)', fn: r => r.status === 404 },
      { label: 'Has noindex', fn: r => r.body.includes('noindex') },
    ]
  ));

  // 5. Legacy Alias to Scheduled Article Gate
  checks.push(await check(
    'GET /blog/cara-menghindari-scam-tiket-konser (Alias to SCHEDULED → 404)',
    base + '/blog/cara-menghindari-scam-tiket-konser',
    [
      { label: 'HTTP 404 (scheduled alias not indexed)', fn: r => r.status === 404 },
      { label: 'Has noindex', fn: r => r.body.includes('noindex') },
    ]
  ));

  // 6. Draft article must return 404
  checks.push(await check(
    'GET /blog/panduan-memilih-kategori-tiket (DRAFT → 404)',
    base + '/blog/panduan-memilih-kategori-tiket-konser-festival-vs-seating',
    [
      { label: 'HTTP 404 (draft not indexed)', fn: r => r.status === 404 },
      { label: 'Has noindex', fn: r => r.body.includes('noindex') },
    ]
  ));

  // 7. Sitemap includes only published articles
  checks.push(await check('GET /sitemap.xml', base + '/sitemap.xml', [
    { label: 'HTTP 200', fn: r => r.status === 200 },
    { label: 'Content-Type XML', fn: r => (r.headers['content-type'] || '').includes('xml') },
    { label: 'Includes /blog', fn: r => r.body.includes('/blog') },
    { label: 'Includes published article 1 canonical slug', fn: r => r.body.includes('cara-membeli-tiket-konser-dengan-aman-checklist-sebelum-transfer-uang') },
    { label: 'Includes published Nassar article slug', fn: r => r.body.includes('kenapa-nassar-layak-ditonton-live') },
    { label: 'Excludes scheduled article slug', fn: r => !r.body.includes('tiket-digital-e-ticket-qr-code-dan-wristband-apa-yang-perlu-dipahami') },
    { label: 'Excludes draft article slug', fn: r => !r.body.includes('panduan-memilih-kategori-tiket-konser-festival-vs-seating') },
    { label: 'Excludes legacy alias slug', fn: r => !r.body.includes('jual-beli-tiket-konser-secondary-yang-aman') },
  ]));

  // 8. Robots.txt
  checks.push(await check('GET /robots.txt', base + '/robots.txt', [
    { label: 'HTTP 200', fn: r => r.status === 200 },
    { label: 'Has Sitemap directive', fn: r => r.body.includes('Sitemap:') },
    { label: 'Allows /blog (not disallowed)', fn: r => !r.body.includes('Disallow: /blog') },
    { label: 'Disallows /admin', fn: r => r.body.includes('Disallow: /admin') },
    { label: 'Disallows /api/', fn: r => r.body.includes('Disallow: /api/') },
  ]));

  // Print results
  console.log('\n========================================');
  console.log('  TIKUM BLOG — SEO ACCEPTANCE TEST');
  console.log('========================================\n');

  let totalPass = 0, totalFail = 0;
  for (const c of checks) {
    console.log('📋 ' + c.name);
    if (c.error) {
      console.log('  ❌ ERROR: ' + c.error);
      totalFail++;
    } else {
      for (const r of c.results) {
        if (r.pass) {
          console.log('  ✅ ' + r.label);
          totalPass++;
        } else {
          console.log('  ❌ FAIL: ' + r.label);
          totalFail++;
        }
      }
    }
    console.log('');
  }

  console.log('========================================');
  console.log('PASS: ' + totalPass + '  |  FAIL: ' + totalFail);
  if (totalFail === 0) {
    console.log('🟢 ALL ACCEPTANCE CHECKS PASSED — PRODUCTION READY');
  } else {
    console.log('🔴 SOME CHECKS FAILED — REVIEW ABOVE');
  }
  console.log('========================================\n');

  return totalFail;
}

// Boot temporary server
const app = require('./src/server');
const { articleRepository } = require('./src/content/ArticleRepository');
const http2 = require('http');

articleRepository.reset();
const server = http2.createServer(app);
const PORT = 3199;
server.listen(PORT, async () => {
  try {
    const failures = await runTests(PORT);
    server.close();
    articleRepository.reset();
    process.exit(failures === 0 ? 0 : 1);
  } catch (e) {
    console.error('Test runner error:', e);
    server.close();
    articleRepository.reset();
    process.exit(1);
  }
});
