/**
 * TIKUM / ARGUS — In-Memory Marketplace Repository
 *
 * Fast, isolated test-runner implementation of MarketplaceRepository.
 */

const { MarketplaceRepository } = require('./MarketplaceRepository');

class InMemoryMarketplaceRepository extends MarketplaceRepository {
  constructor() {
    super();
    this.tickets = new Map();
    this.listings = new Map();
    this.reservations = new Map();
    this.deliveries = new Map();
  }

  async init() {
    return true;
  }

  // Tickets
  async createTicket(ticketData) {
    const id = ticketData.id || `tkt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const ticket = {
      ...ticketData,
      id,
      ticket_id: id,
      quantity: ticketData.quantity || 1,
      currency: ticketData.currency || 'IDR',
      status: ticketData.status || 'VERIFIED',
      created_at: ticketData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  async getTicketById(ticketId) {
    return this.tickets.get(ticketId) || null;
  }

  async updateTicketStatus(ticketId, status, lockedBy = null) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;
    ticket.status = status;
    if (lockedBy !== undefined) ticket.locked_by = lockedBy;
    ticket.updated_at = new Date().toISOString();
    return ticket;
  }

  async listTicketsBySeller(sellerId) {
    return Array.from(this.tickets.values()).filter(t => t.seller_id === sellerId);
  }

  // Listings
  async createListing(listingData) {
    const id = listingData.id || `list-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const listing = {
      ...listingData,
      id,
      listing_id: id,
      currency: listingData.currency || 'IDR',
      status: listingData.status || 'ACTIVE',
      created_at: listingData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.listings.set(id, listing);
    return listing;
  }

  async getListingById(listingId) {
    return this.listings.get(listingId) || null;
  }

  async updateListingStatus(listingId, status) {
    const listing = this.listings.get(listingId);
    if (!listing) return null;
    listing.status = status;
    listing.updated_at = new Date().toISOString();
    return listing;
  }

  async listActiveListings(canonicalEventId = null) {
    return Array.from(this.listings.values()).filter(l => {
      const matchEvent = canonicalEventId ? (l.canonical_event_id === canonicalEventId || l.event_id === canonicalEventId) : true;
      return matchEvent && l.status === 'ACTIVE';
    });
  }

  // Reservations
  async reserveListing(params, ttlMsOverride = null) {
    const listingId = params.listingId || params.listing_id;
    const buyerId = params.buyerId || params.buyer_id;
    const ttlMs = ttlMsOverride || (params.ttlMinutes ? params.ttlMinutes * 60 * 1000 : 600000);
    return this.createReservation({
      id: params.id,
      listing_id: listingId,
      ticket_id: params.ticketId || params.ticket_id,
      buyer_id: buyerId
    }, ttlMs);
  }

  async createReservation(reservationData, ttlMs = 600000) {
    const listingId = reservationData.listing_id || reservationData.listingId;
    const buyerId = reservationData.buyer_id || reservationData.buyerId;
    const listing = this.listings.get(listingId);
    if (!listing) {
      const err = new Error(`Listing '${listingId}' not found`);
      err.code = 'LISTING_NOT_FOUND';
      throw err;
    }
    if (listing.seller_id === buyerId) {
      const err = new Error('Seller cannot reserve their own ticket listing');
      err.code = 'SELF_DEALING_FORBIDDEN';
      throw err;
    }
    if (listing.status !== 'ACTIVE') {
      const err = new Error(`Listing '${listingId}' is not available (status: ${listing.status})`);
      err.code = 'LISTING_ALREADY_RESERVED';
      err.status = 409;
      throw err;
    }
    const ticketId = reservationData.ticket_id || reservationData.ticketId || listing.ticket_id;
    const ticket = this.tickets.get(ticketId);
    if (ticket && (ticket.status === 'LOCKED' || ticket.status === 'SOLD')) {
      const err = new Error(`Ticket is already locked or unavailable (status: ${ticket.status})`);
      err.code = 'TICKET_ALREADY_LOCKED';
      err.status = 409;
      throw err;
    }

    const id = reservationData.id || `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const reservation = {
      ...reservationData,
      id,
      listing_id: listingId,
      ticket_id: ticketId,
      buyer_id: buyerId,
      status: 'PENDING',
      expires_at: expiresAt,
      created_at: now.toISOString()
    };
    this.reservations.set(id, reservation);

    // Update listing to RESERVED and ticket to LOCKED
    listing.status = 'RESERVED';
    if (ticket) {
      ticket.status = 'LOCKED';
      ticket.locked_by = buyerId;
    }

    return reservation;
  }

  async releaseReservation(reservationId, actorId = 'SYSTEM', reason = null) {
    const r = this.reservations.get(reservationId);
    if (!r) return null;
    r.status = 'RELEASED';
    r.released_at = new Date().toISOString();
    r.released_by = actorId;
    r.release_reason = reason;

    const listing = this.listings.get(r.listing_id);
    if (listing && listing.status === 'RESERVED') {
      listing.status = 'ACTIVE';
    }

    const ticket = this.tickets.get(r.ticket_id);
    if (ticket && ticket.status === 'LOCKED') {
      ticket.status = 'LISTED';
      ticket.locked_by = null;
    }
    return r;
  }

  async getReservationById(reservationId) {
    return this.reservations.get(reservationId) || null;
  }

  async getActiveReservationForListing(listingId) {
    const now = new Date();
    for (const r of this.reservations.values()) {
      if (r.listing_id === listingId && r.status === 'PENDING' && new Date(r.expires_at) > now) {
        return r;
      }
    }
    return null;
  }

  async expireReservation(reservationId) {
    const r = this.reservations.get(reservationId);
    if (!r) return null;
    r.status = 'EXPIRED';
    r.expired_at = new Date().toISOString();

    const listing = this.listings.get(r.listing_id);
    if (listing && listing.status === 'RESERVED') listing.status = 'ACTIVE';

    const ticket = this.tickets.get(r.ticket_id);
    if (ticket && ticket.status === 'LOCKED') {
      ticket.status = 'LISTED';
      ticket.locked_by = null;
    }
    return r;
  }

  async convertReservation(reservationId) {
    const r = this.reservations.get(reservationId);
    if (!r) return null;
    r.status = 'CONVERTED';
    r.converted_at = new Date().toISOString();
    return r;
  }

  async cancelReservation(reservationId) {
    return this.expireReservation(reservationId);
  }

  async reconcileExpiredReservations() {
    const now = new Date();
    const expired = [];
    for (const r of this.reservations.values()) {
      if (r.status === 'PENDING' && new Date(r.expires_at) <= now) {
        await this.expireReservation(r.id);
        expired.push(r);
      }
    }
    return expired;
  }

  // Deliveries
  async createDelivery(deliveryData) {
    const id = deliveryData.id || `dlv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const delivery = {
      ...deliveryData,
      id,
      status: deliveryData.status || 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.deliveries.set(id, delivery);
    return delivery;
  }

  async getDeliveryById(deliveryId) {
    return this.deliveries.get(deliveryId) || null;
  }

  async getDeliveryByOrderId(orderId) {
    for (const d of this.deliveries.values()) {
      if (d.order_id === orderId) return d;
    }
    return null;
  }

  async updateDeliveryStatus(deliveryId, status, metadata = {}) {
    const d = this.deliveries.get(deliveryId);
    if (!d) return null;
    d.status = status;
    d.updated_at = new Date().toISOString();
    if (status === 'DELIVERED') d.delivered_at = new Date().toISOString();
    if (status === 'CONFIRMED') d.confirmed_at = new Date().toISOString();
    Object.assign(d, metadata);
    return d;
  }
}

module.exports = { InMemoryMarketplaceRepository };
