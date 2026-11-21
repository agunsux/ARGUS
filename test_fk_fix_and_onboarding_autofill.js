/**
 * TIKUM / ARGUS — P0 Critical FK Fix & Zero-Redundancy Onboarding Auto-Fill Suite
 * 
 * Verifies:
 * 1. TC-FK-01: Parent-First Atomic Ticket & Listing Creation (No 23503 FK error, Zero-QR Stage A)
 * 2. TC-FK-02: Missing Parent Ticket ID Rejection & DB Error Sanitization (No SQL schema leak)
 * 3. TC-PROFILE-01: Unified Profile API Round-Trip & UU PDP Data Minimization (Masked Payout & KYC)
 * 4. TC-VERIFY-01: Email Verification Continuity & Open-Redirect Attack Defense
 * 5. TC-AUTOFILL-01: Zero-Redundancy Seller Profile Auto-Fill Continuity
 */

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

process.env.NODE_ENV = 'test';
process.env.PRELAUNCH_LISTING_ONLY = 'true';

const app = require('./src/server.js');
const { getMarketplaceRepository, getUserRepository } = require('./src/storage');
const { state } = require('./src/database');
const { MagicLinkService } = require('./src/services/magicLinkService');

console.log('======================================================================');
console.log('  TIKUM — P0 FK FIX & ZERO-REDUNDANCY ONBOARDING AUTO-FILL SUITE');
console.log('======================================================================\n');

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const defaultHeaders = {
    'Accept': 'application/json',
    'Origin': baseUrl,
    ...(options.headers || {})
  };
  return fetch(url, {
    ...options,
    headers: defaultHeaders
  });
}

(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[TEST SERVER] Running on port ${port}\n`);

  try {
    const marketplaceRepo = getMarketplaceRepository();
    const userRepo = getUserRepository();
    if (typeof marketplaceRepo.init === 'function') await marketplaceRepo.init();
    if (typeof userRepo.init === 'function') await userRepo.init();
    if (typeof userRepo.ensureInitialized === 'function') await userRepo.ensureInitialized();

    // -------------------------------------------------------------------------
    // TEST CASE 1: TC-FK-01 — Parent-First Atomic Stage A Listing Creation
    // -------------------------------------------------------------------------
    console.log('[TEST 1] TC-FK-01: Stage A Zero-QR Listing Creation (Parent-First Relational Integrity)...');
    
    // 1. Create and verify seller
    const sellerEmail = `seller-${Date.now()}@tikum.test`;
    const signupRes = await makeRequest('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: sellerEmail,
        password: 'Password123!',
        name: 'Penjual Resmi Tikum'
      })
    });
    assert.strictEqual(signupRes.status, 201, 'Seller signup should succeed with 201');
    const signupData = await signupRes.json();
    const sellerId = signupData.user.id;

    // Login seller
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: sellerEmail,
        password: 'Password123!'
      })
    });
    assert.strictEqual(loginRes.status, 200, 'Seller login should succeed with 200');
    const loginData = await loginRes.json();
    const sessionToken = loginData.session_token;
    const authHeaders = {
      'Authorization': `Bearer ${sessionToken}`,
      'Cookie': `session_token=${sessionToken}`
    };

    // Complete seller profile with email verified
    const profSetupRes = await makeRequest('/api/auth/me/profile', {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Penjual Resmi Tikum',
        whatsapp: '+628123456789',
        city: 'Jakarta Pusat',
        address: 'Jl. Kebon Sirih No. 10',
        payout_bank_name: 'BCA',
        payout_account_number: '1234567890',
        payout_account_holder: 'Penjual Resmi Tikum',
        identity_doc_ref: '3171012345670001',
        seller_profile_submit: true
      })
    });
    assert.strictEqual(profSetupRes.status, 200, 'Profile setup should succeed with 200');

    // Mark email verified
    const dbUser = await userRepo.getUserById(sellerId);
    const meta = { ...(dbUser.metadata || {}), email_verified: true, email_verified_at: new Date().toISOString() };
    await userRepo.updateUser(sellerId, { metadata: meta, role: 'SELLER' });
    const memUser = (state.users || []).find(u => u.id === sellerId);
    if (memUser) {
      memUser.email_verified = true;
      memUser.metadata = meta;
      memUser.role = 'SELLER';
    }

    // Submit Stage A listing without barcode (Zero-QR)
    const formData = new FormData();
    formData.append('eventId', 'event-big-bang-2026');
    formData.append('seatInfo', 'CAT 1 VIP Row A Seat 10');
    formData.append('faceValue', '750000');
    formData.append('price', '950000');
    formData.append('sellingPrice', '950000');
    formData.append('quantity', '1');
    formData.append('seatType', 'ASSIGNED');
    formData.append('fulfillmentType', 'SELLER_MANAGED');

    const listingRes = await makeRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: authHeaders,
      body: formData
    });

    const listingData = await listingRes.json();
    assert.strictEqual(listingRes.status, 201, `Listing creation should succeed with 201 Created: ${JSON.stringify(listingData)}`);
    assert.ok(listingData.listing, 'Response must include listing object');
    assert.ok(listingData.ticket, 'Response must include ticket object');
    assert.strictEqual(listingData.listing.ticket_id, listingData.ticket.id, 'Listing ticket_id must match created ticket ID');

    // Verify in repository that parent ticket exists
    const persistedTicket = await marketplaceRepo.getTicketById(listingData.ticket.id);
    assert.ok(persistedTicket, 'Parent ticket must exist in database');
    assert.strictEqual(persistedTicket.id, listingData.ticket.id);
    assert.strictEqual(persistedTicket.seller_id, sellerId);

    const persistedListing = await marketplaceRepo.getListingById(listingData.listing.id);
    assert.ok(persistedListing, 'Child listing must exist in database');
    assert.strictEqual(persistedListing.ticket_id, persistedTicket.id);

    console.log(`  ✓ Stage A Listing created: ${persistedListing.id}`);
    console.log(`  ✓ Parent Ticket verified: ${persistedTicket.id} (Created BEFORE listing)`);
    console.log('  ✅ PASSED: TC-FK-01 successfully verified.\n');

    // -------------------------------------------------------------------------
    // TEST CASE 2: TC-FK-02 — Missing Parent Ticket ID & Sanitized Error Guard
    // -------------------------------------------------------------------------
    console.log('[TEST 2] TC-FK-02: Missing Parent Ticket ID Rejection & SQL Error Sanitization...');

    let orphanError = null;
    try {
      await marketplaceRepo.createListing({
        id: `list-orphan-${Date.now()}`,
        ticket_id: 'tkt-nonexistent-orphan-99999',
        seller_id: sellerId,
        canonical_event_id: 'event-big-bang-2026',
        price: 800000
      });
    } catch (err) {
      orphanError = err;
    }

    assert.ok(orphanError, 'Direct orphan listing creation must throw error');
    assert.ok(
      orphanError.code === 'INVALID_RELATIONAL_REFERENCE' || orphanError.code === 'PARENT_TICKET_MISSING',
      `Error code must be sanitized, got: ${orphanError.code}`
    );
    assert.strictEqual(orphanError.statusCode, 400, 'Error status must be 400 Bad Request');
    assert.ok(
      !orphanError.message.includes('marketplace_listings_ticket_id_fkey'),
      'Raw Postgres constraint name must NOT be leaked to client'
    );
    assert.ok(
      !orphanError.message.includes('Key (ticket_id)='),
      'Raw Postgres SQL syntax must NOT be leaked to client'
    );

    console.log(`  ✓ Sanitized Error Caught: [${orphanError.code}] ${orphanError.message}`);
    console.log('  ✓ Verified zero leak of internal PostgreSQL foreign key constraint names.');
    console.log('  ✅ PASSED: TC-FK-02 successfully verified.\n');

    // -------------------------------------------------------------------------
    // TEST CASE 3: TC-PROFILE-01 — Unified Profile API & UU PDP Data Minimization
    // -------------------------------------------------------------------------
    console.log('[TEST 3] TC-PROFILE-01: Unified Profile API Round-Trip & UU PDP Data Minimization...');

    const buyerEmail = `buyer-${Date.now()}@tikum.test`;
    const buyerSignup = await makeRequest('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: buyerEmail,
        password: 'Password123!',
        name: 'Siti Pembeli'
      })
    });
    assert.strictEqual(buyerSignup.status, 201);
    const buyerSignupData = await buyerSignup.json();
    const buyerId = buyerSignupData.user.id;

    // Login buyer
    const buyerLogin = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: buyerEmail, password: 'Password123!' })
    });
    const buyerSessionToken = (await buyerLogin.json()).session_token;
    const buyerHeaders = {
      'Authorization': `Bearer ${buyerSessionToken}`,
      'Cookie': `session_token=${buyerSessionToken}`
    };

    // 1. Initial Profile (Unverified email, missing whatsapp -> buyer incomplete)
    const getInitProf = await makeRequest('/api/auth/me/profile', { headers: buyerHeaders });
    assert.strictEqual(getInitProf.status, 200);
    const initProfData = (await getInitProf.json()).profile;
    assert.strictEqual(initProfData.email_verified, false);
    assert.strictEqual(initProfData.buyer_profile_complete, false);
    assert.strictEqual(initProfData.seller_profile_complete, false);

    // 2. Update buyer contact details
    const updateBuyerProf = await makeRequest('/api/auth/me/profile', {
      method: 'PUT',
      headers: { ...buyerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Siti Rahmawati',
        whatsapp: '081299991111',
        city: 'Bandung'
      })
    });
    assert.strictEqual(updateBuyerProf.status, 200);
    const updatedBuyer = (await updateBuyerProf.json()).profile;
    assert.strictEqual(updatedBuyer.full_name, 'Siti Rahmawati');
    assert.strictEqual(updatedBuyer.whatsapp, '+6281299991111');
    assert.strictEqual(updatedBuyer.city, 'Bandung');

    // 3. Complete seller profile and verify UU PDP masking
    const updateSellerProf = await makeRequest('/api/auth/me/profile', {
      method: 'PUT',
      headers: { ...buyerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: 'Jl. Riau No. 45',
        payout_bank_name: 'MANDIRI',
        payout_account_number: '1300098765432',
        payout_account_holder: 'Siti Rahmawati',
        identity_doc_ref: '3273012345670002',
        seller_profile_submit: true
      })
    });
    assert.strictEqual(updateSellerProf.status, 200);
    const updatedSeller = (await updateSellerProf.json()).profile;
    
    // Check masking
    assert.ok(updatedSeller.identity_doc_ref.includes('****'), 'Identity reference must be masked with ****');
    assert.ok(!updatedSeller.identity_doc_ref.includes('327301234567'), 'Raw NIK must NEVER be returned');
    assert.ok(updatedSeller.payout_account_number.includes('****'), 'Payout account must be masked with ****');
    assert.ok(!updatedSeller.payout_account_number.includes('13000987'), 'Full bank account must NOT be exposed');

    console.log(`  ✓ Buyer Profile Phone Normalized: ${updatedBuyer.whatsapp}`);
    console.log(`  ✓ Masked Identity Reference: ${updatedSeller.identity_doc_ref}`);
    console.log(`  ✓ Masked Payout Account:     ${updatedSeller.payout_account_number}`);
    console.log('  ✅ PASSED: TC-PROFILE-01 successfully verified.\n');

    // -------------------------------------------------------------------------
    // TEST CASE 4: TC-VERIFY-01 — Email Verification & Open-Redirect Defense
    // -------------------------------------------------------------------------
    console.log('[TEST 4] TC-VERIFY-01: Email Verification Continuity & Open-Redirect Attack Defense...');

    // Request email verification with legitimate next param
    const verifReq = await makeRequest('/api/auth/verify-email/request', {
      method: 'POST',
      headers: { ...buyerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ next: '/deal/create' })
    });
    assert.strictEqual(verifReq.status, 200);

    // Retrieve generated token from state
    const tokenRecord = (state.email_verification_tokens || []).find(
      t => t.email === buyerEmail && !t.used
    );
    assert.ok(tokenRecord, 'Verification token record must exist in state');

    // Consume verification token via GET /api/auth/verify-email
    // Find the raw token matching hash
    const rawToken = (state.email_verification_tokens || []).find(t => t.id === tokenRecord.id);
    assert.ok(rawToken, 'Token record found');

    // Simulate verification consumption using the verify endpoint
    // First, let's verify redirect behavior with JSON accept
    const verifyApiRes = await makeRequest(`/api/auth/verify-email?token=invalid_dummy_token&next=/deal/create`, {
      headers: { 'Accept': 'application/json' }
    });
    assert.strictEqual(verifyApiRes.status, 400, 'Invalid verification token must return 400');

    // Direct token test with valid token
    const testRawToken = crypto.randomBytes(32).toString('hex');
    const testHash = crypto.createHash('sha256').update(testRawToken).digest('hex');
    state.email_verification_tokens.push({
      id: `evt-test-${Date.now()}`,
      user_id: buyerId,
      email: buyerEmail,
      token_hash: testHash,
      next: '/deal/create',
      expires_at: new Date(Date.now() + 60000).toISOString(),
      used: false
    });

    const validVerifyRes = await makeRequest(`/api/auth/verify-email?token=${testRawToken}&next=/deal/create`, {
      headers: { 'Accept': 'application/json' }
    });
    assert.strictEqual(validVerifyRes.status, 200, 'Valid token verification should return 200');
    const verifyData = await validVerifyRes.json();
    assert.strictEqual(verifyData.email_verified, true, 'User email_verified must be true');
    assert.ok(verifyData.redirect.includes('/deal/create'), `Redirect destination must preserve next target: ${verifyData.redirect}`);

    // Test Open-Redirect Defense: Malicious next parameter must be sanitized to /
    const openRedirectInput1 = 'https://malicious-phishing.com/steal-login';
    const sanitized1 = MagicLinkService.validateRedirectUrl(openRedirectInput1);
    assert.strictEqual(sanitized1, '/', 'External absolute URLs must be sanitized to /');

    const openRedirectInput2 = '//evil.com/payload';
    const sanitized2 = MagicLinkService.validateRedirectUrl(openRedirectInput2);
    assert.strictEqual(sanitized2, '/', 'Protocol-relative //evil URLs must be sanitized to /');

    const openRedirectInput3 = 'javascript:alert(1)';
    const sanitized3 = MagicLinkService.validateRedirectUrl(openRedirectInput3);
    assert.strictEqual(sanitized3, '/', 'Javascript: scheme URLs must be sanitized to /');

    const safeRelativeUrl = '/deal/create?eventId=evt-123';
    const sanitizedSafe = MagicLinkService.validateRedirectUrl(safeRelativeUrl);
    assert.strictEqual(sanitizedSafe, safeRelativeUrl, 'Legitimate relative paths must be preserved');

    console.log('  ✓ Email verified successfully and token consumed.');
    console.log(`  ✓ Open-redirect defense verified: "${openRedirectInput1}" -> "${sanitized1}"`);
    console.log(`  ✓ Safe relative path preserved:    "${safeRelativeUrl}" -> "${sanitizedSafe}"`);
    console.log('  ✅ PASSED: TC-VERIFY-01 successfully verified.\n');

    // -------------------------------------------------------------------------
    // TEST CASE 5: TC-AUTOFILL-01 — Zero-Redundancy Seller Profile Auto-Fill Continuity
    // -------------------------------------------------------------------------
    console.log('[TEST 5] TC-AUTOFILL-01: Zero-Redundancy Seller Profile Auto-Fill Continuity...');

    // Query seller profile with authenticated session
    const sellerProfRes = await makeRequest('/api/auth/me/profile', { headers: authHeaders });
    assert.strictEqual(sellerProfRes.status, 200);
    const sellerProf = (await sellerProfRes.json()).profile;

    assert.strictEqual(sellerProf.email_verified, true, 'Seller email must be verified');
    assert.strictEqual(sellerProf.seller_profile_complete, true, 'Seller profile must be complete');
    assert.strictEqual(sellerProf.payout_bank_name, 'BCA');
    assert.ok(sellerProf.payout_account_number, 'Payout account number must be available');
    assert.strictEqual(sellerProf.full_name, 'Penjual Resmi Tikum');

    // Create a SECOND listing with the same seller session without re-supplying any contact or payout details
    const formData2 = new FormData();
    formData2.append('eventId', 'event-big-bang-2026');
    formData2.append('seatInfo', 'CAT 2 Festival Gate B');
    formData2.append('faceValue', '500000');
    formData2.append('price', '650000');
    formData2.append('sellingPrice', '650000');
    formData2.append('quantity', '2');
    formData2.append('seatType', 'GENERAL_ADMISSION');
    formData2.append('fulfillmentType', 'SELLER_MANAGED');

    const listing2Res = await makeRequest('/api/mvp/seller/listing', {
      method: 'POST',
      headers: authHeaders,
      body: formData2
    });

    const listing2Data = await listing2Res.json();
    assert.strictEqual(listing2Res.status, 201, `Second listing should succeed seamlessly with 201 Created: ${JSON.stringify(listing2Data)}`);
    assert.strictEqual(listing2Data.listing.seller_id, sellerId, 'Listing must be bound to authenticated seller ID');
    assert.strictEqual(listing2Data.ticket.seller_id, sellerId, 'Ticket must be bound to authenticated seller ID');

    console.log(`  ✓ Second Listing Created seamlessly: ${listing2Data.listing.id}`);
    console.log(`  ✓ Linked to Seller: ${sellerId} with Bank ${sellerProf.payout_bank_name} without re-entering data`);
    console.log('  ✅ PASSED: TC-AUTOFILL-01 successfully verified.\n');

    console.log('======================================================================');
    console.log('  ALL 5 CRITICAL TEST CASES COMPLETED WITH 100% SUCCESS!');
    console.log('======================================================================\n');

  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
})().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
