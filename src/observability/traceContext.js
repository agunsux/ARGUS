/**
 * Trace Context — Wave 2.5 Observability
 * 
 * Every command carries a traceId, correlationId, and causationId
 * so the full execution chain can be traced end-to-end.
 * 
 * HTTP → Command → Protocol → Event → Projection
 */
const { v4: uuidv4 } = require('uuid');

class TraceContext {
  constructor({ traceId, correlationId, causationId, parentId } = {}) {
    this.traceId = traceId || `trace-${uuidv4()}`;
    this.correlationId = correlationId || `corr-${uuidv4()}`;
    this.causationId = causationId || null;
    this.parentId = parentId || null;
    this.createdAt = new Date().toISOString();
  }

  /**
   * Creates a child trace context for a new operation in the same chain.
   */
  child(operationName) {
    return new TraceContext({
      traceId: this.traceId,
      correlationId: this.correlationId,
      causationId: this.causationId || this.traceId,
      parentId: this.traceId
    });
  }

  /**
   * Creates a fresh trace context (for new incoming requests).
   */
  static fresh() {
    return new TraceContext();
  }

  /**
   * Returns trace headers for propagation.
   */
  toHeaders() {
    return {
      'x-trace-id': this.traceId,
      'x-correlation-id': this.correlationId,
      'x-causation-id': this.causationId || ''
    };
  }

  /**
   * Creates a TraceContext from HTTP headers.
   */
  static fromHeaders(headers) {
    return new TraceContext({
      traceId: headers['x-trace-id'],
      correlationId: headers['x-correlation-id'],
      causationId: headers['x-causation-id']
    });
  }
}

module.exports = { TraceContext };
