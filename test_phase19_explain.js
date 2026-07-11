const assert = require('assert');
const Decision = require('./src/decision/Decision');
const PolicyEvaluation = require('./src/policy/PolicyEvaluation');
const ExplanationEngine = require('./src/explain/ExplanationEngine');

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

console.log('\n=== PHASE 19 EXPLAINABILITY PLATFORM TEST SUITE ===\n');

const decision = new Decision({
  id: 'dec-1',
  action: 'BLOCK',
  confidence: 0.95,
  executionId: 'exec-1',
  correlationId: 'corr-1',
  createdAt: '2026-07-11T12:00:00Z',
  entityId: 'ent-buyer-123',
  riskIds: ['rsk-velocity-high'],
  inferenceIds: ['inf-fraud-predicted'],
  explainability: {
    why: 'Blocked due to rapid consecutive high-value transactions.'
  }
});

const evaluation = new PolicyEvaluation({
  policyId: 'fraud-mitigation-policy',
  matchedRules: ['excessive-risk'],
  failedRules: ['high-value-review'],
  decision: 'BLOCK',
  confidence: 0.95,
  reasonCodes: ['EXCESSIVE_RISK'],
  supportingEvidence: ['kyc_check'],
  contradictingEvidence: [],
  missingEvidence: ['whitelist_exception'],
  evaluationTrace: [{ ruleId: 'excessive-risk', matched: true }]
});

t('ExplanationEngine formats output to JSON by default', () => {
  const res = ExplanationEngine.explain(decision, evaluation, 'json');
  assert.ok(res.human);
  assert.ok(res.technical);
  assert.strictEqual(res.human.why, 'The transaction was blocked due to critical security policy violations.');
  assert.strictEqual(res.technical.decision.action, 'BLOCK');
});

t('ExplanationEngine formats output to raw Human narrative text', () => {
  const res = ExplanationEngine.explain(decision, evaluation, 'human');
  assert.ok(typeof res === 'string');
  assert.ok(res.includes('Summary: The transaction was blocked'));
  assert.ok(res.includes('Evidence: Supported by: kyc_check; Missing requirements: whitelist_exception'));
});

t('ExplanationEngine formats output to Markdown report', () => {
  const res = ExplanationEngine.explain(decision, evaluation, 'markdown');
  assert.ok(typeof res === 'string');
  assert.ok(res.includes('# ARGUS Decision Explainability Profile'));
  assert.ok(res.includes('**Decision ID:** dec-1'));
  assert.ok(res.includes('whitelist_exception'));
});

t('ExplanationEngine formats output to Technical specifications object', () => {
  const res = ExplanationEngine.explain(decision, evaluation, 'technical');
  assert.ok(res.decision);
  assert.strictEqual(res.decision.decisionId, 'dec-1');
  assert.strictEqual(res.rules.matchedRules[0], 'excessive-risk');
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
