/**
 * TIKUM / ARGUS — Event Lifecycle Service
 * Deliverable A: Automated Event Lifecycle Engine
 *
 * Enforces:
 * 1. Strict Asia/Jakarta (WIB, UTC+7) temporal cutoff:
 *    Events conclude at 23:59:59 WIB of event_date (or end_date for multi-day events).
 * 2. Real-time active partitioning:
 *    Active endpoints (/api/discovery/events-qualified, /api/discovery/event-policy-registry)
 *    filter out concluded events dynamically so expired events never leak into active queries.
 * 3. Weekly Cron Archival (POST /api/cron/archive-past-events):
 *    Protected by CRON_SECRET, sweeps registry, transitions expired events to PAST,
 *    and regenerates the static sitemap.
 * 4. Dedicated Past Events API (GET /api/discovery/past-events):
 *    Returns paginated, searchable, verified past events for public historical preservation.
 */

const fs = require('fs');
const path = require('path');
const { eventPolicyRegistry, POLICY_STATUS } = require('./EventPolicyRegistry');
const { EventTemporalLifecycleEngine } = require('./EventTemporalLifecycleEngine');

class EventLifecycleService {
  /**
   * Returns current or candidate date as YYYY-MM-DD in Asia/Jakarta timezone (WIB, UTC+7).
   */
  static getJakartaDateString(dateInput = null) {
    const d = dateInput
      ? (dateInput instanceof Date ? dateInput : new Date(dateInput))
      : (process.env.SIMULATE_NOW ? new Date(process.env.SIMULATE_NOW) : new Date());
    if (isNaN(d.getTime())) return new Date().toISOString().substring(0, 10);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  }

  /**
   * Returns current timestamp in Asia/Jakarta timezone.
   */
  static getJakartaTime(dateInput = null) {
    const d = dateInput
      ? (dateInput instanceof Date ? dateInput : new Date(dateInput))
      : (process.env.SIMULATE_NOW ? new Date(process.env.SIMULATE_NOW) : new Date());
    return isNaN(d.getTime()) ? new Date() : d;
  }

  /**
   * Deterministic predicate: has this event concluded / expired in Asia/Jakarta time?
   * An event concludes at 23:59:59.999 WIB on its event_date (or end_date if multi-day).
   * 
   * @param {string} eventDate - YYYY-MM-DD
   * @param {string|null} endDate - YYYY-MM-DD or null
   * @param {Date|string|null} now - candidate clock
   * @returns {boolean}
   */
  static isPastEvent(eventDate, endDate = null, now = null) {
    if (!eventDate) return false;
    const nowJakarta = this.getJakartaDateString(now);
    const targetDate = endDate || eventDate;
    const cleanTargetDate = String(targetDate).split('T')[0].trim();

    // If target date is strictly before current Jakarta date, event has concluded
    if (cleanTargetDate < nowJakarta) {
      return true;
    }

    // If target date is today, check if full timestamp with time was provided and passed
    if (cleanTargetDate === nowJakarta && typeof eventDate === 'string' && eventDate.includes('T')) {
      const nowMs = this.getJakartaTime(now).getTime();
      const endMs = new Date(eventDate).getTime();
      if (!isNaN(endMs) && nowMs > endMs) {
        return true;
      }
    }

    return false;
  }

  /**
   * Evaluates an event record to determine if it is past/concluded.
   */
  static isEventPast(event, now = null) {
    if (!event) return false;
    const rawStatus = (event.lifecycle_status || event.status || '').toUpperCase();
    if (rawStatus === 'PAST' || rawStatus === 'ARCHIVED' || rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED') {
      return true;
    }

    const eventDate = event.event_date || event.start_date || event.date;
    const endDate = event.end_date || null;
    return this.isPastEvent(eventDate, endDate, now);
  }

  /**
   * Filters out concluded events for active discovery surfaces.
   */
  static filterActiveEvents(events, now = null) {
    if (!Array.isArray(events)) return [];
    return events.filter(e => !this.isEventPast(e, now));
  }

  /**
   * Sweeps registry, transitions expired events to PAST, and regenerates sitemap.
   * 
   * @param {Object} options
   * @param {Date|string} [options.now]
   * @param {boolean} [options.force]
   * @returns {Object} Archival execution report
   */
  static archiveExpiredEvents({ now = null, force = false } = {}) {
    const effectiveNow = this.getJakartaTime(now);
    const nowIso = effectiveNow.toISOString();
    const todayJakarta = this.getJakartaDateString(effectiveNow);

    let archivedCount = 0;
    const details = [];

    // 1. Sweep EventPolicyRegistry
    const allPolicyEvents = eventPolicyRegistry.getAllEvents();
    for (const ev of allPolicyEvents) {
      const isPast = this.isPastEvent(ev.event_date, ev.end_date, effectiveNow);
      const isCurrentlyPast = (ev.lifecycle_status || '').toUpperCase() === 'PAST';

      if (isPast && (!isCurrentlyPast || force)) {
        ev.lifecycle_status = 'PAST';
        ev.status = 'COMPLETED';
        ev.archived_at = nowIso;
        ev.archive_reason = 'EVENT_DATE_PASSED';
        ev.archived_date_wib = todayJakarta;

        archivedCount++;
        details.push({
          id: ev.id,
          event_name: ev.event_name,
          event_date: ev.event_date,
          status: 'PAST',
          registry: 'EventPolicyRegistry'
        });
      }
    }

    // 2. Sweep CanonicalEventRegistry if loaded
    try {
      const { canonicalRegistry } = require('./CanonicalEventRegistry');
      if (canonicalRegistry && typeof canonicalRegistry.getAllEvents === 'function') {
        const canonicalEvents = canonicalRegistry.getAllEvents();
        for (const ev of canonicalEvents) {
          const date = ev.start_date || ev.date || ev.event_date;
          if (date && this.isPastEvent(date, ev.end_date, effectiveNow)) {
            if ((ev.lifecycle_status || '').toUpperCase() !== 'PAST' || force) {
              ev.lifecycle_status = 'PAST';
              ev.status = 'COMPLETED';
              ev.archive_status = 'ARCHIVED';
              ev.archived_at = nowIso;
              ev.archive_reason = 'EVENT_DATE_PASSED';
              details.push({
                id: ev.id || ev.event_id,
                event_name: ev.title || ev.canonical_name || ev.name,
                event_date: date,
                status: 'PAST',
                registry: 'CanonicalEventRegistry'
              });
            }
          }
        }
      }
    } catch (_) {
      // Canonical registry optional in isolated test contexts
    }

    // 3. Trigger static sitemap regeneration
    let sitemapUpdated = false;
    try {
      const sitemapScriptPath = path.resolve(__dirname, '../../scripts/generate_sitemap.js');
      if (fs.existsSync(sitemapScriptPath)) {
        const { generate } = require(sitemapScriptPath);
        if (typeof generate === 'function') {
          generate();
          sitemapUpdated = true;
        }
      }
    } catch (err) {
      console.warn('[EventLifecycleService] Sitemap regeneration warning:', err.message);
    }

    return {
      success: true,
      archived_count: archivedCount,
      timestamp: nowIso,
      jakarta_date: todayJakarta,
      sitemap_updated: sitemapUpdated,
      details
    };
  }

  /**
   * Returns paginated past events for public historical preservation.
   * 
   * @param {Object} query
   * @param {number} [query.page=1]
   * @param {number} [query.limit=20]
   * @param {string} [query.q]
   * @param {string} [query.category]
   * @param {string} [query.city]
   * @param {string} [query.year]
   * @param {Date|string} [query.now]
   * @returns {Object}
   */
  static getPastEvents({ page = 1, limit = 20, q = '', category = '', city = '', year = '', now = null } = {}) {
    const effectiveNow = this.getJakartaTime(now);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

    // Collect all past events from EventPolicyRegistry
    let pastList = eventPolicyRegistry.getAllEvents().filter(e => this.isEventPast(e, effectiveNow));

    // Also include any canonical registry past events
    try {
      const { canonicalRegistry } = require('./CanonicalEventRegistry');
      if (canonicalRegistry && typeof canonicalRegistry.getAllEvents === 'function') {
        const cPast = canonicalRegistry.getAllEvents().filter(e => this.isEventPast(e, effectiveNow));
        const knownIds = new Set(pastList.map(e => e.id || e.event_id));
        for (const ce of cPast) {
          const id = ce.id || ce.event_id;
          if (!knownIds.has(id)) {
            pastList.push({
              id,
              event_id: id,
              event_name: ce.title || ce.canonical_name || ce.name,
              category: (ce.category || 'CONCERT').toUpperCase(),
              venue: ce.venue_name || ce.venue || 'Venue',
              city: ce.city || ce.venue_city || 'Jakarta',
              event_date: ce.start_date || ce.date || ce.event_date,
              promoter_name: ce.promoter || ce.organizer_name || 'Promotor Resmi',
              official_ticketing_partner: ce.official_ticketing_partner || ce.source_name || 'Primary Box',
              starting_price_idr: ce.min_price || ce.price_min || 300000,
              image_url: ce.image_url || ce.poster_url || '/images/events/concert-default.svg',
              policy_status: ce.policy_status || POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
              lifecycle_status: 'PAST'
            });
            knownIds.add(id);
          }
        }
      }
    } catch (_) {}

    // Apply Filters
    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      pastList = pastList.filter(e => {
        const text = [
          e.event_name,
          e.venue,
          e.city,
          e.promoter_name,
          e.category
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes(term);
      });
    }

    if (category && category.trim()) {
      const cat = category.trim().toUpperCase();
      pastList = pastList.filter(e => (e.category || '').toUpperCase() === cat);
    }

    if (city && city.trim()) {
      const c = city.trim().toLowerCase();
      pastList = pastList.filter(e => (e.city || '').toLowerCase().includes(c));
    }

    if (year && year.trim()) {
      const y = year.trim();
      pastList = pastList.filter(e => (e.event_date || '').startsWith(y));
    }

    // Sort: event_date descending (most recently ended first)
    pastList.sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));

    const total = pastList.length;
    const startIndex = (p - 1) * lim;
    const paginatedEvents = pastList.slice(startIndex, startIndex + lim);

    return {
      success: true,
      count: paginatedEvents.length,
      total,
      page: p,
      limit: lim,
      events: paginatedEvents.map(e => ({
        ...e,
        lifecycle_status: 'PAST',
        is_ended: true,
        ended_notice: 'Acara telah selesai. Transaksi baru ditutup.'
      }))
    };
  }
}

module.exports = {
  EventLifecycleService
};
