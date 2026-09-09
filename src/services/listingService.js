const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { state, recordAuditLog } = require('../database');

const LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  ACTIVE: 'ACTIVE',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  SETTLED: 'SETTLED',
  REJECTED: 'REJECTED'
};

class ListingService {
  /**
   * Helper to hash barcode/QR content
   */
  static hashBarcode(rawBarcode) {
    return crypto.createHash('sha256').update(rawBarcode.trim()).digest('hex');
    return crypto.createHash('sha256').update(rawBarcode.trim().toUpperCase()).digest('hex');
  }

  /**
   * Check seller KYC and listing limits
   */
  static validateSellerEligibility(sellerId) {
    const profile = state.seller_profiles.find(p => p.user_id === sellerId);
    if (!profile) {
      return { eligible: false, reason: 'Seller profile not found or KYC not submitted' };
    }
    if (profile.kyc_status !== 'VERIFIED') {
      return { eligible: false, reason: 'Seller KYC is not VERIFIED' };
    }

    const activeListings = state.listings.filter(
      l => l.seller_id === sellerId && ['PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'RESERVED'].includes(l.status)
    ).length;

    if (profile.active_listing_limit && activeListings >= profile.active_listing_limit) {
      return { eligible: false, reason: `Seller active listing limit of ${profile.active_listing_limit} reached` };
    }

    return { eligible: true, profile };
  }

  /**
   * Create ticket and listing
   */
  static async createListing({ sellerId, eventId, seatInfo, faceValue, price, rawBarcode, evidenceBundleId }) {
    // 1. Verify seller eligibility
    const eligibility = this.validateSellerEligibility(sellerId);
    if (!eligibility.eligible) {
      const err = new Error(eligibility.reason);
      err.code = 'SELLER_NOT_ELIGIBLE';
      throw err;
    }

    // 2. Validate Event
    const event = state.events.find(e => e.id === eventId);
    if (!event) {
      const err = new Error(`Event ${eventId} not found`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    // 3. Prevent duplicate ticket barcodes for the same event
    const barcodeHash = this.hashBarcode(rawBarcode);
    const duplicate = state.tickets.find(t => t.event_id === eventId && t.barcode_hash === barcodeHash);
    if (duplicate) {
      const err = new Error('Duplicate ticket barcode detected. This ticket is already registered.');
      err.code = 'DUPLICATE_TICKET_BARCODE';
      throw err;
    }

    // 4. Create Ticket entity
    const ticketId = `tkt-${uuidv4()}`;
    const ticket = {
      id: ticketId,
      event_id: eventId,
      current_owner_id: sellerId,
      status: 'PENDING_VERIFICATION',
      seat_info: seatInfo,
      face_value: parseInt(faceValue),
      price: parseInt(price),
      barcode_hash: barcodeHash
    };
    state.tickets.push(ticket);

    // 5. Create Listing entity
    const isUserCreatedEvent = event.source === 'USER_CREATED';
    const isEventUnverified = !event.is_verified;
    const listingId = `list-${uuidv4()}`;
    const listing = {
      id: listingId,
      ticket_id: ticketId,
      seller_id: sellerId,
      event_id: eventId,
      face_value: parseInt(faceValue),
      price: parseInt(price),
      seat_info: seatInfo,
      status: LISTING_STATUS.PENDING_VERIFICATION,
      rejection_reason: null,
      evidence_bundle_id: evidenceBundleId || null,
      user_created_event: isUserCreatedEvent,
      event_verification_warning: isEventUnverified ? 'Event dibuat oleh pengguna – belum diverifikasi resmi' : null,
      created_at: new Date().toISOString()
    };
    state.listings.push(listing);

    // 6. Audit log
    await recordAuditLog('LISTING', listingId, 'SUBMITTED_FOR_VERIFICATION', sellerId, {
      ticket_id: ticketId,
      event_id: eventId,
      price: parseInt(price),
      barcode_hash: barcodeHash
    });

    return { ticket, listing };
  }

  /**
   * Admin/System verifies listing
   */
  static async verifyListing(listingId, officerId, { approved, reason }) {
    const listing = state.listings.find(l => l.id === listingId);
    if (!listing) {
      const err = new Error('Listing not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (listing.status !== LISTING_STATUS.PENDING_VERIFICATION) {
      const err = new Error(`Listing cannot be verified from status ${listing.status}`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    const ticket = state.tickets.find(t => t.id === listing.ticket_id);

    if (approved) {
      listing.status = LISTING_STATUS.ACTIVE;
      if (ticket) ticket.status = 'ACTIVE';

      await recordAuditLog('LISTING', listingId, 'VERIFIED_AND_ACTIVATED', officerId, {
        ticket_id: listing.ticket_id
      });

      return { success: true, status: LISTING_STATUS.ACTIVE, listing };
    } else {
      if (!reason) {
        const err = new Error('Rejection reason is required');
        err.code = 'REASON_REQUIRED';
        throw err;
      }
      listing.status = LISTING_STATUS.REJECTED;
      listing.rejection_reason = reason;
      if (ticket) ticket.status = 'REJECTED';

      await recordAuditLog('LISTING', listingId, 'REJECTED', officerId, {
        ticket_id: listing.ticket_id,
        reason
      });

      return { success: true, status: LISTING_STATUS.REJECTED, listing };
    }
  }

  /**
   * Get all active marketplace listings with event details
   */
  static getActiveListings(eventId = null) {
    return state.listings
      .filter(l => l.status === LISTING_STATUS.ACTIVE && (!eventId || l.event_id === eventId))
      .map(listing => {
        const event = state.events.find(e => e.id === listing.event_id) || {};
        const venue = state.venues.find(v => v.id === event.venue_id) || {};
        const seller = state.users.find(u => u.id === listing.seller_id) || {};
        const isUserCreatedEvent = event.source === 'USER_CREATED';
        const isEventUnverified = !event.is_verified;
        const picAssign = state.event_pics?.find(ep => ep.event_id === listing.event_id && ep.status === 'ACTIVE');
        const category = listing.category || (listing.seat_info ? listing.seat_info.split(/[-–,]/)[0].trim() : 'GENERAL');

        return {
          id: listing.id,
          ticket_id: listing.ticket_id,
          seat_info: listing.seat_info,
          ticket_category: category,
          face_value: listing.face_value,
          price: listing.price,
          seller_asking_price: listing.price,
          verification_status: listing.status === 'ACTIVE' ? 'VERIFIED' : listing.status,
          pic_available: !!picAssign,
          pic_support_available: !!picAssign,
          pic_contact: picAssign ? picAssign.contact_phone : null,
          seller_id: listing.seller_id,
          seller_name: seller.name,
          event_id: listing.event_id,
          event_title: event.title || event.name,
          event_date: event.date || event.start_date,
          venue_name: venue.name || event.venue_name || event.venue,
          venue_city: venue.city || event.venue_city || 'Jakarta',
          user_created_event: isUserCreatedEvent,
          is_event_verified: !isEventUnverified,
          event_verification_warning: isEventUnverified ? 'Event dibuat oleh pengguna – belum diverifikasi resmi' : null,
          created_at: listing.created_at
        };
      });
  }
}

module.exports = { ListingService, LISTING_STATUS };

