/**
 * Comprehensive verification suite for:
 * 1. ASEAN Regional Filter + Regular PIC (Jabodetabek & Bandung) classification
 * 2. Pre-Launch Ticket Waitlist API (POST /api/mvp/waitlist) with E.164/62 normalization & idempotency
 * 3. Anti-Duplicate Booking Code SHA-256 Hash Registry (POST /api/mvp/listings + POST /api/admin/tickets/check-duplicate-hash)
 * 4. Admin PIC Field Dispatch & Waitlist Demand Board (GET/POST /api/admin/operations/pic-dispatch)
 *
 * Strictly In-Memory (zero live Supabase writes).
 */
process.env.NODE_ENV = 'test';
process.env.TIKUM_FORCE_INMEMORY = 'true';

const assert = require('assert');
const http = require('http');

const picCoverage = require('./public/js/pic-coverage');
const hygiene = require('./src/discovery/CatalogHygienePolicy');
const WaitlistDispatchRepository = require('./src/storage/WaitlistDispatchRepository');
const { state } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { SessionStore } = require('./src/services/sessionStore');
const app = require('./src/server');

function httpRequest(port, { method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body !== null && body !== undefined
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : null;
    const reqHeaders = { ...headers };
    if (payload !== null && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: reqHeaders }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('[TEST] Running ASEAN Regional Filter, Waitlist, Anti-Duplicate Hash & PIC Dispatch suite...');
  WaitlistDispatchRepository.resetInMemory();

  // ---------------------------------------------------------------------------
  // 1. Unit tests: ASEAN country & Jabodetabek/Bandung regular PIC classifier
  // ---------------------------------------------------------------------------
  const fixtures = [
    { id: 'ev-test-jkt-gbk', title: 'Jakarta GBK Concert', city: 'Jakarta', venue_name: 'Stadion Utama GBK', country: 'Indonesia', expectCountry: 'ID', expectPic: true },
    { id: 'ev-test-bsd', title: 'BSD ICE Concert', city: 'Tangerang', venue_name: 'ICE BSD City', country: 'ID', expectCountry: 'ID', expectPic: true },
    { id: 'ev-test-bdg', title: 'Bandung Indie Fest', city: 'Bandung', venue_name: 'Eldorado Dome', country: 'Indonesia', expectCountry: 'ID', expectPic: true },
    { id: 'ev-test-bandungan', title: 'Bandungan Acoustic', city: 'Bandungan', venue_name: 'Candi Gedong Songo', country: 'Indonesia', expectCountry: 'ID', expectPic: false },
    { id: 'ev-test-bali', title: 'Bali Beach Festival', city: 'Bali', venue_name: 'GWK Cultural Park', country: 'Indonesia', expectCountry: 'ID', expectPic: false },
    { id: 'ev-test-lombok', title: 'MotoGP Mandalika', city: 'Lombok', venue_name: 'Mandalika Circuit', country: 'ID', expectCountry: 'ID', expectPic: false },
    { id: 'ev-test-sg', title: 'Singapore National Stadium Show', city: 'Singapore', venue_name: 'National Stadium', country: 'Singapore', expectCountry: 'SG', expectPic: false },
    { id: 'ev-test-my', title: 'Kuala Lumpur Arena Live', city: 'Kuala Lumpur', venue_name: 'Axiata Arena', country: 'MY', expectCountry: 'MY', expectPic: false },
    { id: 'ev-test-th', title: 'Bangkok Impact Tour', city: 'Bangkok', venue_name: 'IMPACT Arena', country: 'Thailand', expectCountry: 'TH', expectPic: false },
    { id: 'ev-test-ph', title: 'Manila MOA Concert', city: 'Manila', venue_name: 'SM Mall of Asia Arena', country: 'PH', expectCountry: 'PH', expectPic: false },
    { id: 'ev-test-vn', title: 'Ho Chi Minh Live Night', city: 'Ho Chi Minh City', venue_name: 'Phu Tho Stadium', country: 'Vietnam', expectCountry: 'VN', expectPic: false }
  ];

  for (const fx of fixtures) {
    const cov = picCoverage.classifyEventCoverage(fx);
    assert.strictEqual(cov.countryCode, fx.expectCountry, `Country code mismatch for ${fx.id}: got ${cov.countryCode}`);
    assert.strictEqual(cov.isRegularPicArea, fx.expectPic, `PIC regular area mismatch for ${fx.id}: got ${cov.isRegularPicArea}`);
    assert.strictEqual(hygiene.isRegularPicArea(fx), fx.expectPic, `CatalogHygienePolicy re-export mismatch for ${fx.id}`);
  }

  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[0], 'PIC_READY'), true);
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[3], 'PIC_READY'), false, 'Bandungan must NOT match PIC_READY');
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[4], 'PIC_READY'), false, 'Bali must NOT match PIC_READY');
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[4], 'ID'), true, 'Bali must match ID');
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[6], 'SG'), true, 'SG event must match SG');
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[6], 'PIC_READY'), false, 'SG event must NOT match PIC_READY');
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[9], 'PH_VN'), true, 'PH event must match PH_VN');
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[10], 'PH_VN'), true, 'VN event must match PH_VN');
  assert.strictEqual(picCoverage.matchesRegionFilter(fixtures[7], 'PH_VN'), false, 'MY event must NOT match PH_VN');
  console.log('  [PASS] 1. ASEAN country + Jabodetabek/Bandung PIC classification verified (including Bandungan negative check).');

  // Seed active upcoming test events + 1 past event into in-memory state & canonicalRegistry
  const futureDate1 = '2027-06-15';
  const futureDate2 = '2027-07-20';
  const pastDate = '2025-01-10';
  const nowIso = new Date().toISOString();

  const seededEvents = [
    {
      id: 'ev-test-jkt-live-2027',
      event_id: 'ev-test-jkt-live-2027',
      slug: 'ev-test-jkt-live-2027',
      name: 'Test Jakarta Mega Concert 2027',
      title: 'Test Jakarta Mega Concert 2027',
      canonical_name: 'Test Jakarta Mega Concert 2027',
      venue_name: 'Gelora Bung Karno',
      venue: 'Gelora Bung Karno',
      city: 'Jakarta',
      venue_city: 'Jakarta',
      country: 'Indonesia',
      category: 'CONCERT',
      event_type: 'CONCERT',
      start_date: futureDate1,
      date: futureDate1,
      min_price: 1200000,
      status: 'ON_SALE',
      lifecycle_status: 'UPCOMING',
      is_verified: true,
      public_visibility: true,
      verification_status: 'PRIMARY_SOURCE_VERIFIED',
      source_url: 'https://tikum.app/events',
      evidence_hash: 'sha256-test-jkt-2027',
      verified_at: nowIso
    },
    {
      id: 'ev-test-sg-live-2027',
      event_id: 'ev-test-sg-live-2027',
      slug: 'ev-test-sg-live-2027',
      name: 'Test Singapore Stadium Tour 2027',
      title: 'Test Singapore Stadium Tour 2027',
      canonical_name: 'Test Singapore Stadium Tour 2027',
      venue_name: 'Singapore National Stadium',
      venue: 'Singapore National Stadium',
      city: 'Singapore',
      venue_city: 'Singapore',
      country: 'Singapore',
      category: 'CONCERT',
      event_type: 'CONCERT',
      start_date: futureDate2,
      date: futureDate2,
      min_price: 1800000,
      status: 'ON_SALE',
      lifecycle_status: 'UPCOMING',
      is_verified: true,
      public_visibility: true,
      verification_status: 'PRIMARY_SOURCE_VERIFIED',
      source_url: 'https://tikum.app/events',
      evidence_hash: 'sha256-test-sg-2027',
      verified_at: nowIso
    },
    {
      id: 'ev-test-bali-live-2027',
      event_id: 'ev-test-bali-live-2027',
      slug: 'ev-test-bali-live-2027',
      name: 'Test Bali Sunset Festival 2027',
      title: 'Test Bali Sunset Festival 2027',
      canonical_name: 'Test Bali Sunset Festival 2027',
      venue_name: 'GWK Cultural Park',
      venue: 'GWK Cultural Park',
      city: 'Bali',
      venue_city: 'Bali',
      country: 'Indonesia',
      category: 'FESTIVAL',
      event_type: 'FESTIVAL',
      start_date: futureDate2,
      date: futureDate2,
      min_price: 900000,
      status: 'ON_SALE',
      lifecycle_status: 'UPCOMING',
      is_verified: true,
      public_visibility: true,
      verification_status: 'PRIMARY_SOURCE_VERIFIED',
      source_url: 'https://tikum.app/events',
      evidence_hash: 'sha256-test-bali-2027',
      verified_at: nowIso
    },
    {
      id: 'ev-test-past-2025',
      event_id: 'ev-test-past-2025',
      slug: 'ev-test-past-2025',
      name: 'Test Past Concert 2025',
      title: 'Test Past Concert 2025',
      canonical_name: 'Test Past Concert 2025',
      venue_name: 'Istora Senayan',
      venue: 'Istora Senayan',
      city: 'Jakarta',
      venue_city: 'Jakarta',
      country: 'Indonesia',
      category: 'CONCERT',
      start_date: pastDate,
      date: pastDate,
      min_price: 750000,
      status: 'ARCHIVED',
      lifecycle_status: 'PAST',
      is_verified: true,
      verification_status: 'PRIMARY_SOURCE_VERIFIED',
      source_url: 'https://tikum.app/events',
      evidence_hash: 'sha256-test-past-2025',
      verified_at: nowIso
    }
  ];

  for (const ev of seededEvents) {
    if (!state.events.some(e => e.id === ev.id)) state.events.push(ev);
    if (canonicalRegistry && typeof canonicalRegistry.upsertEvent === 'function') {
      try { canonicalRegistry.upsertEvent(ev); } catch (_) {}
    } else if (canonicalRegistry && canonicalRegistry.events instanceof Map) {
      canonicalRegistry.events.set(ev.id, ev);
    }
  }

  // Seed 2 verified sellers + 1 buyer + 1 admin with real sessions
  const seller1 = {
    id: 'usr-test-seller-1',
    name: 'Seller Satu',
    email: 'seller1@test.tikum.app',
    phone: '6281200001111',
    role: 'SELLER',
    email_verified: true,
    kyc_status: 'VERIFIED',
    seller_verified: true,
    status: 'ACTIVE',
    metadata: {
      full_name: 'Seller Satu',
      whatsapp: '6281200001111',
      address: 'Jakarta Selatan',
      payout_bank_name: 'BCA',
      payout_account_number: '1234567890',
      identity_doc_ref: 'KTP-HASH-SELLER-1'
    }
  };
  const seller2 = {
    id: 'usr-test-seller-2',
    name: 'Seller Dua',
    email: 'seller2@test.tikum.app',
    phone: '6281200002222',
    role: 'SELLER',
    email_verified: true,
    kyc_status: 'VERIFIED',
    seller_verified: true,
    status: 'ACTIVE',
    metadata: {
      full_name: 'Seller Dua',
      whatsapp: '6281200002222',
      address: 'Bandung',
      payout_bank_name: 'MANDIRI',
      payout_account_number: '0987654321',
      identity_doc_ref: 'KTP-HASH-SELLER-2'
    }
  };
  if (!state.seller_profiles) state.seller_profiles = [];
  for (const s of [seller1, seller2]) {
    if (!state.seller_profiles.some(p => p.user_id === s.id)) {
      state.seller_profiles.push({
        user_id: s.id,
        kyc_status: 'VERIFIED',
        payout_bank: s.metadata.payout_bank_name,
        payout_account_masked: '****7890',
        nik_hash: s.metadata.identity_doc_ref,
        active_listing_limit: 20,
        status: 'ACTIVE'
      });
    }
  }
  const buyer1 = {
    id: 'usr-test-buyer-1',
    name: 'Buyer Satu',
    email: 'buyer1@test.tikum.app',
    phone: '6281200003333',
    role: 'BUYER',
    email_verified: true,
    status: 'ACTIVE'
  };
  const admin1 = {
    id: 'usr-test-admin-1',
    name: 'Ops Admin',
    email: 'admin@tikum.app',
    role: 'ADMIN',
    email_verified: true,
    status: 'ACTIVE'
  };
  for (const u of [seller1, seller2, buyer1, admin1]) {
    if (!state.users.some(x => x.id === u.id)) state.users.push(u);
  }

  const s1Token = (await SessionStore.createSession({ userId: seller1.id, role: 'SELLER' })).session_token;
  const s2Token = (await SessionStore.createSession({ userId: seller2.id, role: 'SELLER' })).session_token;
  const buyerToken = (await SessionStore.createSession({ userId: buyer1.id, role: 'BUYER' })).session_token;
  const adminToken = (await SessionStore.createSession({ userId: admin1.id, role: 'ADMIN' })).session_token;
  const { adminSecurityStore } = require('./src/storage/AdminSecurityStore');
  adminSecurityStore.registerTestSession(adminToken, admin1);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    // -------------------------------------------------------------------------
    // 2. Public ASEAN Region Filter + SSR /events localization checks
    // -------------------------------------------------------------------------
    const picEventsRes = await httpRequest(port, { path: '/api/mvp/events?region=PIC_READY' });
    assert.strictEqual(picEventsRes.status, 200);
    assert(picEventsRes.json.events.some(e => e.id === 'ev-test-jkt-live-2027'), 'PIC_READY must include Jakarta event');
    assert(!picEventsRes.json.events.some(e => e.id === 'ev-test-sg-live-2027'), 'PIC_READY must exclude Singapore event');
    assert(!picEventsRes.json.events.some(e => e.id === 'ev-test-bali-live-2027'), 'PIC_READY must exclude Bali event');

    const sgEventsRes = await httpRequest(port, { path: '/api/mvp/events?region=SG' });
    assert.strictEqual(sgEventsRes.status, 200);
    assert(sgEventsRes.json.events.some(e => e.id === 'ev-test-sg-live-2027'), 'SG filter must include Singapore event');
    assert(!sgEventsRes.json.events.some(e => e.id === 'ev-test-jkt-live-2027'), 'SG filter must exclude Jakarta event');

    const ssrEventsTh = await httpRequest(port, { path: '/events?lang=th' });
    assert.strictEqual(ssrEventsTh.status, 200);
    assert(ssrEventsTh.raw.includes('<html lang="th">'), '/events?lang=th must render Thai html lang');
    assert(ssrEventsTh.raw.includes('discovery-region-pills'), '/events must render region filter bar');
    assert(ssrEventsTh.raw.includes('discoveryWaitlistModal'), '/events must include waitlist modal');
    console.log('  [PASS] 2. /api/mvp/events & SSR /events region filtering + Thai localization verified.');

    // -------------------------------------------------------------------------
    // 3. Pre-Launch Ticket Waitlist API (POST /api/mvp/waitlist)
    // -------------------------------------------------------------------------
    const wlEmpty = await httpRequest(port, { method: 'POST', path: '/api/mvp/waitlist', body: {} });
    assert.strictEqual(wlEmpty.status, 400, 'Empty waitlist payload must return 400');

    const wlBadWa = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: { event_id: 'ev-test-jkt-live-2027', contact_whatsapp: 'abc123', quantity: 2 }
    });
    assert.strictEqual(wlBadWa.status, 400);
    assert.strictEqual(wlBadWa.json.code, 'INVALID_WHATSAPP');

    const wlBadQty = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: { event_id: 'ev-test-jkt-live-2027', contact_whatsapp: '081299927378', quantity: 9 }
    });
    assert.strictEqual(wlBadQty.status, 400);
    assert.strictEqual(wlBadQty.json.code, 'INVALID_QUANTITY');

    const wlLowBudget = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: { event_id: 'ev-test-jkt-live-2027', contact_whatsapp: '081299927378', quantity: 1, max_budget_idr: 250000 }
    });
    assert.strictEqual(wlLowBudget.status, 400);
    assert.strictEqual(wlLowBudget.json.code, 'BUDGET_BELOW_MINIMUM');

    const wlNotFound = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: { event_id: 'ev-does-not-exist', contact_whatsapp: '081299927378', quantity: 1 }
    });
    assert.strictEqual(wlNotFound.status, 404);

    const wlPast = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: { event_id: 'ev-test-past-2025', contact_whatsapp: '081299927378', quantity: 1 }
    });
    assert.strictEqual(wlPast.status, 400);
    assert.strictEqual(wlPast.json.code, 'EVENT_NOT_ELIGIBLE');

    const wlCreate = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: {
        event_id: 'ev-test-jkt-live-2027',
        contact_whatsapp: '0812-9992-7378',
        seat_preference: 'CAT 1',
        quantity: 2,
        max_budget_idr: 2500000,
        locale: 'id'
      }
    });
    assert.strictEqual(wlCreate.status, 201, `Expected 201 on first waitlist submit, got ${wlCreate.status}: ${wlCreate.raw}`);
    assert.strictEqual(wlCreate.json.ok, true);
    assert.strictEqual(wlCreate.json.status, 'ACTIVE');
    assert.strictEqual(wlCreate.json.eventId, 'ev-test-jkt-live-2027');
    assert(!wlCreate.raw.includes('081299927378') && !wlCreate.raw.includes('6281299927378'), 'Public waitlist response must never echo PII');

    // Idempotent duplicate submission using +62 format -> updates existing record with HTTP 200
    const wlRepeat = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: {
        event_id: 'ev-test-jkt-live-2027',
        contact_whatsapp: '+62 812 9992 7378',
        seat_preference: 'VIP Standing',
        quantity: 3,
        max_budget_idr: 3000000,
        locale: 'en'
      }
    });
    assert.strictEqual(wlRepeat.status, 200, `Expected 200 on idempotent waitlist update, got ${wlRepeat.status}`);
    assert.strictEqual(wlRepeat.json.waitlistId, wlCreate.json.waitlistId, 'Idempotent waitlist must keep same waitlistId');

    // International buyer on Singapore event
    const wlSg = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/waitlist',
      body: {
        event_id: 'ev-test-sg-live-2027',
        contact_whatsapp: '+65 9123 4567',
        quantity: 2,
        locale: 'en'
      }
    });
    assert.strictEqual(wlSg.status, 201);
    console.log('  [PASS] 3. Pre-launch waitlist API validation, WA normalization, idempotency & PII hygiene verified.');

    // -------------------------------------------------------------------------
    // 4. Anti-Duplicate Booking Code SHA-256 Hash Registry
    // -------------------------------------------------------------------------
    const createListing1 = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/listings',
      headers: { Authorization: `Bearer ${s1Token}` },
      body: {
        eventId: 'ev-test-jkt-live-2027',
        seatInfo: 'CAT 1 Row A Seat 12',
        faceValue: 1500000,
        price: 1650000,
        quantity: 1,
        fulfillmentType: 'TIKUM_VENUE_PIC',
        bookingCode: 'TKM-2027-AB12'
      }
    });
    assert.strictEqual(createListing1.status, 201, `Seller 1 listing failed: ${createListing1.status} ${createListing1.raw}`);
    const listing1Id = createListing1.json.listing.id;
    assert(createListing1.json.listing.metadata.booking_code_hash_sha256, 'SHA-256 hash must be stored in listing metadata');
    assert.strictEqual(createListing1.json.listing.metadata.booking_code_hash_sha256.length, 64);
    assert(!createListing1.raw.includes('TKM-2027-AB12'), 'Raw booking code must NEVER be persisted or returned');

    // Seller 2 tries exact same code with lowercase/spaces/no dashes on SAME event -> 409 DUPLICATE_TICKET_DETECTED
    const dupListing = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/listings',
      headers: { Authorization: `Bearer ${s2Token}` },
      body: {
        eventId: 'ev-test-jkt-live-2027',
        seatInfo: 'CAT 1 Row B Seat 1',
        faceValue: 1500000,
        price: 1600000,
        quantity: 1,
        fulfillmentType: 'TIKUM_VENUE_PIC',
        ticketReference: '  tkm 2027 ab12  '
      }
    });
    assert.strictEqual(dupListing.status, 409, `Expected 409 for duplicate booking code, got ${dupListing.status}: ${dupListing.raw}`);
    assert.strictEqual(dupListing.json.code, 'DUPLICATE_TICKET_DETECTED');

    // Seller 2 lists SAME code on DIFFERENT event -> 201 Allowed
    const crossEventListing = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/listings',
      headers: { Authorization: `Bearer ${s2Token}` },
      body: {
        eventId: 'ev-test-sg-live-2027',
        seatInfo: 'Standing Pen A',
        faceValue: 2000000,
        price: 2200000,
        quantity: 1,
        fulfillmentType: 'SELLER_MANAGED',
        bookingCode: 'TKM-2027-AB12'
      }
    });
    assert.strictEqual(crossEventListing.status, 201, `Same booking code on distinct event should be allowed: ${crossEventListing.raw}`);

    // Seller 2 lists DIFFERENT code on SAME Jakarta event -> 201 Allowed
    const distinctCodeListing = await httpRequest(port, {
      method: 'POST',
      path: '/api/mvp/listings',
      headers: { Authorization: `Bearer ${s2Token}` },
      body: {
        eventId: 'ev-test-jkt-live-2027',
        seatInfo: 'CAT 2 Row C Seat 5',
        faceValue: 1200000,
        price: 1300000,
        quantity: 1,
        fulfillmentType: 'TIKUM_VENUE_PIC',
        bookingCode: 'TKM-2027-ZZ99'
      }
    });
    assert.strictEqual(distinctCodeListing.status, 201);

    // Admin duplicate-hash check endpoint (fail-closed unauth + authenticated check)
    const unauthHashCheck = await httpRequest(port, {
      method: 'POST',
      path: '/api/admin/tickets/check-duplicate-hash',
      body: { event_id: 'ev-test-jkt-live-2027', booking_code: 'TKM-2027-AB12' }
    });
    assert.strictEqual(unauthHashCheck.status, 401, 'Unauthenticated duplicate-hash check must return 401');

    const adminHeaders = {
      Cookie: `session_token=${adminToken}`,
      Origin: `http://127.0.0.1:${port}`
    };

    const adminHashDup = await httpRequest(port, {
      method: 'POST',
      path: '/api/admin/tickets/check-duplicate-hash',
      headers: adminHeaders,
      body: { event_id: 'ev-test-jkt-live-2027', booking_code: 'tkm-2027-ab12' }
    });
    assert.strictEqual(adminHashDup.status, 200, `Expected 200 on admin hash dup check, got ${adminHashDup.status}: ${adminHashDup.raw}`);
    assert.strictEqual(adminHashDup.json.duplicate, true);
    assert.strictEqual(adminHashDup.json.existing.listing_id, listing1Id);
    assert(!adminHashDup.raw.includes('tkm-2027-ab12'), 'Hash check response must never echo raw booking code');

    const adminHashClear = await httpRequest(port, {
      method: 'POST',
      path: '/api/admin/tickets/check-duplicate-hash',
      headers: adminHeaders,
      body: { event_id: 'ev-test-jkt-live-2027', booking_code: 'UNUSED-CODE-888' }
    });
    assert.strictEqual(adminHashClear.status, 200);
    assert.strictEqual(adminHashClear.json.duplicate, false);

    // Admin listings feed exposes booking_hash_status badge data
    const adminListingsRes = await httpRequest(port, {
      path: '/api/admin/listings?status=all',
      headers: adminHeaders
    });
    assert.strictEqual(adminListingsRes.status, 200);
    const l1Row = adminListingsRes.json.listings.find(l => l.listing_id === listing1Id);
    assert(l1Row, 'Listing 1 must appear in /api/admin/listings');
    assert.strictEqual(l1Row.booking_hash_status, 'UNIQUE_VERIFIED');
    assert.strictEqual(l1Row.booking_hash_short.length, 12);
    console.log('  [PASS] 4. Anti-duplicate SHA-256 booking code hash enforcement & admin checker verified.');

    // -------------------------------------------------------------------------
    // 5. Admin PIC Field Dispatch & Waitlist Demand Board
    // -------------------------------------------------------------------------
    const unauthDispatch = await httpRequest(port, { path: '/api/admin/operations/pic-dispatch' });
    assert.strictEqual(unauthDispatch.status, 401, 'Unauthenticated PIC dispatch GET must fail closed with 401');

    const buyerDispatch = await httpRequest(port, {
      path: '/api/admin/operations/pic-dispatch',
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    assert.strictEqual(buyerDispatch.status, 403, 'Non-admin buyer must get 403 on PIC dispatch');

    const unauthDispatchPost = await httpRequest(port, {
      method: 'POST',
      path: '/api/admin/operations/pic-dispatch/ev-test-jkt-live-2027',
      body: { dispatch_status: 'ASSIGNED' }
    });
    assert.strictEqual(unauthDispatchPost.status, 401, 'Unauthenticated PIC dispatch POST must return 401');

    const adminDispatchGet = await httpRequest(port, {
      path: '/api/admin/operations/pic-dispatch',
      headers: adminHeaders
    });
    assert.strictEqual(adminDispatchGet.status, 200);
    assert.strictEqual(adminDispatchGet.json.ok, true);
    assert(adminDispatchGet.json.regular_pic_events.some(e => e.event_id === 'ev-test-jkt-live-2027'), 'Jakarta event must be in regular_pic_events');
    assert(!adminDispatchGet.json.regular_pic_events.some(e => e.event_id === 'ev-test-sg-live-2027'), 'SG event must NOT be in regular_pic_events');
    assert(!adminDispatchGet.json.regular_pic_events.some(e => e.event_id === 'ev-test-bali-live-2027'), 'Bali event must NOT be in regular_pic_events');
    const sgOut = adminDispatchGet.json.out_of_area_events.find(e => e.event_id === 'ev-test-sg-live-2027');
    const baliOut = adminDispatchGet.json.out_of_area_events.find(e => e.event_id === 'ev-test-bali-live-2027');
    assert(sgOut && sgOut.fulfillment_policy === 'Transfer Mandiri (WA Confirm Required)');
    assert(baliOut && baliOut.fulfillment_policy === 'Transfer Mandiri (WA Confirm Required)');

    // Masked waitlist PII verification
    const jktWaitlist = adminDispatchGet.json.waitlist_demand.find(w => w.event_id === 'ev-test-jkt-live-2027');
    assert(jktWaitlist, 'Jakarta waitlist demand must appear in admin board');
    assert.strictEqual(jktWaitlist.waitlist_count, 1, 'Idempotent waitlist should count as 1 unique phone');
    assert.strictEqual(jktWaitlist.total_tickets_requested, 3, 'Updated quantity (3) must be reflected');
    assert.strictEqual(jktWaitlist.latest_requests[0].contact_whatsapp_masked, '62812****7378');
    assert(!adminDispatchGet.raw.includes('6281299927378'), 'Raw buyer WhatsApp must NEVER be exposed in admin waitlist demand');

    // Invalid status check
    const badStatusPost = await httpRequest(port, {
      method: 'POST',
      path: '/api/admin/operations/pic-dispatch/ev-test-jkt-live-2027',
      headers: adminHeaders,
      body: { dispatch_status: 'INVALID_STATUS' }
    });
    assert.strictEqual(badStatusPost.status, 400);

    // Valid PIC dispatch assignment update
    const goodDispatchPost = await httpRequest(port, {
      method: 'POST',
      path: '/api/admin/operations/pic-dispatch/ev-test-jkt-live-2027',
      headers: adminHeaders,
      body: {
        pic_officer_name: 'Raka Pratama',
        pic_officer_whatsapp: '0812-1111-2222',
        gate_meeting_point: 'Gate Barat GBK Senayan',
        standby_time_wib: '15:00 WIB',
        dispatch_status: 'ON_SITE_READY'
      }
    });
    assert.strictEqual(goodDispatchPost.status, 200);
    assert.strictEqual(goodDispatchPost.json.dispatch.dispatch_status, 'ON_SITE_READY');
    assert.strictEqual(goodDispatchPost.json.dispatch.pic_officer_whatsapp, '6281211112222');

    // Confirm persistence on subsequent GET
    const afterPostGet = await httpRequest(port, {
      path: '/api/admin/operations/pic-dispatch',
      headers: adminHeaders
    });
    const updatedJkt = afterPostGet.json.regular_pic_events.find(e => e.event_id === 'ev-test-jkt-live-2027');
    assert.strictEqual(updatedJkt.pic_officer_name, 'Raka Pratama');
    assert.strictEqual(updatedJkt.gate_meeting_point, 'Gate Barat GBK Senayan');
    assert.strictEqual(updatedJkt.standby_time_wib, '15:00 WIB');
    assert.strictEqual(updatedJkt.dispatch_status, 'ON_SITE_READY');
    console.log('  [PASS] 5. Admin PIC Field Dispatch & Waitlist Demand RBAC, masking & assignment updates verified.');

    console.log('\n✓ ALL ASEAN REGION, WAITLIST, ANTI-DUPLICATE HASH & ADMIN PIC DISPATCH TESTS PASSED!');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(err => {
  console.error('✗ TEST FAILED:', err);
  process.exit(1);
});
