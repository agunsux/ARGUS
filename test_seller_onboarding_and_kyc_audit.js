/**
 * test_seller_onboarding_and_kyc_audit.js
 * Forensic audit reproduction test suite for:
 * - Seller onboarding submission (PENDING_REVIEW)
 * - Admin seller queue visibility (listAllUsers vs listUsers defect)
 * - Admin KYC review (VERIFIED, REJECTED, SUSPENDED)
 * - Role transition consistency (BUYER -> SELLER in users and user_roles)
 * - Listing creation eligibility gates (BUYER vs PENDING_REVIEW vs VERIFIED vs REJECTED)
 * - Self-approval & privilege escalation prevention
 * - Event PIC boundary & authorization
 */

process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'TestAdminPassword123!';

const assert = require('assert');
const http = require('http');
const { state, resetDatabase, bootstrapAdminUser } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { SellerTrustService } = require('./src/trust/SellerTrustService');
const { ListingService } = require('./src/services/listingService');
const { EventPicService } = require('./src/services/eventPicService');
const { getUserRepository } = require('./src/storage');
const app = require('./src/server');

async function runAuditTests() {
  console.log('=== FORENSIC REPRODUCTION TEST SUITE ===\n');
  resetDatabase();
  bootstrapAdminUser();

  const userRepo = getUserRepository();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function req(path, options = {}) {
    const url = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
      const r = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: baseUrl,
          ...(options.headers || {})
        }
      }, res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (_) { json = data; }
          resolve({ status: res.statusCode, json, headers: res.headers });
        });
      });
      r.on('error', reject);
      if (options.body) r.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      r.end();
    });
  }

  try {
    // 1. Setup Admin session
    const adminUser = state.users.find(u => u.role === 'admin' || u.role === 'ADMIN');
    assert.ok(adminUser, 'Admin user must exist');
    const adminSession = await SessionStore.createSession({ userId: adminUser.id, role: 'ADMIN' });
    const adminAuthHeader = { Authorization: `Bearer ${adminSession.session_token || adminSession.token}` };

    // 2. Setup Buyer "Nadea"
    const nadeaUser = {
      id: 'usr-nadea-test',
      name: 'Nadea Test',
      email: 'nadea@test.com',
      role: 'BUYER',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };
    state.users.push(nadeaUser);
    const nadeaSession = await SessionStore.createSession({ userId: nadeaUser.id, role: 'BUYER' });
    const nadeaAuthHeader = { Authorization: `Bearer ${nadeaSession.session_token || nadeaSession.token}` };

    console.log('[Test 1] Buyer attempts to create listing before onboarding...');
    // In LIVE marketplace mode:
    process.env.MARKETPLACE_MODE = 'LIVE';
    const elig1 = await ListingService.validateSellerEligibilityAsync(nadeaUser.id);
    assert.strictEqual(elig1.eligible, false, 'Unonboarded buyer must not be eligible');
    console.log('  ✓ Buyer listing eligibility properly rejected:', elig1.code);

    console.log('\n[Test 2] Buyer submits seller onboarding (KYC)...');
    const onboardRes = await SellerTrustService.submitOnboarding({
      userId: nadeaUser.id,
      displayName: 'Nadea Sofia',
      nik: '1234567890123456',
      phone: '08123456789'
    });
    assert.strictEqual(onboardRes.kyc_status, 'PENDING_REVIEW', 'Onboarding status must be PENDING_REVIEW');
    console.log('  ✓ Onboarding submitted. KYC Status:', onboardRes.kyc_status);

    console.log('\n[Test 3] Seller with PENDING_REVIEW attempts to list ticket in LIVE mode...');
    const elig2 = await ListingService.validateSellerEligibilityAsync(nadeaUser.id);
    assert.strictEqual(elig2.eligible, false, 'Pending KYC seller must not be eligible in LIVE mode');
    assert.strictEqual(elig2.code, 'SELLER_KYC_PENDING_REVIEW');
    console.log('  ✓ Pending KYC listing blocked with code:', elig2.code);

    console.log('\n[Test 4] Admin seller queue discovery defect verification...');
    // Check if userRepo has listAllUsers vs listUsers
    console.log('  userRepo.listAllUsers is:', typeof userRepo.listAllUsers);
    console.log('  userRepo.listUsers is:', typeof userRepo.listUsers);
    const adminSellersRes = await req('/api/admin/sellers', { headers: adminAuthHeader });
    console.log('  GET /api/admin/sellers HTTP status:', adminSellersRes.status);
    console.log('  Total sellers returned:', adminSellersRes.json?.total);
    const nadeaFoundInAdmin = (adminSellersRes.json?.sellers || []).find(s => s.id === nadeaUser.id);
    console.log('  Is Nadea visible in admin queue?:', Boolean(nadeaFoundInAdmin));

    console.log('\n[Test 5] Self-approval & role escalation prevention...');
    // Nadea tries to review her own KYC
    const selfReviewRes = await req(`/api/admin/sellers/${nadeaUser.id}/kyc`, {
      method: 'PATCH',
      headers: nadeaAuthHeader,
      body: { kyc_status: 'VERIFIED' }
    });
    assert.strictEqual(selfReviewRes.status, 403, 'Self-approval must return 403 Forbidden');
    console.log('  ✓ Self-approval attempt properly blocked with 403');

    // Nadea tries to modify her role via profile
    const roleEscalationRes = await req('/api/dashboard/profile', {
      method: 'PATCH',
      headers: nadeaAuthHeader,
      body: { role: 'ADMIN' }
    });
    assert.strictEqual(roleEscalationRes.status, 403, 'Role escalation must return 403 Forbidden');
    console.log('  ✓ Profile role escalation attempt blocked with 403');

    console.log('\n[Test 6] Authorized Admin reviews and approves KYC...');
    const adminApproveRes = await req(`/api/admin/sellers/${nadeaUser.id}/kyc`, {
      method: 'PATCH',
      headers: adminAuthHeader,
      body: {
        kyc_status: 'VERIFIED',
        active_listing_limit: 15,
        reason: 'Dokumen KTP valid dan lolos verifikasi manual'
      }
    });
    assert.strictEqual(adminApproveRes.status, 200, 'Admin approval must succeed with 200');
    console.log('  ✓ Admin approved KYC successfully.');

    // Verify role upgrade in memory and repository
    const updatedNadea = state.users.find(u => u.id === nadeaUser.id);
    assert.strictEqual(updatedNadea.role, 'SELLER', 'Nadea role must be updated to SELLER');
    const profileAfterApprove = (state.seller_profiles || []).find(p => p.user_id === nadeaUser.id);
    assert.strictEqual(profileAfterApprove.kyc_status, 'VERIFIED');
    console.log('  ✓ Role consistently updated: role=SELLER, kyc_status=VERIFIED');

    console.log('\n[Test 7] Approved Seller creates valid listing...');
    // Create an active event in state
    state.events = [{
      id: 'event-active-test',
      name: 'Active Concert 2026',
      title: 'Active Concert 2026',
      date: '2026-12-01',
      start_date: '2026-12-01',
      event_start_at: '2026-12-01T20:00:00+07:00',
      event_end_at: '2026-12-01T23:00:00+07:00',
      venue_id: 'venue-gbk',
      status: 'ACTIVE',
      lifecycle_status: 'PUBLISHED',
      is_verified: true,
      category: 'KONSER'
    }];

    const listingRes = await ListingService.createListing({
      sellerId: nadeaUser.id,
      eventId: 'event-active-test',
      seatInfo: 'Cat 1 - Row A - Seat 10',
      faceValue: 500000,
      price: 600000,
      rawBarcode: 'BARCODE-NADEA-TEST-001',
      quantity: 1
    });
    assert.ok(listingRes && listingRes.listing, 'Listing must be created');
    assert.strictEqual(listingRes.listing.seller_id, nadeaUser.id);
    console.log('  ✓ Listing created successfully by approved seller. ID:', listingRes.listing.id);

    console.log('\n[Test 8] Event PIC Boundary Audit...');
    const picUser = {
      id: 'usr-pic-test',
      name: 'Field PIC Officer',
      email: 'pic@field.test',
      role: 'pic',
      status: 'ACTIVE'
    };
    state.users.push(picUser);

    // Assign PIC to event-active-test
    EventPicService.assignPic({
      eventId: 'event-active-test',
      venueId: 'venue-gbk',
      picUserId: picUser.id
    });

    const activeCheck = EventPicService.isPicActiveForEvent(picUser.id, 'event-active-test');
    assert.strictEqual(activeCheck.active, true, 'PIC must be active for assigned event');

    const unauthorizedCheck = EventPicService.isPicActiveForEvent(picUser.id, 'event-other-unassigned');
    assert.strictEqual(unauthorizedCheck.active, false, 'PIC must NOT be active for unassigned event');
    console.log('  ✓ PIC active for assigned event, strictly denied for unauthorized event:', unauthorizedCheck.reason);

    console.log('\n=== ALL AUDIT REPRODUCTION TESTS PASSED! ===');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('AUDIT TEST FAILED:', err);
    server.close();
    process.exit(1);
  }
}

runAuditTests();
