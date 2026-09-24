#!/usr/bin/env node
/**
 * TIKUM / ARGUS — Manual Real-Source Seeding & Verification CLI
 *
 * Runs the same bootstrap seeding path used by the running application and
 * prints the resulting public catalogue with its provenance and imagery.
 *
 * USAGE
 *   node scripts/seed_real_sources.js
 *   node scripts/seed_real_sources.js --json   # machine-readable report
 */

const { resetDatabase, state } = require('../src/database');
const { realSourceSeedService } = require('../src/discovery/RealSourceSeedService');
const { canonicalRegistry } = require('../src/discovery/CanonicalEventRegistry');
const { OfficialSourceSnapshotStore } = require('../src/discovery/OfficialSourceSnapshotStore');

const AS_JSON = process.argv.includes('--json');

async function main() {
  resetDatabase();

  const snapshot = OfficialSourceSnapshotStore.getSnapshotMeta();
  console.log('==================================================');
  console.log('TIKUM — Real Source Seeding');
  console.log(`Snapshot: ${snapshot.available ? 'available' : 'MISSING'} | generated_at: ${snapshot.generated_at}`);
  console.log(`Snapshot records: ${snapshot.verified_records} corroborated / ${snapshot.discovery_only_records} discovery-only`);
  console.log('==================================================');

  const report = await realSourceSeedService.seed();

  const all = canonicalRegistry.getAllEvents();
  const publiclyUpcoming = all.filter(e => {
    const isVerified = e.is_verified === true &&
      (e.verification_status === 'VERIFIED' || e.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    const hasProvenance = Boolean(e.source_url && e.evidence_hash && e.verified_at);
    return isVerified && hasProvenance;
  });

  if (AS_JSON) {
    console.log(JSON.stringify({ report, publicly_upcoming: publiclyUpcoming }, null, 2));
    return;
  }

  console.log('\nPUBLIC VERIFIED UPCOMING CATALOGUE');
  console.log('--------------------------------------------------');
  for (const e of publiclyUpcoming.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))) {
    console.log(`• ${e.start_date} | ${e.title}`);
    console.log(`    city      : ${e.city} | venue: ${e.venue_name}`);
    console.log(`    status    : ${e.verification_status} (confidence ${e.verification_confidence})`);
    console.log(`    image     : ${e.image_url ? 'YES' : 'FALLBACK'}`);
    console.log(`    img type  : ${e.image_source_type} | credit: ${e.image_credit}`);
    console.log(`    ticket    : ${e.official_ticket_url || '-'}`);
    console.log(`    source    : ${e.source_url}`);
    const social = (e.social_discovery_signals || []).map(s => s.account_handle).filter(Boolean).join(', ');
    console.log(`    IG signal : ${social || '-'}`);
  }
  console.log('--------------------------------------------------');
  console.log(`Total public verified upcoming: ${publiclyUpcoming.length}`);
  console.log(`Total canonical events in registry: ${all.length}`);
  console.log(`Projected into state.events: ${state.events.length}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Seeding failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { main };
