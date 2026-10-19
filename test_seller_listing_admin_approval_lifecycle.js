/**
 * test_seller_listing_admin_approval_lifecycle.js
 * Comprehensive end-to-end automated verification for:
 * 1. Seller listing creation (PENDING_VERIFICATION)
 * 2. Admin overview alerts & pending_listings KPI metrics
 * 3. Admin listing queue filtering (?status=pending vs ?status=active)
 * 4. Column resolution (canonical_event_id, seat info, seller info)
 * 5. Self-approval prevention gate (officer_id === seller_id -> 403 CANNOT_APPROVE_OWN_LISTING)
 * 6. Non-admin moderation protection gate (401/403)
 * 7. Authorized admin approval lifecycle -> ACTIVE
 * 8. Verification in database/repository lookup
 * 9. Idempotent approval handling
 * 10. Rejection lifecycle with reason -> REJECTED
 */

process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'TestAdminPassword123!';

const assert = require('assert');
const http = require('http');
const { state, resetDatabase, bootstrapAdminUser } = require('./src/database');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { SessionStore } = require('./src/services/sessionStore');
const app = require('./src/server');

async function runTests() {
  console.log('--- Starting TIKUM Seller Listing -> Admin Approval Lifecycle Verification ---');
  resetDatabase();
  bootstrapAdminUser();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function httpRequest(path, options = {}) {
    const url = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
      const reqOpts = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.headers || {})
        }
      };

      const req = http.request(reqOpts, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (_) {
            json = data;
          }
          resolve({ status: res.statusCode, data, json, headers: res.headers });
        });
      });

      req.on('error', reject);
      if (options.body) {
        const bodyPayload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        if (!reqOpts.headers['Content-Type']) {
          req.setHeader('Content-Type', 'application/json');
        }
        req.write(bodyPayload);
      }
      req.end();
    });
  }

  try {
    // -------------------------------------------------------------
    // Setup Test Users & Sessions
    // -------------------------------------------------------------
    console.log('\n[Setup] Bootstrapping Admin and Seller Sessions...');
    const adminUser = state.users.find(u => u.role === 'ADMIN');
    assert.ok(adminUser, 'Admin user must exist in state');

    const adminSession = await SessionStore.createSession({
      userId: adminUser.id,
      role: 'ADMIN',
      userAgent: 'TestAdmin/1.0'
    });
    const adminCookie = `session_token=${adminSession.session_token || adminSession.token}`;

    const sellerUser = state.users.find(u => u.id === 'seller-1') || {
      id: 'seller-1',
      name: 'Budi Santoso',
      email: 'budi@seller.com',
      role: 'seller',
      status: 'ACTIVE',
      kyc_status: 'VERIFIED'
    };
    if (!state.users.find(u => u.id === sellerUser.id)) {
      state.users.push(sellerUser);
    }

    const sellerSession = await SessionStore.createSession({
      userId: sellerUser.id,
      role: 'seller',
      userAgent: 'TestSeller/1.0'
    });
    const sellerCookie = `session_token=${sellerSession.session_token || sellerSession.token}`;

    const buyerUser = state.users.find(u => u.role === 'user' || u.role === 'buyer') || {
      id: 'buyer-1',
      name: 'Siti Rahma',
      email: 'siti@buyer.com',
      role: 'user',
      status: 'ACTIVE'
    };
    if (!state.users.find(u => u.id === buyerUser.id)) {
      state.users.push(buyerUser);
    }

    const buyerSession = await SessionStore.createSession({
      userId: buyerUser.id,
      role: 'user',
      userAgent: 'TestBuyer/1.0'
    });
    const buyerCookie = `session_token=${buyerSession.session_token || buyerSession.token}`;

    console.log('  ✓ Test identities and sessions established.');

    // -------------------------------------------------------------
    // Test 1: Seller Submits Listing via POST /api/mvp/seller/listing
    // -------------------------------------------------------------
    console.log('\n[Test 1] Seller Submits Listing via API...');
    let targetEvent = state.events.find(e => e.id === 'event-jakarta-fest');
    if (!targetEvent) {
      targetEvent = {
        id: 'event-jakarta-fest',
        title: 'Jakarta Fest 2026',
        name: 'Jakarta Fest 2026',
        venue_id: 'venue-gbk',
        date: '2026-11-20',
        start_date: '2026-11-20',
        status: 'SCHEDULED',
        lifecycle_status: 'SCHEDULED',
        is_verified: true,
        verification_status: 'VERIFIED'
      };
      state.events.push(targetEvent);
    }

    const createListingPayload = {
      eventId: targetEvent.id,
      seatInfo: 'VIP Row A Seat 12',
      quantity: 1,
      faceValue: 1500000,
      price: 1500000,
      rawBarcode: 'BARCODE-LIFECYCLE-101',
      fulfillmentType: 'TIKUM_VENUE_PIC',
      seatType: 'ASSIGNED'
    };

    const createRes = await httpRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: { Cookie: sellerCookie },
      body: createListingPayload
    });

    assert.strictEqual(createRes.status, 201, `Expected 201 Created, got ${createRes.status}: ${JSON.stringify(createRes.json)}`);
    assert.ok(createRes.json.listing, 'Response must contain listing object');
    const createdListingId = createRes.json.listing.id;
    assert.strictEqual(createRes.json.listing.status, LISTING_STATUS.PENDING_VERIFICATION);
    console.log(`  ✓ Listing created successfully: ${createdListingId} with status PENDING_VERIFICATION.`);

    // -------------------------------------------------------------
    // Test 2: Admin Overview Reflects Pending Listing KPI & Alert
    // -------------------------------------------------------------
    console.log('\n[Test 2] Admin Overview Reflects Pending Listing KPI & Alert...');
    const overviewRes = await httpRequest('/api/admin/overview', {
      headers: { Cookie: adminCookie }
    });

    assert.strictEqual(overviewRes.status, 200, `Expected 200 OK, got ${overviewRes.status}`);
    const overviewData = overviewRes.json;
    assert.ok(overviewData.marketplace, 'Overview must include marketplace metrics');
    assert.ok(overviewData.marketplace.pending_listings >= 1, `pending_listings must be >= 1, got ${overviewData.marketplace.pending_listings}`);

    // Check alerts
    const alerts = overviewData.alerts || [];
    const pendingListingAlert = alerts.find(a => a.type === 'TICKET_VERIFICATION_REQUIRED');
    assert.ok(pendingListingAlert, 'Alert TICKET_VERIFICATION_REQUIRED must be present in overview alerts');
    assert.strictEqual(pendingListingAlert.action_url, '#listings', 'Alert action_url must be #listings');
    console.log(`  ✓ Overview marketplace.pending_listings = ${overviewData.marketplace.pending_listings}, alert present.`);

    // -------------------------------------------------------------
    // Test 3: Admin Listings Queue Visibility & Filtering
    // -------------------------------------------------------------
    console.log('\n[Test 3] Admin Listings Queue Visibility & Filtering...');
    // Query with status=pending
    const pendingListingsRes = await httpRequest('/api/admin/listings?status=pending', {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(pendingListingsRes.status, 200);
    const pendingListings = pendingListingsRes.json.listings || [];
    const foundPending = pendingListings.find(l => l.listing_id === createdListingId);
    assert.ok(foundPending, `Listing ${createdListingId} must be present in ?status=pending query`);
    assert.strictEqual(foundPending.status, LISTING_STATUS.PENDING_VERIFICATION);
    assert.strictEqual(foundPending.event_id, targetEvent.id);
    assert.ok(foundPending.event_name, 'event_name must be populated');
    assert.ok(foundPending.seller_name, 'seller_name must be populated');
    console.log(`  ✓ Found in ?status=pending queue. Event: "${foundPending.event_name}", Seller: "${foundPending.seller_name}"`);

    // Query with status=active
    const activeListingsRes = await httpRequest('/api/admin/listings?status=active', {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(activeListingsRes.status, 200);
    const activeListings = activeListingsRes.json.listings || [];
    const foundInActive = activeListings.find(l => l.listing_id === createdListingId);
    assert.strictEqual(foundInActive, undefined, `Listing ${createdListingId} must NOT be present in ?status=active query`);
    console.log('  ✓ Listing is correctly absent from ?status=active queue.');

    // -------------------------------------------------------------
    // Test 4: Self-Approval Prevention Gate
    // -------------------------------------------------------------
    console.log('\n[Test 4] Self-Approval Prevention Security Gate...');
    // If the seller attempts to moderate their own listing as officer
    const selfApproveRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
      method: 'POST',
      headers: { Cookie: sellerCookie },
      body: { action: 'APPROVE', officer_id: sellerUser.id }
    });
    assert.strictEqual(selfApproveRes.status, 403, `Expected 403 Forbidden on seller self-approval, got ${selfApproveRes.status}`);
    console.log('  ✓ Seller self-approval attempt properly blocked with 403 Forbidden.');

    // What if an admin session spoofed officer_id as the seller_id?
    const spoofedSelfApproveRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: { action: 'APPROVE', officer_id: sellerUser.id }
    });
    assert.strictEqual(spoofedSelfApproveRes.status, 403, `Expected 403 Forbidden when officer_id == seller_id, got ${spoofedSelfApproveRes.status}`);
    assert.strictEqual(spoofedSelfApproveRes.json.code, 'CANNOT_APPROVE_OWN_LISTING');
    console.log('  ✓ Spoofed self-approval (officer_id === seller_id) blocked with 403 CANNOT_APPROVE_OWN_LISTING.');

    // -------------------------------------------------------------
    // Test 5: Non-Admin Moderation Protection Gate
    // -------------------------------------------------------------
    console.log('\n[Test 5] Non-Admin Moderation Protection Gate...');
    const buyerApproveRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
      method: 'POST',
      headers: { Cookie: buyerCookie },
      body: { action: 'APPROVE' }
    });
    assert.strictEqual(buyerApproveRes.status, 403, `Expected 403 Forbidden for buyer, got ${buyerApproveRes.status}`);

    const unauthApproveRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
      method: 'POST',
      body: { action: 'APPROVE' }
    });
    assert.ok([401, 403].includes(unauthApproveRes.status), `Expected 401 or 403 for unauthenticated, got ${unauthApproveRes.status}`);
    console.log('  ✓ Non-admin and unauthenticated moderation requests strictly blocked.');

    // -------------------------------------------------------------
    // Test 6: Authorized Admin Approval Lifecycle
    // -------------------------------------------------------------
    console.log('\n[Test 6] Authorized Admin Moderation Approval...');
    const approveRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: { action: 'APPROVE' }
    });
    assert.strictEqual(approveRes.status, 200, `Expected 200 OK on admin approval, got ${approveRes.status}: ${JSON.stringify(approveRes.json)}`);
    assert.strictEqual(approveRes.json.success, true);
    assert.strictEqual(approveRes.json.listing.status, LISTING_STATUS.ACTIVE);
    console.log(`  ✓ Listing ${createdListingId} successfully approved to ACTIVE.`);

    // -------------------------------------------------------------
    // Test 7: Post-Approval Queue and Metrics Verification
    // -------------------------------------------------------------
    console.log('\n[Test 7] Post-Approval Queue and Metrics Verification...');
    // Query with status=active now includes it
    const postActiveRes = await httpRequest('/api/admin/listings?status=active', {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(postActiveRes.status, 200);
    const postActiveListings = postActiveRes.json.listings || [];
    const foundActive = postActiveListings.find(l => l.listing_id === createdListingId);
    assert.ok(foundActive, `Listing ${createdListingId} must now appear in ?status=active queue`);
    assert.strictEqual(foundActive.status, LISTING_STATUS.ACTIVE);

    // Query with status=pending now omits it
    const postPendingRes = await httpRequest('/api/admin/listings?status=pending', {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(postPendingRes.status, 200);
    const postPendingListings = postPendingRes.json.listings || [];
    const foundInPendingAfter = postPendingListings.find(l => l.listing_id === createdListingId);
    assert.strictEqual(foundInPendingAfter, undefined, `Listing ${createdListingId} must no longer appear in ?status=pending queue`);
    console.log('  ✓ Listing correctly shifted from pending to active queue.');

    // -------------------------------------------------------------
    // Test 8: Idempotent Approval
    // -------------------------------------------------------------
    console.log('\n[Test 8] Idempotent Approval Handling...');
    const reApproveRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: { action: 'APPROVE' }
    });
    assert.strictEqual(reApproveRes.status, 200, `Re-approval should succeed idempotently, got ${reApproveRes.status}`);
    assert.strictEqual(reApproveRes.json.success, true);
    console.log('  ✓ Re-approval is idempotent and returns 200.');

    // -------------------------------------------------------------
    // Test 9: Rejection Lifecycle with Reason
    // -------------------------------------------------------------
    console.log('\n[Test 9] Rejection Lifecycle with Reason...');
    const rejectListingPayload = {
      eventId: targetEvent.id,
      seatInfo: 'CAT 1 Row B Seat 5',
      quantity: 1,
      faceValue: 1000000,
      price: 1000000,
      rawBarcode: 'BARCODE-LIFECYCLE-102',
      fulfillmentType: 'TIKUM_VENUE_PIC',
      seatType: 'ASSIGNED'
    };

    const createRes2 = await httpRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: { Cookie: sellerCookie },
      body: rejectListingPayload
    });
    assert.strictEqual(createRes2.status, 201);
    const listingToRejectId = createRes2.json.listing.id;

    // Missing rejection reason fails
    const failRejectRes = await httpRequest(`/api/admin/listings/${listingToRejectId}/moderate`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: { action: 'REJECT' }
    });
    assert.strictEqual(failRejectRes.status, 400, 'Rejection without reason must fail with 400');

    // Valid rejection
    const validRejectRes = await httpRequest(`/api/admin/listings/${listingToRejectId}/moderate`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: { action: 'REJECT', reason: 'Dokumen tiket tidak terbaca / barcode buram' }
    });
    assert.strictEqual(validRejectRes.status, 200);
    assert.strictEqual(validRejectRes.json.listing.status, LISTING_STATUS.REJECTED);
    console.log(`  ✓ Listing ${listingToRejectId} successfully rejected with reason.`);

    console.log('\n=============================================================');
    console.log('ALL SELLER LISTING & ADMIN APPROVAL LIFECYCLE TESTS PASSED!');
    console.log('=============================================================');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
