const { v4: uuidv4 } = require('uuid');
const { state, recordOfferAuditLog } = require('../database');
const { LISTING_STATUS } = require('./listingService');
const { EscrowService } = require('./escrowService');
const { emailService } = require('./emailService');

const OFFER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
  SUPERSEDED: 'SUPERSEDED',
  COUNTERED: 'COUNTERED',
  NEGOTIATION_LIMIT_REACHED: 'NEGOTIATION_LIMIT_REACHED'
};

const NEGOTIATION_MAX_PROPOSALS = 5;

const NEGOTIATION_STATUS = {
  ACTIVE: 'ACTIVE',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED_BY_BUYER: 'CANCELLED_BY_BUYER',
  NEGOTIATION_LIMIT_REACHED: 'NEGOTIATION_LIMIT_REACHED'
};

const DECLINE_REASONS = {
  PRICE_TOO_LOW: { code: 'PRICE_TOO_LOW', label: 'Harga terlalu rendah' },
  CHANGED_MIND_NOT_SELLING: { code: 'CHANGED_MIND_NOT_SELLING', label: 'Berubah pikiran / tidak jadi jual' },
  PREFER_ANOTHER_BUYER: { code: 'PREFER_ANOTHER_BUYER', label: 'Memilih pembeli lain' },
  LISTING_WILL_BE_UPDATED: { code: 'LISTING_WILL_BE_UPDATED', label: 'Listing akan diperbarui / diedit' },
  OTHER: { code: 'OTHER', label: 'Lainnya' }
};

// Async mutex per listing to prevent race conditions on concurrent accepts
class ListingMutex {
  constructor() {
    this.locks = new Map();
  }

  async acquire(listingId) {
    while (this.locks.has(listingId)) {
      await this.locks.get(listingId);
    }
    let release;
    const promise = new Promise(resolve => {
      release = resolve;
    });
    this.locks.set(listingId, promise);
    return () => {
      this.locks.delete(listingId);
      release();
    };
  }
}

const listingMutex = new ListingMutex();

function maskName(name) {
  if (!name) return 'Pembeli Terverifikasi';
  const parts = name.trim().split(/\s+/);
  return parts.map(p => {
    if (p.length <= 1) return p;
    return p[0] + '*'.repeat(p.length - 1);
  }).join(' ');
}

class OfferService {
  /**
   * Helper to resolve or create a negotiation session
   */
  static getOrCreateNegotiation({ listingId, buyerId, sellerId, listingPrice, eventId, ticketId }) {
    if (!state.negotiations) state.negotiations = [];
    let neg = state.negotiations.find(n => n.listing_id === listingId && n.buyer_id === buyerId && n.status !== NEGOTIATION_STATUS.ACCEPTED);
    if (!neg) {
      neg = {
        id: `neg-${listingId}-${buyerId}`,
        listing_id: listingId,
        ticket_id: ticketId,
        event_id: eventId,
        buyer_id: buyerId,
        seller_id: sellerId,
        listing_price: listingPrice,
        proposal_count: 0,
        max_proposals: NEGOTIATION_MAX_PROPOSALS,
        status: NEGOTIATION_STATUS.ACTIVE,
        current_amount: null,
        current_turn: 'BUYER',
        active_offer_id: null,
        proposals: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.negotiations.push(neg);
    }
    return neg;
  }

  /**
   * Submit a structured offer on an active listing
   */
  static async createOffer({ buyerId, listingId, offerAmount, ipAddress = '127.0.0.1', message = null, note = null }) {
    // 1. Strict anti-chat enforcement: Reject free-text messages/notes
    if ((message && typeof message === 'string' && message.trim().length > 0) ||
        (note && typeof note === 'string' && note.trim().length > 0)) {
      const err = new Error('Tikum strictly prohibits free-text chat or messages in offers. Only structured offers are supported.');
      err.code = 'FREE_TEXT_NOT_ALLOWED';
      err.statusCode = 400;
      throw err;
    }

    // 2. Validate buyer
    const buyer = state.users.find(u => u.id === buyerId);
    if (!buyer) {
      const err = new Error('Buyer not found');
      err.code = 'BUYER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 3. Validate listing
    const listing = state.listings.find(l => l.id === listingId);
    if (!listing) {
      const err = new Error('Listing not found');
      err.code = 'LISTING_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (listing.status !== LISTING_STATUS.ACTIVE) {
      const err = new Error(`Listing is not active (current status: ${listing.status})`);
      err.code = 'LISTING_NOT_ACTIVE';
      err.statusCode = 400;
      throw err;
    }

    // 4. Seller cannot offer on own listing
    if (listing.seller_id === buyerId) {
      const err = new Error('Seller cannot make an offer on their own listing');
      err.code = 'SELF_OFFER_NOT_ALLOWED';
      err.statusCode = 400;
      throw err;
    }

    // 5. Amount validation
    const parsedAmount = parseInt(offerAmount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      const err = new Error('Offer amount must be a positive integer');
      err.code = 'INVALID_OFFER_AMOUNT';
      err.statusCode = 400;
      throw err;
    }

    const minAllowed = Math.round(listing.price * 0.5);
    if (parsedAmount < minAllowed) {
      const err = new Error(`Offer amount (Rp ${parsedAmount.toLocaleString('id-ID')}) is below the minimum allowed 50% threshold (Rp ${minAllowed.toLocaleString('id-ID')})`);
      err.code = 'OFFER_BELOW_MINIMUM';
      err.statusCode = 400;
      throw err;
    }

    if (parsedAmount >= listing.price) {
      const err = new Error(`Offer amount (Rp ${parsedAmount.toLocaleString('id-ID')}) must be strictly less than listing price (Rp ${listing.price.toLocaleString('id-ID')}). Use direct buy for full price.`);
      err.code = 'OFFER_EXCEEDS_LISTING_PRICE';
      err.statusCode = 400;
      throw err;
    }

    // Acquire atomic mutex on listing to prevent race conditions exceeding 5 proposals
    const releaseLock = await listingMutex.acquire(listingId);
    try {
      const now = Date.now();

      // Negotiation engine check
      const negotiation = OfferService.getOrCreateNegotiation({
        listingId,
        buyerId,
        sellerId: listing.seller_id,
        listingPrice: listing.price,
        eventId: listing.event_id,
        ticketId: listing.ticket_id
      });

      if (negotiation.status === NEGOTIATION_STATUS.ACCEPTED) {
        const err = new Error('Negosiasi telah disepakati (ACCEPTED).');
        err.code = 'NEGOTIATION_ALREADY_ACCEPTED';
        err.statusCode = 400;
        throw err;
      }

      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS || negotiation.status === NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED) {
        const err = new Error('Batas tawar-menawar tercapai (5/5). Negosiasi untuk listing ini sudah berakhir.');
        err.code = 'NEGOTIATION_LIMIT_REACHED';
        err.statusCode = 400;
        throw err;
      }

      // 6. Anti-Spam: Rule A - Max 1 pending offer per buyer per listing
      const existingListingOffer = state.offers.find(o => 
        o.listing_id === listingId && 
        o.buyer_id === buyerId && 
        o.status === OFFER_STATUS.PENDING
      );
      if (existingListingOffer) {
        const err = new Error('You already have an active pending offer on this listing');
        err.code = 'ACTIVE_OFFER_EXISTS';
        err.statusCode = 409;
        throw err;
      }

      // 7. Anti-Spam: Rule B - Max 5 active pending offers across entire platform
      const activeBuyerOffers = state.offers.filter(o => 
        o.buyer_id === buyerId && 
        o.status === OFFER_STATUS.PENDING
      );
      if (activeBuyerOffers.length >= 5) {
        const err = new Error('Maximum active pending offers (5) reached. Withdraw or wait for responses before making new offers.');
        err.code = 'MAX_PENDING_OFFERS_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }

      // 8. Anti-Spam: Rule C - Max 10 new offers per 24 hours
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const offersIn24h = state.offers.filter(o => 
        o.buyer_id === buyerId && 
        new Date(o.created_at).getTime() >= oneDayAgo
      );
      if (offersIn24h.length >= 10) {
        const err = new Error('Daily offer submission limit (10 offers / 24 hours) exceeded. Please try again later.');
        err.code = 'DAILY_OFFER_LIMIT_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }

      // 9. Anti-Spam: Rule D - 6-hour cooldown after rejection on this listing
      const sixHoursAgo = now - 6 * 60 * 60 * 1000;
      const recentDeclined = state.offers
        .filter(o => 
          o.listing_id === listingId && 
          o.buyer_id === buyerId && 
          o.status === OFFER_STATUS.DECLINED &&
          new Date(o.decided_at || o.created_at).getTime() >= sixHoursAgo
        )
        .sort((a, b) => new Date(b.decided_at || b.created_at) - new Date(a.decided_at || a.created_at))[0];

      if (recentDeclined) {
        const remainingMinutes = Math.ceil((sixHoursAgo + 6 * 60 * 60 * 1000 - now) / 60000);
        const err = new Error(`Your previous offer was declined. A 6-hour cooldown applies on this listing before re-offering.`);
        err.code = 'COOLDOWN_ACTIVE';
        err.statusCode = 429;
        err.remainingCooldownMinutes = remainingMinutes;
        throw err;
      }

      // Increment negotiation proposal count atomically
      negotiation.proposal_count += 1;
      const seq = negotiation.proposal_count;
      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS) {
        negotiation.status = NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED;
      }
      negotiation.current_amount = parsedAmount;
      negotiation.current_turn = 'SELLER';
      negotiation.updated_at = new Date(now).toISOString();

      // 10. Create Offer Record
      const offerId = `ofr-${uuidv4()}`;
      negotiation.active_offer_id = offerId;
      const ttlHours = parseInt(process.env.ARGUS_OFFER_TTL_HOURS || '24', 10);
      const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString();

      const offer = {
        id: offerId,
        listing_id: listingId,
        ticket_id: listing.ticket_id,
        event_id: listing.event_id,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        original_price: listing.price,
        offer_amount: parsedAmount,
        status: OFFER_STATUS.PENDING,
        decline_reason: null,
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
        decided_at: null,
        withdrawn_at: null,
        superseded_at: null,
        sequence_number: seq,
        proposal_count: negotiation.proposal_count,
        max_proposals: NEGOTIATION_MAX_PROPOSALS,
        negotiation_id: negotiation.id,
        negotiation_status: negotiation.status,
        ui_counter_text: `Tawaran ${seq}/${NEGOTIATION_MAX_PROPOSALS}`,
        ui_limit_text: negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS
          ? `Batas tawar-menawar tercapai (${NEGOTIATION_MAX_PROPOSALS}/${NEGOTIATION_MAX_PROPOSALS}). Negosiasi untuk listing ini sudah berakhir.`
          : null
      };

      state.offers.push(offer);

      negotiation.proposals.push({
        proposal_id: offerId,
        sequence_number: seq,
        actor_id: buyerId,
        actorRole: 'BUYER',
        type: 'OFFER',
        amount: parsedAmount,
        status: OFFER_STATUS.PENDING,
        created_at: new Date(now).toISOString()
      });

      // 11. Immutable Audit Log
      await recordOfferAuditLog({
        offerId,
        actorId: buyerId,
        actorRole: 'BUYER',
        fromStatus: null,
        toStatus: OFFER_STATUS.PENDING,
        ipAddress,
        metadata: {
          listing_id: listingId,
          original_price: listing.price,
          offer_amount: parsedAmount,
          expires_at: expiresAt,
          sequence_number: seq,
          proposal_count: negotiation.proposal_count,
          negotiation_id: negotiation.id,
          negotiation_status: negotiation.status
        }
      });

      // 12. Notify Seller
      const event = state.events.find(e => e.id === listing.event_id);
      const ticket = state.tickets.find(t => t.id === listing.ticket_id);
      const eventTitle = event ? event.title : 'Event';
      const seatInfo = ticket ? ticket.seat_info : '';

      state.notifications.push({
        id: `notif-${uuidv4()}`,
        user_id: listing.seller_id,
        title: 'Tawaran Baru Diterima',
        message: `Ada tawaran baru (${offer.ui_counter_text}) Rp ${parsedAmount.toLocaleString('id-ID')} untuk tiket ${eventTitle} (${seatInfo}).`,
        type: 'OFFER_RECEIVED',
        metadata: { offer_id: offerId, listing_id: listingId, sequence_number: seq },
        is_read: false,
        created_at: new Date().toISOString()
      });

      // Non-blocking secondary effect: Offer received email
      const seller = state.users.find(u => u.id === listing.seller_id);
      emailService.sendOfferReceivedEmail({ offer, seller, listing, event }).catch(err => {
        console.warn('[OfferService:OfferReceivedEmail] Secondary effect error:', err.message);
      });

      return offer;
    } finally {
      releaseLock();
    }
  }

  /**
   * Seller accepts a structured offer
   * Enforces atomic mutex lock to prevent race conditions and double-sells
   */
  static async acceptOffer({ offerId, sellerId, ipAddress = '127.0.0.1' }) {
    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error('Offer not found');
      err.code = 'OFFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (offer.seller_id !== sellerId) {
      const err = new Error('Forbidden: Only the seller of this listing can accept the offer');
      err.code = 'UNAUTHORIZED_ACTION';
      err.statusCode = 403;
      throw err;
    }

    // Acquire lock on listing
    const releaseLock = await listingMutex.acquire(offer.listing_id);
    try {
      const listing = state.listings.find(l => l.id === offer.listing_id);
      if (!listing) {
        const err = new Error('Listing not found');
        err.code = 'LISTING_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if (listing.status !== LISTING_STATUS.ACTIVE) {
        const err = new Error(`Cannot accept offer: listing is no longer active (status: ${listing.status})`);
        err.code = 'LISTING_NOT_ACTIVE';
        err.statusCode = 409;
        throw err;
      }

      if (offer.status === OFFER_STATUS.SUPERSEDED) {
        const err = new Error('Cannot accept offer: offer has been superseded by another transaction');
        err.code = 'OFFER_SUPERSEDED';
        err.statusCode = 409;
        throw err;
      }

      if (offer.status !== OFFER_STATUS.PENDING) {
        const err = new Error(`Cannot accept offer: status is ${offer.status}`);
        err.code = 'OFFER_NOT_PENDING';
        err.statusCode = 400;
        throw err;
      }

      // Check if offer expired
      if (new Date(offer.expires_at).getTime() <= Date.now()) {
        offer.status = OFFER_STATUS.EXPIRED;
        await recordOfferAuditLog({
          offerId: offer.id,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          fromStatus: OFFER_STATUS.PENDING,
          toStatus: OFFER_STATUS.EXPIRED,
          ipAddress,
          metadata: { reason: 'TTL expired during accept attempt' }
        });
        const err = new Error('Offer has expired');
        err.code = 'OFFER_EXPIRED';
        err.statusCode = 400;
        throw err;
      }

      // 1. Mark offer ACCEPTED
      offer.status = OFFER_STATUS.ACCEPTED;
      offer.decided_at = new Date().toISOString();

      // 1b. Update negotiation status to ACCEPTED
      const negotiation = OfferService.getOrCreateNegotiation({
        listingId: offer.listing_id,
        buyerId: offer.buyer_id,
        sellerId: offer.seller_id,
        listingPrice: listing.price,
        eventId: listing.event_id,
        ticketId: listing.ticket_id
      });
      negotiation.status = NEGOTIATION_STATUS.ACCEPTED;
      negotiation.current_turn = null;
      negotiation.updated_at = new Date().toISOString();

      // 2. Create order with custom negotiated amount (2-hour payment deadline)
      const { order, escrow, pricing } = await EscrowService.createOrder({
        buyerId: offer.buyer_id,
        listingId: offer.listing_id,
        customAmount: offer.offer_amount,
        paymentDeadlineHours: 2
      });

      // 3. Auto-supersede all other pending offers on this listing
      const otherOffers = state.offers.filter(o => 
        o.listing_id === offer.listing_id && 
        o.id !== offer.id && 
        o.status === OFFER_STATUS.PENDING
      );

      for (const other of otherOffers) {
        other.status = OFFER_STATUS.SUPERSEDED;
        other.superseded_at = new Date().toISOString();

        await recordOfferAuditLog({
          offerId: other.id,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          fromStatus: OFFER_STATUS.PENDING,
          toStatus: OFFER_STATUS.SUPERSEDED,
          ipAddress,
          metadata: { winning_offer_id: offer.id }
        });

        // Notify other buyer
        state.notifications.push({
          id: `notif-${uuidv4()}`,
          user_id: other.buyer_id,
          title: 'Tawaran Dibatalkan',
          message: 'Listing telah terjual ke pembeli lain. Tawaran Anda dibatalkan.',
          type: 'OFFER_SUPERSEDED',
          metadata: { offer_id: other.id, listing_id: offer.listing_id },
          is_read: false,
          created_at: new Date().toISOString()
        });
      }

      // 4. Record Audit Log for Accepted Offer
      await recordOfferAuditLog({
        offerId: offer.id,
        actorId: sellerId,
        actorRole: 'SELLER',
        fromStatus: OFFER_STATUS.PENDING,
        toStatus: OFFER_STATUS.ACCEPTED,
        ipAddress,
        metadata: {
          order_id: order.id,
          offer_amount: offer.offer_amount,
          platform_fee: pricing.platformFee,
          total_amount: pricing.totalAmount,
          negotiation_status: negotiation.status
        }
      });

      // 5. Notify Winning Buyer
      state.notifications.push({
        id: `notif-${uuidv4()}`,
        user_id: offer.buyer_id,
        title: 'Tawaran Anda DITERIMA!',
        message: `Tawaran Anda Rp ${offer.offer_amount.toLocaleString('id-ID')} DITERIMA! Silakan bayar dalam 2 jam.`,
        type: 'OFFER_ACCEPTED',
        metadata: { offer_id: offer.id, order_id: order.id, total_amount: pricing.totalAmount },
        is_read: false,
        created_at: new Date().toISOString()
      });

      // Non-blocking secondary effect: Offer accepted email
      const winningBuyer = state.users.find(u => u.id === offer.buyer_id);
      const event = state.events.find(e => e.id === listing.event_id);
      emailService.sendOfferAcceptedEmail({
        offer: { ...offer, price: offer.offer_amount, order_id: order.id },
        buyer: winningBuyer,
        event
      }).catch(err => {
        console.warn('[OfferService:OfferAcceptedEmail] Secondary effect error:', err.message);
      });

      return {
        offer,
        order,
        escrow,
        pricing
      };
    } finally {
      releaseLock();
    }
  }

  /**
   * Seller declines a structured offer with enum reason
   */
  static async declineOffer({ offerId, sellerId, declineReason, ipAddress = '127.0.0.1' }) {
    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error('Offer not found');
      err.code = 'OFFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (offer.seller_id !== sellerId) {
      const err = new Error('Forbidden: Only the seller of this listing can decline the offer');
      err.code = 'UNAUTHORIZED_ACTION';
      err.statusCode = 403;
      throw err;
    }

    if (offer.status !== OFFER_STATUS.PENDING) {
      const err = new Error(`Cannot decline offer: status is ${offer.status}`);
      err.code = 'OFFER_NOT_PENDING';
      err.statusCode = 400;
      throw err;
    }

    // Validate decline reason is strictly within DECLINE_REASONS enum
    if (!declineReason || !DECLINE_REASONS[declineReason]) {
      const validReasons = Object.keys(DECLINE_REASONS).join(', ');
      const err = new Error(`Invalid decline reason. Must be one of enum values: [${validReasons}]. Free-text reasons are not allowed.`);
      err.code = 'INVALID_DECLINE_REASON';
      err.statusCode = 400;
      throw err;
    }

    offer.status = OFFER_STATUS.DECLINED;
    offer.decline_reason = declineReason;
    offer.decided_at = new Date().toISOString();

    const negotiation = state.negotiations ? state.negotiations.find(n => n.listing_id === offer.listing_id && n.buyer_id === offer.buyer_id && n.status !== NEGOTIATION_STATUS.ACCEPTED) : null;
    if (negotiation) {
      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS) {
        negotiation.status = NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED;
      } else {
        negotiation.status = NEGOTIATION_STATUS.REJECTED;
      }
      negotiation.current_turn = null;
      negotiation.updated_at = new Date().toISOString();
      negotiation.proposals.push({
        proposal_id: `prop-${uuidv4()}`,
        sequence_number: negotiation.proposal_count,
        actor_id: sellerId,
        actorRole: 'SELLER',
        type: 'REJECTION',
        amount: offer.offer_amount,
        status: OFFER_STATUS.DECLINED,
        decline_reason: declineReason,
        created_at: new Date().toISOString()
      });
    }

    // Audit Log
    await recordOfferAuditLog({
      offerId: offer.id,
      actorId: sellerId,
      actorRole: 'SELLER',
      fromStatus: OFFER_STATUS.PENDING,
      toStatus: OFFER_STATUS.DECLINED,
      ipAddress,
      metadata: {
        decline_reason: declineReason,
        negotiation_status: negotiation ? negotiation.status : null,
        proposal_count: negotiation ? negotiation.proposal_count : null
      }
    });

    // Notify Buyer
    const reasonLabel = DECLINE_REASONS[declineReason].label;
    state.notifications.push({
      id: `notif-${uuidv4()}`,
      user_id: offer.buyer_id,
      title: 'Tawaran Ditolak',
      message: `Tawaran Anda Rp ${offer.offer_amount.toLocaleString('id-ID')} ditolak. Alasan: ${reasonLabel}`,
      type: 'OFFER_DECLINED',
      metadata: { offer_id: offer.id, decline_reason: declineReason },
      is_read: false,
      created_at: new Date().toISOString()
    });

    // Non-blocking secondary effect: Offer declined email
    const declinedBuyer = state.users.find(u => u.id === offer.buyer_id);
    const declinedListing = state.listings.find(l => l.id === offer.listing_id);
    const declinedEvent = declinedListing ? state.events.find(e => e.id === declinedListing.event_id) : null;
    emailService.sendOfferRejectedEmail({
      offer: { ...offer, price: offer.offer_amount },
      buyer: declinedBuyer,
      event: declinedEvent
    }).catch(err => {
      console.warn('[OfferService:OfferRejectedEmail] Secondary effect error:', err.message);
    });

    return offer;
  }

  /**
   * Seller makes a counter-offer to the buyer's pending offer
   */
  static async counterOffer({ offerId, sellerId, counterAmount, message = null, note = null, ipAddress = '127.0.0.1' }) {
    // 1. Strict anti-chat enforcement: Reject free-text messages/notes
    if ((message && typeof message === 'string' && message.trim().length > 0) ||
        (note && typeof note === 'string' && note.trim().length > 0)) {
      const err = new Error('Tikum strictly prohibits free-text chat or messages in counter-offers. Only structured price counter-offers are supported.');
      err.code = 'FREE_TEXT_NOT_ALLOWED';
      err.statusCode = 400;
      throw err;
    }

    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error('Offer not found');
      err.code = 'OFFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (offer.seller_id !== sellerId) {
      const err = new Error('Forbidden: Only the seller of this listing can make a counter-offer');
      err.code = 'UNAUTHORIZED_ACTION';
      err.statusCode = 403;
      throw err;
    }

    const releaseLock = await listingMutex.acquire(offer.listing_id);
    try {
      const listing = state.listings.find(l => l.id === offer.listing_id);
      if (!listing || listing.status !== LISTING_STATUS.ACTIVE) {
        const err = new Error('Listing is no longer active');
        err.code = 'LISTING_NOT_ACTIVE';
        err.statusCode = 400;
        throw err;
      }

      const negotiation = OfferService.getOrCreateNegotiation({
        listingId: offer.listing_id,
        buyerId: offer.buyer_id,
        sellerId: offer.seller_id,
        listingPrice: listing.price,
        eventId: listing.event_id,
        ticketId: listing.ticket_id
      });

      if (negotiation.status === NEGOTIATION_STATUS.ACCEPTED) {
        const err = new Error('Negosiasi telah disepakati (ACCEPTED).');
        err.code = 'NEGOTIATION_ALREADY_ACCEPTED';
        err.statusCode = 400;
        throw err;
      }

      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS || negotiation.status === NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED) {
        const err = new Error('Batas tawar-menawar tercapai (5/5). Negosiasi untuk listing ini sudah berakhir.');
        err.code = 'NEGOTIATION_LIMIT_REACHED';
        err.statusCode = 400;
        throw err;
      }

      if (offer.status !== OFFER_STATUS.PENDING) {
        const err = new Error(`Cannot counter offer: status is ${offer.status}`);
        err.code = 'OFFER_NOT_PENDING';
        err.statusCode = 400;
        throw err;
      }

      const parsedAmount = parseInt(counterAmount, 10);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        const err = new Error('Counter offer amount must be a valid positive integer');
        err.code = 'INVALID_COUNTER_AMOUNT';
        err.statusCode = 400;
        throw err;
      }

      if (parsedAmount <= offer.offer_amount) {
        const err = new Error(`Counter-offer must be higher than the buyer's original offer (Rp ${offer.offer_amount.toLocaleString('id-ID')})`);
        err.code = 'COUNTER_AMOUNT_TOO_LOW';
        err.statusCode = 400;
        throw err;
      }

      if (parsedAmount > listing.price) {
        const err = new Error(`Counter-offer cannot exceed original listing price (Rp ${listing.price.toLocaleString('id-ID')})`);
        err.code = 'COUNTER_AMOUNT_EXCEEDS_LISTING';
        err.statusCode = 400;
        throw err;
      }

      negotiation.proposal_count += 1;
      const seq = negotiation.proposal_count;
      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS) {
        negotiation.status = NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED;
      }
      negotiation.current_amount = parsedAmount;
      negotiation.current_turn = 'BUYER';
      negotiation.updated_at = new Date().toISOString();

      offer.status = OFFER_STATUS.COUNTERED;
      offer.counter_amount = parsedAmount;
      offer.countered_at = new Date().toISOString();
      offer.sequence_number = seq;
      offer.proposal_count = negotiation.proposal_count;
      offer.max_proposals = NEGOTIATION_MAX_PROPOSALS;
      offer.negotiation_id = negotiation.id;
      offer.negotiation_status = negotiation.status;
      offer.ui_counter_text = `Tawaran ${seq}/${NEGOTIATION_MAX_PROPOSALS}`;
      offer.ui_limit_text = negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS
        ? `Batas tawar-menawar tercapai (${NEGOTIATION_MAX_PROPOSALS}/${NEGOTIATION_MAX_PROPOSALS}). Negosiasi untuk listing ini sudah berakhir.`
        : null;

      negotiation.proposals.push({
        proposal_id: `prop-${uuidv4()}`,
        sequence_number: seq,
        actor_id: sellerId,
        actorRole: 'SELLER',
        type: 'COUNTER_OFFER',
        amount: parsedAmount,
        status: OFFER_STATUS.COUNTERED,
        created_at: new Date().toISOString()
      });

      // Audit Log
      await recordOfferAuditLog({
        offerId: offer.id,
        actorId: sellerId,
        actorRole: 'SELLER',
        fromStatus: OFFER_STATUS.PENDING,
        toStatus: OFFER_STATUS.COUNTERED,
        ipAddress,
        metadata: {
          original_offer_amount: offer.offer_amount,
          counter_amount: parsedAmount,
          sequence_number: seq,
          proposal_count: negotiation.proposal_count,
          negotiation_id: negotiation.id,
          negotiation_status: negotiation.status
        }
      });

      // Notify Buyer
      state.notifications.push({
        id: `notif-${uuidv4()}`,
        user_id: offer.buyer_id,
        title: 'Penjual Mengajukan Penawaran Balik',
        message: `Penjual mengajukan tawaran balik (${offer.ui_counter_text}) Rp ${parsedAmount.toLocaleString('id-ID')} untuk tiket ini.`,
        type: 'OFFER_COUNTERED',
        metadata: { offer_id: offer.id, counter_amount: parsedAmount, sequence_number: seq },
        is_read: false,
        created_at: new Date().toISOString()
      });

      // Non-blocking secondary effect: Counter offer email
      const counterBuyer = state.users.find(u => u.id === offer.buyer_id);
      const counterListing = state.listings.find(l => l.id === offer.listing_id);
      const counterEvent = counterListing ? state.events.find(e => e.id === counterListing.event_id) : null;
      emailService.sendCounterOfferEmail({
        offer,
        buyer: counterBuyer,
        counterPrice: parsedAmount,
        event: counterEvent
      }).catch(err => {
        console.warn('[OfferService:CounterOfferEmail] Secondary effect error:', err.message);
      });

      return offer;
    } finally {
      releaseLock();
    }
  }

  /**
   * Buyer makes a counter-offer to the seller's counter-offer
   */
  static async buyerCounterOffer({ offerId, buyerId, counterAmount, message = null, note = null, ipAddress = '127.0.0.1' }) {
    // 1. Strict anti-chat enforcement: Reject free-text messages/notes
    if ((message && typeof message === 'string' && message.trim().length > 0) ||
        (note && typeof note === 'string' && note.trim().length > 0)) {
      const err = new Error('Tikum strictly prohibits free-text chat or messages in counter-offers. Only structured price counter-offers are supported.');
      err.code = 'FREE_TEXT_NOT_ALLOWED';
      err.statusCode = 400;
      throw err;
    }

    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error('Offer not found');
      err.code = 'OFFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (offer.buyer_id !== buyerId) {
      const err = new Error('Forbidden: Only the buyer can make a counter-offer');
      err.code = 'UNAUTHORIZED_ACTION';
      err.statusCode = 403;
      throw err;
    }

    const releaseLock = await listingMutex.acquire(offer.listing_id);
    try {
      const listing = state.listings.find(l => l.id === offer.listing_id);
      if (!listing || listing.status !== LISTING_STATUS.ACTIVE) {
        const err = new Error('Listing is no longer active');
        err.code = 'LISTING_NOT_ACTIVE';
        err.statusCode = 400;
        throw err;
      }

      const negotiation = OfferService.getOrCreateNegotiation({
        listingId: offer.listing_id,
        buyerId: offer.buyer_id,
        sellerId: offer.seller_id,
        listingPrice: listing.price,
        eventId: listing.event_id,
        ticketId: listing.ticket_id
      });

      if (negotiation.status === NEGOTIATION_STATUS.ACCEPTED) {
        const err = new Error('Negosiasi telah disepakati (ACCEPTED).');
        err.code = 'NEGOTIATION_ALREADY_ACCEPTED';
        err.statusCode = 400;
        throw err;
      }

      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS || negotiation.status === NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED) {
        const err = new Error('Batas tawar-menawar tercapai (5/5). Negosiasi untuk listing ini sudah berakhir.');
        err.code = 'NEGOTIATION_LIMIT_REACHED';
        err.statusCode = 400;
        throw err;
      }

      if (offer.status !== OFFER_STATUS.COUNTERED) {
        const err = new Error(`Cannot counter offer: current status is ${offer.status}. You can only counter when seller made a counter-offer.`);
        err.code = 'OFFER_NOT_COUNTERED';
        err.statusCode = 400;
        throw err;
      }

      const parsedAmount = parseInt(counterAmount, 10);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        const err = new Error('Counter offer amount must be a valid positive integer');
        err.code = 'INVALID_COUNTER_AMOUNT';
        err.statusCode = 400;
        throw err;
      }

      if (parsedAmount <= offer.offer_amount) {
        const err = new Error(`New buyer counter must be higher than previous offer amount (Rp ${offer.offer_amount.toLocaleString('id-ID')})`);
        err.code = 'COUNTER_AMOUNT_TOO_LOW';
        err.statusCode = 400;
        throw err;
      }

      const sellerCounter = offer.counter_amount || listing.price;
      if (parsedAmount >= sellerCounter) {
        const err = new Error(`New buyer counter (Rp ${parsedAmount.toLocaleString('id-ID')}) must be less than seller counter (Rp ${sellerCounter.toLocaleString('id-ID')}). Use accept counter to agree to seller's price.`);
        err.code = 'COUNTER_EXCEEDS_SELLER_PRICE';
        err.statusCode = 400;
        throw err;
      }

      negotiation.proposal_count += 1;
      const seq = negotiation.proposal_count;
      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS) {
        negotiation.status = NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED;
      }
      negotiation.current_amount = parsedAmount;
      negotiation.current_turn = 'SELLER';
      negotiation.updated_at = new Date().toISOString();

      offer.status = OFFER_STATUS.PENDING;
      offer.offer_amount = parsedAmount;
      offer.counter_amount = null;
      offer.sequence_number = seq;
      offer.proposal_count = negotiation.proposal_count;
      offer.max_proposals = NEGOTIATION_MAX_PROPOSALS;
      offer.negotiation_id = negotiation.id;
      offer.negotiation_status = negotiation.status;
      offer.ui_counter_text = `Tawaran ${seq}/${NEGOTIATION_MAX_PROPOSALS}`;
      offer.ui_limit_text = negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS
        ? `Batas tawar-menawar tercapai (${NEGOTIATION_MAX_PROPOSALS}/${NEGOTIATION_MAX_PROPOSALS}). Negosiasi untuk listing ini sudah berakhir.`
        : null;

      negotiation.proposals.push({
        proposal_id: `prop-${uuidv4()}`,
        sequence_number: seq,
        actor_id: buyerId,
        actorRole: 'BUYER',
        type: 'COUNTER_OFFER',
        amount: parsedAmount,
        status: OFFER_STATUS.PENDING,
        created_at: new Date().toISOString()
      });

      await recordOfferAuditLog({
        offerId: offer.id,
        actorId: buyerId,
        actorRole: 'BUYER',
        fromStatus: OFFER_STATUS.COUNTERED,
        toStatus: OFFER_STATUS.PENDING,
        ipAddress,
        metadata: {
          previous_seller_counter: sellerCounter,
          new_buyer_counter: parsedAmount,
          sequence_number: seq,
          proposal_count: negotiation.proposal_count,
          negotiation_id: negotiation.id,
          negotiation_status: negotiation.status
        }
      });

      state.notifications.push({
        id: `notif-${uuidv4()}`,
        user_id: offer.seller_id,
        title: 'Pembeli Mengajukan Tawaran Balik',
        message: `Pembeli mengajukan tawaran balik (${offer.ui_counter_text}) Rp ${parsedAmount.toLocaleString('id-ID')}.`,
        type: 'OFFER_RECEIVED',
        metadata: { offer_id: offer.id, listing_id: offer.listing_id, sequence_number: seq },
        is_read: false,
        created_at: new Date().toISOString()
      });

      return offer;
    } finally {
      releaseLock();
    }
  }

  /**
   * Buyer accepts seller's counter-offer
   */
  static async acceptCounterOffer({ offerId, buyerId, ipAddress = '127.0.0.1' }) {
    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error('Offer not found');
      err.code = 'OFFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (offer.buyer_id !== buyerId) {
      const err = new Error('Forbidden: Only the buyer can accept the counter-offer');
      err.code = 'UNAUTHORIZED_ACTION';
      err.statusCode = 403;
      throw err;
    }

    if (offer.status !== OFFER_STATUS.COUNTERED) {
      const err = new Error(`Cannot accept counter-offer: status is ${offer.status}`);
      err.code = 'OFFER_NOT_COUNTERED';
      err.statusCode = 400;
      throw err;
    }

    const releaseLock = await listingMutex.acquire(offer.listing_id);
    try {
      const listing = state.listings.find(l => l.id === offer.listing_id);
      if (!listing || listing.status !== LISTING_STATUS.ACTIVE) {
        const err = new Error('Listing is no longer active');
        err.code = 'LISTING_NOT_ACTIVE';
        err.statusCode = 409;
        throw err;
      }

      offer.status = OFFER_STATUS.ACCEPTED;
      offer.decided_at = new Date().toISOString();

      const negotiation = OfferService.getOrCreateNegotiation({
        listingId: offer.listing_id,
        buyerId: offer.buyer_id,
        sellerId: offer.seller_id,
        listingPrice: listing.price,
        eventId: listing.event_id,
        ticketId: listing.ticket_id
      });
      negotiation.status = NEGOTIATION_STATUS.ACCEPTED;
      negotiation.current_turn = null;
      negotiation.updated_at = new Date().toISOString();

      const agreedAmount = offer.counter_amount || offer.offer_amount;
      const { order, escrow, pricing } = await EscrowService.createOrder({
        buyerId: offer.buyer_id,
        listingId: offer.listing_id,
        customAmount: agreedAmount,
        paymentDeadlineHours: 2
      });

      // Supersede other pending/countered offers
      const otherOffers = state.offers.filter(o =>
        o.listing_id === offer.listing_id &&
        o.id !== offer.id &&
        (o.status === OFFER_STATUS.PENDING || o.status === OFFER_STATUS.COUNTERED)
      );

      for (const other of otherOffers) {
        other.status = OFFER_STATUS.SUPERSEDED;
        other.superseded_at = new Date().toISOString();
      }

      await recordOfferAuditLog({
        offerId: offer.id,
        actorId: buyerId,
        actorRole: 'BUYER',
        fromStatus: OFFER_STATUS.COUNTERED,
        toStatus: OFFER_STATUS.ACCEPTED,
        ipAddress,
        metadata: {
          order_id: order.id,
          agreed_amount: agreedAmount,
          total_amount: pricing.totalAmount,
          negotiation_status: negotiation.status
        }
      });

      state.notifications.push({
        id: `notif-${uuidv4()}`,
        user_id: offer.seller_id,
        title: 'Tawaran Balik Anda Diterima!',
        message: `Pembeli menerima tawaran balik Rp ${agreedAmount.toLocaleString('id-ID')}. Pesanan sedang menunggu pembayaran.`,
        type: 'COUNTER_OFFER_ACCEPTED',
        metadata: { offer_id: offer.id, order_id: order.id },
        is_read: false,
        created_at: new Date().toISOString()
      });

      return { offer, order, escrow, pricing };
    } finally {
      releaseLock();
    }
  }

  /**
   * Buyer withdraws their own pending offer
   */
  static async withdrawOffer({ offerId, buyerId, ipAddress = '127.0.0.1' }) {
    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error('Offer not found');
      err.code = 'OFFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (offer.buyer_id !== buyerId) {
      const err = new Error('Forbidden: Only the buyer who made the offer can withdraw it');
      err.code = 'UNAUTHORIZED_ACTION';
      err.statusCode = 403;
      throw err;
    }

    if (offer.status !== OFFER_STATUS.PENDING) {
      const err = new Error(`Cannot withdraw offer: status is ${offer.status}`);
      err.code = 'OFFER_NOT_PENDING';
      err.statusCode = 400;
      throw err;
    }

    offer.status = OFFER_STATUS.WITHDRAWN;
    offer.withdrawn_at = new Date().toISOString();

    const negotiation = state.negotiations ? state.negotiations.find(n => n.listing_id === offer.listing_id && n.buyer_id === offer.buyer_id && n.status !== NEGOTIATION_STATUS.ACCEPTED) : null;
    if (negotiation) {
      if (negotiation.proposal_count >= NEGOTIATION_MAX_PROPOSALS) {
        negotiation.status = NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED;
      } else {
        negotiation.status = NEGOTIATION_STATUS.CANCELLED_BY_BUYER;
      }
      negotiation.current_turn = null;
      negotiation.updated_at = new Date().toISOString();
      negotiation.proposals.push({
        proposal_id: `prop-${uuidv4()}`,
        sequence_number: negotiation.proposal_count,
        actor_id: buyerId,
        actorRole: 'BUYER',
        type: 'WITHDRAWAL',
        amount: offer.offer_amount,
        status: OFFER_STATUS.WITHDRAWN,
        created_at: new Date().toISOString()
      });
    }

    // Audit Log
    await recordOfferAuditLog({
      offerId: offer.id,
      actorId: buyerId,
      actorRole: 'BUYER',
      fromStatus: OFFER_STATUS.PENDING,
      toStatus: OFFER_STATUS.WITHDRAWN,
      ipAddress,
      metadata: {
        negotiation_status: negotiation ? negotiation.status : null,
        proposal_count: negotiation ? negotiation.proposal_count : null
      }
    });

    return offer;
  }

  /**
   * Background / scheduled job to expire pending offers whose TTL has elapsed
   */
  static async expirePendingOffers() {
    const now = new Date();
    const expiredList = [];

    const pendingOffers = state.offers.filter(o => 
      o.status === OFFER_STATUS.PENDING && 
      new Date(o.expires_at) <= now
    );

    for (const offer of pendingOffers) {
      offer.status = OFFER_STATUS.EXPIRED;
      expiredList.push(offer);

      await recordOfferAuditLog({
        offerId: offer.id,
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        fromStatus: OFFER_STATUS.PENDING,
        toStatus: OFFER_STATUS.EXPIRED,
        ipAddress: '127.0.0.1',
        metadata: { reason: 'Offer TTL expired' }
      });

      state.notifications.push({
        id: `notif-${uuidv4()}`,
        user_id: offer.buyer_id,
        title: 'Tawaran Kedaluwarsa',
        message: `Tawaran Anda Rp ${offer.offer_amount.toLocaleString('id-ID')} telah kedaluwarsa.`,
        type: 'OFFER_EXPIRED',
        metadata: { offer_id: offer.id, listing_id: offer.listing_id },
        is_read: false,
        created_at: new Date().toISOString()
      });
    }

    return expiredList;
  }

  /**
   * Helper to retrieve negotiation status for a listing
   */
  static getNegotiationStatus({ listingId, buyerId, sellerId }) {
    if (!state.negotiations) return null;
    const neg = state.negotiations.find(n => n.listing_id === listingId && (n.buyer_id === buyerId || (sellerId && n.seller_id === sellerId)));
    if (!neg) return null;
    const listing = state.listings.find(l => l.id === listingId);
    const isLimitReached = neg.proposal_count >= NEGOTIATION_MAX_PROPOSALS || neg.status === NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED;
    return {
      negotiation_id: neg.id,
      listing_id: neg.listing_id,
      buyer_id: neg.buyer_id,
      seller_id: neg.seller_id,
      proposal_count: neg.proposal_count,
      max_proposals: neg.max_proposals || NEGOTIATION_MAX_PROPOSALS,
      status: neg.status,
      current_turn: neg.current_turn,
      current_amount: neg.current_amount,
      listing_price: neg.listing_price || (listing ? listing.price : null),
      can_negotiate: !isLimitReached && neg.status !== NEGOTIATION_STATUS.ACCEPTED,
      is_limit_reached: isLimitReached,
      ui_counter_text: `Tawaran ${neg.proposal_count}/${neg.max_proposals || NEGOTIATION_MAX_PROPOSALS}`,
      ui_limit_text: isLimitReached
        ? `Batas tawar-menawar tercapai (${NEGOTIATION_MAX_PROPOSALS}/${NEGOTIATION_MAX_PROPOSALS}). Negosiasi untuk listing ini sudah berakhir.`
        : null,
      can_direct_buy: listing ? listing.status === LISTING_STATUS.ACTIVE : false,
      proposals: neg.proposals || []
    };
  }

  /**
   * Helper to retrieve negotiation by offerId
   */
  static getNegotiationByOfferId(offerId) {
    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) return null;
    return OfferService.getNegotiationStatus({
      listingId: offer.listing_id,
      buyerId: offer.buyer_id,
      sellerId: offer.seller_id
    });
  }

  /**
   * Retrieve offers for a specific user (either role='buyer' or role='seller')
   * Strips all PII (phone, email, NIK) when viewed by seller or other parties
   */
  static async getUserOffers({ userId, role = 'buyer' }) {
    if (role === 'seller') {
      // Find all listings belonging to seller
      const sellerListingIds = state.listings.filter(l => l.seller_id === userId).map(l => l.id);
      const rawOffers = state.offers.filter(o => sellerListingIds.includes(o.listing_id) || o.seller_id === userId);

      return rawOffers.map(o => {
        const buyer = state.users.find(u => u.id === o.buyer_id);
        const listing = state.listings.find(l => l.id === o.listing_id);
        const event = state.events.find(e => e.id === o.event_id);
        const ticket = state.tickets.find(t => t.id === o.ticket_id);
        const neg = state.negotiations ? state.negotiations.find(n => n.listing_id === o.listing_id && n.buyer_id === o.buyer_id) : null;
        const seq = o.sequence_number || (neg ? neg.proposal_count : 1);
        const count = neg ? neg.proposal_count : (o.proposal_count || seq);
        const limitReached = count >= NEGOTIATION_MAX_PROPOSALS || (neg && neg.status === NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED);

        return {
          id: o.id,
          listing_id: o.listing_id,
          ticket_id: o.ticket_id,
          event_id: o.event_id,
          event_title: event ? event.title : 'Event',
          event_date: event ? event.date : '',
          seat_info: ticket ? ticket.seat_info : '',
          original_price: o.original_price,
          offer_amount: o.offer_amount,
          counter_amount: o.counter_amount,
          status: o.status,
          decline_reason: o.decline_reason,
          decline_reason_label: o.decline_reason && DECLINE_REASONS[o.decline_reason] ? DECLINE_REASONS[o.decline_reason].label : null,
          created_at: o.created_at,
          expires_at: o.expires_at,
          decided_at: o.decided_at,
          withdrawn_at: o.withdrawn_at,
          superseded_at: o.superseded_at,
          sequence_number: seq,
          proposal_count: count,
          max_proposals: NEGOTIATION_MAX_PROPOSALS,
          negotiation_id: neg ? neg.id : (o.negotiation_id || null),
          negotiation_status: neg ? neg.status : (limitReached ? NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED : NEGOTIATION_STATUS.ACTIVE),
          is_limit_reached: limitReached,
          ui_counter_text: `Tawaran ${seq}/${NEGOTIATION_MAX_PROPOSALS}`,
          ui_limit_text: limitReached ? `Batas tawar-menawar tercapai (${NEGOTIATION_MAX_PROPOSALS}/${NEGOTIATION_MAX_PROPOSALS}). Negosiasi untuk listing ini sudah berakhir.` : null,
          can_counter: !limitReached && o.status === OFFER_STATUS.PENDING,
          buyer: {
            id: o.buyer_id,
            masked_name: buyer ? maskName(buyer.name) : 'Pembeli'
          }
        };
      });
    }

    // role === 'buyer'
    const buyerOffers = state.offers.filter(o => o.buyer_id === userId);
    return buyerOffers.map(o => {
      const listing = state.listings.find(l => l.id === o.listing_id);
      const event = state.events.find(e => e.id === o.event_id);
      const ticket = state.tickets.find(t => t.id === o.ticket_id);
      const order = state.orders.find(ord => ord.listing_id === o.listing_id && ord.buyer_id === userId);
      const neg = state.negotiations ? state.negotiations.find(n => n.listing_id === o.listing_id && n.buyer_id === o.buyer_id) : null;
      const seq = o.sequence_number || (neg ? neg.proposal_count : 1);
      const count = neg ? neg.proposal_count : (o.proposal_count || seq);
      const limitReached = count >= NEGOTIATION_MAX_PROPOSALS || (neg && neg.status === NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED);

      return {
        id: o.id,
        listing_id: o.listing_id,
        ticket_id: o.ticket_id,
        event_id: o.event_id,
        event_title: event ? event.title : 'Event',
        event_date: event ? event.date : '',
        seat_info: ticket ? ticket.seat_info : '',
        original_price: o.original_price,
        offer_amount: o.offer_amount,
        counter_amount: o.counter_amount,
        status: o.status,
        decline_reason: o.decline_reason,
        decline_reason_label: o.decline_reason && DECLINE_REASONS[o.decline_reason] ? DECLINE_REASONS[o.decline_reason].label : null,
        created_at: o.created_at,
        expires_at: o.expires_at,
        decided_at: o.decided_at,
        withdrawn_at: o.withdrawn_at,
        superseded_at: o.superseded_at,
        sequence_number: seq,
        proposal_count: count,
        max_proposals: NEGOTIATION_MAX_PROPOSALS,
        negotiation_id: neg ? neg.id : (o.negotiation_id || null),
        negotiation_status: neg ? neg.status : (limitReached ? NEGOTIATION_STATUS.NEGOTIATION_LIMIT_REACHED : NEGOTIATION_STATUS.ACTIVE),
        is_limit_reached: limitReached,
        ui_counter_text: `Tawaran ${seq}/${NEGOTIATION_MAX_PROPOSALS}`,
        ui_limit_text: limitReached ? `Batas tawar-menawar tercapai (${NEGOTIATION_MAX_PROPOSALS}/${NEGOTIATION_MAX_PROPOSALS}). Negosiasi untuk listing ini sudah berakhir.` : null,
        can_counter: !limitReached && o.status === OFFER_STATUS.COUNTERED,
        can_direct_buy: listing ? listing.status === LISTING_STATUS.ACTIVE : false,
        order: order ? {
          id: order.id,
          total_amount: order.total_amount,
          platform_fee: order.platform_fee,
          status: order.status,
          payment_deadline: order.payment_deadline
        } : null
      };
    });
  }

  /**
   * Helper to inspect audit log for an offer
   */
  static getOfferAuditLogs(offerId) {
    return state.offer_audit_logs
      .filter(log => log.offer_id === offerId)
      .map(log => {
        let meta = log.metadata;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch (e) {
            // keep as string
          }
        }
        return {
          ...log,
          metadata: meta
        };
      });
  }
}

module.exports = {
  OfferService,
  OFFER_STATUS,
  DECLINE_REASONS,
  NEGOTIATION_MAX_PROPOSALS,
  NEGOTIATION_STATUS
};
