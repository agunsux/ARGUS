/**
 * TIKUM / ARGUS — EPIC EVENT INTELLIGENCE, DISCOVERY & VISUAL ENRICHMENT ACCEPTANCE TEST SUITE
 * 
 * Verifies:
 * 1. Mandatory P0 Invariant: Strict Rp 500,000 price qualification (Part 6 Target Events & Festival Exception)
 * 2. Temporal discovery window (Nov 1, 2026 - Jan 31, 2027) & geographic scoping
 * 3. Visual provenance & SVG fallback poster generator (3:4 ratio, watermark, attribution)
 * 4. Continuous tracking, conflict resolution & admin lock mask (prevent crawler overwrite)
 * 5. Public /events SSR & /api/discovery/events feed (filtering out < 500k events, badge rendering)
 * 6. Admin Event Control Center endpoints & operational dashboard metrics
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const fs = require('fs');

process.env.NODE_ENV = 'test';
if (!process.env.ADMIN_API_KEY) {
  process.env.ADMIN_API_KEY = 'test_admin_api_key_tikum_discovery';
}

const { DiscoveredEvent, PRICE_STATUS } = require('./src/discovery/models/DiscoveredEvent');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventVisualProvenanceService } = require('./src/discovery/EventVisualProvenanceService');
const { EventChangeTrackingService } = require('./src/discovery/EventChangeTrackingService');
const { AdminEventControlService } = require('./src/discovery/AdminEventControlService');
const { getCatalogRepository } = require('./src/discovery/repository');
const { OfficialEventDiscoverySource } = require('./src/discovery/supply/OfficialEventDiscoverySource');
const discoveryRouter = require('./src/discovery/discoveryRouter');
const { state } = require('./src/database');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗ [FAIL]\x1b[0m ${name}`);
    console.error(`      Error: ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('========================================================================');
  console.log('TIKUM — EVENT INTELLIGENCE, DISCOVERY & VISUAL ENRICHMENT SUITE');
  console.log('========================================================================\n');

  // Ingest official discovery events into registry for comprehensive testing
  const discoverySource = new OfficialEventDiscoverySource();
  const rawOfficial = await discoverySource.discover();
  for (const raw of rawOfficial) {
    canonicalRegistry.createEvent({
      id: raw.source_event_id,
      event_id: raw.source_event_id,
      ...raw
    });
  }

  // ===========================================================================
  // SECTION 1: MANDATORY P0 INVARIANT — STRICT RP 500,000 PRICE FILTER
  // ===========================================================================
  console.log('── Section 1: Strict Rp 500.000 Minimum Price Filter Invariant ──');

  await test('1.1 Touché Amoré (min Rp 550.000 >= 500k) evaluates to QUALIFIED', async () => {
    const touche = new DiscoveredEvent({
      id: 'touche-amore-jakarta-2026',
      title: 'Touché Amoré — Asia Tour Jakarta 2026',
      price_min: 550000,
      price_max: 650000,
      price_tiers: [
        { name: 'Presale', price: 550000, currency: 'IDR' },
        { name: 'General Admission', price: 650000, currency: 'IDR' }
      ]
    });
    const status = touche.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.QUALIFIED);
    assert.strictEqual(touche.price_status, PRICE_STATUS.QUALIFIED);
  });

  await test('1.2 King Nassar (Tribun Regular Rp 350.000 < 500k) evaluates to EXCLUDED_PRICE_TOO_LOW', async () => {
    const nassar = new DiscoveredEvent({
      id: 'nassar-lost-in-the-jungle-2026',
      title: 'King Nassar: Lost In The Jungle',
      price_min: 350000,
      price_max: 1200000,
      price_tiers: [
        { name: 'Tribun Regular', price: 350000, currency: 'IDR' },
        { name: 'Festival VIP', price: 1200000, currency: 'IDR' }
      ]
    });
    const status = nassar.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.EXCLUDED_PRICE_TOO_LOW);
    assert.strictEqual(nassar.price_status, PRICE_STATUS.EXCLUDED_PRICE_TOO_LOW);
  });

  await test('1.3 Morgan Jay (GA Rp 650.000 >= 500k) evaluates to QUALIFIED and preserves SOLD_OUT status', async () => {
    const morgan = new DiscoveredEvent({
      id: 'morgan-jay-jakarta-2026',
      title: 'Morgan Jay: The Goofy Guy Tour Jakarta',
      price_min: 650000,
      price_max: 650000,
      price_tiers: [
        { name: 'General Admission', price: 650000, currency: 'IDR' }
      ],
      official_ticket_availability: 'SOLD_OUT'
    });
    const status = morgan.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.QUALIFIED);
    assert.strictEqual(morgan.official_ticket_availability, 'SOLD_OUT');
  });

  await test('1.4 Maddix Live (Presale Rp 450.000 < 500k) evaluates to EXCLUDED_PRICE_TOO_LOW', async () => {
    const maddix = new DiscoveredEvent({
      id: 'maddix-live-tangerang-2026',
      title: 'Maddix — Live in Tangerang 2026',
      price_min: 450000,
      price_max: 650000,
      price_tiers: [
        { name: 'Presale Early', price: 450000, currency: 'IDR' },
        { name: 'General Admission', price: 650000, currency: 'IDR' }
      ]
    });
    const status = maddix.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.EXCLUDED_PRICE_TOO_LOW);
  });

  await test('1.5 DWP 2026 Multi-Day Festival Pass (GA 3-Day Rp 990.000 >= 500k) evaluates to QUALIFIED', async () => {
    const dwp = new DiscoveredEvent({
      id: 'dwp-jakarta-2026',
      title: 'Djakarta Warehouse Project 2026 (DWP)',
      is_festival: true,
      price_min: 990000,
      price_max: 3800000,
      price_tiers: [
        { name: 'GA Early Entry 3-Day Pass', price: 990000, currency: 'IDR' },
        { name: 'GA Presale 3-Day Pass', price: 1250000, currency: 'IDR' },
        { name: 'VIP 3-Day Pass', price: 3800000, currency: 'IDR' }
      ]
    });
    const status = dwp.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.QUALIFIED);
  });

  await test('1.6 BTS World Tour (CAT 7 Rp 1.350.000 >= 500k) evaluates to QUALIFIED', async () => {
    const bts = new DiscoveredEvent({
      id: 'bts-world-tour-arirang-jakarta-2026',
      title: "BTS WORLD TOUR 'ARIRANG' 2026 IN JAKARTA",
      price_min: 1350000,
      price_max: 4200000,
      price_tiers: [
        { name: 'CAT 7 (Restricted View)', price: 1350000, currency: 'IDR' },
        { name: 'CAT 1 VIP Soundcheck', price: 4200000, currency: 'IDR' }
      ]
    });
    const status = bts.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.QUALIFIED);
  });

  await test('1.7 Unannounced / Missing price evaluates to PENDING_VERIFICATION (quarantined)', async () => {
    const tbaEvent = new DiscoveredEvent({
      id: 'mystery-concert-2026',
      title: 'Upcoming Mega Concert 2026',
      price_min: null,
      price_max: null,
      price_tiers: []
    });
    const status = tbaEvent.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.PENDING_VERIFICATION);
    assert.strictEqual(tbaEvent.price_status, PRICE_STATUS.PENDING_VERIFICATION);
  });

  await test('1.8 Resale ticket prices NEVER count toward official price qualification', async () => {
    const sub500Event = new DiscoveredEvent({
      id: 'indie-gig-2026',
      title: 'Indie Band Jakarta 2026',
      price_min: 350000,
      resale_price_min: 750000
    });
    const status = sub500Event.evaluatePriceStatus(500000);
    assert.strictEqual(status, PRICE_STATUS.EXCLUDED_PRICE_TOO_LOW, 'Resale price must not bypass official face value gating');
  });

  // ===========================================================================
  // SECTION 2: TEMPORAL DISCOVERY WINDOW & GEOGRAPHIC INVARIANTS
  // ===========================================================================
  console.log('\n── Section 2: Temporal Window & Geographic Integrity ──');

  await test('2.1 Official discovery source supplies verified target events in Nov 2026 - Jan 2027', async () => {
    const source = new OfficialEventDiscoverySource();
    const rawEvents = await source.fetchUpcomingEvents();
    assert.ok(rawEvents.length >= 10, `Expected at least 10 discovered events, found ${rawEvents.length}`);

    const windowEvents = rawEvents.filter(e => e.start_date >= '2026-11-01' && e.start_date <= '2027-01-31');
    assert.ok(windowEvents.length >= 10, `Expected at least 10 events within Nov 2026 - Jan 2027 window, found ${windowEvents.length}`);

    const validCities = ['Jakarta', 'Tangerang', 'Bandung', 'Surabaya', 'Bali', 'Yogyakarta'];
    for (const ev of windowEvents) {
      const city = ev.venue_city || ev.city;
      assert.ok(validCities.includes(city), `Event city "${city}" must be one of approved target hubs`);
    }
  });

  await test('2.2 Concluded events prior to Nov 1, 2026 are excluded from active discovery', async () => {
    const heroEvents = canonicalRegistry.getHeroEvents({ includePast: true });
    const ye = heroEvents.find(e => e.id === 'kanye-west-ye-tour-jakarta-2026' || e.event_id === 'kanye-west-ye-tour-jakarta-2026');
    assert.ok(ye, 'Historical YE concert must exist in canonical registry hero archive');
    assert.strictEqual(ye.public_visibility, false, 'Concluded YE concert must have public_visibility false');
    assert.strictEqual(ye.homepage_visibility, false, 'Concluded YE concert must have homepage_visibility false');
  });

  // ===========================================================================
  // SECTION 3: VISUAL PROVENANCE & BRANDED SVG FALLBACK GENERATOR
  // ===========================================================================
  console.log('\n── Section 3: Visual Provenance & Branded SVG Fallback Engine ──');

  await test('3.1 EventVisualProvenanceService generates valid 3:4 SVG fallback with branding', async () => {
    const mockEvent = {
      title: 'Touché Amoré — Asia Tour Jakarta 2026',
      artist: 'Touché Amoré',
      category: 'CONCERT',
      start_date: '2026-11-06',
      venue_name: 'Basket Hall Senayan',
      city: 'Jakarta'
    };

    const svg = EventVisualProvenanceService.generateBrandedPosterSvg(mockEvent);
    assert.ok(svg.startsWith('<svg'), 'Poster output must start with <svg tag');
    assert.ok(svg.includes('viewBox="0 0 600 800"'), 'Poster must maintain 3:4 vertical aspect ratio (600x800)');
    assert.ok(svg.includes('TIKUM VERIFIED'), 'Poster must include TIKUM VERIFIED watermark/branding');
    assert.ok(svg.includes('Touché Amoré'), 'Poster must render artist title');
    assert.ok(svg.includes('Basket Hall Senayan'), 'Poster must render venue name');
    assert.ok(svg.includes('Jakarta'), 'Poster must render city name');
  });

  await test('3.2 SVG generator safely escapes XML special characters to prevent injection/malformed XML', async () => {
    const mockEvent = {
      title: 'Rock & Roll <Show> "Special" & \'VIP\'',
      artist: 'Artist & Co <Band>',
      category: 'CONCERT',
      start_date: '2026-12-01',
      venue_name: 'Hall A & B',
      city: 'Jakarta'
    };

    const svg = EventVisualProvenanceService.generateBrandedPosterSvg(mockEvent);
    assert.ok(!svg.includes('<Show>'), 'Raw unescaped HTML/XML tags must be sanitized');
    assert.ok(svg.includes('&amp;'), 'Ampersands must be escaped as &amp;');
    assert.ok(svg.includes('&lt;Show&gt;'), 'Angle brackets must be XML escaped');
  });

  await test('3.3 Official poster assets carry valid attribution and verification status', async () => {
    const source = new OfficialEventDiscoverySource();
    const rawEvents = await source.fetchUpcomingEvents();
    const bts = rawEvents.find(e => e.source_event_id.includes('bts'));
    assert.ok(bts, 'BTS event must be discovered');
    assert.strictEqual(bts.poster_verification_status, 'VERIFIED_OFFICIAL');
    assert.ok(bts.poster_attribution.includes('Big Hit Music') || bts.poster_attribution.includes('HYBE'), 'Attribution must credit official promoter');
  });

  // ===========================================================================
  // SECTION 4: CONTINUOUS TRACKING, AUDIT HISTORY & ADMIN LOCK MASK
  // ===========================================================================
  console.log('\n── Section 4: Continuous Tracking & Conflict Resolution Engine ──');

  await test('4.1 EventChangeTrackingService records diffs between existing and incoming candidate', async () => {
    const existing = {
      id: 'test-event-tracking-1',
      event_id: 'test-event-tracking-1',
      start_date: '2026-11-10',
      venue_name: 'Old Arena',
      min_price: 600000,
      admin_lock_mask: []
    };

    const incoming = {
      id: 'test-event-tracking-1',
      event_id: 'test-event-tracking-1',
      start_date: '2026-11-12',
      venue_name: 'Grand Ballroom',
      min_price: 650000
    };

    const result = EventChangeTrackingService.processCandidateUpdate(existing, incoming, {
      sourceId: 'src-automated-test',
      isAdmin: false
    });

    assert.strictEqual(result.changes.length, 3, 'Must record 3 field changes (start_date, venue_name, min_price)');
    const changedFields = result.changes.map(c => c.field);
    assert.ok(changedFields.includes('start_date'));
    assert.ok(changedFields.includes('venue_name'));
    assert.ok(changedFields.includes('min_price'));
  });

  await test('4.2 Admin Lock Mask strictly prevents automated crawlers from overwriting admin-locked fields', async () => {
    const existing = {
      id: 'test-event-locked-1',
      event_id: 'test-event-locked-1',
      start_date: '2026-11-15',
      venue_name: 'Confirmed Stadium',
      min_price: 750000,
      admin_lock_mask: ['venue_name', 'min_price']
    };

    const incomingCrawler = {
      id: 'test-event-locked-1',
      event_id: 'test-event-locked-1',
      start_date: '2026-11-16',
      venue_name: 'Incorrect Scraped Hall',
      min_price: 300000
    };

    const result = EventChangeTrackingService.processCandidateUpdate(existing, incomingCrawler, {
      sourceId: 'src-automated-crawler',
      isAdmin: false
    });

    assert.strictEqual(result.resolvedEvent.start_date, '2026-11-16');
    assert.strictEqual(result.resolvedEvent.venue_name, 'Confirmed Stadium', 'Locked venue must NOT be overwritten by crawler');
    assert.strictEqual(result.resolvedEvent.min_price, 750000, 'Locked min_price must NOT be overwritten by crawler');
  });

  await test('4.3 Admin updates can override locked fields and record audit history', async () => {
    const existing = {
      id: 'test-event-admin-override',
      event_id: 'test-event-admin-override',
      venue_name: 'Confirmed Stadium',
      admin_lock_mask: ['venue_name']
    };

    const adminEdit = {
      id: 'test-event-admin-override',
      event_id: 'test-event-admin-override',
      venue_name: 'New Authorized Stadium'
    };

    const result = EventChangeTrackingService.processCandidateUpdate(existing, adminEdit, {
      sourceId: 'ADMIN_CONSOLE',
      actorId: 'admin-1',
      isAdmin: true
    });

    assert.strictEqual(result.resolvedEvent.venue_name, 'New Authorized Stadium', 'Admin edit must override locked field');
    assert.strictEqual(result.changes.length, 1);
  });

  await test('4.4 CatalogRepository persists and retrieves field-level change history', async () => {
    const repo = getCatalogRepository();
    const eventId = 'test-change-history-' + Date.now();

    await repo.recordEventChange({
      event_id: eventId,
      field_name: 'min_price',
      old_value: '500000',
      new_value: '650000',
      changed_by: 'admin-1',
      change_reason: 'Promoter phase 2 tier update'
    });

    const history = await repo.getEventChangeHistory(eventId);
    assert.ok(history.length >= 1, 'Must retrieve recorded change from repository');
    assert.strictEqual(history[0].field_name, 'min_price');
    assert.strictEqual(String(history[0].old_value), '500000');
    assert.strictEqual(String(history[0].new_value), '650000');
  });

  // ===========================================================================
  // SECTION 5: PUBLIC CATALOG & SSR FILTERING
  // ===========================================================================
  console.log('\n── Section 5: Public /events SSR & /api/discovery/events HTTP Filtering ──');

  const app = express();
  app.use(express.json());
  app.use(discoveryRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-api-key': process.env.ADMIN_API_KEY,
    'x-user-id': 'admin-1'
  };

  try {
    await test('5.1 /api/discovery/events excludes events below Rp 500.000 by default', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/events`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.events), 'Response must contain events array');

      for (const ev of data.events) {
        if (ev.min_price !== null && ev.min_price !== undefined) {
          assert.ok(ev.min_price >= 500000, `Event "${ev.title}" min_price ${ev.min_price} must be >= 500000`);
        }
        assert.notStrictEqual(ev.price_status, 'EXCLUDED_PRICE_TOO_LOW', `Event "${ev.title}" has EXCLUDED_PRICE_TOO_LOW`);
      }
    });

    await test('5.2 /api/discovery/events supports filtering by city, category, and ticket status', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/events?city=Jakarta&category=CONCERT`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      for (const ev of data.events) {
        assert.strictEqual(ev.city, 'Jakarta');
        assert.strictEqual(ev.category, 'CONCERT');
      }
    });

    await test('5.3 /events SSR HTML page loads successfully and renders filter controls & badges', async () => {
      const res = await fetch(`${baseUrl}/events`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();

      assert.ok(html.includes('Katalog Event Indonesia'), 'Page title must be present');
      assert.ok(html.includes('name="city"'), 'City filter dropdown must be present');
      assert.ok(html.includes('name="category"'), 'Category filter dropdown must be present');
      assert.ok(html.includes('name="price_range"'), 'Price range dropdown with >= 500k options must be present');
      assert.ok(html.includes('ON SALE') || html.includes('SOLD OUT') || html.includes('PRESALE'), 'Status badges must be rendered in HTML');
    });

    // ===========================================================================
    // SECTION 6: ADMIN EVENT CONTROL CENTER & ENDPOINTS
    // ===========================================================================
    console.log('\n── Section 6: Admin Event Control Center APIs & Operations ──');

    const testEventId = 'morgan-jay-jakarta-2026';

    await test('6.1 AdminEventControlService provides real database metrics overview', async () => {
      const dashboard = AdminEventControlService.getControlDashboard();
      assert.ok(dashboard.metrics_overview, 'Dashboard must have metrics_overview');
      assert.ok(typeof dashboard.metrics_overview.total_discovered === 'number');
      assert.ok(typeof dashboard.metrics_overview.verified === 'number');
      assert.ok(typeof dashboard.metrics_overview.on_sale === 'number');
      assert.ok(typeof dashboard.metrics_overview.sold_out === 'number');
      assert.ok(typeof dashboard.metrics_overview.excluded_by_price === 'number');
    });

    await test('6.2 PATCH /api/discovery/admin/events/:id/price updates price and recalculates status', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/admin/events/${testEventId}/price`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          price_min: 700000,
          price_max: 850000,
          lock_fields: true
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.event.min_price, 700000);
      assert.strictEqual(data.event.price_status, PRICE_STATUS.QUALIFIED);
      assert.ok(data.event.admin_lock_mask.includes('min_price'), 'min_price must be added to admin_lock_mask');
    });

    await test('6.3 PATCH /api/discovery/admin/events/:id/details updates venue and locks field', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/admin/events/${testEventId}/details`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          venue_name: 'Nafiri Convention Hall Level 8',
          city: 'Jakarta',
          lock_fields: true
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.event.venue_name, 'Nafiri Convention Hall Level 8');
      assert.ok(data.event.admin_lock_mask.includes('venue_name'));
    });

    await test('6.4 PATCH /api/discovery/admin/events/:id/poster updates poster provenance and status', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/admin/events/${testEventId}/poster`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          poster_url: '/assets/posters/morgan-jay-verified-admin.jpg',
          poster_attribution: 'Mad About Comedy / Megatix Official',
          poster_verification_status: 'VERIFIED_OFFICIAL',
          lock_fields: true
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.event.poster_url, '/assets/posters/morgan-jay-verified-admin.jpg');
      assert.strictEqual(data.event.poster_verification_status, 'VERIFIED_OFFICIAL');
    });

    await test('6.5 POST /api/discovery/admin/events/:id/lock-fields toggles field lock mask', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/admin/events/${testEventId}/lock-fields`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          field: 'start_date',
          locked: true
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.event.admin_lock_mask.includes('start_date'));
    });

    await test('6.6 POST /api/discovery/admin/events/:id/force-verify triggers immediate re-verification', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/admin/events/${testEventId}/force-verify`, {
        method: 'POST',
        headers: adminHeaders
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.event.verification_status, 'VERIFIED');
      assert.ok(data.event.last_verified_at, 'Must update last_verified_at timestamp');
    });

    await test('6.7 GET /api/discovery/admin/events/:id/history returns complete field audit trail', async () => {
      const res = await fetch(`${baseUrl}/api/discovery/admin/events/${testEventId}/history`, {
        headers: adminHeaders
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.history), 'Must return history array');
      assert.ok(data.total_changes >= 1, 'Total changes must be >= 1 after admin edits');
    });

  } finally {
    server.close();
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n========================================================================');
  console.log(`TIKUM EVENT INTELLIGENCE SUITE: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
