/**
 * TIKUM / ARGUS — Operational Lead & Admin Notification Service
 * 
 * Bridges operational marketplace events into the centralized AdminActivityNotificationService.
 * Ensures dual delivery to admin@tikum.app and support@tikum.app, Purelymail SMTP compliance,
 * non-blocking execution, and durable audit tracking.
 */

const { AdminActivityNotificationService } = require('./AdminActivityNotificationService');
const { state, recordAuditLog } = require('../../database');

class OperationalNotificationService {
  /**
   * Main unified notification dispatcher
   */
  static async notify(eventType, payload, options) {
    return AdminActivityNotificationService.notify(eventType, payload, options);
  }

  /**
   * Dispatches operational email notifications when a seller submits a listing.
   */
  static async notifySellerListingCreated({ listing, seller = null, event = null }) {
    if (!listing || !listing.id) return { success: false, error: 'Listing is required' };

    const listingId = listing.id;
    const sellerId = listing.seller_id;
    const resolvedSeller = seller || (state.users || []).find(u => u.id === sellerId) || {};
    const sellerName = resolvedSeller.name || resolvedSeller.display_name || 'Penjual Terdaftar';
    const sellerEmail = resolvedSeller.email || 'N/A';
    const sellerPhone = resolvedSeller.phone || 'N/A';

    let resolvedEvent = event;
    if (!resolvedEvent) {
      try {
        const { canonicalRegistry } = require('../../discovery/CanonicalEventRegistry');
        const eventId = listing.event_id || listing.canonical_event_id;
        resolvedEvent = (canonicalRegistry && typeof canonicalRegistry.getEventById === 'function' ? canonicalRegistry.getEventById(eventId) : null) ||
          (state.events || []).find(e => e.id === eventId) || {};
      } catch (_) {
        resolvedEvent = (state.events || []).find(e => e.id === listing.event_id) || {};
      }
    }

    const eventName = resolvedEvent.name || resolvedEvent.title || resolvedEvent.canonical_name || 'Event Musik';
    const eventDate = resolvedEvent.date || resolvedEvent.start_date || 'TBA';
    const venueName = resolvedEvent.venue_name || resolvedEvent.venue || 'TBA';
    const seatInfo = listing.seat_info || 'General Admission';
    const quantity = listing.quantity || listing.total_quantity || 1;
    const askingPrice = listing.price || 0;

    const payload = {
      listingId,
      sellerId,
      userId: sellerId,
      userDisplayName: sellerName,
      userEmail: sellerEmail,
      sellerName,
      sellerEmail,
      sellerPhone,
      eventName,
      eventDate,
      venueName,
      seatInfo,
      ticketCategory: seatInfo,
      quantity,
      askingPrice,
      amount: askingPrice,
      description: `Penjual ${sellerName} mengajukan listing tiket baru untuk event ${eventName} (${quantity} tiket @ Rp ${Number(askingPrice).toLocaleString('id-ID')}).`,
      adminUrl: `https://tikum.app/admin?tab=listings&id=${listingId}`
    };

    const result = await AdminActivityNotificationService.notify('SELLER_LISTING_CREATED', payload, {
      idempotencyKey: `admin:lead:listing:${listingId}`
    });

    // Record state on listing
    const status = result.success ? 'SENT' : 'FAILED';
    if (!listing.metadata) listing.metadata = {};
    listing.metadata.admin_notification_status = status;
    listing.metadata.admin_notification_timestamp = new Date().toISOString();
    if (result.error) {
      listing.metadata.admin_notification_error = String(result.error).substring(0, 500);
    }

    return {
      success: result.success,
      status,
      error: result.error,
      listingId
    };
  }

  /**
   * Dispatches operational email notification when a buyer submits a purchase interest inquiry.
   */
  static async notifyBuyerInquiryCreated({ inquiry, buyer = null, seller = null, listing = null, event = null }) {
    if (!inquiry || !inquiry.id) return { success: false, error: 'Inquiry is required' };

    const inquiryId = inquiry.id;
    const buyerId = inquiry.buyer_id;
    const sellerId = inquiry.seller_id;
    const listingId = inquiry.listing_id;

    const resolvedBuyer = buyer || (state.users || []).find(u => u.id === buyerId) || {};
    const buyerName = resolvedBuyer.name || resolvedBuyer.display_name || inquiry.buyer_name || 'Pembeli';
    const buyerEmail = resolvedBuyer.email || inquiry.buyer_email || 'N/A';
    const buyerPhone = inquiry.contact_phone || inquiry.contact_whatsapp || resolvedBuyer.phone || 'N/A';

    const resolvedSeller = seller || (state.users || []).find(u => u.id === sellerId) || {};
    const sellerName = resolvedSeller.name || resolvedSeller.display_name || 'Penjual';

    const resolvedListing = listing || (state.listings || []).find(l => l.id === listingId) || {};
    const seatInfo = resolvedListing.seat_info || inquiry.seat_info || 'General Admission';
    const requestedQuantity = inquiry.quantity || inquiry.requested_quantity || 1;
    const askingPrice = inquiry.proposed_price || inquiry.offer_amount || resolvedListing.price || 0;

    let resolvedEvent = event;
    if (!resolvedEvent) {
      try {
        const { canonicalRegistry } = require('../../discovery/CanonicalEventRegistry');
        const eventId = inquiry.event_id || resolvedListing.event_id || resolvedListing.canonical_event_id;
        resolvedEvent = (canonicalRegistry && typeof canonicalRegistry.getEventById === 'function' ? canonicalRegistry.getEventById(eventId) : null) ||
          (state.events || []).find(e => e.id === eventId) || {};
      } catch (_) {
        resolvedEvent = (state.events || []).find(e => e.id === inquiry.event_id) || {};
      }
    }

    const eventName = resolvedEvent.name || resolvedEvent.title || resolvedEvent.canonical_name || 'Event';

    const payload = {
      inquiryId,
      listingId,
      userId: buyerId,
      userDisplayName: buyerName,
      userEmail: buyerEmail,
      buyerName,
      buyerEmail,
      buyerPhone,
      sellerName,
      eventName,
      seatInfo,
      ticketCategory: seatInfo,
      quantity: requestedQuantity,
      askingPrice,
      amount: askingPrice,
      description: `Calon pembeli ${buyerName} menyatakan minat beli untuk tiket ${eventName} (${requestedQuantity} tiket). Kontak WA/Telp: ${buyerPhone}.`,
      adminUrl: `https://tikum.app/admin?tab=inquiries&id=${inquiryId}`
    };

    const result = await AdminActivityNotificationService.notify('BUYER_INQUIRY_CREATED', payload, {
      idempotencyKey: `admin:lead:inquiry:${inquiryId}`
    });

    const status = result.success ? 'SENT' : 'FAILED';
    inquiry.notification_status = status;
    inquiry.notification_timestamp = new Date().toISOString();
    if (result.error) {
      inquiry.notification_error = String(result.error).substring(0, 500);
    }

    return {
      success: result.success,
      status,
      error: result.error,
      inquiryId
    };
  }

  /**
   * Dispatches operational email notification when a seller submits KYC onboarding.
   */
  static async notifySellerKycSubmitted({ profile, user = null, userId = null }) {
    const resolvedUserId = userId || profile?.user_id;
    const resolvedUser = user || (state.users || []).find(u => u.id === resolvedUserId) || {};

    const sellerName = resolvedUser.name || resolvedUser.display_name || profile?.display_name || 'Calon Penjual';
    const sellerEmail = resolvedUser.email || 'N/A';
    const sellerPhone = resolvedUser.phone || profile?.phone || 'N/A';
    const payoutBank = profile?.payout_bank || 'N/A';
    const submissionTimestamp = profile?.requested_at || new Date().toISOString();

    const payload = {
      userId: resolvedUserId,
      userDisplayName: sellerName,
      userEmail: sellerEmail,
      sellerName,
      sellerEmail,
      sellerPhone,
      payoutBank,
      submissionTimestamp,
      description: `Calon penjual ${sellerName} (${sellerEmail}) telah mengirimkan dokumen verifikasi KYC dengan rekening pencairan bank ${payoutBank}.`,
      adminUrl: `https://tikum.app/admin?tab=sellers&id=${resolvedUserId}`
    };

    const result = await AdminActivityNotificationService.notify('SELLER_KYC_SUBMITTED', payload, {
      idempotencyKey: `admin:lead:kyc:${resolvedUserId}:${submissionTimestamp}`
    });

    const status = result.success ? 'SENT' : 'FAILED';
    if (profile) {
      profile.admin_notification_status = status;
      profile.admin_notification_timestamp = new Date().toISOString();
      if (result.error) {
        profile.admin_notification_error = String(result.error).substring(0, 500);
      }
    }

    return {
      success: result.success,
      status,
      error: result.error,
      userId: resolvedUserId
    };
  }
}

module.exports = {
  OperationalNotificationService,
  AdminActivityNotificationService
};
