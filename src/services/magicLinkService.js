/**
 * TIKUM / ARGUS — Magic Link Authentication Service
 * 
 * Passwordless authentication using cryptographic single-use tokens.
 * Security Guarantees:
 * 1. Cryptographically secure random tokens (crypto.randomBytes(32)).
 * 2. Tokens stored as SHA-256 hashes (raw tokens are never persisted).
 * 3. 15-minute token expiration (MAGIC_LINK_EXPIRY_MINUTES = 15).
 * 4. Single-use replay protection (invalidated immediately upon verification).
 * 5. No user enumeration (identical response for new and existing accounts).
 * 6. Dual-layer rate limiting: Per-IP and Per-Email (process-local).
 * 7. Canonical SessionStore integration: verified token creates standard session.
 * 8. Open redirect protection on callback redirect URLs.
 * 9. Never logs raw tokens or magic link URLs.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { getUserRepository } = require('../storage');
const { SessionStore } = require('./sessionStore');
const { emailService } = require('./emailService');

// Configuration
const MAGIC_LINK_EXPIRY_MINUTES = 15; // Centralized 15-minute token expiry
const TOKEN_EXPIRY_MS = MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000;
const IP_RATE_LIMIT_MAX = 10; // Max 10 requests per 15m per IP
const EMAIL_RATE_LIMIT_MAX = 3; // Max 3 requests per 15m per email
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Process-local rate limiting tracking (documented limitation: single-process memory)
const ipRequestHistory = new Map();
const emailRequestHistory = new Map();

// Test transport sink for testing email delivery safely without network
let testMailSink = null;

class MagicLinkService {
  /**
   * Register test sink for capturing emails during test suites
   */
  static setTestMailSink(sinkFn) {
    testMailSink = sinkFn;
  }

  static clearTestMailSink() {
    testMailSink = null;
  }

  /**
   * Reset rate limit state (useful for test suites)
   */
  static resetRateLimits() {
    ipRequestHistory.clear();
    emailRequestHistory.clear();
  }

  /**
   * Resolves canonical base URL for magic link callbacks across Production, Preview, and Local environments.
   */
  static resolveBaseUrl() {
    if (process.env.APP_BASE_URL && typeof process.env.APP_BASE_URL === 'string') {
      const cleaned = process.env.APP_BASE_URL.trim().replace(/\/+$/, '');
      if (cleaned.startsWith('https://') || cleaned.startsWith('http://')) {
        return cleaned;
      }
    }
    if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, '')}`;
    }
    return 'https://tikum.app';
  }

  /**
   * Validates email format
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (trimmed.length > 254) return false;
    // Standard RFC-compliant email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(trimmed);
  }

  /**
   * Rate limiting check: Per-IP and Per-Email
   */
  static checkRateLimit(ip, email) {
    const now = Date.now();

    // Check IP rate limit
    if (ip) {
      const ipHistory = (ipRequestHistory.get(ip) || []).filter(ts => (now - ts) < RATE_LIMIT_WINDOW_MS);
      if (ipHistory.length >= IP_RATE_LIMIT_MAX) {
        return {
          allowed: false,
          limitType: 'IP',
          retryAfter: Math.ceil((ipHistory[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)
        };
      }
      ipHistory.push(now);
      ipRequestHistory.set(ip, ipHistory);
    }

    // Check Email rate limit
    if (email) {
      const normEmail = email.toLowerCase().trim();
      const emailHistory = (emailRequestHistory.get(normEmail) || []).filter(ts => (now - ts) < RATE_LIMIT_WINDOW_MS);
      if (emailHistory.length >= EMAIL_RATE_LIMIT_MAX) {
        return {
          allowed: false,
          limitType: 'EMAIL',
          retryAfter: Math.ceil((emailHistory[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)
        };
      }
      emailHistory.push(now);
      emailRequestHistory.set(normEmail, emailHistory);
    }

    return { allowed: true };
  }

  /**
   * Validates redirect URL to prevent open redirect vulnerabilities and self-redirect loops
   */
  static validateRedirectUrl(url) {
    if (!url || typeof url !== 'string') return '/';
    const trimmed = url.trim();

    // Reject javascript:, data:, and other dangerous protocols
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      // If absolute URL, only permit canonical tikum.app domain (or active preview host)
      try {
        const parsed = new URL(trimmed);
        const previewHost = (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL)
          ? process.env.VERCEL_URL.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
          : null;
        const allowedHost = parsed.hostname === 'tikum.app' ||
          parsed.hostname === 'www.tikum.app' ||
          (previewHost && parsed.hostname === previewHost);
        if (parsed.protocol === 'https:' && allowedHost) {
          if (parsed.pathname.startsWith('/api/auth/verify')) {
            return '/';
          }
          return trimmed;
        }
      } catch (e) {
        return '/';
      }
      return '/';
    }

    // Must start with single / and not protocol-relative //
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
      if (trimmed.startsWith('/api/auth/verify')) {
        return '/';
      }
      return trimmed;
    }

    return '/';
  }

  /**
   * Hashes raw token for safe storage and comparison
   */
  static hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Resolves or provisions a canonical user across both authoritative UserRepository (PostgreSQL)
   * and legacy in-memory state.users without creating duplicate accounts or mismatched IDs.
   */
  static async ensureUserRecord(email, nowIso = new Date().toISOString()) {
    const normEmail = String(email || '').toLowerCase().trim();
    const userRepo = getUserRepository();
    if (!state.users) state.users = [];

    let repoUser = null;
    if (userRepo && typeof userRepo.getUserByEmail === 'function') {
      try {
        repoUser = await userRepo.getUserByEmail(normEmail);
      } catch (_) {}
    }

    let stateUser = state.users.find(u => u.email && u.email.toLowerCase() === normEmail);

    if (repoUser) {
      if (!stateUser) {
        stateUser = {
          ...repoUser,
          email: normEmail,
          role: (repoUser.role || 'buyer').toLowerCase(),
          status: repoUser.status || 'ACTIVE',
          password: repoUser.password ?? null,
          password_hash: repoUser.password_hash ?? null,
          auth_provider: repoUser.auth_provider || repoUser.metadata?.auth_provider || 'MAGIC_LINK',
          created_at: repoUser.created_at || nowIso,
          updated_at: repoUser.updated_at || nowIso
        };
        state.users.push(stateUser);
      } else {
        // Keep IDs synchronized with authoritative repository
        stateUser.id = repoUser.id;
        if (stateUser.status && stateUser.status.toUpperCase() === 'SUSPENDED') {
          repoUser.status = 'SUSPENDED';
        } else if (repoUser.status && repoUser.status.toUpperCase() === 'SUSPENDED') {
          stateUser.status = 'SUSPENDED';
        }
      }
      return stateUser;
    }

    if (stateUser) {
      // User was seeded in state.users (e.g. unit test); ensure authoritative repository also has this exact user ID
      if (userRepo && typeof userRepo.createUser === 'function') {
        try {
          const existingById = await userRepo.getUserById(stateUser.id);
          if (!existingById) {
            await userRepo.createUser({
              id: stateUser.id,
              email: normEmail,
              name: stateUser.name || normEmail.split('@')[0],
              role: (stateUser.role || 'BUYER').toUpperCase(),
              status: (stateUser.status || 'ACTIVE').toUpperCase(),
              password_hash: stateUser.password_hash || stateUser.password || null,
              metadata: { auth_provider: stateUser.auth_provider || 'MAGIC_LINK' }
            });
          }
        } catch (_) {}
      }
      return stateUser;
    }

    // Brand new user: create in authoritative UserRepository first, then sync to state.users
    const generatedId = `usr-${uuidv4().substring(0, 8)}`;
    const defaultName = normEmail.split('@')[0];

    if (userRepo && typeof userRepo.createUser === 'function') {
      try {
        repoUser = await userRepo.createUser({
          id: generatedId,
          email: normEmail,
          name: defaultName,
          role: 'BUYER', // Default safe role: buyer/user, never admin
          status: 'ACTIVE',
          password_hash: null,
          metadata: { auth_provider: 'MAGIC_LINK' }
        });
      } catch (err) {
        if (err.code === 'IDENTITY_CONFLICT') {
          repoUser = await userRepo.getUserByEmail(normEmail).catch(() => null);
        } else if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw err;
        }
      }
    }

    const newUser = {
      id: repoUser ? repoUser.id : generatedId,
      name: repoUser ? repoUser.name : defaultName,
      email: normEmail,
      phone: repoUser ? repoUser.phone : null,
      role: 'buyer', // Default safe role: buyer/user, never admin
      status: repoUser ? (repoUser.status || 'ACTIVE') : 'ACTIVE',
      password: null, // Passwordless account
      password_hash: null,
      auth_provider: 'MAGIC_LINK',
      created_at: (repoUser && repoUser.created_at) ? repoUser.created_at : nowIso,
      updated_at: (repoUser && repoUser.updated_at) ? repoUser.updated_at : nowIso
    };
    state.users.push(newUser);
    return newUser;
  }

  /**
   * Request Magic Link
   * Generates secure token, stores token hash in durable UserRepository & local state, dispatches email.
   * Prevents user enumeration by always returning uniform generic response.
   */
  static async requestMagicLink({ email, ip = '127.0.0.1', userAgent = null, redirectUrl = '/' }) {
    if (!this.validateEmail(email)) {
      const err = new Error('Invalid email address format');
      err.code = 'INVALID_EMAIL';
      err.status = 400;
      throw err;
    }

    const normEmail = email.toLowerCase().trim();

    // Check rate limits
    const rateCheck = this.checkRateLimit(ip, normEmail);
    if (!rateCheck.allowed) {
      const err = new Error(`Too many login attempts for this ${rateCheck.limitType.toLowerCase()}. Please try again in ${rateCheck.retryAfter} seconds.`);
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.status = 429;
      err.retryAfter = rateCheck.retryAfter;
      throw err;
    }

    // Generate cryptographically secure random token (32 bytes = 256 bits of entropy)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + TOKEN_EXPIRY_MS).toISOString();

    // Resolve or provision user in authoritative UserRepository & state.users
    const userRecord = await this.ensureUserRecord(normEmail, nowIso);

    const tokenRecord = {
      id: `mlt-${uuidv4()}`,
      user_id: userRecord ? userRecord.id : null,
      email: normEmail,
      token_hash: tokenHash,
      created_at: nowIso,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      ip_address: ip,
      user_agent: userAgent,
      redirect_url: this.validateRedirectUrl(redirectUrl)
    };

    if (!state.magic_link_tokens) {
      state.magic_link_tokens = [];
    }
    state.magic_link_tokens.push(tokenRecord);

    // Persist token hash durably in UserRepository (PostgreSQL in production)
    const userRepo = getUserRepository();
    if (userRepo && typeof userRepo.saveMagicLinkToken === 'function') {
      await userRepo.saveMagicLinkToken(tokenRecord);
    }

    // Audit log: MAGIC_LINK_REQUESTED (NEVER logs raw token)
    const emailHash = crypto.createHash('sha256').update(normEmail).digest('hex');
    await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_REQUESTED', 'SYSTEM', {
      email_hash: emailHash,
      ip: ip,
      token_id: tokenRecord.id
    }).catch(() => {});

    const safeRedirect = encodeURIComponent(tokenRecord.redirect_url);
    const baseUrl = this.resolveBaseUrl();
    const magicLinkUrl = `${baseUrl}/api/auth/verify?token=${rawToken}&redirect=${safeRedirect}`;

    // Delivery abstraction:
    // 1. If test sink is set, send to sink
    if (testMailSink && typeof testMailSink === 'function') {
      testMailSink({
        to: normEmail,
        rawToken, // provided strictly to test harness sink
        magicLinkUrl
      });
    }

    // 2. Outbound transactional email dispatch via EmailService
    try {
      await emailService.sendEmail({
        to: normEmail,
        subject: 'Your Tikum login link',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 20px; color: #111827;">
            <div style="margin-bottom: 24px;">
              <span style="font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #1DB954;">TIKUM</span>
            </div>
            <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 16px; color: #111827;">Masuk ke Tikum</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #4B5563; margin: 0 0 24px;">
              Masuk ke akun Tikum Anda dengan tombol berikut.
            </p>
            <div style="margin: 28px 0;">
              <a href="${magicLinkUrl}" style="background-color: #1DB954; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">
                MASUK KE TIKUM
              </a>
            </div>
            <p style="font-size: 13px; color: #6B7280; line-height: 1.5; margin: 24px 0 8px;">
              Link ini hanya berlaku selama 15 menit dan hanya dapat digunakan sekali.
            </p>
            <p style="font-size: 13px; color: #9CA3AF; line-height: 1.5; margin: 0;">
              Jika Anda tidak meminta link ini, abaikan email ini.
            </p>
          </div>
        `,
        text: `Masuk ke akun Tikum Anda dengan tombol berikut.\n\nMASUK KE TIKUM: ${magicLinkUrl}\n\nLink ini hanya berlaku selama 15 menit dan hanya dapat digunakan sekali.\nJika Anda tidak meminta link ini, abaikan email ini.`
      });

      // Audit log: MAGIC_LINK_SENT
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_SENT', 'SYSTEM', {
        email_hash: emailHash,
        ip: ip,
        token_id: tokenRecord.id
      }).catch(() => {});
    } catch (sendErr) {
      // Non-blocking: failure to send does not break generic response
    }

    // Generic response preventing email enumeration — NEVER leaks raw token
    return {
      success: true,
      message: 'Jika email Anda terdaftar atau valid, tautan akses telah dikirimkan ke kotak masuk Anda.',
      email: normEmail
    };
  }

  /**
   * Verify Magic Link Token
   * Single-use validation, expiry check, replay protection, durable session creation.
   */
  static async verifyMagicLink({ token, ip = '127.0.0.1', userAgent = null, redirectUrl = null }) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_INVALID', 'SYSTEM', {
        reason: 'MISSING_TOKEN',
        ip
      }).catch(() => {});
      const err = new Error('Token verifikasi tidak valid atau tidak disediakan');
      err.code = 'INVALID_TOKEN';
      err.status = 401;
      throw err;
    }

    const cleanToken = token.trim();
    // Validate token format: must be 64-character hex string
    if (!/^[a-f0-9]{64}$/i.test(cleanToken)) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_INVALID', 'SYSTEM', {
        reason: 'MALFORMED_TOKEN',
        ip
      }).catch(() => {});
      const err = new Error('Format token verifikasi tidak valid');
      err.code = 'MALFORMED_TOKEN';
      err.status = 401;
      throw err;
    }

    const candidateHash = this.hashToken(cleanToken);
    const userRepo = getUserRepository();
    const tokens = state.magic_link_tokens || [];

    // Find token by secure hash in both durable UserRepository and in-memory state
    let repoRecord = null;
    if (userRepo && typeof userRepo.getMagicLinkTokenByHash === 'function') {
      try {
        repoRecord = await userRepo.getMagicLinkTokenByHash(candidateHash);
      } catch (err) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw err;
        }
      }
    }
    const stateRecord = tokens.find(t => t.token_hash === candidateHash);
    const record = repoRecord || stateRecord;

    if (!record) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_INVALID', 'SYSTEM', {
        reason: 'TOKEN_NOT_FOUND',
        ip
      }).catch(() => {});
      const err = new Error('Token verifikasi tidak ditemukan atau tidak valid');
      err.code = 'INVALID_TOKEN';
      err.status = 401;
      throw err;
    }

    // Replay protection: check if already used in either store
    const alreadyUsed = Boolean(record.used) || Boolean(stateRecord && stateRecord.used) || Boolean(repoRecord && repoRecord.used);
    if (alreadyUsed) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_INVALID', 'SYSTEM', {
        token_id: record.id,
        reason: 'TOKEN_ALREADY_USED',
        ip
      }).catch(() => {});
      const err = new Error('Token verifikasi ini sudah pernah digunakan (replay protection)');
      err.code = 'TOKEN_ALREADY_USED';
      err.status = 401;
      throw err;
    }

    // Expiration check (trusted DB clock + server clock across both stores)
    const now = new Date();
    const nowIso = now.toISOString();
    const isExpired =
      Boolean(repoRecord && repoRecord.db_expired) ||
      !record.expires_at ||
      new Date(record.expires_at) <= now ||
      Boolean(stateRecord && (!stateRecord.expires_at || new Date(stateRecord.expires_at) <= now)) ||
      Boolean(repoRecord && (!repoRecord.expires_at || new Date(repoRecord.expires_at) <= now));

    if (isExpired) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_EXPIRED', 'SYSTEM', {
        token_id: record.id,
        ip
      }).catch(() => {});
      const err = new Error('Link sudah kedaluwarsa. Silakan minta magic link baru.');
      err.code = 'TOKEN_EXPIRED';
      err.status = 401;
      throw err;
    }

    // Invalidate immediately (atomic single-use enforcement)
    if (stateRecord) {
      stateRecord.used = true;
      stateRecord.used_at = nowIso;
    }
    record.used = true;
    record.used_at = nowIso;

    const requireRepoConsume = Boolean(repoRecord) || process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
    if (requireRepoConsume && userRepo && typeof userRepo.consumeMagicLinkToken === 'function') {
      const consumed = await userRepo.consumeMagicLinkToken(candidateHash, nowIso);
      if (!consumed) {
        await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_INVALID', 'SYSTEM', {
          token_id: record.id,
          reason: 'TOKEN_ALREADY_USED',
          ip
        }).catch(() => {});
        const err = new Error('Token verifikasi ini sudah pernah digunakan (replay protection)');
        err.code = 'TOKEN_ALREADY_USED';
        err.status = 401;
        throw err;
      }
    }

    // Resolve existing user or provision new user in both UserRepository and state.users
    const user = await this.ensureUserRecord(record.email, nowIso);

    // Check account suspension before creating a session
    if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
      await recordAuditLog('AUTH', user.id, 'MAGIC_LINK_SUSPENDED', 'SYSTEM', {
        user_id: user.id,
        ip
      }).catch(() => {});
      if (userRepo && typeof userRepo.recordAuthAudit === 'function') {
        userRepo.recordAuthAudit({
          userId: user.id,
          eventType: 'MAGIC_LINK_LOGIN_SUSPENDED',
          success: false,
          ipAddress: ip,
          userAgent,
          metadata: { tokenId: record.id }
        }).catch(() => {});
      }
      const err = new Error('Akun Anda sedang ditangguhkan. Akses ditolak.');
      err.code = 'USER_SUSPENDED';
      err.status = 403;
      throw err;
    }

    // Create session in canonical SessionStore and await durable DB persistence
    const session = await SessionStore.createSession({
      userId: user.id,
      role: user.role,
      userAgent,
      ip
    });

    // Ensure session is also in state.sessions
    if (!state.sessions) state.sessions = [];
    if (!state.sessions.find(s => s.session_token === session.session_token)) {
      state.sessions.push(session);
    }

    // Update last_login_at in authoritative UserRepository
    if (userRepo && typeof userRepo.updateUser === 'function') {
      await userRepo.updateUser(user.id, { last_login_at: nowIso }).catch(() => {});
    }
    user.last_login_at = nowIso;

    // Record durable auth audit event
    if (userRepo && typeof userRepo.recordAuthAudit === 'function') {
      userRepo.recordAuthAudit({
        userId: user.id,
        eventType: 'MAGIC_LINK_VERIFIED',
        success: true,
        ipAddress: ip,
        userAgent,
        metadata: { tokenId: record.id }
      }).catch(() => {});
    }

    // Audit logs: MAGIC_LINK_VERIFIED and SESSION_CREATED (never logs raw session_token)
    await recordAuditLog('AUTH', user.id, 'MAGIC_LINK_VERIFIED', 'MAGIC_LINK', {
      user_id: user.id,
      role: user.role,
      ip
    }).catch(() => {});

    await recordAuditLog('AUTH', user.id, 'SESSION_CREATED', 'MAGIC_LINK', {
      user_id: user.id,
      session_token_hash: session.session_token_hash,
      ip
    }).catch(() => {});

    const validatedRedirect = this.validateRedirectUrl(record.redirect_url || redirectUrl || '/');

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: (user.role || 'buyer').toLowerCase(),
        status: user.status || 'ACTIVE',
        created_at: user.created_at
      },
      session,
      redirectUrl: validatedRedirect
    };
  }
}

module.exports = {
  MagicLinkService,
  MAGIC_LINK_EXPIRY_MINUTES,
  TOKEN_EXPIRY_MS,
  IP_RATE_LIMIT_MAX,
  EMAIL_RATE_LIMIT_MAX
};
