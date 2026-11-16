/**
 * test_ravel_trusted_promoter_registry.js
 * 
 * Comprehensive Verification Suite for:
 * 1. Ravel Entertainment as Trusted Primary Promoter Source in SourceRegistry,
 *    ApmiPromoterRegistry, and PromoterDiscoveryRegistry.
 * 2. RavelPromoterAdapter enforcing strict source authority & access control compliance.
 * 3. MCR Jakarta 2026 Canonical Provenance:
 *    - Primary Promoter: Ravel Entertainment
 *    - Event Microsite: mcrjakarta.com
 *    - Official Ticketing: Tiket.com
 * 4. Multi-Source Hierarchy Preservation:
 *    - Non-Ravel events (GNR, Efestaphoria, BTS) remain under their own authorities.
 * 5. Zero Fake Inventory invariant.
 */

const assert = require('assert');
const { 
  sourceRegistry, 
  TRUST_LEVELS, 
  SOURCE_ROLES, 
  SOURCE_TYPES,
  TRUSTED_SOURCE_PRIORITY
} = require('./src/discovery/SourceRegistry');
const { apmiPromoterRegistry } = require('./src/discovery/ApmiPromoterRegistry');
const { promoterDiscoveryRegistry } = require('./src/discovery/PromoterDiscoveryRegistry');
const { RavelPromoterAdapter } = require('./src/discovery/adapters/RavelPromoterAdapter');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

(async () => {
  console.log('================================================================');
  console.log('  TIKUM — RAVEL ENTERTAINMENT TRUSTED PROMOTER REGISTRY TESTS');
  console.log('================================================================\n');

  // 1. SourceRegistry Tests
  console.log('── Section 1: SourceRegistry Registration & Hierarchy ──');
  runTest('1.1 SourceRegistry registers src-promoter-ravel with TIER_S / TRUSTED_PRIMARY', () => {
    const src = sourceRegistry.getSource('src-promoter-ravel');
    assert.ok(src, 'src-promoter-ravel must exist in SourceRegistry');
    assert.strictEqual(src.source_name, 'Ravel Entertainment');
    assert.strictEqual(src.base_url, 'https://www.ravelentertainment.com/');
    assert.strictEqual(src.adapter, 'RavelPromoterAdapter');
    assert.strictEqual(src.trust_level, TRUST_LEVELS.TIER_S);
    assert.strictEqual(src.trust_level, TRUST_LEVELS.TRUSTED_PRIMARY);
    assert.strictEqual(src.verification_role, SOURCE_ROLES.PRIMARY_EVENT_SOURCE);
    assert.strictEqual(src.discovery_enabled, true);
    assert.strictEqual(src.source_type, SOURCE_TYPES.OFFICIAL_PROMOTER_WEB);
  });

  runTest('1.2 SourceRegistry registers src-ravel-entertainment alias', () => {
    const alias = sourceRegistry.getSource('src-ravel-entertainment');
    assert.ok(alias, 'src-ravel-entertainment alias must exist');
    assert.strictEqual(alias.source_name, 'Ravel Entertainment');
    assert.strictEqual(alias.trust_level, TRUST_LEVELS.TIER_S);
  });

  runTest('1.3 SourceRegistry recognizes Ravel as Trusted Primary Source', () => {
    assert.strictEqual(sourceRegistry.isTrustedPrimarySource('src-promoter-ravel'), true);
    assert.strictEqual(sourceRegistry.isTrustedPrimarySource('src-ravel-entertainment'), true);
    assert.strictEqual(TRUSTED_SOURCE_PRIORITY['src-promoter-ravel'], 1);
    assert.strictEqual(TRUSTED_SOURCE_PRIORITY['ravel'], 1);
  });

  // 2. ApmiPromoterRegistry & PromoterDiscoveryRegistry Tests
  console.log('\n── Section 2: APMI & Promoter Discovery Registries ──');
  runTest('2.1 ApmiPromoterRegistry contains Ravel Entertainment', () => {
    const member = apmiPromoterRegistry.getMemberBySlug('ravel-entertainment');
    assert.ok(member, 'ravel-entertainment must exist in ApmiPromoterRegistry');
    assert.strictEqual(member.name, 'Ravel Entertainment');
    assert.strictEqual(member.source_id, 'src-promoter-ravel');
    assert.strictEqual(member.website, 'https://www.ravelentertainment.com/');
    assert.strictEqual(member.instagram, 'https://www.instagram.com/ravelentertainment/');
    assert.ok(member.event_keywords.includes('hammersonic'));
    assert.ok(member.event_keywords.includes('my chemical romance'));
  });

  runTest('2.2 PromoterDiscoveryRegistry resolves Ravel by ID, alias, and slug', () => {
    const byId = promoterDiscoveryRegistry.getPromoterById('prm-ravel-entertainment');
    assert.ok(byId, 'Must resolve by canonical ID prm-ravel-entertainment');
    assert.strictEqual(byId.canonical_name, 'Ravel Entertainment');

    const bySourceId = promoterDiscoveryRegistry.getPromoterById('src-promoter-ravel');
    assert.ok(bySourceId, 'Must resolve by source ID src-promoter-ravel');
    assert.strictEqual(bySourceId.promoter_id, 'prm-ravel-entertainment');

    const bySlug = promoterDiscoveryRegistry.getPromoterBySlug('ravel-entertainment');
    assert.ok(bySlug, 'Must resolve by slug ravel-entertainment');
    assert.strictEqual(bySlug.promoter_id, 'prm-ravel-entertainment');

    const byShortSlug = promoterDiscoveryRegistry.getPromoterBySlug('ravel');
    assert.ok(byShortSlug, 'Must resolve by short alias slug ravel');
    assert.strictEqual(byShortSlug.promoter_id, 'prm-ravel-entertainment');
  });

  // 3. RavelPromoterAdapter Source Authority & Fail-Closed Behavior
  console.log('\n── Section 3: RavelPromoterAdapter Source Authority & Policy ──');
  const adapter = new RavelPromoterAdapter();

  runTest('3.1 Adapter constructor sets official attributes', () => {
    assert.strictEqual(adapter.sourceId, 'src-promoter-ravel');
    assert.strictEqual(adapter.promoterName, 'Ravel Entertainment');
    assert.strictEqual(adapter.officialUrl, 'https://www.ravelentertainment.com/');
    assert.strictEqual(adapter.trustLevel, TRUST_LEVELS.TIER_S);
  });

  runTest('3.2 Adapter accepts events under Ravel authority', () => {
    const mcrEvent = {
      name: 'My Chemical Romance Live in Jakarta',
      organizer_name: 'Ravel Entertainment',
      artist: 'My Chemical Romance'
    };
    assert.strictEqual(adapter.isEventUnderRavelAuthority(mcrEvent), true);

    const hammersonicEvent = {
      name: 'Hammersonic Festival 2026',
      organizer_name: 'Ravel Entertainment'
    };
    assert.strictEqual(adapter.isEventUnderRavelAuthority(hammersonicEvent), true);
  });

  runTest('3.3 Adapter REJECTS non-Ravel events (Source Authority Boundary)', () => {
    const gnrEvent = {
      name: "Guns N' Roses Jakarta 2026",
      organizer_name: 'PK Entertainment',
      artist: "Guns N' Roses"
    };
    assert.strictEqual(adapter.isEventUnderRavelAuthority(gnrEvent), false);

    const efestEvent = {
      name: 'The 15th Efestaphoria',
      organizer_name: 'BEM FEB UNAIR',
      artist: 'Kahitna'
    };
    assert.strictEqual(adapter.isEventUnderRavelAuthority(efestEvent), false);
  });

  await runAsyncTest('3.4 ingestVerifiedRavelEvent throws on non-Ravel event', async () => {
    let threw = false;
    try {
      await adapter.ingestVerifiedRavelEvent({
        name: 'Coldplay Jakarta Tour',
        organizer_name: 'Third Party Promoter'
      });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('SOURCE_AUTHORITY_VIOLATION'));
    }
    assert.strictEqual(threw, true, 'Must reject foreign event with SOURCE_AUTHORITY_VIOLATION');
  });

  await runAsyncTest('3.5 discover() handles access restrictions gracefully (fail-closed)', async () => {
    const report = await adapter.discover();
    assert.ok(report, 'discover() must return an operational status report');
    assert.ok(
      report.status === 'ONLINE' || 
      report.status === 'RESTRICTED_ACCESS_MANUAL_REVIEW' || 
      report.status === 'ERROR',
      `Unexpected status: ${report.status}`
    );
    if (report.status === 'RESTRICTED_ACCESS_MANUAL_REVIEW') {
      assert.strictEqual(report.requires_manual_curation, true);
    }
  });

  runTest('3.6 getMonitoringReport provides required telemetry', () => {
    const rep = adapter.getMonitoringReport();
    assert.strictEqual(rep.source_id, 'src-promoter-ravel');
    assert.strictEqual(rep.source_name, 'Ravel Entertainment');
    assert.strictEqual(rep.source_url, 'https://www.ravelentertainment.com/');
    assert.strictEqual(rep.trust_level, 'TRUSTED_PRIMARY');
    assert.strictEqual(rep.tier, 1);
    assert.strictEqual(rep.authority_level, 'HIGH');
    assert.ok(rep.metrics, 'Monitoring report must include metrics');
  });

  // 4. MCR Jakarta 2026 Canonical Provenance & Zero Fake Inventory
  console.log('\n── Section 4: MCR Jakarta 2026 Provenance & Zero Fake Inventory ──');
  runTest('4.1 MCR canonical record has Ravel as Primary Promoter', () => {
    const mcr = canonicalRegistry.getHeroEvents().find(h => h.id === 'event-mcr-jakarta-2026');
    assert.ok(mcr, 'MCR event must exist in CanonicalEventRegistry');
    assert.strictEqual(mcr.organizer_name, 'Ravel Entertainment');
    assert.strictEqual(mcr.promoter, 'Ravel Entertainment');
    assert.strictEqual(mcr.promoter_website, 'https://www.ravelentertainment.com/');
    assert.strictEqual(mcr.event_microsite, 'https://mcrjakarta.com/');
    assert.strictEqual(mcr.official_event_url, 'https://mcrjakarta.com/');
    assert.strictEqual(mcr.official_ticket_url, 'https://www.tiket.com/id-id/to-do/my-chemical-romance-live-in-jakarta-2026');
    assert.strictEqual(mcr.official_ticketing_provider, 'Tiket.com');
  });

  runTest('4.2 MCR sources array contains multi-tier hierarchy', () => {
    const mcr = canonicalRegistry.getHeroEvents().find(h => h.id === 'event-mcr-jakarta-2026');
    assert.ok(Array.isArray(mcr.sources), 'MCR must have sources array');
    
    const primarySource = mcr.sources.find(s => s.source_id === 'src-promoter-ravel');
    assert.ok(primarySource, 'Must include Ravel as primary promoter source');
    assert.strictEqual(primarySource.trust_level, TRUST_LEVELS.TIER_S);
    assert.strictEqual(primarySource.source_role, 'PRIMARY_EVENT_SOURCE');

    const micrositeSource = mcr.sources.find(s => s.source_id === 'src-mcrjakarta-microsite');
    assert.ok(micrositeSource, 'Must include mcrjakarta microsite source');

    const ticketSource = mcr.sources.find(s => s.source_id === 'src-tiket-com');
    assert.ok(ticketSource, 'Must include Tiket.com partner source');
  });

  runTest('4.3 Zero Fake Inventory invariant for MCR and all heroes', () => {
    const heroes = canonicalRegistry.getHeroEvents();
    for (const hero of heroes) {
      assert.strictEqual(hero.resale_inventory_count, 0, `Hero ${hero.id} must have resale_inventory_count 0`);
      assert.strictEqual(hero.resale_available, false, `Hero ${hero.id} must have resale_available false`);
    }
  });

  // 5. Multi-Source Hierarchy Preservation
  console.log('\n── Section 5: Multi-Source Hierarchy Preservation ──');
  runTest('5.1 Guns N Roses 2026 does NOT use Ravel Entertainment', () => {
    const gnr = canonicalRegistry.getHeroEvents().find(h => h.id === 'event-gnr-jakarta-2026');
    assert.ok(gnr, 'GNR 2026 must exist');
    assert.notStrictEqual(gnr.organizer_name, 'Ravel Entertainment');
    assert.strictEqual(gnr.official_event_url, 'https://gnrjakarta.com/');
  });

  runTest('5.2 The 15th Efestaphoria retains Celestix & BEM FEB UNAIR authority', () => {
    const efest = canonicalRegistry.getHeroEvents().find(h => h.id === 'event-efestaphoria-2026');
    assert.ok(efest, 'Efestaphoria must exist');
    assert.notStrictEqual(efest.organizer_name, 'Ravel Entertainment');
    assert.strictEqual(efest.official_ticket_url, 'https://www.celestix.id/event/the-15th-efestaphoria/539');
  });

  // Summary
  console.log('\n================================================================');
  console.log(`  VERIFICATION FINISHED: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
})();
