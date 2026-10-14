/**
 * test_phase_b_truthfulness_and_ui.js
 * Verification suite for the 4 outstanding business-truthfulness risks:
 * 1. Risk A: Truthful transaction protection (Platform-Held, not licensed escrow)
 * 2. Risk B: Conspicuous demo item labeling on /pay and order creation rejection
 * 3. Risk C: Customer support hours (09:00-21:00 WIB) decoupled from Event PIC gate hours
 * 4. Risk D: Exact canonical pricing rules alignment across code, UI, and policy pages
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

const { PRICING_CONFIG, calculatePlatformFee } = require('./src/config/pricingConfig');
const { CanonicalFeeEngine, TIKUM_FEE_POLICY_V1 } = require('./src/pricing/CanonicalFeeEngine');
const mvpRouter = require('./src/api/mvpRouter');

let passedTests = 0;
let failedTests = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('\n================================================================');
console.log('  TIKUM — PHASE B TRUTHFULNESS & UI INTEGRATION TEST SUITE');
console.log('================================================================\n');

// ── 1. Risk A: Truthful Transaction Protection ──
console.log('── Section 1: Risk A — Platform-Held Transaction Protection ──');

const termsHtml = fs.readFileSync(path.join(__dirname, 'public/terms.html'), 'utf8');
const refundHtml = fs.readFileSync(path.join(__dirname, 'public/refund-policy.html'), 'utf8');
const contactHtml = fs.readFileSync(path.join(__dirname, 'public/contact.html'), 'utf8');
const faqHtml = fs.readFileSync(path.join(__dirname, 'public/faq.html'), 'utf8');
const payHtml = fs.readFileSync(path.join(__dirname, 'public/pay.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

it('1.1 Terms Section 12 explicitly disclaims bank/escrow licensing and defines platform-held control', () => {
  assert(termsHtml.includes('bukan merupakan lembaga perbankan'), 'Must disclaim being a bank');
  assert(termsHtml.includes('penyelenggara jasa escrow berizin'), 'Must disclaim being a licensed escrow provider');
  assert(/platform-held/i.test(termsHtml), 'Must describe platform-held control');
});

it('1.2 Contact page removes claims of licensed escrow account', () => {
  assert(!contactHtml.includes('rekening bersama berizin'), 'Must not claim rekening bersama berizin');
  assert(contactHtml.includes('platform-held'), 'Must describe platform-held protection');
});

it('1.3 Pay page explainer banner uses platform-held protection description', () => {
  assert(payHtml.includes('Perlindungan Pembayaran Terkelola Platform TIKUM'), 'Banner title updated');
  assert(payHtml.includes('platform-held'), 'Explainer uses platform-held');
});

it('1.4 Services section on homepage outlines platform-held transaction protection', () => {
  assert(indexHtml.includes('Perlindungan Transaksi &amp; Verifikasi Tiket'), 'Services pillar 2 updated');
  assert(indexHtml.includes('platform-held'), 'Services pillar 2 mentions platform-held');
});

// ── 2. Risk B: King Nassar Pilot Listing on /pay ──
console.log('\n── Section 2: Risk B — King Nassar Pilot Listing on /pay ──');

it('2.1 pay.html contains conspicuous #demoNoticeBanner with DEMO — BUKAN TIKET UNTUK DIJUAL', () => {
  assert(payHtml.includes('id="demoNoticeBanner"'), 'Must contain #demoNoticeBanner element');
  assert(payHtml.includes('DEMO — BUKAN TIKET UNTUK DIJUAL'), 'Must contain conspicuous warning header');
  assert(payHtml.includes('tidak dapat dibeli atau ditransaksikan secara riil'), 'Must state item is not for sale');
});

it('2.2 loadListingData in pay.html sets is_demo: true and status: DEMO_NOT_FOR_SALE', () => {
  assert(payHtml.includes("is_demo: true"), 'Must set is_demo flag');
  assert(payHtml.includes("status: 'DEMO_NOT_FOR_SALE'"), 'Must set status to DEMO_NOT_FOR_SALE');
  assert(payHtml.includes("Contoh Simulasi Checkout: Tiket Konser King Nassar"), 'Title must explicitly say Contoh Simulasi Checkout');
});

it('2.3 renderListing in pay.html disables submit button for demo items', () => {
  assert(payHtml.includes('Pembelian Dinonaktifkan (Item Demonstrasi)'), 'Button text must reflect disabled demo item');
  assert(payHtml.includes("btnOffer.style.display = 'none'"), 'Offer button hidden for demo items');
});

// ── 3. Risk C: Customer Support Hours vs Event PIC ──
console.log('\n── Section 3: Risk C — Support Hours & Event PIC Separation ──');

const publicPages = [
  { name: 'index.html', content: indexHtml },
  { name: 'pay.html', content: payHtml },
  { name: 'contact.html', content: contactHtml },
  { name: 'faq.html', content: faqHtml },
  { name: 'terms.html', content: termsHtml },
  { name: 'refund-policy.html', content: refundHtml },
  { name: 'hero.html', content: fs.readFileSync(path.join(__dirname, 'public/hero.html'), 'utf8') },
  { name: 'track.html', content: fs.readFileSync(path.join(__dirname, 'public/track.html'), 'utf8') }
];

it('3.1 All public pages define customer support hours as 09:00 - 21:00 WIB', () => {
  for (const page of publicPages) {
    assert(page.content.includes('09:00 - 21:00 WIB'), `${page.name} must specify 09:00 - 21:00 WIB`);
  }
});

it('3.2 No public page guarantees unconditional 24-hour venue standby', () => {
  for (const page of publicPages) {
    assert(!page.content.includes('Siaga 24 Jam di Venue'), `${page.name} must not claim Siaga 24 Jam di Venue`);
  }
});

it('3.3 Event PIC presence is correctly scoped to confirmed events and gate hours', () => {
  assert(termsHtml.includes('gate hours') || termsHtml.includes('jam operasional gerbang'), 'Terms defines gate hours');
  assert(faqHtml.includes('gate hours') || faqHtml.includes('jam operasional gerbang'), 'FAQ defines gate hours');
});

// ── 4. Risk D: Pricing & Business Rules Consistency ──
console.log('\n── Section 4: Risk D — Pricing Rules Consistency ──');

it('4.1 Canonical PRICING_CONFIG enforces 6% fee, 35k floor, 300k cap, 500k min price, 30% markup cap', () => {
  assert.strictEqual(PRICING_CONFIG.PLATFORM_FEE_PCT, 6);
  assert.strictEqual(PRICING_CONFIG.PLATFORM_MIN_FEE_IDR, 35000);
  assert.strictEqual(PRICING_CONFIG.PLATFORM_MAX_FEE_IDR, 300000);
  assert.strictEqual(PRICING_CONFIG.MIN_LISTING_PRICE_IDR, 500000);
  assert.strictEqual(PRICING_CONFIG.MAX_MARKUP_PCT, 30);
});

it('4.2 CanonicalFeeEngine constants match PRICING_CONFIG exactly', () => {
  assert.strictEqual(TIKUM_FEE_POLICY_V1.buyer_rate, 0.06);
  assert.strictEqual(TIKUM_FEE_POLICY_V1.minimum_fee, 35000);
  assert.strictEqual(TIKUM_FEE_POLICY_V1.maximum_fee, 300000);
});

it('4.3 Fee calculations match at all boundary points', () => {
  assert.strictEqual(CanonicalFeeEngine.calculateOrderPricing(500000).buyer_fee, 35000);
  assert.strictEqual(CanonicalFeeEngine.calculateOrderPricing(1000000).buyer_fee, 60000);
  assert.strictEqual(CanonicalFeeEngine.calculateOrderPricing(1500000).buyer_fee, 90000);
  assert.strictEqual(CanonicalFeeEngine.calculateOrderPricing(5000000).buyer_fee, 300000);
  assert.strictEqual(CanonicalFeeEngine.calculateOrderPricing(10000000).buyer_fee, 300000);
  assert.strictEqual(calculatePlatformFee(500000), 35000);
  assert.strictEqual(calculatePlatformFee(1000000), 60000);
  assert.strictEqual(calculatePlatformFee(1500000), 90000);
  assert.strictEqual(calculatePlatformFee(5000000), 300000);
  assert.strictEqual(calculatePlatformFee(10000000), 300000);
});

it('4.4 Terms Section 10 reflects minimum fee Rp 35.000 and max Rp 300.000', () => {
  assert(termsHtml.includes('Rp 35.000') || termsHtml.includes('Rp35.000'), 'Terms mentions min fee');
  assert(termsHtml.includes('Rp 300.000') || termsHtml.includes('Rp300.000'), 'Terms mentions max fee');
  assert(termsHtml.includes('30%'), 'Terms mentions 30% markup cap');
});

// ── 5. Integration: Backend Order Prevention for Demo Items ──
console.log('\n── Section 5: Integration — Backend Order Guard for Demo Items ──');

async function testBackendDemoOrderGuard() {
  const app = express();
  app.use(express.json());
  app.use('/api/mvp', mvpRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await itAsync('5.1 POST /api/mvp/buyer/order rejects list-pilot-preview with 400 DEMO_ITEM_NOT_PURCHASABLE', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/mvp/buyer/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr-buyer-01'
        },
        body: JSON.stringify({
          buyerId: 'usr-buyer-01',
          listingId: 'list-pilot-preview'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 400, 'Must return 400 HTTP status');
      assert.strictEqual(body.code, 'DEMO_ITEM_NOT_PURCHASABLE', 'Must return DEMO_ITEM_NOT_PURCHASABLE code');
      assert(body.error.includes('demonstrasi') || body.error.includes('simulasi'), 'Must explain demo restriction');
    });

    await itAsync('5.2 POST /api/mvp/buyer/order rejects demo- prefix listing IDs with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/mvp/buyer/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr-buyer-01'
        },
        body: JSON.stringify({
          buyerId: 'usr-buyer-01',
          listingId: 'demo-sample-ticket'
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 400, 'Must return 400 HTTP status');
      assert.strictEqual(body.code, 'DEMO_ITEM_NOT_PURCHASABLE', 'Must return DEMO_ITEM_NOT_PURCHASABLE code');
    });
  } finally {
    server.close();
  }
}

testBackendDemoOrderGuard().then(() => {
  console.log('\n================================================================');
  console.log(`  TRUTHFULNESS SUITE RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
});
