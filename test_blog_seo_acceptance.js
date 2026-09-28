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
    { label: 'Shows article 1 slug', fn: r => r.body.includes('jual-beli-tiket-konser-secondary-yang-aman') },
    { label: 'Shows article 2 slug', fn: r => r.body.includes('cara-menghindari-scam-tiket-konser') },
    { label: 'Has reading time on cards', fn: r => r.body.includes('menit') },
  ]));

  // 2. Article 1
  checks.push(await check(
    'GET /blog/jual-beli-tiket-konser-secondary-yang-aman',
    base + '/blog/jual-beli-tiket-konser-secondary-yang-aman',
    [
      { label: 'HTTP 200', fn: r => r.status === 200 },
      { label: 'Has H1', fn: r => r.body.includes('<h1') },
      { label: 'Exactly one H1', fn: r => (r.body.match(/<h1[\s>]/g) || []).length === 1 },
      { label: 'Has canonical', fn: r => r.body.includes('rel="canonical"') },
      { label: 'Canonical correct URL', fn: r => r.body.includes('jual-beli-tiket-konser-secondary-yang-aman') },
      { label: 'Has og:type article', fn: r => r.body.includes('"article"') },
      { label: 'Has og:title', fn: r => r.body.includes('og:title') },
      { label: 'Has og:description', fn: r => r.body.includes('og:description') },
      { label: 'Has twitter:card', fn: r => r.body.includes('twitter:card') },
      { label: 'Has JSON-LD BlogPosting', fn: r => r.body.includes('BlogPosting') },
      { label: 'Has datePublished 2026-09-01', fn: r => r.body.includes('2026-09-01') },
      { label: 'Has FAQPage schema', fn: r => r.body.includes('FAQPage') },
      { label: 'Has BreadcrumbList schema', fn: r => r.body.includes('BreadcrumbList') },
      { label: 'Internal link to art2', fn: r => r.body.includes('cara-menghindari-scam-tiket-konser') },
      { label: 'Has CTA banner', fn: r => r.body.includes('Temukan Tiket Konser Terverifikasi') },
      { label: 'Has reading time', fn: r => r.body.includes('menit baca') },
      { label: 'Has Artikel Terkait', fn: r => r.body.includes('Artikel Terkait') },
      { label: 'index, follow (not noindex)', fn: r => r.body.includes('index, follow') },
      { label: 'Has H2 sections', fn: r => (r.body.match(/<h2[\s>]/g) || []).length >= 3 },
      { label: 'Has H3 sections', fn: r => (r.body.match(/<h3[\s>]/g) || []).length >= 1 },
      { label: 'Has article checklist', fn: r => r.body.includes('Checklist') },
    ]
  ));

  // 3. Article 2
  checks.push(await check(
    'GET /blog/cara-menghindari-scam-tiket-konser',
    base + '/blog/cara-menghindari-scam-tiket-konser',
    [
      { label: 'HTTP 200', fn: r => r.status === 200 },
      { label: 'Has H1', fn: r => r.body.includes('<h1') },
      { label: 'Exactly one H1', fn: r => (r.body.match(/<h1[\s>]/g) || []).length === 1 },
      { label: 'Has canonical', fn: r => r.body.includes('rel="canonical"') },
      { label: 'Has JSON-LD BlogPosting', fn: r => r.body.includes('BlogPosting') },
      { label: 'Has datePublished 2026-09-08', fn: r => r.body.includes('2026-09-08') },
      { label: 'Has FAQPage schema', fn: r => r.body.includes('FAQPage') },
      { label: 'Has RED FLAG section', fn: r => r.body.includes('RED FLAG #10') },
      { label: 'Internal link to art1', fn: r => r.body.includes('jual-beli-tiket-konser-secondary-yang-aman') },
      { label: 'Has reading time', fn: r => r.body.includes('menit baca') },
      { label: 'Has Artikel Terkait', fn: r => r.body.includes('Artikel Terkait') },
      { label: 'Has checklist', fn: r => r.body.includes('Checklist Aman') },
      { label: 'index, follow (not noindex)', fn: r => r.body.includes('index, follow') },
    ]
  ));

  // 4. Draft article must return 404
  checks.push(await check(
    'GET /blog/panduan-memilih-kategori-tiket (DRAFT → 404)',
    base + '/blog/panduan-memilih-kategori-tiket-konser-festival-vs-seating',
    [
      { label: 'HTTP 404 (draft not indexed)', fn: r => r.status === 404 },
      { label: 'Has noindex', fn: r => r.body.includes('noindex') },
    ]
  ));

  // 5. Sitemap includes both articles
  checks.push(await check('GET /sitemap.xml', base + '/sitemap.xml', [
    { label: 'HTTP 200', fn: r => r.status === 200 },
    { label: 'Content-Type XML', fn: r => (r.headers['content-type'] || '').includes('xml') },
    { label: 'Includes /blog', fn: r => r.body.includes('/blog') },
    { label: 'Includes article 1 slug', fn: r => r.body.includes('jual-beli-tiket-konser-secondary-yang-aman') },
    { label: 'Includes article 2 slug', fn: r => r.body.includes('cara-menghindari-scam-tiket-konser') },
  ]));

  // 6. Robots.txt
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
const http2 = require('http');
const server = http2.createServer(app);
const PORT = 3199;
server.listen(PORT, async () => {
  try {
    const failures = await runTests(PORT);
    server.close();
    process.exit(failures === 0 ? 0 : 1);
  } catch (e) {
    console.error('Test runner error:', e);
    server.close();
    process.exit(1);
  }
});
