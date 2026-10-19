/**
 * TIKUM — Lightweight Privacy-Preserving Egress & Response Observability Middleware
 *
 * Tracks outbound HTTP payload byte counts per route without logging sensitive
 * headers, authorization tokens, cookies, or user PII.
 */

class EgressMetrics {
  static totalBytesSent = 0;
  static requestCounts = 0;
  static routeBytes = new Map(); // route -> bytes

  static record(route, bytes) {
    this.totalBytesSent += bytes;
    this.requestCounts++;
    const current = this.routeBytes.get(route) || 0;
    this.routeBytes.set(route, current + bytes);
  }

  static getSummary() {
    return {
      total_requests: this.requestCounts,
      total_bytes_sent: this.totalBytesSent,
      total_kb_sent: Math.round(this.totalBytesSent / 1024 * 10) / 10,
      total_mb_sent: Math.round(this.totalBytesSent / (1024 * 1024) * 100) / 100,
      top_routes_by_bytes: Array.from(this.routeBytes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([route, bytes]) => ({
          route,
          bytes,
          kb: Math.round(bytes / 1024 * 10) / 10
        }))
    };
  }

  static reset() {
    this.totalBytesSent = 0;
    this.requestCounts = 0;
    this.routeBytes.clear();
  }
}

function egressTrackerMiddleware(req, res, next) {
  let bytesWritten = 0;
  const originalWrite = res.write;
  const originalEnd = res.end;

  res.write = function (chunk, ...args) {
    if (chunk) {
      bytesWritten += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    return originalWrite.call(res, chunk, ...args);
  };

  res.end = function (chunk, ...args) {
    if (chunk) {
      bytesWritten += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    const cleanRoute = req.baseUrl || req.path || req.url || 'unknown';
    EgressMetrics.record(cleanRoute, bytesWritten);

    return originalEnd.call(res, chunk, ...args);
  };

  next();
}

module.exports = {
  egressTrackerMiddleware,
  EgressMetrics
};
