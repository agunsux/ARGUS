/**
 * TIKUM / ARGUS Demand Capture & Alert Service
 *
 * "Kabari Saya / Saya Cari Tiket"
 *
 * Enforces:
 * - Truthfulness Invariant: Public count ONLY shown if unique verified demand >= 5.
 *   Never fabricate fake waitlists, phantom queues, or FOMO numbers.
 * - UU Perlindungan Data Pribadi (UU PDP No. 27/2022):
 *   Mandatory consent checkbox recorded with timestamp.
 * - Rate Limiting: Max 3 submissions per hour per event for same IP or contact.
 * - Dual Storage: In-memory array (with sync to state.demand_alerts) + Postgres repository integration.
 * - Admin Export: CSV export for direct manual seller recruitment & buyer notification.
 * - Stub Notifier: Safe queue logging without live external network dependencies.
 */

const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const INDO_PHONE_REGEX = /^\+628[1-9][0-9]{6,10}$/;

class DemandCaptureService {
  constructor(options = {}) {
    this.demands = [];
    this.rateLimitMap = new Map(); // key -> [timestamp, ...]
    this.pool = options.pool || null;
    this.requirePersistentStorage = options.requirePersistentStorage !== undefined
      ? Boolean(options.requirePersistentStorage)
      : null;
  }

  /**
   * Determines whether persistent PostgreSQL storage is required/active.
   * - True if pool or requirePersistentStorage is explicitly configured.
   * - False in unit test mode (NODE_ENV === 'test') unless explicitly configured.
   * - True in production/serverless or when DATABASE_URL is configured outside test mode.
   */
  isPersistentMode() {
    if (this.requirePersistentStorage !== null) {
      return this.requirePersistentStorage;
    }
    if (this.pool) {
      return true;
    }
    if (process.env.NODE_ENV === 'test') {
      return false;
    }
    return Boolean(process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL || process.env.NODE_ENV === 'production' || process.env.VERCEL);
  }

  /**
   * Lazily initializes or returns the PostgreSQL connection pool.
   */
  getPool() {
    if (this.pool) {
      return this.pool;
    }
    const rawConn = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
    if (!rawConn || typeof rawConn !== 'string' || !rawConn.trim()) {
      return null;
    }
    let cleanConnStr = rawConn.trim();
    if (cleanConnStr.startsWith('"') && cleanConnStr.endsWith('"')) cleanConnStr = cleanConnStr.slice(1, -1);
    if (cleanConnStr.startsWith("'") && cleanConnStr.endsWith("'")) cleanConnStr = cleanConnStr.slice(1, -1);
    try {
      const u = new URL(cleanConnStr);
      u.searchParams.delete('channel_binding');
      u.searchParams.delete('sslmode');
      cleanConnStr = u.toString();
    } catch (_) {}
    const isLocalhost = cleanConnStr.includes('localhost') || cleanConnStr.includes('127.0.0.1');
    const ssl = isLocalhost ? undefined : { rejectUnauthorized: false };
    this.pool = new Pool({
      connectionString: cleanConnStr,
      ssl,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000
    });
    return this.pool;
  }

  /**
   * Validates and normalizes WhatsApp number or Email address.
   */
  static validateContact(contact) {
    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return { valid: false, error: 'Kontak WhatsApp atau Email wajib diisi', code: 'CONTACT_REQUIRED' };
    }

    const trimmed = contact.trim();

    // Check email
    if (EMAIL_REGEX.test(trimmed)) {
      return { valid: true, type: 'EMAIL', normalized: trimmed.toLowerCase() };
    }

    // Check phone / WhatsApp
    let cleanPhone = trimmed.replace(/[\s\-\(\)\.]/g, '');
    if (cleanPhone.startsWith('08')) {
      cleanPhone = '+628' + cleanPhone.slice(2);
    } else if (cleanPhone.startsWith('628')) {
      cleanPhone = '+628' + cleanPhone.slice(3);
    } else if (cleanPhone.startsWith('00628')) {
      cleanPhone = '+628' + cleanPhone.slice(5);
    }

    if (INDO_PHONE_REGEX.test(cleanPhone)) {
      return { valid: true, type: 'WHATSAPP', normalized: cleanPhone };
    }

    return {
      valid: false,
      error: 'Nomor WhatsApp (contoh: 08123456789 atau +628123456789) atau Email tidak valid',
      code: 'INVALID_CONTACT'
    };
  }

  /**
   * Validates quantity of tickets requested (1-4).
   */
  static validateQty(qty) {
    if (qty === undefined || qty === null || qty === '') {
      return { valid: true, qty: 1 };
    }
    const q = parseInt(qty, 10);
    if (isNaN(q) || q < 1 || q > 4) {
      return { valid: false, error: 'Jumlah tiket harus antara 1 sampai 4', code: 'INVALID_QTY' };
    }
    return { valid: true, qty: q };
  }

  /**
   * Validates optional max budget per ticket.
   */
  static validateMaxPrice(maxPrice) {
    if (maxPrice === undefined || maxPrice === null || maxPrice === '') {
      return { valid: true, maxPrice: null };
    }
    const clean = String(maxPrice).replace(/[Rp\s\.,]/gi, '');
    const p = parseInt(clean, 10);
    if (isNaN(p) || p < 0) {
      return { valid: false, error: 'Budget maksimal harus berupa angka positif', code: 'INVALID_MAX_PRICE' };
    }
    return { valid: true, maxPrice: p };
  }

  /**
   * Validates mandatory consent under UU PDP No. 27/2022.
   */
  static validateConsent(consent) {
    const isConsentGiven = consent === true || consent === 'true' || consent === 1 || consent === '1' || consent === 'on';
    if (!isConsentGiven) {
      return {
        valid: false,
        error: 'Persetujuan untuk dihubungi wajib dicentang sesuai UU Pelindungan Data Pribadi',
        code: 'CONSENT_REQUIRED'
      };
    }
    return { valid: true };
  }

  /**
   * Checks sliding window rate limit: max 3 submissions per hour per key.
   */
  checkRateLimit(key, maxLimit = 3, windowMs = 3600000) {
    if (!key) return { allowed: true };
    const now = Date.now();
    const timestamps = (this.rateLimitMap.get(key) || []).filter(ts => now - ts < windowMs);

    if (timestamps.length >= maxLimit) {
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return {
        allowed: false,
        error: 'Terlalu banyak permintaan untuk event ini. Silakan coba lagi nanti.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds
      };
    }

    return { allowed: true, timestamps };
  }

  /**
   * Records a rate limit hit.
   */
  recordRateLimitHit(key, windowMs = 3600000) {
    if (!key) return;
    const now = Date.now();
    const timestamps = (this.rateLimitMap.get(key) || []).filter(ts => now - ts < windowMs);
    timestamps.push(now);
    this.rateLimitMap.set(key, timestamps);
  }

  /**
   * Notifier stub: logs notification intention without live network dependency.
   */
  notifyStub(demandRecord) {
    console.log(`[DemandAlert Notifier] Alert queued for ${demandRecord.contact_type} ${demandRecord.contact} (Event: ${demandRecord.event_id}, Qty: ${demandRecord.qty})`);
    return {
      status: 'QUEUED',
      channel: demandRecord.contact_type,
      recipient: demandRecord.contact,
      queued_at: new Date().toISOString()
    };
  }

  /**
   * Validates input parameters, enforces rate limit, and builds candidate demand record.
   */
  _validateAndPrepareDemand({
    eventId,
    contact,
    contactInfo,
    qty = 1,
    maxPrice = null,
    maxBudget = null,
    consent = true,
    clientIp = null,
    userAgent = null,
    metadata = {}
  }) {
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      const err = new Error('eventId is required');
      err.code = 'EVENT_ID_REQUIRED';
      throw err;
    }

    const rawContact = contact || contactInfo;
    const contactRes = DemandCaptureService.validateContact(rawContact);
    if (!contactRes.valid) {
      const err = new Error(contactRes.error);
      err.code = contactRes.code;
      throw err;
    }

    const qtyRes = DemandCaptureService.validateQty(qty);
    if (!qtyRes.valid) {
      const err = new Error(qtyRes.error);
      err.code = qtyRes.code;
      throw err;
    }

    const rawPrice = maxPrice !== null && maxPrice !== undefined ? maxPrice : maxBudget;
    const priceRes = DemandCaptureService.validateMaxPrice(rawPrice);
    if (!priceRes.valid) {
      const err = new Error(priceRes.error);
      err.code = priceRes.code;
      throw err;
    }

    const consentRes = DemandCaptureService.validateConsent(consent);
    if (!consentRes.valid) {
      const err = new Error(consentRes.error);
      err.code = consentRes.code;
      throw err;
    }

    // Rate Limiting (IP + Contact per event)
    const ipKey = clientIp ? `ip:${clientIp}:${eventId}` : null;
    const contactKey = `contact:${contactRes.normalized}:${eventId}`;

    if (ipKey) {
      const ipLimit = this.checkRateLimit(ipKey);
      if (!ipLimit.allowed) {
        const err = new Error(ipLimit.error);
        err.code = ipLimit.code;
        err.retryAfterSeconds = ipLimit.retryAfterSeconds;
        throw err;
      }
    }

    const contactLimit = this.checkRateLimit(contactKey);
    if (!contactLimit.allowed) {
      const err = new Error(contactLimit.error);
      err.code = contactLimit.code;
      err.retryAfterSeconds = contactLimit.retryAfterSeconds;
      throw err;
    }

    const now = new Date().toISOString();
    const demandRecord = {
      id: `dem-${uuidv4()}`,
      event_id: eventId.trim(),
      contact: contactRes.normalized,
      contact_type: contactRes.type,
      qty: qtyRes.qty,
      max_price: priceRes.maxPrice,
      status: 'WAITING',
      notified_at: null,
      consent_at: now,
      created_at: now,
      metadata: {
        ...metadata,
        contact_type: contactRes.type,
        client_ip: clientIp || null,
        user_agent: userAgent || null
      }
    };

    return { demandRecord, ipKey, contactKey };
  }

  _normalizeDbRow(row, fallbackContactType = null) {
    if (!row) return null;
    const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const inferredType = meta.contact_type || fallbackContactType || (String(row.contact || '').includes('@') ? 'EMAIL' : 'WHATSAPP');
    return {
      id: row.id,
      event_id: row.event_id,
      contact: row.contact,
      contact_type: inferredType,
      qty: Number(row.qty || 1),
      max_price: row.max_price !== null && row.max_price !== undefined ? Number(row.max_price) : null,
      status: row.status || 'WAITING',
      notified_at: row.notified_at ? new Date(row.notified_at).toISOString() : null,
      notified_by: meta.notified_by || null,
      consent_at: row.consent_at ? new Date(row.consent_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      metadata: meta
    };
  }

  _syncRecordInMemory(demandRecord) {
    const idx = this.demands.findIndex(d => d.id === demandRecord.id);
    if (idx >= 0) {
      this.demands[idx] = demandRecord;
    } else {
      this.demands.push(demandRecord);
    }

    try {
      const { state } = require('../database');
      if (state && Array.isArray(state.demand_alerts)) {
        const sIdx = state.demand_alerts.findIndex(d => d.id === demandRecord.id);
        if (sIdx >= 0) {
          state.demand_alerts[sIdx] = demandRecord;
        } else {
          state.demand_alerts.push(demandRecord);
        }
      }
    } catch (_) {}
  }

  /**
   * Registers buyer demand synchronously (in-memory mode / unit tests).
   */
  registerInterest(params = {}) {
    const { demandRecord, ipKey, contactKey } = this._validateAndPrepareDemand(params);

    if (ipKey) this.recordRateLimitHit(ipKey);
    this.recordRateLimitHit(contactKey);

    this._syncRecordInMemory(demandRecord);
    const stubResult = this.notifyStub(demandRecord);

    return {
      record: demandRecord,
      notification: stubResult,
      persisted: true
    };
  }

  /**
   * Registers buyer demand asynchronously with PostgreSQL persistence.
   * When persistent mode is active:
   * - Writes to demand_alerts table in PostgreSQL (deduplicating active WAITING alerts per contact+event).
   * - If demand_alerts does not exist (e.g. pre-migration 42P01) or DB write fails, fails closed
   *   with DEMAND_STORAGE_UNAVAILABLE (HTTP 503) and NEVER acknowledges false success.
   */
  async registerInterestAsync(params = {}) {
    const { demandRecord, ipKey, contactKey } = this._validateAndPrepareDemand(params);

    if (!this.isPersistentMode()) {
      if (ipKey) this.recordRateLimitHit(ipKey);
      this.recordRateLimitHit(contactKey);
      this._syncRecordInMemory(demandRecord);
      const stubResult = this.notifyStub(demandRecord);
      return {
        record: demandRecord,
        notification: stubResult,
        persisted: true
      };
    }

    const pool = this.getPool();
    if (!pool) {
      const err = new Error('Layanan daftar tunggu belum tersedia karena koneksi penyimpanan belum aktif. Permintaan Anda belum disimpan.');
      err.code = 'DEMAND_STORAGE_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    try {
      const existing = await pool.query(
        `SELECT id FROM demand_alerts WHERE event_id = $1 AND contact = $2 AND status = 'WAITING' LIMIT 1`,
        [demandRecord.event_id, demandRecord.contact]
      );

      let savedRow;
      if (existing.rows && existing.rows.length > 0) {
        const existingId = existing.rows[0].id;
        const upd = await pool.query(
          `UPDATE demand_alerts
           SET qty = $1, max_price = $2, consent_at = $3, metadata = $4::jsonb
           WHERE id = $5
           RETURNING *`,
          [
            demandRecord.qty,
            demandRecord.max_price,
            demandRecord.consent_at,
            JSON.stringify(demandRecord.metadata || {}),
            existingId
          ]
        );
        savedRow = upd.rows[0];
      } else {
        const ins = await pool.query(
          `INSERT INTO demand_alerts (
             id, event_id, contact, qty, max_price, status, notified_at, consent_at, created_at, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           RETURNING *`,
          [
            demandRecord.id,
            demandRecord.event_id,
            demandRecord.contact,
            demandRecord.qty,
            demandRecord.max_price,
            demandRecord.status,
            demandRecord.notified_at,
            demandRecord.consent_at,
            demandRecord.created_at,
            JSON.stringify(demandRecord.metadata || {})
          ]
        );
        savedRow = ins.rows[0];
      }

      if (ipKey) this.recordRateLimitHit(ipKey);
      this.recordRateLimitHit(contactKey);

      const normalizedRecord = this._normalizeDbRow(savedRow, demandRecord.contact_type);
      this._syncRecordInMemory(normalizedRecord);
      const stubResult = this.notifyStub(normalizedRecord);

      return {
        record: normalizedRecord,
        notification: stubResult,
        persisted: true
      };
    } catch (dbErr) {
      const err = new Error('Layanan daftar tunggu sedang dalam pemeliharaan database. Permintaan Anda belum disimpan, silakan coba beberapa saat lagi.');
      err.code = 'DEMAND_STORAGE_UNAVAILABLE';
      err.status = 503;
      err.dbErrorCode = dbErr && dbErr.code ? dbErr.code : 'DB_ERROR';
      throw err;
    }
  }

  /**
   * Returns verified demand count (unique waiting contacts) for an event.
   */
  getVerifiedDemandCount(eventId) {
    if (!eventId) return 0;
    const uniqueContacts = new Set(
      this.demands
        .filter(d => d.event_id === eventId && d.status === 'WAITING')
        .map(d => d.contact)
    );
    return uniqueContacts.size;
  }

  _formatPublicStats(verifiedCount) {
    const count = Number(verifiedCount) || 0;
    if (count >= 5) {
      return {
        verified_count: count,
        show_count: true,
        badge_text: `${count} orang sedang mencari tiket ini`,
        headline: `${count} orang sedang menunggu tiket ini`
      };
    }
    return {
      verified_count: 0,
      show_count: false,
      badge_text: 'Daftar untuk dikabari pertama saat ada tiket tersedia',
      headline: 'Daftar untuk dikabari pertama saat tiket tersedia'
    };
  }

  /**
   * Truthfulness Invariant: Public count ONLY shown if count >= 5.
   * If < 5, returns neutral copy and masked count = 0 to prevent FOMO deception.
   */
  getPublicDemandStats(eventId) {
    const verifiedCount = this.getVerifiedDemandCount(eventId);
    return this._formatPublicStats(verifiedCount);
  }

  /**
   * Async version of getPublicDemandStats that queries PostgreSQL in persistent mode
   * and safely degrades to neutral default (verified_count: 0, show_count: false)
   * if demand_alerts does not exist yet.
   */
  async getPublicDemandStatsAsync(eventId) {
    if (!eventId) {
      return this._formatPublicStats(0);
    }
    if (!this.isPersistentMode()) {
      return this.getPublicDemandStats(eventId);
    }
    const pool = this.getPool();
    if (!pool) {
      return this._formatPublicStats(0);
    }
    try {
      const res = await pool.query(
        `SELECT COUNT(DISTINCT contact)::int AS cnt
         FROM demand_alerts
         WHERE event_id = $1 AND status = 'WAITING'`,
        [eventId]
      );
      const count = (res.rows && res.rows[0] && Number(res.rows[0].cnt)) || 0;
      return this._formatPublicStats(count);
    } catch (_) {
      return this._formatPublicStats(0);
    }
  }

  /**
   * Returns demand alerts for an event (backwards compatibility).
   */
  getDemandForEvent(eventId) {
    return this.demands.filter(d => d.event_id === eventId);
  }

  /**
   * Returns all demands.
   */
  getAllDemands() {
    return [...this.demands];
  }

  /**
   * Admin: List alerts with optional filters and pagination (in-memory).
   */
  getAdminAlerts({ eventId = null, status = null, notified = null, limit = 50, offset = 0 } = {}) {
    let filtered = [...this.demands];

    if (eventId) {
      filtered = filtered.filter(d => d.event_id === eventId);
    }
    if (status) {
      filtered = filtered.filter(d => (d.status || '').toUpperCase() === status.toUpperCase());
    }
    if (notified !== null && notified !== undefined) {
      const isNotified = notified === true || notified === 'true';
      filtered = filtered.filter(d => isNotified ? Boolean(d.notified_at) : !d.notified_at);
    }

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    return {
      alerts: page,
      total,
      limit,
      offset
    };
  }

  /**
   * Admin Async: Queries PostgreSQL demand_alerts in persistent mode.
   * Fails closed (503 DEMAND_STORAGE_UNAVAILABLE) if demand_alerts table does not exist.
   */
  async getAdminAlertsAsync({ eventId = null, status = null, notified = null, limit = 50, offset = 0 } = {}) {
    if (!this.isPersistentMode()) {
      return this.getAdminAlerts({ eventId, status, notified, limit, offset });
    }

    const pool = this.getPool();
    if (!pool) {
      const err = new Error('Penyimpanan daftar tunggu belum tersedia.');
      err.code = 'DEMAND_STORAGE_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    try {
      const conditions = [];
      const params = [];

      if (eventId) {
        params.push(eventId);
        conditions.push(`event_id = $${params.length}`);
      }
      if (status) {
        params.push(String(status).toUpperCase());
        conditions.push(`UPPER(status) = $${params.length}`);
      }
      if (notified !== null && notified !== undefined && notified !== '') {
        const isNotified = notified === true || notified === 'true';
        conditions.push(isNotified ? `notified_at IS NOT NULL` : `notified_at IS NULL`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM demand_alerts ${whereClause}`,
        params
      );
      const total = (countRes.rows && countRes.rows[0] && Number(countRes.rows[0].total)) || 0;

      const safeLimit = Math.max(1, Math.min(100000, Number(limit) || 50));
      const safeOffset = Math.max(0, Number(offset) || 0);
      const queryParams = [...params, safeLimit, safeOffset];

      const rowsRes = await pool.query(
        `SELECT * FROM demand_alerts ${whereClause} ORDER BY created_at DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
        queryParams
      );

      const alerts = (rowsRes.rows || []).map(r => this._normalizeDbRow(r));
      return {
        alerts,
        total,
        limit: safeLimit,
        offset: safeOffset
      };
    } catch (dbErr) {
      const err = new Error('Tabel demand_alerts belum tersedia atau database tidak dapat diakses.');
      err.code = 'DEMAND_STORAGE_UNAVAILABLE';
      err.status = 503;
      err.dbErrorCode = dbErr && dbErr.code ? dbErr.code : 'DB_ERROR';
      throw err;
    }
  }

  _formatAlertsToCsv(alerts, eventLookup = null) {
    const headers = [
      'ID',
      'Event ID',
      'Event Name',
      'Contact Type',
      'Contact',
      'Qty',
      'Max Budget (IDR)',
      'Status',
      'Consent Timestamp',
      'Created At',
      'Notified At'
    ];

    const rows = alerts.map(a => {
      let eventName = a.event_id;
      if (typeof eventLookup === 'function') {
        const found = eventLookup(a.event_id);
        if (found) eventName = found.canonical_name || found.name || found.title || a.event_id;
      }
      return [
        escapeCsv(a.id),
        escapeCsv(a.event_id),
        escapeCsv(eventName),
        escapeCsv(a.contact_type),
        escapeCsv(a.contact),
        escapeCsv(a.qty),
        escapeCsv(a.max_price !== null && a.max_price !== undefined ? a.max_price : ''),
        escapeCsv(a.status),
        escapeCsv(a.consent_at),
        escapeCsv(a.created_at),
        escapeCsv(a.notified_at || '')
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }

  /**
   * Admin: Generates CSV export for manual seller outreach and marketing intelligence.
   */
  exportCsv({ eventId = null, status = null, notified = null } = {}, eventLookup = null) {
    const { alerts } = this.getAdminAlerts({ eventId, status, notified, limit: 100000, offset: 0 });
    return this._formatAlertsToCsv(alerts, eventLookup);
  }

  /**
   * Admin Async: Generates CSV export from PostgreSQL demand_alerts.
   * Fails closed if demand_alerts table does not exist.
   */
  async exportCsvAsync({ eventId = null, status = null, notified = null } = {}, eventLookup = null) {
    const { alerts } = await this.getAdminAlertsAsync({ eventId, status, notified, limit: 100000, offset: 0 });
    return this._formatAlertsToCsv(alerts, eventLookup);
  }

  /**
   * Admin: Marks an alert as notified (in-memory).
   */
  markNotified(alertId, officerId = 'admin') {
    const alert = this.demands.find(d => d.id === alertId);
    if (!alert) {
      const err = new Error(`Alert with id ${alertId} not found`);
      err.code = 'ALERT_NOT_FOUND';
      throw err;
    }

    alert.status = 'NOTIFIED';
    alert.notified_at = new Date().toISOString();
    alert.notified_by = officerId;

    try {
      const { state } = require('../database');
      if (state && Array.isArray(state.demand_alerts)) {
        const sAlert = state.demand_alerts.find(d => d.id === alertId);
        if (sAlert) {
          sAlert.status = 'NOTIFIED';
          sAlert.notified_at = alert.notified_at;
          sAlert.notified_by = officerId;
        }
      }
    } catch (_) {}

    return alert;
  }

  /**
   * Admin Async: Marks an alert as notified in PostgreSQL.
   * Fails closed (503) if demand_alerts table does not exist; 404 if alert ID not found.
   */
  async markNotifiedAsync(alertId, officerId = 'admin') {
    if (!this.isPersistentMode()) {
      return this.markNotified(alertId, officerId);
    }

    const pool = this.getPool();
    if (!pool) {
      const err = new Error('Penyimpanan daftar tunggu belum tersedia.');
      err.code = 'DEMAND_STORAGE_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    let res;
    try {
      res = await pool.query(
        `UPDATE demand_alerts
         SET status = 'NOTIFIED',
             notified_at = NOW(),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('notified_by', $2::text)
         WHERE id = $1
         RETURNING *`,
        [alertId, officerId]
      );
    } catch (dbErr) {
      const err = new Error('Tabel demand_alerts belum tersedia atau database tidak dapat diakses.');
      err.code = 'DEMAND_STORAGE_UNAVAILABLE';
      err.status = 503;
      err.dbErrorCode = dbErr && dbErr.code ? dbErr.code : 'DB_ERROR';
      throw err;
    }

    if (!res.rows || res.rows.length === 0) {
      const err = new Error(`Alert with id ${alertId} not found`);
      err.code = 'ALERT_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const updated = this._normalizeDbRow(res.rows[0]);
    this._syncRecordInMemory(updated);
    return updated;
  }

  /**
   * Enqueues stub notifications when a listing becomes ACTIVE for an event.
   * Safe no-op if no waiting alerts exist or if storage is unavailable.
   */
  enqueueListingActivatedAlert(listing) {
    try {
      if (!listing) return [];
      const eventId = listing.canonical_event_id || listing.event_id;
      if (!eventId) return [];
      const waiting = this.demands.filter(d => d.event_id === eventId && d.status === 'WAITING');
      return waiting.map(d => this.notifyStub(d));
    } catch (_) {
      return [];
    }
  }

  /**
   * Aggregates demand intelligence across events.
   */
  getDemandIntelligence(canonicalEvents = []) {
    const demandByEvent = {};
    for (const d of this.demands) {
      demandByEvent[d.event_id] = (demandByEvent[d.event_id] || 0) + 1;
    }

    const report = Object.entries(demandByEvent).map(([eventId, count]) => {
      const event = canonicalEvents.find(e => e.event_id === eventId || e.id === eventId) || {};
      return {
        event_id: eventId,
        event_name: event.canonical_name || event.name || eventId,
        city: event.city || event.venue_city || 'Unknown',
        category: event.event_type || event.category || 'General',
        waiting_count: count
      };
    });

    return report.sort((a, b) => b.waiting_count - a.waiting_count);
  }

  reset() {
    this.demands = [];
    this.rateLimitMap.clear();
  }
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

const demandCaptureInstance = new DemandCaptureService();

module.exports = {
  DemandCaptureService,
  demandCapture: demandCaptureInstance
};
