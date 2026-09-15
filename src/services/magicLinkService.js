/**
 * TIKUM / ARGUS — Magic Link Authentication Service
 * 
 * Passwordless authentication using cryptographic single-use tokens.
 * Security Guarantees:
 * 1. Cryptographically secure random tokens (crypto.randomBytes(32)).
 * 2. Tokens stored as SHA-256 hashes (raw tokens are never persisted).
 * 3. 15-minute token expiration.
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
const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
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

    // Audit log (NEVER logs raw token)
    const emailHash = crypto.createHash('sha256').update(normEmail).digest('hex');
    await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_REQUESTED', 'SYSTEM', {
      email_hash: emailHash,
      ip: ip,
      token_id: tokenRecord.id
    });

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

    // 2. Outbound transactional email dispatch via EmailService
    // Only in production or if Resend key is configured
    try {
      await emailService.sendEmail({
        to: normEmail,
        subject: 'Masuk ke TIKUM — Link Akses Cepat',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 20px; color: #111827;">
            <div style="margin-bottom: 24px;">
              <span style="font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #059669;">TIKUM</span>
              <span style="color: #6B7280; font-size: 14px; margin-left: 8px;">Authentic Event Access</span>
            </div>
            <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #111827;">Link Masuk Akun Anda</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #4B5563; margin: 0 0 24px;">
              Klik tombol di bawah ini untuk masuk ke akun TIKUM Anda. Link ini hanya berlaku selama <strong>15 menit</strong> dan hanya dapat digunakan satu kali.
            </p>
            <div style="margin: 28px 0;">
              <a href="${magicLinkUrl}" style="background-color: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                Masuk ke TIKUM
              </a>
            </div>
            <p style="font-size: 13px; color: #9CA3AF; line-height: 1.5; margin: 24px 0 0;">
              Jika Anda tidak meminta link ini, Anda dapat mengabaikan email ini dengan aman. Akun Anda tetap terlindungi.
            </p>
          </div>
        `,
        text: `Masuk ke TIKUM: Buka link berikut untuk masuk ke akun Anda: ${magicLinkUrl}. Link ini berlaku selama 15 menit dan hanya dapat digunakan 1 kali.`
      });
    } catch (sendErr) {
      // Non-blocking: failure to send does not break generic response
    }

    // Generic response preventing email enumeration
    const result = {
      success: true,
      message: 'Jika email Anda terdaftar atau valid, tautan akses telah dikirimkan ke kotak masuk Anda.',
      email: normEmail
    };

    // In test environment only: expose raw token in response so automated test runner can verify the flow
    if (process.env.NODE_ENV === 'test') {
      result._test_token = rawToken;
    }

    return result;
  }

  /**
   * Verify Magic Link Token
   * Single-use validation, expiry check, replay protection, session creation.
   */
  static async verifyMagicLink({ token, ip = '127.0.0.1', userAgent = null }) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      const err = new Error('Token verifikasi tidak valid atau tidak disediakan');
      err.code = 'INVALID_TOKEN';
      err.status = 401;
      throw err;
    }

    const cleanToken = token.trim();
    // Validate token format: must be 64-character hex string
    if (!/^[a-f0-9]{64}$/i.test(cleanToken)) {
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
      const err = new Error('Token verifikasi tidak ditemukan atau tidak valid');
      err.code = 'INVALID_TOKEN';
      err.status = 401;
      throw err;
    }

    // Replay protection: check if already used
    if (record.used) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_REPLAY_ATTEMPT', 'SYSTEM', {
        token_id: record.id,
        ip
      });
      const err = new Error('Token verifikasi ini sudah pernah digunakan (replay protection)');
      err.code = 'TOKEN_ALREADY_USED';
      err.status = 401;
      throw err;
    }

    // Expiration check
    const now = new Date();
    if (new Date(record.expires_at) <= now) {
      await recordAuditLog('AUTH', 'ANONYMOUS', 'MAGIC_LINK_EXPIRED_ATTEMPT', 'SYSTEM', {
        token_id: record.id,
        ip
      });
      const err = new Error('Token verifikasi telah kedaluwarsa. Silakan minta tautan baru.');
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
      // Self-signup: create new user with default 'buyer' role (NEVER admin)
      user = {
        id: `user-${uuidv4().substring(0, 8)}`,
        name: record.email.split('@')[0],
        email: record.email,
        phone: null,
        role: 'buyer', // Default safe role
        password: null, // Passwordless account
        auth_provider: 'MAGIC_LINK',
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };
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

    // Audit log
    await recordAuditLog('AUTH', user.id, 'AUTHENTICATION_SUCCESS', 'MAGIC_LINK', {
      user_id: user.id,
      role: user.role,
      ip
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      session,
      redirectUrl: record.redirect_url || '/'
    };
  }
}

module.exports = {
  MagicLinkService,
  TOKEN_EXPIRY_MS,
  IP_RATE_LIMIT_MAX,
  EMAIL_RATE_LIMIT_MAX
};
