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
   * Validates redirect URL to prevent open redirect vulnerabilities
   */
  static validateRedirectUrl(url) {
    if (!url || typeof url !== 'string') return '/';
    const trimmed = url.trim();

    // Reject javascript:, data:, and other dangerous protocols
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      // If absolute URL, only permit canonical tikum.app domain
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:' && (parsed.hostname === 'tikum.app' || parsed.hostname === 'www.tikum.app')) {
          return trimmed;
        }
      } catch (e) {
        return '/';
      }
      return '/';
    }

    // Must start with single / and not protocol-relative //
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
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
   * Request Magic Link
   * Generates secure token, stores token hash, dispatches email.
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
    const expiresAt = new Date(now + TOKEN_EXPIRY_MS).toISOString();

    const tokenRecord = {
      id: `mlt-${uuidv4()}`,
      email: normEmail,
      token_hash: tokenHash,
      created_at: new Date(now).toISOString(),
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

    // Audit log: MAGIC_LINK_REQUESTED (NEVER logs raw token)
    const emailHash = crypto.createHash('sha256').update(normEmail).digest('hex');
    await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_REQUESTED', 'SYSTEM', {
      email_hash: emailHash,
      ip: ip,
      token_id: tokenRecord.id
    }).catch(() => {});

    const safeRedirect = encodeURIComponent(tokenRecord.redirect_url);
    const magicLinkUrl = `https://tikum.app/api/auth/verify?token=${rawToken}&redirect=${safeRedirect}`;

    // Delivery abstraction:
    // 1. If test sink is set, send to sink
    if (testMailSink && typeof testMailSink === 'function') {
      testMailSink({
        to: normEmail,
        rawToken, // provided strictly to test harness sink
        magicLinkUrl
      });
    }

    // Pre-create account for new users or keep existing (Single passwordless identity flow)
    if (!state.users) state.users = [];
    let existingUser = state.users.find(u => u.email && u.email.toLowerCase() === normEmail);
    if (!existingUser) {
      const newUser = {
        id: `usr-${uuidv4().substring(0, 8)}`,
        name: normEmail.split('@')[0],
        email: normEmail,
        phone: null,
        role: 'buyer', // Default safe role: buyer/user, never admin
        status: 'ACTIVE',
        password: null, // Passwordless account
        password_hash: null,
        auth_provider: 'MAGIC_LINK',
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString()
      };
      state.users.push(newUser);
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
   * Single-use validation, expiry check, replay protection, session creation.
   */
  static async verifyMagicLink({ token, ip = '127.0.0.1', userAgent = null }) {
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
    const tokens = state.magic_link_tokens || [];

    // Find token by secure hash
    const record = tokens.find(t => t.token_hash === candidateHash);
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

    // Replay protection: check if already used
    if (record.used) {
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

    // Expiration check
    const now = new Date();
    if (new Date(record.expires_at) <= now) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_EXPIRED', 'SYSTEM', {
        token_id: record.id,
        ip
      }).catch(() => {});
      const err = new Error('Link sudah kedaluwarsa. Silakan minta magic link baru.');
      err.code = 'TOKEN_EXPIRED';
      err.status = 401;
      throw err;
    }

    // Invalidate immediately (single-use)
    record.used = true;
    record.used_at = now.toISOString();

    // Look up existing user or provision new user
    let user = (state.users || []).find(u => u.email.toLowerCase() === record.email.toLowerCase());

    if (!user) {
      // Self-signup fallback: create new user with default 'buyer' role (NEVER admin)
      user = {
        id: `usr-${uuidv4().substring(0, 8)}`,
        name: record.email.split('@')[0],
        email: record.email,
        phone: null,
        role: 'buyer', // Default safe role
        status: 'ACTIVE',
        password: null, // Passwordless account
        password_hash: null,
        auth_provider: 'MAGIC_LINK',
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };
      if (!state.users) state.users = [];
      state.users.push(user);
    }

    // Create session in canonical SessionStore
    const session = SessionStore.createSession({
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

    // Audit logs: MAGIC_LINK_VERIFIED and SESSION_CREATED
    await recordAuditLog('AUTH', user.id, 'MAGIC_LINK_VERIFIED', 'MAGIC_LINK', {
      user_id: user.id,
      role: user.role,
      ip
    }).catch(() => {});

    await recordAuditLog('AUTH', user.id, 'SESSION_CREATED', 'MAGIC_LINK', {
      user_id: user.id,
      session_token: session.session_token,
      ip
    }).catch(() => {});

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || 'ACTIVE',
        created_at: user.created_at
      },
      session,
      redirectUrl: record.redirect_url || '/'
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
