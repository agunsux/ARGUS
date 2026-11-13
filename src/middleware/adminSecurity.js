const { isIP } = require('net');
const { isAdminIdentity } = require('../config/adminIdentity');
const { adminSecurityStore } = require('../storage/AdminSecurityStore');

function adminOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  const allowed = new Set(['https://tikum.app', 'https://www.tikum.app']);
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    allowed.add(`http://${req.headers.host}`);
  }
  if (!allowed.has(origin) || req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ code: 'INVALID_ORIGIN', error: 'Request origin rejected.' });
  }
  next();
}
function clientIp(req) {
  // Trust only the platform-overwritten header when actually running on Vercel.
  const forwarded = process.env.VERCEL && req.headers['x-forwarded-for'];
  const address = forwarded ? String(forwarded).split(',')[0].trim() : req.socket?.remoteAddress;
  return isIP(address || '') ? address : 'unknown';
}
async function requireAdminIdentity(req, res, next) {
  if (req.user === undefined) {
    const { resolveUserAsync } = require('./auth');
    try { await resolveUserAsync(req); } catch (_) {}
  }
  if (!req.user) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Authentication required.' });
  if (!isAdminIdentity(req.user) || req.adminAuthenticated === false) {
    return res.status(403).json({ code: 'FORBIDDEN', error: 'Administrator access denied.' });
  }
  req.adminUser = req.user;
  // Recheck authoritative state immediately before the protected handler.
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || req.session?.session_token || req.adminAuthenticated) {
    try {
      const result = await adminSecurityStore.lookup(req.session?.session_token || '');
      if (!result) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Authentication required.' });
      req.user = result.user;
      req.session = result.session;
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL || req.headers.origin) {
        return adminOrigin(req, res, next);
      }
      return next();
    } catch (_) {
      return res.status(503).json({ code: 'ADMIN_AUTH_UNAVAILABLE', error: 'Authentication temporarily unavailable.' });
    }
  }
  return next();
}
module.exports = { adminOrigin, clientIp, requireAdminIdentity };