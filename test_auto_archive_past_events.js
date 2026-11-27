'use strict';
/**
 * Automated Daily Past-Event Archival Verification Suite (OFFLINE ONLY — ZERO SUPABASE ACCESS)
 *
 * Proves:
 * 1. vercel.json registers /api/cron/archive-past-events on schedule "5 17 * * *" (00:05 WIB daily).
 * 2. WIB midnight boundary (2026-11-28 kept on 2026-11-28, archived on 2026-11-29).
 * 3. PG–InMemory parity via a stateful SQL-evaluating PG test double (zero DELETE, transactional UPDATE,
 *    dateless NULL ignored, terminal reason preservation for DUPLICATE_MERGED/CANCELLED/COMPLETED,
 *    dry-run zero writes, idempotent second run, getArchivedEvents inclusion).
 * 4. Anti-resurrection parity on both InMemoryCatalogRepository and PostgresCatalogRepository.
 * 5. HTTP E2E for GET /api/cron/archive-past-events (503 unset/short secret, 401 missing/wrong Bearer,
 *    200 dryRun, 200 live run, immediate exclusion from GET /api/mvp/events, HTTP 400 EVENT_ALREADY_PASSED
 *    on POST /api/mvp/seller/listing, inclusion in GET /api/events/archived, and HTTP idempotency).
 */

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.TARGET_DATABASE_URL;
delete process.env.SUPABASE_DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;
delete process.env.NEON_DATABASE_URL;

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');

const policy = require('./src/discovery/CatalogHygienePolicy');
const { InMemoryCatalogRepository } = require('./src/discovery/repository/InMemoryCatalogRepository');
const { PostgresCatalogRepository } = require('./src/discovery/repository/PostgresCatalogRepository');
const { createCronRouter } = require('./src/api/cronRouter');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { state } = require('./src/database');
const { SessionStore } = require('./src/services/sessionStore');
const mvpRouter = require('./src/api/mvpRouter');
const discoveryRouter = require('./src/discovery/discoveryRouter');

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(0, 4).join('\n'));
    }
  }
}

/**
 * Stateful SQL-evaluating PG test double for canonical_events.
 * Rejects any DELETE statement immediately, supports transactional BEGIN/COMMIT/ROLLBACK,
 * and evaluates archivePastEvents SELECT/UPDATE and upsertCanonicalEvent anti-resurrection SQL.
 */
function createStatefulArchivePgDouble() {
  const rows = new Map();
  const queries = [];
  let txSnapshot = null;
  let txCount = 0;

  const parseMeta = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return {}; }
    }
    return { ...raw };
  };

  const getEffectiveDateWib = (row) => {
    if (row.start_date) return String(row.start_date).slice(0, 10);
    if (row.start_datetime) {
      const d = new Date(row.start_datetime);
      if (!Number.isNaN(d.getTime())) return policy.getTodayWibIso(d);
    }
    return null;
  };

  const parseQuotedList = (sqlFragment) => {
    const out = new Set();
    const re = /'([^']+)'/g;
    let m;
    while ((m = re.exec(sqlFragment)) !== null) out.add(m[1].toUpperCase());
    return out;
  };

  const evaluateArchivePredicate = (sql, todayWib, row) => {
    const eff = getEffectiveDateWib(row);
    if (!eff || !(eff < todayWib)) return false;

    const notInMatch = sql.match(/UPPER\(COALESCE\(lifecycle_status,\s*''\)\)\s+NOT\s+IN\s*\(([^)]+)\)/i);
    assert(notInMatch, 'Expected lifecycle_status NOT IN (...) predicate in SQL');
    const terminalList = parseQuotedList(notInMatch[1]);

    const archiveIsDistinct = String(row.archive_status || '') !== 'ARCHIVED';
    const pubVisTrue = row.public_visibility === true;
    const homeVisTrue = row.homepage_visibility === true;
    const lcNotTerminal = !terminalList.has(String(row.lifecycle_status || '').toUpperCase());
    return archiveIsDistinct || pubVisTrue || homeVisTrue || lcNotTerminal;
  };

  const resolveLifecycleFromSql = (sql, row) => {
    const preservedMatch = sql.match(/WHEN\s+UPPER\(COALESCE\(lifecycle_status,\s*''\)\)\s+IN\s*\(([^)]+)\)/i);
    assert(preservedMatch, 'Expected preserved terminal reason CASE in UPDATE SQL');
    const preserved = parseQuotedList(preservedMatch[1]);
    const lc = String(row.lifecycle_status || '').toUpperCase();
    const meta = parseMeta(row.metadata);
    const ms = String(meta.status || '').toUpperCase();
    if (preserved.has(lc)) return lc;
    if (preserved.has(ms)) return ms;
    if (meta.merged_into && String(meta.merged_into).trim() !== '') return 'DUPLICATE_MERGED';
    return 'PAST';
  };

  const runQuery = async (sql, params = []) => {
    const normalized = String(sql || '').replace(/\s+/g, ' ').trim();
    const upper = normalized.toUpperCase();
    queries.push({ sql: normalized, params });

    if (/\bDELETE\s+FROM\b/.test(upper)) {
      throw new Error('FK-safety violation: DELETE statement is forbidden in archivePastEvents');
    }

    if (upper === 'BEGIN') {
      txCount++;
      txSnapshot = new Map(Array.from(rows.entries(), ([k, v]) => [k, { ...v, metadata: parseMeta(v.metadata) }]));
      return { rowCount: 0, rows: [] };
    }
    if (upper === 'COMMIT') {
      txSnapshot = null;
      return { rowCount: 0, rows: [] };
    }
    if (upper === 'ROLLBACK') {
      if (txSnapshot) {
        rows.clear();
        for (const [k, v] of txSnapshot.entries()) rows.set(k, v);
        txSnapshot = null;
      }
      return { rowCount: 0, rows: [] };
    }

    // Dry-run SELECT for archivePastEvents
    if (upper.startsWith('SELECT') && upper.includes('FROM CANONICAL_EVENTS') && upper.includes('ARCHIVE_STATUS IS DISTINCT FROM')) {
      const todayWib = params[0];
      const matched = Array.from(rows.values())
        .filter(r => evaluateArchivePredicate(normalized, todayWib, r))
        .sort((a, b) => getEffectiveDateWib(a).localeCompare(getEffectiveDateWib(b)) || a.id.localeCompare(b.id));
      return { rowCount: matched.length, rows: matched.map(r => ({ ...r, metadata: parseMeta(r.metadata) })) };
    }

    // Live UPDATE for archivePastEvents
    if (upper.startsWith('UPDATE CANONICAL_EVENTS') && upper.includes('WIB_DATE_PASSED')) {
      const todayWib = params[0];
      const nowIso = new Date().toISOString();
      const updatedRows = [];
      for (const row of rows.values()) {
        if (!evaluateArchivePredicate(normalized, todayWib, row)) continue;
        const nextLifecycle = resolveLifecycleFromSql(normalized, row);
        const meta = parseMeta(row.metadata);
        const nextRow = {
          ...row,
          lifecycle_status: nextLifecycle,
          archive_status: 'ARCHIVED',
          archived_at: row.archived_at || nowIso,
          public_visibility: false,
          homepage_visibility: false,
          updated_at: nowIso,
          metadata: {
            ...meta,
            status: nextLifecycle,
            auto_archived_at: nowIso,
            auto_archive_reason: 'WIB_DATE_PASSED',
            source_updated_at: nowIso
          }
        };
        rows.set(row.id, nextRow);
        updatedRows.push({ ...nextRow, metadata: parseMeta(nextRow.metadata) });
      }
      updatedRows.sort((a, b) => getEffectiveDateWib(a).localeCompare(getEffectiveDateWib(b)) || a.id.localeCompare(b.id));
      return { rowCount: updatedRows.length, rows: updatedRows };
    }

    // getArchivedEvents SELECT
    if (upper.startsWith('SELECT') && upper.includes('FROM CANONICAL_EVENTS') && upper.includes("ARCHIVE_STATUS = 'ARCHIVED'")) {
      const matched = Array.from(rows.values())
        .filter(r => r.archive_status === 'ARCHIVED' || ['ARCHIVED', 'PAST'].includes(String(r.lifecycle_status || '').toUpperCase()))
        .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
      return { rowCount: matched.length, rows: matched.map(r => ({ ...r, metadata: parseMeta(r.metadata) })) };
    }

    // getUpcomingEvents SELECT
    if (upper.startsWith('SELECT') && upper.includes('FROM CANONICAL_EVENTS') && upper.includes('START_DATE >= $1')) {
      const todayWib = params[0];
      const terminal = new Set(policy.TERMINAL_STATUSES);
      const matched = Array.from(rows.values()).filter(r => {
        const meta = parseMeta(r.metadata);
        return !terminal.has(String(r.archive_status || '').toUpperCase()) &&
          !terminal.has(String(r.lifecycle_status || '').toUpperCase()) &&
          !terminal.has(String(meta.status || '').toUpperCase()) &&
          r.start_date && String(r.start_date).slice(0, 10) >= todayWib;
      });
      return { rowCount: matched.length, rows: matched.map(r => ({ ...r, metadata: parseMeta(r.metadata) })) };
    }

    // getEventById / getEventBySlug
    if (upper.startsWith('SELECT') && upper.includes('FROM CANONICAL_EVENTS') && upper.includes('WHERE ID = $1')) {
      const found = rows.get(params[0]);
      return found ? { rowCount: 1, rows: [{ ...found, metadata: parseMeta(found.metadata) }] } : { rowCount: 0, rows: [] };
    }
    if (upper.startsWith('SELECT') && upper.includes('FROM CANONICAL_EVENTS') && upper.includes('WHERE SLUG = $1')) {
      for (const r of rows.values()) {
        if (r.slug === params[0]) return { rowCount: 1, rows: [{ ...r, metadata: parseMeta(r.metadata) }] };
      }
      return { rowCount: 0, rows: [] };
    }

    // upsertCanonicalEvent INSERT ... ON CONFLICT DO UPDATE ... WHERE (...)
    if (upper.startsWith('INSERT INTO CANONICAL_EVENTS') && upper.includes('ON CONFLICT (ID) DO UPDATE')) {
      const id = params[0];
      const existing = rows.get(id);
      const incomingTs = params[30];
      const allowAdminOverride = params[31] === true;
      const terminal = new Set(policy.TERMINAL_STATUSES);

      if (existing) {
        const exMeta = parseMeta(existing.metadata);
        const isTerminal =
          terminal.has(String(existing.lifecycle_status || '').toUpperCase()) ||
          terminal.has(String(existing.archive_status || '').toUpperCase()) ||
          terminal.has(String(exMeta.status || '').toUpperCase());
        const existingMaxMs = Math.max(
          existing.updated_at ? Date.parse(existing.updated_at) : 0,
          exMeta.source_updated_at ? Date.parse(exMeta.source_updated_at) : 0
        );
        const incomingMs = incomingTs ? Date.parse(incomingTs) : null;
        const tsAllowed = incomingMs === null || existingMaxMs <= incomingMs;

        if (!allowAdminOverride && (isTerminal || !tsAllowed)) {
          return { rowCount: 0, rows: [] };
        }
      }

      const stored = {
        id,
        slug: params[1],
        canonical_name: params[2],
        event_type: params[3],
        category: params[4],
        start_date: params[5],
        start_datetime: params[6],
        end_date: params[7],
        end_datetime: params[8],
        timezone: params[9],
        venue_name: params[10],
        venue_city: params[11],
        city: params[12],
        province: params[13],
        country: params[14],
        organizer_name: params[15],
        official_event_url: params[16],
        official_ticket_url: params[17],
        official_ticketing_provider: params[18],
        min_price: params[19],
        max_price: params[20],
        is_verified: params[21],
        verification_status: params[22],
        lifecycle_status: params[23],
        archive_status: params[24],
        archived_at: params[25],
        public_visibility: params[26],
        homepage_visibility: params[27],
        metadata: parseMeta(params[28]),
        updated_at: incomingTs || new Date().toISOString(),
        created_at: existing?.created_at || new Date().toISOString()
      };
      rows.set(id, stored);
      return { rowCount: 1, rows: [{ ...stored, metadata: parseMeta(stored.metadata) }] };
    }

    throw new Error(`Unhandled SQL in PG double: ${normalized.slice(0, 140)}`);
  };

  return {
    rows,
    queries,
    getTxCount: () => txCount,
    seedRow(row) {
      const nowIso = new Date().toISOString();
      const stored = {
        id: row.id,
        slug: row.slug || row.id,
        canonical_name: row.canonical_name || row.title || row.name || row.id,
        event_type: row.event_type || 'CONCERT',
        category: row.category || 'CONCERT',
        start_date: row.start_date !== undefined ? row.start_date : '2027-01-15',
        start_datetime: row.start_datetime !== undefined ? row.start_datetime : null,
        end_date: row.end_date || null,
        end_datetime: row.end_datetime || null,
        timezone: row.timezone || 'Asia/Jakarta',
        venue_name: row.venue_name || 'GBK Main Stadium',
        venue_city: row.venue_city || 'Jakarta',
        city: row.city || 'Jakarta',
        province: row.province || 'DKI Jakarta',
        country: row.country || 'Indonesia',
        organizer_name: row.organizer_name || null,
        official_event_url: row.official_event_url || 'https://official.example/ev',
        official_ticket_url: row.official_ticket_url || 'https://official.example/ev/tickets',
        official_ticketing_provider: row.official_ticketing_provider || 'LOKET',
        min_price: row.min_price ?? 750000,
        max_price: row.max_price ?? 2000000,
        is_verified: row.is_verified !== false,
        verification_status: row.verification_status || 'PRIMARY_SOURCE_VERIFIED',
        lifecycle_status: row.lifecycle_status || 'UPCOMING',
        archive_status: row.archive_status || 'ACTIVE',
        archived_at: row.archived_at || null,
        public_visibility: row.public_visibility !== false,
        homepage_visibility: Boolean(row.homepage_visibility),
        metadata: parseMeta(row.metadata),
        created_at: row.created_at || nowIso,
        updated_at: row.updated_at || nowIso
      };
      rows.set(stored.id, stored);
      return stored;
    },
    query: runQuery,
    async connect() {
      return {
        query: runQuery,
        release() {}
      };
    }
  };
}

function createPgRepoWithDouble(pgDouble) {
  const repo = new PostgresCatalogRepository({ connectionString: 'postgres://offline-double', skipMigrations: true });
  repo.pool = pgDouble;
  repo.degraded = false;
  repo.initialized = true;
  return repo;
}

function httpReq(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ hostname: '127.0.0.1', port, path: reqPath, method, headers: reqHeaders }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

(async () => {
  await check('vercel.json registers /api/cron/archive-past-events on "5 17 * * *" (00:05 WIB) while preserving existing crons', () => {
    const raw = fs.readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf8');
    const cfg = JSON.parse(raw);
    assert(Array.isArray(cfg.crons), 'vercel.json crons must be an array');
    const entry = cfg.crons.find(c => c.path === '/api/cron/archive-past-events');
    assert(entry, 'Missing /api/cron/archive-past-events in vercel.json');
    assert.strictEqual(entry.schedule, '5 17 * * *');
    assert(cfg.crons.some(c => c.path === '/api/cron/catalog-refresh'), 'Existing catalog-refresh cron preserved');
  });

  await check('WIB midnight boundary: 2026-11-28 stays active on 2026-11-28 and archives to PAST/ARCHIVED on 2026-11-29 (InMemory + PG parity)', async () => {
    const memRepo = new InMemoryCatalogRepository();
    const pgDouble = createStatefulArchivePgDouble();
    const pgRepo = createPgRepoWithDouble(pgDouble);

    const row = {
      id: 'ev-wib-boundary',
      slug: 'ev-wib-boundary',
      canonical_name: 'WIB Boundary Concert',
      start_date: '2026-11-28',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      public_visibility: true,
      homepage_visibility: true,
      metadata: { status: 'UPCOMING' }
    };
    memRepo.events.set(row.id, { ...row, metadata: { ...row.metadata } });
    pgDouble.seedRow(row);

    const sameDayMem = await memRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });
    const sameDayPg = await pgRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });
    assert.strictEqual(sameDayMem.archivedCount, 0);
    assert.strictEqual(sameDayPg.archivedCount, 0);
    assert.strictEqual((await memRepo.getEventById('ev-wib-boundary')).lifecycle_status, 'UPCOMING');
    assert.strictEqual(pgDouble.rows.get('ev-wib-boundary').lifecycle_status, 'UPCOMING');

    const nextDayMem = await memRepo.archivePastEvents({ todayWib: '2026-11-29', dryRun: false });
    const nextDayPg = await pgRepo.archivePastEvents({ todayWib: '2026-11-29', dryRun: false });
    assert.strictEqual(nextDayMem.archivedCount, 1);
    assert.strictEqual(nextDayPg.archivedCount, 1);
    assert.deepStrictEqual(nextDayMem.archivedIds, ['ev-wib-boundary']);
    assert.deepStrictEqual(nextDayPg.archivedIds, ['ev-wib-boundary']);

    const memAfter = await memRepo.getEventById('ev-wib-boundary');
    const pgAfter = pgDouble.rows.get('ev-wib-boundary');
    for (const r of [memAfter, pgAfter]) {
      assert.strictEqual(r.lifecycle_status, 'PAST');
      assert.strictEqual(r.archive_status, 'ARCHIVED');
      assert.strictEqual(r.public_visibility, false);
      assert.strictEqual(r.homepage_visibility, false);
      assert.strictEqual(r.metadata.status, 'PAST');
      assert.strictEqual(r.metadata.auto_archive_reason, 'WIB_DATE_PASSED');
      assert(Boolean(r.metadata.auto_archived_at));
      assert(Boolean(r.metadata.source_updated_at));
      assert(Boolean(r.archived_at));
    }
  });

  await check('PG–InMemory parity: dry-run zero writes, live archive, dateless NULL ignored, terminal reasons preserved, zero DELETE, idempotency, getArchivedEvents', async () => {
    const memRepo = new InMemoryCatalogRepository();
    const pgDouble = createStatefulArchivePgDouble();
    const pgRepo = createPgRepoWithDouble(pgDouble);

    const fixtures = [
      { id: 'ev-past-active', start_date: '2026-11-27', lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: true, metadata: { status: 'UPCOMING' } },
      // 2026-11-27T16:59:59Z === 2026-11-27 23:59:59 WIB (< 2026-11-28)
      { id: 'ev-past-ts-only', start_date: null, start_datetime: '2026-11-27T16:59:59.000Z', lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: false, metadata: { status: 'UPCOMING' } },
      { id: 'ev-upcoming-today', start_date: '2026-11-28', lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: true, metadata: { status: 'UPCOMING' } },
      { id: 'ev-upcoming-future', start_date: '2027-01-16', lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: true, metadata: { status: 'UPCOMING' } },
      { id: 'ev-dateless-null', start_date: null, start_datetime: null, lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: false, metadata: { status: 'UPCOMING' } },
      { id: 'ev-past-cancelled', start_date: '2026-11-10', lifecycle_status: 'CANCELLED', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: false, metadata: { status: 'CANCELLED' } },
      { id: 'ev-past-merged', start_date: '2026-11-12', lifecycle_status: 'DUPLICATE_MERGED', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: false, metadata: { status: 'DUPLICATE_MERGED', merged_into: 'ev-upcoming-future' } },
      { id: 'ev-past-completed', start_date: '2026-11-15', lifecycle_status: 'COMPLETED', archive_status: 'ACTIVE', public_visibility: true, homepage_visibility: false, metadata: { status: 'COMPLETED' } },
      { id: 'ev-already-archived', start_date: '2026-10-01', lifecycle_status: 'PAST', archive_status: 'ARCHIVED', public_visibility: false, homepage_visibility: false, metadata: { status: 'PAST' } }
    ];

    for (const f of fixtures) {
      memRepo.events.set(f.id, { ...f, slug: f.id, canonical_name: f.id, metadata: { ...f.metadata } });
      pgDouble.seedRow(f);
    }

    const expectedCandidates = [
      'ev-past-cancelled',
      'ev-past-merged',
      'ev-past-completed',
      'ev-past-active',
      'ev-past-ts-only'
    ];

    // 1. Dry-run: zero writes
    const dryMem = await memRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: true });
    const dryPg = await pgRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: true });
    assert.strictEqual(dryMem.dryRun, true);
    assert.strictEqual(dryPg.dryRun, true);
    assert.strictEqual(dryMem.archivedCount, 0);
    assert.strictEqual(dryPg.archivedCount, 0);
    assert.deepStrictEqual(dryMem.candidateIds, expectedCandidates);
    assert.deepStrictEqual(dryPg.candidateIds, expectedCandidates);
    assert.strictEqual(pgDouble.getTxCount(), 0, 'Dry-run must not open write transaction');
    assert.strictEqual((await memRepo.getEventById('ev-past-active')).lifecycle_status, 'UPCOMING');
    assert.strictEqual(pgDouble.rows.get('ev-past-active').lifecycle_status, 'UPCOMING');

    // 2. Live run: atomic UPDATE
    const liveMem = await memRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });
    const livePg = await pgRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });
    assert.strictEqual(liveMem.archivedCount, 5);
    assert.strictEqual(livePg.archivedCount, 5);
    assert.deepStrictEqual(liveMem.archivedIds, expectedCandidates);
    assert.deepStrictEqual(livePg.archivedIds, expectedCandidates);
    assert.strictEqual(pgDouble.getTxCount(), 1, 'Live run executes inside a transaction');
    assert(pgDouble.queries.every(q => !/\bDELETE\s+FROM\b/i.test(q.sql)), 'Zero DELETE SQL allowed');

    // Verify exact field parity on all 9 rows
    for (const [id, expectedLc, expectedArch, expectedPub] of [
      ['ev-past-active', 'PAST', 'ARCHIVED', false],
      ['ev-past-ts-only', 'PAST', 'ARCHIVED', false],
      ['ev-upcoming-today', 'UPCOMING', 'ACTIVE', true],
      ['ev-upcoming-future', 'UPCOMING', 'ACTIVE', true],
      ['ev-dateless-null', 'UPCOMING', 'ACTIVE', true],
      ['ev-past-cancelled', 'CANCELLED', 'ARCHIVED', false],
      ['ev-past-merged', 'DUPLICATE_MERGED', 'ARCHIVED', false],
      ['ev-past-completed', 'COMPLETED', 'ARCHIVED', false],
      ['ev-already-archived', 'PAST', 'ARCHIVED', false]
    ]) {
      const mRow = await memRepo.getEventById(id);
      const pRow = pgDouble.rows.get(id);
      for (const [label, r] of [['InMemory', mRow], ['Postgres', pRow]]) {
        assert.strictEqual(r.lifecycle_status, expectedLc, `${label} ${id} lifecycle_status`);
        assert.strictEqual(r.archive_status, expectedArch, `${label} ${id} archive_status`);
        assert.strictEqual(r.public_visibility, expectedPub, `${label} ${id} public_visibility`);
        if (!expectedPub) {
          assert.strictEqual(r.homepage_visibility, false, `${label} ${id} homepage_visibility`);
          assert.strictEqual(r.metadata.status, expectedLc, `${label} ${id} metadata.status preserved`);
        }
      }
    }

    // 3. Idempotent second run on same todayWib
    const secondMem = await memRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });
    const secondPg = await pgRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });
    assert.strictEqual(secondMem.archivedCount, 0);
    assert.strictEqual(secondPg.archivedCount, 0);
    assert.deepStrictEqual(secondMem.archivedIds, []);
    assert.deepStrictEqual(secondPg.archivedIds, []);

    // 4. getArchivedEvents includes auto-archived PAST row; getUpcomingEvents excludes it
    const memArchivedIds = new Set((await memRepo.getArchivedEvents()).map(e => e.id));
    const pgArchivedIds = new Set((await pgRepo.getArchivedEvents()).map(e => e.id));
    assert(memArchivedIds.has('ev-past-active'), 'InMemory getArchivedEvents includes PAST row');
    assert(pgArchivedIds.has('ev-past-active'), 'Postgres getArchivedEvents includes PAST row');

    const refNow = new Date('2026-11-28T05:00:00+07:00');
    const memUpcomingIds = new Set((await memRepo.getUpcomingEvents(refNow)).map(e => e.id));
    const pgUpcomingIds = new Set((await pgRepo.getUpcomingEvents(refNow)).map(e => e.id));
    assert(!memUpcomingIds.has('ev-past-active'));
    assert(!pgUpcomingIds.has('ev-past-active'));
    assert(memUpcomingIds.has('ev-upcoming-today'));
    assert(pgUpcomingIds.has('ev-upcoming-today'));
  });

  await check('Anti-resurrection parity: upsertCanonicalEvent cannot resurrect an auto-archived PAST row in InMemory or Postgres', async () => {
    const memRepo = new InMemoryCatalogRepository();
    const pgDouble = createStatefulArchivePgDouble();
    const pgRepo = createPgRepoWithDouble(pgDouble);

    const row = {
      id: 'ev-no-resurrect',
      slug: 'ev-no-resurrect',
      canonical_name: 'Concluded Concert',
      start_date: '2026-11-20',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      public_visibility: true,
      homepage_visibility: true,
      metadata: { status: 'UPCOMING' }
    };
    memRepo.events.set(row.id, { ...row, metadata: { ...row.metadata } });
    pgDouble.seedRow(row);

    await memRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });
    await pgRepo.archivePastEvents({ todayWib: '2026-11-28', dryRun: false });

    const resurrectPayload = {
      id: 'ev-no-resurrect',
      slug: 'ev-no-resurrect',
      canonical_name: 'Concluded Concert (Stale Seed)',
      start_date: '2026-11-20',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      status: 'UPCOMING',
      public_visibility: true,
      homepage_visibility: true,
      source_updated_at: '2026-11-29T00:00:00.000Z',
      metadata: { status: 'UPCOMING', source_updated_at: '2026-11-29T00:00:00.000Z' }
    };

    const memRes = await memRepo.upsertCanonicalEvent(resurrectPayload);
    const pgRes = await pgRepo.upsertCanonicalEvent(resurrectPayload);

    for (const [label, r] of [['InMemory', memRes], ['Postgres', pgRes]]) {
      assert.strictEqual(r.lifecycle_status, 'PAST', `${label} stayed PAST`);
      assert.strictEqual(r.archive_status, 'ARCHIVED', `${label} stayed ARCHIVED`);
      assert.strictEqual(r.public_visibility, false, `${label} stayed hidden`);
      assert.strictEqual(r.homepage_visibility, false, `${label} stayed off homepage`);
    }
  });

  await check('HTTP E2E GET /api/cron/archive-past-events: 503 unset/short secret, 401 bad/missing auth, 200 dryRun & live, excludes from /api/mvp/events, blocks listing with 400 EVENT_ALREADY_PASSED, surfaces in /api/events/archived', async () => {
    const savedSecret = process.env.CRON_SECRET;
    const origRegistryHydrated = canonicalRegistry._hydratedFromRepo;
    const origRegistryEntries = Array.from(canonicalRegistry.events.entries());
    const origStateEvents = [...(state.events || [])];
    const origUsers = [...(state.users || [])];
    const origProfiles = [...(state.seller_profiles || [])];

    canonicalRegistry._hydratedFromRepo = true;
    const repo = new InMemoryCatalogRepository();
    await repo.init();

    const sellerId = 'seller-auto-archive-e2e';
    state.users.push({
      id: sellerId,
      email: 'seller.archive.e2e@tikum.test',
      name: 'Archive E2E Seller',
      display_name: 'Archive E2E Seller',
      phone: '+6281234567892',
      role: 'SELLER',
      status: 'ACTIVE',
      email_verified: true,
      metadata: {
        email_verified: true,
        email_verified_at: '2026-11-01T00:00:00.000Z',
        full_name: 'Archive E2E Seller',
        whatsapp: '+6281234567892',
        address: 'Jl. Sudirman, Jakarta',
        city: 'Jakarta',
        payout_bank_name: 'BCA',
        payout_account_number: '1122334455',
        identity_doc_ref: 'KTP-ARCHIVE-E2E'
      }
    });
    if (!state.seller_profiles) state.seller_profiles = [];
    state.seller_profiles.push({
      user_id: sellerId,
      kyc_status: 'VERIFIED',
      status: 'ACTIVE',
      suspended: false,
      payout_bank: 'BCA',
      payout_account_masked: '******4455',
      nik_hash: 'sha256-archive-e2e-nik',
      active_listing_limit: 20
    });
    const session = SessionStore.createSession({ userId: sellerId, role: 'SELLER' });
    if (!state.sessions) state.sessions = [];
    state.sessions.push(session);

    const verifiedBase = {
      is_verified: true,
      verification_status: 'PRIMARY_SOURCE_VERIFIED',
      public_visibility: true,
      homepage_visibility: true,
      min_price: 750000,
      max_price: 2000000,
      lowest_official_price: 750000,
      price_status: 'QUALIFIED',
      source_url: 'https://official.example/archive-e2e',
      official_event_url: 'https://official.example/archive-e2e',
      official_ticket_url: 'https://official.example/archive-e2e/tickets',
      evidence_hash: 'sha256-archive-e2e',
      verified_at: '2026-11-20T00:00:00.000Z',
      city: 'Jakarta',
      venue_city: 'Jakarta',
      venue: 'GBK Main Stadium',
      venue_name: 'GBK Main Stadium',
      country: 'Indonesia',
      category: 'CONCERT',
      event_type: 'CONCERT',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      metadata: { status: 'UPCOMING' }
    };

    const pastEv = {
      ...verifiedBase,
      id: 'ev-cron-past-1',
      event_id: 'ev-cron-past-1',
      slug: 'ev-cron-past-1',
      title: 'Expired Yesterday Concert',
      name: 'Expired Yesterday Concert',
      canonical_name: 'Expired Yesterday Concert',
      start_date: '2026-11-27',
      date: '2026-11-27'
    };
    const upcomingEv = {
      ...verifiedBase,
      id: 'ev-cron-upcoming-1',
      event_id: 'ev-cron-upcoming-1',
      slug: 'ev-cron-upcoming-1',
      title: 'Active Future Concert',
      name: 'Active Future Concert',
      canonical_name: 'Active Future Concert',
      start_date: '2099-01-16',
      date: '2099-01-16'
    };

    canonicalRegistry.events.clear();
    state.events.length = 0;
    for (const ev of [pastEv, upcomingEv]) {
      repo.events.set(ev.id, { ...ev, metadata: { ...ev.metadata } });
      canonicalRegistry.events.set(ev.id, { ...ev, metadata: { ...ev.metadata } });
      state.events.push({ ...ev, metadata: { ...ev.metadata } });
    }

    const cronRouter = createCronRouter({
      getRepository: () => repo,
      getTodayWib: () => '2026-11-28'
    });

    const app = express();
    app.use(express.json());
    app.use('/api/cron', cronRouter);
    app.use('/api/mvp', mvpRouter);
    app.use(discoveryRouter);

    const server = await new Promise(resolve => {
      const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const port = server.address().port;

    try {
      // 1. Missing CRON_SECRET -> 503
      delete process.env.CRON_SECRET;
      const resUnset = await httpReq(port, 'GET', '/api/cron/archive-past-events');
      assert.strictEqual(resUnset.status, 503);
      assert.strictEqual(resUnset.json?.ok, false);
      assert.strictEqual(resUnset.json?.code, 'CRON_SECRET_NOT_CONFIGURED');
      assert.strictEqual((await repo.getEventById('ev-cron-past-1')).lifecycle_status, 'UPCOMING');

      // 2. Short (<16 chars) CRON_SECRET -> 503
      process.env.CRON_SECRET = 'too-short';
      const resShort = await httpReq(port, 'GET', '/api/cron/archive-past-events', {
        headers: { authorization: 'Bearer too-short' }
      });
      assert.strictEqual(resShort.status, 503);
      assert.strictEqual(resShort.json?.code, 'CRON_SECRET_NOT_CONFIGURED');

      // 3. Configure valid >=16-char secret; missing header -> 401
      const validSecret = 'tikum-test-cron-secret-2026-32chars';
      process.env.CRON_SECRET = validSecret;
      const resNoAuth = await httpReq(port, 'GET', '/api/cron/archive-past-events');
      assert.strictEqual(resNoAuth.status, 401);
      assert.strictEqual(resNoAuth.json?.ok, false);
      assert.strictEqual(resNoAuth.json?.code, 'UNAUTHORIZED');

      // 4. Wrong Bearer secret -> 401
      const resBadAuth = await httpReq(port, 'GET', '/api/cron/archive-past-events', {
        headers: { authorization: 'Bearer wrong-secret-value-not-matching-000' }
      });
      assert.strictEqual(resBadAuth.status, 401);
      assert.strictEqual(resBadAuth.json?.code, 'UNAUTHORIZED');
      assert.strictEqual((await repo.getEventById('ev-cron-past-1')).lifecycle_status, 'UPCOMING');

      // 5. Valid Bearer with ?dryRun=true -> 200, 0 writes
      const resDry = await httpReq(port, 'GET', '/api/cron/archive-past-events?dryRun=true', {
        headers: { authorization: `Bearer ${validSecret}` }
      });
      assert.strictEqual(resDry.status, 200);
      assert.strictEqual(resDry.json?.ok, true);
      assert.strictEqual(resDry.json?.dryRun, true);
      assert.strictEqual(resDry.json?.todayWib, '2026-11-28');
      assert.strictEqual(resDry.json?.candidateCount, 1);
      assert.deepStrictEqual(resDry.json?.candidateIds, ['ev-cron-past-1']);
      assert.strictEqual(resDry.json?.archivedCount, 0);
      assert.strictEqual((await repo.getEventById('ev-cron-past-1')).lifecycle_status, 'UPCOMING');

      // 6. Valid Bearer live run -> 200, archives ev-cron-past-1
      const resLive = await httpReq(port, 'GET', '/api/cron/archive-past-events', {
        headers: { authorization: `Bearer ${validSecret}` }
      });
      assert.strictEqual(resLive.status, 200);
      assert.strictEqual(resLive.json?.ok, true);
      assert.strictEqual(resLive.json?.dryRun, false);
      assert.strictEqual(resLive.json?.todayWib, '2026-11-28');
      assert.strictEqual(resLive.json?.archivedCount, 1);
      assert.deepStrictEqual(resLive.json?.archivedIds, ['ev-cron-past-1']);
      assert.strictEqual(typeof resLive.json?.durationMs, 'number');

      // 7. GET /api/mvp/events excludes newly archived event & keeps upcoming event
      const mvpRes = await httpReq(port, 'GET', '/api/mvp/events');
      assert.strictEqual(mvpRes.status, 200);
      const activeIds = new Set((mvpRes.json?.events || []).map(e => e.id));
      assert.strictEqual(activeIds.has('ev-cron-past-1'), false, 'Archived event must be excluded from /api/mvp/events');
      assert.strictEqual(activeIds.has('ev-cron-upcoming-1'), true, 'Upcoming event must remain in /api/mvp/events');

      // 8. POST /api/mvp/seller/listing rejects newly archived event with HTTP 400 EVENT_ALREADY_PASSED
      const listRes = await httpReq(port, 'POST', '/api/mvp/seller/listing', {
        headers: { authorization: `Bearer ${session.session_token}`, 'x-user-id': sellerId },
        body: {
          eventId: 'ev-cron-past-1',
          seatInfo: 'CAT 1',
          faceValue: 750000,
          price: 750000,
          rawBarcode: `BC-ARCHIVE-E2E-${Date.now()}`,
          quantity: 1,
          fulfillmentType: 'SELLER_MANAGED'
        }
      });
      assert.strictEqual(listRes.status, 400, `Expected HTTP 400, got ${listRes.status}`);
      assert.strictEqual(listRes.json?.code, 'EVENT_ALREADY_PASSED');

      // 9. GET /api/events/archived surfaces the newly archived PAST event
      const archRes = await httpReq(port, 'GET', '/api/events/archived');
      assert.strictEqual(archRes.status, 200);
      const archivedEv = (archRes.json?.events || []).find(e => e.id === 'ev-cron-past-1');
      assert(archivedEv, 'Newly archived event must appear in GET /api/events/archived');
      assert.strictEqual(archivedEv.is_past, true);
      assert.strictEqual(archivedEv.resale_available, false);

      // 10. Second live cron call is idempotent -> archivedCount === 0
      const resSecond = await httpReq(port, 'GET', '/api/cron/archive-past-events', {
        headers: { authorization: `Bearer ${validSecret}` }
      });
      assert.strictEqual(resSecond.status, 200);
      assert.strictEqual(resSecond.json?.archivedCount, 0);
      assert.deepStrictEqual(resSecond.json?.archivedIds, []);
    } finally {
      await new Promise(resolve => server.close(resolve));
      if (savedSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = savedSecret;
      canonicalRegistry._hydratedFromRepo = origRegistryHydrated;
      canonicalRegistry.events.clear();
      for (const [k, v] of origRegistryEntries) canonicalRegistry.events.set(k, v);
      state.events.length = 0;
      state.events.push(...origStateEvents);
      state.users.length = 0;
      state.users.push(...origUsers);
      state.seller_profiles.length = 0;
      state.seller_profiles.push(...origProfiles);
    }
  });

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
