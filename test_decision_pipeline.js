const assert = require('assert');
const { DecisionPipeline } = require('./src/decision/DecisionPipeline');
const DecisionEngine = require('./src/decision/DecisionEngine');
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

console.log('\n=== DECISION PIPELINE TEST SUITE ===\n');

t('DecisionPipeline runs all 8 stages sequentially', () => {
  const engine = new DecisionEngine();
  const pipeline = new DecisionPipeline(engine);
  
  const ctx = new DecisionContext({
    transaction: { transactionId: 'tx-123', price: 100 },
    evidence: [{ id: 'evd-1' }],
    risk: { id: 'rsk-1', riskScore: 10, riskLevel: 'LOW' },
    inference: { id: 'inf-1', prediction: 'GENUINE', probability: 0.95 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const state = pipeline.run(ctx);
  assert.ok(state.decision);
  assert.ok(state.snapshot);
  assert.strictEqual(state.trace.length, 8); // 8 stages
  assert.strictEqual(state.trace[0].stageName, 'ContextValidation');
  assert.strictEqual(state.trace[7].stageName, 'Snapshot');
});

t('DecisionPipeline fails fast if context validation fails', () => {
  const engine = new DecisionEngine();
  const pipeline = new DecisionPipeline(engine);
  
  const invalidCtx = new DecisionContext({
    executionId: '', // Invalid
    correlationId: 'corr-1'
  });

  assert.throws(() => {
    pipeline.run(invalidCtx);
  }, /Stage 1 \(ContextValidation\) failed/);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
