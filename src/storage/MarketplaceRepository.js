/**
 * TIKUM / ARGUS — Marketplace Repository Interface
 *
 * Defines the contract for canonical ticket inventory, listings,
 * reservations, and fulfillment deliveries.
 */

class MarketplaceRepository {
  async init() {
    throw new Error('Not implemented');
  }

  // Tickets
  async createTicket(ticketData) { throw new Error('Not implemented'); }
  async getTicketById(ticketId) { throw new Error('Not implemented'); }
  async updateTicketStatus(ticketId, status, lockedBy = null) { throw new Error('Not implemented'); }
  async listTicketsBySeller(sellerId) { throw new Error('Not implemented'); }
  async listAllTickets(limit = 200) { throw new Error('Not implemented'); }

  // Listings
  async createListing(listingData) { throw new Error('Not implemented'); }
  async getListingById(listingId) { throw new Error('Not implemented'); }
  async updateListingStatus(listingId, status) { throw new Error('Not implemented'); }
  async updateListingInventory(listingId, updates) { throw new Error('Not implemented'); }
  async atomicReserveInventory(listingId, requestedQty = 1) { throw new Error('Not implemented'); }
  async atomicReleaseInventory(listingId, quantity = 1) { throw new Error('Not implemented'); }
  async listActiveListings(canonicalEventId = null) { throw new Error('Not implemented'); }
  async listListingsBySeller(sellerId) { throw new Error('Not implemented'); }
  async listAllListings(limit = 200) { throw new Error('Not implemented'); }

  // Reservations
  async createReservation(reservationData, ttlMs = 600000) { throw new Error('Not implemented'); }
  async getReservationById(reservationId) { throw new Error('Not implemented'); }
  async getActiveReservationForListing(listingId) { throw new Error('Not implemented'); }
  async expireReservation(reservationId) { throw new Error('Not implemented'); }
  async convertReservation(reservationId) { throw new Error('Not implemented'); }
  async cancelReservation(reservationId) { throw new Error('Not implemented'); }
  async reconcileExpiredReservations() { throw new Error('Not implemented'); }

  // Deliveries
  async createDelivery(deliveryData) { throw new Error('Not implemented'); }
  async getDeliveryByOrderId(orderId) { throw new Error('Not implemented'); }
  async updateDeliveryStatus(deliveryId, status, metadata = {}) { throw new Error('Not implemented'); }

  // Offers & Negotiations (Epic 4.0 Durable Persistence)
  async createOfferWithNegotiation(offerRecord, negotiationRecord, auditEntry = null) { throw new Error('Not implemented'); }
  async getOfferById(offerId) { throw new Error('Not implemented'); }
  async listOffersByUser(userId, role = null) { throw new Error('Not implemented'); }
  async listOffersByListing(listingId) { throw new Error('Not implemented'); }
  async listAllOffers(limit = 200) { throw new Error('Not implemented'); }
  async transitionOfferStatus(offerId, expectedStatuses, updates, negotiationUpdates = null, auditEntry = null) { throw new Error('Not implemented'); }
  async supersedeOffersForListing(listingId, excludeOfferId = null, reason = 'DIRECT_BUY_SUPERSEDED', actorId = 'SYSTEM') { throw new Error('Not implemented'); }
  async expirePendingOffers(nowIso = null) { throw new Error('Not implemented'); }
  async getNegotiationById(negotiationId) { throw new Error('Not implemented'); }
  async getNegotiationByBuyerAndListing(buyerId, listingId) { throw new Error('Not implemented'); }
  async upsertNegotiation(negotiationData) { throw new Error('Not implemented'); }
  async recordOfferAuditLog(auditData) { throw new Error('Not implemented'); }
  async listOfferAuditLogs(offerId = null, limit = 200) { throw new Error('Not implemented'); }
}

module.exports = { MarketplaceRepository };
