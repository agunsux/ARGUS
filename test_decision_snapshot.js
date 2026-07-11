const assert = require('assert');
const DecisionSnapshot = require('./src/decision/DecisionSnapshot');
const DecisionFactory = require('./src/decision/DecisionFactory');
const { ACTIONS } = require('./src/decision/decision.types');

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

console.log('\n=== DECISION SNAPSHOT TEST SUITE ===\n');

t('DecisionSnapshot captures and validates decision integrity', () => {
  const dec = DecisionFactory.create({
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.APPROVE,
    confidence: 0.95
  });

  const snap = DecisionSnapshot.capture(dec);
  assert.strictEqual(snap.decisionId, dec.id);
  assert.strictEqual(snap.hash, dec.hash());
  assert.ok(snap.verifyIntegrity(dec));
});

t('DecisionSnapshot verifyIntegrity detects tampered decision', () => {
  const dec = DecisionFactory.create({
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.APPROVE,
    confidence: 0.95
  });

  const snap = DecisionSnapshot.capture(dec);

  // Create cloned decision and mutate it
  const mutated = dec.clone();
  mutated.action = ACTIONS.BLOCK;
  mutated.reasonCodes = ['MANUAL_TAMPER'];
  mutated.freeze();

  assert.ok(!snap.verifyIntegrity(mutated));
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
