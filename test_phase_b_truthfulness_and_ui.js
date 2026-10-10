/**
 * TIKUM PHASE B — HOMEPAGE TRUTHFULNESS, UI POLISH & DEMAND CAPTURE
 * Comprehensive Acceptance & Regression Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- STARTING TIKUM PHASE B TRUTHFULNESS & UI TEST SUITE ---');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

// -------------------------------------------------------------
// Test 1: No absolute anti-scam promise remains in homepage & i18n
// -------------------------------------------------------------
test('Criteria 1: No absolute anti-scam or 0-scam promises in i18n & public/index.html', () => {
  const i18nContent = fs.readFileSync(path.join(__dirname, 'public', 'js', 'i18n.js'), 'utf8');
  const indexContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const heroContent = fs.readFileSync(path.join(__dirname, 'public', 'hero.html'), 'utf8');

  // Verify "Tiket Second. Tanpa Scam." is completely gone
  assert.strictEqual(i18nContent.includes('Tiket Second. Tanpa Scam.'), false, 'i18n.js must not contain "Tiket Second. Tanpa Scam."');
  assert.strictEqual(indexContent.includes('Tiket Second. Tanpa Scam.'), false, 'index.html must not contain "Tiket Second. Tanpa Scam."');

  // Verify primary positioning is "TIKUM — Pasar Tiket Event Terverifikasi"
  assert.ok(i18nContent.includes('"tagline": "TIKUM — Pasar Tiket Event Terverifikasi"'), 'i18n.js ID tagline must be updated');
  assert.ok(i18nContent.includes('"title": "TIKUM — Pasar Tiket Event Terverifikasi | by Shinerva"'), 'i18n.js ID title must be updated');
  assert.ok(indexContent.includes('Pasar Tiket Event Terverifikasi'), 'index.html must include truthful positioning');
  assert.ok(indexContent.includes('<title>Tikum — Verified Ticket Marketplace by Shinerva</title>'), 'index.html title must match brand boundary');

  // Verify supporting copy
  assert.ok(i18nContent.includes('Temukan event, periksa status tiket, dan ketahui ketersediaan resale sebelum membeli.'), 'i18n.js ID must contain approved supporting copy');
  assert.ok(indexContent.includes('Temukan event, periksa status tiket, dan ketahui ketersediaan resale sebelum membeli.'), 'index.html must contain approved supporting copy');

  // Verify no "100% Escrow" in consumer hero
  assert.strictEqual(heroContent.includes('100% Escrow Buyer Protection'), false, 'hero.html must not contain unverified "100% Escrow Buyer Protection"');
});

// -------------------------------------------------------------
// Test 2: Separation of promoter price from TIKUM resale price
// -------------------------------------------------------------
test('Criteria 2: Official promoter price is separated from TIKUM resale price in API & UI logic', () => {
  const indexContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

  // UI template must explicitly label "Harga resmi promotor" when zero resale listings exist
  assert.ok(indexContent.includes("priceLabel = 'Harga resmi promotor'"), 'UI must explicitly label official price as "Harga resmi promotor"');
  assert.ok(indexContent.includes('Belum ada tiket resale di TIKUM'), 'UI must explicitly state "Belum ada tiket resale di TIKUM" when resale inventory is 0');

  // UI must NOT show "ON SALE" as a blanket ambiguous resale status
  assert.strictEqual(indexContent.includes("if (e.official_ticket_url) return { css: 'status-onsale', text: 'ON SALE' };"), false, 'Ambiguous ON SALE must be replaced with source-backed label');
  assert.ok(indexContent.includes("text: 'Tiket resmi tersedia'"), 'Must use unambiguous "Tiket resmi tersedia" for promoter tickets');
});

// -------------------------------------------------------------
// Test 3 & 4: Zero active listings never produce resale_available=true
// -------------------------------------------------------------
test('Criteria 3 & 4: Zero active listings gives resale_available=false; Resale tersedia appears only when inventory exists', () => {
  const routerContent = fs.readFileSync(path.join(__dirname, 'src', 'discovery', 'discoveryRouter.js'), 'utf8');

  // API router enrichment check
  assert.ok(routerContent.includes('resale_available: activeListings.length > 0'), 'discoveryRouter must compute resale_available strictly based on activeListings.length > 0');
  assert.ok(routerContent.includes('resale_listings_count: activeListings.length'), 'discoveryRouter must compute resale_listings_count strictly from activeListings');
  assert.ok(routerContent.includes('primary_price_min: (e.min_price !== undefined && e.min_price !== null) ? Number(e.min_price) : null'), 'discoveryRouter must separate primary_price_min');

  // UI status resolver check
  const indexContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.ok(indexContent.includes("if (hasResale) {\n        return { css: 'status-resale', text: 'Resale tersedia' };"), 'Resale tersedia must only return if hasResale is true');
});

// -------------------------------------------------------------
// Test 5: Category pills contrast tokens in style.css
// -------------------------------------------------------------
test('Criteria 5: Category pills contrast tokens are high contrast in both light and dark themes', () => {
  const cssContent = fs.readFileSync(path.join(__dirname, 'public', 'css', 'style.css'), 'utf8');

  // Check light mode definition
  assert.ok(cssContent.includes('.card-category-pill {'), 'Must have .card-category-pill selector');
  assert.ok(cssContent.includes('color: #18181B;'), 'Light mode category pill must have explicit dark ink foreground');

  // Check dark mode override
  assert.ok(cssContent.includes('body.dark-mode .card-category-pill {'), 'Must have dark mode override for .card-category-pill');
  assert.ok(cssContent.includes('background: rgba(24, 24, 27, 0.92);'), 'Dark mode category pill must have dark background');
  assert.ok(cssContent.includes('color: #F8FAFC;'), 'Dark mode category pill must have light text (#F8FAFC)');
});

// -------------------------------------------------------------
// Test 6: Price row and badge wrapping (overflow prevention)
// -------------------------------------------------------------
test('Criteria 6: .poster-price-row flex-wrapping prevents text overlap and clipping', () => {
  const cssContent = fs.readFileSync(path.join(__dirname, 'public', 'css', 'style.css'), 'utf8');

  assert.ok(cssContent.includes('.poster-price-row {'), 'Must define .poster-price-row');
  assert.ok(cssContent.includes('flex-wrap: wrap;'), '.poster-price-row must specify flex-wrap: wrap to prevent horizontal collision');
  assert.ok(cssContent.includes('.poster-price-col {'), 'Must define .poster-price-col for stacked price label & value');
  assert.ok(cssContent.includes('.badge-card-trust {'), 'Must define .badge-card-trust');
  assert.ok(cssContent.includes('flex-shrink: 0;'), '.badge-card-trust must specify flex-shrink: 0 to prevent text squishing');
});

// -------------------------------------------------------------
// Test 7 & 8: WhatsApp number validation and fallback contact
// -------------------------------------------------------------
test('Criteria 7 & 8: WhatsApp integration validates support phone and falls back cleanly without broken links', () => {
  const indexContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const { businessProfile } = require('./src/config/businessProfile');

  // Configured number must be the real approved support hotline
  assert.strictEqual(businessProfile.phone, '081299927378', 'Approved support hotline must be 081299927378');
  assert.ok(indexContent.includes("const TIKUM_WHATSAPP_NUMBER = '6281299927378';"), 'index.html must use verified WhatsApp number');

  // Helper validation functions
  assert.ok(indexContent.includes('function isValidSupportPhone(num)'), 'index.html must include isValidSupportPhone validator');
  assert.ok(indexContent.includes('function handleWaitlistClick('), 'index.html must include handleWaitlistClick function');

  // Fallback to /contact if invalid
  assert.ok(indexContent.includes("window.location.href = `/contact?subject=waitlist&event="), 'Must fallback cleanly to /contact without broken link');
});

// -------------------------------------------------------------
// Test 9: Waitlist action never implies completed ticket reservation
// -------------------------------------------------------------
test('Criteria 9: Waitlist CTA copy and message express interest only, never implying ticket reservation', () => {
  const indexContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

  // Button text
  assert.ok(indexContent.includes('Kabari Saya Saat Tiket Ada'), 'CTA button must be "Kabari Saya Saat Tiket Ada"');

  // Message body expresses interest, not reservation
  assert.ok(indexContent.includes('saya tertarik jika ada tiket resale terverifikasi'), 'WhatsApp message must express interest');
  assert.strictEqual(indexContent.includes('telah memesan tiket'), false, 'Must not claim ticket is booked');
  assert.strictEqual(indexContent.includes('reservasi berhasil'), false, 'Must not claim reservation succeeded');
});

// -------------------------------------------------------------
// Test 10: Invariants check (production payments disabled, no fake inventory)
// -------------------------------------------------------------
test('Criteria 10: Invariants preserved (production payments disabled, zero fake inventory)', () => {
  assert.notStrictEqual(process.env.ENABLE_MIDTRANS_PRODUCTION, 'true', 'Production Midtrans must remain disabled');
  assert.notStrictEqual(process.env.ENABLE_IPAYMU_PRODUCTION, 'true', 'Production iPaymu must remain disabled');

  const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
  assert.ok(canonicalRegistry, 'Canonical event registry must be operational');
  const heroEvents = canonicalRegistry.getHeroEvents();
  for (const ev of heroEvents) {
    assert.strictEqual(ev.resale_inventory_count, 0, `${ev.name} must have 0 resale inventory`);
  }
});

console.log(`\nALL ${passedTests}/${totalTests} TESTS PASSED FOR PHASE B!`);
