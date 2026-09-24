const express = require('express');
const router = express.Router();
const { state } = require('../database');
const { OfferService, OFFER_STATUS, DECLINE_REASONS, NEGOTIATION_MAX_PROPOSALS, NEGOTIATION_STATUS } = require('../services/offerService');
const { SessionStore } = require('../services/sessionStore');

// In-memory rate limiting map for negotiation mutations (max 30 requests per minute per user/IP)
const negotiationRateLimitMap = new Map();

function resetNegotiationRateLimits() {
  negotiationRateLimitMap.clear();
}

function checkNegotiationRateLimit(req, res, next) {
  const userId = req.user?.id || req.ip || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 30;

  let record = negotiationRateLimitMap.get(userId);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    negotiationRateLimitMap.set(userId, record);
    return next();
  }

  record.count++;
  if (record.count > maxRequests) {
    return res.status(429).json({
      error: 'Terlalu banyak request negosiasi. Harap tunggu 1 menit sebelum mencoba kembali.',
      code: 'NEGOTIATION_RATE_LIMIT_EXCEEDED'
    });
  }

  next();
}

/**
 * Authentication resolver supporting sessions and test mode headers
 */
function resolveUser(req) {
  const authHeader = req.header ? (req.header('authorization') || req.header('x-session-token')) : null;
  let sessionToken = null;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.substring(7).trim();
    } else {
      sessionToken = authHeader.trim();
    }
  }

  if (sessionToken) {
    const session = SessionStore.findSession(sessionToken) || state.sessions.find(s => s.session_token === sessionToken && new Date(s.expires_at) > new Date() && !s.revoked);
    if (session) {
      const user = state.users.find(u => u.id === session.user_id);
      if (user) {
        req.user = user;
        req.role = user.role;
        return user;
      }
    }
  }

  // Fallback in test mode only for legacy backward-compatibility with test suite
  if (process.env.NODE_ENV === 'test') {
    const headerId = req.header ? req.header('x-user-id') : null;
    if (headerId) {
      const user = state.users.find(u => u.id === headerId);
      if (user) {
        req.user = user;
        req.role = user.role;
        return user;
      }
    }
  }

  req.user = null;
  req.role = null;
  return null;
}

/**
 * Middleware requiring authentication
 */
function requireAuth(req, res, next) {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.',
      code: 'AUTH_REQUIRED'
    });
  }
  next();
}

/**
 * GET /listings/:listingId/negotiation
 * Retrieve current negotiation state for a listing
 */
router.get(['/listings/:listingId/negotiation', '/listings/:id/negotiation'], requireAuth, (req, res) => {
  const listingId = req.params.listingId || req.params.id;
  const currentUserId = req.user.id;
  const negotiation = OfferService.getNegotiationStatus({
    listingId,
    buyerId: currentUserId,
    sellerId: currentUserId
  });

  if (!negotiation) {
    const listing = state.listings.find(l => l.id === listingId);
    return res.status(200).json({
      negotiation_id: null,
      listing_id: listingId,
      proposal_count: 0,
      max_proposals: NEGOTIATION_MAX_PROPOSALS,
      status: 'NEW',
      can_negotiate: true,
      is_limit_reached: false,
      ui_counter_text: `Tawaran 0/${NEGOTIATION_MAX_PROPOSALS}`,
      ui_limit_text: null,
      can_direct_buy: listing ? listing.status === 'ACTIVE' : false,
      proposals: []
    });
  }

  res.status(200).json({
    ...negotiation
  });
});

/**
 * GET /offers/:offerId/negotiation
 * Retrieve negotiation state for an offer
 */
router.get('/offers/:offerId/negotiation', requireAuth, (req, res) => {
  const offerId = req.params.offerId;
  const negotiation = OfferService.getNegotiationByOfferId(offerId);
  if (!negotiation) {
    return res.status(404).json({
      error: 'Negosiasi tidak ditemukan untuk offer ini',
      code: 'NEGOTIATION_NOT_FOUND'
    });
  }

  res.status(200).json({
    ...negotiation
  });
});

/**
 * POST /listings/:listingId/offers
 * Buyer submits a structured price offer
 */
router.post(['/listings/:listingId/offers', '/listings/:id/offers'], requireAuth, async (req, res) => {
  const listingId = req.params.listingId || req.params.id;
  const buyerId = req.user.id;
  const { offer_amount, offerAmount, message, note, chat, text } = req.body;
  const amount = offer_amount !== undefined ? offer_amount : offerAmount;

  try {
    const offer = await OfferService.createOffer({
      buyerId,
      listingId,
      offerAmount: amount,
      ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      message: message || chat || text,
      note
    });

    res.status(201).json({
      success: true,
      offer
    });
  } catch (err) {
    const status = err.statusCode || (err.code === 'ACTIVE_OFFER_EXISTS' ? 409 : 400);
    res.status(status).json({
      error: err.message,
      code: err.code || 'OFFER_CREATION_FAILED',
      remainingCooldownMinutes: err.remainingCooldownMinutes || null
    });
  }
});

/**
 * GET /offers/mine
 * Retrieve offers for authenticated user (role='buyer' or role='seller')
 */
router.get('/offers/mine', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';

  try {
    const offers = await OfferService.getUserOffers({ userId, role });
    res.status(200).json({
      offers
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      code: 'GET_OFFERS_FAILED'
    });
  }
});

/**
 * POST /offers/:offerId/accept
 * Seller accepts a structured offer
 */
router.post('/offers/:offerId/accept', requireAuth, async (req, res) => {
  const offerId = req.params.offerId;
  const sellerId = req.user.id;

  try {
    const result = await OfferService.acceptOffer({
      offerId,
      sellerId,
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Tawaran diterima! Order berhasil dibuat.',
      offer: result.offer,
      order: result.order,
      escrow: result.escrow,
      pricing: result.pricing
    });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code || 'OFFER_ACCEPT_FAILED'
    });
  }
});

/**
 * POST /offers/:offerId/decline
 * Seller declines a structured offer with an enum reason
 */
router.post('/offers/:offerId/decline', requireAuth, async (req, res) => {
  const offerId = req.params.offerId;
  const sellerId = req.user.id;
  const { decline_reason, declineReason } = req.body;
  const reason = decline_reason || declineReason;

  try {
    const offer = await OfferService.declineOffer({
      offerId,
      sellerId,
      declineReason: reason,
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Tawaran berhasil ditolak.',
      offer
    });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code || 'OFFER_DECLINE_FAILED'
    });
  }
});

/**
 * POST /offers/:offerId/counter
 * Seller or Buyer submits a counter-offer
 */
router.post('/offers/:offerId/counter', requireAuth, checkNegotiationRateLimit, async (req, res) => {
  const offerId = req.params.offerId;
  const currentUserId = req.user.id;
  const { counter_amount, counterAmount, message, note } = req.body;
  const amount = counter_amount !== undefined ? counter_amount : counterAmount;

  try {
    const offer = state.offers.find(o => o.id === offerId);
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found', code: 'OFFER_NOT_FOUND' });
    }

    let updatedOffer;
    if (offer.seller_id === currentUserId) {
      // Seller counters buyer's offer
      updatedOffer = await OfferService.counterOffer({
        offerId,
        sellerId: currentUserId,
        counterAmount: amount,
        message,
        note,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else if (offer.buyer_id === currentUserId) {
      // Buyer counters seller's counter-offer
      updatedOffer = await OfferService.buyerCounterOffer({
        offerId,
        buyerId: currentUserId,
        counterAmount: amount,
        message,
        note,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else {
      return res.status(403).json({
        error: 'Forbidden: Hanya pembeli atau penjual terkait yang dapat mengajukan tawaran balik',
        code: 'UNAUTHORIZED_ACTION'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tawaran balik berhasil dikirim.',
      offer: updatedOffer
    });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code || 'OFFER_COUNTER_FAILED'
    });
  }
});

/**
 * POST /offers/:offerId/buyer-counter
 * Explicit route for Buyer countering a seller's counter-offer
 */
router.post('/offers/:offerId/buyer-counter', requireAuth, checkNegotiationRateLimit, async (req, res) => {
  const offerId = req.params.offerId;
  const buyerId = req.user.id;
  const { counter_amount, counterAmount, message, note } = req.body;
  const amount = counter_amount !== undefined ? counter_amount : counterAmount;

  try {
    const offer = await OfferService.buyerCounterOffer({
      offerId,
      buyerId,
      counterAmount: amount,
      message,
      note,
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Tawaran baru dari pembeli berhasil dikirim ke penjual.',
      offer
    });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code || 'OFFER_COUNTER_FAILED'
    });
  }
});

/**
 * POST /offers/:offerId/accept-counter
 * Buyer accepts counter-offer -> creates order
 */
router.post('/offers/:offerId/accept-counter', requireAuth, async (req, res) => {
  const offerId = req.params.offerId;
  const buyerId = req.user.id;

  try {
    const result = await OfferService.acceptCounterOffer({
      offerId,
      buyerId,
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Tawaran balik disetujui! Silakan selesaikan pembayaran.',
      ...result
    });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code || 'OFFER_ACCEPT_COUNTER_FAILED'
    });
  }
});

/**
 * POST /offers/:offerId/withdraw
 * Buyer withdraws their pending offer
 */
router.post('/offers/:offerId/withdraw', requireAuth, async (req, res) => {
  const offerId = req.params.offerId;
  const buyerId = req.user.id;

  try {
    const offer = await OfferService.withdrawOffer({
      offerId,
      buyerId,
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Tawaran berhasil ditarik.',
      offer
    });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code || 'OFFER_WITHDRAW_FAILED'
    });
  }
});

/**
 * GET /offers/:offerId/audit
 * Immutable audit logs for an offer
 */
router.get('/offers/:offerId/audit', requireAuth, (req, res) => {
  const offerId = req.params.offerId;
  const logs = OfferService.getOfferAuditLogs(offerId);
  res.status(200).json({
    offer_id: offerId,
    audit_logs: logs
  });
});

/**
 * POST /offers/cron/expire
 * Scheduled cron / on-demand trigger to expire offers
 */
router.post('/offers/cron/expire', async (req, res) => {
  try {
    const expiredList = await OfferService.expirePendingOffers();
    res.status(200).json({
      success: true,
      expired_count: expiredList.length,
      expired_offers: expiredList
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      code: 'EXPIRE_JOB_FAILED'
    });
  }
});

/**
 * GET /notifications/mine
 * Fetch notifications for current user
 */
router.get('/notifications/mine', requireAuth, (req, res) => {
  const userId = req.user.id;
  const notifs = state.notifications
    .filter(n => n.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.status(200).json({
    notifications: notifs
  });
});

/**
 * POST /notifications/:id/read
 * Mark notification as read
 */
router.post('/notifications/:id/read', requireAuth, (req, res) => {
  const notif = state.notifications.find(n => n.id === req.params.id && n.user_id === req.user.id);
  if (notif) {
    notif.is_read = true;
  }
  res.status(200).json({ success: true });
});

router.resetNegotiationRateLimits = resetNegotiationRateLimits;
module.exports = router;
module.exports.resetNegotiationRateLimits = resetNegotiationRateLimits;
