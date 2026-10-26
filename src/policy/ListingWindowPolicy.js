/**
 * TIKUM / ARGUS — Listing Window Policy Engine (H-7 / H-14 Operational Window)
 *
 * Enforces the secondary marketplace business model:
 * 1. Operational focus: H-7 through event start (standard secondary inventory).
 * 2. Pilot focus: H-14 through event start (approved pilot events or verified seller tier).
 * 3. Strict rejection of expired/concluded events and events whose start time has passed.
 * 4. Absolute Truth-in-Advertising: H-7 / H-14 is an OPERATIONAL POLICY for field verification
 *    and ticket transfer oversight, NEVER a third-party escrow banking guarantee.
 */

const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('../discovery/EventTemporalLifecycleEngine');

const WINDOW_TYPE = {
  H7_STANDARD: 'H-7',
  H14_PILOT: 'H-14'
};

const OPERATIONAL_DISCLAIMER = 'Kebijakan listing H-7 / H-14 adalah batas jendela operasional verifikasi tiket dan pengawasan lapangan TIKUM, bukan jaminan escrow perbankan pihak ketiga.';

class ListingWindowPolicy {
  static WINDOW_TYPE = WINDOW_TYPE;
  static OPERATIONAL_DISCLAIMER = OPERATIONAL_DISCLAIMER;

  /**
   * Evaluates if a ticket for an event is currently within the allowed listing window.
   *
   * @param {Object} params
   * @param {Object} params.event - Canonical event object
   * @param {boolean} [params.isPilotVerified=false] - Whether seller or event is pilot-eligible (unlocks H-14)
   * @param {boolean} [params.bypassPolicy=false] - Administrative or internal test override
   * @param {Date|string|number} [params.now=new Date()] - Evaluation timestamp
   * @returns {Object} Evaluation outcome
   */
  static evaluateListingWindow({
    event,
    isPilotVerified = false,
    bypassPolicy = false,
    now = new Date()
  }) {
    if (!event) {
      return {
        allowed: false,
        code: 'EVENT_NOT_FOUND',
        reason: 'Event does not exist.',
        operationalDisclaimer: OPERATIONAL_DISCLAIMER
      };
    }

    const nowMs = new Date(now).getTime();

    // 1. Concluded / Expired check
    const rawStatus = (event.status || event.lifecycle_status || '').toUpperCase();
    const isConcludedStatus = [
      LIFECYCLE_STATUS.COMPLETED,
      LIFECYCLE_STATUS.ARCHIVED,
      LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS,
      LIFECYCLE_STATUS.CANCELLED,
      'EXPIRED',
      'DIBATALKAN'
    ].includes(rawStatus);

    if (isConcludedStatus) {
      return {
        allowed: false,
        code: 'EVENT_CONCLUDED',
        reason: `Cannot list ticket for concluded/cancelled event '${event.id || event.title}'.`,
        operationalDisclaimer: OPERATIONAL_DISCLAIMER
      };
    }

    // 2. Compute canonical temporal boundaries
    let temporal;
    try {
      temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    } catch (_) {
      temporal = null;
    }

    if (!temporal || !temporal.event_start_at || temporal.is_invalid_date) {
      return {
        allowed: false,
        code: 'INVALID_EVENT_DATE',
        reason: 'Event does not have a verified canonical date.',
        operationalDisclaimer: OPERATIONAL_DISCLAIMER
      };
    }

    const startMs = new Date(temporal.event_start_at).getTime();
    const endMs = temporal.event_end_at ? new Date(temporal.event_end_at).getTime() : startMs + (4 * 3600 * 1000);

    if (nowMs >= endMs) {
      return {
        allowed: false,
        code: 'EVENT_CONCLUDED',
        reason: 'Event has already concluded. Secondary listing is closed.',
        operationalDisclaimer: OPERATIONAL_DISCLAIMER
      };
    }

    if (nowMs >= startMs) {
      return {
        allowed: false,
        code: 'EVENT_ALREADY_STARTED',
        reason: 'Event has already started. Gate cutoff reached.',
        operationalDisclaimer: OPERATIONAL_DISCLAIMER
      };
    }

    // 3. Determine window duration
    const isPilot = Boolean(
      isPilotVerified ||
      event.is_pilot ||
      event.pilot_approved ||
      (event.metadata && (event.metadata.is_pilot || event.metadata.pilot_approved))
    );

    const windowDays = isPilot ? 14 : 7;
    const windowType = isPilot ? WINDOW_TYPE.H14_PILOT : WINDOW_TYPE.H7_STANDARD;
    const windowDurationMs = windowDays * 24 * 60 * 60 * 1000;
    const windowStartMs = startMs - windowDurationMs;

    // 4. Window timing check
    if (nowMs < windowStartMs) {
      const remainingMs = windowStartMs - nowMs;
      const daysRemaining = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
      const hoursRemaining = Math.ceil(remainingMs / (60 * 60 * 1000));

      if (bypassPolicy) {
        return {
          allowed: true,
          bypassed: true,
          windowType,
          windowDays,
          windowStartMs,
          eventStartMs: startMs,
          remainingMs,
          daysRemaining,
          hoursRemaining,
          reason: 'Bypassed by administrative override',
          operationalDisclaimer: OPERATIONAL_DISCLAIMER
        };
      }

      return {
        allowed: false,
        code: 'LISTING_WINDOW_NOT_OPEN',
        reason: `Jendela listing secondary (${windowType}) belum dibuka. Listing dibuka pada ${new Date(windowStartMs).toISOString()} (sekitar ${daysRemaining > 1 ? daysRemaining + ' hari' : hoursRemaining + ' jam'} lagi).`,
        windowType,
        windowDays,
        windowStartMs,
        eventStartMs: startMs,
        remainingMs,
        daysRemaining,
        hoursRemaining,
        operationalDisclaimer: OPERATIONAL_DISCLAIMER
      };
    }

    // Window is currently open!
    return {
      allowed: true,
      windowType,
      windowDays,
      windowStartMs,
      eventStartMs: startMs,
      remainingMs: 0,
      daysRemaining: 0,
      hoursRemaining: 0,
      operationalDisclaimer: OPERATIONAL_DISCLAIMER
    };
  }

  /**
   * Evaluates if a purchase is allowed against a listing and its event.
   */
  static evaluatePurchaseWindow({
    event,
    listing,
    now = new Date()
  }) {
    if (!event) {
      return { allowed: false, code: 'EVENT_NOT_FOUND', reason: 'Event not found' };
    }

    const nowMs = new Date(now).getTime();
    let temporal;
    try {
      temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    } catch (_) {
      temporal = null;
    }

    if (temporal && temporal.event_start_at) {
      const startMs = new Date(temporal.event_start_at).getTime();
      if (nowMs >= startMs) {
        return {
          allowed: false,
          code: 'EVENT_ALREADY_STARTED',
          reason: 'Event has already started. Ticket purchasing is closed.'
        };
      }
    }

    if (listing && listing.expires_at) {
      const expiryMs = new Date(listing.expires_at).getTime();
      if (nowMs >= expiryMs) {
        return {
          allowed: false,
          code: 'LISTING_EXPIRED',
          reason: 'Listing offer has expired.'
        };
      }
    }

    return { allowed: true };
  }
}

module.exports = {
  ListingWindowPolicy,
  WINDOW_TYPE,
  OPERATIONAL_DISCLAIMER
};
