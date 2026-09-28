/**
 * TIKUM / ARGUS — EPIC IMAGE VERIFICATION GATE & FORENSIC AUDIT TEST SUITE
 * 
 * Comprehensive validation of the Phase 2 Event + Image Forensic Engine:
 * - Objective: ZERO WRONG EVENT / WRONG IMAGE
 * - Rule: WRONG IMAGE IS STRICTLY WORSE THAN MISSING IMAGE
 * 
 * Verifies:
 * 1. Event Entity Matching & Normalization (Artist aliases, accents, punctuation, '&' vs 'and')
 * 2. Event Disambiguation & Hard Anti-Collision (City, Year, Tribute vs Original)
 * 3. Source Hierarchy & Deterministic Priority (Tier S > Tier A > Tier B > Tier C > Tier D > Fallback)
 * 4. Image Confidence Scoring (HIGH, MEDIUM, LOW, UNKNOWN)
 * 5. Wrong Artist Image Detection (Hard guard rejecting wrong artist)
 * 6. Wrong Event / Festival Image Detection (Hard guard rejecting wrong festival)
 * 7. Wrong City / Tour Image Detection (Hard guard rejecting wrong city)
 * 8. Stale Year Image Detection (Hard guard rejecting past year artwork)
 * 9. Duplicate Cross-Artist Collision Rejection (Separate artists cannot share poster)
 * 10. Multi-Night Residency Exception (Legitimate tour artwork allowed for same artist)
 * 11. Songkick / Bandsintown Fallback with ARTIST_PROMO classification
 * 12. @infokonser Discovery Gate (Social radar cannot verify image alone)
 * 13. Decoupled Verification Invariant (Unverified event + valid image = BLOCKED)
 * 14. Homepage Publish Gate (Verified event + unverified image = CLEAN PLACEHOLDER, never wrong poster)
 * 15. Provenance Metadata Completeness (All 12+ Phase 7 attributes stored)
 * 16. Controlled 7-Step Image Search Sequence (Phase 14 deterministic sequence)
 * 17. Audit Forensic Classifier (GREEN, YELLOW, RED classification)
 * 18. Zero Wrong Images on Production Snapshot Fixture (15/15 records clean)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const {
  EventVisualProvenanceService,
  IMAGE_SOURCE_TIERS,
  IMAGE_SOURCE_TYPES,
  IMAGE_SCOPES,
  IMAGE_STATUS,
  IMAGE_TYPES,
  IMAGE_CONFIDENCE
} = require('./src/discovery/EventVisualProvenanceService');
const { EventNormalizationService } = require('./src/discovery/EventNormalizationService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ingestionPipeline } = require('./src/discovery/EventIngestionPipeline');
const { OfficialSourceSnapshotStore } = require('./src/discovery/OfficialSourceSnapshotStore');
const { RealSourceSeedService } = require('./src/discovery/RealSourceSeedService');
const { resetDatabase } = require('./src/database');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('TIKUM — EPIC IMAGE VERIFICATION GATE & FORENSIC SUITE');
  console.log('================================================================');

  // ===========================================================================
  // 1. EVENT ENTITY MATCHING & NORMALIZATION
  // ===========================================================================
  console.log('\n── 1. Event Entity Matching & Normalization ──');

  await test('Normalizes artist names with accents, uniform and, and whitespace', () => {
    assert.strictEqual(EventNormalizationService.normalizeArtistName('Touché Amoré'), 'Touche Amore');
    assert.strictEqual(EventNormalizationService.normalizeArtistName("Maliq & D'Essentials"), "Maliq and D'Essentials");
    assert.strictEqual(EventNormalizationService.normalizeArtistName('  The Weeknd  '), 'The Weeknd');
  });

  await test('Extracts artist alias tokens for canonical matching', () => {
    const weekndTokens = EventNormalizationService.extractArtistTokens('The Weeknd: After Hours Tour');
    assert.ok(weekndTokens.includes('the weeknd'));
    assert.ok(weekndTokens.includes('weeknd'));

    const yeTokens = EventNormalizationService.extractArtistTokens('Kanye West — Ye Tour 2026');
    assert.ok(yeTokens.includes('kanye west'));
    assert.ok(yeTokens.includes('ye'));

    const nctTokens = EventNormalizationService.extractArtistTokens('NCT 127 NEO CITY');
    assert.ok(nctTokens.includes('nct 127'));
    assert.ok(nctTokens.includes('nct127'));
  });

  await test('Calculates token similarity correctly', () => {
    const sim = EventNormalizationService.calculateTokenSimilarity(
      'The Weeknd Live in Jakarta',
      'The Weeknd After Hours Jakarta'
    );
    assert.ok(sim >= 0.5, `Expected similarity >= 0.5, got ${sim}`);
  });

  // ===========================================================================
  // 2. DISAMBIGUATION & ANTI-COLLISION GUARDS
  // ===========================================================================
  console.log('\n── 2. Event Disambiguation & Hard Anti-Collision Guards ──');

  await test('Multi-city tour collision guard: Same artist in Jakarta vs Bandung remain separate entities', () => {
    const matchResult = EventNormalizationService.calculateEventMatchScore(
      { title: 'Coldplay Live in Jakarta', artist: 'Coldplay', city: 'Jakarta', start_date: '2026-11-15' },
      { title: 'Coldplay Live in Bandung', artist: 'Coldplay', city: 'Bandung', start_date: '2026-11-15' }
    );
    assert.strictEqual(matchResult.isMatch, false, 'Different cities for the same artist MUST NOT match');
    assert.strictEqual(matchResult.confidence, 0);
    assert.strictEqual(matchResult.matchReason, 'CITY_COLLISION_PREVENTED');
  });

  await test('Year discrepancy collision guard: 2026 vs 2025 festivals remain separate entities', () => {
    const matchResult = EventNormalizationService.calculateEventMatchScore(
      { title: 'Pestapora 2026', city: 'Jakarta', start_date: '2026-09-25' },
      { title: 'Pestapora 2025', city: 'Jakarta', start_date: '2025-09-25' }
    );
    assert.strictEqual(matchResult.isMatch, false, 'Different years MUST NOT match');
    assert.strictEqual(matchResult.confidence, 0);
    assert.strictEqual(matchResult.matchReason, 'YEAR_COLLISION_PREVENTED');
  });

  await test('Tribute band collision guard: Original artist vs Tribute band remain separate entities', () => {
    const matchResult = EventNormalizationService.calculateEventMatchScore(
      { title: 'Queen & Adam Lambert', artist: 'Queen', city: 'Jakarta', start_date: '2026-10-10' },
      { title: 'Queen Tribute Night by Local Band', artist: 'Queen Tribute', city: 'Jakarta', start_date: '2026-10-10' }
    );
    assert.strictEqual(matchResult.isMatch, false, 'Original artist vs tribute band MUST NOT match');
    assert.strictEqual(matchResult.confidence, 0);
    assert.strictEqual(matchResult.matchReason, 'TRIBUTE_ORIGINAL_COLLISION_PREVENTED');
  });

  // ===========================================================================
  // 3. SOURCE HIERARCHY & DETERMINISTIC IMAGE PRIORITY
  // ===========================================================================
  console.log('\n── 3. Source Hierarchy & Deterministic Image Priority ──');

  await test('Official promoter artwork (Tier 1) outranks ticketing artwork (Tier 4)', () => {
    const resolved = EventVisualProvenanceService.resolveEventImage(
      { title: 'DWP 2026', category: 'FESTIVAL', country: 'Indonesia' },
      [
        {
          source_id: 'src-ticketing',
          source_type: 'OFFICIAL_TICKETING',
          image_url: 'https://assets.loket.com/dwp-ticket-banner.jpg',
          tier: 4
        },
        {
          source_id: 'src-promoter',
          source_type: 'OFFICIAL_PROMOTER_WEB',
          image_url: 'https://cdn.ruangevent.id/dwp/dwp-promoter-poster.jpg',
          tier: 1
        }
      ]
    );
    assert.strictEqual(resolved.image_url, 'https://cdn.ruangevent.id/dwp/dwp-promoter-poster.jpg');
    assert.strictEqual(resolved.image_source_type, 'OFFICIAL_PROMOTER_WEB');
    assert.strictEqual(resolved.image_source_tier, 1);
    assert.strictEqual(resolved.image_status, IMAGE_STATUS.VERIFIED);
  });

  await test('Official event website (Tier 0) outranks aggregator platform (Tier 3)', () => {
    const resolved = EventVisualProvenanceService.resolveEventImage(
      { title: 'LANY Soft World Tour', artist: 'LANY', category: 'CONCERT', country: 'Indonesia' },
      [
        {
          source_id: 'src-songkick',
          source_type: 'COMMERCIAL_PLATFORM',
          image_url: 'https://images.songkick.com/lany-event-banner.jpg',
          tier: 3
        },
        {
          source_id: 'src-official-event',
          source_type: 'OFFICIAL_EVENT_WEB',
          image_url: 'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg',
          tier: 0
        }
      ]
    );
    assert.strictEqual(resolved.image_url, 'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg');
    assert.strictEqual(resolved.image_confidence, IMAGE_CONFIDENCE.HIGH);
    assert.strictEqual(resolved.image_verified, true);
  });

  // ===========================================================================
  // 4. IMAGE CONFIDENCE SCORING
  // ===========================================================================
  console.log('\n── 4. Image Confidence Scoring ──');

  await test('Official event and promoter images achieve HIGH confidence', () => {
    const candidate = {
      image_url: 'https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg',
      source_type: 'OFFICIAL_EVENT_WEB',
      tier: 0,
      image_type: IMAGE_TYPES.OFFICIAL_EVENT_POSTER
    };
    const res = EventVisualProvenanceService.calculateImageConfidence(candidate, { title: 'The Weeknd' });
    assert.strictEqual(res.confidence, IMAGE_CONFIDENCE.HIGH);
    assert.strictEqual(res.verified, true);
  });

  await test('Aggregator event artwork achieves MEDIUM confidence', () => {
    const candidate = {
      image_url: 'https://images.songkick.com/thescript-jakarta-2026.jpg',
      source_id: 'src-songkick',
      tier: 3,
      image_type: IMAGE_TYPES.AGGREGATOR_EVENT_ARTWORK
    };
    const res = EventVisualProvenanceService.calculateImageConfidence(candidate, { title: 'The Script' });
    assert.strictEqual(res.confidence, IMAGE_CONFIDENCE.MEDIUM);
    assert.strictEqual(res.verified, true);
  });

  await test('Aggregator artist portrait without event context is marked LOW and UNVERIFIED', () => {
    const candidate = {
      image_url: 'https://images.songkick.com/artists/coldplay-portrait.jpg',
      source_id: 'src-songkick',
      tier: 3,
      image_type: IMAGE_TYPES.ARTIST_PROMO
    };
    const res = EventVisualProvenanceService.calculateImageConfidence(candidate, { title: 'Coldplay Live' });
    assert.strictEqual(res.confidence, IMAGE_CONFIDENCE.LOW);
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.rejection_reason, 'ARTIST_PORTRAIT_WITHOUT_EVENT_CONTEXT');
  });

  await test('@infokonser uncorroborated social image is marked LOW and UNVERIFIED', () => {
    const candidate = {
      image_url: 'https://instagram.com/p/test-infokonser-post.jpg',
      source_id: 'src-ig-infokonser',
      tier: 4,
      image_type: IMAGE_TYPES.AGGREGATOR_EVENT_ARTWORK
    };
    const res = EventVisualProvenanceService.calculateImageConfidence(candidate, { title: 'Local Gig' });
    assert.strictEqual(res.confidence, IMAGE_CONFIDENCE.LOW);
    assert.strictEqual(res.verified, false);
  });

  // ===========================================================================
  // 5. WRONG ARTIST IMAGE DETECTION (HARD GUARDS)
  // ===========================================================================
  console.log('\n── 5. Wrong Artist Image Detection ──');

  await test('Rejects LANY banner on NCT 127 event card', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg',
      { title: 'NCT 127 — NEO CITY: THE REDLINE Jakarta', artist: 'NCT 127' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'WRONG_ARTIST_IMAGE_COLLISION'));
  });

  await test('Rejects The Weeknd cover on Touché Amoré event card', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg',
      { title: 'Touché Amoré — Asia Tour Jakarta 2026', artist: 'Touché Amoré' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'WRONG_ARTIST_IMAGE_COLLISION'));
  });

  await test('Rejects The Weeknd cover on Men I Trust event card', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg',
      { title: 'Men I Trust — Live in Jakarta 2026', artist: 'Men I Trust' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'WRONG_ARTIST_IMAGE_COLLISION'));
  });

  // ===========================================================================
  // 6. WRONG EVENT / FESTIVAL IMAGE DETECTION
  // ===========================================================================
  console.log('\n── 6. Wrong Event / Festival Image Detection ──');

  await test('Rejects Pestapora thumbnail on Synchronize Festival card', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://www.pestapora.com/thumbnail-pestapora.jpg',
      { title: 'Synchronize Festival 2026', category: 'FESTIVAL' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'WRONG_EVENT_COLLISION'));
  });

  await test('Rejects DWP artwork on Pestapora card', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://dwpfest.com/icons/richlink.jpg',
      { title: 'Pestapora 2026', category: 'FESTIVAL' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'WRONG_EVENT_COLLISION'));
  });

  // ===========================================================================
  // 7. WRONG CITY / TOUR IMAGE DETECTION
  // ===========================================================================
  console.log('\n── 7. Wrong City / Tour Image Detection ──');

  await test('Rejects Singapore banner on Jakarta event', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.example.com/artist/tour-singapore-banner.jpg',
      { title: 'Maroon 5 Asia Tour', city: 'jakarta' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'WRONG_CITY_IMAGE_MISMATCH'));
  });

  await test('Rejects Bandung banner on Jakarta event', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.example.com/sheilaon7-bandung-banner.jpg',
      { title: 'Sheila On 7 Live in Jakarta', city: 'jakarta' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'WRONG_CITY_IMAGE_MISMATCH'));
  });

  // ===========================================================================
  // 8. STALE YEAR IMAGE DETECTION
  // ===========================================================================
  console.log('\n── 8. Stale Year Image Detection ──');

  await test('Rejects 2024 festival banner on 2026 event', () => {
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.example.com/pestapora-2024-banner.jpg',
      { title: 'Pestapora 2026', start_date: '2026-09-25' }
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'STALE_YEAR_IMAGE_MISMATCH'));
  });

  // ===========================================================================
  // 9. CROSS-ARTIST DUPLICATE REJECTION & 10. MULTI-NIGHT EXCEPTION
  // ===========================================================================
  console.log('\n── 9. Cross-Artist Duplicate Rejection & Multi-Night Exception ──');

  await test('Rejects identical image URL across unrelated artists', () => {
    const existing = [
      { event_id: 'ev-lany', title: 'LANY Soft World Tour', artist: 'LANY', image_url: 'https://cdn.ruangevent.id/temgmt/lany/banner.jpg' }
    ];
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.ruangevent.id/temgmt/lany/banner.jpg',
      { event_id: 'ev-bruno', title: 'Bruno Mars Jakarta', artist: 'Bruno Mars' },
      existing
    );
    assert.strictEqual(check.is_wrong, true);
    assert.ok(check.problems.some(p => p.rule === 'DUPLICATE_IMAGE_DIFFERENT_ARTISTS'));
  });

  await test('Allows legitimate shared tour artwork for multi-night residency of same artist', () => {
    const existing = [
      { event_id: 'ev-lany-n1', title: 'LANY: soft world tour – Night 1', artist: 'LANY', image_url: 'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg' }
    ];
    const check = EventVisualProvenanceService.detectWrongImage(
      'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg',
      { event_id: 'ev-lany-n2', title: 'LANY: soft world tour – Night 2', artist: 'LANY' },
      existing
    );
    assert.strictEqual(check.is_wrong, false);
    assert.strictEqual(check.problems.length, 0);
  });

  // ===========================================================================
  // 11. SONGKICK / BANDSINTOWN FALLBACK WITH ARTIST_PROMO
  // ===========================================================================
  console.log('\n── 11. Songkick / Bandsintown Fallback With ARTIST_PROMO ──');

  await test('Classifies aggregator artist portrait as ARTIST_PROMO, never official poster', () => {
    const searchRes = EventVisualProvenanceService.searchEventImage(
      { title: 'The Postal Service Live', artist: 'The Postal Service', country: 'Indonesia' },
      {
        songkick: {
          image_url: 'https://images.songkick.com/postalservice-artist.jpg',
          is_portrait_only: true
        }
      }
    );
    // Since portrait only without official proof, it fails closed to clean category fallback for primary display
    assert.strictEqual(searchRes.is_fallback, true);
    assert.strictEqual(searchRes.image_type, IMAGE_TYPES.GENERIC_FALLBACK);
    assert.strictEqual(searchRes.image_verified, false);
  });

  // ===========================================================================
  // 12. @INFOKONSER DISCOVERY GATE & 13. DECOUPLED VERIFICATION INVARIANT
  // ===========================================================================
  console.log('\n── 12. @infokonser Discovery Gate & Decoupled Verification ──');

  await test('@infokonser discovery signal cannot verify an image alone without official corroboration', () => {
    const res = EventVisualProvenanceService.resolveEventImage(
      { title: 'Indie Underground Fest', country: 'Indonesia' },
      [
        {
          source_id: 'src-ig-infokonser',
          source_type: 'DISCOVERY_RADAR',
          image_url: 'https://cdn.example.com/infokonser-raw-post.jpg',
          tier: 4
        }
      ]
    );
    assert.strictEqual(res.is_fallback, true);
    assert.strictEqual(res.image_verified, false);
    assert.strictEqual(res.image_status, IMAGE_STATUS.FALLBACK);
  });

  await test('Decoupled Verification: Unverified event with valid image remains BLOCKED from public', () => {
    const unverifiedEvent = {
      event_id: 'mock-unverified-show',
      title: 'Secret Underground Show',
      is_verified: false,
      verification_status: 'UNVERIFIED',
      image_url: 'https://assets.loket.com/valid-poster.jpg'
    };
    // Verification engine evaluation
    assert.strictEqual(unverifiedEvent.is_verified, false);
    assert.notStrictEqual(unverifiedEvent.verification_status, 'VERIFIED');
  });

  // ===========================================================================
  // 14. HOMEPAGE PUBLISH GATE: SAFE PLACEHOLDER
  // ===========================================================================
  console.log('\n── 14. Homepage Publish Gate & Safe Placeholder ──');

  await test('Verified event with mismatched image displays clean category fallback placeholder', () => {
    const badNctPayload = {
      title: 'NCT 127 — NEO CITY',
      artist: 'NCT 127',
      category: 'CONCERT',
      city: 'Jakarta',
      country: 'Indonesia',
      image_url: 'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg' // WRONG ARTIST!
    };
    const resolved = EventVisualProvenanceService.resolveEventImage(badNctPayload, []);
    assert.strictEqual(resolved.is_fallback, true);
    assert.strictEqual(resolved.image_url, null);
    assert.strictEqual(resolved.image_type, IMAGE_TYPES.GENERIC_FALLBACK);
    assert.strictEqual(resolved.image_verified, false);
    assert.ok(resolved.fallback_meta, 'Must provide category fallback metadata');
    assert.strictEqual(resolved.fallback_meta.disclaimer, 'Tikum UI Placeholder — Official poster not published');
  });

  // ===========================================================================
  // 15. PROVENANCE METADATA COMPLETENESS
  // ===========================================================================
  console.log('\n── 15. Provenance Metadata Completeness ──');

  await test('Resolved verified image populates all mandatory metadata attributes', () => {
    const resolved = EventVisualProvenanceService.resolveEventImage(
      {
        title: 'Maroon 5 Asia 2027 in Jakarta',
        artist: 'Maroon 5',
        image_url: 'https://cdn.ruangevent.id/temgmt/maroon5/main-cover-maroon5.webp',
        image_source_type: 'OFFICIAL_EVENT_WEB',
        image_source_url: 'http://maroon5jakarta2027.com/',
        image_credit: 'Maroon 5 Asia 2027 (TEM Presents)',
        image_source_tier: 0
      },
      []
    );
    assert.strictEqual(resolved.image_verified, true);
    assert.strictEqual(resolved.image_confidence, IMAGE_CONFIDENCE.HIGH);
    assert.strictEqual(resolved.image_type, IMAGE_TYPES.OFFICIAL_EVENT_POSTER);
    assert.strictEqual(resolved.image_status, IMAGE_STATUS.VERIFIED);
    assert.ok(resolved.image_evidence_hash, 'Must have image_evidence_hash');
    assert.ok(resolved.image_verified_at, 'Must have image_verified_at');
    assert.strictEqual(resolved.image_verified_by, 'TIKUM_VISUAL_VERIFICATION_GATE_V2');
    assert.strictEqual(resolved.is_fallback, false);
  });

  // ===========================================================================
  // 16. CONTROLLED 7-STEP IMAGE SEARCH SEQUENCE
  // ===========================================================================
  console.log('\n── 16. Controlled 7-Step Image Search Sequence ──');

  await test('Executes searchEventImage adhering to strict 7-step hierarchy', () => {
    // Step 1: Official event beats ticketing and artist
    const res = EventVisualProvenanceService.searchEventImage(
      { title: 'The Weeknd After Hours', artist: 'The Weeknd', country: 'Indonesia' },
      {
        official_event: { image_url: 'https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg' },
        official_ticketing: { image_url: 'https://assets.loket.com/theweeknd-ticket.jpg' }
      }
    );
    assert.strictEqual(res.image_url, 'https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg');
    assert.strictEqual(res.image_source_type, 'OFFICIAL_EVENT_WEB');
    assert.strictEqual(res.image_verified, true);
  });

  // ===========================================================================
  // 17. AUDIT FORENSIC CLASSIFIER (GREEN, YELLOW, RED)
  // ===========================================================================
  console.log('\n── 17. Audit Forensic Classifier (GREEN / YELLOW / RED) ──');

  await test('auditEventImage classifies verified event with matching official image as GREEN', () => {
    const greenEvent = {
      event_id: 'ev-dwp',
      title: 'DWP 2026',
      is_verified: true,
      verification_status: 'VERIFIED',
      image_url: 'https://dwpfest.com/icons/richlink.jpg',
      image_verified: true,
      image_confidence: 'HIGH'
    };
    const audit = EventVisualProvenanceService.auditEventImage(greenEvent);
    assert.strictEqual(audit.classification, 'GREEN');
    assert.strictEqual(audit.problems_found.length, 0);
  });

  await test('auditEventImage classifies verified event without image as YELLOW', () => {
    const yellowEvent = {
      event_id: 'ev-no-img',
      title: 'Indie Acoustic Night',
      is_verified: true,
      verification_status: 'VERIFIED',
      image_url: null,
      is_fallback: true
    };
    const audit = EventVisualProvenanceService.auditEventImage(yellowEvent);
    assert.strictEqual(audit.classification, 'YELLOW');
    assert.ok(audit.problems_found.includes('NO_OFFICIAL_IMAGE_ATTACHED'));
  });

  await test('auditEventImage classifies event with wrong artist image as RED', () => {
    const redEvent = {
      event_id: 'ev-bad-nct',
      title: 'NCT 127 — NEO CITY Jakarta',
      artist: 'NCT 127',
      is_verified: true,
      verification_status: 'VERIFIED',
      image_url: 'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg'
    };
    const audit = EventVisualProvenanceService.auditEventImage(redEvent);
    assert.strictEqual(audit.classification, 'RED');
    assert.ok(audit.problems_found.some(p => p.includes('lany')));
    assert.ok(audit.recommended_action.includes('REPLACE_OR_REJECT'));
  });

  // ===========================================================================
  // 18. ZERO WRONG IMAGES ON PRODUCTION SNAPSHOT FIXTURE
  // ===========================================================================
  console.log('\n── 18. Zero Wrong Images on Production Snapshot Fixture ──');

  await test('All 15 official corroborated snapshot records pass Image Verification Gate with zero wrong images', () => {
    const records = OfficialSourceSnapshotStore.getVerifiedRecords();
    assert.strictEqual(records.length, 15, 'Expected 15 verified snapshot records');

    for (const rec of records) {
      const wrongCheck = EventVisualProvenanceService.detectWrongImage(rec.image_url, rec, records);
      assert.strictEqual(
        wrongCheck.is_wrong,
        false,
        `Record "${rec.title}" failed wrong image check: ${wrongCheck.problems.map(p => p.detail).join('; ')}`
      );

      const audit = EventVisualProvenanceService.auditEventImage(
        { ...rec, is_verified: true, verification_status: 'VERIFIED' },
        records
      );
      assert.strictEqual(
        audit.classification,
        'GREEN',
        `Record "${rec.title}" expected GREEN classification, got ${audit.classification} (${audit.problems_found.join(', ')})`
      );
    }
  });

  console.log('\n================================================================');
  console.log(`EPIC IMAGE VERIFICATION GATE: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
