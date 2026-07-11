const assert = require('assert');
const DecisionContext = require('./src/decision/DecisionContext');
const DecisionOrchestrator = require('./src/decision/DecisionOrchestrator');
const RecommendationEngine = require('./src/recommendation/RecommendationEngine');
const PortfolioEngine = require('./src/recommendation/PortfolioEngine');
const TrustGraph = require('./src/trust/TrustGraph');
const TrustScore = require('./src/trust/TrustScore');
const CaseMemory = require('./src/knowledge/CaseMemory');
const CaseSimilarity = require('./src/knowledge/CaseSimilarity');
const ConceptDriftDetection = require('./src/knowledge/ConceptDriftDetection');
const RuleEvolution = require('./src/knowledge/RuleEvolution');

console.log('\n=== ARGUS E2E INTEGRATION PIPELINE AUDIT ===\n');

async function runE2E() {
  // 1. Setup Orchestrator & Dependency engines
  const orchestrator = new DecisionOrchestrator();
  const portfolio = new PortfolioEngine();
  const recommendationEngine = new RecommendationEngine(portfolio);
  const trustGraph = new TrustGraph();
  const caseMemory = new CaseMemory();

  // 2. Prepare incoming raw Provider payload
  const rawProviderPayload = {
    transaction: { transactionId: 'tx-e2e-1', price: 15000, entityId: 'user-e2e' },
    evidence: [{ id: 'ev-e2e-1', type: 'IP_MATCH' }],
    risk: { id: 'rsk-e2e-1', riskScore: 30, riskLevel: 'LOW' },
    inference: { id: 'inf-e2e-1', prediction: 'GENUINE', probability: 0.95 },
    executionId: 'exec-e2e-1',
    correlationId: 'corr-e2e-1',
    timestamp: '2026-07-11T12:00:00Z'
  };

  // 3. Normalize into DecisionContext
  const ctx = new DecisionContext(rawProviderPayload);

  // 4. Run Policy & Decision pipeline
  const decisionResult = orchestrator.evaluate(ctx);
  const decision = decisionResult.decision;
  assert.ok(decision);
  assert.strictEqual(decision.action, 'APPROVE');
  console.log('  \u2716 Step 1-4: Decision Evaluated ->', decision.action);

  // 5. Generate Recommendation (Kelly Allocation & Portfolio Limits)
  // Base trust is 80 -> limits allowed. Kelly sizing should process.
  const recommendation = recommendationEngine.recommend(decision, 80);
  assert.ok(recommendation);
  assert.strictEqual(recommendation.recommendedAction, 'EXECUTE');
  console.log('  \u2716 Step 5: Recommendation Formulated -> Action:', recommendation.recommendedAction, 'Size:', recommendation.actions[0].value);

  // 6. Update Trust Intelligence score & propagate network trust
  const trustScore = new TrustScore({
    id: 'tr-e2e-1',
    entityId: 'user-e2e',
    entityType: 'user',
    trustScore: 85,
    executionId: 'exec-e2e-1',
    correlationId: 'corr-e2e-1'
  });
  trustGraph.setTrustScore('user-e2e', trustScore.trustScore);
  const netTrust = trustGraph.calculateNetworkTrust('user-e2e');
  assert.strictEqual(netTrust, 85);
  console.log('  \u2716 Step 6: Trust Node Updated -> Score:', netTrust);

  // 7. Commit to Knowledge Layer (Case Memory & Similarity Check)
  caseMemory.store(decision);
  const storedDecision = caseMemory.recall(decision.id);
  assert.strictEqual(storedDecision.entityId, 'user-e2e');

  // Let's compare with a past fake case in memory to find Jaccard similarity
  const pastFakeCase = {
    explainability: {
      riskContributors: { price: 10000, ip: 'match' }
    }
  };
  const similarity = CaseSimilarity.calculateJaccard(decision, pastFakeCase);
  assert.ok(similarity >= 0);
  console.log('  \u2716 Step 7: Knowledge Case Memory Committed -> Similarity overlap with baseline:', similarity);

  // 8. Run Rule Threshold Evolution & Concept Drift Checks
  const evolvedThreshold = RuleEvolution.evolveThreshold(100, 0.12); // High FP rate -> increases to 115
  assert.strictEqual(evolvedThreshold, 115);

  const driftResult = ConceptDriftDetection.detectDrift([0.1, 0.8], [0.2, 0.4]); // distance sum = 0.5 > 0.3 -> drift
  assert.strictEqual(driftResult.driftDetected, true);
  console.log('  \u2716 Step 8: Rule Threshold Evolved & Concept Drift Evaluated (Drift Detected:', driftResult.driftDetected, ')');

  // 9. Replay Verification (Ensure determinism from identical Context inputs)
  const replayCtx = new DecisionContext(rawProviderPayload);
  const replayResult = orchestrator.evaluate(replayCtx);
  assert.strictEqual(replayResult.decision.hash(), decision.hash());
  console.log('  \u2716 Step 9: Replay Verification Matches Hash Stability ->', decision.hash());

  console.log('\n\u2705 E2E INTEGRATION PIPELINE AUDIT PASSED SUCCESSFULLY.');
}

runE2E().catch(err => {
  console.error('\n\u2717 E2E INTEGRATION PIPELINE AUDIT FAILED:', err);
  process.exit(1);
});
