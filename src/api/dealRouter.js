/**
 * TIKUM / ARGUS — Deal & Transaction Link API Router
 * 
 * Endpoints for Deal Link generation, Deal Room inspection, upfront fee simulation,
 * and binding checkout.
 */

const express = require('express');
const router = express.Router();
const { DealService } = require('../services/dealService');
const { simulateTransactionPricing } = require('../config/pricingConfig');
const { resolveUser } = require('../middleware/auth');
const { EventPolicyRegistry } = require('../policy/EventPolicyRegistry');
const { EvidenceBundleService } = require('../trust/EvidenceBundleService');

/**
 * GET /api/deals/quote
 * Fast upfront pricing calculation endpoint
 */
router.get('/quote', (req, res) => {
  const price = parseInt(req.query.price, 10) || 0;
  const quantity = parseInt(req.query.quantity, 10) || 1;
  const picAssisted = req.query.picAssisted === 'true' || req.query.pic_assisted === 'true';
  const picAllocationFee = parseInt(req.query.picAllocationFee || req.query.pic_fee, 10) || (picAssisted ? 25000 : 0);

  const quote = simulateTransactionPricing({
    price,
    quantity,
    picAssisted,
    picAllocationFee
  });

  return res.json({ success: true, quote });
});

/**
 * POST /api/deals/create
 * Seller creates a new Transaction Link
 */
router.post('/create', async (req, res) => {
  try {
    const user = resolveUser(req);
    const sellerId = user?.id || req.body.sellerId || req.body.seller_id || req.headers['x-user-id'] || 'seller-1';

    const deal = await DealService.createDeal({
      sellerId,
      eventId: req.body.eventId || req.body.event_id,
      ticketCategory: req.body.ticketCategory || req.body.ticket_category || req.body.category || 'General Admission',
      section: req.body.section,
      row: req.body.row,
      seat: req.body.seat,
      price: req.body.price,
      quantity: req.body.quantity || 1,
      faceValue: req.body.faceValue || req.body.face_value,
      ownershipEvidence: req.body.ownershipEvidence || req.body.ownership_evidence,
      ownershipInvoice: req.body.ownershipInvoice || req.body.ownership_invoice,
      containsRawQr: Boolean(req.body.containsRawQr || req.body.contains_raw_qr),
      rawBarcode: req.body.rawBarcode || req.body.raw_barcode,
      notes: req.body.notes
    });

    return res.status(201).json({
      success: true,
      deal
    });
  } catch (err) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code || 'DEAL_CREATION_FAILED'
    });
  }
});

/**
 * GET /api/deals/:token
 * Buyer or Seller inspects Deal Room
 */
router.get('/:token', (req, res) => {
  const user = resolveUser(req);
  const requesterRole = user?.role || 'public';
  const deal = DealService.getDealByToken(req.params.token, requesterRole);

  if (!deal) {
    return res.status(404).json({
      error: `Deal link '${req.params.token}' tidak ditemukan atau telah kedaluwarsa.`,
      code: 'DEAL_NOT_FOUND'
    });
  }

  return res.json({
    success: true,
    deal
  });
});

/**
 * POST /api/deals/:token/checkout
 * Buyer binds transaction and checks out
 */
router.post('/:token/checkout', async (req, res) => {
  try {
    const user = resolveUser(req);
    const buyerId = user?.id || req.body.buyerId || req.body.buyer_id || req.headers['x-user-id'];
    const paymentChannel = req.body.paymentChannel || req.body.payment_channel || 'QRIS';
    const termsAccepted = req.body.termsAccepted === true || req.body.terms_accepted === true;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

    const checkout = await DealService.checkoutDeal({
      dealToken: req.params.token,
      buyerId,
      paymentChannel,
      termsAccepted,
      ipAddress
    });

    return res.status(200).json(checkout);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code || 'CHECKOUT_FAILED'
    });
  }
});

/**
 * GET /api/deals/:token/evidence-bundle
 * Retrieve Evidence Bundle with strict party-level authorization
 */
router.get('/:token/evidence-bundle', (req, res) => {
  const user = resolveUser(req);
  const requesterRole = user?.role || 'public';
  const deal = DealService.getDealByToken(req.params.token, requesterRole);

  if (!deal) {
    return res.status(404).json({
      error: 'Deal not found',
      code: 'DEAL_NOT_FOUND'
    });
  }

  // Authorization check: only seller, buyer, admin, or PIC can view unmasked bundle
  const isParty = user && (user.id === deal.seller_id || user.id === deal.buyer_id);
  const isStaff = user && ['admin', 'pic', 'ops', 'compliance'].includes(user.role);
  const roleForBundle = (isParty || isStaff) ? (user.role || 'user') : 'public';

  const bundle = EvidenceBundleService.getBundle(deal.evidence_bundle_id, roleForBundle);

  return res.json({
    success: true,
    bundle
  });
});

module.exports = router;
