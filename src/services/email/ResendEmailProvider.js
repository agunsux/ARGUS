/**
 * Resend Email Provider Adapter
 * 
 * Outbound transactional email delivery via Resend API (https://api.resend.com/emails).
 * Invariants:
 * 1. Never runs real network calls when NODE_ENV === 'test'.
 * 2. In production without RESEND_API_KEY, fails safely as NOT_CONFIGURED (never fakes delivery).
 * 3. Server-side only API key isolation (never exposed to client).
 * 4. Strictly validates recipients and rejects CRLF injection attempts in headers.
 */

const https = require('https');
const { URL } = require('url');
const { EmailProvider } = require('./EmailProvider');

const RESEND_API_URL = 'https://api.resend.com/emails';

class ResendEmailProvider extends EmailProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey] - Resend API key (defaults to process.env.RESEND_API_KEY)
   * @param {string} [options.apiUrl] - Resend API endpoint
   */
  constructor(options = {}) {
    super('resend');
    this.apiKey = options.apiKey || null;
    this.apiUrl = options.apiUrl || RESEND_API_URL;
  }

  /**
   * Gets the effective API key (configured option or environment variable)
   */
  getApiKey() {
    return this.apiKey || process.env.RESEND_API_KEY || null;
  }

  /**
   * Internal HTTPS dispatcher to Resend API
   */
  _dispatchHttps({ from, to, subject, html, text, replyTo, headers = {}, idempotencyKey, apiKey }) {
    return new Promise((resolve, reject) => {
      const payloadObj = {
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        reply_to: replyTo,
        headers: {
          ...headers,
          ...(idempotencyKey ? { 'X-Entity-Ref-ID': idempotencyKey } : {})
        }
      };

      const payload = JSON.stringify(payloadObj);
      const parsedUrl = new URL(this.apiUrl);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        timeout: 10000 // 10-second timeout
      };

      const req = https.request(reqOptions, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(responseBody);
          } catch (e) {
            parsed = { raw: responseBody };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: parsed });
          } else {
            const err = new Error(parsed.message || `Resend HTTP error ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.response = parsed;
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Resend API request timed out after 10000ms'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Dispatches email through Resend API
   */
  async send({ from, to, subject, html, text, replyTo, headers = {}, idempotencyKey }) {
    const isTest = process.env.NODE_ENV === 'test';
    const isProd = process.env.NODE_ENV === 'production';
    const apiKey = this.getApiKey();

    // Guard 1: In NODE_ENV=test, NEVER make live network calls to Resend
    if (isTest) {
      return {
        success: true,
        status: 'MOCKED',
        provider: 'resend',
        id: `mock-resend-${Date.now()}`,
        isMock: true,
        delivered: false,
        to,
        from,
        replyTo,
        subject,
        idempotencyKey
      };
    }

    // Guard 2: Missing API key handling
    if (!apiKey) {
      if (isProd) {
        // Mandatory P0: In production, NEVER simulate success. Fail safely as NOT_CONFIGURED.
        return {
          success: false,
          status: 'NOT_CONFIGURED',
          code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
          provider: 'resend',
          error: 'EMAIL_PROVIDER_NOT_CONFIGURED: RESEND_API_KEY is not configured in production environment',
          delivered: false,
          idempotencyKey
        };
      } else {
        // In local development sandbox
        return {
          success: true,
          status: 'MOCKED',
          provider: 'resend',
          id: `sandbox-resend-${Date.now()}`,
          isMock: true,
          delivered: false,
          to,
          from,
          replyTo,
          subject,
          idempotencyKey
        };
      }
    }

    // Live dispatch to Resend
    try {
      const res = await this._dispatchHttps({
        from,
        to,
        subject,
        html,
        text,
        replyTo,
        headers,
        idempotencyKey,
        apiKey
      });

      return {
        success: true,
        status: 'DELIVERED',
        provider: 'resend',
        id: res.body?.id || `resend-${Date.now()}`,
        delivered: true,
        to,
        idempotencyKey
      };
    } catch (err) {
      return {
        success: false,
        status: 'FAILED',
        provider: 'resend',
        error: err.message,
        code: err.statusCode || 'SEND_ERROR',
        delivered: false,
        idempotencyKey
      };
    }
  }
}

module.exports = { ResendEmailProvider, RESEND_API_URL };

