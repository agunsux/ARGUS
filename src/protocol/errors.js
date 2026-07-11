/**
 * Error Hierarchy — Phase 3 Operational Foundation
 *
 * Every error includes:
 * - code: machine-readable error code
 * - message: human-readable description
 * - metadata: additional context
 * - traceId: trace identifier for correlation
 * - timestamp: when the error occurred
 */

class ProtocolError extends Error {
  constructor({ code, message, metadata = {}, traceId, cause } = {}) {
    super(message || 'Protocol error');
    this.name = this.constructor.name;
    this.code = code || 'PROTOCOL_ERROR';
    this.metadata = metadata;
    this.traceId = traceId || null;
    this.timestamp = new Date().toISOString();
    this.cause = cause || null;

    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      metadata: this.metadata,
      traceId: this.traceId,
      timestamp: this.timestamp,
      cause: this.cause ? (this.cause.message || this.cause) : null
    };
  }
}

class ValidationError extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'VALIDATION_ERROR', message: message || 'Validation failed', metadata, traceId, cause });
  }
}

class InvariantError extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'INVARIANT_VIOLATION', message: message || 'Invariant violation', metadata, traceId, cause });
  }
}

class AuthorizationError extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'AUTHORIZATION_ERROR', message: message || 'Not authorized', metadata, traceId, cause });
  }
}

class RuleViolation extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'RULE_VIOLATION', message: message || 'Rule violation', metadata, traceId, cause });
  }
}

class ReplayError extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'REPLAY_ERROR', message: message || 'Replay failed', metadata, traceId, cause });
  }
}

class RecoveryError extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'RECOVERY_ERROR', message: message || 'Recovery failed', metadata, traceId, cause });
  }
}

class ProjectionError extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'PROJECTION_ERROR', message: message || 'Projection failed', metadata, traceId, cause });
  }
}

class SnapshotError extends ProtocolError {
  constructor({ message, metadata, traceId, cause } = {}) {
    super({ code: 'SNAPSHOT_ERROR', message: message || 'Snapshot operation failed', metadata, traceId, cause });
  }
}

module.exports = {
  ProtocolError,
  ValidationError,
  InvariantError,
  AuthorizationError,
  RuleViolation,
  ReplayError,
  RecoveryError,
  ProjectionError,
  SnapshotError
};