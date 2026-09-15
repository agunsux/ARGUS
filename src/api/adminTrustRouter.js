/**
 * TIKUM / ARGUS — Admin Trust Control Center Router (Epics M & N)
 * 
 * Exposes real backend trust telemetry for operations officers:
 * - Event Supply Health & Truth
 * - Ticket Trust & Evidence Metrics
 * - Venue Operations & Field Shifts
 * - Trust & Risk Signals
 * - Payment Gateway Status: explicitly renders 'PAYMENT PROVIDER: PENDING VERIFICATION'
 * - Append-only Audit Trail
 * 
 * Non-Negotiable Invariant:
 * NEVER display synthetic GMV, fake transactions, or mock escrow balances.
 */

const express = require('express');
const router = express.Router();
const { state } = require('../database');
const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
const { sourceRegistry } = require('../discovery/SourceRegistry');
const { paymentManager } = require('../services/payment');
const { requireAdmin } = require('../middleware/auth');

/**
 * GET /api/admin/trust/summary
 * Master telemetry summary across all 5 operational pillars
 */
router.get('/summary', requireAdmin, (req, res) => {
  const events = canonicalRegistry.getAllEvents();
  const tickets = state.tickets || [];
  const orders = state.orders || [];
  const disputes = state.disputes || [];
  const incidents = state.incidents || [];
  const shifts = state.venue_shifts || [];

  const ipaymu = paymentManager.getProvider('ipaymu');
  const ipaymuStatus = ipaymu ? ipaymu.getStatus() : { status: 'UNKNOWN' };

  res.json({
    timestamp: new Date().toISOString(),
    event_supply: {
      total_canonical_events: events.length,
      verified_events: events.filter(e => e.is_verified).length,
      unverified_events: events.filter(e => e.verification_status === 'UNVERIFIED').length,
      conflicted_events: events.filter(e => e.verification_status === 'CONFLICTED').length,
      expired_events: events.filter(e => e.verification_status === 'EXPIRED').length,
      sources_registered: sourceRegistry.getAllSources().length
    },
    ticket_trust: {
      total_tickets: tickets.length,
      verified_tickets: tickets.filter(t => t.verification_status === 'VERIFIED' || t.status === 'VERIFIED').length,
      under_review_tickets: tickets.filter(t => t.verification_status === 'UNDER_REVIEW').length,
      evidence_required_tickets: tickets.filter(t => t.verification_status === 'EVIDENCE_REQUIRED').length,
      rejected_tickets: tickets.filter(t => t.verification_status === 'REJECTED').length
    },
    venue_operations: {
      active_shifts: shifts.filter(s => s.status === 'ACTIVE' || s.status === 'CHECKED_IN').length,
      total_incidents: incidents.length,
      open_incidents: incidents.filter(i => i.status !== 'RESOLVED').length,
      critical_incidents: incidents.filter(i => i.severity === 'CRITICAL' && i.status !== 'RESOLVED').length
    },
    trust_signals: {
      total_disputes: disputes.length,
      open_disputes: disputes.filter(d => d.status === 'OPEN' || d.status === 'INVESTIGATING').length,
      resolved_disputes: disputes.filter(d => d.status === 'RESOLVED').length,
      high_risk_sellers: (state.seller_profiles || []).filter(p => p.suspended || p.status === 'PROBATIONARY').length
    },
    payments: {
      provider: 'ipaymu',
      status: ipaymuStatus.status,
      is_verified: ipaymuStatus.isVerified,
      banner: 'PAYMENT PROVIDER: PENDING VERIFICATION',
      real_money_active: false,
      settlement_active: false,
      readiness_summary: ipaymu ? ipaymu.getReadinessChecklist() : null
    }
  });
});

/**
 * GET /api/admin/trust/event-supply
 */
router.get('/event-supply', requireAdmin, (req, res) => {
  const events = canonicalRegistry.getAllEvents();
  res.json({
    total: events.length,
    events: events.map(e => ({
      event_id: e.event_id,
      title: e.title,
      venue: e.venue,
      city: e.city,
      date: e.start_date,
      status: e.status,
      verification_status: e.verification_status,
      event_quality_score: e.event_quality_score || 0,
      marketplace_eligibility: e.marketplace_eligibility || 'UNVERIFIED',
      source_count: (e.sources || []).length,
      conflicts_count: (e.conflicts || []).length
    }))
  });
});

/**
 * GET /api/admin/trust/ticket-trust
 */
router.get('/ticket-trust', requireAdmin, (req, res) => {
  const tickets = state.tickets || [];
  res.json({
    total: tickets.length,
    tickets: tickets.map(t => ({
      ticket_id: t.ticket_id || t.id,
      event_id: t.event_id,
      seller_id: t.seller_id,
      verification_status: t.verification_status || t.status,
      risk_status: t.risk_status || 'LOW',
      face_value: t.face_value,
      evidence_count: (t.ownership_evidence || []).length
    }))
  });
});

/**
 * GET /api/admin/trust/venue-ops
 */
router.get('/venue-ops', requireAdmin, (req, res) => {
  res.json({
    shifts: state.venue_shifts || [],
    sessions: state.verification_sessions || [],
    incidents: state.incidents || []
  });
});

/**
 * GET /api/admin/trust/payments
 */
router.get('/payments', requireAdmin, (req, res) => {
  const ipaymu = paymentManager.getProvider('ipaymu');
  const status = ipaymu ? ipaymu.getStatus() : { status: 'UNKNOWN' };

  res.json({
    provider: 'ipaymu',
    status: status.status,
    message: 'PAYMENT PROVIDER: PENDING VERIFICATION',
    environment: status.environment,
    is_verified: status.isVerified,
    readiness: status.readiness,
    webhook_status: {
      registered_endpoint: process.env.IPAYMU_WEBHOOK_URL || 'https://tikum.app/api/mvp/payment/webhook',
      signature_algorithm: 'HMAC-SHA256',
      duplicate_protection: 'ENABLED_IDEMPOTENT'
    },
    safety_invariants: {
      NO_REAL_PAYMENT: true,
      NO_REAL_SETTLEMENT: true,
      NO_FAKE_PAYMENT_SUCCESS: true,
      NO_FAKE_ESCROW_BALANCE: true,
      NO_FAKE_GMV: true
    }
  });
});

/**
 * GET /api/admin/trust/audit-trail (Epic N)
 */
router.get('/audit-trail', requireAdmin, (req, res) => {
  const entityType = req.query.entity_type;
  const limit = Math.min(100, parseInt(req.query.limit || 50, 10));

  let logs = state.audit_logs || [];
  if (entityType) {
    logs = logs.filter(l => l.entity_type === entityType.toUpperCase());
  }

  res.json({
    total: logs.length,
    logs: logs.slice(-limit)
  });
});

module.exports = router;
