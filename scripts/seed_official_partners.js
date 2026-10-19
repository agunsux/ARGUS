/**
 * TIKUM / ARGUS — Register Allowlisted External Primary Ticketing Sources
 *
 * Idempotent, non-destructive script to register verified primary ticketing platforms
 * (Loket, Tiket.com, Live Nation Asia, Megatix, TipTip, BBO) into the Neon PostgreSQL
 * ticketing_partners table.
 *
 * TRUTHFULNESS & NON-ENDORSEMENT INVARIANT:
 * These entities are primary ticketing sources allowlisted for safe outbound navigation
 * and open-redirect prevention. They are NOT commercial partners of TIKUM, and no endorsement,
 * bilateral agreement, or active affiliate contract is claimed or implied.
 *
 * Usage: node scripts/seed_official_partners.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      let val = line.substring('DATABASE_URL='.length).trim().replace(/['"]/g, '');
      try {
        const u = new URL(val);
        u.searchParams.delete('channel_binding');
        val = u.toString();
      } catch (_) {}
      databaseUrl = val;
      break;
    }
  }
}

if (!databaseUrl) {
  console.log('[INFO] No DATABASE_URL found. Running in-memory verification only.');
  const { PartnerService } = require('../src/services/partner/PartnerService');
  PartnerService.seedDefaults();
  const { state } = require('../src/database');
  console.log(`[PASS] In-memory partners verified: ${state.partners.length} partners loaded.`);
  process.exit(0);
}

const CANONICAL_PARTNERS = [
  {
    id: 'partner-loket',
    name: 'LOKET',
    slug: 'loket',
    partner_type: 'TICKETING_PLATFORM',
    official_domains: JSON.stringify(['loket.com', 'www.loket.com']),
    integration_type: 'DIRECT_OFFICIAL_LINK',
    status: 'ACTIVE',
    country_code: 'ID',
    supported_currency: 'IDR',
    affiliate_program_url: 'https://www.loket.com',
    commission_config: JSON.stringify({ type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, commercial_relationship: false, partnership_tier: 'EXTERNAL_PRIMARY_SOURCE' }),
    notes: 'Kanal tiket primer eksternal publik (GoTo Group / Loket). Bukan mitra komersial TIKUM; domain terdaftar untuk allowlist pengalihan aman.'
  },
  {
    id: 'partner-tiket',
    name: 'Tiket.com',
    slug: 'tiket-com',
    partner_type: 'TICKETING_PLATFORM',
    official_domains: JSON.stringify(['tiket.com', 'www.tiket.com']),
    integration_type: 'DIRECT_OFFICIAL_LINK',
    status: 'ACTIVE',
    country_code: 'ID',
    supported_currency: 'IDR',
    affiliate_program_url: 'https://www.tiket.com/to-do',
    commission_config: JSON.stringify({ type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, commercial_relationship: false, partnership_tier: 'EXTERNAL_PRIMARY_SOURCE' }),
    notes: 'Kanal tiket primer OTA publik. Bukan mitra komersial TIKUM; domain terdaftar untuk allowlist pengalihan aman.'
  },
  {
    id: 'partner-livenation',
    name: 'Live Nation Asia',
    slug: 'livenation',
    partner_type: 'PROMOTER',
    official_domains: JSON.stringify(['livenation.asia', 'www.livenation.asia']),
    integration_type: 'DIRECT_OFFICIAL_LINK',
    status: 'ACTIVE',
    country_code: 'ID',
    supported_currency: 'IDR',
    affiliate_program_url: 'https://www.livenation.asia',
    commission_config: JSON.stringify({ type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, commercial_relationship: false, partnership_tier: 'EXTERNAL_PRIMARY_SOURCE' }),
    notes: 'Portal promotor konser internasional. Bukan mitra komersial TIKUM; domain terdaftar untuk allowlist pengalihan aman.'
  },
  {
    id: 'partner-megatix',
    name: 'Megatix Indonesia',
    slug: 'megatix',
    partner_type: 'TICKETING_PLATFORM',
    official_domains: JSON.stringify(['megatix.co.id', 'www.megatix.co.id']),
    integration_type: 'DIRECT_OFFICIAL_LINK',
    status: 'ACTIVE',
    country_code: 'ID',
    supported_currency: 'IDR',
    affiliate_program_url: 'https://megatix.co.id',
    commission_config: JSON.stringify({ type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, commercial_relationship: false, partnership_tier: 'EXTERNAL_PRIMARY_SOURCE' }),
    notes: 'Platform tiket independen festival/konser. Bukan mitra komersial TIKUM; domain terdaftar untuk allowlist pengalihan aman.'
  },
  {
    id: 'partner-tiptip',
    name: 'TipTip',
    slug: 'tiptip',
    partner_type: 'TICKETING_PLATFORM',
    official_domains: JSON.stringify(['tiptip.id', 'www.tiptip.id', 'tiptip.co']),
    integration_type: 'DIRECT_OFFICIAL_LINK',
    status: 'ACTIVE',
    country_code: 'ID',
    supported_currency: 'IDR',
    affiliate_program_url: 'https://tiptip.id',
    commission_config: JSON.stringify({ type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, commercial_relationship: false, partnership_tier: 'EXTERNAL_PRIMARY_SOURCE' }),
    notes: 'Platform tiket kreator & komunitas. Bukan mitra komersial TIKUM; domain terdaftar untuk allowlist pengalihan aman.'
  },
  {
    id: 'partner-bbo',
    name: 'BBO (PT BBO Aplikasi Indonesia)',
    slug: 'bbo',
    partner_type: 'TICKETING_PLATFORM',
    official_domains: JSON.stringify(['bbo.co.id', 'www.bbo.co.id']),
    integration_type: 'DIRECT_OFFICIAL_LINK',
    status: 'ACTIVE',
    country_code: 'ID',
    supported_currency: 'IDR',
    affiliate_program_url: 'https://bbo.co.id',
    commission_config: JSON.stringify({ type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, commercial_relationship: false, partnership_tier: 'EXTERNAL_PRIMARY_SOURCE' }),
    notes: 'Platform tiket nasional olahraga & pameran. Bukan mitra komersial TIKUM; domain terdaftar untuk allowlist pengalihan aman.'
  }
];

async function seedPartners() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('[SEED] Connected to Neon PostgreSQL database.');

  try {
    await client.query('BEGIN');

    const insertSql = `
      INSERT INTO ticketing_partners (
        id, name, slug, partner_type, official_domains, integration_type,
        status, country_code, supported_currency, affiliate_program_url,
        commission_config, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, $12, NOW(), NOW())
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        official_domains = EXCLUDED.official_domains,
        integration_type = EXCLUDED.integration_type,
        status = EXCLUDED.status,
        commission_config = EXCLUDED.commission_config,
        affiliate_program_url = EXCLUDED.affiliate_program_url,
        notes = EXCLUDED.notes,
        updated_at = NOW();
    `;

    for (const p of CANONICAL_PARTNERS) {
      await client.query(insertSql, [
        p.id,
        p.name,
        p.slug,
        p.partner_type,
        p.official_domains,
        p.integration_type,
        p.status,
        p.country_code,
        p.supported_currency,
        p.affiliate_program_url,
        p.commission_config,
        p.notes
      ]);
      console.log(`  ✓ Seeded partner: ${p.name} (${p.slug})`);
    }

    await client.query('COMMIT');
    console.log('[SEED] Transaction committed successfully.');

    const res = await client.query('SELECT count(*)::int as total FROM ticketing_partners;');
    console.log(`\n[VERIFICATION] Total ticketing_partners in database: ${res.rows[0].total}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Seeding failed, rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedPartners().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
