const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { state, recordAuditLog, verifyPassword } = require('../database');
const { ListingService, LISTING_STATUS } = require('../services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('../services/escrowService');
const { EventPicService } = require('../services/eventPicService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('../services/disputeService');
const { SettlementService } = require('../services/settlementService');
const { createEvidenceBundle } = require('../verification/evidence');
const { emailService } = require('../services/emailService');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('../discovery/EventTemporalLifecycleEngine');

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
// PILOT AUTH HELPERS (Phase 2: no silent defaults, ownership enforced)
// Caller identity: x-user-id header (preferred) or explicit body/query field.
// No JWT/new infra — minimal hardening for controlled pilot.
// =============================================================================
const { TransactionChallengeService } = require('../services/transactionChallengeService');
const { EvidenceStorageService } = require('../verification/evidenceStorage');
const { RETENTION_CONFIG, purgeExpiredEvidence } = require('../config/retention');
const { SessionStore } = require('../services/sessionStore');

// =============================================================================
// PILOT AUTH & SESSIONS (Epic 3.5: real sessions, 4 roles, window enforcement)
// =============================================================================
function resolveAuth(req, ...fallbacks) {
  // Check Authorization Bearer or x-session-token
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
      const user = findUser(session.user_id);
      if (user) {
        req.user = user;
        req.role = user.role;
        return user.id;
      }
    }
  }

  // Blocker 2: Fallback to x-user-id header or passed parameter ONLY in test mode!
  // In production (NODE_ENV !== 'test'), reject unauthenticated actor selection / identity spoofing.
  if (process.env.NODE_ENV === 'test') {
    const headerId = req.header ? req.header('x-user-id') : null;
    const callerId = headerId || fallbacks.find(f => !!f);
    if (callerId) {
      const user = findUser(callerId);
      if (user) {
        req.user = user;
        req.role = user.role;
        return user.id;
      }
    }
  }

  return null;
}

function getCallerId(req, ...fallbacks) {
  return resolveAuth(req, ...fallbacks);
}

function findUser(id) {
  return state.users.find(u => u.id === id) || null;
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const userId = resolveAuth(req, req.body?.officerId, req.body?.picUserId, req.body?.sellerId, req.body?.buyerId, req.query?.picUserId, req.query?.requesterId);
    if (!userId || !req.user) {
      return res.status(401).json({ error: 'Authentication required. Invalid or missing session.', code: 'AUTH_REQUIRED' });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: role '${req.user.role}' not permitted for this action`, code: 'FORBIDDEN' });
    }
    next();
  };
}

function requirePicOperationalWindow(req, res, next) {
  const picUserId = req.user ? req.user.id : getCallerId(req, req.query?.picUserId, req.body?.picUserId);
  const eventId = req.params?.eventId || req.body?.eventId || (req.body?.orderId ? state.orders.find(o => o.id === req.body.orderId)?.event_id : null);
  
  if (picUserId && eventId) {
    const activeCheck = EventPicService.isPicActiveForEvent(picUserId, eventId, req.query?.currentDate || req.body?.currentDate);
    if (!activeCheck.active) {
      return res.status(403).json({
        error: activeCheck.reason,
        code: activeCheck.reason && activeCheck.reason.includes('window closed') ? 'OPERATIONAL_WINDOW_CLOSED' : 'PIC_UNAUTHORIZED'
      });
    }
  }
  next();
}

function verifyAdminStepUp(req, officerId) {
  const officer = findUser(officerId);
  if (!officer || officer.role !== 'admin') {
    const err = new Error('Admin role required');
    err.code = 'ADMIN_UNAUTHORIZED';
    err.status = 401;
    throw err;
  }

  const stepUpPassword = req.body?.stepUpPassword || req.header('x-admin-password');
  const stepUpToken = req.body?.stepUpToken || req.header('x-admin-step-up-token');
  const reason = req.body?.reason || req.body?.stepUpReason || req.header('x-admin-step-up-reason');
  if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
    const err = new Error('Admin step-up action requires a mandatory explanation reason (min 10 characters)');
    err.code = 'STEP_UP_REASON_REQUIRED';
    err.status = 403;
    throw err;
  }

  // Blocker 3: In production, require ARGUS_ADMIN_PASSWORD and reject default pilot123
  if (process.env.NODE_ENV !== 'test') {
    if (!process.env.ARGUS_ADMIN_PASSWORD) {
      const err = new Error('ARGUS_ADMIN_PASSWORD environment variable is required in production');
      err.code = 'ADMIN_PASSWORD_NOT_CONFIGURED';
      err.status = 500;
      throw err;
    }
    if (stepUpPassword === 'pilot123') {
      const err = new Error('Default pilot password rejected in production');
      err.code = 'STEP_UP_AUTH_REQUIRED';
      err.status = 403;
      throw err;
    }
  }

  let authenticated = false;
  if (stepUpToken) {
    const tokenRecord = state.step_up_tokens.find(t => t.token === stepUpToken && t.admin_id === officer.id && new Date(t.expires_at) > new Date());
    if (tokenRecord) authenticated = true;
  }

  if (!authenticated && stepUpPassword) {
    if (officer.password && verifyPassword(stepUpPassword, officer.password)) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    const err = new Error('Admin step-up authentication failed: re-enter admin password or provide valid stepUpToken');
    err.code = 'STEP_UP_AUTH_REQUIRED';
    err.status = 403;
    throw err;
  }

  return { officer, reason: reason.trim() };
}

function requireAdmin(officerId) {
  const user = findUser(officerId);
  if (!user) {
    const err = new Error('Unauthorized: officer not found');
    err.code = 'ADMIN_UNAUTHORIZED';
    err.status = 401;
    throw err;
  }
  if (user.role !== 'admin') {
    const err = new Error('Forbidden: admin role required');
    err.code = 'ADMIN_FORBIDDEN';
    err.status = 403;
    throw err;
  }
  return user;
}

function mapRouterError(err, defaultStatus = 400) {
  if (
    err.code === 'PIC_NOT_ACTIVE' ||
    err.code === 'PIC_UNAUTHORIZED' ||
    err.code === 'UNAUTHORIZED' ||
    err.code === 'ADMIN_FORBIDDEN' ||
    err.code === 'FORBIDDEN' ||
    err.code === 'OPERATIONAL_WINDOW_CLOSED' ||
    err.code === 'STEP_UP_AUTH_REQUIRED' ||
    err.code === 'STEP_UP_REASON_REQUIRED' ||
    err.code === 'EVIDENCE_ACCESS_DENIED' ||
    err.code === 'BUYER_MISMATCH' ||
    err.code === 'INVALID_CHALLENGE_CODE' ||
    err.code === 'INVALID_CHALLENGE_ACTION' ||
    err.code === 'TICKET_NOT_YET_VERIFIED' ||
    err.code === 'ORDER_NOT_IN_ESCROW' ||
    err.code === 'PIC_CANNOT_ISSUE_ENTRY_CHALLENGE' ||
    err.code === 'PIC_CANNOT_ISSUE_HANDOFF_CHALLENGE' ||
    err.code === 'BUYER_CANNOT_CONFIRM_ENTRY' ||
    err.code === 'INVALID_CHALLENGE_ISSUER' ||
    err.code === 'CONSUMER_ROLE_MISMATCH' ||
    err.code === 'PIC_CANNOT_CONFIRM_OWN_CHALLENGE'
  ) {
    return 403;
  }
  if (err.code === 'ADMIN_UNAUTHORIZED' || err.code === 'AUTH_REQUIRED') {
    return 401;
  }
  if (err.code === 'DUPLICATE_ENTRY_CONFIRMATION' || err.code === 'CHALLENGE_ALREADY_CONSUMED') {
    return 409;
  }
  if (err.code === 'GATE_PHOTO_MANDATORY' || err.code === 'EVIDENCE_PHOTO_MANDATORY') {
    return 400;
  }
  return err.status || defaultStatus;
}

// =============================================================================
// AUTH & SESSION ENDPOINTS (Epic 3.5: 4 roles, real session tokens)
// =============================================================================

/**
 * Login endpoint - returns session token
 * POST /api/mvp/auth/login
 */
router.post('/auth/login', (req, res) => {
  const { usernameOrId, password } = req.body;
  if (!usernameOrId) {
    return res.status(400).json({ error: 'usernameOrId is required', code: 'VALIDATION_ERROR' });
  }

  const user = state.users.find(u => u.id === usernameOrId || u.email === usernameOrId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid user credentials', code: 'AUTH_FAILED' });
  }

  if (user.password && password && !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid password', code: 'AUTH_FAILED' });
  }

  const session = SessionStore.createSession({ userId: user.id, role: user.role });
  state.sessions.push(session);

  res.json({
    success: true,
    session_token: session.session_token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone
    }
  });
});

/**
 * Logout endpoint - revokes session token
 * POST /api/mvp/auth/logout
 */
router.post('/auth/logout', (req, res) => {
  const token = req.header('authorization')?.replace('Bearer ', '') || req.header('x-session-token') || req.body?.session_token;
  if (token) {
    SessionStore.revokeSession(token);
    state.sessions = state.sessions.filter(s => s.session_token !== token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * Current user profile endpoint
 * GET /api/mvp/auth/me
 */
router.get('/auth/me', (req, res) => {
  const userId = resolveAuth(req);
  if (!userId || !req.user) {
    return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
  }
  res.json({ user: req.user });
});

// =============================================================================
// PUBLIC & MARKETPLACE ENDPOINTS
// =============================================================================

/**
 * Search & Browse events with filters (Epic 3.6)
 * GET /api/mvp/events
 */
router.get('/events', (req, res) => {
  const { q, city, category, source, verified, startDate, endDate, include_past, scope } = req.query;

  // Cache Integrity: Prevent stale caching of event listings
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const showAllOrPast = include_past === 'true' || scope === 'all';
  const now = new Date();

  let filtered = state.events.filter(event => {
    // Soft-deleted / cancelled filter: allow status filter or exclude DIBATALKAN unless explicitly queried
    if (req.query.status) {
      const qStatus = req.query.status.toUpperCase();
      const evStatus = (event.status || '').toUpperCase();
      const evLifecycle = (event.lifecycle_status || '').toUpperCase();
      if (evStatus !== qStatus && evLifecycle !== qStatus) return false;
      if (qStatus === 'UPCOMING' && !EventTemporalLifecycleEngine.isEventUpcoming(event, now)) {
        return false;
      }
    } else {
      if (event.status === 'DIBATALKAN' || event.status === 'CANCELLED' || event.lifecycle_status === 'CANCELLED') return false;
      // Invariant 1: event_end_at <= now must be an absolute public Upcoming exclusion
      if (!showAllOrPast && !EventTemporalLifecycleEngine.isEventUpcoming(event, now)) {
        return false;
      }
    }

    // Keyword search 'q' (matches name, title, artists, venue_name, venue, city)
    if (q && q.trim()) {
      const term = q.toLowerCase().trim();
      const name = (event.name || event.title || '').toLowerCase();
      const venue = (event.venue_name || event.venue || '').toLowerCase();
      const vCity = (event.venue_city || '').toLowerCase();
      const artists = Array.isArray(event.artists) ? event.artists.join(' ').toLowerCase() : (event.artists || '').toLowerCase();
      if (!name.includes(term) && !venue.includes(term) && !vCity.includes(term) && !artists.includes(term)) {
        return false;
      }
    }

    // City filter
    if (city && city.trim()) {
      const cTerm = city.toLowerCase().trim();
      const vCity = (event.venue_city || '').toLowerCase();
      if (!vCity.includes(cTerm)) return false;
    }

    // Category filter (KONSER, STANDUP, FESTIVAL, OLAHRAGA, TEATER, LAINNYA)
    if (category && category.trim()) {
      if ((event.category || '').toUpperCase() !== category.toUpperCase().trim()) return false;
    }

    // Source filter (SEED, USER_CREATED)
    if (source && source.trim()) {
      if ((event.source || '').toUpperCase() !== source.toUpperCase().trim()) return false;
    }

    // Verified filter
    if (verified !== undefined && verified !== '') {
      const isVerif = verified === 'true';
      if (!!event.is_verified !== isVerif) return false;
    }

    // Date range filter
    const eDate = event.start_date || event.date;
    if (startDate && eDate && eDate < startDate) return false;
    if (endDate && eDate && eDate > endDate) return false;

    return true;
  });

  // Sort upcoming events first (ascending by start_date / event_start_at)
  filtered.sort((a, b) => {
    const isUpcomingA = EventTemporalLifecycleEngine.isEventUpcoming(a, now);
    const isUpcomingB = EventTemporalLifecycleEngine.isEventUpcoming(b, now);
    if (isUpcomingA && !isUpcomingB) return -1;
    if (!isUpcomingA && isUpcomingB) return 1;

    const dateA = a.start_date || a.date || '9999-99-99';
    const dateB = b.start_date || b.date || '9999-99-99';
    return dateA.localeCompare(dateB);
  });

  const eventsWithMetadata = filtered.map(event => {
    const venue = state.venues.find(v => v.id === event.venue_id) || {};
    const pic = state.event_pics.find(ep => ep.event_id === event.id && ep.status === 'ACTIVE');
    const activeListings = state.listings.filter(l => l.event_id === event.id && l.status === 'ACTIVE');
    const minPrice = activeListings.length > 0 ? Math.min(...activeListings.map(l => l.price)) : null;
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);

    return {
      ...event,
      name: event.name || event.title,
      title: event.title || event.name,
      start_date: event.start_date || event.date,
      date: event.date || event.start_date,
      event_start_at: event.event_start_at || temporal.event_start_at,
      event_end_at: event.event_end_at || temporal.event_end_at,
      event_timezone: event.event_timezone || temporal.event_timezone,
      archive_at: event.archive_at || temporal.archive_at,
      lifecycle_status: event.lifecycle_status || EventTemporalLifecycleEngine.resolveLifecycleStatus(event, now),
      venue_name: event.venue_name || event.venue || venue.name,
      venue: event.venue || event.venue_name || venue.name,
      venue_city: event.venue_city || venue.city || 'Jakarta',
      venue_details: venue,
      pic_assigned: !!pic,
      pic_contact: pic ? pic.contact_phone : null,
      active_listings_count: activeListings.length,
      min_price: minPrice
    };
  });

  res.json({ events: eventsWithMetadata, total: eventsWithMetadata.length });
});

/**
 * User-created event (Epic 3.6)
 * POST /api/mvp/events
 */
router.post('/events', (req, res) => {
  try {
    const callerId = getCallerId(req, req.body?.sellerId, req.body?.userId);
    if (!callerId) {
      return res.status(401).json({ error: 'Authentication required to register a new event.', code: 'AUTH_REQUIRED' });
    }

    const { name, venue_name, venue_city, start_date, end_date, category, artists, admission_protocol, official_link, poster_url } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return res.status(400).json({ error: 'Event name is required (min 3 characters)', code: 'VALIDATION_ERROR' });
    }
    if (!venue_name || typeof venue_name !== 'string' || venue_name.trim().length < 2) {
      return res.status(400).json({ error: 'Venue name is required', code: 'VALIDATION_ERROR' });
    }
    if (!venue_city || typeof venue_city !== 'string' || venue_city.trim().length < 2) {
      return res.status(400).json({ error: 'Venue city is required', code: 'VALIDATION_ERROR' });
    }
    if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date.trim())) {
      return res.status(400).json({ error: 'Valid start_date (YYYY-MM-DD) is required', code: 'VALIDATION_ERROR' });
    }

    const ALLOWED_CATEGORIES = ['KONSER', 'STANDUP', 'FESTIVAL', 'OLAHRAGA', 'TEATER', 'LAINNYA'];
    const catUpper = (category || 'KONSER').toUpperCase().trim();
    if (!ALLOWED_CATEGORIES.includes(catUpper)) {
      return res.status(400).json({
        error: `Invalid category '${category}'. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`,
        code: 'VALIDATION_ERROR'
      });
    }

    // Uniqueness check: prevent duplicate event (same name + venue + date)
    const normKey = `${name.toLowerCase().trim()}::${venue_name.toLowerCase().trim()}::${start_date.trim()}`;
    const duplicate = state.events.find(e => {
      const eName = (e.name || e.title || '').toLowerCase().trim();
      const eVenue = (e.venue_name || e.venue || '').toLowerCase().trim();
      const eDate = (e.start_date || e.date || '').trim();
      return `${eName}::${eVenue}::${eDate}` === normKey;
    });

    if (duplicate) {
      return res.status(409).json({
        error: 'Event dengan nama, venue, dan tanggal yang sama sudah terdaftar di sistem Tikum.',
        code: 'DUPLICATE_EVENT',
        existing_event_id: duplicate.id
      });
    }

    // Parse artists
    let artistList = [];
    if (Array.isArray(artists)) {
      artistList = artists.map(a => String(a).trim()).filter(Boolean);
    } else if (typeof artists === 'string' && artists.trim()) {
      artistList = artists.split(',').map(a => a.trim()).filter(Boolean);
    }

    const eventId = `event-usr-${uuidv4().substring(0, 8)}`;
    const newEvent = {
      id: eventId,
      name: name.trim(),
      title: name.trim(),
      artists: artistList,
      date: start_date.trim(),
      start_date: start_date.trim(),
      end_date: end_date ? end_date.trim() : null,
      venue_id: null,
      venue: venue_name.trim(),
      venue_name: venue_name.trim(),
      venue_city: venue_city.trim(),
      category: catUpper,
      admission_protocol: admission_protocol || {
        type: 'BARCODE_PLUS_ID',
        description: 'Pemeriksaan tiket resmi dan identitas di venue acara oleh TIKUM PIC',
        required_items: ['E-Ticket / Tiket Fisik Resmi', 'KTP Asli / Identitas Diri'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Promotor / Penyelenggara Acara'
      },
      status: 'UPCOMING',
      source: 'USER_CREATED',
      created_by_user_id: callerId,
      is_verified: false,
      official_link: official_link ? official_link.trim() : null,
      poster_url: poster_url ? poster_url.trim() : null,
      created_at: new Date().toISOString()
    };

    state.events.push(newEvent);

    recordAuditLog('EVENT', eventId, 'USER_CREATED', callerId, {
      name: newEvent.name,
      venue_name: newEvent.venue_name,
      venue_city: newEvent.venue_city,
      start_date: newEvent.start_date,
      category: newEvent.category
    });

    return res.status(201).json({
      success: true,
      message: 'Event berhasil didaftarkan oleh komunitas.',
      event: newEvent
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
  }
});

/**
 * Browse active listings with full price transparency
 * GET /api/mvp/listings
 */
router.get('/listings', (req, res) => {
  const { eventId } = req.query;

  // Cache Integrity: Prevent stale caching of ticket listings
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const listings = ListingService.getActiveListings(eventId);
  // Add transparent pricing calculation to each listing
  const listingsWithPricing = listings.map(l => {
    const pricing = EscrowService.calculatePricing(l.price);
    return {
      ...l,
      pricing,
      seller_asking_price: l.price,
      buyer_total_price: pricing.totalAmount
    };
  });
  res.json({ listings: listingsWithPricing });
});

/**
 * Get single listing by ID with transparent pricing and verified event data
 * GET /api/mvp/listings/:id
 */
router.get('/listings/:id', (req, res) => {
  const listing = state.listings.find(l => l.id === req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found', code: 'NOT_FOUND' });
  }

  const ticket = state.tickets.find(t => t.id === listing.ticket_id) || {};
  const event = state.events.find(e => e.id === listing.event_id) || {};
  const venue = state.venues.find(v => v.id === event.venue_id) || {};
  const sellerProfile = state.seller_profiles.find(sp => sp.user_id === listing.seller_id) || {};

  res.json({
    listing: {
      id: listing.id,
      status: listing.status,
      seat_info: listing.seat_info,
      face_value: listing.face_value,
      price: listing.price,
      pricing: EscrowService.calculatePricing(listing.price),
      created_at: listing.created_at,
      rejection_reason: listing.rejection_reason,
      user_created_event: listing.user_created_event || false,
      event_verification_warning: listing.event_verification_warning || null,
      event: {
        id: event.id,
        name: event.name || event.title,
        title: event.title || event.name,
        date: event.date || event.start_date,
        start_date: event.start_date || event.date,
        category: event.category,
        venue: venue.name || event.venue || event.venue_name,
        venue_name: event.venue_name || venue.name || event.venue,
        venue_city: venue.city || event.venue_city || 'Jakarta',
        admission_protocol: event.admission_protocol || null,
        is_verified: event.is_verified !== undefined ? event.is_verified : true,
        source: event.source || 'SEED'
      },
      seller: {
        id: listing.seller_id,
        kyc_status: sellerProfile.kyc_status || 'UNVERIFIED'
      }
    }
  });
});

/**
 * Public PII-safe transaction tracker
 * GET /api/mvp/track/:id
 */
router.get('/track/:id', (req, res) => {
  const paramId = req.params.id;

  // 1. Check if ID matches an Order
  const order = state.orders.find(o => o.id === paramId);
  if (order) {
    const ticket = state.tickets.find(t => t.id === order.ticket_id) || {};
    const event = state.events.find(e => e.id === order.event_id) || {};
    const venue = state.venues.find(v => v.id === event.venue_id) || {};
    const escrow = state.escrows.find(e => e.order_id === order.id) || {};
    const verification = state.entry_verifications.find(ev => ev.order_id === order.id) || null;
    const picAssign = state.event_pics.find(ep => ep.event_id === order.event_id && ep.status === 'ACTIVE');

    return res.json({
      success: true,
      transaction: {
        id: order.id,
        type: 'ORDER',
        status: order.status,
        operational_stage: order.operational_stage || (verification ? verification.status : 'PENDING_ADMISSION'),
        ticket_price: order.ticket_price,
        platform_fee: order.platform_fee,
        total_amount: order.total_amount,
        created_at: order.created_at,
        escrow_status: escrow.status || 'UNKNOWN',
        entry_status: verification ? verification.status : 'PENDING_ENTRY',
        event: {
          title: event.title,
          date: event.date,
          venue: venue.name || event.venue,
          city: venue.city || 'Jakarta',
          gate_info: venue.gate_info || 'Main Gate',
          admission_protocol: event.admission_protocol || null
        },
        seat_info: ticket.seat_info || order.seat_info,
        pic_assigned: !!picAssign,
        pic_contact: picAssign ? picAssign.contact_phone : null
      }
    });
  }

  // 2. Check if ID matches a Listing
  const listing = state.listings.find(l => l.id === paramId);
  if (listing) {
    const ticket = state.tickets.find(t => t.id === listing.ticket_id) || {};
    const event = state.events.find(e => e.id === listing.event_id) || {};
    const venue = state.venues.find(v => v.id === event.venue_id) || {};
    const sellerProfile = state.seller_profiles.find(sp => sp.user_id === listing.seller_id) || {};

    return res.json({
      success: true,
      transaction: {
        id: listing.id,
        type: 'LISTING',
        status: listing.status,
        seat_info: listing.seat_info,
        face_value: listing.face_value,
        price: listing.price,
        pricing: EscrowService.calculatePricing(listing.price),
        created_at: listing.created_at,
        rejection_reason: listing.rejection_reason || null,
        event: {
          title: event.title,
          date: event.date,
          venue: venue.name || event.venue,
          city: venue.city || 'Jakarta',
          admission_protocol: event.admission_protocol || null
        },
        seller_verified: sellerProfile.kyc_status === 'VERIFIED'
      }
    });
  }

  // 3. Not found
  return res.status(404).json({
    success: false,
    error: 'Transaction or listing not found',
    code: 'NOT_FOUND'
  });
});

/**
 * Get single order details
 * GET /api/mvp/orders/:id
 */
router.get('/orders/:id', (req, res) => {
  const order = state.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });
  }

  const ticket = state.tickets.find(t => t.id === order.ticket_id) || {};
  const event = state.events.find(e => e.id === order.event_id) || {};
  const venue = state.venues.find(v => v.id === event.venue_id) || {};
  const escrow = state.escrows.find(e => e.order_id === order.id) || {};
  const verification = state.entry_verifications.find(ev => ev.order_id === order.id) || null;

  res.json({
    order: {
      ...order,
      seat_info: ticket.seat_info,
      event_title: event.title,
      event_date: event.date,
      venue_name: venue.name || event.venue,
      escrow_status: escrow.status,
      entry_status: verification ? verification.status : 'PENDING_ENTRY'
    }
  });
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
      return res.status(400).json({ error: 'Missing required listing fields (sellerId, eventId, seatInfo, faceValue, price, rawBarcode)', code: 'VALIDATION_ERROR' });
    }
    if (!findUser(sellerId)) {
      return res.status(401).json({ error: 'Unknown seller', code: 'AUTH_REQUIRED' });
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
 * Get listings for a seller (ownership enforced)
 * GET /api/mvp/seller/:id/listings
 */
router.get('/seller/:id/listings', (req, res) => {
  const callerId = getCallerId(req, req.query.requesterId);
  if (!callerId) {
    return res.status(401).json({ error: 'requester identity required (x-user-id or ?requesterId)', code: 'AUTH_REQUIRED' });
  }
  const caller = findUser(callerId);
  if (!caller) {
    return res.status(401).json({ error: 'Unknown requester', code: 'AUTH_REQUIRED' });
  }
  if (caller.id !== req.params.id && caller.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: cannot access another seller orders', code: 'FORBIDDEN' });
  }
  const sellerListings = state.listings.filter(l => l.seller_id === req.params.id).map(l => {
    const order = state.orders.find(o => o.listing_id === l.id);
    return {
      ...l,
      order_id: order ? order.id : null,
      order_status: order ? order.status : null
    };
  });
  res.json({ listings: sellerListings });
});

/**
 * Seller marks ready for handoff and generates dual-confirmation challenge
 * POST /api/mvp/seller/orders/:orderId/handoff-challenge
 */
router.post('/seller/orders/:orderId/handoff-challenge', async (req, res) => {
  try {
    const sellerId = getCallerId(req, req.body?.sellerId);
    if (!sellerId) return res.status(401).json({ error: 'Seller auth required', code: 'AUTH_REQUIRED' });

    const order = state.orders.find(o => o.id === req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });

    if (order.seller_id !== sellerId && req.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: cannot generate challenge for another seller order', code: 'FORBIDDEN' });
    }

    const challenge = await TransactionChallengeService.createChallenge({
      orderId: order.id,
      eventId: order.event_id,
      actionType: 'HANDOFF_READY',
      expectedActorRole: 'seller',
      expectedActorId: sellerId
    });

    res.json({
      success: true,
      message: 'Handoff challenge generated. Show this 6-digit code to TIKUM PIC.',
      challenge_id: challenge.challengeId,
      code: challenge.rawCode, // Displayed strictly in Seller app session
      expires_at: challenge.expiresAt
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
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
    const { buyerId, listingId, quoteId, quote_id, policyVersion } = req.body;
    if (!buyerId || !listingId) {
      return res.status(400).json({ error: 'buyerId and listingId are required', code: 'VALIDATION_ERROR' });
    }
    if (!findUser(buyerId)) {
      return res.status(401).json({ error: 'Unknown buyer', code: 'AUTH_REQUIRED' });
    }

    const effectiveQuoteId = quoteId || quote_id || null;
    const result = await EscrowService.createOrder({
      buyerId,
      listingId,
      quoteId: effectiveQuoteId,
      policyVersion: policyVersion || null
    });

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
        pic_contact: picAssign ? picAssign.contact_phone : 'TIKUM Ops Hotline',
        venue: venue.name,
        gate_info: venue.gate_info,
        instructions: 'Temui TIKUM PIC di gate venue sebelum masuk. Tunjukkan nomor pesanan Anda untuk verifikasi fisik.'
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/**
 * Buyer gets active orders (ownership enforced)
 * GET /api/mvp/buyer/:id/orders
 */
router.get('/buyer/:id/orders', (req, res) => {
  const callerId = getCallerId(req, req.query.requesterId);
  if (!callerId) {
    return res.status(401).json({ error: 'requester identity required (x-user-id or ?requesterId)', code: 'AUTH_REQUIRED' });
  }
  const caller = findUser(callerId);
  if (!caller) {
    return res.status(401).json({ error: 'Unknown requester', code: 'AUTH_REQUIRED' });
  }
  if (caller.id !== req.params.id && caller.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: cannot access another buyer orders', code: 'FORBIDDEN' });
  }
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
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Buyer generates entry confirmation challenge code to show to PIC at gate (Dual Confirmation Step 1)
 * POST /api/mvp/buyer/orders/:orderId/entry-challenge
 * POST /api/mvp/buyer/entry-challenge
 */
router.post(['/buyer/orders/:orderId/entry-challenge', '/buyer/entry-challenge'], async (req, res) => {
  try {
    const orderId = req.params.orderId || req.body?.orderId;
    const buyerId = getCallerId(req, req.body?.buyerId);
    if (!buyerId) {
      return res.status(401).json({ error: 'Buyer auth required', code: 'AUTH_REQUIRED' });
    }
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required', code: 'VALIDATION_ERROR' });
    }

    const result = await EventPicService.generateBuyerEntryChallenge({
      buyerId,
      orderId
    });

    res.json({
      success: true,
      message: result.message,
      orderId: result.orderId,
      challengeCode: result.challengeCode,
      code: result.challengeCode,
      expiresAt: result.expiresAt,
      expires_at: result.expiresAt
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Blocked legacy endpoint: Buyer cannot confirm entry
 * POST /api/mvp/buyer/confirm-entry
 */
router.post('/buyer/confirm-entry', (req, res) => {
  return res.status(403).json({
    error: 'Buyer cannot confirm entry. PIC must physically inspect turnstile admission and enter Buyer code (POST /api/mvp/pic/confirm-entry).',
    code: 'BUYER_CANNOT_CONFIRM_ENTRY'
  });
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
    const picUserId = getCallerId(req, req.query.picUserId);
    if (!picUserId) {
      return res.status(401).json({ error: 'picUserId required (x-user-id or ?picUserId). No anonymous PIC access.', code: 'AUTH_REQUIRED' });
    }
    const dashboard = EventPicService.getPicEventDashboard(picUserId, req.params.eventId);
    res.json(dashboard);
  } catch (err) {
    res.status(mapRouterError(err, err.code === 'PIC_NOT_ACTIVE' ? 403 : 400)).json({ error: err.message, code: err.code });
  }
});

/**
 * PIC verifies attendee & ticket at venue gate and records status
 * POST /api/mvp/pic/verify-entry
 */
router.post('/pic/verify-entry', requirePicOperationalWindow, async (req, res) => {
  try {
    const { picUserId, orderId, gate, notes, status, reason, nextAction, evidenceBundleId, allowSinglePartyTest } = req.body;
    if (!picUserId || !orderId) {
      return res.status(400).json({ error: 'picUserId and orderId are required', code: 'VALIDATION_ERROR' });
    }

    // Epic 3.5: PIC cannot unilaterally self-confirm entry without buyer-side code
    if (status === 'CONFIRMED' && !allowSinglePartyTest) {
      return res.status(403).json({
        error: 'PIC cannot unilaterally self-confirm entry. Dual confirmation required: PIC must call prepare-entry with photo, and Buyer must enter handshake code.',
        code: 'DUAL_CONFIRMATION_REQUIRED'
      });
    }

    const verification = await EventPicService.recordEntryVerification({
      picUserId,
      orderId,
      gate: gate || 'Pintu Utama',
      notes,
      status: status || 'CONFIRMED',
      reason,
      nextAction,
      evidenceBundleId
    });

    res.json({
      success: true,
      message: `Entry status recorded as ${verification.status}.`,
      verification
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * PIC verifies seller code and confirms handoff (Dual Confirmation)
 * POST /api/mvp/pic/confirm-handoff
 */
router.post('/pic/confirm-handoff', requirePicOperationalWindow, async (req, res) => {
  try {
    const { picUserId, orderId, code } = req.body;
    if (!picUserId || !orderId || !code) {
      return res.status(400).json({ error: 'picUserId, orderId, and code are required', code: 'VALIDATION_ERROR' });
    }

    const result = await EventPicService.confirmHandoffWithCode({
      picUserId,
      orderId,
      handshakeCode: code
    });

    res.json({
      success: true,
      message: 'Handoff dual-confirmed. Order stage advanced to HANDOFF_READY.',
      result
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * PIC verifies buyer at turnstile gate and confirms entry using buyer's code (Dual Confirmation Step 2)
 * Mandatory photo evidence (buyer + ticket at gate)
 * POST /api/mvp/pic/confirm-entry
 */
router.post('/pic/confirm-entry', upload.any(), requirePicOperationalWindow, async (req, res) => {
  try {
    const picUserId = getCallerId(req, req.body?.picUserId);
    const { orderId, code, gate, notes } = req.body;
    if (!picUserId || !orderId || !code) {
      return res.status(400).json({ error: 'picUserId, orderId, and code are required', code: 'VALIDATION_ERROR' });
    }

    let evidenceBundleId = req.body.evidenceBundleId || null;
    if (req.files && req.files.length > 0) {
      const encryptedFiles = [];
      for (const file of req.files) {
        const fileBuffer = fs.readFileSync(file.path);
        const encPath = file.path + '.enc';
        EvidenceStorageService.encryptAndStore(fileBuffer, encPath);
        encryptedFiles.push({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: encPath,
          encrypted: true
        });
      }
      const bundle = await createEvidenceBundle(`gate-${orderId}`, picUserId, encryptedFiles);
      evidenceBundleId = bundle.id;
    } else if (!evidenceBundleId && !req.body.photoFile) {
      return res.status(400).json({
        error: 'Mandatory photo evidence (buyer + ticket at gate) required for ENTRY',
        code: 'GATE_PHOTO_MANDATORY'
      });
    }

    const result = await EventPicService.confirmEntryWithCode({
      picUserId,
      orderId,
      handshakeCode: code,
      gate: gate || 'Pintu Utama',
      notes,
      evidenceBundleId,
      photoFile: true
    });

    res.json({
      success: true,
      message: 'Dual-confirmation successful. Turnstile admission verified and entry confirmed!',
      result
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Blocked legacy endpoint: PIC cannot issue entry challenge
 * POST /api/mvp/pic/prepare-entry
 */
router.post('/pic/prepare-entry', (req, res) => {
  return res.status(403).json({
    error: 'PIC cannot generate ENTRY_CONFIRMED challenge. The entry challenge must be generated by the Buyer (POST /api/mvp/buyer/orders/:id/entry-challenge).',
    code: 'PIC_CANNOT_ISSUE_ENTRY_CHALLENGE'
  });
});

/**
 * PIC verifies ticket at meetup point (TICKET_VERIFIED != ENTRY_CONFIRMED)
 * Mandatory photo evidence blocking
 * POST /api/mvp/pic/verify-ticket
 */
router.post('/pic/verify-ticket', upload.any(), requirePicOperationalWindow, async (req, res) => {
  try {
    const { picUserId, orderId, notes } = req.body;
    if (!picUserId || !orderId) {
      return res.status(400).json({ error: 'picUserId and orderId are required', code: 'VALIDATION_ERROR' });
    }

    let evidenceBundleId = req.body.evidenceBundleId || null;
    if (req.files && req.files.length > 0) {
      const encryptedFiles = [];
      for (const file of req.files) {
        const fileBuffer = fs.readFileSync(file.path);
        const encPath = file.path + '.enc';
        EvidenceStorageService.encryptAndStore(fileBuffer, encPath);
        encryptedFiles.push({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: encPath,
          encrypted: true
        });
      }
      const bundle = await createEvidenceBundle(`ticket-${orderId}`, picUserId, encryptedFiles);
      evidenceBundleId = bundle.id;
    }

    const requirePhoto = req.body.requirePhoto === 'true' || req.body.requirePhoto === true;
    if (requirePhoto && !evidenceBundleId) {
      return res.status(400).json({
        error: 'Mandatory photo evidence required for TICKET_VERIFIED',
        code: 'EVIDENCE_PHOTO_MANDATORY'
      });
    }

    const result = await EventPicService.recordTicketVerification({
      picUserId,
      orderId,
      notes,
      evidenceBundleId,
      photoFile: !!evidenceBundleId,
      requirePhoto
    });

    res.json({
      success: true,
      message: 'Ticket handoff verified by PIC. Escrow remains held until venue admission.',
      result
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * PIC updates operational stage for an order
 * POST /api/mvp/pic/operational-stage
 */
router.post('/pic/operational-stage', async (req, res) => {
  try {
    const { picUserId, orderId, stage, notes, reason, evidenceBundleId } = req.body;
    if (!picUserId || !orderId || !stage) {
      return res.status(400).json({ error: 'picUserId, orderId, and stage are required', code: 'VALIDATION_ERROR' });
    }

    const result = await EventPicService.updateOperationalStage({
      picUserId,
      orderId,
      stage,
      notes,
      reason,
      evidenceBundleId
    });

    res.json({
      success: true,
      message: `Operational stage updated to ${stage}.`,
      result
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
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
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
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
  const callerId = getCallerId(req, req.query.requesterId);
  if (!callerId) {
    return res.status(401).json({ error: 'requester identity required', code: 'AUTH_REQUIRED' });
  }
  const caller = findUser(callerId);
  if (!caller) {
    return res.status(401).json({ error: 'Unknown requester', code: 'AUTH_REQUIRED' });
  }
  if (caller.role !== 'admin' && caller.role !== 'pic') {
    return res.status(403).json({ error: 'Forbidden: ops console requires admin or pic role', code: 'FORBIDDEN' });
  }
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
      open_disputes_count: openDisputes.length,
      email_infrastructure: emailService.getTelemetry()
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
 * Admin / Operations Email Infrastructure Status
 * GET /api/mvp/admin/email-status
 */
router.get('/admin/email-status', (req, res) => {
  const callerId = getCallerId(req, req.query.requesterId);
  if (!callerId) {
    return res.status(401).json({ error: 'requester identity required', code: 'AUTH_REQUIRED' });
  }
  const caller = findUser(callerId);
  if (!caller || (caller.role !== 'admin' && caller.role !== 'pic')) {
    return res.status(403).json({ error: 'Forbidden: requires admin or pic role', code: 'FORBIDDEN' });
  }
  res.json({ success: true, email: emailService.getTelemetry() });
});

// In-memory rate limiting map for admin test emails (max 3 per 5 minutes per officer)
const adminTestRateLimits = new Map();
const ALLOWED_TEST_RECIPIENTS = new Set([
  'agunsux@gmail.com',
  'admin@tikum.app',
  'support@tikum.app',
  'hello@tikum.app',
  'pic@tikum.app'
]);

/**
 * Admin Live Diagnostic Email Test
 * POST /api/mvp/admin/email-test
 * Strictly admin-only, rate-limited, audit-logged, restricted recipient
 */
router.post('/admin/email-test', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body?.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'officerId required', code: 'AUTH_REQUIRED' });
    }
    const officer = requireAdmin(officerId);

    // Rate Limiting (max 3 per 5 minutes)
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    let timestamps = (adminTestRateLimits.get(officerId) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= 3) {
      return res.status(429).json({
        error: 'Rate limit exceeded: maximum 3 email test dispatches per 5 minutes per admin',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
    timestamps.push(now);
    adminTestRateLimits.set(officerId, timestamps);

    // Recipient validation: strictly restricted to verified business addresses or officer email
    const requestedRecipient = req.body?.recipient ? req.body.recipient.trim().toLowerCase() : 'agunsux@gmail.com';
    const officerEmail = (officer.email || '').toLowerCase();
    if (!ALLOWED_TEST_RECIPIENTS.has(requestedRecipient) && requestedRecipient !== officerEmail) {
      return res.status(400).json({
        error: 'Invalid test recipient: recipient must be a verified business routing address or your officer account email',
        code: 'INVALID_RECIPIENT'
      });
    }

    // Audit log test attempt
    await recordAuditLog('ADMIN', officerId, 'EMAIL_TEST_TRIGGERED', officerId, {
      recipient: requestedRecipient,
      timestamp: new Date().toISOString()
    });

    emailService.lastTestTimestamp = new Date().toISOString();

    const dispatchResult = await emailService.sendEmail({
      to: requestedRecipient,
      template: 'ADMIN_TEST',
      replyTo: 'admin@tikum.app',
      idempotencyKey: `admin-test:${officerId}:${now}`,
      data: { adminId: officer.id }
    });

    res.json({
      success: dispatchResult.success,
      message: dispatchResult.success ? 'Diagnostic test email processed successfully' : 'Diagnostic test email not delivered',
      details: dispatchResult,
      telemetry: emailService.getTelemetry()
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Admin verifies or rejects a listing
 * POST /api/mvp/admin/listings/:id/verify
 */
router.post('/admin/listings/:id/verify', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'officerId required', code: 'AUTH_REQUIRED' });
    }
    requireAdmin(officerId);
    const { approved, reason } = req.body;
    const result = await ListingService.verifyListing(req.params.id, officerId, { approved, reason });
    res.json(result);
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Admin requests a 5-minute step-up authentication token
 * POST /api/mvp/admin/step-up-token
 */
router.post('/admin/step-up-token', (req, res) => {
  const { officerId, password } = req.body;
  const officer = findUser(officerId);
  if (!officer || officer.role !== 'admin') {
    return res.status(401).json({ error: 'Admin credentials required', code: 'ADMIN_UNAUTHORIZED' });
  }
  if (officer.password && officer.password !== password) {
    return res.status(401).json({ error: 'Invalid password', code: 'AUTH_FAILED' });
  }

  const token = `stp-${uuidv4()}`;
  const record = {
    token,
    admin_id: officer.id,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
  };
  state.step_up_tokens.push(record);

  res.json({
    success: true,
    step_up_token: token,
    expires_at: record.expires_at
  });
});

/**
 * Admin resolves a dispute (Irreversible financial action - requires Step-Up Auth)
 * POST /api/mvp/admin/disputes/:id/resolve
 */
router.post('/admin/disputes/:id/resolve', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'officerId required', code: 'AUTH_REQUIRED' });
    }
    
    // Epic 3.5: Step-Up Authentication Required
    const stepUp = verifyAdminStepUp(req, officerId);
    const { outcome, decisionReason, decisionNotes } = req.body;

    const result = await DisputeService.resolveDispute({
      disputeId: req.params.id,
      officerId,
      outcome,
      decisionReason: decisionReason || stepUp.reason,
      decisionNotes: decisionNotes || stepUp.reason
    });

    await recordAuditLog('ADMIN_STEP_UP', req.params.id, 'DISPUTE_STEP_UP_RESOLVED', officerId, {
      outcome,
      reason: stepUp.reason
    });

    res.json({
      success: true,
      message: `Dispute resolved with outcome ${outcome}. [STEP-UP VERIFIED]`,
      result
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Admin executes settlement payout to seller after verified gate entry
 * Irreversible financial action - requires Step-Up Auth
 * POST /api/mvp/admin/settlements/execute
 * NOTE: SIMULATED / PILOT-ONLY until real payment/escrow provider is integrated.
 */
router.post('/admin/settlements/execute', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'officerId required', code: 'AUTH_REQUIRED' });
    }

    // Epic 3.5: Step-Up Authentication Required
    const stepUp = verifyAdminStepUp(req, officerId);
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

    await recordAuditLog('ADMIN_STEP_UP', orderId, 'SETTLEMENT_STEP_UP_EXECUTED', officerId, {
      reason: stepUp.reason,
      amount: escrow?.amount
    });

    res.json({
      success: true,
      message: 'Settlement successfully executed and disbursed to seller. [SIMULATED / PILOT-ONLY / STEP-UP VERIFIED]',
      settlement: result.settlement,
      settlement_mode: 'SIMULATED'
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Admin manual state override (Irreversible action - requires Step-Up Auth)
 * POST /api/mvp/admin/override-state
 */
router.post('/admin/override-state', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'officerId required', code: 'AUTH_REQUIRED' });
    }

    const stepUp = verifyAdminStepUp(req, officerId);
    const { orderId, targetState } = req.body;

    const order = state.orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });

    const previousState = order.status;
    order.status = targetState;
    order.operational_stage = targetState;

    await recordAuditLog('ADMIN_STEP_UP', orderId, 'MANUAL_STATE_OVERRIDE', officerId, {
      previous_state: previousState,
      new_state: targetState,
      reason: stepUp.reason
    });

    res.json({
      success: true,
      message: `State manually overridden to ${targetState} with step-up verification.`,
      order
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Admin: List all events with management metadata (Epic 3.6)
 * GET /api/mvp/admin/events
 */
router.get('/admin/events', (req, res) => {
  const callerId = getCallerId(req, req.query?.requesterId, req.query?.officerId);
  if (!callerId) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  const caller = findUser(callerId);
  if (!caller || caller.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required', code: 'FORBIDDEN' });
  }

  const events = state.events.map(e => {
    const activeListings = state.listings.filter(l => l.event_id === e.id);
    return {
      ...e,
      active_listings_count: activeListings.filter(l => l.status === 'ACTIVE').length,
      total_listings_count: activeListings.length
    };
  });

  res.json({ success: true, events, total: events.length });
});

/**
 * Admin: Toggle event verification status (Epic 3.6)
 * POST /api/mvp/admin/events/:id/verify
 */
router.post('/admin/events/:id/verify', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body?.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    const officer = findUser(officerId);
    if (!officer || officer.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required', code: 'FORBIDDEN' });
    }

    const event = state.events.find(e => e.id === req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found', code: 'NOT_FOUND' });
    }

    const isVerified = req.body.is_verified !== undefined ? Boolean(req.body.is_verified) : true;
    event.is_verified = isVerified;

    await recordAuditLog('EVENT', event.id, isVerified ? 'EVENT_VERIFIED' : 'EVENT_UNVERIFIED', officerId, {
      event_name: event.name || event.title,
      is_verified: isVerified,
      reason: req.body.reason || null
    });

    res.json({
      success: true,
      message: `Event '${event.name || event.title}' verification updated to ${isVerified}.`,
      event
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Admin: Edit event details (Epic 3.6)
 * PATCH /api/mvp/admin/events/:id
 */
router.patch('/admin/events/:id', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body?.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    const officer = findUser(officerId);
    if (!officer || officer.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required', code: 'FORBIDDEN' });
    }

    const event = state.events.find(e => e.id === req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found', code: 'NOT_FOUND' });
    }

    const { name, venue_name, venue_city, start_date, end_date, category, status, official_link, poster_url } = req.body;
    if (name) { event.name = name.trim(); event.title = name.trim(); }
    if (venue_name) { event.venue_name = venue_name.trim(); event.venue = venue_name.trim(); }
    if (venue_city) { event.venue_city = venue_city.trim(); }
    if (start_date) { event.start_date = start_date.trim(); event.date = start_date.trim(); }
    if (end_date !== undefined) { event.end_date = end_date ? end_date.trim() : null; }
    if (category) { event.category = category.toUpperCase().trim(); }
    if (status) { event.status = status.toUpperCase().trim(); }
    if (official_link !== undefined) { event.official_link = official_link; }
    if (poster_url !== undefined) { event.poster_url = poster_url; }

    await recordAuditLog('EVENT', event.id, 'EVENT_UPDATED', officerId, {
      updated_fields: Object.keys(req.body)
    });

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Admin: Cancel event / soft-delete (Epic 3.6)
 * POST /api/mvp/admin/events/:id/cancel
 */
router.post('/admin/events/:id/cancel', async (req, res) => {
  try {
    const officerId = getCallerId(req, req.body?.officerId);
    if (!officerId) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    const officer = findUser(officerId);
    if (!officer || officer.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required', code: 'FORBIDDEN' });
    }

    const event = state.events.find(e => e.id === req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found', code: 'NOT_FOUND' });
    }

    event.status = 'DIBATALKAN';

    await recordAuditLog('EVENT', event.id, 'EVENT_CANCELLED', officerId, {
      reason: req.body.reason || 'Admin cancellation'
    });

    res.json({ success: true, message: `Event '${event.name || event.title}' telah dibatalkan.`, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// EVIDENCE & UU PDP ACCESS ENDPOINTS
// =============================================================================

/**
 * Generate signed short-lived URL for PII evidence
 * POST /api/mvp/evidence/signed-url
 */
router.post('/evidence/signed-url', (req, res) => {
  try {
    const requesterId = getCallerId(req, req.body?.requesterId);
    if (!requesterId || !req.user) {
      return res.status(401).json({ error: 'Auth required', code: 'AUTH_REQUIRED' });
    }

    const { evidenceId, orderId } = req.body;
    if (!evidenceId || !orderId) {
      return res.status(400).json({ error: 'evidenceId and orderId required', code: 'VALIDATION_ERROR' });
    }

    const permission = EvidenceStorageService.checkAccessPermission({
      requesterId,
      requesterRole: req.user.role,
      orderId
    });

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason, code: 'EVIDENCE_ACCESS_DENIED' });
    }

    const signed = EvidenceStorageService.generateSignedToken({
      evidenceId,
      userId: requesterId,
      role: req.user.role,
      orderId
    });

    res.json({
      success: true,
      signedUrl: `/api/mvp/evidence/${evidenceId}/file?token=${signed.token}`,
      expiresAt: signed.expiresAt
    });
  } catch (err) {
    res.status(mapRouterError(err)).json({ error: err.message, code: err.code });
  }
});

/**
 * Serve decrypted PII evidence with access logging (UU PDP compliance)
 * GET /api/mvp/evidence/:id/file
 */
router.get('/evidence/:id/file', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(401).json({ error: 'Signed token required', code: 'AUTH_REQUIRED' });
    }

    const verified = EvidenceStorageService.verifySignedToken(token);
    if (verified.evidenceId !== req.params.id) {
      return res.status(403).json({ error: 'Token does not match requested evidence', code: 'EVIDENCE_ACCESS_DENIED' });
    }

    const permission = EvidenceStorageService.checkAccessPermission({
      requesterId: verified.userId,
      requesterRole: verified.role,
      orderId: verified.orderId
    });

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason, code: 'EVIDENCE_ACCESS_DENIED' });
    }

    // Log access to PII evidence under UU PDP
    await EvidenceStorageService.logEvidenceAccess({
      evidenceId: req.params.id,
      orderId: verified.orderId,
      accessedBy: verified.userId,
      role: verified.role,
      accessPurpose: 'INSPECTION_UNDER_UU_PDP',
      ip: req.ip || req.socket?.remoteAddress || '127.0.0.1'
    });

    const bundle = state.evidence_bundles.find(b => b.id === req.params.id);
    if (!bundle) {
      return res.status(404).json({ error: 'Evidence bundle not found', code: 'NOT_FOUND' });
    }

    const files = JSON.parse(bundle.files_json);
    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'No files in evidence bundle', code: 'NOT_FOUND' });
    }

    const targetFile = files[0];
    if (targetFile.encrypted) {
      const decrypted = EvidenceStorageService.decryptFile(targetFile.path);
      res.setHeader('Content-Type', targetFile.mimetype || 'image/jpeg');
      return res.send(decrypted);
    } else if (fs.existsSync(targetFile.path)) {
      return res.sendFile(path.resolve(targetFile.path));
    } else {
      return res.status(404).json({ error: 'Evidence file not on disk', code: 'NOT_FOUND' });
    }
  } catch (err) {
    res.status(mapRouterError(err, 403)).json({ error: err.message, code: err.code || 'EVIDENCE_ACCESS_DENIED' });
  }
});

// =============================================================================
// PRICING, TAX, QUOTE & ECONOMICS ENGINE ENDPOINTS
// =============================================================================
const { MarketplacePricingEngine } = require('../pricing/MarketplacePricingEngine');
const { TaxEngine } = require('../pricing/TaxEngine');
const { TransactionQuoteService } = require('../pricing/TransactionQuoteService');
const { EconomicsEngine } = require('../pricing/EconomicsEngine');

/**
 * Calculate transparent quote preview for buyer and seller
 * POST /api/mvp/pricing/calculate
 */
router.post('/pricing/calculate', async (req, res) => {
  try {
    const {
      ticketPrice,
      listingId = null,
      buyerId = null,
      sellerId = null,
      policyVersion = '2026.1-ID-DEFAULT',
      taxPolicyVersion = '2026.1-ID-TAX',
      lockQuote = false
    } = req.body;

    if (!ticketPrice || parseInt(ticketPrice, 10) <= 0) {
      return res.status(400).json({ error: 'Valid positive ticketPrice is required', code: 'INVALID_TICKET_PRICE' });
    }

    if (lockQuote) {
      const quote = await TransactionQuoteService.generateQuote({
        listingId,
        ticketPrice: parseInt(ticketPrice, 10),
        buyerId,
        sellerId,
        pricingPolicyVersion: policyVersion,
        taxPolicyVersion: taxPolicyVersion
      });
      return res.json({
        success: true,
        quote_id: quote.id,
        pricing: quote
      });
    }

    // Resolve seller tax profile if sellerId or listingId is provided
    let effectiveSellerId = sellerId;
    if (!effectiveSellerId && listingId) {
      const listing = state.listings.find(l => l.id === listingId);
      if (listing) effectiveSellerId = listing.seller_id;
    }
    const sellerProfile = state.seller_profiles?.find(sp => sp.user_id === effectiveSellerId) || {};
    const sellerTaxProfile = {
      seller_type: sellerProfile.seller_type || 'INDIVIDUAL',
      spt_declaration_submitted: sellerProfile.spt_declaration_submitted === true,
      annual_turnover: sellerProfile.annual_turnover || 0,
      tax_exempt: sellerProfile.tax_exempt === true,
      exemption_reason: sellerProfile.exemption_reason || null
    };

    const fees = MarketplacePricingEngine.calculateFees({
      ticketPrice: parseInt(ticketPrice, 10),
      policyVersion
    });

    const taxes = TaxEngine.calculateTax({
      ticketPrice: parseInt(ticketPrice, 10),
      buyerPlatformFee: fees.buyer_fee,
      sellerTaxProfile,
      taxPolicyVersion
    });

    const buyerTotal = parseInt(ticketPrice, 10) + fees.buyer_fee + taxes.total_buyer_tax;
    const sellerNetPayout = parseInt(ticketPrice, 10) - fees.seller_fee - taxes.total_seller_tax_withholding;

    res.json({
      success: true,
      ticket_price: parseInt(ticketPrice, 10),
      currency: fees.currency,
      buyer_fee: fees.buyer_fee,
      seller_fee: fees.seller_fee,
      total_platform_fee: fees.total_platform_fee,
      buyer_tax: taxes.total_buyer_tax,
      seller_tax_withholding: taxes.total_seller_tax_withholding,
      total_tax: taxes.total_tax_collected,
      buyer_total: buyerTotal,
      seller_net_payout: sellerNetPayout,
      pricing_breakdown: fees,
      tax_breakdown: taxes
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'PRICING_CALCULATION_ERROR' });
  }
});

/**
 * Retrieve quote by ID and inspect lock status
 * GET /api/mvp/pricing/quote/:id
 */
router.get('/pricing/quote/:id', (req, res) => {
  const quote = TransactionQuoteService.getQuote(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
  }
  res.json({ success: true, quote });
});

/**
 * List all registered pricing policies (Admin only)
 * GET /api/mvp/admin/pricing/policies
 */
router.get('/admin/pricing/policies', (req, res) => {
  const callerId = getCallerId(req, req.query.requesterId);
  if (!callerId) return res.status(401).json({ error: 'requester identity required', code: 'AUTH_REQUIRED' });
  const caller = findUser(callerId);
  if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required', code: 'FORBIDDEN' });

  const policies = MarketplacePricingEngine.listPolicies();
  res.json({ success: true, policies });
});

/**
 * Register or update pricing policy (Admin only)
 * POST /api/mvp/admin/pricing/policies
 */
router.post('/admin/pricing/policies', async (req, res) => {
  const callerId = getCallerId(req, req.body?.officerId);
  if (!callerId) return res.status(401).json({ error: 'requester identity required', code: 'AUTH_REQUIRED' });
  const caller = findUser(callerId);
  if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required', code: 'FORBIDDEN' });

  try {
    const policy = await MarketplacePricingEngine.registerPolicy(req.body, callerId);
    res.status(201).json({ success: true, policy });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'POLICY_REGISTRATION_FAILED' });
  }
});

/**
 * List all registered tax policies (Admin only)
 * GET /api/mvp/admin/tax/policies
 */
router.get('/admin/tax/policies', (req, res) => {
  const callerId = getCallerId(req, req.query.requesterId);
  if (!callerId) return res.status(401).json({ error: 'requester identity required', code: 'AUTH_REQUIRED' });
  const caller = findUser(callerId);
  if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required', code: 'FORBIDDEN' });

  const policies = TaxEngine.listPolicies();
  res.json({ success: true, policies });
});

/**
 * Register or update tax policy (Admin only)
 * POST /api/mvp/admin/tax/policies
 */
router.post('/admin/tax/policies', async (req, res) => {
  const callerId = getCallerId(req, req.body?.officerId);
  if (!callerId) return res.status(401).json({ error: 'requester identity required', code: 'AUTH_REQUIRED' });
  const caller = findUser(callerId);
  if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required', code: 'FORBIDDEN' });

  try {
    const policy = await TaxEngine.registerPolicy(req.body, callerId);
    res.status(201).json({ success: true, policy });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'TAX_POLICY_REGISTRATION_FAILED' });
  }
});

/**
 * Live unit economics and contribution margin report (Admin only)
 * GET /api/mvp/admin/economics/contribution-margin
 */
router.get('/admin/economics/contribution-margin', (req, res) => {
  const callerId = getCallerId(req, req.query.requesterId);
  if (!callerId) return res.status(401).json({ error: 'requester identity required', code: 'AUTH_REQUIRED' });
  const caller = findUser(callerId);
  if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required', code: 'FORBIDDEN' });

  const summary = EconomicsEngine.calculateContributionMargin({
    startDate: req.query.startDate,
    endDate: req.query.endDate
  });

  res.json({ success: true, economics: summary });
});

module.exports = router;

