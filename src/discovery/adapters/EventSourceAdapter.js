/**
 * TIKUM / ARGUS Event Source Adapter (Base Contract)
 * 
 * Defines standard contract for all external event source adapters:
 * - discover(): searches or queries for new event candidates
 * - fetch(params): retrieves raw source payload with timeout, rate limit & retry
 * - parse(rawPayload): extracts structured factual event claims
 * - normalize(parsedRecord): maps claims into standard schema
 * - healthCheck(): verifies upstream connectivity and permission status
 * 
 * Features:
 * - Request timeout via AbortController
 * - Exponential backoff with randomized jitter
 * - Circuit breaker protection
 * - Safe fail-closed fault isolation (one broken source never crashes pipeline)
 */

const { sourceRegistry } = require('../SourceRegistry');
const { SecuritySanitizer } = require('../security/SecuritySanitizer');

class EventSourceAdapter {
  constructor(sourceId, options = {}) {
    this.sourceId = sourceId;
    this.timeoutMs = options.timeoutMs || 5000;
    this.maxRetries = options.maxRetries || 3;
    this.baseBackoffMs = options.baseBackoffMs || 1000;
    this.lastRequestTimestamp = 0;
    this.minRequestIntervalMs = options.minRequestIntervalMs || 1000; // rate limit: 1 req/sec by default
  }

  getSourceMetadata() {
    return sourceRegistry.getSource(this.sourceId);
  }

  /**
   * Rate-limiting enforcement (token / interval bucket).
   */
  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTimestamp;
    if (elapsed < this.minRequestIntervalMs) {
      const waitTime = this.minRequestIntervalMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTimestamp = Date.now();
  }

  /**
   * Executes fetch with timeout, exponential backoff, and circuit breaker.
   */
  async fetchWithRetry(fetchFn) {
    if (!sourceRegistry.isSourcePermittedForIngestion(this.sourceId)) {
      const src = this.getSourceMetadata();
      const reason = src ? (src.circuit_breaker_status === 'OPEN' ? 'Circuit breaker is OPEN' : `Permission status is ${src.permission_status}`) : 'Source not registered';
      throw new Error(`Source ${this.sourceId} cannot be fetched: ${reason}`);
    }

    let attempt = 0;
    let lastError = null;

    while (attempt < this.maxRetries) {
      attempt++;
      await this.throttle();

      const startTime = Date.now();
      try {
        const result = await Promise.race([
          fetchFn(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Fetch timed out after ${this.timeoutMs}ms`)), this.timeoutMs)
          )
        ]);

        const latencyMs = Date.now() - startTime;
        sourceRegistry.updateHealth(this.sourceId, null, { success: true, latencyMs });
        return result;
      } catch (err) {
        lastError = err;
        const latencyMs = Date.now() - startTime;
        const isRateLimited = err.status === 429 || /429|rate\s*limit/i.test(err.message);
        const httpStatus = this.extractHttpStatus(err);

        sourceRegistry.updateHealth(this.sourceId, null, {
          success: false,
          latencyMs,
          isRateLimited,
          httpStatus
        });

        // If circuit tripped open, abort retries immediately
        const src = this.getSourceMetadata();
        if (src && src.circuit_breaker_status === 'OPEN') {
          break;
        }

        if (attempt < this.maxRetries) {
          // Exponential backoff with random jitter
          const backoff = (Math.pow(2, attempt) * this.baseBackoffMs) + Math.floor(Math.random() * 500);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    throw new Error(`Failed to fetch from ${this.sourceId} after ${attempt} attempts: ${lastError.message}`);
  }

  /**
   * Best-effort extraction of an upstream HTTP status from an adapter error.
   * Returns null when the failure was not HTTP-attributable (timeout, DNS, parse).
   */
  extractHttpStatus(err) {
    if (!err) return null;
    if (typeof err.status === 'number') return err.status;
    if (typeof err.statusCode === 'number') return err.statusCode;
    const match = /(?:HTTP|status(?:\s*code)?)\s*[:=]?\s*(\d{3})/i.exec(err.message || '');
    return match ? Number(match[1]) : null;
  }

  /**
   * Base discovery interface. Concrete adapters must override.
   */
  async discover(query = {}) {
    return [];
  }

  /**
   * Base fetch interface. Concrete adapters must override.
   */
  async fetch(identifier) {
    throw new Error(`fetch() not implemented for adapter ${this.constructor.name}`);
  }

  /**
   * Base parse interface. Sanitizes untrusted input and extracts structured fields.
   */
  parse(rawPayload) {
    const sanitized = SecuritySanitizer.sanitizePayload(rawPayload);
    return sanitized;
  }

  /**
   * Base normalize interface. Concrete adapters map fields to canonical model.
   */
  normalize(parsedRecord) {
    return parsedRecord;
  }

  /**
   * Health check verifying upstream availability.
   */
  async healthCheck() {
    const src = this.getSourceMetadata();
    if (!src) return { healthy: false, status: 'UNREGISTERED' };
    return {
      healthy: src.circuit_breaker_status !== 'OPEN' && src.active_status === 'ACTIVE',
      status: src.active_status,
      circuit_breaker: src.circuit_breaker_status,
      consecutive_failures: src.consecutive_failures,
      telemetry: src.telemetry
    };
  }
}

module.exports = {
  EventSourceAdapter
};
