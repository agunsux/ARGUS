const express = require('express');
const { AdminMagicLinkService } = require('../services/adminMagicLinkService');
const { adminSecurityStore } = require('../storage/AdminSecurityStore');
const { adminOrigin, clientIp } = require('../middleware/adminSecurity');
const { parseCookies } = require('../middleware/auth');
const router = express.Router();
const service = new AdminMagicLinkService();
function cookie(res, token, seconds) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  res.setHeader('Set-Cookie', `session_token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${seconds}${secure ? '; Secure' : ''}`);
}
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
router.use((req, res, next) => {
  const publicMutations = ['/login', '/magic-link', '/verify', '/logout', '/password-reset', '/reset-password', '/password-reset/request', '/password-reset/confirm'];
  return publicMutations.includes(req.path) ? adminOrigin(req, res, next) : next();
});
router.post('/login', (req, res) => res.status(410).json({ code: 'PASSWORD_LOGIN_DISABLED', error: 'Use administrator magic-link sign-in.' }));
router.post(['/password-reset', '/reset-password', '/password-reset/request', '/password-reset/confirm'], (req, res) => res.status(410).json({ code: 'PASSWORD_LOGIN_DISABLED' }));
router.post('/magic-link', async (req, res) => {
  try { res.status(202).json(await service.request(req.body?.email, clientIp(req))); }
  catch (error) {
    const status = error.status || 503;
    if (status === 429) res.setHeader('Retry-After', '60');
    res.status(status).json({ code: status === 429 ? 'AUTH_RATE_LIMITED' : 'ADMIN_AUTH_UNAVAILABLE',
      error: 'Permintaan belum dapat diproses. Coba lagi nanti atau hubungi pengelola.' });
  }
});
router.post('/verify', async (req, res) => {
  try {
    const previous = parseCookies(req.headers.cookie).session_token;
    const result = await service.verify(req.body?.token, clientIp(req), previous);
    cookie(res, result.sessionToken, 8 * 60 * 60);
    res.json({ success: true, redirect: '/admin' });
  } catch (error) {
    const status = error.status || 503;
    res.status(status).json({ code: status === 503 ? 'ADMIN_AUTH_UNAVAILABLE' : error.code,
      error: 'Tautan tidak dapat digunakan. Minta tautan baru atau coba lagi nanti.' });
  }
});
router.post('/logout', async (req, res) => {
  try {
    const token = req.session?.session_token || parseCookies(req.headers.cookie).session_token;
    if (token?.startsWith('adm-')) await adminSecurityStore.revoke(token);
    cookie(res, '', 0);
    res.json({ success: true });
  } catch (_) { res.status(503).json({ code: 'ADMIN_AUTH_UNAVAILABLE', error: 'Logout belum berhasil. Coba lagi.' }); }
});
module.exports = router;