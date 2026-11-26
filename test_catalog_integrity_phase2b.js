'use strict';
/**
 * Phase 2B Catalog Integrity Verification Suite (OFFLINE ONLY — ZERO SUPABASE ACCESS)
 *
 * Covers:
 * 1. Real HTTP E2E — POST /api/mvp/seller/listing (HTTP 400 EVENT_ALREADY_PASSED, NOT 500),
 *    valid upcoming listing allowed, MIN_LISTING_PRICE_IDR = 500000 preserved, and
 *    GET /api/mvp/events + GET /events hygiene & distinct-venue/session preservation.
 * 2. 6-Scenario Anti-Resurrection & PG–InMemory Parity Matrix (using a stateful SQL-evaluating PG test double).
 * 3. Script & Marketplace Repository Guard Checks (seed_canonical_catalog.js,
 *    reconcile_zero_wrong_date_events.js direct UPDATE + upsert, PostgresMarketplaceRepository.js:312).
 */

// Strictly isolate from any external DB / Supabase credentials before loading app modules.
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
const { EventIngestionScheduler } = require('./src/discovery/EventIngestionScheduler');
const { PostgresMarketplaceRepository } = require('./src/storage/PostgresMarketplaceRepository');
const { reconcileDatabase } = require('./scripts/reconcile_zero_wrong_date_events');

const ACTIVE_STATUSES = ['ACTIVE', 'LIVE', 'UPCOMING', 'PUBLISHED'];
const TERMINAL_SET = new Set(policy.TERMINAL_STATUSES);

let totalPassed = 0;
let totalFailed = 0;

async function runCheck(name, fn) {
  try {
    await fn();
    totalPassed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    totalFailed++;
    console.error(`FAIL ${name}: ${err.message}`);
    if (err.stack) {
      const topLines = err.stack.split('\n').slice(0, 4).join('\n');
      console.error(topLines);
    }
  }
}

/**
 * Stateful SQL-evaluating PostgreSQL test double for canonical_events.
 * Evaluates real parameterized INSERT ... ON CONFLICT DO UPDATE ... WHERE (...)
 * and direct UPDATE ... WHERE (...) predicates against an in-memory table.
 */
function createStatefulPgDouble(options = {}) {
  const rows = new Map();
  const queries = [];
  const asyncTick = Boolean(options.asyncTick);
  let forceNextSelectMissForId = null;

  const parseMeta = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return {}; }
    }
    return { ...raw };
  };

  const getRowStatusUpper = (row, field) => {
    if (!row) return '';
    if (field === 'meta_status') {
      const m = parseMeta(row.metadata);
      return String(m.status || '').toUpperCase();
    }
    return String(row[field] || '').toUpperCase();
  };

  const parseNotInList = (inExpr) => {
    const out = new Set();
    const re = /'([^']+)'/g;
    let m;
    while ((m = re.exec(inExpr)) !== null) out.add(m[1].toUpperCase());
    return out;
  };

  const evaluateSqlTerminalNotIn = (sql, existingRow) => {
    const upperSql = sql.toUpperCase();
    // Extract the WHERE clause after ON CONFLICT ... DO UPDATE SET or UPDATE ... SET
    const whereIdx = upperSql.lastIndexOf('WHERE ');
    if (whereIdx === -1) return true;
    const whereClause = upperSql.slice(whereIdx);

    // Dynamically parse and evaluate every UPPER(COALESCE(<col>, '')) NOT IN (<list>) predicate in the SQL
    const checks = [
      { re: /UPPER\(COALESCE\([^)]*LIFECYCLE_STATUS[^)]*\)\)\s+NOT\s+IN\s*\(([^)]+)\)/, field: 'lifecycle_status' },
      { re: /UPPER\(COALESCE\([^)]*ARCHIVE_STATUS[^)]*\)\)\s+NOT\s+IN\s*\(([^)]+)\)/, field: 'archive_status' },
      { re: /UPPER\(COALESCE\([^)]*METADATA->>'STATUS'[^)]*\)\)\s+NOT\s+IN\s*\(([^)]+)\)/, field: 'meta_status' },
      { re: /UPPER\(COALESCE\((?:CANONICAL_EVENTS\.)?STATUS,\s*''\)\)\s+NOT\s+IN\s*\(([^)]+)\)/, field: 'status' }
    ];
    for (const chk of checks) {
      const m = whereClause.match(chk.re);
      if (m) {
        const blocked = parseNotInList(m[1]);
        if (blocked.has(getRowStatusUpper(existingRow, chk.field))) {
          return false;
        }
      }
    }
    return true;
  };

  const evaluateSqlTimestampGuard = (sql, params, existingRow) => {
    const upperSql = sql.toUpperCase();
    const whereIdx = upperSql.lastIndexOf('WHERE ');
    if (whereIdx === -1) return true;
    const whereClause = upperSql.slice(whereIdx);
    const tsMatch = whereClause.match(/\$(\d+)::TIMESTAMPTZ\s+IS\s+NULL[\s\S]*?<=\s*\$(\d+)::TIMESTAMPTZ/);
    if (!tsMatch) return true;
    const paramIdx = Number(tsMatch[1]) - 1;
    const incomingTs = params[paramIdx];
    if (!incomingTs) return true;
    const incomingMs = Date.parse(String(incomingTs));
    if (!Number.isFinite(incomingMs)) return true;

    const existingMeta = parseMeta(existingRow.metadata);
    const updatedMs = existingRow.updated_at ? Date.parse(String(existingRow.updated_at)) : 0;
    const srcMs = existingMeta.source_updated_at ? Date.parse(String(existingMeta.source_updated_at)) : 0;
    const existingMaxMs = Math.max(Number.isFinite(updatedMs) ? updatedMs : 0, Number.isFinite(srcMs) ? srcMs : 0);
    return existingMaxMs <= incomingMs;
  };

  const evaluateAdminOverrideParam = (sql, params) => {
    const upperSql = sql.toUpperCase();
    const match = upperSql.match(/\$(\d+)::BOOLEAN\s*=\s*TRUE/);
    if (!match) return false;
    const paramIdx = Number(match[1]) - 1;
    return params[paramIdx] === true;
  };

  const pool = {
    rows,
    queries,
    seedRow(row) {
      const meta = parseMeta(row.metadata);
      if (row.status && !meta.status) meta.status = row.status;
      if (row.source_updated_at && !meta.source_updated_at) meta.source_updated_at = row.source_updated_at;
      const nowIso = new Date().toISOString();
      const stored = {
        id: row.id,
        slug: row.slug || row.id,
        canonical_name: row.canonical_name || row.title || row.name || row.id,
        event_type: row.event_type || 'CONCERT',
        category: row.category || 'CONCERT',
        start_date: row.start_date || '2027-01-15',
        start_datetime: row.start_datetime || null,
        end_date: row.end_date || null,
        end_datetime: row.end_datetime || null,
        timezone: row.timezone || 'Asia/Jakarta',
        venue_name: row.venue_name || 'GBK Main Stadium',
        venue_city: row.venue_city || 'Jakarta',
        city: row.city || 'Jakarta',
        province: row.province || 'DKI Jakarta',
        country: row.country || 'Indonesia',
        organizer_name: row.organizer_name || null,
        official_event_url: row.official_event_url || null,
        official_ticket_url: row.official_ticket_url || null,
        official_ticketing_provider: row.official_ticketing_provider || null,
        min_price: row.min_price ?? 750000,
        max_price: row.max_price ?? 2000000,
        is_verified: row.is_verified !== false,
        verification_status: row.verification_status || 'VERIFIED',
        lifecycle_status: row.lifecycle_status || 'UPCOMING',
        archive_status: row.archive_status || 'ACTIVE',
        archived_at: row.archived_at || null,
        public_visibility: row.public_visibility !== false,
        homepage_visibility: Boolean(row.homepage_visibility),
        metadata: meta,
        created_at: row.created_at || nowIso,
        updated_at: row.updated_at || nowIso
      };
      if (row.status) stored.status = row.status;
      rows.set(stored.id, stored);
      return stored;
    },
    forceNextSelectMiss(id) {
      forceNextSelectMissForId = id;
    },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (asyncTick) {
        await new Promise(resolve => setImmediate(resolve));
      }
      const normalized = String(sql || '').replace(/\s+/g, ' ').trim();
      const upper = normalized.toUpperCase();

      // information_schema.columns
      if (upper.includes('FROM INFORMATION_SCHEMA.COLUMNS') && upper.includes("TABLE_NAME = 'CANONICAL_EVENTS'")) {
        const cols = [
          'id', 'slug', 'canonical_name', 'event_type', 'category',
          'start_date', 'start_datetime', 'end_date', 'end_datetime', 'timezone',
          'venue_name', 'venue_city', 'city', 'province', 'country',
          'organizer_name', 'official_event_url', 'official_ticket_url', 'official_ticketing_provider',
          'min_price', 'max_price', 'is_verified', 'verification_status',
          'lifecycle_status', 'archive_status', 'archived_at',
          'public_visibility', 'homepage_visibility', 'price_status', 'confidence_score',
          'metadata', 'created_at', 'updated_at'
        ];
        return { rowCount: cols.length, rows: cols.map(c => ({ column_name: c })) };
      }

      // SELECT COUNT(*) for safety assertions
      if (upper.startsWith('SELECT COUNT(*)')) {
        return { rowCount: 1, rows: [{ count: '0' }] };
      }

      // SELECT ... FROM canonical_events
      if (upper.startsWith('SELECT') && upper.includes('FROM CANONICAL_EVENTS')) {
        if (upper.includes('WHERE ID = $1 OR SLUG = $2')) {
          const id = params[0];
          const slug = params[1];
          for (const r of rows.values()) {
            if (r.id === id || r.slug === slug) {
              const meta = parseMeta(r.metadata);
              return { rowCount: 1, rows: [{ ...r, meta_status: meta.status || null }] };
            }
          }
          return { rowCount: 0, rows: [] };
        }
        if (upper.includes('WHERE ID = $1')) {
          const id = params[0];
          if (forceNextSelectMissForId && forceNextSelectMissForId === id) {
            forceNextSelectMissForId = null;
            return { rowCount: 0, rows: [] };
          }
          const found = rows.get(id);
          return found ? { rowCount: 1, rows: [{ ...found, metadata: parseMeta(found.metadata) }] } : { rowCount: 0, rows: [] };
        }
        if (upper.includes('WHERE SLUG = $1')) {
          const slug = params[0];
          for (const r of rows.values()) {
            if (r.slug === slug) {
              return { rowCount: 1, rows: [{ ...r, metadata: parseMeta(r.metadata) }] };
            }
          }
          return { rowCount: 0, rows: [] };
        }
        if (upper.includes("CANONICAL_NAME ILIKE '%SHEILA%'")) {
          const phantomIds = new Set(['ev-can-4263d6ff', 'ev-can-8c07f8fe', 'ev-can-e0cbcd02', 'ev-can-841c75d0', 'event-sheila-2026-bandung']);
          const matched = Array.from(rows.values()).filter(r => {
            const name = String(r.canonical_name || '').toLowerCase();
            const isSheila = name.includes('sheila') && (!r.official_event_url || !String(r.official_event_url).startsWith('http')) && String(r.start_date || '') >= '2026-11-01';
            const isColdplay = name.includes('coldplay') && String(r.start_date || '') >= '2026-01-01';
            return isSheila || isColdplay || phantomIds.has(r.id);
          }).map(r => ({ ...r, meta_status: parseMeta(r.metadata).status || null }));
          return { rowCount: matched.length, rows: matched };
        }
        if (upper.includes("WHERE ARCHIVE_STATUS = 'ACTIVE'") && upper.includes("LIFECYCLE_STATUS = 'UPCOMING'")) {
          const matched = Array.from(rows.values()).filter(r => r.archive_status === 'ACTIVE' && r.lifecycle_status === 'UPCOMING');
          return { rowCount: matched.length, rows: matched };
        }
        const all = Array.from(rows.values()).map(r => ({ ...r, metadata: parseMeta(r.metadata) }));
        return { rowCount: all.length, rows: all };
      }

      // Direct UPDATE canonical_events
      if (upper.startsWith('UPDATE CANONICAL_EVENTS')) {
        const targetIds = Array.isArray(params[0]) ? new Set(params[0]) : null;
        const updatedRows = [];
        for (const [id, existing] of rows.entries()) {
          if (targetIds && !targetIds.has(id)) continue;
          if (!evaluateSqlTerminalNotIn(sql, existing)) continue;
          const next = {
            ...existing,
            archive_status: 'ARCHIVED',
            lifecycle_status: 'ARCHIVED',
            public_visibility: false,
            homepage_visibility: false,
            archived_at: existing.archived_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          rows.set(id, next);
          updatedRows.push({ ...next });
        }
        return { rowCount: updatedRows.length, rows: updatedRows };
      }

      // INSERT INTO canonical_events (...) VALUES (...) ON CONFLICT (id) DO UPDATE ...
      if (upper.startsWith('INSERT INTO CANONICAL_EVENTS')) {
        const colMatch = sql.match(/INSERT\s+INTO\s+canonical_events\s*\(([\s\S]*?)\)\s*VALUES/i);
        assert(colMatch, `Could not parse INSERT column list: ${normalized.slice(0, 140)}`);
        const cols = colMatch[1].split(',').map(c => c.trim());
        const valsMatch = sql.match(/VALUES\s*\(([\s\S]*?)\)\s*ON\s+CONFLICT/i);
        assert(valsMatch, `Could not parse VALUES list: ${normalized.slice(0, 140)}`);
        const valTokens = [];
        let depth = 0;
        let current = '';
        for (const ch of valsMatch[1]) {
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          if (ch === ',' && depth === 0) {
            valTokens.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
        if (current.trim()) valTokens.push(current.trim());

        const incoming = {};
        for (let i = 0; i < cols.length; i++) {
          const col = cols[i];
          const tok = valTokens[i] || '';
          const paramRef = tok.match(/^\$(\d+)(?:::[a-z0-9_]+)?$/i);
          if (paramRef) {
            incoming[col] = params[Number(paramRef[1]) - 1];
          } else if (/^COALESCE\(\$(\d+)::TIMESTAMPTZ,\s*NOW\(\)\)$/i.test(tok)) {
            const pIdx = Number(tok.match(/\$(\d+)/)[1]) - 1;
            incoming[col] = params[pIdx] || new Date().toISOString();
          } else if (/^NOW\(\)$/i.test(tok)) {
            incoming[col] = new Date().toISOString();
          } else {
            incoming[col] = null;
          }
        }
        incoming.metadata = parseMeta(incoming.metadata);

        const id = incoming.id;
        const existing = rows.get(id);

        if (!existing) {
          const inserted = {
            ...incoming,
            created_at: incoming.created_at || new Date().toISOString(),
            updated_at: incoming.updated_at || new Date().toISOString()
          };
          rows.set(id, inserted);
          if (upper.includes('(XMAX = 0) AS IS_INSERTED')) {
            return { rowCount: 1, rows: [{ is_inserted: true }] };
          }
          return { rowCount: 1, rows: [{ ...inserted, metadata: parseMeta(inserted.metadata) }] };
        }

        // Special case: PostgresMarketplaceRepository.ensureEventExists ONLY updates updated_at
        if (/ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+UPDATE\s+SET\s+updated_at\s*=\s*NOW\(\)\s+RETURNING/i.test(normalized)) {
          const touched = { ...existing, updated_at: new Date().toISOString() };
          rows.set(id, touched);
          return { rowCount: 1, rows: [{ ...touched, metadata: parseMeta(touched.metadata) }] };
        }

        // Full ON CONFLICT DO UPDATE predicate evaluation
        const allowAdmin = evaluateAdminOverrideParam(sql, params);
        if (!allowAdmin) {
          const terminalPass = evaluateSqlTerminalNotIn(sql, existing);
          if (!terminalPass) {
            return { rowCount: 0, rows: [] };
          }
          const tsPass = evaluateSqlTimestampGuard(sql, params, existing);
          if (!tsPass) {
            return { rowCount: 0, rows: [] };
          }
        }

        const updated = {
          ...existing,
          ...incoming,
          official_event_url: incoming.official_event_url ?? existing.official_event_url,
          official_ticket_url: incoming.official_ticket_url ?? existing.official_ticket_url,
          official_ticketing_provider: incoming.official_ticketing_provider ?? existing.official_ticketing_provider,
          min_price: incoming.min_price ?? existing.min_price,
          max_price: incoming.max_price ?? existing.max_price,
          archived_at: incoming.archived_at ?? existing.archived_at,
          metadata: parseMeta(incoming.metadata),
          updated_at: incoming.updated_at || new Date().toISOString()
        };
        rows.set(id, updated);
        if (upper.includes('(XMAX = 0) AS IS_INSERTED')) {
          return { rowCount: 1, rows: [{ is_inserted: false }] };
        }
        return { rowCount: 1, rows: [{ ...updated, metadata: parseMeta(updated.metadata) }] };
      }

      return { rowCount: 0, rows: [] };
    },
    async end() {}
  };

  return pool;
}

function makeHttpRequest(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function makePgRepoWithDouble(options = {}) {
  const pgDouble = createStatefulPgDouble(options);
  const repo = new PostgresCatalogRepository({ connectionString: null, skipMigrations: true });
  repo.pool = pgDouble;
  repo.degraded = false;
  repo.initialized = true;
  return { repo, pgDouble };
}

async function runBlock1HttpE2E() {
  const { state } = require('./src/database');
  const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
  const { SessionStore } = require('./src/services/sessionStore');
  const mvpRouter = require('./src/api/mvpRouter');
  const discoveryRouter = require('./src/discovery/discoveryRouter');

  // Ensure zero DB hydration attempts during HTTP E2E
  canonicalRegistry._hydratedFromRepo = true;

  // Save original state references to restore cleanly
  const origUsers = [...(state.users || [])];
  const origProfiles = [...(state.seller_profiles || [])];
  const origEvents = [...(state.events || [])];
  const origListings = [...(state.listings || [])];
  const origTickets = [...(state.tickets || [])];

  const sellerId = 'seller-phase2b-e2e';
  const sellerUser = {
    id: sellerId,
    email: 'seller.phase2b@tikum.test',
    name: 'Phase2B Seller',
    display_name: 'Phase2B Seller',
    phone: '+6281234567890',
    role: 'SELLER',
    status: 'ACTIVE',
    email_verified: true,
    metadata: {
      email_verified: true,
      email_verified_at: '2026-11-01T00:00:00.000Z',
      full_name: 'Phase2B Seller',
      whatsapp: '+6281234567890',
      address: 'Jl. Sudirman No. 1, Jakarta',
      city: 'Jakarta',
      payout_bank_name: 'BCA',
      payout_account_number: '1234567890',
      identity_doc_ref: 'KTP-PHASE2B-VERIFIED'
    }
  };
  const sellerProfile = {
    user_id: sellerId,
    kyc_status: 'VERIFIED',
    status: 'ACTIVE',
    suspended: false,
    payout_bank: 'BCA',
    payout_account_masked: '******7890',
    nik_hash: 'sha256-phase2b-nik',
    active_listing_limit: 20
  };

  state.users.push(sellerUser);
  if (!state.seller_profiles) state.seller_profiles = [];
  state.seller_profiles.push(sellerProfile);
  const session = SessionStore.createSession({ userId: sellerId, role: 'SELLER' });
  if (!state.sessions) state.sessions = [];
  state.sessions.push(session);

  const baseProvenance = {
    is_verified: true,
    verification_status: 'PRIMARY_SOURCE_VERIFIED',
    public_visibility: true,
    homepage_visibility: true,
    min_price: 750000,
    max_price: 2500000,
    lowest_official_price: 750000,
    price_status: 'QUALIFIED',
    source_url: 'https://official.example/tikum-e2e',
    official_event_url: 'https://official.example/tikum-e2e',
    official_ticket_url: 'https://official.example/tikum-e2e/tickets',
    evidence_hash: 'sha256-phase2b-e2e-verified',
    verified_at: '2026-11-20T00:00:00.000Z',
    city: 'Jakarta',
    venue_city: 'Jakarta',
    country: 'Indonesia',
    category: 'CONCERT',
    event_type: 'CONCERT'
  };

  const testEvents = [
    {
      ...baseProvenance,
      id: 'ev-e2e-past-2025',
      event_id: 'ev-e2e-past-2025',
      slug: 'ev-e2e-past-2025',
      title: 'Past Concert 2025',
      name: 'Past Concert 2025',
      canonical_name: 'Past Concert 2025',
      start_date: '2025-06-01',
      date: '2025-06-01',
      start_datetime: '2025-06-01T19:00:00+07:00',
      venue: 'Tennis Indoor Senayan',
      venue_name: 'Tennis Indoor Senayan',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'event-mcr-jakarta-2026',
      event_id: 'event-mcr-jakarta-2026',
      slug: 'mcr-jakarta-2026',
      title: 'My Chemical Romance — Live in Jakarta',
      name: 'My Chemical Romance — Live in Jakarta',
      canonical_name: 'My Chemical Romance — Live in Jakarta',
      start_date: '2026-11-28',
      date: '2026-11-28',
      start_datetime: '2026-11-28T19:00:00+07:00',
      venue: 'Jakarta International Stadium (JIS)',
      venue_name: 'Jakarta International Stadium (JIS)',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'ev-can-afa-id-2026',
      event_id: 'ev-can-afa-id-2026',
      slug: 'afa-id-2026-music-fest',
      title: 'AFA ID 2026 Music Fest',
      name: 'AFA ID 2026 Music Fest',
      canonical_name: 'AFA ID 2026 Music Fest',
      start_date: '2026-11-28',
      date: '2026-11-28',
      start_datetime: '2026-11-28T15:00:00+07:00',
      venue: 'Stadion Madya GBK',
      venue_name: 'Stadion Madya GBK',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'ev-e2e-archived',
      event_id: 'ev-e2e-archived',
      slug: 'ev-e2e-archived',
      title: 'Archived Event 2027',
      name: 'Archived Event 2027',
      canonical_name: 'Archived Event 2027',
      start_date: '2027-03-01',
      date: '2027-03-01',
      start_datetime: '2027-03-01T19:00:00+07:00',
      venue: 'Istora Senayan',
      venue_name: 'Istora Senayan',
      status: 'ARCHIVED',
      lifecycle_status: 'ARCHIVED',
      archive_status: 'ARCHIVED'
    },
    {
      ...baseProvenance,
      id: 'ev-e2e-dup-merged',
      event_id: 'ev-e2e-dup-merged',
      slug: 'ev-e2e-dup-merged',
      title: 'Duplicate Merged Event 2027',
      name: 'Duplicate Merged Event 2027',
      canonical_name: 'Duplicate Merged Event 2027',
      start_date: '2027-03-02',
      date: '2027-03-02',
      start_datetime: '2027-03-02T19:00:00+07:00',
      venue: 'Indonesia Arena',
      venue_name: 'Indonesia Arena',
      status: 'UPCOMING',
      lifecycle_status: 'DUPLICATE_MERGED',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'ev-e2e-upcoming-valid',
      event_id: 'ev-e2e-upcoming-valid',
      slug: 'ev-e2e-upcoming-valid',
      title: 'Jakarta Symphony Gala 2027',
      name: 'Jakarta Symphony Gala 2027',
      canonical_name: 'Jakarta Symphony Gala 2027',
      start_date: '2027-04-15',
      date: '2027-04-15',
      start_datetime: '2027-04-15T19:00:00+07:00',
      venue: 'GBK Main Stadium',
      venue_name: 'GBK Main Stadium',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'ev-e2e-venue-a',
      event_id: 'ev-e2e-venue-a',
      slug: 'ev-e2e-venue-a',
      title: 'Jakarta Jazz Showcase 2027',
      name: 'Jakarta Jazz Showcase 2027',
      canonical_name: 'Jakarta Jazz Showcase 2027',
      start_date: '2027-05-10',
      date: '2027-05-10',
      start_datetime: '2027-05-10T19:00:00+07:00',
      venue: 'Venue Hall Alpha',
      venue_name: 'Venue Hall Alpha',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'ev-e2e-venue-b',
      event_id: 'ev-e2e-venue-b',
      slug: 'ev-e2e-venue-b',
      title: 'Jakarta Jazz Showcase 2027',
      name: 'Jakarta Jazz Showcase 2027',
      canonical_name: 'Jakarta Jazz Showcase 2027',
      start_date: '2027-05-10',
      date: '2027-05-10',
      start_datetime: '2027-05-10T19:00:00+07:00',
      venue: 'Venue Hall Beta',
      venue_name: 'Venue Hall Beta',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'ev-e2e-session-matinee',
      event_id: 'ev-e2e-session-matinee',
      slug: 'ev-e2e-session-matinee',
      title: 'Jakarta Comedy Gala 2027',
      name: 'Jakarta Comedy Gala 2027',
      canonical_name: 'Jakarta Comedy Gala 2027',
      start_date: '2027-05-20',
      date: '2027-05-20',
      start_datetime: '2027-05-20T13:00:00+07:00',
      venue: 'Balai Sarbini',
      venue_name: 'Balai Sarbini',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    },
    {
      ...baseProvenance,
      id: 'ev-e2e-session-evening',
      event_id: 'ev-e2e-session-evening',
      slug: 'ev-e2e-session-evening',
      title: 'Jakarta Comedy Gala 2027',
      name: 'Jakarta Comedy Gala 2027',
      canonical_name: 'Jakarta Comedy Gala 2027',
      start_date: '2027-05-20',
      date: '2027-05-20',
      start_datetime: '2027-05-20T20:00:00+07:00',
      venue: 'Balai Sarbini',
      venue_name: 'Balai Sarbini',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    }
  ];

  // Replace state.events & register in canonicalRegistry
  state.events.length = 0;
  for (const ev of testEvents) {
    state.events.push(ev);
    canonicalRegistry.events.set(ev.id, ev);
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/mvp', mvpRouter);
  app.use(discoveryRouter);

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const authHeaders = {
    authorization: `Bearer ${session.session_token}`,
    'x-user-id': sellerId
  };

  try {
    const postListing = (eventId, overrides = {}) => makeHttpRequest(port, 'POST', '/api/mvp/seller/listing', {
      headers: authHeaders,
      body: {
        eventId,
        seatInfo: 'CAT 1 - Row A Seat 1',
        faceValue: 750000,
        price: 750000,
        rawBarcode: `TIKUM-E2E-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        quantity: 1,
        fulfillmentType: 'SELLER_MANAGED',
        ...overrides
      }
    });

    await runCheck('HTTP E2E: POST /api/mvp/seller/listing rejects past-dated event (2025-06-01) with HTTP 400 EVENT_ALREADY_PASSED', async () => {
      const res = await postListing('ev-e2e-past-2025');
      assert.strictEqual(res.status, 400, `Expected HTTP 400 (NOT 500), got ${res.status}: ${res.text}`);
      assert.strictEqual(res.json?.code, 'EVENT_ALREADY_PASSED');
    });

    await runCheck('HTTP E2E: POST /api/mvp/seller/listing rejects MCR overridden event (2026-11-22) with HTTP 400 EVENT_ALREADY_PASSED', async () => {
      const res = await postListing('event-mcr-jakarta-2026');
      assert.strictEqual(res.status, 400, `Expected HTTP 400 (NOT 500), got ${res.status}: ${res.text}`);
      assert.strictEqual(res.json?.code, 'EVENT_ALREADY_PASSED');
    });

    await runCheck('HTTP E2E: POST /api/mvp/seller/listing rejects ARCHIVED event with HTTP 400 EVENT_ALREADY_PASSED', async () => {
      const res = await postListing('ev-e2e-archived');
      assert.strictEqual(res.status, 400, `Expected HTTP 400 (NOT 500), got ${res.status}: ${res.text}`);
      assert.strictEqual(res.json?.code, 'EVENT_ALREADY_PASSED');
    });

    await runCheck('HTTP E2E: POST /api/mvp/seller/listing rejects DUPLICATE_MERGED event with HTTP 400 EVENT_ALREADY_PASSED', async () => {
      const res = await postListing('ev-e2e-dup-merged');
      assert.strictEqual(res.status, 400, `Expected HTTP 400 (NOT 500), got ${res.status}: ${res.text}`);
      assert.strictEqual(res.json?.code, 'EVENT_ALREADY_PASSED');
    });

    await runCheck('HTTP E2E: POST /api/mvp/seller/listing allows valid upcoming event (>= 2026-11-26 WIB)', async () => {
      const res = await postListing('ev-e2e-upcoming-valid', { price: 800000, faceValue: 750000 });
      assert.strictEqual(res.status, 201, `Expected HTTP 201 for valid upcoming event, got ${res.status}: ${res.text}`);
      assert.notStrictEqual(res.json?.code, 'EVENT_ALREADY_PASSED');
      assert.strictEqual(res.json?.success, true);
    });

    await runCheck('HTTP E2E: POST /api/mvp/seller/listing still rejects price < 500000 (MIN_LISTING_PRICE_IDR = 500000)', async () => {
      const res = await postListing('ev-e2e-upcoming-valid', { price: 450000, faceValue: 450000 });
      assert.strictEqual(res.status, 400, `Expected HTTP 400 for price < 500000, got ${res.status}: ${res.text}`);
      assert.strictEqual(res.json?.code, 'PRICE_BELOW_MINIMUM');
    });

    await runCheck('HTTP E2E: GET /api/mvp/events excludes past/terminal/MCR/AFA and keeps distinct venues/sessions separate', async () => {
      const res = await makeHttpRequest(port, 'GET', '/api/mvp/events');
      assert.strictEqual(res.status, 200);
      const list = Array.isArray(res.json) ? res.json : (res.json?.events || []);
      const ids = new Set(list.map(e => e.id || e.event_id));
      for (const excludedId of ['ev-e2e-past-2025', 'event-mcr-jakarta-2026', 'ev-can-afa-id-2026', 'ev-e2e-archived', 'ev-e2e-dup-merged']) {
        assert.strictEqual(ids.has(excludedId), false, `Excluded event ${excludedId} leaked into GET /api/mvp/events`);
      }
      for (const visibleId of ['ev-e2e-upcoming-valid', 'ev-e2e-venue-a', 'ev-e2e-venue-b', 'ev-e2e-session-matinee', 'ev-e2e-session-evening']) {
        assert.strictEqual(ids.has(visibleId), true, `Expected upcoming event ${visibleId} missing from GET /api/mvp/events`);
      }
    });

    await runCheck('HTTP E2E: GET /events excludes past/terminal/MCR/AFA and renders distinct venues/sessions separately', async () => {
      const res = await makeHttpRequest(port, 'GET', '/events');
      assert.strictEqual(res.status, 200);
      const html = res.text;
      for (const excludedMarker of ['Past Concert 2025', 'My Chemical Romance', 'AFA ID 2026 Music Fest', 'Archived Event 2027', 'Duplicate Merged Event 2027']) {
        assert.strictEqual(html.includes(excludedMarker), false, `Excluded event "${excludedMarker}" leaked into GET /events HTML`);
      }
      for (const visibleMarker of ['ev-e2e-upcoming-valid', 'Venue Hall Alpha', 'Venue Hall Beta', 'ev-e2e-session-matinee', 'ev-e2e-session-evening']) {
        assert.strictEqual(html.includes(visibleMarker), true, `Expected visible marker "${visibleMarker}" missing from GET /events HTML`);
      }
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    state.users = origUsers;
    state.seller_profiles = origProfiles;
    state.events = origEvents;
    state.listings = origListings;
    state.tickets = origTickets;
    for (const ev of testEvents) {
      canonicalRegistry.events.delete(ev.id);
    }
  }
}

async function runBlock2ParityMatrix() {
  // Scenario 1: Seed refresh against all 5 terminal statuses (across lifecycle_status, archive_status, status)
  await runCheck('Scenario 1: Seed refresh against all 5 terminal statuses (lifecycle/archive/status) -> 0 resurrections (InMemory + PG parity)', async () => {
    const mem = new InMemoryCatalogRepository();
    const { repo: pg, pgDouble } = makePgRepoWithDouble();

    for (const terminal of policy.TERMINAL_STATUSES) {
      for (const field of ['lifecycle_status', 'archive_status', 'status']) {
        const id = `seed-${terminal.toLowerCase()}-${field}`;
        const initial = {
          id,
          slug: id,
          title: `Terminal Event ${id}`,
          start_date: '2026-10-01',
          lifecycle_status: field === 'lifecycle_status' ? terminal : 'UPCOMING',
          archive_status: field === 'archive_status' ? terminal : 'ACTIVE',
          ...(field === 'status' ? { status: terminal } : {})
        };
        await mem.upsertCanonicalEvent(initial);
        await pg.upsertCanonicalEvent(initial);

        const refreshPayload = {
          id,
          slug: id,
          title: 'Resurrected Title Attempt',
          start_date: '2027-06-01',
          status: 'ACTIVE',
          lifecycle_status: 'UPCOMING',
          archive_status: 'ACTIVE'
        };
        const memAfter = await mem.upsertCanonicalEvent(refreshPayload);
        const pgAfter = await pg.upsertCanonicalEvent(refreshPayload);

        assert.strictEqual(policy.isTerminalEvent(memAfter), true, `InMemory resurrected ${id}`);
        assert.strictEqual(policy.isTerminalEvent(pgAfter), true, `PG resurrected ${id}`);
        assert.strictEqual(memAfter.title, initial.title);
        assert.strictEqual(pgAfter.title, initial.title);
        assert.strictEqual(memAfter[field], terminal);
        assert.strictEqual(pgAfter[field], terminal);
      }
    }

    // Verify real SQL WHERE predicates check lifecycle_status, archive_status, AND metadata->>'status'
    const upsertSqls = pgDouble.queries.filter(q => /INSERT\s+INTO\s+canonical_events/i.test(q.sql));
    assert(upsertSqls.length >= 15, 'Expected parameterized PG upsert queries');
    for (const q of upsertSqls) {
      assert(/canonical_events\.lifecycle_status/i.test(q.sql), 'SQL must guard lifecycle_status');
      assert(/canonical_events\.archive_status/i.test(q.sql), 'SQL must guard archive_status');
      assert(/canonical_events\.metadata->>'status'/i.test(q.sql), "SQL must guard metadata->>'status'");
      for (const t of policy.TERMINAL_STATUSES) {
        assert(q.sql.includes(`'${t}'`), `SQL missing terminal status ${t}`);
      }
    }

    // Verify allowAdminOverride === true explicitly permits override in both repos
    const overrideId = 'seed-past-lifecycle_status';
    const overridePayload = { id: overrideId, slug: overrideId, title: 'Admin Restored', start_date: '2027-08-01', lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', status: 'ACTIVE' };
    const memOver = await mem.upsertCanonicalEvent(overridePayload, { allowAdminOverride: true });
    const pgOver = await pg.upsertCanonicalEvent(overridePayload, { allowAdminOverride: true });
    assert.strictEqual(memOver.lifecycle_status, 'UPCOMING');
    assert.strictEqual(pgOver.lifecycle_status, 'UPCOMING');
  });

  // Scenario 2: Provider refresh (EventIngestionScheduler + MarketSupplyExpansionService upsertCanonicalEvent paths)
  await runCheck('Scenario 2: Provider refresh (EventIngestionScheduler & MarketSupplyExpansionService paths) preserves terminal rows (InMemory + PG parity)', async () => {
    const mem = new InMemoryCatalogRepository();
    const { repo: pg } = makePgRepoWithDouble();
    const scheduler = new EventIngestionScheduler();

    const baseTerm = {
      id: 'ev-prov-terminal',
      slug: 'ev-prov-terminal',
      title: 'Concluded Provider Show',
      canonical_name: 'Concluded Provider Show',
      start_date: '2026-10-15',
      lifecycle_status: 'COMPLETED',
      archive_status: 'ARCHIVED',
      image_url: 'https://cdn.example/poster.jpg'
    };
    await mem.upsertCanonicalEvent(baseTerm);
    await pg.upsertCanonicalEvent(baseTerm);

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'image/jpeg' : null) }
    });

    // EventIngestionScheduler line 1098 path with stale active status coming from cached event object
    const staleActiveCopy = { ...baseTerm, lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', status: 'ACTIVE' };
    await scheduler.runImageHealthCheckChunk({ repository: mem, persist: true, events: [staleActiveCopy], fetchFn: mockFetch, batchSize: 1 });
    await scheduler.runImageHealthCheckChunk({ repository: pg, persist: true, events: [staleActiveCopy], fetchFn: mockFetch, batchSize: 1 });

    // MarketSupplyExpansionService lines 325 / 371 corroboration patch path
    const supplyPatch = {
      ...baseTerm,
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      status: 'LIVE',
      official_ticket_url: 'https://loket.com/event/resurrected'
    };
    const memSup = await mem.upsertCanonicalEvent(supplyPatch);
    const pgSup = await pg.upsertCanonicalEvent(supplyPatch);

    assert.strictEqual(memSup.lifecycle_status, 'COMPLETED');
    assert.strictEqual(memSup.archive_status, 'ARCHIVED');
    assert.strictEqual(pgSup.lifecycle_status, 'COMPLETED');
    assert.strictEqual(pgSup.archive_status, 'ARCHIVED');
  });

  // Scenario 3: Duplicate ingestion replay -> idempotent, terminal preserved
  await runCheck('Scenario 3: Duplicate ingestion replay is idempotent and preserves terminal state (InMemory + PG parity)', async () => {
    const mem = new InMemoryCatalogRepository();
    const { repo: pg } = makePgRepoWithDouble();

    const termEv = {
      id: 'ev-dup-replay',
      slug: 'ev-dup-replay',
      title: 'Replay Test Concert',
      start_date: '2026-09-10',
      lifecycle_status: 'DUPLICATE_MERGED',
      archive_status: 'ARCHIVED'
    };
    await mem.upsertCanonicalEvent(termEv);
    await pg.upsertCanonicalEvent(termEv);

    for (let i = 0; i < 3; i++) {
      await mem.upsertCanonicalEvent({ ...termEv, lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', title: `Replay #${i}` });
      await pg.upsertCanonicalEvent({ ...termEv, lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', title: `Replay #${i}` });
    }

    const memAll = await mem.getAllEvents();
    const pgAll = await pg.getAllEvents();
    assert.strictEqual(memAll.length, 1);
    assert.strictEqual(pgAll.length, 1);
    assert.strictEqual(memAll[0].lifecycle_status, 'DUPLICATE_MERGED');
    assert.strictEqual(pgAll[0].lifecycle_status, 'DUPLICATE_MERGED');
    assert.strictEqual(memAll[0].title, 'Replay Test Concert');
    assert.strictEqual(pgAll[0].title, 'Replay Test Concert');
  });

  // Scenario 4: Stale snapshot replay (older updated_at / source_updated_at) -> ignored, newer state preserved
  await runCheck('Scenario 4: Stale snapshot replay (older source_updated_at & updated_at) ignored; newer accepted (InMemory + PG parity)', async () => {
    const mem = new InMemoryCatalogRepository();
    const { repo: pg } = makePgRepoWithDouble();

    const newer = {
      id: 'ev-stale-guard',
      slug: 'ev-stale-guard',
      title: 'Fresh Event Title v2',
      venue_name: 'New Confirmed Venue',
      start_date: '2027-06-15',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      source_updated_at: '2026-11-26T12:00:00.000Z'
    };
    await mem.upsertCanonicalEvent(newer);
    await pg.upsertCanonicalEvent(newer);

    // Replay older source_updated_at
    const staleBySourceTs = {
      id: 'ev-stale-guard',
      slug: 'ev-stale-guard',
      title: 'Stale Old Title v1',
      venue_name: 'Old Wrong Venue',
      start_date: '2027-06-10',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      source_updated_at: '2026-11-25T08:00:00.000Z'
    };
    const memStale1 = await mem.upsertCanonicalEvent(staleBySourceTs);
    const pgStale1 = await pg.upsertCanonicalEvent(staleBySourceTs);
    assert.strictEqual(memStale1.title, 'Fresh Event Title v2');
    assert.strictEqual(pgStale1.title, 'Fresh Event Title v2');
    assert.strictEqual(memStale1.venue_name, 'New Confirmed Venue');
    assert.strictEqual(pgStale1.venue_name, 'New Confirmed Venue');

    // Replay older updated_at
    const staleByUpdatedAt = {
      id: 'ev-stale-guard',
      slug: 'ev-stale-guard',
      title: 'Stale UpdatedAt Title',
      start_date: '2027-06-09',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      updated_at: '2026-11-24T00:00:00.000Z'
    };
    const memStale2 = await mem.upsertCanonicalEvent(staleByUpdatedAt);
    const pgStale2 = await pg.upsertCanonicalEvent(staleByUpdatedAt);
    assert.strictEqual(memStale2.title, 'Fresh Event Title v2');
    assert.strictEqual(pgStale2.title, 'Fresh Event Title v2');

    // Newer snapshot IS accepted
    const freshV3 = {
      id: 'ev-stale-guard',
      slug: 'ev-stale-guard',
      title: 'Fresh Event Title v3',
      venue_name: 'Updated Stadium',
      start_date: '2027-06-20',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE',
      source_updated_at: '2026-11-26T15:00:00.000Z'
    };
    const memV3 = await mem.upsertCanonicalEvent(freshV3);
    const pgV3 = await pg.upsertCanonicalEvent(freshV3);
    assert.strictEqual(memV3.title, 'Fresh Event Title v3');
    assert.strictEqual(pgV3.title, 'Fresh Event Title v3');
  });

  // Scenario 5: Full 20-combination terminal-vs-active conflict matrix (InMemory + PG parity)
  await runCheck('Scenario 5: Full 20-combination terminal-vs-active conflict matrix (InMemory 20/20 + PG 20/20 parity)', async () => {
    let memChecked = 0;
    let pgChecked = 0;
    for (const terminal of policy.TERMINAL_STATUSES) {
      for (const active of ACTIVE_STATUSES) {
        assert.strictEqual(policy.canTransitionStatus(terminal, active), false);

        const mem = new InMemoryCatalogRepository();
        const { repo: pg } = makePgRepoWithDouble();
        const id = `matrix-${terminal}-${active}`;

        await mem.upsertCanonicalEvent({ id, slug: id, title: 'T', lifecycle_status: terminal, archive_status: 'ACTIVE' });
        const memRes = await mem.upsertCanonicalEvent({ id, slug: id, title: 'A', lifecycle_status: active, archive_status: 'ACTIVE', status: active });
        assert.strictEqual(memRes.lifecycle_status, terminal, `InMemory matrix failed ${terminal} vs ${active}`);
        memChecked++;

        await pg.upsertCanonicalEvent({ id, slug: id, title: 'T', lifecycle_status: terminal, archive_status: 'ACTIVE' });
        const pgRes = await pg.upsertCanonicalEvent({ id, slug: id, title: 'A', lifecycle_status: active, archive_status: 'ACTIVE', status: active });
        assert.strictEqual(pgRes.lifecycle_status, terminal, `PG matrix failed ${terminal} vs ${active}`);
        pgChecked++;
      }
    }
    assert.strictEqual(memChecked, 20);
    assert.strictEqual(pgChecked, 20);
  });

  // Scenario 6: Concurrent writers (Promise.all racing terminal transition vs active upserts)
  await runCheck('Scenario 6: Concurrent writers (Promise.all racing terminal vs active) deterministically preserve terminal state (InMemory + PG parity)', async () => {
    for (const order of ['terminal-first', 'active-first']) {
      const mem = new InMemoryCatalogRepository();
      const { repo: pg } = makePgRepoWithDouble({ asyncTick: true });
      const id = `race-${order}`;
      const base = { id, slug: id, title: 'Concurrent Event', start_date: '2026-11-20', lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE' };
      await mem.upsertCanonicalEvent(base);
      await pg.upsertCanonicalEvent(base);

      const terminalWrite = { ...base, lifecycle_status: 'ARCHIVED', archive_status: 'ARCHIVED' };
      const activeWrite1 = { ...base, lifecycle_status: 'UPCOMING', archive_status: 'ACTIVE', title: 'Race Active 1' };
      const activeWrite2 = { ...base, lifecycle_status: 'LIVE', archive_status: 'ACTIVE', title: 'Race Active 2' };

      const runRace = async (repo) => {
        const ops = order === 'terminal-first'
          ? [repo.upsertCanonicalEvent(terminalWrite), repo.upsertCanonicalEvent(activeWrite1), repo.upsertCanonicalEvent(activeWrite2)]
          : [repo.upsertCanonicalEvent(activeWrite1), repo.upsertCanonicalEvent(terminalWrite), repo.upsertCanonicalEvent(activeWrite2)];
        await Promise.all(ops);
        return repo.getEventById(id);
      };

      const memFinal = await runRace(mem);
      const pgFinal = await runRace(pg);

      assert.strictEqual(memFinal.lifecycle_status, 'ARCHIVED', `InMemory race (${order}) failed`);
      assert.strictEqual(memFinal.archive_status, 'ARCHIVED', `InMemory race (${order}) failed`);
      assert.strictEqual(pgFinal.lifecycle_status, 'ARCHIVED', `PG race (${order}) failed`);
      assert.strictEqual(pgFinal.archive_status, 'ARCHIVED', `PG race (${order}) failed`);
    }
  });
}

async function runBlock3ScriptAndMarketplaceGuards() {
  // 3A. scripts/seed_canonical_catalog.js SQL anti-resurrection check
  await runCheck('Guard 3A: scripts/seed_canonical_catalog.js SQL cannot resurrect any of the 5 terminal statuses', async () => {
    const seedSrc = fs.readFileSync(path.resolve(__dirname, 'scripts/seed_canonical_catalog.js'), 'utf8');
    const sqlMatch = seedSrc.match(/INSERT INTO canonical_events[\s\S]*?RETURNING \(xmax = 0\) AS is_inserted;/);
    assert(sqlMatch, 'Could not locate seed_canonical_catalog.js INSERT SQL');
    const seedSql = sqlMatch[0];

    assert(/canonical_events\.archive_status/i.test(seedSql), 'seed SQL missing archive_status guard');
    assert(/canonical_events\.lifecycle_status/i.test(seedSql), 'seed SQL missing lifecycle_status guard');
    assert(/canonical_events\.metadata->>'status'/i.test(seedSql), "seed SQL missing metadata->>'status' guard");

    const pgDouble = createStatefulPgDouble();
    for (const terminal of policy.TERMINAL_STATUSES) {
      const id = `seed-script-${terminal.toLowerCase()}`;
      pgDouble.seedRow({
        id,
        slug: id,
        canonical_name: `Original Terminal ${terminal}`,
        lifecycle_status: terminal,
        archive_status: terminal === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'
      });

      const params = [
        id, id, 'Seed Resurrect Attempt', 'CONCERT', 'CONCERT',
        '2027-04-01', '2027-04-01T19:00:00+07:00', '2027-04-01', '2027-04-01T23:00:00+07:00', 'Asia/Jakarta',
        'GBK', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Org', null, null, 'loket',
        750000, 1500000, true, 'VERIFIED',
        'UPCOMING', 'ACTIVE', true, true,
        JSON.stringify({ seeded_at: new Date().toISOString() })
      ];
      const res = await pgDouble.query(seedSql, params);
      assert.strictEqual(res.rowCount, 0, `seed_canonical_catalog.js resurrected ${terminal} row`);
      const stored = pgDouble.rows.get(id);
      assert.strictEqual(stored.lifecycle_status, terminal);
      assert.strictEqual(stored.canonical_name, `Original Terminal ${terminal}`);
    }
  });

  // 3B. scripts/reconcile_zero_wrong_date_events.js (direct UPDATE + upsert guards)
  await runCheck('Guard 3B: scripts/reconcile_zero_wrong_date_events.js direct UPDATE & upsert cannot resurrect or overwrite terminal rows', async () => {
    const pgDouble = createStatefulPgDouble();

    // Seed phantom rows: one already terminal (DUPLICATE_MERGED) and one still active
    pgDouble.seedRow({
      id: 'ev-can-4263d6ff',
      slug: 'sheila-phantom-merged',
      canonical_name: 'Sheila on 7 Phantom',
      start_date: '2026-11-20',
      lifecycle_status: 'DUPLICATE_MERGED',
      archive_status: 'ACTIVE'
    });
    pgDouble.seedRow({
      id: 'event-sheila-2026-bandung',
      slug: 'sheila-phantom-active',
      canonical_name: 'Sheila on 7 Active Phantom',
      start_date: '2026-11-20',
      lifecycle_status: 'UPCOMING',
      archive_status: 'ACTIVE'
    });

    // Seed 5 verified candidate IDs in each of the 5 terminal statuses
    const terminalTargets = [
      { id: 'ev-can-afa-id-2026', terminal: 'PAST' },
      { id: 'ev-can-joyland-sessions-2026', terminal: 'ARCHIVED' },
      { id: 'bts-world-tour-arirang-jakarta-2026', terminal: 'DUPLICATE_MERGED' },
      { id: 'bigbang-cosmos-tour-jakarta-2027', terminal: 'CANCELLED' },
      { id: 'evt_edp1690841', terminal: 'COMPLETED' }
    ];
    for (const t of terminalTargets) {
      pgDouble.seedRow({
        id: t.id,
        slug: t.id,
        canonical_name: `Locked Terminal ${t.terminal}`,
        start_date: '2026-10-01',
        lifecycle_status: t.terminal,
        archive_status: t.terminal === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'
      });
    }

    // Silence script console noise during test execution
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
      await reconcileDatabase('Offline PG Double', null, pgDouble);
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }

    // 1. Direct UPDATE must preserve already-terminal phantom row (DUPLICATE_MERGED), while archiving active phantom
    assert.strictEqual(pgDouble.rows.get('ev-can-4263d6ff').lifecycle_status, 'DUPLICATE_MERGED');
    assert.strictEqual(pgDouble.rows.get('event-sheila-2026-bandung').archive_status, 'ARCHIVED');

    // Verify emitted direct UPDATE SQL itself contains terminal WHERE guard
    const directUpdate = pgDouble.queries.find(q => /^\s*UPDATE\s+canonical_events/i.test(q.sql));
    assert(directUpdate, 'Expected direct UPDATE SQL to be executed for active phantom');
    assert(/NOT\s+IN\s*\('PAST',\s*'ARCHIVED',\s*'DUPLICATE_MERGED',\s*'CANCELLED',\s*'COMPLETED'\)/i.test(directUpdate.sql), 'Direct UPDATE missing full TERMINAL_STATUSES guard');

    // Independently test direct UPDATE SQL against a terminal row bypassing JS check
    const directAttempt = await pgDouble.query(directUpdate.sql, [['ev-can-4263d6ff']]);
    assert.strictEqual(directAttempt.rowCount, 0, 'Direct UPDATE SQL must block terminal row even without JS guard');

    // 2. All 5 pre-existing terminal candidate rows must remain untouched (0 resurrections)
    for (const t of terminalTargets) {
      const stored = pgDouble.rows.get(t.id);
      assert.strictEqual(stored.lifecycle_status, t.terminal, `reconcile_zero_wrong_date_events resurrected ${t.id} from ${t.terminal}`);
      assert.strictEqual(stored.canonical_name, `Locked Terminal ${t.terminal}`);
    }
  });

  // 3C. PostgresMarketplaceRepository.js (~line 312) verification
  await runCheck('Guard 3C: PostgresMarketplaceRepository.ensureEventExists (~line 312) is status-safe and cannot resurrect terminal rows', async () => {
    const repoSrc = fs.readFileSync(path.resolve(__dirname, 'src/storage/PostgresMarketplaceRepository.js'), 'utf8');
    const conflictSnippet = repoSrc.match(/INSERT INTO canonical_events[\s\S]*?ON CONFLICT \(id\) DO UPDATE SET[\s\S]*?RETURNING \*;/);
    assert(conflictSnippet, 'Could not locate ensureEventExists ON CONFLICT SQL');
    assert(/ON CONFLICT \(id\) DO UPDATE SET\s+updated_at = NOW\(\)/i.test(conflictSnippet[0]), 'ensureEventExists ON CONFLICT must ONLY touch updated_at');
    assert(!/lifecycle_status\s*=|archive_status\s*=|status\s*=/i.test(conflictSnippet[0].split('DO UPDATE SET')[1]), 'ensureEventExists DO UPDATE must not mutate any status column');

    const { state } = require('./src/database');
    const pgDouble = createStatefulPgDouble();
    const mktRepo = new PostgresMarketplaceRepository();
    mktRepo.pool = pgDouble;
    mktRepo.degraded = false;
    mktRepo.initialized = true;

    for (const terminal of policy.TERMINAL_STATUSES) {
      const id = `mkt-ensure-${terminal.toLowerCase()}`;
      pgDouble.seedRow({
        id,
        slug: id,
        canonical_name: `Terminal Market Event ${terminal}`,
        lifecycle_status: terminal,
        archive_status: terminal === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        status: terminal
      });

      // Push an active copy into state.events and force SELECT miss to exercise lines 311-320 ON CONFLICT branch
      state.events.push({
        id,
        slug: id,
        title: 'Stale Active In-Memory Copy',
        start_date: '2027-07-01',
        lifecycle_status: 'UPCOMING',
        archive_status: 'ACTIVE',
        status: 'ACTIVE'
      });
      pgDouble.forceNextSelectMiss(id);

      try {
        const res = await mktRepo.ensureEventExists(id, pgDouble);
        assert(res, `ensureEventExists returned null for ${id}`);
        const stored = pgDouble.rows.get(id);
        assert.strictEqual(stored.lifecycle_status, terminal, `ensureEventExists mutated lifecycle_status for ${terminal}`);
        assert.strictEqual(stored.metadata.status, terminal, `ensureEventExists mutated metadata.status for ${terminal}`);
      } finally {
        const idx = state.events.findIndex(e => e.id === id);
        if (idx >= 0) state.events.splice(idx, 1);
      }
    }
  });
}

(async () => {
  const startedAt = Date.now();
  await runBlock1HttpE2E();
  await runBlock2ParityMatrix();
  await runBlock3ScriptAndMarketplaceGuards();
  const elapsedMs = Date.now() - startedAt;
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed (${elapsedMs}ms)`);
  if (totalFailed > 0) {
    process.exitCode = 1;
  } else {
    process.exit(0);
  }
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
