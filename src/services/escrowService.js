const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { LISTING_STATUS } = require('./listingService');

const ESCROW_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  ESCROWED: 'ESCROWED',
  RELEASE_PENDING: 'RELEASE_PENDING',
  RELEASED: 'RELEASED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED'
};

const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID_ESCROWED: 'PAID_ESCROWED',
  ENTRY_CONFIRMED: 'ENTRY_CONFIRMED',
  SETTLED: 'SETTLED',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED'
};

class EscrowService {
  /**
   * Calculate transparent fee breakdown
   */
  static calculatePricing(ticketPrice, feePercentage = 0.10) {
    const price = parseInt(ticketPrice);
    const platformFee = Math.round(price * feePercentage);
    const totalAmount = price + platformFee;
    return {
      ticketPrice: price,
      platformFee: platformFee,
      feePercentage: feePercentage,
      totalAmount: totalAmount,
      currency: 'IDR'
    };
  }

  /**
   * Buyer creates an order on a verified active listing
   */
  static async createOrder({ buyerId, listingId }) {
    const buyer = state.users.find(u => u.id === buyerId);
    if (!buyer) {
      const err = new Error('Buyer not found');
      err.code = 'BUYER_NOT_FOUND';
      throw err;
    }

    const listing = state.listings.find(l => l.id === listingId);
    if (!listing) {
      const err = new Error('Listing not found');
      err.code = 'LISTING_NOT_FOUND';
      throw err;
    }

    if (listing.status !== LISTING_STATUS.ACTIVE) {
      const err = new Error(`Listing is not available for purchase (status: ${listing.status})`);
      err.code = 'LISTING_NOT_ACTIVE';
      throw err;
    }

    const pricing = this.calculatePricing(listing.price);
    const orderId = `ord-${uuidv4()}`;

    // Reserve listing immediately
    listing.status = LISTING_STATUS.RESERVED;

    const order = {
      id: orderId,
      buyer_id: buyerId,
      listing_id: listingId,
      seller_id: listing.seller_id,
      ticket_id: listing.ticket_id,
      event_id: listing.event_id,
      ticket_price: pricing.ticketPrice,
      platform_fee: pricing.platformFee,
      total_amount: pricing.totalAmount,
      status: ORDER_STATUS.PENDING_PAYMENT,
      created_at: new Date().toISOString()
    };
    state.orders.push(order);

    // Create Escrow account record in PENDING_PAYMENT
    const escrowId = `esc-${uuidv4()}`;
    const escrow = {
      id: escrowId,
      order_id: orderId,
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      amount: pricing.ticketPrice, // Seller will receive ticket price; ARGUS fee collected
      total_paid: pricing.totalAmount,
      status: ESCROW_STATUS.PENDING_PAYMENT,
      provider_escrow_id: null,
      created_at: new Date().toISOString(),
      released_at: null,
      refunded_at: null
    };
    state.escrows.push(escrow);

    await recordAuditLog('ORDER', orderId, 'CREATED', buyerId, {
      listing_id: listingId,
      pricing
    });

    await recordAuditLog('ESCROW', escrowId, 'CREATED', buyerId, {
      order_id: orderId,
      status: ESCROW_STATUS.PENDING_PAYMENT
    });

    return { order, escrow, pricing };
  }

  /**
   * Process payment confirmation (idempotent) and transition to ESCROWED
   */
  static async recordPayment({ orderId, providerRef, idempotencyKey, amountPaid }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    // Check idempotency: if payment already recorded with this key
    const existingPayment = state.payments.find(p => p.idempotency_key === idempotencyKey);
    if (existingPayment) {
      const escrow = state.escrows.find(e => e.order_id === orderId);
      return { payment: existingPayment, order, escrow, idempotent: true };
    }

    if (amountPaid && parseInt(amountPaid) !== order.total_amount) {
      const err = new Error(`Payment amount mismatch. Expected ${order.total_amount}, got ${amountPaid}`);
      err.code = 'AMOUNT_MISMATCH';
      throw err;
    }

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) {
      const err = new Error('Escrow record not found for order');
      err.code = 'ESCROW_NOT_FOUND';
      throw err;
    }

    // Record Payment
    const paymentId = `pay-${uuidv4()}`;
    const payment = {
      id: paymentId,
      order_id: orderId,
      provider_ref: providerRef || `payref-${Date.now()}`,
      amount: order.total_amount,
      status: 'SETTLED',
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString()
    };
    state.payments.push(payment);

    // Transition Escrow: PENDING_PAYMENT -> PAID -> ESCROWED
    escrow.status = ESCROW_STATUS.ESCROWED;
    escrow.provider_escrow_id = `prov-esc-${payment.provider_ref}`;

    // Update order status
    order.status = ORDER_STATUS.PAID_ESCROWED;

    // Update listing status to SOLD
    const listing = state.listings.find(l => l.id === order.listing_id);
    if (listing) {
      listing.status = LISTING_STATUS.SOLD;
    }

    // Update ticket owner/status
    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    if (ticket) {
      ticket.status = 'ESCROWED';
    }

    await recordAuditLog('PAYMENT', paymentId, 'PROCESSED', order.buyer_id, {
      order_id: orderId,
      amount: payment.amount,
      provider_ref: payment.provider_ref
    });

    await recordAuditLog('ESCROW', escrow.id, 'FUNDS_LOCKED_IN_ESCROW', 'SYSTEM', {
      order_id: orderId,
      amount_held: escrow.amount,
      provider_escrow_id: escrow.provider_escrow_id
    });

    return { payment, order, escrow, idempotent: false };
  }

  /**
   * Release escrow funds to seller (Requires verified entry)
   */
  static async releaseToSeller(orderId, actorId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) throw new Error('Escrow not found');

    if (escrow.status !== ESCROW_STATUS.ESCROWED && escrow.status !== ESCROW_STATUS.RELEASE_PENDING) {
      const err = new Error(`Cannot release escrow from status ${escrow.status}. Must be ESCROWED or RELEASE_PENDING.`);
      err.code = 'INVALID_ESCROW_STATE';
      throw err;
    }

    // CRITICAL SECURITY INVARIANT: Must have confirmed entry verification
    const verification = state.entry_verifications.find(
      ev => ev.order_id === orderId && ev.status === 'CONFIRMED'
    );
    if (!verification) {
      const err = new Error('Security violation: Cannot release escrow without confirmed venue entry by Event PIC');
      err.code = 'ENTRY_NOT_CONFIRMED';
      throw err;
    }

    // Update states
    escrow.status = ESCROW_STATUS.RELEASED;
    escrow.released_at = new Date().toISOString();

    order.status = ORDER_STATUS.SETTLED;

    const listing = state.listings.find(l => l.id === order.listing_id);
    if (listing) listing.status = LISTING_STATUS.SETTLED;

    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    if (ticket) ticket.status = 'SETTLED';

    await recordAuditLog('ESCROW', escrow.id, 'FUNDS_RELEASED_TO_SELLER', actorId, {
      order_id: orderId,
      seller_id: order.seller_id,
      amount: escrow.amount,
      released_at: escrow.released_at
    });

    return { success: true, escrow, order };
  }

  /**
   * Refund escrow funds to buyer
   */
  static async refundToBuyer(orderId, actorId, reason) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) throw new Error('Escrow not found');

    if (escrow.status === ESCROW_STATUS.RELEASED) {
      const err = new Error('Cannot refund escrow: funds already released to seller');
      err.code = 'ALREADY_RELEASED';
      throw err;
    }

    escrow.status = ESCROW_STATUS.REFUNDED;
    escrow.refunded_at = new Date().toISOString();
    order.status = ORDER_STATUS.REFUNDED;

    await recordAuditLog('ESCROW', escrow.id, 'FUNDS_REFUNDED_TO_BUYER', actorId, {
      order_id: orderId,
      buyer_id: order.buyer_id,
      amount: escrow.total_paid,
      reason,
      refunded_at: escrow.refunded_at
    });

    return { success: true, escrow, order, reason };
  }

  /**
   * Mark escrow as disputed
   */
  static async markDisputed(orderId, actorId, reason) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) throw new Error('Escrow not found');

    if (escrow.status === ESCROW_STATUS.RELEASED) {
      throw new Error('Cannot dispute: funds already released to seller');
    }

    escrow.status = ESCROW_STATUS.DISPUTED;
    order.status = ORDER_STATUS.DISPUTED;

    await recordAuditLog('ESCROW', escrow.id, 'DISPUTED', actorId, {
      order_id: orderId,
      reason
    });

    return { success: true, escrow };
  }
}

module.exports = { EscrowService, ESCROW_STATUS, ORDER_STATUS };

