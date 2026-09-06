const express = require('express');
const router = express.Router();
const { state } = require('../database');
const { OfferService, OFFER_STATUS, DECLINE_REASONS } = require('../services/offerService');
const { SessionStore } = require('../services/sessionStore');

/**
 * Authentication resolver supporting sessions and test mode headers
 */
function resolveUser(req, ...fallbacks) {
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

  // Fallback in test mode or local pilot test
  if (process.env.NODE_ENV === 'test') {
    const headerId = req.header ? req.header('x-user-id') : null;
    const callerId = headerId || fallbacks.find(f => !!f);
    if (callerId) {
      const user = state.users.find(u => u.id === callerId);
      if (user) {
        req.user = user;
        req.role = user.role;
        return user;
      }
    }
  }

  return null;
}

/**
 * Middleware requiring authentication
 */
function requireAuth(req, res, next) {
  const user = resolveUser(req, req.body?.buyerId, req.body?.sellerId, req.body?.userId, req.query?.userId);
  if (!user) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.',
      code: 'AUTH_REQUIRED'
    });
  }
  next();
}

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

module.exports = router;
