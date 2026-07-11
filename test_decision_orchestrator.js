const assert = require('assert');
const DecisionOrchestrator = require('./src/decision/DecisionOrchestrator');
const DecisionContext = require('./src/decision/DecisionContext');

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

console.log('\n=== DECISION ORCHESTRATOR & REPLAY DETERMINISM TEST SUITE ===\n');

t('DecisionOrchestrator runs pipeline to generate decision and snapshot', () => {
  const orchestrator = new DecisionOrchestrator();
  const ctx = new DecisionContext({
    transaction: { transactionId: 'tx-123', price: 100 },
    evidence: [{ id: 'evd-1' }],
    risk: { id: 'rsk-1', riskScore: 10, riskLevel: 'LOW' },
    inference: { id: 'inf-1', prediction: 'GENUINE', probability: 0.9 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const res = orchestrator.evaluate(ctx);
  assert.ok(res.decision);
  assert.ok(res.snapshot);
  assert.strictEqual(res.decision.action, 'APPROVE');
});

t('Replay Determinism: Orchestrator outputs identical Decisions and SHA-256 hashes for identical inputs', () => {
  const orchestrator = new DecisionOrchestrator();
  
  const payload = {
    transaction: { transactionId: 'tx-123', price: 15000000 }, // High value -> REVIEW
    evidence: [{ id: 'evd-1' }],
    risk: { id: 'rsk-1', riskScore: 40, riskLevel: 'MEDIUM' },
    inference: { id: 'inf-1', prediction: 'GENUINE', probability: 0.8 },
    executionId: 'exec-1',
    correlationId: 'corr-1',
    timestamp: '2026-07-11T12:00:00Z' // Frozen timestamp for determinism
  };

  const ctxA = new DecisionContext(payload);
  const ctxB = new DecisionContext(payload);

  const resA = orchestrator.evaluate(ctxA);
  const resB = orchestrator.evaluate(ctxB);

  // Assert exact structural match of serialized payloads
  assert.strictEqual(resA.decision.serialize(), resB.decision.serialize());
  // Assert hash stability
  assert.strictEqual(resA.decision.hash(), resB.decision.hash());
  assert.strictEqual(resA.snapshot.hash, resB.snapshot.hash);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
