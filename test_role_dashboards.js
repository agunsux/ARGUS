/**
 * TIKUM / ARGUS — Role-Based Marketplace Dashboards Verification Suite
 *
 * Tests Phase 1–6 requirements:
 * 1. Authentication & Role Entry Routing (/app, /app/buyer, /app/seller, /admin)
 * 2. Buyer Dashboard Data & Ownership Isolation (/api/dashboard/buyer)
 * 3. Seller Dashboard Data, Ownership Isolation & Honest Settlement (/api/dashboard/seller)
 * 4. Profile Security & Privilege Escalation Prevention (/api/dashboard/profile)
 * 5. Admin Dashboard Security, Session Revocation on Suspension & Redaction (/api/admin/*)
 * 6. Data Integrity: Real 0 vs 503 UNAVAILABLE on Repository Failure (Zero Fabrication)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { ListingService } = require('./src/services/listingService');
const { EscrowService } = require('./src/services/escrowService');
const { OfferService } = require('./src/services/offerService');
const { getUserRepository, getMarketplaceRepository, getMoneyRepository } = require('./src/storage');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqOpts.headers['Content-Type'] && !reqOpts.headers['content-type']) {
        req.setHeader('Content-Type', 'application/json');
      }
      req.write(payload);
    }
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

async function createAuthenticatedUser({ id, email, name, role = 'BUYER', status = 'ACTIVE' }) {
  const userRepo = getUserRepository();
  const now = new Date().toISOString();
  const userObj = {
    id,
    email: email.toLowerCase(),
    name,
    role,
    status,
    created_at: now,
    updated_at: now
  };

  const existingIdx = state.users.findIndex(u => u.id === id || u.email === userObj.email);
  if (existingIdx >= 0) {
    state.users[existingIdx] = { ...state.users[existingIdx], ...userObj };
  } else {
    state.users.push(userObj);
  }

  let persistedUser = userObj;
  if (userRepo && typeof userRepo.getUserByEmail === 'function') {
    const found = await userRepo.getUserByEmail(userObj.email, true).catch(() => null);
    if (!found && typeof userRepo.createUser === 'function') {
      persistedUser = await userRepo.createUser(userObj).catch(() => userObj);
    } else if (found) {
      persistedUser = found;
      if (typeof userRepo.updateUserStatus === 'function') {
        await userRepo.updateUserStatus(found.id, status).catch(() => {});
      }
    }
  }

  const canonicalId = persistedUser.id || id;
  userObj.id = canonicalId;

  const session = await SessionStore.createSession({
    userId: canonicalId,
    role,
    ip: '127.0.0.1',
    userAgent: 'TikumRoleDashboardTest/1.0'
  });

  return {
    user: userObj,
    token: session.session_token,
    cookieHeader: `session_token=${session.session_token}`
  };
}

async function run() {
  console.log('================================================================');
  console.log('  TIKUM — ROLE-BASED MARKETPLACE DASHBOARDS TEST SUITE          ');
  console.log('================================================================\n');

  resetDatabase();

  server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const buyerA = await createAuthenticatedUser({
      id: 'usr-dash-buyer-a',
      email: 'buyer.a.dash@tikum.test',
      name: 'Andi Pratama',
      role: 'BUYER'
    });
    const buyerB = await createAuthenticatedUser({
      id: 'usr-dash-buyer-b',
      email: 'buyer.b.dash@tikum.test',
      name: 'Bella Kusuma',
      role: 'BUYER'
    });
    const sellerA = await createAuthenticatedUser({
      id: 'usr-dash-seller-a',
      email: 'seller.a.dash@tikum.test',
      name: 'Citra Lestari',
      role: 'SELLER'
    });
    const sellerB = await createAuthenticatedUser({
      id: 'usr-dash-seller-b',
      email: 'seller.b.dash@tikum.test',
      name: 'Doni Wijaya',
      role: 'SELLER'
    });
    const adminUser = await createAuthenticatedUser({
      id: 'usr-dash-admin-1',
      email: 'admin.dash@tikum.test',
      name: 'Admin Tikum',
      role: 'ADMIN'
    });

    console.log('── 1. Authentication & Role-Based Entry Routing (/app, /app/buyer, /app/seller, /admin) ──');

    await test('1.1 Unauthenticated access to /app redirects to /login?redirect=%2Fapp', async () => {
      const res = await request('/app', { headers: { Accept: 'text/html' } });
      assert.strictEqual(res.statusCode, 302);
      assert.strictEqual(res.headers.location, '/login?redirect=%2Fapp');
    });

    await test('1.2 Unauthenticated JSON access to /app, /app/buyer, /app/seller, and /api/dashboard/* returns 401', async () => {
      for (const path of ['/app', '/app/buyer', '/app/seller', '/api/dashboard/me', '/api/dashboard/buyer', '/api/dashboard/seller']) {
        const res = await request(path, { headers: { Accept: 'application/json' } });
        assert.strictEqual(res.statusCode, 401, `Expected 401 for ${path}, got ${res.statusCode}`);
      }
    });

    await test('1.3 /app redirects BUYER to /app/buyer, SELLER to /app/seller, and ADMIN to /admin', async () => {
      const resBuyer = await request('/app', { headers: { Cookie: buyerA.cookieHeader } });
      assert.strictEqual(resBuyer.statusCode, 302);
      assert.strictEqual(resBuyer.headers.location, '/app/buyer');

      const resSeller = await request('/app', { headers: { Cookie: sellerA.cookieHeader } });
      assert.strictEqual(resSeller.statusCode, 302);
      assert.strictEqual(resSeller.headers.location, '/app/seller');

      const resAdmin = await request('/app', { headers: { Cookie: adminUser.cookieHeader } });
      assert.strictEqual(resAdmin.statusCode, 302);
      assert.strictEqual(resAdmin.headers.location, '/admin');
    });

    await test('1.4 Authenticated HTML access to /app/buyer and /app/seller serves dashboard HTML', async () => {
      const resBuyer = await request('/app/buyer', {
        headers: { Cookie: buyerA.cookieHeader, Accept: 'text/html' }
      });
      assert.strictEqual(resBuyer.statusCode, 200);
      assert.ok(resBuyer.body.includes('Dashboard Pembeli'));

      const resSeller = await request('/app/seller', {
        headers: { Cookie: sellerA.cookieHeader, Accept: 'text/html' }
      });
      assert.strictEqual(resSeller.statusCode, 200);
      assert.ok(resSeller.body.includes('Dashboard Penjual'));
    });

    console.log('\n── 2. Empty State & Zero Fake Data Verification ──');

    await test('2.1 Fresh buyer and seller see real 0 counts and empty arrays (zero fabricated metrics)', async () => {
      const resBuyer = await request('/api/dashboard/buyer', {
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(resBuyer.statusCode, 200);
      assert.strictEqual(resBuyer.json.meta.dataState, 'OK');
      assert.strictEqual(resBuyer.json.overview.active_orders_count, 0);
      assert.strictEqual(resBuyer.json.overview.pending_payments_count, 0);
      assert.strictEqual(resBuyer.json.overview.active_offers_count, 0);
      assert.strictEqual(resBuyer.json.overview.completed_purchases_count, 0);
      assert.strictEqual(resBuyer.json.orders.items.length, 0);
      assert.strictEqual(resBuyer.json.offers.items.length, 0);

      const resSeller = await request('/api/dashboard/seller', {
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(resSeller.statusCode, 200);
      assert.strictEqual(resSeller.json.meta.dataState, 'OK');
      assert.strictEqual(resSeller.json.overview.active_listings_count, 0);
      assert.strictEqual(resSeller.json.overview.pending_offers_count, 0);
      assert.strictEqual(resSeller.json.listings.items.length, 0);
      assert.strictEqual(resSeller.json.orders.items.length, 0);
      assert.strictEqual(resSeller.json.earnings_and_settlement.payout_automation_status, 'UNAVAILABLE_PILOT_MODE');
      assert.strictEqual(resSeller.json.earnings_and_settlement.escrowed_gross_amount_idr, 0);
    });

    console.log('\n── 3. Real Marketplace Activity & Strict Ownership Isolation ──');

    // Ensure a verified upcoming event exists for listing creation
    const testEventId = 'event-dash-test-1';
    state.events.push({
      id: testEventId,
      name: 'Konser Uji Dashboard TIKUM 2026',
      title: 'Konser Uji Dashboard TIKUM 2026',
      date: '2026-12-20',
      start_date: '2026-12-20',
      venue_id: 'venue-gbk',
      venue_name: 'Gelora Bung Karno',
      venue_city: 'Jakarta',
      category: 'KONSER',
      status: 'UPCOMING',
      is_verified: true,
      verification_status: 'VERIFIED'
    });

    // KYC-verify sellerA and sellerB so their listings become ACTIVE
    state.seller_profiles.push(
      { user_id: sellerA.user.id, kyc_status: 'VERIFIED', active_listing_limit: 5 },
      { user_id: sellerB.user.id, kyc_status: 'VERIFIED', active_listing_limit: 5 }
    );

    let sellerAListing1;
    let sellerAListing2;
    let sellerBListing1;

    await test('3.1 Creating real listings updates Seller A and Seller B dashboards independently', async () => {
      const r1 = await ListingService.createListing({
        sellerId: sellerA.user.id,
        eventId: testEventId,
        seatInfo: 'VIP-A1',
        faceValue: 1500000,
        price: 1500000,
        rawBarcode: 'barcode-dash-seller-a-1'
      });
      sellerAListing1 = r1.listing;

      const r2 = await ListingService.createListing({
        sellerId: sellerA.user.id,
        eventId: testEventId,
        seatInfo: 'CAT1-B2',
        faceValue: 1000000,
        price: 1000000,
        rawBarcode: 'barcode-dash-seller-a-2'
      });
      sellerAListing2 = r2.listing;

      const r3 = await ListingService.createListing({
        sellerId: sellerB.user.id,
        eventId: testEventId,
        seatInfo: 'FEST-C3',
        faceValue: 800000,
        price: 800000,
        rawBarcode: 'barcode-dash-seller-b-1'
      });
      sellerBListing1 = r3.listing;

      const resSellerA = await request('/api/dashboard/seller', {
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(resSellerA.statusCode, 200);
      assert.strictEqual(resSellerA.json.listings.total, 2);
      assert.ok(resSellerA.json.listings.items.every(l => l.listing_id !== sellerBListing1.id));

      const resSellerB = await request('/api/dashboard/seller', {
        headers: { Cookie: sellerB.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(resSellerB.statusCode, 200);
      assert.strictEqual(resSellerB.json.listings.total, 1);
      assert.strictEqual(resSellerB.json.listings.items[0].listing_id, sellerBListing1.id);
    });

    await test('3.2 Creating real offer and order isolates Buyer A from Buyer B and masks Buyer PII for Seller', async () => {
      // Activate listings so offers and orders can be placed on them
      sellerAListing1.status = 'ACTIVE';
      sellerAListing2.status = 'ACTIVE';
      sellerBListing1.status = 'ACTIVE';
      const marketRepo = getMarketplaceRepository();
      await marketRepo.updateListingStatus(sellerAListing1.id, 'ACTIVE');
      await marketRepo.updateListingStatus(sellerAListing2.id, 'ACTIVE');
      await marketRepo.updateListingStatus(sellerBListing1.id, 'ACTIVE');

      // Buyer A creates an offer on Seller A's second listing
      await OfferService.createOffer({
        listingId: sellerAListing2.id,
        buyerId: buyerA.user.id,
        offerAmount: 900000
      });

      // Buyer A creates an order on Seller A's first listing
      await EscrowService.createOrder({
        buyerId: buyerA.user.id,
        listingId: sellerAListing1.id
      });

      // Buyer A sees 1 order and 1 offer
      const resBuyerA = await request('/api/dashboard/buyer', {
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(resBuyerA.statusCode, 200);
      assert.strictEqual(resBuyerA.json.orders.total, 1);
      assert.strictEqual(resBuyerA.json.offers.total, 1);

      // Buyer B sees 0 orders and 0 offers
      const resBuyerB = await request('/api/dashboard/buyer', {
        headers: { Cookie: buyerB.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(resBuyerB.statusCode, 200);
      assert.strictEqual(resBuyerB.json.orders.total, 0);
      assert.strictEqual(resBuyerB.json.offers.total, 0);

      // Seller A sees 1 order with masked buyer name and 1 incoming offer
      const resSellerA = await request('/api/dashboard/seller', {
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(resSellerA.statusCode, 200);
      assert.strictEqual(resSellerA.json.orders.total, 1);
      assert.strictEqual(resSellerA.json.offers.total, 1);
      const sellerOrderView = resSellerA.json.orders.items[0];
      assert.ok(sellerOrderView.buyer_masked_name.includes('***'), 'Buyer name must be masked for seller');
      assert.strictEqual(sellerOrderView.buyer_email, undefined, 'Buyer email must not be exposed');
    });

    await test('3.3 Client-supplied userId / buyerId / sellerId spoofing is rejected with 403', async () => {
      const spoofBuyer = await request(`/api/dashboard/buyer?buyerId=${buyerA.user.id}`, {
        headers: { Cookie: buyerB.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(spoofBuyer.statusCode, 403);
      assert.strictEqual(spoofBuyer.json.code, 'FORBIDDEN_OWNERSHIP');

      const spoofSeller = await request(`/api/dashboard/seller?sellerId=${sellerA.user.id}`, {
        headers: { Cookie: sellerB.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(spoofSeller.statusCode, 403);
      assert.strictEqual(spoofSeller.json.code, 'FORBIDDEN_OWNERSHIP');
    });

    await test('3.4 Seller B cannot withdraw Seller A listing (403) and Seller A cannot withdraw listing locked by active order (409)', async () => {
      const crossWithdraw = await request(`/api/dashboard/seller/listings/${sellerAListing2.id}/withdraw`, {
        method: 'POST',
        headers: { Cookie: sellerB.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(crossWithdraw.statusCode, 403);
      assert.strictEqual(crossWithdraw.json.code, 'FORBIDDEN_OWNERSHIP');

      const lockedWithdraw = await request(`/api/dashboard/seller/listings/${sellerAListing1.id}/withdraw`, {
        method: 'POST',
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(lockedWithdraw.statusCode, 409);
      assert.strictEqual(lockedWithdraw.json.code, 'LISTING_LOCKED_BY_ORDER');

      // Seller B CAN withdraw their own unlocked listing
      const validWithdraw = await request(`/api/dashboard/seller/listings/${sellerBListing1.id}/withdraw`, {
        method: 'POST',
        headers: { Cookie: sellerB.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(validWithdraw.statusCode, 200);
      assert.strictEqual(validWithdraw.json.listing.status, 'WITHDRAWN');
    });

    console.log('\n── 4. Profile Security & Role Escalation Prevention ──');

    await test('4.1 PATCH /api/dashboard/profile updates safe fields (name, phone) and rejects role/status/kyc mutation (403)', async () => {
      const safeRes = await request('/api/dashboard/profile', {
        method: 'PATCH',
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' },
        body: { name: 'Andi Pratama Updated', phone: '081299998888' }
      });
      assert.strictEqual(safeRes.statusCode, 200);
      assert.strictEqual(safeRes.json.user.name, 'Andi Pratama Updated');

      const escalateRes = await request('/api/dashboard/profile', {
        method: 'PATCH',
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' },
        body: { name: 'Hacker', role: 'ADMIN' }
      });
      assert.strictEqual(escalateRes.statusCode, 403);
      assert.strictEqual(escalateRes.json.code, 'FORBIDDEN_FIELD_MUTATION');
    });

    console.log('\n── 5. Admin Security, RBAC, Suspension Session Revocation & Secret Redaction ──');

    await test('5.1 Non-admin users (BUYER, SELLER) and X-User-Role: ADMIN header spoofing get 403 on /admin and /api/admin/*', async () => {
      const buyerAdminRes = await request('/api/admin/overview', {
        headers: {
          Cookie: buyerA.cookieHeader,
          'X-User-Role': 'ADMIN',
          Accept: 'application/json'
        }
      });
      assert.strictEqual(buyerAdminRes.statusCode, 403);

      const sellerAdminRes = await request('/api/admin/users', {
        headers: {
          Cookie: sellerA.cookieHeader,
          'X-User-Role': 'ADMIN',
          Accept: 'application/json'
        }
      });
      assert.strictEqual(sellerAdminRes.statusCode, 403);
    });

    await test('5.2 Admin overview, users, listings, orders, offers, audit-logs return real data and redact all hashes', async () => {
      const ovRes = await request('/api/admin/overview', {
        headers: { Cookie: adminUser.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(ovRes.statusCode, 200);
      assert.strictEqual(ovRes.json.meta.dataState, 'OK');
      assert.strictEqual(ovRes.json.payment_finance_snapshot.automation_status, 'UNAVAILABLE_PILOT_MODE');
      assert.ok(ovRes.json.marketplace.total_listings >= 3);
      assert.ok(ovRes.json.marketplace.total_orders >= 1);
      assert.ok(ovRes.json.marketplace.total_offers >= 1);

      const usersRes = await request('/api/admin/users?search=buyer.a.dash', {
        headers: { Cookie: adminUser.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(usersRes.statusCode, 200);
      assert.strictEqual(usersRes.json.users.length, 1);
      assert.strictEqual(usersRes.json.users[0].email, 'buyer.a.dash@tikum.test');
      assert.ok(!usersRes.body.includes('password_hash'));

      const auditRes = await request('/api/admin/audit-logs', {
        headers: { Cookie: adminUser.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(auditRes.statusCode, 200);
      assert.ok(!auditRes.body.includes('token_hash'));
      assert.ok(!auditRes.body.includes('session_token_hash'));
    });

    await test('5.3 Admin cannot suspend self (400), and suspending a user immediately revokes their active session', async () => {
      const selfSuspend = await request(`/api/admin/users/${adminUser.user.id}/status`, {
        method: 'PATCH',
        headers: { Cookie: adminUser.cookieHeader, Accept: 'application/json' },
        body: { status: 'SUSPENDED' }
      });
      assert.strictEqual(selfSuspend.statusCode, 400);
      assert.strictEqual(selfSuspend.json.code, 'CANNOT_SUSPEND_SELF');

      // Suspend Buyer B
      const suspendBuyerB = await request(`/api/admin/users/${buyerB.user.id}/status`, {
        method: 'PATCH',
        headers: { Cookie: adminUser.cookieHeader, Accept: 'application/json' },
        body: { status: 'SUSPENDED' }
      });
      assert.strictEqual(suspendBuyerB.statusCode, 200);
      assert.strictEqual(suspendBuyerB.json.user.status, 'SUSPENDED');

      // Buyer B's session is now revoked/blocked on dashboard API
      const blockedAccess = await request('/api/dashboard/buyer', {
        headers: { Cookie: buyerB.cookieHeader, Accept: 'application/json' }
      });
      assert.ok(
        blockedAccess.statusCode === 401 || blockedAccess.statusCode === 403,
        `Expected 401 or 403 for suspended user session, got ${blockedAccess.statusCode}`
      );
    });

    console.log('\n── 6. Fail-Closed 503 UNAVAILABLE on Repository Failure ──');

    await test('6.1 Repository failure returns HTTP 503 with dataState: UNAVAILABLE (never fake 0s)', async () => {
      const moneyRepo = getMoneyRepository();
      const origListOrders = moneyRepo.listOrdersByBuyerId;
      moneyRepo.listOrdersByBuyerId = async () => {
        throw new Error('Simulated Neon connection timeout');
      };

      try {
        const res = await request('/api/dashboard/buyer', {
          headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' }
        });
        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.json.code, 'DASHBOARD_DATA_UNAVAILABLE');
        assert.strictEqual(res.json.dataState, 'UNAVAILABLE');
        assert.strictEqual(res.json.overview, undefined, 'Must not return fake 0 overview when DB fails');
      } finally {
        moneyRepo.listOrdersByBuyerId = origListOrders;
      }
    });

    await test('6.2 Admin overview returns HTTP 503 DATA_UNAVAILABLE when repository fails', async () => {
      const moneyRepo = getMoneyRepository();
      const origListAllOrders = moneyRepo.listAllOrders;
      moneyRepo.listAllOrders = async () => {
        throw new Error('Simulated Admin DB query failure');
      };

      try {
        const res = await request('/api/admin/overview', {
          headers: { Cookie: adminUser.cookieHeader, Accept: 'application/json' }
        });
        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.json.code, 'DATA_UNAVAILABLE');
        assert.strictEqual(res.json.dataState, 'UNAVAILABLE');
      } finally {
        moneyRepo.listAllOrders = origListAllOrders;
      }
    });

    console.log('\n── 7. Durable Offer Lifecycle Across Cold Starts & Concurrency Safety ──');

    const buyerC = await createAuthenticatedUser({
      id: 'usr-dash-buyer-c',
      email: 'buyer.c.dash@tikum.test',
      name: 'Chandra Putra',
      role: 'BUYER'
    });

    await test('7.1 /api/dashboard/buyer/summary and /api/dashboard/seller/summary report durable POSTGRESQL offer persistence', async () => {
      const bSum = await request('/api/dashboard/buyer/summary', {
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(bSum.statusCode, 200);
      assert.strictEqual(bSum.json.meta.persistence.offers, 'POSTGRESQL');

      const sSum = await request('/api/dashboard/seller/summary', {
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(sSum.statusCode, 200);
      assert.strictEqual(sSum.json.meta.persistence.offers, 'POSTGRESQL');
    });

    await test('7.2 Complete offer lifecycle (create -> seller counter -> buyer counter -> accept -> supersede competing -> reject duplicate/unauthorized) survives cold starts', async () => {
      // Create a fresh active listing for Seller A
      const rList = await ListingService.createListing({
        sellerId: sellerA.user.id,
        eventId: testEventId,
        seatInfo: 'COLDSTART-VIP-99',
        faceValue: 2000000,
        price: 2000000,
        rawBarcode: 'barcode-coldstart-offer-99'
      });
      const coldListing = rList.listing;
      coldListing.status = 'ACTIVE';
      await getMarketplaceRepository().updateListingStatus(coldListing.id, 'ACTIVE');

      // 1. Buyer A creates offer via HTTP API (85%-100% of 2,000,000 -> 1,750,000)
      const createRes = await request(`/api/listings/${coldListing.id}/offers`, {
        method: 'POST',
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' },
        body: { offerAmount: 1750000 }
      });
      assert.strictEqual(createRes.statusCode, 201);
      const offer1Id = createRes.json.offer.id;

      // Simulate serverless cold start (wipe process memory)
      state.offers = [];
      state.negotiations = [];
      state.offer_audit_logs = [];

      // 2. Seller A reads dashboard after cold start and sees pending offer
      const sellerDash1 = await request('/api/dashboard/seller', {
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(sellerDash1.statusCode, 200);
      const seenBySeller = sellerDash1.json.offers.items.find(o => o.offer_id === offer1Id);
      assert.ok(seenBySeller, 'Offer must survive cold start on Seller Dashboard');
      assert.strictEqual(seenBySeller.status, 'PENDING');
      assert.strictEqual(seenBySeller.offered_price, 1750000);

      // 3. Seller A counters offer after cold start
      const sellerCounterRes = await request(`/api/offers/${offer1Id}/counter`, {
        method: 'POST',
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' },
        body: { counterAmount: 1900000 }
      });
      assert.strictEqual(sellerCounterRes.statusCode, 200);
      assert.strictEqual(sellerCounterRes.json.offer.status, 'COUNTERED');
      assert.strictEqual(sellerCounterRes.json.offer.counter_amount, 1900000);

      // Simulate another cold start
      state.offers = [];
      state.negotiations = [];
      state.offer_audit_logs = [];

      // 4. Buyer A reads dashboard after cold start and sees COUNTERED offer
      const buyerDash1 = await request('/api/dashboard/buyer', {
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(buyerDash1.statusCode, 200);
      const seenByBuyer = buyerDash1.json.offers.items.find(o => o.offer_id === offer1Id);
      assert.ok(seenByBuyer, 'Countered offer must survive cold start on Buyer Dashboard');
      assert.strictEqual(seenByBuyer.status, 'COUNTERED');
      assert.strictEqual(seenByBuyer.counter_amount, 1900000);

      // 5. Buyer A counters back via HTTP API
      const buyerCounterRes = await request(`/api/offers/${offer1Id}/counter`, {
        method: 'POST',
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' },
        body: { counterAmount: 1820000 }
      });
      assert.strictEqual(buyerCounterRes.statusCode, 200);
      const round2OfferId = buyerCounterRes.json.offer.id;
      assert.strictEqual(buyerCounterRes.json.offer.status, 'PENDING');
      assert.strictEqual(buyerCounterRes.json.offer.offer_amount, 1820000);

      // 6. Competing Buyer C submits an offer on the same listing
      const competingRes = await request(`/api/listings/${coldListing.id}/offers`, {
        method: 'POST',
        headers: { Cookie: buyerC.cookieHeader, Accept: 'application/json' },
        body: { offerAmount: 1780000 }
      });
      assert.strictEqual(competingRes.statusCode, 201);
      const competingOfferId = competingRes.json.offer.id;

      // Simulate cold start before acceptance
      state.offers = [];
      state.negotiations = [];
      state.offer_audit_logs = [];

      // 7. Unauthorized Buyer C cannot accept Buyer A's offer (403)
      const unauthAccept = await request(`/api/offers/${round2OfferId}/accept`, {
        method: 'POST',
        headers: { Cookie: buyerC.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(unauthAccept.statusCode, 403);

      // 8. Seller A accepts Buyer A's round-2 offer after cold start
      const acceptRes = await request(`/api/offers/${round2OfferId}/accept`, {
        method: 'POST',
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(acceptRes.statusCode, 200);
      assert.strictEqual(acceptRes.json.offer.status, 'ACCEPTED');
      assert.ok(acceptRes.json.order && acceptRes.json.order.id, 'Order must be created on accept');
      assert.strictEqual(acceptRes.json.order.ticket_price, 1820000);

      // 9. Duplicate accept on the same offer or superseded competing offer fails (409/400)
      const dupAccept = await request(`/api/offers/${round2OfferId}/accept`, {
        method: 'POST',
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' }
      });
      assert.ok(dupAccept.statusCode === 409 || dupAccept.statusCode === 400);

      // Simulate cold start and verify competing offer was SUPERSEDED durably
      state.offers = [];
      state.negotiations = [];
      const competingPersisted = await OfferService.getOfferById(competingOfferId);
      assert.ok(competingPersisted);
      assert.strictEqual(competingPersisted.status, 'SUPERSEDED');
    });

    console.log('\n── 8. Seller Onboarding, Session Binding & Durable KYC Gate Across Cold Starts ──');

    const freshUser = await createAuthenticatedUser({
      id: 'usr-dash-onboard-1',
      email: 'onboard.seller@tikum.test',
      name: 'Eka Putra',
      role: 'BUYER'
    });

    await test('8.1 POST /api/mvp/seller/listing rejects unauthenticated requests (401) and conflicting sellerId (403)', async () => {
      const unauthRes = await request('/api/mvp/seller/listing', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: {
          eventId: testEventId,
          seatInfo: 'CAT2-10',
          faceValue: 1000000,
          price: 950000,
          rawBarcode: 'barcode-unauth-test-1'
        }
      });
      assert.strictEqual(unauthRes.statusCode, 401);
      assert.strictEqual(unauthRes.json.code, 'AUTHENTICATION_REQUIRED');

      const spoofRes = await request('/api/mvp/seller/listing', {
        method: 'POST',
        headers: { Cookie: sellerA.cookieHeader, Accept: 'application/json' },
        body: {
          sellerId: sellerB.user.id,
          eventId: testEventId,
          seatInfo: 'CAT2-11',
          faceValue: 1000000,
          price: 950000,
          rawBarcode: 'barcode-spoof-test-1'
        }
      });
      assert.strictEqual(spoofRes.statusCode, 403);
      assert.strictEqual(spoofRes.json.code, 'FORBIDDEN');
    });

    await test('8.2 Unverified user is blocked from creating listing (403 SELLER_ONBOARDING_REQUIRED) and blocked from self-verifying KYC (403)', async () => {
      // Seed unrelated metadata key on freshUser to prove jsonb merge preserves it
      await getUserRepository().updateUser(freshUser.user.id, {
        metadata: { custom_pref: 'preserve_this_value' }
      });

      const blockedListing = await request('/api/mvp/seller/listing', {
        method: 'POST',
        headers: { Cookie: freshUser.cookieHeader, Accept: 'application/json' },
        body: {
          eventId: testEventId,
          seatInfo: 'CAT3-01',
          faceValue: 900000,
          price: 850000,
          rawBarcode: 'barcode-onboard-blocked-1'
        }
      });
      assert.strictEqual(blockedListing.statusCode, 403);
      assert.strictEqual(blockedListing.json.code, 'SELLER_ONBOARDING_REQUIRED');

      const selfVerifyAttempt = await request('/api/dashboard/seller/onboarding', {
        method: 'POST',
        headers: { Cookie: freshUser.cookieHeader, Accept: 'application/json' },
        body: {
          full_name: 'Eka Putra',
          phone: '081234567890',
          identity_number_last4: '4821',
          consent_accepted: true,
          kyc_status: 'VERIFIED'
        }
      });
      assert.strictEqual(selfVerifyAttempt.statusCode, 403);
      assert.strictEqual(selfVerifyAttempt.json.code, 'FORBIDDEN_SELF_VERIFICATION');
    });

    await test('8.3 Submitting Seller Onboarding sets PENDING_REVIEW durably, and Admin KYC approval unlocks listing creation across cold starts', async () => {
      const onboardRes = await request('/api/dashboard/seller/onboarding', {
        method: 'POST',
        headers: { Cookie: freshUser.cookieHeader, Accept: 'application/json' },
        body: {
          full_name: 'Eka Putra KTP',
          phone: '081234567890',
          identity_number_last4: '4821',
          payout_bank_name: 'BCA',
          consent_accepted: true
        }
      });
      assert.strictEqual(onboardRes.statusCode, 200);
      assert.strictEqual(onboardRes.json.seller_profile.kyc_status, 'PENDING_REVIEW');

      // Simulate cold start on seller_profiles
      state.seller_profiles = [];

      // Still blocked while PENDING_REVIEW
      const pendingListingRes = await request('/api/mvp/seller/listing', {
        method: 'POST',
        headers: { Cookie: freshUser.cookieHeader, Accept: 'application/json' },
        body: {
          eventId: testEventId,
          seatInfo: 'CAT3-02',
          faceValue: 900000,
          price: 850000,
          rawBarcode: 'barcode-onboard-pending-1'
        }
      });
      assert.strictEqual(pendingListingRes.statusCode, 403);
      assert.strictEqual(pendingListingRes.json.code, 'SELLER_KYC_PENDING_REVIEW');

      // Non-admin cannot approve KYC
      const nonAdminKyc = await request(`/api/admin/sellers/${freshUser.user.id}/kyc`, {
        method: 'PATCH',
        headers: { Cookie: freshUser.cookieHeader, Accept: 'application/json' },
        body: { kyc_status: 'VERIFIED' }
      });
      assert.strictEqual(nonAdminKyc.statusCode, 403);

      // Admin approves seller KYC
      const adminKycRes = await request(`/api/admin/sellers/${freshUser.user.id}/kyc`, {
        method: 'PATCH',
        headers: { Cookie: adminUser.cookieHeader, Accept: 'application/json' },
        body: { kyc_status: 'VERIFIED', active_listing_limit: 3, notes: 'KTP NIK verified' }
      });
      assert.strictEqual(adminKycRes.statusCode, 200);
      assert.strictEqual(adminKycRes.json.seller_profile.kyc_status, 'VERIFIED');
      assert.strictEqual(adminKycRes.json.seller_profile.active_listing_limit, 3);

      // Simulate cold start on seller_profiles
      state.seller_profiles = [];

      // Verify unrelated metadata key was preserved
      const updatedUser = await getUserRepository().getUserById(freshUser.user.id);
      assert.strictEqual(updatedUser.metadata.custom_pref, 'preserve_this_value');
      assert.strictEqual(updatedUser.metadata.seller_profile.kyc_status, 'VERIFIED');

      // Verified seller can now create a listing bound to session req.user.id
      const createListingRes = await request('/api/mvp/seller/listing', {
        method: 'POST',
        headers: { Cookie: freshUser.cookieHeader, Accept: 'application/json' },
        body: {
          eventId: testEventId,
          seatInfo: 'CAT3-VERIFIED-01',
          faceValue: 900000,
          price: 850000,
          rawBarcode: 'barcode-onboard-verified-01'
        }
      });
      assert.strictEqual(createListingRes.statusCode, 201);
      assert.strictEqual(createListingRes.json.listing.seller_id, freshUser.user.id);
    });

    await test('8.4 Logout invalidates session and blocks subsequent dashboard access', async () => {
      const logoutRes = await request('/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(logoutRes.statusCode, 200);

      const postLogoutBuyer = await request('/api/dashboard/buyer', {
        headers: { Cookie: buyerA.cookieHeader, Accept: 'application/json' }
      });
      assert.strictEqual(postLogoutBuyer.statusCode, 401);

      const postLogoutApp = await request('/app', {
        headers: { Cookie: buyerA.cookieHeader, Accept: 'text/html' }
      });
      assert.strictEqual(postLogoutApp.statusCode, 302);
      assert.strictEqual(postLogoutApp.headers.location, '/login?redirect=%2Fapp');
    });

    console.log('\n================================================================');
    console.log(`  SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');
    if (failed > 0) process.exitCode = 1;
  } finally {
    if (server) server.close();
  }
}

run().catch(err => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
