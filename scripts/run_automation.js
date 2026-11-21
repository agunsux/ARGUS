#!/usr/bin/env node
/**
 * TIKUM — Automated Tasks CLI Runner
 * Executes scheduled jobs:
 * 1. archive: Event Lifecycle Archival (WIB cutoff)
 * 2. scan: Primary Ticketing Event Scanner (>= IDR 300,000)
 * 3. publish: Twice-Weekly SEO Blog Publication Pipeline
 * 4. all: Runs all 3 jobs in deterministic sequence
 *
 * USAGE:
 *   node scripts/run_automation.js --job [archive|scan|publish|all] [--force]
 */

const { EventLifecycleService } = require('../src/discovery/EventLifecycleService');
const { PrimaryEventScannerService } = require('../src/discovery/PrimaryEventScannerService');
const { SeoBlogEngine } = require('../src/blog/SeoBlogEngine');

async function main() {
  const args = process.argv.slice(2);
  let job = 'all';
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--job' && args[i + 1]) {
      job = args[i + 1].toLowerCase();
      i++;
    } else if (args[i].startsWith('--job=')) {
      job = args[i].split('=')[1].toLowerCase();
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  console.log('======================================================');
  console.log(`  TIKUM AUTOMATION RUNNER — Job: ${job.toUpperCase()}`);
  console.log(`  Time (WIB): ${EventLifecycleService.getJakartaDateString()} (Force: ${force})`);
  console.log('======================================================\n');

  const results = {};

  try {
    if (job === 'archive' || job === 'archive-past-events' || job === 'all') {
      console.log('[1/3] Sweeping Event Lifecycle Archival...');
      const archiveRes = EventLifecycleService.archiveExpiredEvents({ force });
      results.archive = archiveRes;
      console.log(`  ✓ Concluded events archived: ${archiveRes.archived_count}`);
      console.log(`  ✓ Sitemap refreshed: ${archiveRes.sitemap_updated}\n`);
    }

    if (job === 'scan' || job === 'scan-primary-events' || job === 'all') {
      console.log('[2/3] Scanning Primary Ticketing Box Offices (>= IDR 300,000)...');
      const scanRes = PrimaryEventScannerService.scanAllSources({ force });
      results.scan = scanRes;
      console.log(`  ✓ Primary sources scanned: ${scanRes.scanned_sources.length}`);
      console.log(`  ✓ Discovered: ${scanRes.discovered_count} | New Inserted: ${scanRes.inserted_count} | Updated: ${scanRes.updated_count}`);
      console.log(`  ✓ Skipped (< 300k): ${scanRes.skipped_below_300k} | Errors: ${scanRes.errors.length}\n`);
    }

    if (job === 'publish' || job === 'publish-seo-blog' || job === 'all') {
      console.log('[3/3] Running Twice-Weekly SEO Blog Publication Pipeline...');
      const blogRes = SeoBlogEngine.publishDueArticles();
      results.blog = blogRes;
      console.log(`  ✓ Articles published: ${blogRes.published_count}`);
      if (blogRes.next_scheduled) {
        console.log(`  ✓ Next queued publication: "${blogRes.next_scheduled.title}" (${blogRes.next_scheduled.scheduled_at})`);
      }
      console.log(`  ✓ Sitemap refreshed: ${blogRes.sitemap_updated}\n`);
    }

    console.log('======================================================');
    console.log('  AUTOMATION RUNNER FINISHED SUCCESSFULLY');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Automation execution failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
