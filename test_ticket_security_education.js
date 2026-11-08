/**
 * TIKUM — Ticket Security & Verification Education Test Suite
 * 
 * Verifies the non-breaking implementation of the Ticket Security & Verification System:
 * 1. FAQ Security Section at the VERY TOP of /faq before ordinary topics.
 * 2. 8 Core Security Q&As (ticket verification, seller verification, payment protection, 
 *    double-selling controls vs limitations, venue PIC, wristband exchange, dispute resolution, fraud reporting).
 * 3. 4 Verification Levels (Digitally verified, Operationally verified, Venue-assisted, Not independently verifiable).
 * 4. FAQPage Schema.org JSON-LD structured data on /faq.
 * 5. Blog Explainer Article (/blog/bagaimana-tikum-melindungi-pembeli-tiket) published with 200 OK,
 *    Article & FAQ schema, factual depth, step-by-step lifecycle, buyer checklist, and CTA.
 * 6. Discoverability: Sitemap inclusion, Category Hub inclusion, RSS feed inclusion.
 * 7. Brand boundary: Zero forbidden strings, zero customer-facing ARGUS occurrences.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./src/server');
const { articleRepository } = require('./src/content/ArticleRepository');
const { CONTENT_STATUS } = require('./src/content/ContentModel');
const { ContentQualityEngine } = require('./src/content/ContentQualityEngine');

let server;
let baseUrl;

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
    req.end();
  });
}

async function runTicketSecuritySuite() {
  console.log('========================================================================');
  console.log('  TIKUM — TICKET SECURITY EDUCATION & VERIFICATION SUITE');
  console.log('========================================================================\n');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

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

  try {
    // -------------------------------------------------------------
    // PART 1: FAQ SECURITY FIRST ARCHITECTURE
    // -------------------------------------------------------------
    console.log('--- 1. FAQ Security-First Architecture ---');

    let faqRes;
    await checkAsync('/faq returns 200 OK and serves valid HTML', async () => {
      faqRes = await request('/faq');
      assert.strictEqual(faqRes.statusCode, 200);
      assert.ok(faqRes.body.includes('<!DOCTYPE html>'));
    });

    check('FAQ security section appears at the VERY TOP before ordinary FAQ categories', () => {
      const securityIndex = faqRes.body.indexOf('id="ticket-security"');
      const generalIndex = faqRes.body.indexOf('1. Informasi Umum (General)');
      const buyerIndex = faqRes.body.indexOf('2. Panduan Pembeli (Buyer)');

      assert.ok(securityIndex !== -1, 'Ticket security section must exist in FAQ');
      assert.ok(generalIndex !== -1, 'General FAQ section must exist');
      assert.ok(securityIndex < generalIndex, 'Ticket security section must appear BEFORE 1. Informasi Umum');
      assert.ok(securityIndex < buyerIndex, 'Ticket security section must appear BEFORE 2. Panduan Pembeli');
    });

    check('Prominent heading: "Bagaimana TIKUM Melindungi Pembeli dan Penjual dari Penipuan Tiket?"', () => {
      assert.ok(
        faqRes.body.includes('Bagaimana TIKUM Melindungi Pembeli dan Penjual dari Penipuan Tiket?'),
        'Prominent title must be verbatim present'
      );
    });

    check('Distinguishes 4 verification levels: Digitally verified, Operationally verified, Venue-assisted, Not independently verifiable', () => {
      assert.ok(faqRes.body.includes('Digitally Verified'), 'Must explain Digitally Verified');
      assert.ok(faqRes.body.includes('Operationally Verified'), 'Must explain Operationally Verified');
      assert.ok(faqRes.body.includes('Venue-Assisted'), 'Must explain Venue-Assisted');
      assert.ok(faqRes.body.includes('Not Independently Verifiable'), 'Must explain Not Independently Verifiable');
    });

    check('FAQ covers all 8 core security questions with factual precision', () => {
      // 1. Ticket verification
      assert.ok(faqRes.body.includes('No Image-Only Verification'), 'Q1: Must state No Image-Only Verification');
      assert.ok(faqRes.body.includes('Invoice Resmi Pembelian Primer'), 'Q1: Must require primary purchase invoice');

      // 2. Seller verification
      assert.ok(faqRes.body.includes('4 Pilar Kepercayaan'), 'Q2: Must explain 4 Trust Pillars');
      assert.ok(faqRes.body.includes('UU PDP No. 27/2022'), 'Q2: Must cite UU PDP No. 27/2022');

      // 3. Payment protection
      assert.ok(faqRes.body.includes('Platform-Held') || faqRes.body.includes('Escrow'), 'Q3: Must explain platform-held escrow');
      assert.ok(faqRes.body.includes('ENTRY_CONFIRMED'), 'Q3: Must cite ENTRY_CONFIRMED release condition');

      // 4. Double-selling prevention & limitations
      assert.ok(faqRes.body.includes('SHA-256'), 'Q4: Must explain barcode SHA-256 hashing');
      assert.ok(
        faqRes.body.includes('Batasan Tanpa Integrasi API Primer') || faqRes.body.includes('tanpa integrasi API langsung'),
        'Q4: Must honestly disclose limitations without direct primary ticketing API integration'
      );

      // 5. Venue PIC
      assert.ok(faqRes.body.includes('Event PIC (Person In Charge)'), 'Q5: Must explain Event PIC role');
      assert.ok(faqRes.body.includes('/track'), 'Q5: Must direct users to /track for PIC contact and order tracking');

      // 6. Physical ticket exchange & wristbands
      assert.ok(faqRes.body.includes('Surat Kuasa'), 'Q6: Must explain Surat Kuasa requirement');
      assert.ok(faqRes.body.includes('gelang fisik') || faqRes.body.includes('wristband'), 'Q6: Must cover wristband exchange');

      // 7. Dispute resolution
      assert.ok(faqRes.body.includes('Ajukan Sengketa') || faqRes.body.includes('Resolusi sengketa'), 'Q7: Must cover dispute procedure');
      assert.ok(faqRes.body.includes('Kebijakan Refund'), 'Q7: Must link to Refund Policy');

      // 8. Fraud reporting
      assert.ok(faqRes.body.includes('Laporkan Transaksi') || faqRes.body.includes('support@tikum.app'), 'Q8: Must provide fraud reporting channels');
    });

    check('FAQ includes valid Schema.org FAQPage JSON-LD structured data', () => {
      const match = faqRes.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      assert.ok(match, 'FAQ must have application/ld+json script tag');
      const parsed = JSON.parse(match[1]);
      assert.strictEqual(parsed['@context'], 'https://schema.org');
      assert.strictEqual(parsed['@type'], 'FAQPage');
      assert.ok(Array.isArray(parsed.mainEntity), 'mainEntity must be an array');
      assert.ok(parsed.mainEntity.length >= 8, 'FAQ schema must have at least 8 questions');
      assert.ok(parsed.mainEntity.some(item => item.name.includes('keaslian dan informasi tiket')));
      assert.ok(parsed.mainEntity.some(item => item.name.includes('double-selling')));
      assert.ok(parsed.mainEntity.some(item => item.name.includes('Event PIC di venue')));
    });

    check('FAQ links to the published Security Explainer blog article', () => {
      assert.ok(
        faqRes.body.includes('/blog/bagaimana-tikum-melindungi-pembeli-tiket'),
        'FAQ must include link to /blog/bagaimana-tikum-melindungi-pembeli-tiket'
      );
    });

    // -------------------------------------------------------------
    // PART 2: BLOG EXPLAINER ARTICLE PUBLICATION & SEO
    // -------------------------------------------------------------
    console.log('\n--- 2. Blog Explainer Article Publication & SEO ---');

    let blogRes;
    const articleSlug = 'bagaimana-tikum-melindungi-pembeli-tiket';
    const articleUrl = `/blog/${articleSlug}`;

    await checkAsync(`${articleUrl} returns 200 OK for public request (genuinely published)`, async () => {
      blogRes = await request(articleUrl);
      assert.strictEqual(blogRes.statusCode, 200, 'Article must return 200 OK');
      assert.ok(!blogRes.body.includes('Artikel Tidak Ditemukan'), 'Article must not be 404');
    });

    check('Article title matches verbatim requirement', () => {
      const expectedTitle = 'Bagaimana Sistem Keamanan Tiket TIKUM Bekerja? Mengenal Verifikasi Tiket, Perlindungan Transaksi, dan PIC di Venue';
      assert.ok(blogRes.body.includes(expectedTitle), 'Must render official article title');
    });

    check('Article canonical URL is https://tikum.app/blog/bagaimana-tikum-melindungi-pembeli-tiket', () => {
      assert.ok(
        blogRes.body.includes('<link rel="canonical" href="https://tikum.app/blog/bagaimana-tikum-melindungi-pembeli-tiket">'),
        'Must specify canonical link'
      );
    });

    check('Article contains BlogPosting / Article and FAQPage JSON-LD schemas', () => {
      assert.ok(blogRes.body.includes('BlogPosting'), 'Must include BlogPosting schema');
      assert.ok(blogRes.body.includes('BreadcrumbList'), 'Must include BreadcrumbList schema');
      assert.ok(blogRes.body.includes('FAQPage'), 'Must include FAQPage schema');
    });

    check('Article contains all required substantive security and operations topics', () => {
      // Social media risks
      assert.ok(blogRes.body.includes('Mengapa Membeli Tiket di Media Sosial Sangat Berisiko'), 'Must cover social media risks');

      // Common scams
      assert.ok(blogRes.body.includes('Photoshop Scams') || blogRes.body.includes('Manipulasi Grafis'), 'Must cover fake ticket scams');
      assert.ok(blogRes.body.includes('Double-Selling') || blogRes.body.includes('Penjualan Ganda'), 'Must cover double-selling');
      assert.ok(blogRes.body.includes('Wristband Mismatch') || blogRes.body.includes('Ketidaksesuaian Identitas'), 'Must cover identity mismatch');
      assert.ok(blogRes.body.includes('Ghosting &amp; Seller No-Show') || blogRes.body.includes('Penjual Fiktif Menghilang'), 'Must cover ghosting');

      // Seller & Ticket verification
      assert.ok(blogRes.body.includes('4 Pilar Kepercayaan'), 'Must cover 4 Trust Pillars');
      assert.ok(blogRes.body.includes('No Image-Only Verification'), 'Must enforce No Image-Only Verification');
      assert.ok(blogRes.body.includes('SHA-256'), 'Must cover barcode hashing');

      // 4 Verification levels
      assert.ok(blogRes.body.includes('Terverifikasi Digital') && blogRes.body.includes('Digitally Verified'));
      assert.ok(blogRes.body.includes('Terverifikasi Operasional') && blogRes.body.includes('Operationally Verified'));
      assert.ok(blogRes.body.includes('Didampingi di Venue') && blogRes.body.includes('Venue-Assisted'));
      assert.ok(blogRes.body.includes('Tidak Dapat Diverifikasi Independen') && blogRes.body.includes('Not Independently Verifiable'));

      // Step-by-step lifecycle flow
      assert.ok(blogRes.body.includes('Pengajuan Tiket') && blogRes.body.includes('ENTRY_CONFIRMED'), 'Must contain step-by-step lifecycle flow');

      // Human PIC at venue
      assert.ok(blogRes.body.includes('Event PIC (Person In Charge)'), 'Must cover Event PIC');

      // Dispute & Refund
      assert.ok(blogRes.body.includes('Resolusi Sengketa') || blogRes.body.includes('Dispute'), 'Must cover dispute procedure');
      assert.ok(blogRes.body.includes('Kebijakan Pengembalian Dana') || blogRes.body.includes('Refund Policy'), 'Must cover refund terms');

      // Can and cannot guarantee
      assert.ok(blogRes.body.includes('Yang Dijamin oleh TIKUM') && blogRes.body.includes('Yang Tidak Dapat Dijamin oleh TIKUM'), 'Must delineate guarantees vs limits');

      // Practical safety checklist
      assert.ok(blogRes.body.includes('Checklist Keamanan Pembeli Tiket Konser'), 'Must include Buyer Safety Checklist');

      // CTA to explore tickets
      assert.ok(blogRes.body.includes('href="/events"'), 'Must include CTA linking to /events');
    });

    check('ContentQualityEngine validates factuality, trust, depth, and zero forbidden claims', () => {
      const art = articleRepository.getArticleBySlug(articleSlug);
      assert.ok(art, 'Article must exist in repository');
      const evalReport = ContentQualityEngine.evaluate(art);
      assert.strictEqual(evalReport.fact_check_passed, true, 'Fact check must pass without flags');
      assert.strictEqual(evalReport.quality_score, 100, 'Quality score must be 100');
      assert.strictEqual(evalReport.trust_score, 100, 'Trust score must be 100');
      assert.strictEqual(evalReport.readability_score, 100, 'Readability score must be 100');
      assert.ok(evalReport.seo_score >= 70, 'SEO score must be >= 70');
    });

    // -------------------------------------------------------------
    // PART 3: DISCOVERABILITY & INTEGRATION
    // -------------------------------------------------------------
    console.log('\n--- 3. Discoverability & Integration ---');

    await checkAsync('Blog Index /blog lists the published security explainer article', async () => {
      const res = await request('/blog');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes(articleSlug), 'Blog index must list the article slug');
      assert.ok(res.body.includes('Bagaimana Sistem Keamanan Tiket TIKUM Bekerja'), 'Blog index must render title');
    });

    await checkAsync('Category Hub /blog/category/ticket-safety lists the security explainer article', async () => {
      const res = await request('/blog/category/ticket-safety');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes(articleSlug), 'Category hub must list the article slug');
    });

    await checkAsync('RSS Feed /blog/rss.xml includes the security explainer article', async () => {
      const res = await request('/blog/rss.xml');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes(articleSlug), 'RSS feed must syndicate the article');
    });

    await checkAsync('Sitemap /sitemap.xml includes /faq and the published article', async () => {
      const res = await request('/sitemap.xml');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('<loc>https://tikum.app/faq</loc>'), 'Sitemap must contain /faq');
      assert.ok(
        res.body.includes(`<loc>https://tikum.app${articleUrl}</loc>`),
        'Sitemap must contain article URL'
      );
    });

    await checkAsync('/ticket-verification trust page links to the explainer article and FAQ', async () => {
      const res = await request('/ticket-verification');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('/blog/bagaimana-tikum-melindungi-pembeli-tiket'), 'Must link to security article');
      assert.ok(res.body.includes('/faq#ticket-security'), 'Must link to FAQ security section');
    });

    // -------------------------------------------------------------
    // PART 4: BRAND BOUNDARY INVARIANTS
    // -------------------------------------------------------------
    console.log('\n--- 4. Brand Boundary Invariants ---');

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

    check('FAQ surface /faq contains ZERO forbidden strings', () => {
      for (const forbidden of forbiddenStrings) {
        assert.ok(
          !faqRes.body.includes(forbidden),
          `FAQ must not contain forbidden brand string: "${forbidden}"`
        );
      }
      assert.ok(!faqRes.body.includes('ARGUS'), 'FAQ must have ZERO customer-facing ARGUS occurrences');
    });

    check('Blog article /blog/bagaimana-tikum-melindungi-pembeli-tiket contains ZERO forbidden strings', () => {
      for (const forbidden of forbiddenStrings) {
        assert.ok(
          !blogRes.body.includes(forbidden),
          `Blog article must not contain forbidden brand string: "${forbidden}"`
        );
      }
      assert.ok(!blogRes.body.includes('ARGUS'), 'Blog article must have ZERO customer-facing ARGUS occurrences');
    });

    console.log('\n========================================================================');
    console.log(`  All ${passed}/${total} Ticket Security & Verification tests PASSED!`);
    console.log('========================================================================\n');

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

if (require.main === module) {
  runTicketSecuritySuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nTest Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = { runTicketSecuritySuite };
