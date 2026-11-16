/**
 * TIKUM / ARGUS — Phase 1: Landing Page First Verification Suite
 *
 * Verifies all 10 Phase 1 Acceptance Criteria:
 * 1. Homepage serving (HTTP 200, valid HTML5)
 * 2. SEO & Schema.org JSON-LD Structured Data
 * 3. Hero & Above-the-fold CTAs (Cari Tiket, Jual Tiket)
 * 4. Featured Events & The 15th Efestaphoria (Celestix reference, Surabaya Expo Center)
 * 5. Event Discovery & Home Feed APIs
 * 6. Event Detail Page Integrity (/events/:slug)
 * 7. Genuine Ticket Listings / Zero Fake Inventory Cues
 * 8. How TIKUM Works (Dual Buyer & Seller flows)
 * 9. Trust & Safety (PIC Venue, Trust Center, Comparison)
 * 10. Contact Channels (WhatsApp, Email, PT SHINERVA PRAJNA TEJAS) & Mobile Responsiveness
 */

const assert = require('assert');
const http = require('http');
const app = require('./src/server');

async function runLandingPageTests() {
  console.log('=== TIKUM PHASE 1: LANDING PAGE FIRST ACCEPTANCE SUITE ===\n');

  const server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 0;

  function pass(name) {
    total++;
    passed++;
    console.log(`  [PASS] Test ${total}: ${name}`);
  }

  function fail(name, err) {
    total++;
    console.error(`  [FAIL] Test ${total}: ${name}`);
    console.error(`         ${err.message}`);
  }

  try {
    // 1. Homepage serving (HTTP 200)
    const homeRes = await fetch(`${baseUrl}/`, {
      headers: { 'Accept': 'text/html' }
    });
    const homeHtml = await homeRes.text();

    assert.strictEqual(homeRes.status, 200, 'Homepage must return HTTP 200');
    assert(homeHtml.includes('<!DOCTYPE html>'), 'Homepage must be HTML5');
    pass('Homepage serves valid HTML5 with HTTP 200');

    // 2. SEO & Schema.org JSON-LD
    assert(homeHtml.includes('<link rel="canonical" href="https://tikum.app/">'), 'Must have canonical link');
    assert(homeHtml.includes('<meta name="description"'), 'Must have meta description');
    assert(homeHtml.includes('property="og:title"'), 'Must have OpenGraph tags');
    assert(homeHtml.includes('name="twitter:card"'), 'Must have Twitter Card tags');
    assert(homeHtml.includes('application/ld+json'), 'Must contain JSON-LD structured data');
    assert(homeHtml.includes('"@type": "WebSite"'), 'JSON-LD must include WebSite');
    assert(homeHtml.includes('"@type": "Organization"'), 'JSON-LD must include Organization');
    assert(homeHtml.includes('"@type": "Event"'), 'JSON-LD must include Event');
    assert(homeHtml.includes('PT SHINERVA PRAJNA TEJAS'), 'JSON-LD must include PT SHINERVA PRAJNA TEJAS');
    pass('SEO tags, canonical link, OpenGraph, and Schema.org JSON-LD structured data verified');

    // 3. Hero & Above-the-fold CTAs
    assert(homeHtml.includes('id="verifiedConcertHero"'), 'Must contain hero section');
    assert(homeHtml.includes('href="#upcoming"'), 'Must contain CTA to find tickets');
    assert(homeHtml.includes('href="/create"'), 'Must contain CTA to sell tickets');
    assert(homeHtml.includes('Cari Tiket Konser'), 'Must have clear Cari Tiket button');
    assert(homeHtml.includes('Jual Tiket Anda'), 'Must have clear Jual Tiket button');
    pass('Hero banner contains prominent above-the-fold Cari Tiket and Jual Tiket CTAs');

    // 4. Featured Events & The 15th Efestaphoria (Celestix Reference)
    assert(homeHtml.includes('id="card-efestaphoria"'), 'Must feature The 15th Efestaphoria card');
    assert(homeHtml.includes('The 15th Efestaphoria'), 'Must display The 15th Efestaphoria title');
    assert(homeHtml.includes('Surabaya Expo Center'), 'Venue must be Surabaya Expo Center');
    assert(!homeHtml.includes('Grand City Convention and Exhibition') || !homeHtml.match(/Efestaphoria[\s\S]*?Grand City/i), 'Must NOT attribute Grand City to Efestaphoria');
    assert(homeHtml.includes('BEM Fakultas Ekonomi dan Bisnis Universitas Airlangga'), 'Must name BEM FEB UNAIR as organizer');
    assert(homeHtml.includes('https://www.celestix.id/event/the-15th-efestaphoria/539'), 'Must link directly to Celestix official ticket URL');
    assert(homeHtml.includes('Zero Fake Inventory'), 'Must state Zero Fake Inventory guarantee');
    pass('Featured event includes The 15th Efestaphoria with Celestix reference and Surabaya Expo Center venue');

    // 5. Event Discovery & Home Feed APIs
    const feedRes = await fetch(`${baseUrl}/api/events/home-feed`);
    assert.strictEqual(feedRes.status, 200, 'Home feed API must return HTTP 200');
    const feedData = await feedRes.json();
    assert(feedData.success, 'Feed API response must have success: true');
    assert(feedData.sections, 'Feed API response must contain sections');

    const catRes = await fetch(`${baseUrl}/api/events`);
    assert.strictEqual(catRes.status, 200, 'Events catalog API must return HTTP 200');
    const catData = await catRes.json();
    assert(Array.isArray(catData.events), 'Catalog must return events array');
    pass('Event discovery APIs (/api/events/home-feed, /api/events) operational');

    // 6. Event Detail Page (/events/:slug)
    const detailRes = await fetch(`${baseUrl}/events/the-15th-efestaphoria-surabaya-2026`);
    assert.strictEqual(detailRes.status, 200, 'Event detail page must return HTTP 200');
    const detailHtml = await detailRes.text();
    assert(detailHtml.includes('The 15th Efestaphoria'), 'Detail must include event name');
    assert(detailHtml.includes('Surabaya Expo Center'), 'Detail must include Surabaya Expo Center venue');
    assert(detailHtml.includes('celestix.id'), 'Detail must reference Celestix ticketing');
    pass('Event detail page (/events/:slug) renders verified information');

    // 7. Genuine Ticket Listings / Zero Fake Inventory Cues
    assert(homeHtml.includes('Zero Fake Inventory'), 'Must enforce Zero Fake Inventory policy');
    assert(homeHtml.includes('card-resale-empty-cue') || homeHtml.includes('Belum ada tiket resale'), 'Must display honest empty state when no resale listings exist');
    pass('Zero fake inventory and genuine empty-state cues verified');

    // 8. How TIKUM Works (Dual Buyer & Seller flows)
    assert(homeHtml.includes('id="howItWorks"'), 'Must contain howItWorks section');
    assert(homeHtml.includes('Untuk Pembeli'), 'Must contain buyer flow');
    assert(homeHtml.includes('Untuk Penjual'), 'Must contain seller flow');
    assert(homeHtml.includes('Pembayaran Terlindungi Platform') || homeHtml.includes('platform-held'), 'Must explain platform-held payment protection');
    pass('How TIKUM Works dual-column flow for buyers and sellers verified');

    // 9. Trust & Safety (PIC Venue, Trust Center, Comparison)
    assert(homeHtml.includes('id="trustCenter"'), 'Must contain trustCenter section');
    assert(homeHtml.includes('id="venuePic"'), 'Must contain venuePic section');
    assert(homeHtml.includes('id="comparison"'), 'Must contain comparison table');
    assert(homeHtml.includes('Turnstile Gate Assistance') || homeHtml.includes('turnstile'), 'Must explain gate turnstile assistance');
    pass('Trust & Safety, Event PIC venue assistance, and comparison table verified');

    // 10. Contact Channels & Mobile Responsiveness
    assert(homeHtml.includes('support@tikum.app'), 'Must provide support email');
    assert(homeHtml.includes('081299927378') || homeHtml.includes('6281299927378'), 'Must provide WhatsApp contact number');
    assert(homeHtml.includes('PT SHINERVA PRAJNA TEJAS'), 'Must state legal operating company');
    assert(homeHtml.includes('name="viewport" content="width=device-width, initial-scale=1.0'), 'Must have responsive mobile viewport');
    assert(homeHtml.includes('class="mobile-bottom-nav"'), 'Must have mobile bottom navigation bar');
    pass('Contact channels (WhatsApp, email, legal entity) and mobile responsiveness verified');

  } catch (err) {
    fail('Test suite execution error', err);
  } finally {
    server.close();
  }

  console.log(`\n=== VERIFICATION RESULT: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runLandingPageTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
