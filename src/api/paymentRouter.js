/**
 * TIKUM / ARGUS — Canonical Payment & Webhook Router (Part 1, 10, 11, 12, 17)
 * 
 * Production-ready, provider-agnostic HTTP endpoints:
 * - Payment intent creation
 * - Secure webhook ingestion with timing-safe HMAC validation
 * - Reconciliation engine triggers & audit views
 * - Payment method discovery & capability matrix
 */

const express = require('express');
const router = express.Router();
const { PaymentService } = require('../services/payment/PaymentService');
const { paymentManager } = require('../services/payment/index');
const { state } = require('../database');
const { requireAdmin } = require('../middleware/auth');

function getCallerUserId(req) {
  if (req.user && req.user.id) return req.user.id;
  const authHeader = req.header ? (req.header('authorization') || req.header('x-session-token')) : null;
  if (authHeader) {
    const { SessionStore } = require('../services/sessionStore');
    const token = authHeader.replace(/^Bearer\s+/, '').trim();
    const session = SessionStore.findSession(token);
    if (session) return session.user_id;
  }
  if (process.env.NODE_ENV === 'test') {
    return req.header('x-user-id') || req.body?.buyerId || req.query?.buyerId || null;
  }
  return null;
}

/**
 * GET /api/v1/payments/status
 * Public status of payment subsystem & safety gates
 */
router.get('/v1/payments/status', (req, res) => {
  res.json(PaymentService.getSubsystemStatus());
});

/**
 * GET /api/v1/payments/methods
 * Discovers available payment methods & capabilities
 */
router.get('/v1/payments/methods', (req, res) => {
  res.json({
    default_provider: paymentManager.defaultProvider,
    providers: paymentManager.getAvailablePaymentMethods()
  });
});

/**
 * POST /api/v1/payments/create
 * Creates a payment intent for an order through the configured provider
 */
router.post('/v1/payments/create', async (req, res) => {
  try {
    const buyerId = getCallerUserId(req);
    const { orderId, channel, providerName, idempotencyKey } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required', code: 'INVALID_PAYLOAD' });
    }

    const order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    if (!order) {
      return res.status(404).json({ error: `Order '${orderId}' not found`, code: 'ORDER_NOT_FOUND' });
    }

    if (buyerId && order.buyer_id !== buyerId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own this order', code: 'FORBIDDEN' });
    }

    const paymentResult = await PaymentService.createPayment({
      orderId: order.id,
      amount: order.buyer_total || order.total_amount,
      channel: channel || 'QRIS',
      buyer: { id: order.buyer_id },
      providerName: providerName || null,
      idempotencyKey: idempotencyKey || req.header('x-idempotency-key') || null
    });

    res.json({
      success: true,
      payment: paymentResult
    });
  } catch (err) {
    const statusCode = err.status || err.statusCode || 400;
    res.status(statusCode).json({ error: err.message, code: err.code || 'PAYMENT_CREATION_FAILED' });
  }
});

/**
 * GET /api/v1/payments/:id
 * Checks status of a payment intent
 */
router.get('/v1/payments/:id', (req, res) => {
  const paymentId = req.params.id;
  const payment = (state.canonical_payments || []).find(
    p => p.id === paymentId || p.internal_payment_id === paymentId || p.order_id === paymentId || p.provider_reference === paymentId
  );

  if (!payment) {
    return res.status(404).json({ error: `Payment record '${paymentId}' not found`, code: 'PAYMENT_NOT_FOUND' });
  }

  res.json({
    success: true,
    payment
  });
});

/**
 * Canonical Webhook Ingestion Handler
 */
async function processWebhookRequest(req, res, targetProvider) {
  try {
    const result = await PaymentService.handleWebhook({
      providerName: targetProvider,
      headers: req.headers,
      body: req.body,
      rawBodyBuffer: req.rawBody || null,
      rawPayload: req.rawBody ? req.rawBody.toString('utf8') : null
    });

    res.status(200).json({
      success: true,
      idempotent: result.idempotent,
      message: result.idempotent ? 'Webhook already processed' : 'Webhook successfully processed',
      event: result.event ? {
        orderId: result.event.orderId,
        providerRef: result.event.providerRef,
        status: result.event.status
      } : null
    });
  } catch (err) {
    const statusCode = err.status || err.statusCode || 400;
    res.status(statusCode).json({
      error: err.message,
      code: err.code || 'WEBHOOK_PROCESSING_FAILED'
    });
  }
}

/**
 * POST /api/v1/payments/webhook/:provider
 * Multi-provider webhook endpoint
 */
router.post('/v1/payments/webhook/:provider', async (req, res) => {
  await processWebhookRequest(req, res, req.params.provider);
});

/**
 * POST /api/v1/payments/webhook
 * Default provider webhook endpoint
 */
router.post('/v1/payments/webhook', async (req, res) => {
  const provider = req.header('x-provider') || paymentManager.defaultProvider || 'rcb';
  await processWebhookRequest(req, res, provider);
});

/**
 * POST /api/mvp/payment/webhook
 * Backward-compatible webhook alias
 */
router.post('/mvp/payment/webhook', async (req, res) => {
  const provider = req.header('x-provider') || (req.body?.provider) || 'ipaymu';
  await processWebhookRequest(req, res, provider);
});

/**
 * POST /api/admin/payments/reconcile
 * Admin trigger automated payment reconciliation (Requires Admin)
 */
router.post('/admin/payments/reconcile', requireAdmin, async (req, res) => {
  try {
    const { date, providerName } = req.body;
    const report = await PaymentService.reconcileTransactions({
      date: date || new Date().toISOString().split('T')[0],
      providerName: providerName || null
    });
    res.json({
      success: true,
      reconciliation: report
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'RECONCILIATION_FAILED' });
  }
});

/**
 * GET /api/admin/payments/reconciliation
 * Admin inspects reconciliation logs (Requires Admin)
 */
router.get('/admin/payments/reconciliation', requireAdmin, (req, res) => {
  const logs = state.payment_reconciliation_logs || [];
  res.json({
    total_records: logs.length,
    records: logs.slice(-100).reverse()
  });
});

module.exports = router;
