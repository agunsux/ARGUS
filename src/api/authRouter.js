/**
 * TIKUM / ARGUS — Canonical Authentication Router
 * 
 * Durable PostgreSQL-backed authentication and identity management:
 * - POST /api/auth/signup         : User registration with bcrypt hashing, unique email, default BUYER role
 * - POST /api/auth/login          : Password authentication, SHA-256 session hash, HttpOnly cookie
 * - GET  /api/auth/me             : Current authenticated user profile
 * - GET  /api/auth/session        : Active session details
 * - POST /api/auth/logout         : Session revocation in DB & local store, cookie cleared
 * - POST /api/auth/password-reset : Secure password reset
 * - POST /api/auth/magic-link     : Passwordless authentication flow
 * - GET  /api/auth/verify         : Magic link token verification
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getUserRepository } = require('../storage');
const { MagicLinkService } = require('../services/magicLinkService');
const { SessionStore } = require('../services/sessionStore');
const { authenticate, requireAuth, resolveUser, parseCookies } = require('../middleware/auth');
const { recordAuditLog, state, hashPassword, verifyPassword } = require('../database');
const { emailService } = require('../services/emailService');

/**
 * POST /api/auth/signup
 * Standard user registration.
 * Minimum fields: email, password, name.
 * Password hashed using bcrypt cost 12.
 * Default role is BUYER (server-enforced).
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

  const userRepo = getUserRepository();
  const passwordHash = bcrypt.hashSync(password, 12);
  const userId = `usr-${uuidv4()}`;

  let createdUser;
  try {
    createdUser = await userRepo.createUser({
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
      role: 'BUYER', // Default signup role MUST always be BUYER. Never trust client role.
      status: 'ACTIVE',
      password_hash: passwordHash
    });
  } catch (err) {
    if (err.code === 'IDENTITY_CONFLICT' || (err.message && err.message.includes('already exists'))) {
      return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_ALREADY_REGISTERED' });
    }
    console.error('[AuthRouter:Signup] Error creating user:', err.message);
    return res.status(500).json({ error: 'Failed to register user', code: 'INTERNAL_ERROR' });
  }

  // Synchronize in-memory cache for legacy components
  if (state.users && Array.isArray(state.users)) {
    const idx = state.users.findIndex(u => u.id === createdUser.id);
    if (idx >= 0) {
      state.users[idx] = { ...state.users[idx], ...createdUser, password: passwordHash, password_hash: passwordHash };
    } else {
      state.users.push({ ...createdUser, password: passwordHash, password_hash: passwordHash });
    }
  }

  // Audit event in durable auth audit log
  userRepo.recordAuthAudit({
    userId: createdUser.id,
    eventType: 'USER_REGISTERED',
    success: true,
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
    metadata: { email: normalizedEmail, role: createdUser.role }
  }).catch(() => {});

  recordAuditLog('AUTH', createdUser.id, 'USER_REGISTERED', createdUser.id, {
    email: normalizedEmail,
    role: createdUser.role
  }).catch(() => {});

  // Never return password or password_hash
  return res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      role: createdUser.role,
      status: createdUser.status,
      created_at: createdUser.created_at
    }
  });
});

/**
 * POST /api/auth/login
 * Standard password login.
 * Validates email and password against stored bcrypt hash in PostgreSQL.
 * Creates authenticated session in durable UserRepository and SessionStore.
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
  const userRepo = getUserRepository();

  // Retrieve user with password hash from authoritative store
  let user = await userRepo.getUserByEmail(normalizedEmail, true);

  // Fallback to local state.users if not found in repository (e.g. initial memory state)
  if (!user && state.users) {
    user = state.users.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  }

  const storedHash = user?.password_hash || user?.password;
  let isValid = false;

  if (user && storedHash) {
    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
      isValid = bcrypt.compareSync(password, storedHash);
    } else {
      isValid = verifyPassword(password, storedHash);
    }
  }

  if (!isValid) {
    userRepo.recordAuthAudit({
      userId: user?.id || null,
      eventType: 'LOGIN_FAILED',
      success: false,
      ipAddress: ip,
      userAgent,
      metadata: { email: normalizedEmail, reason: 'INVALID_CREDENTIALS' }
    }).catch(() => {});

    return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
  }

  // Check account suspension (fail closed if suspended in DB or in-memory state)
  const stateUser = (state.users || []).find(u => u.id === user.id || (u.email && u.email.toLowerCase() === normalizedEmail));
  const isSuspended = (user?.status && user.status.toUpperCase() === 'SUSPENDED') ||
                      (stateUser?.status && stateUser.status.toUpperCase() === 'SUSPENDED');
  if (isSuspended) {
    userRepo.recordAuthAudit({
      userId: user.id,
      eventType: 'LOGIN_SUSPENDED',
      success: false,
      ipAddress: ip,
      userAgent,
      metadata: { email: normalizedEmail, reason: 'ACCOUNT_SUSPENDED' }
    }).catch(() => {});

    return res.status(403).json({ error: 'Account is suspended. Access denied.', code: 'ACCOUNT_SUSPENDED' });
  }

  // Create session in authoritative repository
  const sessionRes = await userRepo.createSession({
    userId: user.id,
    role: user.role,
    ip,
    userAgent
  });
  const session = sessionRes.session;

  // Mirror session to local SessionStore and state.sessions for synchronous lookup compatibility
  try {
    const rawSessions = SessionStore.getAll();
    const tokenHash = crypto.createHash('sha256').update(session.session_token).digest('hex');
    const nowIso = new Date().toISOString();
    const expiresAt = session.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    rawSessions.push({
      session_token: session.session_token,
      session_token_hash: tokenHash,
      user_id: user.id,
      role: user.role,
      user_agent: userAgent,
      ip: ip,
      created_at: nowIso,
      last_active_at: nowIso,
      expires_at: expiresAt,
      revoked: false,
      revoked_at: null,
      revoked_reason: null
    });
    SessionStore.saveAll(rawSessions);

    if (!state.sessions) state.sessions = [];
    state.sessions.push(session);
  } catch (_) {}

  // Touch last_login_at in durable repository
  const now = new Date().toISOString();
  await userRepo.updateUser(user.id, { last_login_at: now }).catch(() => {});
  user.last_login_at = now;

  // Set secure HttpOnly cookie
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
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

  // Record audit log
  userRepo.recordAuthAudit({
    userId: user.id,
    eventType: 'USER_LOGIN',
    success: true,
    ipAddress: ip,
    userAgent,
    metadata: { sessionId: session.id }
  }).catch(() => {});

  recordAuditLog('AUTH', user.id, 'USER_LOGIN', user.id, {
    ip,
    session_id: session.id
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
 * POST /api/auth/password-reset/request
 * Request user password reset link.
 * Generic response prevents email enumeration.
 */
router.post('/password-reset/request', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required', code: 'INVALID_EMAIL' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const userRepo = getUserRepository();
  const user = await userRepo.getUserByEmail(normalizedEmail) || (state.users || []).find(
    u => u.email && u.email.toLowerCase() === normalizedEmail
  );

  const genericResponse = {
    success: true,
    message: 'Jika email terdaftar, petunjuk reset password telah dikirimkan ke kotak masuk.'
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 60 * 1000).toISOString(); // 30 minutes

  const tokenRecord = {
    id: `uprt-${uuidv4()}`,
    user_id: user.id,
    email: user.email,
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

  const resetUrl = `https://tikum.app/auth/reset-password?token=${rawToken}`;

  try {
    await emailService.sendPasswordResetEmail({
      to: user.email,
      resetToken: rawToken,
      resetUrl,
      name: user.name
    });
  } catch (err) {
    console.error('[AuthRouter:PasswordReset] Failed to send reset email:', err.message);
  }

  userRepo.recordAuthAudit({
    userId: user.id,
    eventType: 'PASSWORD_RESET_REQUESTED',
    success: true,
    ipAddress: tokenRecord.ip_address,
    metadata: { tokenId: tokenRecord.id }
  }).catch(() => {});

  recordAuditLog('AUTH', user.id, 'PASSWORD_RESET_REQUESTED', 'SYSTEM', {
    ip: tokenRecord.ip_address,
    token_id: tokenRecord.id
  }).catch(() => {});

  return res.status(200).json(genericResponse);
});

/**
 * POST /api/auth/password-reset/confirm
 * Verifies reset token and updates user password.
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

  const userRepo = getUserRepository();
  const user = await userRepo.getUserById(tokenRecord.user_id) || (state.users || []).find(u => u.id === tokenRecord.user_id || u.email === tokenRecord.email);
  if (!user) {
    return res.status(404).json({ error: 'Pengguna tidak ditemukan', code: 'USER_NOT_FOUND' });
  }

  tokenRecord.used = true;
  tokenRecord.used_at = new Date().toISOString();

  const newHash = bcrypt.hashSync(newPassword, 12);
  await userRepo.updateUserPassword(user.id, newHash);

  // Update in-memory user record
  user.password = newHash;
  user.password_hash = newHash;
  user.updated_at = new Date().toISOString();

  // Invalidate all active sessions for user in durable database & local store
  await userRepo.revokeAllUserSessions(user.id, null, 'USER_PASSWORD_RESET');
  SessionStore.invalidateAllSessions(user.id);

  userRepo.recordAuthAudit({
    userId: user.id,
    eventType: 'PASSWORD_RESET_COMPLETED',
    success: true,
    ipAddress: req.ip || req.connection?.remoteAddress || null
  }).catch(() => {});

  recordAuditLog('AUTH', user.id, 'PASSWORD_RESET_COMPLETED', user.id, {
    ip: req.ip || req.connection?.remoteAddress || null
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: 'Password berhasil diperbarui. Silakan login kembali.'
  });
});

/**
 * POST /api/auth/magic-link
 * Request passwordless authentication link.
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
 * Verifies single-use magic link token and establishes session.
 */
router.get('/verify', async (req, res) => {
  const token = req.query.token;
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || null;
  const acceptsJson = (req.accepts('json') && !req.accepts('html')) || req.query.format === 'json';

  try {
    const verification = await MagicLinkService.verifyMagicLink({
      token,
      ip,
      userAgent
    });

    const sessionToken = verification.session.session_token;
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;

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
      role: req.user.role,
      status: req.user.status || 'ACTIVE',
      created_at: req.user.created_at
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
 * Terminates active session in durable database & local store, clears cookie.
 */
router.post('/logout', async (req, res) => {
  const user = req.user || resolveUser(req);
  let token = req.session?.session_token;

  if (!token) {
    const authHeader = req.header ? (req.header('authorization') || req.header('x-session-token')) : null;
    if (authHeader) {
      token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
    }
  }

  if (!token && req.headers && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.session_token) token = cookies.session_token.trim();
  }

  if (!token && req.body?.session_token) {
    token = req.body.session_token.trim();
  }

  const userRepo = getUserRepository();
  if (token) {
    await userRepo.revokeSession(token, 'USER_LOGOUT');
    SessionStore.revokeSession(token, 'USER_LOGOUT');
    if (state.sessions) {
      state.sessions = state.sessions.filter(s => s.session_token !== token);
    }
  }

  // Clear cookie
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');

  const actorId = user ? user.id : 'ANONYMOUS';
  userRepo.recordAuthAudit({
    userId: user ? user.id : null,
    eventType: 'USER_LOGOUT',
    success: true,
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
    metadata: { tokenRevoked: !!token }
  }).catch(() => {});

  recordAuditLog('AUTH', actorId, 'SESSION_REVOKED', 'SYSTEM', {
    session_token: token || null,
    user_id: user ? user.id : null
  }).catch(() => {});

  recordAuditLog('AUTH', actorId, 'LOGOUT', 'USER', {
    user_id: user ? user.id : null
  }).catch(() => {});

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;
