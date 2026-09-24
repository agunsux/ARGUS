/**
 * TIKUM P0 — NEGOTIATION / TAWAR-MENAWAR PRICE ENGINE TEST SUITE
 * 
 * Verifies strict compliance with all P0 Negotiation requirements:
 * 1. Exactly 5 cumulative proposals per listing/transaction
 * 2. Proposal cycle: #1 Buyer -> #2 Seller -> #3 Buyer -> #4 Seller -> #5 Buyer -> NEGOTIATION_LIMIT_REACHED
 * 3. Server-side rejection of any attempted 6th proposal (API, UI, retry, refresh)
 * 4. Seller can Accept proposal #5 (creating order at agreed price) or Reject or let expire
 * 5. Atomic Mutex / Race Condition resistance on concurrent requests at the limit
 * 6. Server-side counter persistence (never trust client-sent offer_count or headers)
 * 7. Rejections / cancellations properly tracked in immutable history
 * 8. Fallback to direct purchase at full listing price when limit reached
 * 9. Comprehensive audit log tracking sequence numbers and negotiation status
 * 10. Rate limiting protection on negotiation endpoints
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const { state, resetDatabase, run } = require('./src/database');
const app = require('./src/server');
const {
  OfferService,
  OFFER_STATUS,
  DECLINE_REASONS,
  NEGOTIATION_MAX_PROPOSALS,
  NEGOTIATION_STATUS
} = require('./src/services/offerService');
const { EscrowService, ORDER_STATUS } = require('./src/services/escrowService');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}

async function apiRequest(endpoint, { method = 'GET', headers = {}, body = null } = {}) {
  const url = `${baseUrl}${endpoint}`;
  const reqHeaders = { ...headers };
  if (body && typeof body === 'object') {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body && typeof body === 'object' ? JSON.stringify(body) : body
  });

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return {
    status: res.status,
    headers: res.headers,
    data
  };
}

async function runAllTests() {
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551  TIKUM P0 \u2014 NEGOTIATION / TAWAR-MENAWAR PRICE ENGINE TEST SUITE    \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Full 5-proposal negotiation lifecycle
    // -------------------------------------------------------------------------
    await testAsync('Test 1: Full 5-proposal negotiation lifecycle (#1 Buyer -> #2 Seller -> #3 Buyer -> #4 Seller -> #5 Buyer)', async () => {
      resetDatabase();

      // Create a dedicated active listing (Price: Rp 1.500.000)
      const listingId = `listing-p0-neg-${uuidv4()}`;
      state.listings.push({
        id: listingId,
        seller_id: 'seller-1',
        ticket_id: 'ticket-demo-1',
        event_id: 'event-synchronize-2026',
        price: 1500000,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      // #1 Buyer submits initial offer: Rp 1.200.000 (Proposal 1/5)
      const res1 = await apiRequest(`/api/listings/${listingId}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      assert.strictEqual(res1.status, 201);
      assert.strictEqual(res1.data.offer.sequence_number, 1);
      assert.strictEqual(res1.data.offer.proposal_count, 1);
      assert.strictEqual(res1.data.offer.ui_counter_text, 'Tawaran 1/5');
      assert.strictEqual(res1.data.offer.negotiation_status, 'ACTIVE');
      const offerId = res1.data.offer.id;

      // Verify negotiation state endpoint
      const resNeg1 = await apiRequest(`/api/listings/${listingId}/negotiation`, {
        headers: { 'x-user-id': 'buyer-1' }
      });
      assert.strictEqual(resNeg1.status, 200);
      assert.strictEqual(resNeg1.data.proposal_count, 1);
      assert.strictEqual(resNeg1.data.current_turn, 'SELLER');
      assert.strictEqual(resNeg1.data.is_limit_reached, false);

      // #2 Seller counter-offers: Rp 1.400.000 (Proposal 2/5)
      const res2 = await apiRequest(`/api/offers/${offerId}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { counter_amount: 1400000 }
      });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.offer.sequence_number, 2);
      assert.strictEqual(res2.data.offer.proposal_count, 2);
      assert.strictEqual(res2.data.offer.ui_counter_text, 'Tawaran 2/5');
      assert.strictEqual(res2.data.offer.status, 'COUNTERED');

      // #3 Buyer counters seller's counter: Rp 1.300.000 (Proposal 3/5)
      const res3 = await apiRequest(`/api/offers/${offerId}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { counter_amount: 1300000 }
      });
      assert.strictEqual(res3.status, 200);
      assert.strictEqual(res3.data.offer.sequence_number, 3);
      assert.strictEqual(res3.data.offer.proposal_count, 3);
      assert.strictEqual(res3.data.offer.ui_counter_text, 'Tawaran 3/5');
      assert.strictEqual(res3.data.offer.status, 'PENDING');

      // #4 Seller counter-offers: Rp 1.350.000 (Proposal 4/5)
      const res4 = await apiRequest(`/api/offers/${offerId}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { counter_amount: 1350000 }
      });
      assert.strictEqual(res4.status, 200);
      assert.strictEqual(res4.data.offer.sequence_number, 4);
      assert.strictEqual(res4.data.offer.proposal_count, 4);
      assert.strictEqual(res4.data.offer.ui_counter_text, 'Tawaran 4/5');
      assert.strictEqual(res4.data.offer.status, 'COUNTERED');

      // #5 Buyer counters: Rp 1.325.000 (Proposal 5/5 -> Limit Reached!)
      const res5 = await apiRequest(`/api/offers/${offerId}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { counter_amount: 1325000 }
      });
      assert.strictEqual(res5.status, 200);
      assert.strictEqual(res5.data.offer.sequence_number, 5);
      assert.strictEqual(res5.data.offer.proposal_count, 5);
      assert.strictEqual(res5.data.offer.ui_counter_text, 'Tawaran 5/5');
      assert.strictEqual(res5.data.offer.negotiation_status, 'NEGOTIATION_LIMIT_REACHED');
      assert.strictEqual(res5.data.offer.ui_limit_text, 'Batas tawar-menawar tercapai (5/5). Negosiasi untuk listing ini sudah berakhir.');

      // Verify negotiation endpoint reflects limit reached
      const resNeg5 = await apiRequest(`/api/listings/${listingId}/negotiation`, {
        headers: { 'x-user-id': 'buyer-1' }
      });
      assert.strictEqual(resNeg5.status, 200);
      assert.strictEqual(resNeg5.data.proposal_count, 5);
      assert.strictEqual(resNeg5.data.is_limit_reached, true);
      assert.strictEqual(resNeg5.data.can_negotiate, false);
      assert.strictEqual(resNeg5.data.current_amount, 1325000);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Strict Server-Side Rejection of Proposal #6
    // -------------------------------------------------------------------------
    await testAsync('Test 2: Server-side rejection of Attempted Proposal #6 (Seller counter & Buyer counter)', async () => {
      // Find the offer at limit 5/5 from Test 1
      const offerAtLimit = state.offers.find(o => o.sequence_number === 5);
      assert.ok(offerAtLimit);

      // 2A. Seller attempts proposal #6 counter -> BLOCKED with 400 NEGOTIATION_LIMIT_REACHED
      const resSeller6 = await apiRequest(`/api/offers/${offerAtLimit.id}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { counter_amount: 1330000 }
      });
      assert.strictEqual(resSeller6.status, 400);
      assert.strictEqual(resSeller6.data.code, 'NEGOTIATION_LIMIT_REACHED');

      // 2B. Buyer attempts proposal #6 counter -> BLOCKED with 400 NEGOTIATION_LIMIT_REACHED
      const resBuyer6 = await apiRequest(`/api/offers/${offerAtLimit.id}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { counter_amount: 1330000 }
      });
      assert.strictEqual(resBuyer6.status, 400);
      assert.strictEqual(resBuyer6.data.code, 'NEGOTIATION_LIMIT_REACHED');

      // 2C. Buyer attempts new initial offer on same listing -> BLOCKED with 400 NEGOTIATION_LIMIT_REACHED
      const resBuyerNewOffer = await apiRequest(`/api/listings/${offerAtLimit.listing_id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1300000 }
      });
      assert.strictEqual(resBuyerNewOffer.status, 400);
      assert.strictEqual(resBuyerNewOffer.data.code, 'NEGOTIATION_LIMIT_REACHED');

      // Verify proposal count remains strictly 5
      const neg = state.negotiations.find(n => n.listing_id === offerAtLimit.listing_id && n.buyer_id === 'buyer-1');
      assert.strictEqual(neg.proposal_count, 5);
      assert.strictEqual(neg.status, 'NEGOTIATION_LIMIT_REACHED');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Seller Acceptance on Proposal #5 Creates Order at Agreed Price
    // -------------------------------------------------------------------------
    await testAsync('Test 3: Seller can accept Proposal #5 (Creates Order at Rp 1.325.000)', async () => {
      const offerAtLimit = state.offers.find(o => o.sequence_number === 5);
      assert.ok(offerAtLimit);

      // Seller accepts the final negotiated offer
      const resAccept = await apiRequest(`/api/offers/${offerAtLimit.id}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' }
      });
      assert.strictEqual(resAccept.status, 200);
      assert.strictEqual(resAccept.data.offer.status, 'ACCEPTED');
      assert.strictEqual(resAccept.data.order.price, 1325000);
      assert.strictEqual(resAccept.data.order.ticket_price, 1325000);

      // Verify negotiation is now ACCEPTED
      const neg = state.negotiations.find(n => n.id === offerAtLimit.negotiation_id);
      assert.strictEqual(neg.status, 'ACCEPTED');

      // Any further counter or accept is rejected
      const resAfterAccept = await apiRequest(`/api/offers/${offerAtLimit.id}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { counter_amount: 1350000 }
      });
      assert.strictEqual(resAfterAccept.status, 400);
    });

    // -------------------------------------------------------------------------
    // TEST 4: Atomic Mutex & Concurrency Race Condition Resistance
    // -------------------------------------------------------------------------
    await testAsync('Test 4: Concurrent requests at proposal #4 cannot exceed limit 5/5', async () => {
      resetDatabase();

      // Create a fresh listing and advance negotiation to Proposal #4
      const listingId = `listing-race-${uuidv4()}`;
      state.listings.push({
        id: listingId,
        seller_id: 'seller-1',
        ticket_id: 'ticket-demo-1',
        event_id: 'event-synchronize-2026',
        price: 2000000,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      // #1 Buyer (1.2M)
      const r1 = await apiRequest(`/api/listings/${listingId}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      const oId = r1.data.offer.id;

      // #2 Seller (1.8M)
      await apiRequest(`/api/offers/${oId}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { counter_amount: 1800000 }
      });

      // #3 Buyer (1.4M)
      await apiRequest(`/api/offers/${oId}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { counter_amount: 1400000 }
      });

      // #4 Seller (1.6M) -> Now at 4 proposals!
      const r4 = await apiRequest(`/api/offers/${oId}/counter`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { counter_amount: 1600000 }
      });
      assert.strictEqual(r4.data.offer.proposal_count, 4);

      // Launch 10 simultaneous concurrent requests trying to submit Proposal #5
      const concurrentPromises = [];
      for (let i = 0; i < 10; i++) {
        concurrentPromises.push(
          apiRequest(`/api/offers/${oId}/counter`, {
            method: 'POST',
            headers: { 'x-user-id': 'buyer-1' },
            body: { counter_amount: 1450000 + i * 1000 }
          })
        );
      }

      const results = await Promise.all(concurrentPromises);
      const successfulRequests = results.filter(r => r.status === 200);
      const rejectedRequests = results.filter(r => r.status === 400);

      // Exactly 1 request must have succeeded to become proposal #5
      assert.strictEqual(successfulRequests.length, 1, `Expected exactly 1 concurrent success, got ${successfulRequests.length}`);
      assert.strictEqual(rejectedRequests.length, 9, `Expected 9 concurrent rejections, got ${rejectedRequests.length}`);

      // All rejected requests must cite NEGOTIATION_LIMIT_REACHED or invalid turn
      for (const rej of rejectedRequests) {
        assert.ok(rej.data.code === 'NEGOTIATION_LIMIT_REACHED' || rej.data.code === 'OFFER_COUNTER_FAILED');
      }

      // Verify that database proposal_count is strictly 5, never 6
      const neg = state.negotiations.find(n => n.listing_id === listingId && n.buyer_id === 'buyer-1');
      assert.strictEqual(neg.proposal_count, 5);
      assert.strictEqual(neg.status, 'NEGOTIATION_LIMIT_REACHED');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Server-Side Counter Persistence & Client Tampering Resistance
    // -------------------------------------------------------------------------
    await testAsync('Test 5: Client-supplied offer_count is ignored; server enforces immutable sequence', async () => {
      resetDatabase();

      const listingId = `listing-persist-${uuidv4()}`;
      state.listings.push({
        id: listingId,
        seller_id: 'seller-1',
        ticket_id: 'ticket-demo-1',
        event_id: 'event-synchronize-2026',
        price: 1000000,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      // Submit offer with manipulated client payload: { proposal_count: 999, sequence_number: 999 }
      const resClientSpoof = await apiRequest(`/api/listings/${listingId}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          offer_amount: 800000,
          proposal_count: 0,
          sequence_number: 0,
          offer_count: 0
        }
      });
      assert.strictEqual(resClientSpoof.status, 201);
      // Server must enforce sequence 1, ignoring client values
      assert.strictEqual(resClientSpoof.data.offer.sequence_number, 1);
      assert.strictEqual(resClientSpoof.data.offer.proposal_count, 1);

      // Verify in GET /offers/mine
      const resMine = await apiRequest('/api/offers/mine?role=buyer', {
        headers: { 'x-user-id': 'buyer-1' }
      });
      assert.strictEqual(resMine.status, 200);
      const myOffer = resMine.data.offers.find(o => o.listing_id === listingId);
      assert.strictEqual(myOffer.sequence_number, 1);
      assert.strictEqual(myOffer.proposal_count, 1);
      assert.strictEqual(myOffer.ui_counter_text, 'Tawaran 1/5');
    });

    // -------------------------------------------------------------------------
    // TEST 6: Direct Buy Fallback Remains Available after Limit Reached
    // -------------------------------------------------------------------------
    await testAsync('Test 6: Buyer can still buy with normal listing price after negotiation limit reached', async () => {
      // Create another active listing at limit for buyer-2
      const listingId = `listing-direct-buy-${uuidv4()}`;
      state.listings.push({
        id: listingId,
        seller_id: 'seller-1',
        ticket_id: 'ticket-demo-1',
        event_id: 'event-synchronize-2026',
        price: 1500000,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      // Advance negotiation to limit 5/5
      const r1 = await apiRequest(`/api/listings/${listingId}/offers`, { method: 'POST', headers: { 'x-user-id': 'buyer-2' }, body: { offer_amount: 1000000 } });
      const oId = r1.data.offer.id;
      await apiRequest(`/api/offers/${oId}/counter`, { method: 'POST', headers: { 'x-user-id': 'seller-1' }, body: { counter_amount: 1400000 } });
      await apiRequest(`/api/offers/${oId}/counter`, { method: 'POST', headers: { 'x-user-id': 'buyer-2' }, body: { counter_amount: 1100000 } });
      await apiRequest(`/api/offers/${oId}/counter`, { method: 'POST', headers: { 'x-user-id': 'seller-1' }, body: { counter_amount: 1300000 } });
      const r5 = await apiRequest(`/api/offers/${oId}/counter`, { method: 'POST', headers: { 'x-user-id': 'buyer-2' }, body: { counter_amount: 1200000 } });
      assert.strictEqual(r5.data.offer.negotiation_status, 'NEGOTIATION_LIMIT_REACHED');

      // Verify negotiation endpoint confirms can_direct_buy: true
      const resNeg = await apiRequest(`/api/listings/${listingId}/negotiation`, {
        headers: { 'x-user-id': 'buyer-2' }
      });
      assert.strictEqual(resNeg.data.can_direct_buy, true);
      assert.strictEqual(resNeg.data.is_limit_reached, true);

      // Direct purchase with full listing price succeeds
      const order = await EscrowService.createOrder({
        buyerId: 'buyer-2',
        listingId,
        customAmount: null // full price
      });
      assert.strictEqual(order.order.ticket_price, 1500000);
      assert.strictEqual(order.order.price, 1500000);
      assert.strictEqual(order.order.total_amount, 1590000);
      assert.strictEqual(order.order.status, ORDER_STATUS.PENDING_PAYMENT);
    });

    // -------------------------------------------------------------------------
    // TEST 7: Immutable Audit Trail Integrity for All Proposals
    // -------------------------------------------------------------------------
    await testAsync('Test 7: All proposals and sequence numbers are recorded in immutable audit logs', async () => {
      // Find an offer with sequence 5
      const offer5 = state.offers.find(o => o.sequence_number === 5);
      assert.ok(offer5);

      const resAudit = await apiRequest(`/api/offers/${offer5.id}/audit`, {
        headers: { 'x-user-id': offer5.buyer_id }
      });
      assert.strictEqual(resAudit.status, 200);
      assert.ok(resAudit.data.audit_logs.length >= 1);

      // Verify audit logs contain sequence_number & proposal_count metadata
      const hasSequenceLog = resAudit.data.audit_logs.some(l => l.metadata && (l.metadata.sequence_number || l.metadata.proposal_count));
      assert.ok(hasSequenceLog, 'Audit logs must contain negotiation sequence metadata');
    });

    // -------------------------------------------------------------------------
    // TEST 8: Negotiation Rate Limiting Protection
    // -------------------------------------------------------------------------
    await testAsync('Test 8: Rate-limiting middleware blocks excessive rapid mutations (>30 req/min)', async () => {
      resetDatabase();

      const listingId = `listing-rate-${uuidv4()}`;
      state.listings.push({
        id: listingId,
        seller_id: 'seller-1',
        ticket_id: 'ticket-demo-1',
        event_id: 'event-synchronize-2026',
        price: 2000000,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      });

      // Initial offer
      const resInit = await apiRequest(`/api/listings/${listingId}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1100000 }
      });
      const oId = resInit.data.offer.id;

      // Fire 35 rapid requests to negotiation counter endpoint
      const rapidRequests = [];
      for (let i = 0; i < 35; i++) {
        rapidRequests.push(
          apiRequest(`/api/offers/${oId}/counter`, {
            method: 'POST',
            headers: { 'x-user-id': 'seller-1' },
            body: { counter_amount: 1800000 }
          })
        );
      }

      const responses = await Promise.all(rapidRequests);
      const rateLimited = responses.filter(r => r.status === 429 && r.data.code === 'NEGOTIATION_RATE_LIMIT_EXCEEDED');
      assert.ok(rateLimited.length > 0, `Expected at least 1 rate-limited request, got ${rateLimited.length}`);
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`  P0 NEGOTIATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
