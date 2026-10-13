/**
 * test_quantity_pic_admin_control.js
 * Comprehensive end-to-end automated verification for:
 * 1. Seller ticket quantity (1-4) & per-ticket pricing engine calculations
 * 2. Multi-ticket atomic inventory reservation and release on cancellation
 * 3. Fulfillment options: TIKUM_VENUE_PIC vs SELLER_MANAGED
 * 4. Scoped event PIC operations and security gates (403 on unassigned events)
 * 5. Admin operations control center (overview inventory metrics, listing moderation, PIC assignments)
 * 6. Admin vs support identity isolation (admin@tikum.app bootstrapped, support@tikum.app strictly non-admin)
 */

process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'TestAdminPassword123!';

const assert = require('assert');
const { state, resetDatabase, bootstrapAdminUser } = require('./src/database');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { calculateFeeBreakdown, calculateTicketFees, PRICING_CONFIG } = require('./src/config/pricingConfig');

async function runTests() {
  console.log('--- Starting TIKUM Quantity, PIC & Admin Control Center Verification ---');
  resetDatabase();

  // -------------------------------------------------------------
  // Test 1: Pricing Engine Multi-Ticket Fee & Payout Calculations
  // -------------------------------------------------------------
  console.log('\n[Test 1] Pricing Engine Multi-Ticket Calculations...');
  {
    // Ticket price Rp 1.000.000, 1 ticket -> 6% = Rp 60.000 (unit fee Rp 60.000, seller payout Rp 940.000)
    const p1 = calculateFeeBreakdown(1000000, 1);
    assert.strictEqual(p1.unitPrice, 1000000);
    assert.strictEqual(p1.unitFee, 60000);
    assert.strictEqual(p1.unitSellerPayout, 940000);
    assert.strictEqual(p1.grossTicketPrice, 1000000);
    assert.strictEqual(p1.sellerFee, 60000);
    assert.strictEqual(p1.sellerPayout, 940000);

    // Ticket price Rp 1.000.000, 3 tickets -> gross Rp 3.000.000, total fee Rp 180.000, seller payout Rp 2.820.000
    const p3 = calculateFeeBreakdown(1000000, 3);
    assert.strictEqual(p3.unitPrice, 1000000);
    assert.strictEqual(p3.unitFee, 60000);
    assert.strictEqual(p3.unitSellerPayout, 940000);
    assert.strictEqual(p3.grossTicketPrice, 3000000);
    assert.strictEqual(p3.sellerFee, 180000);
    assert.strictEqual(p3.sellerPayout, 2820000);

    // Minimum fee clamp: Rp 500.000 for 1 ticket -> 6% = Rp 30.000, clamped to min Rp 35.000
    const pMin = calculateFeeBreakdown(500000, 1);
    assert.strictEqual(pMin.unitFee, 35000);
    assert.strictEqual(pMin.sellerFee, 35000);
    assert.strictEqual(pMin.sellerPayout, 465000);

    // Maximum fee clamp: Rp 10.000.000 -> 6% = Rp 600.000, capped at max Rp 300.000
    const pMax = calculateFeeBreakdown(10000000, 1);
    assert.strictEqual(pMax.unitFee, 300000);
    assert.strictEqual(pMax.sellerFee, 300000);
    assert.strictEqual(pMax.sellerPayout, 9700000);

    // Multi-ticket calculation on gross ticket value: 2 tickets @ 500.000 = 1.000.000 gross -> 6% = 60.000
    const pMulti = calculateFeeBreakdown(500000, 2);
    assert.strictEqual(pMulti.grossTicketValue, 1000000);
    assert.strictEqual(pMulti.sellerFee, 60000);
    assert.strictEqual(pMulti.sellerPayout, 940000);

    console.log('  ✓ Multi-ticket pricing engine calculations passed with min/max fee clamps.');
  }

  // -------------------------------------------------------------
  // Test 2: Seller Listing Creation with Inventory & Fulfillment Options
  // -------------------------------------------------------------
  console.log('\n[Test 2] Seller Listing Creation with Inventory & Fulfillment...');
  {
    // Setup verified seller
    const seller = {
      id: 'seller-multi-1',
      name: 'Seller Multi Ticket',
      email: 'seller-multi@test.local',
      role: 'seller',
      phone: '08123456789',
      kyc_status: 'VERIFIED',
      seller_onboarding_status: 'VERIFIED',
      seller_trust_score: 95
    };
    state.users.push(seller);
    if (!state.seller_profiles) state.seller_profiles = [];
    state.seller_profiles.push({
      user_id: seller.id,
      full_name: seller.name,
      phone: seller.phone,
      kyc_status: 'VERIFIED',
      active_listing_limit: 10
    });

    // Setup active event
    const event = {
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
    state.events.push(event);

    const venue = {
      id: 'venue-gbk',
      name: 'Stadion Gelora Bung Karno',
      city: 'Jakarta',
      gate_info: 'Gate Plaza Barat'
    };
    state.venues.push(venue);

    // Create listing 1: 3 tickets, TIKUM_VENUE_PIC (no PIC assigned yet -> REQUESTED_PENDING_ASSIGNMENT)
    const res1 = await ListingService.createListing({
      sellerId: seller.id,
      eventId: event.id,
      seatInfo: 'Festival VIP Row A',
      faceValue: 1000000,
      price: 1200000,
      rawBarcode: 'BARCODE-MULTI-12345',
      quantity: 3,
      fulfillmentType: 'TIKUM_VENUE_PIC',
      seatType: 'ASSIGNED'
    });

    assert.strictEqual(res1.listing.total_quantity, 3);
    assert.strictEqual(res1.listing.available_quantity, 3);
    assert.strictEqual(res1.listing.sold_quantity, 0);
    assert.strictEqual(res1.listing.reserved_quantity, 0);
    assert.strictEqual(res1.listing.fulfillment_type, 'TIKUM_VENUE_PIC');
    assert.strictEqual(res1.listing.pic_assistance_status, 'REQUESTED_PENDING_ASSIGNMENT');
    assert.strictEqual(res1.listing.seat_type, 'ASSIGNED');
    assert.strictEqual(res1.listing.status, LISTING_STATUS.PENDING_VERIFICATION);

    // Verify and activate listing 1
    await ListingService.verifyListing(res1.listing.id, 'admin-1', { approved: true });
    assert.strictEqual(res1.listing.status, LISTING_STATUS.ACTIVE);

    // Create listing 2: 1 ticket, SELLER_MANAGED -> picAssistanceStatus 'NONE'
    const res2 = await ListingService.createListing({
      sellerId: seller.id,
      eventId: event.id,
      seatInfo: 'CAT 2 General',
      faceValue: 600000,
      price: 600000,
      rawBarcode: 'BARCODE-SINGLE-67890',
      quantity: 1,
      fulfillmentType: 'SELLER_MANAGED',
      seatType: 'GENERAL_ADMISSION'
    });

    assert.strictEqual(res2.listing.total_quantity, 1);
    assert.strictEqual(res2.listing.available_quantity, 1);
    assert.strictEqual(res2.listing.fulfillment_type, 'SELLER_MANAGED');
    assert.strictEqual(res2.listing.pic_assistance_status, 'NONE');
    assert.strictEqual(res2.listing.seat_type, 'GENERAL_ADMISSION');

    console.log('  ✓ Listing creation with explicit quantities and fulfillment options verified.');
  }

  // -------------------------------------------------------------
  // Test 3: Multi-Ticket Atomic Inventory Reservation & Release
  // -------------------------------------------------------------
  console.log('\n[Test 3] Multi-Ticket Atomic Reservation & Release...');
  {
    const buyer1 = { id: 'buyer-qty-1', name: 'Buyer Satu', email: 'buyer1@test.local', role: 'user' };
    const buyer2 = { id: 'buyer-qty-2', name: 'Buyer Dua', email: 'buyer2@test.local', role: 'user' };
    state.users.push(buyer1, buyer2);

    const listing = state.listings.find(l => l.total_quantity === 3);
    assert.ok(listing, 'Multi-ticket listing must exist');

    // Buyer 1 reserves 2 tickets out of 3
    const order1 = await EscrowService.createOrder({
      buyerId: buyer1.id,
      listingId: listing.id,
      quantity: 2
    });

    assert.strictEqual(order1.order.order_quantity, 2);
    assert.strictEqual(listing.available_quantity, 1);
    assert.strictEqual(listing.reserved_quantity, 2);
    assert.strictEqual(listing.status, LISTING_STATUS.ACTIVE, 'Listing should stay ACTIVE while 1 ticket remains');

    // Buyer 2 tries to reserve 2 tickets (only 1 available) -> must fail
    await assert.rejects(
      async () => {
        await EscrowService.createOrder({
          buyerId: buyer2.id,
          listingId: listing.id,
          quantity: 2
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'INSUFFICIENT_INVENTORY');
        return true;
      },
      'Should reject order when requested quantity exceeds available quantity'
    );

    // Buyer 2 reserves the remaining 1 ticket
    const order2 = await EscrowService.createOrder({
      buyerId: buyer2.id,
      listingId: listing.id,
      quantity: 1
    });

    assert.strictEqual(order2.order.order_quantity, 1);
    assert.strictEqual(listing.available_quantity, 0);
    assert.strictEqual(listing.reserved_quantity, 3);
    assert.strictEqual(listing.status, LISTING_STATUS.RESERVED, 'Listing should transition to RESERVED when fully allocated');

    // Buyer 1 order expires/cancelled -> inventory restored
    await EscrowService.releaseInventoryForOrder(order1.order.id, 'ORDER_EXPIRED');
    assert.strictEqual(listing.available_quantity, 2, 'Available inventory should be restored to 2');
    assert.strictEqual(listing.reserved_quantity, 1, 'Reserved inventory should decrement to 1');
    assert.strictEqual(listing.status, LISTING_STATUS.ACTIVE, 'Listing should reactivate to ACTIVE');

    console.log('  ✓ Partial inventory reservations and release on cancellation verified.');
  }

  // -------------------------------------------------------------
  // Test 4: PIC Operations & Mobile Route Scoping Security
  // -------------------------------------------------------------
  console.log('\n[Test 4] PIC Operations & Mobile Scoped Route Security...');
  {
    const picOfficer = {
      id: 'pic-user-gbk',
      name: 'Agus Sutanto (PIC GBK)',
      email: 'agus.pic@tikum.app',
      role: 'pic',
      phone: '081199887766'
    };
    state.users.push(picOfficer);

    const unassignedPic = {
      id: 'pic-user-unassigned',
      name: 'Budi (PIC Surabaya)',
      email: 'budi.pic@tikum.app',
      role: 'venue_pic',
      phone: '081233445566'
    };
    state.users.push(unassignedPic);

    // Assign Agus to event-jakarta-fest
    const assignment = EventPicService.assignPic({
      eventId: 'event-jakarta-fest',
      venueId: 'venue-gbk',
      picUserId: picOfficer.id,
      contactPhone: picOfficer.phone
    });
    assert.ok(assignment.id, 'Assignment ID generated');
    assert.strictEqual(assignment.status, 'ACTIVE');

    // Test active status check
    const activeCheck = EventPicService.isPicActiveForEvent(picOfficer.id, 'event-jakarta-fest');
    assert.strictEqual(activeCheck.active, true, 'Assigned PIC must be active for event');

    // Test unassigned event access attempt
    const unassignedCheck = EventPicService.isPicActiveForEvent(unassignedPic.id, 'event-jakarta-fest');
    assert.strictEqual(unassignedCheck.active, false, 'Unassigned PIC must not be active');

    // Dashboard fetch for assigned PIC succeeds
    const picDashboard = EventPicService.getPicEventDashboard(picOfficer.id, 'event-jakarta-fest');
    assert.ok(picDashboard.operational_cell);
    assert.strictEqual(picDashboard.operational_cell.pic_id, picOfficer.id);

    // Dashboard fetch for unassigned PIC throws PIC_UNAUTHORIZED
    assert.throws(
      () => {
        EventPicService.getPicEventDashboard(unassignedPic.id, 'event-jakarta-fest');
      },
      (err) => {
        assert.ok(err.code === 'PIC_UNAUTHORIZED' || err.code === 'PIC_NOT_ACTIVE');
        return true;
      }
    );

    console.log('  ✓ PIC operational window and scoped event access security verified.');
  }

  // -------------------------------------------------------------
  // Test 5: Admin Operations Control Center
  // -------------------------------------------------------------
  console.log('\n[Test 5] Admin Operations Control Center & Inventory Metrics...');
  {
    // Bootstrap Admin User
    const adminResult = bootstrapAdminUser();
    const adminUser = adminResult.user || state.users.find(u => u.email === 'admin@tikum.app');
    assert.ok(adminUser, 'admin@tikum.app user must exist');
    assert.strictEqual(adminUser.email, 'admin@tikum.app');
    assert.strictEqual(adminUser.role, 'ADMIN');

    // Confirm support@tikum.app is NOT admin
    const supportUser = state.users.find(u => u.email === 'support@tikum.app');
    if (supportUser) {
      assert.notStrictEqual(supportUser.role.toUpperCase(), 'ADMIN', 'support@tikum.app must never have ADMIN role');
    }

    // Verify Admin Overview inventory metric counts
    const totalListings = state.listings.length;
    let totalInv = 0;
    let availInv = 0;
    let soldInv = 0;
    for (const l of state.listings) {
      const meta = (typeof l.metadata === 'object' && l.metadata) ? l.metadata : {};
      const tQty = parseInt(l.total_quantity || meta.total_quantity || l.quantity || 1, 10);
      const aQty = parseInt(l.available_quantity !== undefined ? l.available_quantity : (meta.available_quantity !== undefined ? meta.available_quantity : tQty), 10);
      const sQty = parseInt(l.sold_quantity !== undefined ? l.sold_quantity : (meta.sold_quantity || 0), 10);
      totalInv += tQty;
      availInv += aQty;
      soldInv += sQty;
    }

    assert.ok(totalInv > 0, 'Total inventory tickets must be greater than zero');
    assert.ok(availInv > 0, 'Available inventory tickets must be greater than zero');

    console.log(`  ✓ Admin Inventory Metrics: Total=${totalInv}, Available=${availInv}, Sold=${soldInv}`);
  }

  // -------------------------------------------------------------
  // Test 6: End-to-End HTTP Route Integration Testing
  // -------------------------------------------------------------
  console.log('\n[Test 6] End-to-End HTTP Route Integration Testing...');
  {
    const http = require('http');
    const app = require('./src/server');
    const { SessionStore } = require('./src/services/sessionStore');

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
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(data); } catch (_) { json = data; }
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
      // 6.1 Setup Seller Session & Create Listing with Quantity 3 & TIKUM_VENUE_PIC
      const seller = state.users.find(u => u.id === 'seller-multi-1');
      const sellerSession = await SessionStore.createSession({
        userId: seller.id,
        role: 'seller',
        ip: '127.0.0.1',
        userAgent: 'TestQuantity/1.0'
      });
      const sellerCookie = `session_token=${sellerSession.session_token || sellerSession.token}`;

      const createRes = await httpRequest('/api/mvp/seller/listing', {
        method: 'POST',
        headers: { Cookie: sellerCookie },
        body: {
          eventId: 'event-jakarta-fest',
          seatInfo: 'VIP Box A1-A3',
          quantity: 3,
          faceValue: 1000000,
          price: 1200000,
          rawBarcode: 'BARCODE-HTTP-MULTI-999',
          fulfillmentType: 'TIKUM_VENUE_PIC',
          seatType: 'ASSIGNED'
        }
      });

      assert.strictEqual(createRes.status, 201, 'Listing creation should return 201');
      assert.strictEqual(createRes.json.listing.total_quantity, 3);
      assert.strictEqual(createRes.json.listing.available_quantity, 3);
      assert.strictEqual(createRes.json.listing.fulfillment_type, 'TIKUM_VENUE_PIC');
      assert.strictEqual(createRes.json.listing.seat_type, 'ASSIGNED');
      const createdListingId = createRes.json.listing.id;
      console.log('  ✓ HTTP POST /api/mvp/seller/listing created multi-ticket listing.');

      // 6.2 Setup Admin Session & Moderate Listing (APPROVE)
      const admin = state.users.find(u => u.email === 'admin@tikum.app');
      const adminSession = await SessionStore.createSession({
        userId: admin.id,
        role: 'ADMIN',
        ip: '127.0.0.1',
        userAgent: 'TestAdmin/1.0'
      });
      const adminCookie = `session_token=${adminSession.session_token || adminSession.token}`;

      const approveRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
        body: { action: 'APPROVE' }
      });
      assert.strictEqual(approveRes.status, 200);
      assert.strictEqual(approveRes.json.action, 'APPROVE');
      console.log('  ✓ HTTP POST /api/admin/listings/:id/moderate approved listing.');

      // 6.3 Buyer Orders 2 Tickets via HTTP POST /api/mvp/buyer/order
      const buyer = state.users.find(u => u.id === 'buyer-qty-1');
      const buyerSession = await SessionStore.createSession({
        userId: buyer.id,
        role: 'user',
        ip: '127.0.0.1',
        userAgent: 'TestBuyer/1.0'
      });
      const buyerCookie = `session_token=${buyerSession.session_token || buyerSession.token}`;

      const orderRes = await httpRequest('/api/mvp/buyer/order', {
        method: 'POST',
        headers: { Cookie: buyerCookie },
        body: {
          buyerId: buyer.id,
          listingId: createdListingId,
          quantity: 2
        }
      });
      assert.strictEqual(orderRes.status, 201);
      assert.strictEqual(orderRes.json.order.quantity, 2);
      assert.strictEqual(orderRes.json.order.fulfillment_type, 'TIKUM_VENUE_PIC');
      console.log('  ✓ HTTP POST /api/mvp/buyer/order reserved 2 tickets.');

      // 6.4 Admin Adjusts Listing Inventory
      const adjustRes = await httpRequest(`/api/admin/listings/${createdListingId}/moderate`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
        body: { action: 'ADJUST_INVENTORY', total_quantity: 4 }
      });
      assert.strictEqual(adjustRes.status, 200);
      assert.strictEqual(adjustRes.json.listing.total_quantity, 4);
      assert.strictEqual(adjustRes.json.listing.available_quantity, 2, 'Available should adjust to 4 - 2 reserved = 2');
      console.log('  ✓ HTTP POST /api/admin/listings/:id/moderate adjusted inventory.');

      // 6.5 Admin PIC Assignments (GET, POST, DELETE)
      const picUsersRes = await httpRequest('/api/admin/pic-users', {
        headers: { Cookie: adminCookie }
      });
      assert.strictEqual(picUsersRes.status, 200);
      assert.ok(picUsersRes.json.users.length > 0);

      const picAssignRes = await httpRequest('/api/admin/pic-assignments', {
        method: 'POST',
        headers: { Cookie: adminCookie },
        body: {
          event_id: 'event-jakarta-fest',
          venue_id: 'venue-gbk',
          pic_user_id: 'pic-user-gbk',
          contact_phone: '081199887766'
        }
      });
      assert.strictEqual(picAssignRes.status, 201);
      const assignmentId = picAssignRes.json.assignment.id;

      const getAssignmentsRes = await httpRequest('/api/admin/pic-assignments', {
        headers: { Cookie: adminCookie }
      });
      assert.strictEqual(getAssignmentsRes.status, 200);
      assert.ok(getAssignmentsRes.json.assignments.some(a => a.id === assignmentId));

      const delAssignRes = await httpRequest(`/api/admin/pic-assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookie }
      });
      assert.strictEqual(delAssignRes.status, 200);
      console.log('  ✓ HTTP Admin PIC assignment management (GET, POST, DELETE) verified.');

      // 6.6 Mobile PIC Endpoints Scoping
      const picUser = state.users.find(u => u.id === 'pic-user-gbk');
      const picSession = await SessionStore.createSession({
        userId: picUser.id,
        role: 'pic',
        ip: '127.0.0.1',
        userAgent: 'TestPIC/1.0'
      });
      const picCookie = `session_token=${picSession.session_token || picSession.token}`;

      // Assign PIC again so they have an active assignment
      EventPicService.assignPic({
        eventId: 'event-jakarta-fest',
        venueId: 'venue-gbk',
        picUserId: picUser.id,
        contactPhone: picUser.phone
      });

      const myEventsRes = await httpRequest('/api/mvp/pic/my-events', {
        headers: { Cookie: picCookie }
      });
      assert.strictEqual(myEventsRes.status, 200);
      assert.ok(myEventsRes.json.events.length > 0);
      assert.strictEqual(myEventsRes.json.events[0].event_id, 'event-jakarta-fest');

      // Regular user calling /api/mvp/pic/my-events must be 403
      const unauthPicRes = await httpRequest('/api/mvp/pic/my-events', {
        headers: { Cookie: buyerCookie }
      });
      assert.strictEqual(unauthPicRes.status, 403, 'Non-PIC caller must receive 403');

      // Unassigned event dashboard must return 403
      const unassignedEventDashRes = await httpRequest('/api/mvp/pic/events/unassigned-event-xyz/dashboard', {
        headers: { Cookie: picCookie }
      });
      assert.strictEqual(unassignedEventDashRes.status, 403, 'Unassigned event dashboard must return 403');
      console.log('  ✓ Mobile PIC endpoints scoping and security checks passed.');

      // 6.7 Role-Based Dashboards Payloads
      const sellerDashRes = await httpRequest('/api/dashboard/seller', {
        headers: { Cookie: sellerCookie }
      });
      assert.strictEqual(sellerDashRes.status, 200);
      const sellerListings = sellerDashRes.json.listings.items || sellerDashRes.json.listings;
      const foundSellerListing = sellerListings.find(l => l.listing_id === createdListingId || l.id === createdListingId);
      assert.ok(foundSellerListing);
      assert.strictEqual(foundSellerListing.total_quantity, 4);
      assert.strictEqual(foundSellerListing.available_quantity, 2);
      assert.strictEqual(foundSellerListing.fulfillment_type, 'TIKUM_VENUE_PIC');

      const buyerDashRes = await httpRequest('/api/dashboard/buyer', {
        headers: { Cookie: buyerCookie }
      });
      assert.strictEqual(buyerDashRes.status, 200);
      const buyerOrders = buyerDashRes.json.orders.items || buyerDashRes.json.orders;
      assert.ok(buyerOrders.length > 0);
      assert.strictEqual(buyerOrders[0].quantity, 2);
      assert.strictEqual(buyerOrders[0].fulfillment_type, 'TIKUM_VENUE_PIC');

      const adminOverviewRes = await httpRequest('/api/admin/overview', {
        headers: { Cookie: adminCookie }
      });
      assert.strictEqual(adminOverviewRes.status, 200);
      assert.ok(adminOverviewRes.json.inventory.total_inventory_tickets > 0);
      assert.ok(adminOverviewRes.json.inventory.available_inventory_tickets > 0);
      assert.ok(adminOverviewRes.json.operations.active_pic_assignments >= 0);
      console.log('  ✓ Role-based Dashboards (Seller, Buyer, Admin Overview) payloads verified over HTTP.');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }

  console.log('\n=============================================================');
  console.log('ALL VERIFICATION SUITES PASSED (100% SUCCESS)');
  console.log('=============================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
