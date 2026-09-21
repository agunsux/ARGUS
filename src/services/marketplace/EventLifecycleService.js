/**
 * TIKUM / ARGUS — Event Lifecycle Service (Epic 6, Phase 1D)
 *
 * Manages canonical event status transitions, non-destructive cancellations,
 * automated refund orchestration, and settlement eligibility.
 *
 * CANONICAL LIFECYCLE:
 * SCHEDULED -> ONGOING -> COMPLETED
 * Branches: POSTPONED, CANCELLED
 *
 * CRITICAL CANCELLATION INVARIANTS:
 * 1. Event cancellation is NEVER DESTRUCTIVE.
 * 2. It never deletes orders, payments, escrows, tickets, or ledger entries.
 * 3. Affected paid orders trigger the authoritative refund workflow, creating balanced ledger reversals.
 * 4. Affected active listings are safely cancelled and unlisted.
 * 5. COMPLETED != AUTOMATIC SELLER PAYOUT. It sets eligible_for_settlement = true without premature disbursement.
 * 6. Persistence boundary: all mutations in-memory. See ADR: PERSISTENCE_BOUNDARY.
 */

const { state, recordAuditLog } = require('../../database');
const { MarketplaceListingService, LISTING_STATUS } = require('./MarketplaceListingService');
const { MarketplaceOrderService, MARKETPLACE_ORDER_STATUS } = require('./MarketplaceOrderService');
const { ORDER_STATUS } = require('../escrowService');

/**
 * Canonical event lifecycle statuses.
 */
const CANONICAL_EVENT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ONGOING: 'ONGOING',
  COMPLETED: 'COMPLETED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
  ARCHIVED_WITH_OPEN_OPERATIONS: 'ARCHIVED_WITH_OPEN_OPERATIONS'
};

/**
 * Allowed event status transitions.
 */
const ALLOWED_EVENT_TRANSITIONS = {
  [CANONICAL_EVENT_STATUS.SCHEDULED]: [
    CANONICAL_EVENT_STATUS.ONGOING,
    CANONICAL_EVENT_STATUS.POSTPONED,
    CANONICAL_EVENT_STATUS.CANCELLED
  ],
  'ON_SALE': [
    CANONICAL_EVENT_STATUS.ONGOING,
    CANONICAL_EVENT_STATUS.POSTPONED,
    CANONICAL_EVENT_STATUS.CANCELLED
  ],
  'SOLD_OUT': [
    CANONICAL_EVENT_STATUS.ONGOING,
    CANONICAL_EVENT_STATUS.POSTPONED,
    CANONICAL_EVENT_STATUS.CANCELLED
  ],
  [CANONICAL_EVENT_STATUS.POSTPONED]: [
    CANONICAL_EVENT_STATUS.SCHEDULED,
    CANONICAL_EVENT_STATUS.CANCELLED
  ],
  [CANONICAL_EVENT_STATUS.ONGOING]: [
    CANONICAL_EVENT_STATUS.COMPLETED,
    CANONICAL_EVENT_STATUS.CANCELLED
  ],
  [CANONICAL_EVENT_STATUS.COMPLETED]: [
    CANONICAL_EVENT_STATUS.ARCHIVED,
    CANONICAL_EVENT_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS
  ],
  [CANONICAL_EVENT_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS]: [
    CANONICAL_EVENT_STATUS.ARCHIVED
  ],
  [CANONICAL_EVENT_STATUS.ARCHIVED]: [], // terminal
  [CANONICAL_EVENT_STATUS.CANCELLED]: []  // terminal
};

/**
 * Mutex per event to guarantee atomic lifecycle transitions.
 */
class EventMutex {
  constructor() {
    this.locks = new Map();
  }

  async acquire(eventId) {
    while (this.locks.has(eventId)) {
      await this.locks.get(eventId);
    }
    let release;
    const promise = new Promise(resolve => {
      release = resolve;
    });
    this.locks.set(eventId, promise);
    return () => {
      this.locks.delete(eventId);
      release();
    };
  }
}

const eventMutex = new EventMutex();

class EventLifecycleService {
  /**
   * Initializes or returns event lifecycle state.
   */
  static getEvent(eventId) {
    return (state.events || []).find(e => e.id === eventId) || null;
  }

  /**
   * Transitions event through its lifecycle with strict state machine validation.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async transitionEvent(eventId, targetStatus, actorId = 'SYSTEM', reason = null) {
    const unlock = await eventMutex.acquire(eventId);
    try {
      const event = this.getEvent(eventId);
      if (!event) {
        const err = new Error(`Event '${eventId}' not found`);
        err.code = 'EVENT_NOT_FOUND';
        throw err;
      }

      // Map legacy or uninitialized statuses to SCHEDULED
      const currentStatus = (event.lifecycle_status || event.status || CANONICAL_EVENT_STATUS.SCHEDULED).toUpperCase();

      // Idempotency: already in target status
      if (currentStatus === targetStatus) {
        return {
          event,
          idempotent: true,
          message: `Event '${eventId}' is already in status '${targetStatus}'`
        };
      }

      // Dispatch to specialized methods for complex transitions
      if (targetStatus === CANONICAL_EVENT_STATUS.CANCELLED) {
        return await this._executeNonDestructiveCancellation(event, reason, actorId);
      }

      if (targetStatus === CANONICAL_EVENT_STATUS.COMPLETED) {
        return await this._executeCompletion(event, actorId);
      }

      const allowed = ALLOWED_EVENT_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(targetStatus)) {
        const err = new Error(
          `Illegal event status transition: ${currentStatus} -> ${targetStatus}. Allowed from ${currentStatus}: [${(allowed || []).join(', ')}]`
        );
        err.code = 'ILLEGAL_EVENT_TRANSITION';
        throw err;
      }

      const now = new Date().toISOString();
      event.status = targetStatus;
      event.lifecycle_status = targetStatus;
      event.updated_at = now;

      await recordAuditLog('EVENT_LIFECYCLE', eventId, `STATUS_${targetStatus}`, actorId, {
        previous_status: currentStatus,
        new_status: targetStatus,
        reason
      });

      return {
        event,
        idempotent: false,
        status: targetStatus
      };
    } finally {
      unlock();
    }
  }

  /**
   * Postpones an event to a new date.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async postponeEvent(eventId, newDate, reason = 'Event postponed by organizer', actorId = 'SYSTEM') {
    const unlock = await eventMutex.acquire(eventId);
    try {
      const event = this.getEvent(eventId);
      if (!event) {
        const err = new Error(`Event '${eventId}' not found`);
        err.code = 'EVENT_NOT_FOUND';
        throw err;
      }

      const currentStatus = (event.lifecycle_status || event.status || CANONICAL_EVENT_STATUS.SCHEDULED).toUpperCase();

      if (currentStatus === CANONICAL_EVENT_STATUS.COMPLETED || currentStatus === CANONICAL_EVENT_STATUS.CANCELLED) {
        const err = new Error(`Cannot postpone event in terminal status '${currentStatus}'`);
        err.code = 'EVENT_TERMINAL_CANNOT_POSTPONE';
        throw err;
      }

      const now = new Date().toISOString();
      event.status = CANONICAL_EVENT_STATUS.POSTPONED;
      event.lifecycle_status = CANONICAL_EVENT_STATUS.POSTPONED;
      event.postponed_from = event.date;
      event.date = newDate;
      event.postponed_at = now;
      event.postpone_reason = reason;
      event.updated_at = now;

      await recordAuditLog('EVENT_LIFECYCLE', eventId, 'POSTPONED', actorId, {
        previous_date: event.postponed_from,
        new_date: newDate,
        reason
      });

      return {
        success: true,
        event,
        status: CANONICAL_EVENT_STATUS.POSTPONED
      };
    } finally {
      unlock();
    }
  }

  /**
   * Cancels an event using NON-DESTRUCTIVE cascade.
   *
   * Invariants:
   * 1. Never deletes any records.
   * 2. Idempotent: multiple calls return cleanly without re-refunding.
   * 3. Cannot cancel an already COMPLETED event.
   * 4. Automatically cancels active listings (unlocking inventory).
   * 5. Automatically initiates balanced refunds for all paid orders.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async cancelEvent(eventId, reason = 'Event cancelled by organizer', actorId = 'SYSTEM') {
    const unlock = await eventMutex.acquire(eventId);
    try {
      const event = this.getEvent(eventId);
      if (!event) {
        const err = new Error(`Event '${eventId}' not found`);
        err.code = 'EVENT_NOT_FOUND';
        throw err;
      }

      return await this._executeNonDestructiveCancellation(event, reason, actorId);
    } finally {
      unlock();
    }
  }

  /**
   * Internal implementation of non-destructive event cancellation.
   */
  static async _executeNonDestructiveCancellation(event, reason, actorId) {
    const currentStatus = (event.lifecycle_status || event.status || CANONICAL_EVENT_STATUS.SCHEDULED).toUpperCase();

    // Idempotency: already cancelled
    if (currentStatus === CANONICAL_EVENT_STATUS.CANCELLED) {
      return {
        event,
        idempotent: true,
        message: 'Event is already cancelled'
      };
    }

    // Invariant: Cannot cancel a completed event
    if (currentStatus === CANONICAL_EVENT_STATUS.COMPLETED) {
      const err = new Error(`Cannot cancel event '${event.id}': Event has already COMPLETED`);
      err.code = 'CANNOT_CANCEL_COMPLETED_EVENT';
      err.status = 400;
      throw err;
    }

    const now = new Date().toISOString();
    event.status = CANONICAL_EVENT_STATUS.CANCELLED;
    event.lifecycle_status = CANONICAL_EVENT_STATUS.CANCELLED;
    event.cancelled_at = now;
    event.cancellation_reason = reason;
    event.updated_at = now;

    // 1. Cancel affected active/pending listings non-destructively
    const affectedListings = (state.listings || []).filter(l =>
      l.event_id === event.id &&
      [LISTING_STATUS.ACTIVE, LISTING_STATUS.DRAFT, LISTING_STATUS.PENDING_VERIFICATION].includes(l.status)
    );

    for (const listing of affectedListings) {
      listing.status = LISTING_STATUS.CANCELLED;
      listing.cancellation_reason = `Event cancelled: ${reason}`;
      listing.updated_at = now;
    }

    // 2. Identify and refund all paid orders non-destructively
    const affectedOrders = (state.orders || []).filter(o =>
      o.event_id === event.id &&
      (o.marketplace_status === MARKETPLACE_ORDER_STATUS.PAID ||
       o.status === ORDER_STATUS.PAID_ESCROWED ||
       o.marketplace_status === MARKETPLACE_ORDER_STATUS.FULFILLMENT_PENDING)
    );

    const refundedOrderIds = [];
    for (const order of affectedOrders) {
      try {
        await MarketplaceOrderService.refundOrder({
          orderId: order.id,
          actorId,
          reason: `Automatic refund: ${reason}`
        });
        refundedOrderIds.push(order.id);
      } catch (refundErr) {
        console.warn(`[EventLifecycleService] Order ${order.id} refund skipped or failed:`, refundErr.message);
      }
    }

    await recordAuditLog('EVENT_LIFECYCLE', event.id, 'CANCELLED', actorId, {
      reason,
      affected_listings_count: affectedListings.length,
      affected_orders_count: affectedOrders.length,
      refunded_orders_count: refundedOrderIds.length
    });

    return {
      success: true,
      idempotent: false,
      eventId: event.id,
      status: CANONICAL_EVENT_STATUS.CANCELLED,
      affectedListingsCount: affectedListings.length,
      affectedOrdersCount: affectedOrders.length,
      refundedOrdersCount: refundedOrderIds.length,
      refundedOrderIds
    };
  }

  /**
   * Marks an event as COMPLETED.
   *
   * SETTLEMENT BOUNDARY:
   * Sets event.eligible_for_settlement = true.
   * Does NOT automatically execute real money transfers to sellers.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async completeEvent(eventId, actorId = 'SYSTEM') {
    const unlock = await eventMutex.acquire(eventId);
    try {
      const event = this.getEvent(eventId);
      if (!event) {
        const err = new Error(`Event '${eventId}' not found`);
        err.code = 'EVENT_NOT_FOUND';
        throw err;
      }

      return await this._executeCompletion(event, actorId);
    } finally {
      unlock();
    }
  }

  static async _executeCompletion(event, actorId) {
    const currentStatus = (event.lifecycle_status || event.status || CANONICAL_EVENT_STATUS.SCHEDULED).toUpperCase();

    if (currentStatus === CANONICAL_EVENT_STATUS.COMPLETED) {
      return {
        event,
        idempotent: true,
        message: 'Event is already COMPLETED'
      };
    }

    if (currentStatus === CANONICAL_EVENT_STATUS.CANCELLED) {
      const err = new Error(`Cannot complete event '${event.id}': Event is CANCELLED`);
      err.code = 'CANNOT_COMPLETE_CANCELLED_EVENT';
      throw err;
    }

    const now = new Date().toISOString();
    event.status = CANONICAL_EVENT_STATUS.COMPLETED;
    event.lifecycle_status = CANONICAL_EVENT_STATUS.COMPLETED;
    event.completed_at = now;
    event.eligible_for_settlement = true; // Settlement Boundary: Flagged eligible, no auto payout
    event.updated_at = now;

    await recordAuditLog('EVENT_LIFECYCLE', event.id, 'COMPLETED', actorId, {
      completed_at: now,
      eligible_for_settlement: true
    });

    return {
      success: true,
      idempotent: false,
      eventId: event.id,
      status: CANONICAL_EVENT_STATUS.COMPLETED,
      eligibleForSettlement: true
    };
  }

  /**
   * Checks whether an event is eligible for settlement.
   */
  static isEventEligibleForSettlement(eventId) {
    const event = this.getEvent(eventId);
    if (!event) return false;
    return event.status === CANONICAL_EVENT_STATUS.COMPLETED && !!event.eligible_for_settlement;
  }
}

module.exports = {
  EventLifecycleService,
  CANONICAL_EVENT_STATUS,
  ALLOWED_EVENT_TRANSITIONS,
  eventMutex
};
