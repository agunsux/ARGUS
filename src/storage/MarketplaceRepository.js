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

  // Listings
  async createListing(listingData) { throw new Error('Not implemented'); }
  async getListingById(listingId) { throw new Error('Not implemented'); }
  async updateListingStatus(listingId, status) { throw new Error('Not implemented'); }
  async listActiveListings(canonicalEventId = null) { throw new Error('Not implemented'); }

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
}

module.exports = { MarketplaceRepository };
