/**
 * TIKUM / ARGUS — Canonical Event Temporal Lifecycle Engine
 * 
 * Single authoritative source of temporal truth for events across TIKUM.
 * 
 * Implements:
 * 1. Absolute Business Invariant: An event must NEVER appear in Upcoming/Homepage if it has ended.
 * 2. Canonical Lifecycle: UPCOMING -> LIVE / IN_PROGRESS -> COMPLETED -> ARCHIVED
 * 3. H+2 Archive Rule: EVENT_END_TIME + 48 HOURS = ARCHIVE ELIGIBILITY
 * 4. Non-Terminal Transaction Exception: hasOpenPostEventOperations(eventId)
 *    Preserves event as ARCHIVED_WITH_OPEN_OPERATIONS without allowing it into Upcoming.
 * 5. Timezone Integrity: WIB (+07:00), WITA (+08:00), WIT (+09:00), UTC.
 * 6. Deterministic Duration Fallback Policy for multi-day and single-day events.
 * 7. Multi-source Invariant: Source status can NEVER override canonical temporal truth.
 */

const { EventNormalizationService } = require('./EventNormalizationService');

function getState() {
  try {
    return require('../database').state || {};
  } catch (_) {
    return {};
  }
}

async function logAudit(...args) {
  try {
    const { recordAuditLog } = require('../database');
    if (recordAuditLog) {
      await recordAuditLog(...args);
    }
  } catch (_) {}
}

const HOMEPAGE_EVENT_GRACE_DAYS = 2;

const LIFECYCLE_STATUS = {
  UPCOMING: 'UPCOMING',
  LIVE: 'LIVE',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
  ARCHIVED_WITH_OPEN_OPERATIONS: 'ARCHIVED_WITH_OPEN_OPERATIONS',
  CANCELLED: 'CANCELLED',
  POSTPONED: 'POSTPONED',
  EXPIRED: 'EXPIRED'
};

const TERMINAL_ORDER_STATUSES = new Set([
  'SETTLED',
  'REFUNDED',
  'CANCELLED',
  'RELEASED',
  'CLOSED',
  'RESOLVED'
]);

const NON_TERMINAL_ORDER_STATUSES = new Set([
  'PENDING_PAYMENT',
  'PAID_ESCROWED',
  'ENTRY_CONFIRMED',
  'DISPUTED',
  'REFUND_PENDING',
  'PAYMENT_PROCESSING',
  'TRANSFER_PENDING',
  'DELIVERY_PENDING',
  'INVESTIGATION',
  'FROZEN'
]);

const TERMINAL_ESCROW_STATUSES = new Set([
  'RELEASED',
  'REFUNDED',
  'CANCELLED',
  'REJECTED'
]);

const NON_TERMINAL_ESCROW_STATUSES = new Set([
  'ORDER_CREATED',
  'PAYMENT_PENDING',
  'FUNDED',
  'TICKET_SUBMITTED',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'DELIVERY_PENDING',
  'DELIVERED',
  'ENTRY_CONFIRMED',
  'RELEASE_PENDING',
  'DISPUTED',
  'REFUND_PENDING',
  'FROZEN'
]);

const RESOLVED_DISPUTE_STATUSES = new Set([
  'RESOLVED',
  'REJECTED',
  'CLOSED'
]);

class EventTemporalLifecycleEngine {
  /**
   * Resolves canonical timezone from city or explicit timezone string.
   */
  static resolveTimezone(timezone, cityOrProvince) {
    if (timezone && timezone !== 'Asia/Jakarta') {
      return timezone;
    }
    if (cityOrProvince) {
      try {
        const { cityRegistry } = require('./CityRegistry');
        const c = cityRegistry.findCity(cityOrProvince);
        if (c && c.timezone) return c.timezone;
      } catch (_) {}
    }
    return timezone || 'Asia/Jakarta';
  }

  /**
   * Returns timezone offset string (+07:00, +08:00, +09:00, Z).
   */
  static getTimezoneOffset(timezone) {
    if (timezone === 'Asia/Makassar' || timezone === 'WITA' || timezone === 'Asia/Singapore' || timezone === 'Asia/Kuala_Lumpur' || timezone === 'Asia/Manila' || timezone === 'SGT' || timezone === 'MYT' || timezone === 'PHT') return '+08:00';
    if (timezone === 'Asia/Jayapura' || timezone === 'WIT') return '+09:00';
    if (timezone === 'Asia/Bangkok' || timezone === 'Asia/Ho_Chi_Minh' || timezone === 'ICT') return '+07:00';
    if (timezone === 'UTC' || timezone === 'Etc/UTC') return '+00:00';
    return '+07:00'; // Default WIB / Asia/Jakarta
  }

  /**
   * Computes canonical temporal attributes:
   * - event_start_at (ISO 8601 with timezone offset)
   * - event_end_at (ISO 8601 with timezone offset)
   * - event_timezone (Canonical IANA string)
   * - archive_at (event_end_at + 48 hours)
   * 
   * Deterministic Duration Fallback Policy:
   * 1. Explicit end_datetime / event_end_at takes precedence.
   * 2. If end_date provided (multi-day): ends at 23:59:59.999 of end_date in event timezone.
   * 3. Single-day event:
   *    - If start_time provided: start + 4 hours (or 23:59:59 of start_date, whichever is later).
   *      Correctly rolls over past midnight if event starts late.
   *    - If no start_time: defaults to 19:00 start, 23:00 end in event timezone.
   */
  static computeTemporalAttributes(eventData, defaultCityOrTz = null) {
    const timezone = this.resolveTimezone(
      eventData.timezone || eventData.event_timezone,
      eventData.venue_city || eventData.city || defaultCityOrTz
    );
    const offset = this.getTimezoneOffset(timezone);

    // 1. Determine Start Datetime
    let startDate = eventData.start_date || eventData.date;
    if (!startDate && (eventData.event_start_at || eventData.start_datetime)) {
      const explicitStart = eventData.event_start_at || eventData.start_datetime;
      if (explicitStart && explicitStart.includes('T')) {
        startDate = explicitStart.split('T')[0];
      }
    }
    if (startDate && startDate.includes('T')) {
      startDate = startDate.split('T')[0];
    }
    if (!startDate) {
      startDate = new Date().toISOString().substring(0, 10);
    }

    let startTime = eventData.start_time || eventData.time;
    if (eventData.start_datetime && eventData.start_datetime.includes('T')) {
      const parts = eventData.start_datetime.split('T')[1];
      if (parts) startTime = parts.substring(0, 5);
    }
    if (eventData.event_start_at && eventData.event_start_at.includes('T')) {
      const parts = eventData.event_start_at.split('T')[1];
      if (parts) startTime = parts.substring(0, 5);
    }
    if (!startTime) {
      startTime = '19:00';
    }
    if (!startTime.includes(':')) {
      startTime = `${startTime}:00`;
    }
    const sParts = startTime.split(':');
    startTime = `${sParts[0].padStart(2, '0')}:${(sParts[1] || '00').padStart(2, '0')}`;

    let startAtIso = eventData.event_start_at || eventData.start_datetime;
    if (!startAtIso || !startAtIso.includes('T') || (!startAtIso.includes('+') && !startAtIso.endsWith('Z')) || !startAtIso.startsWith(startDate)) {
      startAtIso = `${startDate}T${startTime}:00${offset}`;
    }

    // 2. Determine End Datetime
    let endAtIso = eventData.event_end_at || eventData.end_datetime;
    let endDate = eventData.end_date ? (eventData.end_date.includes('T') ? eventData.end_date.split('T')[0] : eventData.end_date) : null;
    if (!endDate && endAtIso && endAtIso.includes('T')) {
      endDate = endAtIso.split('T')[0];
    }
    const endTime = eventData.end_time;
    const targetEndDate = endDate || startDate;

    if (endAtIso && endAtIso.includes('T') && (endAtIso.includes('+') || endAtIso.endsWith('Z')) && endAtIso.startsWith(targetEndDate)) {
      // Valid explicit end datetime provided matching target end date
    } else if (endDate && endDate !== startDate) {
      // Multi-day event: ends at end of final day
      const cleanEndTime = endTime ? `${endTime.padStart(5, '0')}:00` : '23:59:59';
      endAtIso = `${endDate}T${cleanEndTime}${offset}`;
    } else {
      // Single day event
      if (endTime) {
        const eParts = endTime.split(':');
        const cleanEndTime = `${eParts[0].padStart(2, '0')}:${(eParts[1] || '00').padStart(2, '0')}:00`;
        endAtIso = `${startDate}T${cleanEndTime}${offset}`;
      } else {
        // Fallback policy: start_at + 4 hours
        const startMs = new Date(startAtIso).getTime();
        const fallbackEndMs = startMs + (4 * 60 * 60 * 1000);
        // Ensure at least end of start_date or calculated duration
        endAtIso = new Date(fallbackEndMs).toISOString();
      }
    }

    // Ensure end_at is strictly >= start_at
    const startMs = new Date(startAtIso).getTime();
    let endMs = new Date(endAtIso).getTime();
    if (isNaN(endMs) || endMs <= startMs) {
      endMs = startMs + (4 * 60 * 60 * 1000);
      endAtIso = new Date(endMs).toISOString();
    }

    // 3. Archive eligibility timestamp: event_end_at + 48 hours (H+2 rule)
    const archiveMs = endMs + (48 * 60 * 60 * 1000);
    const archiveAtIso = new Date(archiveMs).toISOString();

    return {
      event_start_at: startAtIso,
      event_end_at: endAtIso,
      event_timezone: timezone,
      archive_at: archiveAtIso,
      start_date: startDate,
      end_date: endDate || startDate
    };
  }

  /**
   * Canonical Predicate: Checks if an event has genuine non-terminal post-event operations.
   * Inspects real transaction, escrow, dispute, settlement, and incident records.
   * 
   * Invariant: A completed/settled transaction does NOT block archive.
   * Only non-terminal states (pending payment, refund pending, dispute open, etc.) block archive.
   */
  static hasOpenPostEventOperations(eventId) {
    if (!eventId) return false;
    const state = getState();

    // 1. Check Orders for this event
    const eventOrders = (state.orders || []).filter(o => o.event_id === eventId);
    const openOrders = eventOrders.filter(o => {
      const status = (o.status || '').toUpperCase();
      const mStatus = (o.marketplace_status || '').toUpperCase();
      if (TERMINAL_ORDER_STATUSES.has(status) || TERMINAL_ORDER_STATUSES.has(mStatus)) {
        return false;
      }
      if (NON_TERMINAL_ORDER_STATUSES.has(status) || NON_TERMINAL_ORDER_STATUSES.has(mStatus)) {
        return true;
      }
      return false;
    });

    if (openOrders.length > 0) {
      return true;
    }

    // 2. Check Escrows for this event or linked orders
    const orderIds = new Set(eventOrders.map(o => o.id));
    const eventEscrows = (state.escrows || []).filter(e => e.event_id === eventId || orderIds.has(e.order_id));
    const openEscrows = eventEscrows.filter(e => {
      const status = (e.status || '').toUpperCase();
      if (TERMINAL_ESCROW_STATUSES.has(status)) return false;
      if (NON_TERMINAL_ESCROW_STATUSES.has(status)) return true;
      return false;
    });

    if (openEscrows.length > 0) {
      return true;
    }

    // 3. Check Disputes
    const eventDisputes = (state.disputes || []).filter(d => d.event_id === eventId || orderIds.has(d.order_id));
    const openDisputes = eventDisputes.filter(d => !RESOLVED_DISPUTE_STATUSES.has((d.status || '').toUpperCase()));

    if (openDisputes.length > 0) {
      return true;
    }

    // 4. Check Settlements pending
    const pendingSettlements = (state.settlements || []).filter(s =>
      (s.event_id === eventId || orderIds.has(s.order_id)) &&
      ['PENDING', 'PROCESSING'].includes((s.status || '').toUpperCase())
    );

    if (pendingSettlements.length > 0) {
      return true;
    }

    // 5. Check Incidents
    const openIncidents = (state.incidents || []).filter(i =>
      i.event_id === eventId && !['RESOLVED', 'CLOSED'].includes((i.status || '').toUpperCase())
    );

    if (openIncidents.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Resolves canonical lifecycle status from timestamps and real operations.
   */
  static resolveLifecycleStatus(event, now = new Date()) {
    const rawStatus = (event.status || event.lifecycle_status || '').toUpperCase();

    // Respect terminal administrative branches
    if (rawStatus === LIFECYCLE_STATUS.CANCELLED || rawStatus === 'DIBATALKAN') {
      return LIFECYCLE_STATUS.CANCELLED;
    }
    if (rawStatus === LIFECYCLE_STATUS.POSTPONED || rawStatus === 'DITUNDA') {
      // If event was postponed and has a future start_at, it can transition to UPCOMING
      if (event.event_start_at && new Date(event.event_start_at).getTime() > now.getTime()) {
        return LIFECYCLE_STATUS.UPCOMING;
      }
      return LIFECYCLE_STATUS.POSTPONED;
    }

    const temporal = this.computeTemporalAttributes(event);
    const nowMs = now.getTime();
    const startMs = new Date(temporal.event_start_at).getTime();
    const endMs = new Date(temporal.event_end_at).getTime();
    const archiveMs = new Date(temporal.archive_at).getTime();

    // Stage 1: Future event
    if (nowMs < startMs) {
      return LIFECYCLE_STATUS.UPCOMING;
    }

    // Stage 2: Event currently live / in-progress
    if (nowMs >= startMs && nowMs <= endMs) {
      return LIFECYCLE_STATUS.LIVE;
    }

    // Stage 3: Event has ended, but within H+48 archive grace period
    if (nowMs > endMs && nowMs < archiveMs) {
      return LIFECYCLE_STATUS.COMPLETED;
    }

    // Stage 4: Event has passed H+48 hours (Archive Eligibility)
    const eventId = event.event_id || event.id;
    const hasOpenOps = this.hasOpenPostEventOperations(eventId);

    if (hasOpenOps) {
      return LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS;
    }

    return LIFECYCLE_STATUS.ARCHIVED;
  }

  /**
   * Predicate: determines whether an event is publicly upcoming.
   * Strict invariant: event_end_at > now AND not completed/archived/cancelled.
   */
  static isEventUpcoming(event, now = new Date()) {
    if (!event) return false;

    const rawStatus = (event.status || event.lifecycle_status || '').toUpperCase();
    if (rawStatus === 'CANCELLED' || rawStatus === 'DIBATALKAN' || rawStatus === 'POSTPONED') {
      return false;
    }

    // Compute canonical end timestamp
    const temporal = this.computeTemporalAttributes(event);
    const endMs = new Date(temporal.event_end_at).getTime();
    const nowMs = now.getTime();

    if (endMs <= nowMs) {
      return false;
    }

    const currentStatus = this.resolveLifecycleStatus(event, now);
    return currentStatus === LIFECYCLE_STATUS.UPCOMING;
  }

  /**
   * Evaluates the event's temporal position relative to homepage display windows:
   * - 'UPCOMING': event has not started yet (now < start_at)
   * - 'TODAY': event is taking place today / currently live (start_at <= now <= end_at)
   * - 'RECENT': event concluded within H+2 grace period (end_at < now <= end_at + 2 days)
   * - 'EXPIRED': event concluded past H+2 grace period (now > end_at + 2 days)
   */
  static getHomepageTemporalWindow(event, now = new Date()) {
    if (!event) return 'EXPIRED';
    const temporal = this.computeTemporalAttributes(event);
    const nowMs = (now instanceof Date) ? now.getTime() : new Date(now).getTime();
    const startMs = new Date(temporal.event_start_at).getTime();
    const endMs = new Date(temporal.event_end_at).getTime();
    const graceMs = HOMEPAGE_EVENT_GRACE_DAYS * 24 * 60 * 60 * 1000;

    if (nowMs < startMs) {
      return 'UPCOMING';
    }
    if (nowMs >= startMs && nowMs <= endMs) {
      return 'TODAY';
    }
    if (nowMs > endMs && nowMs <= endMs + graceMs) {
      return 'RECENT';
    }
    return 'EXPIRED';
  }

  /**
   * Deterministic server-side predicate: is this event eligible for homepage visibility?
   * Requires:
   * 1. Verified status (VERIFIED or PRIMARY_SOURCE_VERIFIED)
   * 2. public_visibility !== false
   * 3. Lifecycle not CANCELLED or EXPIRED
   * 4. Temporal window is not EXPIRED (i.e. UPCOMING, TODAY, or RECENT within H+2 grace)
   */
  static isEventHomepageEligible(event, now = new Date()) {
    if (!event) return false;
    const isVerified = Boolean(
      event.is_verified ||
      event.verification_status === 'VERIFIED' ||
      event.verification_status === 'PRIMARY_SOURCE_VERIFIED'
    );
    if (!isVerified) return false;
    if (event.public_visibility === false) return false;
    if (event.homepage_visibility === false) return false;

    const rawStatus = (event.lifecycle_status || event.status || '').toUpperCase();
    if (rawStatus === 'CANCELLED' || rawStatus === 'DIBATALKAN' || rawStatus === 'EXPIRED' ||
        rawStatus === 'ARCHIVED' || rawStatus === 'ARCHIVED_WITH_OPEN_OPERATIONS') {
      return false;
    }
    if (event.archive_status === 'ARCHIVED' || event.archive_status === 'ARCHIVED_WITH_OPEN_OPERATIONS') {
      return false;
    }

    // Explicit Defense-in-depth H+2 check:
    const temporal = this.computeTemporalAttributes(event);
    const nowMs = (now instanceof Date) ? now.getTime() : new Date(now).getTime();
    const endMs = new Date(temporal.event_end_at).getTime();
    const graceMs = HOMEPAGE_EVENT_GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (nowMs > endMs + graceMs) {
      return false;
    }

    const window = this.getHomepageTemporalWindow(event, now);
    return window !== 'EXPIRED';
  }

  /**
   * Reconciles a single event's temporal lifecycle state.
   * If state changes, emits structured audit log and expires active listings if concluded.
   */
  static async reconcileEvent(event, now = new Date(), actorId = 'SYSTEM') {
    if (!event) return null;

    const eventId = event.event_id || event.id;
    const temporal = this.computeTemporalAttributes(event);

    // Apply temporal timestamps to event
    event.event_start_at = temporal.event_start_at;
    event.event_end_at = temporal.event_end_at;
    event.event_timezone = temporal.event_timezone;
    event.archive_at = temporal.archive_at;
    event.start_datetime = temporal.event_start_at;
    event.end_datetime = temporal.event_end_at;

    const previousStatus = event.lifecycle_status || event.status || LIFECYCLE_STATUS.UPCOMING;
    const newStatus = this.resolveLifecycleStatus(event, now);

    event.lifecycle_status = newStatus;
    // For backward compatibility: keep status aligned unless ON_SALE/SOLD_OUT on an UPCOMING event
    if (newStatus === LIFECYCLE_STATUS.COMPLETED ||
        newStatus === LIFECYCLE_STATUS.ARCHIVED ||
        newStatus === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS ||
        newStatus === LIFECYCLE_STATUS.CANCELLED) {
      event.status = newStatus;
    } else if (newStatus === LIFECYCLE_STATUS.LIVE) {
      event.status = 'LIVE';
    }

    // Expiry rule: H+2 grace period past end_at hides from public homepage and marks archive_status
    const graceMs = HOMEPAGE_EVENT_GRACE_DAYS * 24 * 60 * 60 * 1000;
    const nowMs = (now instanceof Date) ? now.getTime() : new Date(now).getTime();
    const endMs = new Date(temporal.event_end_at).getTime();
    if (nowMs > endMs + graceMs) {
      event.public_visibility = false;
      event.homepage_visibility = false;
      event.public_upcoming = false;
      const hasOpenOps = this.hasOpenPostEventOperations(eventId);
      event.archive_status = hasOpenOps ? LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS : LIFECYCLE_STATUS.ARCHIVED;
      if (!event.archived_at) {
        event.archived_at = (now instanceof Date ? now : new Date(now)).toISOString();
      }
      if (!event.expired_at) {
        event.expired_at = (now instanceof Date ? now : new Date(now)).toISOString();
      }
    } else {
      if (newStatus === LIFECYCLE_STATUS.CANCELLED) {
        event.archive_status = 'CANCELLED';
        event.public_visibility = false;
        event.homepage_visibility = false;
        event.public_upcoming = false;
      } else {
        event.archive_status = 'ACTIVE';
        if (event.is_verified) {
          event.public_visibility = true;
          event.homepage_visibility = (this.getHomepageTemporalWindow(event, now) !== 'EXPIRED');
          event.public_upcoming = this.isEventUpcoming(event, now);
          event.expired_at = null;
        } else {
          event.homepage_visibility = false;
          event.public_upcoming = false;
        }
      }
    }

    event.last_lifecycle_evaluated_at = (now instanceof Date ? now : new Date(now)).toISOString();

    // If in a concluded state, expire any active listings for this event
    if (newStatus === LIFECYCLE_STATUS.COMPLETED ||
        newStatus === LIFECYCLE_STATUS.ARCHIVED ||
        newStatus === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS) {
      this._expireActiveListingsForEndedEvent(eventId, newStatus, now);
    }

    // If status changed, record auditable transition
    if (previousStatus !== newStatus) {
      try {
        await logAudit('EVENT_LIFECYCLE_TRANSITION', eventId, `TRANSITION_${newStatus}`, actorId, {
          previous_state: previousStatus,
          new_state: newStatus,
          reason: `Automated temporal lifecycle transition to ${newStatus}`,
          evaluated_at: now.toISOString(),
          event_end_at: temporal.event_end_at,
          archive_at: temporal.archive_at,
          has_open_operations: newStatus === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS
        });
      } catch (_) {}
    }

    return {
      event_id: eventId,
      previous_status: previousStatus,
      new_status: newStatus,
      transitioned: previousStatus !== newStatus,
      event_start_at: temporal.event_start_at,
      event_end_at: temporal.event_end_at,
      archive_at: temporal.archive_at
    };
  }

  /**
   * Closes / expires active listings when an event has concluded.
   */
  static _expireActiveListingsForEndedEvent(eventId, targetLifecycle, now = new Date()) {
    const state = getState();
    const activeListings = (state.listings || []).filter(l =>
      l.event_id === eventId && l.status === 'ACTIVE'
    );

    for (const listing of activeListings) {
      listing.status = 'EXPIRED';
      listing.rejection_reason = `Event concluded: ${targetLifecycle}`;
      listing.updated_at = now.toISOString();

      // Restore ticket state to prevent dangling lock
      const ticket = (state.tickets || []).find(t => t.id === listing.ticket_id);
      if (ticket && ticket.status === 'LISTED') {
        ticket.status = 'VERIFIED';
        ticket.listing_id = null;
        ticket.updated_at = now.toISOString();
      }
    }
  }

  /**
   * Reconciles all events across CanonicalEventRegistry and state.events.
   * Completely idempotent.
   */
  static async reconcileAllEvents(now = new Date(), actorId = 'SYSTEM') {
    const { canonicalRegistry } = require('./CanonicalEventRegistry');
    const allCanonical = canonicalRegistry.getAllEvents();
    const transitions = [];

    let counts = {
      total: 0,
      transitioned: 0,
      upcoming: 0,
      live: 0,
      completed: 0,
      archived: 0,
      archived_with_ops: 0,
      cancelled: 0,
      postponed: 0
    };

    // 1. Reconcile canonical registry events
    for (const event of allCanonical) {
      counts.total++;
      const res = await this.reconcileEvent(event, now, actorId);
      if (res.transitioned) {
        counts.transitioned++;
        transitions.push(res);
      }
      const st = event.lifecycle_status;
      if (st === LIFECYCLE_STATUS.UPCOMING) counts.upcoming++;
      else if (st === LIFECYCLE_STATUS.LIVE) counts.live++;
      else if (st === LIFECYCLE_STATUS.COMPLETED) counts.completed++;
      else if (st === LIFECYCLE_STATUS.ARCHIVED) counts.archived++;
      else if (st === LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS) counts.archived_with_ops++;
      else if (st === LIFECYCLE_STATUS.CANCELLED) counts.cancelled++;
      else if (st === LIFECYCLE_STATUS.POSTPONED) counts.postponed++;
    }

    // 2. Sync to state.events
    const state = getState();
    canonicalRegistry.syncToState(state.events);

    // 3. Reconcile any state.events that might not be in canonical registry
    for (const stateEv of (state.events || [])) {
      if (!allCanonical.some(c => c.event_id === stateEv.id || c.id === stateEv.id)) {
        counts.total++;
        const res = await this.reconcileEvent(stateEv, now, actorId);
        if (res.transitioned) {
          counts.transitioned++;
          transitions.push(res);
        }
      }
    }

    return {
      evaluated_at: now.toISOString(),
      counts,
      transitions
    };
  }

  /**
   * Controlled Historical Audit (Section 17):
   * Inspects all events and generates affected-event report.
   */
  static auditHistoricalEvents(now = new Date()) {
    const { canonicalRegistry } = require('./CanonicalEventRegistry');
    const allEvents = canonicalRegistry.getAllEvents();
    const state = getState();
    const report = [];

    for (const ev of allEvents) {
      const temporal = this.computeTemporalAttributes(ev);
      const computedStatus = this.resolveLifecycleStatus(ev, now);
      const currentStatus = ev.lifecycle_status || ev.status || 'UPCOMING';
      const eventId = ev.event_id || ev.id;
      const listings = (state.listings || []).filter(l => l.event_id === eventId);
      const activeListings = listings.filter(l => l.status === 'ACTIVE');
      const orders = (state.orders || []).filter(o => o.event_id === eventId);
      const openOps = this.hasOpenPostEventOperations(eventId);
      const endMs = new Date(temporal.event_end_at).getTime();
      const isPast = endMs <= now.getTime();

      report.push({
        event_id: eventId,
        event_name: ev.canonical_name || ev.name || ev.title,
        venue: ev.venue_name || ev.venue,
        city: ev.city || ev.venue_city,
        event_start_at: temporal.event_start_at,
        event_end_at: temporal.event_end_at,
        archive_at: temporal.archive_at,
        current_status: currentStatus,
        computed_status: computedStatus,
        is_past: isPast,
        status_mismatch: currentStatus !== computedStatus,
        source: ev.source || (ev.sources && ev.sources[0]?.source_id) || 'UNKNOWN',
        homepage_visibility: this.isEventUpcoming(ev, now),
        listing_count: listings.length,
        active_listing_count: activeListings.length,
        open_transaction_count: orders.length,
        has_open_post_event_operations: openOps
      });
    }

    return {
      audit_time: now.toISOString(),
      total_audited: report.length,
      expired_count: report.filter(r => r.is_past).length,
      mismatched_count: report.filter(r => r.status_mismatch).length,
      report
    };
  }
}

module.exports = {
  EventTemporalLifecycleEngine,
  LIFECYCLE_STATUS,
  HOMEPAGE_EVENT_GRACE_DAYS,
  TERMINAL_ORDER_STATUSES,
  NON_TERMINAL_ORDER_STATUSES,
  TERMINAL_ESCROW_STATUSES,
  NON_TERMINAL_ESCROW_STATUSES
};
