/**
 * TIKUM — Official Purelymail SMTP Email Provider Adapter
 *
 * Implements standard transactional email delivery via Purelymail SMTP using Nodemailer.
 * Official Purelymail Settings:
 *   Host: smtp.purelymail.com
 *   Port: 465
 *   Encryption: SSL/TLS (secure: true)
 *   Username: admin@tikum.app (or process.env.SMTP_USER / EMAIL_USER)
 *   Password: process.env.SMTP_PASS / EMAIL_PASS
 *   From: admin@tikum.app (or process.env.EMAIL_FROM)
 *
 * Invariants:
 * 1. Zero credential leakage: Password is never printed, logged, or returned in error details.
 * 2. In NODE_ENV === 'test', prevents unintended outbound network calls unless explicitly authorized.
 * 3. Fail-Closed in production if required SMTP credentials are missing.
 * 4. Compatible with existing TIKUM email templates and fail-safe non-blocking persistence.
 */

const nodemailer = require('nodemailer');
const { EmailProvider } = require('./EmailProvider');

class SmtpEmailProvider extends EmailProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.host] - SMTP host (default: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.purelymail.com')
   * @param {number} [options.port] - SMTP port (default: process.env.SMTP_PORT || process.env.EMAIL_PORT || 465)
   * @param {boolean} [options.secure] - SSL/TLS (default: true for port 465)
   * @param {string} [options.user] - SMTP username (default: process.env.SMTP_USER || process.env.EMAIL_USER || 'admin@tikum.app')
   * @param {string} [options.pass] - SMTP password (default: process.env.SMTP_PASS || process.env.EMAIL_PASS)
   * @param {boolean} [options.allowLiveNetwork] - Explicit flag to allow real network dispatch in tests
   */
  constructor(options = {}) {
    super('purelymail');
    this.host = options.host || process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.purelymail.com';
    this.port = parseInt(options.port || process.env.SMTP_PORT || process.env.EMAIL_PORT || '465', 10);
    this.secure = options.secure !== undefined
      ? Boolean(options.secure)
      : (process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : (this.port === 465));
    this.user = options.user || process.env.SMTP_USER || process.env.EMAIL_USER || 'admin@tikum.app';
    this.pass = options.pass || process.env.SMTP_PASS || process.env.EMAIL_PASS || null;
    this.allowLiveNetwork = Boolean(options.allowLiveNetwork);
    this._transporter = null;
  }

  /**
   * Returns whether SMTP credentials are fully configured
   */
  isConfigured() {
    return Boolean(this.host && this.port && this.user && this.pass);
  }

  /**
   * Lazy initialization of Nodemailer transporter
   */
  getTransporter() {
    if (!this._transporter) {
      if (!this.pass) {
        throw new Error('Purelymail SMTP password is not configured (set SMTP_PASS or EMAIL_PASS)');
      }
      this._transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,
        auth: {
          user: this.user,
          pass: this.pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
      });
    }
    return this._transporter;
  }

  /**
   * Verifies SMTP server connectivity and authentication credentials
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async verifyConnection() {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Purelymail SMTP is not fully configured (missing SMTP_PASS or SMTP_USER)'
      };
    }
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return { success: true, message: 'Purelymail SMTP connection verified successfully' };
    } catch (err) {
      const safeMsg = this._sanitizeError(err.message);
      return { success: false, message: `SMTP verification failed: ${safeMsg}` };
    }
  }

  /**
   * Dispatches email via Purelymail SMTP
   * @param {Object} options
   */
  async send({ from, to, subject, html, text, replyTo, headers = {}, idempotencyKey }) {
    const isTest = process.env.NODE_ENV === 'test' && !this.allowLiveNetwork;

    // Guard 1: In automated test environment, mock response unless live network is explicitly allowed
    if (isTest) {
      return {
        success: true,
        status: 'MOCKED',
        provider: 'purelymail',
        id: `mock-smtp-${Date.now()}`,
        isMock: true,
        delivered: false,
        to,
        from,
        subject,
        idempotencyKey
      };
    }

    // Guard 2: Missing password in production fails closed
    if (!this.pass) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        code: 'SMTP_CREDENTIALS_MISSING',
        provider: 'purelymail',
        error: 'Purelymail SMTP password is missing (set SMTP_PASS or EMAIL_PASS in environment)',
        delivered: false,
        idempotencyKey
      };
    }

    try {
      const transporter = this.getTransporter();
      const mailOptions = {
        from: from || `TIKUM Admin <${this.user}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text,
        replyTo: replyTo || this.user,
        headers: {
          ...headers,
          ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {})
        }
      };

      const info = await transporter.sendMail(mailOptions);

      return {
        success: true,
        status: 'DELIVERED',
        provider: 'purelymail',
        id: info.messageId || `smtp-${Date.now()}`,
        delivered: true,
        to,
        from: mailOptions.from,
        subject,
        idempotencyKey
      };
    } catch (err) {
      const safeMsg = this._sanitizeError(err.message);
      return {
        success: false,
        status: 'FAILED',
        provider: 'purelymail',
        error: safeMsg,
        delivered: false,
        idempotencyKey
      };
    }
  }

  /**
   * Strips any inadvertent credentials or sensitive tokens from error messages
   */
  _sanitizeError(msg) {
    if (!msg || typeof msg !== 'string') return 'Unknown SMTP error';
    if (this.pass && typeof this.pass === 'string' && this.pass.length > 2) {
      msg = msg.split(this.pass).join('[REDACTED_SECRET]');
    }
    return msg.replace(/auth.*?:.*?@/gi, 'auth:[REDACTED]@');
  }
}

module.exports = {
  SmtpEmailProvider
};
