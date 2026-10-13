/**
 * TIKUM / ARGUS — Partner & Outbound Affiliate Router
 *
 * Endpoints:
 * - GET  /go/:partnerSlug/:offerId               — Secure Outbound Redirect (Domain-allowlisted, zero open-redirect)
 * - GET  /api/partners/events/:eventId/offers    — Public Verified Official Offers for Event
 * - POST /api/v1/partners/webhook/:partnerSlug   — Authenticated Partner Conversion Webhook (Strictly isolated)
 */

const express = require('express');
const router = express.Router();
const { PartnerService } = require('../services/partner/PartnerService');

// ==========================================
// 1. SAFE OUTBOUND REDIRECT (/go/:partner/:offer)
// ==========================================
router.get('/go/:partnerSlug/:offerId', (req, res) => {
  const { partnerSlug, offerId } = req.params;

  try {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || '';
    const sessionId = req.headers['x-session-token'] || null;

    const result = PartnerService.resolveOutboundLink(partnerSlug, offerId, {
      ip,
      userAgent,
      referrer,
      sessionId
    });

    // 302 Redirect to validated partner destination
    return res.redirect(302, result.redirect_url);
  } catch (err) {
    const status = err.status || 400;
    const wantsHtml = req.headers.accept && req.headers.accept.includes('text/html');

    if (wantsHtml) {
      return res.status(status).send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Tautan Mitra Tidak Tersedia — Tikum</title>
  <link rel="stylesheet" href="/css/style.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; }
    h1 { font-size: 20px; margin-bottom: 12px; color: #f87171; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
    .btn { display: inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Tautan Mitra Tidak Tersedia</h1>
    <p>${err.message || 'Tautan tiket resmi ini sedang tidak aktif atau tidak memenuhi kebijakan keamanan Tikum.'}</p>
    <a href="/events" class="btn">Kembali ke Katalog Event</a>
  </div>
</body>
</html>`);
    }

    return res.status(status).json({
      error: err.message,
      code: err.code || 'REDIRECT_FAILED'
    });
  }
});

// ==========================================
// 2. PUBLIC EVENT OFFERS
// ==========================================
router.get('/api/partners/events/:eventId/offers', (req, res) => {
  try {
    const { eventId } = req.params;
    const offers = PartnerService.getOffersForEvent(eventId);
    return res.json({
      event_id: eventId,
      total_offers: offers.length,
      offers
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve event partner offers',
      code: 'OFFERS_RETRIEVAL_ERROR'
    });
  }
});

// ==========================================
// 3. AUTHENTICATED PARTNER CONVERSION WEBHOOK
// ==========================================
router.post('/api/v1/partners/webhook/:partnerSlug', (req, res) => {
  const { partnerSlug } = req.params;
  const authHeader = req.headers['authorization'] || req.headers['x-webhook-secret'] || null;

  try {
    const result = PartnerService.recordPartnerConversionWebhook(partnerSlug, req.body, authHeader);
    return res.status(200).json({
      success: true,
      idempotent: Boolean(result.idempotent),
      updated: Boolean(result.updated),
      conversion_id: result.conversion?.id,
      status: result.conversion?.status
    });
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'WEBHOOK_PROCESSING_FAILED'
    });
  }
});

module.exports = router;
