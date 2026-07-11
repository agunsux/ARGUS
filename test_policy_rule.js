const assert = require('assert');
const PolicyRule = require('./src/policy/PolicyRule');
const RuleSet = require('./src/policy/RuleSet');
const Constraint = require('./src/policy/Constraint');
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

console.log('\n=== POLICY RULE TEST SUITE ===\n');

const cand = new DecisionCandidate({
  id: 'cand-1',
  transactionId: 'tx-1',
  facts: { riskScore: 80 },
  rawScore: 80,
  rawConfidence: 0.9,
  executionId: 'exec-1',
  correlationId: 'corr-1'
});

t('PolicyRule evaluates constraints correctly', () => {
  const r = new PolicyRule({
    id: 'rule-1',
    action: 'BLOCK',
    reasonCode: 'EXCESSIVE_RISK',
    constraints: [
      new Constraint({ field: 'facts.riskScore', operator: 'GREATER_THAN', value: 75 })
    ]
  });
  assert.ok(r.evaluate(cand));
});

t('RuleSet can collect and list rules', () => {
  const rs = new RuleSet();
  const r1 = new PolicyRule({ id: 'r1' });
  const r2 = new PolicyRule({ id: 'r2' });
  rs.add(r1);
  rs.add(r2);
  assert.strictEqual(rs.getRules().length, 2);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
