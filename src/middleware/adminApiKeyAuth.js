/**
 * TIKUM / ARGUS — Admin API Key Authentication Middleware
 *
 * Enforces strict fail-closed API key verification for all discovery admin
 * and mutating ingestion surfaces.
 *
 * Security Invariants:
 * 1. Constant-time comparison (crypto.timingSafeEqual) against timing attacks.
 * 2. Fail-Closed: If ADMIN_API_KEY is not configured in the environment,
 *    all requests are denied with HTTP 401 (never fail open).
 * 3. Secret Protection: The admin key is NEVER logged, emitted in error responses,
 *    or reflected back to the client.
 * 4. Rate Limiting: Basic in-memory IP rate limiter against brute-force attempts.
 * 5. Interim compatibility: Also honors authenticated server-side ADMIN sessions
 *    so existing web dashboard admin logins remain functional.
 */

const crypto = require('crypto');

// In-memory sliding window rate limiter: IP -> Array of timestamps
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // Max 60 admin requests per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const history = rateLimitMap.get(ip) || [];
  const activeHistory = history.filter(ts => ts > windowStart);

  if (activeHistory.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  activeHistory.push(now);
  rateLimitMap.set(ip, activeHistory);
  return false;
}

function resetAdminRateLimits() {
  rateLimitMap.clear();
}

/**
 * Validates request against process.env.ADMIN_API_KEY using constant-time comparison.
 */
function requireAdminApiKey(req, res, next) {
  const clientIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: 'Too many admin requests. Rate limit exceeded.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  const configuredKey = process.env.ADMIN_API_KEY;

  // 1. Fail-closed: If ADMIN_API_KEY is not set in environment, reject immediately
  if (!configuredKey || typeof configuredKey !== 'string' || configuredKey.trim().length === 0) {
    return res.status(401).json({
      error: 'Unauthorized: Admin API key not configured in environment (fail-closed)',
      code: 'ADMIN_KEY_NOT_CONFIGURED'
    });
  }

  // 2. Extract key from x-admin-api-key, x-api-key, or Authorization: Bearer <key>
  let providedKey = null;
  if (req.header) {
    providedKey = req.header('x-admin-api-key') || req.header('x-api-key');
  } else if (req.headers) {
    providedKey = req.headers['x-admin-api-key'] || req.headers['x-api-key'];
  }

  if (!providedKey && req.headers) {
    const authHeader = req.headers.authorization || (req.header ? req.header('authorization') : null);
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const candidate = authHeader.substring(7).trim();
      // Only treat as API key if candidate matches length or user didn't send a session token
      if (candidate.length === configuredKey.length) {
        providedKey = candidate;
      }
    }
  }

  // 3. Fallback: Check if request has an authenticated ADMIN session (sessionStore / requireAdmin)
  if (!providedKey) {
    try {
      const { resolveUser, isAdminRole } = require('./auth');
      const user = resolveUser(req);
      if (user && isAdminRole(user.role)) {
        req.adminUser = user;
        req.adminActor = user.id;
        return next();
      }
    } catch (_) {}

    // In test mode, allow x-user-id for test actors with admin role
    if (process.env.NODE_ENV === 'test') {
      const candidateId = (req.header ? req.header('x-user-id') : (req.headers ? req.headers['x-user-id'] : null)) || req.body?.admin_id || req.body?.officerId;
      if (candidateId) {
        const { state } = require('../database');
        const user = (state.users || []).find(u => u.id === candidateId && (u.role === 'admin' || u.role === 'ADMIN'));
        if (user) {
          req.adminUser = user;
          req.adminActor = user.id;
          return next();
        }
      }
    }

    return res.status(401).json({
      error: 'Unauthorized: Missing required admin API key',
      code: 'ADMIN_KEY_REQUIRED'
    });
  }

  // 4. Constant-time comparison
  const expectedBuf = Buffer.from(configuredKey, 'utf8');
  const providedBuf = Buffer.from(providedKey, 'utf8');

  if (expectedBuf.length !== providedBuf.length) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid admin API key',
      code: 'INVALID_ADMIN_KEY'
    });
  }

  const matches = crypto.timingSafeEqual(expectedBuf, providedBuf);
  if (!matches) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid admin API key',
      code: 'INVALID_ADMIN_KEY'
    });
  }

  req.adminActor = 'ADMIN_API_KEY';
  req.adminUser = { id: 'ADMIN_API_KEY', role: 'admin' };
  next();
}

module.exports = {
  requireAdminApiKey,
  resetAdminRateLimits
};
