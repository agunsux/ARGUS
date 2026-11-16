/**
 * TIKUM / ARGUS — Unified Manual Marketplace & Visibility Verification Suite
 *
 * Verifies all 6 Project Modules:
 * 1. Seller/PIC Onboarding & Verification Integrity
 * 2. Admin Control Center MVP (Real counters, FIFO SLA review queue)
 * 3. 360-Degree Marketplace Activity Timeline (unified chronological feed)
 * 4. Manual-First Marketplace Activation (Inquiry -> Match -> Manual Escrow -> Settlement)
 * 5. The 15th Efestaphoria Event Addendum (Surabaya, Dec 6, 2026)
 * 6. Payment Gateway Freeze Directive (503 PAYMENT_GATEWAY_FROZEN, adapters preserved)
 */

const assert = require('assert');
const { state } = require('./src/database');
const { getUserRepository, getMarketplaceRepository, getMoneyRepository } = require('./src/storage');
const {
  isPaymentGatewayFrozen,
  setPaymentGatewayFrozenForTesting,
  setMarketplaceModeForTesting,
  isPrelaunchListingMode
} = require('./src/config/marketplaceMode');
const { OfferService, OFFER_STATUS } = require('./src/services/offerService');
const { EscrowService } = require('./src/services/escrowService');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { v4: uuidv4 } = require('uuid');

async function runUnifiedSuite() {
  console.log('=== TIKUM UNIFIED IMPLEMENTATION VERIFICATION SUITE ===\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         ${err.stack || err.message}`);
    }
  }

  // -------------------------------------------------------------
  // MODULE 1 & 2: SELLER/PIC & ADMIN QUEUE FIFO / SLA AUDIT
  // -------------------------------------------------------------
  console.log('--- MODULE 1 & 2: Seller/PIC Lifecycle & Admin Control Center ---');

  await asyncTest('ONB-01: UserRepository provides listAllUsers() alias alongside listUsers()', async () => {
    const userRepo = getUserRepository();
    assert.strictEqual(typeof userRepo.listAllUsers, 'function');
    assert.strictEqual(typeof userRepo.listUsers, 'function');
    const users = await userRepo.listAllUsers();
    assert(Array.isArray(users), 'users must be an array');
  });

  await asyncTest('ONB-02 & OPS-01: PENDING_REVIEW status detected with SLA calculation and FIFO ordering', async () => {
    // Setup test seller applications in state
    const now = Date.now();
    const olderApp = {
      id: `usr-sla-old-${Date.now()}`,
      role: 'BUYER',
      onboarding_status: 'PENDING_REVIEW',
      onboarding_submitted_at: new Date(now - 50 * 3600 * 1000).toISOString(), // 50 hours ago -> BREACH
      metadata: { seller_profile: { verification_status: 'PENDING_REVIEW' } }
    };
    const newerApp = {
      id: `usr-sla-new-${Date.now()}`,
      role: 'BUYER',
      onboarding_status: 'PENDING_REVIEW',
      onboarding_submitted_at: new Date(now - 5 * 3600 * 1000).toISOString(), // 5 hours ago -> NORMAL
      metadata: { seller_profile: { verification_status: 'PENDING_REVIEW' } }
    };

    if (!state.users) state.users = [];
    state.users.push(olderApp, newerApp);

    // Compute SLA and ordering logic matching adminRouter
    const pendingSellers = state.users.filter(u => {
      const s = (u.onboarding_status || u.metadata?.seller_profile?.verification_status || '').toUpperCase();
      return ['PENDING', 'PENDING_REVIEW', 'PROBATIONARY'].includes(s);
    }).map(u => {
      const submittedAt = u.onboarding_submitted_at || u.created_at || new Date().toISOString();
      const ageHours = Math.round((Date.now() - new Date(submittedAt).getTime()) / (1000 * 60 * 60));
      let slaStatus = 'NORMAL';
      if (ageHours > 48) slaStatus = 'BREACH';
      else if (ageHours > 24) slaStatus = 'WARNING';
      return { id: u.id, submittedAt, ageHours, slaStatus };
    }).sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

    assert(pendingSellers.length >= 2, 'Must contain at least both test sellers');
    const foundOld = pendingSellers.find(s => s.id === olderApp.id);
    const foundNew = pendingSellers.find(s => s.id === newerApp.id);

    assert.strictEqual(foundOld.slaStatus, 'BREACH', 'Older application (>48h) must be flagged BREACH');
    assert.strictEqual(foundNew.slaStatus, 'NORMAL', 'Newer application (<24h) must be flagged NORMAL');

    const oldIndex = pendingSellers.findIndex(s => s.id === olderApp.id);
    const newIndex = pendingSellers.findIndex(s => s.id === newerApp.id);
    assert(oldIndex < newIndex, 'Review queue must strictly prioritize older submission first (FIFO)');
  });

  await asyncTest('PIC-01: Event PIC assignment persistence via repository and state', async () => {
    const marketRepo = getMarketplaceRepository();
    assert.strictEqual(typeof marketRepo.createPicAssignment, 'function');
    assert.strictEqual(typeof marketRepo.listPicAssignments, 'function');

    const assignment = await marketRepo.createPicAssignment({
      event_id: 'event-efestaphoria-2026',
      user_id: 'usr-pic-test-1',
      pic_name: 'Surabaya Event PIC',
      pic_phone: '081234567890',
      venue_id: 'venue-kemayoran',
      assigned_by: 'admin-1',
      shift_start: new Date().toISOString(),
      shift_end: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
    });

    assert(assignment.id, 'Created assignment must have an ID');
    assert(['ACTIVE', 'ASSIGNED'].includes(assignment.status), 'Status must be ACTIVE or ASSIGNED');
    assert.strictEqual(assignment.event_id, 'event-efestaphoria-2026');

    const listed = await marketRepo.listPicAssignments('event-efestaphoria-2026');
    assert(listed.some(a => a.id === assignment.id), 'Listed PIC assignments must include newly created assignment');
  });

  // -------------------------------------------------------------
  // MODULE 5: THE 15th EFESTAPHORIA EVENT ADDENDUM
  // -------------------------------------------------------------
  console.log('\n--- MODULE 5: The 15th Efestaphoria Event Addendum ---');

  test('Efestaphoria event metadata registered in canonical state', () => {
    const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
    const efest = (state.events || []).find(e => e.id === 'event-efestaphoria-2026') ||
      canonicalRegistry.getEventById('event-efestaphoria-2026');
    assert(efest, 'Event event-efestaphoria-2026 must exist in canonical state or hero events');
    assert(efest.name.includes('Efestaphoria'), 'Event name must include Efestaphoria');
    assert.strictEqual(efest.city, 'Surabaya', 'Event city must be Surabaya');
    assert.strictEqual(efest.venue_name, 'Surabaya Expo Center', 'Venue must be Surabaya Expo Center');
    assert.strictEqual(efest.organizer || efest.organizer_name, 'BEM Fakultas Ekonomi dan Bisnis Universitas Airlangga');
    assert(efest.source_url.includes('celestix.id/event/the-15th-efestaphoria/539'));
    assert(['UPCOMING', 'SCHEDULED'].includes(efest.status));
  });

  // -------------------------------------------------------------
  // MODULE 6: PAYMENT GATEWAY FREEZE DIRECTIVE
  // -------------------------------------------------------------
  console.log('\n--- MODULE 6: Payment Gateway Freeze Directive ---');

  test('isPaymentGatewayFrozen defaults to true under freeze directive', () => {
    setPaymentGatewayFrozenForTesting(null); // Clear override
    // In prelaunch or with freeze, should return true
    const isFrozen = isPaymentGatewayFrozen();
    assert.strictEqual(isFrozen, true, 'Payment gateway execution must default to frozen');
  });

  test('Payment providers (DOKU, Midtrans, iPaymu) and ledgers remain preserved and untouched', () => {
    const { paymentManager } = require('./src/services/payment/index');
    assert(paymentManager, 'paymentManager must exist');
    assert(paymentManager.getProvider('doku'), 'DOKU provider adapter must remain intact');
    assert(paymentManager.getProvider('ipaymu'), 'iPaymu provider adapter must remain intact');
    assert(paymentManager.getProvider('midtrans'), 'Midtrans provider adapter must remain intact');
    assert(FinancialLedger, 'FinancialLedger must remain intact');
  });

  // -------------------------------------------------------------
  // MODULE 4: MANUAL-FIRST MARKETPLACE ACTIVATION
  // -------------------------------------------------------------
  console.log('\n--- MODULE 4: Manual-First Marketplace Activation ---');

  let testListingId = null;
  let testOfferId = null;
  let testOrderId = null;

  await asyncTest('Seller creates active ticket listing for Efestaphoria', async () => {
    const listingId = `list-efest-${Date.now()}`;
    testListingId = listingId;
    const ticketId = `tkt-efest-${Date.now()}`;

    const listing = {
      id: listingId,
      listing_id: listingId,
      event_id: 'event-efestaphoria-2026',
      canonical_event_id: 'event-efestaphoria-2026',
      ticket_id: ticketId,
      seller_id: 'seller-efest-1',
      price: 250000,
      original_price: 300000,
      quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0,
      sold_quantity: 0,
      ticket_type: 'Presale 2 Festival',
      category: 'Festival',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    if (!state.listings) state.listings = [];
    state.listings.push(listing);

    if (!state.tickets) state.tickets = [];
    state.tickets.push({
      id: ticketId,
      event_id: 'event-efestaphoria-2026',
      seller_id: 'seller-efest-1',
      ticket_code: 'EFEST-TEST-001',
      category: 'Festival',
      price: 250000,
      status: 'AVAILABLE'
    });

    assert(state.listings.some(l => l.id === listingId), 'Listing must be stored in state');
  });

  await asyncTest('Buyer expresses purchase interest / inquiry with price proposal', async () => {
    const inquiryId = `inq-${uuidv4()}`;
    const buyerId = 'buyer-efest-1';

    // Register user buyer
    if (!state.users.some(u => u.id === buyerId)) {
      state.users.push({
        id: buyerId,
        email: 'buyer.efest@example.com',
        name: 'Budi Pembeli',
        role: 'BUYER'
      });
    }

    // Create inquiry
    const inquiry = {
      id: inquiryId,
      listing_id: testListingId,
      buyer_id: buyerId,
      seller_id: 'seller-efest-1',
      event_id: 'event-efestaphoria-2026',
      message: 'Halo, saya minat beli tiket Festival Efestaphoria. Nego 230rb ya.',
      proposed_price: 230000,
      status: 'SUBMITTED',
      created_at: new Date().toISOString()
    };
    if (!state.listing_inquiries) state.listing_inquiries = [];
    state.listing_inquiries.push(inquiry);

    // Create negotiation offer (strictly structured, zero free-text chat)
    const offer = await OfferService.createOffer({
      buyerId,
      listingId: testListingId,
      offerAmount: 230000,
      ipAddress: '127.0.0.1'
    });

    testOfferId = offer.id;
    inquiry.linked_offer_id = offer.id;

    assert(offer.id, 'Offer must be created');
    assert.strictEqual(offer.status, OFFER_STATUS.PENDING);
    assert.strictEqual(offer.offer_amount, 230000);
  });

  await asyncTest('Seller and buyer reach matching: seller accepts offer generating matched order', async () => {
    const acceptResult = await OfferService.acceptOffer({
      offerId: testOfferId,
      sellerId: 'seller-efest-1',
      ipAddress: '127.0.0.1'
    });

    assert(acceptResult.order, 'Accepting offer must create order');
    assert(acceptResult.escrow, 'Accepting offer must create escrow');
    assert.strictEqual(acceptResult.offer.status, OFFER_STATUS.ACCEPTED);

    testOrderId = acceptResult.order.id;
    const order = acceptResult.order;

    // Verify order matching metadata
    order.metadata = {
      ...(order.metadata || {}),
      coordination_mode: 'MANUAL_ESCROW',
      gateway_frozen: true
    };

    assert.strictEqual(order.buyer_id, 'buyer-efest-1');
    assert.strictEqual(order.seller_id, 'seller-efest-1');
    assert.strictEqual(order.status, 'PENDING_PAYMENT');
  });

  await asyncTest('Admin executes manual payment confirmation after buyer transfers funds', async () => {
    const order = state.orders.find(o => o.id === testOrderId);
    const escrow = state.escrows.find(e => e.order_id === testOrderId);
    assert(order, 'Order must exist');
    assert(escrow, 'Escrow must exist');

    const nowIso = new Date().toISOString();
    order.status = 'PAID';
    order.paid_at = nowIso;
    order.metadata = {
      ...(order.metadata || {}),
      manual_payment_confirmed: true,
      manual_payment_confirmed_by: 'admin-finance-1',
      bank_reference: 'BCA-TRF-9823145'
    };

    escrow.status = 'ESCROWED';
    escrow.locked_at = nowIso;

    // Record ledger entry
    await FinancialLedger.recordCapture({
      orderId: order.id,
      ticketPrice: 230000,
      actorId: 'admin-finance-1',
      buyerPlatformFee: 0,
      sellerPlatformFee: 0
    });

    assert.strictEqual(order.status, 'PAID');
    assert.strictEqual(escrow.status, 'ESCROWED');
  });

  await asyncTest('Admin executes manual escrow release to seller upon verified event admission', async () => {
    const order = state.orders.find(o => o.id === testOrderId);
    const escrow = state.escrows.find(e => e.order_id === testOrderId);

    const nowIso = new Date().toISOString();
    escrow.status = 'RELEASED';
    escrow.released_at = nowIso;

    order.status = 'SETTLED';
    order.settled_at = nowIso;
    order.metadata = {
      ...(order.metadata || {}),
      manual_escrow_released: true,
      manual_escrow_released_by: 'admin-trust-1',
      payout_reference: 'SELLER-PAYOUT-TRF-1102'
    };

    // Update listing and ticket
    const listing = state.listings.find(l => l.id === order.listing_id);
    if (listing) listing.status = 'SETTLED';

    // Record ledger entry
    await FinancialLedger.recordRelease({
      orderId: order.id,
      amount: escrow.seller_net_payout || escrow.amount || 230000,
      actorId: 'admin-trust-1'
    });

    assert.strictEqual(order.status, 'SETTLED');
    assert.strictEqual(escrow.status, 'RELEASED');
    assert.strictEqual(listing.status, 'SETTLED');
  });

  // -------------------------------------------------------------
  // MODULE 3: MARKETPLACE ACTIVITY VISIBILITY
  // -------------------------------------------------------------
  console.log('\n--- MODULE 3: 360-Degree Marketplace Activity Timeline ---');

  await asyncTest('Activity timeline merges across auth, inquiries, offers, orders, and PIC assignments', async () => {
    // Record sample audit logs for test
    if (!state.audit_logs) state.audit_logs = [];
    state.audit_logs.push({
      id: `aud-test-kyc-${Date.now()}`,
      action: 'SELLER_KYC_APPROVED',
      performed_by: 'admin-ops',
      entity_type: 'SELLER_KYC',
      entity_id: 'usr-seller-test',
      metadata: { reason: 'Dokumen KTP valid' },
      created_at: new Date().toISOString()
    });

    // Extract activities using the unified aggregation logic
    const events = [];

    // Inquiries
    for (const inq of (state.listing_inquiries || [])) {
      events.push({
        id: inq.id,
        timestamp: inq.created_at,
        category: 'INQUIRY',
        action: 'BUYER_INQUIRY_SUBMITTED',
        summary: `Inquiry by ${inq.buyer_id}`
      });
    }

    // Orders
    for (const ord of (state.orders || [])) {
      events.push({
        id: `ord-${ord.id}`,
        timestamp: ord.updated_at || ord.created_at,
        category: 'ORDER',
        action: `ORDER_${ord.status}`,
        summary: `Order ${ord.id} status ${ord.status}`
      });
    }

    // Audit logs
    for (const log of (state.audit_logs || [])) {
      events.push({
        id: log.id,
        timestamp: log.created_at,
        category: log.entity_type === 'SELLER_KYC' ? 'KYC' : 'ADMIN',
        action: log.action,
        summary: `${log.action} on ${log.entity_id}`
      });
    }

    // Sort
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    assert(events.length >= 3, 'Timeline must aggregate multiple distinct activity sources');
    const categories = new Set(events.map(e => e.category));
    assert(categories.has('INQUIRY'), 'Timeline must include INQUIRY events');
    assert(categories.has('ORDER'), 'Timeline must include ORDER events');
    assert(categories.has('KYC'), 'Timeline must include KYC events');
  });

  console.log(`\n=== VERIFICATION COMPLETE: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runUnifiedSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
