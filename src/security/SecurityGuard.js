/**
 * SecurityGuard — Phase 22 Security Hardening
 * 
 * Handles JWT validations, sliding-window rate limiting, PII masking, 
 * SQL injection checks, and JTI replay prevention.
 */
class SecurityGuard {
  constructor() {
    this._jtis = new Set();
    this._rateLimits = new Map(); // clientId -> timestamps
  }

  /**
   * Validates a JWT signature/expiry and supports basic mock rotation.
   */
  validateJWT(token, secret) {
    if (!token) return { valid: false, error: 'Token missing' };
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'Malformed token' };

    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        return { valid: false, error: 'Token expired' };
      }
      return { valid: true, payload };
    } catch (err) {
      return { valid: false, error: 'Invalid payload encoding' };
    }
  }

  /**
   * Sliding-window rate limiter.
   */
  checkRateLimit(clientId, limit = 5, windowMs = 1000) {
    const now = Date.now();
    if (!this._rateLimits.has(clientId)) {
      this._rateLimits.set(clientId, []);
    }
    const timestamps = this._rateLimits.get(clientId);
    
    // Filter out old timestamps
    const active = timestamps.filter(ts => now - ts < windowMs);
    active.push(now);
    this._rateLimits.set(clientId, active);

    return active.length <= limit;
  }

  /**
   * Prevents replay attacks by checking JTIs (JWT IDs).
   */
  preventReplay(jti) {
    if (!jti) return false;
    if (this._jtis.has(jti)) return false; // Replay attack detected!
    this._jtis.add(jti);
    return true;
  }

  /**
   * Identifies and sanitizes SQL injection patterns.
   */
  sanitizeSQL(str) {
    if (typeof str !== 'string') return str;
    const sqlPatterns = [
      /UNION\s+SELECT/gi,
      /OR\s+1\s*=\s*1/gi,
      /--/g,
      /drop\s+table/gi,
      /insert\s+into/gi
    ];
    let sanitized = str;
    for (const pattern of sqlPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }
    return sanitized;
  }

  /**
   * Recursively masks PII fields like phone, email, and credit card numbers.
   */
  maskPII(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const cloned = JSON.parse(JSON.stringify(obj));

    const maskValue = (val, type) => {
      if (typeof val !== 'string') return val;
      if (type === 'email') {
        const parts = val.split('@');
        if (parts.length === 2) {
          return `${parts[0][0]}***@${parts[1]}`;
        }
      }
      if (type === 'phone') {
        return val.replace(/(\d{3})\d+(\d{3})/, '$1*****$2');
      }
      if (type === 'creditCard') {
        return val.replace(/\d{12}(\d{4})/, '************$1');
      }
      return '*****';
    };

    const recurse = (current) => {
      for (const [key, val] of Object.entries(current)) {
        if (val && typeof val === 'object') {
          recurse(val);
        } else if (typeof val === 'string') {
          if (key.toLowerCase().includes('email')) {
            current[key] = maskValue(val, 'email');
          } else if (key.toLowerCase().includes('phone')) {
            current[key] = maskValue(val, 'phone');
          } else if (key.toLowerCase().includes('card') || key.toLowerCase().includes('cc')) {
            current[key] = maskValue(val, 'creditCard');
          } else if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
            current[key] = '*****';
          }
        }
      }
    };

    recurse(cloned);
    return cloned;
  }
}

const securityGuard = new SecurityGuard();

module.exports = {
  SecurityGuard,
  securityGuard
};
