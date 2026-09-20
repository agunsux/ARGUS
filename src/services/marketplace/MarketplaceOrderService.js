/**
 * TIKUM / ARGUS — Marketplace Order Orchestration Service (Epic 6, Phase 1C)
 *
 * Orchestrates the lifecycle:
 * Reservation -> Order -> Payment -> Escrow -> Fulfillment -> Completion
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. MarketplaceOrderService is strictly an ORCHESTRATION layer.
 *    It coordinates state transitions across Reservation, Payment, Escrow, and Ticket layers.
 * 2. EscrowService is authoritative for escrow financial state.
 * 3. FinancialLedger is authoritative for balanced double-entry accounting.
 * 4. PaymentService is the provider abstraction layer.
 * 5. PAID !== SELLER PAID. Payment success funds escrow; it NEVER automatically settles seller.
 * 6. Financial history (orders, payments, escrows, ledger records) is immutable and NEVER deleted.
 * 7. In-memory persistence is development/test only. See ADR: PERSISTENCE_BOUNDARY.
 */

const { state, recordAuditLog } = require('../../database');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('../escrowService');
const { PaymentService } = require('../payment/PaymentService');
const { ReservationService, RESERVATION_STATUS, reservationMutex } = require('./ReservationService');
const { TicketInventoryService, TICKET_STATUS } = require('./TicketInventoryService');
const { LISTING_STATUS } = require('./MarketplaceListingService');

/**
 * Minimal, canonical marketplace order statuses.
 */
const MARKETPLACE_ORDER_STATUS = {
  CREATED: 'CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',                         // Escrow funded (maps to ORDER_STATUS.PAID_ESCROWED)
  FULFILLMENT_PENDING: 'FULFILLMENT_PENDING',
  FULFILLED: 'FULFILLED',
  COMPLETED: 'COMPLETED',               // Settle & disbursed (maps to ORDER_STATUS.SETTLED)
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CANCELLED: 'CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED'
};

/**
 * Strictly defined state machine transitions.
 */
const ALLOWED_ORDER_TRANSITIONS = {
  [MARKETPLACE_ORDER_STATUS.CREATED]: [
    MARKETPLACE_ORDER_STATUS.PAYMENT_PENDING,
    MARKETPLACE_ORDER_STATUS.CANCELLED
  ],
  [MARKETPLACE_ORDER_STATUS.PAYMENT_PENDING]: [
    MARKETPLACE_ORDER_STATUS.PAID,
    MARKETPLACE_ORDER_STATUS.PAYMENT_FAILED,
    MARKETPLACE_ORDER_STATUS.CANCELLED
  ],
  [MARKETPLACE_ORDER_STATUS.PAID]: [
    MARKETPLACE_ORDER_STATUS.FULFILLMENT_PENDING,
    MARKETPLACE_ORDER_STATUS.REFUND_PENDING,
    MARKETPLACE_ORDER_STATUS.REFUNDED
  ],
  [MARKETPLACE_ORDER_STATUS.FULFILLMENT_PENDING]: [
    MARKETPLACE_ORDER_STATUS.FULFILLED,
    MARKETPLACE_ORDER_STATUS.REFUND_PENDING,
    MARKETPLACE_ORDER_STATUS.REFUNDED
  ],
  [MARKETPLACE_ORDER_STATUS.FULFILLED]: [
    MARKETPLACE_ORDER_STATUS.COMPLETED,
    MARKETPLACE_ORDER_STATUS.REFUND_PENDING
  ],
  [MARKETPLACE_ORDER_STATUS.COMPLETED]: [], // Terminal
  [MARKETPLACE_ORDER_STATUS.PAYMENT_FAILED]: [
    MARKETPLACE_ORDER_STATUS.PAYMENT_PENDING,
    MARKETPLACE_ORDER_STATUS.CANCELLED
  ],
  [MARKETPLACE_ORDER_STATUS.CANCELLED]: [], // Terminal
  [MARKETPLACE_ORDER_STATUS.REFUND_PENDING]: [
    MARKETPLACE_ORDER_STATUS.REFUNDED
  ],
  [MARKETPLACE_ORDER_STATUS.REFUNDED]: [] // Terminal
};

class MarketplaceOrderService {
  /**
   * Converts an active reservation into an order.
   *
   * Invariants enforced:
   * 1. Only reservation owner (buyerId) may convert.
   * 2. Exactly one order per reservation (idempotent duplicate rejection).
   * 3. Expired or released reservations are rejected.
   * 4. Listing cannot generate multiple orders (guarded by reservation mutex).
   * 5. Pricing is snapshotted; never recalculated later.
   * 6. Ticket remains locked; ownership does not change upon order creation.
   *
   * @PERSISTENCE_BOUNDARY — state.orders, state.escrows mutations
   */
  static async createOrderFromReservation({
    reservationId,
    buyerId,
    paymentDeadlineHours = 2,
    quoteId = null,
    policyVersion = null,
    taxPolicyVersion = null
  }) {
    if (!reservationId || !buyerId) {
      const err = new Error('reservationId and buyerId are required');
      err.code = 'INVALID_ORDER_PAYLOAD';
      throw err;
    }

    // 1. Locate reservation
    const reservation = (state.reservations || []).find(r => r.id === reservationId || r.reservation_id === reservationId);
    if (!reservation) {
      const err = new Error(`Reservation '${reservationId}' not found`);
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    // 2. Concurrency lock on listing to prevent parallel conversions
    const unlock = await reservationMutex.acquire(reservation.listing_id);
    try {
      // 3. Re-check reservation ownership
      if (reservation.buyer_id !== buyerId) {
        const err = new Error('Forbidden: You do not own this reservation');
        err.code = 'UNAUTHORIZED_RESERVATION_OWNER';
        err.status = 403;
        throw err;
      }

      // 4. Idempotency: Check if an order already exists for this reservation
      const existingOrder = (state.orders || []).find(o => o.reservation_id === reservationId);
      if (existingOrder) {
        const existingEscrow = (state.escrows || []).find(e => e.order_id === existingOrder.id);
        return {
          order: existingOrder,
          escrow: existingEscrow,
          idempotent: true,
          message: 'Order already exists for this reservation'
        };
      }

      // 5. Reservation validity check
      if (reservation.status !== RESERVATION_STATUS.PENDING) {
        const err = new Error(`Cannot create order: Reservation is in '${reservation.status}' status`);
        err.code = 'RESERVATION_NOT_PENDING';
        err.status = 409;
        throw err;
      }

      if (new Date(reservation.expires_at) <= new Date()) {
        const err = new Error('Cannot create order: Reservation has expired');
        err.code = 'RESERVATION_EXPIRED';
        err.status = 410;
        throw err;
      }

      // 6. Delegate order and escrow creation to authoritative EscrowService
      const escrowResult = await EscrowService.createOrder({
        buyerId,
        listingId: reservation.listing_id,
        reservationId,
        paymentDeadlineHours,
        quoteId,
        policyVersion,
        taxPolicyVersion
      });

      const { order, escrow, pricing } = escrowResult;

      // 7. Decorate order with marketplace orchestration metadata
      order.reservation_id = reservationId;
      order.marketplace_status = MARKETPLACE_ORDER_STATUS.PAYMENT_PENDING;

      // Ensure ticket remains locked
      const ticket = TicketInventoryService.findTicket(order.ticket_id);
      if (ticket) {
        ticket.status = TICKET_STATUS.LOCKED;
      }

      await recordAuditLog('MARKETPLACE_ORDER', order.id, 'CREATED_FROM_RESERVATION', buyerId, {
        reservation_id: reservationId,
        listing_id: order.listing_id,
        ticket_id: order.ticket_id,
        pricing: order.pricing || pricing,
        marketplace_status: order.marketplace_status
      });

      return {
        order,
        escrow,
        pricing,
        idempotent: false
      };
    } finally {
      unlock();
    }
  }

  /**
   * Initiates payment for an order through the payment subsystem.
   *
   * @param {Object} params
   * @param {string} params.orderId - Order ID
   * @param {string} params.buyerId - Authenticated buyer ID
   * @param {string} params.channel - Payment channel (e.g. 'TEST_ESCROW_VA', 'IPAYMU_QRIS')
   * @param {string} [params.providerName='test_provider'] - Target provider
   * @returns {Object} Payment session details
   */
  static async initiatePayment({ orderId, buyerId, channel, providerName = 'test_provider' }) {
    const order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (order.buyer_id !== buyerId) {
      const err = new Error('Forbidden: You do not own this order');
      err.code = 'UNAUTHORIZED_ORDER_BUYER';
      err.status = 403;
      throw err;
    }

    const currentStatus = order.marketplace_status || order.status;
    if (currentStatus !== MARKETPLACE_ORDER_STATUS.PAYMENT_PENDING && currentStatus !== ORDER_STATUS.PENDING_PAYMENT) {
      const err = new Error(`Cannot initiate payment for order in '${currentStatus}' status`);
      err.code = 'INVALID_ORDER_STATE_FOR_PAYMENT';
      throw err;
    }

    // Call unified PaymentService abstraction
    const paymentSession = await PaymentService.createPayment({
      orderId: order.id,
      amount: order.total_amount,
      channel,
      buyer: { id: buyerId },
      providerName
    });

    await recordAuditLog('MARKETPLACE_ORDER', orderId, 'PAYMENT_INITIATED', buyerId, {
      provider: providerName,
      channel,
      amount: order.total_amount,
      provider_ref: paymentSession.providerRef
    });

    return paymentSession;
  }

  /**
   * Processes gateway webhook callback idempotently.
   *
   * On SUCCESS: transitions Escrow to ESCROWED, Order to PAID. (PAID != SELLER PAID)
   * On FAILED: transitions Order to PAYMENT_FAILED, releases inventory back to available.
   *
   * @PERSISTENCE_BOUNDARY — state.orders, state.escrows, state.payments, state.listings mutations
   */
  static async processPaymentCallback({ providerName = 'test_provider', headers = {}, body = {}, rawPayload = null }) {
    // 1. Delegate signature verification and normalization to PaymentService
    const webhookResult = await PaymentService.handleWebhook({
      providerName,
      headers,
      body,
      rawPayload
    });

    if (webhookResult.idempotent) {
      return {
        idempotent: true,
        orderId: webhookResult.orderId,
        providerRef: webhookResult.providerRef,
        message: 'Duplicate payment callback safely ignored'
      };
    }

    const event = webhookResult.event;
    const orderId = event.orderId;
    const order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found for webhook callback`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    // 2. Handle SETTLED (Successful Payment)
    if (event.status === 'SETTLED') {
      // Call authoritative EscrowService to lock funds into escrow and update double-entry ledger
      const paymentResult = await EscrowService.recordPayment({
        orderId: order.id,
        providerRef: event.providerRef,
        idempotencyKey: event.idempotencyKey || event.providerRef,
        amountPaid: event.amount
      });

      order.marketplace_status = MARKETPLACE_ORDER_STATUS.PAID;

      // Invariant check: Verify seller is NOT paid
      const escrow = state.escrows.find(e => e.order_id === orderId);
      if (escrow && escrow.status === ESCROW_STATUS.RELEASED) {
        throw new Error('[FATAL_INVARIANT_BREACH] Escrow prematurely released to seller upon payment capture!');
      }

      await recordAuditLog('MARKETPLACE_ORDER', order.id, 'PAYMENT_CONFIRMED_ESCROWED', 'PAYMENT_GATEWAY', {
        provider_ref: event.providerRef,
        amount: event.amount,
        escrow_status: escrow ? escrow.status : null
      });

      return {
        success: true,
        status: MARKETPLACE_ORDER_STATUS.PAID,
        payment: paymentResult.payment,
        order,
        escrow,
        idempotent: false
      };
    }

    // 3. Handle FAILED / TIMEOUT Payment
    if (event.status === 'FAILED' || event.status === 'TIMEOUT') {
      await this.handlePaymentFailure(orderId, event.reason || 'Payment failed or timed out at gateway');
      return {
        success: false,
        status: MARKETPLACE_ORDER_STATUS.PAYMENT_FAILED,
        orderId,
        message: 'Payment failure handled and inventory released'
      };
    }

    return {
      success: true,
      status: event.status,
      orderId,
      message: `Webhook processed with status '${event.status}'`
    };
  }

  /**
   * Handles payment failure:
   * Marks order as PAYMENT_FAILED and safely unlocks inventory so the ticket
   * is not permanently stuck.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async handlePaymentFailure(orderId, reason = 'Payment failed') {
    const order = (state.orders || []).find(o => o.id === orderId);
    if (!order) return;

    // Do not fail an already paid order
    if (order.marketplace_status === MARKETPLACE_ORDER_STATUS.PAID || order.status === ORDER_STATUS.PAID_ESCROWED) {
      return;
    }

    order.marketplace_status = MARKETPLACE_ORDER_STATUS.PAYMENT_FAILED;
    order.updated_at = new Date().toISOString();

    // Revert Listing to ACTIVE
    const listing = (state.listings || []).find(l => l.id === order.listing_id || l.listing_id === order.listing_id);
    if (listing && (listing.status === LISTING_STATUS.RESERVED || listing.status === 'RESERVED')) {
      listing.status = LISTING_STATUS.ACTIVE;
      listing.reserved_at = null;
      listing.reserved_by = null;
      listing.updated_at = new Date().toISOString();
    }

    // Revert Ticket to LISTED
    const ticket = TicketInventoryService.findTicket(order.ticket_id);
    if (ticket && (ticket.status === TICKET_STATUS.LOCKED || ticket.status === 'LOCKED')) {
      ticket.status = TICKET_STATUS.LISTED;
      ticket.locked_by = null;
      ticket.updated_at = new Date().toISOString();
    }

    // Release reservation if present
    if (order.reservation_id) {
      const res = (state.reservations || []).find(r => r.id === order.reservation_id);
      if (res && res.status !== RESERVATION_STATUS.EXPIRED) {
        res.status = RESERVATION_STATUS.RELEASED;
        res.release_reason = reason;
        res.updated_at = new Date().toISOString();
      }
    }

    await recordAuditLog('MARKETPLACE_ORDER', orderId, 'PAYMENT_FAILED_INVENTORY_RELEASED', 'SYSTEM', {
      reason,
      listing_id: order.listing_id,
      ticket_id: order.ticket_id
    });
  }

  /**
   * Cancels a pre-payment order and unlocks inventory.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async cancelOrder(orderId, actorId, reason = 'Buyer cancelled before payment') {
    const order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const currentStatus = order.marketplace_status || order.status;
    if (currentStatus !== MARKETPLACE_ORDER_STATUS.CREATED &&
        currentStatus !== MARKETPLACE_ORDER_STATUS.PAYMENT_PENDING &&
        currentStatus !== ORDER_STATUS.PENDING_PAYMENT) {
      const err = new Error(`Cannot cancel order from status '${currentStatus}'. Paid orders must use refund workflow.`);
      err.code = 'CANNOT_CANCEL_ORDER';
      throw err;
    }

    order.marketplace_status = MARKETPLACE_ORDER_STATUS.CANCELLED;
    order.status = ORDER_STATUS.CANCELLED;
    order.cancellation_reason = reason;
    order.updated_at = new Date().toISOString();

    // Revert inventory
    const listing = (state.listings || []).find(l => l.id === order.listing_id || l.listing_id === order.listing_id);
    if (listing && (listing.status === LISTING_STATUS.RESERVED || listing.status === 'RESERVED')) {
      listing.status = LISTING_STATUS.ACTIVE;
      listing.reserved_at = null;
      listing.reserved_by = null;
      listing.updated_at = new Date().toISOString();
    }

    const ticket = TicketInventoryService.findTicket(order.ticket_id);
    if (ticket && (ticket.status === TICKET_STATUS.LOCKED || ticket.status === 'LOCKED')) {
      ticket.status = TICKET_STATUS.LISTED;
      ticket.locked_by = null;
      ticket.updated_at = new Date().toISOString();
    }

    await recordAuditLog('MARKETPLACE_ORDER', orderId, 'CANCELLED', actorId, {
      reason,
      listing_id: order.listing_id,
      ticket_id: order.ticket_id
    });

    return order;
  }

  /**
   * Issues a refund for a paid order.
   *
   * Invariants:
   * 1. Preserves original order, payment, escrow, and ledger records (never deletes financial history).
   * 2. Re-invoking refund on already refunded order is idempotent.
   * 3. Cannot refund if funds were already released/disbursed to seller.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async refundOrder({ orderId, actorId, reason = 'Buyer refund request' }) {
    const order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const escrow = (state.escrows || []).find(e => e.order_id === orderId);
    if (!escrow) {
      const err = new Error(`Escrow record not found for order '${orderId}'`);
      err.code = 'ESCROW_NOT_FOUND';
      throw err;
    }

    // Idempotency: If already refunded, return existing state without creating duplicate ledger entries
    if (order.marketplace_status === MARKETPLACE_ORDER_STATUS.REFUNDED ||
        order.status === ORDER_STATUS.REFUNDED ||
        escrow.status === ESCROW_STATUS.REFUNDED) {
      return {
        success: true,
        idempotent: true,
        order,
        escrow,
        message: 'Order has already been refunded'
      };
    }

    // Delegate refund execution to authoritative EscrowService (handles FinancialLedger reversal)
    const refundResult = await EscrowService.refundToBuyer(orderId, actorId, reason);

    order.marketplace_status = MARKETPLACE_ORDER_STATUS.REFUNDED;
    order.updated_at = new Date().toISOString();

    await recordAuditLog('MARKETPLACE_ORDER', orderId, 'REFUNDED', actorId, {
      amount: escrow.total_paid,
      reason
    });

    return {
      success: true,
      idempotent: false,
      order,
      escrow: refundResult.escrow,
      reason
    };
  }

  /**
   * Transitions order status within allowed state machine constraints.
   */
  static async transitionOrderStatus(orderId, targetStatus, actorId, reason = null) {
    const order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const currentStatus = order.marketplace_status || order.status;
    const allowed = ALLOWED_ORDER_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      const err = new Error(
        `Illegal order status transition: ${currentStatus} -> ${targetStatus}. Allowed from ${currentStatus}: [${(allowed || []).join(', ')}]`
      );
      err.code = 'ILLEGAL_ORDER_STATUS_TRANSITION';
      throw err;
    }

    const previousStatus = currentStatus;
    order.marketplace_status = targetStatus;
    order.updated_at = new Date().toISOString();

    await recordAuditLog('MARKETPLACE_ORDER', orderId, `STATUS_${targetStatus}`, actorId, {
      previous_status: previousStatus,
      new_status: targetStatus,
      reason
    });

    return order;
  }

  /**
   * Retrieves order by ID.
   */
  static getOrder(orderId) {
    return (state.orders || []).find(o => o.id === orderId) || null;
  }
}

module.exports = {
  MarketplaceOrderService,
  MARKETPLACE_ORDER_STATUS,
  ALLOWED_ORDER_TRANSITIONS
};

