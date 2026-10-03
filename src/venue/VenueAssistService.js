/**
 * TIKUM / ARGUS — Venue Assist & Optional Operations Service (Section 4)
 *
 * Strategic Architecture:
 * 1. Base marketplace transactions do NOT require mandatory PIC.
 * 2. Venue Assist is an OPTIONAL PREMIUM service layer for buyers/sellers.
 * 3. NEVER display "Venue Assist Available" unless a confirmed operator assignment exists.
 * 4. Explicit availability states:
 *    - PIC_AVAILABLE
 *    - PIC_REQUESTABLE
 *    - PIC_UNAVAILABLE
 *    - PIC_ASSIGNED
 *    - PIC_ON_SITE
 *    - PIC_COMPLETED
 * 5. Configurable fee model (event, venue, city, country, service type).
 */

const { state, recordAuditLog } = require('../database');

const PIC_AVAILABILITY_STATUS = {
  PIC_AVAILABLE: 'PIC_AVAILABLE',
  PIC_REQUESTABLE: 'PIC_REQUESTABLE',
  PIC_UNAVAILABLE: 'PIC_UNAVAILABLE',
  PIC_ASSIGNED: 'PIC_ASSIGNED',
  PIC_ON_SITE: 'PIC_ON_SITE',
  PIC_COMPLETED: 'PIC_COMPLETED'
};

const VENUE_ASSIST_SERVICE_TYPE = {
  VENUE_ARRIVAL_ASSIST: 'VENUE_ARRIVAL_ASSIST',
  TICKET_VERIFICATION_ASSIST: 'TICKET_VERIFICATION_ASSIST',
  MEETUP_COORDINATION: 'MEETUP_COORDINATION',
  ENTRY_TROUBLESHOOTING: 'ENTRY_TROUBLESHOOTING',
  FULL_VENUE_ASSIST: 'FULL_VENUE_ASSIST'
};

const DEFAULT_VENUE_ASSIST_FEE_IDR = 50000; // Rp 50.000 default optional service fee

class VenueAssistService {
  /**
   * Evaluates explicit Venue Assist availability for an event.
   * Gated strictly on real operational assignments — NEVER manufactured!
   * @param {string} eventId
   * @returns {{ status: string, available: boolean, operatorId: string|null, fee: number, serviceType: string }}
   */
  static getAvailabilityForEvent(eventId) {
    if (!eventId) {
      return {
        status: PIC_AVAILABILITY_STATUS.PIC_UNAVAILABLE,
        available: false,
        operatorId: null,
        fee: 0,
        serviceType: VENUE_ASSIST_SERVICE_TYPE.FULL_VENUE_ASSIST
      };
    }

    const assignment = state.event_pics?.find(
      ep => ep.event_id === eventId && ep.status === 'ACTIVE'
    );

    if (!assignment) {
      return {
        status: PIC_AVAILABILITY_STATUS.PIC_UNAVAILABLE,
        available: false,
        operatorId: null,
        fee: 0,
        serviceType: VENUE_ASSIST_SERVICE_TYPE.FULL_VENUE_ASSIST
      };
    }

    // Check shift presence for ON_SITE status
    const shift = state.venue_shifts?.find(
      s => s.event_id === eventId && s.pic_user_id === assignment.pic_user_id && s.status === 'CHECKED_IN'
    );

    const status = shift ? PIC_AVAILABILITY_STATUS.PIC_ON_SITE : PIC_AVAILABILITY_STATUS.PIC_AVAILABLE;
    const fee = this.getFeeForEvent(eventId);

    return {
      status,
      available: true,
      operatorId: assignment.pic_user_id,
      fee,
      serviceType: VENUE_ASSIST_SERVICE_TYPE.FULL_VENUE_ASSIST
    };
  }

  /**
   * Resolves configurable Venue Assist fee
   * @param {string} eventId
   * @param {string} [venueId]
   * @param {string} [countryCode='ID']
   * @returns {number} Integer minor unit fee
   */
  static getFeeForEvent(eventId, venueId = null, countryCode = 'ID') {
    // Allows per-event override if stored on event
    const event = state.events?.find(e => e.id === eventId);
    if (event?.venue_assist_fee) {
      return parseInt(event.venue_assist_fee, 10);
    }
    return DEFAULT_VENUE_ASSIST_FEE_IDR;
  }

  /**
   * Attaches optional Venue Assist service to an order.
   * Strict invariant: Rejected if Venue Assist is unavailable for the event!
   * @param {string} orderId
   * @param {object} [options]
   */
  static async attachVenueAssistToOrder(orderId, options = {}) {
    const order = state.orders?.find(o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const availability = this.getAvailabilityForEvent(order.event_id);
    if (!availability.available) {
      const err = new Error(
        `Venue Assist is not available for event '${order.event_id}'. No active verified operator is assigned.`
      );
      err.code = 'VENUE_ASSIST_UNAVAILABLE';
      err.status = 400;
      throw err;
    }

    const fee = availability.fee;
    order.venue_assist = true;
    order.venue_assist_status = 'REQUESTED';
    order.venue_assist_fee = fee;
    order.venue_assist_operator_id = availability.operatorId;

    await recordAuditLog('ORDER', orderId, 'VENUE_ASSIST_ATTACHED', order.buyer_id || 'BUYER', {
      fee,
      operatorId: availability.operatorId,
      status: availability.status
    });

    return {
      success: true,
      orderId,
      venue_assist: true,
      fee,
      operatorId: availability.operatorId
    };
  }
}

module.exports = {
  VenueAssistService,
  PIC_AVAILABILITY_STATUS,
  VENUE_ASSIST_SERVICE_TYPE,
  DEFAULT_VENUE_ASSIST_FEE_IDR
};

