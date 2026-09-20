/**
 * TIKUM / ARGUS — Ticket Delivery Service (Epic 6, Phase 1D)
 *
 * Orchestrates fulfillment, digital handoff/transfer, and venue entry.
 *
 * CANONICAL LIFECYCLE:
 * ORDER PAID -> FULFILLMENT_PENDING -> TICKET DELIVERY -> DELIVERED -> EVENT ENTRY -> USED -> COMPLETED
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Delivery must only be created for PAID orders.
 * 2. Order remains the source of record for buyer/seller/ticket/listing relationships.
 * 3. Does NOT create a competing ticket ownership layer.
 * 4. DELIVERED !== USED. Delivery marks ticket received; Venue Entry marks ticket redeemed.
 * 5. Venue Entry is strictly idempotent and race-safe (tickets cannot be redeemed twice).
 * 6. Entry does NOT automatically release seller payout.
 * 7. Persistence boundary: in-memory state is development/test only. See ADR: PERSISTENCE_BOUNDARY.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../../database');
const { TicketInventoryService, TICKET_STATUS } = require('./TicketInventoryService');
const { MARKETPLACE_ORDER_STATUS } = require('./MarketplaceOrderService');
const { ORDER_STATUS } = require('../escrowService');

/**
 * Canonical delivery status enum.
 */
const DELIVERY_STATUS = {
  PENDING: 'PENDING',
  DELIVERED: 'DELIVERED',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

/**
 * Delivery method enum.
 */
const DELIVERY_METHOD = {
  MOBILE_TRANSFER: 'MOBILE_TRANSFER',
  PDF: 'PDF',
  QR: 'QR',
  WALLET_TRANSFER: 'WALLET_TRANSFER',
  MANUAL_HANDOFF: 'MANUAL_HANDOFF'
};

/**
 * Allowed status transitions for delivery.
 */
const ALLOWED_DELIVERY_TRANSITIONS = {
  [DELIVERY_STATUS.PENDING]: [DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.FAILED, DELIVERY_STATUS.CANCELLED],
  [DELIVERY_STATUS.DELIVERED]: [DELIVERY_STATUS.CONFIRMED, DELIVERY_STATUS.FAILED],
  [DELIVERY_STATUS.CONFIRMED]: [], // terminal
  [DELIVERY_STATUS.FAILED]: [DELIVERY_STATUS.PENDING], // can retry
  [DELIVERY_STATUS.CANCELLED]: [] // terminal
};

/**
 * In-memory mutex per order/delivery to guarantee concurrency protection.
 */
class DeliveryMutex {
  constructor() {
    this.locks = new Map();
  }

  async acquire(key) {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let release;
    const promise = new Promise(resolve => {
      release = resolve;
    });
    this.locks.set(key, promise);
    return () => {
      this.locks.delete(key);
      release();
    };
  }
}

const deliveryMutex = new DeliveryMutex();

class TicketDeliveryService {
  /**
   * Initiates ticket delivery for a paid order.
   *
   * @PERSISTENCE_BOUNDARY — state.deliveries mutation
   *
   * @param {string} orderId - Paid order ID
   * @param {Object} [options]
   * @param {string} [options.deliveryMethod] - Specific transfer method
   * @param {string} [options.deliveryReference] - External transfer tracking code / PDF hash
   * @param {string} [options.notes] - Instructions or tracking notes
   * @param {string} [options.actorId] - Seller or system initiating delivery
   * @returns {Object} Delivery record
   */
  static async createDelivery(orderId, options = {}) {
    if (!orderId) {
      const err = new Error('orderId is required to create a delivery');
      err.code = 'INVALID_DELIVERY_PAYLOAD';
      throw err;
    }

    const unlock = await deliveryMutex.acquire(orderId);
    try {
      const order = (state.orders || []).find(o => o.id === orderId);
      if (!order) {
        const err = new Error(`Order '${orderId}' not found`);
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      // 1. Invariant: Delivery can only be created for PAID orders
      const isPaid = order.marketplace_status === MARKETPLACE_ORDER_STATUS.PAID ||
                     order.status === ORDER_STATUS.PAID_ESCROWED ||
                     order.marketplace_status === MARKETPLACE_ORDER_STATUS.FULFILLMENT_PENDING;
      if (!isPaid) {
        const err = new Error(`Cannot create delivery: Order '${orderId}' is not PAID (status: ${order.marketplace_status || order.status})`);
        err.code = 'ORDER_NOT_PAID';
        err.status = 400;
        throw err;
      }

      // 2. Idempotency: Check if delivery already exists for this order
      const existingDelivery = (state.deliveries || []).find(d => d.order_id === orderId);
      if (existingDelivery) {
        return {
          delivery: existingDelivery,
          idempotent: true,
          message: 'Delivery already exists for this order'
        };
      }

      // 3. Locate canonical ticket
      const ticket = TicketInventoryService.findTicket(order.ticket_id);
      if (!ticket) {
        const err = new Error(`Ticket '${order.ticket_id}' not found`);
        err.code = 'TICKET_NOT_FOUND';
        throw err;
      }

      const deliveryId = `del-${uuidv4()}`;
      const now = new Date().toISOString();

      const deliveryMethod = options.deliveryMethod ||
                             ticket.transfer_method ||
                             DELIVERY_METHOD.MOBILE_TRANSFER;

      // 4. @PERSISTENCE_BOUNDARY — Create Delivery Record
      const delivery = {
        id: deliveryId,
        delivery_id: deliveryId,
        order_id: order.id,
        ticket_id: ticket.ticket_id || ticket.id,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        status: DELIVERY_STATUS.PENDING,
        delivery_method: deliveryMethod,
        delivery_reference: options.deliveryReference || null,
        notes: options.notes || null,
        created_at: now,
        delivered_at: null,
        confirmed_at: null,
        failed_at: null,
        failure_reason: null
      };

      if (!state.deliveries) {
        state.deliveries = [];
      }
      state.deliveries.push(delivery);

      // 5. Update Order and Ticket Lifecycle States
      order.marketplace_status = MARKETPLACE_ORDER_STATUS.FULFILLMENT_PENDING;
      order.delivery_id = deliveryId;
      order.updated_at = now;

      ticket.status = TICKET_STATUS.TRANSFER_PENDING;
      ticket.updated_at = now;

      await recordAuditLog('TICKET_DELIVERY', deliveryId, 'CREATED', options.actorId || order.seller_id, {
        order_id: order.id,
        ticket_id: delivery.ticket_id,
        delivery_method: deliveryMethod,
        delivery_reference: delivery.delivery_reference
      });

      return {
        delivery,
        idempotent: false
      };
    } finally {
      unlock();
    }
  }

  /**
   * Retrieves delivery by ID.
   */
  static getDelivery(deliveryId) {
    return (state.deliveries || []).find(d => d.id === deliveryId || d.delivery_id === deliveryId) || null;
  }

  /**
   * Retrieves delivery by order ID.
   */
  static getDeliveryByOrderId(orderId) {
    return (state.deliveries || []).find(d => d.order_id === orderId) || null;
  }

  /**
   * Marks a delivery as DELIVERED by seller/system.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async markDelivered(deliveryId, { deliveryReference, notes, actorId } = {}) {
    const delivery = this.getDelivery(deliveryId);
    if (!delivery) {
      const err = new Error(`Delivery '${deliveryId}' not found`);
      err.code = 'DELIVERY_NOT_FOUND';
      throw err;
    }

    const unlock = await deliveryMutex.acquire(delivery.order_id);
    try {
      // Idempotency check: already delivered
      if (delivery.status === DELIVERY_STATUS.DELIVERED) {
        return {
          delivery,
          idempotent: true,
          message: 'Delivery already marked DELIVERED'
        };
      }

      const allowed = ALLOWED_DELIVERY_TRANSITIONS[delivery.status];
      if (!allowed || !allowed.includes(DELIVERY_STATUS.DELIVERED)) {
        const err = new Error(`Cannot mark delivered from status '${delivery.status}'`);
        err.code = 'INVALID_DELIVERY_STATE_TRANSITION';
        throw err;
      }

      const now = new Date().toISOString();
      delivery.status = DELIVERY_STATUS.DELIVERED;
      delivery.delivered_at = now;
      if (deliveryReference) delivery.delivery_reference = deliveryReference;
      if (notes) delivery.notes = notes;

      // Update ticket status to TRANSFERRED
      const ticket = TicketInventoryService.findTicket(delivery.ticket_id);
      if (ticket) {
        ticket.status = TICKET_STATUS.TRANSFERRED;
        ticket.updated_at = now;
      }

      await recordAuditLog('TICKET_DELIVERY', deliveryId, 'DELIVERED', actorId || delivery.seller_id, {
        order_id: delivery.order_id,
        delivery_reference: delivery.delivery_reference
      });

      return {
        success: true,
        delivery,
        idempotent: false
      };
    } finally {
      unlock();
    }
  }

  /**
   * Buyer confirms receipt of the ticket.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async confirmReceipt(deliveryId, actorId) {
    const delivery = this.getDelivery(deliveryId);
    if (!delivery) {
      const err = new Error(`Delivery '${deliveryId}' not found`);
      err.code = 'DELIVERY_NOT_FOUND';
      throw err;
    }

    const unlock = await deliveryMutex.acquire(delivery.order_id);
    try {
      // Idempotency check: already confirmed
      if (delivery.status === DELIVERY_STATUS.CONFIRMED) {
        return {
          delivery,
          idempotent: true,
          message: 'Delivery receipt already confirmed'
        };
      }

      // Actor validation: only buyer or admin can confirm receipt
      if (actorId && delivery.buyer_id !== actorId) {
        const actor = (state.users || []).find(u => u.id === actorId);
        if (!actor || (actor.role !== 'admin' && actor.role !== 'ops')) {
          const err = new Error('Forbidden: Only the buyer or admin can confirm receipt');
          err.code = 'UNAUTHORIZED_RECEIPT_CONFIRMATION';
          err.status = 403;
          throw err;
        }
      }

      const allowed = ALLOWED_DELIVERY_TRANSITIONS[delivery.status];
      if (!allowed || !allowed.includes(DELIVERY_STATUS.CONFIRMED)) {
        const err = new Error(`Cannot confirm receipt from status '${delivery.status}'`);
        err.code = 'INVALID_DELIVERY_STATE_TRANSITION';
        throw err;
      }

      const now = new Date().toISOString();
      delivery.status = DELIVERY_STATUS.CONFIRMED;
      delivery.confirmed_at = now;

      // Update Order to FULFILLED
      const order = (state.orders || []).find(o => o.id === delivery.order_id);
      if (order) {
        order.marketplace_status = MARKETPLACE_ORDER_STATUS.FULFILLED;
        order.updated_at = now;
      }

      await recordAuditLog('TICKET_DELIVERY', deliveryId, 'RECEIPT_CONFIRMED', actorId || delivery.buyer_id, {
        order_id: delivery.order_id,
        confirmed_at: now
      });

      return {
        success: true,
        delivery,
        idempotent: false
      };
    } finally {
      unlock();
    }
  }

  /**
   * Marks delivery as FAILED.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async markDeliveryFailed(deliveryId, reason = 'Delivery failed', actorId = 'SYSTEM') {
    const delivery = this.getDelivery(deliveryId);
    if (!delivery) {
      const err = new Error(`Delivery '${deliveryId}' not found`);
      err.code = 'DELIVERY_NOT_FOUND';
      throw err;
    }

    const unlock = await deliveryMutex.acquire(delivery.order_id);
    try {
      const allowed = ALLOWED_DELIVERY_TRANSITIONS[delivery.status];
      if (!allowed || !allowed.includes(DELIVERY_STATUS.FAILED)) {
        const err = new Error(`Cannot mark delivery failed from status '${delivery.status}'`);
        err.code = 'INVALID_DELIVERY_STATE_TRANSITION';
        throw err;
      }

      const now = new Date().toISOString();
      delivery.status = DELIVERY_STATUS.FAILED;
      delivery.failed_at = now;
      delivery.failure_reason = reason;

      // Revert ticket to SOLD so transfer can be retried
      const ticket = TicketInventoryService.findTicket(delivery.ticket_id);
      if (ticket) {
        ticket.status = TICKET_STATUS.SOLD;
        ticket.updated_at = now;
      }

      await recordAuditLog('TICKET_DELIVERY', deliveryId, 'FAILED', actorId, {
        order_id: delivery.order_id,
        reason
      });

      return {
        success: true,
        delivery
      };
    } finally {
      unlock();
    }
  }

  /**
   * Venue Entry Confirmation (Atomic & Concurrency-Safe).
   *
   * Invariants:
   * 1. Only valid, paid tickets may enter.
   * 2. Double-entry is strictly rejected. Concurrent requests: exactly 1 succeeds.
   * 3. Ticket status transitions to USED (immutable).
   * 4. USED does NOT automatically disburse seller payout.
   *
   * @PERSISTENCE_BOUNDARY
   *
   * @param {Object} params
   * @param {string} params.orderId - Order ID
   * @param {string} [params.ticketId] - Ticket ID
   * @param {string} params.actorId - Turnstile scanner or PIC ID
   * @param {string} [params.venueId] - Venue reference
   * @param {string} [params.gate='Main Gate'] - Gate identifier
   * @returns {Object} Venue entry confirmation
   */
  static async confirmVenueEntry({ orderId, ticketId, actorId, venueId = null, gate = 'Main Gate' }) {
    if (!orderId && !ticketId) {
      const err = new Error('orderId or ticketId is required for venue entry confirmation');
      err.code = 'INVALID_ENTRY_PAYLOAD';
      throw err;
    }

    // Acquire lock on the order/ticket
    const lockKey = orderId || ticketId;
    const unlock = await deliveryMutex.acquire(lockKey);
    try {
      // 1. Locate Order
      const order = orderId
        ? (state.orders || []).find(o => o.id === orderId)
        : (state.orders || []).find(o => o.ticket_id === ticketId);

      if (!order) {
        const err = new Error(`Order not found for entry confirmation`);
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      // 2. Locate Ticket
      const effectiveTicketId = ticketId || order.ticket_id;
      const ticket = TicketInventoryService.findTicket(effectiveTicketId);
      if (!ticket) {
        const err = new Error(`Ticket '${effectiveTicketId}' not found`);
        err.code = 'TICKET_NOT_FOUND';
        throw err;
      }

      // 3. Invariant: Duplicate Entry Protection (Double-Scan Prevention)
      if (ticket.status === TICKET_STATUS.USED || ticket.status === 'REDEEMED') {
        const err = new Error(`Security Violation: Ticket '${effectiveTicketId}' has already been USED. Entry denied.`);
        err.code = 'TICKET_ALREADY_USED';
        err.status = 409;
        throw err;
      }

      // 4. Ticket Validity Check
      const validEntryStatuses = [
        TICKET_STATUS.TRANSFERRED,
        TICKET_STATUS.SOLD,
        'ESCROWED',
        'VERIFIED_AT_VENUE'
      ];
      if (!validEntryStatuses.includes(ticket.status)) {
        const err = new Error(`Ticket '${effectiveTicketId}' is not in a valid state for entry (status: ${ticket.status})`);
        err.code = 'TICKET_NOT_ELIGIBLE_FOR_ENTRY';
        err.status = 400;
        throw err;
      }

      const now = new Date().toISOString();

      // 5. @PERSISTENCE_BOUNDARY — Synchronous State Transition to USED
      ticket.status = TICKET_STATUS.USED;
      ticket.used_at = now;
      ticket.used_gate = gate;
      ticket.used_venue_id = venueId;
      ticket.used_by_actor = actorId;

      // Update Order status
      order.operational_stage = 'ENTRY_CONFIRMED';
      order.entry_confirmed_at = now;
      order.updated_at = now;

      // Record in entry_verifications if not already present
      if (!state.entry_verifications) {
        state.entry_verifications = [];
      }
      const existingEntry = state.entry_verifications.find(ev => ev.order_id === order.id);
      if (!existingEntry) {
        state.entry_verifications.push({
          id: `ent-${uuidv4()}`,
          order_id: order.id,
          ticket_id: ticket.ticket_id || ticket.id,
          pic_id: actorId,
          status: 'CONFIRMED',
          gate,
          verified_at: now,
          notes: 'Turnstile gate admission confirmed'
        });
      }

      await recordAuditLog('VENUE_ENTRY', ticket.ticket_id || ticket.id, 'ENTRY_CONFIRMED', actorId, {
        order_id: order.id,
        venue_id: venueId,
        gate,
        used_at: now
      });

      return {
        success: true,
        orderId: order.id,
        ticketId: ticket.ticket_id || ticket.id,
        status: TICKET_STATUS.USED,
        usedAt: now,
        gate
      };
    } finally {
      unlock();
    }
  }
}

module.exports = {
  TicketDeliveryService,
  DELIVERY_STATUS,
  DELIVERY_METHOD,
  ALLOWED_DELIVERY_TRANSITIONS,
  deliveryMutex
};

