/**
 * test_tikum_prelaunch_listing_mode.js
 * 
 * Comprehensive automated verification for TIKUM Pre-Launch Listing Mode:
 * 
 * 1. Configuration & Fail-Closed Guarantee (Production fail-closed, bypass prevention)
 * 2. Seller Onboarding & Management (Register, login, draft, submit, update, resubmit, withdraw)
 * 3. Multi-Seller Ownership & Isolation (Seller A cannot edit/withdraw Seller B's listings)
 * 4. Upcoming Event Collection (BigBang in January succeeds without H-7 window rejection; expired rejected)
 * 5. Admin Moderation & Lifecycle (APPROVED_PRELAUNCH, NEEDS_CORRECTION, REJECTED, self-approval prevention)
 * 6. Public Marketplace Display (APPROVED_PRELAUNCH visible with is_purchasable:false, "Belum Tersedia", prelaunch notice)
 * 7. Server-Side Transaction Blocking across all entry points:
 *    - POST /api/mvp/buyer/order -> 403 MARKETPLACE_PRELAUNCH_ONLY
 *    - POST /api/mvp/buyer/pay -> 403 MARKETPLACE_PRELAUNCH_ONLY
 *    - POST /api/v1/payments/create -> 403 MARKETPLACE_PRELAUNCH_ONLY
 *    - GET  /api/v1/payments/midtrans/client-key -> 403 MARKETPLACE_PRELAUNCH_ONLY
 *    - POST /api/offers/:offerId/accept -> 403 MARKETPLACE_PRELAUNCH_ONLY
 *    - POST /api/offers/:offerId/accept-counter -> 403 MARKETPLACE_PRELAUNCH_ONLY
 *    - POST /api/admin/transactions/:orderId/execute-payout -> 403 MARKETPLACE_PRELAUNCH_ONLY
 *    - POST /api/mvp/admin/settlements/execute -> 403 MARKETPLACE_PRELAUNCH_ONLY
 * 8. Service-Level Direct Execution Blockers:
 *    - MarketplaceOrderService.createOrderFromReservation
 *    - PaymentService.createPayment
 *    - SettlementService.executeSettlement
 *    - TransactionControlCenterService.executePayout
 * 9. Webhook and Historical Reconciliation Preservation (Webhooks not blocked)
 */

process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'PRELAUNCH_LISTING_ONLY';
process.env.ADMIN_PASSWORD = 'TestAdminPassword123!';

const assert = require('assert');
const http = require('http');
const { state, resetDatabase, bootstrapAdminUser } = require('./src/database');
const { 
  getMarketplaceMode, 
  isPrelaunchListingMode, 
  MARKETPLACE_MODES, 
  PRELAUNCH_ERROR_CODE, 
  PRELAUNCH_ERROR_MESSAGE, 
  PRELAUNCH_NOTICE_TEXT 
} = require('./src/config/marketplaceMode');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { MarketplaceOrderService } = require('./src/services/marketplace/MarketplaceOrderService');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { SettlementService } = require('./src/services/settlementService');
const { TransactionControlCenterService } = require('./src/services/admin/TransactionControlCenterService');
const { EventSEOService } = require('./src/discovery/EventSEOService');
const app = require('./src/server');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    throw err;
  }
}

async function itAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    throw err;
  }
}

async function runAllTests() {
  console.log('======================================================================');
  console.log('TIKUM PRE-LAUNCH LISTING MODE — COMPREHENSIVE AUTOMATION TEST SUITE');
  console.log('======================================================================\n');

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

  // =========================================================================
  // Section 1: Configuration & Fail-Closed Behavior
  // =========================================================================
  console.log('\n--- Section 1: Configuration & Fail-Closed Rules ---');

  it('Current mode is PRELAUNCH_LISTING_ONLY', () => {
    assert.strictEqual(getMarketplaceMode(), MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY);
    assert.strictEqual(isPrelaunchListingMode(), true);
  });

  it('Fails closed to PRELAUNCH_LISTING_ONLY in production when env is missing or invalid', () => {
    const oldEnv = process.env.NODE_ENV;
    const oldMode = process.env.MARKETPLACE_MODE;
    try {
      process.env.NODE_ENV = 'production';
      
      delete process.env.MARKETPLACE_MODE;
      assert.strictEqual(getMarketplaceMode(), MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY);

      process.env.MARKETPLACE_MODE = 'SOMETHING_INVALID';
      assert.strictEqual(getMarketplaceMode(), MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY);

      process.env.MARKETPLACE_MODE = 'LIVE';
      assert.strictEqual(getMarketplaceMode(), MARKETPLACE_MODES.LIVE);
    } finally {
      process.env.NODE_ENV = oldEnv;
      process.env.MARKETPLACE_MODE = oldMode;
    }
  });

  it('Exposes standard Indonesian error message and error code', () => {
    assert.strictEqual(PRELAUNCH_ERROR_CODE, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(
      PRELAUNCH_ERROR_MESSAGE,
      'TIKUM belum membuka transaksi. Anda dapat mengajukan listing, tetapi pembelian dan pembayaran belum tersedia.'
    );
    assert.ok(PRELAUNCH_NOTICE_TEXT.includes('TIKUM sedang dalam tahap persiapan peluncuran'));
  });

  // =========================================================================
  // Section 2: Seller Onboarding & Listing Submission (BigBang January Support)
  // =========================================================================
  console.log('\n--- Section 2: Seller Onboarding & Listing Collection ---');

  let seller1Id = 'seller-prelaunch-01';
  let seller1Cookie = '';
  let seller2Id = 'seller-prelaunch-02';
  let seller2Cookie = '';
  let draftListingId = '';
  let submittedListingId = '';
  let bigBangListingId = '';

  function upsertEvent(ev) {
    if (!state.events) state.events = [];
    const idx = state.events.findIndex(e => e.id === ev.id || e.event_id === ev.id);
    if (idx >= 0) state.events[idx] = ev;
    else state.events.push(ev);
  }

  await itAsync('Sellers can register and log in', async () => {
    // Seed upcoming test event
    upsertEvent({
      id: 'ev-test-upcoming-01',
      event_id: 'ev-test-upcoming-01',
      name: 'Upcoming Concert 2026',
      title: 'Upcoming Concert 2026',
      canonical_name: 'Upcoming Concert 2026',
      slug: 'upcoming-concert-2026',
      date: '2026-12-10',
      start_date: '2026-12-10',
      venue: 'Tennis Indoor Senayan',
      venue_name: 'Tennis Indoor Senayan',
      city: 'Jakarta',
      category: 'MUSIC',
      is_verified: true,
      verification_status: 'VERIFIED',
      source_url: 'https://promoter.example.com/events/upcoming-2026',
      evidence_hash: 'hash-provenance-001',
      verified_at: '2026-10-01T12:00:00Z'
    });

    // Register Seller 1
    const regRes1 = await httpRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'seller1.bigbang@example.com',
        password: 'Password123!',
        name: 'Budi Santoso',
        phone: '081234567891'
      }
    });
    assert.strictEqual(regRes1.status, 201);
    seller1Id = regRes1.json.user.id;

    // Login Seller 1
    const loginRes1 = await httpRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'seller1.bigbang@example.com',
        password: 'Password123!'
      }
    });
    assert.strictEqual(loginRes1.status, 200);
    const cookie1 = loginRes1.headers['set-cookie'];
    seller1Cookie = Array.isArray(cookie1) ? cookie1[0].split(';')[0] : cookie1.split(';')[0];

    // Register Seller 2
    const regRes2 = await httpRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'seller2.bigbang@example.com',
        password: 'Password123!',
        name: 'Siti Rahma',
        phone: '081234567892'
      }
    });
    assert.strictEqual(regRes2.status, 201);
    seller2Id = regRes2.json.user.id;

    // Login Seller 2
    const loginRes2 = await httpRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'seller2.bigbang@example.com',
        password: 'Password123!'
      }
    });
    assert.strictEqual(loginRes2.status, 200);
    const cookie2 = loginRes2.headers['set-cookie'];
    seller2Cookie = Array.isArray(cookie2) ? cookie2[0].split(';')[0] : cookie2.split(';')[0];
  });

  await itAsync('Seller can save a DRAFT listing', async () => {
    const res = await httpRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        sellerId: seller1Id,
        eventId: 'ev-test-upcoming-01',
        isDraft: true,
        seatInfo: 'Row A Seat 1',
        faceValue: 1500000,
        price: 1500000,
        rawBarcode: 'DRAFT-BARCODE-01',
        quantity: 1,
        notes: 'Catatan draft awal'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.DRAFT);
    draftListingId = res.json.listing.id;
  });

  await itAsync('Seller can submit a listing for review (status PENDING_VERIFICATION)', async () => {
    const res = await httpRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        sellerId: seller1Id,
        eventId: 'ev-test-upcoming-01',
        isDraft: false,
        seatInfo: 'Cat 1 Center Row B Seat 10',
        faceValue: 1200000,
        price: 1200000,
        rawBarcode: 'TIKET-ASLI-BARCODE-001',
        quantity: 1,
        notes: 'Tiket asli konser musik'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.PENDING_VERIFICATION);
    submittedListingId = res.json.listing.id;
  });

  await itAsync('Seller can list for future event like BigBang Festival without H-7 window rejection', async () => {
    // Add BigBang January 2027 upcoming event into temporal/catalog state
    const bigBangEvent = {
      id: 'ev-bigbang-2027',
      event_id: 'ev-bigbang-2027',
      name: 'BigBang Festival Jakarta 2027',
      title: 'BigBang Festival Jakarta 2027',
      canonical_name: 'BigBang Festival Jakarta 2027',
      slug: 'bigbang-festival-jakarta-2027',
      date: '2027-01-15',
      start_date: '2027-01-15',
      end_date: '2027-01-18',
      venue: 'JIExpo Kemayoran',
      venue_name: 'JIExpo Kemayoran',
      city: 'Jakarta',
      category: 'MUSIC',
      is_verified: true,
      verification_status: 'VERIFIED'
    };
    upsertEvent(bigBangEvent);

    const res = await httpRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        sellerId: seller1Id,
        eventId: 'ev-bigbang-2027',
        isDraft: false,
        seatInfo: 'Festival A Free Standing',
        faceValue: 850000,
        price: 900000,
        rawBarcode: 'BIGBANG-2027-FESTA-001',
        quantity: 1,
        notes: 'Tiket resmi BigBang Festival'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.PENDING_VERIFICATION);
    bigBangListingId = res.json.listing.id;
  });

  await itAsync('Expired past events are strictly rejected', async () => {
    const pastEvent = {
      id: 'ev-concluded-2024',
      event_id: 'ev-concluded-2024',
      name: 'Past Concert 2024',
      date: '2024-01-01',
      start_date: '2024-01-01'
    };
    upsertEvent(pastEvent);

    const res = await httpRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        sellerId: seller1Id,
        eventId: 'ev-concluded-2024',
        seatInfo: 'Cat 1 A-1',
        faceValue: 500000,
        price: 500000,
        rawBarcode: 'PAST-EVENT-BC-01',
        quantity: 1,
        notes: 'Past event ticket'
      }
    });
    assert.strictEqual(res.status, 400);
    assert.ok(
      res.json.code === 'EVENT_CONCLUDED' || 
      res.json.error.includes('concluded') || 
      res.json.error.includes('expired') || 
      res.json.error.includes('lampau') || 
      res.json.error.includes('berakhir')
    );
  });

  // =========================================================================
  // Section 3: Seller Listing Editing, Resubmission & Isolation Security
  // =========================================================================
  console.log('\n--- Section 3: Seller Editing, Resubmission & Isolation Security ---');

  await itAsync('Seller 1 can edit their DRAFT listing', async () => {
    const res = await httpRequest(`/api/mvp/seller/listings/${draftListingId}`, {
      method: 'PUT',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        seat_info: 'Row A Seat 1 (Updated)',
        price: 1600000,
        notes: 'Catatan draft diperbarui'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.listing.price, 1600000);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.DRAFT);
  });

  await itAsync('Seller 1 can resubmit their DRAFT listing to PENDING_VERIFICATION', async () => {
    const res = await httpRequest(`/api/mvp/seller/listings/${draftListingId}`, {
      method: 'PUT',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        resubmit: true,
        notes: 'Siap diverifikasi'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.PENDING_VERIFICATION);
  });

  await itAsync('Seller 2 CANNOT edit Seller 1\'s listing (Ownership Isolation Guard -> 403)', async () => {
    const res = await httpRequest(`/api/mvp/seller/listings/${draftListingId}`, {
      method: 'PUT',
      headers: {
        'x-user-id': seller2Id,
        'Cookie': seller2Cookie
      },
      body: {
        price: 100000
      }
    });
    assert.strictEqual(res.status, 403);
    assert.ok(res.json.code === 'FORBIDDEN' || res.json.error.toLowerCase().includes('penjual lain') || res.json.error.toLowerCase().includes('forbidden'));
  });

  await itAsync('Seller 2 CANNOT withdraw Seller 1\'s listing (Ownership Isolation Guard -> 403)', async () => {
    const res = await httpRequest(`/api/mvp/seller/listings/${draftListingId}/withdraw`, {
      method: 'POST',
      headers: {
        'x-user-id': seller2Id,
        'Cookie': seller2Cookie
      },
      body: {
        reason: 'Hacking attempt'
      }
    });
    assert.strictEqual(res.status, 403);
    assert.ok(res.json.code === 'FORBIDDEN' || res.json.error.toLowerCase().includes('penjual lain') || res.json.error.toLowerCase().includes('forbidden'));
  });

  await itAsync('Seller 1 can withdraw their own listing -> WITHDRAWN', async () => {
    const res = await httpRequest(`/api/mvp/seller/listings/${draftListingId}/withdraw`, {
      method: 'POST',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        reason: 'Tidak jadi dijual'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.WITHDRAWN);
  });

  // =========================================================================
  // Section 4: Admin Moderation Workflow & Status Lifecycle
  // =========================================================================
  console.log('\n--- Section 4: Admin Moderation Lifecycle ---');

  let adminCookie = '';
  await itAsync('Admin can login to moderation dashboard', async () => {
    const res = await httpRequest('/api/admin/login', {
      method: 'POST',
      body: {
        email: 'admin@tikum.app',
        password: process.env.ADMIN_PASSWORD
      }
    });
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie);
    adminCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : setCookie.split(';')[0];
  });

  await itAsync('Seller cannot approve their own listing (Self-Approval Prevention -> 403)', async () => {
    // Attempting to moderate with seller1Id as officer
    const res = await httpRequest(`/api/admin/listings/${submittedListingId}/moderate`, {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-officer-id': seller1Id
      },
      body: {
        action: 'APPROVE',
        notes: 'Self approval attempt'
      }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'CANNOT_APPROVE_OWN_LISTING');
  });

  await itAsync('Admin approves submitted listing for Pre-Launch -> APPROVED_PRELAUNCH (Not ACTIVE)', async () => {
    const res = await httpRequest(`/api/admin/listings/${submittedListingId}/moderate`, {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-officer-id': 'admin-officer-01'
      },
      body: {
        action: 'APPROVE',
        notes: 'Verifikasi bukti tiket valid untuk pre-launch'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.APPROVED_PRELAUNCH);
    assert.strictEqual(res.json.listing.is_prelaunch, true);
    assert.strictEqual(res.json.listing.is_purchasable, false);
  });

  await itAsync('Admin approval is idempotent', async () => {
    const res = await httpRequest(`/api/admin/listings/${submittedListingId}/moderate`, {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-officer-id': 'admin-officer-01'
      },
      body: {
        action: 'APPROVE_PRELAUNCH',
        notes: 'Re-verifikasi idempoten'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.APPROVED_PRELAUNCH);
  });

  await itAsync('Admin can request correction -> NEEDS_CORRECTION', async () => {
    const res = await httpRequest(`/api/admin/listings/${bigBangListingId}/moderate`, {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-officer-id': 'admin-officer-01'
      },
      body: {
        action: 'REQUEST_CORRECTION',
        notes: 'Mohon unggah bukti konfirmasi booking email yang lebih jelas'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.NEEDS_CORRECTION);
    assert.strictEqual(res.json.listing.rejection_reason, 'Mohon unggah bukti konfirmasi booking email yang lebih jelas');
  });

  await itAsync('Seller can update and resubmit listing from NEEDS_CORRECTION', async () => {
    const res = await httpRequest(`/api/mvp/seller/listings/${bigBangListingId}`, {
      method: 'PUT',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {
        resubmit: true,
        notes: 'Sudah diunggah ulang bukti booking yang jelas'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.PENDING_VERIFICATION);
  });

  await itAsync('Admin can approve resubmitted BigBang listing -> APPROVED_PRELAUNCH', async () => {
    const res = await httpRequest(`/api/admin/listings/${bigBangListingId}/moderate`, {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-officer-id': 'admin-officer-01'
      },
      body: {
        action: 'APPROVE',
        notes: 'Bukti terkonfirmasi'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.APPROVED_PRELAUNCH);
  });

  // =========================================================================
  // Section 5: Public Marketplace Experience & Pre-Launch Display
  // =========================================================================
  console.log('\n--- Section 5: Public Marketplace Discovery & Display ---');

  await itAsync('Public listings API returns APPROVED_PRELAUNCH with is_purchasable:false', async () => {
    const res = await httpRequest('/api/mvp/listings');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.marketplace_mode, 'PRELAUNCH_LISTING_ONLY');
    assert.strictEqual(res.json.is_prelaunch, true);

    const foundApproved = res.json.listings.find(l => l.id === submittedListingId);
    assert.ok(foundApproved, 'APPROVED_PRELAUNCH listing should appear in public catalog');
    assert.strictEqual(foundApproved.is_purchasable, false);
    assert.strictEqual(foundApproved.is_prelaunch, true);

    const foundWithdrawn = res.json.listings.find(l => l.id === draftListingId);
    assert.strictEqual(foundWithdrawn, undefined, 'Withdrawn/draft listings must NOT appear in public catalog');
  });

  await itAsync('Public listing detail API returns prelaunch notice and non-purchasable flags', async () => {
    const res = await httpRequest(`/api/mvp/listings/${submittedListingId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.listing.status, LISTING_STATUS.APPROVED_PRELAUNCH);
    assert.strictEqual(res.json.listing.is_purchasable, false);
    assert.strictEqual(res.json.listing.is_prelaunch, true);
    assert.strictEqual(res.json.prelaunch_notice, PRELAUNCH_NOTICE_TEXT);
  });

  it('EventSEOService renders prelaunch banner and disabled "Belum Tersedia" button in HTML', () => {
    const mockEvent = {
      id: 'ev-bigbang-2027',
      canonical_name: 'BigBang Festival 2027',
      venue_name: 'JIExpo',
      city: 'Jakarta',
      date: '2027-01-15',
      slug: 'bigbang-festival-2027'
    };
    const mockListing = {
      id: bigBangListingId,
      price: 900000,
      section: 'Festival A',
      seat_info: 'Free Standing',
      status: 'APPROVED_PRELAUNCH',
      is_purchasable: false,
      is_prelaunch: true
    };

    const html = EventSEOService.renderEventPageHtml(mockEvent, [mockListing]);
    assert.ok(html.includes('TIKUM sedang dalam tahap persiapan peluncuran.'), 'Must include Indonesian pre-launch notice');
    assert.ok(html.includes('Belum Tersedia'), 'Must include non-interactive "Belum Tersedia" button');
    assert.ok(html.includes('disabled'), 'Action button must be disabled');
    assert.ok(!html.includes('/pay?listing_id='), 'Must NOT contain live purchase checkout link');
  });

  it('EventSEOService zero-inventory state displays prelaunch seller submission CTA', () => {
    const mockEvent = {
      id: 'ev-bigbang-2027',
      canonical_name: 'BigBang Festival 2027',
      venue_name: 'JIExpo',
      city: 'Jakarta',
      date: '2027-01-15',
      slug: 'bigbang-festival-2027'
    };

    const html = EventSEOService.renderEventPageHtml(mockEvent, []);
    assert.ok(html.includes('Punya tiket untuk event ini?'), 'Must invite sellers to submit listings');
    assert.ok(html.includes('/create'), 'Must link to /create for seller submission');
    assert.ok(!html.includes('Lihat Simulasi Alur Checkout (/pay)'), 'Must not link to /pay in zero state');
  });

  // =========================================================================
  // Section 6: Comprehensive Server-Side Transaction Blocking (Every Entry Point)
  // =========================================================================
  console.log('\n--- Section 6: Server-Side Transaction Blocking (All Entry Points) ---');

  await itAsync('POST /api/mvp/buyer/order is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/mvp/buyer/order', {
      method: 'POST',
      headers: { 'x-user-id': 'buyer-test-01' },
      body: {
        listingId: submittedListingId,
        buyerId: 'buyer-test-01'
      }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('POST /api/mvp/buyer/pay is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/mvp/buyer/pay', {
      method: 'POST',
      headers: { 'x-user-id': 'buyer-test-01' },
      body: {
        orderId: 'ord-dummy-01',
        paymentMethod: 'QRIS'
      }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('POST /api/v1/payments/create is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/v1/payments/create', {
      method: 'POST',
      headers: { 'x-user-id': 'buyer-test-01' },
      body: {
        orderId: 'ord-dummy-01',
        buyer: { id: 'buyer-test-01', name: 'Buyer Test' }
      }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('GET /api/v1/payments/midtrans/client-key is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/v1/payments/midtrans/client-key');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.isAvailable, false);
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('GET /api/v1/payments/active-config reports PRELAUNCH_LISTING_ONLY', async () => {
    const res = await httpRequest('/api/v1/payments/active-config');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.marketplace_mode, 'PRELAUNCH_LISTING_ONLY');
    assert.strictEqual(res.json.is_prelaunch, true);
  });

  await itAsync('POST /api/offers/:offerId/accept is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/offers/off-dummy-01/accept', {
      method: 'POST',
      headers: {
        'x-user-id': seller1Id,
        'Cookie': seller1Cookie
      },
      body: {}
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('POST /api/offers/:offerId/accept-counter is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/offers/off-dummy-01/accept-counter', {
      method: 'POST',
      headers: {
        'x-user-id': seller2Id,
        'Cookie': seller2Cookie
      },
      body: {}
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('POST /api/admin/transactions/:orderId/execute-payout is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/admin/transactions/ord-dummy-01/execute-payout', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: { notes: 'Payout execution test' }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('POST /api/mvp/admin/settlements/execute is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/mvp/admin/settlements/execute', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: { transactionId: 'tx-dummy-01' }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  await itAsync('Legacy POST /tickets/:id/reserve is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/tickets/t-dummy-01/reserve', {
      method: 'POST',
      body: { buyerId: 'buyer-01' }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
  });

  await itAsync('Legacy POST /tickets/submit is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/tickets/submit', {
      method: 'POST',
      body: { ticketId: 't-dummy-01', eventId: 'ev-dummy', sellerId: 's-dummy', seatInfo: 'A1', price: 500000 }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
  });

  await itAsync('Legacy POST /api/admin/transfers/:id/release is blocked -> 403 MARKETPLACE_PRELAUNCH_ONLY', async () => {
    const res = await httpRequest('/api/admin/transfers/trf-dummy/release', {
      method: 'POST',
      body: { officerId: 'admin-01' }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
  });

  // =========================================================================
  // Section 7: Direct Service-Level Enforcements
  // =========================================================================
  console.log('\n--- Section 7: Direct Service-Level Method Enforcements ---');

  await itAsync('MarketplaceOrderService.createOrderFromReservation throws MARKETPLACE_PRELAUNCH_ONLY', async () => {
    await assert.rejects(async () => {
      await MarketplaceOrderService.createOrderFromReservation({
        buyerId: 'buyer-01',
        reservationId: 'res-01'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'MARKETPLACE_PRELAUNCH_ONLY');
      assert.strictEqual(err.message, PRELAUNCH_ERROR_MESSAGE);
      return true;
    });
  });

  await itAsync('PaymentService.createPayment throws MARKETPLACE_PRELAUNCH_ONLY', async () => {
    await assert.rejects(async () => {
      await PaymentService.createPayment({
        orderId: 'ord-dummy-01',
        buyer: { id: 'buyer-01' }
      });
    }, (err) => {
      assert.strictEqual(err.code, 'MARKETPLACE_PRELAUNCH_ONLY');
      assert.strictEqual(err.message, PRELAUNCH_ERROR_MESSAGE);
      return true;
    });
  });

  await itAsync('SettlementService.executeSettlement throws MARKETPLACE_PRELAUNCH_ONLY', async () => {
    await assert.rejects(async () => {
      await SettlementService.executeSettlement({
        transactionId: 'tx-dummy-01',
        actorId: 'admin-01'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'MARKETPLACE_PRELAUNCH_ONLY');
      assert.strictEqual(err.message, PRELAUNCH_ERROR_MESSAGE);
      return true;
    });
  });

  await itAsync('TransactionControlCenterService.executePayout throws MARKETPLACE_PRELAUNCH_ONLY', async () => {
    await assert.rejects(async () => {
      await TransactionControlCenterService.executePayout({
        orderId: 'ord-dummy-01',
        officerId: 'admin-01'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'MARKETPLACE_PRELAUNCH_ONLY');
      assert.strictEqual(err.message, PRELAUNCH_ERROR_MESSAGE);
      return true;
    });
  });

  // =========================================================================
  // Section 8: Client Bypass Prevention
  // =========================================================================
  console.log('\n--- Section 8: Client Bypass Resistance ---');

  await itAsync('Direct API purchase cannot be bypassed with query params, headers, or body flags', async () => {
    const res = await httpRequest('/api/mvp/buyer/order?marketplace_mode=LIVE', {
      method: 'POST',
      headers: {
        'x-user-id': 'buyer-test-01',
        'x-marketplace-mode': 'LIVE',
        'x-bypass-prelaunch': 'true'
      },
      body: {
        listingId: submittedListingId,
        buyerId: 'buyer-test-01',
        marketplace_mode: 'LIVE',
        is_prelaunch: false
      }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
    assert.strictEqual(res.json.error, PRELAUNCH_ERROR_MESSAGE);
  });

  // =========================================================================
  // Section 9: Preservation of Webhooks and Reconciliation
  // =========================================================================
  console.log('\n--- Section 9: Webhook and Historical Reconciliation Preservation ---');

  await itAsync('MVP Payment Webhook is NOT blocked by pre-launch mode', async () => {
    const res = await httpRequest('/api/mvp/payment/webhook', {
      method: 'POST',
      body: {
        orderId: 'non-existent-order',
        status: 'PAID'
      }
    });
    // Should NOT be 403 MARKETPLACE_PRELAUNCH_ONLY
    assert.notStrictEqual(res.status, 403);
  });

  await itAsync('V1 Payment Webhook is NOT blocked by pre-launch mode', async () => {
    const res = await httpRequest('/api/v1/payments/webhook/doku', {
      method: 'POST',
      headers: {
        'Client-Id': 'dummy',
        'Request-Id': 'req-123',
        'Request-Timestamp': new Date().toISOString(),
        'Signature': 'dummy'
      },
      body: {
        order: { invoice_number: 'non-existent' }
      }
    });
    // Should NOT be 403 MARKETPLACE_PRELAUNCH_ONLY
    assert.notStrictEqual(res.status, 403);
  });

  // =========================================================================
  // Section 10: Privacy & Credential Leakage Prevention
  // =========================================================================
  console.log('\n--- Section 10: Privacy & Credential Leakage Prevention ---');

  await itAsync('Public listings and listing detail endpoints strictly redact rawBarcode, NIK, and bank details', async () => {
    // 1. Check list endpoint
    const listRes = await httpRequest('/api/mvp/listings');
    assert.strictEqual(listRes.status, 200);
    for (const item of listRes.json.listings) {
      assert.strictEqual(item.rawBarcode, undefined, 'rawBarcode must not be exposed');
      assert.strictEqual(item.raw_barcode, undefined, 'raw_barcode must not be exposed');
      assert.strictEqual(item.barcode, undefined, 'barcode must not be exposed');
      assert.strictEqual(item.nik, undefined, 'nik must not be exposed');
      assert.strictEqual(item.nik_hash, undefined, 'nik_hash must not be exposed');
      assert.strictEqual(item.bank_account, undefined, 'bank_account must not be exposed');
    }

    // 2. Check single listing endpoint
    const detailRes = await httpRequest(`/api/mvp/listings/${submittedListingId}`);
    assert.strictEqual(detailRes.status, 200);
    const detail = detailRes.json.listing;
    assert.strictEqual(detail.rawBarcode, undefined, 'rawBarcode must not be exposed');
    assert.strictEqual(detail.raw_barcode, undefined, 'raw_barcode must not be exposed');
    assert.strictEqual(detail.barcode, undefined, 'barcode must not be exposed');
    assert.strictEqual(detail.nik, undefined, 'nik must not be exposed');
    assert.strictEqual(detail.nik_hash, undefined, 'nik_hash must not be exposed');
    assert.strictEqual(detail.bank_account, undefined, 'bank_account must not be exposed');
  });

  await new Promise(resolve => server.close(resolve));

  console.log('\n======================================================================');
  console.log(`TIKUM PRE-LAUNCH LISTING MODE: ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('======================================================================\n');
}

runAllTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:');
  console.error(err);
  process.exit(1);
});
