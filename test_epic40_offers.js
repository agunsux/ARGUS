/**
 * ARGUS EPIC 4.0: STRUCTURED OFFER / NEGOTIATION SYSTEM TEST SUITE
 * 
 * Verifies all 10 core business requirements and 9 Red Team attack vectors:
 * 1. Negative amount & boundary validation (0, negative, 49%, 100%, 150%)
 * 2. Anti-Chat & XSS injection rejection
 * 3. Anti-spam & rate limiting (active duplicate, max 5, 24h limit, 6h cooldown)
 * 4. Authorization & IDOR resistance (401, 403, self-offer rejection)
 * 5. Atomic concurrency / race condition on accept (zero double-order)
 * 6. State machine invariant guards (illegal status jumps, strict enum decline reasons)
 * 7. Dynamic fee calculation & seller settlement payout derivation
 * 8. Privacy enforcement under UU PDP (seller sees masked name only, zero contact data)
 * 9. TTL expiration & background cron execution
 * 10. Full-price buy auto-supersedes pending offers
 * 11. Immutable audit trail integrity (UPDATE/DELETE forbidden)
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const { state, resetDatabase, run } = require('./src/database');
const app = require('./src/server');
const { OfferService, OFFER_STATUS, DECLINE_REASONS } = require('./src/services/offerService');
const { EscrowService, ORDER_STATUS, ESCROW_STATUS } = require('./src/services/escrowService');
const { SettlementService } = require('./src/services/settlementService');

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

async function runTests() {
  console.log('\n=== ARGUS EPIC 4.0: STRUCTURED NEGOTIATION & OFFER SECURITY TEST SUITE ===\n');

  // Start HTTP server on random ephemeral port
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Negative Amount & Boundary Validation
    // -------------------------------------------------------------------------
    await testAsync('Attack 1: Negative Amount & Boundary Validation (0, negative, 49%, 100%, 150%)', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE'); // price = 1500000

      // 1A. Offer amount = 0
      const res0 = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 0 }
      });
      assert.strictEqual(res0.status, 400);
      assert.strictEqual(res0.data.code, 'INVALID_OFFER_AMOUNT');

      // 1B. Offer amount = -500000
      const resNeg = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: -500000 }
      });
      assert.strictEqual(resNeg.status, 400);
      assert.strictEqual(resNeg.data.code, 'INVALID_OFFER_AMOUNT');

      // 1C. Offer amount = 49% of 1.500.000 = 735.000 (below 50% minimum = 750.000)
      const res49 = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 735000 }
      });
      assert.strictEqual(res49.status, 400);
      assert.strictEqual(res49.data.code, 'OFFER_BELOW_MINIMUM');

      // 1D. Offer amount = 100% of 1.500.000 = 1.500.000 (must be strictly less)
      const res100 = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1500000 }
      });
      assert.strictEqual(res100.status, 400);
      assert.strictEqual(res100.data.code, 'OFFER_EXCEEDS_LISTING_PRICE');

      // 1E. Offer amount = 150% of 1.500.000 = 2.250.000
      const res150 = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 2250000 }
      });
      assert.strictEqual(res150.status, 400);
      assert.strictEqual(res150.data.code, 'OFFER_EXCEEDS_LISTING_PRICE');

      // 1F. Valid offer at 80% (Rp 1.200.000) succeeds
      const resValid = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      assert.strictEqual(resValid.status, 201);
      assert.strictEqual(resValid.data.success, true);
      assert.strictEqual(resValid.data.offer.offer_amount, 1200000);
      assert.strictEqual(resValid.data.offer.status, 'PENDING');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Anti-Chat / Free-Text / XSS Injection Resistance
    // -------------------------------------------------------------------------
    await testAsync('Attack 2: Anti-Chat & XSS Injection Strictly Rejected (No Free Text Allowed)', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // 2A. Offer with WhatsApp chat redirect message
      const resChat = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          offer_amount: 1200000,
          message: 'Hubungi saya di WA 081234567890 untuk deal langsung'
        }
      });
      assert.strictEqual(resChat.status, 400);
      assert.strictEqual(resChat.data.code, 'FREE_TEXT_NOT_ALLOWED');

      // 2B. Offer with XSS script payload in note field
      const resXss = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          offer_amount: 1200000,
          note: '<script>alert("xss")</script>'
        }
      });
      assert.strictEqual(resXss.status, 400);
      assert.strictEqual(resXss.data.code, 'FREE_TEXT_NOT_ALLOWED');

      // 2C. Offer with chat param
      const resChatParam = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: {
          offer_amount: 1200000,
          chat: 'Bisa diskon lagi kak?'
        }
      });
      assert.strictEqual(resChatParam.status, 400);
      assert.strictEqual(resChatParam.data.code, 'FREE_TEXT_NOT_ALLOWED');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Anti-Spam & Rate Limiting Enforcement
    // -------------------------------------------------------------------------
    await testAsync('Attack 3: Anti-Spam & Rate Limiting Rules Enforced (4 Rules)', async () => {
      resetDatabase();
      const listing1 = state.listings.find(l => l.status === 'ACTIVE');

      // Rule A: Max 1 pending offer per buyer per listing
      const resOffer1 = await apiRequest(`/api/listings/${listing1.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      assert.strictEqual(resOffer1.status, 201);

      const resOffer1Dup = await apiRequest(`/api/listings/${listing1.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1250000 }
      });
      assert.strictEqual(resOffer1Dup.status, 409);
      assert.strictEqual(resOffer1Dup.data.code, 'ACTIVE_OFFER_EXISTS');

      // Create 4 more listings to test Rule B (Max 5 active pending offers platform-wide)
      for (let i = 2; i <= 6; i++) {
        state.listings.push({
          id: `list-demo-${i}`,
          ticket_id: `ticket-demo-${i}`,
          seller_id: 'seller-1',
          event_id: 'event-pestapora-2026',
          price: 1500000,
          status: 'ACTIVE',
          created_at: new Date().toISOString()
        });
      }

      // Submit offers 2, 3, 4, 5 on different listings (total = 5 active pending offers)
      for (let i = 2; i <= 5; i++) {
        const r = await apiRequest(`/api/listings/list-demo-${i}/offers`, {
          method: 'POST',
          headers: { 'x-user-id': 'buyer-1' },
          body: { offer_amount: 1200000 }
        });
        assert.strictEqual(r.status, 201);
      }

      // 6th pending offer must be blocked by Rule B
      const resOffer6 = await apiRequest(`/api/listings/list-demo-6/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      assert.strictEqual(resOffer6.status, 429);
      assert.strictEqual(resOffer6.data.code, 'MAX_PENDING_OFFERS_EXCEEDED');

      // Rule C: Max 10 new offers per 24 hours
      // Withdraw all 5 pending offers so pending limit is freed, but 24h count is 5
      const buyerOffers = state.offers.filter(o => o.buyer_id === 'buyer-1');
      buyerOffers.forEach(o => o.status = 'WITHDRAWN');

      // Add 6 more offers in past 24h (buyer already submitted 5, so 6 more reaches 11 total)
      for (let i = 7; i <= 12; i++) {
        state.listings.push({
          id: `list-demo-${i}`,
          ticket_id: `ticket-demo-${i}`,
          seller_id: 'seller-1',
          event_id: 'event-pestapora-2026',
          price: 1500000,
          status: 'ACTIVE',
          created_at: new Date().toISOString()
        });
      }
      for (let i = 7; i <= 12; i++) {
        const r = await apiRequest(`/api/listings/list-demo-${i}/offers`, {
          method: 'POST',
          headers: { 'x-user-id': 'buyer-1' },
          body: { offer_amount: 1200000 }
        });
        if (i < 12) {
          assert.strictEqual(r.status, 201);
          // Mark withdrawn so active pending count stays below 5
          const ofr = state.offers.find(o => o.id === r.data.offer.id);
          if (ofr) ofr.status = 'WITHDRAWN';
        } else {
          // 11th offer within 24h must be rejected by Rule C
          assert.strictEqual(r.status, 429);
          assert.strictEqual(r.data.code, 'DAILY_OFFER_LIMIT_EXCEEDED');
        }
      }

      // Rule D: 6-hour cooldown after rejection
      resetDatabase();
      const freshListing = state.listings.find(l => l.status === 'ACTIVE');
      const resToDecline = await apiRequest(`/api/listings/${freshListing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1100000 }
      });
      assert.strictEqual(resToDecline.status, 201);
      const offerToDeclineId = resToDecline.data.offer.id;

      // Seller declines offer
      const resDeclined = await apiRequest(`/api/offers/${offerToDeclineId}/decline`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { decline_reason: 'PRICE_TOO_LOW' }
      });
      assert.strictEqual(resDeclined.status, 200);

      // Buyer immediately attempts to re-offer on same listing -> Blocked by 6h cooldown
      const resCooldown = await apiRequest(`/api/listings/${freshListing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1300000 }
      });
      assert.strictEqual(resCooldown.status, 429);
      assert.strictEqual(resCooldown.data.code, 'COOLDOWN_ACTIVE');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Authorization & IDOR Resistance
    // -------------------------------------------------------------------------
    await testAsync('Attack 4: Authorization & IDOR Resistance (401, 403, Self-Offer Block)', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // 4A. Seller cannot offer on own listing
      const resSelf = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { offer_amount: 1200000 }
      });
      assert.strictEqual(resSelf.status, 400);
      assert.strictEqual(resSelf.data.code, 'SELF_OFFER_NOT_ALLOWED');

      // Create valid offer by buyer-1
      const resOffer = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      assert.strictEqual(resOffer.status, 201);
      const offerId = resOffer.data.offer.id;

      // 4B. Unauthenticated request to accept
      const resUnauth = await apiRequest(`/api/offers/${offerId}/accept`, {
        method: 'POST'
      });
      assert.strictEqual(resUnauth.status, 401);

      // 4C. Buyer B tries to accept Buyer A's offer
      const resBuyerAccept = await apiRequest(`/api/offers/${offerId}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-2' }
      });
      assert.strictEqual(resBuyerAccept.status, 403);
      assert.strictEqual(resBuyerAccept.data.code, 'UNAUTHORIZED_ACTION');

      // 4D. Unrelated Seller B tries to accept offer on Seller A's listing
      state.users.push({ id: 'seller-2', name: 'Other Seller', email: 'other@example.com', role: 'seller' });
      const resWrongSeller = await apiRequest(`/api/offers/${offerId}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-2' }
      });
      assert.strictEqual(resWrongSeller.status, 403);
      assert.strictEqual(resWrongSeller.data.code, 'UNAUTHORIZED_ACTION');

      // 4E. Buyer B tries to withdraw Buyer A's offer
      const resWrongWithdraw = await apiRequest(`/api/offers/${offerId}/withdraw`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-2' }
      });
      assert.strictEqual(resWrongWithdraw.status, 403);
      assert.strictEqual(resWrongWithdraw.data.code, 'UNAUTHORIZED_ACTION');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Atomic Concurrency & Race Condition Prevention on Accept
    // -------------------------------------------------------------------------
    await testAsync('Attack 5: Atomic Concurrency Lock on Accept (Zero Race Condition / Double-Sell)', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // Submit Offer A by buyer-1 (Rp 1.2M)
      const resA = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      assert.strictEqual(resA.status, 201);
      const offerAId = resA.data.offer.id;

      // Submit Offer B by buyer-2 (Rp 1.1M)
      const resB = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-2' },
        body: { offer_amount: 1100000 }
      });
      assert.strictEqual(resB.status, 201);
      const offerBId = resB.data.offer.id;

      // Fire concurrent Accept requests for both Offer A and Offer B
      const [acceptA, acceptB] = await Promise.all([
        apiRequest(`/api/offers/${offerAId}/accept`, {
          method: 'POST',
          headers: { 'x-user-id': 'seller-1' }
        }),
        apiRequest(`/api/offers/${offerBId}/accept`, {
          method: 'POST',
          headers: { 'x-user-id': 'seller-1' }
        })
      ]);

      // Exactly one must succeed (200) and the other must fail (409 conflict)
      const statuses = [acceptA.status, acceptB.status].sort();
      assert.deepStrictEqual(statuses, [200, 409], 'Exactly one accept must return 200, concurrent competing accept must return 409');

      const winningAccept = acceptA.status === 200 ? acceptA : acceptB;
      const winningOfferId = acceptA.status === 200 ? offerAId : offerBId;
      const losingOfferId = acceptA.status === 200 ? offerBId : offerAId;

      // Verify winning offer is ACCEPTED
      const winningOffer = state.offers.find(o => o.id === winningOfferId);
      assert.strictEqual(winningOffer.status, 'ACCEPTED');

      // Verify losing offer is SUPERSEDED
      const losingOffer = state.offers.find(o => o.id === losingOfferId);
      assert.strictEqual(losingOffer.status, 'SUPERSEDED');

      // Verify listing is RESERVED
      const updatedListing = state.listings.find(l => l.id === listing.id);
      assert.strictEqual(updatedListing.status, 'RESERVED');

      // Verify exactly 1 order was created for this listing
      const orders = state.orders.filter(o => o.listing_id === listing.id);
      assert.strictEqual(orders.length, 1, 'Strictly zero double-orders allowed');
    });

    // -------------------------------------------------------------------------
    // TEST 6: State Machine Invariant Guards
    // -------------------------------------------------------------------------
    await testAsync('Attack 6: State Machine Invariants & Strict Enum Decline Reasons', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // Create Offer 1
      const resO1 = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      const o1Id = resO1.data.offer.id;

      // Decline with INVALID / free-text reason -> 400 Bad Request
      const resInvalidDecline = await apiRequest(`/api/offers/${o1Id}/decline`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { decline_reason: 'Saya lagi butuh uang buat liburan' } // Free-text reason
      });
      assert.strictEqual(resInvalidDecline.status, 400);
      assert.strictEqual(resInvalidDecline.data.code, 'INVALID_DECLINE_REASON');

      // Decline with valid enum reason -> 200 OK
      const resValidDecline = await apiRequest(`/api/offers/${o1Id}/decline`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { decline_reason: 'PRICE_TOO_LOW' }
      });
      assert.strictEqual(resValidDecline.status, 200);
      assert.strictEqual(resValidDecline.data.offer.status, 'DECLINED');

      // Attempt to Accept an already DECLINED offer -> 400 Bad Request
      const resAcceptDeclined = await apiRequest(`/api/offers/${o1Id}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' }
      });
      assert.strictEqual(resAcceptDeclined.status, 400);
      assert.strictEqual(resAcceptDeclined.data.code, 'OFFER_NOT_PENDING');

      // Create Offer 2 by buyer-2
      const resO2 = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-2' },
        body: { offer_amount: 1300000 }
      });
      const o2Id = resO2.data.offer.id;

      // Seller accepts Offer 2 -> 200 OK
      const resAcceptO2 = await apiRequest(`/api/offers/${o2Id}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' }
      });
      assert.strictEqual(resAcceptO2.status, 200);
      assert.strictEqual(resAcceptO2.data.offer.status, 'ACCEPTED');

      // Attempt to Decline an already ACCEPTED offer -> 400 Bad Request
      const resDeclineAccepted = await apiRequest(`/api/offers/${o2Id}/decline`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { decline_reason: 'OTHER' }
      });
      assert.strictEqual(resDeclineAccepted.status, 400);
      assert.strictEqual(resDeclineAccepted.data.code, 'OFFER_NOT_PENDING');

      // Attempt to Withdraw an already ACCEPTED offer -> 400 Bad Request
      const resWithdrawAccepted = await apiRequest(`/api/offers/${o2Id}/withdraw`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-2' }
      });
      assert.strictEqual(resWithdrawAccepted.status, 400);
      assert.strictEqual(resWithdrawAccepted.data.code, 'OFFER_NOT_PENDING');
    });

    // -------------------------------------------------------------------------
    // TEST 7: Dynamic Fee Calculation & Seller Settlement Payout Derivation
    // -------------------------------------------------------------------------
    await testAsync('Test 7: Dynamic Platform Fee & Seller Payout Derived from Negotiated Offer Amount', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE'); // original price = 1500000
      const negotiatedAmount = 1200000;

      const resOffer = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: negotiatedAmount }
      });
      assert.strictEqual(resOffer.status, 201);
      const offerId = resOffer.data.offer.id;

      const resAccept = await apiRequest(`/api/offers/${offerId}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' }
      });
      assert.strictEqual(resAccept.status, 200);

      const { order, escrow, pricing } = resAccept.data;

      // Critical Invariant: Fee & amounts must be calculated from negotiatedAmount (1.200.000), NEVER original listing price (1.500.000)
      assert.strictEqual(order.ticket_price, 1200000, 'Order ticket price must be negotiated amount');
      assert.strictEqual(order.platform_fee, 72000, 'Platform fee must be 6% of negotiated amount (Rp 72.000), NOT 6% of Rp 1.500.000 (Rp 90.000)');
      assert.strictEqual(order.buyer_subtotal, 1272000, 'Buyer subtotal must be Rp 1.272.000');
      assert.strictEqual(order.total_amount, 1279920, 'Total amount must be Rp 1.279.920');
      assert.strictEqual(escrow.amount, 1128000, 'Escrow held for seller disbursement must equal seller net payout (1.200.000 - 72.000)');
      assert.strictEqual(escrow.total_paid, 1279920, 'Escrow total paid must equal total amount with platform fee & tax');
      assert.strictEqual(pricing.platformFee, 72000);

      // Now execute simulated entry and settlement release to verify seller disbursement
      order.status = ORDER_STATUS.ENTRY_CONFIRMED;
      escrow.status = ESCROW_STATUS.RELEASED;

      const settlementResult = await SettlementService.executeSettlement({
        orderId: order.id,
        sellerId: 'seller-1',
        idempotencyKey: `stl-negotiated-${order.id}`
      });

      assert.strictEqual(settlementResult.settlement.amount, 1128000, 'Disbursed seller amount must strictly equal negotiated offer net payout (Rp 1.128.000)');
      assert.strictEqual(settlementResult.settlement.status, 'EXECUTED');
    });

    // -------------------------------------------------------------------------
    // TEST 8: Privacy / UU PDP Compliance (Zero Contact Data Leak)
    // -------------------------------------------------------------------------
    await testAsync('Attack 8: Privacy Enforcement Under UU PDP (Masked Buyer Name, Zero PII Leak)', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // Buyer Dewi Lestari (email: dewi.buyer@example.com, phone: 085556667778) creates offer
      await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });

      // Seller views inbox
      const resSellerInbox = await apiRequest(`/api/offers/mine?role=seller`, {
        method: 'GET',
        headers: { 'x-user-id': 'seller-1' }
      });

      assert.strictEqual(resSellerInbox.status, 200);
      assert.strictEqual(resSellerInbox.data.offers.length, 1);
      const offerView = resSellerInbox.data.offers[0];

      // Verify masked name is returned
      assert.ok(offerView.buyer, 'Buyer object must be provided');
      assert.strictEqual(offerView.buyer.masked_name, 'D*** L******');

      // Verify NO phone, email, NIK, or contact data is leaked
      const rawJson = JSON.stringify(offerView);
      assert.strictEqual(rawJson.includes('dewi.buyer@example.com'), false, 'Buyer email must NOT be leaked');
      assert.strictEqual(rawJson.includes('085556667778'), false, 'Buyer phone must NOT be leaked');
      assert.strictEqual(offerView.buyer.email, undefined);
      assert.strictEqual(offerView.buyer.phone, undefined);
      assert.strictEqual(offerView.buyer.nik, undefined);
    });

    // -------------------------------------------------------------------------
    // TEST 9: TTL Expiration & Cron Job
    // -------------------------------------------------------------------------
    await testAsync('Test 9: TTL Expiration & Background Cron Auto-Cancellation', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // Create offer
      const resOffer = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      const offer = state.offers.find(o => o.id === resOffer.data.offer.id);
      assert.strictEqual(offer.status, 'PENDING');

      // Force TTL expiration into the past
      offer.expires_at = new Date(Date.now() - 1000).toISOString();

      // Trigger cron endpoint
      const resCron = await apiRequest('/api/offers/cron/expire', {
        method: 'POST'
      });
      assert.strictEqual(resCron.status, 200);
      assert.strictEqual(resCron.data.expired_count, 1);
      assert.strictEqual(offer.status, 'EXPIRED');

      // Seller attempts to accept expired offer -> 400 Bad Request
      const resAcceptExpired = await apiRequest(`/api/offers/${offer.id}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' }
      });
      assert.strictEqual(resAcceptExpired.status, 400);
      assert.strictEqual(resAcceptExpired.data.code, 'OFFER_NOT_PENDING');
    });

    // -------------------------------------------------------------------------
    // TEST 10: Full-Price Buy Auto-Supersedes Competing Pending Offers
    // -------------------------------------------------------------------------
    await testAsync('Test 10: Full-Price Buy Automatically Supersedes Pending Offers', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // Buyer 1 submits pending offer
      const resOffer = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      const pendingOfferId = resOffer.data.offer.id;
      assert.strictEqual(state.offers.find(o => o.id === pendingOfferId).status, 'PENDING');

      // Buyer 2 buys ticket directly at full price via standard order
      const resBuy = await EscrowService.createOrder({
        buyerId: 'buyer-2',
        listingId: listing.id
      });
      assert.ok(resBuy.order);
      assert.strictEqual(listing.status, 'RESERVED');

      // Verify pending offer was automatically superseded
      const supersededOffer = state.offers.find(o => o.id === pendingOfferId);
      assert.strictEqual(supersededOffer.status, 'SUPERSEDED');
    });

    // -------------------------------------------------------------------------
    // TEST 11: Immutable Audit Trail Integrity
    // -------------------------------------------------------------------------
    await testAsync('Test 11: Append-Only Immutable Audit Trail for Offers (UPDATE/DELETE Forbidden)', async () => {
      resetDatabase();
      const listing = state.listings.find(l => l.status === 'ACTIVE');

      // Submit offer -> generates audit log
      const resOffer = await apiRequest(`/api/listings/${listing.id}/offers`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { offer_amount: 1200000 }
      });
      const offerId = resOffer.data.offer.id;

      // Verify audit log exists
      const logs = state.offer_audit_logs.filter(l => l.offer_id === offerId);
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].to_status, 'PENDING');
      assert.strictEqual(logs[0].actor_role, 'BUYER');

      // Seller declines offer -> generates second audit log
      await apiRequest(`/api/offers/${offerId}/decline`, {
        method: 'POST',
        headers: { 'x-user-id': 'seller-1' },
        body: { decline_reason: 'PRICE_TOO_LOW' }
      });

      const logsAfterDecline = state.offer_audit_logs.filter(l => l.offer_id === offerId);
      assert.strictEqual(logsAfterDecline.length, 2);
      assert.strictEqual(logsAfterDecline[1].from_status, 'PENDING');
      assert.strictEqual(logsAfterDecline[1].to_status, 'DECLINED');

      // Attempt to tamper with offer_audit_logs via UPDATE or DELETE query -> Must throw error!
      let updateBlocked = false;
      try {
        await run('UPDATE offer_audit_logs SET to_status = "TAMPERED" WHERE offer_id = ?', [offerId]);
      } catch (err) {
        updateBlocked = true;
        assert.ok(err.message.includes('offer_audit_logs'));
      }
      assert.strictEqual(updateBlocked, true, 'UPDATE on offer_audit_logs must be strictly forbidden');

      let deleteBlocked = false;
      try {
        await run('DELETE FROM offer_audit_logs WHERE offer_id = ?', [offerId]);
      } catch (err) {
        deleteBlocked = true;
        assert.ok(err.message.includes('offer_audit_logs'));
      }
      assert.strictEqual(deleteBlocked, true, 'DELETE on offer_audit_logs must be strictly forbidden');
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log(`\n=======================`);
  console.log(`Epic 4.0 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
