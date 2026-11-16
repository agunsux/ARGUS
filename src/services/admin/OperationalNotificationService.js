/**
 * TIKUM / ARGUS — Operational Lead & Admin Notification Service
 * 
 * Routes marketplace operational events directly to admin@tikum.app:
 * 1. NEW_SELLER_LISTING
 * 2. LISTING_MODERATION_REQUIRED
 * 3. NEW_BUYER_INQUIRY
 * 4. SELLER_KYC_SUBMITTED
 * 
 * Invariants & Guarantees:
 * - Uses existing centralized EmailService.
 * - Dispatches notifications only AFTER successful database/repository persistence.
 * - Strict idempotency keys prevent duplicate notifications.
 * - Non-blocking secondary effect: email failure never loses or mutates listings, inquiries, or KYC.
 * - Records delivery status (SENT / FAILED) on records for admin visibility.
 * - Strictly strips secrets: zero passwords, tokens, full card/bank numbers, or raw barcodes.
 */

function getEmailService() {
  return require('../emailService').emailService;
}
const { ADMIN_EMAIL } = require('../emailTemplates');
const { state, recordAuditLog } = require('../../database');

class OperationalNotificationService {
  /**
   * Dispatches operational email notifications when a seller submits a listing.
   * Sends both NEW_SELLER_LISTING and LISTING_MODERATION_REQUIRED to admin@tikum.app.
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
      const { canonicalRegistry } = require('../../discovery/CanonicalEventRegistry');
      const eventId = listing.event_id || listing.canonical_event_id;
      resolvedEvent = (canonicalRegistry && typeof canonicalRegistry.getEventById === 'function' ? canonicalRegistry.getEventById(eventId) : null) ||
        (state.events || []).find(e => e.id === eventId) || {};
    }

    const eventName = resolvedEvent.name || resolvedEvent.title || resolvedEvent.canonical_name || 'Event Musik';
    const eventDate = resolvedEvent.date || resolvedEvent.start_date || 'TBA';
    const venueName = resolvedEvent.venue_name || resolvedEvent.venue || 'TBA';
    const seatInfo = listing.seat_info || 'General Admission';
    const quantity = listing.quantity || listing.total_quantity || 1;
    const askingPrice = listing.price || 0;

    const data = {
      listingId,
      sellerName,
      sellerEmail,
      sellerPhone,
      sellerId,
      eventName,
      eventDate,
      venueName,
      ticketCategory: seatInfo,
      seatInfo,
      quantity,
      askingPrice,
      price: askingPrice,
      adminUrl: `https://tikum.app/admin?tab=listings&id=${listingId}`,
      moderationUrl: `https://tikum.app/admin?tab=listings&id=${listingId}`
    };

    let leadResult = null;
    let moderationResult = null;
    let overallSuccess = true;
    let lastError = null;

    // 1. Send NEW_SELLER_LISTING to admin@tikum.app
    try {
      leadResult = await getEmailService().sendEmail({
        to: ADMIN_EMAIL,
        template: 'NEW_SELLER_LISTING',
        data,
        idempotencyKey: `admin:lead:listing:${listingId}`
      });
      if (leadResult && leadResult.success === false) {
        overallSuccess = false;
        lastError = leadResult.error || 'Delivery failed';
      }
    } catch (err) {
      overallSuccess = false;
      lastError = err.message;
      console.warn('[OperationalNotification] NEW_SELLER_LISTING dispatch error:', err.message);
    }

    // 2. Send LISTING_MODERATION_REQUIRED to admin@tikum.app
    try {
      moderationResult = await getEmailService().sendEmail({
        to: ADMIN_EMAIL,
        template: 'LISTING_MODERATION_REQUIRED',
        data,
        idempotencyKey: `admin:lead:moderation:${listingId}`
      });
      if (moderationResult && moderationResult.success === false) {
        overallSuccess = false;
        if (!lastError) lastError = moderationResult.error || 'Delivery failed';
      }
    } catch (err) {
      overallSuccess = false;
      if (!lastError) lastError = err.message;
      console.warn('[OperationalNotification] LISTING_MODERATION_REQUIRED dispatch error:', err.message);
    }

    // Record notification state on listing record
    const status = overallSuccess ? 'SENT' : 'FAILED';
    if (!listing.metadata) listing.metadata = {};
    listing.metadata.admin_notification_status = status;
    listing.metadata.admin_notification_timestamp = new Date().toISOString();
    if (lastError) {
      listing.metadata.admin_notification_error = String(lastError).substring(0, 500);
    }

    // Record audit log
    try {
      await recordAuditLog('NOTIFICATION', listingId, 'ADMIN_LISTING_NOTIFICATION_DISPATCHED', sellerId, {
        listing_id: listingId,
        status,
        error: lastError || null
      });
    } catch (_) {}

    return {
      success: overallSuccess,
      status,
      error: lastError,
      listingId
    };
  }

  /**
   * Dispatches operational email notification when a buyer submits a purchase interest inquiry.
   * Sends NEW_BUYER_INQUIRY to admin@tikum.app for manual WhatsApp / phone follow-up.
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
    const sellerEmail = resolvedSeller.email || 'N/A';
    const sellerPhone = resolvedSeller.phone || 'N/A';

    const resolvedListing = listing || (state.listings || []).find(l => l.id === listingId) || {};
    const seatInfo = resolvedListing.seat_info || inquiry.seat_info || 'General Admission';
    const requestedQuantity = inquiry.quantity || inquiry.requested_quantity || 1;
    const askingPrice = inquiry.proposed_price || inquiry.offer_amount || resolvedListing.price || 0;

    let resolvedEvent = event;
    if (!resolvedEvent) {
      const { canonicalRegistry } = require('../../discovery/CanonicalEventRegistry');
      const eventId = inquiry.event_id || resolvedListing.event_id || resolvedListing.canonical_event_id;
      resolvedEvent = (canonicalRegistry && typeof canonicalRegistry.getEventById === 'function' ? canonicalRegistry.getEventById(eventId) : null) ||
        (state.events || []).find(e => e.id === eventId) || {};
    }

    const eventName = resolvedEvent.name || resolvedEvent.title || resolvedEvent.canonical_name || 'Event';
    const eventDate = resolvedEvent.date || resolvedEvent.start_date || 'TBA';
    const venueName = resolvedEvent.venue_name || resolvedEvent.venue || 'TBA';

    const data = {
      inquiryId,
      listingId,
      buyerName,
      buyerEmail,
      buyerPhone,
      contactPhone: buyerPhone,
      buyerId,
      sellerName,
      sellerEmail,
      sellerPhone,
      sellerId,
      eventName,
      eventDate,
      venueName,
      ticketCategory: seatInfo,
      seatInfo,
      requestedQuantity,
      quantity: requestedQuantity,
      askingPrice,
      proposedPrice: askingPrice,
      message: inquiry.message || null,
      adminUrl: `https://tikum.app/admin?tab=inquiries&id=${inquiryId}`
    };

    let result = null;
    let isSuccess = true;
    let lastError = null;

    try {
      result = await getEmailService().sendEmail({
        to: ADMIN_EMAIL,
        template: 'NEW_BUYER_INQUIRY',
        data,
        idempotencyKey: `admin:lead:inquiry:${inquiryId}`
      });
      if (result && result.success === false) {
        isSuccess = false;
        lastError = result.error || 'Delivery failed';
      }
    } catch (err) {
      isSuccess = false;
      lastError = err.message;
      console.warn('[OperationalNotification] NEW_BUYER_INQUIRY dispatch error:', err.message);
    }

    const status = isSuccess ? 'SENT' : 'FAILED';
    inquiry.notification_status = status;
    inquiry.notification_timestamp = new Date().toISOString();
    if (lastError) {
      inquiry.notification_error = String(lastError).substring(0, 500);
    }

    try {
      await recordAuditLog('NOTIFICATION', inquiryId, 'ADMIN_INQUIRY_NOTIFICATION_DISPATCHED', buyerId, {
        inquiry_id: inquiryId,
        listing_id: listingId,
        status,
        error: lastError || null
      });
    } catch (_) {}

    return {
      success: isSuccess,
      status,
      error: lastError,
      inquiryId
    };
  }

  /**
   * Dispatches operational email notification when a seller submits KYC onboarding.
   * Sends SELLER_KYC_SUBMITTED to admin@tikum.app for compliance review.
   */
  static async notifySellerKycSubmitted({ profile, user = null, userId = null }) {
    const resolvedUserId = userId || profile?.user_id;
    const resolvedUser = user || (state.users || []).find(u => u.id === resolvedUserId) || {};

    const sellerName = resolvedUser.name || resolvedUser.display_name || profile?.display_name || 'Calon Penjual';
    const sellerEmail = resolvedUser.email || 'N/A';
    const sellerPhone = resolvedUser.phone || profile?.phone || 'N/A';
    const payoutBank = profile?.payout_bank || 'N/A';
    const submissionTimestamp = profile?.requested_at || new Date().toISOString();

    const data = {
      applicationId: resolvedUserId,
      userId: resolvedUserId,
      sellerName,
      sellerEmail,
      sellerPhone,
      payoutBank,
      submissionTimestamp,
      adminUrl: `https://tikum.app/admin?tab=sellers&id=${resolvedUserId}`
    };

    let result = null;
    let isSuccess = true;
    let lastError = null;

    try {
      result = await getEmailService().sendEmail({
        to: ADMIN_EMAIL,
        template: 'SELLER_KYC_SUBMITTED',
        data,
        idempotencyKey: `admin:lead:kyc:${resolvedUserId}:${submissionTimestamp}`
      });
      if (result && result.success === false) {
        isSuccess = false;
        lastError = result.error || 'Delivery failed';
      }
    } catch (err) {
      isSuccess = false;
      lastError = err.message;
      console.warn('[OperationalNotification] SELLER_KYC_SUBMITTED dispatch error:', err.message);
    }

    const status = isSuccess ? 'SENT' : 'FAILED';
    if (profile) {
      profile.admin_notification_status = status;
      profile.admin_notification_timestamp = new Date().toISOString();
      if (lastError) {
        profile.admin_notification_error = String(lastError).substring(0, 500);
      }
    }

    try {
      await recordAuditLog('NOTIFICATION', resolvedUserId, 'ADMIN_KYC_NOTIFICATION_DISPATCHED', resolvedUserId, {
        user_id: resolvedUserId,
        status,
        error: lastError || null
      });
    } catch (_) {}

    return {
      success: isSuccess,
      status,
      error: lastError,
      userId: resolvedUserId
    };
  }
}

module.exports = {
  OperationalNotificationService
};
