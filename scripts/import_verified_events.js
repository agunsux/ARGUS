'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hygiene = require('../src/discovery/CatalogHygienePolicy');
const { EventDeduplicationService } = require('../src/discovery/EventDeduplicationService');
const { EventVisualProvenanceService } = require('../src/discovery/EventVisualProvenanceService');
const { OFFICIAL_MIN_TICKET_PRICE } = require('../src/discovery/CuratedCatalogPolicy');

const publicDir = path.resolve(__dirname, '../public');
const categories = new Set(['SPORTS', 'COMEDY', 'CONCERT', 'FESTIVAL', 'THEATER', 'KPOP']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = value => typeof value === 'string' ? value.trim() : '';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validText = value => value.length > 0 && value.length <= 200 && !/[<>"\u0000-\u001f]/u.test(value);

function httpsUrl(value) {
  if (!/^https:\/\/[a-z0-9.-]+(?:\/[^\s"'<>\\]*)?$/i.test(text(value))) return null;
  try {
    const url = new URL(value);
    return url.hostname.includes('.') && /[a-z]/i.test(url.hostname.split('.').at(-1)) ? url : null;
  } catch (_) { return null; }
}

function normalize({ raw, trustedHosts, todayWib, now }) {
  const id = text(raw?.id), slug = text(raw?.slug) || id;
  const canonical_name = text(raw?.canonical_name), venue_name = text(raw?.venue), city = text(raw?.city);
  const category = hygiene.normalizeCategory(text(raw?.category));
  const start_date = text(raw?.start_date);
  const parsed = new Date(`${start_date}T00:00:00Z`);
  if (![id, slug].every(s => s.length <= 64 && slugPattern.test(s))) throw new Error('INVALID_ID_OR_SLUG');
  if (![canonical_name, city, venue_name].every(validText)) throw new Error('NAME_VENUE_CITY_REQUIRED');
  if (!categories.has(category)) throw new Error('INVALID_CATEGORY');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0, 10) !== start_date || start_date < todayWib) throw new Error('INVALID_OR_PAST_WIB_DATE');

  const source = httpsUrl(raw.source_url);
  const proof = raw.provenance;
  if (!source || source.pathname === '/' || !trustedHosts.has(source.hostname) ||
      !['PROMOTER', 'OFFICIAL_TICKETING'].includes(proof?.type) || !validText(text(proof?.reviewer)) ||
      !/^[a-f0-9]{64}$/i.test(text(proof?.evidence_sha256)) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text(proof?.verified_at)) ||
      !Number.isFinite(Date.parse(proof.verified_at)) || Date.parse(proof.verified_at) > +now ||
      new Date(proof.verified_at).toISOString().replace('.000Z', 'Z') !== proof.verified_at) throw new Error('OFFICIAL_PROVENANCE_REQUIRED');
  if (!Number.isSafeInteger(raw.min_price) || raw.min_price < OFFICIAL_MIN_TICKET_PRICE) throw new Error('OFFICIAL_PRICE_BELOW_MINIMUM_OR_MISSING');

  const source_url = source.href;
  const event = { id, slug, canonical_name, venue_name, city, category, start_date, min_price: raw.min_price,
    source_url, official_event_url: source_url, ...(proof.type === 'OFFICIAL_TICKETING' ? { official_ticket_url: source_url } : {}),
    status: 'UPCOMING', lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', is_verified: true,
    verification_status: 'PRIMARY_SOURCE_VERIFIED', public_visibility: true, homepage_visibility: true };
  const poster = raw.poster_url === undefined ? null : text(raw.poster_url);
  if (poster !== null) {
    const local = poster === `/assets/posters/${id}.svg` || /^\/images\/events\/[a-z0-9][a-z0-9-]*\.svg$/i.test(poster);
    if (local ? !fs.statSync(path.join(publicDir, poster), { throwIfNoEntry: false })?.isFile() : !httpsUrl(poster)) {
      throw new Error('INVALID_OR_MISSING_POSTER');
    }
    event.image_url = poster;
    event.poster_url = poster;
  }
  const fallback = EventVisualProvenanceService.generateBrandedPosterSvg(event);
  if (!fallback.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') || !fallback.includes('background:#0f172a') ||
      !fallback.endsWith('</svg>')) throw new Error('DARK_POSTER_FALLBACK_INVALID');
  event.metadata = { source_url, verified_at: proof.verified_at, evidence_hash: proof.evidence_sha256.toLowerCase(),
    provenance: { type: proof.type, reviewer: text(proof.reviewer), official_source: source_url },
    ...(poster ? { image_url: poster, poster_url: poster } : {}) };
  if (!hygiene.isEligibleForActiveResale(event, todayWib)) throw new Error('CATALOG_POLICY_EXCLUDES_EVENT');
  event.metadata.verified_import_fingerprint = hash(event);
  return event;
}

function validateInput(raw, { now = new Date(), trustedHosts = new Set() } = {}) {
  const todayWib = hygiene.getTodayWibIso(now);
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new Error('EXPECTED_1_TO_100_EVENTS');
  const entries = [], results = [];
  for (const [index, item] of raw.entries()) {
    try { entries.push({ index, event: normalize({ raw: item, trustedHosts, todayWib, now }) }); }
    catch (error) { results.push({ index, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'INVALID_EVENT' }); }
  }
  return { todayWib, entries, results };
}

async function planImport({ todayWib, entries, results: preliminary }, repository) {
  const results = [...preliminary], inserts = [];
  if (results.length) return { ok: false, todayWib, results, inserts };
  const existing = await repository.getAllEvents();
  const seen = new Set();
  for (const { index, event } of entries) {
    const key1 = `id:${event.id}`, key2 = `slug:${event.slug}`;
    const repeated = seen.has(key1) || seen.has(key2);
    seen.add(key1); seen.add(key2);
    const collisions = existing.filter(row => (row.id || row.event_id) === event.id || row.slug === event.slug);
    let code;
    if (repeated) code = 'BATCH_ID_OR_SLUG_COLLISION';
    else if (collisions.some(hygiene.isTerminalEvent)) code = 'TERMINAL_ID_OR_SLUG_COLLISION';
    else if (collisions.length === 1 && (collisions[0].id || collisions[0].event_id) === event.id &&
      collisions[0].metadata?.verified_import_fingerprint === event.metadata.verified_import_fingerprint) code = 'UNCHANGED';
    else if (collisions.length) code = 'ID_OR_SLUG_COLLISION';
    else if (EventDeduplicationService.findDuplicateCandidate(event, [...existing, ...inserts].filter(row =>
      !hygiene.isTerminalEvent(row) && hygiene.getEffectiveEventDateWib(row) === event.start_date)).isMatch) code = 'DUPLICATE_EVENT';
    else { code = 'INSERT'; inserts.push(event); }
    results.push({ index, id: event.id, code, poster: event.poster_url || `/api/discovery/events/${event.id}/poster.svg` });
  }
  return { ok: results.every(r => ['INSERT', 'UNCHANGED'].includes(r.code)), todayWib, results, inserts };
}

async function runWithDatabase(input, connectionString, apply) {
  const { Pool } = require('pg');
  const { PostgresCatalogRepository } = require('../src/discovery/repository/PostgresCatalogRepository');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  let client;
  try {
    client = await pool.connect();
    await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    if (apply) await client.query('LOCK TABLE canonical_events IN SHARE ROW EXCLUSIVE MODE');
    const repo = new PostgresCatalogRepository({ connectionString, skipMigrations: true });
    repo.pool = client;
    // Never let an operational import silently read/write the in-memory fallback.
    repo.fallbackRepo = new Proxy({}, { get: () => () => { throw new Error('CATALOG_DATABASE_OPERATION_FAILED'); } });
    const plan = await planImport(input, repo);
    if (plan.ok && apply) {
      if (input.todayWib !== hygiene.getTodayWibIso()) throw new Error('WIB_DAY_CHANGED_RETRY');
      // Strict upserts neither mask SQL failures nor mirror uncommitted writes.
      for (const event of plan.inserts) {
        const row = await repo.upsertCanonicalEvent(event, { strict: true });
        if (row?.id !== event.id || row.metadata?.verified_import_fingerprint !== event.metadata.verified_import_fingerprint) {
          throw new Error('CATALOG_UPSERT_NOT_CONFIRMED');
        }
      }
    }
    await client.query(plan.ok && apply ? 'COMMIT' : 'ROLLBACK');
    return plan;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

async function main([file, ...flags]) {
  const apply = flags.includes('--apply');
  const offline = flags.includes('--offline');
  if (!file || file.startsWith('-') || new Set(flags).size !== flags.length || flags.some(f =>
    !['--apply', '--dry-run', '--confirm-verified-provenance', '--offline'].includes(f)) ||
    apply !== flags.includes('--confirm-verified-provenance') || (apply && (offline || flags.includes('--dry-run')))) throw new Error('INVALID_USAGE');
  const trustedHosts = new Set((process.env.VERIFIED_EVENT_SOURCE_HOSTS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean));
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('INPUT_TOO_LARGE');
  const input = validateInput(JSON.parse(fs.readFileSync(file, 'utf8')), { trustedHosts });
  const connectionString = process.env.VERIFIED_EVENT_DATABASE_URL;
  const mode = apply ? 'apply' : 'dry-run';
  let plan;
  if (input.results.length) plan = { ok: false, ...input, inserts: [] };
  else if (offline) {
    const { InMemoryCatalogRepository } = require('../src/discovery/repository/InMemoryCatalogRepository');
    plan = await planImport(input, new InMemoryCatalogRepository());
  } else if (connectionString) plan = await runWithDatabase(input, connectionString, apply);
  else throw new Error('EXPLICIT_IMPORT_DATABASE_URL_REQUIRED_OR_USE_OFFLINE');
  console.log(JSON.stringify({ mode, offline, ok: plan.ok, todayWib: plan.todayWib,
    writes: apply && plan.ok ? plan.inserts.length : 0, results: plan.results }, null, 2));
  if (!plan.ok) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'VERIFIED_EVENT_IMPORT_FAILED');
  process.exitCode = 1;
});
module.exports = { validateInput, planImport };