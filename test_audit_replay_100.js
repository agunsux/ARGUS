const assert = require('assert');
const DecisionContext = require('./src/decision/DecisionContext');
const DecisionOrchestrator = require('./src/decision/DecisionOrchestrator');

console.log('\n=== ARGUS 100 ITERATIONS REPLAY DETERMINISM AUDIT ===\n');

const orchestrator = new DecisionOrchestrator();
const payload = {
  transaction: { transactionId: 'tx-123', price: 2000, entityId: 'user-777' },
  evidence: [{ id: 'ev-1', type: 'IP_MATCH' }],
  risk: { id: 'rsk-1', riskScore: 15, riskLevel: 'LOW' },
  inference: { id: 'inf-1', prediction: 'GENUINE', probability: 0.99 },
  executionId: 'exec-1',
  correlationId: 'corr-1',
  timestamp: '2026-07-11T12:00:00Z'
};

const results = [];
for (let i = 0; i < 100; i++) {
  const ctx = new DecisionContext(payload);
  const res = orchestrator.evaluate(ctx);
  results.push({
    action: res.decision.action,
    hash: res.decision.hash(),
    snapshotHash: res.snapshot.hash
  });
}

// Assert all 100 runs match the first run
const first = results[0];
for (let i = 1; i < 100; i++) {
  assert.strictEqual(results[i].action, first.action);
  assert.strictEqual(results[i].hash, first.hash);
  assert.strictEqual(results[i].snapshotHash, first.snapshotHash);
}

console.log(`  \u2714 Ran 100 isolated replays`);
console.log(`  \u2714 All 100 runs produced identical action: "${first.action}"`);
console.log(`  \u2714 All 100 runs matched decision hash: "${first.hash}"`);
console.log(`  \u2714 All 100 runs matched snapshot hash: "${first.snapshotHash}"`);
console.log(`\n\u2705 100 REPLAYS AUDIT PASSED: 100% REPRODUCIBILITY.`);
