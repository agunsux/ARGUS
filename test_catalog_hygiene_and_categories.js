'use strict';
/**
 * Stage 4 Catalog Hygiene & Sports/Comedy Categories Verification Suite (OFFLINE ONLY)
 *
 * Proves:
 * 1. Locked CanonicalEventRegistry.js stale/dupe/unverified fallback IDs are blocked from
 *    /api/mvp/events & /events.
 * 2. POST /api/mvp/seller/listing on past/terminal/suppressed event returns HTTP 400 EVENT_ALREADY_PASSED.
 * 3. /events?category=SPORTS|COMEDY and aliases (SPORT, OLAHRAGA, STANDUP, STAND_UP_COMEDY, KOMEDI)
 *    return HTTP 200 with localized headings/empty states across locales and never leak past events.
 * 4. Custom event registration (POST /api/mvp/events) accepts SPORTS and COMEDY cleanly.
 * 5. MIN_LISTING_PRICE_IDR === 500000 preserved.
 */

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.TARGET_DATABASE_URL;
delete process.env.SUPABASE_DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;

const assert = require('assert');
const http = require('http');
const express = require('express');

const policy = require('./src/discovery/CatalogHygienePolicy');
const { PRICING_CONFIG } = require('./src/config/pricingConfig');
const { state } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { SessionStore } = require('./src/services/sessionStore');
const mvpRouter = require('./src/api/mvpRouter');
const discoveryRouter = require('./src/discovery/discoveryRouter');

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

function httpReq(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ hostname: '127.0.0.1', port, path: reqPath, method, headers: reqHeaders }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

(async () => {
  canonicalRegistry._hydratedFromRepo = true;
  const origUsers = [...(state.users || [])];
  const origProfiles = [...(state.seller_profiles || [])];
  const origEvents = [...(state.events || [])];

  const sellerId = 'seller-stage4-hygiene';
  state.users.push({
    id: sellerId,
    email: 'seller.stage4@tikum.test',
    name: 'Stage4 Seller',
    display_name: 'Stage4 Seller',
    phone: '+6281234567891',
    role: 'SELLER',
    status: 'ACTIVE',
    email_verified: true,
    metadata: {
      email_verified: true,
      email_verified_at: '2026-11-01T00:00:00.000Z',
      full_name: 'Stage4 Seller',
      whatsapp: '+6281234567891',
      address: 'Jl. Asia Afrika, Bandung',
      city: 'Bandung',
      payout_bank_name: 'BCA',
      payout_account_number: '9876543210',
      identity_doc_ref: 'KTP-STAGE4-OK'
    }
  });
  if (!state.seller_profiles) state.seller_profiles = [];
  state.seller_profiles.push({
    user_id: sellerId,
    kyc_status: 'VERIFIED',
    status: 'ACTIVE',
    suspended: false,
    payout_bank: 'BCA',
    payout_account_masked: '******3210',
    nik_hash: 'sha256-stage4-nik',
    active_listing_limit: 20
  });
  const session = SessionStore.createSession({ userId: sellerId, role: 'SELLER' });
  if (!state.sessions) state.sessions = [];
  state.sessions.push(session);

  const verifiedBase = {
    is_verified: true,
    verification_status: 'PRIMARY_SOURCE_VERIFIED',
    public_visibility: true,
    homepage_visibility: true,
    min_price: 750000,
    max_price: 2000000,
    lowest_official_price: 750000,
    price_status: 'QUALIFIED',
    source_url: 'https://official.example/stage4',
    official_event_url: 'https://official.example/stage4',
    official_ticket_url: 'https://official.example/stage4/tickets',
    evidence_hash: 'sha256-stage4-proof',
    verified_at: '2026-11-20T00:00:00.000Z',
    city: 'Jakarta',
    venue_city: 'Jakarta',
    country: 'Indonesia',
    status: 'UPCOMING',
    lifecycle_status: 'UPCOMING',
    archive_status: 'ACTIVE'
  };

  // Seed stale/duplicate/unverified fallback IDs + one clean upcoming concert
  const seeded = [
    { ...verifiedBase, id: 'event-mcr-jakarta-2026', event_id: 'event-mcr-jakarta-2026', slug: 'mcr-jkt', title: 'My Chemical Romance — Live in Jakarta', name: 'My Chemical Romance — Live in Jakarta', canonical_name: 'My Chemical Romance — Live in Jakarta', start_date: '2026-11-28', date: '2026-11-28', venue: 'JIS', venue_name: 'JIS', category: 'CONCERT' },
    { ...verifiedBase, id: 'ev-can-afa-id-2026', event_id: 'ev-can-afa-id-2026', slug: 'afa-id', title: 'AFA ID 2026 Music Fest', name: 'AFA ID 2026 Music Fest', canonical_name: 'AFA ID 2026 Music Fest', start_date: '2026-11-28', date: '2026-11-28', venue: 'GBK', venue_name: 'GBK', category: 'FESTIVAL' },
    { ...verifiedBase, id: 'ev-can-36de50c4', event_id: 'ev-can-36de50c4', slug: 'bigbang-dup-1', title: 'BIGBANG Dup 1', name: 'BIGBANG Dup 1', canonical_name: 'BIGBANG Dup 1', start_date: '2027-01-16', date: '2027-01-16', venue: 'JIS', venue_name: 'JIS', category: 'CONCERT' },
    { ...verifiedBase, id: 'evt_bigbang-jakarta-2027', event_id: 'evt_bigbang-jakarta-2027', slug: 'bigbang-dup-2', title: 'BIGBANG Dup 2', name: 'BIGBANG Dup 2', canonical_name: 'BIGBANG Dup 2', start_date: '2027-01-16', date: '2027-01-16', venue: 'JIS', venue_name: 'JIS', category: 'CONCERT' },
    { ...verifiedBase, id: 'evt_celestix_the_15th_efestaphoria_539', event_id: 'evt_celestix_the_15th_efestaphoria_539', slug: 'efes-dup', title: 'Efestaphoria Dup', name: 'Efestaphoria Dup', canonical_name: 'Efestaphoria Dup', start_date: '2026-12-06', date: '2026-12-06', venue: 'Surabaya Expo', venue_name: 'Surabaya Expo', category: 'CONCERT' },
    { ...verifiedBase, id: 'event-joyland-2026', event_id: 'event-joyland-2026', slug: 'joyland-legacy', title: 'Joyland Legacy Seed', name: 'Joyland Legacy Seed', canonical_name: 'Joyland Legacy Seed', start_date: '2026-11-27', date: '2026-11-27', venue: 'GBK', venue_name: 'GBK', category: 'FESTIVAL' },
    { ...verifiedBase, id: 'ev-can-midnight-soul-garden-2027', event_id: 'ev-can-midnight-soul-garden-2027', slug: 'nye-flag-1', title: 'Midnight Soul Garden NYE 2027 Gala', name: 'Midnight Soul Garden NYE 2027 Gala', canonical_name: 'Midnight Soul Garden NYE 2027 Gala', start_date: '2026-12-31', date: '2026-12-31', venue: 'Grand Sahid', venue_name: 'Grand Sahid', category: 'CONCERT' },
    { ...verifiedBase, id: 'ev-can-odyssey-nye-2027', event_id: 'ev-can-odyssey-nye-2027', slug: 'nye-flag-2', title: 'Odyssey NYE 2027', name: 'Odyssey NYE 2027', canonical_name: 'Odyssey NYE 2027', start_date: '2026-12-31', date: '2026-12-31', venue: 'La Piazza', venue_name: 'La Piazza', category: 'CONCERT' },
    { ...verifiedBase, id: 'ev-past-sports-2026', event_id: 'ev-past-sports-2026', slug: 'past-sports-2026', title: 'Past Basketball Finals 2026', name: 'Past Basketball Finals 2026', canonical_name: 'Past Basketball Finals 2026', start_date: '2026-09-22', date: '2026-09-22', venue: 'Indonesia Arena', venue_name: 'Indonesia Arena', category: 'SPORTS', event_type: 'SPORTS' },
    { ...verifiedBase, id: 'ev-past-comedy-2026', event_id: 'ev-past-comedy-2026', slug: 'past-comedy-2026', title: 'Past Standup Special 2026', name: 'Past Standup Special 2026', canonical_name: 'Past Standup Special 2026', start_date: '2026-10-10', date: '2026-10-10', venue: 'Balai Kartini', venue_name: 'Balai Kartini', category: 'COMEDY', event_type: 'COMEDY' },
    { ...verifiedBase, id: 'bigbang-cosmos-tour-jakarta-2027', event_id: 'bigbang-cosmos-tour-jakarta-2027', slug: 'bigbang-cosmos-tour-jakarta-2027', title: 'BIGBANG 2026–2027 WORLD TOUR < XX : COSMOS > IN JAKARTA', name: 'BIGBANG 2026–2027 WORLD TOUR < XX : COSMOS > IN JAKARTA', canonical_name: 'BIGBANG 2026–2027 WORLD TOUR < XX : COSMOS > IN JAKARTA', start_date: '2027-01-16', date: '2027-01-16', venue: 'JIS', venue_name: 'JIS', category: 'CONCERT', event_type: 'CONCERT' }
  ];

  state.events.length = 0;
  canonicalRegistry.events.clear();
  for (const ev of seeded) {
    state.events.push(ev);
    canonicalRegistry.events.set(ev.id, ev);
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/mvp', mvpRouter);
  app.use(discoveryRouter);

  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const authHeaders = { authorization: `Bearer ${session.session_token}`, 'x-user-id': sellerId };

  try {
    await check('MIN_LISTING_PRICE_IDR === 500000 invariant preserved', () => {
      assert.strictEqual(PRICING_CONFIG.MIN_LISTING_PRICE_IDR, 500000);
    });

    await check('Suppressed/stale/duplicate fallback IDs blocked from GET /api/mvp/events', async () => {
      const res = await httpReq(port, 'GET', '/api/mvp/events');
      assert.strictEqual(res.status, 200);
      const ids = new Set((res.json?.events || []).map(e => e.id));
      for (const blocked of [
        'event-mcr-jakarta-2026',
        'ev-can-afa-id-2026',
        'ev-can-36de50c4',
        'evt_bigbang-jakarta-2027',
        'evt_celestix_the_15th_efestaphoria_539',
        'event-joyland-2026',
        'ev-can-midnight-soul-garden-2027',
        'ev-can-odyssey-nye-2027',
        'ev-past-sports-2026',
        'ev-past-comedy-2026'
      ]) {
        assert.strictEqual(ids.has(blocked), false, `Suppressed/past event ${blocked} leaked into /api/mvp/events`);
      }
      assert.strictEqual(ids.has('bigbang-cosmos-tour-jakarta-2027'), true);
    });

    await check('Suppressed/stale/duplicate fallback IDs blocked from GET /events', async () => {
      const res = await httpReq(port, 'GET', '/events');
      assert.strictEqual(res.status, 200);
      for (const leaked of ['My Chemical Romance', 'AFA ID 2026', 'BIGBANG Dup 1', 'BIGBANG Dup 2', 'Efestaphoria Dup', 'Joyland Legacy Seed', 'Midnight Soul Garden', 'Odyssey NYE']) {
        assert.strictEqual(res.text.includes(leaked), false, `Suppressed/past "${leaked}" leaked into GET /events`);
      }
      assert.strictEqual(res.text.includes('bigbang-cosmos-tour-jakarta-2027'), true);
    });

    await check('POST /api/mvp/seller/listing returns HTTP 400 EVENT_ALREADY_PASSED on past & suppressed events', async () => {
      for (const badId of ['event-mcr-jakarta-2026', 'ev-past-sports-2026', 'ev-can-36de50c4', 'event-joyland-2026']) {
        const res = await httpReq(port, 'POST', '/api/mvp/seller/listing', {
          headers: authHeaders,
          body: {
            eventId: badId,
            seatInfo: 'CAT 1',
            faceValue: 750000,
            price: 750000,
            rawBarcode: `BC-${badId}-${Date.now()}`,
            quantity: 1,
            fulfillmentType: 'SELLER_MANAGED'
          }
        });
        assert.strictEqual(res.status, 400, `Expected HTTP 400 for ${badId}, got ${res.status}`);
        assert.strictEqual(res.json?.code, 'EVENT_ALREADY_PASSED');
      }
    });

    await check('GET /events?category=SPORTS and aliases (SPORT, OLAHRAGA) return 200 with clean empty state and zero past events', async () => {
      for (const qCat of ['SPORTS', 'SPORT', 'OLAHRAGA']) {
        const res = await httpReq(port, 'GET', `/events?category=${qCat}`);
        assert.strictEqual(res.status, 200, `Failed for category=${qCat}`);
        assert.strictEqual(res.text.includes('Past Basketball Finals 2026'), false, `Past sports event leaked for ${qCat}`);
        assert.strictEqual(res.text.includes('data-empty-category="SPORTS"'), true, `Missing SPORTS empty state for ${qCat}`);
      }
      const thRes = await httpReq(port, 'GET', '/events?category=SPORTS&lang=th');
      assert.strictEqual(thRes.status, 200);
      assert.strictEqual(thRes.text.includes('<html lang="th"'), true);
      assert.strictEqual(/[\u0E00-\u0E7F]/.test(thRes.text), true);
    });

    await check('GET /events?category=COMEDY and aliases (STANDUP, STAND_UP_COMEDY, KOMEDI) return 200 with clean empty state and zero past events', async () => {
      for (const qCat of ['COMEDY', 'STANDUP', 'STAND_UP_COMEDY', 'KOMEDI']) {
        const res = await httpReq(port, 'GET', `/events?category=${qCat}`);
        assert.strictEqual(res.status, 200, `Failed for category=${qCat}`);
        assert.strictEqual(res.text.includes('Past Standup Special 2026'), false, `Past comedy event leaked for ${qCat}`);
        assert.strictEqual(res.text.includes('data-empty-category="COMEDY"'), true, `Missing COMEDY empty state for ${qCat}`);
      }
    });

    await check('POST /api/mvp/events custom event registration accepts SPORTS and COMEDY (and normalizes aliases)', async () => {
      const sportRes = await httpReq(port, 'POST', '/api/mvp/events', {
        headers: authHeaders,
        body: {
          name: 'Jakarta Pro Basketball Invitational 2027',
          venue_name: 'Indonesia Arena',
          venue_city: 'Jakarta',
          start_date: '2027-03-15',
          category: 'SPORTS'
        }
      });
      assert.strictEqual(sportRes.status, 201, `SPORTS registration failed: ${sportRes.text}`);
      assert.strictEqual(sportRes.json?.event?.category, 'SPORTS');

      const comedyRes = await httpReq(port, 'POST', '/api/mvp/events', {
        headers: authHeaders,
        body: {
          name: 'Bandung Stand-Up Comedy Night 2027',
          venue_name: 'Trans Studio Convention Center',
          venue_city: 'Bandung',
          start_date: '2027-04-02',
          category: 'COMEDY'
        }
      });
      assert.strictEqual(comedyRes.status, 201, `COMEDY registration failed: ${comedyRes.text}`);
      assert.strictEqual(comedyRes.json?.event?.category, 'COMEDY');

      const aliasRes = await httpReq(port, 'POST', '/api/mvp/events', {
        headers: authHeaders,
        body: {
          name: 'Surabaya Open Badminton Challenge 2027',
          venue_name: 'DBL Arena',
          venue_city: 'Surabaya',
          start_date: '2027-05-01',
          category: 'OLAHRAGA'
        }
      });
      assert.strictEqual(aliasRes.status, 201, `OLAHRAGA alias registration failed: ${aliasRes.text}`);
      assert.strictEqual(aliasRes.json?.event?.category, 'SPORTS');
    });

    await check('CatalogHygienePolicy.normalizeCategory handles all SPORTS and COMEDY aliases', () => {
      assert.strictEqual(policy.normalizeCategory('SPORT'), 'SPORTS');
      assert.strictEqual(policy.normalizeCategory('OLAHRAGA'), 'SPORTS');
      assert.strictEqual(policy.normalizeCategory('STANDUP'), 'COMEDY');
      assert.strictEqual(policy.normalizeCategory('STAND_UP_COMEDY'), 'COMEDY');
      assert.strictEqual(policy.normalizeCategory('STANDUP_COMEDY'), 'COMEDY');
      assert.strictEqual(policy.normalizeCategory('KOMEDI'), 'COMEDY');
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    state.users = origUsers;
    state.seller_profiles = origProfiles;
    state.events = origEvents;
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
