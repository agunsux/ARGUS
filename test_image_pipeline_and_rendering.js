/**
 * TIKUM / ARGUS — End-to-End Event Image Pipeline & UI Rendering Test Suite (Section 8)
 *
 * Tests all 14 mandatory requirements from the Image Coverage & Release Readiness Epic:
 *  1. Adapter extracts official/authorized image_url when present in source fixture.
 *  2. Normalization preserves image_url, image_source_url, image_source_type, and image_status.
 *  3. Repository upsert/update preserves existing verified image when a weaker or null update arrives.
 *  4. Deduplication merge keeps the higher-priority verified image.
 *  5. Event with no source image gets image_status = SOURCE_LINK_ONLY or MISSING, not a fake image.
 *  6. Event with 404 image gets image_status = BROKEN and UI renders fallback placeholder.
 *  7. Event with timeout/503 image failure keeps event active and does not falsely cancel or delete the event.
 *  8. Invalid URL schemes (javascript:, data:, file:, localhost, private IPs) are rejected.
 *  9. /api/events/home-feed and /api/discovery/events return image fields consistently.
 * 10. /events/:slug includes image or fallback metadata and official source link.
 * 11. Frontend card renders <img> when image_url is valid and swaps to fallback on onerror.
 * 12. Frontend card renders clean branded fallback when image_url is null/broken.
 * 13. Past/archived events remain excluded from default public feed regardless of whether they have images.
 * 14. Unverified events remain excluded from default public feed even if they have an image URL.
 */

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
process.env.ARGUS_DB_READ_ONLY = 'true';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = require('./src/server');
const { LoketAdapter } = require('./src/discovery/adapters/LoketAdapter');
const { OfficialEventDiscoverySource } = require('./src/discovery/supply/OfficialEventDiscoverySource');
const { DiscoveredEvent } = require('./src/discovery/models/DiscoveredEvent');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { InMemoryCatalogRepository } = require('./src/discovery/repository/InMemoryCatalogRepository');
const { EventVisualProvenanceService, IMAGE_STATUS } = require('./src/discovery/EventVisualProvenanceService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function request(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const req = http.request(url, { method: 'GET' }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { /* html */ }
        resolve({ status: res.statusCode, headers: res.headers, body: json !== null ? json : data, raw: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest(id, name, fn) {
  try {
    await fn();
    console.log(`  \u001b[32m✓\u001b[0m [T${String(id).padStart(2, '0')}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u001b[31m✗\u001b[0m [T${String(id).padStart(2, '0')}] ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('========================================================================');
  console.log('TIKUM — IMAGE PIPELINE & UI RENDERING ACCEPTANCE SUITE (14 GATES)');
  console.log('========================================================================\n');

  await canonicalRegistry.hydrateFromRepository();

  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // ---------------------------------------------------------------------------
  // TEST 1: Adapter extracts official/authorized image_url when present in source fixture
  // ---------------------------------------------------------------------------
  await runTest(1, 'Adapter extracts official/authorized image_url when present in source fixture', async () => {
    const loketAdapter = new LoketAdapter();
    const rawLoketPayload = {
      source_event_id: 'loket-test-9991',
      title: 'Hindia — Menari Dengan Bayangan Jakarta 2026',
      start_date: '2026-11-20',
      end_date: '2026-11-20',
      venue_name: 'Tennis Indoor Senayan',
      city: 'Jakarta',
      country: 'Indonesia',
      category: 'CONCERT',
      url: 'https://www.loket.com/event/hindia-jakarta-2026',
      banners: {
        desktop: 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png'
      },
      min_price: 550000
    };
    const parsed = loketAdapter.parse(rawLoketPayload);
    assert.strictEqual(
      parsed.image_url,
      'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png',
      'LoketAdapter.parse must extract banner into image_url'
    );
    assert.strictEqual(parsed.image_source_type, 'OFFICIAL_TICKETING');
    assert.strictEqual(parsed.image_status, IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER);
    assert.strictEqual(parsed.image_source_url, 'https://www.loket.com/event/hindia-jakarta-2026');

    const officialSource = new OfficialEventDiscoverySource();
    const officialEvents = await officialSource.discover();
    const lalala = officialEvents.find(e => /lalala/i.test(e.canonical_name || e.raw_title || e.title || ''));
    assert.ok(lalala, 'OfficialEventDiscoverySource must include LaLaLa Festival Jakarta 2027');
    assert.strictEqual(lalala.image_url, 'https://lalalafest.com/images/og-image.webp');
    assert.strictEqual(lalala.image_source_type, 'OFFICIAL_EVENT_WEB');
    assert.strictEqual(lalala.image_status, IMAGE_STATUS.VERIFIED_OFFICIAL);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Normalization preserves image_url, image_source_url, image_source_type, and image_status
  // ---------------------------------------------------------------------------
  await runTest(2, 'Normalization (DiscoveredEvent -> toCanonicalEventPayload) preserves all image fields', async () => {
    const discovered = new DiscoveredEvent({
      source_id: 'src-loket',
      source_name: 'LOKET',
      source_type: 'AUTHORIZED_TICKETING',
      source_event_id: 'loket-norm-test-1',
      source_url: 'https://www.loket.com/event/norm-test-2026',
      official_ticket_url: 'https://www.loket.com/event/norm-test-2026',
      title: 'Tulus Tur Manusia Jakarta 2026',
      start_date: '2026-12-05',
      start_datetime: '2026-12-05T19:00:00+07:00',
      venue_name: 'Istora Senayan',
      city: 'Jakarta',
      country: 'Indonesia',
      category: 'CONCERT',
      price_min: 750000,
      price_currency: 'IDR',
      verification_status: 'VERIFIED',
      is_verified: true,
      image_url: 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png',
      thumbnail_url: 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png',
      image_source_url: 'https://www.loket.com/event/norm-test-2026',
      image_source_type: 'AUTHORIZED_TICKET_SELLER',
      image_status: IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER,
      image_verified_at: '2026-10-12T00:00:00.000Z'
    });

    const canonicalPayload = discovered.toCanonicalEventPayload();
    assert.strictEqual(canonicalPayload.image_url, 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png');
    assert.strictEqual(canonicalPayload.thumbnail_url, 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png');
    assert.strictEqual(canonicalPayload.image_source_url, 'https://www.loket.com/event/norm-test-2026');
    assert.strictEqual(canonicalPayload.image_source_type, 'AUTHORIZED_TICKET_SELLER');
    assert.strictEqual(canonicalPayload.image_status, IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER);
    assert.strictEqual(canonicalPayload.image_verified_at, '2026-10-12T00:00:00.000Z');
    assert.strictEqual(canonicalPayload.metadata.image_url, canonicalPayload.image_url);
    assert.strictEqual(canonicalPayload.metadata.image_status, IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER);
    assert.strictEqual(canonicalPayload.homepage_visibility, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Repository upsert/update preserves existing verified image when a weaker or null update arrives
  // ---------------------------------------------------------------------------
  await runTest(3, 'Repository upsert preserves existing verified image when a weaker or null update arrives', async () => {
    const memRepo = new InMemoryCatalogRepository();
    const initial = await memRepo.upsertCanonicalEvent({
      id: 'evt-preserve-img-1',
      slug: 'evt-preserve-img-1',
      title: 'Synchronize Fest 2026',
      normalized_title: 'synchronize fest 2026',
      category: 'FESTIVAL',
      start_datetime: '2026-10-25T14:00:00+07:00',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      country: 'Indonesia',
      verification_status: 'PRIMARY_SOURCE_VERIFIED',
      status: 'ACTIVE',
      image_url: 'https://synchronizefestival.com/assets/images/main.png',
      image_source_url: 'https://synchronizefestival.com',
      image_source_type: 'OFFICIAL_ORGANIZER',
      image_status: IMAGE_STATUS.VERIFIED_OFFICIAL,
      image_verified_at: '2026-10-12T00:00:00.000Z',
      metadata: {
        source_url: 'https://synchronizefestival.com'
      }
    });
    assert.strictEqual(initial.image_url, 'https://synchronizefestival.com/assets/images/main.png');

    // Now upsert a weaker/null update for the same event
    const updatedWithNull = await memRepo.upsertCanonicalEvent({
      id: 'evt-preserve-img-1',
      slug: 'evt-preserve-img-1',
      title: 'Synchronize Fest 2026',
      normalized_title: 'synchronize fest 2026',
      category: 'FESTIVAL',
      start_datetime: '2026-10-25T14:00:00+07:00',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      country: 'Indonesia',
      verification_status: 'VERIFIED',
      status: 'ACTIVE',
      image_url: null,
      image_status: IMAGE_STATUS.SOURCE_LINK_ONLY,
      metadata: {
        source_url: 'https://synchronizefestival.com'
      }
    });

    assert.strictEqual(
      updatedWithNull.image_url,
      'https://synchronizefestival.com/assets/images/main.png',
      'Null image update must NOT overwrite existing verified official image'
    );
    assert.strictEqual(updatedWithNull.image_status, IMAGE_STATUS.VERIFIED_OFFICIAL);
    assert.strictEqual(updatedWithNull.image_source_type, 'OFFICIAL_ORGANIZER');
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Deduplication merge keeps the higher-priority verified image
  // ---------------------------------------------------------------------------
  await runTest(4, 'Deduplication merge keeps higher-priority verified image (OFFICIAL_ORGANIZER > OFFICIAL_VENUE > AUTHORIZED_TICKET_SELLER)', async () => {
    const sellerEvent = {
      id: 'evt-merge-priority-1',
      title: 'Djakarta Warehouse Project 2026',
      city: 'Jakarta',
      image_url: 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png',
      image_source_url: 'https://www.loket.com/event/dwp-2026',
      image_source_type: 'AUTHORIZED_TICKET_SELLER',
      image_status: IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER,
      image_verified_at: '2026-10-11T00:00:00.000Z',
      sources: [{ source_name: 'LOKET', source_url: 'https://www.loket.com/event/dwp-2026' }],
      metadata: {}
    };

    const organizerEvent = {
      id: 'evt-merge-priority-2',
      title: 'Djakarta Warehouse Project (DWP) 2026',
      city: 'Jakarta',
      image_url: 'https://dwpfest.com/icons/richlink.jpg',
      image_source_url: 'https://dwpfest.com/',
      image_source_type: 'OFFICIAL_ORGANIZER',
      image_status: IMAGE_STATUS.VERIFIED_OFFICIAL,
      image_verified_at: '2026-10-12T00:00:00.000Z',
      sources: [{ source_name: 'DWP_OFFICIAL', source_url: 'https://dwpfest.com/' }],
      metadata: {}
    };

    const merged1 = EventDeduplicationService.mergeCanonicalPair(sellerEvent, organizerEvent);
    assert.strictEqual(merged1.image_url, 'https://dwpfest.com/icons/richlink.jpg', 'OFFICIAL_ORGANIZER must win over AUTHORIZED_TICKET_SELLER');
    assert.strictEqual(merged1.image_source_type, 'OFFICIAL_ORGANIZER');
    assert.strictEqual(merged1.image_status, IMAGE_STATUS.VERIFIED_OFFICIAL);
    assert.strictEqual(merged1.sources.length, 2, 'Merged event must retain both sources');

    const merged2 = EventDeduplicationService.mergeCanonicalPair(organizerEvent, sellerEvent);
    assert.strictEqual(merged2.image_url, 'https://dwpfest.com/icons/richlink.jpg', 'Existing OFFICIAL_ORGANIZER must not be downgraded by AUTHORIZED_TICKET_SELLER');
    assert.strictEqual(merged2.image_source_type, 'OFFICIAL_ORGANIZER');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Event with no source image gets image_status = SOURCE_LINK_ONLY or MISSING, not a fake image
  // ---------------------------------------------------------------------------
  await runTest(5, 'Event with no source image gets image_status = SOURCE_LINK_ONLY or MISSING, never a fabricated image', async () => {
    const withSourceLinkOnly = EventVisualProvenanceService.resolveCatalogEventImageProvenance({
      id: 'evt-no-img-with-source',
      title: 'Morgan Jay: The Goofy Guy Tour — Jakarta',
      source_url: 'https://www.morganjay.com/tour',
      image_url: null
    });
    assert.strictEqual(withSourceLinkOnly.image_url, null);
    assert.strictEqual(withSourceLinkOnly.image_status, IMAGE_STATUS.SOURCE_LINK_ONLY);
    assert.strictEqual(withSourceLinkOnly.is_fallback_image, true);

    const withMissingEverything = EventVisualProvenanceService.resolveCatalogEventImageProvenance({
      id: 'evt-no-img-no-source',
      title: 'Unverified Seed Event Without Link',
      source_url: null,
      image_url: null
    });
    assert.strictEqual(withMissingEverything.image_url, null);
    assert.strictEqual(withMissingEverything.image_status, IMAGE_STATUS.MISSING);
    assert.strictEqual(withMissingEverything.is_fallback_image, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Event with 404 image gets image_status = BROKEN and UI renders fallback placeholder
  // ---------------------------------------------------------------------------
  await runTest(6, 'Event with 404 image gets image_status = BROKEN and UI renders branded fallback', async () => {
    const brokenResolved = EventVisualProvenanceService.resolveCatalogEventImageProvenance({
      id: 'ev-can-91e784f5',
      title: 'BABYMONSTER [SEE YOU THERE] / CHoom Tour — Jakarta 2026',
      source_url: 'https://www.pk-ent.com/',
      image_url: 'https://cdn.ruangevent.id/temgmt/babymonster/babymonster-choom-jakarta-banner.jpg',
      image_status: IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER
    });
    assert.strictEqual(brokenResolved.image_status, IMAGE_STATUS.BROKEN);
    assert.strictEqual(brokenResolved.image_url, null, 'Broken 404 image URL must not be exposed as renderable image_url');
    assert.strictEqual(brokenResolved.broken_image_url, 'https://cdn.ruangevent.id/temgmt/babymonster/babymonster-choom-jakarta-banner.jpg');
    assert.strictEqual(brokenResolved.is_fallback_image, true);

    // Verify SSR /events page renders fallback block for BABYMONSTER
    const eventsHtmlRes = await request('/events');
    assert.strictEqual(eventsHtmlRes.status, 200);
    assert.ok(eventsHtmlRes.raw.includes('catalog-card-fallback'), 'SSR /events must render .catalog-card-fallback for events without verified image');
    assert.ok(!eventsHtmlRes.raw.includes('https://cdn.ruangevent.id/temgmt/babymonster/babymonster-choom-jakarta-banner.jpg'), 'SSR /events must not render known 404 cdn.ruangevent.id img src');
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Event with timeout/503 image failure keeps event active and does not falsely cancel or delete the event
  // ---------------------------------------------------------------------------
  await runTest(7, 'Event with timeout/503 image failure keeps event ACTIVE and VERIFIED (decoupled from event lifecycle)', async () => {
    const activeEvent = {
      id: 'evt-transient-img-503',
      title: 'Kanye West Bully World Tour Jakarta 2026',
      status: 'ACTIVE',
      lifecycle_status: 'UPCOMING',
      verification_status: 'PRIMARY_SOURCE_VERIFIED',
      is_verified: true,
      homepage_visibility: true,
      source_url: 'https://www.loket.com/event/kanye-west-jakarta-2026',
      image_url: 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png',
      image_source_type: 'AUTHORIZED_TICKET_SELLER',
      image_status: IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER,
      metadata: {}
    };

    const afterTransientTimeout = EventVisualProvenanceService.applyImageHealthResult({ ...activeEvent }, {
      ok: false,
      healthy: false,
      http_status: 503,
      retryable: true,
      image_status: IMAGE_STATUS.TRANSIENT_FAILURE,
      reason: 'HTTP_503_TRANSIENT'
    });

    assert.strictEqual(afterTransientTimeout.status, 'ACTIVE', 'Event status must remain ACTIVE after image 503');
    assert.strictEqual(afterTransientTimeout.lifecycle_status, 'UPCOMING', 'Event lifecycle_status must remain UPCOMING');
    assert.strictEqual(afterTransientTimeout.verification_status, 'PRIMARY_SOURCE_VERIFIED', 'Event verification_status must remain untouched');
    assert.strictEqual(afterTransientTimeout.is_verified, true, 'Event is_verified must remain true');
    assert.strictEqual(afterTransientTimeout.homepage_visibility, true, 'Event homepage_visibility must remain true');
    assert.strictEqual(
      afterTransientTimeout.image_url,
      'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png',
      'Transient 503 must preserve existing verified image_url'
    );

    const after404 = EventVisualProvenanceService.applyImageHealthResult({ ...activeEvent }, {
      ok: false,
      healthy: false,
      http_status: 404,
      image_status: IMAGE_STATUS.BROKEN,
      reason: 'HTTP_404'
    });
    assert.strictEqual(after404.status, 'ACTIVE', 'Event status must remain ACTIVE even when image returns 404');
    assert.strictEqual(after404.verification_status, 'PRIMARY_SOURCE_VERIFIED');
    assert.strictEqual(after404.image_status, IMAGE_STATUS.BROKEN);
    assert.strictEqual(after404.image_url, null);
    assert.strictEqual(after404.broken_image_url, 'https://assets.loket.com/neo/production/images/banner/20260409211641_69d7b409986d6.png');
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Invalid URL schemes (javascript:, data:, file:, localhost, private IPs) are rejected
  // ---------------------------------------------------------------------------
  await runTest(8, 'Invalid URL schemes (javascript:, data:, file:, localhost, private IPs) are strictly rejected', async () => {
    const maliciousInputs = [
      'javascript:alert(document.cookie)',
      'JAVASCRIPT:fetch("https://evil.example")',
      'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=',
      'file:///etc/passwd',
      'http://localhost:8080/poster.jpg',
      'https://127.0.0.1/poster.png',
      'http://192.168.1.10/banner.jpg',
      'http://10.0.0.5/internal.png',
      'http://172.16.0.1/secret.jpg',
      'http://169.254.169.254/latest/meta-data/'
    ];

    for (const badUrl of maliciousInputs) {
      const check = EventVisualProvenanceService.validateImageUrl(badUrl);
      assert.strictEqual(
        check.valid,
        false,
        `validateImageUrl must reject unsafe URL: ${badUrl}`
      );
      const resolved = EventVisualProvenanceService.resolveCatalogEventImageProvenance({
        id: 'evt-unsafe-url-test',
        title: 'Unsafe URL Test',
        image_url: badUrl
      });
      assert.strictEqual(resolved.image_url, null, `resolveCatalogEventImageProvenance must reject unsafe URL: ${badUrl}`);
      assert.strictEqual(resolved.image_status, IMAGE_STATUS.BROKEN);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 9: /api/events/home-feed and /api/discovery/events return image fields consistently
  // ---------------------------------------------------------------------------
  await runTest(9, '/api/events/home-feed and /api/discovery/events return image fields consistently across all public events', async () => {
    const [homeFeedRes, discoveryRes] = await Promise.all([
      request('/api/events/home-feed'),
      request('/api/discovery/events?limit=100')
    ]);

    assert.strictEqual(homeFeedRes.status, 200);
    assert.strictEqual(discoveryRes.status, 200);

    const homeFeedEvents = homeFeedRes.body.feed || homeFeedRes.body.events || [];
    const discoveryEvents = discoveryRes.body.events || discoveryRes.body.data || [];

    assert.strictEqual(homeFeedEvents.length, 35, `Expected 35 deduplicated public upcoming events in home-feed, got ${homeFeedEvents.length}`);
    assert.strictEqual(discoveryEvents.length, 35, `Expected 35 deduplicated public upcoming events in /api/discovery/events, got ${discoveryEvents.length}`);

    const nassarFeed = homeFeedEvents.find(e => e.slug === 'king-nassar-lost-in-the-jungle-jakarta-2026' || e.id === 'event-nassar-lost-in-the-jungle-2026');
    assert.ok(nassarFeed, 'King Nassar: Lost In The Jungle must be present in /api/events/home-feed');
    assert.strictEqual(nassarFeed.image_url, '/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg');
    assert.strictEqual(nassarFeed.image_status, IMAGE_STATUS.VERIFIED_OFFICIAL);
    assert.strictEqual(nassarFeed.is_fallback_image, false);

    const nassarAssetRes = await request('/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg');
    assert.strictEqual(nassarAssetRes.status, 200, 'King Nassar poster JPG must return HTTP 200');
    assert.ok(String(nassarAssetRes.headers['content-type'] || '').startsWith('image/jpeg'), 'King Nassar poster must serve Content-Type: image/jpeg');

    const discoveryById = new Map(discoveryEvents.map(e => [e.id || e.event_id, e]));
    let verifiedCount = 0;
    let fallbackCount = 0;

    for (const hfEvent of homeFeedEvents) {
      const id = hfEvent.id || hfEvent.event_id;
      const discEvent = discoveryById.get(id);
      assert.ok(discEvent, `Event ${id} missing in /api/discovery/events`);
      assert.strictEqual(hfEvent.image_url, discEvent.image_url, `image_url mismatch for ${hfEvent.slug}`);
      assert.strictEqual(hfEvent.image_status, discEvent.image_status, `image_status mismatch for ${hfEvent.slug}`);
      assert.strictEqual(hfEvent.image_source_type, discEvent.image_source_type, `image_source_type mismatch for ${hfEvent.slug}`);

      if (hfEvent.image_url) {
        verifiedCount++;
        assert.ok(
          [IMAGE_STATUS.VERIFIED_OFFICIAL, IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER].includes(hfEvent.image_status),
          `Expected VERIFIED_* image_status for ${hfEvent.slug}, got ${hfEvent.image_status}`
        );
      } else {
        fallbackCount++;
        assert.ok(
          [IMAGE_STATUS.BROKEN, IMAGE_STATUS.SOURCE_LINK_ONLY].includes(hfEvent.image_status),
          `Expected BROKEN or SOURCE_LINK_ONLY for ${hfEvent.slug}, got ${hfEvent.image_status}`
        );
      }
    }

    assert.strictEqual(verifiedCount, 25, `Expected 25 public upcoming events with verified HTTP 200 image/* banners, got ${verifiedCount}`);
    assert.strictEqual(fallbackCount, 10, `Expected 10 public upcoming events with honest fallback (4 BROKEN + 6 SOURCE_LINK_ONLY), got ${fallbackCount}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 10: /events/:slug includes image or fallback metadata and official source link
  // ---------------------------------------------------------------------------
  await runTest(10, '/events/:slug includes verified image or honest fallback metadata plus official source link', async () => {
    const discoveryRes = await request('/api/discovery/events?limit=100');
    const events = discoveryRes.body.events || [];
    const withImage = events.find(e => e.image_url && e.image_status === IMAGE_STATUS.VERIFIED_OFFICIAL) || events.find(e => e.image_url);
    const withFallback = events.find(e => !e.image_url && (e.image_status === IMAGE_STATUS.SOURCE_LINK_ONLY || e.image_status === IMAGE_STATUS.BROKEN));

    assert.ok(withImage, 'Expected at least one event with a verified image');
    const resImg = await request(`/events/${withImage.slug}`);
    assert.strictEqual(resImg.status, 200);
    assert.ok(resImg.raw.includes('<figure class="event-poster"'), `Detail page /events/${withImage.slug} must render .event-poster figure`);
    assert.ok(resImg.raw.includes('<img src="'), `Detail page /events/${withImage.slug} must render <img> tag`);
    assert.ok(resImg.raw.includes('loading="lazy"') && resImg.raw.includes('decoding="async"'), 'Detail page <img> must include lazy loading and async decoding');
    assert.ok(resImg.raw.includes('Sumber Tiket Resmi') || resImg.raw.includes('Buka Halaman Tiket Resmi'), 'Detail page must include official source link');

    assert.ok(withFallback, 'Expected at least one event with honest fallback');
    const resFallback = await request(`/events/${withFallback.slug}`);
    assert.strictEqual(resFallback.status, 200);
    assert.ok(resFallback.raw.includes('class="event-poster-fallback"'), `Detail page /events/${withFallback.slug} must render honest fallback banner`);
    assert.ok(resFallback.raw.includes('Poster Resmi Belum Tersedia dari Sumber'), 'Detail page fallback must state honest poster status');
    assert.ok(resFallback.raw.includes('Sumber Tiket Resmi') || resFallback.raw.includes('Lihat di Sumber Resmi'), 'Fallback detail page must still include official source link');
  });

  // ---------------------------------------------------------------------------
  // TEST 11: Frontend card renders <img> when image_url is valid and swaps to fallback on onerror
  // ---------------------------------------------------------------------------
  await runTest(11, 'Frontend card renders <img> with alt, lazy loading, and onerror fallback swap when image_url is valid', async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('function renderPosterMedia('), 'public/index.html must define renderPosterMedia');
    assert.ok(indexHtml.includes('loading="lazy"'), 'renderPosterMedia must include loading="lazy"');
    assert.ok(indexHtml.includes('decoding="async"'), 'renderPosterMedia must include decoding="async"');
    assert.ok(indexHtml.includes('onerror="this.style.display=\'none\''), 'renderPosterMedia must attach an onerror handler to swap to fallback without broken icon');

    const eventsSsr = await request('/events');
    assert.strictEqual(eventsSsr.status, 200);
    assert.ok(eventsSsr.raw.includes('class="catalog-card-media"'), '/events SSR must render .catalog-card-media');
    assert.ok(eventsSsr.raw.includes('onerror="this.style.display=\'none\''), '/events SSR <img> must include onerror fallback handler');
  });

  // ---------------------------------------------------------------------------
  // TEST 12: Frontend card renders clean branded fallback when image_url is null/broken
  // ---------------------------------------------------------------------------
  await runTest(12, 'Frontend card renders clean branded fallback with category, date, and city when image_url is null/broken', async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('poster-fallback-wrap'), 'public/index.html must include .poster-fallback-wrap container');
    assert.ok(indexHtml.includes('poster-fallback-meta'), 'public/index.html fallback must display category/city/date metadata');
    assert.ok(indexHtml.includes('poster-fallback-verified'), 'public/index.html fallback must display honest provenance status');

    const eventsSsr = await request('/events');
    assert.strictEqual(eventsSsr.status, 200);
    assert.ok(eventsSsr.raw.includes('class="catalog-card-fallback"'), '/events SSR must render .catalog-card-fallback for events with null/broken image');
    assert.ok(eventsSsr.raw.includes('Poster Resmi Belum Tersedia'), '/events SSR fallback must state honest poster status');
  });

  // ---------------------------------------------------------------------------
  // TEST 13: Past/archived events remain excluded from default public feed regardless of whether they have images
  // ---------------------------------------------------------------------------
  await runTest(13, 'Past/archived events remain excluded from default public feed even when they have verified images', async () => {
    const [homeFeedRes, discoveryRes] = await Promise.all([
      request('/api/events/home-feed'),
      request('/api/discovery/events?limit=100')
    ]);
    const now = Date.now();
    for (const ev of homeFeedRes.body.feed || []) {
      const endMs = new Date(ev.end_datetime || ev.event_end_at || ev.start_datetime || ev.start_date).getTime();
      assert.ok(endMs >= now, `Past event ${ev.slug} (${ev.start_datetime}) leaked into home-feed`);
      assert.notStrictEqual(ev.status, 'ARCHIVED');
    }
    for (const ev of discoveryRes.body.events || []) {
      const endMs = new Date(ev.end_datetime || ev.event_end_at || ev.start_datetime || ev.start_date).getTime();
      assert.ok(endMs >= now, `Past event ${ev.slug} (${ev.start_datetime}) leaked into /api/discovery/events`);
      assert.notStrictEqual(ev.status, 'ARCHIVED');
    }
    // Specifically confirm Pestapora 2026, The Weeknd 2026, MotoGP 2026 (which have verified images but are past) are excluded
    const slugs = new Set((discoveryRes.body.events || []).map(e => e.slug));
    assert.strictEqual(slugs.has('pestapora-2026'), false, 'Archived Pestapora 2026 must be excluded from public feed');
    assert.strictEqual(slugs.has('the-weeknd-after-hours-til-dawn-tour'), false, 'Archived The Weeknd 2026 must be excluded from public feed');
  });

  // ---------------------------------------------------------------------------
  // TEST 14: Unverified events remain excluded from default public feed even if they have an image URL
  // ---------------------------------------------------------------------------
  await runTest(14, 'Unverified events remain excluded from default public feed even if they carry an image URL', async () => {
    const [homeFeedRes, discoveryRes] = await Promise.all([
      request('/api/events/home-feed'),
      request('/api/discovery/events?limit=100')
    ]);

    for (const ev of homeFeedRes.body.feed || []) {
      assert.ok(
        ['VERIFIED', 'PRIMARY_SOURCE_VERIFIED'].includes(ev.verification_status),
        `Unverified event ${ev.slug} (${ev.verification_status}) leaked into home-feed`
      );
      assert.strictEqual(ev.is_verified, true);
    }
    for (const ev of discoveryRes.body.events || []) {
      assert.ok(
        ['VERIFIED', 'PRIMARY_SOURCE_VERIFIED'].includes(ev.verification_status),
        `Unverified event ${ev.slug} (${ev.verification_status}) leaked into /api/discovery/events`
      );
      assert.strictEqual(ev.is_verified, true);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 15: Root homepage (GET /) renders Verified Concert Hero (King Nassar + YE Live in Jakarta),
  //          canonical https://tikum.app/, poster assets, fallback attributes, and /hero compatibility
  // ---------------------------------------------------------------------------
  await runTest(15, 'Root homepage (GET /) renders Verified Concert Hero cards (King Nassar + YE Live in Jakarta), posters, fallbacks, canonical URL, and /hero route compatibility', async () => {
    const [rootRes, heroRes, posterRes, heroApiRes] = await Promise.all([
      request('/'),
      request('/hero'),
      request('/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg'),
      request('/api/discovery/hero-concerts')
    ]);

    assert.strictEqual(rootRes.status, 200, 'GET / must return HTTP 200');
    assert.ok(rootRes.raw.includes('<link rel="canonical" href="https://tikum.app/">'), 'GET / must have canonical URL https://tikum.app/');
    assert.ok(rootRes.raw.includes('id="verifiedConcertHero"'), 'GET / must include #verifiedConcertHero spotlight section');
    assert.ok(rootRes.raw.includes('id="card-nassar"'), 'GET / must include #card-nassar card');
    assert.ok(rootRes.raw.includes('King Nassar: Lost In The Jungle'), 'GET / must display King Nassar: Lost In The Jungle');
    assert.ok(rootRes.raw.includes('Boss Creator &amp; VINDES Present'), 'GET / must display Boss Creator & VINDES organizer context');
    assert.ok(rootRes.raw.includes('Sabtu, 7 November 2026'), 'GET / must display Sabtu, 7 November 2026');
    assert.ok(rootRes.raw.includes('Istora Senayan Jakarta'), 'GET / must display Istora Senayan Jakarta');
    assert.ok(rootRes.raw.includes('/assets/posters/king-nassar-lost-in-the-jungle-2026.jpg'), 'GET / must reference King Nassar official poster');
    assert.ok(rootRes.raw.includes('/assets/placeholder-nassar.svg'), 'GET / must include King Nassar fallback SVG attribute');
    assert.ok(rootRes.raw.includes("this.src='/assets/placeholder-event.svg'"), 'GET / must include onerror image fallback handler');
    assert.ok(rootRes.raw.includes('id="card-ye"'), 'GET / must include #card-ye card');
    assert.ok(rootRes.raw.includes('YE Live in Jakarta'), 'GET / must display YE Live in Jakarta');
    assert.ok(rootRes.raw.includes('Sabtu, 24 Oktober 2026'), 'GET / must display Sabtu, 24 Oktober 2026');
    assert.ok(rootRes.raw.includes('Gelora Bung Karno'), 'GET / must display Gelora Bung Karno');
    assert.ok(rootRes.raw.includes('0 Tiket (Belum Ada)'), 'GET / must state 0 Tiket (Belum Ada) resale inventory truthfully');

    assert.strictEqual(heroRes.status, 200, 'GET /hero must continue returning HTTP 200');
    assert.ok(heroRes.raw.includes('King Nassar: Lost In The Jungle'), 'GET /hero must still include King Nassar');
    assert.ok(heroRes.raw.includes('YE Live in Jakarta'), 'GET /hero must still include YE Live in Jakarta');

    assert.strictEqual(posterRes.status, 200, 'GET /assets/posters/king-nassar-lost-in-the-jungle-2026.jpg must return HTTP 200');
    assert.ok(
      String(posterRes.headers['content-type'] || '').includes('image/jpeg'),
      `Expected image/jpeg content-type for King Nassar poster, got ${posterRes.headers['content-type']}`
    );

    assert.strictEqual(heroApiRes.status, 200, 'GET /api/discovery/hero-concerts must return HTTP 200');
    assert.strictEqual(heroApiRes.body.success, true, 'hero-concerts API must return success: true');
    assert.strictEqual(Array.isArray(heroApiRes.body.concerts), true);
    assert.strictEqual(heroApiRes.body.concerts.length, 2, 'hero-concerts API must return both hero concerts');
    for (const hc of heroApiRes.body.concerts) {
      assert.strictEqual(hc.resale_inventory_count, 0, `Hero concert ${hc.slug} must report 0 fabricated resale tickets`);
      assert.strictEqual(hc.resale_available, false, `Hero concert ${hc.slug} must report resale_available: false`);
    }
  });

  server.close();

  console.log('\n========================================================================');
  console.log(`  IMAGE PIPELINE & UI RENDERING SUITE: ${passed} passed, ${failed} failed`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  if (server) server.close();
  console.error(err);
  process.exit(1);
});
