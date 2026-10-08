/**
 * TIKUM / ARGUS — Canonical Authentication & Authorization Middleware
 * 
 * Enforces strict server-side identity & access control:
 * 1. Resolves identity ONLY via authoritative UserRepository / SessionStore session tokens
 *    (Bearer header, x-session-token header, or HttpOnly cookie).
 * 2. Sessions verified via cryptographic SHA-256 token hash against durable database.
 * 3. NEVER trusts client-supplied headers (x-user-role, x-user-id) for privilege in production.
 * 4. NEVER trusts body/query role or identity fields to determine authority.
 * 5. Strictly separates Authentication (who are you?) from Authorization (what can you do?).
 * 6. Centralized primitives: requireAuth, requireRole, requireAdmin, requireOwnership.
 */

const crypto = require('crypto');
const { getUserRepository } = require('../storage');
const { SessionStore } = require('../services/sessionStore');
const { state } = require('../database');

/**
 * Canonical admin role set for the TIKUM Operations Control Center.
 */
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'OPS', 'TRUST_OFFICER'];

function isAdminRole(role) {
  if (!role || typeof role !== 'string') return false;
  return ADMIN_ROLES.includes(role.toUpperCase());
}

/**
 * Parses cookies from cookie header string
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;
  
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (e) {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Extracts raw session token from request.
 * Precedence:
 * 1. Authorization: Bearer <token>
 * 2. x-session-token: <token>
 * 3. Cookie: session_token=<token>
 */
function extractToken(req) {
  if (!req) return null;

  const authHeader = req.header ? (req.header('authorization') || req.header('x-session-token')) : null;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return authHeader.trim();
  }

  if (req.headers && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.session_token) {
      return cookies.session_token.trim();
    }
  }

  return null;
}

/**
 * Asynchronously resolves authenticated user from durable UserRepository.
 * Binds trusted identity to `req.user`, `req.session`, `req.role`.
 */
async function resolveUserAsync(req) {
  if (!req) return null;

  const token = extractToken(req);
  if (!token) {
    req.user = null;
    req.role = null;
    req.session = null;
    return null;
  }

  // 1. Check Authoritative UserRepository (PostgreSQL in production, InMemory in test)
  try {
    const repo = getUserRepository();
    if (repo && typeof repo.getSessionByTokenHash === 'function') {
      const result = await repo.getSessionByTokenHash(token);
      if (result && result.user && result.session) {
        req.user = result.user;
        req.role = (result.user.role || '').toUpperCase();
        req.session = {
          ...result.session,
          session_token: token
        };

        // Sync to in-memory state.users for legacy handlers if not already present
        if (state.users && Array.isArray(state.users)) {
          const idx = state.users.findIndex(u => u.id === result.user.id);
          if (idx >= 0) {
            if (state.users[idx].status && state.users[idx].status.toUpperCase() === 'SUSPENDED') {
              result.user.status = 'SUSPENDED';
              req.user.status = 'SUSPENDED';
            }
            state.users[idx] = { ...state.users[idx], ...result.user };
          } else {
            state.users.push(result.user);
          }
        }

        return result.user;
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      console.error('[AuthMiddleware] Authoritative session lookup error:', err.message);
      req.user = null;
      req.role = null;
      req.session = null;
      return null;
    }
  }

  // 2. Fallback to local SessionStore / state.sessions for isolated mock tests
  const localSession = SessionStore.findSession(token) ||
    (state.sessions && state.sessions.find(s => s.session_token === token && new Date(s.expires_at) > new Date() && !s.revoked));

  if (localSession) {
    const user = (state.users || []).find(u => u.id === localSession.user_id);
    if (user) {
      req.user = user;
      req.role = (user.role || '').toUpperCase();
      req.session = localSession;
      return user;
    }
  }

  req.user = null;
  req.role = null;
  req.session = null;
  return null;
}

/**
 * Synchronous resolver for downstream handlers after resolveUserAsync has run.
 * If req.user is already set, returns immediately.
 * Otherwise falls back to synchronous local search.
 */
function resolveUser(req) {
  if (!req) return null;
  if (req.user !== undefined) return req.user;

  // Fallback for tests or requests that bypassed early middleware
  const token = extractToken(req);
  if (!token) return null;

  const localSession = SessionStore.findSession(token) ||
    (state.sessions && state.sessions.find(s => s.session_token === token && new Date(s.expires_at) > new Date() && !s.revoked));

  if (localSession) {
    const user = (state.users || []).find(u => u.id === localSession.user_id);
    if (user) {
      req.user = user;
      req.role = (user.role || '').toUpperCase();
      req.session = localSession;
      return user;
    }
  }

  return null;
}

/**
 * Middleware: Requires an active, authenticated session.
 */
async function authenticate(req, res, next) {
  let user = req.user;
  if (user === undefined) {
    user = await resolveUserAsync(req);
  }

  if (!user) {
    return res.status(401).json({
      error: 'Authentication required. Invalid or missing session.',
      code: 'AUTH_REQUIRED'
    });
  }

  if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
    return res.status(403).json({
      error: 'Account is suspended. Access denied.',
      code: 'USER_SUSPENDED'
    });
  }

  next();
}

const requireAuth = authenticate;

/**
 * Middleware: Requires a specific server-side role.
 * Role is read strictly from trusted req.user.role, never client inputs.
 */
function authorize(allowedRoles = []) {
  const rawRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const normalizedAllowed = rawRoles.map(r => (typeof r === 'string' ? r.toUpperCase() : r));
  
  return async (req, res, next) => {
    let user = req.user;
    if (user === undefined) {
      user = await resolveUserAsync(req);
    }

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required. Invalid or missing session.',
        code: 'AUTH_REQUIRED'
      });
    }

    if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Account is suspended. Access denied.',
        code: 'USER_SUSPENDED'
      });
    }

    const userRole = (user.role || '').toUpperCase();
    if (normalizedAllowed.length > 0) {
      const isAllowed = normalizedAllowed.some(role => {
        if (role === 'ADMIN' && userRole === 'ADMIN') return true;
        if (role === 'USER' && (userRole === 'USER' || userRole === 'BUYER' || userRole === 'SELLER' || userRole === 'PIC' || userRole === 'VENUE_PIC')) return true;
        return role === userRole;
      });

      if (!isAllowed) {
        return res.status(403).json({
          error: `Forbidden: role '${user.role}' not permitted for this action`,
          code: 'FORBIDDEN'
        });
      }
    }

    next();
  };
}

const requireRole = authorize;

/**
 * Middleware: Requires authenticated admin role (ADMIN, SUPER_ADMIN, OPS, TRUST_OFFICER).
 */
const requireAdmin = authorize([...ADMIN_ROLES]);

/**
 * Middleware: Enforces that the authenticated user owns the resource or has an ADMIN role.
 * Eliminates client-supplied spoofing.
 *
 * @param {Function|string} getResourceOwnerId - Either a function (req) => ownerId, or property name on req (params/body/query)
 */
function requireOwnership(getResourceOwnerId) {
  return async (req, res, next) => {
    let user = req.user;
    if (user === undefined) {
      user = await resolveUserAsync(req);
    }

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    // Admins bypass ownership checks
    if (isAdminRole(user.role)) {
      return next();
    }

    let targetOwnerId;
    if (typeof getResourceOwnerId === 'function') {
      try {
        targetOwnerId = await getResourceOwnerId(req);
      } catch (err) {
        return res.status(500).json({ error: 'Failed to verify ownership', code: 'OWNERSHIP_CHECK_FAILED' });
      }
    } else if (typeof getResourceOwnerId === 'string') {
      targetOwnerId = req.params?.[getResourceOwnerId] || req.body?.[getResourceOwnerId] || req.query?.[getResourceOwnerId];
    }

    if (!targetOwnerId) {
      return res.status(400).json({
        error: 'Unable to verify resource ownership: missing owner identifier.',
        code: 'OWNER_ID_MISSING'
      });
    }

    if (String(user.id) !== String(targetOwnerId)) {
      return res.status(403).json({
        error: 'Forbidden: you do not have permission to access or modify this resource.',
        code: 'FORBIDDEN_OWNERSHIP'
      });
    }

    next();
  };
}

module.exports = {
  resolveUser,
  resolveUserAsync,
  authenticate,
  requireAuth,
  authorize,
  requireRole,
  requireAdmin,
  requireOwnership,
  isAdminRole,
  ADMIN_ROLES,
  parseCookies
};
