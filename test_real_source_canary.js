/**
 * TIKUM / ARGUS — Real-Source Canary Test Suite
 * 
 * Verifies the nationwide supply intelligence layer under realistic production conditions:
 * 
 * CANARY-01: LANY 2-Night Residency Disambiguation (29 & 30 Oct 2026, Indonesia Arena, Senayan, Jakarta)
 *            - Sources: TEM Presents (Tier 1), Live Nation Asia (Tier 2), tiket.com (Tier 2)
 *            - INVARIANT: 29 Oct and 30 Oct MUST remain TWO DISTINCT CANONICAL EVENTS.
 *            - Factual conflict handling: secondary claim cannot overwrite authoritative promoter claim.
 * CANARY-02: K-Pop Mega Tour Disambiguation (Dyandra Global / iMe ID at Indonesia Arena / ICE BSD)
 * CANARY-03: Regional Bandung Canary (Eldorado Dome, Bandung, Jawa Barat - WIB +07:00)
 * CANARY-04: Regional Surabaya Canary (Grand City Convex, Surabaya, Jawa Timur - WIB +07:00)
 * CANARY-05: Regional Bali Canary (Peninsula Island Nusa Dua, Bali - WITA +08:00)
 * CANARY-06: Regional Medan Canary (Tiara Convention Center, Medan, Sumatera Utara - WIB +07:00)
 * CANARY-07: Source Gap Diagnostics — Unknown Source (SUPPLY_GAP)
 * CANARY-08: Source Gap Diagnostics — Active Conflict (PIPELINE_BLOCKED)
 * CANARY-09: Admin Control Center Supply Endpoints (Coverage, Diagnostics, Unverified Queue, Conflict Resolution)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, bootstrapAdminUser, recordAuditLog } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { sourceRegistry } = require('./src/discovery/SourceRegistry');
const { cityRegistry } = require('./src/discovery/CityRegistry');
const { sourceGapDiagnosticService } = require('./src/discovery/SourceGapDiagnosticService');
const { EventIngestionPipeline } = require('./src/discovery/EventIngestionPipeline');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { SourceClaim } = require('./src/discovery/models/SourceClaim');

let server;
let port;
let baseUrl;
let adminSessionToken;
let userSessionToken;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    if (options.query) {
      Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json !== null ? json : data
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      const payload = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body;
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }

    req.end();
  });
}

async function runCanaryTests() {
  console.log('================================================================');
  console.log('TIKUM / ARGUS — REAL-SOURCE CANARY ACCEPTANCE TEST SUITE');
  console.log('================================================================\n');

  // Start ephemeral HTTP server
  server = http.createServer(app);
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  resetDatabase();
  canonicalRegistry.reset();
  const pipeline = new EventIngestionPipeline(canonicalRegistry);

  // Setup Admin and Normal User Sessions
  const adminRes = bootstrapAdminUser();
  const adminUser = adminRes.user || adminRes;
  const adminSession = SessionStore.createSession({ userId: adminUser.id, role: 'ADMIN' });
  adminSessionToken = adminSession.session_token;

  const normalUser = { id: 'usr-buyer-canary', username: 'buyer_canary', email: 'canary@buyer.id', role: 'USER' };
  state.users.push(normalUser);
  const userSession = SessionStore.createSession({ userId: normalUser.id, role: 'USER' });
  userSessionToken = userSession.session_token;

  try {
    // =========================================================================
    // CANARY-01: LANY 2-NIGHT CANARY (29 Oct & 30 Oct 2026, Indonesia Arena)
    // =========================================================================
    console.log('[TEST 1] CANARY-01: LANY 2-Night Residency at Indonesia Arena, Senayan');

    // 1. Night 1 (29 Oct 2026) Claims:
    // Promoter TEM Presents (Tier 1)
    const lanyNight1TEM = {
      title: 'LANY a beautiful blur: the world tour / soft world tour Jakarta',
      artist: 'LANY',
      venue_name: 'Indonesia Arena, Senayan',
      city: 'Jakarta',
      start_date: '2026-10-29',
      start_datetime: '2026-10-29T19:00:00+07:00',
      source_id: 'src-promoter-tem',
      source_url: 'https://temgmt.com/events/lany-jakarta-2026',
      official_ticket_url: 'https://www.tiket.com/to-do/lany-jakarta-2026-day1',
      published_at: '2026-06-01T10:00:00Z'
    };

    // Official Ticketing tiket.com (Tier 2)
    const lanyNight1Tiket = {
      title: 'LANY in Jakarta - Day 1',
      artist: 'LANY',
      venue_name: 'Indonesia Arena Senayan',
      city: 'Jakarta',
      start_date: '2026-10-29',
      source_id: 'src-tiket-com',
      source_url: 'https://www.tiket.com/to-do/lany-jakarta-2026-day1',
      official_ticket_url: 'https://www.tiket.com/to-do/lany-jakarta-2026-day1',
      published_at: '2026-06-02T10:00:00Z'
    };

    // Discovery Partner Live Nation Asia (Tier 2)
    const lanyNight1LiveNation = {
      title: 'LANY - Live in Jakarta 2026',
      artist: 'LANY',
      venue_name: 'Indonesia Arena',
      city: 'Jakarta',
      start_date: '2026-10-29',
      source_id: 'src-livenation',
      source_url: 'https://www.livenation.asia/event/lany-soft-world-tour-jakarta-ticket-edp1660313',
      published_at: '2026-06-01T11:00:00Z'
    };

    // Ingest Night 1 from multiple sources
    await pipeline.ingestEvent(lanyNight1TEM, 'src-promoter-tem');
    await pipeline.ingestEvent(lanyNight1Tiket, 'src-tiket-com');
    await pipeline.ingestEvent(lanyNight1LiveNation, 'src-livenation');

    // 2. Night 2 (30 Oct 2026) Claims:
    const lanyNight2TEM = {
      title: 'LANY a beautiful blur: the world tour Jakarta (Day 2 Added Date)',
      artist: 'LANY',
      venue_name: 'Indonesia Arena, Senayan',
      city: 'Jakarta',
      start_date: '2026-10-30',
      start_datetime: '2026-10-30T19:00:00+07:00',
      source_id: 'src-promoter-tem',
      source_url: 'https://temgmt.com/events/lany-jakarta-2026-day2',
      official_ticket_url: 'https://www.tiket.com/to-do/lany-jakarta-2026-day2',
      published_at: '2026-06-03T10:00:00Z'
    };

    const lanyNight2Tiket = {
      title: 'LANY in Jakarta - Day 2',
      artist: 'LANY',
      venue_name: 'Indonesia Arena Senayan',
      city: 'Jakarta',
      start_date: '2026-10-30',
      source_id: 'src-tiket-com',
      source_url: 'https://www.tiket.com/to-do/lany-jakarta-2026-day2',
      official_ticket_url: 'https://www.tiket.com/to-do/lany-jakarta-2026-day2',
      published_at: '2026-06-03T11:00:00Z'
    };

    // Ingest Night 2 from multiple sources
    await pipeline.ingestEvent(lanyNight2TEM, 'src-promoter-tem');
    await pipeline.ingestEvent(lanyNight2Tiket, 'src-tiket-com');

    // INVARIANT 1: There must be EXACTLY 2 distinct canonical events for LANY!
    const allEvents = canonicalRegistry.getAllEvents();
    const lanyEvents = allEvents.filter(e => (e.title || '').toLowerCase().includes('lany') || (e.artists || []).some(a => a.toLowerCase() === 'lany'));
    
    assert.strictEqual(lanyEvents.length, 2, `CRITICAL ERROR: LANY must have exactly 2 distinct canonical events (29 Oct & 30 Oct), found ${lanyEvents.length}`);

    const night1Event = lanyEvents.find(e => e.start_date === '2026-10-29');
    const night2Event = lanyEvents.find(e => e.start_date === '2026-10-30');

    assert.ok(night1Event, 'LANY Night 1 (2026-10-29) canonical event must exist');
    assert.ok(night2Event, 'LANY Night 2 (2026-10-30) canonical event must exist');
    assert.notStrictEqual(night1Event.event_id, night2Event.event_id, 'Night 1 and Night 2 must have distinct canonical event IDs');

    // INVARIANT 2: Both venues must be normalized to Indonesia Arena, Senayan, Jakarta
    assert.ok(night1Event.venue_name.toLowerCase().includes('indonesia arena'), 'Night 1 venue must be Indonesia Arena');
    assert.ok(night2Event.venue_name.toLowerCase().includes('indonesia arena'), 'Night 2 venue must be Indonesia Arena');
    assert.strictEqual(night1Event.city, 'Jakarta', 'Night 1 city must be Jakarta');
    assert.strictEqual(night2Event.city, 'Jakarta', 'Night 2 city must be Jakarta');

    // INVARIANT 3: Verification status & multi-source corroboration
    assert.strictEqual(night1Event.is_verified, true, 'Night 1 must be verified (Tier 1 TEM + Tier 2 Tiket + Tier 2 Live Nation)');
    assert.strictEqual(night2Event.is_verified, true, 'Night 2 must be verified (Tier 1 TEM + Tier 2 Tiket)');
    assert.ok(night1Event.sources.length >= 3, `Night 1 must have at least 3 corroborated sources, got ${night1Event.sources.length}`);
    assert.ok(night2Event.sources.length >= 2, `Night 2 must have at least 2 corroborated sources, got ${night2Event.sources.length}`);

    // INVARIANT 4: Atomic claims preservation
    assert.ok(Array.isArray(night1Event.atomic_claims), 'Night 1 must have atomic_claims array');
    assert.ok(night1Event.atomic_claims.length >= 3, 'Night 1 must store atomic claims');

    // INVARIANT 5: Conflicting secondary claim handling (Beach City Stadium claim from unverified source)
    const conflictingClaim = {
      title: 'LANY Jakarta 2026',
      artist: 'LANY',
      venue_name: 'Beach City International Stadium, Ancol',
      city: 'Jakarta',
      start_date: '2026-10-29',
      source_id: 'src-argus-community', // Tier 3 community submission
      source_url: 'https://tikum.app/community/lany-rumor',
      published_at: '2026-06-05T10:00:00Z'
    };
    await pipeline.ingestEvent(conflictingClaim, 'src-argus-community');

    // Invariant: Authoritative venue (Indonesia Arena) must NOT be silently overwritten!
    const night1AfterConflict = canonicalRegistry.getEventById(night1Event.event_id);
    assert.ok(night1AfterConflict.venue_name.toLowerCase().includes('indonesia arena'), 'Authoritative Indonesia Arena venue must NOT be overwritten by secondary social rumor');
    assert.ok(night1AfterConflict.conflicts.length > 0, 'Conflicting secondary claim must spawn an EventConflict');
    console.log('  -> PASS: CANARY-01 LANY 2-Night residency and conflict boundary verified.\n');

    // =========================================================================
    // CANARY-02: K-POP MEGA TOUR DISAMBIGUATION (Dyandra Global & iMe ID)
    // =========================================================================
    console.log('[TEST 2] CANARY-02: K-Pop Mega Tour at ICE BSD & Indonesia Arena');

    // Day 1 at ICE BSD Hall 5-6
    const kpopDay1 = {
      title: 'aespa LIVE TOUR - SYNK : PARALLEL LINES in JAKARTA (Day 1)',
      artist: 'aespa',
      venue_name: 'ICE BSD Hall 5-6',
      city: 'Tangerang',
      start_date: '2026-11-14',
      start_datetime: '2026-11-14T18:00:00+07:00',
      source_id: 'src-promoter-dyandra-global',
      source_url: 'https://dyandraglobal.com/aespa-2026',
      official_ticket_url: 'https://loket.com/aespa-day1'
    };

    // Day 2 at ICE BSD Hall 5-6
    const kpopDay2 = {
      title: 'aespa LIVE TOUR - SYNK : PARALLEL LINES in JAKARTA (Day 2)',
      artist: 'aespa',
      venue_name: 'ICE BSD Hall 5-6',
      city: 'Tangerang',
      start_date: '2026-11-15',
      start_datetime: '2026-11-15T18:00:00+07:00',
      source_id: 'src-promoter-dyandra-global',
      source_url: 'https://dyandraglobal.com/aespa-2026-day2',
      official_ticket_url: 'https://loket.com/aespa-day2'
    };

    await pipeline.ingestEvent(kpopDay1, 'src-promoter-dyandra-global');
    await pipeline.ingestEvent(kpopDay2, 'src-promoter-dyandra-global');

    const aespaEvents = canonicalRegistry.getAllEvents().filter(e => (e.title || '').toLowerCase().includes('aespa'));
    assert.strictEqual(aespaEvents.length, 2, 'K-Pop multi-day tour must preserve 2 distinct canonical events');
    assert.strictEqual(aespaEvents[0].city, 'Tangerang', 'K-Pop venue at ICE BSD must resolve to Tangerang, not Jakarta');
    console.log('  -> PASS: CANARY-02 K-Pop multi-day residency preserved without collapsing.\n');

    // =========================================================================
    // CANARY-03: REGIONAL BANDUNG CANARY (Eldorado Dome, Jawa Barat, WIB +07:00)
    // =========================================================================
    console.log('[TEST 3] CANARY-03: Regional Bandung Canary (Eldorado Dome, WIB +07:00)');

    const bandungEvent = {
      title: 'Bandung Indie Fest 2026 ft. Reality Club & Hindia',
      artists: ['Reality Club', 'Hindia'],
      venue_name: 'Eldorado Dome, Bandung',
      city: 'Bandung',
      start_date: '2026-10-17',
      time: '16:00',
      source_id: 'src-promoter-antarasuara',
      source_url: 'https://antarasuara.com/event/bandung-indie-fest-2026',
      raw_evidence_hash: 'sha256-antarasuara-bandung-indie-fest-2026'
    };
    await pipeline.ingestEvent(bandungEvent, 'src-promoter-antarasuara');
    await pipeline.ingestEvent({
      ...bandungEvent,
      source_id: 'src-yesplis',
      source_url: 'https://yesplis.com/event/bandung-indie-fest-2026'
    }, 'src-yesplis');

    const bndCanonical = canonicalRegistry.getAllEvents().find(e => (e.title || '').includes('Bandung Indie Fest'));
    assert.ok(bndCanonical, 'Bandung Indie Fest canonical event must exist');
    assert.strictEqual(bndCanonical.city, 'Bandung', 'City must be Bandung without defaulting to Jakarta');
    assert.strictEqual(bndCanonical.venue_city, 'Bandung', 'Venue city must be Bandung');
    assert.strictEqual(bndCanonical.timezone, 'Asia/Jakarta', 'Bandung timezone must be Asia/Jakarta');
    assert.ok(bndCanonical.start_at.endsWith('+07:00'), `Normalized start_at must have +07:00 offset, got ${bndCanonical.start_at}`);
    console.log('  -> PASS: CANARY-03 Regional Bandung resolved with zero Jakarta fallback.\n');

    // =========================================================================
    // CANARY-04: REGIONAL SURABAYA CANARY (Grand City Convex, Jawa Timur, WIB +07:00)
    // =========================================================================
    console.log('[TEST 4] CANARY-04: Regional Surabaya Canary (Grand City Convex, WIB +07:00)');

    const sbyEvent = {
      title: 'Surabaya Rock Anthem 2026',
      artist: 'Burgerkill',
      venue_name: 'Grand City Convention & Exhibition Hall',
      city: 'Surabaya',
      start_date: '2026-10-24',
      time: '19:00',
      source_id: 'src-dewatiket',
      source_url: 'https://dewatiket.id/event/surabaya-rock-2026'
    };
    await pipeline.ingestEvent(sbyEvent, 'src-dewatiket');

    const sbyCanonical = canonicalRegistry.getAllEvents().find(e => (e.title || '').includes('Surabaya Rock Anthem'));
    assert.ok(sbyCanonical, 'Surabaya canonical event must exist');
    assert.strictEqual(sbyCanonical.city, 'Surabaya', 'Surabaya event must resolve to Surabaya');
    assert.ok(sbyCanonical.venue_name.toLowerCase().includes('grand city'), 'Venue must resolve to Grand City');
    assert.ok(sbyCanonical.start_at.endsWith('+07:00'), 'Surabaya timestamp must be WIB (+07:00)');
    console.log('  -> PASS: CANARY-04 Regional Surabaya resolved accurately.\n');

    // =========================================================================
    // CANARY-05: REGIONAL BALI CANARY (Peninsula Island, Bali, WITA +08:00)
    // =========================================================================
    console.log('[TEST 5] CANARY-05: Regional Bali Canary (Peninsula Island Nusa Dua, WITA +08:00)');

    const baliEvent = {
      title: 'Joyland Festival Bali 2026',
      artist: 'Various Artists',
      venue_name: 'Peninsula Island Nusa Dua',
      city: 'Badung',
      province: 'Bali',
      start_date: '2026-11-06',
      time: '15:00',
      source_id: 'src-yesplis',
      source_url: 'https://yesplis.com/event/joyland-bali-2026'
    };
    await pipeline.ingestEvent(baliEvent, 'src-yesplis');

    const baliCanonical = canonicalRegistry.getAllEvents().find(e => (e.title || '').includes('Joyland Festival Bali'));
    assert.ok(baliCanonical, 'Bali Joyland canonical event must exist');
    assert.ok(baliCanonical.city === 'Badung' || baliCanonical.city === 'Bali', `City must be Bali or Badung, got ${baliCanonical.city}`);
    assert.strictEqual(baliCanonical.timezone, 'Asia/Makassar', 'Bali timezone must be Asia/Makassar (WITA)');
    assert.ok(baliCanonical.start_at.endsWith('+08:00'), `Bali timestamp MUST have +08:00 WITA offset, got ${baliCanonical.start_at}`);
    console.log('  -> PASS: CANARY-05 Regional Bali WITA timezone (+08:00) verified.\n');

    // =========================================================================
    // CANARY-06: REGIONAL MEDAN CANARY (Tiara Convention Center, Sumatera Utara, WIB +07:00)
    // =========================================================================
    console.log('[TEST 6] CANARY-06: Regional Medan Canary (Tiara Convention Center, WIB +07:00)');

    const medanEvent = {
      title: 'Sumatra Jazz & Soul Festival Medan 2026',
      artist: 'Tompi',
      venue_name: 'Tiara Convention Center',
      city: 'Medan',
      start_date: '2026-11-21',
      time: '19:30',
      source_id: 'src-artatix',
      source_url: 'https://artatix.co.id/event/sumatra-jazz-2026'
    };
    await pipeline.ingestEvent(medanEvent, 'src-artatix');

    const mdnCanonical = canonicalRegistry.getAllEvents().find(e => (e.title || '').includes('Sumatra Jazz'));
    assert.ok(mdnCanonical, 'Medan canonical event must exist');
    assert.strictEqual(mdnCanonical.city, 'Medan', 'Medan event must resolve to Medan');
    assert.strictEqual(mdnCanonical.timezone, 'Asia/Jakarta', 'Medan timezone must be WIB (Asia/Jakarta)');
    assert.ok(mdnCanonical.start_at.endsWith('+07:00'), 'Medan timestamp must be WIB (+07:00)');
    console.log('  -> PASS: CANARY-06 Regional Medan resolved without Jakarta fallback.\n');

    // =========================================================================
    // CANARY-07: SOURCE GAP DIAGNOSTICS — UNKNOWN EVENT (SUPPLY_GAP)
    // =========================================================================
    console.log('[TEST 7] CANARY-07: Source Gap Diagnostics — Unknown Event (SUPPLY_GAP)');

    const unkReport = sourceGapDiagnosticService.diagnoseEvent('Coldplay 2027 Rumor');
    assert.strictEqual(unkReport.event_identified, false, 'Unknown event must not be identified');
    assert.strictEqual(unkReport.overall_verdict, 'SUPPLY_GAP', 'Unknown event must have overall_verdict === SUPPLY_GAP');
    assert.strictEqual(unkReport.stages.source_discovery.status, 'GAP', 'Source discovery stage must report GAP');
    console.log('  -> PASS: CANARY-07 Unknown event correctly diagnosed as SUPPLY_GAP.\n');

    // =========================================================================
    // CANARY-08: SOURCE GAP DIAGNOSTICS — CONFLICTED EVENT (PIPELINE_BLOCKED)
    // =========================================================================
    console.log('[TEST 8] CANARY-08: Source Gap Diagnostics — Conflicted Event (PIPELINE_BLOCKED)');

    const confReport = sourceGapDiagnosticService.diagnoseEvent(night1Event.event_id);
    assert.strictEqual(confReport.event_identified, true, 'LANY Night 1 must be identified');
    assert.strictEqual(confReport.overall_verdict, 'PIPELINE_BLOCKED', 'Conflicted LANY Night 1 must be PIPELINE_BLOCKED');
    assert.strictEqual(confReport.stages.public_delivery.status, 'BLOCKED', 'Public delivery must be BLOCKED');
    assert.strictEqual(confReport.stages.public_delivery.blocker_reason, 'ACTIVE_UNRESOLVED_FACTUAL_CONFLICTS', 'Blocker reason must report ACTIVE_UNRESOLVED_FACTUAL_CONFLICTS');
    console.log('  -> PASS: CANARY-08 Conflicted event correctly diagnosed as PIPELINE_BLOCKED.\n');

    // =========================================================================
    // CANARY-09: ADMIN SUPPLY CONTROL CENTER ENDPOINTS
    // =========================================================================
    console.log('[TEST 9] CANARY-09: Admin Supply Intelligence Endpoints & Auth Gate');

    // 1. Auth Gate: 401 unauthenticated on GET /api/admin/event-supply/coverage
    const unauthCov = await makeRequest('/api/admin/event-supply/coverage');
    assert.strictEqual(unauthCov.status, 401, 'Unauthenticated coverage request must return 401');

    // 2. Auth Gate: 403 non-admin on GET /api/admin/event-supply/coverage
    const nonAdminCov = await makeRequest('/api/admin/event-supply/coverage', {
      headers: { 'Authorization': `Bearer ${userSessionToken}` }
    });
    assert.strictEqual(nonAdminCov.status, 403, 'Non-admin coverage request must return 403');

    // 3. Admin GET /api/admin/event-supply/coverage
    const adminCov = await makeRequest('/api/admin/event-supply/coverage', {
      headers: { 'Authorization': `Bearer ${adminSessionToken}` }
    });
    assert.strictEqual(adminCov.status, 200, 'Admin coverage request must return 200');
    assert.ok(adminCov.body.summary, 'Summary object must be present');
    assert.ok(adminCov.body.summary.total_sources >= 10, 'Must report registered sources');
    assert.ok(adminCov.body.city_matrix.length >= 40, `City matrix must contain at least 40 cities, got ${adminCov.body.city_matrix.length}`);
    assert.ok(adminCov.body.summary.covered_cities >= 4, 'Must report covered cities');
    assert.ok(adminCov.body.summary.blindspot_cities > 0, 'Must report market blindspots');

    // 4. Admin GET /api/admin/event-supply/diagnostics?query=LANY
    const diagRes = await makeRequest('/api/admin/event-supply/diagnostics?query=LANY', {
      headers: { 'Authorization': `Bearer ${adminSessionToken}` }
    });
    assert.strictEqual(diagRes.status, 200, 'Diagnostics endpoint must return 200');
    assert.ok(diagRes.body.event_identified, 'Diagnostics should identify LANY');
    assert.ok(diagRes.body.stages.source_discovery, 'Stage 1 must be present');
    assert.ok(diagRes.body.stages.public_delivery, 'Stage 7 must be present');

    // 5. Admin GET /api/admin/event-supply/unverified-queue
    const queueRes = await makeRequest('/api/admin/event-supply/unverified-queue', {
      headers: { 'Authorization': `Bearer ${adminSessionToken}` }
    });
    assert.strictEqual(queueRes.status, 200, 'Unverified queue endpoint must return 200');
    assert.ok(queueRes.body.unverified_events.some(e => e.event_id === night1Event.event_id), 'Conflicted LANY Night 1 must appear in unverified/review queue');

    // 6. Admin POST /api/admin/event-supply/resolve-conflict
    const resolveRes = await makeRequest('/api/admin/event-supply/resolve-conflict', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminSessionToken}` },
      body: {
        event_id: night1Event.event_id,
        chosen_fields: {
          venue_name: 'Indonesia Arena, Senayan',
          city: 'Jakarta'
        },
        resolution_notes: 'Promoter TEM Presents official Instagram verified Indonesia Arena Senayan'
      }
    });
    assert.strictEqual(resolveRes.status, 200, 'Conflict resolution must return 200');
    assert.strictEqual(resolveRes.body.success, true, 'Resolution must report success');

    // Check conflict was cleared
    const resolvedEvent = canonicalRegistry.getEventById(night1Event.event_id);
    assert.strictEqual(resolvedEvent.conflicts.length, 0, 'Conflicts must be cleared after resolution');
    assert.strictEqual(resolvedEvent.verification_status, 'VERIFIED', 'Verification status must become VERIFIED');

    // Re-run diagnostics: overall_verdict must become PUBLIC_ACTIVE!
    const postResolveDiag = sourceGapDiagnosticService.diagnoseEvent(night1Event.event_id);
    assert.strictEqual(postResolveDiag.overall_verdict, 'PUBLIC_ACTIVE', 'Event must become PUBLIC_ACTIVE after conflict resolution');
    assert.strictEqual(postResolveDiag.stages.public_delivery.status, 'PASS', 'Public delivery must PASS after resolution');
    console.log('  -> PASS: CANARY-09 Admin supply control center endpoints and conflict resolution verified.\n');

    // =========================================================================
    // CANARY-10: PUBLIC API DISCOVERY & SEARCH DELIVERIES
    // =========================================================================
    console.log('[TEST 10] CANARY-10: Public API Discovery Delivery & Geographic Sorting');

    // GET /api/events (both LANY nights must appear in public search)
    const pubEvents = await makeRequest('/api/events?search=LANY');
    assert.strictEqual(pubEvents.status, 200, 'Public GET /api/events must return 200');
    const pubLany = pubEvents.body.events || [];
    assert.strictEqual(pubLany.length, 2, `Public events feed must return BOTH LANY nights (got ${pubLany.length})`);

    // GET /api/events/home-feed
    const homeFeed = await makeRequest('/api/events/home-feed');
    assert.strictEqual(homeFeed.status, 200, 'Home feed must return 200');
    assert.ok(homeFeed.body.sections, 'Home feed must have sections');
    assert.ok(homeFeed.body.sections.popular_events.length > 0, 'Popular events section must be populated');

    // Spatial nearest sort test: query from Bandung coordinates (-6.9175, 107.6191)
    const nearestRes = await makeRequest('/api/events?sort=nearest&lat=-6.9175&lng=107.6191');
    assert.strictEqual(nearestRes.status, 200, 'Nearest events query must return 200');
    const firstEvent = (nearestRes.body.events || [])[0];
    assert.ok(firstEvent, 'At least one event should be returned');
    assert.strictEqual(firstEvent.city, 'Bandung', `First event sorted by distance from Bandung coordinates must be Bandung, got ${firstEvent.city}`);
    console.log('  -> PASS: CANARY-10 Public discovery feed and Haversine nearest sorting verified.\n');

    console.log('================================================================');
    console.log('ALL 10 REAL-SOURCE CANARY ACCEPTANCE TESTS PASSED (10/10)!');
    console.log('================================================================\n');

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

runCanaryTests().catch(err => {
  console.error('\nCANARY TEST SUITE FAILED:', err);
  process.exit(1);
});
