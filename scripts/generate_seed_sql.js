const fs = require('fs');
const path = require('path');
const { EventDeduplicationService } = require('../src/discovery/EventDeduplicationService');
const { EventTemporalLifecycleEngine } = require('../src/discovery/EventTemporalLifecycleEngine');
const { EventVisualProvenanceService } = require('../src/discovery/EventVisualProvenanceService');

function escapeSqlString(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escapeSqlJson(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
}

function generateSeedSql() {
  const snapshotPath = path.resolve('src/discovery/fixtures/official_event_snapshot.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const verifiedRecords = snapshot.records || [];
  const discoveryRecords = snapshot.discovery_only_records || [];
  const rawRecords = [...verifiedRecords, ...discoveryRecords];

  const allRecords = [];
  for (const raw of rawRecords) {
    if (!raw || (!raw.name && !raw.title)) continue;
    const dup = EventDeduplicationService.findDuplicateCandidate(raw, allRecords);
    if (dup && dup.isMatch && dup.canonicalEvent) {
      const idx = allRecords.indexOf(dup.canonicalEvent);
      if (idx !== -1) {
        allRecords[idx] = EventDeduplicationService.mergeCanonicalPair(dup.canonicalEvent, raw);
      }
    } else {
      allRecords.push(raw);
    }
  }

  const now = new Date();
  const statements = ['BEGIN;'];

  for (const rec of allRecords) {
    const id = rec.id || `evt_${rec.source_event_id || rec.loket_event_slug || Math.random().toString(36).substring(2, 10)}`;
    const slug = rec.slug || rec.loket_event_slug || id;
    const canonicalName = rec.name || rec.title || 'Untitled Event';
    const eventType = rec.event_type || 'CONCERT';
    const category = rec.category || 'CONCERT';

    const rawDate = rec.start_date || (rec.start_datetime ? rec.start_datetime.substring(0, 10) : null);
    const hasValidDate = rawDate && !isNaN(new Date(rawDate).getTime()) && String(rawDate).trim().length >= 10;

    let startDate = hasValidDate ? rawDate : null;
    let startDatetime = rec.start_datetime || (hasValidDate ? `${startDate}T19:00:00+07:00` : null);
    let endDate = rec.end_date || startDate;
    let endDatetime = rec.end_datetime || (hasValidDate ? `${endDate}T23:00:00+07:00` : null);
    const timezone = rec.timezone || 'Asia/Jakarta';
    const venueName = rec.venue_name || 'Venue TBA';
    const venueCity = rec.city || 'Jakarta';
    const city = rec.city || 'Jakarta';
    const province = rec.province || null;
    const country = rec.country || 'Indonesia';
    const organizerName = rec.organizer || null;
    const officialEventUrl = rec.official_event_url || null;
    const officialTicketUrl = rec.official_ticket_url || null;
    const officialProvider = rec.discovery_source_id ? rec.discovery_source_id.replace('src-', '') : 'loket';
    const minPrice = rec.min_price || null;
    const maxPrice = rec.max_price || null;
    const isVerified = Boolean(rec.verification_mode && rec.verification_mode.includes('AUTHORITATIVE')) || rec.is_verified === true;
    const verificationStatus = isVerified ? 'VERIFIED' : 'DISCOVERY';

    let lifecycleStatus = 'UPCOMING';
    let archiveStatus = 'ACTIVE';
    let publicVisibility = true;
    let homepageVisibility = false;

    if (!hasValidDate) {
      lifecycleStatus = 'SCHEDULE_PENDING';
      archiveStatus = 'PENDING';
      publicVisibility = false;
      homepageVisibility = false;
    } else {
      const isPast = EventTemporalLifecycleEngine.isEventExpired({ start_date: startDate, end_date: endDate }, now);
      if (isPast) {
        lifecycleStatus = 'COMPLETED';
        archiveStatus = 'ARCHIVED';
        publicVisibility = true;
        homepageVisibility = false;
      } else {
        lifecycleStatus = 'UPCOMING';
        archiveStatus = 'ACTIVE';
        publicVisibility = true;
        homepageVisibility = isVerified;
      }
    }

    const visual = EventVisualProvenanceService.resolveCatalogEventImageProvenance(rec, rec.metadata || {});
    const metadata = {
      artists: rec.artists || [],
      image_url: visual.image_url || rec.image_url || null,
      image_credit: visual.image_credit || rec.image_credit || null,
      verification_score: rec.verification_score || null,
      sources: rec.sources || [],
      seeded_at: new Date().toISOString()
    };

    const sql = `
      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        ${escapeSqlString(id)}, ${escapeSqlString(slug)}, ${escapeSqlString(canonicalName)}, ${escapeSqlString(eventType)}, ${escapeSqlString(category)},
        ${escapeSqlString(startDate)}, ${escapeSqlString(startDatetime)}, ${escapeSqlString(endDate)}, ${escapeSqlString(endDatetime)}, ${escapeSqlString(timezone)},
        ${escapeSqlString(venueName)}, ${escapeSqlString(venueCity)}, ${escapeSqlString(city)}, ${escapeSqlString(province)}, ${escapeSqlString(country)},
        ${escapeSqlString(organizerName)}, ${escapeSqlString(officialEventUrl)}, ${escapeSqlString(officialTicketUrl)}, ${escapeSqlString(officialProvider)},
        ${minPrice !== null ? minPrice : 'NULL'}, ${maxPrice !== null ? maxPrice : 'NULL'}, ${isVerified ? 'TRUE' : 'FALSE'}, ${escapeSqlString(verificationStatus)},
        ${escapeSqlString(lifecycleStatus)}, ${escapeSqlString(archiveStatus)}, ${publicVisibility ? 'TRUE' : 'FALSE'}, ${homepageVisibility ? 'TRUE' : 'FALSE'},
        ${escapeSqlJson(metadata)}, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    `;
    statements.push(sql);
  }

  statements.push('COMMIT;');
  const outPath = path.resolve('migrations/seed_canonical_events.sql');
  fs.writeFileSync(outPath, statements.join('\n'), 'utf8');
  console.log(`Generated SQL with ${allRecords.length} canonical events at ${outPath}`);
}

generateSeedSql();
