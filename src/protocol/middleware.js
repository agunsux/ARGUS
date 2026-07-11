/**
 * Command Middleware Pipeline — Phase 3 Operational Foundation
 *
 * Protocol.execute() becomes:
 * Command → Middleware → Protocol → Aggregate → Event → Projection
 *
 * Middleware pipeline handles:
 * - Authentication
 * - Authorization
 * - Validation
 * - Rate limit
 * - Metrics
 * - Audit
 * - Tracing
 * - Idempotency
 */
const { TraceContext } = require('../observability/traceContext');
const { AuthorizationError, ValidationError } = require('./errors');

class MiddlewarePipeline {
  constructor() {
    this._middleware = [];
  }

  /**
   * Adds a middleware function to the pipeline.
   * Middleware signature: async (command, context, next) => result
   */
  use(fn) {
    if (typeof fn !== 'function') throw new Error('Middleware must be a function');
    this._middleware.push(fn);
  }

  /**
   * Runs the middleware pipeline for a command.
   */
  async run(command, context = {}) {
    let index = -1;
    const middleware = this._middleware;

    const next = async (i) => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;

      if (i >= middleware.length) {
        // All middleware passed — return context for execution
        return context;
      }

      return middleware[i](command, context, () => next(i + 1));
    };

    return next(0);
  }

  /**
   * Returns the number of registered middleware.
   */
  get count() {
    return this._middleware.length;
  }

  /**
   * Clears all middleware.
   */
  clear() {
    this._middleware = [];
  }
}

// ==================== Built-in Middleware ====================

/**
 * Creates trace context for every command.
 */
function tracingMiddleware(createTrace = () => TraceContext.fresh()) {
  return async (command, context, next) => {
    const trace = command.metadata?.traceContext
      ? TraceContext.fromHeaders(command.metadata.traceContext)
      : createTrace();

    context.trace = trace;
    return next();
  };
}

/**
 * Validates command structure.
 */
function validationMiddleware() {
  return async (command, context, next) => {
    const v = command.validate();
    if (!v.valid) {
      throw new ValidationError({
        message: v.errors.join('; '),
        metadata: { commandType: command.type, transactionId: command.transactionId },
        traceId: context.trace?.traceId
      });
    }
    return next();
  };
}

/**
 * Authorization middleware.
 * Checks if actor is allowed to execute the command.
 */
function authorizationMiddleware(checkFn) {
  return async (command, context, next) => {
    if (typeof checkFn === 'function') {
      const allowed = await checkFn(command, context);
      if (!allowed) {
        throw new AuthorizationError({
          message: `Actor '${command.actor}' not authorized for '${command.type}'`,
          metadata: { actor: command.actor, commandType: command.type },
          traceId: context.trace?.traceId
        });
      }
    }
    return next();
  };
}

/**
 * Rate limiting middleware.
 * Limits commands per actor within a time window.
 */
function rateLimitMiddleware(options = {}) {
  const { maxRequests = 100, windowMs = 60000 } = options;
  const counters = new Map();

  // Periodic cleanup
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, entries] of counters) {
      const valid = entries.filter(t => t > cutoff);
      if (valid.length === 0) counters.delete(key);
      else counters.set(key, valid);
    }
  }, windowMs * 2).unref();

  return async (command, context, next) => {
    const key = `${command.actor}:${command.type}`;
    const now = Date.now();

    if (!counters.has(key)) counters.set(key, []);
    const timestamps = counters.get(key);
    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= maxRequests) {
      context.rateLimited = true;
      throw new ValidationError({
        message: `Rate limit exceeded: ${maxRequests} per ${windowMs}ms`,
        metadata: { actor: command.actor, commandType: command.type, limit: maxRequests, windowMs },
        traceId: context.trace?.traceId
      });
    }

    recent.push(now);
    counters.set(key, recent);
    return next();
  };
}

/**
 * Metrics middleware.
 * Records command metrics automatically.
 */
function metricsMiddleware(metrics) {
  return async (command, context, next) => {
    const start = Date.now();
    metrics.recordCommandReceived(command.type);

    try {
      const result = await next();
      metrics.recordCommandSucceeded(command.type, Date.now() - start);
      return result;
    } catch (err) {
      metrics.recordCommandFailed(command.type);
      throw err;
    }
  };
}

/**
 * Audit middleware.
 * Logs every command execution.
 */
function auditMiddleware(auditLogger) {
  return async (command, context, next) => {
    const start = Date.now();

    try {
      const result = await next();
      const duration = Date.now() - start;
      auditLogger.commandExecuted({ command, trace: context.trace, result, durationMs: duration });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      auditLogger.commandFailed({
        command,
        trace: context.trace,
        error: err.message,
        code: err.code || 'UNKNOWN',
        durationMs: duration
      });
      throw err;
    }
  };
}

/**
 * Idempotency middleware.
 * Checks if a command with the same idempotencyKey was already executed.
 */
function idempotencyMiddleware(cache) {
  return async (command, context, next) => {
    const cached = cache ? cache.get(command.identity) : null;
    if (cached) {
      context.idempotent = true;
      context.cachedResult = cached;
      return context;
    }
    return next();
  };
}

module.exports = {
  MiddlewarePipeline,
  tracingMiddleware,
  validationMiddleware,
  authorizationMiddleware,
  rateLimitMiddleware,
  metricsMiddleware,
  auditMiddleware,
  idempotencyMiddleware
};