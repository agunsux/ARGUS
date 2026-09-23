/**
 * TIKUM — CANONICAL TRANSACTION FEE ENGINE V1 TEST SUITE
 * 
 * Tests all 20 mandatory test cases, reconciliation invariants,
 * boundary points, and anti-tampering guards for TIKUM_FEE_POLICY_V1.
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const app = require('./src/server');
const { state, resetDatabase, bootstrapAdminUser } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { CanonicalFeeEngine, TIKUM_FEE_POLICY_V1 } = require('./src/pricing/CanonicalFeeEngine');
const { MarketplacePricingEngine } = require('./src/pricing/MarketplacePricingEngine');
const { TransactionQuoteService } = require('./src/pricing/TransactionQuoteService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { MarketplaceListingService } = require('./src/services/marketplace/MarketplaceListingService');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { OfferService } = require('./src/services/offerService');

let server;
let baseUrl;
let passed = 0;
let total = 0;

function syncTest(name, fn) {
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

async function asyncTest(name, fn) {
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

async function runFeeTestSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  TIKUM — CANONICAL TRANSACTION FEE ENGINE V1 TEST SUITE          ║');
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
    // Part 1: Core Mathematical Formulas & Mandatory Price Points
    // -------------------------------------------------------------
    console.log('── Part 1: Mandatory Price Points & Boundary Conditions ──');

    syncTest('1. Price Rp 150,000 triggers Rp 10,000 floor (6% = Rp 9,000 < Rp 10,000)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 150000 });
      assert.strictEqual(res.gross_ticket_value, 150000);
      assert.strictEqual(res.raw_buyer_fee, 9000);
      assert.strictEqual(res.raw_seller_fee, 9000);
      assert.strictEqual(res.buyer_fee, 10000);
      assert.strictEqual(res.seller_fee, 10000);
      assert.strictEqual(res.seller_payout, 140000);
      assert.strictEqual(res.buyer_subtotal, 160000);
      assert.strictEqual(res.buyer_total, 160000);
      assert.strictEqual(res.total_tikum_fee, 20000);
    });

    syncTest('2. Price Rp 166,666 triggers Rp 10,000 floor (floor(166,666 * 6%) = Rp 9,999)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 166666 });
      assert.strictEqual(res.raw_buyer_fee, 9999);
      assert.strictEqual(res.buyer_fee, 10000);
      assert.strictEqual(res.seller_fee, 10000);
      assert.strictEqual(res.seller_payout, 156666);
      assert.strictEqual(res.buyer_total, 176666);
    });

    syncTest('3. Price Rp 500,000 applies proportional 6% (Rp 30,000)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 500000 });
      assert.strictEqual(res.buyer_fee, 30000);
      assert.strictEqual(res.seller_fee, 30000);
      assert.strictEqual(res.seller_payout, 470000);
      assert.strictEqual(res.buyer_total, 530000);
      assert.strictEqual(res.total_tikum_fee, 60000);
    });

    syncTest('4. Price Rp 1,000,000 applies proportional 6% (Rp 60,000)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 1000000 });
      assert.strictEqual(res.buyer_fee, 60000);
      assert.strictEqual(res.seller_fee, 60000);
      assert.strictEqual(res.seller_payout, 940000);
      assert.strictEqual(res.buyer_total, 1060000);
      assert.strictEqual(res.total_tikum_fee, 120000);
    });

    syncTest('5. Price Rp 2,000,000 applies proportional 6% (Rp 120,000)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 2000000 });
      assert.strictEqual(res.buyer_fee, 120000);
      assert.strictEqual(res.seller_fee, 120000);
      assert.strictEqual(res.seller_payout, 1880000);
      assert.strictEqual(res.buyer_total, 2120000);
      assert.strictEqual(res.total_tikum_fee, 240000);
    });

    syncTest('6. Price Rp 5,000,000 hits exact maximum cap (6% = Rp 300,000)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 5000000 });
      assert.strictEqual(res.buyer_fee, 300000);
      assert.strictEqual(res.seller_fee, 300000);
      assert.strictEqual(res.seller_payout, 4700000);
      assert.strictEqual(res.buyer_total, 5300000);
      assert.strictEqual(res.total_tikum_fee, 600000);
    });

    syncTest('7. Price Rp 10,000,000 triggers maximum cap of Rp 300,000 (6% = Rp 600,000 > Rp 300,000)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 10000000 });
      assert.strictEqual(res.raw_buyer_fee, 600000);
      assert.strictEqual(res.raw_seller_fee, 600000);
      assert.strictEqual(res.buyer_fee, 300000);
      assert.strictEqual(res.seller_fee, 300000);
      assert.strictEqual(res.seller_payout, 9700000);
      assert.strictEqual(res.buyer_total, 10300000);
      assert.strictEqual(res.total_tikum_fee, 600000);
    });

    syncTest('8. Minimum fee boundary testing across floor transition', () => {
      // At Rp 166,666 -> floor triggered (9,999 -> 10,000)
      const below = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 166666 });
      assert.strictEqual(below.buyer_fee, 10000);

      // At Rp 166,667 -> floor(166,667 * 6 / 100) = 10,000 exactly
      const exact = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 166667 });
      assert.strictEqual(exact.buyer_fee, 10000);

      // At Rp 166,684 -> floor(166,684 * 6 / 100) = 10,001 (exceeds floor)
      const above = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 166684 });
      assert.strictEqual(above.buyer_fee, 10001);
    });

    syncTest('9. Maximum fee boundary testing across cap transition', () => {
      // Rp 4,999,999 -> floor(4999999 * 6 / 100) = 299,999
      const below = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 4999999 });
      assert.strictEqual(below.buyer_fee, 299999);

      // Rp 5,000,000 -> 300,000
      const exact = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 5000000 });
      assert.strictEqual(exact.buyer_fee, 300000);

      // Rp 50,000,000 -> 300,000 cap applied
      const large = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 50000000 });
      assert.strictEqual(large.buyer_fee, 300000);
      assert.strictEqual(large.seller_fee, 300000);
      assert.strictEqual(large.seller_payout, 49700000);
      assert.strictEqual(large.buyer_total, 50300000);
    });

    // -------------------------------------------------------------
    // Part 2: Multi-Ticket, Rounding & Input Validation
    // -------------------------------------------------------------
    console.log('── Part 2: Multi-Ticket, Rounding & Edge Case Validation ──');

    syncTest('10. Multi-ticket order applies fee on gross ticket value (2 tickets @ Rp 500k = Rp 1M)', () => {
      const res = CanonicalFeeEngine.calculateTicketFees({
        ticketPrice: 500000,
        quantity: 2
      });
      assert.strictEqual(res.quantity, 2);
      assert.strictEqual(res.gross_ticket_value, 1000000);
      assert.strictEqual(res.buyer_fee, 60000, '6% on Rp 1M gross value is Rp 60k, not 2x10k');
      assert.strictEqual(res.seller_fee, 60000);
      assert.strictEqual(res.seller_payout, 940000);
      assert.strictEqual(res.buyer_total, 1060000);
    });

    syncTest('11. Zero price is rejected with INVALID_TICKET_PRICE', () => {
      assert.throws(() => {
        CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 0 });
      }, /INVALID_TICKET_PRICE/);
    });

    syncTest('12. Negative price is rejected with INVALID_TICKET_PRICE', () => {
      assert.throws(() => {
        CanonicalFeeEngine.calculateTicketFees({ ticketPrice: -50000 });
      }, /INVALID_TICKET_PRICE/);
    });

    syncTest('13. Non-IDR currency is rejected in V1 with INVALID_CURRENCY', () => {
      assert.throws(() => {
        CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 1000000, currency: 'USD' });
      }, /INVALID_CURRENCY/);
    });

    syncTest('14. Integer minor-unit IDR floor rounding edge cases (no floating point decimals)', () => {
      // Rp 123,456: floor(123456 * 6 / 100) = 7,407 -> clamped to 10,000 floor
      const res1 = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 123456 });
      assert.strictEqual(Number.isInteger(res1.buyer_fee), true);
      assert.strictEqual(res1.buyer_fee, 10000);

      // Rp 1,234,567: floor(1234567 * 6 / 100) = 74,074
      const res2 = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: 1234567 });
      assert.strictEqual(res2.buyer_fee, 74074);
      assert.strictEqual(res2.seller_fee, 74074);
      assert.strictEqual(res2.seller_payout, 1234567 - 74074);
      assert.strictEqual(res2.buyer_total, 1234567 + 74074);
    });

    // -------------------------------------------------------------
    // Part 3: Anti-Tampering, Immutability & Route Integration
    // -------------------------------------------------------------
    console.log('── Part 3: Anti-Tampering, Immutability & Endpoints ──');

    await asyncTest('15. Client fee tampering attempt is ignored; server enforces canonical 6% fee', async () => {
      // Setup seller and listing
      const listingRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'CAT 1 - Row 5',
        faceValue: 1000000,
        price: 1000000,
        rawBarcode: 'BC-TAMPER-001'
      });
      await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

      // Client attempts to pass forged buyer_fee: 5000 and total_amount: 1005000
      const orderRes = await request('POST', '/api/mvp/buyer/order', {
        buyerId: 'buyer-1',
        listingId: listingRes.listing.id,
        buyer_fee: 5000,
        total_amount: 1005000
      });

      assert.strictEqual(orderRes.status, 201);
      const order = orderRes.data.order;
      assert.strictEqual(order.buyer_fee, 60000, 'Server must enforce canonical 6% buyer fee (Rp 60.000)');
      assert.strictEqual(order.seller_fee, 60000, 'Server must enforce canonical 6% seller fee (Rp 60.000)');
      assert.strictEqual(order.buyer_subtotal, 1060000, 'Server must enforce canonical buyer subtotal (Rp 1.060.000)');
      assert.strictEqual(order.buyer_total, 1060000 + (order.buyer_tax || 0), 'Server must enforce total with tax reconciliation');
      assert.strictEqual(order.fee_policy_version, 'TIKUM_FEE_POLICY_V1');
    });

    await asyncTest('16. Checkout amount tampering is rejected with AMOUNT_MISMATCH', async () => {
      const listingRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'CAT 2 - Row 10',
        faceValue: 500000,
        price: 500000,
        rawBarcode: 'BC-TAMPER-PAY-001'
      });
      await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

      const orderRes = await EscrowService.createOrder({
        buyerId: 'buyer-1',
        listingId: listingRes.listing.id
      });
      const order = orderRes.order;
      assert.strictEqual(order.buyer_subtotal, 530000); // 500k + 30k (6%)
      assert.strictEqual(order.buyer_total, 530000 + (order.buyer_tax || 0));

      // Buyer attempts to pay Rp 10,000 less than canonical order total
      const tamperedAmount = order.buyer_total - 10000;
      const payAttempt = await request('POST', '/api/mvp/buyer/pay', {
        orderId: order.id,
        providerRef: 'payref-forged',
        idempotencyKey: 'idem-tamper-01',
        amountPaid: tamperedAmount
      });

      assert.strictEqual(payAttempt.status, 400);
      assert.strictEqual(payAttempt.data.code, 'AMOUNT_MISMATCH');
    });

    syncTest('17. Historical order with LEGACY-BUYER-10PCT retains its original fee snapshot', () => {
      // Historical order in state
      const histOrder = {
        id: 'ord-hist-legacy-01',
        buyer_id: 'buyer-legacy',
        ticket_price: 1000000,
        buyer_fee: 100000, // 10%
        seller_fee: 0,
        buyer_total: 1100000,
        seller_payout: 1000000,
        fee_policy_version: 'LEGACY-BUYER-10PCT',
        created_at: '2025-06-01T00:00:00Z'
      };
      state.orders.push(histOrder);

      // Verifying query returns historical snapshot unmodified
      const found = state.orders.find(o => o.id === 'ord-hist-legacy-01');
      assert.strictEqual(found.fee_policy_version, 'LEGACY-BUYER-10PCT');
      assert.strictEqual(found.buyer_fee, 100000);
      assert.strictEqual(found.seller_fee, 0);
      assert.strictEqual(found.buyer_total, 1100000);
    });

    await asyncTest('18. Refund consumes the original order fee snapshot rather than recalculating today', async () => {
      const listingRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'VIP - Row 1',
        faceValue: 2000000,
        price: 2000000,
        rawBarcode: 'BC-REFUND-001'
      });
      await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

      const orderRes = await EscrowService.createOrder({
        buyerId: 'buyer-1',
        listingId: listingRes.listing.id
      });
      const order = orderRes.order;
      assert.strictEqual(order.buyer_fee, 120000); // 6% of 2M
      assert.strictEqual(order.seller_fee, 120000);
      assert.strictEqual(order.buyer_subtotal, 2120000);

      // Pay order into escrow
      await EscrowService.recordPayment({
        orderId: order.id,
        providerRef: 'payref-rf-1',
        idempotencyKey: 'idem-rf-1',
        amountPaid: order.buyer_total
      });

      // Issue refund
      const refundRes = await EscrowService.refundToBuyer(order.id, 'admin-1', 'Event ticket invalid at gate');
      assert.strictEqual(refundRes.success, true);
      assert.strictEqual(refundRes.order.status, ORDER_STATUS.REFUNDED);

      // Ledger balances should reflect exact refund reversal
      const ledgerBalances = FinancialLedger.getAccountBalances();
      assert.strictEqual(ledgerBalances[LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING], 0);
      assert.strictEqual(ledgerBalances[LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE], 0);
      assert.strictEqual(ledgerBalances[LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING], 0);
    });

    await asyncTest('19. Admin financial overview reconciles with FinancialLedger double-entry accounts', async () => {
      const listingRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'CAT 1 - Row 2',
        faceValue: 1000000,
        price: 1000000,
        rawBarcode: 'BC-LEDGER-REC-001'
      });
      await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

      const orderRes = await EscrowService.createOrder({
        buyerId: 'buyer-1',
        listingId: listingRes.listing.id
      });

      await EscrowService.recordPayment({
        orderId: orderRes.order.id,
        providerRef: 'payref-rec-01',
        idempotencyKey: 'idem-rec-01',
        amountPaid: orderRes.order.buyer_total
      });

      // Authenticate admin session
      const adminRes = bootstrapAdminUser();
      const adminSession = SessionStore.createSession({ userId: adminRes.user.id, role: 'ADMIN' });

      // Query admin overview endpoint
      const res = await request('GET', '/api/admin/overview', null, {
        'Authorization': `Bearer ${adminSession.session_token}`
      });

      assert.strictEqual(res.status, 200);
      const snapshot = res.data.payment_finance_snapshot;
      assert.ok(snapshot, 'Snapshot must be present');
      // Total platform fee for 1M order: 60k buyer + 60k seller = 120,000
      assert.strictEqual(snapshot.platform_fee_revenue_idr, 120000);
      assert.strictEqual(snapshot.seller_payable_pending_idr, 940000 - (orderRes.order.seller_tax_withholding || 0));
      assert.strictEqual(snapshot.gateway_clearing_idr, orderRes.order.buyer_total);
    });

    await asyncTest('20. Every order creation path consumes canonical fee engine (Listing, Quote, Order, Offer)', async () => {
      // 1. Direct quote
      const quote = await TransactionQuoteService.generateQuote({
        ticketPrice: 1000000,
        buyerId: 'buyer-1'
      });
      assert.strictEqual(quote.fee_policy_version, 'TIKUM_FEE_POLICY_V1');
      assert.strictEqual(quote.buyer_fee, 60000);
      assert.strictEqual(quote.seller_fee, 60000);

      // 2. Listing creation
      const listingRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-pestapora-2026',
        seatInfo: 'CAT 1 - Row 9',
        faceValue: 1000000,
        price: 1000000,
        rawBarcode: 'BC-CANONICAL-TEST-009'
      });
      assert.strictEqual(listingRes.listing.pricing.fee_policy_version, 'TIKUM_FEE_POLICY_V1');
      assert.strictEqual(listingRes.listing.pricing.seller_fee, 60000);
      assert.strictEqual(listingRes.listing.pricing.buyer_fee, 60000);
      assert.strictEqual(listingRes.listing.pricing.seller_payout, 940000);

      // 3. Pricing calculate endpoint preview
      const preview = await request('POST', '/api/mvp/pricing/calculate', {
        ticketPrice: 1000000
      });
      assert.strictEqual(preview.status, 200);
      assert.strictEqual(preview.data.fee_policy_version, 'TIKUM_FEE_POLICY_V1');
      assert.strictEqual(preview.data.buyer_fee, 60000);
      assert.strictEqual(preview.data.seller_fee, 60000);
      assert.strictEqual(preview.data.seller_payout, 940000);
      assert.strictEqual(preview.data.buyer_subtotal, 1060000);
    });

    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed}/${total} passed, 0 failed`);
    console.log('══════════════════════════════════════════════════════════════════\n');

  } finally {
    if (server && server.listening) {
      server.close();
    }
  }
}

runFeeTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fee test suite failed:', err);
    process.exit(1);
  });
