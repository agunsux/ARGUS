/**
 * Audit Logger — Wave 2.5 Observability
 * 
 * Separated from Domain Events.
 * Domain Events answer: "What happened?"
 * Audit Log answers: "Who did what, when, from where, with what result?"
 * 
 * This is for operational investigation without mixing audit data into the domain model.
 */
const { v4: uuidv4 } = require('uuid');
const { clock } = require('./clock');

class AuditLogger {
  constructor() {
    this._logs = [];
    this._maxEntries = 10000;
  }

  /**
   * Records an audit entry.
   */
  log({ actor, action, resource, resourceId, result, traceId, correlationId, metadata = {}, durationMs } = {}) {
    const entry = {
      id: `audit-${uuidv4()}`,
      timestamp: clock.now(),
      actor: actor || 'system',
      action,
      resource,
      resourceId,
      result: result || 'SUCCESS',
      traceId: traceId || null,
      correlationId: correlationId || null,
      durationMs: durationMs || null,
      metadata
    };
    this._logs.push(entry);
    if (this._logs.length > this._maxEntries) {
      this._logs.shift();
    }
    return entry;
  }

  /**
   * Logs a successful command execution.
   */
  commandExecuted({ command, result, durationMs }) {
    return this.log({
      actor: command.actor,
      action: `COMMAND:${command.type}`,
      resource: 'transaction',
      resourceId: command.transactionId,
      result: 'SUCCESS',
      traceId: command.metadata?.traceId,
      correlationId: command.metadata?.correlationId,
      durationMs,
      metadata: { commandType: command.type, idempotencyKey: command.idempotencyKey, aggregateVersion: result?.aggregateVersion }
    });
  }

  /**
   * Logs a failed command execution.
   */
  commandFailed({ command, error, code, durationMs }) {
    return this.log({
      actor: command.actor,
      action: `COMMAND:${command.type}`,
      resource: 'transaction',
      resourceId: command.transactionId,
      result: 'FAILURE',
      traceId: command.metadata?.traceId,
      durationMs,
      metadata: { error, code, commandType: command.type, idempotencyKey: command.idempotencyKey }
    });
  }

  /**
   * Returns all audit log entries.
   */
  getLogs(filters = {}) {
    let entries = [...this._logs];
    if (filters.actor) entries = entries.filter(e => e.actor === filters.actor);
    if (filters.resourceId) entries = entries.filter(e => e.resourceId === filters.resourceId);
    if (filters.action) entries = entries.filter(e => e.action === filters.action);
    if (filters.result) entries = entries.filter(e => e.result === filters.result);
    if (filters.limit) entries = entries.slice(-filters.limit);
    return entries;
  }

  /**
   * Clears audit logs (for testing).
   */
  clear() {
    this._logs = [];
  }
}

const auditLogger = new AuditLogger();

module.exports = { AuditLogger, auditLogger };
