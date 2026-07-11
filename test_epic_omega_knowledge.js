const assert = require('assert');
const KnowledgeGraph = require('./src/knowledge/KnowledgeGraph');
const InferenceGraph = require('./src/knowledge/InferenceGraph');
const EntityRelationshipGraph = require('./src/knowledge/EntityRelationshipGraph');
const PatternDiscovery = require('./src/knowledge/PatternDiscovery');
const CaseMemory = require('./src/knowledge/CaseMemory');
const CaseSimilarity = require('./src/knowledge/CaseSimilarity');
const AdaptiveRiskSignals = require('./src/knowledge/AdaptiveRiskSignals');
const LearningPipeline = require('./src/knowledge/LearningPipeline');
const ModelRegistry = require('./src/knowledge/ModelRegistry');
const FeatureRegistry = require('./src/knowledge/FeatureRegistry');
const RuleEvolution = require('./src/knowledge/RuleEvolution');
const FeedbackLoop = require('./src/knowledge/FeedbackLoop');
const ContinuousEvaluation = require('./src/knowledge/ContinuousEvaluation');
const ConceptDriftDetection = require('./src/knowledge/ConceptDriftDetection');
const KnowledgeDashboard = require('./src/knowledge/KnowledgeDashboard');
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

console.log('\n=== EPIC \u03a9 KNOWLEDGE LAYER TEST SUITE ===\n');

t('KnowledgeGraph and PatternDiscovery detect mutual relationship loops', () => {
  const kg = new KnowledgeGraph();
  const nodeA = new GraphNode({ id: 'node-a', type: 'user' });
  const nodeB = new GraphNode({ id: 'node-b', type: 'user' });
  const edge1 = new GraphEdge({ id: 'e1', source: 'node-a', target: 'node-b', relationship: 'friends' });
  const edge2 = new GraphEdge({ id: 'e2', source: 'node-b', target: 'node-a', relationship: 'friends' });

  kg.addNode(nodeA);
  kg.addNode(nodeB);
  kg.addEdge(edge1);
  kg.addEdge(edge2);

  const cycles = PatternDiscovery.discoverCycles(kg);
  assert.strictEqual(cycles.length, 1);
  assert.strictEqual(cycles[0][0], 'node-a');
  assert.strictEqual(cycles[0][1], 'node-b');
});

t('InferenceGraph registers predictive values', () => {
  const ig = new InferenceGraph();
  ig.addPrediction('entity-1', 75);
  assert.strictEqual(ig.getPrediction('entity-1'), 75);
  assert.strictEqual(ig.getPrediction('entity-2'), 0);
});

t('EntityRelationshipGraph structures visualization arrays', () => {
  const relations = [{ target: 'node-b', type: 'associated' }];
  const output = EntityRelationshipGraph.buildRelations('node-a', relations);
  assert.strictEqual(output.entityId, 'node-a');
  assert.strictEqual(output.relations[0].relationshipType, 'associated');
});

t('CaseMemory stores and retrieves past decisions', () => {
  const cm = new CaseMemory();
  const dec = { id: 'dec-100', entityId: 'user-z' };
  cm.store(dec);
  assert.strictEqual(cm.recall('dec-100').entityId, 'user-z');
});

t('CaseSimilarity computes Jaccard similarity correctly', () => {
  const case1 = { explainability: { riskContributors: { price: 10, velocity: 5 } } };
  const case2 = { explainability: { riskContributors: { price: 15, duration: 12 } } };
  
  // Intersection = { price } (size 1)
  // Union = { price, velocity, duration } (size 3)
  // Jaccard = 1 / 3 = 0.3333
  const jaccard = CaseSimilarity.calculateJaccard(case1, case2);
  assert.strictEqual(jaccard, 0.3333);
});

t('AdaptiveRiskSignals adjusts risk score based on success rate thresholds', () => {
  const highRisk = AdaptiveRiskSignals.adjustRiskScore(50, 10, 0.3); // success rate < 0.6 -> +20
  assert.strictEqual(highRisk, 70);

  const lowRisk = AdaptiveRiskSignals.adjustRiskScore(50, 10, 0.95); // success rate > 0.9 -> -15
  assert.strictEqual(lowRisk, 35);
});

t('LearningPipeline and Registries trigger retraining and index metadata', () => {
  const cases = [{ id: 'case-1' }, { id: 'case-2' }];
  const pipeline = LearningPipeline.triggerRetraining(cases);
  assert.strictEqual(pipeline.status, 'UPDATED');
  assert.strictEqual(pipeline.recordsProcessed, 2);

  const mr = new ModelRegistry();
  mr.register('XGBoost', 'v1.0.0', { f1: 0.92 });
  assert.strictEqual(mr.get('XGBoost', 'v1.0.0').metadata.f1, 0.92);

  const fr = new FeatureRegistry();
  fr.register('velocity_1h', 'float', 'Velocity over 1 hour window');
  assert.strictEqual(fr.get('velocity_1h').type, 'float');
});

t('RuleEvolution adjusts threshold levels dynamically', () => {
  const tight = RuleEvolution.evolveThreshold(100, 0.15); // fp rate > 0.1 -> threshold increases 15% (115)
  assert.strictEqual(tight, 115);

  const relax = RuleEvolution.evolveThreshold(100, 0.005); // fp rate < 0.01 -> threshold decreases 10% (90)
  assert.strictEqual(relax, 90);
});

t('FeedbackLoop resolves reviewer actions', () => {
  const result = FeedbackLoop.processResolution('case-1', 'OVERRIDE_APPROVE');
  assert.strictEqual(result.status, 'RESOLVED_COMMITTED');
  assert.strictEqual(result.operatorAction, 'OVERRIDE_APPROVE');
});

t('ContinuousEvaluation calculates precision, recall, and F1 Score', () => {
  const preds   = [1, 1, 0, 1];
  const actuals = [1, 0, 1, 1];
  // Index 0: 1 & 1 -> TP
  // Index 1: 1 & 0 -> FP
  // Index 2: 0 & 1 -> FN
  // Index 3: 1 & 1 -> TP
  // TP = 2, FP = 1, FN = 1
  // Precision = 2 / (2 + 1) = 2/3 = 0.6667
  // Recall = 2 / (2 + 1) = 2/3 = 0.6667
  // F1 = 2 * (0.6667 * 0.6667) / (0.6667 + 0.6667) = 0.6667
  const stats = ContinuousEvaluation.evaluate(preds, actuals);
  assert.strictEqual(stats.precision, 0.6667);
  assert.strictEqual(stats.recall, 0.6667);
  assert.strictEqual(stats.f1Score, 0.6667);
});

t('ConceptDriftDetection detects distribution distance deviations', () => {
  const ref = [0.1, 0.2, 0.7];
  const cur = [0.2, 0.4, 0.4];
  // Absolute diff sum = |0.1-0.2| + |0.2-0.4| + |0.7-0.4| = 0.1 + 0.2 + 0.3 = 0.6 (> 0.3 -> drift)
  const drift = ConceptDriftDetection.detectDrift(ref, cur);
  assert.strictEqual(drift.driftDetected, true);
  assert.strictEqual(drift.ksStatisticApprox, 0.6);
});

t('KnowledgeDashboard returns aggregated stats summary', () => {
  const cm = new CaseMemory();
  const mr = new ModelRegistry();
  const fr = new FeatureRegistry();
  cm.store({ id: '1' });
  mr.register('test', '1.0', {});
  fr.register('test', 'int', '');

  const stats = KnowledgeDashboard.getSummary(cm, mr, fr);
  assert.strictEqual(stats.totalCasesStored, 1);
  assert.strictEqual(stats.activeModelsCount, 1);
  assert.strictEqual(stats.registeredFeaturesCount, 1);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
