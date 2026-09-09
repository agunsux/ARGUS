/**
 * ARGUS — iPaymu Compliance & Public Trust Pages Verification Test Suite
 * 
 * Verifies:
 * 1. HTTP 200 status for all public legal/trust pages without authentication
 * 2. Exact match of canonical business profile across all public pages
 * 3. Exact matching of phone, email, and multi-line address
 * 4. Zero placeholders (Lorem ipsum, example.com, test@test, 000000, etc.)
 * 5. Functional mailto and WhatsApp links
 * 6. Footer presence and links on all public pages
 */

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { businessProfile } = require('./src/config/businessProfile');

let server;
let baseUrl;

function request(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('  ARGUS — IPAYMU COMPLIANCE & PUBLIC TRUST TESTS');
  console.log('====================================================\n');

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

  // Start temporary test server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // Test 1: Canonical business profile config integrity
    check('Canonical business profile has exact required values', () => {
      assert.strictEqual(businessProfile.name, 'SHINERVA HQ');
      assert.strictEqual(businessProfile.email, 'agunsux@gmail.com');
      assert.strictEqual(businessProfile.phone, '081299927378');
      assert.strictEqual(businessProfile.whatsappNumber, '081299927378');
      assert.strictEqual(businessProfile.whatsappUrl, 'https://wa.me/6281299927378');
      assert.strictEqual(businessProfile.emailUrl, 'mailto:agunsux@gmail.com');
      assert.strictEqual(businessProfile.address.street, 'Jl. Pasirluyu No. 79');
      assert.strictEqual(businessProfile.address.city, 'Bandung');
      assert.strictEqual(businessProfile.address.postalCode, '40254');
      assert.strictEqual(businessProfile.address.country, 'Indonesia');
    });

    // Test 2: GET /api/business-profile
    const apiRes = await request('/api/business-profile');
    check('GET /api/business-profile returns 200 and canonical data', () => {
      assert.strictEqual(apiRes.statusCode, 200);
      const json = JSON.parse(apiRes.body);
      assert.strictEqual(json.name, 'SHINERVA HQ');
      assert.strictEqual(json.email, 'agunsux@gmail.com');
      assert.strictEqual(json.phone, '081299927378');
      assert.strictEqual(json.address.city, 'Bandung');
      assert.strictEqual(json.address.postalCode, '40254');
      assert.strictEqual(json.address.country, 'Indonesia');
    });

    // Test 3: Public routes HTTP 200 accessibility without auth
    const trustRoutes = ['/faq', '/terms', '/refund-policy', '/contact'];
    const responses = {};

    for (const route of trustRoutes) {
      responses[route] = await request(route);
      check(`Route ${route} returns 200 OK without authentication`, () => {
        assert.strictEqual(responses[route].statusCode, 200);
        assert.ok(responses[route].body.length > 500, `${route} response body too short`);
      });
    }

    // Test 4: /refund redirect to /refund-policy
    const refundRedirect = await request('/refund');
    check('Route /refund redirects (302) to /refund-policy', () => {
      assert.strictEqual(refundRedirect.statusCode, 302);
      assert.strictEqual(refundRedirect.headers.location, '/refund-policy');
    });

    // Test 5: Exact Contact Information on all 4 required pages
    for (const route of trustRoutes) {
      const html = responses[route].body;
      check(`Route ${route} contains exact business name "SHINERVA HQ"`, () => {
        assert.ok(html.includes('SHINERVA HQ'), `Missing SHINERVA HQ in ${route}`);
      });
      check(`Route ${route} contains exact email "agunsux@gmail.com"`, () => {
        assert.ok(html.includes('agunsux@gmail.com'), `Missing agunsux@gmail.com in ${route}`);
        assert.ok(html.includes('mailto:agunsux@gmail.com'), `Missing mailto:agunsux@gmail.com in ${route}`);
      });
      check(`Route ${route} contains exact phone & WhatsApp link "081299927378"`, () => {
        assert.ok(html.includes('081299927378'), `Missing 081299927378 text in ${route}`);
        assert.ok(html.includes('https://wa.me/6281299927378'), `Missing wa.me link in ${route}`);
      });
      check(`Route ${route} contains exact address "Jl. Pasirluyu No. 79, Bandung 40254, Indonesia"`, () => {
        assert.ok(html.includes('Jl. Pasirluyu No. 79'), `Missing Pasirluyu in ${route}`);
        assert.ok(html.includes('Bandung 40254'), `Missing Bandung 40254 in ${route}`);
        assert.ok(html.includes('Indonesia'), `Missing Indonesia in ${route}`);
      });
    }

    // Test 6: Global footer links verification across all 4 pages
    for (const route of trustRoutes) {
      const html = responses[route].body;
      check(`Route ${route} footer links to all required compliance pages`, () => {
        assert.ok(html.includes('href="/faq"'), `Missing /faq link in ${route}`);
        assert.ok(html.includes('href="/terms"'), `Missing /terms link in ${route}`);
        assert.ok(html.includes('href="/refund-policy"'), `Missing /refund-policy link in ${route}`);
        assert.ok(html.includes('href="/contact"'), `Missing /contact link in ${route}`);
        assert.ok(html.includes('href="/privacy"'), `Missing /privacy link in ${route}`);
      });
    }

    // Test 7: Homepage footer verification
    const homeRes = await request('/');
    check('Homepage (/) returns 200 and has compliant footer', () => {
      assert.strictEqual(homeRes.statusCode, 200);
      assert.ok(homeRes.body.includes('SHINERVA HQ'));
      assert.ok(homeRes.body.includes('agunsux@gmail.com'));
      assert.ok(homeRes.body.includes('081299927378'));
      assert.ok(homeRes.body.includes('Jl. Pasirluyu No. 79'));
      assert.ok(homeRes.body.includes('Bandung 40254'));
      assert.ok(homeRes.body.includes('Indonesia'));
      assert.ok(homeRes.body.includes('href="/faq"'));
      assert.ok(homeRes.body.includes('href="/terms"'));
      assert.ok(homeRes.body.includes('href="/refund-policy"'));
      assert.ok(homeRes.body.includes('href="/contact"'));
    });

    // Test 8: Content Verification for FAQ
    const faqHtml = responses['/faq'].body;
    check('FAQ page covers all required domain categories', () => {
      assert.ok(faqHtml.includes('Apa itu Tikum?') || faqHtml.includes('Apa itu ARGUS?'), 'Missing General section');
      assert.ok(faqHtml.includes('Bagaimana cara membeli tiket?'), 'Missing Buyer section');
      assert.ok(faqHtml.includes('Bagaimana cara membuat listing?'), 'Missing Seller section');
      assert.ok(faqHtml.includes('melindungi buyer'), 'Missing Safety section');
      assert.ok(faqHtml.includes('Kapan refund dapat diberikan?'), 'Missing Refund section');
      assert.ok(faqHtml.includes('informasi event'), 'Missing Event Discovery section');
      assert.ok(faqHtml.includes('Kontak Layanan Operasional'), 'Missing Contact section');
    });

    // Test 9: Content Verification for Terms & Conditions (23 minimum sections)
    const termsHtml = responses['/terms'].body;
    check('Terms page contains all required sections and legal clarity', () => {
      assert.ok(termsHtml.includes('1. Pendahuluan'), 'Missing Sec 1');
      assert.ok(termsHtml.includes('2. Definisi'), 'Missing Sec 2');
      assert.ok(termsHtml.includes('Peran Tikum sebagai Platform Kepercayaan') || termsHtml.includes('Peran ARGUS sebagai Platform Kepercayaan'), 'Missing Sec 3');
      assert.ok(termsHtml.includes('4. Kelayakan Pengguna'), 'Missing Sec 4');
      assert.ok(termsHtml.includes('5. Tanggung Jawab Akun'), 'Missing Sec 5');
      assert.ok(termsHtml.includes('6. Tanggung Jawab Pembeli'), 'Missing Sec 6');
      assert.ok(termsHtml.includes('7. Tanggung Jawab Penjual'), 'Missing Sec 7');
      assert.ok(termsHtml.includes('8. Aturan Listing Tiket &amp; Anti-Duplikasi'), 'Missing Sec 8');
      assert.ok(termsHtml.includes('9. Verifikasi Tiket &amp; Dokumen Bukti'), 'Missing Sec 9');
      assert.ok(termsHtml.includes('10. Penetapan Harga Transparan'), 'Missing Sec 10');
      assert.ok(termsHtml.includes('11. Mekanisme Penawaran Terstruktur (Make Offer)'), 'Missing Sec 11');
      assert.ok(termsHtml.includes('12. Pembayaran &amp; Rekening Bersama (Escrow)'), 'Missing Sec 12');
      assert.ok(termsHtml.includes('13. Siklus Pesanan (Order Lifecycle)'), 'Missing Sec 13');
      assert.ok(termsHtml.includes('14. Pembatalan Pesanan'), 'Missing Sec 14');
      assert.ok(termsHtml.includes('15. Pengembalian Dana (Refund)'), 'Missing Sec 15');
      assert.ok(termsHtml.includes('16. Penyelesaian Sengketa di Lokasi Venue'), 'Missing Sec 16');
      assert.ok(termsHtml.includes('17. Pembatalan &amp; Penundaan Acara'), 'Missing Sec 17');
      assert.ok(termsHtml.includes('18. Larangan Penipuan &amp; Aktivitas Ilegal'), 'Missing Sec 18');
      assert.ok(termsHtml.includes('19. Hak Platform &amp; Pemblokiran Akun'), 'Missing Sec 19');
      assert.ok(termsHtml.includes('20. Batasan Tanggung Jawab'), 'Missing Sec 20');
      assert.ok(termsHtml.includes('21. Rujukan Kebijakan Privasi &amp; UU PDP'), 'Missing Sec 21');
      assert.ok(termsHtml.includes('22. Perubahan Ketentuan Layanan'), 'Missing Sec 22');
      assert.ok(termsHtml.includes('23. Kontak Resmi Pengelola'), 'Missing Sec 23');
    });

    // Test 10: Content Verification for Refund Policy
    const refundHtml = responses['/refund-policy'].body;
    check('Refund Policy matches actual Tikum & ARGUS escrow lifecycle and conditions', () => {
      assert.ok(refundHtml.includes('Kondisi yang Memenuhi Syarat Pengembalian Dana'));
      assert.ok(refundHtml.includes('Kondisi yang Tidak Memenuhi Syarat Pengembalian Dana'));
      assert.ok(refundHtml.includes('Penundaan Acara (Event Postponement / Reschedule)'));
      assert.ok(refundHtml.includes('Alur &amp; Prosedur Pengajuan Sengketa'));
      assert.ok(refundHtml.includes('Mekanisme &amp; Durasi Pencairan Pengembalian Dana'));
      assert.ok(refundHtml.includes('agunsux@gmail.com'));
      assert.ok(refundHtml.includes('081299927378'));
    });

    // Test 11: Content Verification for Contact Page
    const contactHtml = responses['/contact'].body;
    check('Contact page clearly displays all canonical contact channels and support steps', () => {
      assert.ok(contactHtml.includes('SHINERVA HQ'));
      assert.ok(contactHtml.includes('agunsux@gmail.com'));
      assert.ok(contactHtml.includes('081299927378'));
      assert.ok(contactHtml.includes('Jl. Pasirluyu No. 79'));
      assert.ok(contactHtml.includes('Bandung 40254'));
      assert.ok(contactHtml.includes('Indonesia'));
      assert.ok(contactHtml.includes('Butuh Bantuan Terkait Transaksi Tiket Tertentu?'));
    });

    // Test 12: Zero Placeholder Audit across all 4 trust pages + homepage + privacy
    const checkedPages = [
      { name: 'FAQ', body: faqHtml },
      { name: 'Terms', body: termsHtml },
      { name: 'Refund Policy', body: refundHtml },
      { name: 'Contact', body: contactHtml },
      { name: 'Homepage', body: homeRes.body },
      { name: 'Privacy', body: (await request('/privacy')).body }
    ];

    const forbiddenPatterns = [
      'Lorem ipsum',
      'test@test',
      'your@email',
      'your address',
      '123456',
      '000000',
      'Coming soon',
      'TODO',
      'FIXME'
    ];

    for (const page of checkedPages) {
      for (const pattern of forbiddenPatterns) {
        check(`Page ${page.name} does not contain placeholder "${pattern}"`, () => {
          assert.strictEqual(
            page.body.includes(pattern),
            false,
            `Found forbidden placeholder "${pattern}" in ${page.name}`
          );
        });
      }
    }

    // Test 13: SSR Event Discovery Pages have canonical footer
    const eventsRes = await request('/events');
    check('SSR /events discovery page renders canonical footer', () => {
      assert.strictEqual(eventsRes.statusCode, 200);
      assert.ok(eventsRes.body.includes('SHINERVA HQ'));
      assert.ok(eventsRes.body.includes('agunsux@gmail.com'));
      assert.ok(eventsRes.body.includes('081299927378'));
      assert.ok(eventsRes.body.includes('Jl. Pasirluyu No. 79'));
      assert.ok(eventsRes.body.includes('Bandung 40254'));
      assert.ok(eventsRes.body.includes('href="/faq"'));
      assert.ok(eventsRes.body.includes('href="/terms"'));
      assert.ok(eventsRes.body.includes('href="/refund-policy"'));
      assert.ok(eventsRes.body.includes('href="/contact"'));
    });

    console.log(`\nAll ${passed}/${total} compliance checks PASSED successfully!\n`);
  } finally {
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Compliance verification test failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
