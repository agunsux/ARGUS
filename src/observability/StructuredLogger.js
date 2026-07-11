/**
 * StructuredLogger — Phase 20 Observability Platform
 * 
 * Standardized JSON structured logging for production ingest pipelines.
 */
class StructuredLogger {
  constructor(serviceName = 'ARGUS') {
    this.serviceName = serviceName;
    this.logs = [];
  }

  log(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      level,
      message,
      traceId: context.traceId || null,
      correlationId: context.correlationId || null,
      metadata: context.metadata || {}
    };

    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }

    // Print to stdout in production, suppress during unit tests
    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify(entry));
    }

    return entry;
  }

  info(msg, ctx) { return this.log('INFO', msg, ctx); }
  warn(msg, ctx) { return this.log('WARN', msg, ctx); }
  error(msg, ctx) { return this.log('ERROR', msg, ctx); }
  debug(msg, ctx) { return this.log('DEBUG', msg, ctx); }
}

const logger = new StructuredLogger();

module.exports = {
  StructuredLogger,
  logger
};
