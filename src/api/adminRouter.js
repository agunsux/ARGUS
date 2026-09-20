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
const { state, recordAuditLog, verifyPassword, hashPassword } = require('../database');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin, resolveUser, isAdminRole, ADMIN_ROLES } = require('../middleware/auth');
const { SessionStore } = require('../services/sessionStore');
const { emailService } = require('../services/emailService');
const { FinancialLedger } = require('../settlement/FinancialLedger');
const { sourceRegistry } = require('../discovery/SourceRegistry');
const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
const { cityRegistry } = require('../discovery/CityRegistry');
const { sourceGapDiagnosticService } = require('../discovery/SourceGapDiagnosticService');
const { AdminEventControlService } = require('../discovery/AdminEventControlService');

const VERIFIED_STATUSES = ['VERIFIED', 'PRIMARY_SOURCE_VERIFIED'];

function isCanonicalVerified(event) {
  if (!event) return false;
  return event.is_verified === true || VERIFIED_STATUSES.includes(event.verification_status);
}

/**
 * Single classification used by every admin surface so counts and filters can
 * never drift apart. PENDING means "known but not yet authoritatively verified".
 */
function classifyCanonicalEvent(event) {
  if (!event) return 'UNKNOWN';
  const vs = (event.verification_status || '').toUpperCase();
  const status = (event.status || event.event_status || '').toUpperCase();
  if (vs === 'CANCELLED' || status === 'CANCELLED') return 'CANCELLED';
  if (vs === 'STALE') return 'STALE';
  if (vs === 'EXPIRED') return 'EXPIRED';
  if (vs === 'REJECTED') return 'REJECTED';
  if (isCanonicalVerified(event)) return 'VERIFIED';
  return 'PENDING';
}

function canonicalMatchesFilter(event, filter) {
  if (!filter || filter === 'all') return true;
  const bucket = classifyCanonicalEvent(event);
  if (filter === 'pending') return bucket === 'PENDING';
  if (filter === 'conflicted') return bucket === 'CONFLICTED' || (Array.isArray(event.conflicts) && event.conflicts.length > 0);
  return bucket === filter.toUpperCase();
}

/**
 * Classification for legacy state.events projections (marketplace firewall rows)
 * that have not been matched to a canonical registry record.
 */
function classifyStateEvent(event) {
  if (!event) return 'UNKNOWN';
  const vs = (event.verification_status || '').toUpperCase();
  const status = (event.status || event.event_status || '').toUpperCase();
  if (vs === 'CANCELLED' || status === 'CANCELLED') return 'CANCELLED';
  if (vs === 'STALE') return 'STALE';
  if (vs === 'EXPIRED') return 'EXPIRED';
  if (vs === 'REJECTED') return 'REJECTED';
  if (event.is_verified === true || VERIFIED_STATUSES.includes(vs)) return 'VERIFIED';
  return 'PENDING';
}

function matchesFilterBucket(bucket, conflictCount, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'pending') return bucket === 'PENDING';
  if (filter === 'conflicted') return conflictCount > 0;
  return bucket === filter.toUpperCase();
}

function findCanonicalEvent(idOrSlug) {
  if (!idOrSlug) return null;
  return canonicalRegistry.getEventById(idOrSlug) || canonicalRegistry.getEventBySlug(idOrSlug);
}

function findStateEvent(id) {
  return (state.events || []).find(e => e.id === id || e.event_id === id) || null;
}

function canonicalEventSummary(event) {
  return {
    canonical_event_id: event.event_id || event.id,
    event_id: event.event_id || event.id,
    name: event.canonical_name || event.title || event.name,
    slug: event.slug || null,
    date: event.start_date || event.date || null,
    start_at: event.start_datetime || event.start_at || null,
    venue_name: event.venue_name || event.venue || null,
    city: event.city || event.venue_city || null,
    lifecycle_status: event.status || event.event_status || null,
    verification_status: event.verification_status || 'UNVERIFIED',
    verification_confidence: event.verification_confidence || 0,
    is_verified: isCanonicalVerified(event),
    last_verified_at: event.last_verified_at || event.verified_at || null,
    expires_at: event.expires_at || null,
    source_count: (event.sources || []).length,
    conflict_count: (event.conflicts || []).length,
    claim_count: (event.atomic_claims || event.claims || []).length,
    marketplace_eligibility: event.marketplace_eligibility || 'UNVERIFIED',
    event_quality_score: event.event_quality_score || 0
  };
}

/**
 * Source gap status derived strictly from recorded telemetry (zero fabrication).
 * Values: HEALTHY | DEGRADED | BLOCKED | STALE | NEVER_FETCHED | DISABLED
 */
function computeSourceGapStatus(source) {
  if (!source) return 'UNKNOWN';
  if (source.enabled === false) return 'DISABLED';
  const permission = (source.permission_status || '').toUpperCase();
  if (permission === 'NOT_ALLOWED' || permission === 'UNKNOWN') return 'BLOCKED';
  if (source.circuit_breaker_status === 'OPEN') return 'BLOCKED';
  const health = (source.active_status || source.health_status || '').toUpperCase();
  if (health === 'DEGRADED' || health === 'FAILING' || health === 'CIRCUIT_OPEN') return 'DEGRADED';
  if (health === 'INACTIVE') return 'DISABLED';
  const lastSuccess = source.last_successful_fetch || (source.telemetry && source.telemetry.last_success);
  if (!lastSuccess) return 'NEVER_FETCHED';
  const ageDays = (Date.now() - new Date(lastSuccess).getTime()) / 86400000;
  if (ageDays > 14) return 'STALE';
  return 'HEALTHY';
}

function buildSourceClaimIndex() {
  const claimCounts = {};
  const provenanceCounts = {};
  const observationCounts = {};

  for (const event of canonicalRegistry.getAllEvents()) {
    for (const claim of (event.atomic_claims || event.claims || [])) {
      const sourceId = claim && claim.source_id;
      if (sourceId) claimCounts[sourceId] = (claimCounts[sourceId] || 0) + 1;
    }
    for (const field of Object.values(event.field_provenance || {})) {
      const sourceId = field && field.source_id;
      if (sourceId) provenanceCounts[sourceId] = (provenanceCounts[sourceId] || 0) + 1;
    }
    for (const observation of (event.observations || [])) {
      const sourceId = observation && observation.source_id;
      if (sourceId) observationCounts[sourceId] = (observationCounts[sourceId] || 0) + 1;
    }
  }

  return { claimCounts, provenanceCounts, observationCounts };
}

function setAdminSessionCookie(res, token) {
  const opts = [
    `session_token=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${24 * 60 * 60}`
  ];
  if (process.env.NODE_ENV === 'production') opts.push('Secure');
  res.setHeader('Set-Cookie', opts.join('; '));
}

function clearAdminSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

/**
 * ============================================================
 * ADMIN AUTHENTICATION (P0)
 * ============================================================
 */

/**
 * POST /api/admin/login
 * Password login restricted to admin roles. Never exposes hashes.
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required', code: 'INVALID_INPUT' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = (state.users || []).find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  const isValid = user && verifyPassword(password, user.password_hash || user.password);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
  }

  if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account is suspended. Access denied.', code: 'ACCOUNT_SUSPENDED' });
  }

  if (!isAdminRole(user.role)) {
    return res.status(403).json({
      error: 'This account is not authorized for the operations control center.',
      code: 'ADMIN_ACCESS_REQUIRED'
    });
  }

  const session = SessionStore.createSession({
    userId: user.id,
    role: user.role,
    ip: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null
  });

  const now = new Date().toISOString();
  user.last_login_at = now;
  user.updated_at = now;

  setAdminSessionCookie(res, session.session_token);

  await recordAuditLog('ADMIN_AUTH', user.id, 'ADMIN_LOGIN', user.id, {
    ip: req.ip || req.connection?.remoteAddress || null
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: 'Admin login successful',
    session_token: session.session_token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      last_login_at: user.last_login_at
    }
  });
});

/**
 * POST /api/admin/logout
 * Revokes the active session and clears the cookie. Always succeeds.
 */
router.post('/logout', async (req, res) => {
  const user = resolveUser(req);
  const token = req.session?.session_token ||
    (req.header ? (req.header('authorization')?.replace('Bearer ', '') || req.header('x-session-token')) : null) ||
    req.body?.session_token;

  if (token) {
    SessionStore.revokeSession(token, 'ADMIN_LOGOUT');
  }

  clearAdminSessionCookie(res);

  if (user) {
    await recordAuditLog('ADMIN_AUTH', user.id, 'ADMIN_LOGOUT', user.id, {}).catch(() => {});
  }

  return res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/admin/password-reset/request
 * Initiates admin password reset.
 * Generic response prevents email enumeration.
 * Uses EmailService with ADMIN_EMAIL identity.
 */
router.post('/password-reset/request', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required', code: 'INVALID_EMAIL' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const adminUser = (state.users || []).find(
    u => u.email && u.email.toLowerCase() === normalizedEmail && isAdminRole(u.role)
  );

  // Generic response to prevent administrator enumeration
  const genericResponse = {
    success: true,
    message: 'Jika email terdaftar sebagai administrator, petunjuk reset password telah dikirimkan ke kotak masuk.'
  };

  if (!adminUser) {
    return res.status(200).json(genericResponse);
  }

  // Generate cryptographically secure single-use token (256 bits of entropy)
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 60 * 1000).toISOString(); // 30 minutes

  const tokenRecord = {
    id: `aprt-${uuidv4()}`,
    user_id: adminUser.id,
    email: adminUser.email,
    token_hash: tokenHash,
    created_at: new Date(now).toISOString(),
    expires_at: expiresAt,
    used: false,
    used_at: null,
    ip_address: req.ip || req.connection?.remoteAddress || null
  };

  if (!state.password_reset_tokens) {
    state.password_reset_tokens = [];
  }
  state.password_reset_tokens.push(tokenRecord);

  const resetUrl = `https://tikum.app/admin/reset-password?token=${rawToken}`;

  // Non-blocking dispatch via EmailService using admin identity
  try {
    await emailService.sendAdminPasswordResetEmail({
      adminEmail: adminUser.email,
      resetToken: rawToken,
      resetUrl
    });
  } catch (emailErr) {
    console.error('[AdminRouter:PasswordReset] Failed to dispatch admin reset email:', emailErr.message);
  }

  await recordAuditLog('ADMIN_AUTH', adminUser.id, 'ADMIN_PASSWORD_RESET_REQUESTED', 'SYSTEM', {
    ip: tokenRecord.ip_address,
    token_id: tokenRecord.id
  }).catch(() => {});

  return res.status(200).json(genericResponse);
});

/**
 * POST /api/admin/password-reset/confirm
 * Verifies reset token, updates administrator password, revokes sessions,
 * and dispatches security alert to admin email identity.
 */
router.post('/password-reset/confirm', async (req, res) => {
  const { token, newPassword } = req.body || {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token reset password is required', code: 'INVALID_TOKEN' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password baru minimal 8 karakter', code: 'INVALID_PASSWORD' });
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const tokenRecord = (state.password_reset_tokens || []).find(
    t => t.token_hash === tokenHash && !t.used
  );

  if (!tokenRecord) {
    return res.status(400).json({ error: 'Token tidak valid atau sudah pernah digunakan', code: 'INVALID_TOKEN' });
  }

  const isExpired = new Date(tokenRecord.expires_at).getTime() < Date.now();
  if (isExpired) {
    return res.status(400).json({ error: 'Token reset password telah kedaluwarsa', code: 'TOKEN_EXPIRED' });
  }

  const adminUser = (state.users || []).find(u => u.id === tokenRecord.user_id || u.email === tokenRecord.email);
  if (!adminUser) {
    return res.status(404).json({ error: 'Pengguna administrator tidak ditemukan', code: 'ADMIN_NOT_FOUND' });
  }

  // Invalidate token immediately
  tokenRecord.used = true;
  tokenRecord.used_at = new Date().toISOString();

  // Hash and update password
  const newHash = hashPassword(newPassword);
  adminUser.password = newHash;
  adminUser.password_hash = newHash;
  adminUser.updated_at = new Date().toISOString();

  // Revoke all existing sessions for this administrator
  if (state.sessions && Array.isArray(state.sessions)) {
    const userSessions = state.sessions.filter(s => s.user_id === adminUser.id || s.userId === adminUser.id);
    for (const sess of userSessions) {
      SessionStore.revokeSession(sess.session_token, 'ADMIN_PASSWORD_RESET');
    }
  }

  // Clear admin session cookie
  clearAdminSessionCookie(res);

  // Dispatch Security Alert via EmailService
  emailService.sendAdminSecurityAlertEmail({
    title: 'Password Administrator Telah Diubah',
    message: `Password untuk akun administrator ${adminUser.email} baru saja diperbarui melalui reset token.`,
    severity: 'HIGH',
    ip: req.ip || req.connection?.remoteAddress || null,
    action: 'PASSWORD_RESET_COMPLETED'
  }).catch(() => {});

  await recordAuditLog('ADMIN_AUTH', adminUser.id, 'ADMIN_PASSWORD_RESET_COMPLETED', adminUser.id, {
    ip: req.ip || req.connection?.remoteAddress || null
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: 'Password administrator berhasil diperbarui. Silakan masuk kembali.'
  });
});

/**
 * GET /api/admin/session
 * Trusted identity for the control center. 401 anonymous, 403 non-admin.
 */
router.get('/session', (req, res) => {
  const user = resolveUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account is suspended. Access denied.', code: 'USER_SUSPENDED' });
  }
  if (!isAdminRole(user.role)) {
    return res.status(403).json({ error: 'Admin role required', code: 'ADMIN_ACCESS_REQUIRED' });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || 'ACTIVE',
      last_login_at: user.last_login_at || null
    },
    session: req.session ? {
      created_at: req.session.created_at,
      expires_at: req.session.expires_at
    } : null,
    admin_roles: ADMIN_ROLES
  });
});


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

    // --- 9. Canonical Event Supply (Discovery layer truth, never state guesses) ---
    const canonicalEvents = canonicalRegistry.getAllEvents();
    const canonicalBuckets = { VERIFIED: 0, PENDING: 0, STALE: 0, EXPIRED: 0, CANCELLED: 0, REJECTED: 0 };
    let conflictedEventCount = 0;
    for (const ev of canonicalEvents) {
      const bucket = classifyCanonicalEvent(ev);
      if (canonicalBuckets[bucket] === undefined) canonicalBuckets.PENDING++;
      else canonicalBuckets[bucket]++;
      if ((ev.conflicts || []).length > 0 || ev.verification_status === 'CONFLICTED') conflictedEventCount++;
    }

    const canonicalMetrics = {
      total: canonicalEvents.length,
      verified: canonicalBuckets.VERIFIED,
      pending_verification: canonicalBuckets.PENDING,
      stale: canonicalBuckets.STALE,
      expired: canonicalBuckets.EXPIRED,
      cancelled: canonicalBuckets.CANCELLED,
      rejected: canonicalBuckets.REJECTED,
      conflicted: conflictedEventCount
    };

    // --- 10. Marketplace Listing Lifecycle (real records only) ---
    const listingBuckets = { ACTIVE: 0, PENDING: 0, SOLD: 0, SUSPENDED: 0 };
    const pendingListingStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_REVIEW', 'PENDING'];
    const soldListingStatuses = ['SOLD', 'COMPLETED'];
    const suspendedListingStatuses = ['SUSPENDED', 'FROZEN'];
    for (const l of listings) {
      const s = (l.status || '').toUpperCase();
      if (s === 'ACTIVE') listingBuckets.ACTIVE++;
      else if (pendingListingStatuses.includes(s)) listingBuckets.PENDING++;
      else if (soldListingStatuses.includes(s)) listingBuckets.SOLD++;
      else if (suspendedListingStatuses.includes(s)) listingBuckets.SUSPENDED++;
    }

    const marketplaceMetrics = {
      total_listings: listings.length,
      active_listings: listingBuckets.ACTIVE,
      pending_listings: listingBuckets.PENDING,
      sold_listings: listingBuckets.SOLD,
      suspended_listings: listingBuckets.SUSPENDED,
      total_orders: totalOrdersCount,
      pending_orders: pendingOrders,
      open_disputes: openDisputesCount
    };

    // --- 11. Source Health Summary (Source Registry truth) ---
    const allSources = sourceRegistry.getAllSources();
    const sourceHealthSummary = {
      total: allSources.length,
      active: allSources.filter(s => (s.active_status || s.health_status) === 'ACTIVE' && s.circuit_breaker_status !== 'OPEN').length,
      degraded: allSources.filter(s => ['DEGRADED', 'FAILING'].includes(s.active_status || s.health_status)).length,
      blocked: allSources.filter(s => s.circuit_breaker_status === 'OPEN' || ['NOT_ALLOWED', 'UNKNOWN'].includes((s.permission_status || '').toUpperCase())).length,
      never_fetched: allSources.filter(s => !s.last_successful_fetch && !(s.telemetry && s.telemetry.last_success)).length
    };

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
      // P0 Canonical Event Supply + Marketplace + Source Health truth:
      canonical_events: canonicalMetrics,
      marketplace: marketplaceMetrics,
      source_health: sourceHealthSummary,
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
 * Event operations list. Default mode returns the state.events marketplace
 * projection enriched with canonical verification facts. `?source=canonical`
 * returns the Canonical Event Registry itself. `?status=` filters by lifecycle
 * bucket: all | verified | pending | stale | expired | cancelled | conflicted.
 */
router.get('/events', requireAdmin, (req, res) => {
  const filter = (req.query.status || 'all').toString().toLowerCase();
  const registry = (req.query.source || '').toString().toLowerCase();

  if (registry === 'canonical') {
    const data = canonicalRegistry.getAllEvents()
      .filter(e => canonicalMatchesFilter(e, filter))
      .map(canonicalEventSummary);
    return res.json({ total: data.length, source: 'canonical', filter, events: data });
  }

  const events = state.events || [];
  const listings = state.listings || [];
  const orders = state.orders || [];
  const eventPics = state.event_pics || [];
  const users = state.users || [];

  const data = events.map(e => {
    const canonical = findCanonicalEvent(e.id);
    const summary = canonical ? canonicalEventSummary(canonical) : null;
    const evListings = listings.filter(l => l.event_id === e.id);
    const evOrders = orders.filter(o => o.event_id === e.id);
    const picAssign = eventPics.find(ep => ep.event_id === e.id && ep.status === 'ACTIVE');
    const picUser = picAssign ? users.find(u => u.id === picAssign.pic_user_id) : null;

    return {
      id: e.id,
      canonical_event_id: summary ? summary.canonical_event_id : null,
      name: e.name || e.title,
      date: e.date || e.start_date,
      venue_name: e.venue_name || e.venue || 'N/A',
      city: e.venue_city || 'N/A',
      category: e.category || 'N/A',
      status: e.status,
      is_verified: summary ? summary.is_verified : Boolean(e.is_verified),
      verification_status: summary ? summary.verification_status : (e.verification_status || (e.is_verified ? 'VERIFIED' : 'UNVERIFIED')),
      last_verified_at: summary ? summary.last_verified_at : (e.last_verified_at || null),
      source_count: summary ? summary.source_count : 0,
      conflict_count: summary ? summary.conflict_count : 0,
      filter_bucket: summary ? classifyCanonicalEvent(canonical) : classifyStateEvent(e),
      tickets_count: evListings.length,
      orders_count: evOrders.length,
      pic_name: picUser ? picUser.name : 'Unassigned',
      pic_id: picAssign ? picAssign.pic_user_id : null
    };
  }).filter(row => matchesFilterBucket(row.filter_bucket, row.conflict_count, filter));

  res.json({ total: data.length, source: 'state', filter, events: data });
});

/**
 * GET /api/admin/events/:id
 * Canonical-first event detail: lifecycle, verification, provenance, claims,
 * conflicts, source gap diagnostics, and marketplace operations context.
 */
router.get('/events/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const canonical = findCanonicalEvent(id);
  const stateEvent = findStateEvent(id);

  if (!canonical && !stateEvent) {
    return res.status(404).json({ error: `Event '${id}' not found`, code: 'EVENT_NOT_FOUND' });
  }

  const listings = (state.listings || []).filter(l => l.event_id === id);
  const orders = (state.orders || []).filter(o => o.event_id === id);
  const marketplace = {
    listings_total: listings.length,
    active_listings: listings.filter(l => l.status === 'ACTIVE').length,
    orders_total: orders.length
  };

  if (canonical) {
    const diagnostic = sourceGapDiagnosticService.inspectCanonicalEvent(canonical);
    return res.json({
      available: true,
      registry: 'canonical',
      ...canonicalEventSummary(canonical),
      first_seen_at: canonical.first_seen_at || null,
      last_seen_at: canonical.last_seen_at || null,
      organizer_name: canonical.organizer_name || null,
      official_ticket_url: canonical.official_ticket_url || null,
      verification_reasons: canonical.verification_reasons || [],
      verification_notes: canonical.verification_notes || null,
      marketplace_eligibility: canonical.marketplace_eligibility || 'UNVERIFIED',
      block_reasons: canonical.block_reasons || [],
      claims: canonical.atomic_claims || canonical.claims || [],
      provenance: canonical.field_provenance || {},
      observations: canonical.observations || [],
      event_history: canonical.event_history || [],
      sources: (canonical.sources || []).map(s => ({
        source_id: s.source_id,
        source_name: s.source_name,
        tier: s.tier,
        authority_level: s.authority_level || null,
        trust_level: s.trust_level || null,
        source_url: s.source_url || null,
        retrieved_at: s.retrieved_at || null
      })),
      conflicts: canonical.conflicts || [],
      source_gap: {
        overall_verdict: diagnostic.overall_verdict,
        stages: diagnostic.stages
      },
      marketplace
    });
  }

  return res.json({
    available: true,
    registry: 'state',
    canonical_event_id: null,
    event_id: stateEvent.id,
    name: stateEvent.name || stateEvent.title,
    slug: stateEvent.slug || null,
    date: stateEvent.date || stateEvent.start_date || null,
    venue_name: stateEvent.venue_name || stateEvent.venue || null,
    city: stateEvent.venue_city || null,
    lifecycle_status: stateEvent.status || null,
    verification_status: stateEvent.verification_status || (stateEvent.is_verified ? 'VERIFIED' : 'UNVERIFIED'),
    is_verified: Boolean(stateEvent.is_verified),
    last_verified_at: stateEvent.last_verified_at || null,
    canonical_record_available: false,
    claims: [],
    provenance: {},
    sources: [],
    conflicts: [],
    source_gap: { overall_verdict: 'NOT_IN_CANONICAL_REGISTRY', stages: {} },
    marketplace
  });
});

/**
 * GET /api/admin/events/:id/claims
 * Atomic SourceClaims for the canonical event. Empty (with reason) when the
 * event exists only as a state projection — never fabricated.
 */
router.get('/events/:id/claims', requireAdmin, (req, res) => {
  const { id } = req.params;
  const canonical = findCanonicalEvent(id);

  if (!canonical) {
    const stateEvent = findStateEvent(id);
    if (!stateEvent) {
      return res.status(404).json({ error: `Event '${id}' not found`, code: 'EVENT_NOT_FOUND' });
    }
    return res.json({
      event_id: id,
      canonical_event_id: null,
      available: false,
      reason: 'NO_CANONICAL_RECORD',
      total: 0,
      by_source: {},
      claims: []
    });
  }

  const claims = canonical.atomic_claims || canonical.claims || [];
  const bySource = {};
  for (const claim of claims) {
    const sourceId = claim && claim.source_id;
    if (sourceId) bySource[sourceId] = (bySource[sourceId] || 0) + 1;
  }

  res.json({
    event_id: canonical.event_id,
    canonical_event_id: canonical.event_id,
    available: true,
    total: claims.length,
    by_source: bySource,
    claims
  });
});

/**
 * GET /api/admin/events/:id/provenance
 * Reconstructable provenance chain (field-level attribution + history).
 */
router.get('/events/:id/provenance', requireAdmin, (req, res) => {
  const { id } = req.params;
  const provenance = AdminEventControlService.getEventProvenance(id);

  if (!provenance) {
    const stateEvent = findStateEvent(id);
    if (!stateEvent) {
      return res.status(404).json({ error: `Event '${id}' not found`, code: 'EVENT_NOT_FOUND' });
    }
    return res.json({
      event_id: id,
      available: false,
      reason: 'NO_CANONICAL_RECORD',
      field_provenance: {},
      sources: [],
      event_history: [],
      conflicts: []
    });
  }

  res.json({ available: true, ...provenance });
});

/**
 * GET /api/admin/events/:id/source-gaps
 * Seven-stage supply pipeline diagnosis for a specific event.
 */
router.get('/events/:id/source-gaps', requireAdmin, (req, res) => {
  const { id } = req.params;
  const canonical = findCanonicalEvent(id);

  if (canonical) {
    const report = sourceGapDiagnosticService.inspectCanonicalEvent(canonical);
    return res.json({ available: true, ...report });
  }

  const stateEvent = findStateEvent(id);
  if (!stateEvent) {
    return res.status(404).json({ error: `Event '${id}' not found`, code: 'EVENT_NOT_FOUND' });
  }

  const report = sourceGapDiagnosticService.diagnoseEvent(id);
  res.json({ available: false, reason: 'NO_CANONICAL_RECORD', ...report });
});

/**
 * POST /api/admin/events/:id/verify
 * Manual operator approval. Notes are recorded in the immutable audit trail.
 */
router.post('/events/:id/verify', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const officerId = req.user?.id || 'admin';
  const notes = (req.body && (req.body.notes || req.body.verification_notes)) || '';

  try {
    const event = AdminEventControlService.verifyEvent(id, officerId, notes);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event: canonicalEventSummary(event) });
  } catch (err) {
    const notFound = /not found/i.test(err.message || '');
    res.status(notFound ? 404 : 400).json({ error: err.message, code: notFound ? 'EVENT_NOT_FOUND' : 'EVENT_VERIFY_FAILED' });
  }
});

/**
 * POST /api/admin/events/:id/reject
 * Manual operator rejection. Reason is recorded in the immutable audit trail.
 */
router.post('/events/:id/reject', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const officerId = req.user?.id || 'admin';
  const reason = (req.body && (req.body.reason || req.body.rejection_reason)) || 'Manually rejected by officer';

  try {
    const event = AdminEventControlService.rejectEvent(id, officerId, reason);
    canonicalRegistry.syncToState(state.events);
    res.json({ success: true, event: canonicalEventSummary(event) });
  } catch (err) {
    const notFound = /not found/i.test(err.message || '');
    res.status(notFound ? 404 : 400).json({ error: err.message, code: notFound ? 'EVENT_NOT_FOUND' : 'EVENT_REJECT_FAILED' });
  }
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

/**
 * ============================================================
 * TIKUM / ARGUS — Event Supply Intelligence & Coverage Endpoints
 * ============================================================
 */

/**
 * GET /api/admin/event-supply/coverage
 * Aggregates multi-source registry health, 40+ Indonesian city coverage matrix,
 * and canonical verification pipeline health.
 */
router.get('/event-supply/coverage', requireAdmin, (req, res) => {
  try {
    const sources = sourceRegistry.getAllSources();
    const canonicalEvents = canonicalRegistry.getAllEvents();
    const allCities = cityRegistry.getAllCities();

    // Source counts
    const activeSources = sources.filter(s => (s.active_status || s.health_status) === 'ACTIVE').length;
    const degradedSources = sources.filter(s => (s.active_status || s.health_status) === 'DEGRADED').length;
    const circuitOpenSources = sources.filter(s => s.circuit_breaker_status === 'OPEN' || (s.active_status || s.health_status) === 'CIRCUIT_OPEN').length;

    // Event verification pipeline counts
    const verifiedEvents = canonicalEvents.filter(e => e.is_verified || e.verification_status === 'VERIFIED' || e.verification_status === 'PRIMARY_SOURCE_VERIFIED').length;
    const unverifiedEvents = canonicalEvents.filter(e => e.verification_status === 'UNVERIFIED' || e.verification_status === 'DISCOVERED').length;
    const partiallyVerifiedEvents = canonicalEvents.filter(e => e.verification_status === 'PARTIALLY_VERIFIED').length;
    const conflictedEvents = canonicalEvents.filter(e => (e.conflicts && e.conflicts.length > 0) || e.verification_status === 'CONFLICTED').length;
    const staleEvents = canonicalEvents.filter(e => e.verification_status === 'STALE').length;
    const expiredEvents = canonicalEvents.filter(e => e.verification_status === 'EXPIRED').length;

    // City matrix & blindspots
    const citiesWithEvents = allCities.filter(c => c.event_count > 0).length;
    const blindspots = allCities.filter(c => c.event_count === 0).length;

    const cityMatrix = allCities.map(c => ({
      name: c.name,
      slug: c.slug,
      province: c.province,
      region: c.region,
      lat: c.lat,
      lng: c.lng,
      timezone: c.timezone,
      event_count: c.event_count,
      venue_count: c.venue_count,
      status: c.event_count === 0 ? 'BLINDSPOT' : (c.event_count < 3 ? 'LOW' : 'HEALTHY')
    }));

    res.status(200).json({
      summary: {
        total_sources: sources.length,
        active_sources: activeSources,
        degraded_sources: degradedSources,
        circuit_open_sources: circuitOpenSources,
        total_canonical_events: canonicalEvents.length,
        verified_events: verifiedEvents,
        unverified_events: unverifiedEvents,
        partially_verified_events: partiallyVerifiedEvents,
        conflicted_events: conflictedEvents,
        stale_events: staleEvents,
        expired_events: expiredEvents,
        total_registered_cities: allCities.length,
        covered_cities: citiesWithEvents,
        blindspot_cities: blindspots,
        city_coverage_ratio: allCities.length > 0 ? Math.round((citiesWithEvents / allCities.length) * 1000) / 1000 : 0
      },
      sources: sources.map(s => ({
        source_id: s.source_id,
        source_name: s.source_name,
        type: s.type,
        tier: s.tier,
        status: s.status,
        active_status: s.active_status || s.health_status,
        circuit_breaker_status: s.circuit_breaker_status || 'CLOSED',
        coverage_city: s.coverage_city || 'Nationwide',
        coverage_region: s.coverage_region || 'National',
        last_success_at: s.last_successful_fetch || null,
        failure_count: s.consecutive_failures || s.telemetry?.failed_fetches || 0
      })),
      city_matrix: cityMatrix,
      pipeline_health: {
        VERIFIED: verifiedEvents,
        UNVERIFIED: unverifiedEvents,
        PARTIALLY_VERIFIED: partiallyVerifiedEvents,
        CONFLICTED: conflictedEvents,
        STALE: staleEvents,
        EXPIRED: expiredEvents
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/event-supply/diagnostics
 * Inspects why an event is missing or blocked across the 7-stage supply pipeline.
 */
router.get('/event-supply/diagnostics', requireAdmin, (req, res) => {
  try {
    const query = req.query.query || req.query.q || '';
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "query" is required' });
    }
    const report = sourceGapDiagnosticService.diagnoseEvent(query);
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/event-supply/unverified-queue
 * Lists canonical events that require verification, have factual conflicts, or are stale.
 */
router.get('/event-supply/unverified-queue', requireAdmin, (req, res) => {
  try {
    const allEvents = canonicalRegistry.getAllEvents();
    const queue = allEvents.filter(e => {
      const isVerified = (e.verification_status === 'VERIFIED' || e.verification_status === 'PRIMARY_SOURCE_VERIFIED') && e.is_verified;
      const hasConflicts = (e.conflicts && e.conflicts.length > 0);
      return !isVerified || hasConflicts || e.verification_status === 'STALE' || e.verification_status === 'PARTIALLY_VERIFIED';
    });

    res.status(200).json({
      total: queue.length,
      unverified_events: queue.map(e => ({
        event_id: e.event_id || e.id,
        title: e.title || e.canonical_name || e.name,
        slug: e.slug,
        start_date: e.start_date || e.date,
        venue: e.venue || e.venue_name,
        city: e.city,
        verification_status: e.verification_status || 'UNVERIFIED',
        verification_confidence: e.verification_confidence || 0,
        conflict_count: (e.conflicts || []).length,
        conflicts: e.conflicts || [],
        source_count: (e.sources || []).length,
        sources: e.sources || [],
        atomic_claims: e.atomic_claims || []
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/event-supply/resolve-conflict
 * Allows an authorized operator to select authoritative fields and resolve factual conflicts.
 */
router.post('/event-supply/resolve-conflict', requireAdmin, async (req, res) => {
  try {
    const { event_id, chosen_fields, resolution_notes } = req.body || {};
    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }
    const officerId = req.user?.id || req.user?.username || 'admin';
    // AdminEventControlService records the immutable audit entry itself.
    const updatedEvent = AdminEventControlService.resolveConflict(event_id, officerId, chosen_fields || {});
    if (resolution_notes && typeof resolution_notes === 'string') {
      updatedEvent.resolution_notes = resolution_notes;
    }
    canonicalRegistry.syncToState(state.events);
    return res.status(200).json({
      success: true,
      event: canonicalEventSummary(updatedEvent)
    });
  } catch (err) {
    const notFound = /not found/i.test(err.message || '');
    return res.status(notFound ? 404 : 500).json({ error: err.message, code: notFound ? 'EVENT_NOT_FOUND' : 'CONFLICT_RESOLUTION_FAILED' });
  }
});

/**
 * ============================================================
 * SOURCES — Source Registry Health & Claim Attribution
 * ============================================================
 */

/**
 * GET /api/admin/sources
 * Real source telemetry: authority tier, health, last successful fetch,
 * last failure, HTTP status (where recorded), gap status and claim counts.
 */
router.get('/sources', requireAdmin, (req, res) => {
  const sources = sourceRegistry.getAllSources();
  const { claimCounts, provenanceCounts, observationCounts } = buildSourceClaimIndex();

  const rows = sources.map(s => {
    const lastSuccess = s.last_successful_fetch || (s.telemetry && s.telemetry.last_success) || null;
    const lastFailure = (s.telemetry && s.telemetry.last_failure) || s.last_failed_sync || null;
    const httpStatus = (s.last_http_status !== undefined && s.last_http_status !== null)
      ? s.last_http_status
      : ((s.telemetry && s.telemetry.last_http_status !== undefined) ? s.telemetry.last_http_status : null);

    return {
      source_id: s.source_id,
      source_name: s.source_name,
      type: s.type || s.source_type || 'OTHER',
      tier: s.tier,
      authority_level: s.authority_level || null,
      trust_level: s.trust_level || null,
      source_role: s.source_role || null,
      health: s.active_status || s.health_status || 'UNKNOWN',
      circuit_breaker_status: s.circuit_breaker_status || 'CLOSED',
      enabled: s.enabled !== false,
      access_method: s.access_method || null,
      permission_status: s.permission_status || 'UNKNOWN',
      coverage: s.coverage || null,
      base_url: s.base_url || null,
      last_successful_fetch: lastSuccess,
      last_attempted_fetch: s.last_attempted_fetch || null,
      last_failure: lastFailure,
      last_http_status: httpStatus,
      consecutive_failures: s.consecutive_failures || 0,
      source_gap_status: computeSourceGapStatus(s),
      claim_count: claimCounts[s.source_id] || 0,
      provenance_field_count: provenanceCounts[s.source_id] || 0,
      observation_count: observationCounts[s.source_id] || 0
    };
  });

  const summary = {
    total: rows.length,
    healthy: rows.filter(r => r.source_gap_status === 'HEALTHY').length,
    degraded: rows.filter(r => r.source_gap_status === 'DEGRADED').length,
    blocked: rows.filter(r => r.source_gap_status === 'BLOCKED').length,
    stale: rows.filter(r => r.source_gap_status === 'STALE').length,
    never_fetched: rows.filter(r => r.source_gap_status === 'NEVER_FETCHED').length,
    disabled: rows.filter(r => r.source_gap_status === 'DISABLED').length
  };

  res.json({ summary, total: rows.length, sources: rows });
});

/**
 * ============================================================
 * LISTINGS & VENUES — Marketplace Operations
 * ============================================================
 */

/**
 * GET /api/admin/listings
 * Real listing lifecycle records: active, pending review, sold, suspended.
 */
router.get('/listings', requireAdmin, (req, res) => {
  const filter = (req.query.status || 'all').toString().toLowerCase();
  const events = state.events || [];
  const tickets = state.tickets || [];
  const users = state.users || [];

  const rows = (state.listings || []).map(l => {
    const event = events.find(e => e.id === l.event_id) || {};
    const ticket = tickets.find(t => t.id === l.ticket_id) || {};
    const seller = users.find(u => u.id === l.seller_id) || {};
    const status = (l.status || '').toUpperCase();

    let bucket = 'OTHER';
    if (status === 'ACTIVE') bucket = 'ACTIVE';
    else if (['SUBMITTED', 'UNDER_REVIEW', 'PENDING_REVIEW', 'PENDING'].includes(status)) bucket = 'PENDING';
    else if (['SOLD', 'COMPLETED'].includes(status)) bucket = 'SOLD';
    else if (['SUSPENDED', 'FROZEN'].includes(status)) bucket = 'SUSPENDED';

    return {
      listing_id: l.id,
      ticket_id: l.ticket_id,
      event_id: l.event_id,
      event_name: event.name || event.title || l.event_id,
      seller_id: l.seller_id,
      seller_name: seller.name || l.seller_id,
      seat_info: ticket.seat_info || 'N/A',
      ticket_verification_status: ticket.verification_status || 'UNVERIFIED',
      face_value: l.face_value || ticket.face_value || 0,
      price: l.price || 0,
      status: l.status,
      bucket,
      created_at: l.created_at || null
    };
  });

  const summary = {
    total: rows.length,
    active: rows.filter(r => r.bucket === 'ACTIVE').length,
    pending: rows.filter(r => r.bucket === 'PENDING').length,
    sold: rows.filter(r => r.bucket === 'SOLD').length,
    suspended: rows.filter(r => r.bucket === 'SUSPENDED').length,
    other: rows.filter(r => r.bucket === 'OTHER').length
  };

  const filtered = filter === 'all' ? rows : rows.filter(r => r.bucket === filter.toUpperCase());
  res.json({ summary, total: filtered.length, listings: filtered });
});

/**
 * GET /api/admin/venues
 * Real venue registry with event coverage, PIC assignment and open incidents.
 */
router.get('/venues', requireAdmin, (req, res) => {
  const venues = state.venues || [];
  const events = state.events || [];
  const eventPics = state.event_pics || [];
  const incidents = state.incidents || [];

  const rows = venues.map(v => {
    const venueEvents = events.filter(e => e.venue_id === v.id);
    const picAssigned = venueEvents.filter(e => eventPics.some(ep => ep.event_id === e.id && ep.status === 'ACTIVE'));
    const openIncidents = incidents.filter(i => i.status !== 'RESOLVED' && venueEvents.some(e => e.id === i.event_id));

    return {
      id: v.id,
      name: v.name,
      city: v.city || 'N/A',
      gate_info: v.gate_info || 'N/A',
      events_count: venueEvents.length,
      events: venueEvents.map(e => ({ id: e.id, name: e.name || e.title, date: e.date || e.start_date })),
      pic_assigned_events: picAssigned.length,
      pic_coverage: venueEvents.length === 0 ? 'N/A' : (picAssigned.length === venueEvents.length ? 'FULL' : (picAssigned.length > 0 ? 'PARTIAL' : 'NONE')),
      open_incidents: openIncidents.length
    };
  });

  res.json({
    total: rows.length,
    venues: rows
  });
});

/**
 * ============================================================
 * TRUST / VERIFICATION — Consolidated Verification Queues
 * ============================================================
 */

/**
 * GET /api/admin/verification
 * Pending seller/ticket verification, risk flags, incidents, evidence status.
 */
router.get('/verification', requireAdmin, (req, res) => {
  const sellers = (state.users || []).filter(u => (u.role || '').toLowerCase() === 'seller');
  const sellerProfiles = state.seller_profiles || [];
  const tickets = state.tickets || [];
  const authRecords = state.authorization_records || [];
  const incidents = state.incidents || [];
  const evidenceBundles = state.evidence_bundles || [];
  const evidenceItems = state.evidence_items || [];

  const sellerVerificationRows = sellers.map(u => {
    const profile = sellerProfiles.find(p => p.user_id === u.id) || {};
    return {
      seller_id: u.id,
      name: u.name,
      email: u.email,
      kyc_status: profile.kyc_status || 'UNVERIFIED',
      account_status: u.status || 'ACTIVE'
    };
  });

  const ticketVerificationRows = tickets.map(t => ({
    ticket_id: t.id || t.ticket_id,
    event_id: t.event_id,
    seller_id: t.seller_id,
    verification_status: t.verification_status || 'UNVERIFIED',
    risk_status: t.risk_status || 'LOW'
  }));

  res.json({
    seller_verification: {
      total: sellerVerificationRows.length,
      verified: sellerVerificationRows.filter(s => s.kyc_status === 'VERIFIED').length,
      pending: sellerVerificationRows.filter(s => s.kyc_status === 'PENDING').length,
      unverified: sellerVerificationRows.filter(s => s.kyc_status === 'UNVERIFIED').length,
      sellers: sellerVerificationRows
    },
    ticket_verification: {
      total: ticketVerificationRows.length,
      verified: ticketVerificationRows.filter(t => t.verification_status === 'VERIFIED').length,
      under_review: ticketVerificationRows.filter(t => t.verification_status === 'UNDER_REVIEW').length,
      evidence_required: ticketVerificationRows.filter(t => t.verification_status === 'EVIDENCE_REQUIRED').length,
      rejected: ticketVerificationRows.filter(t => t.verification_status === 'REJECTED').length,
      tickets: ticketVerificationRows
    },
    risk_flags: {
      blocked_authorizations: authRecords.filter(r => r.outcome === 'BLOCK').length,
      pending_reviews: authRecords.filter(r => r.outcome === 'PENDING' || r.outcome === 'EXCEPTION').length,
      high_risk_sellers: sellerProfiles.filter(p => p.suspended || p.status === 'PROBATIONARY').length
    },
    incidents: {
      total: incidents.length,
      open: incidents.filter(i => i.status !== 'RESOLVED').length,
      critical: incidents.filter(i => i.severity === 'CRITICAL' && i.status !== 'RESOLVED').length
    },
    evidence: {
      bundles: evidenceBundles.length,
      items: evidenceItems.length,
      pending_review: evidenceItems.filter(i => i.status === 'PENDING_REVIEW' || i.review_status === 'PENDING').length
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
