const { metrics } = require('./MetricsCollector');

/**
 * AuditMetrics — Phase 20 Observability Platform
 * 
 * Intercepts audit log events and exposes corresponding telemetry counters.
 */
class AuditMetrics {
  /**
   * Tracks an audit log entry to increment telemetry counters.
   */
  static trackLog(entry) {
    if (!entry || !entry.action) return;

    metrics.increment('audit_logs_total');
    
    const actionKey = entry.action.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    metrics.increment(`audit_action_${actionKey}`);

    if (entry.result === 'FAILURE') {
      metrics.increment('audit_failures_total');
    }
  }
}

module.exports = AuditMetrics;
