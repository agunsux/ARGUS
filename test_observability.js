/**
 * Wave 2.5 — Observability & Operational Readiness Test Suite
 */
const assert = require('assert');
const { Clock, clock } = require('./src/observability/clock');
const { TraceContext } = require('./src/observability/traceContext');
const { MetricsCollector, metrics } = require('./src/observability/metrics');
const { AuditLogger, auditLogger } = require('./src/observability/auditLogger');
const { HealthCheck } = require('./src/observability/health');

let p = 0, f = 0;
const t = (n, fn) => { try { fn(); console.log('  \u2713', n); p++; } catch (e) { console.log('  \u2717', n, e.message); f++; } };
console.log('\n=== WAVE 2.5 OBSERVABILITY TEST SUITE ===\n');

// === CLOCK ===
console.log('--- Clock ---\n');
t('Clock.now() returns ISO string', () => { const n = clock.now(); assert.ok(n); assert.ok(n.includes('T')); });
t('Clock.freeze() fixes time', () => { const c = new Clock(); c.freeze('2026-01-01T00:00:00Z'); assert.strictEqual(c.now(), '2026-01-01T00:00:00Z'); });
t('Clock.advance() moves frozen time forward', () => { const c = new Clock(); c.freeze('2026-01-01T00:00:00Z'); c.advance(5000); assert.strictEqual(c.now(), '2026-01-01T00:00:05.000Z'); });
t('Clock.unfreeze() releases frozen time', () => { const c = new Clock(); c.freeze('2026-01-01T00:00:00Z'); c.unfreeze(); assert.notStrictEqual(c.now(), '2026-01-01T00:00:00Z'); });
t('Clock.elapsedSince() returns ms', () => { const c = new Clock(); c.freeze('2026-01-01T00:01:00Z'); const elapsed = c.elapsedSince('2026-01-01T00:00:00Z'); assert.strictEqual(elapsed, 60000); });
t('Clock.isExpired() works', () => { const c = new Clock(); c.freeze('2026-01-01T00:01:00Z'); assert.ok(c.isExpired('2026-01-01T00:00:00Z', 30000)); assert.ok(!c.isExpired('2026-01-01T00:00:00Z', 120000)); });

// === TRACE CONTEXT ===
console.log('\n--- Trace Context ---\n');
t('TraceContext.fresh() generates traceId', () => { const t = TraceContext.fresh(); assert.ok(t.traceId); assert.ok(t.correlationId); });
t('TraceContext.child() preserves traceId', () => { const p = TraceContext.fresh(); const c = p.child(); assert.strictEqual(c.traceId, p.traceId); assert.ok(c.causationId); });
t('TraceContext.fromHeaders() parses headers', () => { const t = TraceContext.fromHeaders({ 'x-trace-id': 'trace-1', 'x-correlation-id': 'corr-1', 'x-causation-id': 'cause-1' }); assert.strictEqual(t.traceId, 'trace-1'); });
t('TraceContext.toHeaders() serializes', () => { const t = TraceContext.fresh(); const h = t.toHeaders(); assert.ok(h['x-trace-id']); });

// === METRICS ===
console.log('\n--- Metrics ---\n');
t('MetricsCollector.increment() works', () => { const m = new MetricsCollector(); m.increment('test_counter', 3); const s = m.snapshot(); assert.strictEqual(s['counter:test_counter'], 3); });
t('MetricsCollector.record() records histograms', () => { const m = new MetricsCollector(); m.record('test_timer', 100); m.record('test_timer', 200); const s = m.snapshot(); assert.ok(s['timer:test_timer_count'] >= 2); });
t('MetricsCollector.domain methods work', () => { const m = new MetricsCollector(); m.recordCommandReceived('Test'); m.recordCommandCompleted('Test', 50); const s = m.snapshot(); assert.strictEqual(s['counter:command_received'], 1); assert.strictEqual(s['counter:command_completed:Test'], 1); });
t('MetricsCollector.reset() clears', () => { const m = new MetricsCollector(); m.increment('x', 5); m.reset(); assert.strictEqual(m.snapshot()['counter:x'], undefined); });

// === AUDIT LOGGER ===
console.log('\n--- Audit Logger ---\n');
t('AuditLogger.log() creates entry', () => { const al = new AuditLogger(); const e = al.log({ actor: 'user-1', action: 'TEST', resource: 'tx', resourceId: 'tx-1' }); assert.ok(e.id); assert.strictEqual(e.actor, 'user-1'); });
t('AuditLogger.commandExecuted() logs success', () => { const al = new AuditLogger(); const cmd = { type: 'VerifyOwnership', transactionId: 'tx-1', actor: 's1', idempotencyKey: 'ik-1', metadata: {} }; const e = al.commandExecuted({ command: cmd, result: { aggregateVersion: 1 }, durationMs: 50 }); assert.ok(e.id); assert.strictEqual(e.result, 'SUCCESS'); });
t('AuditLogger.commandFailed() logs failure', () => { const al = new AuditLogger(); const cmd = { type: 'VerifyOwnership', transactionId: 'tx-1', actor: 's1', idempotencyKey: 'ik-1', metadata: {} }; const e = al.commandFailed({ command: cmd, error: 'Invalid state', code: 'ERR', durationMs: 10 }); assert.strictEqual(e.result, 'FAILURE'); });
t('AuditLogger.getLogs() filters', () => { const al = new AuditLogger(); al.log({ actor: 'a', action: 'X', resource: 'tx', resourceId: '1' }); al.log({ actor: 'b', action: 'Y', resource: 'tx', resourceId: '2' }); assert.strictEqual(al.getLogs({ actor: 'a' }).length, 1); assert.strictEqual(al.getLogs({ resourceId: '2' }).length, 1); });

// === HEALTH ===
console.log('\n--- Health ---\n');
t('HealthCheck.liveness() returns alive', async () => { const h = new HealthCheck(); const r = await h.liveness(); assert.ok(r.alive); });
t('HealthCheck.readiness() returns ready', async () => { const h = new HealthCheck(); const r = await h.readiness(); assert.ok(r.ready); });
t('HealthCheck.status() with registered checks', async () => { const h = new HealthCheck(); h.register('db', () => 'UP'); h.register('cache', () => true); const s = await h.status(); assert.strictEqual(s.status, 'UP'); assert.strictEqual(s.checks.length, 2); });
t('HealthCheck.status() detects failures', async () => { const h = new HealthCheck(); h.register('failing', () => { throw new Error('DOWN'); }); const s = await h.status(); assert.strictEqual(s.status, 'DEGRADED'); });

// === RESULTS ===
console.log('\n=======================');
console.log('Results: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
console.log('=======================\n');
if (f > 0) { console.log('TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED - Wave 2.5 Observability validated'); process.exit(0); }
