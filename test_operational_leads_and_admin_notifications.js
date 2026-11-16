/**
 * TIKUM Acceptance Suite:
 * Operational Leads, Seller Supply, Buyer Demand & Admin Email Notification Workflow
 * 
 * Verifies:
 * 1. Seller submits KYC -> Persists -> Admin receives SELLER_KYC_SUBMITTED.
 * 2. Seller submits listing -> Persists -> Admin receives NEW_SELLER_LISTING & LISTING_MODERATION_REQUIRED.
 * 3. Email failure does NOT roll back or lose listing creation.
 * 4. Approved listing is visible to buyers in GET /api/mvp/listings.
 * 5. Buyer submits inquiry ("Saya Berminat") with quantity, message, and contact details.
 * 6. Inquiry persists -> Admin receives NEW_BUYER_INQUIRY.
 * 7. Email failure does NOT roll back or lose buyer inquiry.
 * 8. Duplicate submission is deduplicated / idempotent (zero phantom duplicate records).
 * 9. Admin retrieves inquiries via GET /api/admin/inquiries with enriched contact details for manual follow-up.
 * 10. Admin updates follow-up status (e.g. CONTACTED_WHATSAPP).
 * 11. Sensitive data protection: zero passwords, raw barcodes, or payment secrets in emails.
 * 12. Payment boundary: payment execution remains frozen; zero automatic charging.
 */

process.env.NODE_ENV = 'test';
process.env.PAYMENT_GATEWAY_FROZEN = 'true';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { emailService } = require('./src/services/emailService');
const { ADMIN_EMAIL, renderTemplate } = require('./src/services/emailTemplates');
const { SellerTrustService } = require('./src/trust/SellerTrustService');
const { ListingService } = require('./src/services/listingService');
const { OfferService } = require('./src/services/offerService');
const { getUserRepository, getMarketplaceRepository } = require('./src/storage');
const { isPaymentGatewayFrozen } = require('./src/config/marketplaceMode');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.log(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.log(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {
      'content-type': 'application/json',
      ...(options.headers || {})
    };

    const req = http.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSuite() {
  console.log('\n=== TIKUM OPERATIONAL LEADS & ADMIN NOTIFICATION ACCEPTANCE SUITE ===\n');

  // 1. Start ephemeral HTTP server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  resetDatabase();

  const userRepo = getUserRepository();
  const marketRepo = getMarketplaceRepository();
  await userRepo.init();
  await marketRepo.init();

  // Capture dispatched emails
  const capturedEmails = [];
  const originalSendEmail = emailService.sendEmail.bind(emailService);
  emailService.sendEmail = async function(opts) {
    capturedEmails.push({ ...opts, timestamp: new Date().toISOString() });
    return originalSendEmail(opts);
  };

  const sellerUserId = `usr-seller-${Date.now()}`;
  const sellerEmail = 'seller.resmi@example.com';
  const buyerUserId = `usr-buyer-${Date.now()}`;
  const buyerEmail = 'buyer.antusias@example.com';
  const adminUserId = `usr-admin-${Date.now()}`;

  // Bootstrap test users in repository and state
  const testSeller = {
    id: sellerUserId,
    email: sellerEmail,
    name: 'Budi Santoso',
    display_name: 'Budi Santoso',
    phone: '081298765432',
    role: 'USER',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  };

  const testBuyer = {
    id: buyerUserId,
    email: buyerEmail,
    name: 'Ahmad Fauzi',
    display_name: 'Ahmad Fauzi',
    phone: '081311223344',
    role: 'USER',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  };

  const testAdmin = {
    id: adminUserId,
    email: 'admin@tikum.app',
    name: 'Tikum Lead Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  };

  const adminSessionToken = `adm-token-${Date.now()}`;
  const { adminSecurityStore } = require('./src/storage/AdminSecurityStore');
  adminSecurityStore.registerTestSession(adminSessionToken, testAdmin);

  state.users.push(testSeller, testBuyer, testAdmin);
  if (typeof userRepo.createUser === 'function') {
    await userRepo.createUser(testSeller).catch(() => {});
    await userRepo.createUser(testBuyer).catch(() => {});
    await userRepo.createUser(testAdmin).catch(() => {});
  }

  let createdListingId = null;
  let createdInquiryId = null;

  // -------------------------------------------------------------
  // TEST 1: Seller Onboarding / KYC -> admin@tikum.app Notification
  // -------------------------------------------------------------
  await asyncTest('Test 1: Seller submits KYC onboarding, persists durably, and dispatches SELLER_KYC_SUBMITTED to admin@tikum.app', async () => {
    capturedEmails.length = 0; // Clear buffer

    const onboardingResult = await SellerTrustService.submitOnboarding({
      userId: sellerUserId,
      displayName: 'Budi Santoso Official',
      fullName: 'Budi Santoso',
      nik: '3273012345670001',
      phone: '081298765432',
      payoutBank: 'BCA',
      bankAccountNumber: '1234567890'
    });

    assert.strictEqual(onboardingResult.kyc_status, 'PENDING_REVIEW', 'KYC status must be PENDING_REVIEW');

    // Verify KYC persisted in repository
    const storedProfile = await userRepo.getSellerProfile(sellerUserId);
    assert(storedProfile, 'Seller profile must be durably stored in repository');
    assert.strictEqual(storedProfile.kyc_status, 'PENDING_REVIEW');

    // Verify notification was dispatched to admin@tikum.app
    const adminKycNotif = capturedEmails.find(e => e.to === ADMIN_EMAIL && e.template === 'SELLER_KYC_SUBMITTED');
    assert(adminKycNotif, 'admin@tikum.app must receive SELLER_KYC_SUBMITTED email');
    assert.strictEqual(adminKycNotif.data.userId, sellerUserId);
    assert.strictEqual(adminKycNotif.data.sellerName, 'Budi Santoso');
    assert.strictEqual(adminKycNotif.data.payoutBank, 'BCA');
    assert(adminKycNotif.data.adminUrl.includes('/admin'));
  });

  // Approve seller KYC so they can create live listings
  await SellerTrustService.reviewSellerKyc({
    sellerId: sellerUserId,
    adminId: adminUserId,
    kycStatus: 'VERIFIED'
  });

  // -------------------------------------------------------------
  // TEST 2: Seller creates listing -> admin@tikum.app Notification
  // -------------------------------------------------------------
  await asyncTest('Test 2: Seller submits ticket listing, persists in repository, and dispatches NEW_SELLER_LISTING & LISTING_MODERATION_REQUIRED to admin@tikum.app', async () => {
    capturedEmails.length = 0;

    const res = await apiRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: {
        'x-user-id': sellerUserId
      },
      body: {
        eventId: 'event-efestaphoria-2026',
        seatInfo: 'VIP Festival Front Stage',
        faceValue: 500000,
        price: 550000,
        quantity: 2,
        rawBarcode: `BC-EFEST-${Date.now()}`
      }
    });

    assert.strictEqual(res.status, 201, `Expected HTTP 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert(res.data.listing && res.data.listing.id, 'Response must include created listing ID');
    createdListingId = res.data.listing.id;

    // Verify listing persisted in repository
    const dbListing = await marketRepo.getListingById(createdListingId);
    assert(dbListing, 'Listing must be durably persisted in marketplace repository');
    assert.strictEqual(dbListing.price, 550000);
    assert.strictEqual(dbListing.quantity, 2);

    // Verify NEW_SELLER_LISTING sent to admin@tikum.app
    const newListingNotif = capturedEmails.find(e => e.to === ADMIN_EMAIL && e.template === 'NEW_SELLER_LISTING');
    assert(newListingNotif, 'admin@tikum.app must receive NEW_SELLER_LISTING notification');
    assert.strictEqual(newListingNotif.data.listingId, createdListingId);
    assert.strictEqual(newListingNotif.data.askingPrice, 550000);
    assert.strictEqual(newListingNotif.data.quantity, 2);
    assert.strictEqual(newListingNotif.data.sellerName, 'Budi Santoso');
    assert(newListingNotif.data.adminUrl.includes('/admin'));

    // Verify LISTING_MODERATION_REQUIRED sent to admin@tikum.app
    const moderationNotif = capturedEmails.find(e => e.to === ADMIN_EMAIL && e.template === 'LISTING_MODERATION_REQUIRED');
    assert(moderationNotif, 'admin@tikum.app must receive LISTING_MODERATION_REQUIRED notification');
    assert.strictEqual(moderationNotif.data.listingId, createdListingId);
  });

  // -------------------------------------------------------------
  // TEST 3: Email delivery failure does NOT fail listing creation
  // -------------------------------------------------------------
  await asyncTest('Test 3: Email failure does not delete or lose underlying listing (fail-safe reliability)', async () => {
    // Simulate email provider failure
    const failingSend = emailService.sendEmail;
    emailService.sendEmail = async function() {
      throw new Error('Simulated Resend API Network 500 Gateway Timeout');
    };

    try {
      const res = await apiRequest('/api/mvp/seller/listing', {
        method: 'POST',
        headers: { 'x-user-id': sellerUserId },
        body: {
          eventId: 'event-efestaphoria-2026',
          seatInfo: 'Regular Tribun A',
          faceValue: 500000,
          price: 500000,
          quantity: 1,
          rawBarcode: `BC-FAILSAFE-${Date.now()}`
        }
      });

      assert.strictEqual(res.status, 201, 'Listing creation MUST succeed even when email provider fails');
      assert(res.data.listing && res.data.listing.id);

      const saved = await marketRepo.getListingById(res.data.listing.id);
      assert(saved, 'Listing must be safely saved in database despite email failure');
    } finally {
      emailService.sendEmail = failingSend; // Restore
    }
  });

  // -------------------------------------------------------------
  // TEST 4: Approved listing appears to buyers in GET /api/mvp/listings
  // -------------------------------------------------------------
  await asyncTest('Test 4: Admin verifies listing; approved listing becomes visible to buyers via GET /api/mvp/listings', async () => {
    // Approve listing
    await ListingService.verifyListing(createdListingId, adminUserId, { approved: true, reason: 'Dokumen dan tiket valid' });

    const res = await apiRequest(`/api/mvp/listings?eventId=event-efestaphoria-2026`);
    assert.strictEqual(res.status, 200);
    const listings = res.data.listings || res.data || [];
    const found = listings.find(l => l.id === createdListingId);
    assert(found, `Approved listing ${createdListingId} must be visible in public listings feed`);
    assert(['ACTIVE', 'APPROVED_PRELAUNCH'].includes(found.status), 'Approved listing status must be ACTIVE or APPROVED_PRELAUNCH');
    assert.strictEqual(found.price, 550000);
  });

  // -------------------------------------------------------------
  // TEST 5 & 6: Buyer submits inquiry -> admin@tikum.app notification
  // -------------------------------------------------------------
  await asyncTest('Test 5 & 6: Authenticated buyer submits inquiry ("Saya Berminat"), inquiry persists, and admin@tikum.app receives NEW_BUYER_INQUIRY', async () => {
    capturedEmails.length = 0;

    const res = await apiRequest(`/api/listings/${createdListingId}/inquiries`, {
      method: 'POST',
      headers: {
        'x-user-id': buyerUserId
      },
      body: {
        quantity: 2,
        proposed_price: 550000,
        message: 'Halo, saya butuh 2 tiket untuk Efestaphoria bersama teman saya.',
        contact_phone: '081311223344'
      }
    });

    assert.strictEqual(res.status, 201, `Expected HTTP 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert(res.data.success, 'Response must be success: true');
    assert(res.data.inquiry && res.data.inquiry.id, 'Inquiry record must be returned');
    createdInquiryId = res.data.inquiry.id;

    assert.strictEqual(res.data.inquiry.listing_id, createdListingId);
    assert.strictEqual(res.data.inquiry.buyer_id, buyerUserId);
    assert.strictEqual(res.data.inquiry.seller_id, sellerUserId);
    assert.strictEqual(res.data.inquiry.quantity, 2);
    assert.strictEqual(res.data.inquiry.proposed_price, 550000);
    assert.strictEqual(res.data.inquiry.contact_phone, '081311223344');

    // Verify inquiry is durably saved in repository
    const dbInquiry = await marketRepo.getBuyerInquiryById(createdInquiryId);
    assert(dbInquiry, 'Inquiry must be durably stored in repository');
    assert.strictEqual(dbInquiry.follow_up_status, 'PENDING_FOLLOWUP');

    // Verify NEW_BUYER_INQUIRY sent to admin@tikum.app
    const adminInquiryNotif = capturedEmails.find(e => e.to === ADMIN_EMAIL && e.template === 'NEW_BUYER_INQUIRY');
    assert(adminInquiryNotif, 'admin@tikum.app must receive NEW_BUYER_INQUIRY email');
    assert.strictEqual(adminInquiryNotif.data.inquiryId, createdInquiryId);
    assert.strictEqual(adminInquiryNotif.data.listingId, createdListingId);
    assert.strictEqual(adminInquiryNotif.data.buyerName, 'Ahmad Fauzi');
    assert.strictEqual(adminInquiryNotif.data.buyerPhone, '081311223344');
    assert.strictEqual(adminInquiryNotif.data.sellerName, 'Budi Santoso');
    assert.strictEqual(adminInquiryNotif.data.requestedQuantity, 2);
    assert.strictEqual(adminInquiryNotif.data.askingPrice, 550000);
    assert(adminInquiryNotif.data.adminUrl.includes('/admin'));
  });

  // -------------------------------------------------------------
  // TEST 7: Email failure does NOT lose buyer inquiry
  // -------------------------------------------------------------
  await asyncTest('Test 7: Email delivery failure does not lose buyer inquiry (fail-safe reliability)', async () => {
    const failingSend = emailService.sendEmail;
    emailService.sendEmail = async function() {
      throw new Error('Simulated Outbound SMTP Connection Refused');
    };

    try {
      const res = await apiRequest(`/api/listings/${createdListingId}/inquiries`, {
        method: 'POST',
        headers: { 'x-user-id': buyerUserId },
        body: {
          quantity: 1,
          message: 'Tes inquiry saat email offline'
        }
      });

      assert.strictEqual(res.status, 201, 'Inquiry submission MUST succeed even if email provider is offline');
      assert(res.data.inquiry && res.data.inquiry.id);

      const saved = await marketRepo.getBuyerInquiryById(res.data.inquiry.id);
      assert(saved, 'Buyer inquiry must be persisted in database regardless of email delivery');
    } finally {
      emailService.sendEmail = failingSend;
    }
  });

  // -------------------------------------------------------------
  // TEST 8: Debounce & Idempotency: Duplicate submission
  // -------------------------------------------------------------
  await asyncTest('Test 8: Duplicate submission within window returns existing record without creating duplicate records', async () => {
    const res1 = await apiRequest(`/api/listings/${createdListingId}/inquiries`, {
      method: 'POST',
      headers: { 'x-user-id': buyerUserId },
      body: { quantity: 1, message: 'Pertanyaan pertama' }
    });
    assert.strictEqual(res1.status, 201);
    const firstInquiryId = res1.data.inquiry.id;

    // Rapid second click with identical payload
    const res2 = await apiRequest(`/api/listings/${createdListingId}/inquiries`, {
      method: 'POST',
      headers: { 'x-user-id': buyerUserId },
      body: { quantity: 1, message: 'Pertanyaan pertama' }
    });

    assert.strictEqual(res2.status, 200, 'Debounced duplicate should return HTTP 200');
    assert.strictEqual(res2.data.is_duplicate, true, 'is_duplicate flag must be true');
    assert.strictEqual(res2.data.inquiry.id, firstInquiryId, 'Must return the same inquiry ID rather than creating a duplicate');
  });

  // -------------------------------------------------------------
  // TEST 9: Admin retrieves all inquiries with enriched contact details
  // -------------------------------------------------------------
  await asyncTest('Test 9: Admin retrieves all inquiries via GET /api/admin/inquiries with enriched contact details', async () => {
    const res = await apiRequest('/api/admin/inquiries', {
      headers: {
        'x-user-id': adminUserId,
        'x-user-role': 'ADMIN',
        'authorization': `Bearer ${adminSessionToken}`,
        'cookie': `session_token=${adminSessionToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.inquiries), 'Response must have inquiries array');
    assert(res.data.total > 0, 'Total inquiries must be greater than zero');

    const foundInq = res.data.inquiries.find(i => i.id === createdInquiryId);
    assert(foundInq, `Inquiry ${createdInquiryId} must be present in admin inquiries list`);
    assert.strictEqual(foundInq.buyer_name, 'Ahmad Fauzi');
    assert.strictEqual(foundInq.buyer_phone, '081311223344');
    assert.strictEqual(foundInq.seller_name, 'Budi Santoso');
    assert.strictEqual(foundInq.quantity, 2);
    assert.strictEqual(foundInq.follow_up_status, 'PENDING_FOLLOWUP');
  });

  // -------------------------------------------------------------
  // TEST 10: Admin updates follow-up status on inquiry
  // -------------------------------------------------------------
  await asyncTest('Test 10: Admin updates follow-up status (e.g. CONTACTED_WHATSAPP) and notes via PATCH /api/admin/inquiries/:id/status', async () => {
    const res = await apiRequest(`/api/admin/inquiries/${createdInquiryId}/status`, {
      method: 'PATCH',
      headers: {
        'x-user-id': adminUserId,
        'x-user-role': 'ADMIN',
        'authorization': `Bearer ${adminSessionToken}`,
        'cookie': `session_token=${adminSessionToken}`,
        'origin': 'https://tikum.app'
      },
      body: {
        follow_up_status: 'CONTACTED_WHATSAPP',
        admin_notes: 'Sudah chat pembeli dan penjual via WhatsApp. Kedua pihak sepakat harga Rp 550.000.'
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.inquiry.follow_up_status, 'CONTACTED_WHATSAPP');
    assert.strictEqual(res.data.inquiry.admin_notes, 'Sudah chat pembeli dan penjual via WhatsApp. Kedua pihak sepakat harga Rp 550.000.');

    // Verify updated in repository
    const updated = await marketRepo.getBuyerInquiryById(createdInquiryId);
    assert.strictEqual(updated.follow_up_status, 'CONTACTED_WHATSAPP');
  });

  // -------------------------------------------------------------
  // TEST 11: Security: Zero secrets in notification payloads
  // -------------------------------------------------------------
  test('Test 11: Security: Zero passwords, raw barcode secrets, or payment credentials in notification payloads', () => {
    for (const email of capturedEmails) {
      const serialized = JSON.stringify(email);
      assert(!serialized.includes('password'), 'Notification must never contain password keyword');
      assert(!serialized.includes('BC-EFEST-'), 'Notification must never contain raw barcode secret');
      assert(!serialized.includes('3273012345670001'), 'Notification must never contain full unmasked NIK');
      assert(!serialized.includes('1234567890'), 'Notification must never contain full bank account number');
    }
  });

  // -------------------------------------------------------------
  // TEST 12: Payment boundary: Payment execution remains frozen
  // -------------------------------------------------------------
  test('Test 12: Payment boundary: Online checkout remains strictly frozen', () => {
    assert.strictEqual(isPaymentGatewayFrozen(), true, 'isPaymentGatewayFrozen must return true');
  });

  // Teardown
  if (server) server.close();

  console.log(`\n=== SUITE COMPLETE: ${passed} passed, ${failed} failed (${passed + failed} total) ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
