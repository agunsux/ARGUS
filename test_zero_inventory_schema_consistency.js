#!/usr/bin/env node
/**
 * TIKUM — Zero-Inventory Schema & Structured Data Consistency Test Suite
 * 
 * Verifies Gate 2 Invariants:
 * 1. Unknown external primary availability -> OMIT primary Offer from JSON-LD entirely.
 * 2. Verified primary availability -> only represented when authoritative evidence supports it.
 * 3. Verified sold-out primary status -> outputs SoldOut, no false availability claim.
 * 4. Zero TIKUM secondary listings -> NEVER produce InStock Offer; no invented price or seller.
 * 5. Verified secondary listing -> schema accurately reflects actual listing data (AggregateOffer).
 * 6. External ticket link remains visible and functional on the rendered HTML page.
 * 7. Primary and secondary inventory remain strictly separate.
 */

const assert = require('assert');
const { EventSEOService } = require('./src/discovery/EventSEOService');
const { StructuredDataFactory } = require('./src/seo/StructuredDataFactory');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { setMarketplaceModeForTesting, MARKETPLACE_MODES } = require('./src/config/marketplaceMode');

let passed = 0;
let total = 0;

function check(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function runZeroInventorySchemaSuite() {
  console.log('===================================================================');
  console.log('  TIKUM — ZERO-INVENTORY STRUCTURED DATA & SCHEMA CONSISTENCY SUITE');
  console.log('===================================================================\n');

  // --- 1. BTS Event Grounding & Invariant Checks ---
  console.log('--- 1. BTS World Tour Arirang Primary & Secondary Schema ---');
  const btsEvent = canonicalRegistry.getEventById('bts-world-tour-arirang-jakarta-2026');
  assert(btsEvent, 'BTS event must exist in canonical registry');

  check('BTS schema has NO InStock offers when activeListings is empty', () => {
    const schema = EventSEOService.buildStructuredData(btsEvent, []);
    const offers = schema.offers || [];
    for (const offer of offers) {
      assert.notStrictEqual(offer.availability, 'https://schema.org/InStock', `Offer ${offer.name} must not be InStock`);
    }
  });

  check('BTS unverified external primary ticket Offer is OMITTED from JSON-LD', () => {
    // BTS has external ticket URL (Tiket.com) but no live stock sync proof
    const schema = EventSEOService.buildStructuredData(btsEvent, []);
    const primaryOffer = (schema.offers || []).find(o => o.name && o.name.includes('Tiket Resmi Primer'));
    assert.strictEqual(primaryOffer, undefined, 'Unverified external primary offer must be omitted from JSON-LD');
  });

  check('BTS zero secondary listings produces NO secondary InStock Offer', () => {
    const schema = EventSEOService.buildStructuredData(btsEvent, []);
    const secondaryInStock = (schema.offers || []).find(o => o.name && o.name.includes('TIKUM') && o.availability === 'https://schema.org/InStock');
    assert.strictEqual(secondaryInStock, undefined, 'Zero listings must never produce a secondary InStock offer');
  });

  check('BTS rendered HTML keeps external primary ticket link VISIBLE and functional', () => {
    const html = EventSEOService.renderEventPageHtml(btsEvent, [], [], 'id');
    assert(html.includes('https://www.tiket.com/en-id/to-do/bts-jakarta-day1'), 'Official ticket URL must be visible in HTML');
    assert(html.includes('Tiket.com'), 'Ticketing provider name must be visible in HTML');
    assert(html.includes('Buka Halaman Tiket Resmi') || html.includes('Cek Waiting List'), 'Action button must be present in HTML');
  });

  check('BTS rendered HTML visibly communicates zero resale inventory', () => {
    const html = EventSEOService.renderEventPageHtml(btsEvent, [], [], 'id');
    assert(html.includes('0 Tiket') || html.includes('Belum ada tiket resale sekunder terverifikasi di TIKUM') || html.includes('Belum ada pengguna yang mendaftarkan penjualan tiket'), 'Visible page must indicate 0 resale inventory');
  });

  // --- 2. BIGBANG Event Grounding & Invariant Checks ---
  console.log('\n--- 2. BIGBANG Cosmos Tour Primary & Secondary Schema ---');
  const bbEvent = canonicalRegistry.getEventById('bigbang-cosmos-tour-jakarta-2027');
  assert(bbEvent, 'BIGBANG event must exist in canonical registry');

  check('BIGBANG schema has NO InStock offers when activeListings is empty', () => {
    const schema = EventSEOService.buildStructuredData(bbEvent, []);
    const offers = schema.offers || [];
    for (const offer of offers) {
      assert.notStrictEqual(offer.availability, 'https://schema.org/InStock', `Offer ${offer.name} must not be InStock`);
    }
  });

  check('BIGBANG unverified primary ticket Offer is OMITTED from JSON-LD', () => {
    const schema = EventSEOService.buildStructuredData(bbEvent, []);
    const primaryOffer = (schema.offers || []).find(o => o.name && o.name.includes('Tiket Resmi Primer'));
    assert.strictEqual(primaryOffer, undefined, 'Unverified external primary offer must be omitted from JSON-LD');
  });

  check('BIGBANG rendered HTML keeps external primary link VISIBLE and functional', () => {
    const html = EventSEOService.renderEventPageHtml(bbEvent, [], [], 'id');
    assert(html.includes('https://bigbanginjakarta.com/'), 'Official BIGBANG ticket URL must be visible in HTML');
    assert(html.includes('Buka Halaman Tiket Resmi') || html.includes('Cek Waiting List'), 'Action button must be present in HTML');
  });

  // --- 3. StructuredDataFactory Consistency Checks ---
  console.log('\n--- 3. StructuredDataFactory Offer Consistency ---');
  check('StructuredDataFactory omits unverified external primary offer', () => {
    const schema = StructuredDataFactory.createEventSchema(btsEvent, []);
    const primaryOffer = (schema.offers || []).find(o => o.name && o.name.includes('Tiket Resmi Primer'));
    assert.strictEqual(primaryOffer, undefined, 'StructuredDataFactory must omit unverified primary offer');
  });

  check('StructuredDataFactory emits NO InStock offers under zero inventory', () => {
    const schema = StructuredDataFactory.createEventSchema(btsEvent, []);
    for (const offer of schema.offers || []) {
      assert.notStrictEqual(offer.availability, 'https://schema.org/InStock', 'StructuredDataFactory offer must not be InStock');
    }
  });

  // --- 4. Verified Primary Status Controls (SoldOut vs Verified InStock) ---
  console.log('\n--- 4. Primary Ticketing Verification Controls ---');
  check('Authoritatively SOLD_OUT primary ticket emits SoldOut Offer without false availability', () => {
    const soldOutEvent = {
      ...btsEvent,
      official_ticket_url: 'https://example.com/tickets',
      official_ticketing_provider: 'Loket.com',
      official_ticket_availability: 'SOLD_OUT',
      lowest_official_price: 1500000
    };
    const schema = EventSEOService.buildStructuredData(soldOutEvent, []);
    assert(schema.offers && schema.offers.length === 1, 'Exactly one offer expected for verified sold-out primary');
    const offer = schema.offers[0];
    assert.strictEqual(offer.availability, 'https://schema.org/SoldOut', 'Must emit SoldOut');
    assert.strictEqual(offer.price, 1500000, 'Must preserve official face value');
    assert.strictEqual(offer.url, 'https://example.com/tickets', 'URL must match official channel');
  });

  check('Authoritatively VERIFIED_IN_STOCK primary ticket emits InStock Offer', () => {
    const verifiedInStockEvent = {
      ...btsEvent,
      official_ticket_url: 'https://example.com/tickets',
      official_ticketing_provider: 'Loket.com',
      official_ticket_availability: 'VERIFIED_IN_STOCK',
      lowest_official_price: 1500000
    };
    const schema = EventSEOService.buildStructuredData(verifiedInStockEvent, []);
    assert(schema.offers && schema.offers.length === 1, 'Exactly one offer expected for verified in-stock primary');
    const offer = schema.offers[0];
    assert.strictEqual(offer.availability, 'https://schema.org/InStock', 'Must emit InStock when authoritatively verified');
    assert.strictEqual(offer.price, 1500000, 'Must reflect verified price');
  });

  check('Unverified external primary ticket (default) produces NO primary Offer', () => {
    const unverifiedEvent = {
      ...btsEvent,
      official_ticket_url: 'https://example.com/tickets',
      official_ticketing_provider: 'Loket.com',
      primary_ticket_status: 'AVAILABLE_ON_OFFICIAL_CHANNEL' // standard unverified external status
    };
    const schema = EventSEOService.buildStructuredData(unverifiedEvent, []);
    assert.strictEqual(schema.offers, undefined, 'Offers must be omitted when primary is unverified and secondary is 0');
  });

  // --- 5. Verified Secondary Listing Controls ---
  console.log('\n--- 5. Secondary Resale Verification Controls ---');
  check('Verified secondary listings accurately reflect actual listing data', () => {
    const mockListings = [
      { id: 'list-1', price: 2100000, status: 'VERIFIED' },
      { id: 'list-2', price: 2800000, status: 'VERIFIED' },
      { id: 'list-3', price: 3500000, status: 'VERIFIED' }
    ];
    setMarketplaceModeForTesting(MARKETPLACE_MODES.LIVE);
    try {
      const schema = EventSEOService.buildStructuredData(btsEvent, mockListings);
      assert(schema.offers && schema.offers.length === 1, 'Exactly one secondary aggregate offer expected');
      const aggOffer = schema.offers[0];
      assert.strictEqual(aggOffer['@type'], 'AggregateOffer', 'Type must be AggregateOffer');
      assert.strictEqual(aggOffer.availability, 'https://schema.org/InStock', 'Must be InStock');
      assert.strictEqual(aggOffer.lowPrice, 2100000, 'lowPrice must match min listing price');
      assert.strictEqual(aggOffer.offerCount, 3, 'offerCount must match activeListings length');
      assert(aggOffer.url.includes(btsEvent.slug), 'URL must point to canonical event page');
    } finally {
      setMarketplaceModeForTesting(null);
    }
  });

  check('Prelaunch mode blocks secondary InStock offer even with mock listings', () => {
    const mockListings = [
      { id: 'list-1', price: 2100000, status: 'VERIFIED' }
    ];
    setMarketplaceModeForTesting(MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY);
    const schema = EventSEOService.buildStructuredData(btsEvent, mockListings);
    assert.strictEqual(schema.offers, undefined, 'Prelaunch mode must prevent secondary InStock offer');
  });

  check('Primary and secondary inventory remain strictly separate in schema and rendered page', () => {
    const mockListings = [
      { id: 'list-1', price: 2100000, status: 'VERIFIED' }
    ];
    const hybridEvent = {
      ...btsEvent,
      official_ticket_url: 'https://example.com/tickets',
      official_ticketing_provider: 'Tiket.com',
      official_ticket_availability: 'SOLD_OUT',
      lowest_official_price: 1350000
    };
    setMarketplaceModeForTesting(MARKETPLACE_MODES.LIVE);
    try {
      const schema = EventSEOService.buildStructuredData(hybridEvent, mockListings);
      assert.strictEqual(schema.offers.length, 2, 'Must have distinct primary and secondary offers');
      const primary = schema.offers.find(o => o.name.includes('Tiket Resmi Primer'));
      const secondary = schema.offers.find(o => o.name.includes('TIKUM'));
      assert(primary && secondary, 'Both must be distinctly named');
      assert.strictEqual(primary.availability, 'https://schema.org/SoldOut', 'Primary is SoldOut');
      assert.strictEqual(secondary.availability, 'https://schema.org/InStock', 'Secondary is InStock');
      assert.notStrictEqual(primary.url, secondary.url, 'URLs must never be conflated');
    } finally {
      setMarketplaceModeForTesting(null);
    }
  });

  console.log('\n===================================================================');
  console.log(`  All ${passed}/${total} Zero-Inventory Schema Consistency Checks PASSED!`);
  console.log('===================================================================\n');
}

runZeroInventorySchemaSuite();
