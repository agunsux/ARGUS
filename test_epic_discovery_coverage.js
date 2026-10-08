/**
 * TIKUM / ARGUS — DISCOVERY COVERAGE & CROSS-SOURCE RECONCILIATION SUITE
 * 
 * Objectives:
 * 1. Source Health: Validate operational status of @infokonser, Songkick, and Bandsintown.
 * 2. @infokonser Discovery & Reconciliation: Ingest candidates, detect duplicates, gate uncorroborated signals.
 * 3. Cross-Source Corroboration Flow: DISCOVER -> VERIFY -> CANONICALIZE -> PUBLISH.
 * 4. Songkick Discovery Radar: Ingest candidates, corroborate valid tours, fail-closed unverified rumors.
 * 5. Bandsintown Discovery Radar: Ingest candidates, corroborate valid stops, isolate date conflicts.
 * 6. Zero-Duplicate Guarantee: Multiple observations from 4 sources merge into exactly 1 canonical event.
 * 7. Full Provenance Preservation: discovered_by, verified_by, image_source, image_confidence.
 * 8. Image Verification Gate Adherence: Newly discovered events strictly obey visual provenance rules.
 */

const assert = require('assert');
const { sourceRegistry } = require('./src/discovery/SourceRegistry');
const { adapterRegistry } = require('./src/discovery/adapters/AdapterRegistry');
const { OfficialSourceSnapshotStore } = require('./src/discovery/OfficialSourceSnapshotStore');
const { CanonicalEventRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventSourceObservation } = require('./src/discovery/models/EventSourceObservation');
const { EventVerificationService, VERIFICATION_STATUS } = require('./src/discovery/EventVerificationService');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { EventVisualProvenanceService, IMAGE_CONFIDENCE, IMAGE_TYPES } = require('./src/discovery/EventVisualProvenanceService');
const { EventTemporalLifecycleEngine } = require('./src/discovery/EventTemporalLifecycleEngine');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('TIKUM — DISCOVERY COVERAGE ACCEPTANCE TEST SUITE');
  console.log('================================================================');

  // ================================================================
  // SECTION 1: SOURCE HEALTH & REGISTRY OPERATIONAL STATUS
  // ================================================================
  console.log('\n── Section 1: Source Health & Discovery Methods ──');

  runTest('1.1 @infokonser is registered as Tier 3 Social Discovery Signal (Signal/Ledger Mode)', () => {
    const src = sourceRegistry.getSource('src-ig-infokonser');
    assert.ok(src, 'src-ig-infokonser must exist');
    assert.strictEqual(src.account_handle, '@infokonser');
    assert.strictEqual(src.tier, 3);
    assert.strictEqual(src.source_role, 'DISCOVERY_SIGNAL');
    assert.strictEqual(src.can_verify, false, 'Tier 3 social signal can NEVER solely verify');

    const adapter = adapterRegistry.getAdapter('src-ig-infokonser');
    assert.ok(adapter, 'Adapter must be instantiated');
    assert.strictEqual(adapter.constructor.name, 'SocialDiscoveryAdapter');
  });

  runTest('1.2 Songkick is registered as Tier-1 Authoritative Music Discovery Platform', () => {
    const src = sourceRegistry.getSource('src-songkick-jakarta');
    assert.ok(src, 'src-songkick-jakarta must exist');
    assert.strictEqual(src.source_name, 'Songkick');
    assert.strictEqual(src.adapter, 'SongkickAdapter');

    const adapter = adapterRegistry.getAdapter('src-songkick-jakarta');
    assert.ok(adapter, 'SongkickAdapter must be instantiated');
    assert.strictEqual(adapter.constructor.name, 'SongkickAdapter');
  });

  runTest('1.3 Bandsintown is registered as Tier-1 Authoritative Music Discovery Platform', () => {
    const src = sourceRegistry.getSource('src-bandsintown-jakarta');
    assert.ok(src, 'src-bandsintown-jakarta must exist');
    assert.strictEqual(src.source_name, 'Bandsintown');
    assert.strictEqual(src.adapter, 'BandsintownAdapter');

    const adapter = adapterRegistry.getAdapter('src-bandsintown-jakarta');
    assert.ok(adapter, 'BandsintownAdapter must be instantiated');
    assert.strictEqual(adapter.constructor.name, 'BandsintownAdapter');
  });

  // ================================================================
  // SECTION 2: ADAPTER DISCOVERY EXECUTION & CANDIDATE RETRIEVAL
  // ================================================================
  console.log('\n── Section 2: Candidate Discovery Execution ──');

  await runAsyncTest('2.1 Songkick discover() returns candidates with complete fields', async () => {
    const adapter = adapterRegistry.getAdapter('src-songkick-jakarta');
    const candidates = await adapter.discover();
    assert.ok(Array.isArray(candidates), 'Candidates must be an array');
    assert.ok(candidates.length >= 2, `Expected at least 2 candidates, got ${candidates.length}`);

    const theScript = candidates.find(c => c.title.toLowerCase().includes('the script'));
    assert.ok(theScript, 'The Script must be discovered from Songkick');
    assert.strictEqual(theScript.city, 'Jakarta');
    assert.strictEqual(theScript.source_id, 'src-songkick-jakarta');
    assert.ok(theScript.startDate, 'Start date must be populated');
  });

  await runAsyncTest('2.2 Bandsintown discover() returns candidates with complete fields', async () => {
    const adapter = adapterRegistry.getAdapter('src-bandsintown-jakarta');
    const candidates = await adapter.discover();
    assert.ok(Array.isArray(candidates), 'Candidates must be an array');
    assert.ok(candidates.length >= 2, `Expected at least 2 candidates, got ${candidates.length}`);

    const menITrust = candidates.find(c => c.title.toLowerCase().includes('men i trust'));
    assert.ok(menITrust, 'Men I Trust must be discovered from Bandsintown');
    assert.strictEqual(menITrust.city, 'Jakarta');
    assert.strictEqual(menITrust.source_id, 'src-bandsintown-jakarta');
    assert.ok(menITrust.startDate, 'Start date must be populated');
  });

  await runAsyncTest('2.3 @infokonser discover() returns registered discovery signals', async () => {
    const adapter = adapterRegistry.getAdapter('src-ig-infokonser');
    const signals = await adapter.discover();
    assert.ok(Array.isArray(signals), 'Signals must be an array');
    assert.ok(signals.length >= 2, `Expected at least 2 signals, got ${signals.length}`);

    const pestaporaSignal = signals.find(s => s.name.includes('Pestapora'));
    assert.ok(pestaporaSignal, 'Pestapora signal must be returned');
    assert.strictEqual(pestaporaSignal.is_discovery_signal, true);
    assert.strictEqual(pestaporaSignal.tier, 3);
  });

  // ================================================================
  // SECTION 3: @INFOKONSER DISCOVERY, RECONCILIATION & GATING
  // ================================================================
  console.log('\n── Section 3: @infokonser Reconciliation & Gating ──');

  runTest('3.1 @infokonser candidate matching existing event is classified as EXACT_DUPLICATE', () => {
    const registry = new CanonicalEventRegistry();
    const existingPestapora = registry.createEvent({
      id: 'event-pestapora-2026',
      title: 'Pestapora 2026',
      artists: ['Tulus', 'Hindia', 'The Changcuters'],
      date: '2026-09-25',
      venue_name: 'Gambir Expo Kemayoran',
      city: 'Jakarta',
      source_id: 'src-event-pestapora-web'
    });

    const infokonserCandidate = {
      title: 'Pestapora 2026',
      date: '2026-09-25',
      city: 'Jakarta',
      venue_name: 'JIExpo Kemayoran'
    };

    const duplicateCheck = EventDeduplicationService.findDuplicateCandidate(infokonserCandidate, registry.getAllEvents());
    assert.ok(duplicateCheck.isMatch, 'Must detect duplicate');
    assert.strictEqual(duplicateCheck.canonicalEvent.id, existingPestapora.id);
  });

  runTest('3.2 Uncorroborated @infokonser new candidate fails-closed as UNVERIFIED_DISCOVERY', () => {
    const cand = {
      title: 'Secret Underground Festival Jakarta 2026',
      country: 'Indonesia',
      city: 'Jakarta',
      date: '2026-12-05'
    };
    const infokonserObs = {
      source_id: 'src-ig-infokonser',
      source_type: 'DISCOVERY_PLATFORM',
      tier: 3
    };

    const verif = EventVerificationService.verifyEventWithRules(cand, [infokonserObs]);
    assert.strictEqual(verif.is_verified, false, 'Uncorroborated social signal must NOT be verified');
    assert.strictEqual(verif.status, 'UNVERIFIED');
    assert.ok(verif.flags.includes('TIER_3_SOCIAL_DISCOVERY_ONLY') || verif.flags.includes('INDONESIA_LOCAL_AUTHORITY_REQUIRED'), 'Must flag Tier 3 social discovery limitation');
  });

  runTest('3.3 Corroborated @infokonser candidate elevates to VERIFIED_NEW_EVENT with full provenance', () => {
    const registry = new CanonicalEventRegistry();
    const cand = {
      title: 'Sheila On 7 — Tunggu Aku Di Yogyakarta',
      artists: ['Sheila On 7'],
      category: 'CONCERT',
      start_date: '2026-11-20',
      date: '2026-11-20',
      venue_name: 'Stadion Mandala Krida',
      city: 'Yogyakarta',
      country: 'Indonesia',
      source_id: 'src-ig-infokonser'
    };

    const canonicalEvent = registry.createEvent(cand);
    assert.strictEqual(canonicalEvent.is_verified, false, 'Initial @infokonser discovery must be unverified');
    assert.strictEqual(canonicalEvent.verification_status, 'UNVERIFIED');

    // Corroborated by official promoter Antarasuara (APMI Member)
    registry.addSourceRecord(canonicalEvent.id, {
      source_id: 'src-promoter-antarasuara',
      official_event_url: 'https://antarasuara.com/events/so7-jogja-2026',
      official_ticket_url: 'https://loket.com/event/so7-jogja-2026',
      image_url: 'https://cdn.ruangevent.id/antarasuara/so7/sheila-on-7-jogja-official-banner.jpg',
      image_source_type: 'OFFICIAL_PROMOTER_WEB',
      image_source_url: 'https://antarasuara.com/events/so7-jogja-2026'
    });

    // Verify promotion
    assert.strictEqual(canonicalEvent.is_verified, true, 'Corroboration must verify canonical event');
    assert.strictEqual(canonicalEvent.verification_status, 'VERIFIED');
    assert.strictEqual(canonicalEvent.sources.length, 2);
    assert.ok(canonicalEvent.sources.some(s => s.source_id === 'src-ig-infokonser'), 'Preserves @infokonser discovery provenance');
    assert.ok(canonicalEvent.sources.some(s => s.source_id === 'src-promoter-antarasuara'), 'Preserves promoter verification provenance');
  });

  // ================================================================
  // SECTION 4: SONGKICK & BANDSINTOWN CORROBORATION & RADAR SAFETY
  // ================================================================
  console.log('\n── Section 4: Aggregator Discovery & Radar Gating ──');

  runTest('4.1 Songkick discovery + Promoter corroboration produces verified canonical event', () => {
    const registry = new CanonicalEventRegistry();
    const theScriptPayload = {
      title: 'The Script — Satellites World Tour Jakarta 2026',
      artists: ['The Script'],
      date: '2026-10-10',
      start_date: '2026-10-10',
      city: 'Jakarta',
      venue_name: 'Indonesia Arena',
      official_event_url: 'https://www.thescriptindonesia2026.com/',
      image_url: 'https://cdn.ruangevent.id/colorasia/thescript/thescript-satellites-jakarta-banner.jpg',
      image_source_type: 'OFFICIAL_EVENT_WEB',
      sources: [
        { source_id: 'src-songkick-jakarta', tier: 1 },
        { source_id: 'src-event-thescript-web', tier: 1 }
      ]
    };

    const canonicalEvent = registry.createEvent(theScriptPayload);
    assert.strictEqual(canonicalEvent.is_verified, true);
    assert.strictEqual(canonicalEvent.verification_status, 'VERIFIED');
    assert.ok(canonicalEvent.image_url.includes('thescript-satellites'));
    assert.strictEqual(canonicalEvent.image_verified, true);
  });

  runTest('4.2 Bandsintown discovery + Promoter corroboration produces verified canonical event', () => {
    const registry = new CanonicalEventRegistry();
    const menITrustPayload = {
      title: 'Men I Trust — Live in Jakarta 2026',
      artists: ['Men I Trust'],
      date: '2026-10-20',
      start_date: '2026-10-20',
      city: 'Jakarta',
      venue_name: 'GBK Basketball Hall',
      official_event_url: 'https://plainsonglive.com/',
      image_url: 'https://cdn.ruangevent.id/plainsong/menitrust/men-i-trust-jakarta-official-poster.jpg',
      image_source_type: 'OFFICIAL_EVENT_WEB',
      sources: [
        { source_id: 'src-bandsintown-jakarta', tier: 1 },
        { source_id: 'src-promoter-plainsong', tier: 1 }
      ]
    };

    const canonicalEvent = registry.createEvent(menITrustPayload);
    assert.strictEqual(canonicalEvent.is_verified, true);
    assert.strictEqual(canonicalEvent.verification_status, 'VERIFIED');
    assert.ok(canonicalEvent.image_url.includes('men-i-trust'));
    assert.strictEqual(canonicalEvent.image_verified, true);
  });

  runTest('4.3 Uncorroborated Songkick radar (MCR) fails-closed to PENDING_ARTIST_VERIFICATION', () => {
    const mcrCand = {
      title: 'My Chemical Romance — Jakarta International Stadium',
      artists: ['My Chemical Romance'],
      date: '2026-11-28',
      city: 'Jakarta',
      enforce_zero_fake_policy: true
    };

    const songkickRadarObs = {
      source_id: 'src-songkick-jakarta',
      source_type: 'DISCOVERY_PLATFORM',
      tier: 1
    };

    const verif = EventVerificationService.verifyEventWithRules(mcrCand, [songkickRadarObs]);
    assert.strictEqual(verif.is_verified, false, 'Uncorroborated aggregator radar must NEVER be public');
    assert.strictEqual(verif.status, VERIFICATION_STATUS.PENDING_ARTIST_VERIFICATION);
  });

  // ================================================================
  // SECTION 5: ZERO-DUPLICATE GUARANTEE ACROSS ALL 4 SOURCES
  // ================================================================
  console.log('\n── Section 5: Zero-Duplicate Multi-Source Reconciliation ──');

  runTest('5.1 Four observations (@infokonser + Official + Songkick + Bandsintown) merge into 1 canonical event', () => {
    const registry = new CanonicalEventRegistry();
    const eventPayload = {
      title: 'Tame Impala — Live in Jakarta 2027',
      artists: ['Tame Impala'],
      date: '2027-03-15',
      start_date: '2027-03-15',
      venue_name: 'Istora Senayan',
      city: 'Jakarta',
      country: 'Indonesia',
      source_id: 'src-ig-infokonser'
    };

    // 1. First discovered via @infokonser
    const canonical = registry.createEvent(eventPayload);

    // 2. Second observation from Songkick
    const obs2 = {
      source_id: 'src-songkick-jakarta',
      title: 'Tame Impala at Istora Senayan Jakarta',
      start_date: '2027-03-15',
      venue_name: 'Istora Senayan',
      city: 'Jakarta'
    };
    const dup2 = EventDeduplicationService.findDuplicateCandidate(obs2, registry.getAllEvents());
    assert.ok(dup2.isMatch, 'Must detect duplicate for Songkick observation');
    registry.addSourceRecord(canonical.id, obs2);

    // 3. Third observation from Bandsintown
    const obs3 = {
      source_id: 'src-bandsintown-jakarta',
      title: 'Tame Impala Jakarta Tour Stop',
      start_date: '2027-03-15',
      venue_name: 'Istora Senayan',
      city: 'Jakarta'
    };
    const dup3 = EventDeduplicationService.findDuplicateCandidate(obs3, registry.getAllEvents());
    assert.ok(dup3.isMatch, 'Must detect duplicate for Bandsintown observation');
    registry.addSourceRecord(canonical.id, obs3);

    // 4. Fourth observation from Official Promoter (Ismaya Live) with official poster
    const obs4 = {
      source_id: 'src-promoter-ismaya',
      title: 'Tame Impala Live in Jakarta',
      start_date: '2027-03-15',
      venue_name: 'Istora Senayan',
      city: 'Jakarta',
      official_event_url: 'https://ismayalive.com/tameimpala',
      official_ticket_url: 'https://loket.com/event/tame-impala-2027',
      image_url: 'https://cdn.ruangevent.id/ismaya/tameimpala/tame-impala-jakarta-banner.jpg',
      image_source_type: 'OFFICIAL_PROMOTER_WEB'
    };
    const dup4 = EventDeduplicationService.findDuplicateCandidate(obs4, registry.getAllEvents());
    assert.ok(dup4.isMatch, 'Must detect duplicate for Ismaya observation');
    registry.addSourceRecord(canonical.id, obs4);

    // Verify final canonical state
    assert.strictEqual(registry.getAllEvents().length, 1, 'Exactly 1 canonical event must exist (Zero Duplicate)');
    assert.strictEqual(canonical.sources.length, 4, 'All 4 source observations must be recorded');
    assert.strictEqual(canonical.is_verified, true, 'Event must be verified by Ismaya promoter');
    assert.strictEqual(canonical.image_verified, true, 'Image must be verified');
    assert.ok(canonical.image_url.includes('tame-impala-jakarta-banner.jpg'));
  });

  // ================================================================
  // SECTION 6: HOMEPAGE PUBLISH GATE & IMAGE VERIFICATION
  // ================================================================
  console.log('\n── Section 6: Homepage Publish Gate & Fallback Adherence ──');

  runTest('6.1 Verified event with unverified social image falls back safely to GENERIC_FALLBACK', () => {
    const verifiedEventWithSocialImage = {
      id: 'event-test-social-img',
      canonical_name: 'Test Verified Concert',
      title: 'Test Verified Concert',
      artists: ['Test Artist'],
      city: 'Jakarta',
      start_date: '2026-12-10',
      is_verified: true,
      verification_status: 'VERIFIED'
    };

    const sources = [
      {
        source_id: 'src-ig-infokonser',
        source_type: 'DISCOVERY_PLATFORM',
        tier: 3,
        image_url: 'https://instagram.com/p/raw-social-post.jpg'
      },
      {
        source_id: 'src-promoter-test',
        source_type: 'OFFICIAL_PROMOTER_WEB',
        tier: 1,
        image_url: null // Promoter has no image
      }
    ];

    const visual = EventVisualProvenanceService.resolveEventImage(verifiedEventWithSocialImage, sources);
    assert.strictEqual(visual.is_fallback, true, 'Must use fallback image');
    assert.strictEqual(visual.image_type, IMAGE_TYPES.GENERIC_FALLBACK);
    assert.strictEqual(visual.image_confidence, IMAGE_CONFIDENCE.UNKNOWN);
  });

  console.log('\n================================================================');
  console.log(`DISCOVERY COVERAGE SUITE: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
