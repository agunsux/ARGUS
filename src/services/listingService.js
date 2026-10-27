const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { state, recordAuditLog } = require('../database');

const LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  NEEDS_CORRECTION: 'NEEDS_CORRECTION',
  APPROVED_PRELAUNCH: 'APPROVED_PRELAUNCH',
  VERIFIED: 'VERIFIED',
  ACTIVE: 'ACTIVE',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  SETTLED: 'SETTLED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  SUSPENDED: 'SUSPENDED'
};

class ListingService {
  /**
   * Helper to hash barcode/QR content
   */
  static hashBarcode(rawBarcode) {
    return crypto.createHash('sha256').update(rawBarcode.trim()).digest('hex');
  }

  /**
   * Check seller KYC and listing limits (synchronous helper)
   */
  static validateSellerEligibility(sellerId) {
    const profile = (state.seller_profiles || []).find(p => p.user_id === sellerId);
    if (!profile) {
      return { eligible: false, reason: 'Seller profile not found or KYC not submitted', code: 'SELLER_ONBOARDING_REQUIRED' };
    }
    if (profile.suspended || profile.status === 'SUSPENDED' || profile.kyc_status === 'SUSPENDED') {
      return { eligible: false, reason: 'Seller account is suspended', code: 'SELLER_SUSPENDED' };
    }
    if (profile.kyc_status !== 'VERIFIED') {
      return {
        eligible: false,
        reason: `Seller KYC is not VERIFIED (current status: ${profile.kyc_status || 'UNVERIFIED'})`,
        code: profile.kyc_status === 'PENDING_REVIEW' ? 'SELLER_KYC_PENDING_REVIEW' : 'SELLER_KYC_NOT_VERIFIED'
      };
    }

    const activeListings = (state.listings || []).filter(
      l => l.seller_id === sellerId && ['PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'RESERVED'].includes(l.status)
    ).length;

    if (profile.active_listing_limit && activeListings >= profile.active_listing_limit) {
      return { eligible: false, reason: `Seller active listing limit of ${profile.active_listing_limit} reached`, code: 'SELLER_LISTING_LIMIT_REACHED' };
    }

    return { eligible: true, profile };
  }

  /**
   * Check seller KYC and listing limits durably via UserRepository + MarketplaceRepository
   */
  static async validateSellerEligibilityAsync(sellerId) {
    const { isPrelaunchListingMode } = require('../config/marketplaceMode');
    const isPrelaunch = isPrelaunchListingMode();

    let profile = (state.seller_profiles || []).find(p => p.user_id === sellerId) || null;
    try {
      const { getUserRepository } = require('../storage');
      const userRepo = getUserRepository();
      const dbProfile = await userRepo.getSellerProfile(sellerId);
      if (dbProfile) {
        if (!profile) {
          if (!state.seller_profiles) state.seller_profiles = [];
          state.seller_profiles.push(dbProfile);
          profile = dbProfile;
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw err;
      }
    }

    if (!profile) {
      // In pre-launch listing mode, eligible registered sellers can onboard immediately
      if (isPrelaunch) {
        let user = (state.users || []).find(u => u.id === sellerId);
        if (user && (user.status || 'ACTIVE').toUpperCase() !== 'SUSPENDED') {
          profile = {
            user_id: sellerId,
            kyc_status: 'REGISTERED',
            active_listing_limit: 20
          };
          if (!state.seller_profiles) state.seller_profiles = [];
          state.seller_profiles.push(profile);
        } else {
          return { eligible: false, reason: 'Seller profile not found or KYC not submitted', code: 'SELLER_ONBOARDING_REQUIRED' };
        }
      } else {
        return { eligible: false, reason: 'Seller profile not found or KYC not submitted', code: 'SELLER_ONBOARDING_REQUIRED' };
      }
    }

    if (profile.suspended || profile.status === 'SUSPENDED' || profile.kyc_status === 'SUSPENDED') {
      return { eligible: false, reason: 'Seller account is suspended', code: 'SELLER_SUSPENDED' };
    }

    // In live mode, KYC must be strictly VERIFIED before listing.
    // In pre-launch mode, ticket listing collection is open for registered sellers without requiring bank details.
    if (!isPrelaunch && profile.kyc_status !== 'VERIFIED') {
      return {
        eligible: false,
        reason: `Seller KYC is not VERIFIED (current status: ${profile.kyc_status || 'UNVERIFIED'})`,
        code: profile.kyc_status === 'PENDING_REVIEW' ? 'SELLER_KYC_PENDING_REVIEW' : 'SELLER_KYC_NOT_VERIFIED'
      };
    }

    const activeIds = new Set();
    const countStatuses = ['PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'RESERVED', 'APPROVED_PRELAUNCH', 'DRAFT'];
    for (const l of (state.listings || [])) {
      if (l.seller_id === sellerId && countStatuses.includes(l.status)) {
        activeIds.add(l.id);
      }
    }
    try {
      const { getMarketplaceRepository } = require('../storage');
      const mktRepo = getMarketplaceRepository();
      const dbListings = await mktRepo.listListingsBySeller(sellerId);
      for (const l of (dbListings || [])) {
        if (countStatuses.includes(l.status)) {
          activeIds.add(l.id);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw err;
      }
    }

    if (profile.active_listing_limit && activeIds.size >= profile.active_listing_limit) {
      return {
        eligible: false,
        reason: `Seller active listing limit of ${profile.active_listing_limit} reached`,
        code: 'SELLER_LISTING_LIMIT_REACHED'
      };
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
  static async createListing({
    sellerId,
    eventId,
    seatInfo,
    faceValue,
    price,
    rawBarcode,
    evidenceBundleId,
    bypassPilotBounds = false,
    quantity = 1,
    fulfillmentType = 'SELLER_MANAGED',
    picAssistanceStatus = null,
    seatType = null,
    isDraft = false,
    status = null,
    sellerNotes = null
  }) {
    // 1. Verify seller eligibility durably
    const eligibility = await this.validateSellerEligibilityAsync(sellerId);
    if (!eligibility.eligible) {
      const err = new Error(eligibility.reason);
      err.code = 'SELLER_NOT_ELIGIBLE';
      err.eligibilityCode = eligibility.code || 'SELLER_NOT_ELIGIBLE';
      throw err;
    }

    // 2. Validate Event
    const event = state.events.find(e => e.id === eventId);
    if (!event) {
      const err = new Error(`Event ${eventId} not found`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    // 2b. Validate Pilot Price Bounds & Markup Cap
    const { validateListingPrice } = require('../config/pricingConfig');
    let needsManualReview = false;
    if (!bypassPilotBounds) {
      const priceVal = validateListingPrice({ price, faceValue, event });
      if (!priceVal.valid) {
        const err = new Error(priceVal.error);
        err.code = priceVal.code;
        throw err;
      }
      if (priceVal.needsManualReview) {
        needsManualReview = true;
      }
    }

    const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('../discovery/EventTemporalLifecycleEngine');
    let endMs = NaN;
    try {
      const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
      if (temporal && temporal.event_end_at) {
        endMs = new Date(temporal.event_end_at).getTime();
      }
    } catch (_) {
      endMs = NaN;
    }
    const rawStatus = (event.status || event.lifecycle_status || '').toUpperCase();
    const isConcluded = isNaN(endMs) || endMs <= Date.now() || [
      LIFECYCLE_STATUS.COMPLETED,
      LIFECYCLE_STATUS.ARCHIVED,
      LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS,
      LIFECYCLE_STATUS.CANCELLED,
      'EXPIRED',
      'DIBATALKAN'
    ].includes(rawStatus);

    if (isConcluded) {
      const err = new Error(`Cannot list ticket for concluded/expired event '${eventId}'`);
      err.code = 'EVENT_CONCLUDED';
      throw err;
    }

    // 2c. Evaluate H-7 / H-14 Operational Listing Window Policy
    const { ListingWindowPolicy } = require('../policy/ListingWindowPolicy');
    const { isPrelaunchListingMode } = require('../config/marketplaceMode');
    const isPrelaunch = isPrelaunchListingMode();
    const isPilotVerified = Boolean(bypassPilotBounds || event.is_pilot || event.pilot_approved);
    const windowEval = ListingWindowPolicy.evaluateListingWindow({
      event,
      isPilotVerified,
      bypassPolicy: Boolean(bypassPilotBounds || isPrelaunch || (process.env.NODE_ENV === 'test' && !process.env.ENFORCE_LISTING_WINDOW_TEST)),
      isPrelaunchCollection: isPrelaunch,
      now: new Date()
    });

    if (!windowEval.allowed) {
      const err = new Error(windowEval.reason);
      err.code = windowEval.code;
      err.windowDetails = windowEval;
      throw err;
    }

    // 3. Prevent duplicate ticket barcodes (preserves existing behavior)
    const effectiveBarcode = rawBarcode || `DRAFT-BARCODE-${uuidv4()}`;
    const barcodeHash = this.hashBarcode(effectiveBarcode);
    const duplicate = state.tickets.find(t => t.event_id === eventId && t.barcode_hash === barcodeHash);
    if (duplicate && !isDraft && status !== LISTING_STATUS.DRAFT) {
      const err = new Error('Duplicate ticket barcode detected. This ticket is already registered.');
      err.code = 'DUPLICATE_TICKET_BARCODE';
      throw err;
    }

    // 4. CANONICAL TICKET CREATION — delegated to TicketInventoryService
    //    Parse seatInfo into structured fields for the canonical model
    const rowMatch = seatInfo ? seatInfo.match(/Row\s+(\w+)/i) : null;
    const seatMatch = seatInfo ? seatInfo.match(/Seat\s+(\w+)/i) : null;
    const sectionPart = seatInfo ? seatInfo.split(/[,\-–]/)[0].trim() : 'General';

    const qty = Math.min(4, Math.max(1, parseInt(quantity, 10) || 1));
    const normalizedFulfillment = (fulfillmentType && fulfillmentType.toUpperCase() === 'TIKUM_VENUE_PIC') ? 'TIKUM_VENUE_PIC' : 'SELLER_MANAGED';
    let resolvedPicStatus = picAssistanceStatus;
    if (!resolvedPicStatus) {
      if (normalizedFulfillment === 'TIKUM_VENUE_PIC') {
        const hasPic = (state.event_pics || []).some(ep => ep.event_id === eventId && ep.status === 'ACTIVE');
        resolvedPicStatus = hasPic ? 'CONFIRMED' : 'REQUESTED_PENDING_ASSIGNMENT';
      } else {
        resolvedPicStatus = 'NONE';
      }
    }
    const normalizedSeatType = seatType || (seatInfo && /row|seat|kursi|baris/i.test(seatInfo) ? 'ASSIGNED' : 'GENERAL_ADMISSION');

    let ticket;
    try {
      const { TicketInventoryService } = require('./marketplace/TicketInventoryService');
      ticket = await TicketInventoryService.createTicket({
        sellerId,
        canonicalEventId: eventId,
        ticketType: normalizedSeatType,
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
      ticket.quantity = qty;
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
        barcode_hash: barcodeHash,
        quantity: qty
      };
      state.tickets.push(ticket);
    }

    const ticketId = ticket.ticket_id || ticket.id;

    // 5. Create Listing entity (listing creation stays in ListingService)
    // @PERSISTENCE_BOUNDARY
    const isUserCreatedEvent = event.source === 'USER_CREATED';
    const isEventUnverified = !event.is_verified;
    const listingId = `list-${uuidv4()}`;

    const { CanonicalFeeEngine } = require('../pricing/CanonicalFeeEngine');
    const feeBreakdown = CanonicalFeeEngine.calculateTicketFees({
      ticketPrice: parseInt(price, 10),
      quantity: qty
    });

    const initialStatus = (isDraft || status === LISTING_STATUS.DRAFT)
      ? LISTING_STATUS.DRAFT
      : (status || LISTING_STATUS.PENDING_VERIFICATION);

    const listing = {
      id: listingId,
      listing_id: listingId,
      ticket_id: ticketId,
      seller_id: sellerId,
      event_id: eventId,
      face_value: parseInt(faceValue),
      price: parseInt(price),
      seat_info: seatInfo,
      seat_type: normalizedSeatType,
      quantity: qty,
      total_quantity: qty,
      available_quantity: qty,
      sold_quantity: 0,
      reserved_quantity: 0,
      fulfillment_type: normalizedFulfillment,
      pic_assistance_status: resolvedPicStatus,
      pricing: {
        fee_policy_version: feeBreakdown.fee_policy_version,
        ticket_price: feeBreakdown.ticket_price,
        gross_ticket_value: feeBreakdown.gross_ticket_value,
        quantity: qty,
        buyer_fee: feeBreakdown.buyer_fee,
        seller_fee: feeBreakdown.seller_fee,
        seller_payout: feeBreakdown.seller_payout,
        buyer_subtotal: feeBreakdown.buyer_subtotal,
        buyer_total: feeBreakdown.buyer_total,
        currency: feeBreakdown.currency
      },
      status: initialStatus,
      review_status: needsManualReview ? 'NEEDS_MANUAL_REVIEW' : 'NORMAL',
      needs_manual_review: needsManualReview,
      rejection_reason: null,
      correction_reason: null,
      seller_notes: sellerNotes || null,
      evidence_bundle_id: evidenceBundleId || null,
      user_created_event: isUserCreatedEvent,
      event_verification_warning: isEventUnverified ? 'Event dibuat oleh pengguna – belum diverifikasi resmi' : null,
      created_at: new Date().toISOString()
    };
    state.listings.push(listing);

    try {
      const { getMarketplaceRepository } = require('../storage');
      const marketplaceRepo = getMarketplaceRepository();
      await marketplaceRepo.createListing({
        id: listingId,
        ticket_id: ticketId,
        seller_id: sellerId,
        canonical_event_id: eventId,
        price: parseInt(price, 10),
        currency: 'IDR',
        status: initialStatus,
        seat_info: seatInfo,
        face_value: parseInt(faceValue, 10),
        pricing: listing.pricing,
        quantity: qty,
        total_quantity: qty,
        available_quantity: qty,
        sold_quantity: 0,
        reserved_quantity: 0,
        fulfillment_type: normalizedFulfillment,
        pic_assistance_status: resolvedPicStatus,
        seat_type: normalizedSeatType,
        expires_at: null,
        metadata: {
          evidence_bundle_id: evidenceBundleId || null,
          seller_notes: sellerNotes || null,
          user_created_event: isUserCreatedEvent,
          quantity: qty,
          total_quantity: qty,
          available_quantity: qty,
          sold_quantity: 0,
          reserved_quantity: 0,
          fulfillment_type: normalizedFulfillment,
          pic_assistance_status: resolvedPicStatus,
          seat_type: normalizedSeatType
        }
      });
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw repoErr;
      }
    }

    // 6. Audit log
    await recordAuditLog('LISTING', listingId, 'SUBMITTED_FOR_VERIFICATION', sellerId, {
      ticket_id: ticketId,
      event_id: eventId,
      price: parseInt(price),
      quantity: qty,
      fulfillment_type: normalizedFulfillment,
      barcode_hash: barcodeHash,
      canonical_delegation: true
    });

    return { ticket, listing };
  }

  /**
   * Admin/System verifies listing
   */
  static async verifyListing(listingId, officerId, { approved, reason }) {
    let listing = (state.listings || []).find(l => l.id === listingId);
    let marketplaceRepo = null;
    try {
      const { getMarketplaceRepository } = require('../storage');
      marketplaceRepo = getMarketplaceRepository();
    } catch (_) {}

    if (!listing && marketplaceRepo && typeof marketplaceRepo.getListingById === 'function') {
      const dbListing = await marketplaceRepo.getListingById(listingId).catch(() => null);
      if (dbListing) {
        let meta = dbListing.metadata || {};
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (_) { meta = {}; }
        }
        listing = {
          id: dbListing.id,
          listing_id: dbListing.id,
          ticket_id: dbListing.ticket_id,
          seller_id: dbListing.seller_id,
          event_id: dbListing.canonical_event_id || dbListing.event_id,
          face_value: dbListing.face_value || 0,
          price: dbListing.price || 0,
          seat_info: dbListing.seat_info || meta.seat_info || 'N/A',
          quantity: dbListing.quantity || meta.quantity || 1,
          total_quantity: dbListing.total_quantity || meta.total_quantity || 1,
          available_quantity: dbListing.available_quantity !== undefined ? dbListing.available_quantity : (meta.available_quantity !== undefined ? meta.available_quantity : 1),
          status: dbListing.status,
          created_at: dbListing.created_at,
          metadata: meta
        };
        state.listings.push(listing);
      }
    }

    if (!listing) {
      const err = new Error('Listing not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Security Gate: Sellers cannot approve their own listings
    if (officerId && officerId === listing.seller_id) {
      const err = new Error('Sellers cannot approve their own listings');
      err.code = 'CANNOT_APPROVE_OWN_LISTING';
      err.status = 403;
      throw err;
    }

    const { isPrelaunchListingMode } = require('../config/marketplaceMode');
    const isPrelaunch = isPrelaunchListingMode();

    const allowedStatuses = [
      LISTING_STATUS.PENDING_VERIFICATION,
      'SUBMITTED',
      'PENDING_REVIEW',
      'PENDING',
      LISTING_STATUS.NEEDS_CORRECTION,
      LISTING_STATUS.DRAFT,
      LISTING_STATUS.APPROVED_PRELAUNCH
    ];
    if (!allowedStatuses.includes(listing.status)) {
      if (approved && (listing.status === LISTING_STATUS.ACTIVE || listing.status === LISTING_STATUS.APPROVED_PRELAUNCH)) {
        // Idempotent approval
        return { success: true, status: listing.status, listing };
      }
      const err = new Error(`Listing cannot be verified from status ${listing.status}`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    let ticket = (state.tickets || []).find(t => t.id === listing.ticket_id);
    if (!ticket && marketplaceRepo && typeof marketplaceRepo.getTicketById === 'function') {
      const dbTicket = await marketplaceRepo.getTicketById(listing.ticket_id).catch(() => null);
      if (dbTicket) {
        ticket = {
          id: dbTicket.id,
          ticket_id: dbTicket.id,
          seller_id: dbTicket.seller_id,
          event_id: dbTicket.canonical_event_id,
          status: dbTicket.status
        };
        state.tickets.push(ticket);
      }
    }

    if (approved) {
      // In PRELAUNCH_LISTING_ONLY mode: approved listings transition to APPROVED_PRELAUNCH (not live ACTIVE)
      const targetStatus = isPrelaunch ? LISTING_STATUS.APPROVED_PRELAUNCH : LISTING_STATUS.ACTIVE;
      listing.status = targetStatus;
      listing.is_prelaunch = isPrelaunch;
      listing.is_purchasable = !isPrelaunch;
      if (ticket) ticket.status = targetStatus;

      try {
        if (marketplaceRepo && typeof marketplaceRepo.updateListingStatus === 'function') {
          await marketplaceRepo.updateListingStatus(listingId, targetStatus);
          if (ticket) {
            await marketplaceRepo.updateTicketStatus(ticket.id || ticket.ticket_id, targetStatus);
          }
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw repoErr;
        }
      }

      await recordAuditLog('LISTING', listingId, isPrelaunch ? 'APPROVED_FOR_PRELAUNCH' : 'VERIFIED_AND_ACTIVATED', officerId, {
        ticket_id: listing.ticket_id,
        is_prelaunch: isPrelaunch,
        status: targetStatus
      });

      try {
        const { demandCapture } = require('../discovery/DemandCaptureService');
        demandCapture.enqueueListingActivatedAlert(listing);
      } catch (_) {}

      return { success: true, status: targetStatus, listing };
    } else {
      if (!reason) {
        const err = new Error('Rejection reason is required');
        err.code = 'REASON_REQUIRED';
        throw err;
      }
      listing.status = LISTING_STATUS.REJECTED;
      listing.rejection_reason = reason;
      if (ticket) ticket.status = 'REJECTED';

      try {
        if (marketplaceRepo && typeof marketplaceRepo.updateListingStatus === 'function') {
          await marketplaceRepo.updateListingStatus(listingId, LISTING_STATUS.REJECTED);
          if (ticket) {
            await marketplaceRepo.updateTicketStatus(ticket.id || ticket.ticket_id, 'REJECTED');
          }
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw repoErr;
        }
      }

      await recordAuditLog('LISTING', listingId, 'REJECTED', officerId, {
        ticket_id: listing.ticket_id,
        reason
      });

      return { success: true, status: LISTING_STATUS.REJECTED, listing };
    }
  }

  /**
   * Request corrections from seller (NEEDS_CORRECTION)
   */
  static async requestListingCorrection(listingId, officerId, { reason }) {
    if (!reason) {
      const err = new Error('Alasan perbaikan harus dicantumkan');
      err.code = 'REASON_REQUIRED';
      throw err;
    }

    let listing = (state.listings || []).find(l => l.id === listingId);
    let marketplaceRepo = null;
    try {
      const { getMarketplaceRepository } = require('../storage');
      marketplaceRepo = getMarketplaceRepository();
    } catch (_) {}

    if (!listing && marketplaceRepo) {
      listing = await marketplaceRepo.getListingById(listingId).catch(() => null);
      if (listing) state.listings.push(listing);
    }

    if (!listing) {
      const err = new Error('Listing tidak ditemukan');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Security Gate: Sellers cannot moderate own listings
    if (officerId && officerId === listing.seller_id) {
      const err = new Error('Sellers cannot moderate their own listings');
      err.code = 'CANNOT_APPROVE_OWN_LISTING';
      err.status = 403;
      throw err;
    }

    listing.status = LISTING_STATUS.NEEDS_CORRECTION;
    listing.correction_reason = reason;
    listing.rejection_reason = reason;
    listing.updated_at = new Date().toISOString();

    const ticket = (state.tickets || []).find(t => t.id === listing.ticket_id);
    if (ticket) ticket.status = 'NEEDS_CORRECTION';

    try {
      if (marketplaceRepo && typeof marketplaceRepo.updateListingStatus === 'function') {
        await marketplaceRepo.updateListingStatus(listingId, LISTING_STATUS.NEEDS_CORRECTION);
        if (ticket) await marketplaceRepo.updateTicketStatus(ticket.id || ticket.ticket_id, 'NEEDS_CORRECTION');
      }
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw repoErr;
    }

    await recordAuditLog('LISTING', listingId, 'CORRECTION_REQUESTED', officerId, {
      ticket_id: listing.ticket_id,
      reason
    });

    return { success: true, status: LISTING_STATUS.NEEDS_CORRECTION, listing };
  }

  /**
   * Withdraw listing (seller or admin)
   */
  static async withdrawListing(listingId, actorId, { reason = 'Withdrawn' } = {}) {
    let listing = (state.listings || []).find(l => l.id === listingId);
    let marketplaceRepo = null;
    try {
      const { getMarketplaceRepository } = require('../storage');
      marketplaceRepo = getMarketplaceRepository();
    } catch (_) {}

    if (!listing && marketplaceRepo) {
      listing = await marketplaceRepo.getListingById(listingId).catch(() => null);
      if (listing) state.listings.push(listing);
    }

    if (!listing) {
      const err = new Error('Listing tidak ditemukan');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Ownership check: actor must be the seller or an authorized admin
    const isOwner = String(listing.seller_id) === String(actorId);
    let actorUser = (state.users || []).find(u => u.id === actorId);
    if (!actorUser) {
      try {
        const { getUserRepository } = require('../storage');
        actorUser = await getUserRepository().getUserById(actorId);
      } catch (_) {}
    }
    const isAdmin = actorUser && ['ADMIN', 'SUPERADMIN', 'CURATOR', 'TRUST_OFFICER', 'VERIFICATION_OFFICER'].includes((actorUser.role || '').toUpperCase());

    if (!isOwner && !isAdmin) {
      const err = new Error('Forbidden: Anda tidak dapat menarik listing milik penjual lain');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    if (['RESERVED', 'SOLD', 'SETTLED', 'COMPLETED'].includes(listing.status)) {
      const err = new Error(`Listing berstatus '${listing.status}' tidak dapat ditarik karena terikat transaksi aktif`);
      err.code = 'LISTING_LOCKED_BY_ORDER';
      err.status = 409;
      throw err;
    }

    listing.status = LISTING_STATUS.WITHDRAWN;
    listing.updated_at = new Date().toISOString();
    listing.rejection_reason = reason;

    const ticket = (state.tickets || []).find(t => t.id === listing.ticket_id);
    if (ticket) ticket.status = 'WITHDRAWN';

    try {
      if (marketplaceRepo && typeof marketplaceRepo.updateListingStatus === 'function') {
        await marketplaceRepo.updateListingStatus(listingId, LISTING_STATUS.WITHDRAWN);
        if (ticket) await marketplaceRepo.updateTicketStatus(ticket.id || ticket.ticket_id, 'WITHDRAWN');
      }
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw repoErr;
    }

    await recordAuditLog('LISTING', listingId, 'WITHDRAWN', actorId, { reason });
    return { success: true, status: LISTING_STATUS.WITHDRAWN, listing };
  }

  /**
   * Update listing (draft edits, correcting rejected/needs_correction submissions, resubmission)
   * Enforces strict seller ownership
   */
  static async updateListing({ listingId, sellerId, updates = {}, isSubmit = false }) {
    let listing = (state.listings || []).find(l => l.id === listingId);
    let marketplaceRepo = null;
    try {
      const { getMarketplaceRepository } = require('../storage');
      marketplaceRepo = getMarketplaceRepository();
    } catch (_) {}

    if (!listing && marketplaceRepo) {
      listing = await marketplaceRepo.getListingById(listingId).catch(() => null);
      if (listing) state.listings.push(listing);
    }

    if (!listing) {
      const err = new Error('Listing tidak ditemukan');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // Ownership check: seller must own listing
    if (String(listing.seller_id) !== String(sellerId)) {
      const err = new Error('Forbidden: Anda tidak dapat mengubah listing milik penjual lain');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    // Transaction lock check
    if (['RESERVED', 'SOLD', 'SETTLED', 'COMPLETED'].includes(listing.status)) {
      const err = new Error(`Listing berstatus '${listing.status}' tidak dapat diubah karena terikat transaksi`);
      err.code = 'LISTING_LOCKED_BY_ORDER';
      err.status = 409;
      throw err;
    }

    // Apply updates
    if (updates.price !== undefined) listing.price = parseInt(updates.price, 10);
    if (updates.faceValue !== undefined || updates.face_value !== undefined) {
      listing.face_value = parseInt(updates.faceValue || updates.face_value, 10);
    }
    if (updates.seatInfo !== undefined || updates.seat_info !== undefined) {
      listing.seat_info = updates.seatInfo || updates.seat_info;
    }
    if (updates.quantity !== undefined || updates.total_quantity !== undefined) {
      const qty = Math.min(4, Math.max(1, parseInt(updates.quantity || updates.total_quantity, 10)));
      listing.quantity = qty;
      listing.total_quantity = qty;
      listing.available_quantity = qty;
    }
    if (updates.fulfillmentType || updates.fulfillment_type) {
      listing.fulfillment_type = (updates.fulfillmentType || updates.fulfillment_type) === 'TIKUM_VENUE_PIC' ? 'TIKUM_VENUE_PIC' : 'SELLER_MANAGED';
    }
    if (updates.sellerNotes !== undefined || updates.seller_notes !== undefined) {
      listing.seller_notes = updates.sellerNotes || updates.seller_notes;
    }
    if (updates.evidenceBundleId) {
      listing.evidence_bundle_id = updates.evidenceBundleId;
    }

    const oldStatus = listing.status;
    if (isSubmit || updates.action === 'SUBMIT') {
      listing.status = LISTING_STATUS.PENDING_VERIFICATION;
      listing.rejection_reason = null;
      listing.correction_reason = null;
    }
    listing.updated_at = new Date().toISOString();

    if (marketplaceRepo && typeof marketplaceRepo.updateListingStatus === 'function') {
      await marketplaceRepo.updateListingStatus(listingId, listing.status).catch(() => null);
    }

    await recordAuditLog('LISTING', listingId, (isSubmit || updates.action === 'SUBMIT') ? 'RESUBMITTED_FOR_VERIFICATION' : 'DRAFT_UPDATED', sellerId, {
      old_status: oldStatus,
      new_status: listing.status,
      price: listing.price,
      quantity: listing.quantity
    });

    return { success: true, listing };
  }

  /**
   * Get all active marketplace listings with event details
   */
  static getActiveListings(eventId = null, now = new Date()) {
    const { isPrelaunchListingMode } = require('../config/marketplaceMode');
    const isPrelaunch = isPrelaunchListingMode();
    const currentMs = (now instanceof Date ? now : new Date(now)).getTime();
    return state.listings
      .filter(l => {
        if (isPrelaunch) {
          if (l.status !== LISTING_STATUS.APPROVED_PRELAUNCH && l.status !== LISTING_STATUS.ACTIVE) return false;
        } else {
          if (l.status !== LISTING_STATUS.ACTIVE) return false;
        }
        if (eventId && l.event_id !== eventId) return false;
        const event = state.events.find(e => e.id === l.event_id);
        if (!event) return false;

        const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('../discovery/EventTemporalLifecycleEngine');
        let endMs = NaN;
        try {
          const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
          if (temporal && temporal.event_end_at) {
            endMs = new Date(temporal.event_end_at).getTime();
          }
        } catch (_) {
          endMs = NaN;
        }
        const evStatus = (event.status || '').toUpperCase();
        const evLifecycle = (event.lifecycle_status || '').toUpperCase();
        if (!event.is_verified || (event.verification_status !== 'VERIFIED' && event.verification_status !== 'PRIMARY_SOURCE_VERIFIED')) {
          // Zero-trust seed data: unverified seed/legacy events must NEVER have active listings
          // Epic 3.6: community user-created events are only viewable when explicitly queried by eventId
          if (!eventId || event.source !== 'USER_CREATED') {
            return false;
          }
        }

        // Universal Lifecycle Gate: Exclude concluded, expired, archived, cancelled, or invalid-date events
        if (isNaN(endMs) || endMs <= currentMs || [
          LIFECYCLE_STATUS.COMPLETED,
          LIFECYCLE_STATUS.ARCHIVED,
          LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS,
          LIFECYCLE_STATUS.CANCELLED,
          'EXPIRED',
          'DIBATALKAN'
        ].includes(evLifecycle) || [
          LIFECYCLE_STATUS.COMPLETED,
          LIFECYCLE_STATUS.ARCHIVED,
          LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS,
          LIFECYCLE_STATUS.CANCELLED,
          'EXPIRED',
          'DIBATALKAN'
        ].includes(evStatus)) {
          return false;
        }

        return true;
      })
      .map(listing => {
        const event = state.events.find(e => e.id === listing.event_id) || {};
        const venue = state.venues.find(v => v.id === event.venue_id) || {};
        const seller = state.users.find(u => u.id === listing.seller_id) || {};
        const isUserCreatedEvent = event.source === 'USER_CREATED';
        const isEventUnverified = !event.is_verified;
        const picAssign = state.event_pics?.find(ep => ep.event_id === listing.event_id && ep.status === 'ACTIVE');
        const category = listing.category || (listing.seat_info ? listing.seat_info.split(/[-–,]/)[0].trim() : 'GENERAL');

        const meta = (typeof listing.metadata === 'object' && listing.metadata) ? listing.metadata : {};
        const totalQty = parseInt(listing.total_quantity || meta.total_quantity || listing.quantity || 1, 10);
        const availQty = parseInt(listing.available_quantity !== undefined ? listing.available_quantity : (meta.available_quantity !== undefined ? meta.available_quantity : totalQty), 10);
        const soldQty = parseInt(listing.sold_quantity !== undefined ? listing.sold_quantity : (meta.sold_quantity || 0), 10);
        const fType = listing.fulfillment_type || meta.fulfillment_type || 'SELLER_MANAGED';
        const pStatus = listing.pic_assistance_status || meta.pic_assistance_status || (picAssign ? 'CONFIRMED' : (fType === 'TIKUM_VENUE_PIC' ? 'REQUESTED_PENDING_ASSIGNMENT' : 'NONE'));
        const sType = listing.seat_type || meta.seat_type || 'GENERAL_ADMISSION';

        return {
          id: listing.id,
          listing_id: listing.id,
          ticket_id: listing.ticket_id,
          status: listing.status,
          seat_info: listing.seat_info,
          seat_type: sType,
          ticket_category: category,
          face_value: listing.face_value,
          price: listing.price,
          quantity: totalQty,
          total_quantity: totalQty,
          available_quantity: availQty,
          sold_quantity: soldQty,
          fulfillment_type: fType,
          pic_assistance_status: pStatus,
          seller_asking_price: listing.price,
          seller_notes: listing.seller_notes || null,
          verification_status: listing.status === 'APPROVED_PRELAUNCH' ? 'APPROVED_PRELAUNCH' : (listing.status === 'ACTIVE' ? 'VERIFIED' : listing.status),
          is_prelaunch: isPrelaunch,
          is_purchasable: !isPrelaunch && listing.status === 'ACTIVE',
          purchase_disabled_reason: isPrelaunch ? 'TIKUM belum membuka transaksi. Anda dapat mengajukan listing, tetapi pembelian dan pembayaran belum tersedia.' : null,
          pic_available: !!picAssign,
          pic_support_available: !!picAssign,
          pic_contact: null, // PII protected: disclosed only to authenticated buyers on confirmed orders
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

