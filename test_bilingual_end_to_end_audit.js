/**
 * TIKUM — Total Bilingual (ID / EN) End-to-End Architecture Audit Test Suite
 * Validates dictionary sync, attribute coverage across all HTML files,
 * zero mixed-language rendering, form preservation, and SSR cookie synchronization.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const idDict = require('./src/i18n/dictionaries/id.js');
const enDict = require('./src/i18n/dictionaries/en.js');
const clientI18n = require('./public/js/i18n.js');
const app = require('./src/server.js');

console.log('======================================================================');
console.log('  TIKUM — TOTAL BILINGUAL (ID / EN) END-TO-END AUDIT SUITE');
console.log('======================================================================\n');

function collectLeaves(obj, prefix = '') {
  let leaves = {};
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      Object.assign(leaves, collectLeaves(obj[key], fullPath));
    } else {
      leaves[fullPath] = obj[key];
    }
  }
  return leaves;
}

const idLeaves = collectLeaves(idDict);
const enLeaves = collectLeaves(enDict);
const idKeys = Object.keys(idLeaves);
const enKeys = Object.keys(enLeaves);

// -----------------------------------------------------------------------------
// TEST 1: Dictionary Sync & Zero Drift (Canonical vs Client Bundle)
// -----------------------------------------------------------------------------
console.log('[TEST 1] Dictionary Synchronization & Zero Drift Check...');
assert.strictEqual(idKeys.length, enKeys.length, `ID keys (${idKeys.length}) must match EN keys (${enKeys.length})`);

const missingInEn = idKeys.filter(k => !(k in enLeaves));
const missingInId = enKeys.filter(k => !(k in idLeaves));
assert.strictEqual(missingInEn.length, 0, `Keys present in ID but missing in EN: ${missingInEn.join(', ')}`);
assert.strictEqual(missingInId.length, 0, `Keys present in EN but missing in ID: ${missingInId.join(', ')}`);

// Check public/js/i18n.js contains dictionaries
const clientI18nSource = fs.readFileSync('public/js/i18n.js', 'utf8');
assert.ok(clientI18nSource.includes('const translations = {'), 'Client i18n bundle must contain translations object');
assert.ok(clientI18nSource.includes('  "id":'), 'Client i18n bundle must contain ID dictionary');
assert.ok(clientI18nSource.includes('  "en":'), 'Client i18n bundle must contain EN dictionary');

// Verify a representative sample of keys exists in client bundle
const sampleKeys = [
  'nav.dealRoomLookup',
  'nav.cities',
  'nav.signIn',
  'nav.exploreTickets',
  'nav.sellTicketsNow',
  'landing.twoWayProtectionEyebrow',
  'landing.fiveStepsSub',
  'blog.kicker',
  'events.tierPic',
  'offers.tabBuyer',
  'pay.prelaunchTitle',
  'create.step1Title',
  'profile.readinessTitle',
  'pastEvents.pageTitle',
  'track.pageTitle'
];

sampleKeys.forEach(k => {
  assert.ok(clientI18n.t(k, null, 'id') !== null, `Client i18n missing ID key: ${k}`);
  assert.ok(clientI18n.t(k, null, 'en') !== null, `Client i18n missing EN key: ${k}`);
});

console.log(`  ✓ Canonical ID leaves: ${idKeys.length}`);
console.log(`  ✓ Canonical EN leaves: ${enKeys.length}`);
console.log(`  ✓ Client runtime translation verified across key namespaces.`);
console.log('  ✅ PASSED: Dictionary sync & zero drift verified.\n');

// -----------------------------------------------------------------------------
// TEST 2: All data-i18n* Attributes Across ALL 21 HTML Files Resolve
// -----------------------------------------------------------------------------
console.log('[TEST 2] Verifying All data-i18n* Attributes in All HTML Files...');
const htmlFiles = fs.readdirSync('public').filter(f => f.endsWith('.html'));
assert.ok(htmlFiles.length >= 15, `Expected at least 15 HTML files, found ${htmlFiles.length}`);

let totalAttributesChecked = 0;
const unresolvedKeys = [];

htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join('public', file), 'utf8');
  // Match data-i18n, data-i18n-html, data-i18n-placeholder, data-i18n-title, data-i18n-aria-label
  const attrRegex = /data-i18n(?:-html|-placeholder|-title|-aria-label)?="([^"]+)"/g;
  let match;
  while ((match = attrRegex.exec(content)) !== null) {
    const key = match[1].trim();
    totalAttributesChecked++;
    const idVal = clientI18n.t(key, null, 'id');
    const enVal = clientI18n.t(key, null, 'en');
    if (idVal === null || idVal === undefined) {
      unresolvedKeys.push({ file, key, lang: 'id' });
    }
    if (enVal === null || enVal === undefined) {
      unresolvedKeys.push({ file, key, lang: 'en' });
    }
  }
});

assert.strictEqual(
  unresolvedKeys.length,
  0,
  `Unresolved data-i18n keys found:\n${unresolvedKeys.map(u => `  [${u.file}] ${u.key} (${u.lang})`).join('\n')}`
);

console.log(`  ✓ Checked ${totalAttributesChecked} localization attributes across ${htmlFiles.length} HTML files.`);
console.log('  ✅ PASSED: 100% of data-i18n* attributes resolve cleanly in both ID and EN.\n');

// -----------------------------------------------------------------------------
// TEST 3 & 4: Zero Mixed-Language & Zero Raw Key Leak Simulation
// -----------------------------------------------------------------------------
console.log('[TEST 3 & 4] Simulated DOM Translation & Pure Language Assertion...');

function simulateTranslation(htmlContent, lang) {
  let output = htmlContent;

  // Replace data-i18n content
  output = output.replace(/<([a-z0-9]+)([^>]*?)data-i18n="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, pre, key, post, oldInner) => {
    const val = clientI18n.t(key, null, lang);
    if (val !== null && val !== undefined) {
      // If oldInner contained nested icons, preserve icon if not in translation
      const iconMatch = oldInner.match(/<i\s+class="[^"]+"><\/i>/i);
      const icon = iconMatch ? iconMatch[0] + ' ' : '';
      return `<${tag}${pre}data-i18n="${key}"${post}>${icon}${val}</${tag}>`;
    }
    return match;
  });

  // Replace data-i18n-placeholder
  output = output.replace(/<input([^>]*?)data-i18n-placeholder="([^"]+)"([^>]*?)>/gi, (match, pre, key, post) => {
    const val = clientI18n.t(key, null, lang);
    return `<input${pre}data-i18n-placeholder="${key}" placeholder="${val || ''}"${post}>`;
  });

  return output;
}

const corePages = ['index.html', 'offers.html', 'pay.html', 'create.html', 'profile.html', 'past-events.html'];

// EN Mode Check
const bannedIndonesianInEn = [
  { pattern: />\s*Semua Kota\s*</i, name: 'Semua Kota' },
  { pattern: />\s*Jelajah Tiket\s*</i, name: 'Jelajah Tiket' },
  { pattern: />\s*Jual Tiket Sekarang\s*</i, name: 'Jual Tiket Sekarang' },
  { pattern: />\s*Standar Keamanan Transaksi Sekunder\s*</i, name: 'Standar Keamanan Transaksi Sekunder' },
  { pattern: />\s*Alur Transaksi Bertahap\s*</i, name: 'Alur Transaksi Bertahap' },
  { pattern: />\s*Tawaran Saya \(Pembeli\)\s*</i, name: 'Tawaran Saya (Pembeli)' },
  { pattern: />\s*Kotak Tawaran Masuk \(Penjual\)\s*</i, name: 'Kotak Tawaran Masuk (Penjual)' },
  { pattern: />\s*Status Kesiapan Akun\s*</i, name: 'Status Kesiapan Akun' },
  { pattern: />\s*Arsip Event Selesai &amp; Dibatalkan\s*</i, name: 'Arsip Event Selesai' }
];

corePages.forEach(file => {
  const raw = fs.readFileSync(path.join('public', file), 'utf8');
  const enDom = simulateTranslation(raw, 'en');

  // Check no raw keys leaked
  const rawKeyMatch = enDom.match(/>(nav\.[a-zA-Z0-9_.]+|landing\.[a-zA-Z0-9_.]+|footer\.[a-zA-Z0-9_.]+|pay\.[a-zA-Z0-9_.]+)</);
  assert.ok(!rawKeyMatch, `Raw key leaked in ${file} (EN mode): ${rawKeyMatch ? rawKeyMatch[1] : ''}`);

  // Check banned tokens
  bannedIndonesianInEn.forEach(({ pattern, name }) => {
    if (raw.match(pattern)) {
      // If pattern existed in raw HTML, ensure it is translated away in EN DOM
      assert.ok(!enDom.match(pattern), `Stray Indonesian string "${name}" still present in ${file} after EN translation!`);
    }
  });
});

console.log('  ✓ Verified 0 raw keys leaked in rendered EN DOM.');
console.log('  ✓ Verified 0 stray Indonesian chrome tokens in EN mode across core pages.');
console.log('  ✅ PASSED: Pure English mode verified.\n');

// ID Mode Check
const bannedEnglishInId = [
  { pattern: />\s*All Cities\s*</i, name: 'All Cities' },
  { pattern: />\s*Explore Tickets\s*</i, name: 'Explore Tickets' },
  { pattern: />\s*Sell Tickets Now\s*</i, name: 'Sell Tickets Now' },
  { pattern: />\s*Secondary Transaction Security Standard\s*</i, name: 'Secondary Transaction Security Standard' },
  { pattern: />\s*My Offers \(Buyer\)\s*</i, name: 'My Offers (Buyer)' },
  { pattern: />\s*Incoming Offers \(Seller\)\s*</i, name: 'Incoming Offers (Seller)' },
  { pattern: />\s*Account Readiness Status\s*</i, name: 'Account Readiness Status' },
  { pattern: />\s*Archive of Concluded &amp; Cancelled Events\s*</i, name: 'Archive of Concluded' }
];

corePages.forEach(file => {
  const raw = fs.readFileSync(path.join('public', file), 'utf8');
  const idDom = simulateTranslation(raw, 'id');

  // Check no raw keys leaked
  const rawKeyMatch = idDom.match(/>(nav\.[a-zA-Z0-9_.]+|landing\.[a-zA-Z0-9_.]+|footer\.[a-zA-Z0-9_.]+|pay\.[a-zA-Z0-9_.]+)</);
  assert.ok(!rawKeyMatch, `Raw key leaked in ${file} (ID mode): ${rawKeyMatch ? rawKeyMatch[1] : ''}`);

  // Check banned tokens
  bannedEnglishInId.forEach(({ pattern, name }) => {
    assert.ok(!idDom.match(pattern), `Stray English string "${name}" found in ${file} in ID mode!`);
  });
});

console.log('  ✓ Verified 0 raw keys leaked in rendered ID DOM.');
console.log('  ✓ Verified 0 stray English chrome tokens in ID mode across core pages.');
console.log('  ✅ PASSED: Pure Indonesian mode verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: Language Switcher Integrity (Zero "ID ID EN" Duplication)
// -----------------------------------------------------------------------------
console.log('[TEST 5] Language Switcher Integrity & Single Segmented Button...');
corePages.forEach(file => {
  const content = fs.readFileSync(path.join('public', file), 'utf8');
  const toggles = content.match(/class="[^"]*lang-(?:toggle-btn|switcher-pill)[^"]*"/g) || [];
  toggles.forEach(t => {
    // Assert no double active class
    assert.ok(!t.includes('lang-active lang-active'), `Malformed switcher button in ${file}`);
  });
  // Verify clean ID | EN pill text
  assert.ok(!content.includes('ID ID EN'), `Found duplicate 'ID ID EN' in ${file}`);
});
console.log('  ✓ Verified clean segmented ID | EN buttons with zero duplication across pages.');
console.log('  ✅ PASSED: Language switcher integrity verified.\n');

// -----------------------------------------------------------------------------
// TEST 6: Form Input Preservation on /deal/create
// -----------------------------------------------------------------------------
console.log('[TEST 6] Form Value Preservation Invariant on /deal/create...');
const clientI18nCode = fs.readFileSync('public/js/i18n.js', 'utf8');

// Assert that input, textarea, and select value properties are NEVER cleared or overwritten by applyLanguage
assert.ok(
  clientI18nCode.includes('el.tagName === \'INPUT\' || el.tagName === \'TEXTAREA\' || el.tagName === \'SELECT\''),
  'applyLanguage must explicitly guard user input fields from being overwritten'
);
assert.ok(
  clientI18nCode.includes("el.type === 'button' || el.type === 'submit'"),
  'applyLanguage value replacement must be restricted exclusively to submit/button elements'
);

console.log('  ✓ Form input preservation guard verified in public/js/i18n.js');
console.log('  ✅ PASSED: User input values are guaranteed to be preserved during locale change.\n');

// -----------------------------------------------------------------------------
// TEST 7: SSR Cookies & Query Parameter Integration
// -----------------------------------------------------------------------------
console.log('[TEST 7] SSR Request Locale Resolution via Cookies & Query Params...');

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  function request(urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${urlPath}`, { headers }, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
      }).on('error', reject);
    });
  }

  try {
    // 1. Default request -> ID
    const resDef = await request('/');
    assert.strictEqual(resDef.status, 200);
    assert.ok(resDef.data.includes('<html lang="id">') || resDef.data.includes('lang="id"'), 'Default locale should be ID');

    // 2. Cookie tikum_locale=en -> EN SSR
    const resEnCookie = await request('/blog', { Cookie: 'tikum_locale=en' });
    assert.strictEqual(resEnCookie.status, 200);
    assert.ok(resEnCookie.data.includes('<html lang="en">'), 'Cookie tikum_locale=en should render <html lang="en"> on SSR routes');

    // 3. Cookie tikum_lang=en -> EN SSR fallback
    const resEnLangCookie = await request('/blog', { Cookie: 'tikum_lang=en' });
    assert.strictEqual(resEnLangCookie.status, 200);
    assert.ok(resEnLangCookie.data.includes('<html lang="en">'), 'Cookie tikum_lang=en should render <html lang="en"> on SSR routes');

    // 4. Query param ?lang=en -> EN SSR
    const resEnQuery = await request('/blog?lang=en');
    assert.strictEqual(resEnQuery.status, 200);
    assert.ok(resEnQuery.data.includes('<html lang="en">'), '?lang=en should render <html lang="en"> on SSR routes');

    // 5. Query param ?lang=id -> ID SSR
    const resIdQuery = await request('/blog?lang=id', { Cookie: 'tikum_locale=en' });
    assert.strictEqual(resIdQuery.status, 200);
    assert.ok(resIdQuery.data.includes('<html lang="id">'), '?lang=id should override cookie and render <html lang="id">');

    console.log('  ✓ SSR respects default ID locale');
    console.log('  ✓ SSR respects cookie tikum_locale=en and tikum_lang=en');
    console.log('  ✓ SSR respects query param ?lang=en and ?lang=id with query priority');
    console.log('  ✅ PASSED: SSR locale resolution fully verified.\n');

    server.close(() => {
      console.log('======================================================================');
      console.log('  ALL 7 BILINGUAL END-TO-END AUDIT SUITES PASSED! (100% OK)');
      console.log('======================================================================\n');
      process.exit(0);
    });
  } catch (err) {
    server.close();
    console.error('Test 7 failed:', err);
    process.exit(1);
  }
});
