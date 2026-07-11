const assert = require('assert');
const PolicyEvaluation = require('./src/policy/PolicyEvaluation');

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

console.log('\n=== POLICY EVALUATION TEST SUITE ===\n');

t('PolicyEvaluation validates with correct fields', () => {
  const ev = new PolicyEvaluation({
    id: 'pev-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    policyId: 'policy-1',
    matchedRules: ['rule-1'],
    decision: 'BLOCK',
    confidence: 0.8
  });
  const res = ev.validate();
  assert.ok(res.valid, res.errors.join('; '));
});

t('PolicyEvaluation rejects invalid confidence', () => {
  const ev = new PolicyEvaluation({
    id: 'pev-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    policyId: 'policy-1',
    decision: 'BLOCK',
    confidence: 1.5 // Invalid
  });
  const res = ev.validate();
  assert.ok(!res.valid);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
