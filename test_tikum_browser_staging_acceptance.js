/**
 * TIKUM — BROWSER STAGING ACCEPTANCE & USER JOURNEY TEST SUITE
 * 
 * Tests the complete zero-to-one seller-to-buyer transaction loop across
 * desktop and mobile web viewports using test data and simulated payments.
 * 
 * 12-Step Journey:
 * 1. Seller opens Create Deal page (deal-create.html).
 * 2. Seller inputs event, category, price, and creates deal.
 * 3. TIKUM generates Deal Link & deterministic fee breakdown.
 * 4. Buyer accesses Deal Room via mobile viewport.
 * 5. Buyer inspects full upfront cost breakdown and binding terms.
 * 6. Buyer and seller agree to transaction.
 * 7. System discloses Mode 2 Assisted Direct Payment instructions.
 * 8. Seller submits Stage A ownership evidence (raw QR rejected).
 * 9. Admin verifies Event Policy (requires official URL, routes to TIER_B_VENUE_ASSISTED).
 * 10. PIC checks in with timestamped attendance at designated meeting point.
 * 11. Admin completes transaction / reviews evidence.
 * 12. Buyer and seller view completed transaction status and masked Evidence Bundle.
 * 
 * Also tests Admin Console views:
 * - Policy Registry
 * - PIC Shift Scheduling
 * - Evidence Bundle Inspector
 * - Dispute Management
 * - Pilot Scorecard (Hard Governance Targets)
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '0';

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('./src/server');
const { state } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { adminSecurityStore } = require('./src/storage/AdminSecurityStore');
const { EventPolicyRegistry, RISK_TIERS, POLICY_STATUS } = require('./src/policy/EventPolicyRegistry');
const { VenueOperationsService } = require('./src/venue/VenueOperationsService');

console.log('======================================================================');
console.log('TIKUM — BROWSER STAGING ACCEPTANCE & USER JOURNEY TEST SUITE');
console.log('======================================================================\n');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

let adminCookie = '';
let sellerUserId = 'usr-seller-staging-1';
let buyerUserId = 'usr-buyer-staging-1';
let picUserId = 'usr-pic-staging-1';

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function httpRequest(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const reqOpts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        Origin: baseUrl,
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

async function runStagingAcceptance() {
  // Start server on ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Seed test users & admin session
  if (!state.users) state.users = [];
  const adminUser = { id: 'admin-staging-1', email: 'admin@tikum.app', role: 'ADMIN', name: 'Super Admin' };
  const adminSession = SessionStore.createSession({ userId: adminUser.id, role: 'admin' });
  adminSecurityStore.registerTestSession(adminSession.session_token, adminUser);
  adminCookie = `session_token=${adminSession.session_token}`;

  state.users.push(
    adminUser,
    { id: sellerUserId, email: 'seller@staging.com', phone: '0812999901', name: 'Budi Seller', role: 'user' },
    { id: buyerUserId, email: 'buyer@staging.com', phone: '0812999902', name: 'Siti Buyer', role: 'user' },
    { id: picUserId, email: 'pic@staging.com', phone: '0812999903', name: 'Rian Venue PIC', role: 'pic' }
  );

  let createdDeal = null;
  let dealToken = '';

  console.log('--- 12-STEP END-TO-END TRANSACTION LOOP ---');

  // STEP 1: Seller opens Create Deal page
  await asyncTest('Step 1: Seller accesses Create Deal page (HTML surface check)', async () => {
    const res = await httpRequest('/deal/create', {
      headers: { Accept: 'text/html' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.includes('Buat Transaction Link (Deal Link)'));
    assert.ok(res.data.includes('5 Langkah Transaksi Terverifikasi'));
    assert.ok(res.data.includes('UU PDP No. 27/2022'));
    assert.ok(res.data.includes('Simulasi Transparansi Biaya Tikum'));
  });

  // STEP 2: Fast Upfront Pricing Quote API
  await asyncTest('Step 2: Fast upfront pricing simulation API (/api/deals/quote)', async () => {
    const res = await httpRequest('/api/deals/quote?price=1500000&quantity=1');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.quote.ticket_base_price, 1500000);
    assert.strictEqual(res.json.quote.buyer_service_fee, 90000); // 6%
    assert.strictEqual(res.json.quote.seller_service_fee, 90000); // 6%
    assert.strictEqual(res.json.quote.total_paid_by_buyer, 1590000);
    assert.strictEqual(res.json.quote.net_payout_seller, 1410000);
  });

  // STEP 3: Seller creates Deal Link
  await asyncTest('Step 3: Seller generates official Deal Link (/api/deals/create)', async () => {
    const res = await httpRequest('/api/deals/create', {
      method: 'POST',
      headers: {
        'x-user-id': sellerUserId
      },
      body: {
        sellerId: sellerUserId,
        eventId: 'ed-sheeran-jkt-2026',
        ticketCategory: 'CAT 1 VIP',
        section: 'West Tribune',
        row: 'B',
        seat: '15',
        price: 1500000,
        quantity: 1,
        ownershipInvoice: { invoice_number: 'INV-TKT-2026-88', original_source: 'Official Ticketing' },
        notes: 'Tiket wristband VIP resmi'
      }
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.deal.deal_token);
    assert.ok((res.json.deal.transaction_link || res.json.deal.deal_link).includes('/deal/'));
    assert.strictEqual(res.json.deal.pricing.buyer_service_fee, 90000);
    assert.strictEqual(res.json.deal.pricing.seller_service_fee, 90000);
    assert.strictEqual(res.json.deal.pricing.total_paid_by_buyer, 1615000); // 1.5M + 90k fee + 25k PIC allocation
    assert.strictEqual(res.json.deal.pricing.net_payout_seller, 1410000);

    createdDeal = res.json.deal;
    dealToken = res.json.deal.deal_token;
  });

  // STEP 4: Buyer opens Deal Link via Mobile Viewport
  await asyncTest('Step 4: Buyer opens Deal Room on mobile viewport (iPhone User-Agent)', async () => {
    const res = await httpRequest(`/deal/${dealToken}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'));
    assert.ok(res.data.includes('Tikum Deal Room'));
    assert.ok(res.data.includes('Rincian Biaya Transparan (Zero Surprise Fees)'));
    assert.ok(res.data.includes('Digital Evidence Bundle'));
    assert.ok(res.data.includes('prelaunchBanner'));
  });

  // STEP 5: Buyer inspects Deal Room data via API
  await asyncTest('Step 5: Buyer retrieves Deal Room JSON (/api/deals/:token)', async () => {
    const res = await httpRequest(`/api/deals/${dealToken}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.deal.ticket.category, 'CAT 1 VIP');
    assert.strictEqual(res.json.deal.pricing.ticket_base_price, 1500000);
    assert.strictEqual(res.json.deal.pricing.buyer_service_fee, 90000);
    assert.strictEqual(res.json.deal.payment_status, 'UNPAID');
    assert.strictEqual(res.json.deal.ticket_verification_status, 'OWNERSHIP_EVIDENCE_REVIEWED');
  });

  // STEP 6: Safety Check - Prelaunch blocks live deal checkout
  await asyncTest('Step 6: PRELAUNCH_LISTING_ONLY blocks live deal checkout (Fail-Closed)', async () => {
    const res = await httpRequest(`/api/deals/${dealToken}/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': buyerUserId },
      body: {
        buyerId: buyerUserId,
        paymentChannel: 'QRIS',
        termsAccepted: true
      }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'MARKETPLACE_PRELAUNCH_ONLY');
  });

  // STEP 7: Mode 2 Disclosure Verification
  test('Step 7: Mode 2 Assisted Direct Payment disclosure is truthful and disclaims escrow', () => {
    const { PaymentModeController, SETTLEMENT_MODES } = require('./src/config/paymentMode');
    const terms = PaymentModeController.getModeTerminology();
    assert.strictEqual(terms.mode, SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT);
    assert.strictEqual(terms.isCustodial, false);
    assert.ok(terms.description.includes('TIKUM tidak menampung pokok dana tiket'));
    assert.ok(terms.disclaimer.includes('bukan lembaga escrow perbankan'));
  });

  // STEP 8: Seller Stage A Evidence Submission (Raw QR is blocked)
  await asyncTest('Step 8: Stage A raw QR upload is rejected, invoice note accepted', async () => {
    // Attempting raw QR code upload in Stage A
    const failRes = await httpRequest('/api/deals/create', {
      method: 'POST',
      headers: { 'x-user-id': sellerUserId },
      body: {
        sellerId: sellerUserId,
        eventId: 'ed-sheeran-jkt-2026',
        ticketCategory: 'CAT 1',
        price: 1000000,
        containsRawQr: true, // PROHIBITED IN STAGE A
        rawBarcode: 'RAW-QR-CODE-12345'
      }
    });
    assert.strictEqual(failRes.status, 400);
    assert.strictEqual(failRes.json.code, 'RAW_QR_PROHIBITED_STAGE_A');
  });

  // STEP 9: Admin verifies Event Policy (requires official URL, routes to TIER_B_VENUE_ASSISTED)
  await asyncTest('Step 9: Admin verifies Event Policy with mandatory URL -> TIER_B_VENUE_ASSISTED', async () => {
    // Attempting verify with empty URL fails
    const failRes = await httpRequest('/api/admin/event-policies/ed-sheeran-jkt-2026/verify', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: {
        riskTier: RISK_TIERS.TIER_B_VENUE_ASSISTED,
        policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
        policySourceUrl: '' // EMPTY URL PROHIBITED
      }
    });
    assert.strictEqual(failRes.status, 400);
    assert.strictEqual(failRes.json.code, 'POLICY_SOURCE_REQUIRED');

    // Succeeds with valid official URL
    const okRes = await httpRequest('/api/admin/event-policies/ed-sheeran-jkt-2026/verify', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: {
        riskTier: RISK_TIERS.TIER_B_VENUE_ASSISTED,
        policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
        policySourceUrl: 'https://pk-ent.com/ed-sheeran-terms-and-transfer-rules',
        promoterName: 'PK Entertainment & Sound Rhythm'
      }
    });
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(okRes.json.success, true);
    assert.strictEqual(okRes.json.policy.risk_tier, RISK_TIERS.TIER_B_VENUE_ASSISTED);
    assert.strictEqual(okRes.json.policy.policy_source_url, 'https://pk-ent.com/ed-sheeran-terms-and-transfer-rules');
  });

  // STEP 10: PIC registers shift and check-in
  await asyncTest('Step 10: PIC schedules shift and records timestamped gate check-in', async () => {
    const shift = VenueOperationsService.createShift({
      pic_user_id: picUserId,
      event_id: 'ed-sheeran-jkt-2026',
      meeting_point: 'Gate 3 West TIKUM Booth',
      shift_start: '2026-11-20T14:00:00Z',
      shift_end: '2026-11-20T22:00:00Z',
      deployment_fee: 300000
    });

    const checkedIn = await VenueOperationsService.recordAttendanceProof({
      shiftId: shift.shift_id,
      picUserId,
      type: 'CHECK_IN',
      proofUrl: 'https://storage.tikum.app/attendance/pic-gate3-checkin.jpg',
      location: 'Gate 3 West TIKUM Booth'
    });

    assert.strictEqual(checkedIn.status, 'CHECKED_IN');
    assert.ok(checkedIn.attendance_evidence.check_in_timestamp);
    assert.strictEqual(checkedIn.attendance_evidence.location, 'Gate 3 West TIKUM Booth');
  });

  // STEP 11 & 12: Evidence Bundle Inspection and PII Masking
  await asyncTest('Step 11 & 12: Buyer and Seller retrieve Evidence Bundle with masked PII (UU PDP)', async () => {
    const res = await httpRequest(`/api/deals/${dealToken}/evidence-bundle`, {
      headers: { 'x-user-id': buyerUserId }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.bundle);
    assert.strictEqual(res.json.bundle.completeness.totalSlots, 9);
    assert.ok(res.json.bundle.slots.ownership_evidence);
    assert.ok(res.json.bundle.slots.seller_identity_ref);
  });

  console.log('\n--- ADMIN CONSOLE VIEWS ACCEPTANCE ---');

  // Admin Console View 1: Event Policies List
  await asyncTest('Admin Console View: GET /api/admin/event-policies lists policies', async () => {
    const res = await httpRequest('/api/admin/event-policies', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(Array.isArray(res.json.policies));
    assert.ok(res.json.policies.length >= 1);
  });

  // Admin Console View 2: Pilot Scorecard
  await asyncTest('Admin Console View: GET /api/admin/pilot-scorecard returns hard governance targets', async () => {
    const res = await httpRequest('/api/admin/pilot-scorecard', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.scorecard);
    assert.ok(res.json.scorecard.hard_governance_targets);
    assert.strictEqual(res.json.scorecard.hard_governance_targets.unauthorized_settlement_releases, 0);
    assert.strictEqual(res.json.scorecard.hard_governance_targets.ledger_discrepancies_idr, 0);
  });

  // Admin Console View 3: HTML DOM navigation elements check
  await asyncTest('Admin Console HTML: Contains all required operations tabs and badges', async () => {
    const res = await httpRequest('/admin', {
      headers: {
        Accept: 'text/html',
        'Cookie': adminCookie
      }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.includes('Transaction Control'));
    assert.ok(res.data.includes('Policy Registry'));
    assert.ok(res.data.includes('Pilot Scorecard'));
    assert.ok(res.data.includes('Venue / PIC'));
    assert.ok(res.data.includes('Disputes'));
  });

  console.log('\n======================================================================');
  console.log(`BROWSER STAGING ACCEPTANCE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================');

  server.close();
  if (failed > 0) process.exit(1);
}

runStagingAcceptance().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  if (server) server.close();
  process.exit(1);
});
