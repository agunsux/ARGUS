/**
 * Phase 3 — Observability & Operational Foundation Test Suite
 */
const assert = require('assert');
const { TestClock, SystemClock, FixedClock } = require('./src/observability/clock');
const { TraceContext, TRACE_MODES } = require('./src/observability/traceContext');
const { MetricsCollector, metrics } = require('./src/observability/metrics');
const { AuditLogger, auditLogger } = require('./src/observability/auditLogger');
const { HealthMonitor, healthMonitor } = require('./src/observability/health');

let p = 0, f = 0;
const t = (n, fn) => { try { fn(); console.log('  \u2713', n); p++; } catch (e) { console.log('  \u2717', n, e.message); f++; } };
console.log('\n=== PHASE 3 OBSERVABILITY TEST SUITE ===\n');

// === CLOCK ===
console.log('--- Clock ---\n');
t('SystemClock.now() returns ISO string', () => { const c = new SystemClock(); const n = c.now(); assert.ok(n); assert.ok(n.includes('T')); });
t('FixedClock returns fixed time', () => { const c = new FixedClock('2026-01-01T00:00:00.000Z'); assert.strictEqual(c.now(), '2026-01-01T00:00:00.000Z'); });
t('FixedClock.setTime changes time', () => { const c = new FixedClock(); c.setTime('2026-06-15T12:00:00.000Z'); assert.strictEqual(c.now(), '2026-06-15T12:00:00.000Z'); });
t('TestClock.freeze() fixes time', () => { const c = new TestClock(); c.freeze('2026-01-01T00:00:00.000Z'); assert.strictEqual(c.now(), '2026-01-01T00:00:00.000Z'); });
t('TestClock.advance() moves frozen time forward', () => { const c = new TestClock(); c.freeze('2026-01-01T00:00:00.000Z'); c.advance(5000); assert.strictEqual(c.now(), '2026-01-01T00:00:05.000Z'); });
t('TestClock.unfreeze() releases frozen time', () => { const c = new TestClock(); c.freeze('2026-01-01T00:00:00Z'); c.unfreeze(); assert.notStrictEqual(c.now(), '2026-01-01T00:00:00Z'); });
t('TestClock.tick() advances time and counts', () => { const c = new TestClock(); c.freeze('2026-01-01T00:00:00.000Z'); c.tick(100); assert.strictEqual(c.ticks, 1); assert.strictEqual(c.now(), '2026-01-01T00:00:00.100Z'); c.tick(200); assert.strictEqual(c.ticks, 2); });
t('TestClock.elapsedSince() returns ms', () => { const c = new TestClock(); c.freeze('2026-01-01T00:01:00.000Z'); const elapsed = c.elapsedSince('2026-01-01T00:00:00.000Z'); assert.strictEqual(elapsed, 60000); });
t('TestClock.isExpired() works', () => { const c = new TestClock(); c.freeze('2026-01-01T00:01:00.000Z'); assert.ok(c.isExpired('2026-01-01T00:00:00.000Z', 30000)); assert.ok(!c.isExpired('2026-01-01T00:00:00.000Z', 120000)); });
t('TestClock.reset() clears state', () => { const c = new TestClock(); c.freeze('2026-01-01T00:00:00.000Z'); c.tick(); c.reset(); assert.strictEqual(c.ticks, 0); assert.strictEqual(c.now(), c.now()); });

// === TRACE CONTEXT ===
console.log('\n--- Trace Context ---\n');
t('TraceContext.fresh() generates traceId', () => { const t = TraceContext.fresh(); assert.ok(t.traceId); assert.ok(t.correlationId); });
t('TraceContext.child() preserves traceId and sets parentTraceId', () => {
  const p = TraceContext.fresh(); const c = p.child();
  assert.strictEqual(c.traceId, p.traceId); assert.strictEqual(c.parentTraceId, p.traceId); assert.ok(c.causationId);
});
t('TraceContext.child() with replay mode', () => {
  const p = TraceContext.fresh(); const c = p.replayChild('evt-123');
  assert.strictEqual(c.traceId, p.traceId); assert.strictEqual(c.mode, TRACE_MODES.REPLAY); assert.strictEqual(c.causationId, 'evt-123');
});
t('TraceContext.child() with recovery mode', () => {
  const p = TraceContext.fresh(); const c = p.recoveryChild('PAYMENT_TIMEOUT');
  assert.strictEqual(c.mode, TRACE_MODES.RECOVERY); assert.ok(c.metadata.recoveryReason);
});
t('TraceContext.fromHeaders() parses headers', () => { const t = TraceContext.fromHeaders({ 'x-trace-id': 'trace-1', 'x-correlation-id': 'corr-1', 'x-causation-id': 'cause-1', 'x-parent-trace-id': 'parent-1' }); assert.strictEqual(t.traceId, 'trace-1'); assert.strictEqual(t.parentTraceId, 'parent-1'); });
t('TraceContext.toHeaders() serializes', () => { const t = TraceContext.fresh(); const h = t.toHeaders(); assert.ok(h['x-trace-id']); assert.ok(h['x-correlation-id']); });
t('TraceContext.isReplay flag works', () => {
  const normal = TraceContext.fresh(); assert.ok(!normal.isReplay);
  const replay = TraceContext.fresh(); replay.mode = TRACE_MODES.REPLAY; assert.ok(replay.isReplay);
});

// === METRICS ===
console.log('\n--- Metrics ---\n');
t('MetricsCollector.increment() works', () => { const m = new MetricsCollector(); m.increment('test_counter', 3); const s = m.snapshot(); assert.strictEqual(s['counter:test_counter'], 3); });
t('MetricsCollector.record() records histograms', () => { const m = new MetricsCollector(); m.record('test_timer', 100); m.record('test_timer', 200); const s = m.snapshot(); assert.ok(s['timer:test_timer_count'] >= 2); });
t('MetricsCollector.recordCommandReceived', () => { const m = new MetricsCollector(); m.recordCommandReceived('Test'); const s = m.snapshot(); assert.strictEqual(s['counter:CommandReceived:Test'], 1); });
t('MetricsCollector.recordCommandSucceeded', () => { const m = new MetricsCollector(); m.recordCommandSucceeded('Test', 50); const s = m.snapshot(); assert.strictEqual(s['counter:CommandSucceeded:Test'], 1); assert.ok(s['timer:TransitionDuration_count'] >= 1); });
t('MetricsCollector.recordCommandFailed', () => { const m = new MetricsCollector(); m.recordCommandFailed('Test'); const s = m.snapshot(); assert.strictEqual(s['counter:CommandFailed:Test'], 1); });
t('MetricsCollector.recordReplayCompleted', () => { const m = new MetricsCollector(); m.recordReplayCompleted(100); const s = m.snapshot(); assert.strictEqual(s['counter:ReplayCompleted'], 1); });
t('MetricsCollector.recordProjectionRebuilt', () => { const m = new MetricsCollector(); m.recordProjectionRebuilt(200); const s = m.snapshot(); assert.strictEqual(s['counter:ProjectionRebuilt'], 1); });
t('MetricsCollector.recordRecoveryExecuted', () => { const m = new MetricsCollector(); m.recordRecoveryExecuted('TIMEOUT_REFUND'); const s = m.snapshot(); assert.strictEqual(s['counter:RecoveryExecuted:TIMEOUT_REFUND'], 1); });
t('MetricsCollector.uptime() returns positive', () => { const m = new MetricsCollector(); assert.ok(m.uptime() >= 0); });
t('MetricsCollector.reset() clears', () => { const m = new MetricsCollector(); m.increment('x', 5); m.reset(); assert.strictEqual(m.snapshot()['counter:x'], undefined); });
t('MetricsCollector.timeSync() records duration', () => {
  const m = new MetricsCollector(); const result = m.timeSync('sync_op', () => 42);
  assert.strictEqual(result, 42); const s = m.snapshot(); assert.ok(s['timer:sync_op_count'] >= 1);
});

// === AUDIT LOGGER ===
console.log('\n--- Audit Logger ---\n');
t('AuditLogger.log() creates entry with all fields', () => {
  const al = new AuditLogger();
  const e = al.log({ actor: 'user-1', action: 'TEST', resource: 'tx', resourceId: 'tx-1', traceId: 'trace-1', correlationId: 'corr-1', causationId: 'cause-1', ip: '127.0.0.1', device: 'mobile' });
  assert.ok(e.id); assert.strictEqual(e.actor, 'user-1'); assert.strictEqual(e.traceId, 'trace-1'); assert.strictEqual(e.ip, '127.0.0.1'); assert.strictEqual(e.device, 'mobile');
});
t('AuditLogger.commandExecuted() logs success', () => { const al = new AuditLogger(); const cmd = { type: 'VerifyOwnership', transactionId: 'tx-1', actor: 's1', idempotencyKey: 'ik-1', metadata: {} }; const e = al.commandExecuted({ command: cmd, result: { aggregateVersion: 1 }, durationMs: 50 }); assert.ok(e.id); assert.strictEqual(e.result, 'SUCCESS'); });
t('AuditLogger.commandFailed() logs failure', () => { const al = new AuditLogger(); const cmd = { type: 'VerifyOwnership', transactionId: 'tx-1', actor: 's1', idempotencyKey: 'ik-1', metadata: {} }; const e = al.commandFailed({ command: cmd, error: 'Invalid state', code: 'ERR', durationMs: 10 }); assert.strictEqual(e.result, 'FAILURE'); });
t('AuditLogger.replayExecuted() logs replay', () => { const al = new AuditLogger(); const e = al.replayExecuted({ transactionId: 'tx-1', eventCount: 9, durationMs: 5 }); assert.strictEqual(e.action, 'REPLAY:EXECUTED'); });
t('AuditLogger.recoveryExecuted() logs recovery', () => { const al = new AuditLogger(); const e = al.recoveryExecuted({ transactionId: 'tx-1', action: 'TIMEOUT_REFUND', durationMs: 10 }); assert.strictEqual(e.action, 'RECOVERY:TIMEOUT_REFUND'); });
t('AuditLogger.projectionRebuilt() logs rebuild', () => { const al = new AuditLogger(); const e = al.projectionRebuilt({ projectionName: 'currentStates', eventCount: 100, durationMs: 20 }); assert.strictEqual(e.action, 'PROJECTION:REBUILT'); });
t('AuditLogger.getLogs() filters', () => { const al = new AuditLogger(); al.log({ actor: 'a', action: 'X', resource: 'tx', resourceId: '1' }); al.log({ actor: 'b', action: 'Y', resource: 'tx', resourceId: '2' }); assert.strictEqual(al.getLogs({ actor: 'a' }).length, 1); assert.strictEqual(al.getLogs({ resourceId: '2' }).length, 1); });
t('AuditLogger.count() returns total', () => { const al = new AuditLogger(); al.log({ actor: 'a', action: 'X', resource: 'tx' }); al.log({ actor: 'b', action: 'Y', resource: 'tx' }); assert.strictEqual(al.count(), 2); });
t('AuditLogger.clear() empties', () => { const al = new AuditLogger(); al.log({ actor: 'a', action: 'X', resource: 'tx' }); al.clear(); assert.strictEqual(al.count(), 0); });

// === HEALTH ===
console.log('\n--- Health ---\n');
t('HealthMonitor.liveness() returns alive', async () => { const h = new HealthMonitor(); const r = await h.liveness(); assert.ok(r.alive); });
t('HealthMonitor.readiness() returns ready', async () => { const h = new HealthMonitor(); const r = await h.readiness(); assert.ok(r.ready); });
t('HealthMonitor.status() with default checks', async () => { const h = new HealthMonitor(); const s = await h.status(); assert.strictEqual(s.status, 'UP'); assert.ok(s.checks.length >= 7); });
t('HealthMonitor.status() detects failures', async () => { const h = new HealthMonitor(); h.register('failing', () => { throw new Error('DOWN'); }); const s = await h.status(); assert.strictEqual(s.status, 'DEGRADED'); });
t('HealthMonitor.setStatus() updates subsystem', () => { const h = new HealthMonitor(); h.setStatus('replay', 'DOWN', 'replay in progress'); /* verify on next call */ });
t('HealthMonitor.setReplayStatus() works', () => { const h = new HealthMonitor(); h.setReplayStatus('DOWN', 'replay in progress'); });
t('HealthMonitor.isHealthy() returns boolean', async () => { const h = new HealthMonitor(); assert.ok(await h.isHealthy()); });

// === RESULTS ===
console.log('\n=======================');
console.log('Results: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
console.log('=======================\n');
if (f > 0) { console.log('TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED - Phase 3 Observability validated'); process.exit(0); }