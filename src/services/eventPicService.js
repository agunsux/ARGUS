const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { EscrowService } = require('./escrowService');

class EventPicService {
  static ALLOWED_ENTRY_STATUS = [
    'CONFIRMED',
    'INVALID',
    'DUPLICATE_ENTRY',
    'NO_SHOW_BUYER',
    'NO_SHOW_SELLER',
    'TICKET_PROBLEM',
    'GATE_REJECTION'
  ];

  static NEXT_ACTION_MAP = {
    CONFIRMED: 'RELEASE_SETTLEMENT',
    INVALID: 'OPEN_DISPUTE_INVESTIGATION',
    DUPLICATE_ENTRY: 'REJECT_DUPLICATE_HOLD_ESCROW',
    NO_SHOW_BUYER: 'HOLD_ESCROW_AWAIT_OPS_REVIEW',
    NO_SHOW_SELLER: 'HOLD_ESCROW_AWAIT_OPS_REVIEW',
    TICKET_PROBLEM: 'OPEN_DISPUTE_INVESTIGATION',
    GATE_REJECTION: 'OPEN_DISPUTE_INVESTIGATION'
  };
  /**
   * Check if PIC is assigned and active for an event (H-1 to H+1 window)
   */
  static isPicActiveForEvent(picUserId, eventId, currentDateStr = null) {
    const assignment = state.event_pics.find(
      ep => ep.pic_user_id === picUserId && ep.event_id === eventId && ep.status === 'ACTIVE'
    );
    if (!assignment) {
      return { active: false, reason: 'PIC not assigned to this event' };
    }

    const event = state.events.find(e => e.id === eventId);
    if (!event) {
      return { active: false, reason: 'Event not found' };
    }

    // Check window if currentDateStr is explicitly passed, or if in real production mode
    if (currentDateStr) {
      const now = new Date(currentDateStr);
      const eventDate = new Date(event.date);
      const diffTime = Math.abs(now.getTime() - eventDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 2) {
        return {
          active: false,
          reason: `Operational window closed. PIC is only active H-1 to H+1 of event date (${event.date})`,
          eventDate: event.date
        };
      }
    } else if (process.env.NODE_ENV !== 'test') {
      const now = new Date();
      const eventDate = new Date(event.date);
      const diffTime = Math.abs(now.getTime() - eventDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 2) {
        return {
          active: false,
          reason: `Operational window closed. PIC is only active H-1 to H+1 of event date (${event.date})`,
          eventDate: event.date
        };
      }
    }

    return { active: true, assignment, event };
  }

  /**
   * Assign PIC to an event, venue, and date
   */
  static assignPic({ eventId, venueId, picUserId, contactPhone }) {
    const user = state.users.find(u => u.id === picUserId);
    if (!user || user.role !== 'pic') {
      const err = new Error('User must exist and have role "pic"');
      err.code = 'INVALID_PIC_USER';
      throw err;
    }

    const event = state.events.find(e => e.id === eventId);
    if (!event) throw new Error('Event not found');

    const venue = state.venues.find(v => v.id === venueId);
    if (!venue) throw new Error('Venue not found');

    const id = `pic-assign-${uuidv4().substring(0, 8)}`;
    const assignment = {
      id,
      event_id: eventId,
      venue_id: venueId,
      pic_user_id: picUserId,
      event_date: event.date,
      status: 'ACTIVE',
      contact_phone: contactPhone || user.phone
    };
    state.event_pics.push(assignment);

    return assignment;
  }

  /**
   * Get operational cell dashboard for a PIC at an event
   * Groups all orders by EVENT -> VENUE -> DATE -> PIC
   */
  static getPicEventDashboard(picUserId, eventId, currentDateStr = null) {
    const activeCheck = this.isPicActiveForEvent(picUserId, eventId, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(activeCheck.reason);
      err.code = 'PIC_NOT_ACTIVE';
      throw err;
    }

    const event = activeCheck.event;
    const venue = state.venues.find(v => v.id === event.venue_id) || {};

    // Get all orders for this event
    const eventOrders = state.orders.filter(o => o.event_id === eventId);

    const ordersDetails = eventOrders.map(order => {
      const ticket = state.tickets.find(t => t.id === order.ticket_id) || {};
      const buyer = state.users.find(u => u.id === order.buyer_id) || {};
      const seller = state.users.find(u => u.id === order.seller_id) || {};
      const escrow = state.escrows.find(e => e.order_id === order.id) || {};
      const verification = state.entry_verifications.find(ev => ev.order_id === order.id) || null;

      return {
        order_id: order.id,
        status: order.status,
        ticket_id: ticket.id,
        seat_info: ticket.seat_info,
        face_value: ticket.face_value,
        price: order.ticket_price,
        buyer_name: buyer.name,
        buyer_phone: buyer.phone,
        seller_name: seller.name,
        seller_phone: seller.phone,
        escrow_status: escrow.status,
        entry_status: verification ? verification.status : 'PENDING_ENTRY',
        gate: verification ? verification.gate : null,
        verified_at: verification ? verification.verified_at : null
      };
    });

    return {
      operational_cell: {
        pic_id: picUserId,
        event_id: event.id,
        event_title: event.title,
        event_date: event.date,
        venue_id: venue.id,
        venue_name: venue.name,
        venue_city: venue.city,
        gate_info: venue.gate_info
      },
      stats: {
        total_orders: ordersDetails.length,
        entered: ordersDetails.filter(o => o.entry_status === 'CONFIRMED').length,
        pending: ordersDetails.filter(o => o.entry_status === 'PENDING_ENTRY').length,
        issues: ordersDetails.filter(o => o.entry_status === 'INVALID' || o.status === 'DISPUTED').length
      },
      orders: ordersDetails
    };
  }

  /**
   * PIC verifies buyer at venue and confirms physical entry through gate
   */
  static async recordEntryVerification({ picUserId, orderId, gate, notes, status = 'CONFIRMED', reason = null, nextAction = null, evidenceBundleId = null, currentDateStr = null }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (!this.ALLOWED_ENTRY_STATUS.includes(status)) {
      const err = new Error(`Invalid entry status: ${status}. Allowed: ${this.ALLOWED_ENTRY_STATUS.join(', ')}`);
      err.code = 'INVALID_ENTRY_STATUS';
      throw err;
    }

    const activeCheck = this.isPicActiveForEvent(picUserId, order.event_id, currentDateStr);
    if (!activeCheck.active) {
      const err = new Error(`Unauthorized: ${activeCheck.reason}`);
      err.code = 'PIC_UNAUTHORIZED';
      throw err;
    }

    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    if (!ticket) throw new Error('Ticket not found');

    // Check if duplicate entry already recorded
    const existingEntry = state.entry_verifications.find(ev => ev.order_id === orderId);
    if (existingEntry && existingEntry.status === 'CONFIRMED') {
      const err = new Error('Entry already confirmed for this order');
      err.code = 'DUPLICATE_ENTRY_CONFIRMATION';
      throw err;
    }

    const verificationId = `ent-${uuidv4()}`;
    const verification = {
      id: verificationId,
      order_id: orderId,
      ticket_id: order.ticket_id,
      pic_id: picUserId,
      actor: picUserId,
      status: status, // CONFIRMED, INVALID, DUPLICATE_ENTRY, NO_SHOW_BUYER, NO_SHOW_SELLER, TICKET_PROBLEM, GATE_REJECTION
      gate: gate || 'Main Gate',
      verified_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      notes: notes || null,
      reason: reason || notes || status,
      evidence_bundle_id: evidenceBundleId || null,
      next_action: nextAction || this.NEXT_ACTION_MAP[status] || 'OPS_REVIEW'
    };
    state.entry_verifications.push(verification);

    await recordAuditLog('ENTRY_VERIFICATION', verificationId, status, picUserId, {
      order_id: orderId,
      ticket_id: order.ticket_id,
      gate: verification.gate,
      notes
    });

    if (status === 'CONFIRMED') {
      order.status = 'ENTRY_CONFIRMED';
      ticket.status = 'REDEEMED';

      const escrow = state.escrows.find(e => e.order_id === orderId);
      if (escrow && escrow.status === 'ESCROWED') {
        escrow.status = 'RELEASE_PENDING';
      }
    }

    return verification;
  }
}

module.exports = { EventPicService };

