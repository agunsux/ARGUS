/**
 * TIKUM / ARGUS — Admin Control Plane API (Epic 5.1)
 * 
 * Strict Admin Invariants:
 * 1. Every endpoint requires server-side requireAdmin authorization.
 * 2. Never exposes password hashes, internal secrets, or raw session tokens.
 * 3. Never fabricates synthetic metrics (real database data or "Not available").
 * 4. Read-only for financial releases — escrow authorization gate remains sole authority.
 * 5. Admin cannot self-promote users or accidentally suspend own admin account.
 */

const express = require('express');
const router = express.Router();
const { state, recordAuditLog } = require('../database');
const { requireAdmin } = require('../middleware/auth');

/**
 * GET /api/admin/overview
 * Real system counters across users and transactions.
 */
router.get('/overview', requireAdmin, (req, res) => {
  const users = state.users || [];
  const orders = state.orders || [];
  const escrows = state.escrows || [];

  const activeUsers = users.filter(u => (u.status || 'ACTIVE') === 'ACTIVE').length;
  const suspendedUsers = users.filter(u => u.status === 'SUSPENDED').length;

  const pendingOrders = orders.filter(
    o => o.status === 'PENDING_PAYMENT' || o.status === 'RESERVED' || o.status === 'CREATED'
  ).length;
  const disputedOrders = orders.filter(
    o => o.status === 'DISPUTED' || (escrows.find(e => e.order_id === o.id)?.status === 'DISPUTED')
  ).length;
  const releasedOrders = orders.filter(
    o => o.status === 'SETTLED' || o.status === 'RELEASED' || (escrows.find(e => e.order_id === o.id)?.status === 'RELEASED')
  ).length;
  const frozenOrders = orders.filter(
    o => o.status === 'FROZEN' || (escrows.find(e => e.order_id === o.id)?.status === 'FROZEN')
  ).length;

  res.status(200).json({
    users: {
      total: users.length,
      active: activeUsers,
      suspended: suspendedUsers
    },
    orders: {
      total: orders.length,
      pending: pendingOrders,
      disputed: disputedOrders,
      released: releasedOrders,
      frozen: frozenOrders
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/admin/users
 * Real list of registered users. Password hashes are strictly redacted.
 */
router.get('/users', requireAdmin, (req, res) => {
  const users = state.users || [];

  const sanitizedUsers = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status || 'ACTIVE',
    created_at: u.created_at || null,
    updated_at: u.updated_at || null,
    last_login_at: u.last_login_at || null
  }));

  res.status(200).json({
    total: sanitizedUsers.length,
    users: sanitizedUsers
  });
});

/**
 * PATCH /api/admin/users/:id/status
 * Updates user account status (ACTIVE or SUSPENDED).
 * Guards:
 * - Admin cannot suspend self.
 * - Cannot change user role through this endpoint.
 */
router.patch('/users/:id/status', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!status || (status !== 'ACTIVE' && status !== 'SUSPENDED')) {
    return res.status(400).json({
      error: "Invalid status. Must be 'ACTIVE' or 'SUSPENDED'",
      code: 'INVALID_STATUS'
    });
  }

  const user = (state.users || []).find(u => u.id === id);
  if (!user) {
    return res.status(404).json({
      error: `User '${id}' not found`,
      code: 'USER_NOT_FOUND'
    });
  }

  // Self-lockout prevention
  if (req.user && req.user.id === id && status === 'SUSPENDED') {
    return res.status(400).json({
      error: 'Cannot suspend your own admin account',
      code: 'CANNOT_SUSPEND_SELF'
    });
  }

  const prevStatus = user.status || 'ACTIVE';
  user.status = status;
  user.updated_at = new Date().toISOString();

  await recordAuditLog('USER_MANAGEMENT', user.id, `STATUS_${status}`, req.user.id, {
    previous_status: prevStatus,
    new_status: status,
    target_user_id: user.id
  }).catch(() => {});

  res.status(200).json({
    success: true,
    message: `User status updated to ${status}`,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      updated_at: user.updated_at
    }
  });
});

/**
 * GET /api/admin/orders
 * Real list of orders and associated escrow states.
 * Read-only. Zero arbitrary release actions.
 */
router.get('/orders', requireAdmin, (req, res) => {
  const orders = state.orders || [];
  const escrows = state.escrows || [];

  const ordersData = orders.map(o => {
    const escrow = escrows.find(e => e.order_id === o.id);
    return {
      id: o.id,
      buyer_id: o.buyer_id,
      seller_id: o.seller_id,
      ticket_id: o.ticket_id,
      event_id: o.event_id,
      amount: o.total_amount || o.ticket_price || 0,
      status: o.status,
      escrow_status: escrow ? escrow.status : 'NONE',
      created_at: o.created_at || null
    };
  });

  res.status(200).json({
    total: ordersData.length,
    orders: ordersData
  });
});

/**
 * GET /api/admin/security
 * Real trust & security counters from active records.
 * Uninstrumented fields return "Not available" (Zero fabrication).
 */
router.get('/security', requireAdmin, (req, res) => {
  const disputes = state.disputes || [];
  const incidents = state.incidents || [];
  const authRecords = state.authorization_records || [];
  const attestations = state.attestations || [];

  const openDisputes = disputes.filter(d => d.status === 'OPEN' || d.status === 'INVESTIGATING').length;
  const resolvedDisputes = disputes.filter(d => d.status === 'RESOLVED' || d.status === 'CLOSED_FINAL').length;

  const totalIncidents = incidents.length;
  const openIncidents = incidents.filter(i => i.status !== 'RESOLVED').length;

  const blockedAuthorizations = authRecords.filter(r => r.outcome === 'BLOCK').length;
  const pendingReviews = authRecords.filter(r => r.outcome === 'EXCEPTION' || r.outcome === 'PENDING').length;
  const failedAttestations = attestations.filter(a => a.result === 'FAIL').length;

  res.status(200).json({
    disputes: {
      total: disputes.length,
      open: openDisputes,
      resolved: resolvedDisputes
    },
    incidents: {
      total: totalIncidents,
      open: openIncidents
    },
    trust_policy: {
      total_evaluations: authRecords.length,
      blocked_authorizations: blockedAuthorizations,
      pending_reviews: pendingReviews,
      failed_attestations: failedAttestations
    },
    external_threat_intel: 'Not available',
    hardware_security_modules: 'Not available',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
