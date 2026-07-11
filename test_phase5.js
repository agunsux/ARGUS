const { execSync } = require('child_process');
const path = require('path');

/**
 * Phase 5 Decision Domain Test Aggregator
 * 
 * Sequentially executes all granular unit and integration test suites
 * to enforce isolated validation gates.
 */

const suites = [
  'test_decision_context.js',
  'test_decision_factory.js',
  'test_decision_validator.js',
  'test_decision_candidate.js',
  'test_decision_pipeline.js',
  'test_decision_orchestrator.js',
  'test_decision_snapshot.js',
  'test_policy_constraint.js',
  'test_policy_rule.js',
  'test_policy_compiler.js',
  'test_policy_registry.js',
  'test_policy_engine.js',
  'test_policy_evaluation.js',
  'test_policy_metrics.js'
];

console.log('\n==================================================');
console.log('ARGUS PHASE 5 AGGREGATOR RUNNER');
console.log('==================================================\n');

let failed = false;
for (const suite of suites) {
  try {
    console.log(`Running suite: ${suite}...`);
    execSync(`node ${suite}`, { stdio: 'inherit', cwd: __dirname });
    console.log(`\n\u2714 ${suite} PASSED\n--------------------------------------------------\n`);
  } catch (err) {
    console.error(`\n\u2717 ${suite} FAILED`);
    failed = true;
    break;
  }
}

if (failed) {
  console.error('\n!!! ONE OR MORE TEST SUITES FAILED !!!\n');
  process.exit(1);
} else {
  console.log('\n\u2705 ALL TEST SUITES PASSED SUCCESSFULLY - Sprint 5.1 & 5.2 Validated\n');
  process.exit(0);
}
