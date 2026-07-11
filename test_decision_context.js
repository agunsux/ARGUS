const assert = require('assert');
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

console.log('\n=== DECISION CONTEXT TEST SUITE ===\n');

t('DecisionContext validates successfully with proper properties', () => {
  const ctx = new DecisionContext({
    transaction: { transactionId: 'tx-123', price: 100 },
    evidence: [{ id: 'evd-1' }],
    risk: { riskScore: 10 },
    inference: { prediction: 'GENUINE' },
    features: { history_length: 5 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  const res = ctx.validate();
  assert.ok(res.valid, res.errors.join('; '));
});

t('DecisionContext rejects when transaction is missing or invalid', () => {
  const ctx = new DecisionContext({
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  const res = ctx.validate();
  assert.ok(!res.valid);
  assert.ok(res.errors.join('; ').includes('transaction must be a valid object'));
});

t('DecisionContext rejects when executionId or correlationId is missing', () => {
  const ctx = new DecisionContext({
    transaction: { transactionId: 'tx-123' }
  });
  const res = ctx.validate();
  assert.ok(!res.valid);
  assert.ok(res.errors.join('; ').includes('executionId is required'));
  assert.ok(res.errors.join('; ').includes('correlationId is required'));
});

t('DecisionContext clone does not share nested references', () => {
  const ctx = new DecisionContext({
    transaction: { transactionId: 'tx-123' },
    features: { counter: 1 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  const cloned = ctx.clone();
  cloned.features.counter = 2;
  assert.strictEqual(ctx.features.counter, 1);
  assert.strictEqual(cloned.features.counter, 2);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
