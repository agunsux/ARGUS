process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const path = require('path');
const { state, resetDatabase } = require('./src/database');
const app = require('./src/server');
const { promoterRegistry, PROMOTER_STATUS, PROMOTER_AUTHORITY } = require('./src/discovery/PromoterDiscoveryRegistry');
const { PromoterImportService } = require('./src/discovery/PromoterImportService');
const { discoverySignalService, SIGNAL_STATUS } = require('./src/discovery/EventDiscoverySignalService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');
const { sourceRegistry, TRUST_LEVELS } = require('./src/discovery/SourceRegistry');
const { VERIFICATION_STATUS } = require('./src/discovery/EventVerificationService');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}

async function apiRequest(endpoint, { method = 'GET', headers = {}, body = null } = {}) {
  const url = `${baseUrl}${endpoint}`;
  const reqHeaders = { ...headers };
  if (body && typeof body === 'object') {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body && typeof body === 'object' ? JSON.stringify(body) : body
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, headers: res.headers, data };
}

async function runSuite() {
  console.log('\n=== TIKUM PROMOTER DISCOVERY & TIER S INSTAGRAM PRIMARY SOURCE SUITE ===\n');

  resetDatabase();
  promoterRegistry.reset();
  canonicalRegistry.reset();
  discoverySignalService.reset();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // ==========================================
  // 1. CSV & JSON Candidate Import
  // ==========================================
  await testAsync('1. Import promoter candidates from CSV template and parse fields correctly', async () => {
    const csvPath = path.join(__dirname, 'PROMOTER_IMPORT_TEMPLATE.csv');
    const report = PromoterImportService.importFromFile(csvPath);

    assert.ok(report.total_parsed >= 10, 'Should parse at least 10 seed rows');
    assert.ok(report.apmi_matched_count >= 5, 'Should identify APMI member rows');
    
    // Antarasuara should exist and be verified
    const antarasuara = promoterRegistry.getPromoterByHandle('@antara.suara');
    assert.ok(antarasuara, 'Antarasuara must be indexed by handle');
    assert.strictEqual(antarasuara.verification_status, PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);
    assert.strictEqual(antarasuara.authority_level, PROMOTER_AUTHORITY.OFFICIAL_AUTHORITY);
    assert.strictEqual(antarasuara.apmi_member, true);
  });

  // ==========================================
  // 2. Duplicate Promoter Protection
  // ==========================================
  await testAsync('2. Duplicate candidate registration is flagged as POSSIBLE_DUPLICATE without destructive overwrite', async () => {
    const res = promoterRegistry.registerCandidate({
      promoter_name: 'Antara Suara Event Org',
      instagram_handle: '@antara.suara',
      website_url: 'https://antarasuara.com',
      city: 'Jakarta'
    });

    assert.strictEqual(res.action, 'DUPLICATE_FLAGGED');
    assert.strictEqual(res.status, 'POSSIBLE_DUPLICATE');
    assert.ok(res.existing_promoter.duplicate_candidates.length > 0);
    assert.ok(res.duplicate_record.reason.includes('collision') || res.duplicate_record.reason.includes('match'));

    // Existing promoter record must remain verified
    const current = promoterRegistry.getPromoterByHandle('@antara.suara');
    assert.strictEqual(current.verification_status, PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);
  });

  // ==========================================
  // 3. Two-Stage Verification Gate & Tier S Activation
  // ==========================================
  let newPromoterId;
  await testAsync('3. Unverified account cannot become Tier S; must pass DISCOVERED -> IDENTITY_MATCHED -> VERIFIED', async () => {
    // Stage 1: Register Discovered candidate
    const regRes = promoterRegistry.registerCandidate({
      promoter_name: 'Bandung Live Sound',
      instagram_handle: '@bdglivesound',
      city: 'Bandung',
      category: 'INDIE_TOUR'
    });

    assert.strictEqual(regRes.action, 'CREATED');
    const newPromoter = regRes.promoter;
    newPromoterId = newPromoter.promoter_id;

    assert.strictEqual(newPromoter.verification_status, PROMOTER_STATUS.DISCOVERED);
    assert.strictEqual(newPromoter.authority_level, PROMOTER_AUTHORITY.UNKNOWN);

    // Unverified account posting does NOT create canonical event directly
    const unverifiedPost = {
      event_name: 'Bandung Indie Fest 2026',
      start_date: '2026-11-15',
      venue_name: 'Lapangan Tegallega',
      city: 'Bandung',
      instagram_handle: '@bdglivesound'
    };
    const postRes = await discoverySignalService.processSocialPost(unverifiedPost, '@bdglivesound');
    assert.strictEqual(postRes.action, 'DISCOVERY_SIGNAL_STAGED');
    assert.strictEqual(postRes.signal.status, SIGNAL_STATUS.NEEDS_VERIFICATION);
    assert.strictEqual(postRes.signal.is_primary_source, false);

    // Stage 2: Identity Match
    promoterRegistry.matchIdentity(newPromoterId, {
      website_url: 'https://bdglivesound.id',
      evidence: 'Domain registration matched with corporate documents'
    });
    const matched = promoterRegistry.getPromoterById(newPromoterId);
    assert.strictEqual(matched.verification_status, PROMOTER_STATUS.IDENTITY_MATCHED);
    assert.strictEqual(matched.authority_level, PROMOTER_AUTHORITY.VERIFIED_PROMOTER);

    // Stage 3: Formal Verification to Tier S Primary Source
    promoterRegistry.verifyPromoter(newPromoterId, {
      evidence: 'Cross-referenced with official venue contract and APMI directory',
      verified_by: 'compliance-lead'
    });
    const verified = promoterRegistry.getPromoterById(newPromoterId);
    assert.strictEqual(verified.verification_status, PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);
    assert.strictEqual(verified.authority_level, PROMOTER_AUTHORITY.OFFICIAL_AUTHORITY);

    // Check that source was registered in SourceRegistry as Tier S
    const src = sourceRegistry.getSource(`src-promoter-${verified.slug}-instagram`);
    assert.ok(src, 'SourceRegistry must dynamically contain verified promoter handle');
    assert.strictEqual(src.trust_level, TRUST_LEVELS.TIER_S);
    assert.strictEqual(src.source_role, 'PRIMARY_EVENT_SOURCE');
  });

  // ==========================================
  // 4. Single-Source Canonical Creation from Verified IG Post
  // ==========================================
  let sheilaEventId;
  await testAsync('4. Official promoter IG observation creates CanonicalEvent as PRIMARY_SOURCE_VERIFIED without second source', async () => {
    const postPayload = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      start_date: '2026-10-18',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung',
      artists: ['Sheila on 7'],
      post_url: 'https://www.instagram.com/p/C9_sheila_bdg/',
      published_at: '2026-09-01T10:00:00Z',
      ticket_price: 'UNKNOWN'
    };

    const res = await discoverySignalService.processSocialPost(postPayload, '@antara.suara');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'CANONICAL_EVENT_PROMOTED');
    assert.ok(res.canonical_event, 'Canonical event must be returned');
    assert.strictEqual(res.canonical_event.canonical_name, 'Sheila on 7 — Tunggu Aku Di Bandung');
    assert.strictEqual(res.canonical_event.verification_status, VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED);
    assert.strictEqual(res.canonical_event.is_verified, true);
    assert.ok(res.canonical_event.verification_confidence >= 85, 'Confidence must be HIGH (>=85)');

    sheilaEventId = res.canonical_event.event_id;

    // Field-level provenance check
    const prov = res.canonical_event.field_provenance;
    assert.ok(prov, 'field_provenance must exist');
    assert.strictEqual(prov.event_name.value, 'Sheila on 7 — Tunggu Aku Di Bandung');
    assert.strictEqual(prov.start_date.value, '2026-10-18');
    assert.strictEqual(prov.venue_name.value, 'Stadion Siliwangi');
    assert.strictEqual(prov.ticket_price.value, 'UNKNOWN');
    assert.strictEqual(prov.ticket_price.confidence, 'UNKNOWN');

    // Proves Field-Aware Confidence: ticket_price = UNKNOWN does NOT downgrade overall event confidence
    assert.strictEqual(res.canonical_event.is_verified, true);
    assert.ok(res.canonical_event.verification_confidence >= 85);
  });

  // ==========================================
  // 5. Official IG Observation Updates Lineup
  // ==========================================
  await testAsync('5. Official promoter IG observation updates event lineup and appends LINEUP_CHANGED to history', async () => {
    const updatePost = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      start_date: '2026-10-18',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung',
      artists: ['Sheila on 7', 'Good Morning Everyone'],
      post_url: 'https://www.instagram.com/p/C9_sheila_bdg_lineup/',
      published_at: '2026-09-05T12:00:00Z'
    };

    const res = await discoverySignalService.processSocialPost(updatePost, '@antara.suara');
    assert.strictEqual(res.success, true);

    const event = canonicalRegistry.getEventById(sheilaEventId);
    assert.ok(event.artists.includes('Good Morning Everyone'), 'Lineup must contain newly announced artist');
    
    const historyItem = event.event_history.find(h => h.change_type === 'LINEUP_CHANGED');
    assert.ok(historyItem, 'event_history must record LINEUP_CHANGED');
  });

  // ==========================================
  // 6. Venue Change Detection
  // ==========================================
  await testAsync('6. Official promoter IG announces venue change; VENUE_CHANGED logged and old venue preserved in history', async () => {
    const venuePost = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      start_date: '2026-10-18',
      venue_name: 'Stadion Gelora Bandung Lautan Api',
      city: 'Bandung',
      post_url: 'https://www.instagram.com/p/C9_sheila_venue_move/',
      published_at: '2026-09-10T14:00:00Z'
    };

    const res = await discoverySignalService.processSocialPost(venuePost, '@antara.suara');
    assert.strictEqual(res.success, true);

    const event = canonicalRegistry.getEventById(sheilaEventId);
    assert.strictEqual(event.venue_name, 'Stadion Gelora Bandung Lautan Api');

    const historyItem = event.event_history.find(h => h.change_type === 'VENUE_CHANGED');
    assert.ok(historyItem, 'VENUE_CHANGED must be recorded');
    assert.strictEqual(historyItem.old_value, 'Stadion Siliwangi');
    assert.strictEqual(historyItem.new_value, 'Stadion Gelora Bandung Lautan Api');
  });

  // ==========================================
  // 7. Reschedule / Date Change Detection
  // ==========================================
  await testAsync('7. Official promoter IG announces date change; RESCHEDULED logged and old date preserved', async () => {
    const reschedulePost = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      start_date: '2026-10-25',
      venue_name: 'Stadion Gelora Bandung Lautan Api',
      city: 'Bandung',
      status: 'RESCHEDULED',
      post_url: 'https://www.instagram.com/p/C9_sheila_reschedule/',
      published_at: '2026-09-12T16:00:00Z'
    };

    const res = await discoverySignalService.processSocialPost(reschedulePost, '@antara.suara');
    assert.strictEqual(res.success, true);

    const event = canonicalRegistry.getEventById(sheilaEventId);
    assert.strictEqual(event.start_date, '2026-10-25');
    assert.strictEqual(event.status, 'RESCHEDULED');

    const historyItem = event.event_history.find(h => h.change_type === 'RESCHEDULED');
    assert.ok(historyItem, 'RESCHEDULED must be recorded');
    assert.strictEqual(historyItem.old_value, '2026-10-18');
    assert.strictEqual(historyItem.new_value, '2026-10-25');
  });

  // ==========================================
  // 8. Observation Freshness: Stale Post Cannot Overwrite Newer Data
  // ==========================================
  await testAsync('8. Stale/older observation cannot overwrite newer authoritative event data', async () => {
    // Ingest old announcement dated prior to reschedule (2026-08-20)
    const stalePost = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      start_date: '2026-10-10', // old conflicting date
      venue_name: 'Stadion Siliwangi', // old venue
      city: 'Bandung',
      post_url: 'https://www.instagram.com/p/C9_old_post/',
      published_at: '2026-08-20T00:00:00Z',
      observed_at: '2026-08-20T00:00:00Z'
    };

    const res = await discoverySignalService.processSocialPost(stalePost, '@antara.suara');
    assert.strictEqual(res.success, true);

    const event = canonicalRegistry.getEventById(sheilaEventId);
    // Date MUST still be 2026-10-25, not overwritten by stale 2026-10-10!
    assert.strictEqual(event.start_date, '2026-10-25');
    assert.strictEqual(event.venue_name, 'Stadion Gelora Bandung Lautan Api');

    // Both observations remain preserved in event.observations
    assert.ok(event.observations.length >= 4, 'All historical observations must be preserved');
    const staleObs = event.observations.find(o => o.post_url === 'https://www.instagram.com/p/C9_old_post/');
    assert.ok(staleObs, 'Stale observation record must be stored without overwriting canonical fields');
  });

  // ==========================================
  // 9. Separation of Event Truth vs. Transaction Source
  // ==========================================
  await testAsync('9. Ticket URL change updates transaction destination while preserving promoter as event source', async () => {
    const ticketPost = {
      event_name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      start_date: '2026-10-25',
      venue_name: 'Stadion Gelora Bandung Lautan Api',
      city: 'Bandung',
      official_ticket_url: 'https://loket.com/event/sheila-on-7-bandung-2026',
      post_url: 'https://www.instagram.com/p/C9_tickets_sale/',
      published_at: '2026-09-14T09:00:00Z'
    };

    const res = await discoverySignalService.processSocialPost(ticketPost, '@antara.suara');
    assert.strictEqual(res.success, true);

    const event = canonicalRegistry.getEventById(sheilaEventId);
    assert.strictEqual(event.official_ticket_url, 'https://loket.com/event/sheila-on-7-bandung-2026');

    const historyItem = event.event_history.find(h => h.change_type === 'TICKET_INFO_CHANGED');
    assert.ok(historyItem, 'TICKET_INFO_CHANGED must be logged');
  });

  // ==========================================
  // 10. Multi-Source Conflict Handling
  // ==========================================
  await testAsync('10. Conflict between Tier S promoter and secondary ticketing source prioritizes promoter while preserving conflict', async () => {
    // Secondary source (e.g. tiket.com) reports conflicting date
    const secondaryPayload = {
      name: 'Sheila on 7 — Tunggu Aku Di Bandung',
      start_date: '2026-11-05', // Conflicting date!
      venue_name: 'Stadion Gelora Bandung Lautan Api',
      city: 'Bandung',
      official_ticket_url: 'https://www.tiket.com/to-do/sheila-on-7-bandung'
    };

    const ingestRes = await ingestionPipeline.ingestEvent(secondaryPayload, 'src-tiket-com');
    assert.strictEqual(ingestRes.success, true);

    const event = canonicalRegistry.getEventById(sheilaEventId);
    // Promoter date (2026-10-25) must take primary precedence over secondary tiket.com date!
    assert.strictEqual(event.start_date, '2026-10-25');
    assert.strictEqual(event.verification_status, VERIFICATION_STATUS.PRIMARY_SOURCE_VERIFIED);

    // Conflict must be preserved
    assert.ok(event.conflicts.length > 0, 'Conflicts array must preserve conflicting observations');
    const dateConflict = event.conflicts.find(c => c.field === 'start_date');
    assert.ok(dateConflict, 'Conflict record for start_date must exist');
    assert.ok(dateConflict.values.includes('2026-11-05'));
    assert.ok(dateConflict.values.includes('2026-10-25'));
  });

  // ==========================================
  // 11. Cancellation Detection
  // ==========================================
  await testAsync('11. Promoter announcement of CANCELLED updates status and records CANCELLED in event_history', async () => {
    // Create another event first under Boss Creator
    const pestaporaPost = {
      event_name: 'Pestapora Special Showcase 2026',
      start_date: '2026-12-05',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      post_url: 'https://www.instagram.com/p/pestapora_announcement/'
    };
    const initRes = await discoverySignalService.processSocialPost(pestaporaPost, '@boss.creator');
    const festaId = initRes.canonical_event.event_id;

    // Now promoter posts cancellation
    const cancelPost = {
      event_name: 'Pestapora Special Showcase 2026',
      start_date: '2026-12-05',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      status: 'CANCELLED',
      post_url: 'https://www.instagram.com/p/pestapora_cancelled/'
    };
    const cancelRes = await discoverySignalService.processSocialPost(cancelPost, '@boss.creator');
    assert.strictEqual(cancelRes.success, true);

    const event = canonicalRegistry.getEventById(festaId);
    assert.strictEqual(event.status, 'CANCELLED');
    const historyItem = event.event_history.find(h => h.change_type === 'CANCELLED');
    assert.ok(historyItem, 'CANCELLED must be recorded in event_history');
  });

  // ==========================================
  // 12. REST APIs & Dashboard Endpoints
  // ==========================================
  await testAsync('12. REST endpoints for promoters, dashboard, provenance, and conflicts return 200 OK', async () => {
    // GET /api/discovery/promoters
    const resPromoters = await apiRequest('/api/discovery/promoters');
    assert.strictEqual(resPromoters.status, 200);
    assert.strictEqual(resPromoters.data.success, true);
    assert.ok(resPromoters.data.promoters.length >= 10);

    // GET /api/discovery/promoters/dashboard
    const resDash = await apiRequest('/api/discovery/promoters/dashboard');
    assert.strictEqual(resDash.status, 200);
    assert.ok(resDash.data.verified_official_promoters >= 5);
    assert.ok(resDash.data.apmi_accredited_members >= 5);

    // GET /api/discovery/events/:id/provenance
    const resProv = await apiRequest(`/api/discovery/events/${sheilaEventId}/provenance`);
    assert.strictEqual(resProv.status, 200);
    assert.strictEqual(resProv.data.event_id, sheilaEventId);
    assert.ok(resProv.data.field_provenance);
    assert.ok(resProv.data.observations.length >= 4);
    assert.ok(resProv.data.event_history.length >= 4);

    // GET /api/discovery/conflicts
    const resConf = await apiRequest('/api/discovery/conflicts');
    assert.strictEqual(resConf.status, 200);
    assert.ok(resConf.data.conflicts.length >= 1);
  });

  // Cleanup
  await new Promise(resolve => server.close(resolve));

  console.log(`\n=======================`);
  console.log(`Promoter Registry Suite Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSuite().catch(err => {
    console.error('Fatal error running promoter registry suite:', err);
    process.exit(1);
  });
}

module.exports = { runSuite };
