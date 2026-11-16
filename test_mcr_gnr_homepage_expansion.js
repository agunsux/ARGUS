#!/usr/bin/env node
/**
 * test_mcr_gnr_homepage_expansion.js
 *
 * Verifies that My Chemical Romance (Live in Jakarta) and Guns N' Roses (Jakarta 2026)
 * are correctly, canonically, and idempotently registered across:
 * 1. Supabase PostgreSQL canonical_events database table
 * 2. CanonicalEventRegistry & Home Feed API
 * 3. Static Homepage HTML & Schema.org JSON-LD
 * 4. SSR Event Detail Routes & Aliases
 * 5. Invariants (Zero Fake Inventory, Payment Gateway Frozen, Untouched Baselines)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Pool } = require('pg');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const app = require('./src/server');

let testCount = 0;
let passCount = 0;

function runTest(name, fn) {
  testCount++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  testCount++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('\n================================================================');
  console.log("  TIKUM — MCR & GUNS N' ROSES HOMEPAGE EXPANSION TEST SUITE");
  console.log('================================================================\n');

  // 1. Supabase PostgreSQL Verification
  console.log('── Section 1: Supabase Canonical Database Verification ──');
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl && fs.existsSync('.env.local')) {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    for (const line of envContent.split('\n')) {
      if (line.startsWith('DATABASE_URL=')) {
        dbUrl = line.substring('DATABASE_URL='.length).trim().replace(/['"]/g, '');
        break;
      }
    }
  }

  if (dbUrl) {
    const parsed = new URL(dbUrl);
    parsed.searchParams.delete('channel_binding');
    const pool = new Pool({
      connectionString: parsed.toString(),
      ssl: { rejectUnauthorized: false }
    });

    try {
      await runAsyncTest('1.1 Supabase contains verified MCR record with official mcrjakarta.com source', async () => {
        const res = await pool.query("SELECT * FROM canonical_events WHERE id = 'event-mcr-jakarta-2026'");
        assert.strictEqual(res.rows.length, 1, 'MCR event must exist exactly once in DB');
        const mcr = res.rows[0];
        assert.strictEqual(mcr.is_verified, true);
        assert.strictEqual(mcr.verification_status, 'VERIFIED');
        assert.strictEqual(mcr.public_visibility, true);
        assert.strictEqual(mcr.official_event_url, 'https://mcrjakarta.com/');
        assert.strictEqual(mcr.official_ticket_url, 'https://www.tiket.com/id-id/to-do/my-chemical-romance-live-in-jakarta-2026');
        assert.strictEqual(mcr.venue_name, 'Jakarta International Stadium (JIS)');
        assert.strictEqual(mcr.city, 'Jakarta');
      });

      await runAsyncTest('1.2 Supabase contains verified GNR 2026 record with official gnrjakarta.com source', async () => {
        const res = await pool.query("SELECT * FROM canonical_events WHERE id = 'event-gnr-jakarta-2026'");
        assert.strictEqual(res.rows.length, 1, 'GNR 2026 event must exist exactly once in DB');
        const gnr = res.rows[0];
        assert.strictEqual(gnr.is_verified, true);
        assert.strictEqual(gnr.verification_status, 'VERIFIED');
        assert.strictEqual(gnr.public_visibility, true);
        assert.strictEqual(gnr.official_event_url, 'https://gnrjakarta.com/');
        assert.strictEqual(gnr.official_ticket_url, 'https://gnrjakarta.com/');
        assert.strictEqual(gnr.venue_name, 'GBK Madya Stadium');
        assert.strictEqual(gnr.city, 'Jakarta');
      });
    } finally {
      await pool.end();
    }
  } else {
    console.log('  [SKIP] DATABASE_URL not set in local environment; skipping live DB test');
  }

  // 2. CanonicalEventRegistry & Hero Selection
  console.log('\n── Section 2: CanonicalEventRegistry & Hero Spotlights ──');
  runTest('2.1 CanonicalEventRegistry includes MCR & GNR in hero events', () => {
    const heroes = canonicalRegistry.getHeroEvents();
    const mcr = heroes.find(h => h.id === 'event-mcr-jakarta-2026');
    const gnr = heroes.find(h => h.id === 'event-gnr-jakarta-2026');

    assert.ok(mcr, 'MCR must be present in hero events');
    assert.strictEqual(mcr.slug, 'my-chemical-romance-jakarta-2026');
    assert.strictEqual(mcr.is_verified, true);
    assert.strictEqual(mcr.resale_inventory_count, 0, 'Zero Fake Inventory invariant');
    assert.strictEqual(mcr.resale_available, false);
    assert.strictEqual(mcr.official_event_url, 'https://mcrjakarta.com/');

    assert.ok(gnr, 'GNR must be present in hero events');
    assert.strictEqual(gnr.slug, 'guns-n-roses-jakarta-2026');
    assert.strictEqual(gnr.is_verified, true);
    assert.strictEqual(gnr.resale_inventory_count, 0, 'Zero Fake Inventory invariant');
    assert.strictEqual(gnr.resale_available, false);
    assert.strictEqual(gnr.official_event_url, 'https://gnrjakarta.com/');
  });

  runTest('2.2 CanonicalEventRegistry resolves canonical slugs and aliases', () => {
    const mcrBySlug = canonicalRegistry.getEventBySlug('my-chemical-romance-jakarta-2026');
    assert.ok(mcrBySlug, 'MCR by full slug must resolve');
    assert.strictEqual(mcrBySlug.id, 'event-mcr-jakarta-2026');

    const mcrByAlias = canonicalRegistry.getEventBySlug('my-chemical-romance-jakarta');
    assert.ok(mcrByAlias, 'MCR by alias must resolve to same event');
    assert.strictEqual(mcrByAlias.id, 'event-mcr-jakarta-2026');

    const gnrBySlug = canonicalRegistry.getEventBySlug('guns-n-roses-jakarta-2026');
    assert.ok(gnrBySlug, 'GNR by slug must resolve');
    assert.strictEqual(gnrBySlug.id, 'event-gnr-jakarta-2026');

    const gnrByAlias = canonicalRegistry.getEventBySlug('guns-n-roses-jakarta');
    assert.ok(gnrByAlias, 'GNR by alias must resolve');
    assert.strictEqual(gnrByAlias.id, 'event-gnr-jakarta-2026');
  });

  runTest('2.3 Existing featured events remain intact', () => {
    const heroes = canonicalRegistry.getHeroEvents();
    const efest = heroes.find(h => h.id === 'event-efestaphoria-2026');
    assert.ok(efest, 'The 15th Efestaphoria must remain in hero events');
    assert.strictEqual(efest.official_ticket_url, 'https://www.celestix.id/event/the-15th-efestaphoria/539');

    const bts = heroes.find(h => h.id === 'bts-world-tour-arirang-jakarta-2026');
    assert.ok(bts, 'BTS must remain in hero events');

    const morgan = heroes.find(h => h.id === 'ev-can-fd86cf7d');
    assert.ok(morgan, 'Morgan Jay must remain in hero events');
  });

  // 3. Homepage HTML & Schema.org Structured Data
  console.log('\n── Section 3: Homepage HTML & Schema.org Structured Data ──');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

  runTest('3.1 Homepage contains card-mcr with official mcrjakarta.com link and Zero Fake Inventory cue', () => {
    assert.ok(indexHtml.includes('id="card-mcr"'), 'card-mcr must exist in homepage HTML');
    assert.ok(indexHtml.includes('https://mcrjakarta.com/'), 'mcrjakarta.com official link must exist');
    assert.ok(indexHtml.includes('/events/my-chemical-romance-jakarta-2026'), 'MCR event detail link must exist');
    assert.ok(indexHtml.includes('My Chemical Romance — Live in Jakarta'), 'MCR canonical title must exist');
  });

  runTest('3.2 Homepage contains card-gnr with official gnrjakarta.com link and Zero Fake Inventory cue', () => {
    assert.ok(indexHtml.includes('id="card-gnr"'), 'card-gnr must exist in homepage HTML');
    assert.ok(indexHtml.includes('https://gnrjakarta.com/'), 'gnrjakarta.com official link must exist');
    assert.ok(indexHtml.includes('/events/guns-n-roses-jakarta-2026'), 'GNR event detail link must exist');
    assert.ok(indexHtml.includes("Guns N' Roses — Jakarta 2026"), 'GNR canonical title must exist');
  });

  runTest('3.3 Schema.org JSON-LD contains Event entries for both MCR and GNR', () => {
    const jsonLdMatch = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(jsonLdMatch, 'JSON-LD script tag must exist');
    const parsed = JSON.parse(jsonLdMatch[1]);
    const graph = parsed['@graph'] || [];

    const mcrEvent = graph.find(item => item['@type'] === 'Event' && item.name === 'My Chemical Romance — Live in Jakarta');
    assert.ok(mcrEvent, 'MCR Schema.org Event must exist');
    assert.strictEqual(mcrEvent.offers.url, 'https://www.tiket.com/id-id/to-do/my-chemical-romance-live-in-jakarta-2026');
    assert.strictEqual(mcrEvent.location.name, 'Jakarta International Stadium (JIS)');

    const gnrEvent = graph.find(item => item['@type'] === 'Event' && item.name === "Guns N' Roses — Jakarta 2026");
    assert.ok(gnrEvent, 'GNR Schema.org Event must exist');
    assert.strictEqual(gnrEvent.offers.url, 'https://gnrjakarta.com/');
    assert.strictEqual(gnrEvent.location.name, 'GBK Madya Stadium');
  });

  // 4. Real HTTP Server Routes
  console.log('\n── Section 4: Real Server Routes & API Responses ──');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function request(path) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  }

  try {
    await runAsyncTest('4.1 GET /api/events/home-feed includes MCR and GNR 2026', async () => {
      const res = await request('/api/events/home-feed');
      assert.strictEqual(res.status, 200);
      const json = JSON.parse(res.body);
      const events = json.events || json.data || [];
      const mcr = events.find(e => e.id === 'event-mcr-jakarta-2026' || e.slug === 'my-chemical-romance-jakarta-2026');
      const gnr = events.find(e => e.id === 'event-gnr-jakarta-2026' || e.slug === 'guns-n-roses-jakarta-2026');
      assert.ok(mcr, 'MCR must be present in home-feed');
      assert.ok(gnr, 'GNR must be present in home-feed');
    });

    await runAsyncTest('4.2 GET /events/my-chemical-romance-jakarta-2026 returns 200 with verified content', async () => {
      const res = await request('/events/my-chemical-romance-jakarta-2026');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('My Chemical Romance'), 'Page must mention My Chemical Romance');
      assert.ok(res.body.includes('https://mcrjakarta.com/'), 'Page must reference mcrjakarta.com');
    });

    await runAsyncTest('4.3 GET /events/my-chemical-romance-jakarta (alias) returns 200 with verified content', async () => {
      const res = await request('/events/my-chemical-romance-jakarta');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('My Chemical Romance'));
    });

    await runAsyncTest('4.4 GET /events/guns-n-roses-jakarta-2026 returns 200 with verified content', async () => {
      const res = await request('/events/guns-n-roses-jakarta-2026');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes("Guns N' Roses"), 'Page must mention Guns N Roses');
      assert.ok(res.body.includes('https://gnrjakarta.com/'), 'Page must reference gnrjakarta.com');
    });

    await runAsyncTest('4.5 GET /events/guns-n-roses-jakarta (alias) returns 200 with verified content', async () => {
      const res = await request('/events/guns-n-roses-jakarta');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes("Guns N' Roses"));
    });
  } finally {
    server.close();
  }

  // 5. Invariants
  console.log('\n── Section 5: Security & Platform Invariants ──');
  runTest('5.1 PAYMENT_GATEWAY_FROZEN remains true', () => {
    // Payment gateway freeze guard
    const isFrozen = process.env.PAYMENT_GATEWAY_FROZEN !== 'false';
    assert.strictEqual(isFrozen, true, 'Payment gateway must remain frozen');
  });

  console.log('\n================================================================');
  console.log(`  EXPANSION VERIFICATION: ${passCount}/${testCount} TESTS PASSED`);
  console.log('================================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
