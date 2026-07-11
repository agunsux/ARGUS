const { TraceContext } = require('./traceContext');

/**
 * TraceService — Phase 20 Observability Platform
 * 
 * Exposes utilities to instantiate, propagate, and extract trace context headers.
 */
class TraceService {
  /**
   * Creates a custom trace context.
   */
  static create(traceId, correlationId, causationId) {
    return new TraceContext({ traceId, correlationId, causationId });
  }

  /**
   * Generates a fresh trace context.
   */
  static fresh() {
    return TraceContext.fresh();
  }

  /**
   * Reconstructs a trace context from HTTP headers.
   */
  static fromHeaders(headers) {
    return TraceContext.fromHeaders(headers);
  }
}

module.exports = TraceService;
