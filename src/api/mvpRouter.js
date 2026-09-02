const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { state, recordAuditLog } = require('../database');
const { ListingService, LISTING_STATUS } = require('../services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('../services/escrowService');
const { EventPicService } = require('../services/eventPicService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('../services/disputeService');
const { SettlementService } = require('../services/settlementService');
const { createEvidenceBundle } = require('../verification/evidence');

// Multer for evidence uploads
const uploadsDir = process.env.VERCEL
  ? '/tmp/uploads'
  : path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// =============================================================================
// PUBLIC & MARKETPLACE ENDPOINTS
// =============================================================================

/**
 * List all events
 * GET /api/mvp/events
 */
router.get('/events', (req, res) => {
  const eventsWithVenues = state.events.map(event => {
    const venue = state.venues.find(v => v.id === event.venue_id) || {};
    const pic = state.event_pics.find(ep => ep.event_id === event.id && ep.status === 'ACTIVE');
    return {
      ...event,
      venue_details: venue,
      pic_assigned: !!pic,
      pic_contact: pic ? pic.contact_phone : null
    };
  });
  res.json({ events: eventsWithVenues });
});

/**
 * Browse active listings with full price transparency
 * GET /api/mvp/listings
 */
router.get('/listings', (req, res) => {
  const { eventId } = req.query;
  const listings = ListingService.getActiveListings(eventId);
  // Add transparent pricing calculation to each listing
  const listingsWithPricing = listings.map(l => ({
    ...l,
    pricing: EscrowService.calculatePricing(l.price)
  }));
  res.json({ listings: listingsWithPricing });
});

// =============================================================================
// SELLER FLOW ENDPOINTS
// =============================================================================

/**
 * Seller creates a new listing with evidence files
 * POST /api/mvp/seller/listing
 */
router.post('/seller/listing', upload.any(), async (req, res) => {
  try {
    const { sellerId, eventId, seatInfo, faceValue, price, rawBarcode } = req.body;

    if (!sellerId || !eventId || !seatInfo || !faceValue || !price || !rawBarcode) {
      return res.status(400).json({ error: 'Missing required listing fields (sellerId, eventId, seatInfo, faceValue, price, rawBarcode)' });
    }

    let evidenceBundleId = null;
    if (req.files && req.files.length > 0) {
      const bundle = await createEvidenceBundle(`temp-${uuidv4()}`, sellerId, req.files);
      evidenceBundleId = bundle.id;
    }

    const result = await ListingService.createListing({
      sellerId,
      eventId,
      seatInfo,
      faceValue,
      price,
      rawBarcode,
      evidenceBundleId
    });

    res.status(201).json({
      success: true,
      message: 'Listing created and submitted for verification.',
      listing: result.listing,
      ticket: result.ticket
    });
  } catch (err) {
    res.status(err.code === 'DUPLICATE_TICKET_BARCODE' || err.code === 'SELLER_NOT_ELIGIBLE' ? 400 : 500)
      .json({ error: err.message, code: err.code });
  }
});

/**
 * Get listings for a seller
 * GET /api/mvp/seller/:id/listings
 */
router.get('/seller/:id/listings', (req, res) => {
  const sellerListings = state.listings.filter(l => l.seller_id === req.params.id);
  res.json({ listings: sellerListings });
});

// =============================================================================
// BUYER FLOW ENDPOINTS
// =============================================================================

/**
 * Buyer reserves ticket and creates order (with transparent fee breakdown)
 * POST /api/mvp/buyer/order
 */
router.post('/buyer/order', async (req, res) => {
  try {
    const { buyerId, listingId } = req.body;
    if (!buyerId || !listingId) {
      return res.status(400).json({ error: 'buyerId and listingId are required' });
    }

    const result = await EscrowService.createOrder({ buyerId, listingId });
    res.status(201).json({
      success: true,
      message: 'Order created. Payment required to lock escrow.',
      order: result.order,
      escrow: result.escrow,
      pricing: result.pricing
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/**
 * Buyer pays order -> payment locked into escrow
 * POST /api/mvp/buyer/pay
 */
router.post('/buyer/pay', async (req, res) => {
  try {
    const { orderId, providerRef, idempotencyKey, amountPaid } = req.body;
    if (!orderId || !idempotencyKey) {
      return res.status(400).json({ error: 'orderId and idempotencyKey are required' });
    }

    const result = await EscrowService.recordPayment({
      orderId,
      providerRef,
      idempotencyKey,
      amountPaid
    });

    // Provide assigned Event PIC contact for venue meet-up
    const picAssign = state.event_pics.find(ep => ep.event_id === result.order.event_id && ep.status === 'ACTIVE');
    const venue = state.venues.find(v => v.id === picAssign?.venue_id) || {};

    res.json({
      success: true,
      message: 'Payment received. Funds securely locked in Escrow.',
      order: result.order,
      escrow: result.escrow,
      pic_instructions: {
        pic_contact: picAssign ? picAssign.contact_phone : 'ARGUS Ops Hot-line',
        venue: venue.name,
        gate_info: venue.gate_info,
        instructions: 'Temui PIC ARGUS di gate venue sebelum masuk. Tunjukkan nomor pesanan Anda untuk verifikasi fisik.'
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/**
 * Buyer gets active orders
 * GET /api/mvp/buyer/:id/orders
 */
router.get('/buyer/:id/orders', (req, res) => {
  const buyerOrders = state.orders.filter(o => o.buyer_id === req.params.id).map(order => {
    const event = state.events.find(e => e.id === order.event_id) || {};
    const venue = state.venues.find(v => v.id === event.venue_id) || {};
    const pic = state.event_pics.find(ep => ep.event_id === order.event_id && ep.status === 'ACTIVE');
    const escrow = state.escrows.find(e => e.order_id === order.id);
    const verification = state.entry_verifications.find(ev => ev.order_id === order.id);

    return {
      ...order,
      event_title: event.title,
      event_date: event.date,
      venue_name: venue.name,
      escrow_status: escrow ? escrow.status : null,
      entry_status: verification ? verification.status : 'PENDING_ENTRY',
      pic_contact: pic ? pic.contact_phone : null
    };
  });

  res.json({ orders: buyerOrders });
});

/**
 * Buyer reports invalid ticket / gate issue
 * POST /api/mvp/buyer/dispute
 */
router.post('/buyer/dispute', async (req, res) => {
  try {
    const { orderId, buyerId, reason } = req.body;
    if (!orderId || !buyerId) {
      return res.status(400).json({ error: 'orderId and buyerId are required' });
    }

    const result = await DisputeService.openDispute({
      orderId,
      buyerId,
      reason: reason || 'TICKET_INVALID_AT_GATE'
    });

    res.status(201).json({
      success: true,
      message: 'Dispute opened. Escrow funds locked. Assigned PIC alerted.',
      dispute: result.dispute
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

// =============================================================================
// EVENT PIC FLOW ENDPOINTS (EVENT-CENTRIC CELL)
// =============================================================================

/**
 * PIC retrieves operational cell dashboard for their assigned event
 * GET /api/mvp/pic/events/:eventId/dashboard
 */
router.get('/pic/events/:eventId/dashboard', (req, res) => {
  try {
    const picUserId = req.query.picUserId || 'pic-1';
    const dashboard = EventPicService.getPicEventDashboard(picUserId, req.params.eventId);
    res.json(dashboard);
  } catch (err) {
    res.status(err.code === 'PIC_NOT_ACTIVE' ? 403 : 400).json({ error: err.message, code: err.code });
  }
});

/**
 * PIC verifies attendee & ticket at venue gate and confirms entry
 * POST /api/mvp/pic/verify-entry
 */
router.post('/pic/verify-entry', async (req, res) => {
  try {
    const { picUserId, orderId, gate, notes, status } = req.body;
    if (!picUserId || !orderId) {
      return res.status(400).json({ error: 'picUserId and orderId are required' });
    }

    const verification = await EventPicService.recordEntryVerification({
      picUserId,
      orderId,
      gate: gate || 'Pintu Utama',
      notes,
      status: status || 'CONFIRMED'
    });

    res.json({
      success: true,
      message: `Entry status recorded as ${verification.status}.`,
      verification
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/**
 * PIC submits dispute field investigation and evidence
 * POST /api/mvp/pic/dispute-evidence
 */
router.post('/pic/dispute-evidence', upload.any(), async (req, res) => {
  try {
    const { disputeId, picUserId, notes, gateStatus } = req.body;
    if (!disputeId || !picUserId) {
      return res.status(400).json({ error: 'disputeId and picUserId are required' });
    }

    let evidenceBundleId = null;
    if (req.files && req.files.length > 0) {
      const bundle = await createEvidenceBundle(`dispute-${disputeId}`, picUserId, req.files);
      evidenceBundleId = bundle.id;
    }

    const dispute = await DisputeService.submitPicInvestigation({
      disputeId,
      picUserId,
      notes,
      evidenceBundleId,
      gateStatus: gateStatus || 'INVALID'
    });

    res.json({
      success: true,
      message: 'PIC investigation notes and evidence submitted.',
      dispute
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

// =============================================================================
// ADMIN OPERATIONS CONSOLE ENDPOINTS (LEAN ADMIN)
// =============================================================================

/**
 * Consolidated ARGUS Operations Console metrics & work queues
 * GET /api/mvp/admin/operations
 */
router.get('/admin/operations', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // Today's events
  const todaysEvents = state.events.map(event => {
    const activePics = state.event_pics.filter(ep => ep.event_id === event.id && ep.status === 'ACTIVE');
    const eventOrders = state.orders.filter(o => o.event_id === event.id);
    return {
      ...event,
      active_pics_count: activePics.length,
      orders_count: eventOrders.length
    };
  });

  // Active PICs
  const activePics = state.event_pics.filter(ep => ep.status === 'ACTIVE').map(ep => {
    const user = state.users.find(u => u.id === ep.pic_user_id) || {};
    const event = state.events.find(e => e.id === ep.event_id) || {};
    return {
      ...ep,
      pic_name: user.name,
      pic_phone: ep.contact_phone,
      event_title: event.title
    };
  });

  // Pending ticket verifications
  const pendingVerifications = state.listings.filter(l => l.status === LISTING_STATUS.PENDING_VERIFICATION).map(l => {
    const event = state.events.find(e => e.id === l.event_id) || {};
    const seller = state.users.find(u => u.id === l.seller_id) || {};
    return {
      ...l,
      event_title: event.title,
      seller_name: seller.name
    };
  });

  // Active orders & Escrow balance
  const activeOrders = state.orders.filter(o => [ORDER_STATUS.PAID_ESCROWED, ORDER_STATUS.ENTRY_CONFIRMED].includes(o.status));
  const escrowHolding = state.escrows
    .filter(e => [ESCROW_STATUS.ESCROWED, ESCROW_STATUS.RELEASE_PENDING, ESCROW_STATUS.DISPUTED].includes(e.status))
    .reduce((sum, e) => sum + e.amount, 0);

  // Pending settlements
  const pendingSettlements = state.orders.filter(o => o.status === ORDER_STATUS.ENTRY_CONFIRMED).map(o => {
    const seller = state.users.find(u => u.id === o.seller_id) || {};
    const escrow = state.escrows.find(e => e.order_id === o.id) || {};
    return {
      order_id: o.id,
      seller_id: o.seller_id,
      seller_name: seller.name,
      amount: escrow.amount,
      status: 'PENDING_RELEASE'
    };
  });

  // Open disputes
  const openDisputes = state.disputes.filter(d => d.status !== DISPUTE_STATUS.RESOLVED).map(d => {
    const buyer = state.users.find(u => u.id === d.buyer_id) || {};
    const seller = state.users.find(u => u.id === d.seller_id) || {};
    const event = state.events.find(e => e.id === d.event_id) || {};
    return {
      ...d,
      buyer_name: buyer.name,
      seller_name: seller.name,
      event_title: event.title
    };
  });

  res.json({
    metrics: {
      todays_events_count: todaysEvents.length,
      active_pics_count: activePics.length,
      pending_verifications_count: pendingVerifications.length,
      active_orders_count: activeOrders.length,
      escrow_holding_total: escrowHolding,
      pending_settlements_count: pendingSettlements.length,
      open_disputes_count: openDisputes.length
    },
    queues: {
      todaysEvents,
      activePics,
      pendingVerifications,
      activeOrders,
      pendingSettlements,
      openDisputes
    }
  });
});

/**
 * Admin verifies or rejects a listing
 * POST /api/mvp/admin/listings/:id/verify
 */
router.post('/admin/listings/:id/verify', async (req, res) => {
  try {
    const officerId = req.body.officerId || 'admin-1';
    const { approved, reason } = req.body;
    const result = await ListingService.verifyListing(req.params.id, officerId, { approved, reason });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/**
 * Admin resolves a dispute
 * POST /api/mvp/admin/disputes/:id/resolve
 */
router.post('/admin/disputes/:id/resolve', async (req, res) => {
  try {
    const officerId = req.body.officerId || 'admin-1';
    const { outcome, decisionReason, decisionNotes } = req.body;

    const result = await DisputeService.resolveDispute({
      disputeId: req.params.id,
      officerId,
      outcome,
      decisionReason,
      decisionNotes
    });

    res.json({
      success: true,
      message: `Dispute resolved with outcome ${outcome}.`,
      result
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/**
 * Admin executes settlement payout to seller after verified gate entry
 * POST /api/mvp/admin/settlements/execute
 */
router.post('/admin/settlements/execute', async (req, res) => {
  try {
    const officerId = req.body.officerId || 'admin-1';
    const { orderId, sellerId, idempotencyKey, bankAccount } = req.body;

    // Release escrow first if not yet released
    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (escrow && escrow.status !== ESCROW_STATUS.RELEASED) {
      await EscrowService.releaseToSeller(orderId, officerId);
    }

    const result = await SettlementService.executeSettlement({
      orderId,
      sellerId,
      officerId,
      idempotencyKey: idempotencyKey || `stl-key-${orderId}`,
      bankAccount
    });

    res.json({
      success: true,
      message: 'Settlement successfully executed and disbursed to seller.',
      settlement: result.settlement
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

module.exports = router;

