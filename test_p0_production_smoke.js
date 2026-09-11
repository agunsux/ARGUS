/**
 * P0 PRODUCTION SMOKE TEST — END-TO-END VERIFICATION RUNNER
 * Target: https://argus-trust-infrastructure.vercel.app
 * 
 * Strict verification only: Real production boundary evidence.
 * No mocks. No fake success.
 */

const PROD_BASE = process.env.PROD_URL || process.env.BASE_URL || 'https://tikum.app';
const TEST_TIMESTAMP = new Date().toISOString();
const RUN_ID = `P0-SMOKE-${Date.now()}`;

const evidenceLog = {
  runId: RUN_ID,
  timestamp: TEST_TIMESTAMP,
  targetUrl: PROD_BASE,
  phases: {}
};

async function apiRequest(method, path, body = null, token = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const url = PROD_BASE + path;
  const startedAt = Date.now();
  let res, text;
  try {
    res = await fetch(url, options);
    text = await res.text();
  } catch (err) {
    return {
      success: false,
      error: err.message,
      durationMs: Date.now() - startedAt
    };
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // text response
  }

  return {
    success: res.ok,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data: json !== null ? json : text,
    durationMs: Date.now() - startedAt
  };
}

async function runAudit() {
  console.log('================================================================');
  console.log(`  P0 PRODUCTION SMOKE TEST — LIVE AUDIT`);
  console.log(`  Target: ${PROD_BASE}`);
  console.log(`  Run ID: ${RUN_ID}`);
  console.log(`  Timestamp: ${TEST_TIMESTAMP}`);
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 0. HEALTH & TARGET AUDIT
  // -------------------------------------------------------------
  console.log('>>> [STAGE 0] Production Identity & Health Check');
  const healthRes = await apiRequest('GET', '/health');
  console.log(`Health status: ${healthRes.status}`, healthRes.data);
  evidenceLog.phases['stage_0_health'] = healthRes;

  // -------------------------------------------------------------
  // PHASE A: SELLER AUTHENTICATION
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE A] Seller Authentication');
  const sellerLogin = await apiRequest('POST', '/api/mvp/auth/login', { usernameOrId: 'seller-1' });
  console.log(`Seller login status: ${sellerLogin.status}`, sellerLogin.data);
  const sellerToken = sellerLogin.data?.session_token;

  let sellerMe = null;
  if (sellerToken) {
    sellerMe = await apiRequest('GET', '/api/mvp/auth/me', null, sellerToken);
    console.log(`Seller auth/me status: ${sellerMe.status}`, sellerMe.data);
  }
  evidenceLog.phases['phase_a_seller_auth'] = { login: sellerLogin, me: sellerMe };

  // -------------------------------------------------------------
  // PHASE B: CREATE LISTING
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE B] Create Listing (Buy-Now Track)');
  const barcode1 = `P0-SMOKE-BC1-${Date.now()}`;
  const createListing1 = await apiRequest('POST', '/api/mvp/seller/listing', {
    sellerId: 'seller-1',
    eventId: 'event-pestapora-2026',
    seatInfo: `P0-SMOKE-SEAT-${RUN_ID}`,
    faceValue: 750000,
    price: 850000,
    rawBarcode: barcode1
  }, sellerToken);
  console.log(`Create Listing 1 status: ${createListing1.status}`, createListing1.data);
  const listingId1 = createListing1.data?.listing?.id;
  evidenceLog.phases['phase_b_create_listing_1'] = createListing1;

  // Verify listing directly
  let getListing1 = null;
  if (listingId1) {
    getListing1 = await apiRequest('GET', `/api/mvp/listings/${listingId1}`);
    console.log(`Get Listing 1 status: ${getListing1.status}`, getListing1.data);
  }

  // Admin verifies listing 1 to make it ACTIVE
  console.log('\n>>> Admin verifying Listing 1');
  const adminLogin = await apiRequest('POST', '/api/mvp/auth/login', { usernameOrId: 'admin-1' });
  const adminToken = adminLogin.data?.session_token;
  let verifyListing1 = null;
  if (listingId1 && adminToken) {
    verifyListing1 = await apiRequest('POST', `/api/mvp/admin/listings/${listingId1}/verify`, {
      approved: true,
      reason: 'P0 Production Smoke Test Approval'
    }, adminToken);
    console.log(`Admin verify listing 1 status: ${verifyListing1.status}`, verifyListing1.data);
  }
  evidenceLog.phases['admin_verify_listing_1'] = verifyListing1;

  // -------------------------------------------------------------
  // PHASE C: BUYER AUTHENTICATION & DISCOVERY
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE C] Buyer Authentication & Listing Discovery');
  const buyerLogin = await apiRequest('POST', '/api/mvp/auth/login', { usernameOrId: 'buyer-1' });
  console.log(`Buyer login status: ${buyerLogin.status}`, buyerLogin.data);
  const buyerToken = buyerLogin.data?.session_token;

  let buyerMe = null;
  if (buyerToken) {
    buyerMe = await apiRequest('GET', '/api/mvp/auth/me', null, buyerToken);
    console.log(`Buyer auth/me status: ${buyerMe.status}`, buyerMe.data);
  }

  const listingsFeed = await apiRequest('GET', '/api/mvp/listings', null, buyerToken);
  console.log(`Buyer listings feed status: ${listingsFeed.status}`);
  evidenceLog.phases['phase_c_buyer_discovery'] = { login: buyerLogin, me: buyerMe, feed: listingsFeed };

  // -------------------------------------------------------------
  // PHASE D: BUY NOW FLOW
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE D] Buy Now Flow');
  let buyNowOrder = null;
  if (listingId1 && buyerToken) {
    buyNowOrder = await apiRequest('POST', '/api/mvp/buyer/order', {
      buyerId: 'buyer-1',
      listingId: listingId1
    }, buyerToken);
    console.log(`Buy Now Order status: ${buyNowOrder.status}`, buyNowOrder.data);
  }
  evidenceLog.phases['phase_d_buy_now'] = buyNowOrder;
  const buyNowOrderId = buyNowOrder?.data?.order?.id;
  const buyNowEscrowId = buyNowOrder?.data?.escrow?.id;

  // -------------------------------------------------------------
  // PHASE E: MAKE OFFER FLOW
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE E] Make Offer Flow (Separate Listing)');
  const barcode2 = `P0-SMOKE-BC2-${Date.now()}`;
  const createListing2 = await apiRequest('POST', '/api/mvp/seller/listing', {
    sellerId: 'seller-1',
    eventId: 'event-pestapora-2026',
    seatInfo: `P0-SMOKE-OFFER-SEAT-${RUN_ID}`,
    faceValue: 500000,
    price: 600000,
    rawBarcode: barcode2
  }, sellerToken);
  const listingId2 = createListing2.data?.listing?.id;

  if (listingId2 && adminToken) {
    await apiRequest('POST', `/api/mvp/admin/listings/${listingId2}/verify`, {
      approved: true,
      reason: 'Offer Flow Approval'
    }, adminToken);
  }

  // Buyer submits offer
  let createOfferRes = null;
  if (listingId2 && buyerToken) {
    createOfferRes = await apiRequest('POST', `/api/listings/${listingId2}/offers`, {
      amount: 550000,
      notes: 'P0 Smoke Test Offer'
    }, buyerToken);
    console.log(`Buyer Create Offer status: ${createOfferRes.status}`, createOfferRes.data);
  }
  const offerId = createOfferRes?.data?.offer?.id;
  evidenceLog.phases['phase_e_create_offer'] = createOfferRes;

  // Illegal mutation test: Buyer cannot accept their own offer
  let illegalAccept = null;
  if (offerId && buyerToken) {
    illegalAccept = await apiRequest('POST', `/api/offers/${offerId}/accept`, {}, buyerToken);
    console.log(`Security: Buyer accepts own offer status: ${illegalAccept.status} (Expected 403)`, illegalAccept.data);
  }
  evidenceLog.phases['illegal_accept_own_offer'] = illegalAccept;

  // Seller actions: Seller counter-offers
  let sellerCounter = null;
  if (offerId && sellerToken) {
    sellerCounter = await apiRequest('POST', `/api/offers/${offerId}/counter`, {
      counter_amount: 580000,
      notes: 'P0 Smoke Test Counter'
    }, sellerToken);
    console.log(`Seller Counter status: ${sellerCounter.status}`, sellerCounter.data);
  }
  evidenceLog.phases['phase_e_seller_counter'] = sellerCounter;

  // Buyer accepts counter -> Order creation
  let buyerAcceptCounter = null;
  if (offerId && buyerToken) {
    buyerAcceptCounter = await apiRequest('POST', `/api/offers/${offerId}/accept-counter`, {}, buyerToken);
    console.log(`Buyer Accept Counter status: ${buyerAcceptCounter.status}`, buyerAcceptCounter.data);
  }
  evidenceLog.phases['phase_e_accept_counter_order'] = buyerAcceptCounter;

  // -------------------------------------------------------------
  // PHASE F & G: PAYMENT & WEBHOOK GATEWAY AUDIT
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE F & G] Payment & Webhook Verification');
  // 1. Probe for Webhook endpoint
  const webhookProbe1 = await apiRequest('POST', '/api/mvp/payments/webhook', { test: true });
  console.log(`Webhook probe (/api/mvp/payments/webhook): HTTP ${webhookProbe1.status}`);
  const webhookProbe2 = await apiRequest('POST', '/api/payments/webhook', { test: true });
  console.log(`Webhook probe (/api/payments/webhook): HTTP ${webhookProbe2.status}`);
  const webhookProbe3 = await apiRequest('POST', '/webhook', { test: true });
  console.log(`Webhook probe (/webhook): HTTP ${webhookProbe3.status}`);

  evidenceLog.phases['webhook_probes'] = {
    probe1: webhookProbe1.status,
    probe2: webhookProbe2.status,
    probe3: webhookProbe3.status
  };

  // 2. Buyer Pay execution (The actual existing endpoint)
  let payRes = null;
  if (buyNowOrderId && buyerToken) {
    const totalAmount = buyNowOrder?.data?.pricing?.totalAmount;
    payRes = await apiRequest('POST', '/api/mvp/buyer/pay', {
      orderId: buyNowOrderId,
      providerRef: `IPAYMU-SIM-${Date.now()}`,
      idempotencyKey: `IDEMP-${Date.now()}`,
      amountPaid: totalAmount
    }, buyerToken);
    console.log(`Buyer pay endpoint status: ${payRes.status}`, payRes.data);
  }
  evidenceLog.phases['phase_f_buyer_pay'] = payRes;

  // -------------------------------------------------------------
  // PHASE H: PIC GATE & OPERATIONAL WINDOW AUDIT
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE H] PIC / Gate Verification');
  const picLogin = await apiRequest('POST', '/api/mvp/auth/login', { usernameOrId: 'pic-1' });
  console.log(`PIC login status: ${picLogin.status}`, picLogin.data);
  const picToken = picLogin.data?.session_token;

  let picVerifyRes = null;
  if (buyNowOrderId && picToken) {
    picVerifyRes = await apiRequest('POST', '/api/mvp/pic/verify-entry', {
      picUserId: 'pic-1',
      orderId: buyNowOrderId,
      gate: 'Pintu 1',
      notes: 'P0 Smoke Test Entry Verification'
    }, picToken);
    console.log(`PIC verify-entry status: ${picVerifyRes.status}`, picVerifyRes.data);
  }
  evidenceLog.phases['phase_h_pic_verify'] = picVerifyRes;

  // -------------------------------------------------------------
  // PHASE I: SETTLEMENT GATE AUDIT
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE I] Settlement Gate');
  let settlementAttempt = null;
  if (buyNowOrderId && adminToken) {
    settlementAttempt = await apiRequest('POST', '/api/mvp/admin/settlements/execute', {
      officerId: 'admin-1',
      orderId: buyNowOrderId,
      sellerId: 'seller-1',
      reason: 'P0 Production Smoke Test Settlement Execution Reason',
      stepUpPassword: 'pilot123'
    }, adminToken);
    console.log(`Settlement execution status: ${settlementAttempt.status}`, settlementAttempt.data);
  }
  evidenceLog.phases['phase_i_settlement'] = settlementAttempt;

  // -------------------------------------------------------------
  // PHASE J: DISPUTE AUDIT (Using accepted offer order)
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE J] Dispute Flow');
  const offerOrderId = buyerAcceptCounter?.data?.order?.id;
  let disputeRes = null;
  if (offerOrderId && buyerToken) {
    // Pay offer order first
    await apiRequest('POST', '/api/mvp/buyer/pay', {
      orderId: offerOrderId,
      providerRef: `IPAYMU-SIM-OFFER-${Date.now()}`,
      idempotencyKey: `IDEMP-OFFER-${Date.now()}`,
      amountPaid: buyerAcceptCounter?.data?.pricing?.totalAmount
    }, buyerToken);

    disputeRes = await apiRequest('POST', '/api/mvp/buyer/dispute', {
      orderId: offerOrderId,
      buyerId: 'buyer-1',
      reason: 'TICKET_INVALID_AT_GATE'
    }, buyerToken);
    console.log(`Buyer open dispute status: ${disputeRes.status}`, disputeRes.data);
  }
  evidenceLog.phases['phase_j_dispute'] = disputeRes;

  // -------------------------------------------------------------
  // PHASE K: SECURITY & AUTHORIZATION BOUNDARY AUDIT
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE K] Security & Authorization Boundary Checks');
  // 1. Unauthenticated request to protected endpoint
  const unauthListing = await apiRequest('POST', '/api/mvp/seller/listing', {
    sellerId: 'seller-1',
    eventId: 'event-pestapora-2026',
    seatInfo: 'Unauthorized Seat',
    faceValue: 100000,
    price: 100000,
    rawBarcode: 'FAKE-BC'
  });
  console.log(`Security: Unauthenticated seller listing status: ${unauthListing.status} (Expected 401)`);

  // 2. Identity spoofing via x-user-id header in production
  const spoofHeader = await apiRequest('GET', '/api/mvp/buyer/buyer-1/orders', null, null, { 'x-user-id': 'buyer-1' });
  console.log(`Security: x-user-id spoofing status: ${spoofHeader.status} (Expected 401)`);

  // 3. Buyer attempting admin settlement
  const buyerSettle = await apiRequest('POST', '/api/mvp/admin/settlements/execute', {
    officerId: 'buyer-1',
    orderId: buyNowOrderId,
    sellerId: 'seller-1'
  }, buyerToken);
  console.log(`Security: Buyer attempts settlement status: ${buyerSettle.status} (Expected 401 or 403)`);

  // 4. Seller attempting to pay order
  const sellerPay = await apiRequest('POST', '/api/mvp/buyer/pay', {
    orderId: buyNowOrderId,
    idempotencyKey: 'TEST-SPOOF'
  }, sellerToken);
  console.log(`Security: Seller attempts buyer pay status: ${sellerPay.status}`);

  evidenceLog.phases['phase_k_security'] = {
    unauthListing: unauthListing.status,
    spoofHeader: spoofHeader.status,
    buyerSettle: buyerSettle.status,
    sellerPay: sellerPay.status
  };

  // -------------------------------------------------------------
  // PHASE L: PERSISTENCE & EPHEMERAL LAMBDA AUDIT
  // -------------------------------------------------------------
  console.log('\n>>> [PHASE L] Refresh / Session / Persistence Audit');
  // Check if session token still works
  const sessionCheck = await apiRequest('GET', '/api/mvp/auth/me', null, buyerToken);
  console.log(`Session validity on fresh request: HTTP ${sessionCheck.status}`);

  // Check if order exists
  let orderCheck = null;
  if (buyNowOrderId) {
    orderCheck = await apiRequest('GET', `/api/mvp/orders/${buyNowOrderId}`, null, buyerToken);
    console.log(`Order query on fresh request: HTTP ${orderCheck.status}`, orderCheck.data?.order?.id);
  }
  evidenceLog.phases['phase_l_persistence'] = {
    sessionCheck: sessionCheck.status,
    orderCheck: orderCheck?.status
  };

  console.log('\n================================================================');
  console.log('  AUDIT COMPLETE — SUMMARY OF CRITICAL GATES');
  console.log('================================================================');
  console.log(`  Buy Now Order Created: ${buyNowOrderId ? 'YES (' + buyNowOrderId + ')' : 'NO'}`);
  console.log(`  Payment Gateway Status: SIMULATED / BYPASSED DIRECTLY VIA /buyer/pay`);
  console.log(`  Webhook Route Exists: NO (Returned ${webhookProbe1.status} / ${webhookProbe2.status})`);
  console.log(`  PIC Gate Verification: ${picVerifyRes?.status === 200 ? 'PASS' : 'FAILED (' + picVerifyRes?.status + ': ' + (picVerifyRes?.data?.code || picVerifyRes?.data?.error) + ')'}`);
  console.log(`  Settlement Execution: ${settlementAttempt?.status === 200 ? 'PASS' : 'FAILED (' + settlementAttempt?.status + ': ' + (settlementAttempt?.data?.code || settlementAttempt?.data?.error) + ')'}`);
  console.log(`  Dispute Flow: ${disputeRes?.status === 200 ? 'PASS' : 'STATUS ' + disputeRes?.status}`);

  return evidenceLog;
}

runAudit().then(log => {
  const fs = require('fs');
  fs.writeFileSync('production_smoke_evidence.json', JSON.stringify(log, null, 2));
  console.log('\nWrote full evidence to production_smoke_evidence.json');
}).catch(console.error);
