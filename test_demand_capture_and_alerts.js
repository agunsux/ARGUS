/**
 * TIKUM / ARGUS — Demand Capture & Alert Invariant Test Suite (Task 4)
 * 
 * Verifies:
 * 1. Contact Validation (WA normalization + Email RFC regex)
 * 2. Qty & Budget Validation (1-4 tickets, positive budget)
 * 3. Mandatory UU PDP Consent (Persyaratan persetujuan dihubungi)
 * 4. Anti-Spam Rate Limiting (Max 3 submissions per hour per event)
 * 5. TRUTHFULNESS INVARIANT: Public count ONLY shown if >= 5 unique waiting users
 * 6. Admin API: List, Filter, CSV Export, Mark Notified
 * 7. HTTP API: POST /api/discovery/demand, GET /api/discovery/demand/stats/:eventId
 * 8. Zero fake FOMO numbers or phantom demand counts
 */

const assert = require('assert');
const http = require('http');
const express = require('express');

process.env.NODE_ENV = 'test';

const { demandCapture, DemandCaptureService } = require('./src/discovery/DemandCaptureService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { state, resetDatabase } = require('./src/database');
const { EventSEOService } = require('./src/discovery/EventSEOService');

let testPassed = 0;
let testTotal = 0;

async function check(name, fn) {
  testTotal++;
  try {
    await fn();
    testPassed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('  TIKUM — DEMAND CAPTURE & ALERT INVARIANT TEST SUITE (TASK 4)');
  console.log('================================================================\n');

  demandCapture.reset();
  resetDatabase();

  // Seed a test canonical event
  const testEventId = 'event-demand-canary-2026';
  canonicalRegistry.createEvent({
    id: testEventId,
    event_id: testEventId,
    name: 'Joyland Festival 2026',
    title: 'Joyland Festival 2026',
    canonical_name: 'Joyland Festival 2026',
    slug: 'joyland-festival-2026-demand-test',
    start_date: '2026-11-20',
    venue: 'GBK Senayan',
    venue_name: 'GBK Senayan',
    city: 'Jakarta',
    is_verified: true,
    verification_status: 'VERIFIED'
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: CONTACT VALIDATION
  // ---------------------------------------------------------------------------
  console.log('── Section 1: Contact Validation & Normalization ──');

  await check('1.1 Normalizes valid Indonesian WhatsApp numbers (+628, 08, 628)', () => {
    const c1 = DemandCaptureService.validateContact('08123456789');
    assert.strictEqual(c1.valid, true);
    assert.strictEqual(c1.type, 'WHATSAPP');
    assert.strictEqual(c1.normalized, '+628123456789');

    const c2 = DemandCaptureService.validateContact('+62 813-8888-9999');
    assert.strictEqual(c2.valid, true);
    assert.strictEqual(c2.type, 'WHATSAPP');
    assert.strictEqual(c2.normalized, '+6281388889999');

    const c3 = DemandCaptureService.validateContact('628555666777');
    assert.strictEqual(c3.valid, true);
    assert.strictEqual(c3.type, 'WHATSAPP');
    assert.strictEqual(c3.normalized, '+628555666777');
  });

  await check('1.2 Validates valid Email addresses and normalizes to lowercase', () => {
    const e1 = DemandCaptureService.validateContact('Buyer.Tiket@Example.COM');
    assert.strictEqual(e1.valid, true);
    assert.strictEqual(e1.type, 'EMAIL');
    assert.strictEqual(e1.normalized, 'buyer.tiket@example.com');
  });

  await check('1.3 Rejects invalid contacts (landlines, random text, bad emails)', () => {
    assert.strictEqual(DemandCaptureService.validateContact('021555666').valid, false);
    assert.strictEqual(DemandCaptureService.validateContact('notanemail').valid, false);
    assert.strictEqual(DemandCaptureService.validateContact('@example.com').valid, false);
    assert.strictEqual(DemandCaptureService.validateContact('').valid, false);
    assert.strictEqual(DemandCaptureService.validateContact(null).valid, false);
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: QTY, BUDGET & CONSENT VALIDATION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Qty, Budget & UU PDP Consent Validation ──');

  await check('2.1 Qty strictly bounds between 1 and 4 tickets', () => {
    assert.strictEqual(DemandCaptureService.validateQty(1).valid, true);
    assert.strictEqual(DemandCaptureService.validateQty('4').qty, 4);
    assert.strictEqual(DemandCaptureService.validateQty(0).valid, false);
    assert.strictEqual(DemandCaptureService.validateQty(5).valid, false);
    assert.strictEqual(DemandCaptureService.validateQty('five').valid, false);
    assert.strictEqual(DemandCaptureService.validateQty(null).qty, 1);
  });

  await check('2.2 Max price parses Indonesian currency formats and rejects negatives', () => {
    assert.strictEqual(DemandCaptureService.validateMaxPrice('Rp 750.000').maxPrice, 750000);
    assert.strictEqual(DemandCaptureService.validateMaxPrice(1200000).maxPrice, 1200000);
    assert.strictEqual(DemandCaptureService.validateMaxPrice(null).maxPrice, null);
    assert.strictEqual(DemandCaptureService.validateMaxPrice(-5000).valid, false);
  });

  await check('2.3 UU PDP Consent is mandatory', () => {
    assert.strictEqual(DemandCaptureService.validateConsent(true).valid, true);
    assert.strictEqual(DemandCaptureService.validateConsent('true').valid, true);
    assert.strictEqual(DemandCaptureService.validateConsent('on').valid, true);
    assert.strictEqual(DemandCaptureService.validateConsent(false).valid, false);
    assert.strictEqual(DemandCaptureService.validateConsent(null).valid, false);
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: RATE LIMITING & SECURITY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Rate Limiting & Anti-Spam ──');

  await check('3.1 Blocks more than 3 submissions per hour per contact for same event', () => {
    const rateService = new DemandCaptureService();
    const eventA = 'event-rate-1';

    // 1st, 2nd, 3rd succeed
    rateService.registerInterest({ eventId: eventA, contact: '08111111111', consent: true });
    rateService.registerInterest({ eventId: eventA, contact: '08111111111', consent: true });
    rateService.registerInterest({ eventId: eventA, contact: '08111111111', consent: true });

    // 4th fails closed
    assert.throws(() => {
      rateService.registerInterest({ eventId: eventA, contact: '08111111111', consent: true });
    }, (err) => err.code === 'RATE_LIMIT_EXCEEDED');
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: TRUTHFULNESS INVARIANT (COUNT >= 5 GATE)
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Truthfulness Invariant on Public Demand Stats ──');

  await check('4.1 Counts 0 to 4 return show_count=false and neutral copy (NO FOMO manipulation)', () => {
    const truthService = new DemandCaptureService();
    const ev = 'event-truth-test';

    // 0 submissions
    let stats = truthService.getPublicDemandStats(ev);
    assert.strictEqual(stats.show_count, false);
    assert.strictEqual(stats.verified_count, 0);
    assert.strictEqual(stats.badge_text, 'Daftar untuk dikabari pertama saat ada tiket tersedia');

    // 1 to 4 distinct submissions
    truthService.registerInterest({ eventId: ev, contact: 'user1@example.com', consent: true });
    truthService.registerInterest({ eventId: ev, contact: 'user2@example.com', consent: true });
    truthService.registerInterest({ eventId: ev, contact: 'user3@example.com', consent: true });
    truthService.registerInterest({ eventId: ev, contact: 'user4@example.com', consent: true });

    stats = truthService.getPublicDemandStats(ev);
    assert.strictEqual(stats.show_count, false);
    assert.strictEqual(stats.verified_count, 0); // Strictly masked to 0 when < 5
    assert.strictEqual(stats.badge_text, 'Daftar untuk dikabari pertama saat ada tiket tersedia');
  });

  await check('4.2 Reaching exactly 5 unique users activates verified badge with exact number', () => {
    const truthService = new DemandCaptureService();
    const ev = 'event-truth-test-2';

    for (let i = 1; i <= 5; i++) {
      truthService.registerInterest({ eventId: ev, contact: `buyer${i}@example.com`, consent: true });
    }

    const stats = truthService.getPublicDemandStats(ev);
    assert.strictEqual(stats.show_count, true);
    assert.strictEqual(stats.verified_count, 5);
    assert.strictEqual(stats.badge_text, '5 orang sedang mencari tiket ini');
  });

  await check('4.3 Duplicate submissions by same contact do NOT inflate unique waiting count', () => {
    const truthService = new DemandCaptureService();
    const ev = 'event-truth-test-3';

    // 3 submissions from same user + 1 other user = 2 unique users
    truthService.registerInterest({ eventId: ev, contact: '081299990001', consent: true });
    truthService.registerInterest({ eventId: ev, contact: '081299990001', consent: true });
    truthService.registerInterest({ eventId: ev, contact: '081299990002', consent: true });

    assert.strictEqual(truthService.getVerifiedDemandCount(ev), 2);
    const stats = truthService.getPublicDemandStats(ev);
    assert.strictEqual(stats.show_count, false);
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: ADMIN APIS & CSV EXPORT
  // ---------------------------------------------------------------------------
  console.log('\n── Section 5: Admin Alert Management & CSV Export ──');

  await check('5.1 Lists and filters demand alerts correctly', () => {
    const adminService = new DemandCaptureService();
    adminService.registerInterest({ eventId: 'ev-1', contact: '081211112222', qty: 2, maxPrice: 800000, consent: true });
    adminService.registerInterest({ eventId: 'ev-2', contact: '081233334444', qty: 1, consent: true });

    const all = adminService.getAdminAlerts();
    assert.strictEqual(all.total, 2);

    const filtered = adminService.getAdminAlerts({ eventId: 'ev-1' });
    assert.strictEqual(filtered.total, 1);
    assert.strictEqual(filtered.alerts[0].contact, '+6281211112222');
  });

  await check('5.2 Generates RFC-compliant CSV export for seller recruitment', () => {
    const adminService = new DemandCaptureService();
    adminService.registerInterest({ eventId: 'ev-1', contact: '081211112222', qty: 2, maxPrice: 800000, consent: true });

    const csv = adminService.exportCsv({ eventId: 'ev-1' }, (id) => ({ canonical_name: 'Pestapora 2026' }));
    assert.ok(csv.includes('ID,Event ID,Event Name,Contact Type,Contact,Qty,Max Budget (IDR),Status,Consent Timestamp,Created At,Notified At'));
    assert.ok(csv.includes('+6281211112222'));
    assert.ok(csv.includes('Pestapora 2026'));
    assert.ok(csv.includes('800000'));
  });

  await check('5.3 markNotified updates status and timestamp', () => {
    const adminService = new DemandCaptureService();
    const res = adminService.registerInterest({ eventId: 'ev-1', contact: '081211112222', consent: true });

    assert.strictEqual(res.record.status, 'WAITING');
    assert.strictEqual(res.record.notified_at, null);

    const updated = adminService.markNotified(res.record.id, 'admin-pic-1');
    assert.strictEqual(updated.status, 'NOTIFIED');
    assert.ok(updated.notified_at);
    assert.strictEqual(updated.notified_by, 'admin-pic-1');
  });

  // ---------------------------------------------------------------------------
  // SECTION 6: HTTP INTEGRATION & PDP RENDERING
  // ---------------------------------------------------------------------------
  console.log('\n── Section 6: HTTP Integration & SSR PDP Rendering ──');

  // Launch test HTTP server with actual discoveryRouter & adminRouter
  const app = express();
  app.use(express.json());
  const { resolveUserAsync } = require('./src/middleware/auth');
  app.use(async (req, res, next) => {
    try {
      await resolveUserAsync(req);
    } catch (_) {}
    next();
  });
  const discoveryRouter = require('./src/discovery/discoveryRouter');
  const adminRouter = require('./src/api/adminRouter');
  app.use(discoveryRouter);
  app.use('/api/admin', adminRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const { SessionStore } = require('./src/services/sessionStore');
  const adminSession = SessionStore.createSession({ userId: 'admin-1', role: 'ADMIN' });
  const authHeader = { 'Authorization': `Bearer ${adminSession.session_token}` };

  async function apiRequest(path, options = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, headers: res.headers, data };
  }

  try {
    await check('6.1 POST /api/discovery/demand creates alert and returns 201', async () => {
      demandCapture.reset();
      const res = await apiRequest('/api/discovery/demand', {
        method: 'POST',
        body: JSON.stringify({
          eventId: testEventId,
          contact: '081299998888',
          qty: 2,
          maxPrice: 'Rp 650.000',
          consent: true
        })
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.demand.contact, '+6281299998888');
      assert.strictEqual(res.data.demand.qty, 2);
      assert.strictEqual(res.data.demand.max_price, 650000);
      assert.strictEqual(res.data.notification.status, 'QUEUED');
    });

    await check('6.2 GET /api/discovery/demand/stats/:eventId returns public stats', async () => {
      const res = await apiRequest(`/api/discovery/demand/stats/${testEventId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.show_count, false); // only 1 user registered, < 5
      assert.strictEqual(res.data.verified_count, 0);
    });

    await check('6.3 Admin endpoints enforce authorization and export CSV', async () => {
      // Unauthenticated -> 401
      const unauth = await apiRequest('/api/admin/demand-alerts');
      assert.strictEqual(unauth.status, 401);

      // Authenticated admin
      const adminList = await apiRequest('/api/admin/demand-alerts', { headers: authHeader });
      assert.strictEqual(adminList.status, 200);
      assert.strictEqual(adminList.data.success, true);
      assert.ok(adminList.data.total >= 1);

      const alertId = adminList.data.alerts[0].id;
      const csvExport = await apiRequest('/api/admin/demand-alerts/export', { headers: authHeader });
      assert.strictEqual(csvExport.status, 200);
      assert.ok(csvExport.headers.get('content-type').includes('text/csv'));
      assert.ok(csvExport.data.includes('+6281299998888'));

      const notifyRes = await apiRequest(`/api/admin/demand-alerts/${alertId}/notify`, {
        method: 'POST',
        headers: authHeader
      });
      assert.strictEqual(notifyRes.status, 200);
      assert.strictEqual(notifyRes.data.alert.status, 'NOTIFIED');
    });

    await check('6.4 Event PDP SSR renders modernized demand capture form with UU PDP consent', () => {
      const canonicalEvent = canonicalRegistry.getEventById(testEventId);
      const html = EventSEOService.renderEventPageHtml(canonicalEvent, [], []);
      assert.ok(html.includes('id="demandForm"'));
      assert.ok(html.includes('id="demandContact"'));
      assert.ok(html.includes('id="demandQty"'));
      assert.ok(html.includes('id="demandMaxPrice"'));
      assert.ok(html.includes('id="demandConsent"'));
      assert.ok(html.includes('UU Perlindungan Data Pribadi'));
      assert.ok(html.includes('Daftar untuk dikabari pertama saat ada tiket tersedia'));
    });

    // -------------------------------------------------------------------------
    // SECTION 7: PRE-MIGRATION SAFETY & POSTGRES PERSISTENCE INVARIANTS
    // -------------------------------------------------------------------------
    console.log('\n── Section 7: Pre-Migration Safety (42P01 Missing Table) & Postgres Persistence ──');

    await check('7.1 When demand_alerts table does not exist (42P01), POST /api/discovery/demand fails safely (503) without false success', async () => {
      demandCapture.reset();
      demandCapture.requirePersistentStorage = true;
      demandCapture.pool = {
        query: async () => {
          const err = new Error('relation "demand_alerts" does not exist');
          err.code = '42P01';
          throw err;
        }
      };

      try {
        const res = await apiRequest('/api/discovery/demand', {
          method: 'POST',
          body: JSON.stringify({
            eventId: testEventId,
            contact: '081277776666',
            qty: 1,
            consent: true
          })
        });

        assert.strictEqual(res.status, 503);
        assert.strictEqual(res.data.success, false);
        assert.strictEqual(res.data.persisted, false);
        assert.strictEqual(res.data.code, 'DEMAND_STORAGE_UNAVAILABLE');
        assert.strictEqual(demandCapture.getAllDemands().length, 0);
      } finally {
        demandCapture.requirePersistentStorage = null;
        demandCapture.pool = null;
      }
    });

    await check('7.2 When demand_alerts table does not exist (42P01), GET /api/discovery/demand/stats/:eventId degrades safely without breaking browsing', async () => {
      demandCapture.requirePersistentStorage = true;
      demandCapture.pool = {
        query: async () => {
          const err = new Error('relation "demand_alerts" does not exist');
          err.code = '42P01';
          throw err;
        }
      };

      try {
        const res = await apiRequest(`/api/discovery/demand/stats/${testEventId}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.success, true);
        assert.strictEqual(res.data.show_count, false);
        assert.strictEqual(res.data.verified_count, 0);
      } finally {
        demandCapture.requirePersistentStorage = null;
        demandCapture.pool = null;
      }
    });

    await check('7.3 When demand_alerts table does not exist (42P01), Admin alert endpoints fail closed (503) and disclose no private data', async () => {
      demandCapture.requirePersistentStorage = true;
      demandCapture.pool = {
        query: async () => {
          const err = new Error('relation "demand_alerts" does not exist');
          err.code = '42P01';
          throw err;
        }
      };

      try {
        const listRes = await apiRequest('/api/admin/demand-alerts', { headers: authHeader });
        assert.strictEqual(listRes.status, 503);
        assert.strictEqual(listRes.data.code, 'DEMAND_STORAGE_UNAVAILABLE');
        assert.strictEqual(listRes.data.alerts, undefined);

        const csvRes = await apiRequest('/api/admin/demand-alerts/export', { headers: authHeader });
        assert.strictEqual(csvRes.status, 503);
        assert.strictEqual(csvRes.data.code, 'DEMAND_STORAGE_UNAVAILABLE');

        const notifyRes = await apiRequest('/api/admin/demand-alerts/dem-123/notify', {
          method: 'POST',
          headers: authHeader
        });
        assert.strictEqual(notifyRes.status, 503);
        assert.strictEqual(notifyRes.data.code, 'DEMAND_STORAGE_UNAVAILABLE');
      } finally {
        demandCapture.requirePersistentStorage = null;
        demandCapture.pool = null;
      }
    });

    await check('7.4 Persistent Postgres mode stores, deduplicates per contact+event, and serves stats & admin queries from DB', async () => {
      demandCapture.reset();
      const fakeDbRows = [];
      demandCapture.requirePersistentStorage = true;
      demandCapture.pool = {
        query: async (sql, params = []) => {
          const normSql = sql.replace(/\s+/g, ' ').trim();
          if (normSql.startsWith('SELECT id FROM demand_alerts WHERE event_id = $1 AND contact = $2')) {
            const found = fakeDbRows.find(r => r.event_id === params[0] && r.contact === params[1] && r.status === 'WAITING');
            return { rows: found ? [{ id: found.id }] : [] };
          }
          if (normSql.startsWith('INSERT INTO demand_alerts')) {
            const row = {
              id: params[0],
              event_id: params[1],
              contact: params[2],
              qty: params[3],
              max_price: params[4],
              status: params[5],
              notified_at: params[6],
              consent_at: params[7],
              created_at: params[8],
              metadata: JSON.parse(params[9] || '{}')
            };
            fakeDbRows.push(row);
            return { rows: [row] };
          }
          if (normSql.startsWith('UPDATE demand_alerts SET qty = $1')) {
            const found = fakeDbRows.find(r => r.id === params[4]);
            found.qty = params[0];
            found.max_price = params[1];
            found.consent_at = params[2];
            found.metadata = JSON.parse(params[3] || '{}');
            return { rows: [found] };
          }
          if (normSql.startsWith('SELECT COUNT(DISTINCT contact)::int AS cnt FROM demand_alerts')) {
            const unique = new Set(fakeDbRows.filter(r => r.event_id === params[0] && r.status === 'WAITING').map(r => r.contact));
            return { rows: [{ cnt: unique.size }] };
          }
          if (normSql.startsWith('SELECT COUNT(*)::int AS total FROM demand_alerts')) {
            return { rows: [{ total: fakeDbRows.length }] };
          }
          if (normSql.startsWith('SELECT * FROM demand_alerts')) {
            return { rows: [...fakeDbRows] };
          }
          return { rows: [] };
        }
      };

      try {
        const post1 = await apiRequest('/api/discovery/demand', {
          method: 'POST',
          body: JSON.stringify({ eventId: testEventId, contact: '081255554444', qty: 1, consent: true })
        });
        assert.strictEqual(post1.status, 201);
        assert.strictEqual(post1.data.persisted, true);
        assert.strictEqual(fakeDbRows.length, 1);

        // Duplicate contact on same event updates existing WAITING row instead of duplicating
        const post2 = await apiRequest('/api/discovery/demand', {
          method: 'POST',
          body: JSON.stringify({ eventId: testEventId, contact: '081255554444', qty: 3, maxPrice: 900000, consent: true })
        });
        assert.strictEqual(post2.status, 201);
        assert.strictEqual(fakeDbRows.length, 1);
        assert.strictEqual(fakeDbRows[0].qty, 3);

        const adminRes = await apiRequest('/api/admin/demand-alerts', { headers: authHeader });
        assert.strictEqual(adminRes.status, 200);
        assert.strictEqual(adminRes.data.total, 1);
        assert.strictEqual(adminRes.data.alerts[0].qty, 3);
      } finally {
        demandCapture.requirePersistentStorage = null;
        demandCapture.pool = null;
      }
    });

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`  ALL ${testPassed}/${testTotal} DEMAND CAPTURE TESTS PASSED!`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
