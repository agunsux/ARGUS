const assert = require('assert');
const PolicyCompiler = require('./src/policy/PolicyCompiler');
const PolicyDefinition = require('./src/policy/PolicyDefinition');
const Policy = require('./src/policy/Policy');
const fs = require('fs');
const path = require('path');

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

console.log('\n=== POLICY COMPILER TEST SUITE ===\n');

t('PolicyCompiler compiles a valid PolicyDefinition', () => {
  const def = new PolicyDefinition({
    id: 'test-policy',
    name: 'Test Policy',
    rules: [
      {
        id: 'excessive-risk',
        action: 'BLOCK',
        reasonCode: 'EXCESSIVE_RISK',
        constraints: [
          { field: 'facts.riskScore', operator: 'GREATER_THAN', value: 75 }
        ]
      }
    ]
  });

  const policy = PolicyCompiler.compile(def);
  assert.ok(policy instanceof Policy);
  assert.strictEqual(policy.id, 'test-policy');
  assert.strictEqual(policy.ruleSet.getRules().length, 1);
  assert.strictEqual(policy.ruleSet.getRules()[0].action, 'BLOCK');
});

t('PolicyCompiler loads and compiles from fixture JSON', () => {
  const jsonPath = path.resolve(__dirname, 'fixtures/policy/policy_fixture_v1.json');
  const jsonStr = fs.readFileSync(jsonPath, 'utf8');
  const raw = JSON.parse(jsonStr);

  const def = new PolicyDefinition(raw);
  const policy = PolicyCompiler.compile(def);

  assert.strictEqual(policy.id, 'fraud-mitigation-policy');
  assert.strictEqual(policy.ruleSet.getRules().length, 2);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
