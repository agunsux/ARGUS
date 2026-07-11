/**
 * Observability Module — Phase 3 Operational Foundation
 *
 * Central exports for the observability layer.
 */
const { AbstractClock, SystemClock, FixedClock, TestClock, clock } = require('./clock');
const { MetricsCollector, metrics } = require('./metrics');
const { AuditLogger, auditLogger } = require('./auditLogger');
const { TraceContext, TRACE_MODES } = require('./traceContext');
const { HealthMonitor, healthMonitor } = require('./health');

module.exports = {
  // Clock
  AbstractClock, SystemClock, FixedClock, TestClock, clock,
  // Metrics
  MetricsCollector, metrics,
  // Audit
  AuditLogger, auditLogger,
  // Trace
  TraceContext, TRACE_MODES,
  // Health
  HealthMonitor, healthMonitor
};