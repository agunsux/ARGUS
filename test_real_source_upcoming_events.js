/**
 * TIKUM / ARGUS — Real-Source Upcoming Events Acceptance Test Suite
 *
 * Verifies the complete path from audited official sources to the public
 * upcoming-events surface:
 *
 *  1. SNAPSHOT INTEGRITY: committed snapshot carries reconstructable evidence.
 *  2. SEEDING: the real ingestion pipeline produces VERIFIED canonical events.
 *  3. PUBLIC GATE: /api/events returns only verified + evidenced + future events.
 *  4. IMAGERY: every public event carries OFFICIAL poster art with credit and a
 *     whitelisted, non-fabricated host (no AI posters, no placeholders in public).
 *  5. TIER 3 INVARIANT: Instagram discovery channels can never verify an event.
 *  6. TEMPORAL GATE: nothing past, cancelled or archived leaks into Upcoming.
 *  7. PROVENANCE: source_url / evidence_hash / verified_at present on every event.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');

const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');
const { OfficialSourceSnapshotStore } = require('./src/discovery/OfficialSourceSnapshotStore');
const { RealSourceSeedService } = require('./src/discovery/RealSourceSeedService');

const OFFICIAL_IMAGE_HOSTS = [
  'assets.loket.com',
  'pestapora.com',
  'dwpfest.com',
  'cdn.ruangevent.id',
  'dynamicmedia.livenationinternational.com',
  's1.ticketm.net',
  'storage.googleapis.com'
];

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function request(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: 'GET', headers: { Accept: 'application/json' } }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { /* html surface */ }
        resolve({ status: res.statusCode, headers: res.headers, body: json !== null ? json : data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u001b[31m✗\u001b[0m ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

function assertProvenance(event) {
  assert.strictEqual(event.is_verified, true, `Event ${event.event_id} must be verified`);
  assert.ok(
    event.verification_status === 'VERIFIED' || event.verification_status === 'PRIMARY_SOURCE_VERIFIED',
    `Event ${event.event_id} has non-public verification status ${event.verification_status}`
  );
  assert.ok(event.source_url && /^https?:\/\//i.test(event.source_url), `Event ${event.event_id} missing source_url`);
  assert.ok(event.evidence_hash && event.evidence_hash.length >= 16, `Event ${event.event_id} missing evidence_hash`);
  assert.ok(event.verified_at && !isNaN(new Date(event.verified_at).getTime()), `Event ${event.event_id} missing verified_at`);
}

async function run() {
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  console.log('================================================================');
  console.log('TIKUM — REAL-SOURCE UPCOMING EVENTS ACCEPTANCE SUITE');
  console.log('================================================================');

  console.log('\n── 1. Official Snapshot Integrity ──');

  const snapshotMeta = OfficialSourceSnapshotStore.getSnapshotMeta();
  const verifiedRecords = OfficialSourceSnapshotStore.getVerifiedRecords();

  await test('Snapshot is present, versioned and carries corroborated records', async () => {
    assert.strictEqual(snapshotMeta.available, true, 'Snapshot file missing');
    assert.strictEqual(snapshotMeta.schema, 'tikum.official_event_snapshot.v1');
    assert.ok(verifiedRecords.length >= 1, `Expected >= 1 corroborated record, got ${verifiedRecords.length}`);
  });

  await test('Every corroborated record retains discovery + authority evidence hashes', async () => {
    for (const rec of verifiedRecords) {
      assert.strictEqual(rec.verification_mode, 'AUTHORITATIVE_CORROBORATED');
      assert.ok(rec.discovery_evidence_hash && rec.discovery_evidence_hash.length === 64, `Missing discovery hash for ${rec.title}`);
      assert.ok(rec.authoritative_evidence_hash && rec.authoritative_evidence_hash.length === 64, `Missing authority hash for ${rec.title}`);
      assert.ok(/^https?:\/\//i.test(rec.discovery_source_url), `Missing discovery URL for ${rec.title}`);
      assert.ok(/^https?:\/\//i.test(rec.authoritative_source_url), `Missing authority URL for ${rec.title}`);
      assert.strictEqual(rec.corroboration_result, 'AUTHORITATIVE_TOKENS_VERIFIED');
    }
  });

  await test('Snapshot builder enforces audited host allow-list, UA and rate limit', async () => {
    const builder = require('./src/discovery/OfficialEventSnapshotBuilder');
    assert.ok(builder.ALLOWED_HOSTS.size >= 5, 'Allow-list unexpectedly small');
    assert.ok(builder.MIN_HOST_INTERVAL_MS >= 1000, 'Crawler must space requests at least 1s apart');
    assert.ok(builder.USER_AGENT.includes('TikumEventBot'), 'Crawler UA must be transparent');
    assert.ok(builder.EVIDENCE_RULES.length >= 1, 'No corroboration rules defined');
    for (const rule of builder.EVIDENCE_RULES) {
      assert.ok(/^https?:\/\//i.test(rule.evidence_url), `Rule ${rule.id} missing evidence URL`);
      assert.ok(rule.expect_tokens.length > 0, `Rule ${rule.id} must require factual tokens`);
    }
  });

  await test('Discovery-only observations are never promoted to public supply', async () => {
    const discoveryOnly = OfficialSourceSnapshotStore.getDiscoveryOnlyRecords();
    for (const rec of discoveryOnly) {
      assert.notStrictEqual(rec.verification_mode, 'AUTHORITATIVE_CORROBORATED');
      assert.ok(rec.corroboration_result !== 'AUTHORITATIVE_TOKENS_VERIFIED', `Record ${rec.title} must not claim verification`);
    }
  });

  console.log('\n── 2. Seeding Through The Real Ingestion Pipeline ──');

  resetDatabase();
  const seedService = new RealSourceSeedService();
  const report = await seedService.seed({ log: () => {} });

  await test('Seeding produces at least one verified canonical event', async () => {
    assert.ok(report.seeded.length >= 1, `Expected >= 1 seeded event, got ${report.seeded.length}`);
    assert.strictEqual(report.failed.length, 0, `Seeding failures: ${JSON.stringify(report.failed)}`);
  });

  await test('No corroborated record is left unverified after seeding', async () => {
    assert.strictEqual(report.skipped.length, 0, `Unexpected non-public records: ${JSON.stringify(report.skipped)}`);
  });

  console.log('\n── 3. Public Gate: /api/events ──');

  const publicRes = await request('/api/events');
  await test('GET /api/events returns 200 and is never cached', async () => {
    assert.strictEqual(publicRes.status, 200);
    assert.ok(String(publicRes.headers['cache-control'] || '').includes('no-store'));
  });

  await test('Public upcoming surface is non-empty and fully evidenced', async () => {
    assert.ok(publicRes.body.total >= 1, `Expected >= 1 public event, got ${publicRes.body.total}`);
    for (const ev of publicRes.body.events) {
      assertProvenance(ev);
    }
  });

  await test('Public events are all Indonesian and carry a resolved city', async () => {
    for (const ev of publicRes.body.events) {
      assert.strictEqual((ev.country || 'Indonesia').toLowerCase(), 'indonesia');
      assert.ok(ev.city, `Event ${ev.event_id} missing city`);
    }
  });

  await test('Public events are all future-dated and never archived/completed', async () => {
    const now = Date.now();
    for (const ev of publicRes.body.events) {
      const end = new Date(ev.event_end_at || ev.start_date).getTime();
      assert.ok(end >= now, `Event ${ev.event_id} end ${ev.event_end_at} is in the past`);
      assert.ok(!['ARCHIVED', 'COMPLETED'].includes((ev.lifecycle_status || '').toUpperCase()));
    }
  });

  console.log('\n── 4. Official Poster Imagery ──');

  const eventsWithImages = publicRes.body.events.filter(e => e.image_url);

  await test('Every public event ships an official poster (no placeholder in public)', async () => {
    assert.ok(eventsWithImages.length >= 1, 'Expected at least one public event with official poster art');
    for (const ev of publicRes.body.events) {
      assert.ok(ev.image_url, `Event ${ev.event_id} is public without an official image`);
      assert.notStrictEqual(ev.is_fallback_image, true, `Event ${ev.event_id} exposes a placeholder image publicly`);
      assert.notStrictEqual(ev.image_status, 'FALLBACK');
    }
  });

  await test('Poster art is credited and hosted only on audited official domains', async () => {
    for (const ev of eventsWithImages) {
      assert.ok(ev.image_credit, `Event ${ev.event_id} missing image credit`);
      const host = new URL(ev.image_url).hostname.toLowerCase();
      assert.ok(
        OFFICIAL_IMAGE_HOSTS.some(h => host === h || host.endsWith(`.${h}`)),
        `Unexpected image host ${host} for event ${ev.event_id}`
      );
      assert.ok(
        ['OFFICIAL_EVENT_WEB', 'OFFICIAL_PROMOTER_WEB', 'OFFICIAL_TICKETING', 'OFFICIAL_ARTIST_WEB'].includes(ev.image_source_type),
        `Unexpected image provenance type ${ev.image_source_type}`
      );
    }
  });

  console.log('\n── 5. Tier 3 Instagram Discovery Invariant ──');

  await test('Instagram handles are linked as discovery signals that cannot verify', async () => {
    const linked = canonicalRegistry.getAllEvents()
      .flatMap(e => (e.social_discovery_signals || []).map(s => ({ event: e, signal: s })));
    assert.ok(linked.length >= 1, 'Expected at least one Tier 3 discovery linkage');
    for (const { signal } of linked) {
      assert.strictEqual(signal.can_verify, false);
      assert.strictEqual(signal.authority_role, 'DISCOVERY_SIGNAL');
      assert.strictEqual(signal.automated_collection, false);
    }
  });

  await test('A Tier 3 Instagram source alone can NEVER produce a public event', async () => {
    canonicalRegistry.reset();
    ingestionPipeline.reset();

    const result = await ingestionPipeline.ingestEvent({
      name: 'Instagram Only Fabricated Show',
      title: 'Instagram Only Fabricated Show',
      artists: ['Nobody'],
      start_date: '2026-12-31',
      venue_name: 'Venue TBA',
      city: 'Jakarta',
      country: 'Indonesia',
      category: 'CONCERT',
      official_event_url: 'https://www.instagram.com/infokonser/'
    }, 'src-ig-infokonser', { account_handle: '@infokonser', post_url: 'https://www.instagram.com/infokonser/' });

    const ev = result.canonical_event;
    assert.strictEqual(ev.is_verified, false, 'Tier 3 social source must never verify an event');
    assert.ok(['UNVERIFIED', 'PARTIALLY_VERIFIED'].includes(ev.verification_status), `Unexpected status ${ev.verification_status}`);
  });

  console.log('\n── 6. Home Feed & Event Detail Surfaces ──');

  resetDatabase();
  await new RealSourceSeedService().seed({ log: () => {} });

  const feedRes = await request('/api/events/home-feed');
  await test('GET /api/events/home-feed exposes verified upcoming supply', async () => {
    assert.strictEqual(feedRes.status, 200);
    assert.ok(feedRes.body.meta.total_verified_upcoming >= 1, 'Home feed reports zero verified upcoming events');
    assert.ok(feedRes.body.feed.length >= 1, 'Home feed list is empty');
    for (const ev of feedRes.body.feed) {
      assertProvenance(ev);
    }
  });

  const firstSlug = feedRes.body.feed[0].slug;
  const detailRes = await request(`/events/${firstSlug}`);
  await test('Verified event detail page renders publicly (HTTP 200)', async () => {
    assert.strictEqual(detailRes.status, 200, `Detail page for ${firstSlug} did not render`);
    assert.ok(String(detailRes.body).includes('<html'), 'Detail page did not return HTML');
  });

  const detailJson = await request(`/api/discovery/events/${firstSlug}`);
  await test('Discovery detail API exposes provenance, poster and IG linkage', async () => {
    assert.strictEqual(detailJson.status, 200);
    const ev = detailJson.body.event || detailJson.body;
    assert.ok(ev.source_url, 'Missing source_url');
    assert.ok(ev.image_url, 'Missing official image_url');
    assert.ok(Array.isArray(ev.social_discovery_signals), 'Missing Tier 3 social discovery linkage');
  });

  console.log('\n── 7. State Projection & Marketplace Firewall ──');

  await test('Seeded events are projected into state.events with provenance intact', async () => {
    const projected = state.events.filter(e => e.verification_status === 'VERIFIED' || e.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    assert.ok(projected.length >= 1, 'No verified events projected into state.events');
    for (const ev of projected) {
      assert.ok(ev.source_url, `Projected event ${ev.id || ev.event_id} missing source_url`);
    }
  });

  await test('Unverified legacy seed events remain blocked from the public surface', async () => {
    for (const ev of publicRes.body.events) {
      assert.notStrictEqual(ev.event_id, 'event-bruno-mars-2026');
      assert.notStrictEqual(ev.event_id, 'event-lany-jakarta-2026');
    }
  });

  server.close();

  console.log('\n================================================================');
  console.log(`  REAL-SOURCE UPCOMING EVENTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(err => {
  console.error(err);
  if (server) server.close();
  process.exit(1);
});


