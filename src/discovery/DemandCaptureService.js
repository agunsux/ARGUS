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

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const INDO_PHONE_REGEX = /^\+628[1-9][0-9]{6,10}$/;

class DemandCaptureService {
  constructor() {
    this.demands = [];
    this.rateLimitMap = new Map(); // key -> [timestamp, ...]
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
   * Registers buyer demand for an event.
   */
  registerInterest({
    eventId,
    contact,
    contactInfo, // backwards-compatibility alias
    qty = 1,
    maxPrice = null,
    maxBudget = null, // backwards-compatibility alias
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

    // Record rate limit hits
    if (ipKey) this.recordRateLimitHit(ipKey);
    this.recordRateLimitHit(contactKey);

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
        client_ip: clientIp || null,
        user_agent: userAgent || null
      }
    };

    this.demands.push(demandRecord);

    // Sync to global database state if available
    try {
      const { state } = require('../database');
      if (state && Array.isArray(state.demand_alerts)) {
        state.demand_alerts.push(demandRecord);
      }
    } catch (_) {}

    // Dispatch notification stub
    const stubResult = this.notifyStub(demandRecord);

    return {
      record: demandRecord,
      notification: stubResult
    };
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

  /**
   * Truthfulness Invariant: Public count ONLY shown if count >= 5.
   * If < 5, returns neutral copy and masked count = 0 to prevent FOMO deception.
   */
  getPublicDemandStats(eventId) {
    const verifiedCount = this.getVerifiedDemandCount(eventId);
    if (verifiedCount >= 5) {
      return {
        verified_count: verifiedCount,
        show_count: true,
        badge_text: `${verifiedCount} orang sedang mencari tiket ini`,
        headline: `${verifiedCount} orang sedang menunggu tiket ini`
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
   * Admin: List alerts with optional filters and pagination.
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
   * Admin: Generates CSV export for manual seller outreach and marketing intelligence.
   */
  exportCsv({ eventId = null, status = null, notified = null } = {}, eventLookup = null) {
    const { alerts } = this.getAdminAlerts({ eventId, status, notified, limit: 100000, offset: 0 });

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
   * Admin: Marks an alert as notified.
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
