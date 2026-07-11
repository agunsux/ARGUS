const assert = require('assert');
const Constraint = require('./src/policy/Constraint');
const Predicate = require('./src/policy/Predicate');
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

console.log('\n=== POLICY CONSTRAINT & PREDICATE TEST SUITE ===\n');

const cand = new DecisionCandidate({
  id: 'cand-1',
  transactionId: 'tx-1',
  facts: { riskScore: 80, isHighValue: true, tags: ['fraud', 'manual'] },
  rawScore: 80,
  rawConfidence: 0.9,
  executionId: 'exec-1',
  correlationId: 'corr-1'
});

t('Constraint GREATER_THAN works', () => {
  const c = new Constraint({ field: 'facts.riskScore', operator: 'GREATER_THAN', value: 75 });
  assert.ok(c.evaluate(cand));
});

t('Constraint LESS_THAN works', () => {
  const c = new Constraint({ field: 'facts.riskScore', operator: 'LESS_THAN', value: 90 });
  assert.ok(c.evaluate(cand));
});

t('Constraint EQUAL works', () => {
  const c = new Constraint({ field: 'facts.isHighValue', operator: 'EQUAL', value: true });
  assert.ok(c.evaluate(cand));
});

t('Constraint CONTAINS works on arrays', () => {
  const c = new Constraint({ field: 'facts.tags', operator: 'CONTAINS', value: 'fraud' });
  assert.ok(c.evaluate(cand));
});

t('Constraint IN works', () => {
  const c = new Constraint({ field: 'facts.riskScore', operator: 'IN', value: [50, 60, 80] });
  assert.ok(c.evaluate(cand));
});

t('Predicate AND combines constraints successfully', () => {
  const c1 = new Constraint({ field: 'facts.riskScore', operator: 'GREATER_THAN', value: 75 });
  const c2 = new Constraint({ field: 'facts.isHighValue', operator: 'EQUAL', value: true });
  const andPred = new Predicate('AND', [c1, c2]);
  assert.ok(andPred.evaluate(cand));
});

t('Predicate OR combines constraints successfully', () => {
  const c1 = new Constraint({ field: 'facts.riskScore', operator: 'LESS_THAN', value: 50 }); // false
  const c2 = new Constraint({ field: 'facts.isHighValue', operator: 'EQUAL', value: true }); // true
  const orPred = new Predicate('OR', [c1, c2]);
  assert.ok(orPred.evaluate(cand));
});

t('Predicate NOT negates constraint successfully', () => {
  const c = new Constraint({ field: 'facts.riskScore', operator: 'LESS_THAN', value: 50 }); // false
  const notPred = new Predicate('NOT', [c]);
  assert.ok(notPred.evaluate(cand));
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
