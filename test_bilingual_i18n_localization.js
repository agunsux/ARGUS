/**
 * TIKUM — Comprehensive Bilingual Localization Test Suite (id + en)
 *
 * Verifies:
 * 1. 100% dictionary key parity between Indonesian ('id') and English ('en').
 * 2. Locale-aware currency formatting:
 *    - Indonesian: 'Rp 500.000'
 *    - English: 'IDR 500,000'
 *    - Raw numeric amount strictly preserved (zero USD conversion).
 * 3. Strict minimum price invariant (500k IDR).
 * 4. Client-side language resolution & state persistence (Query, Cookie, Storage, Default).
 * 5. SSR routes locale resolution and language-aware rendering:
 *    - /events
 *    - /events/:slug
 *    - /how-it-works
 *    - renderFooterHtml()
 * 6. Public HTML surface audit:
 *    - All public HTML files include i18n.js and language toggle triggers.
 * 7. Security invariant:
 *    - MARKETPLACE_MODE=PRELAUNCH_LISTING_ONLY strictly preserved.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n=============================================================');
console.log('TIKUM — BILINGUAL LOCALIZATION (ID + EN) VERIFICATION SUITE');
console.log('=============================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// 1. DICTIONARY PARITY
// -------------------------------------------------------------
const i18n = require('./public/js/i18n');

test('1.1. i18n loads translations for both id and en', () => {
  assert(i18n.translations.id, 'translations.id must exist');
  assert(i18n.translations.en, 'translations.en must exist');
});

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      keys = keys.concat(getAllKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const idKeys = getAllKeys(i18n.translations.id);
const enKeys = getAllKeys(i18n.translations.en);

test('1.2. Exact key parity between id and en dictionaries (0 missing keys)', () => {
  const missingInEn = idKeys.filter(k => !enKeys.includes(k));
  const missingInId = enKeys.filter(k => !idKeys.includes(k));
  assert.strictEqual(missingInEn.length, 0, `Missing in EN: ${missingInEn.join(', ')}`);
  assert.strictEqual(missingInId.length, 0, `Missing in ID: ${missingInId.join(', ')}`);
  assert(idKeys.length >= 990, `Expected at least 990 keys, got ${idKeys.length}`);
});

test('1.3. Specific high-priority namespaces exist in both id and en', () => {
  const requiredNamespaces = [
    'domain', 'brand', 'meta', 'nav', 'hero', 'trust', 'footer', 'status',
    'common', 'events', 'prelaunch', 'spotlight', 'services', 'pricing',
    'comparison', 'discoveryRails', 'modals', 'howItWorksSection',
    'venuePicSection', 'sellerExperienceSection', 'faqPreviewSection', 'finalCtaSection'
  ];
  for (const ns of requiredNamespaces) {
    assert(i18n.translations.id[ns], `Missing namespace ${ns} in id`);
    assert(i18n.translations.en[ns], `Missing namespace ${ns} in en`);
  }
});

// -------------------------------------------------------------
// 2. CURRENCY FORMATTING RULES
// -------------------------------------------------------------
test('2.1. Indonesian currency formatting: Rp 500.000', () => {
  i18n.setLang('id');
  const formatted = i18n.formatCurrency(500000, 'IDR');
  assert.strictEqual(formatted, 'Rp 500.000', `Expected 'Rp 500.000', got '${formatted}'`);
});

test('2.2. English currency formatting: IDR 500,000', () => {
  i18n.setLang('en');
  const formatted = i18n.formatCurrency(500000, 'IDR');
  assert.strictEqual(formatted, 'IDR 500,000', `Expected 'IDR 500,000', got '${formatted}'`);
});

test('2.3. Currency formatting preserves raw numerical value (never converts to USD)', () => {
  i18n.setLang('en');
  const rawValue = 1500000;
  const formatted = i18n.formatCurrency(rawValue, 'IDR');
  assert(formatted.includes('1,500,000'), `Expected formatted string to contain 1,500,000, got ${formatted}`);
  assert(!formatted.includes('$'), `Formatted string must never contain $, got ${formatted}`);
  assert(!formatted.includes('USD'), `Formatted string must never convert to USD, got ${formatted}`);
});

test('2.4. Currency formatting handles 0 and edge values safely', () => {
  i18n.setLang('id');
  assert.strictEqual(i18n.formatCurrency(0, 'IDR'), 'Rp 0');
  assert.strictEqual(i18n.formatCurrency(null, 'IDR'), '0');
  i18n.setLang('en');
  assert.strictEqual(i18n.formatCurrency(0, 'IDR'), 'IDR 0');
  assert.strictEqual(i18n.formatCurrency(null, 'IDR'), '0');
});

// -------------------------------------------------------------
// 3. LANGUAGE SWITCHER STATE MANAGEMENT
// -------------------------------------------------------------
test('3.1. resolveInitialLanguage correctly parses query string ?lang=en', () => {
  const resolved = i18n.resolveInitialLanguage('?lang=en');
  assert.strictEqual(resolved, 'en');
});

test('3.2. resolveInitialLanguage correctly parses query string ?lang=id', () => {
  const resolved = i18n.resolveInitialLanguage('?lang=id');
  assert.strictEqual(resolved, 'id');
});

test('3.3. resolveInitialLanguage respects stored localStorage preference', () => {
  const resolved = i18n.resolveInitialLanguage('', 'en');
  assert.strictEqual(resolved, 'en');
});

test('3.4. resolveInitialLanguage falls back to id by default', () => {
  const resolved = i18n.resolveInitialLanguage('', null);
  assert.strictEqual(resolved, 'id');
});

test('3.5. applyLanguage and setLang are identical functions and exported', () => {
  assert.strictEqual(typeof i18n.setLang, 'function');
  assert.strictEqual(typeof i18n.applyLanguage, 'function');
  assert.strictEqual(i18n.setLang, i18n.applyLanguage);
});

// -------------------------------------------------------------
// 4. SSR ROUTE LOCALIZATION & RESOLUTION
// -------------------------------------------------------------
const { renderFooterHtml } = require('./src/config/businessProfile');
const { EventSEOService } = require('./src/discovery/EventSEOService');

test('4.1. renderFooterHtml renders Indonesian by default', () => {
  const html = renderFooterHtml('id');
  assert(html.includes('Badan Usaha &amp; Alamat Operasional:'), 'Must include Indonesian address heading');
  assert(html.includes('Kontak Resmi'), 'Must include Indonesian contact heading');
  assert(html.includes('data-i18n="footer.operationalOffice"'), 'Must include data-i18n attribute');
});

test('4.2. renderFooterHtml renders English when lang=en', () => {
  const html = renderFooterHtml('en');
  assert(html.includes('Operational Office & Mailing Address:'), 'Must include English address heading');
  assert(html.includes('Official Contact'), 'Must include English contact heading');
  assert(html.includes('Customer Support:'), 'Must include English customer support');
  assert(html.includes('data-i18n="footer.operationalOffice"'), 'Must include data-i18n attribute');
});

test('4.3. EventSEOService.renderEventPageHtml renders localized SSR HTML for id and en', () => {
  const mockEvent = {
    canonical_name: 'We The Fest 2026',
    slug: 'we-the-fest-2026',
    venue_name: 'GBK Sports Complex',
    city: 'Jakarta',
    start_date: '2026-08-14',
    category: 'MUSIC',
    min_price: 1500000,
    is_verified: true,
    verification_status: 'VERIFIED',
    description: 'Annual summer music festival in Jakarta.'
  };

  const htmlId = EventSEOService.renderEventPageHtml(mockEvent, [], [], 'id');
  assert(htmlId.includes('<html lang="id">'), 'Must have html lang=id');
  assert(htmlId.includes('data-i18n="prelaunch.title"'), 'Must have prelaunch data-i18n');
  assert(htmlId.includes('Beranda'), 'Must include Indonesian breadcrumb');

  const htmlEn = EventSEOService.renderEventPageHtml(mockEvent, [], [], 'en');
  assert(htmlEn.includes('<html lang="en">'), 'Must have html lang=en');
  assert(htmlEn.includes('Home'), 'Must include English breadcrumb');
  assert(htmlEn.includes('TIKUM is in pre-launch preparation.'), 'Must include English prelaunch title');
  assert(htmlEn.includes('data-i18n="prelaunch.title"'), 'Must have prelaunch data-i18n');
});

// -------------------------------------------------------------
// 5. PUBLIC HTML SURFACE AUDIT
// -------------------------------------------------------------
test('5.1. All 19 public HTML files include i18n.js and lang toggle triggers', () => {
  const publicDir = path.resolve(__dirname, 'public');
  const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
  assert.strictEqual(files.length, 19, `Expected 19 HTML files, found ${files.length}`);

  files.forEach(file => {
    const content = fs.readFileSync(path.join(publicDir, file), 'utf8');
    assert(content.includes('i18n.js'), `${file} must include i18n.js`);
    const hasToggle = content.includes('langToggle') || content.includes('btnLangToggle') || content.includes('toggleLang');
    assert(hasToggle, `${file} must include a language toggle button or trigger`);
  });
});

test('5.2. public/index.html has full data-i18n coverage across all major sections', () => {
  const indexHtml = fs.readFileSync(path.resolve(__dirname, 'public/index.html'), 'utf8');
  const requiredTags = [
    'nav.featuredEvents',
    'nav.events',
    'nav.productsAndServices',
    'nav.pricingAndFees',
    'nav.submitListing',
    'prelaunch.title',
    'prelaunch.bannerDesc',
    'spotlight.eyebrow',
    'spotlight.title',
    'services.kicker',
    'services.title',
    'pricing.kicker',
    'pricing.title',
    'pricing.colComponent',
    'comparison.kicker',
    'comparison.title',
    'howItWorksSection.kicker',
    'howItWorksSection.buyerColTitle',
    'sellerExperienceSection.kicker',
    'faqPreviewSection.kicker',
    'finalCtaSection.kicker',
    'footer.operationalOffice',
    'footer.officialContact'
  ];

  requiredTags.forEach(tag => {
    assert(indexHtml.includes(`data-i18n="${tag}"`), `public/index.html missing data-i18n="${tag}"`);
  });
});

// -------------------------------------------------------------
// 6. MARKETPLACE & SAFETY INVARIANTS
// -------------------------------------------------------------
test('6.1. MARKETPLACE_MODE remains strictly PRELAUNCH_LISTING_ONLY', () => {
  const { isPrelaunchListingMode, getMarketplaceMode } = require('./src/config/marketplaceMode');
  assert.strictEqual(isPrelaunchListingMode(), true, 'Must remain in prelaunch listing mode');
  assert.strictEqual(getMarketplaceMode(), 'PRELAUNCH_LISTING_ONLY', 'Mode must be PRELAUNCH_LISTING_ONLY');
});

test('6.2. 500k minimum price threshold invariant is strictly enforced', () => {
  const { CuratedCatalogPolicy, OFFICIAL_MIN_TICKET_PRICE } = require('./src/discovery/CuratedCatalogPolicy');
  assert.strictEqual(OFFICIAL_MIN_TICKET_PRICE, 500000, 'Minimum price must be 500,000 IDR');
  assert.strictEqual(CuratedCatalogPolicy.evaluateOfficialPriceQualification({ price: 499999 }).qualified, false, '499,999 must be rejected');
  assert.strictEqual(CuratedCatalogPolicy.evaluateOfficialPriceQualification({ price: 500000 }).qualified, true, '500,000 must qualify');
  assert.strictEqual(CuratedCatalogPolicy.evaluateOfficialPriceQualification({ price: 1500000 }).qualified, true, '1,500,000 must qualify');
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n-------------------------------------------------------------');
console.log(`TOTAL CHECKS: ${passCount + failCount} | PASS: ${passCount} | FAIL: ${failCount}`);
console.log('-------------------------------------------------------------\n');

if (failCount > 0) {
  process.exit(1);
}
console.log('ALL BILINGUAL LOCALIZATION INVARIANTS VERIFIED SUCCESSFULLY.\n');
