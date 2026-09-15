/**
 * TIKUM / ARGUS — Canonical Authentication Router
 * 
 * Endpoints:
 * - POST /api/auth/magic-link : Request magic link login
 * - GET  /api/auth/verify     : Verify token, set HttpOnly cookie, establish session
 * - GET  /api/auth/session    : Retrieve authenticated user session info
 * - POST /api/auth/logout     : Terminate session, clear cookie
 */

const express = require('express');
const router = express.Router();
const { MagicLinkService } = require('../services/magicLinkService');
const { SessionStore } = require('../services/sessionStore');
const { authenticate, resolveUser } = require('../middleware/auth');
const { recordAuditLog, state } = require('../database');

/**
 * POST /api/auth/magic-link
 * Request passwordless authentication link.
 * Generic response prevents email enumeration.
 */
router.post('/magic-link', async (req, res) => {
  const { email, redirectUrl } = req.body || {};
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || null;

  try {
    const result = await MagicLinkService.requestMagicLink({
      email,
      ip,
      userAgent,
      redirectUrl
    });

    res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || (err.code === 'INVALID_EMAIL' ? 400 : (err.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 500));
    res.status(statusCode).json({
      error: err.message,
      code: err.code || 'AUTH_REQUEST_FAILED',
      ...(err.retryAfter ? { retryAfter: err.retryAfter } : {})
    });
  }
});

/**
 * GET /api/auth/verify
 * Verifies single-use magic link token and establishes SessionStore session.
 * Supports both JSON API clients and direct browser redirects.
 */
router.get('/verify', async (req, res) => {
  const token = req.query.token;
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || null;
  const acceptsJson = req.accepts('json') && !req.accepts('html') || req.query.format === 'json';

  try {
    const verification = await MagicLinkService.verifyMagicLink({
      token,
      ip,
      userAgent
    });

    const sessionToken = verification.session.session_token;
    const isProd = process.env.NODE_ENV === 'production';

    // Set secure HttpOnly session cookie
    const cookieOptions = [
      `session_token=${sessionToken}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      `Max-Age=${24 * 60 * 60}`
    ];
    if (isProd) {
      cookieOptions.push('Secure');
    }

    res.setHeader('Set-Cookie', cookieOptions.join('; '));

    if (acceptsJson) {
      return res.status(200).json({
        success: true,
        message: 'Authentication successful',
        session_token: sessionToken,
        user: verification.user,
        redirect: verification.redirectUrl
      });
    } else {
      // Browser navigation redirect
      return res.redirect(verification.redirectUrl || '/');
    }
  } catch (err) {
    const statusCode = err.status || 401;

    if (acceptsJson) {
      return res.status(statusCode).json({
        error: err.message,
        code: err.code || 'VERIFICATION_FAILED'
      });
    } else {
      const safeCode = encodeURIComponent(err.code || 'INVALID_TOKEN');
      return res.redirect(`/login?error=${safeCode}`);
    }
  }
});

/**
 * GET /api/auth/session
 * Returns trusted identity & active session metadata.
 */
router.get('/session', authenticate, (req, res) => {
  res.status(200).json({
    authenticated: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    },
    session: {
      created_at: req.session.created_at,
      expires_at: req.session.expires_at,
      session_token: req.session.session_token
    }
  });
});

/**
 * POST /api/auth/logout
 * Terminates active session in SessionStore, clears cookie.
 */
router.post('/logout', (req, res) => {
  const user = resolveUser(req);
  const token = req.session?.session_token || 
    (req.header ? (req.header('authorization')?.replace('Bearer ', '') || req.header('x-session-token')) : null) ||
    req.body?.session_token;

  if (token) {
    SessionStore.revokeSession(token, 'USER_LOGOUT');
    if (state.sessions) {
      state.sessions = state.sessions.filter(s => s.session_token !== token);
    }
  }

  // Clear cookie
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');

  if (user) {
    recordAuditLog('AUTH', user.id, 'SESSION_TERMINATED', 'USER', {
      user_id: user.id
    }).catch(() => {});
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;
