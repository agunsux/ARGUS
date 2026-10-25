/**
 * TIKUM / ARGUS — Comprehensive Acceptance Suite
 * EPIC EVENT CATALOG REFRESH, HERO ROTATION & AUTOMATED EVENT LIFECYCLE
 *
 * Verification Gates Tested:
 * - Criterion A: Reference Date 25 Oct 2026 — YE (24 Oct 2026) is strictly NOT upcoming.
 * - Criterion B: Concluded/expired events are strictly disqualified from Hero spotlight & upcoming queries.
 * - Criterion C: Valid source provenance & verified dates required for every published event.
 * - Criterion D: Ticket price gating (minimum Rp 400,000); missing prices quarantined as PRICE_UNVERIFIED.
 * - Criterion E: 90-day rolling discovery window (2026-10-25 to 2027-01-23); idempotent upsert without duplicates.
 * - Criterion F: Deterministic Hero selection: BTS (GBK 26-29 Des 2026) + King Nassar (Istora 7 Nov 2026).
 * - Criterion G: Image provenance and authentic fallbacks (BTS SVG vector poster + fallback).
 * - Criterion H: Unattended automated scheduler execution, single-run advisory locking, and telemetry.
 * - Criterion I: Fault tolerance on anti-bot restrictions (Goers Cloudflare 403 recorded honestly without false deletion).
 * - Criterion J: Zero Fake Inventory invariant & Marketplace/escrow isolation preserved.
 * - Criterion K: Live HTTP endpoints (/api/discovery/hero-concerts, /api/discovery/admin/sync-status, /api/discovery/admin/run-sync).
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const fs = require('fs');

if (!process.env.CRON_SECRET && fs.existsSync('.env.local')) {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    for (const line of envContent.split('\n')) {
      if (line.startsWith('CRON_SECRET=')) {
        process.env.CRON_SECRET = line.split('=')[1].trim();
      }
      if (line.startsWith('ADMIN_API_KEY=')) {
        process.env.ADMIN_API_KEY = line.split('=')[1].trim();
      }
    }
  } catch (_) {}
}
if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = 'test_cron_secret_tikum_lifecycle';
}
if (!process.env.ADMIN_API_KEY) {
  process.env.ADMIN_API_KEY = 'test_admin_api_key_tikum_lifecycle';
}

const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('./src/discovery/EventTemporalLifecycleEngine');
const { HeroSelectionService, MIN_QUALIFYING_PRICE } = require('./src/discovery/HeroSelectionService');
const { dailyCatalogRefreshService, DailyCatalogRefreshService } = require('./src/discovery/DailyCatalogRefreshService');
const { LoketAdapter } = require('./src/discovery/adapters/LoketAdapter');
const { GoersAdapter } = require('./src/discovery/adapters/GoersAdapter');
const discoveryRouter = require('./src/discovery/discoveryRouter');

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
  console.log('TIKUM — EVENT CATALOG REFRESH, HERO ROTATION & LIFECYCLE ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  const REF_DATE = new Date('2026-10-25T18:00:00+07:00');

  // ---------------------------------------------------------------------------
  // CRITERION A: REFERENCE DATE 25 OCT 2026 — YE CONCERT STRICTLY CONCLUDED
  // ---------------------------------------------------------------------------
  await test('Criterion A: YE (24 Oct 2026) is strictly classified as COMPLETED/ARCHIVED on 25 Oct 2026', async () => {
    const heroEvents = canonicalRegistry.getHeroEvents({ includePast: true });
    const yeEvent = heroEvents.find(e => e.id === 'kanye-west-ye-tour-jakarta-2026');
    assert.ok(yeEvent, 'YE concert must exist in historical records');

    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(yeEvent, REF_DATE);
    assert.strictEqual(isUpcoming, false, 'YE concert on 24 Oct 2026 must NOT be upcoming on 25 Oct 2026');

    const lifecycle = EventTemporalLifecycleEngine.resolveLifecycleStatus(yeEvent, REF_DATE);
    assert.ok(['COMPLETED', 'ARCHIVED'].includes(lifecycle), `Expected COMPLETED/ARCHIVED status for YE, got ${lifecycle}`);
  });

  // ---------------------------------------------------------------------------
  // CRITERION B: CONCLUDED EVENTS DISQUALIFIED FROM HERO SPOTLIGHT
  // ---------------------------------------------------------------------------
  await test('Criterion B: Completed/concluded events are disqualified from Hero spotlight and active feeds', async () => {
    const heroEvents = canonicalRegistry.getHeroEvents({ includePast: true });
    const yeEvent = heroEvents.find(e => e.id === 'kanye-west-ye-tour-jakarta-2026');

    const eligibility = HeroSelectionService.evaluateEligibility(yeEvent, REF_DATE);
    assert.strictEqual(eligibility.eligible, false, 'YE concert must be strictly disqualified from Hero spotlight');
    assert.ok(
      ['COMPLETED_OR_ARCHIVED', 'EVENT_CONCLUDED_PAST'].includes(eligibility.reason),
      `Disqualification reason must reflect concluded event, got ${eligibility.reason}`
    );

    // Verify active hero concerts call does not contain YE
    const activeHeroes = canonicalRegistry.getHeroEvents();
    assert.strictEqual(activeHeroes.some(h => h.id === yeEvent.id), false, 'YE must not be returned in active getHeroEvents()');
  });

  // ---------------------------------------------------------------------------
  // CRITERION C: SOURCE PROVENANCE & DATE VERIFICATION
  // ---------------------------------------------------------------------------
  await test('Criterion C: Every qualified event carries verified promoter authority and ISO dates', async () => {
    const heroes = canonicalRegistry.getHeroEvents();
    for (const h of heroes) {
      assert.ok(h.start_date, `Event ${h.id} must have a start_date`);
      assert.ok(h.venue_name || h.venue, `Event ${h.id} must have a venue`);
      assert.ok(h.city || h.venue_city, `Event ${h.id} must have a city`);
      assert.strictEqual(h.is_verified, true, `Event ${h.id} must be verified`);
      assert.ok(h.official_event_url || h.official_ticket_url, `Event ${h.id} must have an official link`);
    }
  });

  // ---------------------------------------------------------------------------
  // CRITERION D: TICKET PRICE GATING (MINIMUM RP 400,000)
  // ---------------------------------------------------------------------------
  await test('Criterion D: Price gating enforces minimum Rp 400,000 threshold and quarantines unverified prices', async () => {
    const refreshService = new DailyCatalogRefreshService();

    // 1. Below 400k
    const cheapEvent = { id: 'cheap-1', title: 'Local Indie Night', min_price: 150000, max_price: 250000 };
    const evalCheap = refreshService.evaluatePriceEligibility(cheapEvent);
    assert.strictEqual(evalCheap.qualified, false);
    assert.strictEqual(evalCheap.reason, 'EXCLUDED_PRICE_TOO_LOW');

    // 2. Unverified / Missing Price
    const missingPriceEvent = { id: 'missing-1', title: 'Unannounced Fest', min_price: null, max_price: null };
    const evalMissing = refreshService.evaluatePriceEligibility(missingPriceEvent);
    assert.strictEqual(evalMissing.qualified, false);
    assert.strictEqual(evalMissing.reason, 'PRICE_UNVERIFIED');

    // 3. Multi-tier meeting threshold (e.g. VIP >= 400k, General < 400k)
    const tieredEvent = {
      id: 'tiered-1',
      title: 'City Marathon & Concert',
      min_price: 250000,
      max_price: 750000,
      price_tiers: [
        { name: 'Regular Entry', price: 250000 },
        { name: 'VIP Pass', price: 750000 }
      ]
    };
    const evalTiered = refreshService.evaluatePriceEligibility(tieredEvent);
    assert.strictEqual(evalTiered.qualified, true);
    assert.strictEqual(evalTiered.eligible_min_price, 750000, 'Must surface cheapest ELIGIBLE tier >= Rp 400k');

    // 4. BTS Pricing (1.35M to 4.5M)
    const btsEvent = {
      id: 'bts-1',
      title: "BTS WORLD TOUR 'ARIRANG'",
      min_price: 1350000,
      max_price: 4500000
    };
    const evalBts = refreshService.evaluatePriceEligibility(btsEvent);
    assert.strictEqual(evalBts.qualified, true);
    assert.strictEqual(evalBts.eligible_min_price, 1350000);
  });

  // ---------------------------------------------------------------------------
  // CRITERION E: 90-DAY ROLLING DISCOVERY WINDOW & IDEMPOTENT UPSERT
  // ---------------------------------------------------------------------------
  await test('Criterion E: 90-day rolling discovery window ingests Loket events idempotently', async () => {
    const report1 = await dailyCatalogRefreshService.runDailyRefresh({
      asOfDate: REF_DATE,
      dryRun: false
    });

    assert.strictEqual(report1.status, 'SUCCESS');
    assert.strictEqual(report1.discovery_window.days, 90);
    assert.strictEqual(report1.discovery_window.start, '2026-10-25');
    assert.strictEqual(report1.discovery_window.end, '2027-01-23');
    assert.ok(report1.events_discovered > 0, 'Must discover events from Loket');
    assert.ok(report1.sources.loket.qualified_count > 0, 'Must qualify events meeting price threshold');

    // Second run must be idempotent (zero new duplicate records created)
    const initialSize = canonicalRegistry.getAllEvents().length;
    const report2 = await dailyCatalogRefreshService.runDailyRefresh({
      asOfDate: REF_DATE,
      dryRun: false,
      force: true
    });

    assert.strictEqual(report2.status, 'SUCCESS');
    assert.strictEqual(report2.events_inserted, 0, 'Repeated run must not insert duplicate events');
    assert.strictEqual(canonicalRegistry.getAllEvents().length, initialSize, 'Canonical registry size must remain unchanged');
  });

  // ---------------------------------------------------------------------------
  // CRITERION F: HERO SELECTION ROTATES TO BTS + NASSAR
  // ---------------------------------------------------------------------------
  await test('Criterion F: Hero selection selects BTS as primary hero and King Nassar as secondary hero', async () => {
    const heroResult = HeroSelectionService.selectHeroConcerts(REF_DATE);
    assert.strictEqual(heroResult.count, 2, 'Must select exactly 2 hero concerts');

    const primary = heroResult.primaryHero;
    const secondary = heroResult.secondaryHero;

    assert.ok(primary, 'Primary hero must be present');
    assert.ok(primary.title.includes('BTS'), `Primary hero must be BTS, got: ${primary.title}`);
    assert.strictEqual(primary.date, '2026-12-26');
    assert.strictEqual(primary.venue_name, 'Gelora Bung Karno (Main Stadium)');
    assert.strictEqual(primary.min_price, 1350000);
    assert.strictEqual(primary.primary_ticket_status, 'SOLD_OUT');
    assert.strictEqual(primary.resale_inventory_count, 0, 'Zero fake inventory rule: resale count must be 0');
    assert.strictEqual(primary.resale_available, false);

    assert.ok(secondary, 'Secondary hero must be present');
    assert.ok(secondary.title.includes('Nassar'), `Secondary hero must be King Nassar, got: ${secondary.title}`);
    assert.strictEqual(secondary.date, '2026-11-07');
    assert.strictEqual(secondary.venue_name, 'Istora Senayan Jakarta');
    assert.strictEqual(secondary.min_price, 500000);
    assert.strictEqual(secondary.primary_ticket_status, 'SOLD_OUT');
    assert.strictEqual(secondary.resale_inventory_count, 0);
  });

  // ---------------------------------------------------------------------------
  // CRITERION G: EVENT IMAGE PROVENANCE & FALLBACK RENDERING
  // ---------------------------------------------------------------------------
  await test('Criterion G: Event images use verified official assets and legitimate fallbacks', async () => {
    const fs = require('fs');
    const btsPosterPath = './public/assets/posters/bts-arirang-world-tour-jakarta-2026.svg';
    const btsFallbackPath = './public/assets/placeholder-bts.svg';

    assert.ok(fs.existsSync(btsPosterPath), 'BTS official vector poster SVG must exist on disk');
    assert.ok(fs.existsSync(btsFallbackPath), 'BTS fallback banner SVG must exist on disk');

    const posterContent = fs.readFileSync(btsPosterPath, 'utf8');
    assert.ok(posterContent.includes('ARIRANG'), 'Poster must feature ARIRANG branding');
    assert.ok(posterContent.includes('GELORA BUNG KARNO'), 'Poster must feature venue');
  });

  // ---------------------------------------------------------------------------
  // CRITERION H: UNATTENDED SCHEDULING & SINGLE-RUN ADVISORY LOCK
  // ---------------------------------------------------------------------------
  await test('Criterion H: Refresh service enforces single-run advisory locking against overlapping runs', async () => {
    const service = new DailyCatalogRefreshService();

    // Simulate an ongoing run
    service._isSyncRunning = true;
    const concurrentAttempt = await service.runDailyRefresh();
    assert.strictEqual(concurrentAttempt.status, 'LOCKED');
    assert.ok(concurrentAttempt.message.includes('already in progress'));

    service._isSyncRunning = false;
  });

  // ---------------------------------------------------------------------------
  // CRITERION I: SOURCE FAULT TOLERANCE (GOERS CLOUDFLARE TELEMETRY)
  // ---------------------------------------------------------------------------
  await test('Criterion I: Goers Cloudflare status is recorded honestly without crashing or deleting data', async () => {
    const goersAdapter = new GoersAdapter();
    const probe = await goersAdapter.probePublicWeb();

    assert.strictEqual(probe.endpoint, 'https://www.goersapp.com/events');
    assert.ok([200, 403].includes(probe.http_status), `Goers must return valid HTTP status (200 or 403 challenge), got ${probe.http_status}`);
    if (probe.http_status === 403) {
      assert.strictEqual(probe.is_blocked, true);
      assert.strictEqual(probe.reason, 'CLOUDFLARE_BOT_MANAGEMENT_CHALLENGE');
    }

    // Ensure catalog refresh records this telemetry honestly
    const status = dailyCatalogRefreshService.getStatus();
    assert.ok(status.last_telemetry, 'Must have last run telemetry');
    const goersTelemetry = status.last_telemetry.sources.goers;
    assert.ok(['BLOCKED_BY_CLOUDFLARE_403', 'ONLINE'].includes(goersTelemetry.status));
    assert.strictEqual(goersTelemetry.policy_adherence, 'PASSIVE_MODE_NO_BYPASS');
  });

  // ---------------------------------------------------------------------------
  // CRITERION J: ZERO FAKE INVENTORY & MARKETPLACE INTEGRITY
  // ---------------------------------------------------------------------------
  await test('Criterion J: Zero Fake Inventory invariant is preserved across all hero and catalog responses', async () => {
    const heroes = canonicalRegistry.getHeroEvents();
    for (const h of heroes) {
      assert.strictEqual(h.resale_inventory_count, 0, 'Resale inventory count must be 0 for primary sold out events');
      assert.strictEqual(h.resale_available, false);
    }
  });

  // ---------------------------------------------------------------------------
  // CRITERION K: HTTP ENDPOINTS INTEGRATION (/hero-concerts, /admin/sync-status, /admin/run-sync)
  // ---------------------------------------------------------------------------
  await test('Criterion K: HTTP endpoints serve active heroes and administrative synchronization controls', async () => {
    const app = express();
    app.use(express.json());
    app.use(discoveryRouter);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    try {
      // 1. GET /api/discovery/hero-concerts
      const heroRes = await fetch(`http://127.0.0.1:${port}/api/discovery/hero-concerts`);
      assert.strictEqual(heroRes.status, 200);
      const heroData = await heroRes.json();
      assert.strictEqual(heroData.success, true);
      assert.strictEqual(heroData.count, 2);

      const btsHero = heroData.concerts.find(c => c.title.includes('BTS'));
      assert.ok(btsHero, 'BTS hero card must be present');
      assert.strictEqual(btsHero.primary_ticket_status, 'SOLD_OUT');
      assert.strictEqual(btsHero.resale_inventory_count, 0);

      const nassarHero = heroData.concerts.find(c => c.title.includes('Nassar'));
      assert.ok(nassarHero, 'King Nassar hero card must be present');
      assert.strictEqual(nassarHero.primary_ticket_status, 'SOLD_OUT');
      assert.strictEqual(nassarHero.resale_inventory_count, 0);

      // 2. GET /api/discovery/admin/sync-status
      const statusRes = await fetch(`http://127.0.0.1:${port}/api/discovery/admin/sync-status`, {
        headers: { 'x-admin-api-key': process.env.ADMIN_API_KEY }
      });
      assert.strictEqual(statusRes.status, 200);
      const statusData = await statusRes.json();
      assert.strictEqual(statusData.success, true);
      assert.ok(statusData.next_scheduled_run, 'Must expose next_scheduled_run');
      assert.ok(statusData.last_telemetry, 'Must expose last_telemetry');

      // 3. POST /api/discovery/admin/run-sync
      const reqHeaders = {
        'Content-Type': 'application/json',
        'x-admin-api-key': process.env.ADMIN_API_KEY
      };
      if (process.env.CRON_SECRET) {
        reqHeaders['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
      }
      const runRes = await fetch(`http://127.0.0.1:${port}/api/discovery/admin/run-sync`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ dryRun: true, asOfDate: '2026-10-25T18:00:00+07:00' })
      });
      assert.strictEqual(runRes.status, 200);
      const runData = await runRes.json();
      assert.strictEqual(runData.success, true);
      assert.strictEqual(runData.dry_run, true);
      assert.strictEqual(runData.status, 'SUCCESS');
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  console.log('\n========================================================================');
  console.log(`  TIKUM CATALOG REFRESH & HERO LIFECYCLE: ${passed} passed, ${failed} failed`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSuite();
}

module.exports = { runSuite };
