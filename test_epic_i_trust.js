const assert = require('assert');
const TrustScore = require('./src/trust/TrustScore');
const TrustGraph = require('./src/trust/TrustGraph');
const TrustSignals = require('./src/trust/TrustSignals');
const TrustEvolution = require('./src/trust/TrustEvolution');
const TrustHistory = require('./src/trust/TrustHistory');
const TrustRecommendation = require('./src/trust/TrustRecommendation');
const TrustDashboard = require('./src/trust/TrustDashboard');
const { KnowledgeGraph } = require('./src/graph/graph');
const { GraphNode } = require('./src/graph/node');
const { GraphEdge } = require('./src/graph/edge');

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

console.log('\n=== EPIC I TRUST INTELLIGENCE TEST SUITE ===\n');

t('TrustScore contract instantiates and validates correctly', () => {
  const ts = new TrustScore({
    id: 'ts-1',
    entityId: 'user-a',
    entityType: 'user',
    trustScore: 90,
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const val = ts.validate();
  assert.ok(val.valid);
  assert.strictEqual(ts.trustScore, 90);
});

t('TrustGraph propagates trust across linked node networks', () => {
  const kg = new KnowledgeGraph();
  const nodeA = new GraphNode({ id: 'user-a', type: 'user' });
  const nodeB = new GraphNode({ id: 'user-b', type: 'user' });
  const edge = new GraphEdge({ id: 'edge-1', source: 'user-a', target: 'user-b', relationship: 'associated_with' });

  kg.addNode(nodeA);
  kg.addNode(nodeB);
  kg.addEdge(edge);

  const tg = new TrustGraph(kg);
  tg.setTrustScore('user-a', 90);
  tg.setTrustScore('user-b', 50);

  // Network trust for user-a should be (90 + 50) / 2 = 70
  const netTrust = tg.calculateNetworkTrust('user-a');
  assert.strictEqual(netTrust, 70);
});

t('TrustSignals extracts correct modifiers based on failures/successes', () => {
  const signalsNoHistory = TrustSignals.resolveSignals('user-a', []);
  assert.strictEqual(signalsNoHistory[0].type, 'NO_HISTORY');

  const history = [
    { result: 'SUCCESS' },
    { result: 'SUCCESS' },
    { result: 'SUCCESS' },
    { result: 'SUCCESS' },
    { result: 'SUCCESS' }
  ];
  const signalsSuccess = TrustSignals.resolveSignals('user-a', history);
  assert.strictEqual(signalsSuccess[0].type, 'ESTABLISHED_HISTORY');
  assert.strictEqual(signalsSuccess[0].scoreModifier, 15);

  const historyFailure = [
    { result: 'FAILURE' },
    { result: 'FAILURE' }
  ];
  const signalsFailure = TrustSignals.resolveSignals('user-a', historyFailure);
  assert.strictEqual(signalsFailure[0].type, 'RECENT_FAILURES');
  assert.strictEqual(signalsFailure[0].scoreModifier, -20); // -10 * 2
});

t('TrustEvolution updates scores with passive growth and decays', () => {
  const evolvedDecay = TrustEvolution.evolve(90, [{ scoreModifier: -20 }]);
  assert.strictEqual(evolvedDecay, 70);

  // Passive growth when score < 100 and no negative signals
  // 90 + 0.05 * (100 - 90) = 90 + 0.5 = 90.5 -> round to 91
  const evolvedGrowth = TrustEvolution.evolve(90, [], 0.05);
  assert.strictEqual(evolvedGrowth, 91);
});

t('TrustRecommendation resolves correct action flags', () => {
  assert.strictEqual(TrustRecommendation.recommendAction(20), 'SUSPEND');
  assert.strictEqual(TrustRecommendation.recommendAction(50), 'VERIFY');
  assert.strictEqual(TrustRecommendation.recommendAction(70), 'MONITOR');
  assert.strictEqual(TrustRecommendation.recommendAction(90), 'NONE');
});

t('TrustDashboard aggregates distributions correctly', () => {
  const scores = new Map([
    ['user-a', 90],
    ['user-b', 65],
    ['user-c', 40]
  ]);
  const stats = TrustDashboard.generateDashboard(scores);
  assert.strictEqual(stats.averageTrustScore, 65); // (90+65+40)/3 = 195/3 = 65
  assert.strictEqual(stats.excellentCount, 1);
  assert.strictEqual(stats.goodCount, 1);
  assert.strictEqual(stats.poorCount, 1);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
