const fs = require('fs');

if (!process.env.DATABASE_URL && fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      let val = line.substring('DATABASE_URL='.length).trim().replace(/['"]/g, '');
      try {
        const u = new URL(val);
        u.searchParams.delete('channel_binding');
        val = u.toString();
      } catch (_) {}
      process.env.DATABASE_URL = val;
      break;
    }
  }
}

const { getCatalogRepository } = require('../src/discovery/repository');
const { sourceRegistry } = require('../src/discovery/SourceRegistry');
const { EventTemporalLifecycleEngine } = require('../src/discovery/EventTemporalLifecycleEngine');

async function audit() {
  const repo = getCatalogRepository();
  await repo.init();

  console.log('=== PHASE A BASELINE AUDIT ===\n');

  // 1. Sources Audit from SourceRegistry
  const allSources = sourceRegistry.getAllSources();
  console.log(`1. Total Registered Sources: ${allSources.length}`);
  
  const permitted = allSources.filter(s => sourceRegistry.isSourcePermittedForIngestion(s.source_id));
  console.log(`   - Permitted / Accessible: ${permitted.length}`);
  const blocked = allSources.filter(s => s.active_status === 'BLOCKED' || s.permission_status === 'NOT_ALLOWED');
  console.log(`   - Explicitly Blocked: ${blocked.length} (${blocked.map(b => b.source_id).join(', ')})`);

  // 2. Canonical Events in Neon DB
  const allEvents = await repo.getAllEvents();
  console.log(`\n2. Canonical Events in Neon PostgreSQL: ${allEvents.length}`);

  // 3. Source Listings (event_source_links)
  const linksRes = await repo.query('SELECT COUNT(*) FROM event_source_links');
  console.log(`3. Source Listings (event_source_links rows): ${linksRes.rows[0].count}`);

  // 4. Ticket Tiers in marketplace_tickets / metadata
  const mktTicketsRes = await repo.query('SELECT COUNT(*) FROM marketplace_tickets');
  console.log(`4. Marketplace Tickets: ${mktTicketsRes.rows[0].count}`);

  // 5. Events with Price Evidence >= Rp 500,000
  const highVal = allEvents.filter(e => (e.min_price && Number(e.min_price) >= 500000) || (e.max_price && Number(e.max_price) >= 500000));
  console.log(`5. Events with Price Evidence >= Rp 500,000: ${highVal.length}`);

  // 6. Temporal Expiry & Lifecycle Audit
  const now = new Date();
  const upcoming = [];
  const pastShownUpcoming = [];
  const archived = [];

  for (const e of allEvents) {
    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(e, now);
    const isArchived = EventTemporalLifecycleEngine.isEventArchived(e, now) || e.archive_status === 'ARCHIVED';
    const isExpired = EventTemporalLifecycleEngine.isEventExpired(e, now);

    if (isUpcoming && !isArchived) {
      upcoming.push(e);
    } else {
      archived.push(e);
    }

    // Check if event start date is in past but marked upcoming
    if (e.start_date && new Date(e.start_date) < now && e.lifecycle_status === 'UPCOMING' && e.archive_status !== 'ARCHIVED') {
      pastShownUpcoming.push(e);
    }
  }

  console.log(`6. Upcoming Events (per Engine Predicate): ${upcoming.length}`);
  console.log(`   - Archived / Past Events: ${archived.length}`);
  console.log(`   - Past Events Wrongly Marked Active Upcoming: ${pastShownUpcoming.length}`);
  if (pastShownUpcoming.length > 0) {
    for (const p of pastShownUpcoming) {
      console.log(`     * [${p.id}] "${p.name}" (start_date: ${p.start_date}, status: ${p.lifecycle_status})`);
    }
  }

  // 7. Verified & Provenance Filter (Public /api/events eligibility)
  const eligiblePublic = upcoming.filter(e => {
    const isVer = e.is_verified === true && (e.verification_status === 'VERIFIED' || e.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    const hasProv = Boolean(e.source_url && e.evidence_hash && e.verified_at);
    return isVer && hasProv;
  });
  console.log(`7. Publicly Visible Verified Upcoming Events (/api/events): ${eligiblePublic.length}`);

  // 8. Suspected Duplicates Audit
  console.log(`\n8. Suspected Duplicates Check:`);
  const nameMap = new Map();
  const suspectedDupes = [];
  for (const e of allEvents) {
    const key = `${(e.name || '').toLowerCase().trim()}::${(e.city || '').toLowerCase()}::${e.start_date || ''}`;
    if (nameMap.has(key)) {
      suspectedDupes.push({ existing: nameMap.get(key), duplicate: e });
    } else {
      nameMap.set(key, e);
    }
  }
  console.log(`   - Suspected duplicate tuples (same name + city + date): ${suspectedDupes.length}`);
  for (const d of suspectedDupes) {
    console.log(`     * Conflict: "${d.existing.name}" [${d.existing.id}] vs [${d.duplicate.id}] (${d.existing.start_date})`);
  }

  // 9. Tier / Seat / Map Coverage
  let withTiers = 0;
  let withSeat = 0;
  let withMap = 0;
  for (const e of allEvents) {
    const meta = e.metadata || {};
    if (meta.price_tiers && meta.price_tiers.length > 0) withTiers++;
    if (meta.seat_map_url || meta.venue_map || e.venue_map) withMap++;
    if (meta.seating_type || meta.admission_type) withSeat++;
  }
  console.log(`\n9. Tier / Seat / Map Coverage:`);
  console.log(`   - Events with explicit tier array: ${withTiers} / ${allEvents.length}`);
  console.log(`   - Events with seating classification: ${withSeat} / ${allEvents.length}`);
  console.log(`   - Events with map URL / data: ${withMap} / ${allEvents.length}`);
}

audit().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
