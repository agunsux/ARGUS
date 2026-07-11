const assert = require('assert');
const KellyEngine = require('./src/recommendation/KellyEngine');
const ExposureCalculator = require('./src/recommendation/ExposureCalculator');
const PortfolioEngine = require('./src/recommendation/PortfolioEngine');
const RecommendationRanker = require('./src/recommendation/RecommendationRanker');
const RecommendationEngine = require('./src/recommendation/RecommendationEngine');
const RecommendationHistory = require('./src/recommendation/RecommendationHistory');
const RecommendationReplay = require('./src/recommendation/RecommendationReplay');
const { recommendationMetrics } = require('./src/recommendation/RecommendationMetrics');
const Decision = require('./src/decision/Decision');

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

console.log('\n=== EPIC H RECOMMENDATION PLATFORM TEST SUITE ===\n');

t('KellyEngine computes correct sizing fractions', () => {
  // f* = p - (1-p)/b
  // p = 0.8, b = 2.0 -> 0.8 - (0.2)/2 = 0.8 - 0.1 = 0.7
  const val = KellyEngine.calculate(0.8, 2.0);
  assert.strictEqual(val, 0.7);

  // Clamps negative fractions to 0
  const zeroVal = KellyEngine.calculate(0.2, 1.0); // 0.2 - 0.8/1 = -0.6 -> clamp to 0
  assert.strictEqual(zeroVal, 0.0);
});

t('ExposureCalculator calculates limit scale and enforces boundary checks', () => {
  const limitMax = ExposureCalculator.calculateLimit('ent-1', 100000, 100);
  assert.strictEqual(limitMax, 100000);

  const limitMid = ExposureCalculator.calculateLimit('ent-2', 100000, 50);
  assert.strictEqual(limitMid, 50000);

  assert.ok(ExposureCalculator.isExceeded(40000, 20000, 50000));
  assert.ok(!ExposureCalculator.isExceeded(20000, 20000, 50000));
});

t('PortfolioEngine tracks cumulative exposures per entity ID', () => {
  const pe = new PortfolioEngine();
  pe.recordTransaction('ent-1', 1500);
  pe.recordTransaction('ent-1', 2500);
  pe.recordTransaction('ent-2', 500);

  assert.strictEqual(pe.getExposure('ent-1'), 4000);
  assert.strictEqual(pe.getExposure('ent-2'), 500);
});

t('RecommendationRanker ranks recommendations by score descending', () => {
  const recs = [
    { priority: 'LOW', confidence: 0.9 }, // score = 0.9 * 1 = 0.9
    { priority: 'CRITICAL', confidence: 0.8 }, // score = 0.8 * 4 = 3.2
    { priority: 'HIGH', confidence: 0.9 } // score = 0.9 * 3 = 2.7
  ];

  const sorted = RecommendationRanker.rank(recs);
  assert.strictEqual(sorted[0].priority, 'CRITICAL');
  assert.strictEqual(sorted[1].priority, 'HIGH');
  assert.strictEqual(sorted[2].priority, 'LOW');
});

t('RecommendationEngine generates Recommendation from Decision', () => {
  const dec = new Decision({
    id: 'dec-1',
    entityId: 'ent-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: 'APPROVE',
    confidence: 0.95,
    explainability: {
      riskContributors: { price: 10000 }
    }
  });

  const pe = new PortfolioEngine();
  const engine = new RecommendationEngine(pe);
  const rec = engine.recommend(dec);

  assert.strictEqual(rec.decisionId, 'dec-1');
  assert.strictEqual(rec.recommendedAction, 'EXECUTE');
  assert.strictEqual(rec.priority, 'LOW');
  // price = 10000, p = 0.95, b = 2.0 -> f* = 0.95 - 0.05/2 = 0.925 -> size = 9250
  assert.strictEqual(rec.actions[0].value, 9250);
});

t('RecommendationEngine rejects transactions exceeding exposure limits', () => {
  const dec = new Decision({
    id: 'dec-1',
    entityId: 'ent-1',
    executionId: 'exec-1',
    correlationId: 'corr-1',
    action: 'APPROVE',
    confidence: 0.9,
    explainability: {
      riskContributors: { price: 80000 }
    }
  });

  const pe = new PortfolioEngine();
  pe.recordTransaction('ent-1', 40000); // current exposure = 40000
  // limit for trust = 50 and baseLimit = 100000 is 50000. 
  // current (40000) + tx amount (80000) = 120000 > 50000 -> Exceeded!

  const engine = new RecommendationEngine(pe);
  const rec = engine.recommend(dec, 50); // trustScore = 50 -> limit = 10000000 * 0.5 = 5000000. Let's force baseLimit = 100000
  
  // Wait! RecommendationEngine uses default baseLimit = 10000000 inside calculateLimit.
  // Let's check: limit for trust = 50 is 10000000 * 0.5 = 5000000.
  // Let's set the current exposure to 4950000 so adding 80000 (total = 5030000) exceeds 5000000!
  pe.clear();
  pe.recordTransaction('ent-1', 4950000);

  const recExceeded = engine.recommend(dec, 50);
  assert.strictEqual(recExceeded.recommendedAction, 'REJECT');
  assert.strictEqual(recExceeded.priority, 'CRITICAL');
  assert.strictEqual(recExceeded.actions[0].value, 0); // Size scaled back to 0
});

t('RecommendationReplay reconstructs recommendations correctly', () => {
  const decs = [
    new Decision({
      id: 'dec-1',
      entityId: 'ent-1',
      action: 'BLOCK',
      confidence: 0.9
    })
  ];
  const replay = new RecommendationReplay();
  const recs = replay.replayBatch(decs);
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0].recommendedAction, 'REJECT');
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
