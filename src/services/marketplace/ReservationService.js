/**
 * TIKUM / ARGUS — Reservation Service (Epic 6, Phase 1B)
 *
 * Provides atomic, race-safe temporary inventory reservation.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Reservation is a TEMPORARY LOCK on an active listing and its canonical ticket.
 * 2. Exactly ONE buyer can successfully reserve a given listing at any moment.
 * 3. Concurrent attempts for the same listing MUST fail deterministically.
 * 4. Every reservation has a strict TTL (expires_at).
 * 5. Expired or cancelled reservations automatically revert inventory (Listing -> ACTIVE, Ticket -> LISTED).
 * 6. NO payment, escrow, or settlement side effects occur in this service.
 *
 * PERSISTENCE_BOUNDARY: All state mutations in this file are in-memory only.
 * In a distributed/multi-process environment, this requires distributed locks
 * (e.g., Redis Redlock) or database row-level locking (SELECT ... FOR UPDATE).
 * See ADR: PERSISTENCE_BOUNDARY.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../../database');
const { TicketInventoryService, TICKET_STATUS } = require('./TicketInventoryService');
const { LISTING_STATUS } = require('./MarketplaceListingService');

/**
 * Canonical reservation status enum.
 */
const RESERVATION_STATUS = {
  PENDING: 'PENDING',       // Active temporary lock, awaiting payment/order
  CONVERTED: 'CONVERTED',   // Converted to paid/escrowed order (permanent lock)
  EXPIRED: 'EXPIRED',       // Timed out, returned to inventory
  RELEASED: 'RELEASED',     // Voluntarily released by buyer or system cancel
  RECOVERED: 'RECOVERED'    // Recovered by operator / cleanup job
};

/**
 * Per-listing in-memory mutex to guarantee atomic concurrency protection
 * during reservation acquisition and release within the current Node.js process.
 */
class ListingReservationMutex {
  constructor() {
    this.locks = new Map();
  }

  async acquire(listingId) {
    while (this.locks.has(listingId)) {
      await this.locks.get(listingId);
    }
    let release;
    const promise = new Promise(resolve => {
      release = resolve;
    });
    this.locks.set(listingId, promise);
    return () => {
      this.locks.delete(listingId);
      release();
    };
  }
}

const reservationMutex = new ListingReservationMutex();

class ReservationService {
  /**
   * Default reservation TTL: 15 minutes in milliseconds.
   */
  static DEFAULT_TTL_MS = 15 * 60 * 1000;

  /**
   * Atomically reserves an active listing for a buyer.
   *
   * CONCURRENCY INVARIANT:
   * Guarded by per-listing mutex. If multiple concurrent calls target the same
   * listing, the first to acquire the lock checks listing.status === 'ACTIVE'
   * and marks it RESERVED. Subsequent callers will see listing.status !== 'ACTIVE'
   * and fail deterministically with LISTING_ALREADY_RESERVED.
   *
   * @PERSISTENCE_BOUNDARY — state.reservations, state.listings, state.tickets mutations
   *
   * @param {Object} params
   * @param {string} params.listingId - Listing to reserve
   * @param {string} params.buyerId - Authenticated buyer ID
   * @param {number} [params.ttlMinutes=15] - Reservation validity duration in minutes
   * @returns {Object} Reservation record
   */
  static async reserveListing({ listingId, buyerId, ttlMinutes = 15 }) {
    if (!listingId || !buyerId) {
      const err = new Error('listingId and buyerId are required to create a reservation');
      err.code = 'INVALID_RESERVATION_PAYLOAD';
      throw err;
    }

    const buyer = (state.users || []).find(u => u.id === buyerId);
    if (!buyer) {
      const err = new Error(`Buyer '${buyerId}' not found`);
      err.code = 'BUYER_NOT_FOUND';
      throw err;
    }

    if (buyer.status && buyer.status.toUpperCase() === 'SUSPENDED') {
      const err = new Error('Buyer account is SUSPENDED');
      err.code = 'BUYER_SUSPENDED';
      throw err;
    }

    // Acquire lock on the listing
    const unlock = await reservationMutex.acquire(listingId);
    try {
      // 1. Locate listing inside critical section
      const listing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId);
      if (!listing) {
        const err = new Error(`Listing '${listingId}' not found`);
        err.code = 'LISTING_NOT_FOUND';
        throw err;
      }

      // Self-dealing prevention: seller cannot buy their own listing
      if (listing.seller_id === buyerId) {
        const err = new Error('Seller cannot reserve their own ticket listing');
        err.code = 'SELF_DEALING_FORBIDDEN';
        throw err;
      }

      // 2. Strict listing availability check
      if (listing.status !== LISTING_STATUS.ACTIVE) {
        const err = new Error(`Listing '${listingId}' is not available (status: ${listing.status})`);
        err.code = 'LISTING_ALREADY_RESERVED';
        err.status = 409;
        throw err;
      }

      // 3. Locate and verify canonical ticket
      const ticket = TicketInventoryService.findTicket(listing.ticket_id);
      if (!ticket) {
        const err = new Error(`Associated ticket '${listing.ticket_id}' not found`);
        err.code = 'TICKET_NOT_FOUND';
        throw err;
      }

      const nonReservableTicketStatuses = [
        TICKET_STATUS.LOCKED,
        TICKET_STATUS.SOLD,
        TICKET_STATUS.TRANSFER_PENDING,
        TICKET_STATUS.TRANSFERRED,
        TICKET_STATUS.USED,
        TICKET_STATUS.CANCELLED,
        TICKET_STATUS.REJECTED
      ];
      if (nonReservableTicketStatuses.includes(ticket.status)) {
        const err = new Error(`Ticket '${ticket.id || ticket.ticket_id}' is already locked or unavailable (status: ${ticket.status})`);
        err.code = 'TICKET_ALREADY_LOCKED';
        err.status = 409;
        throw err;
      }

      // 4. Check for existing active reservation on this listing
      const existingActiveRes = (state.reservations || []).find(r =>
        r.listing_id === listingId &&
        r.status === RESERVATION_STATUS.PENDING &&
        new Date(r.expires_at) > new Date()
      );
      if (existingActiveRes) {
        const err = new Error(`Listing '${listingId}' already has an active pending reservation`);
        err.code = 'LISTING_ALREADY_RESERVED';
        err.status = 409;
        throw err;
      }

      // 5. Compute deterministic expiry
      const ttlMs = ttlMinutes * 60 * 1000;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);
      const reservationId = `res-${uuidv4()}`;

      // 6. @PERSISTENCE_BOUNDARY — Synchronous State Transitions
      listing.status = LISTING_STATUS.RESERVED;
      listing.reserved_at = now.toISOString();
      listing.reserved_by = buyerId;
      listing.updated_at = now.toISOString();

      ticket.status = TICKET_STATUS.LOCKED;
      ticket.locked_by = buyerId;
      ticket.updated_at = now.toISOString();

      const reservation = {
        id: reservationId,
        reservation_id: reservationId,
        listing_id: listingId,
        ticket_id: ticket.ticket_id || ticket.id,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        price: listing.price,
        status: RESERVATION_STATUS.PENDING,
        expires_at: expiresAt.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      if (!state.reservations) {
        state.reservations = [];
      }
      state.reservations.push(reservation);

      await recordAuditLog('INVENTORY_RESERVATION', reservationId, 'RESERVED', buyerId, {
        listing_id: listingId,
        ticket_id: reservation.ticket_id,
        expires_at: reservation.expires_at,
        ttl_minutes: ttlMinutes
      });

      return reservation;
    } finally {
      unlock();
    }
  }

  /**
   * Releases an active reservation voluntarily (e.g. buyer cancelled checkout).
   * Reverts listing to ACTIVE and ticket to LISTED.
   *
   * @PERSISTENCE_BOUNDARY — state.reservations, state.listings, state.tickets mutations
   */
  static async releaseReservation(reservationId, actorId, reason = 'Released by buyer') {
    const reservation = (state.reservations || []).find(r => r.id === reservationId || r.reservation_id === reservationId);
    if (!reservation) {
      const err = new Error(`Reservation '${reservationId}' not found`);
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    if (reservation.status !== RESERVATION_STATUS.PENDING) {
      return {
        alreadyReleased: true,
        reservation,
        message: `Reservation is already in '${reservation.status}' status`
      };
    }

    const unlock = await reservationMutex.acquire(reservation.listing_id);
    try {
      const now = new Date().toISOString();
      reservation.status = RESERVATION_STATUS.RELEASED;
      reservation.released_at = now;
      reservation.released_by = actorId;
      reservation.release_reason = reason;
      reservation.updated_at = now;

      // Revert listing to ACTIVE
      const listing = (state.listings || []).find(l => l.id === reservation.listing_id || l.listing_id === reservation.listing_id);
      if (listing && listing.status === LISTING_STATUS.RESERVED) {
        listing.status = LISTING_STATUS.ACTIVE;
        listing.reserved_at = null;
        listing.reserved_by = null;
        listing.updated_at = now;
      }

      // Revert ticket to LISTED
      const ticket = TicketInventoryService.findTicket(reservation.ticket_id);
      if (ticket && ticket.status === TICKET_STATUS.LOCKED) {
        ticket.status = TICKET_STATUS.LISTED;
        ticket.locked_by = null;
        ticket.updated_at = now;
      }

      await recordAuditLog('INVENTORY_RESERVATION', reservationId, 'RELEASED', actorId, {
        listing_id: reservation.listing_id,
        ticket_id: reservation.ticket_id,
        reason
      });

      return {
        success: true,
        reservation,
        listingStatus: listing ? listing.status : null,
        ticketStatus: ticket ? ticket.status : null
      };
    } finally {
      unlock();
    }
  }

  /**
   * Reconciles all expired pending reservations.
   * Auto-recovers inventory for listings whose reservation expired.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async reconcileExpiredReservations() {
    const now = new Date();
    const expiredList = (state.reservations || []).filter(r =>
      r.status === RESERVATION_STATUS.PENDING &&
      new Date(r.expires_at) <= now
    );

    const recovered = [];

    for (const res of expiredList) {
      const unlock = await reservationMutex.acquire(res.listing_id);
      try {
        // Double check status after acquiring lock
        if (res.status === RESERVATION_STATUS.PENDING && new Date(res.expires_at) <= new Date()) {
          const timestamp = new Date().toISOString();
          res.status = RESERVATION_STATUS.EXPIRED;
          res.expired_at = timestamp;
          res.updated_at = timestamp;

          // Revert listing to ACTIVE
          const listing = (state.listings || []).find(l => l.id === res.listing_id || l.listing_id === res.listing_id);
          if (listing && listing.status === LISTING_STATUS.RESERVED) {
            listing.status = LISTING_STATUS.ACTIVE;
            listing.reserved_at = null;
            listing.reserved_by = null;
            listing.updated_at = timestamp;
          }

          // Revert ticket to LISTED
          const ticket = TicketInventoryService.findTicket(res.ticket_id);
          if (ticket && ticket.status === TICKET_STATUS.LOCKED) {
            ticket.status = TICKET_STATUS.LISTED;
            ticket.locked_by = null;
            ticket.updated_at = timestamp;
          }

          await recordAuditLog('INVENTORY_RESERVATION', res.id, 'EXPIRED_RECOVERED', 'SYSTEM', {
            listing_id: res.listing_id,
            ticket_id: res.ticket_id,
            expired_at: res.expires_at
          });

          recovered.push(res.id);
        }
      } finally {
        unlock();
      }
    }

    return {
      count: recovered.length,
      recoveredIds: recovered
    };
  }

  /**
   * Converts a reservation to an order (Phase 1C handoff).
   * Marks reservation CONVERTED so it cannot be released or expired.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async convertReservation(reservationId, orderId) {
    const reservation = (state.reservations || []).find(r => r.id === reservationId || r.reservation_id === reservationId);
    if (!reservation) {
      const err = new Error(`Reservation '${reservationId}' not found`);
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    if (reservation.status !== RESERVATION_STATUS.PENDING) {
      const err = new Error(`Cannot convert reservation with status '${reservation.status}'`);
      err.code = 'INVALID_RESERVATION_STATE';
      throw err;
    }

    // Check if expired
    if (new Date(reservation.expires_at) <= new Date()) {
      const err = new Error('Cannot convert expired reservation');
      err.code = 'RESERVATION_EXPIRED';
      throw err;
    }

    const now = new Date().toISOString();
    reservation.status = RESERVATION_STATUS.CONVERTED;
    reservation.order_id = orderId;
    reservation.converted_at = now;
    reservation.updated_at = now;

    await recordAuditLog('INVENTORY_RESERVATION', reservationId, 'CONVERTED_TO_ORDER', reservation.buyer_id, {
      order_id: orderId,
      listing_id: reservation.listing_id
    });

    return reservation;
  }

  /**
   * Retrieves reservation by ID.
   */
  static getReservation(reservationId) {
    return (state.reservations || []).find(r => r.id === reservationId || r.reservation_id === reservationId) || null;
  }

  /**
   * Retrieves active reservation for a listing, if any.
   */
  static getActiveReservationForListing(listingId) {
    return (state.reservations || []).find(r =>
      r.listing_id === listingId &&
      r.status === RESERVATION_STATUS.PENDING &&
      new Date(r.expires_at) > new Date()
    ) || null;
  }
}

module.exports = {
  ReservationService,
  RESERVATION_STATUS,
  reservationMutex
};

