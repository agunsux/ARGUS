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
const { v4: uuidv4 } = require('uuid');
const { MagicLinkService } = require('../services/magicLinkService');
const { SessionStore } = require('../services/sessionStore');
const { authenticate, requireAuth, resolveUser } = require('../middleware/auth');
const { recordAuditLog, state } = require('../database');

/**
 * POST /api/auth/signup
 * Standard user registration.
 * Minimum fields: email, password, name.
 * Password hashed using bcrypt cost 12.
 * Role is strictly USER (never trusts client-supplied role).
 * Rejects duplicate email (case-insensitive).
 */
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};

  // Validate input presence
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required', code: 'INVALID_EMAIL' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email address format', code: 'INVALID_EMAIL' });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required', code: 'INVALID_NAME' });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters', code: 'INVALID_PASSWORD' });
  }

  // Duplicate email check
  if (!state.users) state.users = [];
  const existing = state.users.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_ALREADY_REGISTERED' });
  }

  const { hashPassword } = require('../database');
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();
  const userId = `usr-${uuidv4()}`;

  const newUser = {
    id: userId,
    email: normalizedEmail,
    name: name.trim(),
    role: 'USER', // Default signup role MUST always be USER. Never trust client role.
    status: 'ACTIVE',
    password: passwordHash,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
    last_login_at: null
  };

  state.users.push(newUser);

  await recordAuditLog('AUTH', userId, 'USER_REGISTERED', userId, {
    email: normalizedEmail,
    role: newUser.role
  }).catch(() => {});

  // Never return password or password_hash
  return res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      status: newUser.status,
      created_at: newUser.created_at
    }
  });
});

/**
 * POST /api/auth/login
 * Standard password login.
 * Validates email and password against stored bcrypt hash.
 * Creates authenticated session in SessionStore.
 * Sets secure HttpOnly cookie session_token.
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || null;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required', code: 'INVALID_INPUT' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = (state.users || []).find(u => u.email && u.email.toLowerCase() === normalizedEmail);

  const { verifyPassword } = require('../database');
  const isValid = user && verifyPassword(password, user.password_hash || user.password);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
  }

  // Check account suspension
  if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account is suspended. Access denied.', code: 'ACCOUNT_SUSPENDED' });
  }

  // Create session
  const session = SessionStore.createSession({
    userId: user.id,
    role: user.role,
    ip,
    userAgent
  });

  const now = new Date().toISOString();
  user.last_login_at = now;
  user.updated_at = now;

  // Set secure HttpOnly cookie
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = [
    `session_token=${session.session_token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${24 * 60 * 60}`
  ];
  if (isProd) {
    cookieOptions.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieOptions.join('; '));

  await recordAuditLog('AUTH', user.id, 'USER_LOGIN', user.id, {
    ip,
    session_token: session.session_token
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    session_token: session.session_token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status || 'ACTIVE',
      last_login_at: user.last_login_at
    }
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user profile.
 */
router.get('/me', requireAuth, (req, res) => {
  res.status(200).json({
    authenticated: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status || 'ACTIVE',
      created_at: req.user.created_at,
      last_login_at: req.user.last_login_at
    }
  });
});

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
