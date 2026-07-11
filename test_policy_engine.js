const assert = require('assert');
const PolicyEngine = require('./src/policy/PolicyEngine');
const PolicyCompiler = require('./src/policy/PolicyCompiler');
const PolicyDefinition = require('./src/policy/PolicyDefinition');
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

console.log('\n=== POLICY ENGINE TEST SUITE ===\n');

const definition = new PolicyDefinition({
  id: 'standard-fraud-policy',
  name: 'Standard Fraud Policy',
  rules: [
    {
      id: 'high-risk-block',
      action: 'BLOCK',
      reasonCode: 'EXCESSIVE_RISK',
      constraints: [
        { field: 'facts.riskScore', operator: 'GREATER_THAN', value: 75 }
      ]
    },
    {
      id: 'high-value-review',
      action: 'REVIEW',
      reasonCode: 'HIGH_VALUE_TRANSACTION',
      constraints: [
        { field: 'facts.isHighValue', operator: 'EQUAL', value: true }
      ]
    }
  ]
});

const policy = PolicyCompiler.compile(definition);
const engine = new PolicyEngine();

t('PolicyEngine matches BLOCK rule when riskScore is high', () => {
  const cand = new DecisionCandidate({
    id: 'cand-1',
    transactionId: 'tx-1',
    facts: { riskScore: 80, isHighValue: false },
    rawScore: 80,
    rawConfidence: 0.9,
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const evaluation = engine.evaluate(policy, cand);
  assert.strictEqual(evaluation.decision, 'BLOCK');
  assert.ok(evaluation.matchedRules.includes('high-risk-block'));
  assert.ok(!evaluation.matchedRules.includes('high-value-review'));
  assert.strictEqual(evaluation.reasonCodes[0], 'EXCESSIVE_RISK');
});

t('PolicyEngine matches REVIEW rule when isHighValue is true', () => {
  const cand = new DecisionCandidate({
    id: 'cand-2',
    transactionId: 'tx-2',
    facts: { riskScore: 20, isHighValue: true },
    rawScore: 20,
    rawConfidence: 0.95,
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const evaluation = engine.evaluate(policy, cand);
  assert.strictEqual(evaluation.decision, 'REVIEW');
  assert.ok(evaluation.matchedRules.includes('high-value-review'));
  assert.strictEqual(evaluation.reasonCodes[0], 'HIGH_VALUE_TRANSACTION');
});

t('PolicyEngine defaults to APPROVE when no rules match', () => {
  const cand = new DecisionCandidate({
    id: 'cand-3',
    transactionId: 'tx-3',
    facts: { riskScore: 10, isHighValue: false },
    rawScore: 10,
    rawConfidence: 0.99,
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const evaluation = engine.evaluate(policy, cand);
  assert.strictEqual(evaluation.decision, 'APPROVE');
  assert.strictEqual(evaluation.matchedRules.length, 0);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
