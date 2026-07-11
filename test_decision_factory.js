const assert = require('assert');
const DecisionFactory = require('./src/decision/DecisionFactory');
const Decision = require('./src/decision/Decision');
const { ACTIONS, STATES } = require('./src/decision/decision.types');

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

console.log('\n=== DECISION FACTORY TEST SUITE ===\n');

t('DecisionFactory creates validated, frozen Decisions by default', () => {
  const dec = DecisionFactory.create({
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.APPROVE,
    confidence: 0.9
  });
  assert.ok(dec instanceof Decision);
  assert.strictEqual(dec.action, ACTIONS.APPROVE);
  assert.strictEqual(dec.confidence, 0.9);
  assert.ok(dec.isFrozen());
});

t('DecisionFactory throws an error on invalid schema parameters', () => {
  assert.throws(() => {
    DecisionFactory.create({
      executionId: 'exec-1',
      correlationId: 'corr-1',
      action: ACTIONS.APPROVE,
      confidence: 0 // Invariant fails: confidence cannot be 0 for APPROVE
    });
  }, /Decision Validation Failed/);
});

t('DecisionFactory can skip freezing if requested', () => {
  const dec = DecisionFactory.create({
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.APPROVE,
    confidence: 0.9
  }, { freeze: false });
  assert.ok(!dec.isFrozen());
});

t('DecisionFactory supports injection of custom ID and timestamp', () => {
  const dec = DecisionFactory.create({
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.APPROVE,
    confidence: 0.9
  }, {
    id: 'dec-custom-id',
    createdAt: '2026-07-11T12:00:00Z'
  });
  assert.strictEqual(dec.id, 'dec-custom-id');
  assert.strictEqual(dec.createdAt, '2026-07-11T12:00:00Z');
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
