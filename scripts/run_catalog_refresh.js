#!/usr/bin/env node
/**
 * TIKUM — Automated Event Catalog Refresh & Temporal Lifecycle Runner
 *
 * Usage:
 *   node scripts/run_catalog_refresh.js [--as-of-date=YYYY-MM-DD] [--dry-run] [--execute]
 *
 * Invariants:
 *   - Reference date defaults to 2026-10-25 (or current execution date in production)
 *   - Asia/Jakarta authoritative timezone
 *   - Rolling 90-day discovery window
 *   - Minimum ticket category price >= Rp 400,000
 *   - Goers Cloudflare 403 challenge recorded honestly without bypass
 *   - Dynamic Hero selection (BTS marquee + King Nassar; Ye expired)
 */

const { dailyCatalogRefreshService } = require('../src/discovery/DailyCatalogRefreshService');

async function main() {
  const args = process.argv.slice(2);
  let asOfDate = '2026-10-25T18:00:00+07:00';
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--as-of-date=')) {
      asOfDate = arg.substring('--as-of-date='.length);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--execute') {
      dryRun = false;
    }
  }

  console.log('========================================================================');
  console.log('TIKUM — DAILY CATALOG REFRESH & HERO ROTATION RUNNER');
  console.log('========================================================================');
  console.log(`Clock Reference: ${asOfDate} (Asia/Jakarta)`);
  console.log(`Execution Mode:  ${dryRun ? 'DRY-RUN (Simulated)' : 'EXECUTE (Live)'}`);
  console.log('------------------------------------------------------------------------\n');

  try {
    const report = await dailyCatalogRefreshService.runDailyRefresh({
      asOfDate,
      dryRun
    });

    console.log(`Run ID:                 ${report.run_id}`);
    console.log(`Status:                 ${report.status}`);
    console.log(`Window:                 ${report.discovery_window.start} -> ${report.discovery_window.end} (${report.discovery_window.days} days)`);
    console.log(`Events Evaluated:       ${report.events_evaluated}`);
    console.log(`Events Expired:         ${report.events_expired}`);
    console.log(`Events Discovered:      ${report.events_discovered}`);
    console.log(`Events Inserted:        ${report.events_inserted}`);
    console.log(`Events Updated:         ${report.events_updated}`);
    console.log(`Excluded (Price <400k): ${report.excluded_by_price}`);
    console.log(`Quarantined (Price ?):  ${report.quarantined_price_unverified}`);
    console.log('\n--- Sources Status ---');
    console.log(`  Loket: ${report.sources.loket.status} (Discovered: ${report.sources.loket.discovered_count}, Qualified: ${report.sources.loket.qualified_count})`);
    console.log(`  Goers: ${report.sources.goers.status} [Coverage: ${report.sources.goers.coverage_status}] (HTTP ${report.sources.goers.http_status} - ${report.sources.goers.policy_adherence})`);
    if (report.sources.goers.limitation_notice) {
      console.log(`         Notice: ${report.sources.goers.limitation_notice}`);
    }
    console.log('\n--- Hero Spotlight ---');
    for (const h of report.current_heroes) {
      console.log(`  ★ [${h.id}] ${h.title} | ${h.date} | Rp ${h.min_price.toLocaleString('id-ID')} | Status: ${h.primary_ticket_status}`);
    }
    console.log('\n========================================================================');
    console.log(`COMPLETED in ${report.duration_ms} ms at ${report.completed_at}`);
    console.log('========================================================================');

    process.exit(report.status === 'SUCCESS' ? 0 : 1);
  } catch (err) {
    console.error('Refresh run failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
