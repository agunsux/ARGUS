/**
 * Trace Context — Phase 3 Operational Foundation
 *
 * Every command automatically receives:
 * - traceId: identifies the entire execution chain
 * - correlationId: groups related operations
 * - causationId: links cause and effect
 * - parentTraceId: supports nested execution
 *
 * Supports replay mode and recovery mode.
 */

const { v4: uuidv4 } = require('uuid');

const TRACE_MODES = {
  NORMAL: 'NORMAL',
  REPLAY: 'REPLAY',
  RECOVERY: 'RECOVERY'
};

class TraceContext {
  constructor({ traceId, correlationId, causationId, parentTraceId, mode, metadata } = {}) {
    this.traceId = traceId || `trace-${uuidv4()}`;
    this.correlationId = correlationId || `corr-${uuidv4()}`;
    this.causationId = causationId || null;
    this.parentTraceId = parentTraceId || null;
    this.mode = mode || TRACE_MODES.NORMAL;
    this.metadata = metadata || {};
    this.createdAt = new Date().toISOString();
  }

  /**
   * Returns true if this trace is in replay mode.
   */
  get isReplay() {
    return this.mode === TRACE_MODES.REPLAY;
  }

  /**
   * Returns true if this trace is in recovery mode.
   */
  get isRecovery() {
    return this.mode === TRACE_MODES.RECOVERY;
  }

  /**
   * Creates a child trace context for a new operation in the same chain.
   * Preserves traceId and correlationId; sets parentTraceId to current traceId.
   */
  child(opts = {}) {
    return new TraceContext({
      traceId: this.traceId,
      correlationId: this.correlationId,
      causationId: opts.causationId || this.traceId,
      parentTraceId: this.traceId,
      mode: opts.mode || this.mode,
      metadata: { ...this.metadata, ...opts.metadata }
    });
  }

  /**
   * Creates a trace context for replay operations.
   */
  replayChild(sourceEventId) {
    return this.child({ causationId: sourceEventId, mode: TRACE_MODES.REPLAY });
  }

  /**
   * Creates a trace context for recovery operations.
   */
  recoveryChild(reason) {
    return this.child({ mode: TRACE_MODES.RECOVERY, metadata: { recoveryReason: reason } });
  }

  /**
   * Creates a fresh trace context (for new incoming commands).
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
      'x-causation-id': this.causationId || '',
      'x-parent-trace-id': this.parentTraceId || ''
    };
  }

  /**
   * Creates a TraceContext from HTTP headers.
   */
  static fromHeaders(headers) {
    return new TraceContext({
      traceId: headers['x-trace-id'],
      correlationId: headers['x-correlation-id'],
      causationId: headers['x-causation-id'],
      parentTraceId: headers['x-parent-trace-id']
    });
  }
}

module.exports = { TraceContext, TRACE_MODES };