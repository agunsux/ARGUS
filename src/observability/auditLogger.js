/**
 * Audit Logger — Phase 3 Operational Foundation
 *
 * Separated from Domain Events.
 * Domain Events answer: "What happened?"
 * Audit Log answers: "Who did what, when, from where, with what result?"
 *
 * Stores: actor, action, resource, traceId, correlationId, causationId,
 *         ip, device, timestamp, result
 */
const { v4: uuidv4 } = require('uuid');
const { clock } = require('./clock');

class AuditLogger {
  constructor(options = {}) {
    this._logs = [];
    this._maxEntries = options.maxEntries || 10000;
  }

  /**
   * Records an audit entry.
   */
  log({ actor, action, resource, resourceId, result, traceId, correlationId, causationId, ip, device, metadata = {}, durationMs } = {}) {
    const entry = {
      id: `audit-${uuidv4()}`,
      timestamp: clock.now(),
      actor: actor || 'system',
      action,
      resource: resource || 'unknown',
      resourceId: resourceId || null,
      result: result || 'SUCCESS',
      traceId: traceId || null,
      correlationId: correlationId || null,
      causationId: causationId || null,
      ip: ip || null,
      device: device || null,
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
  commandExecuted({ command, trace, result, durationMs }) {
    return this.log({
      actor: command.actor,
      action: `COMMAND:${command.type}`,
      resource: 'transaction',
      resourceId: command.transactionId,
      result: 'SUCCESS',
      traceId: trace ? trace.traceId : (command.metadata?.traceId),
      correlationId: trace ? trace.correlationId : (command.metadata?.correlationId),
      causationId: trace ? trace.causationId : null,
      ip: command.metadata?.ip || null,
      device: command.metadata?.device || null,
      durationMs,
      metadata: {
        commandType: command.type,
        idempotencyKey: command.idempotencyKey,
        aggregateVersion: result?.aggregateVersion,
        eventId: result?.eventId
      }
    });
  }

  /**
   * Logs a failed command execution.
   */
  commandFailed({ command, trace, error, code, durationMs }) {
    return this.log({
      actor: command.actor,
      action: `COMMAND:${command.type}`,
      resource: 'transaction',
      resourceId: command.transactionId,
      result: 'FAILURE',
      traceId: trace ? trace.traceId : (command.metadata?.traceId),
      correlationId: trace ? trace.correlationId : (command.metadata?.correlationId),
      causationId: trace ? trace.causationId : null,
      ip: command.metadata?.ip || null,
      device: command.metadata?.device || null,
      durationMs,
      metadata: { error, code, commandType: command.type, idempotencyKey: command.idempotencyKey }
    });
  }

  /**
   * Logs a replay operation.
   */
  replayExecuted({ transactionId, eventCount, trace, durationMs, result }) {
    return this.log({
      actor: 'system',
      action: 'REPLAY:EXECUTED',
      resource: 'transaction',
      resourceId: transactionId,
      result: result || 'SUCCESS',
      traceId: trace ? trace.traceId : null,
      correlationId: trace ? trace.correlationId : null,
      causationId: trace ? trace.causationId : null,
      durationMs,
      metadata: { eventCount }
    });
  }

  /**
   * Logs a recovery operation.
   */
  recoveryExecuted({ transactionId, action, trace, durationMs, result }) {
    return this.log({
      actor: 'system',
      action: `RECOVERY:${action}`,
      resource: 'transaction',
      resourceId: transactionId,
      result: result || 'SUCCESS',
      traceId: trace ? trace.traceId : null,
      correlationId: trace ? trace.correlationId : null,
      causationId: trace ? trace.causationId : null,
      durationMs,
      metadata: { recoveryAction: action }
    });
  }

  /**
   * Logs a projection rebuild.
   */
  projectionRebuilt({ projectionName, eventCount, trace, durationMs, result }) {
    return this.log({
      actor: 'system',
      action: 'PROJECTION:REBUILT',
      resource: 'projection',
      resourceId: projectionName,
      result: result || 'SUCCESS',
      traceId: trace ? trace.traceId : null,
      correlationId: trace ? trace.correlationId : null,
      causationId: trace ? trace.causationId : null,
      durationMs,
      metadata: { eventCount, projectionName }
    });
  }

  /**
   * Returns all audit log entries with optional filters.
   */
  getLogs(filters = {}) {
    let entries = [...this._logs];
    if (filters.actor) entries = entries.filter(e => e.actor === filters.actor);
    if (filters.resourceId) entries = entries.filter(e => e.resourceId === filters.resourceId);
    if (filters.action) entries = entries.filter(e => e.action === filters.action);
    if (filters.result) entries = entries.filter(e => e.result === filters.result);
    if (filters.traceId) entries = entries.filter(e => e.traceId === filters.traceId);
    if (filters.limit) entries = entries.slice(-filters.limit);
    return entries;
  }

  /**
   * Returns the count of audit entries.
   */
  count() {
    return this._logs.length;
  }

  /**
   * Clears audit logs (for testing/isolation).
   */
  clear() {
    this._logs = [];
  }
}

const auditLogger = new AuditLogger();

module.exports = { AuditLogger, auditLogger };