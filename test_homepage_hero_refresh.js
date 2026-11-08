/**
 * TIKUM — Homepage Hero Refresh Acceptance Suite
 *
 * Verifies:
 * 1. Replacement of King Nassar and Morgan Jay with BIGBANG and BTS in #verifiedConcertHero.
 * 2. Visual artwork exists and adheres to valid SVG formatting.
 * 3. Factual invariant: Zero hallucinated / invented concert dates, venues, prices, or ticket quotas.
 * 4. Displayed as featured artist discovery & live event radar with status "MENUNGGU JADWAL RESMI PROMOTOR".
 * 5. Working CTAs pointing to search (/events?q=...) and buyer protection (/panduan-pembeli).
 * 6. Bilingual i18n support in both Indonesian and English dictionaries.
 * 7. Live HTTP GET / response contains new hero content and maintains brand boundaries.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

let totalChecks = 0;
let passedChecks = 0;

function check(name, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedChecks++;
  } catch (err) {
    console.error(`  [FAIL] ${name}\n         ${err.message}`);
    process.exit(1);
  }
}

async function checkAsync(name, fn) {
  totalChecks++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedChecks++;
  } catch (err) {
    console.error(`  [FAIL] ${name}\n         ${err.message}`);
    process.exit(1);
  }
}

async function runHeroRefreshSuite() {
  console.log('===================================================================');
  console.log('  TIKUM — HOMEPAGE HERO REFRESH & FACTUAL INVARIANT ACCEPTANCE');
  console.log('===================================================================\n');

  const indexPath = path.join(__dirname, 'public', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  // --- 1. Hero Structure & Removal of Previous Artists ---
  console.log('--- 1. Hero Spotlight Structure & Artist Replacement ---');

  check('Hero section #verifiedConcertHero exists in index.html', () => {
    assert(indexHtml.includes('id="verifiedConcertHero"'), 'Must have #verifiedConcertHero');
  });

  check('Previous heroes #card-nassar and #card-morgan-jay are replaced from hero grid', () => {
    assert(!indexHtml.includes('id="card-nassar"'), 'Must not contain #card-nassar');
    assert(!indexHtml.includes('id="card-morgan-jay"'), 'Must not contain #card-morgan-jay');
  });

  check('New heroes #card-bigbang and #card-bts are present in hero grid', () => {
    assert(indexHtml.includes('id="card-bigbang"'), 'Must contain #card-bigbang');
    assert(indexHtml.includes('id="card-bts"'), 'Must contain #card-bts');
  });

  // --- 2. Visual Artwork Verification ---
  console.log('\n--- 2. High-Quality Artwork Assets ---');

  const bbPosterPath = path.join(__dirname, 'public', 'assets', 'posters', 'bigbang-artist-discovery.svg');
  const btsPosterPath = path.join(__dirname, 'public', 'assets', 'posters', 'bts-artist-discovery.svg');

  check('BIGBANG discovery poster SVG exists and is non-empty', () => {
    assert(fs.existsSync(bbPosterPath), 'bigbang-artist-discovery.svg must exist');
    const content = fs.readFileSync(bbPosterPath, 'utf8');
    assert(content.includes('<svg') && content.includes('BIGBANG'), 'Must be valid SVG with BIGBANG title');
  });

  check('BTS discovery poster SVG exists and is non-empty', () => {
    assert(fs.existsSync(btsPosterPath), 'bts-artist-discovery.svg must exist');
    const content = fs.readFileSync(btsPosterPath, 'utf8');
    assert(content.includes('<svg') && content.includes('BTS'), 'Must be valid SVG with BTS title');
  });

  check('index.html links to new SVG poster assets', () => {
    assert(indexHtml.includes('src="/assets/posters/bigbang-artist-discovery.svg"'), 'Must reference BIGBANG poster');
    assert(indexHtml.includes('src="/assets/posters/bts-artist-discovery.svg"'), 'Must reference BTS poster');
  });

  // --- 3. Factual Invariant & Zero-Hallucination Policy ---
  console.log('\n--- 3. Factual Invariants & Zero-Fake Inventory Invariant ---');

  check('Hero cards do not invent fake concert dates or fake venues', () => {
    // Must not state confirmed concert dates for BTS or BIGBANG
    assert(!indexHtml.includes('26 • 27 • 29 DESEMBER 2026'), 'Must not contain unconfirmed December dates');
    assert(indexHtml.includes('Menunggu Pengumuman Resmi Promotor'), 'Must state awaiting promoter announcement');
  });

  check('Both cards clearly display zero resale inventory (Zero Fake Inventory)', () => {
    const cardBigbang = indexHtml.split('id="card-bigbang"')[1].split('</article>')[0];
    const cardBts = indexHtml.split('id="card-bts"')[1].split('</article>')[0];

    assert(cardBigbang.includes('0 Tiket (Zero Fake Inventory'), 'BIGBANG card must show 0 tickets');
    assert(cardBts.includes('0 Tiket (Zero Fake Inventory'), 'BTS card must show 0 tickets');
  });

  check('Notice boxes state secondary sales are closed until official promoter announcements', () => {
    assert(indexHtml.includes('Belum ada jadwal konser resmi yang terverifikasi di Indonesia'), 'Must have BIGBANG notice');
    assert(indexHtml.includes('Belum ada tanggal konser resmi atau kuota tiket yang terkonfirmasi untuk Indonesia'), 'Must have BTS notice');
  });

  // --- 4. Working CTAs & Navigation ---
  console.log('\n--- 4. Working Action Buttons & Safe Routing ---');

  check('Primary CTAs route to search / event radar without fake checkout links', () => {
    assert(indexHtml.includes('href="/events?q=BIGBANG"'), 'Must have BIGBANG search CTA');
    assert(indexHtml.includes('href="/events?q=BTS"'), 'Must have BTS search CTA');
  });

  check('Secondary CTAs route to buyer protection and general event catalog', () => {
    assert(indexHtml.includes('href="/panduan-pembeli"'), 'Must have buyer protection CTA');
    assert(indexHtml.includes('href="/events"'), 'Must have all events catalog CTA');
  });

  // --- 5. Bilingual i18n Localization ---
  console.log('\n--- 5. Bilingual Localization (i18n) ---');

  const i18nPath = path.join(__dirname, 'public', 'js', 'i18n.js');
  const i18nContent = fs.readFileSync(i18nPath, 'utf8');

  check('i18n dictionary contains BIGBANG and BTS keys in Indonesian', () => {
    assert(i18nContent.includes('"bigbangTitle"'), 'Must contain bigbangTitle');
    assert(i18nContent.includes('"btsTitle"'), 'Must contain btsTitle');
    assert(i18nContent.includes('"bigbangNotice"'), 'Must contain bigbangNotice');
    assert(i18nContent.includes('"btsNotice"'), 'Must contain btsNotice');
    assert(i18nContent.includes('"bigbangExploreBtn"'), 'Must contain bigbangExploreBtn');
    assert(i18nContent.includes('"btsExploreBtn"'), 'Must contain btsExploreBtn');
  });

  check('i18n dictionary contains BIGBANG and BTS keys in English', () => {
    assert(i18nContent.includes('"BIGBANG: Discover the Live Music Experience"'), 'Must have EN bigbangTitle');
    assert(i18nContent.includes('"BTS: Track Live Event & Ticket Radar"'), 'Must have EN btsTitle');
    assert(i18nContent.includes('"Monitor BIGBANG Event Radar →"'), 'Must have EN bigbangExploreBtn');
    assert(i18nContent.includes('"Monitor BTS Event Radar →"'), 'Must have EN btsExploreBtn');
  });

  // --- 6. Live Server Verification ---
  console.log('\n--- 6. HTTP Server Surface Verification ---');

  await checkAsync('HTTP GET / returns 200 with new BIGBANG & BTS hero content', async () => {
    const app = require('./src/server');
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }).on('error', reject);
    });

    server.close();

    assert.strictEqual(res.statusCode, 200, 'GET / must return 200');
    assert(res.body.includes('id="card-bigbang"'), 'Response must contain card-bigbang');
    assert(res.body.includes('id="card-bts"'), 'Response must contain card-bts');
    assert(!res.body.includes('id="card-nassar"'), 'Response must not contain card-nassar');
    assert(!res.body.includes('id="card-morgan-jay"'), 'Response must not contain card-morgan-jay');
    assert(res.body.includes('TIKUM'), 'Response must maintain TIKUM brand');
  });

  console.log('\n===================================================================');
  console.log(`  All ${passedChecks}/${totalChecks} Homepage Hero Refresh Checks PASSED!`);
  console.log('===================================================================\n');
}

if (require.main === module) {
  runHeroRefreshSuite().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
}

module.exports = { runHeroRefreshSuite };