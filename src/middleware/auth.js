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

const { getUserRepository } = require('../storage');
const { state } = require('../database');

/**
 * Canonical admin role set for the TIKUM Operations Control Center.
 * Supports Simple RBAC: SUPER_ADMIN, ADMIN, EDITOR/EVENT_OPERATIONS, SUPPORT, FINANCE_READ_ONLY, FINANCE.
 */
const { ADMIN_ROLES, isAdminRole, isAdminIdentity } = require('../config/adminIdentity');
const { adminSecurityStore } = require('../storage/AdminSecurityStore');

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

  req.adminAuthenticated = false;
  req.authRejected = false;

  const token = extractToken(req);
  if (!token) {
    req.user = null;
    req.role = null;
    req.session = null;
    return null;
  }

  // 1. Check Authoritative UserRepository (PostgreSQL in production, InMemory in test)
  try {
    if (token.startsWith('adm-') || (process.env.NODE_ENV === 'test' && !process.env.VERCEL)) {
      const adminRes = await adminSecurityStore.lookup(token);
      if (adminRes && adminRes.user) {
        req.user = adminRes.user;
        req.session = adminRes.session;
        req.role = adminRes.user.role;
        req.adminAuthenticated = true;
        req.authRejected = false;
        return req.user;
      }
    }
    if (token.startsWith('adm-')) {
      req.authRejected = true;
      req.user = null;
      req.session = null;
      req.role = null;
      req.adminAuthenticated = false;
      return null;
    }
    const repo = getUserRepository();
    if (repo && typeof repo.getSessionByTokenHash === 'function') {
      const result = await repo.getSessionByTokenHash(token);
      if (result && result.user && result.session) {
        if (isAdminRole(result.user.role)) {
          req.authRejected = true;
          req.user = null; req.session = null; req.role = null;
          return null; // Legacy/password sessions never grant admin access.
        }
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

    if (process.env.NODE_ENV === 'test' && !process.env.VERCEL) {
      const { SessionStore } = require('../services/sessionStore');
      const sess = SessionStore.findSession(token);
      if (sess && !sess.revoked && new Date(sess.expires_at) > new Date()) {
        const user = (state.users && state.users.find(u => u.id === sess.user_id)) || { id: sess.user_id, role: sess.role, status: 'ACTIVE' };
        req.user = user;
        req.role = (sess.role || user.role || '').toUpperCase();
        req.session = { ...sess, session_token: token };
        return req.user;
      }
    }
  } catch (_) {
    req.authRejected = true;
    req.user = null;
    req.role = null;
    req.session = null;
    return null;
  }

  // A missing authoritative session is final, not permission to resurrect local state.
  req.authRejected = true;
  req.user = null;
  req.role = null;
  req.session = null;
  return null;
}

/**
 * Synchronous resolver for downstream handlers after resolveUserAsync has run.
 * If req.user is already set, returns immediately.
 * Never falls back to synchronous local state.
 */
function resolveUser(req) {
  if (!req) return null;
  if (req.user !== undefined) return req.user;

  return null; // Synchronous callers must use the already resolved authoritative identity.

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
    if (isAdminRole(userRole) && (!isAdminIdentity(user) || !req.adminAuthenticated)) {
      return res.status(403).json({ error: 'Administrator access denied.', code: 'FORBIDDEN' });
    }
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
const requireAdmin = require('./adminSecurity').requireAdminIdentity;

/**
 * Middleware: Requires finance authorization (ADMIN, SUPER_ADMIN, FINANCE, FINANCE_OPERATOR).
 * Strictly forbids PIC, VENUE_PIC, BUYER, SELLER, SUPPORT from money disburse actions.
 */
const requireFinance = authorize(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'FINANCE_OPERATOR']);

/**
 * Middleware: Requires operations / trust authorization (ADMIN, SUPER_ADMIN, OPS, TRUST_OFFICER).
 */
const requireOps = authorize(['ADMIN', 'SUPER_ADMIN', 'OPS', 'TRUST_OFFICER']);

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
    if (isAdminIdentity(user) && req.adminAuthenticated) {
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
  requireFinance,
  requireOps,
  requireOwnership,
  isAdminRole,
  ADMIN_ROLES,
  parseCookies
};
