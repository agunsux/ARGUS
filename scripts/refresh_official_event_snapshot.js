#!/usr/bin/env node
/**
 * TIKUM / ARGUS — Official Event Source Snapshot Refresher (CLI)
 *
 * Regenerates `src/discovery/fixtures/official_event_snapshot.json` from the
 * audited official event channels (Live Nation Asia, LOKET, BBO Events).
 *
 * USAGE
 *   node scripts/refresh_official_event_snapshot.js                 # all sources
 *   node scripts/refresh_official_event_snapshot.js --stage=loket    # LOKET only
 *   node scripts/refresh_official_event_snapshot.js --stage=ln       # Live Nation only
 *   node scripts/refresh_official_event_snapshot.js --stage=bbo      # BBO only
 *   node scripts/refresh_official_event_snapshot.js --dry-run
 *
 * Staged runs preserve records belonging to the sources NOT refreshed, so the
 * snapshot can be updated incrementally without dropping supply.
 *
 * See `src/discovery/OfficialEventSnapshotBuilder.js` for the compliance,
 * evidence and fail-closed rules.
 */

const fs = require('fs');
const path = require('path');

const { buildSnapshot, USER_AGENT, MIN_HOST_INTERVAL_MS } = require('../src/discovery/OfficialEventSnapshotBuilder');
const { OfficialSourceSnapshotStore } = require('../src/discovery/OfficialSourceSnapshotStore');

const OUT_PATH = path.join(__dirname, '..', 'src', 'discovery', 'fixtures', 'official_event_snapshot.json');
const DRY_RUN = process.argv.includes('--dry-run');
const STAGE = (() => {
  const arg = process.argv.find(a => a.startsWith('--stage='));
  const value = arg ? arg.split('=')[1] : 'all';
  return ['all', 'ln', 'loket', 'bbo'].includes(value) ? value : 'all';
})();

/**
 * Optional per-page refresh for the Live Nation calendar
 * (e.g. --pages=lany-tickets-adp771408,the-weeknd-tickets-adp474869).
 * Enables polite batched refreshes that stay within crawler time budgets.
 */
const PAGE_PATHS = (() => {
  const arg = process.argv.find(a => a.startsWith('--pages='));
  if (!arg) return null;
  const list = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : null;
})();

async function main() {
  console.log('==================================================');
  console.log('TIKUM — Official Event Source Snapshot Refresh');
  console.log(`Started: ${new Date().toISOString()} | stage: ${STAGE}`);
  console.log(`User-Agent: ${USER_AGENT}`);
  console.log(`Rate limit: ${MIN_HOST_INTERVAL_MS}ms minimum per-host spacing`);
  if (PAGE_PATHS) console.log(`Page subset: ${PAGE_PATHS.length} calendar page(s)`);
  console.log('==================================================');

  const existingSnapshot = STAGE === 'all' ? null : OfficialSourceSnapshotStore.loadSnapshot();
  const doc = await buildSnapshot({ stage: STAGE, existingSnapshot, pagePaths: PAGE_PATHS });

  if (DRY_RUN) {
    console.log('\n[DRY RUN] snapshot not written.');
  } else {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    console.log(`\n[SAVED] ${path.relative(process.cwd(), OUT_PATH)}`);
  }

  console.log('==================================================');
  console.log(`Verified (authoritatively corroborated): ${doc.totals.verified_records}`);
  console.log(`Discovery-only (cannot go public):       ${doc.totals.discovery_only_records}`);
  console.log('==================================================');

  return doc;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Snapshot refresh failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { main };
