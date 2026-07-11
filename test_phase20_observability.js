const assert = require('assert');
const { metrics } = require('./src/observability/MetricsCollector');
const { logger } = require('./src/observability/StructuredLogger');
const TraceService = require('./src/observability/TraceService');
const HealthService = require('./src/observability/HealthService');
const { alertManager } = require('./src/observability/AlertManager');
const OpenTelemetryExporter = require('./src/observability/OpenTelemetryExporter');
const PrometheusExporter = require('./src/observability/PrometheusExporter');
const AuditMetrics = require('./src/observability/AuditMetrics');

let p = 0, f = 0;
const t = (n, fn) => {
  try {
    fn();
    console.log('  \u2713', n);
    p++;
  } catch (e) {
    console.log('  \u2717', n, e.message);
    f++;
  }
};

console.log('\n=== PHASE 20 OBSERVABILITY PLATFORM TEST SUITE ===\n');

t('MetricsCollector compiles CPU, Memory, and custom latencies', () => {
  metrics.reset();
  metrics.increment('lookup_latency', 10);
  metrics.record('decision_latency', 15);
  
  const snap = metrics.snapshot();
  assert.ok(snap.cpu_usage_user_ms !== undefined);
  assert.ok(snap.memory_heap_used_mb > 0);
  assert.strictEqual(snap['counter:lookup_latency'], 10);
});

t('StructuredLogger outputs correct JSON structure log entries', () => {
  logger.logs = [];
  const entry = logger.info('Test log message', { traceId: 'trace-1', metadata: { source: 'test' } });
  assert.strictEqual(entry.level, 'INFO');
  assert.strictEqual(entry.message, 'Test log message');
  assert.strictEqual(entry.traceId, 'trace-1');
  assert.strictEqual(entry.metadata.source, 'test');
});

t('TraceService generates and maps propagation context', () => {
  const ctx = TraceService.create('trace-1', 'corr-1', 'caus-1');
  const headers = ctx.toHeaders();
  assert.strictEqual(headers['x-trace-id'], 'trace-1');
  assert.strictEqual(headers['x-correlation-id'], 'corr-1');
});

t('HealthService readiness/liveness checks return healthy', async () => {
  const ready = await HealthService.readiness();
  const live = await HealthService.liveness();
  assert.ok(ready.ready);
  assert.ok(live.alive);
});

t('AlertManager registers errors and fires alerts on threshold breach', () => {
  alertManager.clear();
  alertManager.recordError('Connection timeout 1');
  alertManager.recordError('Connection timeout 2');
  alertManager.recordError('Connection timeout 3');
  alertManager.recordError('Connection timeout 4');
  
  assert.strictEqual(alertManager.getAlerts().length, 0);

  alertManager.recordError('Connection timeout 5'); // Breaches threshold of 5
  assert.strictEqual(alertManager.getAlerts().length, 1);
  assert.ok(alertManager.getAlerts()[0].message.includes('threshold exceeded'));
});

t('OpenTelemetryExporter converts contexts to standard hex OTLP spans', () => {
  const ctx = TraceService.create('trace-abcdef1234567890', 'corr-1', 'caus-1');
  const span = OpenTelemetryExporter.exportSpan(ctx, 'EvaluateDecision', 25);
  
  assert.strictEqual(span.name, 'EvaluateDecision');
  assert.strictEqual(span.traceId.length, 32);
  assert.strictEqual(span.spanId.length, 16);
});

t('PrometheusExporter formats snapshots correctly', () => {
  const snap = {
    'counter:lookup_latency': 5,
    'decision_latency_count': 10
  };
  const promText = PrometheusExporter.export(snap);
  assert.ok(promText.includes('# HELP argus_counter_lookup_latency'));
  assert.ok(promText.includes('argus_counter_lookup_latency 5'));
  assert.ok(promText.includes('argus_decision_latency_count 10'));
});

t('AuditMetrics increments metrics counters on audit activity', () => {
  metrics.reset();
  AuditMetrics.trackLog({ action: 'COMMAND:EVALUATE', result: 'SUCCESS' });
  AuditMetrics.trackLog({ action: 'COMMAND:EVALUATE', result: 'FAILURE' });

  const snap = metrics.snapshot();
  assert.strictEqual(snap['counter:audit_logs_total'], 2);
  assert.strictEqual(snap['counter:audit_failures_total'], 1);
  assert.strictEqual(snap['counter:audit_action_command_evaluate'], 2);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
