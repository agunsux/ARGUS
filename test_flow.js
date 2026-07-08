/**
 * Core Trust Loop — Complete Test Suite v0.2
 * Level 1: Unit | Level 2: Replay | Level 3: Recovery | Level 4: Evidence
 */
const assert = require('assert');
const { StateMachine, STATES, EVENTS, INVARIANTS } = require('./src/engine/stateMachine');
const { ReplayEngine } = require('./src/engine/replayEngine');
const { RecoveryEngine } = require('./src/engine/recoveryEngine');
const { EvidenceEngine } = require('./src/engine/evidenceEngine');
let p = 0, f = 0;
const t = (n, fn) => { try { fn(); console.log('  \u2713', n); p++; } catch (e) { console.log('  \u2717', n, e.message); f++; } };
console.log('\n=== CORE TRUST LOOP TEST SUITE v0.2 ===\n');

// === LEVEL 1 ===
console.log('--- Level 1: Unit Tests ---\n');
t('STATES: 10 states', () => { const a = StateMachine.getAllStates(); assert.strictEqual(a.length, 10); Object.values(STATES).forEach(s => assert.ok(a.includes(s))); });
t('EVENTS: 11 events', () => assert.strictEqual(StateMachine.getAllEvents().length, 11));
t('Valid: OwnershipVerified -> Listed', () => assert.ok(StateMachine.isValidTransition(STATES.OWNERSHIP_VERIFIED, STATES.LISTED).valid));
t('Valid: VenueVerified -> Settled', () => assert.ok(StateMachine.isValidTransition(STATES.VENUE_VERIFIED, STATES.SETTLED).valid));
t('Valid: Settled -> Closed', () => assert.ok(StateMachine.isValidTransition(STATES.SETTLED, STATES.CLOSED).valid));
t('Invalid: Listed -> Settled', () => assert.ok(!StateMachine.isValidTransition(STATES.LISTED, STATES.SETTLED).valid));
t('Invalid: Closed -> any', () => assert.ok(!StateMachine.isValidTransition(STATES.CLOSED, STATES.LISTED).valid));
t('Any -> Exception valid', () => assert.ok(StateMachine.isValidTransition(STATES.LISTED, STATES.EXCEPTION).valid));
t('Exception -> any valid', () => assert.ok(StateMachine.isValidTransition(STATES.EXCEPTION, STATES.LISTED).valid));
t('getStateForEvent(SETTLEMENT_RELEASED)=Settled', () => assert.strictEqual(StateMachine.getStateForEvent(EVENTS.SETTLEMENT_RELEASED), STATES.SETTLED));
t('getEventForTransition(Venue,Settled)=SettlementReleased', () => assert.strictEqual(StateMachine.getEventForTransition(STATES.VENUE_VERIFIED, STATES.SETTLED), EVENTS.SETTLEMENT_RELEASED));
t('Invariant 1: Single Owner', () => { const v = StateMachine.validateInvariants(STATES.LISTED, STATES.OWNERSHIP_VERIFIED, { currentOwnerId: 'u1' }); assert.ok(v.length > 0); });
t('Invariant 2: Settlement without Venue', () => { const v = StateMachine.validateInvariants(STATES.LISTED, STATES.SETTLED, {}); assert.ok(v.length > 0); });
t('Invariant 3: Transfer without evidence', () => { const v = StateMachine.validateInvariants(STATES.TRANSFER_PENDING, STATES.TRANSFER_VERIFIED, {}); assert.ok(v.length > 0); });
t('No violations with evidence', () => assert.strictEqual(StateMachine.validateInvariants(STATES.LISTED, STATES.MATCHED, { evidenceBundleId: 'e1' }).length, 0));
t('generateEvidence has signature', () => { const ev = StateMachine.generateEvidence(STATES.LISTED, STATES.MATCHED, { actorId: 's1' }); assert.ok(ev.evidenceId && ev.signature); });

// === LEVEL 2: REPLAY ===
console.log('\n--- Level 2: Replay Engine Tests ---\n');
const mkEv = () => [
  {sequence_id:1,ticket_id:'tx-1',event_type:EVENTS.OWNERSHIP_VERIFIED,actor_id:'seller-1',metadata:'{"owner_id":"seller-1"}',created_at:'2026-07-09T10:00:00Z'},
  {sequence_id:2,ticket_id:'tx-1',event_type:EVENTS.LISTING_CREATED,actor_id:'seller-1',metadata:'{"price":500000}',created_at:'2026-07-09T10:01:00Z'},
  {sequence_id:3,ticket_id:'tx-1',event_type:EVENTS.BUYER_MATCHED,actor_id:'buyer-1',metadata:'{"buyer_id":"buyer-1"}',created_at:'2026-07-09T10:02:00Z'},
  {sequence_id:4,ticket_id:'tx-1',event_type:EVENTS.ESCROW_CREATED,actor_id:'buyer-1',metadata:'{"escrow_id":"esc-1"}',created_at:'2026-07-09T10:03:00Z'},
  {sequence_id:5,ticket_id:'tx-1',event_type:EVENTS.TRANSFER_INITIATED,actor_id:'seller-1',metadata:'{}',created_at:'2026-07-09T10:04:00Z'},
  {sequence_id:6,ticket_id:'tx-1',event_type:EVENTS.TRANSFER_VERIFIED,actor_id:'seller-1',metadata:'{"new_owner_id":"buyer-1","evidenceBundleId":"evd-1"}',created_at:'2026-07-09T10:05:00Z'},
  {sequence_id:7,ticket_id:'tx-1',event_type:EVENTS.VENUE_ENTRY_VERIFIED,actor_id:'venue-1',metadata:'{}',created_at:'2026-07-09T10:06:00Z'},
  {sequence_id:8,ticket_id:'tx-1',event_type:EVENTS.SETTLEMENT_RELEASED,actor_id:'admin-1',metadata:'{}',created_at:'2026-07-09T10:07:00Z'},
  {sequence_id:9,ticket_id:'tx-1',event_type:EVENTS.TRANSACTION_CLOSED,actor_id:'system',metadata:'{}',created_at:'2026-07-09T10:08:00Z'},
];
t('Replay: full transaction (9 events)', () => {
  const s = ReplayEngine.reconstructFromEvents(mkEv()); assert.strictEqual(s.currentState, STATES.CLOSED);
  assert.strictEqual(s.currentOwnerId, 'buyer-1'); assert.strictEqual(s.timeline.length, 9); assert.ok(s.replayValid);
});
t('Replay: detects invalid transitions', () => {
  const e = [{sequence_id:1,ticket_id:'tx-2',event_type:EVENTS.OWNERSHIP_VERIFIED,actor_id:'seller-1',metadata:'{}',created_at:'2026-07-09T10:00:00Z'},{sequence_id:2,ticket_id:'tx-2',event_type:EVENTS.SETTLEMENT_RELEASED,actor_id:'admin-1',metadata:'{}',created_at:'2026-07-09T10:01:00Z'}];
  assert.ok(!ReplayEngine.reconstructFromEvents(e).replayValid);
});
t('Replay: builds audit trail', () => {
  const a = ReplayEngine.buildAuditTrail(ReplayEngine.reconstructFromEvents(mkEv().slice(0,2)));
  assert.strictEqual(a.eventCount, 2); assert.ok(a.replayValid);
});
t('Replay: handles exception states', () => {
  const e = [{sequence_id:1,ticket_id:'tx-3',event_type:EVENTS.OWNERSHIP_VERIFIED,actor_id:'seller-1',metadata:'{}',created_at:'2026-07-09T10:00:00Z'},{sequence_id:2,ticket_id:'tx-3',event_type:EVENTS.EXCEPTION_RAISED,actor_id:'system',metadata:'{"reason":"timeout"}',created_at:'2026-07-09T10:01:00Z'},{sequence_id:3,ticket_id:'tx-3',event_type:EVENTS.EXCEPTION_RESOLVED,actor_id:'op-1',metadata:'{"resolvedState":"Listed"}',created_at:'2026-07-09T10:02:00Z'}];
  const s = ReplayEngine.reconstructFromEvents(e);
  assert.strictEqual(s.currentState, 'Listed'); assert.strictEqual(s.timeline.length, 3);
});


// === LEVEL 3: RECOVERY ===
console.log('\n--- Level 3: Recovery Engine Tests ---\n');
t('Recovery: payment timeout -> TIMEOUT_REFUND', () => {
  const r = RecoveryEngine.recover({ currentState: STATES.ESCROWED, error: { code: 'PAYMENT_TIMEOUT' }, transactionId: 'tx-1' });
  assert.strictEqual(r.action, 'TIMEOUT_REFUND'); assert.strictEqual(r.targetState, STATES.CLOSED);
});
t('Recovery: duplicate webhook -> IGNORE_DUPLICATE', () => {
  const r = RecoveryEngine.recover({ currentState: STATES.ESCROWED, error: { code: 'DUPLICATE_EVENT' }, transactionId: 'tx-1' });
  assert.strictEqual(r.action, 'IGNORE_DUPLICATE');
});
t('Recovery: network failure -> RETRY_TRANSFER', () => {
  const r = RecoveryEngine.recover({ currentState: STATES.TRANSFER_PENDING, error: { code: 'NETWORK_FAILURE' }, transactionId: 'tx-1' });
  assert.strictEqual(r.action, 'RETRY_TRANSFER');
});
t('Recovery: venue offline -> QUEUE_VENUE_SCAN', () => {
  const r = RecoveryEngine.recover({ currentState: STATES.VENUE_VERIFIED, error: { code: 'VENUE_OFFLINE' }, transactionId: 'tx-1' });
  assert.strictEqual(r.action, 'QUEUE_VENUE_SCAN'); assert.ok(r.requiresOperator);
});
t('Recovery: unknown error -> ESCALATE_TO_OPERATOR', () => {
  const r = RecoveryEngine.recover({ currentState: STATES.LISTED, error: { message: 'unknown' }, transactionId: 'tx-1' });
  assert.strictEqual(r.action, 'ESCALATE_TO_OPERATOR');
});
t('Recovery: retry limits by state', () => {
  assert.strictEqual(RecoveryEngine.getRetryAction(STATES.ESCROWED).maxRetries, 5);
  assert.strictEqual(RecoveryEngine.getRetryAction(STATES.EXCEPTION).maxRetries, 0);
});
t('Recovery: validateRecovery returns paths', () => {
  assert.ok(RecoveryEngine.validateRecovery(STATES.ESCROWED).paths.length > 0);
});

// === LEVEL 4: EVIDENCE ===
console.log('\n--- Level 4: Evidence Engine Tests ---\n');
t('Evidence: generates valid evidence', () => {
  const ev = EvidenceEngine.generateEventEvidence({ transactionId: 'tx-1', eventType: EVENTS.TRANSFER_VERIFIED, actorId: 'seller-1' });
  assert.ok(ev.evidenceId); assert.ok(ev.signature); assert.strictEqual(ev.actorId, 'seller-1');
});
t('Evidence: validates completeness', () => {
  const ev = EvidenceEngine.generateEventEvidence({ transactionId: 'tx-1', eventType: EVENTS.ESCROW_CREATED, actorId: 'buyer-1' });
  assert.ok(EvidenceEngine.validateEvidenceCompleteness(ev).complete);
});
t('Evidence: detects tampering', () => {
  const ev = EvidenceEngine.generateEventEvidence({ transactionId: 'tx-1', eventType: EVENTS.ESCROW_CREATED, actorId: 'buyer-1' });
  ev.signature = 'bad'; assert.ok(!EvidenceEngine.validateEvidenceCompleteness(ev).complete);
});
t('Evidence: generates audit records', () => {
  const ev = EvidenceEngine.generateEventEvidence({ transactionId: 'tx-1', eventType: EVENTS.SETTLEMENT_RELEASED, actorId: 'admin-1' });
  const audit = EvidenceEngine.generateAuditRecord(ev);
  assert.ok(audit.recordId.startsWith('aud-')); assert.ok(audit.summary.includes('SettlementReleased'));
});
t('Evidence: chains correctly', () => {
  const e1 = EvidenceEngine.generateEventEvidence({ transactionId: 'tx-1', eventType: EVENTS.OWNERSHIP_VERIFIED, actorId: 'seller-1' });
  const e2 = EvidenceEngine.generateEventEvidence({ transactionId: 'tx-1', eventType: EVENTS.LISTING_CREATED, actorId: 'seller-1' });
  const ch = EvidenceEngine.chainEvidence(e1, e2);
  assert.strictEqual(ch.previousSignature, e1.signature); assert.ok(ch.chainHash);
});
t('Evidence: minimum fields defined', () => {
  const f = EvidenceEngine.getMinimumEvidenceFields();
  assert.ok(f.includes('timestamp')); assert.ok(f.includes('signature')); assert.ok(f.includes('transactionId'));
});

// === RESULTS ===
console.log('\n=======================');
console.log('Results: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
console.log('=======================\n');
if (f > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED - Core Trust Loop validated'); process.exit(0); }

t('All states have recovery paths', () => StateMachine.getAllStates().forEach(s => assert.ok(StateMachine.getRecoveryPaths(s).length > 0)));
