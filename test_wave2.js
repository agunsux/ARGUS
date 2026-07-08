/**
 * Wave 2 — Protocol Layer Test Suite
 */
const assert = require('assert');
const { Command, COMMAND_TYPES, createCommand } = require('./src/protocol/commands');
const { DomainEvent, DOMAIN_EVENT_TYPES } = require('./src/protocol/domainEvents');
const { Protocol } = require('./src/protocol/protocol');
const { TransactionAggregate } = require('./src/protocol/aggregate');
const { ProjectionEngine } = require('./src/protocol/projections');
const { RuleEngine } = require('./src/protocol/ruleEngine');
const { EventBus } = require('./src/protocol/eventBus');
const { STATES } = require('./src/engine/stateMachine');

let p = 0, f = 0;
const t = (n, fn) => { try { fn(); console.log('  \u2713', n); p++; } catch (e) { console.log('  \u2717', n, e.message); f++; } };
console.log('\n=== WAVE 2 PROTOCOL LAYER TEST SUITE ===\n');

// === COMMANDS ===
console.log('--- Commands ---\n');
t('Command requires type', () => assert.throws(() => new Command({ transactionId: 'tx-1', actor: 'u1' })));
t('Command requires transactionId', () => assert.throws(() => new Command({ type: 'Test', actor: 'u1' })));
t('Command requires actor', () => assert.throws(() => new Command({ type: 'Test', transactionId: 'tx-1' })));
t('Command has auto idempotencyKey', () => { const c = new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-1', actor: 's1' }); assert.ok(c.idempotencyKey); });
t('Command has identity', () => { const c = new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-1', actor: 's1', idempotencyKey: 'abc' }); assert.strictEqual(c.identity, 'tx-1:abc'); });
t('Command validates known types', () => { assert.ok(new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-1', actor: 'u1' }).validate().valid); assert.ok(!new Command({ type: 'Bad', transactionId: 'tx-1', actor: 'u1' }).validate().valid); });
t('createCommand helper', () => { const c = createCommand(COMMAND_TYPES.VERIFY_OWNERSHIP, { transactionId: 'tx-1', actor: 's1' }); assert.ok(c instanceof Command); });

// === DOMAIN EVENTS ===
console.log('\n--- Domain Events ---\n');
t('DomainEvent requires type', () => assert.throws(() => new DomainEvent({ transactionId: 'tx-1' })));
t('DomainEvent requires transactionId', () => assert.throws(() => new DomainEvent({ type: 'Test' })));
t('DomainEvent has auto-generated id', () => { const e = new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-1', actor: 's1' }); assert.ok(e.id.startsWith('evt-')); });
t('DomainEvent has aggregateVersion', () => { const e = new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-1', actor: 's1', aggregateVersion: 5 }); assert.strictEqual(e.aggregateVersion, 5); });
t('DomainEvent has timestamp', () => { const e = new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-1', actor: 's1' }); assert.ok(e.timestamp); });

// === AGGREGATE ===
console.log('\n--- Aggregate ---\n');
t('Aggregate starts version 0', () => { const a = new TransactionAggregate('tx-1'); assert.strictEqual(a.version, 0); });
t('Aggregate applies OwnershipVerified', () => { const a = new TransactionAggregate('tx-1'); a.applyEvent(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', actor: 's1', aggregateVersion: 1, data: { ownerId: 's1' } })); assert.strictEqual(a.state, STATES.OWNERSHIP_VERIFIED); assert.strictEqual(a.version, 1); });
t('Aggregate applies full flow (9 events)', () => {
  const events = [
    new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-2', actor: 's1', aggregateVersion: 1, data: { ownerId: 's1' } }),
    new DomainEvent({ type: 'ListingCreated', transactionId: 'tx-2', actor: 's1', aggregateVersion: 2, data: { price: 500000 } }),
    new DomainEvent({ type: 'BuyerMatched', transactionId: 'tx-2', actor: 'b1', aggregateVersion: 3, data: { buyerId: 'b1' } }),
    new DomainEvent({ type: 'EscrowCreated', transactionId: 'tx-2', actor: 'b1', aggregateVersion: 4, data: { escrowId: 'esc-1' } }),
    new DomainEvent({ type: 'TransferRequested', transactionId: 'tx-2', actor: 's1', aggregateVersion: 5 }),
    new DomainEvent({ type: 'TransferAccepted', transactionId: 'tx-2', actor: 'b1', aggregateVersion: 6, data: { newOwnerId: 'b1' } }),
    new DomainEvent({ type: 'VenueVerified', transactionId: 'tx-2', actor: 'v1', aggregateVersion: 7 }),
    new DomainEvent({ type: 'SettlementCompleted', transactionId: 'tx-2', actor: 'a1', aggregateVersion: 8 }),
    new DomainEvent({ type: 'TransactionClosed', transactionId: 'tx-2', actor: 'sys', aggregateVersion: 9 }),
  ];
  const a = TransactionAggregate.rebuild('tx-2', events);
  assert.strictEqual(a.state, STATES.CLOSED); assert.strictEqual(a.version, 9);
  assert.strictEqual(a.currentOwnerId, 'b1'); assert.strictEqual(a.history.length, 9);

// === PROTOCOL EXECUTION ===
console.log('\n--- Protocol Execution ---\n');
t('Protocol.execute() returns success for valid VerifyOwnership', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  const result = await proto.execute(new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-10', actor: 'seller-1', payload: { ownerId: 'seller-1' } }));
  assert.ok(result.success); assert.ok(result.eventId); assert.strictEqual(result.aggregateVersion, 1);
});
t('Protocol.execute() rejects invalid transition', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  await proto.execute(new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-11', actor: 'seller-1' }));
  const result = await proto.execute(new Command({ type: COMMAND_TYPES.COMPLETE_SETTLEMENT, transactionId: 'tx-11', actor: 'admin-1' }));
  assert.ok(!result.success); assert.strictEqual(result.code, 'INVALID_TRANSITION');
});
t('Protocol.execute() is idempotent', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  const cmd = new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-12', actor: 'seller-1', idempotencyKey: 'same-key' });
  const r1 = await proto.execute(cmd); const r2 = await proto.execute(cmd);
  assert.ok(r1.success); assert.ok(r2.success); assert.ok(r2.idempotent); assert.strictEqual(r1.eventId, r2.eventId);
});
t('Protocol.execute() enforces invariants', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  await proto.execute(new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-13', actor: 'seller-1' }));
  await proto.execute(new Command({ type: COMMAND_TYPES.CREATE_LISTING, transactionId: 'tx-13', actor: 'seller-1', payload: { price: 500000 } }));
  const result = await proto.execute(new Command({ type: COMMAND_TYPES.COMPLETE_SETTLEMENT, transactionId: 'tx-13', actor: 'admin-1' }));
  assert.ok(!result.success);
});
t('Protocol.execute() publishes domain event on success', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  let published = null;
  bus.subscribe(DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, (e) => { published = e; });
  await proto.execute(new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-14', actor: 'seller-1' }));
  assert.ok(published); assert.strictEqual(published.type, 'OwnershipVerified');
});
t('Protocol.execute() publishes failure event on failure', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  let failureEvent = null;
  bus.subscribe(DOMAIN_EVENT_TYPES.TRANSACTION_FAILED, (e) => { failureEvent = e; });
  await proto.execute(new Command({ type: 'UnknownCommand', transactionId: 'tx-15', actor: 'u1' }));
  assert.ok(failureEvent);
});
t('Protocol.rebuildFromEvents() reconstructs aggregate', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  await proto.execute(new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-16', actor: 's1' }));
  await proto.execute(new Command({ type: COMMAND_TYPES.CREATE_LISTING, transactionId: 'tx-16', actor: 's1', payload: { price: 250000 } }));
  const agg = proto.rebuildFromEvents('tx-16');
  assert.ok(agg); assert.strictEqual(agg.state, STATES.LISTED); assert.strictEqual(agg.version, 2);
});
t('Protocol advances versions', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  const r1 = await proto.execute(new Command({ type: COMMAND_TYPES.VERIFY_OWNERSHIP, transactionId: 'tx-17', actor: 's1' }));
  const r2 = await proto.execute(new Command({ type: COMMAND_TYPES.CREATE_LISTING, transactionId: 'tx-17', actor: 's1', payload: { price: 100000 } }));
  assert.strictEqual(r1.aggregateVersion, 1); assert.strictEqual(r2.aggregateVersion, 2);
});


t('Protocol processes full happy path (10 commands)', async () => {
  const bus = new EventBus(); const proto = new Protocol({ eventBus: bus });
  const tx = 'tx-20'; const cmds = [
    { type: COMMAND_TYPES.VERIFY_OWNERSHIP, payload: { ownerId: 's1' } },
    { type: COMMAND_TYPES.CREATE_LISTING, payload: { price: 500000 } },
    { type: COMMAND_TYPES.MATCH_BUYER, payload: { buyerId: 'b1' } },
    { type: COMMAND_TYPES.CREATE_ESCROW, payload: { escrowId: 'esc-20' } },
    { type: COMMAND_TYPES.FUND_ESCROW, payload: {} },
    { type: COMMAND_TYPES.REQUEST_TRANSFER, payload: {} },
    { type: COMMAND_TYPES.ACCEPT_TRANSFER, payload: { newOwnerId: 'b1', evidenceBundleId: 'evd-1' } },
    { type: COMMAND_TYPES.VERIFY_VENUE, payload: {} },
    { type: COMMAND_TYPES.COMPLETE_SETTLEMENT, payload: {} },
    { type: COMMAND_TYPES.CLOSE_TRANSACTION, payload: {} },
  ];
  for (const cmd of cmds) {
    const result = await proto.execute(new Command({ type: cmd.type, transactionId: tx, actor: 'system', payload: cmd.payload }));
    assert.ok(result.success, cmd.type + ' failed: ' + JSON.stringify(result));
  }
  const agg = proto.rebuildFromEvents(tx);
  assert.strictEqual(agg.state, STATES.CLOSED); assert.strictEqual(agg.version, 10);
  assert.strictEqual(agg.currentOwnerId, 'b1');
});

// === EVENT BUS ===
console.log('\n--- Event Bus ---\n');
t('EventBus publishes to subscribers', () => {
  const bus = new EventBus(); let r = null;
  bus.subscribe('TestEvent', (e) => { r = e; });
  bus.publish(new DomainEvent({ type: 'TestEvent', transactionId: 'tx-1', actor: 'u1' }));
  assert.ok(r); assert.strictEqual(r.type, 'TestEvent');
});
t('EventBus wildcard receives all', () => {
  const bus = new EventBus(); const all = [];
  bus.subscribe('*', (e) => all.push(e));
  bus.publish(new DomainEvent({ type: 'A', transactionId: 'tx-1', actor: 'u1' }));
  bus.publish(new DomainEvent({ type: 'B', transactionId: 'tx-1', actor: 'u1' }));
  assert.strictEqual(all.length, 2);
});
t('EventBus getHistory works', () => {
  const bus = new EventBus();
  bus.publish(new DomainEvent({ type: 'A', transactionId: 'tx-1', actor: 'u1' }));
  assert.strictEqual(bus.getHistory().length, 1);
});
t('EventBus subscribe returns unsubscribe', () => {
  const bus = new EventBus(); let c = 0;
  const unsub = bus.subscribe('X', () => { c++; });
  bus.publish(new DomainEvent({ type: 'X', transactionId: 'tx-1', actor: 'u1' }));
  unsub();
  bus.publish(new DomainEvent({ type: 'X', transactionId: 'tx-1', actor: 'u1' }));
  assert.strictEqual(c, 1);
});

// === PROJECTIONS ===
console.log('\n--- Projections ---\n');
t('ProjectionEngine builds from events', () => {
  const bus = new EventBus(); const pe = new ProjectionEngine(bus);
  ProjectionEngine.registerDefaults(pe);
  bus.publish(new DomainEvent({ type: 'OwnershipVerified', transactionId: 'tx-1', actor: 's1', aggregateVersion: 1 }));
  bus.publish(new DomainEvent({ type: 'TransferVerified', transactionId: 'tx-1', actor: 'b1', aggregateVersion: 2 }));
  assert.strictEqual(pe.get('transactionCounts').total, 2);
});
t('ProjectionEngine rebuild resets and replays', () => {
  const bus = new EventBus(); const pe = new ProjectionEngine(bus);
  ProjectionEngine.registerDefaults(pe);
  bus.publish(new DomainEvent({ type: 'A', transactionId: 'tx-1', actor: 'u1', aggregateVersion: 1 }));
  pe.rebuild([new DomainEvent({ type: 'X', transactionId: 'tx-1', actor: 'u1', aggregateVersion: 1 })]);
  assert.strictEqual(pe.get('transactionCounts').total, 1);
});

// === RULE ENGINE ===
console.log('\n--- Rule Engine ---\n');
t('RuleEngine evaluates escrow timeout', () => {
  const re = new RuleEngine(); RuleEngine.registerDefaults(re);
  const actions = re.evaluate({ state: STATES.ESCROWED, escrowStatus: 'PENDING', _escrowCreatedAt: new Date(Date.now() - 3600000).toISOString(), price: 100000 });
  assert.ok(actions.find(a => a.rule === 'escrow_timeout'));
});
t('RuleEngine high-value flag triggers', () => {
  const re = new RuleEngine(); RuleEngine.registerDefaults(re);
  assert.ok(re.evaluate({ price: 15000000 }).find(a => a.rule === 'high_value_review'));
});

// === RESULTS ===
console.log('\n=======================');
console.log('Results: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
console.log('=======================\n');
if (f > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED - Wave 2 Protocol Layer validated'); process.exit(0); }

});
