const assert = require('assert');
const DecisionContext = require('./src/decision/DecisionContext');
const DecisionOrchestrator = require('./src/decision/DecisionOrchestrator');

console.log('\n=== ARGUS 10,000 ITERATIONS REPLAY DETERMINISM AUDIT ===\n');

const orchestrator = new DecisionOrchestrator();
const payload = {
  transaction: { transactionId: 'tx-rc-999', price: 5000, entityId: 'user-titan' },
  evidence: [{ id: 'ev-rc-9', type: 'IP_MATCH' }],
  risk: { id: 'rsk-rc-9', riskScore: 20, riskLevel: 'LOW' },
  inference: { id: 'inf-rc-9', prediction: 'GENUINE', probability: 0.98 },
  executionId: 'exec-titan',
  correlationId: 'corr-titan',
  timestamp: '2026-07-11T12:00:00Z'
};

const context = new DecisionContext(payload);
const baseline = orchestrator.evaluate(context);
const baselineHash = baseline.decision.hash();
const baselineSnapshotHash = baseline.snapshot.hash;

const runs = [100, 1000, 10000];

for (const loopCount of runs) {
  const start = Date.now();
  for (let i = 0; i < loopCount; i++) {
    const ctx = new DecisionContext(payload);
    const res = orchestrator.evaluate(ctx);
    assert.strictEqual(res.decision.action, baseline.decision.action);
    assert.strictEqual(res.decision.hash(), baselineHash);
    assert.strictEqual(res.snapshot.hash, baselineSnapshotHash);
  }
  const elapsed = Date.now() - start;
  console.log(`  \u2714 Verified ${loopCount.toLocaleString()} identical replay loops in ${elapsed}ms`);
}

console.log('\n\u2705 10,000 REPLAYS AUDIT PASSED: 100% REPRODUCIBILITY.');
