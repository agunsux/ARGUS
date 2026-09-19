/**
 * TIKUM / ARGUS — Admin Dashboard V1 Comprehensive Test Suite
 * 
 * Verifies the Operational Control Center V1:
 * 1.  Server-side authentication boundary on GET /admin (401 unauthenticated)
 * 2.  Server-side authorization boundary on GET /admin (403 non-admin)
 * 3.  Server-side access granted on GET /admin (200 admin)
 * 4.  Direct static bypass prevention on GET /admin.html (401 unauthenticated, 403 non-admin)
 * 5.  Auth enforcement on GET /api/admin/overview (401 unauthenticated, 403 non-admin)
 * 6.  Overview payload data integrity & zero fabrication
 * 7.  Operational alerts generation (disputes, incidents, unassigned PICs, blocked orders)
 * 8.  FinancialLedger integration for payment & finance snapshot
 * 9.  Event operations and venue/PIC coverage status tracking
 * 10. Audit trail recent activity integration
 * 11. Multi-entity search across Events, Tickets, Orders, Sellers, Buyers
 * 12. Detail endpoint: GET /api/admin/events
 * 13. Detail endpoint: GET /api/admin/tickets
 * 14. Detail endpoint: GET /api/admin/sellers (with sensitive credential redaction)
 * 15. Detail endpoint: GET /api/admin/buyers (with sensitive credential redaction)
 * 16. Detail endpoint: GET /api/admin/payments (ledger transactions + gateway payments)
 * 17. Detail endpoint: GET /api/admin/disputes
 * 18. Detail endpoint: GET /api/admin/incidents
 * 19. Detail endpoint: GET /api/admin/venue-pic (gate verification metrics + shifts)
 * 20. Empty database resilience (graceful 0 and "N/A", no 500 errors)
 * 21. Self-lockout prevention on admin status modification
 * 22. Strict password hash redaction across all admin responses
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, bootstrapAdminUser, recordAuditLog } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');

let server;
let port;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    if (options.query) {
      Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqOpts.headers['Content-Type'] && !reqOpts.headers['content-type']) {
        req.setHeader('Content-Type', 'application/json');
      }
      req.write(payload);
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

async function test(title, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failed++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM / ARGUS — ADMIN DASHBOARD V1 OPERATIONAL CONTROL SUITE  ');
  console.log('================================================================\n');

  resetDatabase();

  server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let adminUser;
  let adminToken;
  let normalUser;
  let userToken;

  try {
    // Setup users & sessions
    bootstrapAdminUser();
    adminUser = state.users.find(u => u.email === 'ops@argus.id' || (u.role || '').toUpperCase() === 'ADMIN');
    assert.ok(adminUser, 'Admin user must exist in database');

    const adminSession = SessionStore.createSession({ userId: adminUser.id, role: 'ADMIN' });
    adminToken = adminSession.session_token;

    // Create a regular user
    normalUser = {
      id: 'user-buyer-101',
      name: 'Budi Normal User',
      email: 'budi.buyer@example.com',
      role: 'USER',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };
    state.users.push(normalUser);

    const userSession = SessionStore.createSession({ userId: normalUser.id, role: 'USER' });
    userToken = userSession.session_token;

    console.log('── Part 1: Server-Side Authentication & Authorization Boundaries ──');

    // 1. GET /admin: Unauthenticated request rejected (401)
    await test('1. GET /admin: Unauthenticated request rejected (401)', async () => {
      const res = await makeRequest('/admin');
      assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
      assert.ok(res.json && res.json.code === 'AUTH_REQUIRED', 'Must return AUTH_REQUIRED error code');
    });

    // 2. GET /admin: Normal USER rejected (403)
    await test('2. GET /admin: Authenticated normal USER rejected (403)', async () => {
      const res = await makeRequest('/admin', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      assert.strictEqual(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
      assert.ok(res.json && res.json.code === 'FORBIDDEN', 'Must return FORBIDDEN error code');
    });

    // 3. GET /admin: Admin granted access (200 with HTML)
    await test('3. GET /admin: Authenticated ADMIN granted access (200 HTML)', async () => {
      const res = await makeRequest('/admin', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
      assert.ok(res.headers['content-type'].includes('text/html'), 'Content-type must be HTML');
      assert.ok(res.body.includes('TIKUM Operations Console'), 'HTML must contain dashboard branding');
      assert.ok(res.body.includes('Powered by ARGUS Trust Engine &bull; SHINERVA HQ'), 'HTML must contain brand boundary subtitle');
    });

    // 4. GET /admin.html: Direct static bypass prevented
    await test('4. GET /admin.html: Direct static bypass prevented (401 unauth, 403 non-admin)', async () => {
      const unauthRes = await makeRequest('/admin.html');
      assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated /admin.html must return 401');

      const nonAdminRes = await makeRequest('/admin.html', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      assert.strictEqual(nonAdminRes.statusCode, 403, 'Non-admin /admin.html must return 403');

      const adminRes = await makeRequest('/admin.html', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(adminRes.statusCode, 200, 'Admin /admin.html must return 200');
    });

    // 5. GET /api/admin/overview: Auth enforcement
    await test('5. GET /api/admin/overview: Auth enforcement (401 unauth, 403 non-admin)', async () => {
      const unauthRes = await makeRequest('/api/admin/overview');
      assert.strictEqual(unauthRes.statusCode, 401);

      const nonAdminRes = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      assert.strictEqual(nonAdminRes.statusCode, 403);
    });

    console.log('\n── Part 2: Overview Payload Data Realism & Zero Fabrication ──');

    // Populate realistic test fixtures in state
    state.events = [
      {
        id: 'event-coldplay-jkt',
        name: 'Coldplay Music of the Spheres Jakarta',
        date: '2026-11-15',
        venue_name: 'Stadion Utama Gelora Bung Karno',
        venue_city: 'Jakarta',
        status: 'UPCOMING',
        is_verified: true
      },
      {
        id: 'event-bruno-mars-jkt',
        name: 'Bruno Mars Live in Jakarta',
        date: '2026-12-05',
        venue_name: 'Jakarta International Stadium',
        venue_city: 'Jakarta',
        status: 'UPCOMING',
        is_verified: true
      }
    ];

    state.listings = [
      {
        id: 'list-cp-cat1-01',
        ticket_id: 'tkt-001',
        event_id: 'event-coldplay-jkt',
        seller_id: 'seller-1',
        face_value: 3500000,
        price: 3800000,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'list-bm-cat2-01',
        ticket_id: 'tkt-002',
        event_id: 'event-bruno-mars-jkt',
        seller_id: 'seller-2',
        face_value: 2000000,
        price: 2200000,
        status: 'SUBMITTED', // Under review alert trigger
        created_at: new Date().toISOString()
      }
    ];

    state.tickets = [
      {
        id: 'tkt-001',
        event_id: 'event-coldplay-jkt',
        seller_id: 'seller-1',
        seat_info: 'CAT 1 - Section 12, Row 4',
        face_value: 3500000,
        verification_status: 'VERIFIED'
      },
      {
        id: 'tkt-002',
        event_id: 'event-bruno-mars-jkt',
        seller_id: 'seller-2',
        seat_info: 'CAT 2 - Section 5, Row 10',
        face_value: 2000000,
        verification_status: 'UNDER_REVIEW' // Triggers unverified count
      }
    ];

    state.orders = [
      {
        id: 'ord-1001',
        buyer_id: normalUser.id,
        seller_id: 'seller-1',
        event_id: 'event-coldplay-jkt',
        ticket_id: 'tkt-001',
        ticket_price: 3800000,
        total_amount: 4000000,
        status: 'PENDING_PAYMENT',
        created_at: new Date().toISOString()
      }
    ];

    state.disputes = [
      {
        id: 'dsp-001',
        order_id: 'ord-1001',
        buyer_id: normalUser.id,
        seller_id: 'seller-1',
        event_id: 'event-coldplay-jkt',
        reason: 'Tiket PDF ditolak di barcode scanner gate',
        status: 'OPEN',
        timeline: [{ timestamp: new Date().toISOString(), note: 'Dispute filed' }]
      }
    ];

    state.incidents = [
      {
        id: 'inc-001',
        event_id: 'event-coldplay-jkt',
        type: 'GATE_SCANNER_FAIL',
        severity: 'CRITICAL',
        status: 'INVESTIGATING',
        description: 'Turnstile gate 3 mengalami timeout saat membaca tiket barcode.',
        created_at: new Date().toISOString()
      }
    ];

    state.event_pics = [
      {
        event_id: 'event-coldplay-jkt',
        pic_user_id: 'pic-1',
        status: 'ACTIVE',
        contact_phone: '+62811223344'
      }
      // Note: event-bruno-mars-jkt intentionally has NO PIC to trigger unassigned alert
    ];

    state.entry_verifications = [
      {
        id: 'ev-01',
        event_id: 'event-coldplay-jkt',
        order_id: 'ord-1001',
        gate: 'Gate 3 West',
        status: 'INVALID',
        verified_at: new Date().toISOString()
      }
    ];

    state.authorization_records = [
      {
        id: 'auth-01',
        order_id: 'ord-1001',
        outcome: 'BLOCK',
        reason: 'Velocity threshold exceeded on high-value purchase',
        timestamp: new Date().toISOString()
      }
    ];

    // Seed double-entry ledger transactions
    await FinancialLedger.recordTransaction({
      eventType: 'CAPTURE',
      orderId: 'ord-1001',
      description: 'Order ord-1001 customer payment capture',
      entries: [
        { account: 'PAYMENT_GATEWAY_CLEARING', amount: 4000000, type: 'DEBIT' },
        { account: 'SELLER_PAYABLE_PENDING', amount: 3800000, type: 'CREDIT' },
        { account: 'PLATFORM_FEE_REVENUE', amount: 180000, type: 'CREDIT' },
        { account: 'TAX_PAYABLE', amount: 20000, type: 'CREDIT' }
      ]
    });

    // 6. Overview payload data integrity
    await test('6. Overview payload data integrity & zero fabrication', async () => {
      const res = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.statusCode, 200);
      const data = res.json;

      // Metric cards
      assert.strictEqual(data.metrics.active_events, 2);
      assert.strictEqual(data.metrics.tickets_listed, 1); // 1 ACTIVE listing
      assert.strictEqual(data.metrics.total_orders, 1);
      assert.strictEqual(data.metrics.pending_payments, 1);
      assert.strictEqual(data.metrics.open_disputes, 1);
      assert.strictEqual(data.metrics.active_incidents, 1);

      // Backward compatibility counters
      assert.ok(typeof data.users.total === 'number');
      assert.ok(typeof data.orders.total === 'number');
    });

    // 7. Operational alerts generation
    await test('7. Operational alerts generation (disputes, incidents, unassigned PICs, blocked orders)', async () => {
      const res = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      const alerts = res.json.alerts;
      assert.ok(Array.isArray(alerts), 'Alerts must be an array');
      assert.ok(alerts.length >= 4, `Expected at least 4 alerts, got ${alerts.length}`);

      const disputeAlert = alerts.find(a => a.type === 'UNRESOLVED_DISPUTE');
      assert.ok(disputeAlert, 'Must detect open dispute alert');
      assert.strictEqual(disputeAlert.severity, 'CRITICAL');
      assert.strictEqual(disputeAlert.entity_id, 'dsp-001');

      const incidentAlert = alerts.find(a => a.type === 'ACTIVE_INCIDENT');
      assert.ok(incidentAlert, 'Must detect active incident alert');
      assert.strictEqual(incidentAlert.entity_id, 'inc-001');

      const picAlert = alerts.find(a => a.type === 'PIC_UNASSIGNED');
      assert.ok(picAlert, 'Must detect unassigned PIC alert');
      assert.strictEqual(picAlert.entity_id, 'event-bruno-mars-jkt');

      const blockAlert = alerts.find(a => a.type === 'BLOCKED_TRANSACTION');
      assert.ok(blockAlert, 'Must detect blocked order alert');
      assert.strictEqual(blockAlert.entity_id, 'ord-1001');
    });

    // 8. FinancialLedger integration for payment & finance snapshot
    await test('8. FinancialLedger integration for payment & finance snapshot', async () => {
      const res = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      const fin = res.json.payment_finance_snapshot;
      assert.ok(fin, 'payment_finance_snapshot must exist');
      assert.strictEqual(fin.gateway_clearing_idr, 4000000, 'Gateway clearing must match ledger debit');
      assert.strictEqual(fin.seller_payable_pending_idr, 3800000, 'Seller payable must match ledger credit');
      assert.strictEqual(fin.platform_fee_revenue_idr, 180000, 'Platform revenue must match ledger credit');
      assert.strictEqual(fin.tax_payable_idr, 20000, 'Tax payable must match ledger credit');
    });

    // 9. Event operations and venue/PIC coverage status tracking
    await test('9. Event operations and venue/PIC coverage status tracking', async () => {
      const res = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      const evOps = res.json.event_operations;
      assert.strictEqual(evOps.length, 2);
      const coldplay = evOps.find(e => e.id === 'event-coldplay-jkt');
      assert.ok(coldplay);
      assert.strictEqual(coldplay.tickets_listed, 1);
      assert.strictEqual(coldplay.orders_count, 1);
      assert.strictEqual(coldplay.operational_status, 'INCIDENT'); // Because of active incident

      const venuePics = res.json.venue_pic_status;
      const cpPic = venuePics.find(v => v.event_id === 'event-coldplay-jkt');
      assert.strictEqual(cpPic.has_coverage, true);
      assert.strictEqual(cpPic.verification_status, '1 FAILED');

      const bmPic = venuePics.find(v => v.event_id === 'event-bruno-mars-jkt');
      assert.strictEqual(bmPic.has_coverage, false);
      assert.strictEqual(bmPic.pic_status, 'UNASSIGNED');
    });

    // 10. Audit trail recent activity integration
    await test('10. Audit trail recent activity integration', async () => {
      await recordAuditLog('ADMIN_TEST', 'test-entity-01', 'VERIFY_MANUAL', adminUser.id, { note: 'Manual override' });

      const res = await makeRequest('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      const activity = res.json.recent_activity;
      assert.ok(Array.isArray(activity));
      assert.ok(activity.length > 0);
      assert.strictEqual(activity[0].action, 'VERIFY_MANUAL');
      assert.strictEqual(activity[0].actor, adminUser.id);
    });

    console.log('\n── Part 3: Operational Search Engine ──');

    // 11. Multi-entity search across Events, Tickets, Orders, Sellers, Buyers
    await test('11. Multi-entity search across Events, Tickets, Orders, Sellers, Buyers', async () => {
      // Search by event name
      const resEvent = await makeRequest('/api/admin/search?q=coldplay', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resEvent.statusCode, 200);
      assert.strictEqual(resEvent.json.events.length, 1);
      assert.strictEqual(resEvent.json.events[0].id, 'event-coldplay-jkt');

      // Search by buyer name
      const resBuyer = await makeRequest('/api/admin/search?q=budi', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resBuyer.statusCode, 200);
      assert.strictEqual(resBuyer.json.buyers.length, 1);
      assert.strictEqual(resBuyer.json.buyers[0].id, normalUser.id);

      // Empty query returns empty arrays without crash
      const resEmpty = await makeRequest('/api/admin/search?q=', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resEmpty.statusCode, 200);
      assert.strictEqual(resEmpty.json.events.length, 0);
      assert.strictEqual(resEmpty.json.tickets.length, 0);
    });

    console.log('\n── Part 4: Dedicated Detail Endpoints ──');

    // 12. GET /api/admin/events
    await test('12. Detail endpoint: GET /api/admin/events', async () => {
      const res = await makeRequest('/api/admin/events', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.total, 2);
      assert.strictEqual(res.json.events[0].id, 'event-coldplay-jkt');
      assert.strictEqual(res.json.events[0].tickets_count, 1);
    });

    // 13. GET /api/admin/tickets
    await test('13. Detail endpoint: GET /api/admin/tickets', async () => {
      const res = await makeRequest('/api/admin/tickets', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.total, 2);
      assert.strictEqual(res.json.tickets[0].seat_info, 'CAT 1 - Section 12, Row 4');
    });

    // 14. GET /api/admin/sellers (sensitive credential redaction)
    await test('14. Detail endpoint: GET /api/admin/sellers (with sensitive credential redaction)', async () => {
      state.users.push({
        id: 'seller-verified-01',
        name: 'Mitra Tiket Resmi',
        email: 'mitra@example.com',
        role: 'SELLER',
        password_hash: '$2a$10$supersecretneverleak',
        status: 'ACTIVE'
      });
      state.seller_profiles = [
        {
          user_id: 'seller-verified-01',
          kyc_status: 'VERIFIED',
          active_listing_limit: 25
        }
      ];

      const res = await makeRequest('/api/admin/sellers', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.sellers.length >= 1);
      const seller = res.json.sellers.find(s => s.id === 'seller-verified-01');
      assert.ok(seller);
      assert.strictEqual(seller.kyc_status, 'VERIFIED');
      assert.strictEqual(seller.password_hash, undefined, 'password_hash must be redacted');
      assert.strictEqual(seller.password, undefined, 'password must be redacted');
    });

    // 15. GET /api/admin/buyers (sensitive credential redaction)
    await test('15. Detail endpoint: GET /api/admin/buyers (with sensitive credential redaction)', async () => {
      const res = await makeRequest('/api/admin/buyers', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const buyer = res.json.buyers.find(b => b.id === normalUser.id);
      assert.ok(buyer);
      assert.strictEqual(buyer.total_purchases, 1);
      assert.strictEqual(buyer.password_hash, undefined, 'password_hash must be redacted');
    });

    // 16. GET /api/admin/payments (ledger transactions + gateway payments)
    await test('16. Detail endpoint: GET /api/admin/payments (ledger transactions + gateway payments)', async () => {
      const res = await makeRequest('/api/admin/payments', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.balances);
      assert.ok(Array.isArray(res.json.ledger_transactions));
      assert.strictEqual(res.json.total_ledger_transactions, 1);
      assert.strictEqual(res.json.ledger_transactions[0].source_event, 'CAPTURE');
    });

    // 17. GET /api/admin/disputes
    await test('17. Detail endpoint: GET /api/admin/disputes', async () => {
      const res = await makeRequest('/api/admin/disputes', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.total, 1);
      assert.strictEqual(res.json.disputes[0].id, 'dsp-001');
      assert.strictEqual(res.json.disputes[0].reason, 'Tiket PDF ditolak di barcode scanner gate');
    });

    // 18. GET /api/admin/incidents
    await test('18. Detail endpoint: GET /api/admin/incidents', async () => {
      const res = await makeRequest('/api/admin/incidents', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.total, 1);
      assert.strictEqual(res.json.incidents[0].type, 'GATE_SCANNER_FAIL');
      assert.strictEqual(res.json.incidents[0].severity, 'CRITICAL');
    });

    // 19. GET /api/admin/venue-pic
    await test('19. Detail endpoint: GET /api/admin/venue-pic (gate verification metrics + coverage)', async () => {
      const res = await makeRequest('/api/admin/venue-pic', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.total_events, 2);
      assert.strictEqual(res.json.covered_events, 1);
      assert.strictEqual(res.json.coverage[0].failed_entries, 1);
    });

    console.log('\n── Part 5: Resilience, Edge Cases & Security Invariants ──');

    // 20. Empty database resilience
    await test('20. Empty database resilience (graceful 0 and "N/A", no 500 errors)', async () => {
      // Clear out arrays temporarily
      const savedEvents = [...state.events];
      const savedOrders = [...state.orders];
      const savedListings = [...state.listings];
      const savedTickets = [...state.tickets];
      const savedDisputes = [...state.disputes];
      const savedIncidents = [...state.incidents];
      const savedEntryVerifs = [...(state.entry_verifications || [])];
      const savedAuthRecs = [...(state.authorization_records || [])];
      const savedSellerProfiles = [...(state.seller_profiles || [])];

      state.events.length = 0;
      state.orders.length = 0;
      state.listings.length = 0;
      state.tickets.length = 0;
      state.disputes.length = 0;
      state.incidents.length = 0;
      state.entry_verifications.length = 0;
      state.authorization_records.length = 0;
      state.seller_profiles.length = 0;

      try {
        const res = await makeRequest('/api/admin/overview', {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(res.statusCode, 200, 'Empty state must return 200 without throwing');
        assert.strictEqual(res.json.metrics.active_events, 0);
        assert.strictEqual(res.json.metrics.tickets_listed, 0);
        assert.strictEqual(res.json.metrics.open_disputes, 0);
        assert.strictEqual(res.json.alerts.length, 0);
        assert.strictEqual(res.json.trust_fraud_snapshot.operational_pass_rate, 'N/A');
      } finally {
        // Restore arrays
        state.events.push(...savedEvents);
        state.orders.push(...savedOrders);
        state.listings.push(...savedListings);
        state.tickets.push(...savedTickets);
        state.disputes.push(...savedDisputes);
        state.incidents.push(...savedIncidents);
        state.entry_verifications.push(...savedEntryVerifs);
        state.authorization_records.push(...savedAuthRecs);
        state.seller_profiles.push(...savedSellerProfiles);
      }
    });

    // 21. Self-lockout prevention on admin status modification
    await test('21. Self-lockout prevention on admin status modification', async () => {
      const res = await makeRequest(`/api/admin/users/${adminUser.id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: { status: 'SUSPENDED' }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.code, 'CANNOT_SUSPEND_SELF');
      assert.strictEqual(adminUser.status, 'ACTIVE');
    });

    // 22. Strict password hash redaction across all admin responses
    await test('22. Strict password hash redaction across all admin responses', async () => {
      const usersRes = await makeRequest('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(usersRes.statusCode, 200);

      const rawJson = JSON.stringify(usersRes.json);
      assert.strictEqual(rawJson.includes('password_hash'), false, 'Users API must not leak password_hash keys');
      assert.strictEqual(rawJson.includes('supersecretneverleak'), false, 'Users API must not leak hash values');
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n================================================================');
  console.log(`  ADMIN DASHBOARD V1 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSuite().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runSuite };
