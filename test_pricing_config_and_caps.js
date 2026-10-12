/**
 * TIKUM — Task 2 Pricing Configuration, Fee Floor & Markup Cap Test Suite
 *
 * Validates:
 * 1. Boundary 499,999 vs 500,000 (pilot minimum listing price floor)
 * 2. Minimum platform fee floor (Rp 35,000 active for lower ticket prices)
 * 3. Proportional fee (6%) and maximum fee cap (Rp 300,000)
 * 4. IDR minor-unit arithmetic and rounding invariants
 * 5. Markup cap: rejects price > faceValue * 1.30 when face value exists
 * 6. Missing face value: skips markup cap, flags listing for manual review queue
 * 7. End-to-end HTTP API validation on POST /api/mvp/seller/listing
 */

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { resetDatabase, state } = require('./src/database');
const {
  PRICING_CONFIG,
  calculatePlatformFee,
  calculatePricing,
  validateListingPrice
} = require('./src/config/pricingConfig');
const { CanonicalFeeEngine } = require('./src/pricing/CanonicalFeeEngine');
const { EscrowService } = require('./src/services/escrowService');

let server;
let baseUrl;
let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  TIKUM — PRICING CONFIG, FEE FLOOR & MARKUP CAP TEST SUITE       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  resetDatabase();

  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    // Part 1: Central Config Invariants
    // -------------------------------------------------------------
    console.log('── Part 1: Central Configuration Values ──');

    test('1. PRICING_CONFIG constants match pilot specification', () => {
      assert.strictEqual(PRICING_CONFIG.MIN_LISTING_PRICE_IDR, 500000);
      assert.strictEqual(PRICING_CONFIG.MAX_MARKUP_PCT, 30);
      assert.strictEqual(PRICING_CONFIG.PLATFORM_FEE_PCT, 6);
      assert.strictEqual(PRICING_CONFIG.PLATFORM_MIN_FEE_IDR, 35000);
      assert.strictEqual(PRICING_CONFIG.PLATFORM_MAX_FEE_IDR, 300000);
      assert.strictEqual(PRICING_CONFIG.CURRENCY, 'IDR');
    });

    // -------------------------------------------------------------
    // Part 2: Boundary 499,999 vs 500,000 (Minimum Listing Price)
    // -------------------------------------------------------------
    console.log('\n── Part 2: Minimum Listing Price Floor (Rp 500.000) ──');

    test('2. Price 499,999 is rejected with Indonesian error message and PRICE_BELOW_MINIMUM', () => {
      const result = validateListingPrice({ price: 499999, faceValue: 500000 });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.code, 'PRICE_BELOW_MINIMUM');
      assert.ok(result.error.includes('Harga tiket minimal Rp 500.000 untuk periode pilot.'));
    });

    test('3. Price 500,000 exactly satisfies the minimum listing price floor', () => {
      const result = validateListingPrice({ price: 500000, faceValue: 500000 });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.needsManualReview, false);
    });

    test('4. Non-positive or invalid price is rejected with INVALID_PRICE', () => {
      const resZero = validateListingPrice({ price: 0 });
      assert.strictEqual(resZero.valid, false);
      assert.strictEqual(resZero.code, 'INVALID_PRICE');

      const resNeg = validateListingPrice({ price: -100000 });
      assert.strictEqual(resNeg.valid, false);
      assert.strictEqual(resNeg.code, 'INVALID_PRICE');

      const resNaN = validateListingPrice({ price: 'invalid' });
      assert.strictEqual(resNaN.valid, false);
      assert.strictEqual(resNaN.code, 'INVALID_PRICE');
    });

    // -------------------------------------------------------------
    // Part 3: Minimum Fee Floor & Fee Calculation
    // -------------------------------------------------------------
    console.log('\n── Part 3: Platform Fee Floor & Calculation Logic ──');

    test('5. Price 500,000 triggers Rp 35,000 floor (6% = Rp 30,000 < Rp 35,000)', () => {
      const fee = calculatePlatformFee(500000);
      assert.strictEqual(fee, 35000);

      const pricing = calculatePricing(500000, 1, 0);
      assert.strictEqual(pricing.fee, 35000);
      assert.strictEqual(pricing.sellerPayout, 465000); // 500k - 35k
      assert.strictEqual(pricing.buyerSubtotal, 535000); // 500k + 35k
      assert.strictEqual(pricing.buyerTotal, 535000);
    });

    test('6. Price 1,000,000 applies proportional 6% (Rp 60,000 > Rp 35,000)', () => {
      const fee = calculatePlatformFee(1000000);
      assert.strictEqual(fee, 60000);

      const pricing = calculatePricing(1000000, 1, 5000);
      assert.strictEqual(pricing.fee, 60000);
      assert.strictEqual(pricing.sellerPayout, 940000);
      assert.strictEqual(pricing.buyerSubtotal, 1060000);
      assert.strictEqual(pricing.buyerTotal, 1065000); // 1.06M + 5k pg fee
    });

    test('7. Price 10,000,000 triggers maximum cap of Rp 300,000 (6% = Rp 600,000)', () => {
      const fee = calculatePlatformFee(10000000);
      assert.strictEqual(fee, 300000);

      const pricing = calculatePricing(10000000, 1, 0);
      assert.strictEqual(pricing.fee, 300000);
      assert.strictEqual(pricing.sellerPayout, 9700000);
      assert.strictEqual(pricing.buyerTotal, 10300000);
    });

    test('8. Multi-ticket quantity calculates fee on gross order ticket value', () => {
      // 2 tickets at Rp 500,000 = Rp 1,000,000 gross
      const pricing = calculatePricing(500000, 2, 0);
      assert.strictEqual(pricing.grossTicketValue, 1000000);
      assert.strictEqual(pricing.fee, 60000); // 6% on 1M, exceeds 35k floor
      assert.strictEqual(pricing.sellerPayout, 940000);
      assert.strictEqual(pricing.buyerTotal, 1060000);
    });

    // -------------------------------------------------------------
    // Part 4: Markup Cap Validation (30% vs Face Value)
    // -------------------------------------------------------------
    console.log('\n── Part 4: Markup Cap Validation (30% Cap) ──');

    test('9. Price within 30% markup is accepted when face value is present', () => {
      // Face value Rp 1,000,000 -> Max allowed Rp 1,300,000
      const exactCap = validateListingPrice({ price: 1300000, faceValue: 1000000 });
      assert.strictEqual(exactCap.valid, true);
      assert.strictEqual(exactCap.needsManualReview, false);

      const underCap = validateListingPrice({ price: 1100000, faceValue: 1000000 });
      assert.strictEqual(underCap.valid, true);
      assert.strictEqual(underCap.needsManualReview, false);
    });

    test('10. Price exceeding 30% markup is rejected with PRICE_EXCEEDS_MARKUP_CAP', () => {
      // Face value Rp 1,000,000 -> Asking Rp 1,300,001 (exceeds cap by Rp 1)
      const res = validateListingPrice({ price: 1300001, faceValue: 1000000 });
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.code, 'PRICE_EXCEEDS_MARKUP_CAP');
      assert.ok(res.error.includes('Harga tiket melebihi batas markup maksimum 30%'));
      assert.ok(res.error.includes('1.300.000'));
    });

    test('11. Resolves face value from event metadata if faceValue param omitted', () => {
      const mockEvent = {
        id: 'ev-test',
        face_value: 1000000
      };
      // 1,350,000 > 1,300,000
      const resOver = validateListingPrice({ price: 1350000, event: mockEvent });
      assert.strictEqual(resOver.valid, false);
      assert.strictEqual(resOver.code, 'PRICE_EXCEEDS_MARKUP_CAP');

      // 1,200,000 <= 1,300,000
      const resUnder = validateListingPrice({ price: 1200000, event: mockEvent });
      assert.strictEqual(resUnder.valid, true);
      assert.strictEqual(resUnder.needsManualReview, false);
    });

    test('12. Missing face value skips markup cap and flags listing for manual review', () => {
      const res = validateListingPrice({ price: 2000000, faceValue: null, event: null });
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.needsManualReview, true);
      assert.strictEqual(res.resolvedFaceValue, null);
    });

    // -------------------------------------------------------------
    // Part 5: Server-Side API Integration (POST /api/mvp/seller/listing)
    // -------------------------------------------------------------
    console.log('\n── Part 5: Server-Side Endpoint Validation (POST /api/mvp/seller/listing) ──');

    await testAsync('13. POST /api/mvp/seller/listing rejects price below Rp 500,000 with 400', async () => {
      const res = await request('POST', '/api/mvp/seller/listing', {
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'CAT 1 VIP',
        faceValue: 500000,
        price: 450000, // Below floor
        rawBarcode: `BC-TEST-${Date.now()}`
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, 'PRICE_BELOW_MINIMUM');
      assert.ok(res.data.error.includes('Harga tiket minimal Rp 500.000'));
    });

    await testAsync('14. POST /api/mvp/seller/listing rejects markup over 30% with 400', async () => {
      const res = await request('POST', '/api/mvp/seller/listing', {
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'CAT 1 VIP',
        faceValue: 1000000,
        price: 1500000, // 50% markup > 30% cap
        rawBarcode: `BC-TEST-CAP-${Date.now()}`
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, 'PRICE_EXCEEDS_MARKUP_CAP');
      assert.ok(res.data.error.includes('Harga tiket melebihi batas markup maksimum 30%'));
    });

    await testAsync('15. POST /api/mvp/seller/listing accepts valid price with 201 and creates listing', async () => {
      const res = await request('POST', '/api/mvp/seller/listing', {
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'CAT 1 VIP',
        faceValue: 1000000,
        price: 1200000, // 20% markup <= 30% cap
        rawBarcode: `BC-TEST-VALID-${Date.now()}`
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.listing.id);
      assert.strictEqual(res.data.listing.price, 1200000);
      assert.strictEqual(res.data.listing.needs_manual_review, false);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${total} passed, ${total - passed} failed`);
  console.log('══════════════════════════════════════════════════════════════════\n');
}

runTestSuite().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
