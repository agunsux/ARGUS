const assert = require('assert');
const DecisionCandidate = require('./src/decision/DecisionCandidate');

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

console.log('\n=== DECISION CANDIDATE TEST SUITE ===\n');

t('DecisionCandidate validates correctly with proper fields', () => {
  const cand = new DecisionCandidate({
    id: 'cand-123',
    transactionId: 'tx-123',
    facts: { isHighValue: false, price: 1000 },
    inferences: [],
    risks: [],
    evidenceIds: ['evd-1'],
    rawScore: 10,
    rawConfidence: 0.8,
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  const res = cand.validate();
  assert.ok(res.valid, res.errors.join('; '));
});

t('DecisionCandidate rejects invalid confidence or risk scores', () => {
  const cand = new DecisionCandidate({
    transactionId: 'tx-123',
    rawScore: 105, // Invalid (> 100)
    rawConfidence: -0.5, // Invalid (< 0)
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  const res = cand.validate();
  assert.ok(!res.valid);
  assert.ok(res.errors.length >= 2);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
