const assert = require('assert');
const DecisionValidator = require('./src/decision/DecisionValidator');
const Decision = require('./src/decision/Decision');
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

console.log('\n=== DECISION VALIDATOR TEST SUITE ===\n');

t('DecisionValidator validates correct Decision', () => {
  const dec = new Decision({
    id: 'dec-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.APPROVE,
    confidence: 0.9
  });
  const res = DecisionValidator.validate(dec);
  assert.ok(res.valid, res.errors.join('; '));
});

t('DecisionValidator rejects non-Decision instances', () => {
  const res = DecisionValidator.validate({ action: ACTIONS.APPROVE });
  assert.ok(!res.valid);
  assert.strictEqual(res.errors[0], 'Object must be an instance of Decision');
});

t('DecisionValidator rejects non-APPROVE action without reason codes', () => {
  const dec = new Decision({
    id: 'dec-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.BLOCK,
    confidence: 0.1,
    reasonCodes: [] // Empty!
  });
  const res = DecisionValidator.validate(dec);
  assert.ok(!res.valid);
  assert.ok(res.errors.join('; ').includes('reasonCodes cannot be empty for actions other than APPROVE'));
});

t('DecisionValidator rejects APPROVED decision with zero confidence', () => {
  const dec = new Decision({
    id: 'dec-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.APPROVE,
    confidence: 0 // Zero!
  });
  const res = DecisionValidator.validate(dec);
  assert.ok(!res.valid);
  assert.ok(res.errors.join('; ').includes('confidence cannot be 0 for APPROVED decisions'));
});

t('DecisionValidator rejects BLOCKED decision with empty riskIds', () => {
  const dec = new Decision({
    id: 'dec-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: ACTIONS.BLOCK,
    confidence: 0.9,
    reasonCodes: ['HIGH_RISK_DETECTED'],
    riskIds: [] // Empty!
  });
  const res = DecisionValidator.validate(dec);
  assert.ok(!res.valid);
  assert.ok(res.errors.join('; ').includes('riskIds cannot be empty for BLOCKED decisions'));
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
