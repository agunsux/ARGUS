/**
 * TIKUM / ARGUS Security Sanitizer
 * 
 * Input defensive barrier for external / untrusted event payloads.
 * Protects against:
 * - Stored XSS (<script>, <iframe>, event handlers)
 * - SSRF (private IPs, localhost, AWS metadata 169.254.169.254, internal subnets)
 * - Protocol smuggling (javascript:, data:, file:)
 * - Prompt injection & executable patterns
 * - Oversized payloads & deeply nested JSON bombs
 */

const crypto = require('crypto');

const MAX_STRING_LENGTH = 10000;
const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB
const MAX_NESTING_DEPTH = 10;

// Private / Link-Local / Loopback IP and Hostname patterns
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // Link-local & cloud metadata service
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
  /\.internal$/i,
  /\.local$/i
];

class SecuritySanitizer {
  /**
   * Sanitizes plain text input:
   * - Strips HTML tags
   * - Neutralizes script tags and inline event handlers
   * - Truncates excessively long strings
   * - Removes non-printable control characters
   */
  static sanitizeString(input, maxLength = MAX_STRING_LENGTH) {
    if (input === null || input === undefined) return '';
    if (typeof input !== 'string') input = String(input);

    let cleaned = input;

    // 1. Remove HTML tags and comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    // 2. Remove inline event handlers (e.g., onload=, onclick=)
    cleaned = cleaned.replace(/\bon\w+\s*=/gi, '');

    // 3. Remove prompt injection triggers and control directives
    cleaned = cleaned.replace(/\b(ignore\s+previous\s+instructions|system\s+prompt|assistant\s*:|developer\s+mode)\b/gi, '[FILTERED]');

    // 4. Remove non-printable control characters (keep standard newlines and whitespace)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 5. Bounds check
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
    }

    return cleaned.trim();
  }

  /**
   * Validates and sanitizes external URLs to prevent SSRF and protocol hijacking.
   * Returns sanitized URL or null if invalid / malicious.
   */
  static sanitizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();

    try {
      const parsed = new URL(trimmed);

      // Only allow http: and https: protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }

      // Check against SSRF blocked hosts
      const hostname = parsed.hostname.toLowerCase();
      for (const pattern of BLOCKED_HOST_PATTERNS) {
        if (pattern.test(hostname)) {
          return null;
        }
      }

      // Block credentials embedded in URL (e.g., https://user:pass@evil.com)
      if (parsed.username || parsed.password) {
        return null;
      }

      return parsed.toString();
    } catch (e) {
      return null;
    }
  }

  /**
   * Recursively traverses and sanitizes an entire payload object or array.
   * Enforces nesting depth limits and size bounds.
   */
  static sanitizePayload(payload, currentDepth = 0) {
    if (currentDepth > MAX_NESTING_DEPTH) {
      throw new Error(`Payload exceeds maximum allowed nesting depth of ${MAX_NESTING_DEPTH}`);
    }

    if (payload === null || payload === undefined) {
      return null;
    }

    if (typeof payload === 'string') {
      return this.sanitizeString(payload);
    }

    if (typeof payload === 'number' || typeof payload === 'boolean') {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map(item => this.sanitizePayload(item, currentDepth + 1));
    }

    if (typeof payload === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(payload)) {
        // Sanitize object keys against prototype pollution and script injection
        const cleanKey = this.sanitizeString(key, 128);
        if (cleanKey === '__proto__' || cleanKey === 'constructor' || cleanKey === 'prototype') {
          continue; // Block prototype pollution
        }

        // Apply URL sanitizer specifically to URL-like fields
        if (cleanKey.toLowerCase().includes('url') || cleanKey.toLowerCase().includes('link')) {
          sanitized[cleanKey] = typeof value === 'string' ? this.sanitizeUrl(value) : null;
        } else {
          sanitized[cleanKey] = this.sanitizePayload(value, currentDepth + 1);
        }
      }
      return sanitized;
    }

    return null;
  }

  /**
   * Computes deterministic SHA-256 content fingerprint of normalized payload.
   */
  static computeFingerprint(data) {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
}

module.exports = {
  SecuritySanitizer,
  MAX_STRING_LENGTH,
  MAX_PAYLOAD_BYTES,
  MAX_NESTING_DEPTH
};
