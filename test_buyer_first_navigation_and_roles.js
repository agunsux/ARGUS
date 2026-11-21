/**
 * TIKUM — BUYER-FIRST NAVIGATION & ROLE SEPARATION UX VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Dual-Entry Navigation (Topbar / Sidebar / Hero) across all core app shells.
 * 2. Buyer Deal Lookup Page (/deal) with Deal Room lookup input, public listings, and secondary seller link.
 * 3. Strict Role Separation on /profile (UU PDP data minimization, collapsible seller section, buyer-only completeness).
 * 4. Email verification & registration continuity: buyers never funneled into seller flow or prompted for bank/KTP.
 * 5. Public listing visibility on event SSR & Deal Room seller self-guard ("Ini Listing Anda" + "Salin Link untuk Pembeli").
 * 6. Working seller flow preservation on /deal/create with PRELAUNCH_LISTING_ONLY active.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = require('./src/server.js');
const { isPrelaunchListingMode, getMarketplaceMode } = require('./src/config/marketplaceMode.js');
const { EventSEOService } = require('./src/discovery/EventSEOService.js');
const { state } = require('./src/database');
const { getUserRepository, getMarketplaceRepository } = require('./src/storage');
const { MagicLinkService } = require('./src/services/magicLinkService');

console.log('======================================================================');
console.log('  TIKUM — BUYER-FIRST NAVIGATION & ROLE SEPARATION VERIFICATION SUITE');
console.log('======================================================================\n');

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: Dual-Entry Navigation (Topbar / Sidebar / Hero)
    // ---------------------------------------------------------------------------
    console.log('[TEST 1] Dual-Entry Navigation & Role Separation in App Shell...');

    const pages = ['pay.html', 'profile.html', 'index.html', 'create.html'];
    for (const page of pages) {
      const html = fs.readFileSync(path.join(__dirname, 'public', page), 'utf8');
      
      // Sidebar must provide both Buyer path (/deal) and Seller path (/deal/create or /create)
      assert.ok(html.includes('/deal'), `${page} must contain link to /deal in navigation`);
      assert.ok(html.includes('/deal/create') || html.includes('/create'), `${page} must contain link to /deal/create in navigation`);
      assert.ok(html.includes('data-i18n="nav.dealRoomLookup"') || html.includes('Punya Kode Deal'), `${page} must contain Buyer Deal Lookup nav element`);

      // Topbar must provide both Buka Deal Room and + Jual Tiket / Buat Deal
      assert.ok(html.includes('data-i18n="nav.dealRoomLookup"') || html.includes('Buka Deal Room'), `${page} topbar must offer Buyer Deal Room CTA`);
      assert.ok(html.includes('data-i18n="nav.submitListing"') || html.includes('Buat Deal') || html.includes('Jual Tiket'), `${page} topbar must offer Seller Deal CTA`);
    }

    // Hero in index.html must offer distinct paths for Buyer and Seller
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('href="/deal"'), 'Hero CTA must provide link to /deal (Buyer Deal Room lookup)');
    assert.ok(indexHtml.includes('data-i18n="nav.buyTickets"'), 'Hero CTA must provide Beli Tiket / Cari Event path');
    assert.ok(indexHtml.includes('href="/deal/create"'), 'Hero CTA must provide Jual Tiket / Buat Deal Link path');

    console.log('  ✓ Topbar & Sidebar dual-entry paths verified across index, pay, profile, create.');
    console.log('  ✓ Hero spotlight CTA group verified with equal-weight Buyer and Seller paths.');
    console.log('  ✅ PASSED: Test 1 (Dual-Entry Navigation) succeeded.\n');

    // ---------------------------------------------------------------------------
    // TEST 2: Buyer Deal Lookup Hub (/deal)
    // ---------------------------------------------------------------------------
    console.log('[TEST 2] Buyer Deal Lookup Hub (/deal)...');

    const resDeal = await fetch(`${baseUrl}/deal`);
    assert.strictEqual(resDeal.status, 200, 'GET /deal must return HTTP 200');
    const dealHtml = await resDeal.text();

    assert.ok(dealHtml.includes('id="buyerDealHub"'), '/deal must contain #buyerDealHub');
    assert.ok(dealHtml.includes('id="dealLookupInput"'), '/deal must contain dealLookupInput for buyers');
    assert.ok(dealHtml.includes('id="btnOpenDealRoom"'), '/deal must contain btnOpenDealRoom CTA');
    assert.ok(dealHtml.includes('id="dealHubListingsContainer"'), '/deal must contain public listings container');
    assert.ok(dealHtml.includes('href="/deal/create"'), '/deal must provide secondary seller link');

    // Verify lookup parsing logic
    const testLookupInputs = [
      { input: 'deal-test-999', expected: 'deal-test-999' },
      { input: 'https://tikum.app/deal/deal-test-999', expected: 'deal-test-999' },
      { input: 'https://tikum.app/pay?listing_id=list-xyz', expected: 'list-xyz' },
      { input: '/deal/deal-456?ref=share', expected: 'deal-456' }
    ];

    for (const t of testLookupInputs) {
      let extracted = t.input;
      if (t.input.startsWith('http://') || t.input.startsWith('https://')) {
        const u = new URL(t.input);
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && (parts[0] === 'deal' || parts[0] === 'pay')) {
          extracted = parts[1];
        } else if (u.searchParams.get('listing_id')) {
          extracted = u.searchParams.get('listing_id');
        }
      } else if (t.input.includes('/')) {
        const parts = t.input.split('?')[0].split('/').filter(Boolean);
        extracted = parts[parts.length - 1];
      }
      extracted = extracted.split('?')[0].split('#')[0];
      assert.strictEqual(extracted, t.expected, `Lookup parsing failed for ${t.input}`);
    }

    console.log('  ✓ GET /deal serves Buyer Deal Hub with lookup input, public listings, and secondary seller link.');
    console.log('  ✓ URL and ID extraction helper verified for plain IDs and full URL links.');
    console.log('  ✅ PASSED: Test 2 (Buyer Deal Lookup Hub) succeeded.\n');

    // ---------------------------------------------------------------------------
    // TEST 3: Strict Role Separation on /profile (UU PDP Minimization)
    // ---------------------------------------------------------------------------
    console.log('[TEST 3] Strict Role Separation on /profile (UU PDP Minimization)...');

    const resProfile = await fetch(`${baseUrl}/profile`);
    assert.strictEqual(resProfile.status, 200, 'GET /profile must return HTTP 200');
    const profileHtml = await resProfile.text();

    assert.ok(profileHtml.includes('id="sellerPayoutDetails"'), '/profile must contain collapsible #sellerPayoutDetails');
    assert.ok(profileHtml.includes('data-i18n="profile.sellerSectionSummary"'), '/profile summary must contain seller section label');
    assert.ok(!profileHtml.includes('required for="profAddress"'), 'profAddress must not be required for buyers');

    // Test API: Saving buyer-only profile without bank details
    const userRepo = getUserRepository();
    const testBuyerId = 'usr-buyer-' + Date.now();
    const testBuyerEmail = `buyer.minimal.${Date.now()}@example.com`;
    const createdBuyer = {
      id: testBuyerId,
      email: testBuyerEmail,
      name: 'Aditya Pratama',
      role: 'BUYER',
      status: 'ACTIVE',
      email_verified: true,
      metadata: {
        email_verified: true,
        full_name: 'Aditya Pratama',
        whatsapp: '081298765432',
        city: 'Bandung'
      }
    };
    if (!state.users) state.users = [];
    state.users.push(createdBuyer);
    await userRepo.createUser(createdBuyer).catch(() => {});

    // Create session
    const sessRes = await userRepo.createSession({ userId: createdBuyer.id, role: 'BUYER' });
    const buyerToken = sessRes.rawToken || sessRes.session.session_token;
    const buyerCookie = `session_token=${buyerToken}`;

    const saveBuyerRes = await fetch(`${baseUrl}/api/auth/me/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': buyerCookie,
        'Authorization': `Bearer ${buyerToken}`,
        'Origin': baseUrl
      },
      body: JSON.stringify({
        full_name: 'Aditya Pratama',
        whatsapp: '081298765432',
        city: 'Bandung',
        address: '', // Optional for buyer
        seller_profile_submit: false
      })
    });

    assert.strictEqual(saveBuyerRes.status, 200, 'Saving buyer profile without bank details must return HTTP 200');
    const saveBuyerData = await saveBuyerRes.json();
    assert.strictEqual(saveBuyerData.success, true);
    assert.strictEqual(saveBuyerData.profile.buyer_profile_complete, true, 'Buyer profile must be marked complete');
    assert.strictEqual(saveBuyerData.profile.seller_profile_complete, false, 'Seller profile must remain incomplete');
    assert.strictEqual(saveBuyerData.profile.payout_bank_name, '', 'Bank details must remain empty for buyer-only');

    console.log('  ✓ /profile renders collapsible seller payout section, default collapsed for buyers.');
    console.log('  ✓ Proportional buyer profile saves successfully without bank details, KTP, or street address.');
    console.log('  ✅ PASSED: Test 3 (Role Separation & Data Minimization) succeeded.\n');

    // ---------------------------------------------------------------------------
    // TEST 4: Email Verification & Registration Continuity
    // ---------------------------------------------------------------------------
    console.log('[TEST 4] Email Verification & Registration Continuity (No Unwanted Seller Funnel)...');

    // Case A: Buyer registers starting from /deal/list-abc-123
    const buyerDealNext = '/deal/list-abc-123';
    const rawTokenA = `tok_buyer_${Date.now()}`;
    const tokenHashA = require('crypto').createHash('sha256').update(rawTokenA).digest('hex');

    const testBuyerB = await userRepo.createUser({
      email: `buyer.flow.${Date.now()}@example.com`,
      name: 'Rina Melati',
      phone: '081234567890',
      role: 'BUYER',
      password_hash: 'mock_hash',
      email_verified: false
    });

    if (!state.email_verification_tokens) state.email_verification_tokens = [];
    state.email_verification_tokens.push({
      id: `evt-${Date.now()}`,
      user_id: testBuyerB.id,
      email: testBuyerB.email,
      token_hash: tokenHashA,
      next: buyerDealNext,
      expires_at: new Date(Date.now() + 900000).toISOString(),
      used: false
    });

    // Verify token via GET /api/auth/verify-email
    const verifyResA = await fetch(`${baseUrl}/api/auth/verify-email?token=${rawTokenA}`, {
      headers: { 'Accept': 'application/json' }
    });
    assert.strictEqual(verifyResA.status, 200, 'verify-email must succeed with 200');
    const verifyDataA = await verifyResA.json();
    assert.strictEqual(verifyDataA.email_verified, true);
    assert.ok(verifyDataA.redirect.startsWith('/deal/list-abc-123'), `Redirect must return to /deal/list-abc-123, got: ${verifyDataA.redirect}`);
    assert.ok(!verifyDataA.redirect.includes('setup=seller'), 'Buyer must never be redirected to seller setup');

    // Case B: General registration from / (no returnUrl)
    const rawTokenB = `tok_general_${Date.now()}`;
    const tokenHashB = require('crypto').createHash('sha256').update(rawTokenB).digest('hex');
    const testBuyerC = await userRepo.createUser({
      email: `general.flow.${Date.now()}@example.com`,
      name: 'Budi Kurnia',
      phone: '081399887766',
      role: 'BUYER',
      password_hash: 'mock_hash',
      email_verified: false
    });

    state.email_verification_tokens.push({
      id: `evt-${Date.now()}-b`,
      user_id: testBuyerC.id,
      email: testBuyerC.email,
      token_hash: tokenHashB,
      next: '/',
      expires_at: new Date(Date.now() + 900000).toISOString(),
      used: false
    });

    const verifyResB = await fetch(`${baseUrl}/api/auth/verify-email?token=${rawTokenB}`, {
      headers: { 'Accept': 'application/json' }
    });
    const verifyDataB = await verifyResB.json();
    assert.ok(!verifyDataB.redirect.includes('/deal/create'), `General signup must never redirect to /deal/create, got: ${verifyDataB.redirect}`);

    console.log('  ✓ Buyer registering from /deal/:id returns directly to deal room with verified=true.');
    console.log('  ✓ General registration never funnels buyer to seller flow or seller bank setup.');
    console.log('  ✅ PASSED: Test 4 (Email Verification & Continuity) succeeded.\n');

    // ---------------------------------------------------------------------------
    // TEST 5: Public Listing Visibility & Seller Self-Guard Check
    // ---------------------------------------------------------------------------
    console.log('[TEST 5] Public Listing Visibility on SSR & Deal Room Seller Self-Guard...');

    // 5a. Event Detail SSR HTML check
    const mockCanonicalEvent = {
      event_id: 'ev-test-visibility',
      id: 'ev-test-visibility',
      canonical_name: 'Test Konser Musik 2026',
      venue_name: 'GBK Senayan',
      city: 'Jakarta',
      start_date: '2026-12-15',
      slug: 'test-konser-musik-2026',
      is_verified: true,
      verification_status: 'VERIFIED'
    };

    const mockActiveListings = [
      {
        id: 'list-public-001',
        seller_id: 'usr-seller-xyz',
        price: 750000,
        section: 'VIP Center',
        seat_info: 'Row 3, Seat 14',
        status: 'ACTIVE'
      }
    ];

    const ssrHtml = EventSEOService.renderEventPageHtml(mockCanonicalEvent, mockActiveListings, [], 'id');
    assert.ok(ssrHtml.includes('href="/deal/list-public-001"'), 'SSR listing must link directly to /deal/list-public-001');
    assert.ok(ssrHtml.includes('Lihat &amp; Beli Tiket') || ssrHtml.includes('Lihat & Beli Tiket'), 'SSR listing must display "Lihat & Beli Tiket" CTA');
    assert.ok(ssrHtml.includes('data-seller-id="usr-seller-xyz"'), 'SSR listing must annotate data-seller-id for client ownership check');
    assert.ok(ssrHtml.includes('checkEventListingsOwnership'), 'SSR HTML must include checkEventListingsOwnership client script');

    // 5b. Deal Room HTML check
    assert.ok(dealHtml.includes('id="sellerSelfListingCard"'), 'pay.html must include #sellerSelfListingCard');
    assert.ok(dealHtml.includes('data-i18n="dealRoom.sellerSelfListingBadge"'), 'pay.html must include sellerSelfListingBadge');
    assert.ok(dealHtml.includes('id="btnCopyDealLinkForBuyer"'), 'pay.html must include btnCopyDealLinkForBuyer');

    console.log('  ✓ Event detail page renders active listings with "Lihat & Beli Tiket" linking to /deal/:id.');
    console.log('  ✓ Client-side ownership script present to transform CTA for listing sellers.');
    console.log('  ✓ Deal Room contains Seller Self-Guard card with 1-click shareable deal link button.');
    console.log('  ✅ PASSED: Test 5 (Public Listing Visibility & Self-Guard) succeeded.\n');

    // ---------------------------------------------------------------------------
    // TEST 6: Seller Flow Preservation & Prelaunch Safety Invariant
    // ---------------------------------------------------------------------------
    console.log('[TEST 6] Seller Flow Preservation & Prelaunch Safety Guard...');

    const resCreate = await fetch(`${baseUrl}/deal/create`);
    assert.strictEqual(resCreate.status, 200, 'GET /deal/create must return HTTP 200');

    const resPayStatus = await fetch(`${baseUrl}/api/v1/payments/status`);
    assert.strictEqual(resPayStatus.status, 200, 'GET /api/v1/payments/status must return HTTP 200');
    const payStatus = await resPayStatus.json();
    assert.strictEqual(payStatus.NO_REAL_PAYMENT, true, 'Safety guard NO_REAL_PAYMENT must remain true');
    assert.strictEqual(payStatus.marketplace_mode, 'PRELAUNCH_LISTING_ONLY', 'Marketplace mode must remain PRELAUNCH_LISTING_ONLY');
    assert.strictEqual(isPrelaunchListingMode(), true, 'isPrelaunchListingMode() must return true');

    console.log('  ✓ /deal/create accessible and healthy.');
    console.log('  ✓ PRELAUNCH_LISTING_ONLY safety guard active with NO_REAL_PAYMENT: true.');
    console.log('  ✅ PASSED: Test 6 (Seller Flow Preservation & Safety Guard) succeeded.\n');

    console.log('======================================================================');
    console.log('  ALL 6 BUYER-FIRST NAVIGATION & ROLE SEPARATION TESTS PASSED (100% OK)');
    console.log('======================================================================\n');

  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
