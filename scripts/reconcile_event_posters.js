const { Pool } = require('pg');
const fs = require('fs');

function getEnv() {
  const env = { ...process.env };
  if (fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }
  return env;
}

const env = getEnv();
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const VERIFIED_POSTERS = [
  {
    idOrSlug: 'event-gnr-jakarta-2026',
    poster_url: 'https://gnrjakarta.com/wp-content/uploads/2026/06/web-banner-1440x740-POSTER.jpg.jpeg',
    image_source_url: 'https://gnrjakarta.com/',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: "GNR Jakarta Official (Guns N' Roses)"
  },
  {
    idOrSlug: 'event-dwp-2026',
    poster_url: 'https://dwpfest.com/icons/richlink.jpg',
    image_source_url: 'https://dwpfest.com/',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Ismaya Live / DWP'
  },
  {
    idOrSlug: 'evt_dwp-2026_wVb9',
    poster_url: 'https://dwpfest.com/icons/richlink.jpg',
    image_source_url: 'https://dwpfest.com/',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Ismaya Live / DWP'
  },
  {
    idOrSlug: 'ev-can-lalala-fest-2027',
    poster_url: 'https://lalalafest.com/images/og-image.webp',
    image_source_url: 'https://lalalafest.com/jakarta',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'THE GROUP / LaLaLa Festival'
  },
  {
    idOrSlug: 'ev-can-joyland-sessions-2026',
    poster_url: 'https://assets.loket.com/neo/production/images/banner/20260929110808_6abb39a877f97.jpeg',
    image_source_url: 'https://joylandfest.com',
    image_source_type: 'OFFICIAL_TICKETING',
    image_credit: 'Plainsong Live / LOKET'
  },
  {
    idOrSlug: 'bts-world-tour-arirang-jakarta-2026',
    poster_url: '/assets/posters/bts-world-tour-arirang-jakarta-2026.svg',
    image_source_url: 'https://ibighit.com/bts/',
    image_source_type: 'OFFICIAL_PROMOTER_WEB',
    image_credit: 'Big Hit Music & HYBE'
  },
  {
    idOrSlug: 'bigbang-cosmos-tour-jakarta-2027',
    poster_url: '/assets/posters/bigbang-cosmos-tour-jakarta-2027.svg',
    image_source_url: 'https://bigbanginjakarta.com/',
    image_source_type: 'OFFICIAL_PROMOTER_WEB',
    image_credit: 'YG Entertainment / Applewood'
  },
  {
    idOrSlug: 'evt_bigbang-jakarta-2027',
    poster_url: '/assets/posters/bigbang-cosmos-tour-jakarta-2027.svg',
    image_source_url: 'https://bigbanginjakarta.com/',
    image_source_type: 'OFFICIAL_PROMOTER_WEB',
    image_credit: 'YG Entertainment / Applewood'
  },
  {
    idOrSlug: 'evt_edp1690841',
    poster_url: 'https://cdn.ruangevent.id/temgmt/maroon5/main-cover-maroon5.webp',
    image_source_url: 'https://www.livenation.asia/',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Live Nation Asia / TEM Presents / PK Entertainment'
  },
  {
    idOrSlug: 'ev-can-30949569',
    poster_url: 'https://cdn.ruangevent.id/temgmt/maroon5/main-cover-maroon5.webp',
    image_source_url: 'https://www.livenation.asia/',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Live Nation Asia / TEM Presents / PK Entertainment'
  }
];

async function main() {
  console.log('Reconciling verified event posters in PostgreSQL database...');
  for (const item of VERIFIED_POSTERS) {
    const existing = await pool.query(
      'SELECT id, slug, metadata FROM canonical_events WHERE id = $1 OR slug = $1',
      [item.idOrSlug]
    );
    if (existing.rows.length === 0) {
      console.log(`[SKIP] Event not found in DB: ${item.idOrSlug}`);
      continue;
    }
    const row = existing.rows[0];
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    meta.image_url = item.poster_url;
    meta.poster_url = item.poster_url;
    meta.thumbnail_url = item.poster_url;
    meta.image_source_url = item.image_source_url;
    meta.image_source_type = item.image_source_type;
    meta.image_credit = item.image_credit;
    meta.image_attribution = item.image_credit;
    meta.image_status = 'VERIFIED_OFFICIAL';
    meta.image_verified = true;
    meta.is_fallback_image = false;

    await pool.query(
      `UPDATE canonical_events 
       SET poster_url = $1,
           poster_thumbnail_url = $1,
           poster_source_url = $2,
           poster_attribution = $3,
           poster_verification_status = 'VERIFIED_OFFICIAL',
           metadata = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [item.poster_url, item.image_source_url, item.image_credit, JSON.stringify(meta), row.id]
    );
    console.log(`[UPDATED] ${row.id} (${row.slug}) -> ${item.poster_url}`);
  }
  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
