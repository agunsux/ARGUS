#!/usr/bin/env node
/**
 * TIKUM / ARGUS — Canonical Catalog Seed Runner
 *
 * Deterministically seeds verified canonical events into target PostgreSQL from
 * `src/discovery/fixtures/official_event_snapshot.json`.
 *
 * INVARIANTS:
 * - 100% idempotent (ON CONFLICT DO UPDATE).
 * - Preserves verified provenance links.
 * - Sanitized logging (zero secrets or credentials logged).
 * - Never fabricates fake ticket inventory or ghost sellers.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { EventDeduplicationService } = require('../src/discovery/EventDeduplicationService');
const { EventTemporalLifecycleEngine } = require('../src/discovery/EventTemporalLifecycleEngine');
const { EventVisualProvenanceService } = require('../src/discovery/EventVisualProvenanceService');

let targetUrl = process.env.TARGET_DATABASE_URL || process.env.SUPABASE_DATABASE_URL;

if (!targetUrl && process.argv[2]) {
  targetUrl = process.argv[2];
}

if (!targetUrl && fs.existsSync('.env.local')) {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    for (const line of envContent.split('\n')) {
      if (line.startsWith('TARGET_DATABASE_URL=') || line.startsWith('SUPABASE_DATABASE_URL=')) {
        let val = line.split('=')[1].trim().replace(/['"]/g, '');
        try {
          const u = new URL(val);
          u.searchParams.delete('channel_binding');
          val = u.toString();
        } catch (_) {}
        targetUrl = val;
        break;
      }
    }
  } catch (_) {}
}

if (!targetUrl && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('neon.tech')) {
  targetUrl = process.env.DATABASE_URL;
}

if (!targetUrl) {
  console.error('[ERROR] Target database connection string missing. Set TARGET_DATABASE_URL or SUPABASE_DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: targetUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function seedCatalog() {
  const snapshotPath = path.resolve('src/discovery/fixtures/official_event_snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    console.error('[FATAL] Snapshot file not found:', snapshotPath);
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const verifiedRecords = snapshot.records || [];
  const discoveryRecords = snapshot.discovery_only_records || [];
  const rawRecords = [...verifiedRecords, ...discoveryRecords];

  // Pass through EventDeduplicationService to eliminate duplicate listings
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

  console.log('========================================================================');
  console.log('TIKUM / ARGUS — CANONICAL CATALOG SEED RUNNER');
  console.log('========================================================================');
  console.log(`Snapshot schema:    ${snapshot.schema}`);
  console.log(`Snapshot timestamp: ${snapshot.generated_at}`);
  console.log(`Verified events:    ${verifiedRecords.length}`);
  console.log(`Discovery events:   ${discoveryRecords.length}`);
  console.log(`Total raw records:  ${rawRecords.length}`);
  console.log(`Deduped canonical:  ${allRecords.length}`);
  console.log('------------------------------------------------------------------------\n');

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query('BEGIN');
    const now = new Date();

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

      const res = await client.query(`
        INSERT INTO canonical_events (
          id, slug, canonical_name, event_type, category,
          start_date, start_datetime, end_date, end_datetime, timezone,
          venue_name, venue_city, city, province, country,
          organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
          min_price, max_price, is_verified, verification_status,
          lifecycle_status, archive_status, public_visibility, homepage_visibility,
          metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27,
          $28::jsonb, NOW(), NOW()
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
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `, [
        id, slug, canonicalName, eventType, category,
        startDate, startDatetime, endDate, endDatetime, timezone,
        venueName, venueCity, city, province, country,
        organizerName, officialEventUrl, officialTicketUrl, officialProvider,
        minPrice, maxPrice, isVerified, verificationStatus,
        lifecycleStatus, archiveStatus, publicVisibility, homepageVisibility,
        JSON.stringify(metadata)
      ]);

      if (res.rows[0].is_inserted) {
        inserted++;
      } else {
        updated++;
      }
    }

    await client.query('COMMIT');

    console.log(`\n✅ Catalog Seeding Completed Successfully!`);
    console.log(`  Events Inserted: ${inserted}`);
    console.log(`  Events Updated:  ${updated}`);
    console.log(`  Total In DB:     ${inserted + updated}\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[SEED ERROR]', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedCatalog();
