/**
 * TIKUM / ARGUS — Marketplace Listing Service (Epic 6, Phase 1B)
 *
 * Manages marketplace listings as offers against existing ticket inventory.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Ticket = asset + ownership.
 * 2. Listing = offer against ticket inventory. Listing NEVER owns the ticket.
 * 3. A ticket can have at most ONE non-terminal (ACTIVE, RESERVED, PENDING_VERIFICATION) listing at a time.
 * 4. Fee decomposition is transparent, deterministic, and upfront.
 * 5. Reverting or cancelling a listing restores ticket status to VERIFIED (it remains seller's asset).
 *
 * PERSISTENCE_BOUNDARY: All state mutations in this file are in-memory only.
 * Production-grade durable persistence is a mandatory prerequisite before
 * enabling real marketplace transactions. See ADR: PERSISTENCE_BOUNDARY.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../../database');
const { TicketInventoryService, TICKET_STATUS } = require('./TicketInventoryService');
const { EscrowService } = require('../escrowService');

/**
 * Canonical marketplace listing status enum.
 */
const LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  SETTLED: 'SETTLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  SUSPENDED: 'SUSPENDED'
};

/**
 * Allowed listing status transitions.
 */
const ALLOWED_LISTING_TRANSITIONS = {
  [LISTING_STATUS.DRAFT]:                [LISTING_STATUS.PENDING_VERIFICATION, LISTING_STATUS.ACTIVE, LISTING_STATUS.CANCELLED],
  [LISTING_STATUS.PENDING_VERIFICATION]: [LISTING_STATUS.ACTIVE, LISTING_STATUS.REJECTED, LISTING_STATUS.CANCELLED],
  [LISTING_STATUS.ACTIVE]:               [LISTING_STATUS.RESERVED, LISTING_STATUS.CANCELLED, LISTING_STATUS.EXPIRED, LISTING_STATUS.SUSPENDED],
  [LISTING_STATUS.RESERVED]:             [LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD, LISTING_STATUS.CANCELLED],
  [LISTING_STATUS.SOLD]:                 [LISTING_STATUS.SETTLED],
  [LISTING_STATUS.SETTLED]:              [], // terminal
  [LISTING_STATUS.REJECTED]:             [], // terminal
  [LISTING_STATUS.EXPIRED]:              [], // terminal
  [LISTING_STATUS.CANCELLED]:            [], // terminal
  [LISTING_STATUS.SUSPENDED]:            [LISTING_STATUS.ACTIVE, LISTING_STATUS.CANCELLED]
};

class MarketplaceListingService {
  /**
   * Creates a marketplace listing against an existing canonical ticket asset.
   *
   * Invariant: Does NOT create ticket. Ticket must already exist in inventory.
   *
   * @PERSISTENCE_BOUNDARY — state.listings mutation
   *
   * @param {Object} params
   * @param {string} params.sellerId - Authenticated seller ID
   * @param {string} params.ticketId - Existing canonical ticket ID
   * @param {number} params.price - Listing price in IDR
   * @param {string} [params.currency='IDR'] - Currency code
   * @param {string} [params.expiresAt=null] - ISO timestamp for listing expiry
   * @param {string} [params.pricingPolicyVersion] - Optional pricing policy override
   * @returns {Object} Created listing
   */
  static async createListing({
    sellerId,
    ticketId,
    price,
    currency = 'IDR',
    expiresAt = null,
    pricingPolicyVersion = null
  }) {
    // 1. Verify seller exists and is not suspended
    const seller = state.users.find(u => u.id === sellerId);
    if (!seller) {
      const err = new Error(`Seller '${sellerId}' not found`);
      err.code = 'SELLER_NOT_FOUND';
      throw err;
    }

    const sellerProfile = state.seller_profiles
      ? state.seller_profiles.find(p => p.user_id === sellerId)
      : null;

    if (sellerProfile && (sellerProfile.suspended || sellerProfile.status === 'SUSPENDED')) {
      const err = new Error('Seller is SUSPENDED. Cannot list tickets.');
      err.code = 'SELLER_SUSPENDED';
      throw err;
    }

    // 2. Validate ticket exists
    const ticket = TicketInventoryService.findTicket(ticketId);
    if (!ticket) {
      const err = new Error(`Ticket '${ticketId}' not found in inventory`);
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }

    // 3. CANONICAL ASSET OWNERSHIP VERIFICATION:
    //    Ticket is the asset and ownership proof. Seller must own the ticket.
    const ticketOwner = ticket.current_owner_id || ticket.seller_id;
    if (ticketOwner !== sellerId) {
      const err = new Error(`Forbidden: Seller '${sellerId}' does not own ticket '${ticketId}'`);
      err.code = 'UNAUTHORIZED_NOT_TICKET_OWNER';
      throw err;
    }

    // 4. Ticket Status Check: Must be in listable state
    const nonListableStatuses = [
      TICKET_STATUS.LOCKED,
      TICKET_STATUS.SOLD,
      TICKET_STATUS.TRANSFER_PENDING,
      TICKET_STATUS.TRANSFERRED,
      TICKET_STATUS.USED,
      TICKET_STATUS.CANCELLED,
      TICKET_STATUS.REJECTED
    ];
    if (nonListableStatuses.includes(ticket.status)) {
      const err = new Error(`Ticket '${ticketId}' cannot be listed from status '${ticket.status}'`);
      err.code = 'TICKET_NOT_LISTABLE';
      throw err;
    }

    // 5. Invariant: Prevent duplicate active listings for the same ticket
    const existingActiveListing = (state.listings || []).find(l =>
      l.ticket_id === (ticket.ticket_id || ticket.id) &&
      [LISTING_STATUS.ACTIVE, LISTING_STATUS.RESERVED, LISTING_STATUS.PENDING_VERIFICATION].includes(l.status)
    );
    if (existingActiveListing) {
      const err = new Error(`Ticket '${ticketId}' already has an active or pending listing (${existingActiveListing.id})`);
      err.code = 'TICKET_ALREADY_LISTED';
      throw err;
    }

    // 6. Validate canonical event exists and is not CANCELLED
    const eventId = ticket.event_id || ticket.canonical_event_id;
    const event = state.events.find(e => e.id === eventId);
    if (!event) {
      const err = new Error(`Event '${eventId}' not found for ticket '${ticketId}'`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    if (event.status === 'CANCELLED') {
      const err = new Error(`Cannot list ticket for CANCELLED event '${eventId}'`);
      err.code = 'EVENT_CANCELLED';
      throw err;
    }

    const { EventTemporalLifecycleEngine } = require('../../discovery/EventTemporalLifecycleEngine');
    if (!EventTemporalLifecycleEngine.isEventUpcoming(event)) {
      const err = new Error(`Cannot list ticket for concluded/expired event '${eventId}'`);
      err.code = 'EVENT_CONCLUDED';
      throw err;
    }

    // 7. Validate Price
    const numericPrice = parseInt(price, 10);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      const err = new Error('Listing price must be a positive integer');
      err.code = 'INVALID_PRICE';
      throw err;
    }

    // 8. Calculate transparent Fee Decomposition
    const pricing = EscrowService.calculatePricing(numericPrice, null, {
      policyVersion: pricingPolicyVersion
    });

    const listingId = `list-${uuidv4()}`;
    const now = new Date().toISOString();

    // Determine initial listing status:
    // If ticket is already VERIFIED or ACTIVE, listing becomes ACTIVE.
    // If ticket is DRAFT or PENDING_VERIFICATION, listing is PENDING_VERIFICATION.
    const isTicketVerified = ticket.status === TICKET_STATUS.VERIFIED ||
      ticket.status === 'ACTIVE' ||
      ticket.verification_status === 'VERIFIED';
    const initialStatus = isTicketVerified ? LISTING_STATUS.ACTIVE : LISTING_STATUS.PENDING_VERIFICATION;

    // 9. @PERSISTENCE_BOUNDARY — Create Listing Entity
    const listing = {
      id: listingId,
      listing_id: listingId,
      ticket_id: ticket.ticket_id || ticket.id,
      seller_id: sellerId,
      event_id: eventId,
      price: numericPrice,
      currency: currency || 'IDR',
      status: initialStatus,
      seat_info: ticket.seat_info || `${ticket.section || ''} ${ticket.row ? 'Row ' + ticket.row : ''} ${ticket.seat ? 'Seat ' + ticket.seat : ''}`.trim(),
      face_value: ticket.face_value,
      pricing: {
        ticket_price: numericPrice,
        seller_proceeds: pricing.seller_net_payout,
        seller_payout: pricing.seller_net_payout,
        seller_fee: pricing.seller_fee,
        platform_fee: pricing.total_platform_fee || pricing.buyer_fee,
        buyer_fee: pricing.buyer_fee,
        buyer_total: pricing.buyer_total,
        policy_version: pricing.fee_policy_version || pricing.policy_version,
        fee_policy_version: pricing.fee_policy_version || pricing.policy_version
      },
      expires_at: expiresAt || null,
      created_at: now,
      updated_at: now
    };

    if (!state.listings) {
      state.listings = [];
    }
    state.listings.push(listing);

    // 10. Update Ticket Inventory status
    //     When listing becomes ACTIVE, ticket transitions to LISTED.
    if (initialStatus === LISTING_STATUS.ACTIVE) {
      ticket.status = TICKET_STATUS.LISTED;
      ticket.listing_id = listingId;
      ticket.updated_at = now;
    }

    await recordAuditLog('MARKETPLACE_LISTING', listingId, 'CREATED', sellerId, {
      ticket_id: ticket.ticket_id || ticket.id,
      event_id: eventId,
      price: numericPrice,
      status: initialStatus,
      pricing: listing.pricing
    });

    return listing;
  }

  /**
   * Retrieves listing by ID with enriched details.
   */
  static getListing(listingId) {
    const listing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId);
    if (!listing) return null;

    const ticket = TicketInventoryService.findTicket(listing.ticket_id) || {};
    const event = state.events.find(e => e.id === listing.event_id) || {};
    const venue = state.venues.find(v => v.id === event.venue_id) || {};

    return {
      ...listing,
      ticket: {
        id: ticket.id || ticket.ticket_id,
        ticket_type: ticket.ticket_type || 'GENERAL_ADMISSION',
        section: ticket.section,
        row: ticket.row,
        seat: ticket.seat,
        face_value: ticket.face_value,
        verification_status: ticket.verification_status || ticket.status
      },
      event: {
        id: event.id,
        title: event.title || event.name,
        date: event.date,
        status: event.status
      },
      venue: {
        id: venue.id,
        name: venue.name,
        city: venue.city
      }
    };
  }

  /**
   * Returns active listings, optionally filtered.
   */
  static getActiveListings(filter = {}) {
    const listings = (state.listings || []).filter(l => l.status === LISTING_STATUS.ACTIVE);

    return listings
      .filter(l => {
        if (filter.eventId && l.event_id !== filter.eventId) return false;
        if (filter.sellerId && l.seller_id !== filter.sellerId) return false;
        if (filter.minPrice && l.price < filter.minPrice) return false;
        if (filter.maxPrice && l.price > filter.maxPrice) return false;
        return true;
      })
      .map(l => this.getListing(l.id));
  }

  /**
   * Cancels a listing and restores ticket status to VERIFIED.
   *
   * @PERSISTENCE_BOUNDARY — state.listings + state.tickets mutation
   */
  static async cancelListing(listingId, sellerId, reason = 'Cancelled by seller') {
    const listing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId);
    if (!listing) {
      const err = new Error(`Listing '${listingId}' not found`);
      err.code = 'LISTING_NOT_FOUND';
      throw err;
    }

    if (listing.seller_id !== sellerId) {
      const seller = state.users.find(u => u.id === sellerId);
      if (!seller || (seller.role !== 'admin' && seller.role !== 'ops')) {
        const err = new Error('Forbidden: Only the seller or admin can cancel this listing');
        err.code = 'UNAUTHORIZED';
        throw err;
      }
    }

    if ([LISTING_STATUS.RESERVED, LISTING_STATUS.SOLD, LISTING_STATUS.SETTLED].includes(listing.status)) {
      const err = new Error(`Cannot cancel listing from status '${listing.status}'`);
      err.code = 'CANNOT_CANCEL_LISTING';
      throw err;
    }

    const previousStatus = listing.status;
    listing.status = LISTING_STATUS.CANCELLED;
    listing.cancellation_reason = reason;
    listing.updated_at = new Date().toISOString();

    // Invariant: Revert ticket from LISTED back to VERIFIED
    const ticket = TicketInventoryService.findTicket(listing.ticket_id);
    if (ticket && ticket.status === TICKET_STATUS.LISTED) {
      ticket.status = TICKET_STATUS.VERIFIED;
      ticket.listing_id = null;
      ticket.updated_at = new Date().toISOString();
    }

    await recordAuditLog('MARKETPLACE_LISTING', listingId, 'CANCELLED', sellerId, {
      previous_status: previousStatus,
      reason,
      ticket_id: listing.ticket_id
    });

    return listing;
  }

  /**
   * Suspends a listing (Admin / Trust Officer action).
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async suspendListing(listingId, actorId, reason = 'Policy violation') {
    const listing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId);
    if (!listing) {
      const err = new Error(`Listing '${listingId}' not found`);
      err.code = 'LISTING_NOT_FOUND';
      throw err;
    }

    const previousStatus = listing.status;
    listing.status = LISTING_STATUS.SUSPENDED;
    listing.suspension_reason = reason;
    listing.updated_at = new Date().toISOString();

    await recordAuditLog('MARKETPLACE_LISTING', listingId, 'SUSPENDED', actorId, {
      previous_status: previousStatus,
      reason
    });

    return listing;
  }

  /**
   * Expires an active listing whose TTL has passed.
   * Reverts ticket to VERIFIED.
   *
   * @PERSISTENCE_BOUNDARY
   */
  static async expireListing(listingId) {
    const listing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId);
    if (!listing) return null;

    if (listing.status !== LISTING_STATUS.ACTIVE) return null;

    listing.status = LISTING_STATUS.EXPIRED;
    listing.updated_at = new Date().toISOString();

    const ticket = TicketInventoryService.findTicket(listing.ticket_id);
    if (ticket && ticket.status === TICKET_STATUS.LISTED) {
      ticket.status = TICKET_STATUS.VERIFIED;
      ticket.listing_id = null;
      ticket.updated_at = new Date().toISOString();
    }

    await recordAuditLog('MARKETPLACE_LISTING', listingId, 'EXPIRED', 'SYSTEM', {
      ticket_id: listing.ticket_id
    });

    return listing;
  }
}

module.exports = {
  MarketplaceListingService,
  LISTING_STATUS,
  ALLOWED_LISTING_TRANSITIONS
};

