/**
 * TIKUM — Phase 3B Global Dark Design System, Header Variants & 5-Language Release Gate Suite
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

const app = require('./src/server');
const i18n = require('./src/i18n');
const { HEADER_VARIANTS, renderSharedHeader } = require('./src/ui/sharedHeader');
const clientI18n = require('./public/js/i18n');

function sha256File(relPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, relPath))).digest('hex').toUpperCase();
}

function getLeafMap(obj, prefix = '', out = {}) {
  for (const k of Object.keys(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      getLeafMap(v, p, out);
    } else {
      out[p] = v;
    }
  }
  return out;
}

async function httpGet(baseUrl, urlPath, headers = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, { headers, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text };
}

(async function main() {
  console.log('\n================================================================');
  console.log('  TIKUM — PHASE 3B GLOBAL DESIGN SYSTEM & 5-LANG RELEASE SUITE');
  console.log('================================================================\n');

  // 1. Immutable manifest check vs git blob b22279f38499299e6fe26dc09aa39c6bc597efbd + formal 3-file Option A map
  const manifestRaw = execSync('git cat-file -p b22279f38499299e6fe26dc09aa39c6bc597efbd', { encoding: 'utf8' }).trim();
  const manifestObj = JSON.parse(manifestRaw);
  const manifestEntries = Object.entries(manifestObj);
  assert.strictEqual(manifestEntries.length, 17, `Expected 17 historical manifest entries, found ${manifestEntries.length}`);

  const optionAGov = JSON.parse(fs.readFileSync(path.join(__dirname, 'GOVERNANCE_MANIFEST_OPTION_A.json'), 'utf8'));
  const optionAUpdates = optionAGov.option_a_authorized_updates || {};
  const expectedOptionAPaths = [
    'src/settlement/FinancialLedger.js',
    'src/services/escrowService.js',
    'src/services/marketplace/MarketplaceOrderService.js'
  ].sort();
  assert.deepStrictEqual(Object.keys(optionAUpdates).sort(), expectedOptionAPaths, 'Option A governance updates must cover ONLY the 3 authorized files');

  let lockedVerified = 0;
  let optionAVerified = 0;
  for (const [relPathRaw, historicalHash] of manifestEntries) {
    const relPath = relPathRaw.trim();
    const expectedOld = historicalHash.toUpperCase();
    const actualHash = sha256File(relPath);
    if (Object.prototype.hasOwnProperty.call(optionAUpdates, relPath)) {
      const entry = optionAUpdates[relPath];
      assert.strictEqual(String(entry.old_sha256 || '').toUpperCase(), expectedOld, `Option A old_sha256 mismatch for ${relPath}`);
      assert.strictEqual(actualHash, String(entry.new_sha256 || '').toUpperCase(), `Option A file hash changed beyond authorized snapshot: ${relPath}`);
      optionAVerified += 1;
    } else {
      assert.strictEqual(actualHash, expectedOld, `Locked immutable file hash changed: ${relPath}`);
      lockedVerified += 1;
    }
  }
  assert.strictEqual(lockedVerified, 14, `Expected 14 locked manifest files, verified ${lockedVerified}`);
  assert.strictEqual(optionAVerified, 3, `Expected 3 Option A manifest files, verified ${optionAVerified}`);
  console.log('  [PASS] 1. Governance manifest verified: 14/14 locked + 3/3 Option A authorized hashes PASS.');

  // 2. Official master SVGs + Legacy 4 SVGs + Guarded PNG Assets Intact (No Photo Banners in Hero)
  const EXPECTED_MASTER_HASH = 'DFDEA1FCCA5B8B7B5C998916A8C21C36AE2133069AF0FD7A8FC464F7C8EF2754';
  assert.strictEqual(sha256File('public/images/tikum horizonzal logo pinggir.svg'), EXPECTED_MASTER_HASH);
  assert.strictEqual(sha256File('research/tikum horizonzal logo pinggir.svg'), EXPECTED_MASTER_HASH);
  for (const rel of [
    'public/images/tikum-brand-horizontal.svg',
    'public/images/tikum-brand-symbol.svg',
    'public/images/tikum-horizontal.svg',
    'public/images/tikum-horizontal-light.svg',
    'public/images/tikum-logo.svg',
    'public/images/tikum-symbol.svg',
    'public/images/heropage2.png',
    'public/images/heropage3.png'
  ]) {
    assert.ok(fs.existsSync(path.join(__dirname, rel)), `Missing required asset: ${rel}`);
  }
  const indexHtmlSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const refreshCssSrc = fs.readFileSync(path.join(__dirname, 'public/css/marketplace-refresh.css'), 'utf8');
  assert.ok(!indexHtmlSrc.includes('heropage2.png') && !indexHtmlSrc.includes('heropage3.png'), 'Homepage HTML must not embed heropage2.png or heropage3.png');
  assert.ok(!refreshCssSrc.includes('heropage2.png') && !refreshCssSrc.includes('heropage3.png'), 'marketplace-refresh.css must not use heropage2.png or heropage3.png');
  assert.ok(!indexHtmlSrc.includes('id="liveExperiences"') && !refreshCssSrc.includes('.live-experiences'), 'Live Experiences photo section must be removed');
  assert.ok(indexHtmlSrc.includes('class="hero-quick-chips"') && indexHtmlSrc.includes('class="hero-trust-strip"'), 'Homepage hero must render search-first quick chips and compact trust strip');
  const brandSvg = fs.readFileSync(path.join(__dirname, 'public/images/tikum-brand-horizontal.svg'), 'utf8');
  assert.ok(brandSvg.includes('fill-rule="evenodd"'), 'Horizontal brand SVG must preserve evenodd counters');
  assert.ok(!brandSvg.includes('#000139'), 'Horizontal brand SVG must be transparent without #000139 box');
  console.log('  [PASS] 2. Master SVGs, legacy SVGs, physical PNG files preserved, and photo-free search-first hero verified.');

  // 3. Global Approved Dark Palette & Retired Petrol Teal / Off-Palette Exclusion
  const cssFiles = fs.readdirSync(path.join(__dirname, 'public/css')).filter(f => f.endsWith('.css'));
  const combinedCss = cssFiles.map(f => fs.readFileSync(path.join(__dirname, 'public/css', f), 'utf8')).join('\n');
  for (const hex of ['#15365B', '#172333', '#24364D', '#FFFFFF', '#CBD5E1', '#E36F45', '#F3EBDD']) {
    assert.ok(combinedCss.toUpperCase().includes(hex), `Approved color missing in CSS: ${hex}`);
  }
  assert.ok(!/(#124E61|#0E3B4A|#006BB6|#081E3C|#E05A2B|#0B1220|#111C2E|#1B2A40|#F6EBDD)/i.test(combinedCss), 'Retired petrol teal or off-palette hex must not exist in public/css');
  console.log('  [PASS] 3. Approved 7-color dark design tokens verified and retired colors absent.');

  // 4. Zero Light/Dark UI toggles across public HTML + JSX
  const publicHtmlFiles = fs.readdirSync(path.join(__dirname, 'public')).filter(f => f.endsWith('.html'));
  assert.strictEqual(publicHtmlFiles.length, 21, `Expected 21 public HTML files, found ${publicHtmlFiles.length}`);
  for (const file of publicHtmlFiles) {
    const html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
    assert.ok(!/data-theme-toggle|id=["']themeToggle["']|id=["']btnThemeToggle["']|onClick=\{toggleTheme\}/i.test(html), `Light/Dark toggle control still exists in ${file}`);
    assert.ok(html.includes('i18n.js'), `${file} missing i18n.js`);
    assert.ok(html.includes('header-shared.js'), `${file} missing header-shared.js`);
    assert.ok(html.includes('tikum-tokens.css'), `${file} missing tikum-tokens.css`);
    if (file !== 'admin.html' && file !== 'admin-login.html') {
      assert.ok(!/argus/i.test(html), `Customer-facing ${file} must not leak ARGUS`);
    }
  }
  const adminHtml = fs.readFileSync(path.join(__dirname, 'public/admin.html'), 'utf8');
  assert.ok(adminHtml.includes('TIKUM Operations Console — ARGUS Trust Engine | SHINERVA HQ'), 'admin.html title must preserve ARGUS Trust Engine');
  assert.ok(adminHtml.includes('Powered by ARGUS Trust Engine'), 'admin.html subtitle must preserve ARGUS Trust Engine');
  console.log('  [PASS] 4. Zero Light/Dark toggles, all 21 HTML files wired cleanly, and ARGUS brand boundary verified.');

  // 5. All 6 Shared Header Variants
  for (const variant of ['public', 'marketplace', 'auth', 'buyer-dashboard', 'seller-dashboard', 'admin']) {
    const rendered = renderSharedHeader({ variant, locale: 'en' });
    assert.ok(rendered.includes(`data-header-variant="${variant}"`), `Missing variant attribute ${variant}`);
    assert.ok(rendered.includes('/images/tikum-brand-horizontal.svg'), `Missing horizontal logo in variant ${variant}`);
  }
  console.log('  [PASS] 5. All 6 shared header variants verified.');

  // 6. All 5 Languages (id, en, ms, tl, th) + Strict Parity + Persistence + Precedence
  const locales = ['id', 'en', 'ms', 'tl', 'th'];
  assert.deepStrictEqual(i18n.CANONICAL_LOCALES, locales);
  assert.strictEqual(i18n.normalizeLocale('fil'), 'tl');
  assert.strictEqual(i18n.normalizeLocale('xx-invalid'), 'id');
  assert.strictEqual(clientI18n.normalizeLang('fil'), 'tl');
  assert.strictEqual(clientI18n.normalizeLang('invalid'), null);
  assert.strictEqual(clientI18n.resolveInitialLanguage('?lang=invalid', ''), 'id');
  assert.strictEqual(clientI18n.resolveInitialLanguage('?lang=th', 'en'), 'th');
  assert.strictEqual(clientI18n.resolveInitialLanguage('', 'ms'), 'ms');
  assert.strictEqual(clientI18n.resolveInitialLanguage('', ''), 'id');
  assert.strictEqual(i18n.resolveRequestLocale({ query: {}, headers: { cookie: 'tikum_locale=tl' } }), 'tl');
  assert.strictEqual(i18n.resolveRequestLocale({ query: { lang: 'th' }, headers: { cookie: 'tikum_locale=ms' } }), 'th');

  const idLeaves = getLeafMap(require('./src/i18n/dictionaries/id'));
  const idKeys = Object.keys(idLeaves);
  for (const loc of locales) {
    const serverDict = require(`./src/i18n/dictionaries/${loc}`);
    const serverLeaves = getLeafMap(serverDict);
    const clientLeaves = getLeafMap(clientI18n.translations[loc]);
    assert.strictEqual(Object.keys(serverLeaves).length, idKeys.length, `Server dict key mismatch for ${loc}`);
    assert.strictEqual(Object.keys(clientLeaves).length, idKeys.length, `Client dict key mismatch for ${loc}`);
    for (const k of idKeys) {
      assert.ok(typeof serverLeaves[k] === 'string' && serverLeaves[k].trim().length > 0, `Empty server key ${loc}.${k}`);
      assert.ok(typeof clientLeaves[k] === 'string' && clientLeaves[k].trim().length > 0, `Empty client key ${loc}.${k}`);
    }
  }
  console.log(`  [PASS] 6. 5-language (id/en/ms/tl/th) server+client dictionary parity verified (${idKeys.length} keys each).`);

  // 7. Live HTTP route check (static, SSR, legacy SVGs, localized SSR query)
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const svgUrl of [
      '/images/tikum-brand-horizontal.svg',
      '/images/tikum-brand-symbol.svg',
      '/images/tikum-horizontal.svg',
      '/images/tikum-horizontal-light.svg',
      '/images/tikum-logo.svg',
      '/images/tikum-symbol.svg',
      '/images/heropage2.png',
      '/images/heropage3.png'
    ]) {
      const res = await httpGet(baseUrl, svgUrl);
      assert.strictEqual(res.status, 200, `${svgUrl} must return HTTP 200`);
    }

    for (const route of ['/', '/offers', '/login', '/signup', '/admin/login', '/events', '/blog', '/how-it-works', '/faq', '/contact', '/terms', '/privacy', '/refund-policy']) {
      const res = await httpGet(baseUrl, `${route}?lang=tl`);
      assert.strictEqual(res.status, 200, `${route}?lang=tl must return HTTP 200`);
      if (route !== '/admin/login') {
        assert.ok(!/argus/i.test(res.body), `Route ${route} must not leak ARGUS`);
      }
      if (['/events', '/blog', '/how-it-works', '/venues', '/artists', '/cities', '/categories'].includes(route)) {
        assert.ok(res.body.includes('<html lang="tl"'), `${route}?lang=tl must set html lang="tl"`);
        assert.ok(res.body.includes('/css/tikum-tokens.css') && res.body.includes('/js/theme.js'), `${route} must load dark design tokens and theme initializer`);
      }
    }

    // Authenticated dashboard & admin routes
    const { state, resetDatabase } = require('./src/database');
    const { SessionStore } = require('./src/services/sessionStore');
    const { adminSecurityStore } = require('./src/storage/AdminSecurityStore');
    resetDatabase();
    const buyer = state.users.find(u => u.id === 'buyer-1');
    const seller = state.users.find(u => u.id === 'seller-1');
    const admin = state.users.find(u => u.id === 'admin-1');
    const bSes = SessionStore.createSession({ userId: buyer.id, role: buyer.role, email: buyer.email });
    const sSes = SessionStore.createSession({ userId: seller.id, role: seller.role, email: seller.email });
    const aSes = SessionStore.createSession({ userId: admin.id, role: 'admin', email: admin.email });
    adminSecurityStore.registerTestSession(aSes.session_token, { id: admin.id, email: admin.email, role: 'ADMIN', name: admin.name });

    for (const [dashRoute, tok] of [['/app/buyer', bSes.session_token], ['/app/seller', sSes.session_token], ['/admin', aSes.session_token]]) {
      const anonRes = await httpGet(baseUrl, dashRoute);
      assert.ok([302, 401].includes(anonRes.status), `${dashRoute} must fail closed when unauthenticated`);
      const authRes = await httpGet(baseUrl, `${dashRoute}?lang=tl`, { Cookie: `session_token=${tok}` });
      assert.strictEqual(authRes.status, 200, `Authenticated ${dashRoute} must return HTTP 200`);
      assert.ok(authRes.body.includes('/images/tikum-brand-horizontal.svg'), `${dashRoute} must include transparent brand logo`);
    }

    for (const entityRoute of ['/venues?lang=th', '/artists?lang=ms', '/cities?lang=tl', '/categories/konser?lang=en']) {
      const res = await httpGet(baseUrl, entityRoute);
      assert.strictEqual(res.status, 200, `${entityRoute} must return HTTP 200`);
      const loc = entityRoute.split('=')[1];
      assert.ok(res.body.includes(`<html lang="${loc}"`), `${entityRoute} must reflect locale ${loc}`);
      assert.ok(res.body.includes('/css/tikum-tokens.css') && res.body.includes('/js/theme.js'), `${entityRoute} must load dark design tokens`);
    }
    console.log('  [PASS] 7. All HTTP assets, legacy SVGs, static pages, and 5-locale SSR routes verified 200 OK.');
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('  ALL PHASE 3B DESIGN SYSTEM, LOGO, HEADER & 5-LANG GATES PASSED!');
  console.log('================================================================\n');
  process.exit(0);
})();
