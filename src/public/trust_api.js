const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { db, get, all, run } = require('../database');
const { replayTicketState, appendLedgerEvent } = require('../ownership/ledger');
const { createEvidenceBundle, verifyBundleIntegrity } = require('../verification/evidence');
const { explainDecision } = require('./explain');
const { validateSettlement } = require('../settlement/escrow');

// Configure multer storage
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

/**
 * Endpoint 1: Public ticket verification lookup (Replays events)
 * GET /api/ticket/:id/verify
 */
router.get('/ticket/:id/verify', async (req, res) => {
  try {
    const ticketId = req.params.id;
    const ticket = await get(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);
    if (!ticket) {
      return res.status(404).json({
        verified: false,
        error: explainDecision('TICKET_NOT_FOUND', { message: 'Tiket tidak ditemukan di sistem.' })
      });
    }

    // Replay state
    const derivedState = await replayTicketState(ticketId);
    
    // Fetch latest evidence bundle
    const bundle = await get(`SELECT * FROM evidence_bundles WHERE ticket_id = ? ORDER BY uploaded_at DESC LIMIT 1`, [ticketId]);

    res.json({
      ticketId: ticketId,
      currentOwnerId: derivedState.currentOwnerId,
      status: derivedState.status,
      history: derivedState.history,
      evidenceBundle: bundle ? {
        id: bundle.id,
        uploaderId: bundle.uploader_id,
        bundleHash: bundle.bundle_hash,
        uploadedAt: bundle.uploaded_at
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 2: Submit ticket & upload evidence bundle
 * POST /api/tickets/submit
 */
router.post('/tickets/submit', upload.any(), async (req, res) => {
  try {
    const { ticketId, eventId, sellerId, seatInfo, price } = req.body;
    
    if (!ticketId || !eventId || !sellerId || !seatInfo || !price) {
      return res.status(400).json({ error: 'Missing required ticket fields' });
    }

    // Initialize ticket in SQLite read cache
    await run(`
      INSERT OR IGNORE INTO tickets (id, event_id, current_owner_id, status, seat_info, price)
      VALUES (?, ?, ?, 'LISTED', ?, ?)
    `, [ticketId, eventId, sellerId, seatInfo, parseInt(price)]);

    // Write primary creation events
    await appendLedgerEvent(ticketId, 'TicketCreated', sellerId, { seat_info: seatInfo, price: parseInt(price) });
    await appendLedgerEvent(ticketId, 'OwnershipAssigned', sellerId, { assigned_to: sellerId });

    // Handle evidence files
    if (req.files && req.files.length > 0) {
      const bundle = await createEvidenceBundle(ticketId, sellerId, req.files);
      res.json({
        success: true,
        message: 'Ticket listed and evidence bundle hashed successfully.',
        bundle
      });
    } else {
      res.json({
        success: true,
        message: 'Ticket listed without files.'
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 3: Buyer initiates a ticket reserve/purchase
 * POST /api/tickets/:id/reserve
 */
router.post('/tickets/:id/reserve', async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { buyerId } = req.body;

    const ticket = await get(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status !== 'LISTED' && ticket.status !== 'VERIFIED') {
      return res.status(400).json({
        success: false,
        error: explainDecision('TICKET_NOT_LISTED')
      });
    }

    const price = ticket.price;
    const uniqueCode = Math.floor(100 + Math.random() * 900); // 3 digit suffix

    // Create transfer row
    const transferId = `trf-${uuidv4()}`;
    await run(`
      INSERT INTO transfers (id, ticket_id, seller_id, buyer_id, price, unique_code, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT')
    `, [transferId, ticketId, ticket.current_owner_id, buyerId, price, uniqueCode]);

    // Emit event
    await appendLedgerEvent(ticketId, 'TransferRequested', ticket.current_owner_id, { buyer_id: buyerId, transfer_id: transferId });

    res.json({
      success: true,
      transferId,
      totalToPay: price + uniqueCode,
      instructions: `Please transfer exactly IDR ${price + uniqueCode} to ARGUS Escrow Bank Account.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 4: Get verification queue (Admin Only)
 * GET /api/admin/queue
 */
router.get('/api/admin/queue', async (req, res) => {
  try {
    const queue = await all(`
      SELECT t.*, e.title as event_title, e.date as event_date, e.venue as event_venue,
             eb.id as bundle_id, eb.bundle_hash, eb.files_json
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN evidence_bundles eb ON t.id = eb.ticket_id
      WHERE t.status IN ('LISTED', 'RESERVED', 'ESCROW_PAID')
    `);

    res.json(queue.map(item => ({
      ...item,
      files: item.files_json ? JSON.parse(item.files_json) : []
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 5: Ops verifies ticket validity (Admin action)
 * POST /api/admin/tickets/:id/verify
 */
router.post('/api/admin/tickets/:id/verify', async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { approved, officerId, reason } = req.body;

    if (approved) {
      // Replay and assert integrity first
      const bundle = await get(`SELECT * FROM evidence_bundles WHERE ticket_id = ?`, [ticketId]);
      if (bundle) {
        const check = await verifyBundleIntegrity(bundle.id);
        if (!check.verified) {
          return res.status(400).json({
            success: false,
            error: explainDecision('TICKET_VERIFICATION_REJECTED', { details: check.reason })
          });
        }
      }

      await appendLedgerEvent(ticketId, 'VerificationPassed', officerId, { approved: true });
      res.json({ success: true, message: 'Ticket marked as VERIFIED.' });
    } else {
      await appendLedgerEvent(ticketId, 'VerificationFailed', officerId, { approved: false, reason });
      res.json({
        success: true,
        message: 'Ticket rejected.',
        explanation: explainDecision('TICKET_VERIFICATION_REJECTED', { details: reason })
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 6: Ops confirms Buyer's Escrow Payment has cleared (Admin action)
 * POST /api/admin/transfers/:id/confirm-payment
 */
router.post('/api/admin/transfers/:id/confirm-payment', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { officerId } = req.body;

    const transfer = await get(`SELECT * FROM transfers WHERE id = ?`, [transferId]);
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    await run(`UPDATE transfers SET status = 'ESCROW_HELD' WHERE id = ?`, [transferId]);
    await appendLedgerEvent(transfer.ticket_id, 'SettlementCompleted', officerId, { transfer_id: transferId, amount: transfer.price });

    res.json({ success: true, message: 'Payment confirmed in Escrow.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 7: Ops releases funds to Seller & finalizes transfer (Admin action)
 * POST /api/admin/transfers/:id/release
 */
router.post('/api/admin/transfers/:id/release', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { officerId } = req.body;

    const transfer = await get(`SELECT * FROM transfers WHERE id = ?`, [transferId]);
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const ticket = await get(`SELECT * FROM tickets WHERE id = ?`, [transfer.ticket_id]);

    // Validate settlement constraints
    const validation = validateSettlement(ticket, transfer);
    if (!validation.allowed) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Atomically transfer ownership
    await run(`UPDATE transfers SET status = 'TRANSFERRED' WHERE id = ?`, [transferId]);
    await appendLedgerEvent(transfer.ticket_id, 'OwnershipTransferred', transfer.seller_id, {
      new_owner_id: transfer.buyer_id,
      transfer_id: transferId
    });

    res.json({ success: true, message: 'Ownership transferred successfully. Payout released to Seller.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 8: Ops registers a dispute
 * POST /api/admin/transfers/:id/dispute
 */
router.post('/api/admin/transfers/:id/dispute', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { officerId, reason } = req.body;

    const transfer = await get(`SELECT * FROM transfers WHERE id = ?`, [transferId]);
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    await run(`UPDATE transfers SET status = 'DISPUTED' WHERE id = ?`, [transferId]);
    await appendLedgerEvent(transfer.ticket_id, 'Disputed', officerId, { reason, transfer_id: transferId });

    res.json({ success: true, message: 'Dispute recorded. Escrow funds locked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint 9: Public VSER Metric calculator
 * GET /api/admin/metrics
 */
router.get('/api/admin/metrics', async (req, res) => {
  try {
    const redeemed = await get(`SELECT COUNT(*) as count FROM transfers WHERE status = 'TRANSFERRED'`);
    const disputed = await get(`SELECT COUNT(*) as count FROM transfers WHERE status = 'DISPUTED'`);

    const r = redeemed.count;
    const d = disputed.count;
    const total = r + d;
    const vser = total > 0 ? (r / total) : 1.0;

    res.json({
      redeemed_transfers: r,
      disputed_transfers: d,
      vser: vser,
      vser_percentage: (vser * 100).toFixed(3) + '%',
      target: '99.900%'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
