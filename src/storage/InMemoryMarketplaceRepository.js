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
    this.offers = new Map();
    this.negotiations = new Map();
    this.offerAuditLogs = [];
  }

  reset() {
    this.tickets.clear();
    this.listings.clear();
    this.reservations.clear();
    this.deliveries.clear();
    this.offers.clear();
    this.negotiations.clear();
    this.offerAuditLogs = [];
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
    return Array.from(this.tickets.values())
      .filter(t => t.seller_id === sellerId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listAllTickets(limit = 200) {
    return Array.from(this.tickets.values())
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);
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

  async listListingsBySeller(sellerId) {
    return Array.from(this.listings.values())
      .filter(l => l.seller_id === sellerId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  async listAllListings(limit = 200) {
    return Array.from(this.listings.values())
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);
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

  // --- OFFERS & NEGOTIATIONS (DURABLE CONTRACT) ---

  _normalizeOffer(offer) {
    if (!offer) return null;
    const seq = Number(offer.sequence_number || offer.proposal_count || 1);
    const count = Number(offer.proposal_count || seq);
    const maxProposals = Number(offer.max_proposals || 5);
    const limitReached = count >= maxProposals || offer.negotiation_status === 'NEGOTIATION_LIMIT_REACHED';
    offer.original_price = Number(offer.original_price);
    offer.offer_amount = Number(offer.offer_amount);
    offer.counter_amount = offer.counter_amount !== null && offer.counter_amount !== undefined ? Number(offer.counter_amount) : null;
    offer.sequence_number = seq;
    offer.proposal_count = count;
    offer.max_proposals = maxProposals;
    offer.ui_counter_text = offer.ui_counter_text || `Tawaran ${seq}/${maxProposals}`;
    offer.ui_limit_text = offer.ui_limit_text !== undefined
      ? offer.ui_limit_text
      : (limitReached ? `Batas tawar-menawar tercapai (${maxProposals}/${maxProposals}). Negosiasi untuk listing ini sudah berakhir.` : null);
    return offer;
  }

  async createOfferWithNegotiation(offerRecord, negotiationRecord, auditEntry = null) {
    for (const existing of this.offers.values()) {
      if (existing.listing_id === offerRecord.listing_id && existing.status === 'ACCEPTED') {
        const err = new Error('Negosiasi telah disepakati (ACCEPTED).');
        err.code = 'NEGOTIATION_ALREADY_ACCEPTED';
        err.statusCode = 409;
        throw err;
      }
      if (
        existing.listing_id === offerRecord.listing_id &&
        existing.buyer_id === offerRecord.buyer_id &&
        existing.status === 'PENDING'
      ) {
        const err = new Error('You already have an active pending offer on this listing');
        err.code = 'ACTIVE_OFFER_EXISTS';
        err.statusCode = 409;
        throw err;
      }
    }

    let storedNeg = null;
    if (negotiationRecord && negotiationRecord.id) {
      negotiationRecord.proposals = Array.isArray(negotiationRecord.proposals) ? negotiationRecord.proposals : [];
      negotiationRecord.updated_at = negotiationRecord.updated_at || new Date().toISOString();
      this.negotiations.set(negotiationRecord.id, negotiationRecord);
      storedNeg = negotiationRecord;
    }

    offerRecord.created_at = offerRecord.created_at || new Date().toISOString();
    offerRecord.updated_at = new Date().toISOString();
    const storedOffer = this._normalizeOffer(offerRecord);
    this.offers.set(storedOffer.id, storedOffer);

    if (auditEntry) {
      await this.recordOfferAuditLog(auditEntry);
    }

    return { offer: storedOffer, negotiation: storedNeg };
  }

  async getOfferById(offerId) {
    const o = this.offers.get(offerId);
    return o ? this._normalizeOffer(o) : null;
  }

  async listOffersByUser(userId, role = null) {
    const normRole = role ? String(role).toUpperCase() : null;
    const all = Array.from(this.offers.values());
    const filtered = all.filter(o => {
      if (normRole === 'SELLER') return o.seller_id === userId;
      if (normRole === 'BUYER') return o.buyer_id === userId;
      return o.buyer_id === userId || o.seller_id === userId;
    });
    return filtered
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .map(o => this._normalizeOffer(o));
  }

  async listOffersByListing(listingId) {
    return Array.from(this.offers.values())
      .filter(o => o.listing_id === listingId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .map(o => this._normalizeOffer(o));
  }

  async listAllOffers(limit = 200) {
    return Array.from(this.offers.values())
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .map(o => this._normalizeOffer(o));
  }

  async transitionOfferStatus(offerId, expectedStatuses, updates = {}, negotiationUpdates = null, auditEntry = null) {
    const existing = this.offers.get(offerId);
    if (!existing) {
      return { updated: false, currentOffer: null, supersededOffers: [] };
    }
    const allowed = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    if (!allowed.includes(existing.status)) {
      return { updated: false, currentOffer: this._normalizeOffer(existing), supersededOffers: [] };
    }

    const { supersedeOtherOffersForListing, ...fieldUpdates } = updates;
    const nowIso = new Date().toISOString();
    Object.assign(existing, fieldUpdates, { updated_at: nowIso });
    const updatedOffer = this._normalizeOffer(existing);
    this.offers.set(offerId, updatedOffer);

    const supersededOffers = [];
    if (supersedeOtherOffersForListing) {
      for (const other of this.offers.values()) {
        if (
          other.listing_id === existing.listing_id &&
          other.id !== offerId &&
          (other.status === 'PENDING' || other.status === 'COUNTERED')
        ) {
          const prevStatus = other.status;
          other.status = 'SUPERSEDED';
          other.superseded_at = nowIso;
          other.updated_at = nowIso;
          supersededOffers.push(this._normalizeOffer(other));
          await this.recordOfferAuditLog({
            offerId: other.id,
            actorId: 'SYSTEM',
            actorRole: 'SYSTEM',
            fromStatus: prevStatus,
            toStatus: 'SUPERSEDED',
            ipAddress: (auditEntry && auditEntry.ipAddress) || '127.0.0.1',
            metadata: { winning_offer_id: offerId }
          });
        }
      }
    }

    if (negotiationUpdates && negotiationUpdates.id) {
      const existingNeg = this.negotiations.get(negotiationUpdates.id);
      if (existingNeg) {
        Object.assign(existingNeg, negotiationUpdates, { updated_at: nowIso });
      } else {
        this.negotiations.set(negotiationUpdates.id, {
          ...negotiationUpdates,
          updated_at: nowIso
        });
      }
    }

    if (auditEntry) {
      await this.recordOfferAuditLog(auditEntry);
    }

    return { updated: true, offer: updatedOffer, supersededOffers };
  }

  async supersedeOffersForListing(listingId, excludeOfferId = null, reason = 'DIRECT_BUY_SUPERSEDED', actorId = 'SYSTEM') {
    const nowIso = new Date().toISOString();
    const superseded = [];
    for (const offer of this.offers.values()) {
      if (
        offer.listing_id === listingId &&
        offer.id !== excludeOfferId &&
        (offer.status === 'PENDING' || offer.status === 'COUNTERED')
      ) {
        const prevStatus = offer.status;
        offer.status = 'SUPERSEDED';
        offer.superseded_at = nowIso;
        offer.updated_at = nowIso;
        superseded.push(this._normalizeOffer(offer));
        await this.recordOfferAuditLog({
          offerId: offer.id,
          actorId,
          actorRole: 'SYSTEM',
          fromStatus: prevStatus,
          toStatus: 'SUPERSEDED',
          ipAddress: '127.0.0.1',
          metadata: { reason, listing_id: listingId }
        });
      }
    }
    return superseded;
  }

  async expirePendingOffers(nowIso = null) {
    const now = nowIso ? new Date(nowIso) : new Date();
    const expired = [];
    for (const offer of this.offers.values()) {
      if (offer.status === 'PENDING' && new Date(offer.expires_at) <= now) {
        offer.status = 'EXPIRED';
        offer.updated_at = now.toISOString();
        expired.push(this._normalizeOffer(offer));
        await this.recordOfferAuditLog({
          offerId: offer.id,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          fromStatus: 'PENDING',
          toStatus: 'EXPIRED',
          ipAddress: '127.0.0.1',
          metadata: { reason: 'Offer TTL expired' }
        });
      }
    }
    return expired;
  }

  async getNegotiationById(negotiationId) {
    return this.negotiations.get(negotiationId) || null;
  }

  async getNegotiationByBuyerAndListing(buyerId, listingId) {
    for (const n of this.negotiations.values()) {
      if (n.listing_id === listingId && (!buyerId || n.buyer_id === buyerId) && n.status !== 'ACCEPTED') {
        return n;
      }
    }
    for (const n of this.negotiations.values()) {
      if (n.listing_id === listingId && (!buyerId || n.buyer_id === buyerId)) {
        return n;
      }
    }
    return null;
  }

  async upsertNegotiation(negotiationData) {
    if (!negotiationData || !negotiationData.id) return null;
    const existing = this.negotiations.get(negotiationData.id);
    if (existing) {
      Object.assign(existing, negotiationData, { updated_at: negotiationData.updated_at || new Date().toISOString() });
      return existing;
    }
    negotiationData.updated_at = negotiationData.updated_at || new Date().toISOString();
    this.negotiations.set(negotiationData.id, negotiationData);
    return negotiationData;
  }

  async recordOfferAuditLog(auditData) {
    const entry = {
      id: auditData.id || `oal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      offer_id: auditData.offerId || auditData.offer_id,
      actor_id: auditData.actorId || auditData.actor_id,
      actor_role: auditData.actorRole || auditData.actor_role,
      from_status: auditData.fromStatus !== undefined ? auditData.fromStatus : (auditData.from_status || null),
      to_status: auditData.toStatus || auditData.to_status,
      ip_address: auditData.ipAddress || auditData.ip_address || '127.0.0.1',
      metadata: typeof auditData.metadata === 'string' ? JSON.parse(auditData.metadata) : (auditData.metadata || {}),
      created_at: auditData.created_at || new Date().toISOString()
    };
    this.offerAuditLogs.push(entry);
    return entry;
  }

  async listOfferAuditLogs(offerId = null, limit = 200) {
    let logs = this.offerAuditLogs;
    if (offerId) {
      logs = logs.filter(l => l.offer_id === offerId);
    }
    return logs.slice(-limit).map(l => ({
      ...l,
      metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata) : (l.metadata || {})
    }));
  }
}

module.exports = { InMemoryMarketplaceRepository };
