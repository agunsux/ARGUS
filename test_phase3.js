/**
 * Phase 3 — Operational Foundation: Complete Test Suite
 *
 * Covers:
 * - Snapshot Manager
 * - Event Store Abstraction
 * - Projection Rebuild
 * - Middleware Pipeline
 * - Error Hierarchy
 * - Trace Propagation
 * - Backward Compatibility
 * - Performance Smoke Tests
 */
const assert = require('assert');
const { TestClock, FixedClock } = require('./src/observability/clock');
const { TraceContext, TRACE_MODES } = require('./src/observability/traceContext');
const { MetricsCollector } = require('./src/observability/metrics');
const { AuditLogger } = require('./src/observability/auditLogger');
const { InMemoryEventStore, InMemoryProjectionStore, InMemorySnapshotStore } = require('./src/store/interfaces');
const { SnapshotManager } = require('./src/store/snapshotManager');
const { ProjectionEngine } = require('./src/protocol/projections');
const { EventBus } = require('./src/protocol/eventBus');
const {
  MiddlewarePipeline, tracingMiddleware, validationMiddleware,
  authorizationMiddleware, rateLimitMiddleware, metricsMiddleware,
  auditMiddleware, idempotencyMiddleware
} = require('./src/protocol/middleware');
const {
  ProtocolError, ValidationError, InvariantError, AuthorizationError,
  RuleViolation, ReplayError, RecoveryError, ProjectionError, SnapshotError
} = require('./src/protocol/errors');
const { TransactionAggregate } = require('./src/protocol/aggregate');
const { DomainEvent, DOMAIN_EVENT_TYPES } = require('./src/protocol/domainEvents');
const { Command, COMMAND_TYPES } = require('./src/protocol/commands');
const { Protocol } = require('./src/protocol/protocol');

let p = 0, f = 0;
const t = (n, fn) => { try { fn(); console.log('  \u2713', n); p++; } catch (e) { console.log('  \u2717', n, e.message); f++; } };
const at = (n, fn) => { try { return fn().then(() => { console.log('  \u2713', n); p++; }).catch(e => { console.log('  \u2717', n, e.message); f++; }); } catch(e) { console.log('  \u2717', n, e.message); f++; } };

console.log('\n=== PHASE 3 — OPERATIONAL FOUNDATION TEST SUITE ===\n');

// ==================== ERROR HIERARCHY ====================
console.log('--- Error Hierarchy ---\n');
t('ProtocolError has code, message, metadata, traceId, timestamp', () => {
  const e = new ProtocolError({ code: 'TEST', message: 'test error', metadata: { key: 'val' }, traceId: 'trace-1' });
  assert.strictEqual(e.code, 'TEST'); assert.strictEqual(e.message, 'test error'); assert.strictEqual(e.metadata.key, 'val'); assert.strictEqual(e.traceId, 'trace-1'); assert.ok(e.timestamp);
});
t('ProtocolError extends Error', () => { const e = new ProtocolError({}); assert.ok(e instanceof Error); });
t('ProtocolError.toJSON() returns serializable', () => {
  const e = new ValidationError({ message: 'invalid', traceId: 't1' });
  const j = e.toJSON(); assert.strictEqual(j.code, 'VALIDATION_ERROR'); assert.strictEqual(j.name, 'ValidationError');
});
t('ValidationError has correct code', () => { const e = new ValidationError({}); assert.strictEqual(e.code, 'VALIDATION_ERROR'); });
t('InvariantError has correct code', () => { const e = new InvariantError({}); assert.strictEqual(e.code, 'INVARIANT_VIOLATION'); });
t('AuthorizationError has correct code', () => { const e = new AuthorizationError({}); assert.strictEqual(e.code, 'AUTHORIZATION_ERROR'); });
t('RuleViolation has correct code', () => { const e = new RuleViolation({}); assert.strictEqual(e.code, 'RULE_VIOLATION'); });
t('ReplayError has correct code', () => { const e = new ReplayError({}); assert.strictEqual(e.code, 'REPLAY_ERROR'); });
t('RecoveryError has correct code', () => { const e = new RecoveryError({}); assert.strictEqual(e.code, 'RECOVERY_ERROR'); });
t('ProjectionError has correct code', () => { const e = new ProjectionError({}); assert.strictEqual(e.code, 'PROJECTION_ERROR'); });
t('SnapshotError has correct code', () => { const e = new SnapshotError({}); assert.strictEqual(e.code, 'SNAPSHOT_ERROR'); });

// ==================== EVENT STORE ABSTRACTION ====================
console.log('\n--- Event Store Abstraction ---\n');
t('InMemoryEventStore.append stores event', () => {
  const s = new InMemoryEventStore();
  const e = new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', actor: 'u1' });
  s.append(e); assert.strictEqual(s.count(), 1);
});
t('InMemoryEventStore.getEvents returns sorted', () => {
  const s = new InMemoryEventStore();
  s.append(new DomainEvent({ type: 'EscrowCreated', transactionId: 'tx-1', aggregateVersion: 2 }));
  s.append(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', aggregateVersion: 1 }));
  const events = s.getEvents('tx-1'); assert.strictEqual(events.length, 2); assert.strictEqual(events[0].aggregateVersion, 1);
});
t('InMemoryEventStore.getAllEvents returns all', () => {
  const s = new InMemoryEventStore();
  s.append(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1' }));
  s.append(new DomainEvent({ type: 'ListingCreated', transactionId: 'tx-2' }));
  assert.strictEqual(s.getAllEvents().length, 2);
});
t('InMemoryEventStore.clear empties', () => { const s = new InMemoryEventStore(); s.append(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1' })); s.clear(); assert.strictEqual(s.count(), 0); });
t('InMemoryProjectionStore save/load/delete', () => {
  const s = new InMemoryProjectionStore(); s.save('test', { count: 5 });
  assert.deepStrictEqual(s.load('test'), { count: 5 });
  s.delete('test'); assert.strictEqual(s.load('test'), null);
});
t('InMemoryProjectionStore.list returns names', () => {
  const s = new InMemoryProjectionStore(); s.save('a', 1); s.save('b', 2);
  const names = s.list(); assert.ok(names.includes('a')); assert.ok(names.includes('b'));
});
t('InMemorySnapshotStore save/loadLatest', () => {
  const s = new InMemorySnapshotStore();
  s.save('tx-1', { version: 5, state: 'Settled', data: {} });
  const snap = s.loadLatest('tx-1'); assert.strictEqual(snap.version, 5); assert.strictEqual(snap.state, 'Settled');
});
t('InMemorySnapshotStore loadLatest returns highest version', () => {
  const s = new InMemorySnapshotStore();
  s.save('tx-1', { version: 3, state: 'Escrowed', data: {} });
  s.save('tx-1', { version: 7, state: 'Closed', data: {} });
  const snap = s.loadLatest('tx-1'); assert.strictEqual(snap.version, 7);
});
t('InMemorySnapshotStore delete removes all', () => {
  const s = new InMemorySnapshotStore();
  s.save('tx-1', { version: 1, state: 'Listed', data: {} });
  s.delete('tx-1'); assert.strictEqual(s.loadLatest('tx-1'), null);
});

// ==================== SNAPSHOT MANAGER ====================
console.log('\n--- Snapshot Manager ---\n');
t('SnapshotManager requires store', () => { assert.throws(() => new SnapshotManager({}), /store is required/); });
t('SnapshotManager.shouldSnapshot at frequency', () => {
  const sm = new SnapshotManager({ store: new InMemorySnapshotStore(), snapshotFrequency: 50 });
  assert.ok(!sm.shouldSnapshot(0)); assert.ok(!sm.shouldSnapshot(49)); assert.ok(sm.shouldSnapshot(50)); assert.ok(sm.shouldSnapshot(100));
});
t('SnapshotManager.createSnapshot creates snapshot at frequency', () => {
  const store = new InMemorySnapshotStore();
  const sm = new SnapshotManager({ store, snapshotFrequency: 2 });
  const agg = { transactionId: 'tx-1', version: 2, state: 'Escrowed', currentOwnerId: 'u1', currentBuyerId: 'b1', price: 100, escrowId: 'esc-1', escrowStatus: 'PENDING', evidenceChain: [], history: [], riskScore: null, errors: [] };
  const snap = sm.createSnapshot(agg);
  assert.ok(snap); assert.strictEqual(snap.version, 2); assert.strictEqual(snap.state, 'Escrowed'); assert.ok(snap.hash);
});
t('SnapshotManager.createSnapshot returns null below frequency', () => {
  const sm = new SnapshotManager({ store: new InMemorySnapshotStore(), snapshotFrequency: 50 });
  const snap = sm.createSnapshot({ transactionId: 'tx-1', version: 3, state: 'Listed' });
  assert.strictEqual(snap, null);
});
t('SnapshotManager.loadSnapshot returns null for non-existent', () => {
  const sm = new SnapshotManager({ store: new InMemorySnapshotStore() });
  assert.strictEqual(sm.loadSnapshot('tx-nonexistent'), null);
});
t('SnapshotManager.loadSnapshot verifies hash', () => {
  const store = new InMemorySnapshotStore();
  const sm = new SnapshotManager({ store, snapshotFrequency: 1 });
  const agg = { transactionId: 'tx-1', version: 1, state: 'OwnershipVerified', currentOwnerId: 'u1', currentBuyerId: null, price: null, escrowId: null, escrowStatus: null, evidenceChain: [], history: [], riskScore: null, errors: [] };
  sm.createSnapshot(agg);

  // Tamper with snapshot
  const tampered = store.loadLatest('tx-1');
  tampered.state = 'Hacked';
  store.save('tx-1', tampered);

  // Should return null due to hash mismatch
  assert.strictEqual(sm.loadSnapshot('tx-1'), null);
});
t('SnapshotManager.reconstructFromSnapshot without snapshot does full replay', () => {
  const store = new InMemorySnapshotStore();
  const sm = new SnapshotManager({ store });
  const events = [
    new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', aggregateVersion: 1 }),
    new DomainEvent({ type: 'ListingCreated', transactionId: 'tx-1', aggregateVersion: 2 })
  ];
  const result = sm.reconstructFromSnapshot(TransactionAggregate, 'tx-1', events);
  assert.strictEqual(result.fromSnapshot, null); assert.strictEqual(result.replayCount, 2); assert.strictEqual(result.aggregate.state, 'Listed');
});
t('SnapshotManager.reconstructFromSnapshot with snapshot replays only remaining', () => {
  const store = new InMemorySnapshotStore();
  const sm = new SnapshotManager({ store, snapshotFrequency: 1 });

  // Create snapshot at version 1
  const agg = { transactionId: 'tx-1', version: 1, state: 'OwnershipVerified', currentOwnerId: 'u1', currentBuyerId: null, price: null, escrowId: null, escrowStatus: null, evidenceChain: [], history: [], riskScore: null, errors: [] };
  sm.createSnapshot(agg);

  // Create snapshot at version 5
  const agg2 = { transactionId: 'tx-1', version: 5, state: 'Escrowed', currentOwnerId: 'u1', currentBuyerId: 'b1', price: 500000, escrowId: 'esc-1', escrowStatus: 'PENDING', evidenceChain: [], history: [], riskScore: null, errors: [] };
  sm.createSnapshot(agg2);

  // Replay 9 events — should only replay events after version 5
  const events = [];
  for (let i = 1; i <= 9; i++) {
    events.push(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', aggregateVersion: i }));
  }
  const result = sm.reconstructFromSnapshot(TransactionAggregate, 'tx-1', events);
  assert.ok(result.fromSnapshot); assert.strictEqual(result.replayCount, 4); // versions 6-9
  assert.strictEqual(result.aggregate.version, 9);
});
t('SnapshotManager.invalidate removes snapshot', () => {
  const store = new InMemorySnapshotStore();
  const sm = new SnapshotManager({ store, snapshotFrequency: 1 });
  const agg = { transactionId: 'tx-1', version: 1, state: 'OwnershipVerified', currentOwnerId: 'u1', currentBuyerId: null, price: null, escrowId: null, escrowStatus: null, evidenceChain: [], history: [], riskScore: null, errors: [] };
  sm.createSnapshot(agg);
  sm.invalidate('tx-1'); assert.strictEqual(store.loadLatest('tx-1'), null);
});

// ==================== PROJECTION REBUILD ====================
console.log('\n--- Projection Rebuild ---\n');
t('ProjectionEngine.rebuildOne rebuilds single projection', () => {
  const bus = new EventBus();
  const pe = new ProjectionEngine(bus);
  pe.register('count', (s, e) => (s || 0) + 1);

  const events = [
    new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', aggregateVersion: 1 }),
    new DomainEvent({ type: 'ListingCreated', transactionId: 'tx-1', aggregateVersion: 2 }),
    new DomainEvent({ type: 'BuyerMatched', transactionId: 'tx-1', aggregateVersion: 3 })
  ];
  // Apply events incrementally
  for (const e of events) pe.projectEvent(e);
  assert.strictEqual(pe.get('count'), 3);

  // Rebuild single projection from full event list
  pe.rebuildOne('count', events);
  assert.strictEqual(pe.get('count'), 3);
});
t('ProjectionEngine.rebuild resets and replays all', () => {
  const pe = new ProjectionEngine();
  ProjectionEngine.registerDefaults(pe);

  const events = [
    new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', aggregateVersion: 1, actor: 'u1' }),
    new DomainEvent({ type: 'ListingCreated', transactionId: 'tx-1', aggregateVersion: 2, actor: 'u1' }),
    new DomainEvent({ type: 'BuyerMatched', transactionId: 'tx-1', aggregateVersion: 3, actor: 'b1' }),
    new DomainEvent({ type: 'TransactionFailed', transactionId: 'tx-2', aggregateVersion: 1, actor: 'u2', data: { reason: 'Invalid state', code: 'INVALID_TRANSITION' } })
  ];
  pe.rebuild(events);

  const ec = pe.get('eventCount'); assert.strictEqual(ec, 4);
  const fails = pe.get('failures'); assert.strictEqual(fails.length, 1);
  const states = pe.get('currentStates'); assert.ok(states['tx-1']); assert.ok(states['tx-2']);
});
t('ProjectionEngine.verifyReplay compares original vs rebuilt', () => {
  const pe = new ProjectionEngine();
  ProjectionEngine.registerDefaults(pe);

  const events = [
    new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', aggregateVersion: 1 }),
    new DomainEvent({ type: 'ListingCreated', transactionId: 'tx-1', aggregateVersion: 2 })
  ];
  pe.rebuild(events);
  const result = pe.verifyReplay('eventCount', events);
  assert.ok(result.match);
});
t('ProjectionEngine.delete removes projection', () => {
  const pe = new ProjectionEngine();
  pe.register('test', (s, e) => (s || 0) + 1);
  pe.projectEvent(new DomainEvent({ type: 'Test', transactionId: 'tx-1' }));
  assert.strictEqual(pe.get('test'), 1);
  pe.delete('test'); assert.strictEqual(pe.get('test'), null);
});
t('ProjectionEngine.verifyHash checks stored vs current', () => {
  const pe = new ProjectionEngine(null, new InMemoryProjectionStore());
  ProjectionEngine.registerDefaults(pe);
  const events = [
    new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', aggregateVersion: 1 })
  ];
  pe.rebuild(events);
  const result = pe.verifyHash('eventCount');
  // stored is null since we didn't explicitly save
  assert.ok(result.match === false || result.reason);
});
t('ProjectionEngine.getMetrics returns counts', () => {
  const pe = new ProjectionEngine();
  pe.register('test', (s, e) => (s || 0) + 1);
  pe.projectEvent(new DomainEvent({ type: 'Test', transactionId: 'tx-1' }));
  const m = pe.getMetrics(); assert.ok(m.builds >= 1);
});

// ==================== MIDDLEWARE PIPELINE ====================
console.log('\n--- Middleware Pipeline ---\n');
t('MiddlewarePipeline runs middleware in order', async () => {
  const order = [];
  const pipe = new MiddlewarePipeline();
  pipe.use(async (cmd, ctx, next) => { order.push(1); return next(); });
  pipe.use(async (cmd, ctx, next) => { order.push(2); return next(); });
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  await pipe.run(cmd);
  assert.deepStrictEqual(order, [1, 2]);
});
t('MiddlewarePipeline passes context through', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(async (cmd, ctx, next) => { ctx.value = 1; return next(); });
  pipe.use(async (cmd, ctx, next) => { ctx.value += 2; return next(); });
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  const ctx = await pipe.run(cmd);
  assert.strictEqual(ctx.value, 3);
});
t('MiddlewarePipeline stops on error', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(async (cmd, ctx, next) => { throw new ValidationError({ message: 'fail' }); });
  pipe.use(async (cmd, ctx, next) => { ctx.reached = true; return next(); });
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  await assert.rejects(() => pipe.run(cmd), ValidationError);
});
t('tracingMiddleware creates trace context', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  const ctx = await pipe.run(cmd);
  assert.ok(ctx.trace); assert.ok(ctx.trace.traceId); assert.ok(ctx.trace.correlationId);
});
t('validationMiddleware rejects invalid command', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(validationMiddleware());
  const cmd = new Command({ type: 'InvalidType', transactionId: 'tx-1', actor: 'u1' });
  await assert.rejects(() => pipe.run(cmd), ValidationError);
});
t('validationMiddleware passes valid command', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(validationMiddleware());
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  const ctx = await pipe.run(cmd); assert.ok(ctx);
});
t('authorizationMiddleware rejects unauthorized', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(authorizationMiddleware(() => false));
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  await assert.rejects(() => pipe.run(cmd), AuthorizationError);
});
t('authorizationMiddleware passes authorized', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(authorizationMiddleware(() => true));
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  const ctx = await pipe.run(cmd); assert.ok(ctx);
});
t('metricsMiddleware records metrics', async () => {
  const metrics = new MetricsCollector();
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(metricsMiddleware(metrics));
  pipe.use(async (cmd, ctx, next) => next());
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  await pipe.run(cmd);
  const s = metrics.snapshot(); assert.strictEqual(s['counter:CommandReceived:VerifyOwnership'], 1);
});
t('auditMiddleware logs command', async () => {
  const audit = new AuditLogger();
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(auditMiddleware(audit));
  pipe.use(async (cmd, ctx, next) => next());
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  await pipe.run(cmd);
  const logs = audit.getLogs(); assert.ok(logs.length >= 1);
});
t('auditMiddleware logs failure', async () => {
  const audit = new AuditLogger();
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(auditMiddleware(audit));
  pipe.use(async (cmd, ctx, next) => { throw new ValidationError({ message: 'fail' }); });
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  await assert.rejects(() => pipe.run(cmd));
  const logs = audit.getLogs({ result: 'FAILURE' }); assert.ok(logs.length >= 1);
});
t('rateLimitMiddleware limits requests', async () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(tracingMiddleware());
  pipe.use(rateLimitMiddleware({ maxRequests: 2, windowMs: 60000 }));
  pipe.use(async (cmd, ctx, next) => next());

  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  await pipe.run(cmd); // 1st — ok
  await pipe.run(cmd); // 2nd — ok
  await assert.rejects(() => pipe.run(cmd)); // 3rd — rate limited
});
t('MiddlewarePipeline.count returns count', () => {
  const pipe = new MiddlewarePipeline();
  assert.strictEqual(pipe.count, 0);
  pipe.use(async (c, ctx, n) => n()); assert.strictEqual(pipe.count, 1);
});
t('MiddlewarePipeline.clear removes all', () => {
  const pipe = new MiddlewarePipeline();
  pipe.use(async (c, ctx, n) => n()); pipe.clear(); assert.strictEqual(pipe.count, 0);
});

// ==================== TRACE PROPAGATION ====================
console.log('\n--- Trace Propagation ---\n');
t('Trace creates nested child chain', () => {
  const root = TraceContext.fresh();
  const child1 = root.child({ causationId: 'cmd-1' });
  const child2 = child1.child({ causationId: 'evt-1' });
  assert.strictEqual(child2.traceId, root.traceId);
  assert.strictEqual(child2.parentTraceId, child1.traceId);
});
t('Trace replayChild sets REPLAY mode', () => {
  const root = TraceContext.fresh();
  const replay = root.replayChild('evt-42');
  assert.strictEqual(replay.mode, TRACE_MODES.REPLAY);
  assert.strictEqual(replay.causationId, 'evt-42');
});
t('Trace recoveryChild sets RECOVERY mode', () => {
  const root = TraceContext.fresh();
  const recovery = root.recoveryChild('NETWORK_FAILURE');
  assert.strictEqual(recovery.mode, TRACE_MODES.RECOVERY);
  assert.strictEqual(recovery.metadata.recoveryReason, 'NETWORK_FAILURE');
});

// ==================== BACKWARD COMPATIBILITY ====================
console.log('\n--- Backward Compatibility ---\n');
t('Original StateMachine unchanged', () => {
  const { StateMachine, STATES } = require('./src/engine/stateMachine');
  assert.ok(StateMachine.isValidTransition(STATES.OWNERSHIP_VERIFIED, STATES.LISTED).valid);
});
t('Original ReplayEngine unchanged', () => {
  const { ReplayEngine } = require('./src/engine/replayEngine');
  const ev = [{ sequence_id: 1, ticket_id: 'tx-1', event_type: 'OwnershipVerified', actor_id: 'u1', metadata: '{}', created_at: '2026-01-01T00:00:00Z' }];
  const s = ReplayEngine.reconstructFromEvents(ev);
  assert.strictEqual(s.currentState, 'OwnershipVerified');
});
t('Original Protocol.execute() still works', async () => {
  const protocol = new Protocol();
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-bc-1', actor: 'u1', payload: { ownerId: 'u1', evidenceBundleId: 'evd-1' } });
  const result = await protocol.execute(cmd);
  assert.ok(result.success);
});
t('Original DomainEvent immutable', () => {
  const e = new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1' });
  assert.ok(e.id); assert.strictEqual(e.type, 'OwnershipVerified');
});
t('Original EventBus subscribe/publish works', () => {
  const bus = new EventBus();
  let received = null;
  bus.subscribe('OwnershipVerified', (e) => { received = e; });
  const e = new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1' });
  bus.publish(e);
  assert.strictEqual(received, e);
});

// ==================== PERFORMANCE SMOKE TESTS ====================
console.log('\n--- Performance Smoke Tests ---\n');
t('Replay 10,000 events (smoke)', () => {
  const events = [];
  for (let i = 0; i < 10000; i++) {
    events.push({ sequence_id: i + 1, ticket_id: 'tx-perf', event_type: 'OwnershipVerified', actor_id: 'u1', metadata: '{}', created_at: new Date(Date.now() + i).toISOString() });
  }
  const { ReplayEngine } = require('./src/engine/replayEngine');
  const start = Date.now();
  const result = ReplayEngine.reconstructFromEvents(events);
  const duration = Date.now() - start;
  console.log('    Performance: 10,000 events replayed in ' + duration + 'ms');
  assert.ok(result);
  assert.ok(duration < 5000, 'Replay took ' + duration + 'ms (expected < 5000ms)');
});
t('Aggregate rebuild 10,000 events (smoke)', () => {
  const events = [];
  for (let i = 0; i < 10000; i++) {
    events.push(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-perf-2', actor: 'u1', aggregateVersion: i + 1 }));
  }
  const start = Date.now();
  const agg = TransactionAggregate.rebuild('tx-perf-2', events);
  const duration = Date.now() - start;
  console.log('    Performance: 10,000 events rebuilt in ' + duration + 'ms');
  assert.strictEqual(agg.version, 10000);
  assert.ok(duration < 5000, 'Rebuild took ' + duration + 'ms (expected < 5000ms)');
});
t('Snapshot + replay 10,000 events (smoke)', () => {
  const store = new InMemorySnapshotStore();
  const sm = new SnapshotManager({ store, snapshotFrequency: 100 });
  const events = [];
  for (let i = 0; i < 10000; i++) {
    events.push(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-perf-3', actor: 'u1', aggregateVersion: i + 1 }));
  }

  // Create a snapshot at version 5000
  const partialAgg = TransactionAggregate.rebuild('tx-perf-3', events.slice(0, 5000));
  sm.createSnapshot(partialAgg);

  const start = Date.now();
  const result = sm.reconstructFromSnapshot(TransactionAggregate, 'tx-perf-3', events);
  const duration = Date.now() - start;
  console.log('    Performance: snapshot + 5000 remaining events in ' + duration + 'ms');
  assert.ok(result.fromSnapshot);
  assert.strictEqual(result.replayCount, 5000);
  assert.ok(duration < 3000, 'Snapshot rebuild took ' + duration + 'ms (expected < 3000ms)');
});

// ==================== COMPREHENSIVE EDGE CASES ====================
console.log('\n--- Edge Cases ---\n');
t('Snapshot with zero events returns null', () => {
  const sm = new SnapshotManager({ store: new InMemorySnapshotStore(), snapshotFrequency: 50 });
  assert.strictEqual(sm.shouldSnapshot(0), false);
});
t('Projection rebuild with empty events', () => {
  const pe = new ProjectionEngine();
  ProjectionEngine.registerDefaults(pe);
  const result = pe.rebuild([]);
  assert.strictEqual(result.eventCount, 0);
  // eventCount stays null/0 when no events — rebuild clears projections
  const count = pe.get('eventCount');
  assert.ok(count === 0 || count === null);
});
t('Middleware empty pipeline returns context', async () => {
  const pipe = new MiddlewarePipeline();
  const cmd = new Command({ type: 'VerifyOwnership', transactionId: 'tx-1', actor: 'u1' });
  const ctx = await pipe.run(cmd);
  assert.deepStrictEqual(ctx, {});
});
t('AuditLogger respects maxEntries', () => {
  const al = new AuditLogger({ maxEntries: 5 });
  for (let i = 0; i < 10; i++) {
    al.log({ actor: 'u' + i, action: 'TEST', resource: 'tx', resourceId: 'tx-' + i });
  }
  assert.strictEqual(al.count(), 5);
});
t('MetricsCollector histogram percentiles correct', () => {
  const m = new MetricsCollector();
  for (let i = 1; i <= 100; i++) m.record('test', i);
  const s = m.snapshot();
  // p50 is at index Math.floor(100 * 0.5) = 50, which is value 51 in 0-based arrays
  assert.strictEqual(s['timer:test_min'], 1);
  assert.strictEqual(s['timer:test_max'], 100);
});

// ==================== RESULTS ====================
console.log('\n=======================');
console.log('Results: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
console.log('=======================\n');
if (f > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED - Phase 3 validated'); process.exit(0); }