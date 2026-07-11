"use strict";

const assert = require('assert');
const ModelCandidate = require('./src/evolution/ModelCandidate');
const ModelComparison = require('./src/evolution/ModelComparison');
const ChampionRegistry = require('./src/evolution/ChampionRegistry');
const ChallengerRegistry = require('./src/evolution/ChallengerRegistry');
const CanaryRegistry = require('./src/evolution/CanaryRegistry');
const ThresholdPolicy = require('./src/evolution/ThresholdPolicy');
const EvidenceComparator = require('./src/evolution/EvidenceComparator');
const EvolutionEngine = require('./src/evolution/EvolutionEngine');

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

console.log('\n=== OLYMPUS MODEL EVOLUTION TEST SUITE ===\n');

t('ModelCandidate contract validates schema fields', () => {
  const model = new ModelCandidate({
    id: 'cand-1',
    entityId: 'user-a',
    modelId: 'xgboost-v2',
    semver: '2.0.0',
    state: 'SHADOW',
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const val = model.validate();
  assert.ok(val.valid);
  assert.strictEqual(model.modelId, 'xgboost-v2');
  assert.strictEqual(model.state, 'SHADOW');
});

t('Champion, Challenger, and Canary registries manage states correctly', () => {
  const champReg = new ChampionRegistry();
  const chalReg = new ChallengerRegistry();
  const canaryReg = new CanaryRegistry();

  const modelA = new ModelCandidate({
    id: 'm1',
    entityId: 'evolution-sys',
    modelId: 'mod-1',
    state: 'CHAMPION',
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  champReg.setActive(modelA);
  assert.strictEqual(champReg.getActive().modelId, 'mod-1');

  chalReg.register(modelA);
  assert.strictEqual(chalReg.get('mod-1').modelId, 'mod-1');
  assert.strictEqual(chalReg.list().length, 1);

  canaryReg.setCanary(modelA, 15);
  canaryReg.recordFailure(0.08); // Breaches threshold of 0.05
  assert.ok(canaryReg.isBreached());
});

t('ThresholdPolicy detects promotion indicators', () => {
  const compOk = new ModelComparison({
    id: 'comp-1',
    entityId: 'sys',
    challengerId: 'c1',
    championId: 'c2',
    metricsDifference: { precision: 0.02, recall: 0.0, logLoss: -0.05 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  assert.ok(ThresholdPolicy.shouldPromote(compOk));

  const compDegraded = new ModelComparison({
    id: 'comp-2',
    entityId: 'sys',
    challengerId: 'c1',
    championId: 'c2',
    metricsDifference: { precision: 0.005, recall: -0.01, logLoss: 0.01 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  assert.ok(!ThresholdPolicy.shouldPromote(compDegraded));
});

t('EvolutionEngine promotes challenger model when conditions hold', () => {
  const champReg = new ChampionRegistry();
  const chalReg = new ChallengerRegistry();
  const canaryReg = new CanaryRegistry();
  const engine = new EvolutionEngine(champReg, chalReg, canaryReg);

  const champion = new ModelCandidate({
    id: 'champ',
    entityId: 'sys',
    modelId: 'champ-v1',
    semver: '1.0.0',
    state: 'CHAMPION',
    performanceMetrics: { precision: 0.90, recall: 0.90, logLoss: 0.20 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const challenger = new ModelCandidate({
    id: 'chall',
    entityId: 'sys',
    modelId: 'chall-v2',
    semver: '2.0.0',
    state: 'SHADOW',
    performanceMetrics: { precision: 0.92, recall: 0.90, logLoss: 0.15 },
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  champReg.setActive(champion);
  chalReg.register(challenger);

  const res = engine.evaluatePromotion(challenger, champion, 'exec-1', 'corr-1');
  assert.ok(res.promoted);
  assert.strictEqual(champReg.getActive().modelId, 'chall-v2');
  assert.strictEqual(champReg.getActive().state, 'CHAMPION');
  assert.strictEqual(champion.state, 'RETIRED');
});

t('EvolutionEngine triggers rollback when canary fails', () => {
  const champReg = new ChampionRegistry();
  const chalReg = new ChallengerRegistry();
  const canaryReg = new CanaryRegistry();
  const engine = new EvolutionEngine(champReg, chalReg, canaryReg);

  const champion = new ModelCandidate({
    id: 'champ',
    entityId: 'sys',
    modelId: 'champ-v1',
    state: 'CHAMPION',
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });
  const canary = new ModelCandidate({
    id: 'canary',
    entityId: 'sys',
    modelId: 'canary-v2',
    state: 'CANARY',
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  champReg.setActive(champion);
  canaryReg.setCanary(canary, 10);
  canaryReg.recordFailure(0.12); // Breached!

  const rollbackRes = engine.evaluateRollback('exec-1', 'corr-1');
  assert.ok(rollbackRes.rollbackTriggered);
  assert.strictEqual(rollbackRes.decision.rolledBackTo, 'champ-v1');
  assert.strictEqual(canary.state, 'ROLLED_BACK');
  assert.strictEqual(canaryReg.getCanary(), null);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
