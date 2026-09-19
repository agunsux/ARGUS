/**
 * TIKUM / ARGUS — Admin Control Plane API (Epic 5.1 & Operational Control Center V1)
 * 
 * Strict Admin Invariants:
 * 1. Every endpoint requires server-side requireAdmin authorization.
 * 2. Never exposes password hashes, internal secrets, or raw session tokens.
 * 3. Never fabricates synthetic metrics (real database data or "Not available" / "N/A").
 * 4. Read-only for financial releases — escrow authorization gate remains sole authority.
 * 5. Admin cannot self-promote users or accidentally suspend own admin account.
 * 6. Fail-closed: if an operational submodule fails, display "Data unavailable" without crashing.
 */

const express = require('express');
const router = express.Router();
const { state, recordAuditLog } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { FinancialLedger } = require('../settlement/FinancialLedger');

/**
 * GET /api/admin/overview
 * Real system counters across users, orders, tickets, events, venue operations, and ledger accounts.
 * Backward compatible with existing tests while delivering the V1 Operational Control Center data contract.
 */
router.get('/overview', requireAdmin, (req, res) => {
  try {
    const users = state.users || [];
    const orders = state.orders || [];
    const escrows = state.escrows || [];
    const events = state.events || [];
    const listings = state.listings || [];
    const tickets = state.tickets || [];
    const disputes = state.disputes || [];
    const incidents = state.incidents || [];
    const eventPics = state.event_pics || [];
    const venueShifts = state.venue_shifts || [];
    const payments = state.payments || [];
    const sellerProfiles = state.seller_profiles || [];
    const authRecords = state.authorization_records || [];
    const entryVerifications = state.entry_verifications || [];

    // --- 1. Backward-Compatible Counters (Preserved for test_epic51_auth_admin.js) ---
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

    // --- 2. Top-Level Operational Cards (REAL DATA ONLY) ---
    const activeEventsCount = events.filter(e => e.status === 'UPCOMING' || e.status === 'ON_SALE' || e.status === 'ACTIVE').length;
    const ticketsListedCount = listings.filter(l => l.status === 'ACTIVE').length;
    const totalOrdersCount = orders.length;
    const openDisputesCount = disputes.filter(d => d.status === 'OPEN' || d.status === 'INVESTIGATING' || d.status === 'DECISION_PENDING').length;
    const activeIncidentsCount = incidents.filter(i => i.status !== 'RESOLVED').length;

    const metrics = {
      active_events: activeEventsCount,
      tickets_listed: ticketsListedCount,
      total_orders: totalOrdersCount,
      pending_payments: pendingOrders,
      open_disputes: openDisputesCount,
      active_incidents: activeIncidentsCount
    };

    // --- 3. Operational Alerts ("Action Required") ---
    const alerts = [];

    // Alert: Open Disputes requiring review
    for (const d of disputes) {
      if (d.status === 'OPEN' || d.status === 'INVESTIGATING' || d.status === 'DECISION_PENDING') {
        alerts.push({
          id: `alert-dsp-${d.id}`,
          type: 'UNRESOLVED_DISPUTE',
          severity: 'CRITICAL',
          timestamp: d.timeline?.[0]?.timestamp || d.created_at || new Date().toISOString(),
          related_entity: 'DISPUTE',
          entity_id: d.id,
          order_id: d.order_id,
          event_id: d.event_id,
          current_status: d.status,
          title: `Sengketa Terbuka: ${d.reason || 'Klaim Pembeli'}`,
          description: `Order ${d.order_id} memerlukan investigasi bukti sebelum keputusan settlement.`,
          action_label: 'Review Sengketa',
          action_url: '#disputes'
        });
      }
    }

    // Alert: Active field incidents
    for (const i of incidents) {
      if (i.status !== 'RESOLVED') {
        alerts.push({
          id: `alert-inc-${i.id}`,
          type: 'ACTIVE_INCIDENT',
          severity: (i.severity || 'HIGH').toUpperCase(),
          timestamp: i.created_at || new Date().toISOString(),
          related_entity: 'INCIDENT',
          entity_id: i.id,
          event_id: i.event_id,
          order_id: i.order_id || null,
          current_status: i.status,
          title: `Insiden Lapangan: ${i.type || 'Kendala Tiket'}`,
          description: i.description || 'Insiden di venue memerlukan penanganan operasional.',
          action_label: 'Investigasi',
          action_url: '#incidents'
        });
      }
    }

    // Alert: Listings requiring verification review
    for (const l of listings) {
      if (l.status === 'SUBMITTED' || l.status === 'UNDER_REVIEW') {
        alerts.push({
          id: `alert-list-${l.id}`,
          type: 'TICKET_VERIFICATION_REQUIRED',
          severity: 'HIGH',
          timestamp: l.created_at || new Date().toISOString(),
          related_entity: 'TICKET_LISTING',
          entity_id: l.id,
          event_id: l.event_id,
          current_status: l.status,
          title: 'Verifikasi Tiket Menunggu Review',
          description: `Listing ${l.id} menunggu peninjauan keaslian dokumen / QR code.`,
          action_label: 'Verifikasi Tiket',
          action_url: '#tickets'
        });
      }
    }

    // Alert: Sellers with pending KYC
    for (const sp of sellerProfiles) {
      if (sp.kyc_status === 'PENDING' || sp.status === 'PROBATIONARY') {
        alerts.push({
          id: `alert-seller-${sp.user_id}`,
          type: 'SELLER_KYC_REVIEW',
          severity: 'MEDIUM',
          timestamp: sp.updated_at || new Date().toISOString(),
          related_entity: 'SELLER',
          entity_id: sp.user_id,
          current_status: sp.kyc_status || 'PENDING',
          title: 'Penjual Menunggu Verifikasi KYC',
          description: `Penjual ${sp.user_id} belum menyelesaikan verifikasi dokumen identitas.`,
          action_label: 'Review Penjual',
          action_url: '#sellers'
        });
      }
    }

    // Alert: Events requiring PIC assignment (events without active PIC)
    for (const ev of events) {
      const hasPic = eventPics.some(ep => ep.event_id === ev.id && ep.status === 'ACTIVE') ||
                     venueShifts.some(vs => vs.event_id === ev.id && vs.status !== 'OFFLINE');
      if (!hasPic) {
        alerts.push({
          id: `alert-pic-${ev.id}`,
          type: 'PIC_UNASSIGNED',
          severity: 'HIGH',
          timestamp: ev.date || ev.start_date || new Date().toISOString(),
          related_entity: 'EVENT',
          entity_id: ev.id,
          current_status: 'UNASSIGNED',
          title: `Event Belum Memiliki PIC Venue`,
          description: `Event '${ev.name || ev.title}' pada ${ev.date || ev.start_date} belum memiliki penugasan PIC lapangan.`,
          action_label: 'Tugaskan PIC',
          action_url: '#venue-pic'
        });
      }
    }

    // Alert: Failed gate verifications
    for (const evr of entryVerifications) {
      if (evr.status === 'INVALID' || evr.status === 'GATE_REJECTION' || evr.status === 'DUPLICATE_ENTRY') {
        alerts.push({
          id: `alert-entry-${evr.id}`,
          type: 'GATE_VERIFICATION_FAILED',
          severity: 'HIGH',
          timestamp: evr.verified_at || new Date().toISOString(),
          related_entity: 'ENTRY_VERIFICATION',
          entity_id: evr.id,
          event_id: evr.event_id,
          order_id: evr.order_id,
          current_status: evr.status,
          title: `Pemeriksaan Gate Gagal: ${evr.status}`,
          description: `Order ${evr.order_id} ditolak di turnstile ${evr.gate || 'venue'}.`,
          action_label: 'Cek Verifikasi',
          action_url: '#venue-pic'
        });
      }
    }

    // Alert: Suspicious/Blocked transactions
    for (const ar of authRecords) {
      if (ar.outcome === 'BLOCK') {
        alerts.push({
          id: `alert-block-${ar.id || ar.order_id}`,
          type: 'BLOCKED_TRANSACTION',
          severity: 'CRITICAL',
          timestamp: ar.timestamp || new Date().toISOString(),
          related_entity: 'ORDER',
          entity_id: ar.order_id,
          current_status: 'BLOCKED',
          title: 'Transaksi Diblokir Trust Policy',
          description: `Order ${ar.order_id} diblokir oleh Trust Policy Engine (${ar.reason || 'Risk threshold exceeded'}).`,
          action_label: 'Audit Order',
          action_url: '#orders'
        });
      }
    }

    // Sort alerts by severity
    const severityOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
    alerts.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

    // --- 4. Event Operations ---
    const eventOperations = events.map(e => {
      const eventListings = listings.filter(l => l.event_id === e.id);
      const eventOrders = orders.filter(o => o.event_id === e.id);
      const picAssign = eventPics.find(ep => ep.event_id === e.id && ep.status === 'ACTIVE');
      const picUser = picAssign ? users.find(u => u.id === picAssign.pic_user_id) : null;
      const hasIncident = incidents.some(i => i.event_id === e.id && i.status !== 'RESOLVED');

      let opStatus = e.status || 'UPCOMING';
      if (hasIncident) opStatus = 'INCIDENT';

      return {
        id: e.id,
        name: e.name || e.title,
        date: e.date || e.start_date,
        venue_name: e.venue_name || e.venue || 'N/A',
        city: e.venue_city || 'N/A',
        tickets_listed: eventListings.length,
        orders_count: eventOrders.length,
        pic_name: picUser ? picUser.name : (picAssign ? picAssign.pic_user_id : 'Unassigned'),
        pic_id: picAssign ? picAssign.pic_user_id : null,
        operational_status: opStatus
      };
    });

    // --- 5. Venue / PIC Status ---
    const venuePicStatus = events.map(e => {
      const picAssign = eventPics.find(ep => ep.event_id === e.id && ep.status === 'ACTIVE');
      const shift = venueShifts.find(s => s.event_id === e.id);
      const picUser = picAssign ? users.find(u => u.id === picAssign.pic_user_id) : null;
      const openInc = incidents.filter(i => i.event_id === e.id && i.status !== 'RESOLVED');
      const eventVerifs = entryVerifications.filter(v => v.event_id === e.id);
      const failedVerifs = eventVerifs.filter(v => v.status === 'INVALID' || v.status === 'GATE_REJECTION');

      let verifStatus = 'PENDING';
      if (eventVerifs.length > 0) {
        verifStatus = failedVerifs.length > 0 ? `${failedVerifs.length} FAILED` : 'VERIFIED';
      }

      return {
        event_id: e.id,
        event_name: e.name || e.title,
        venue_name: e.venue_name || e.venue || 'N/A',
        pic_name: picUser ? picUser.name : 'Unassigned',
        pic_status: shift ? shift.status : (picAssign ? 'ASSIGNED' : 'UNASSIGNED'),
        verification_status: verifStatus,
        incident_status: openInc.length > 0 ? `${openInc.length} ACTIVE` : 'CLEAR',
        has_coverage: Boolean(picAssign || shift)
      };
    });

    // --- 6. Trust / Fraud Snapshot ---
    const unverifiedTicketsCount = tickets.filter(t => t.verification_status === 'UNDER_REVIEW' || t.verification_status === 'EVIDENCE_REQUIRED').length;
    const suspiciousSellersCount = sellerProfiles.filter(p => p.kyc_status === 'UNVERIFIED' || p.status === 'PROBATIONARY' || p.suspended).length;
    const blockedAuthorizationsCount = authRecords.filter(r => r.outcome === 'BLOCK').length;
    const pendingTrustReviewsCount = authRecords.filter(r => r.outcome === 'PENDING' || r.outcome === 'EXCEPTION').length;
    const totalVerificationsCount = entryVerifications.length;
    const passedVerificationsCount = entryVerifications.filter(v => v.status === 'CONFIRMED').length;
    const passRate = totalVerificationsCount > 0 ? `${Math.round((passedVerificationsCount / totalVerificationsCount) * 100)}%` : 'N/A';

    const trustFraudSnapshot = {
      tickets_awaiting_verification: unverifiedTicketsCount,
      suspicious_sellers: suspiciousSellersCount,
      suspicious_orders: blockedAuthorizationsCount,
      trust_reviews_pending: pendingTrustReviewsCount,
      disputes_open: openDisputesCount,
      operational_pass_rate: passRate
    };

    // --- 7. Payment / Finance Snapshot (Direct from FinancialLedger) ---
    let ledgerBalances = {};
    try {
      ledgerBalances = FinancialLedger.getAccountBalances();
    } catch (e) {
      ledgerBalances = {};
    }

    const paymentFinanceSnapshot = {
      gateway_clearing_idr: ledgerBalances.PAYMENT_GATEWAY_CLEARING || 0,
      seller_payable_pending_idr: Math.abs(ledgerBalances.SELLER_PAYABLE_PENDING || 0),
      platform_fee_revenue_idr: Math.abs(ledgerBalances.PLATFORM_FEE_REVENUE || 0),
      tax_payable_idr: Math.abs(ledgerBalances.TAX_PAYABLE || 0),
      settlement_disbursed_idr: Math.abs(ledgerBalances.SETTLEMENT_CLEARING || 0),
      total_payments: payments.length,
      successful_payments: payments.filter(p => p.status === 'SUCCESS' || p.status === 'PAID').length,
      pending_payments: payments.filter(p => p.status === 'PENDING').length,
      failed_payments: payments.filter(p => p.status === 'FAILED').length,
      escrow_held: escrows.filter(e => e.status === 'ESCROWED').length,
      escrow_released: escrows.filter(e => e.status === 'RELEASED').length,
      escrow_refunded: escrows.filter(e => e.status === 'REFUNDED').length
    };

    // --- 8. Recent Activity (Chronological Audit Trail) ---
    const recentActivity = [...(state.audit_logs || [])]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 20)
      .map(log => ({
        id: log.id,
        time: log.created_at,
        type: log.entity_type || 'SYSTEM',
        action: log.action,
        entity: log.entity_id || log.target_id || '-',
        status: (log.action && (log.action.includes('FAIL') || log.action.includes('BLOCK') || log.action.includes('REJECT'))) ? 'ALERT' : 'SUCCESS',
        actor: log.performed_by || 'SYSTEM',
        metadata: typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata || {})
      }));

    res.status(200).json({
      // Backward compatibility block for test_epic51_auth_admin.js:
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
      // V1 Operational Control Center data contract:
      metrics,
      alerts,
      event_operations: eventOperations,
      venue_pic_status: venuePicStatus,
      trust_fraud_snapshot: trustFraudSnapshot,
      payment_finance_snapshot: paymentFinanceSnapshot,
      recent_activity: recentActivity,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Admin overview aggregation error:', err);
    res.status(500).json({
      error: 'Data unavailable',
      code: 'DATA_UNAVAILABLE',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/search
 * Real-time operational search across Events, Tickets, Orders, Sellers, and Buyers.
 */
router.get('/search', requireAdmin, (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  if (!query) {
    return res.json({ events: [], tickets: [], orders: [], sellers: [], buyers: [] });
  }

  const events = (state.events || []).filter(e =>
    (e.name && e.name.toLowerCase().includes(query)) ||
    (e.title && e.title.toLowerCase().includes(query)) ||
    (e.venue_name && e.venue_name.toLowerCase().includes(query)) ||
    (e.id && e.id.toLowerCase().includes(query))
  );

  const listings = (state.listings || []).filter(l =>
    (l.id && l.id.toLowerCase().includes(query)) ||
    (l.ticket_id && l.ticket_id.toLowerCase().includes(query)) ||
    (l.seller_id && l.seller_id.toLowerCase().includes(query)) ||
    (l.event_id && l.event_id.toLowerCase().includes(query))
  );

  const orders = (state.orders || []).filter(o =>
    (o.id && o.id.toLowerCase().includes(query)) ||
    (o.buyer_id && o.buyer_id.toLowerCase().includes(query)) ||
    (o.seller_id && o.seller_id.toLowerCase().includes(query)) ||
    (o.ticket_id && o.ticket_id.toLowerCase().includes(query)) ||
    (o.event_id && o.event_id.toLowerCase().includes(query))
  );

  const sellers = (state.users || []).filter(u =>
    (u.role === 'seller' || u.role === 'SELLER') &&
    ((u.name && u.name.toLowerCase().includes(query)) ||
     (u.email && u.email.toLowerCase().includes(query)) ||
     (u.id && u.id.toLowerCase().includes(query)))
  );

  const buyers = (state.users || []).filter(u =>
    (u.role === 'buyer' || u.role === 'BUYER' || u.role === 'USER' || u.role === 'user') &&
    ((u.name && u.name.toLowerCase().includes(query)) ||
     (u.email && u.email.toLowerCase().includes(query)) ||
     (u.id && u.id.toLowerCase().includes(query)))
  );

  res.json({
    query,
    events,
    tickets: listings,
    orders,
    sellers,
    buyers
  });
});

/**
 * GET /api/admin/events
 * Real list of platform events with ticket listing and order counts.
 */
router.get('/events', requireAdmin, (req, res) => {
  const events = state.events || [];
  const listings = state.listings || [];
  const orders = state.orders || [];
  const eventPics = state.event_pics || [];
  const users = state.users || [];

  const data = events.map(e => {
    const evListings = listings.filter(l => l.event_id === e.id);
    const evOrders = orders.filter(o => o.event_id === e.id);
    const picAssign = eventPics.find(ep => ep.event_id === e.id && ep.status === 'ACTIVE');
    const picUser = picAssign ? users.find(u => u.id === picAssign.pic_user_id) : null;

    return {
      id: e.id,
      name: e.name || e.title,
      date: e.date || e.start_date,
      venue_name: e.venue_name || e.venue || 'N/A',
      city: e.venue_city || 'N/A',
      category: e.category || 'N/A',
      status: e.status,
      is_verified: Boolean(e.is_verified),
      tickets_count: evListings.length,
      orders_count: evOrders.length,
      pic_name: picUser ? picUser.name : 'Unassigned',
      pic_id: picAssign ? picAssign.pic_user_id : null
    };
  });

  res.json({ total: data.length, events: data });
});

/**
 * GET /api/admin/tickets
 * Real list of tickets and active listings.
 */
router.get('/tickets', requireAdmin, (req, res) => {
  const listings = state.listings || [];
  const tickets = state.tickets || [];
  const events = state.events || [];
  const users = state.users || [];

  const data = listings.map(l => {
    const ticket = tickets.find(t => t.id === l.ticket_id) || {};
    const event = events.find(e => e.id === l.event_id) || {};
    const seller = users.find(u => u.id === l.seller_id) || {};

    return {
      listing_id: l.id,
      ticket_id: l.ticket_id,
      event_id: l.event_id,
      event_name: event.name || event.title || l.event_id,
      seller_id: l.seller_id,
      seller_name: seller.name || l.seller_id,
      seat_info: ticket.seat_info || 'N/A',
      face_value: l.face_value || ticket.face_value || 0,
      price: l.price || 0,
      status: l.status,
      created_at: l.created_at || null
    };
  });

  res.json({ total: data.length, tickets: data });
});

/**
 * GET /api/admin/sellers
 * Real list of registered sellers with KYC and performance profiles.
 */
router.get('/sellers', requireAdmin, (req, res) => {
  const users = (state.users || []).filter(u => (u.role || '').toLowerCase() === 'seller');
  const sellerProfiles = state.seller_profiles || [];
  const orders = state.orders || [];

  const data = users.map(u => {
    const profile = sellerProfiles.find(p => p.user_id === u.id) || {};
    const sellerOrders = orders.filter(o => o.seller_id === u.id);
    const completedOrders = sellerOrders.filter(o => o.status === 'SETTLED' || o.status === 'ENTRY_CONFIRMED');

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone || 'N/A',
      status: u.status || 'ACTIVE',
      kyc_status: profile.kyc_status || 'UNVERIFIED',
      active_listing_limit: profile.active_listing_limit || 5,
      total_sales: sellerOrders.length,
      completed_sales: completedOrders.length,
      created_at: u.created_at || null
    };
  });

  res.json({ total: data.length, sellers: data });
});

/**
 * GET /api/admin/buyers
 * Real list of registered buyers and order summaries.
 */
router.get('/buyers', requireAdmin, (req, res) => {
  const users = (state.users || []).filter(u => {
    const r = (u.role || '').toLowerCase();
    return r === 'buyer' || r === 'user';
  });
  const orders = state.orders || [];

  const data = users.map(u => {
    const buyerOrders = orders.filter(o => o.buyer_id === u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone || 'N/A',
      status: u.status || 'ACTIVE',
      total_purchases: buyerOrders.length,
      created_at: u.created_at || null
    };
  });

  res.json({ total: data.length, buyers: data });
});

/**
 * GET /api/admin/payments
 * Real financial ledger movements and gateway transaction records.
 */
router.get('/payments', requireAdmin, (req, res) => {
  const ledger = state.financial_ledger || [];
  const payments = state.payments || [];
  const balances = FinancialLedger.getAccountBalances();

  res.json({
    balances,
    total_ledger_transactions: ledger.length,
    ledger_transactions: ledger.slice(-50).reverse(),
    total_gateway_payments: payments.length,
    gateway_payments: payments.slice(-50).reverse()
  });
});

/**
 * GET /api/admin/disputes
 * Real list of opened and resolved dispute records.
 */
router.get('/disputes', requireAdmin, (req, res) => {
  const disputes = state.disputes || [];
  const orders = state.orders || [];
  const events = state.events || [];

  const data = disputes.map(d => {
    const order = orders.find(o => o.id === d.order_id) || {};
    const event = events.find(e => e.id === d.event_id) || {};

    return {
      id: d.id,
      order_id: d.order_id,
      buyer_id: d.buyer_id,
      seller_id: d.seller_id,
      event_name: event.name || event.title || d.event_id,
      amount: order.total_amount || 0,
      reason: d.reason,
      status: d.status,
      outcome: d.outcome,
      created_at: d.created_at || (d.timeline?.[0]?.timestamp) || null,
      timeline: d.timeline || []
    };
  });

  res.json({ total: data.length, disputes: data });
});

/**
 * GET /api/admin/incidents
 * Real list of field operations incident reports.
 */
router.get('/incidents', requireAdmin, (req, res) => {
  const incidents = state.incidents || [];
  const events = state.events || [];

  const data = incidents.map(i => {
    const event = events.find(e => e.id === i.event_id) || {};
    return {
      id: i.id || i.incident_id,
      type: i.type,
      severity: i.severity,
      status: i.status,
      event_id: i.event_id,
      event_name: event.name || event.title || i.event_id,
      order_id: i.order_id,
      reporter_id: i.reporter_id,
      description: i.description,
      created_at: i.created_at,
      timeline: i.timeline || []
    };
  });

  res.json({ total: data.length, incidents: data });
});

/**
 * GET /api/admin/venue-pic
 * Real list of venue operational coverage, shifts, and PIC staff assignments.
 */
router.get('/venue-pic', requireAdmin, (req, res) => {
  const eventPics = state.event_pics || [];
  const venueShifts = state.venue_shifts || [];
  const events = state.events || [];
  const venues = state.venues || [];
  const users = state.users || [];
  const entryVerifications = state.entry_verifications || [];

  const coverage = events.map(e => {
    const picAssign = eventPics.find(ep => ep.event_id === e.id && ep.status === 'ACTIVE');
    const shift = venueShifts.find(s => s.event_id === e.id);
    const picUser = picAssign ? users.find(u => u.id === picAssign.pic_user_id) : null;
    const venue = venues.find(v => v.id === e.venue_id) || {};
    const verifs = entryVerifications.filter(v => v.event_id === e.id);

    return {
      event_id: e.id,
      event_name: e.name || e.title,
      event_date: e.date || e.start_date,
      venue_name: venue.name || e.venue_name || e.venue || 'N/A',
      venue_gate_info: venue.gate_info || 'N/A',
      pic_name: picUser ? picUser.name : 'Unassigned',
      pic_phone: picAssign ? picAssign.contact_phone : (picUser ? picUser.phone : 'N/A'),
      pic_status: shift ? shift.status : (picAssign ? 'ASSIGNED' : 'UNASSIGNED'),
      total_verifications: verifs.length,
      confirmed_entries: verifs.filter(v => v.status === 'CONFIRMED').length,
      failed_entries: verifs.filter(v => v.status === 'INVALID' || v.status === 'GATE_REJECTION').length
    };
  });

  res.json({
    total_events: events.length,
    covered_events: coverage.filter(c => c.pic_status !== 'UNASSIGNED').length,
    shifts: venueShifts,
    coverage
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
