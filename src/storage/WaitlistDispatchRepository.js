const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_DISPATCH_STATUSES = ['UNASSIGNED', 'ASSIGNED', 'ON_SITE_READY'];
const ALLOWED_LOCALES = ['id', 'en', 'ms', 'tl', 'th'];

const inMemoryStore = {
  waitlist: new Map(), // key: `${event_id}::${contact_whatsapp}` -> record
  bookingHashes: new Map(), // key: hash_sha256 -> record
  picDispatch: new Map() // key: event_id -> record
};

let schemaEnsured = false;
let schemaEnsurePromise = null;

function isTestMode() {
  if (process.env.NODE_ENV === 'test' || process.env.TIKUM_FORCE_INMEMORY === 'true') return true;
  if (typeof process.argv?.[1] === 'string' && /(?:^|[\\/])test_[^\\/]+\.js$/i.test(process.argv[1])) return true;
  return false;
}

function getPgPoolIfAvailable() {
  if (isTestMode()) return null;
  const hasDbUrl = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL);
  if (!hasDbUrl) return null;
  try {
    const { getSharedPool } = require('./connectionPool');
    return getSharedPool();
  } catch (_) {
    return null;
  }
}

async function ensureTables(pool) {
  if (!pool || schemaEnsured) return;
  if (schemaEnsurePromise) return schemaEnsurePromise;

  schemaEnsurePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.ticket_waitlist_requests (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        event_title TEXT NOT NULL,
        contact_whatsapp TEXT NOT NULL,
        seat_preference TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        max_budget_idr BIGINT,
        locale TEXT NOT NULL DEFAULT 'id',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_waitlist_event_wa
        ON public.ticket_waitlist_requests (event_id, contact_whatsapp);
      CREATE INDEX IF NOT EXISTS idx_ticket_waitlist_event_status
        ON public.ticket_waitlist_requests (event_id, status);

      CREATE TABLE IF NOT EXISTS public.ticket_booking_code_hashes (
        hash_sha256 TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        listing_id TEXT,
        seller_id TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_booking_hashes_event_status
        ON public.ticket_booking_code_hashes (event_id, status);
      CREATE INDEX IF NOT EXISTS idx_ticket_booking_hashes_listing_id
        ON public.ticket_booking_code_hashes (listing_id);

      CREATE TABLE IF NOT EXISTS public.event_pic_dispatch (
        event_id TEXT PRIMARY KEY,
        pic_officer_name TEXT,
        pic_officer_whatsapp TEXT,
        gate_meeting_point TEXT,
        standby_time_wib TEXT,
        dispatch_status TEXT NOT NULL DEFAULT 'UNASSIGNED',
        updated_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_event_pic_dispatch_status
        ON public.event_pic_dispatch (dispatch_status);
    `);
    schemaEnsured = true;
  })().catch(err => {
    schemaEnsurePromise = null;
    throw err;
  });

  return schemaEnsurePromise;
}

function normalizeWhatsApp(raw) {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Allow leading + and standard separators (spaces, hyphens, dots, parentheses)
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Normalize Indonesian local mobile (08xxx) -> 628xxx
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.length < 8 || digits.length > 16) return null;
  if (/^(\d)\1+$/.test(digits)) return null;
  return digits;
}

function maskWhatsApp(rawDigits) {
  const digits = String(rawDigits || '').replace(/\D/g, '');
  if (!digits) return '****';
  if (digits.length >= 9) {
    return `${digits.slice(0, 5)}****${digits.slice(-4)}`;
  }
  if (digits.length >= 6) {
    return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
  }
  return '****';
}

function normalizeBookingCode(rawCode) {
  if (rawCode === null || rawCode === undefined) return null;
  const cleaned = String(rawCode).trim().toUpperCase().replace(/[\s-]+/g, '');
  if (cleaned.length < 3 || cleaned.length > 128) return null;
  return cleaned;
}

function computeBookingCodeHash(eventId, rawCode) {
  const cleanEventId = String(eventId || '').trim();
  const normalized = normalizeBookingCode(rawCode);
  if (!cleanEventId || !normalized) return null;
  return crypto
    .createHash('sha256')
    .update(`${cleanEventId}:${normalized}`)
    .digest('hex');
}

function normalizeLocale(raw) {
  const val = String(raw || 'id').trim().toLowerCase();
  if (val === 'fil' || val === 'fil-ph' || val === 'tl-ph') return 'tl';
  const short = val.split('-')[0];
  return ALLOWED_LOCALES.includes(short) ? short : 'id';
}

async function upsertWaitlistRequest({
  eventId,
  eventTitle,
  contactWhatsApp,
  seatPreference = null,
  quantity = 1,
  maxBudgetIdr = null,
  locale = 'id'
}) {
  const cleanEventId = String(eventId || '').trim();
  const cleanEventTitle = String(eventTitle || cleanEventId).trim().slice(0, 200);
  const normalizedWa = normalizeWhatsApp(contactWhatsApp);
  if (!cleanEventId || !normalizedWa) {
    const err = new Error('Invalid event_id or contact_whatsapp');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  const parsedQty = parseInt(quantity, 10);
  if (Number.isNaN(parsedQty) || parsedQty < 1 || parsedQty > 6) {
    const err = new Error('Quantity must be an integer between 1 and 6');
    err.code = 'INVALID_QUANTITY';
    err.status = 400;
    throw err;
  }

  let parsedBudget = null;
  if (maxBudgetIdr !== null && maxBudgetIdr !== undefined && String(maxBudgetIdr).trim() !== '') {
    const num = Number(String(maxBudgetIdr).replace(/[^\d]/g, ''));
    if (!Number.isFinite(num) || num < 500000) {
      const err = new Error('max_budget_idr must be at least Rp 500.000');
      err.code = 'BUDGET_BELOW_MINIMUM';
      err.status = 400;
      throw err;
    }
    parsedBudget = Math.round(num);
  }

  const cleanSeatPref = seatPreference ? String(seatPreference).trim().slice(0, 120) : null;
  const cleanLocale = normalizeLocale(locale);
  const nowIso = new Date().toISOString();
  const pool = getPgPoolIfAvailable();

  if (pool) {
    try {
      await ensureTables(pool);
      const existingRes = await pool.query(
        'SELECT id, created_at FROM public.ticket_waitlist_requests WHERE event_id = $1 AND contact_whatsapp = $2 LIMIT 1',
        [cleanEventId, normalizedWa]
      );
      if (existingRes.rows.length > 0) {
        const existingId = existingRes.rows[0].id;
        const upd = await pool.query(
          `UPDATE public.ticket_waitlist_requests
             SET event_title = $1,
                 seat_preference = $2,
                 quantity = $3,
                 max_budget_idr = $4,
                 locale = $5,
                 status = 'ACTIVE',
                 updated_at = NOW()
           WHERE id = $6
           RETURNING id, event_id, event_title, seat_preference, quantity, max_budget_idr, locale, status, created_at, updated_at`,
          [cleanEventTitle, cleanSeatPref, parsedQty, parsedBudget, cleanLocale, existingId]
        );
        return { created: false, record: upd.rows[0] };
      }

      const newId = `wl-${uuidv4()}`;
      const ins = await pool.query(
        `INSERT INTO public.ticket_waitlist_requests
           (id, event_id, event_title, contact_whatsapp, seat_preference, quantity, max_budget_idr, locale, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', NOW(), NOW())
         ON CONFLICT (event_id, contact_whatsapp)
         DO UPDATE SET
           event_title = EXCLUDED.event_title,
           seat_preference = EXCLUDED.seat_preference,
           quantity = EXCLUDED.quantity,
           max_budget_idr = EXCLUDED.max_budget_idr,
           locale = EXCLUDED.locale,
           status = 'ACTIVE',
           updated_at = NOW()
         RETURNING id, event_id, event_title, seat_preference, quantity, max_budget_idr, locale, status, created_at, updated_at`,
        [newId, cleanEventId, cleanEventTitle, normalizedWa, cleanSeatPref, parsedQty, parsedBudget, cleanLocale]
      );
      return { created: true, record: ins.rows[0] };
    } catch (err) {
      console.warn('[WaitlistDispatchRepo] Postgres waitlist upsert fallback to in-memory:', err.message);
    }
  }

  const key = `${cleanEventId}::${normalizedWa}`;
  const existing = inMemoryStore.waitlist.get(key);
  if (existing) {
    const updated = {
      ...existing,
      event_title: cleanEventTitle,
      seat_preference: cleanSeatPref,
      quantity: parsedQty,
      max_budget_idr: parsedBudget,
      locale: cleanLocale,
      status: 'ACTIVE',
      updated_at: nowIso
    };
    inMemoryStore.waitlist.set(key, updated);
    const { contact_whatsapp: _omit, ...safeRecord } = updated;
    return { created: false, record: safeRecord };
  }

  const createdRecord = {
    id: `wl-${uuidv4()}`,
    event_id: cleanEventId,
    event_title: cleanEventTitle,
    contact_whatsapp: normalizedWa,
    seat_preference: cleanSeatPref,
    quantity: parsedQty,
    max_budget_idr: parsedBudget,
    locale: cleanLocale,
    status: 'ACTIVE',
    created_at: nowIso,
    updated_at: nowIso
  };
  inMemoryStore.waitlist.set(key, createdRecord);
  const { contact_whatsapp: _omit, ...safeRecord } = createdRecord;
  return { created: true, record: safeRecord };
}

async function listWaitlistSummaryByEvent() {
  const pool = getPgPoolIfAvailable();
  let rows = [];

  if (pool) {
    try {
      await ensureTables(pool);
      const res = await pool.query(`
        SELECT id, event_id, event_title, contact_whatsapp, seat_preference, quantity, max_budget_idr, locale, status, created_at, updated_at
        FROM public.ticket_waitlist_requests
        WHERE status = 'ACTIVE'
        ORDER BY updated_at DESC
        LIMIT 500
      `);
      rows = res.rows || [];
    } catch (err) {
      console.warn('[WaitlistDispatchRepo] Postgres waitlist summary fallback to in-memory:', err.message);
      rows = Array.from(inMemoryStore.waitlist.values()).filter(r => r.status === 'ACTIVE');
    }
  } else {
    rows = Array.from(inMemoryStore.waitlist.values()).filter(r => r.status === 'ACTIVE');
  }

  const byEvent = new Map();
  for (const row of rows) {
    const eid = row.event_id;
    if (!byEvent.has(eid)) {
      byEvent.set(eid, {
        event_id: eid,
        event_title: row.event_title || eid,
        waitlist_count: 0,
        total_tickets_requested: 0,
        latest_requests: []
      });
    }
    const bucket = byEvent.get(eid);
    bucket.waitlist_count += 1;
    bucket.total_tickets_requested += Number(row.quantity || 1);
    if (bucket.latest_requests.length < 10) {
      bucket.latest_requests.push({
        id: row.id,
        contact_whatsapp_masked: maskWhatsApp(row.contact_whatsapp),
        seat_preference: row.seat_preference || null,
        quantity: Number(row.quantity || 1),
        max_budget_idr: row.max_budget_idr ? Number(row.max_budget_idr) : null,
        locale: row.locale || 'id',
        updated_at: row.updated_at || row.created_at
      });
    }
  }

  return Array.from(byEvent.values()).sort((a, b) => b.waitlist_count - a.waitlist_count);
}

async function checkBookingCodeDuplicate(eventId, rawCode, excludeListingId = null) {
  const hash = computeBookingCodeHash(eventId, rawCode);
  if (!hash) {
    const err = new Error('Valid event_id and booking_code (min 3 characters) are required');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  const pool = getPgPoolIfAvailable();
  if (pool) {
    try {
      await ensureTables(pool);
      const res = await pool.query(
        `SELECT hash_sha256, event_id, listing_id, seller_id, status, created_at
           FROM public.ticket_booking_code_hashes
          WHERE hash_sha256 = $1 AND status = 'ACTIVE'
          LIMIT 1`,
        [hash]
      );
      const row = res.rows[0] || null;
      if (row && (!excludeListingId || row.listing_id !== excludeListingId)) {
        return {
          hash_sha256: hash,
          duplicate: true,
          existing: {
            listing_id: row.listing_id,
            seller_id: row.seller_id,
            status: row.status,
            created_at: row.created_at
          }
        };
      }
      return { hash_sha256: hash, duplicate: false, existing: null };
    } catch (err) {
      console.warn('[WaitlistDispatchRepo] Postgres checkBookingCodeDuplicate fallback to in-memory:', err.message);
    }
  }

  const existing = inMemoryStore.bookingHashes.get(hash);
  if (existing && existing.status === 'ACTIVE' && (!excludeListingId || existing.listing_id !== excludeListingId)) {
    return {
      hash_sha256: hash,
      duplicate: true,
      existing: {
        listing_id: existing.listing_id,
        seller_id: existing.seller_id,
        status: existing.status,
        created_at: existing.created_at
      }
    };
  }
  return { hash_sha256: hash, duplicate: false, existing: null };
}

async function registerBookingCodeHash({ eventId, listingId, sellerId, rawCode }) {
  const cleanEventId = String(eventId || '').trim();
  const hash = computeBookingCodeHash(cleanEventId, rawCode);
  if (!hash) return null;

  const dupCheck = await checkBookingCodeDuplicate(cleanEventId, rawCode, listingId);
  if (dupCheck.duplicate) {
    const err = new Error('Duplicate ticket booking reference detected for this event');
    err.code = 'DUPLICATE_TICKET_DETECTED';
    err.status = 409;
    err.existingListingId = dupCheck.existing ? dupCheck.existing.listing_id : null;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const pool = getPgPoolIfAvailable();
  if (pool) {
    try {
      await ensureTables(pool);
      await pool.query(
        `INSERT INTO public.ticket_booking_code_hashes (hash_sha256, event_id, listing_id, seller_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
         ON CONFLICT (hash_sha256)
         DO UPDATE SET
           listing_id = EXCLUDED.listing_id,
           seller_id = EXCLUDED.seller_id,
           status = 'ACTIVE',
           updated_at = NOW()
         WHERE public.ticket_booking_code_hashes.status <> 'ACTIVE'
            OR public.ticket_booking_code_hashes.listing_id = EXCLUDED.listing_id`,
        [hash, cleanEventId, listingId || null, sellerId || null]
      );
      const verify = await pool.query(
        'SELECT listing_id FROM public.ticket_booking_code_hashes WHERE hash_sha256 = $1 AND status = $2 LIMIT 1',
        [hash, 'ACTIVE']
      );
      if (verify.rows[0] && listingId && verify.rows[0].listing_id && verify.rows[0].listing_id !== listingId) {
        const err = new Error('Duplicate ticket booking reference detected for this event');
        err.code = 'DUPLICATE_TICKET_DETECTED';
        err.status = 409;
        throw err;
      }
      return { hash_sha256: hash, status: 'ACTIVE' };
    } catch (err) {
      if (err.code === 'DUPLICATE_TICKET_DETECTED') throw err;
      console.warn('[WaitlistDispatchRepo] Postgres registerBookingCodeHash fallback to in-memory:', err.message);
    }
  }

  inMemoryStore.bookingHashes.set(hash, {
    hash_sha256: hash,
    event_id: cleanEventId,
    listing_id: listingId || null,
    seller_id: sellerId || null,
    status: 'ACTIVE',
    created_at: nowIso,
    updated_at: nowIso
  });

  return { hash_sha256: hash, status: 'ACTIVE' };
}

async function releaseBookingCodeHashByListing(listingId) {
  if (!listingId) return;
  const pool = getPgPoolIfAvailable();
  if (pool) {
    try {
      await ensureTables(pool);
      await pool.query(
        `UPDATE public.ticket_booking_code_hashes SET status = 'RELEASED', updated_at = NOW() WHERE listing_id = $1`,
        [listingId]
      );
    } catch (_) {}
  }
  for (const [hash, rec] of inMemoryStore.bookingHashes.entries()) {
    if (rec.listing_id === listingId) {
      inMemoryStore.bookingHashes.set(hash, { ...rec, status: 'RELEASED', updated_at: new Date().toISOString() });
    }
  }
}

async function getBookingHashStatusMap(listingIds = []) {
  const result = new Map();
  const pool = getPgPoolIfAvailable();
  let records = [];

  if (pool && listingIds.length > 0) {
    try {
      await ensureTables(pool);
      const res = await pool.query(
        `SELECT hash_sha256, event_id, listing_id, status
           FROM public.ticket_booking_code_hashes
          WHERE listing_id = ANY($1::text[])`,
        [listingIds]
      );
      records = res.rows || [];
    } catch (_) {
      records = Array.from(inMemoryStore.bookingHashes.values());
    }
  } else {
    records = Array.from(inMemoryStore.bookingHashes.values());
  }

  for (const rec of records) {
    if (!rec.listing_id) continue;
    result.set(rec.listing_id, {
      booking_hash_status: rec.status === 'ACTIVE' ? 'UNIQUE_VERIFIED' : 'RELEASED',
      booking_hash_short: rec.hash_sha256 ? String(rec.hash_sha256).slice(0, 12) : null
    });
  }
  return result;
}

async function getPicDispatchMap() {
  const out = {};
  const pool = getPgPoolIfAvailable();

  if (pool) {
    try {
      await ensureTables(pool);
      const res = await pool.query(`
        SELECT event_id, pic_officer_name, pic_officer_whatsapp, gate_meeting_point, standby_time_wib, dispatch_status, updated_by, updated_at
        FROM public.event_pic_dispatch
      `);
      for (const row of res.rows || []) {
        out[row.event_id] = row;
      }
      return out;
    } catch (err) {
      console.warn('[WaitlistDispatchRepo] Postgres getPicDispatchMap fallback to in-memory:', err.message);
    }
  }

  for (const [eid, rec] of inMemoryStore.picDispatch.entries()) {
    out[eid] = { ...rec };
  }
  return out;
}

async function upsertPicDispatch(eventId, payload = {}, updatedBy = 'admin') {
  const cleanEventId = String(eventId || '').trim();
  if (!cleanEventId) {
    const err = new Error('eventId is required');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  const rawStatus = String(payload.dispatch_status || 'UNASSIGNED').trim().toUpperCase();
  if (!ALLOWED_DISPATCH_STATUSES.includes(rawStatus)) {
    const err = new Error(`Invalid dispatch_status. Allowed: ${ALLOWED_DISPATCH_STATUSES.join(', ')}`);
    err.code = 'INVALID_DISPATCH_STATUS';
    err.status = 400;
    throw err;
  }

  const officerName = payload.pic_officer_name !== undefined && payload.pic_officer_name !== null
    ? String(payload.pic_officer_name).trim().slice(0, 120)
    : null;
  const officerWaRaw = payload.pic_officer_whatsapp !== undefined && payload.pic_officer_whatsapp !== null
    ? String(payload.pic_officer_whatsapp).trim()
    : '';
  const officerWa = officerWaRaw ? (normalizeWhatsApp(officerWaRaw) || officerWaRaw.slice(0, 32)) : null;
  const gatePoint = payload.gate_meeting_point !== undefined && payload.gate_meeting_point !== null
    ? String(payload.gate_meeting_point).trim().slice(0, 200)
    : null;
  const standbyTime = payload.standby_time_wib !== undefined && payload.standby_time_wib !== null
    ? String(payload.standby_time_wib).trim().slice(0, 60)
    : null;
  const nowIso = new Date().toISOString();

  const pool = getPgPoolIfAvailable();
  if (pool) {
    try {
      await ensureTables(pool);
      const res = await pool.query(
        `INSERT INTO public.event_pic_dispatch
           (event_id, pic_officer_name, pic_officer_whatsapp, gate_meeting_point, standby_time_wib, dispatch_status, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (event_id)
         DO UPDATE SET
           pic_officer_name = EXCLUDED.pic_officer_name,
           pic_officer_whatsapp = EXCLUDED.pic_officer_whatsapp,
           gate_meeting_point = EXCLUDED.gate_meeting_point,
           standby_time_wib = EXCLUDED.standby_time_wib,
           dispatch_status = EXCLUDED.dispatch_status,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING event_id, pic_officer_name, pic_officer_whatsapp, gate_meeting_point, standby_time_wib, dispatch_status, updated_by, updated_at`,
        [cleanEventId, officerName, officerWa, gatePoint, standbyTime, rawStatus, String(updatedBy || 'admin')]
      );
      return res.rows[0];
    } catch (err) {
      console.warn('[WaitlistDispatchRepo] Postgres upsertPicDispatch fallback to in-memory:', err.message);
    }
  }

  const record = {
    event_id: cleanEventId,
    pic_officer_name: officerName,
    pic_officer_whatsapp: officerWa,
    gate_meeting_point: gatePoint,
    standby_time_wib: standbyTime,
    dispatch_status: rawStatus,
    updated_by: String(updatedBy || 'admin'),
    updated_at: nowIso
  };
  inMemoryStore.picDispatch.set(cleanEventId, record);
  return { ...record };
}

function resetInMemory() {
  inMemoryStore.waitlist.clear();
  inMemoryStore.bookingHashes.clear();
  inMemoryStore.picDispatch.clear();
}

module.exports = {
  ALLOWED_DISPATCH_STATUSES,
  normalizeWhatsApp,
  maskWhatsApp,
  normalizeBookingCode,
  computeBookingCodeHash,
  upsertWaitlistRequest,
  listWaitlistSummaryByEvent,
  checkBookingCodeDuplicate,
  registerBookingCodeHash,
  releaseBookingCodeHashByListing,
  getBookingHashStatusMap,
  getPicDispatchMap,
  upsertPicDispatch,
  resetInMemory
};
