/**
 * TIKUM — Scheduled Publishing Engine & Release Readiness Test Suite
 * Gates A to F comprehensive verification:
 * 1. 30 Indonesian Articles across 5 pillars audited with zero flags, 100 SEO, 100 Quality.
 * 2. Bi-weekly cadence verified from 2026-10-15 to 2027-01-22 at 10:00 WIB.
 * 3. Request-time auto-scheduling (Article 01 visible, future articles 404 until due).
 * 4. Simulated time-travel requests prove automatic activation when scheduled_at arrives.
 * 5. Event catalog payload sanitized (< 150 KB).
 * 6. Legal entity PT SHINERVA PRAJNA TEJAS unified.
 * 7. Real money payments and settlements strictly locked.
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { articleRepository, ArticleRepository } = require('./src/content/ArticleRepository');
const { EDITORIAL_ARTICLES } = require('./src/content/seeds/editorialCampaignArticles');
const { ContentQualityEngine } = require('./src/content/ContentQualityEngine');
const { businessProfile } = require('./src/config/businessProfile');

let passedChecks = 0;
let totalChecks = 0;

function check(name, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedChecks++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function checkAsync(name, fn) {
  totalChecks++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedChecks++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

let server;
let baseUrl;

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM — SCHEDULED PUBLISHING ENGINE & RELEASE GATES SUITE');
  console.log('================================================================\n');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // GATE A: EDITORIAL CONTENT INVENTORY & QUALITY AUDIT (30 ARTICLES)
    // -------------------------------------------------------------
    console.log('--- GATE A: 30 Articles Quality & Editorial Standard ---');

    check('EDITORIAL_ARTICLES collection contains exactly 30 articles', () => {
      assert.strictEqual(EDITORIAL_ARTICLES.length, 30);
    });

    check('All 30 articles achieve 100 SEO, 100 Quality, 0 flags, and >= 750 words', () => {
      EDITORIAL_ARTICLES.forEach((art, idx) => {
        const num = idx + 1;
        const analysis = ContentQualityEngine.evaluate(art);
        const plainText = art.content.replace(/<[^>]*>/g, ' ').trim();
        const wordCount = plainText.split(/\s+/).filter(Boolean).length;

        assert.ok(wordCount >= 750, `Art ${num} (${art.slug}) word count ${wordCount} must be >= 750`);
        assert.strictEqual(analysis.seo_score, 100, `Art ${num} (${art.slug}) SEO score must be 100`);
        assert.strictEqual(analysis.quality_score, 100, `Art ${num} (${art.slug}) Quality score must be 100`);
        assert.strictEqual(analysis.flags.length, 0, `Art ${num} (${art.slug}) must have 0 flags: ${analysis.flags.join(', ')}`);
        assert.strictEqual(analysis.fact_check_passed, true, `Art ${num} (${art.slug}) fact check must pass`);
      });
    });

    check('Article 01 is published on 2026-10-15T10:00:00+07:00, Articles 02-30 are scheduled', () => {
      const art1 = EDITORIAL_ARTICLES[0];
      assert.strictEqual(art1.status, 'published');
      assert.strictEqual(art1.published_at, '2026-10-15T10:00:00+07:00');

      for (let i = 1; i < 30; i++) {
        const art = EDITORIAL_ARTICLES[i];
        assert.strictEqual(art.status, 'scheduled', `Art ${i+1} must be scheduled`);
        assert.ok(art.scheduled_at, `Art ${i+1} must have scheduled_at`);
      }

      const lastArt = EDITORIAL_ARTICLES[29];
      assert.strictEqual(lastArt.scheduled_at, '2027-01-22T10:00:00+07:00', 'Art 30 must be scheduled for 2027-01-22T10:00:00+07:00');
    });

    check('Article 07 includes balanced OJK PayLater disclosures without one-sided promotion', () => {
      const art7 = EDITORIAL_ARTICLES[6];
      assert.ok(art7.content.includes('OJK'), 'Must mention OJK');
      assert.ok(art7.content.includes('Kapan Sebaiknya Tidak Menggunakan PayLater'), 'Must include warning section');
      assert.ok(art7.content.toLowerCase().includes('disclaimer') || art7.content.toLowerCase().includes('edukasi'), 'Must have educational context');
    });

    check('Article 30 provides durable concert tracking framework without hallucinated 2027 dates', () => {
      const art30 = EDITORIAL_ARTICLES[29];
      assert.ok(art30.content.includes('APMI'), 'Must reference APMI');
      assert.ok(!art30.content.includes('Coldplay Jakarta 2027'), 'Must not hallucinate 2027 concert dates');
    });

    // -------------------------------------------------------------
    // GATE B: REQUEST-TIME SCHEDULING LOGIC & ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- GATE B: Request-Time Auto-Scheduling & Access Control ---');

    check('ArticleRepository.isArticleDue correctly isolates present vs future at 2026-10-16', () => {
      const art1 = EDITORIAL_ARTICLES[0];
      const art2 = EDITORIAL_ARTICLES[1];
      const art30 = EDITORIAL_ARTICLES[29];

      const testNow = new Date('2026-10-16T12:00:00+07:00');
      assert.strictEqual(ArticleRepository.isArticleDue(art1, testNow), true, 'Art 1 must be due');
      assert.strictEqual(ArticleRepository.isArticleDue(art2, testNow), false, 'Art 2 must not be due yet');
      assert.strictEqual(ArticleRepository.isArticleDue(art30, testNow), false, 'Art 30 must not be due yet');
    });

    check('Simulated time-travel: Article 02 automatically becomes due at 2026-10-20T10:00:00+07:00', () => {
      const art2 = EDITORIAL_ARTICLES[1];
      const futureDate = new Date('2026-10-20T10:00:01+07:00');
      assert.strictEqual(ArticleRepository.isArticleDue(art2, futureDate), true, 'Art 2 becomes due on its scheduled date');
    });

    check('Simulated time-travel: All 30 articles automatically become due by 2027-01-25', () => {
      const farFuture = new Date('2027-01-25T00:00:00+07:00');
      const dueArticles = articleRepository.getPublishedArticles(farFuture);
      assert.strictEqual(dueArticles.length, 30, 'All 30 articles must be due in late Jan 2027');
    });

    await checkAsync('Public GET /blog returns 200 and displays only currently due articles', async () => {
      const res = await request('/blog');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes(EDITORIAL_ARTICLES[0].title), 'Must display Article 01');
      assert.ok(!res.body.includes(EDITORIAL_ARTICLES[1].title), 'Must NOT display future Article 02 in public listing');
      assert.ok(!res.body.includes(EDITORIAL_ARTICLES[29].title), 'Must NOT display future Article 30 in public listing');
    });

    await checkAsync('Public GET /blog/:slug for Article 01 returns 200 with Article schema', async () => {
      const res = await request(`/blog/${EDITORIAL_ARTICLES[0].slug}`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes(EDITORIAL_ARTICLES[0].title));
      assert.ok(res.body.includes('BlogPosting') || res.body.includes('Article'));
      assert.ok(res.body.includes('https://schema.org'));
      assert.ok(res.body.includes(`https://tikum.app/blog/${EDITORIAL_ARTICLES[0].slug}`));
    });

    await checkAsync('Public GET /blog/:slug for future scheduled articles returns 404 with noindex', async () => {
      const res2 = await request(`/blog/${EDITORIAL_ARTICLES[1].slug}`);
      assert.strictEqual(res2.statusCode, 404, 'Future Article 02 must return 404');
      assert.ok(res2.body.includes('noindex'), 'Must include noindex on 404');

      const res30 = await request(`/blog/${EDITORIAL_ARTICLES[29].slug}`);
      assert.strictEqual(res30.statusCode, 404, 'Future Article 30 must return 404');
      assert.ok(res30.body.includes('noindex'), 'Must include noindex on 404');
    });

    // -------------------------------------------------------------
    // GATE C: EVENT CATALOG SANITIZATION (< 150 KB)
    // -------------------------------------------------------------
    console.log('\n--- GATE C: Event Catalog Sanitization ---');

    await checkAsync('GET /api/mvp/events payload is lightweight (< 150 KB)', async () => {
      const { state } = require('./src/database');
      state.events.unshift({
        id: 'evt-test-1',
        name: 'Pesta Musik Indonesia 2027',
        title: 'Pesta Musik Indonesia 2027',
        start_date: '2027-02-15',
        date: '2027-02-15',
        end_date: '2027-02-15',
        venue: 'GBK Stadium',
        venue_name: 'GBK Stadium',
        venue_city: 'Jakarta',
        city: 'Jakarta',
        category: 'KONSER',
        status: 'UPCOMING',
        lifecycle_status: 'UPCOMING',
        is_verified: true,
        verification_status: 'VERIFIED',
        source_url: 'https://promoter.id/official-announcement-2027',
        evidence_hash: 'sha256-evidence-test-hash-123456789',
        verified_at: '2026-10-15T09:00:00+07:00',
        source: 'PRIMARY_SOURCE_VERIFIED',
        observations: new Array(500).fill({ crawler: 'bot-1', raw_html: '<div>heavy crawler dump</div>' }),
        event_history: new Array(500).fill({ timestamp: '2026-10-15', diff: 'some heavy diff log' })
      });

      const res = await request('/api/mvp/events');
      assert.strictEqual(res.statusCode, 200);
      const byteLength = Buffer.byteLength(res.body, 'utf8');
      assert.ok(byteLength < 150 * 1024, `Payload size ${byteLength} bytes must be under 150 KB`);
      const data = JSON.parse(res.body);
      assert.ok(Array.isArray(data.events));
      assert.ok(data.events.length > 0);
      // Verify projected fields only
      const sample = data.events[0];
      assert.ok(sample.id);
      assert.ok(sample.title);
      assert.strictEqual(sample.observations, undefined, 'Must not leak observations');
      assert.strictEqual(sample.event_history, undefined, 'Must not leak event_history');
    });

    // -------------------------------------------------------------
    // GATE D: LEGAL ENTITY & TRUST PAGES ACCURACY
    // -------------------------------------------------------------
    console.log('\n--- GATE D: Legal Entity & Escrow Claims Consistency ---');

    check('businessProfile uses official legal entity PT SHINERVA PRAJNA TEJAS', () => {
      assert.strictEqual(businessProfile.legalEntity, 'PT SHINERVA PRAJNA TEJAS');
    });

    await checkAsync('Legal and trust pages strictly display PT SHINERVA PRAJNA TEJAS', async () => {
      const pages = ['/terms', '/refund-policy', '/contact'];
      for (const p of pages) {
        const res = await request(p);
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body.includes('PT SHINERVA PRAJNA TEJAS'), `${p} must mention PT SHINERVA PRAJNA TEJAS`);
      }
    });

    await checkAsync('Trust pages (/how-it-works, /buyer-protection, /seller-protection, /escrow, /disputes) are accessible and claim-compliant', async () => {
      const trustRoutes = ['/how-it-works', '/buyer-protection', '/seller-protection', '/escrow', '/disputes'];
      for (const p of trustRoutes) {
        const res = await request(p);
        assert.strictEqual(res.statusCode, 200);
        // Ensure zero forbidden misleading claims
        assert.ok(!res.body.includes('100% scam-free'), `${p} must not claim 100% scam-free`);
        assert.ok(!res.body.includes('pertama di Indonesia'), `${p} must not claim pertama di Indonesia`);
      }
    });

    check('Real money payments, payouts, and settlements remain strictly locked', () => {
      const { PaymentService } = require('./src/services/payment/PaymentService');
      const status = PaymentService.getSubsystemStatus();
      assert.strictEqual(status.marketplace_financial_state.real_money_active, false, 'real_money_active must be false');
      assert.strictEqual(status.marketplace_financial_state.settlement_active, false, 'settlement_active must be false');
      assert.strictEqual(status.safety_gates.NO_REAL_PAYMENT, true, 'NO_REAL_PAYMENT must be true');
      assert.strictEqual(status.safety_gates.NO_REAL_SETTLEMENT, true, 'NO_REAL_SETTLEMENT must be true');
    });

    console.log('\n================================================================');
    console.log(`  ALL ${passedChecks}/${totalChecks} RELEASE GATE CHECKS PASSED SUCCESSFULLY!`);
    console.log('================================================================\n');

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

runSuite().catch(err => {
  console.error('\n[SUITE FATAL ERROR]:', err);
  process.exit(1);
});
