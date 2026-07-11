const assert = require('assert');
const ScenarioLibrary = require('./src/replay/ScenarioLibrary');
const ReplayScenarioRepository = require('./src/replay/ReplayScenarioRepository');
const AttackSimulator = require('./src/replay/AttackSimulator');
const HistoricalAttackPlayer = require('./src/replay/HistoricalAttackPlayer');
const DecisionComparator = require('./src/replay/DecisionComparator');
const ReplayEngine = require('./src/replay/ReplayEngine');
const ExperimentRegistry = require('./src/replay/ExperimentRegistry');
const ExperimentRunner = require('./src/replay/ExperimentRunner');
const DecisionOrchestrator = require('./src/decision/DecisionOrchestrator');

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

console.log('\n=== PHASE 18 HISTORICAL INTELLIGENCE REPLAY TEST SUITE ===\n');

t('ScenarioLibrary returns templates for all required fraud types', () => {
  const templates = ScenarioLibrary.getTemplates();
  const keys = Object.keys(templates);
  assert.ok(keys.includes('marketplace-scam'));
  assert.ok(keys.includes('investment-fraud'));
  assert.ok(keys.includes('otp-theft'));
  assert.ok(keys.includes('apk-malware'));
  assert.ok(keys.includes('courier-scam'));
  assert.ok(keys.includes('romance-scam'));
  assert.ok(keys.includes('fake-bank'));
  assert.ok(keys.includes('loan-scam'));
  assert.ok(keys.includes('qr-scam'));
});

t('AttackSimulator generates randomized simulation spikes', () => {
  const spikes = AttackSimulator.generateSpike('marketplace-scam', 3);
  assert.strictEqual(spikes.length, 3);
  assert.strictEqual(spikes[0].transactions[0].actorRole, 'buyer');
  assert.ok(spikes[0].risk.riskScore >= 0 && spikes[0].risk.riskScore <= 100);
});

t('HistoricalAttackPlayer plays scenario through DecisionOrchestrator', () => {
  const scenario = ScenarioLibrary.get('marketplace-scam');
  const player = new HistoricalAttackPlayer();
  const results = player.play(scenario);
  assert.strictEqual(results.length, scenario.transactions.length);
  assert.ok(results[0].decision);
  assert.ok(results[0].snapshot);
});

t('DecisionComparator correctly calculates Precision, Recall, and F1', () => {
  const actual = [
    { transactionId: 'tx-1', decision: 'BLOCK' },
    { transactionId: 'tx-2', decision: 'BLOCK' },
    { transactionId: 'tx-3', decision: 'APPROVE' }
  ];
  const target = [
    { transactionId: 'tx-1', action: 'BLOCK' }, // TP
    { transactionId: 'tx-2', action: 'APPROVE' }, // FP
    { transactionId: 'tx-3', action: 'BLOCK' } // FN
  ];

  const report = DecisionComparator.compare(actual, target);
  assert.strictEqual(report.precision, 0.5); // TP/(TP+FP) = 1/(1+1) = 0.5
  assert.strictEqual(report.recall, 0.5); // TP/(TP+FN) = 1/(1+1) = 0.5
  assert.strictEqual(report.f1, 0.5);
});

t('ReplayEngine coordinates counterfactual replays', () => {
  const engine = new ReplayEngine(new DecisionOrchestrator());
  const scenario = ScenarioLibrary.get('investment-fraud');
  
  // Revised orchestrator with policy evaluator that blocks everything
  const mockEvaluator = {
    evaluate: () => ({ decision: 'BLOCK', reasonCodes: ['FORCE_BLOCK'], matchedRules: [] })
  };
  const revisedOrch = new DecisionOrchestrator(mockEvaluator);

  const report = engine.replayCounterfactual([scenario], revisedOrch);
  assert.ok(report.precision !== undefined);
  assert.ok(report.f1 !== undefined);
});

t('ExperimentRunner registers report correctly', () => {
  const registry = new ExperimentRegistry();
  const runner = new ExperimentRunner(registry);
  const scenario = ScenarioLibrary.get('otp-theft');

  const target = [
    { transactionId: 'tx-otp1-sim-1', action: 'BLOCK' }
  ];

  const simScenarios = AttackSimulator.generateSpike('otp-theft', 1);

  const report = runner.run('exp-1', 'Test Run', simScenarios, target);
  assert.strictEqual(registry.listExperiments().length, 1);
  assert.strictEqual(registry.getExperiment('exp-1').name, 'Test Run');
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
