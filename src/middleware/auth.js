/**
 * TIKUM / ARGUS — Canonical Authentication & Authorization Middleware
 * 
 * Enforces strict server-side identity & access control:
 * 1. Resolves identity ONLY via SessionStore session tokens (Bearer, header, or cookie).
 * 2. NEVER trusts client-supplied headers (x-user-role, x-user-id) for privilege.
 * 3. NEVER trusts body/query role or identity fields.
 * 4. Strictly separates Authentication (who are you?) from Authorization (what can you do?).
 * 5. Uses server-side state.users as source of record for roles and permissions.
 */

const { SessionStore } = require('../services/sessionStore');
const { state } = require('../database');

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
 * Resolves authenticated user from session token ONLY.
 * Looks in:
 * - Authorization: Bearer <token>
 * - x-session-token: <token>
 * - Cookie: session_token=<token>
 * 
 * NEVER inspects:
 * - x-user-role
 * - x-user-id
 * - req.body.role / req.body.userId
 * - req.query.role / req.query.userId
 */
function resolveUser(req) {
  if (!req) return null;
  
  let token = null;

  // 1. Authorization header
  const authHeader = req.header ? (req.header('authorization') || req.header('x-session-token')) : null;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  // 2. Cookie fallback
  if (!token && req.headers && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.session_token) {
      token = cookies.session_token.trim();
    }
  }

  if (!token) {
    req.user = null;
    req.role = null;
    req.session = null;
    return null;
  }

  // 3. Server-side session verification
  const session = SessionStore.findSession(token) || 
    (state.sessions && state.sessions.find(s => s.session_token === token && new Date(s.expires_at) > new Date() && !s.revoked));

  if (!session) {
    req.user = null;
    req.role = null;
    req.session = null;
    return null;
  }

  // 4. Server-side user identity resolution
  const user = (state.users || []).find(u => u.id === session.user_id);
  if (!user) {
    req.user = null;
    req.role = null;
    req.session = null;
    return null;
  }

  // Trusted identity binding
  req.user = user;
  req.role = user.role;
  req.session = session;
  return user;
}

/**
 * Middleware: Requires an active, authenticated session.
 */
function authenticate(req, res, next) {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'Authentication required. Invalid or missing session.',
      code: 'AUTH_REQUIRED'
    });
  }
  next();
}

/**
 * Middleware: Requires a specific server-side role.
 * Role is read strictly from trusted req.user.role, never client inputs.
 */
function authorize(allowedRoles = []) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    const user = req.user || resolveUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Authentication required. Invalid or missing session.',
        code: 'AUTH_REQUIRED'
      });
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
      return res.status(403).json({
        error: `Forbidden: role '${user.role}' not permitted for this action`,
        code: 'FORBIDDEN'
      });
    }

    next();
  };
}

/**
 * Middleware: Requires authenticated admin role.
 * Shorthand for authorize(['admin']).
 */
const requireAdmin = authorize(['admin']);

module.exports = {
  resolveUser,
  authenticate,
  authorize,
  requireAdmin,
  parseCookies
};
