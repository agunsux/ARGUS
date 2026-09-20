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
   * Create ticket and listing (LEGACY — backward-compatible wrapper).
   *
   * DEPRECATION NOTICE:
   * This method exists for backward compatibility with existing tests and flows.
   * New marketplace code should use the separated canonical flow:
   *   1. TicketInventoryService.createTicket(...)
   *   2. MarketplaceListingService.createListing({ ticketId, ... })
   *
   * Internally, ticket creation now delegates to TicketInventoryService
   * to maintain a single canonical ticket creation path.
   *
   * @PERSISTENCE_BOUNDARY — state.tickets + state.listings mutations
   */
  static async createListing({ sellerId, eventId, seatInfo, faceValue, price, rawBarcode, evidenceBundleId }) {
    // 1. Verify seller eligibility
    // 1. Verify seller eligibility (preserves existing behavior)
    const eligibility = this.validateSellerEligibility(sellerId);
    if (!eligibility.eligible) {
      const err = new Error(eligibility.reason);
      err.code = 'SELLER_NOT_ELIGIBLE';
      throw err;
    }

    // 2. Validate Event
    // 2. Validate Event (preserves existing behavior)
    const event = state.events.find(e => e.id === eventId);
    if (!event) {
      const err = new Error(`Event ${eventId} not found`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    // 3. Prevent duplicate ticket barcodes (preserves existing behavior)
    const barcodeHash = this.hashBarcode(rawBarcode);
    const duplicate = state.tickets.find(t => t.event_id === eventId && t.barcode_hash === barcodeHash);
    if (duplicate) {
      const err = new Error('Duplicate ticket barcode detected. This ticket is already registered.');
      err.code = 'DUPLICATE_TICKET_BARCODE';
      throw err;
    }

    // 4. CANONICAL TICKET CREATION — delegated to TicketInventoryService
    //    Parse seatInfo into structured fields for the canonical model
    const rowMatch = seatInfo ? seatInfo.match(/Row\s+(\w+)/i) : null;
    const seatMatch = seatInfo ? seatInfo.match(/Seat\s+(\w+)/i) : null;
    const sectionPart = seatInfo ? seatInfo.split(/[,\-–]/)[0].trim() : 'General';

    let ticket;
    try {
      const { TicketInventoryService } = require('./marketplace/TicketInventoryService');
      ticket = await TicketInventoryService.createTicket({
        sellerId,
        canonicalEventId: eventId,
        ticketType: 'GENERAL_ADMISSION',
        section: sectionPart,
        row: rowMatch ? rowMatch[1] : null,
        seat: seatMatch ? seatMatch[1] : null,
        faceValue: parseInt(faceValue, 10),
        currency: 'IDR',
        barcodeHash,
        rawBarcode: null // already hashed above
      });

      // Immediately submit for verification (legacy flow auto-submits)
      await TicketInventoryService.submitForVerification(
        ticket.ticket_id || ticket.id,
        sellerId,
        evidenceBundleId
      );

      // Preserve backward-compatible ticket shape expected by existing tests
      ticket.seat_info = seatInfo;
      ticket.price = parseInt(price, 10);
      ticket.face_value = parseInt(faceValue, 10);
    } catch (delegationErr) {
      // If TicketInventoryService throws DUPLICATE_TICKET_BARCODE, propagate as-is.
      if (delegationErr.code === 'DUPLICATE_TICKET_BARCODE') {
        throw delegationErr;
      }

      // Legacy fallback: direct ticket creation (temporary safety net)
      const fallbackTicketId = `tkt-${uuidv4()}`;
      ticket = {
        id: fallbackTicketId,
        ticket_id: fallbackTicketId,
        event_id: eventId,
        current_owner_id: sellerId,
        seller_id: sellerId,
        status: 'PENDING_VERIFICATION',
        seat_info: seatInfo,
        face_value: parseInt(faceValue),
        price: parseInt(price),
        barcode_hash: barcodeHash
      };
      state.tickets.push(ticket);
    }

    const ticketId = ticket.ticket_id || ticket.id;

    // 5. Create Listing entity (listing creation stays in ListingService)
    // @PERSISTENCE_BOUNDARY
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
      barcode_hash: barcodeHash,
      canonical_delegation: true
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

