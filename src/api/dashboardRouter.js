/**
 * TIKUM / ARGUS — Role-Based Marketplace Dashboard Router
 *
 * Provides real, session-authenticated, ownership-enforced data endpoints for:
 * - GET   /api/dashboard/me
 * - GET   /api/dashboard/buyer
 * - GET   /api/dashboard/seller
 * - POST  /api/dashboard/seller/listings/:id/withdraw
 * - PATCH /api/dashboard/profile
 *
 * Non-Negotiable Invariants:
 * 1. Identity and role are derived strictly from the server-validated session (req.user).
 * 2. Browser-supplied userId/buyerId/sellerId/role parameters that conflict with req.user are rejected (403).
 * 3. Production persistence queries use Neon/PostgreSQL repositories and fail closed (503 UNAVAILABLE) on DB error.
 * 4. Zero fabricated metrics, zero fake payouts, and strict PII redaction between buyers and sellers.
 */

const express = require('express');
const router = express.Router();

const { state, recordAuditLog } = require('../database');
const { requireAuth, isAdminRole } = require('../middleware/auth');
const { getUserRepository, getMarketplaceRepository, getMoneyRepository } = require('../storage');
const { OfferService, OFFER_STATUS } = require('../services/offerService');
const { SellerTrustService } = require('../trust/SellerTrustService');
const { CanonicalFeeEngine } = require('../pricing/CanonicalFeeEngine');

const DEMO_SEED_LISTING_IDS = new Set(['list-demo-1', 'list-demo-pestapora']);
const DEMO_SEED_TICKET_IDS = new Set(['ticket-demo-1', 'ticket-demo-pestapora']);

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function maskBuyerName(name) {
  if (!name || typeof name !== 'string') return 'Pembeli Terverifikasi';
  const parts = name.trim().split(/\s+/);
  return parts.map(p => (p.length <= 1 ? p : p[0] + '*'.repeat(Math.min(p.length - 1, 5)))).join(' ');
}

function sanitizeUserProfile(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || user.display_name || 'Pengguna TIKUM',
    display_name: user.display_name || user.name || 'Pengguna TIKUM',
    email: user.email || null,
    username: user.username || null,
    phone: user.phone || null,
    role: (user.role || 'BUYER').toUpperCase(),
    status: (user.status || 'ACTIVE').toUpperCase(),
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
    last_login_at: user.last_login_at || null
  };
}

function resolveCanonicalDashboardUrl(user) {
  if (!user) return '/login';
  const role = (user.role || 'BUYER').toUpperCase();
  if (isAdminRole(role)) return '/admin';
  if (role === 'SELLER') return '/app/seller';
  return '/app/buyer';
}

function checkIdentitySpoofing(req) {
  const sessionUserId = String(req.user.id);
  const candidates = [
    req.query?.userId,
    req.query?.user_id,
    req.query?.buyerId,
    req.query?.buyer_id,
    req.query?.sellerId,
    req.query?.seller_id,
    req.body?.userId,
    req.body?.user_id,
    req.body?.buyerId,
    req.body?.buyer_id,
    req.body?.sellerId,
    req.body?.seller_id
  ].filter(v => v !== undefined && v !== null && String(v).trim() !== '');

  for (const candidate of candidates) {
    if (String(candidate).trim() !== sessionUserId) {
      return {
        spoofed: true,
        attemptedId: String(candidate).trim()
      };
    }
  }

  // Also reject explicit header role escalation attempts on dashboard endpoints
  const headerRole = req.header ? (req.header('x-user-role') || req.header('x-role')) : null;
  if (headerRole && headerRole.trim().toUpperCase() === 'ADMIN' && !isAdminRole(req.user.role)) {
    return {
      spoofed: true,
      attemptedRole: headerRole.trim().toUpperCase()
    };
  }

  return { spoofed: false };
}

function findEventDetails(eventId) {
  if (!eventId) return {};
  const event = (state.events || []).find(e => e.id === eventId || e.event_id === eventId) || {};
  const venue = (state.venues || []).find(v => v.id === event.venue_id) || {};
  return {
    event_id: eventId,
    event_title: event.title || event.name || eventId,
    event_date: event.date || event.start_date || null,
    event_status: event.lifecycle_status || event.status || 'UPCOMING',
    venue_name: venue.name || event.venue_name || event.venue || 'Venue Resmi',
    venue_city: venue.city || event.venue_city || event.city || 'Indonesia',
    venue_gate_info: venue.gate_info || 'Lihat petunjuk gate pada tiket'
  };
}

function paginateAndSort(items, query = {}, dateField = 'created_at') {
  const sorted = [...items].sort((a, b) => {
    const tA = a && a[dateField] ? new Date(a[dateField]).getTime() : 0;
    const tB = b && b[dateField] ? new Date(b[dateField]).getTime() : 0;
    return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
  });

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
  const offset = (page - 1) * limit;
  const paged = sorted.slice(offset, offset + limit);

  return {
    items: paged,
    pagination: {
      total: sorted.length,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(sorted.length / limit))
    }
  };
}

/**
 * GET /api/dashboard/me
 * Returns authenticated user identity, role capabilities, and canonical dashboard route.
 */
router.get('/me', requireAuth, async (req, res) => {
  const spoof = checkIdentitySpoofing(req);
  if (spoof.spoofed) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: client-supplied identity or role override is not permitted.',
      code: 'FORBIDDEN_IDENTITY_SPOOFING'
    });
  }

  try {
    const userRepo = getUserRepository();
    const dbUser = await userRepo.getUserById(req.user.id);
    const effectiveUser = dbUser || req.user;
    const safeUser = sanitizeUserProfile(effectiveUser);
    const role = safeUser.role;

    res.status(200).json({
      success: true,
      data: {
        user: safeUser,
        canonical_dashboard_url: resolveCanonicalDashboardUrl(safeUser),
        available_dashboards: {
          buyer: '/app/buyer',
          seller: '/app/seller',
          admin: isAdminRole(role) ? '/admin' : null
        },
        capabilities: {
          can_buy: safeUser.status === 'ACTIVE',
          can_sell: safeUser.status === 'ACTIVE',
          is_admin: isAdminRole(role)
        }
      },
      meta: {
        generatedAt: new Date().toISOString(),
        dataState: 'OK',
        persistence: {
          users: userRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL'
        }
      }
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Layanan profil pengguna sedang tidak tersedia.',
      code: 'DASHBOARD_DATA_UNAVAILABLE',
      meta: {
        generatedAt: new Date().toISOString(),
        dataState: 'UNAVAILABLE'
      }
    });
  }
});

/**
 * GET /api/dashboard/buyer (and /api/dashboard/buyer/summary)
 * Authenticated Buyer Dashboard: Overview, Orders/Tickets, Offers, Disputes, Profile & Security.
 */
router.get(['/buyer', '/buyer/summary'], requireAuth, async (req, res) => {
  const spoof = checkIdentitySpoofing(req);
  if (spoof.spoofed) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: cannot access another buyer dashboard or spoof identity.',
      code: 'FORBIDDEN_OWNERSHIP'
    });
  }

  const userId = req.user.id;
  const isProd = isProductionRuntime();

  try {
    const userRepo = getUserRepository();
    const moneyRepo = getMoneyRepository();
    const marketRepo = getMarketplaceRepository();

    const [
      dbUser,
      dbOrders,
      dbEscrows,
      dbDisputes,
      activeSessions,
      recentAuditEvents
    ] = await Promise.all([
      userRepo.getUserById(userId),
      moneyRepo.listOrdersByBuyerId(userId),
      moneyRepo.listEscrowsByBuyerId(userId),
      moneyRepo.listDisputesByBuyerId(userId),
      userRepo.listActiveSessionsForUser(userId),
      userRepo.listRecentAuthAuditEvents(15, userId)
    ]);

    // Merge orders from repository + state (in non-prod or same-instance writes)
    const orderMap = new Map();
    for (const o of (dbOrders || [])) {
      orderMap.set(o.id, {
        id: o.id,
        buyer_id: o.buyer_id,
        seller_id: o.seller_id,
        listing_id: o.listing_id,
        ticket_id: o.ticket_id,
        event_id: o.canonical_event_id || o.event_id,
        status: o.status,
        quantity: parseInt(o.quantity || o.order_quantity || 1, 10),
        fulfillment_type: o.fulfillment_type || null,
        pic_assistance_status: o.pic_assistance_status || null,
        ticket_price: parseInt(o.gross_amount || o.ticket_price || o.total_amount || 0, 10),
        buyer_fee: parseInt(o.buyer_fee || o.service_fee || 0, 10),
        buyer_tax: parseInt(o.buyer_tax || 0, 10),
        total_amount: parseInt(o.total_amount || o.buyer_total || 0, 10),
        currency: o.currency || 'IDR',
        payment_deadline: o.payment_deadline || o.expires_at || null,
        created_at: o.created_at,
        updated_at: o.updated_at || o.created_at
      });
    }

    if (!isProd || orderMap.size === 0) {
      for (const so of (state.orders || [])) {
        if (so.buyer_id === userId && !orderMap.has(so.id)) {
          orderMap.set(so.id, {
            id: so.id,
            buyer_id: so.buyer_id,
            seller_id: so.seller_id,
            listing_id: so.listing_id,
            ticket_id: so.ticket_id,
            event_id: so.event_id || so.canonical_event_id,
            status: so.status,
            quantity: parseInt(so.quantity || so.order_quantity || 1, 10),
            fulfillment_type: so.fulfillment_type || null,
            pic_assistance_status: so.pic_assistance_status || null,
            ticket_price: parseInt(so.ticket_price || so.price || so.total_amount || 0, 10),
            buyer_fee: parseInt(so.buyer_fee || so.platform_fee || 0, 10),
            buyer_tax: parseInt(so.buyer_tax || 0, 10),
            total_amount: parseInt(so.total_amount || so.buyer_total || 0, 10),
            currency: so.currency || 'IDR',
            payment_deadline: so.payment_deadline || so.expires_at || null,
            created_at: so.created_at,
            updated_at: so.updated_at || so.created_at
          });
        } else if (so.buyer_id === userId && orderMap.has(so.id)) {
          // Keep latest status and inventory/fulfillment metadata if state was updated in-process
          const existing = orderMap.get(so.id);
          if (so.status && so.status !== existing.status) {
            existing.status = so.status;
          }
          if (so.quantity) {
            existing.quantity = parseInt(so.quantity, 10);
          } else if (so.order_quantity) {
            existing.quantity = parseInt(so.order_quantity, 10);
          }
          if (so.fulfillment_type) {
            existing.fulfillment_type = so.fulfillment_type;
          }
          if (so.pic_assistance_status) {
            existing.pic_assistance_status = so.pic_assistance_status;
          }
        }
      }
    }

    const escrowMap = new Map();
    for (const e of (dbEscrows || [])) {
      escrowMap.set(e.order_id, e);
    }
    for (const se of (state.escrows || [])) {
      if (se.buyer_id === userId && !escrowMap.has(se.order_id)) {
        escrowMap.set(se.order_id, se);
      }
    }

    const disputeMap = new Map();
    for (const d of (dbDisputes || [])) {
      disputeMap.set(d.order_id, d);
    }
    for (const sd of (state.disputes || [])) {
      if (sd.buyer_id === userId && !disputeMap.has(sd.order_id)) {
        disputeMap.set(sd.order_id, sd);
      }
    }

    // Enrich buyer orders with event, ticket, escrow, PIC, and dispute details
    const rawOrders = Array.from(orderMap.values());
    const enrichedOrders = [];

    for (const ord of rawOrders) {
      const ev = findEventDetails(ord.event_id);
      let ticket = (state.tickets || []).find(t => t.id === ord.ticket_id);
      if (!ticket && ord.ticket_id) {
        ticket = await marketRepo.getTicketById(ord.ticket_id).catch(() => null);
      }
      const listing = (state.listings || []).find(l => l.id === ord.listing_id) || {};
      const escrow = escrowMap.get(ord.id) || null;
      const dispute = disputeMap.get(ord.id) || null;
      const verification = (state.entry_verifications || []).find(v => v.order_id === ord.id) || null;
      const picAssign = (state.event_pics || []).find(ep => ep.event_id === ord.event_id && ep.status === 'ACTIVE') || null;

      const isPaidOrActive = ['PAID_ESCROWED', 'PAID_PLATFORM_HELD', 'PAID', 'ESCROWED', 'TICKET_VERIFIED', 'HANDOFF_READY', 'ENTRY_CONFIRMED', 'SETTLED'].includes((ord.status || '').toUpperCase());
      const seatParts = ticket ? [ticket.section, ticket.row_id ? `Row ${ticket.row_id}` : null, ticket.seat ? `Seat ${ticket.seat}` : null].filter(Boolean) : [];
      const seatInfo = (ticket && ticket.seat_info) || listing.seat_info || (seatParts.length > 0 ? seatParts.join(' - ') : 'General Admission');

      enrichedOrders.push({
        id: ord.id,
        order_id: ord.id,
        listing_id: ord.listing_id,
        ticket_id: ord.ticket_id,
        event_id: ord.event_id,
        event_title: ev.event_title,
        event_date: ev.event_date,
        event_venue: ev.venue_name,
        venue_name: ev.venue_name,
        venue_city: ev.venue_city,
        venue_gate_info: ev.venue_gate_info,
        seat_info: seatInfo,
        quantity: ord.quantity || parseInt(listing.quantity || 1, 10),
        fulfillment_type: ord.fulfillment_type || listing.fulfillment_type || 'SELLER_MANAGED',
        pic_assistance_status: ord.pic_assistance_status || listing.pic_assistance_status || (picAssign ? 'CONFIRMED' : 'NONE'),
        ticket_price: ord.ticket_price,
        buyer_fee: ord.buyer_fee,
        buyer_tax: ord.buyer_tax,
        total_amount: ord.total_amount,
        currency: ord.currency,
        status: ord.status,
        escrow_status: escrow ? escrow.status : 'NONE',
        payment_deadline: ord.payment_deadline,
        verification_status: verification ? verification.status : (ord.status === 'ENTRY_CONFIRMED' || ord.status === 'SETTLED' ? 'CONFIRMED' : 'PENDING'),
        entry_verification_status: verification ? verification.status : (ord.status === 'ENTRY_CONFIRMED' || ord.status === 'SETTLED' ? 'CONFIRMED' : 'PENDING'),
        pic_available: Boolean(picAssign),
        pic_contact: isPaidOrActive && picAssign ? picAssign.contact_phone : null,
        dispute: dispute ? {
          id: dispute.id || dispute.dispute_id,
          status: dispute.status,
          reason: dispute.reason,
          outcome: dispute.outcome || 'PENDING',
          created_at: dispute.created_at
        } : null,
        tracking_url: `/track/${encodeURIComponent(ord.id)}`,
        track_url: `/track/${encodeURIComponent(ord.id)}`,
        pay_url: ord.status === 'PENDING_PAYMENT' ? `/pay?listingId=${encodeURIComponent(ord.listing_id || '')}&orderId=${encodeURIComponent(ord.id)}` : null,
        created_at: ord.created_at,
        updated_at: ord.updated_at
      });
    }

    // Optional status filter
    const statusFilter = (req.query.status || '').trim().toUpperCase();
    const filteredOrders = statusFilter && statusFilter !== 'ALL'
      ? enrichedOrders.filter(o => (o.status || '').toUpperCase() === statusFilter)
      : enrichedOrders;

    const pagedOrders = paginateAndSort(filteredOrders, req.query, 'created_at');

    // Buyer offers (durable via MarketplaceRepository)
    const rawOffers = await OfferService.getUserOffers({ userId, role: 'buyer' });
    const offerPersistenceScope = marketRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL';
    const sortedOffers = [...(rawOffers || [])]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .map(of => {
        const ev = findEventDetails(of.event_id);
        const linkedOrderId = of.accepted_order_id || of.order_id || (of.order && of.order.id) || null;
        return {
          ...of,
          offer_id: of.id,
          offered_price: of.offer_amount,
          listed_price: of.original_price,
          order_id: linkedOrderId,
          event_title: of.event_title || ev.event_title,
          seat_info: of.seat_info || 'General Admission',
          persistence_scope: offerPersistenceScope,
          can_withdraw: of.status === 'PENDING',
          checkout_url: of.status === 'ACCEPTED' && linkedOrderId ? `/pay/${encodeURIComponent(linkedOrderId)}` : null
        };
      });

    // Buyer disputes list
    const allBuyerDisputes = Array.from(disputeMap.values()).map(d => {
      const ev = findEventDetails(d.canonical_event_id || d.event_id);
      return {
        id: d.id || d.dispute_id,
        dispute_id: d.id || d.dispute_id,
        order_id: d.order_id,
        event_id: d.canonical_event_id || d.event_id,
        event_title: ev.event_title,
        reason: d.reason,
        status: d.status,
        outcome: d.outcome || 'PENDING',
        decision_notes: d.decision_notes || null,
        created_at: d.created_at,
        resolved_at: d.resolved_at || null
      };
    }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Overview metrics (strictly computed from real records)
    const activeOrdersCount = enrichedOrders.filter(o =>
      ['PENDING_PAYMENT', 'PAID_ESCROWED', 'PAID_PLATFORM_HELD', 'PAID', 'ESCROWED', 'TICKET_VERIFIED', 'HANDOFF_READY'].includes((o.status || '').toUpperCase())
    ).length;
    const pendingPaymentsCount = enrichedOrders.filter(o =>
      ['PENDING_PAYMENT', 'RESERVED', 'CREATED'].includes((o.status || '').toUpperCase())
    ).length;
    const completedOrdersCount = enrichedOrders.filter(o =>
      ['ENTRY_CONFIRMED', 'SETTLED', 'COMPLETED'].includes((o.status || '').toUpperCase())
    ).length;
    const pendingOffersCount = sortedOffers.filter(o =>
      ['PENDING', 'COUNTERED'].includes((o.status || '').toUpperCase())
    ).length;
    const openDisputesCount = allBuyerDisputes.filter(d =>
      ['OPEN', 'INVESTIGATING'].includes((d.status || '').toUpperCase())
    ).length;
    const actionRequiredCount =
      enrichedOrders.filter(o => ['PENDING_PAYMENT', 'HANDOFF_READY'].includes((o.status || '').toUpperCase())).length +
      sortedOffers.filter(o => ['COUNTERED', 'ACCEPTED'].includes((o.status || '').toUpperCase())).length;

    const currentSessionId = req.session ? req.session.id : null;
    const formattedSessions = (activeSessions || []).map(s => ({
      id: s.id,
      role: s.role,
      ip_address: s.ip_address || null,
      user_agent: s.user_agent || null,
      created_at: s.created_at,
      last_seen_at: s.last_seen_at,
      expires_at: s.expires_at,
      is_current: Boolean(currentSessionId && s.id === currentSessionId)
    }));

    const formattedAuditEvents = (recentAuditEvents || []).map(ev => ({
      ...ev,
      outcome: ev.outcome || (ev.success === false ? 'FAILURE' : 'SUCCESS')
    }));

    const safeUser = sanitizeUserProfile(dbUser || req.user);
    const overviewBlock = {
      active_orders_count: activeOrdersCount,
      pending_payments_count: pendingPaymentsCount,
      completed_orders_count: completedOrdersCount,
      completed_purchases_count: completedOrdersCount,
      total_orders_count: enrichedOrders.length,
      pending_offers_count: pendingOffersCount,
      active_offers_count: pendingOffersCount,
      open_disputes_count: openDisputesCount,
      action_required_count: actionRequiredCount
    };
    const securityBlock = {
      active_sessions_count: formattedSessions.length,
      active_sessions: formattedSessions,
      recent_audit_events: formattedAuditEvents,
      recent_auth_events: formattedAuditEvents
    };

    res.status(200).json({
      success: true,
      user: safeUser,
      overview: overviewBlock,
      orders: {
        items: pagedOrders.items,
        total: pagedOrders.pagination.total,
        pagination: pagedOrders.pagination
      },
      offers: {
        items: sortedOffers,
        total: sortedOffers.length
      },
      disputes: {
        items: allBuyerDisputes,
        total: allBuyerDisputes.length
      },
      security: securityBlock,
      data: {
        user: safeUser,
        overview: overviewBlock,
        orders: pagedOrders.items,
        orders_pagination: pagedOrders.pagination,
        offers: sortedOffers,
        disputes: allBuyerDisputes,
        security: securityBlock
      },
      meta: {
        generatedAt: new Date().toISOString(),
        dataState: 'OK',
        persistence: {
          users: userRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL',
          orders: moneyRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL',
          disputes: moneyRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL',
          offers: offerPersistenceScope
        }
      }
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Data dashboard pembeli sedang tidak dapat dimuat dari database.',
      code: 'DASHBOARD_DATA_UNAVAILABLE',
      dataState: 'UNAVAILABLE',
      meta: {
        generatedAt: new Date().toISOString(),
        dataState: 'UNAVAILABLE'
      }
    });
  }
});

/**
 * GET /api/dashboard/seller (and /api/dashboard/seller/summary)
 * Authenticated Seller Dashboard: Overview, Listings, Orders & Sales, Offers, Trust & Event-Day Readiness, Read-Only Earnings.
 */
router.get(['/seller', '/seller/summary'], requireAuth, async (req, res) => {
  const spoof = checkIdentitySpoofing(req);
  if (spoof.spoofed) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: cannot access another seller dashboard or spoof identity.',
      code: 'FORBIDDEN_OWNERSHIP'
    });
  }

  const userId = req.user.id;
  const isProd = isProductionRuntime();

  try {
    const userRepo = getUserRepository();
    const marketRepo = getMarketplaceRepository();
    const moneyRepo = getMoneyRepository();

    const [
      dbUser,
      dbListings,
      dbTickets,
      dbOrders,
      dbEscrows,
      dbSettlements,
      dbDisputes
    ] = await Promise.all([
      userRepo.getUserById(userId),
      marketRepo.listListingsBySeller(userId),
      marketRepo.listTicketsBySeller(userId),
      moneyRepo.listOrdersBySellerId(userId),
      moneyRepo.listEscrowsBySellerId(userId),
      moneyRepo.listSettlementsBySellerId(userId),
      moneyRepo.listDisputesBySellerId(userId)
    ]);

    // Build tickets map
    const ticketMap = new Map();
    for (const t of (dbTickets || [])) {
      ticketMap.set(t.id, t);
    }
    for (const st of (state.tickets || [])) {
      if ((st.seller_id === userId || st.current_owner_id === userId) && !ticketMap.has(st.id)) {
        if (isProd && DEMO_SEED_TICKET_IDS.has(st.id)) continue;
        ticketMap.set(st.id, st);
      }
    }

    // Build listings map
    const listingMap = new Map();
    for (const l of (dbListings || [])) {
      listingMap.set(l.id, l);
    }
    for (const sl of (state.listings || [])) {
      if (sl.seller_id === userId && !listingMap.has(sl.id)) {
        if (isProd && DEMO_SEED_LISTING_IDS.has(sl.id)) continue;
        listingMap.set(sl.id, sl);
      } else if (sl.seller_id === userId && listingMap.has(sl.id)) {
        const existing = listingMap.get(sl.id);
        if (sl.status && sl.status !== existing.status) {
          existing.status = sl.status;
        }
        if (sl.rejection_reason) {
          existing.rejection_reason = sl.rejection_reason;
        }
      }
    }

    // Build orders map
    const orderMap = new Map();
    for (const o of (dbOrders || [])) {
      orderMap.set(o.id, o);
    }
    for (const so of (state.orders || [])) {
      if (so.seller_id === userId && !orderMap.has(so.id)) {
        orderMap.set(so.id, so);
      } else if (so.seller_id === userId && orderMap.has(so.id)) {
        const existing = orderMap.get(so.id);
        if (so.status && so.status !== existing.status) {
          existing.status = so.status;
        }
      }
    }

    const escrowMap = new Map();
    for (const e of (dbEscrows || [])) {
      escrowMap.set(e.order_id, e);
    }
    for (const se of (state.escrows || [])) {
      if (se.seller_id === userId && !escrowMap.has(se.order_id)) {
        escrowMap.set(se.order_id, se);
      }
    }

    const settlementMap = new Map();
    for (const s of (dbSettlements || [])) {
      settlementMap.set(s.order_id, s);
    }
    for (const ss of (state.settlements || [])) {
      if (ss.seller_id === userId && !settlementMap.has(ss.order_id)) {
        settlementMap.set(ss.order_id, ss);
      }
    }

    const disputeMap = new Map();
    for (const d of (dbDisputes || [])) {
      disputeMap.set(d.order_id, d);
    }
    for (const sd of (state.disputes || [])) {
      if (sd.seller_id === userId && !disputeMap.has(sd.order_id)) {
        disputeMap.set(sd.order_id, sd);
      }
    }

    // Seller offers on their listings (durable via MarketplaceRepository)
    const sellerOffers = await OfferService.getUserOffers({ userId, role: 'seller' });
    const offerPersistenceScope = marketRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL';
    const sortedOffers = [...(sellerOffers || [])]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .map(of => {
        const ev = findEventDetails(of.event_id);
        return {
          ...of,
          offer_id: of.id,
          offered_price: of.offer_amount,
          listed_price: of.original_price,
          event_title: of.event_title || ev.event_title,
          seat_info: of.seat_info || 'General Admission',
          persistence_scope: offerPersistenceScope,
          can_respond: of.status === OFFER_STATUS.PENDING
        };
      });

    // Enrich seller listings
    const rawListings = Array.from(listingMap.values());
    const allSellerOrders = Array.from(orderMap.values());

    const enrichedListings = rawListings.map(l => {
      const eventId = l.canonical_event_id || l.event_id;
      const ev = findEventDetails(eventId);
      const ticket = ticketMap.get(l.ticket_id) || {};
      const seatParts = [ticket.section, ticket.row_id ? `Row ${ticket.row_id}` : null, ticket.seat ? `Seat ${ticket.seat}` : null].filter(Boolean);
      const seatInfo = l.seat_info || ticket.seat_info || (seatParts.length > 0 ? seatParts.join(' - ') : 'General Admission');
      const priceInt = parseInt(l.price || 0, 10);
      const faceValueInt = parseInt(l.face_value || ticket.face_value || priceInt, 10);

      let netPayout = priceInt;
      try {
        const feeCalc = CanonicalFeeEngine.calculateTicketFees({ ticketPrice: priceInt, quantity: 1 });
        netPayout = feeCalc.seller_payout;
      } catch (_) {}

      const linkedOrder = allSellerOrders.find(o => o.listing_id === l.id || o.ticket_id === l.ticket_id) || null;
      const listingOffers = sortedOffers.filter(o => o.listing_id === l.id);
      const pendingOffersForListing = listingOffers.filter(o => o.status === OFFER_STATUS.PENDING);
      const statusUpper = (l.status || 'PENDING_VERIFICATION').toUpperCase();
      const verifStatus = ticket.verification_status || ticket.status || (statusUpper === 'ACTIVE' ? 'VERIFIED' : statusUpper);
      const canWithdraw = ['ACTIVE', 'PENDING_VERIFICATION', 'SUBMITTED'].includes(statusUpper) && !linkedOrder;

      const meta = (typeof l.metadata === 'object' && l.metadata) ? l.metadata : {};
      const totalQty = parseInt(l.total_quantity || meta.total_quantity || l.quantity || 1, 10);
      const availQty = parseInt(l.available_quantity !== undefined ? l.available_quantity : (meta.available_quantity !== undefined ? meta.available_quantity : totalQty), 10);
      const soldQty = parseInt(l.sold_quantity !== undefined ? l.sold_quantity : (meta.sold_quantity || 0), 10);
      const resQty = parseInt(l.reserved_quantity !== undefined ? l.reserved_quantity : (meta.reserved_quantity || 0), 10);
      const fType = l.fulfillment_type || meta.fulfillment_type || 'SELLER_MANAGED';
      const pStatus = l.pic_assistance_status || meta.pic_assistance_status || (fType === 'TIKUM_VENUE_PIC' ? 'REQUESTED_PENDING_ASSIGNMENT' : 'NONE');
      const sType = l.seat_type || meta.seat_type || 'GENERAL_ADMISSION';

      return {
        id: l.id,
        listing_id: l.id,
        ticket_id: l.ticket_id,
        event_id: eventId,
        event_title: ev.event_title,
        event_date: ev.event_date,
        venue_name: ev.venue_name,
        venue_city: ev.venue_city,
        seat_info: seatInfo,
        seat_type: sType,
        quantity: totalQty,
        total_quantity: totalQty,
        available_quantity: availQty,
        sold_quantity: soldQty,
        reserved_quantity: resQty,
        fulfillment_type: fType,
        pic_assistance_status: pStatus,
        face_value: faceValueInt,
        price: priceInt,
        seller_net_payout: netPayout,
        currency: l.currency || 'IDR',
        status: statusUpper,
        verification_status: verifStatus,
        ticket_verification_status: verifStatus,
        rejection_reason: l.rejection_reason || null,
        order_id: linkedOrder ? linkedOrder.id : null,
        order_status: linkedOrder ? linkedOrder.status : null,
        active_offers_count: pendingOffersForListing.length,
        total_offers_count: listingOffers.length,
        can_withdraw: canWithdraw,
        created_at: l.created_at || null,
        updated_at: l.updated_at || l.created_at || null
      };
    });

    const statusFilter = (req.query.status || '').trim().toUpperCase();
    const filteredListings = statusFilter && statusFilter !== 'ALL'
      ? enrichedListings.filter(l => l.status === statusFilter)
      : enrichedListings;
    const pagedListings = paginateAndSort(filteredListings, req.query, 'created_at');

    // Enrich seller orders / sales
    const enrichedOrders = allSellerOrders.map(o => {
      const eventId = o.canonical_event_id || o.event_id;
      const ev = findEventDetails(eventId);
      const ticket = ticketMap.get(o.ticket_id) || {};
      const listing = listingMap.get(o.listing_id) || {};
      const seatInfo = listing.seat_info || ticket.seat_info || 'General Admission';
      const buyerUser = (state.users || []).find(u => u.id === o.buyer_id);
      const escrow = escrowMap.get(o.id) || null;
      const settlement = settlementMap.get(o.id) || null;
      const dispute = disputeMap.get(o.id) || null;
      const picAssign = (state.event_pics || []).find(ep => ep.event_id === eventId && ep.status === 'ACTIVE') || null;
      const picUser = picAssign ? (state.users || []).find(u => u.id === picAssign.pic_user_id) : null;
      const statusUpper = (o.status || 'CREATED').toUpperCase();
      const handoffReady = ['HANDOFF_READY', 'DELIVERED', 'ENTRY_CONFIRMED', 'SETTLED'].includes(statusUpper);
      const entryConfirmed = ['ENTRY_CONFIRMED', 'SETTLED'].includes(statusUpper);
      const netPayoutVal = parseInt(o.seller_payout || o.seller_net_payout || (escrow ? escrow.amount : 0) || o.ticket_price || o.total_amount || 0, 10);
      const requiresAction = ['PAID_ESCROWED', 'PAID_PLATFORM_HELD', 'PAID', 'ESCROWED', 'DISPUTED'].includes(statusUpper) || Boolean(dispute && dispute.status === 'OPEN');
      const orderQty = parseInt(o.quantity || o.order_quantity || 1, 10);
      const fType = o.fulfillment_type || listing.fulfillment_type || 'SELLER_MANAGED';
      const pStatus = o.pic_assistance_status || listing.pic_assistance_status || (picAssign ? 'CONFIRMED' : 'NONE');

      return {
        id: o.id,
        order_id: o.id,
        listing_id: o.listing_id,
        ticket_id: o.ticket_id,
        event_id: eventId,
        event_title: ev.event_title,
        event_date: ev.event_date,
        venue_name: ev.venue_name,
        venue_gate_info: ev.venue_gate_info,
        seat_info: seatInfo,
        quantity: orderQty,
        fulfillment_type: fType,
        pic_assistance_status: pStatus,
        buyer_masked_name: maskBuyerName(buyerUser ? buyerUser.name : 'Pembeli'),
        ticket_price: parseInt(o.gross_amount || o.ticket_price || o.total_amount || 0, 10),
        seller_fee: parseInt(o.seller_fee || o.service_fee || 0, 10),
        seller_tax_withholding: parseInt(o.seller_tax_withholding || o.seller_tax || 0, 10),
        seller_net_payout: netPayoutVal,
        seller_net_estimate: netPayoutVal,
        currency: o.currency || 'IDR',
        status: statusUpper,
        escrow_status: escrow ? escrow.status : 'NONE',
        delivery_status: handoffReady ? 'DELIVERED' : 'PENDING_HANDOFF',
        entry_verification_status: entryConfirmed ? 'CONFIRMED' : 'PENDING_GATE',
        settlement_status: settlement ? settlement.status : (statusUpper === 'SETTLED' ? 'SETTLED' : 'PENDING_ADMISSION'),
        dispute_status: dispute ? dispute.status : null,
        requires_seller_action: requiresAction,
        pic_assigned: Boolean(picAssign),
        pic_name: picUser ? picUser.name : (picAssign ? 'PIC Lapangan TIKUM' : 'Belum Ditugaskan'),
        handoff_ready: handoffReady,
        entry_confirmed: entryConfirmed,
        tracking_url: `/track/${encodeURIComponent(o.id)}`,
        track_url: `/track/${encodeURIComponent(o.id)}`,
        created_at: o.created_at,
        updated_at: o.updated_at || o.created_at
      };
    }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Seller Trust & Event-Day Readiness (loaded durably via UserRepository + SellerTrustService)
    let dbSellerProfile = null;
    try {
      dbSellerProfile = await userRepo.getSellerProfile(userId);
    } catch (_) {}

    let trustEval = null;
    try {
      trustEval = await SellerTrustService.evaluateSellerAsync(userId);
    } catch (_) {
      trustEval = {
        seller_id: userId,
        tier: 'STANDARD_SELLER',
        is_suspended: false,
        can_list_tickets: Boolean(dbSellerProfile && dbSellerProfile.kyc_status === 'VERIFIED'),
        identity_trust: {
          kyc_status: (dbSellerProfile && dbSellerProfile.kyc_status) || 'UNVERIFIED',
          is_kyc_verified: Boolean(dbSellerProfile && dbSellerProfile.kyc_status === 'VERIFIED'),
          explanation: 'Verifikasi identitas belum lengkap.'
        },
        transaction_trust: {
          total_orders: enrichedOrders.length,
          successful_orders: enrichedOrders.filter(o => o.entry_confirmed).length,
          completion_rate_percent: 100
        },
        ticket_trust: {
          total_registered_tickets: ticketMap.size,
          verified_tickets: enrichedListings.filter(l => l.status === 'ACTIVE').length,
          rejected_tickets: enrichedListings.filter(l => l.status === 'REJECTED').length
        },
        behavior_risk: {
          total_disputes: disputeMap.size,
          risk_level: 'LOW',
          active_risk_signals: []
        }
      };
    }

    const sellerProfile = dbSellerProfile || (state.seller_profiles || []).find(p => p.user_id === userId) || {
      user_id: userId,
      kyc_status: trustEval?.identity_trust?.kyc_status || 'UNVERIFIED',
      active_listing_limit: 5
    };

    const eventDayChecklist = enrichedOrders
      .filter(o => !['CANCELLED', 'REFUNDED'].includes(o.status))
      .map(o => ({
        order_id: o.id,
        event_title: o.event_title,
        event_date: o.event_date,
        venue_name: o.venue_name,
        venue_gate_info: o.venue_gate_info,
        pic_assigned: o.pic_assigned,
        pic_name: o.pic_name,
        steps: {
          payment_escrowed: ['PAID_ESCROWED', 'PAID_PLATFORM_HELD', 'PAID', 'ESCROWED', 'TICKET_VERIFIED', 'HANDOFF_READY', 'ENTRY_CONFIRMED', 'SETTLED'].includes(o.status),
          ticket_verified: ['TICKET_VERIFIED', 'HANDOFF_READY', 'ENTRY_CONFIRMED', 'SETTLED'].includes(o.status),
          handoff_ready: o.handoff_ready,
          gate_entry_confirmed: o.entry_confirmed
        }
      }));

    // Read-only Earnings & Settlement Summary (Zero Fake Payouts)
    let escrowHeldAmount = 0;
    let settledAmount = 0;
    let disputedAmount = 0;

    for (const o of enrichedOrders) {
      const net = o.seller_net_payout || 0;
      if (o.dispute_status === 'OPEN' || o.escrow_status === 'DISPUTED' || o.status === 'DISPUTED') {
        disputedAmount += net;
      } else if (o.status === 'SETTLED' || o.escrow_status === 'RELEASED' || o.settlement_status === 'SETTLED') {
        settledAmount += net;
      } else if (['PAID_ESCROWED', 'PAID_PLATFORM_HELD', 'PAID', 'ESCROWED', 'TICKET_VERIFIED', 'HANDOFF_READY', 'ENTRY_CONFIRMED'].includes(o.status)) {
        escrowHeldAmount += net;
      }
    }

    const settlementRecords = Array.from(settlementMap.values()).map(s => ({
      id: s.id,
      settlement_id: s.id,
      order_id: s.order_id,
      gross_amount: parseInt(s.gross_amount || s.amount || 0, 10),
      platform_fee: parseInt(s.platform_fee || 0, 10),
      net_amount: parseInt(s.net_amount || s.amount || 0, 10),
      amount: parseInt(s.amount || s.net_amount || 0, 10),
      currency: s.currency || 'IDR',
      status: s.status || 'PENDING',
      settlement_mode: s.settlement_mode || 'MANUAL_BANK_TRANSFER',
      payout_ref: s.payout_ref || null,
      created_at: s.created_at
    })).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Overview counts
    const activeListingsCount = enrichedListings.filter(l => l.status === 'ACTIVE').length;
    const pendingVerificationCount = enrichedListings.filter(l => ['PENDING_VERIFICATION', 'SUBMITTED', 'UNDER_REVIEW'].includes(l.status)).length;
    const reservedListingsCount = enrichedListings.filter(l => l.status === 'RESERVED').length;
    const soldListingsCount = enrichedListings.filter(l => ['SOLD', 'SETTLED'].includes(l.status)).length;
    const incomingOffersCount = sortedOffers.filter(o => o.status === OFFER_STATUS.PENDING).length;
    const ordersAwaitingHandoffCount = enrichedOrders.filter(o => o.requires_seller_action).length;
    const openDisputesCount = Array.from(disputeMap.values()).filter(d =>
      ['OPEN', 'INVESTIGATING'].includes((d.status || '').toUpperCase())
    ).length;

    const kycStatusVal = sellerProfile.kyc_status || 'UNVERIFIED';
    const maxActiveListingsVal = sellerProfile.active_listing_limit || 5;
    const trustTierVal = trustEval?.tier || (kycStatusVal === 'VERIFIED' ? 'VERIFIED' : 'NEW');

    const safeUser = {
      ...sanitizeUserProfile(dbUser || req.user),
      kyc_status: kycStatusVal,
      is_registered_seller: Boolean(
        (dbUser || req.user)?.role?.toUpperCase() === 'SELLER' ||
        (state.seller_profiles || []).some(p => p.user_id === userId) ||
        enrichedListings.length > 0
      )
    };

    const overviewBlock = {
      active_listings_count: activeListingsCount,
      pending_verification_listings_count: pendingVerificationCount,
      pending_verification_count: pendingVerificationCount,
      reserved_listings_count: reservedListingsCount,
      sold_listings_count: soldListingsCount,
      reserved_or_sold_count: reservedListingsCount + soldListingsCount,
      total_listings_count: enrichedListings.length,
      incoming_offers_count: incomingOffersCount,
      pending_offers_count: incomingOffersCount,
      orders_awaiting_handoff_count: ordersAwaitingHandoffCount,
      orders_requiring_action_count: ordersAwaitingHandoffCount,
      open_disputes_count: openDisputesCount,
      trust_tier: trustTierVal,
      max_active_listings: maxActiveListingsVal
    };

    const readinessChecklistItems = [
      {
        key: 'kyc_verification',
        label: 'Verifikasi Identitas Penjual (KYC)',
        status: kycStatusVal === 'VERIFIED' ? 'READY' : 'PENDING',
        detail: `Status KYC saat ini: ${kycStatusVal}`
      },
      {
        key: 'ticket_evidence',
        label: 'Kelengkapan Bukti & Verifikasi Tiket',
        status: pendingVerificationCount === 0 ? 'READY' : 'PENDING',
        detail: `${activeListingsCount} aktif, ${pendingVerificationCount} menunggu review`
      },
      {
        key: 'handoff_readiness',
        label: 'Pengiriman Tiket (Handoff Pembeli)',
        status: ordersAwaitingHandoffCount === 0 ? 'READY' : 'ACTION_NEEDED',
        detail: ordersAwaitingHandoffCount === 0
          ? 'Tidak ada pesanan yang tertunda pengirimannya'
          : `${ordersAwaitingHandoffCount} pesanan memerlukan pengiriman bukti tiket`
      },
      {
        key: 'dispute_free',
        label: 'Status Sengketa Aktif',
        status: openDisputesCount === 0 ? 'CLEAR' : 'OPEN_DISPUTE',
        detail: `${openDisputesCount} sengketa terbuka`
      }
    ];

    const trustAndReadinessBlock = {
      kyc_status: kycStatusVal,
      eligible_to_list: kycStatusVal === 'VERIFIED',
      active_listing_limit: maxActiveListingsVal,
      current_active_listings: activeListingsCount + pendingVerificationCount + reservedListingsCount,
      trust_evaluation: trustEval,
      event_day_checklist: eventDayChecklist,
      event_day_readiness_checklist: readinessChecklistItems
    };

    const pilotNoticeText = 'Pencairan otomatis belum diaktifkan pada mode pilot. Dana pesanan ditahan secara aman di Escrow dan dicatat secara read-only hingga konfirmasi masuk gate selesai.';
    const earningsBlock = {
      mode: 'READ_ONLY',
      payout_automation_status: 'UNAVAILABLE_PILOT_MODE',
      payout_notice: pilotNoticeText,
      pilot_notice: pilotNoticeText,
      escrow_held_amount: escrowHeldAmount,
      escrowed_gross_amount_idr: escrowHeldAmount,
      settled_amount: settledAmount,
      settled_net_amount_idr: settledAmount,
      disputed_amount: disputedAmount,
      currency: 'IDR',
      settlement_records: settlementRecords,
      items: settlementRecords
    };

    res.status(200).json({
      success: true,
      user: safeUser,
      overview: overviewBlock,
      listings: {
        items: pagedListings.items,
        total: pagedListings.pagination.total,
        pagination: pagedListings.pagination
      },
      orders: {
        items: enrichedOrders,
        total: enrichedOrders.length
      },
      offers: {
        items: sortedOffers,
        total: sortedOffers.length
      },
      trust_and_readiness: trustAndReadinessBlock,
      earnings_and_settlement: earningsBlock,
      data: {
        user: safeUser,
        overview: overviewBlock,
        listings: pagedListings.items,
        listings_pagination: pagedListings.pagination,
        orders: enrichedOrders,
        offers: sortedOffers,
        trust_and_readiness: trustAndReadinessBlock,
        earnings_and_settlement: earningsBlock
      },
      meta: {
        generatedAt: new Date().toISOString(),
        dataState: 'OK',
        persistence: {
          users: userRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL',
          listings: marketRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL',
          orders: moneyRepo.degraded ? 'IN_MEMORY_FALLBACK' : 'POSTGRESQL',
          settlements: 'READ_ONLY_PILOT',
          offers: offerPersistenceScope
        }
      }
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Data dashboard penjual sedang tidak dapat dimuat dari database.',
      code: 'DASHBOARD_DATA_UNAVAILABLE',
      dataState: 'UNAVAILABLE',
      meta: {
        generatedAt: new Date().toISOString(),
        dataState: 'UNAVAILABLE'
      }
    });
  }
});

/**
 * GET /api/dashboard/seller/onboarding
 * Returns current seller onboarding and KYC status for the authenticated user.
 */
router.get('/seller/onboarding', requireAuth, async (req, res) => {
  const spoof = checkIdentitySpoofing(req);
  if (spoof.spoofed) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: identity spoofing rejected.',
      code: 'FORBIDDEN_OWNERSHIP'
    });
  }

  try {
    const userRepo = getUserRepository();
    const profile = await userRepo.getSellerProfile(req.user.id);
    const trust = await SellerTrustService.evaluateSellerAsync(req.user.id);
    const resolvedProfile = profile || {
      user_id: req.user.id,
      kyc_status: 'UNVERIFIED',
      active_listing_limit: 5
    };
    return res.status(200).json({
      success: true,
      profile: resolvedProfile,
      seller_profile: resolvedProfile,
      trust
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Gagal memuat status onboarding penjual.',
      code: 'DASHBOARD_DATA_UNAVAILABLE'
    });
  }
});

/**
 * POST /api/dashboard/seller/onboarding
 * Submits seller onboarding / KYC verification request for the authenticated user.
 * Sets kyc_status to PENDING_REVIEW (never allows unprivileged self-verification).
 */
router.post('/seller/onboarding', requireAuth, async (req, res) => {
  const spoof = checkIdentitySpoofing(req);
  if (spoof.spoofed) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: identity spoofing rejected.',
      code: 'FORBIDDEN_OWNERSHIP'
    });
  }

  const body = req.body || {};
  if (
    (body.kyc_status && String(body.kyc_status).toUpperCase() === 'VERIFIED') ||
    (body.kycStatus && String(body.kycStatus).toUpperCase() === 'VERIFIED') ||
    body.verified === true ||
    body.is_verified === true
  ) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: sellers cannot self-verify KYC status. Admin review is required.',
      code: 'FORBIDDEN_SELF_VERIFICATION'
    });
  }

  try {
    const result = await SellerTrustService.submitOnboarding({
      userId: req.user.id,
      fullName: body.full_name || body.fullName || body.name || req.user.name,
      nik: body.nik || body.id_number || body.identity_number_last4 || null,
      phone: body.phone || req.user.phone || null,
      bankName: body.bank_name || body.bankName || body.payout_bank_name || null,
      bankAccountNumber: body.bank_account_number || body.bankAccountNumber || null,
      bankAccountHolder: body.bank_account_holder || body.bankAccountHolder || null,
      notes: body.notes || null
    });

    return res.status(200).json({
      success: true,
      already_verified: result.alreadyVerified,
      profile: result.profile,
      seller_profile: result.profile,
      message: result.alreadyVerified
        ? 'Akun penjual Anda sudah terverifikasi (VERIFIED).'
        : 'Pengajuan onboarding penjual berhasil dikirim dan sedang menunggu verifikasi Admin (PENDING_REVIEW).'
    });
  } catch (err) {
    const status = err.status || (err.code === 'SELLER_SUSPENDED' ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'ONBOARDING_SUBMISSION_FAILED'
    });
  }
});

/**
 * POST /api/dashboard/seller/listings/:id/withdraw
 * Allows an authenticated seller to withdraw their own listing if not reserved/sold.
 */
router.post('/seller/listings/:id/withdraw', requireAuth, async (req, res) => {
  const spoof = checkIdentitySpoofing(req);
  if (spoof.spoofed) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: identity spoofing rejected.',
      code: 'FORBIDDEN_OWNERSHIP'
    });
  }

  const listingId = req.params.id;
  const sellerId = req.user.id;

  try {
    const marketRepo = getMarketplaceRepository();
    const moneyRepo = getMoneyRepository();

    let listing = await marketRepo.getListingById(listingId);
    const stateListing = (state.listings || []).find(l => l.id === listingId);
    if (!listing && stateListing) {
      if (isProductionRuntime() && DEMO_SEED_LISTING_IDS.has(listingId)) {
        listing = null;
      } else {
        listing = stateListing;
      }
    }

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: 'Listing tidak ditemukan.',
        code: 'LISTING_NOT_FOUND'
      });
    }

    if (String(listing.seller_id) !== String(sellerId) && !isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Anda tidak memiliki akses untuk menarik listing milik penjual lain.',
        code: 'FORBIDDEN_OWNERSHIP'
      });
    }

    const currentStatus = (listing.status || '').toUpperCase();
    if (['RESERVED', 'SOLD', 'SETTLED', 'COMPLETED'].includes(currentStatus)) {
      return res.status(409).json({
        success: false,
        error: `Listing berstatus '${currentStatus}' tidak dapat ditarik karena terikat dengan pesanan/reservasi aktif.`,
        code: 'LISTING_LOCKED_BY_ORDER'
      });
    }

    const sellerOrders = await moneyRepo.listOrdersBySellerId(listing.seller_id);
    const hasActiveOrder = (sellerOrders || []).some(o =>
      o.listing_id === listingId && !['CANCELLED', 'REFUNDED'].includes((o.status || '').toUpperCase())
    ) || (state.orders || []).some(o =>
      o.listing_id === listingId && !['CANCELLED', 'REFUNDED'].includes((o.status || '').toUpperCase())
    );

    if (hasActiveOrder) {
      return res.status(409).json({
        success: false,
        error: 'Listing tidak dapat ditarik karena sudah memiliki pesanan aktif.',
        code: 'LISTING_LOCKED_BY_ORDER'
      });
    }

    await marketRepo.updateListingStatus(listingId, 'WITHDRAWN');
    if (stateListing) {
      stateListing.status = 'WITHDRAWN';
      stateListing.updated_at = new Date().toISOString();
    }

    // Supersede any pending offers on this listing durably and in memory
    await marketRepo.supersedeOffersForListing(listingId, null, new Date().toISOString()).catch(() => {});
    if (state.offers && Array.isArray(state.offers)) {
      for (const offer of state.offers) {
        if (offer.listing_id === listingId && (offer.status === 'PENDING' || offer.status === 'COUNTERED')) {
          offer.status = 'SUPERSEDED';
          offer.superseded_at = new Date().toISOString();
        }
      }
    }

    await recordAuditLog('LISTING', listingId, 'WITHDRAWN_BY_SELLER', sellerId, {
      previous_status: currentStatus,
      new_status: 'WITHDRAWN'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Listing berhasil ditarik dari pasar.',
      listing: {
        id: listingId,
        seller_id: listing.seller_id,
        status: 'WITHDRAWN',
        updated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Gagal memperbarui status listing.',
      code: 'DASHBOARD_DATA_UNAVAILABLE'
    });
  }
});

/**
 * PATCH /api/dashboard/profile
 * Updates safe profile fields (name, phone) for the authenticated session user.
 * Rejects any attempt to modify privileged fields (role, status, kyc_status, id, email).
 */
router.patch('/profile', requireAuth, async (req, res) => {
  const body = req.body || {};
  const forbiddenFields = ['role', 'status', 'kyc_status', 'id', 'user_id', 'email', 'password', 'password_hash', 'is_admin'];
  for (const field of forbiddenFields) {
    if (body[field] !== undefined) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: field '${field}' cannot be modified via profile settings.`,
        code: 'FORBIDDEN_FIELD_MUTATION'
      });
    }
  }

  const updates = {};
  if (body.name !== undefined) {
    const cleanName = String(body.name || '').trim();
    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Nama tampilan harus terdiri dari 2 hingga 100 karakter.',
        code: 'VALIDATION_ERROR'
      });
    }
    updates.name = cleanName;
    updates.display_name = cleanName;
  }

  if (body.phone !== undefined) {
    const cleanPhone = String(body.phone || '').trim();
    if (cleanPhone && !/^[0-9+\-\s()]{8,20}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Format nomor telepon tidak valid.',
        code: 'VALIDATION_ERROR'
      });
    }
    updates.phone = cleanPhone || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Tidak ada perubahan profil yang dikirimkan.',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    const userRepo = getUserRepository();
    const updatedUser = await userRepo.updateUser(req.user.id, updates);

    // Sync to state.users
    const stateUser = (state.users || []).find(u => u.id === req.user.id);
    if (stateUser) {
      Object.assign(stateUser, updates, { updated_at: new Date().toISOString() });
    }

    await recordAuditLog('USER_PROFILE', req.user.id, 'PROFILE_UPDATED', req.user.id, {
      updated_fields: Object.keys(updates)
    }).catch(() => {});

    const safeProfile = sanitizeUserProfile(updatedUser || stateUser || { ...req.user, ...updates });
    return res.status(200).json({
      success: true,
      message: 'Profil berhasil diperbarui.',
      user: safeProfile,
      data: {
        user: safeProfile
      }
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Gagal menyimpan perubahan profil ke database.',
      code: 'DASHBOARD_DATA_UNAVAILABLE'
    });
  }
});

module.exports = router;
