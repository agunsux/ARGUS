const DecisionCandidate = require('./DecisionCandidate');

/**
 * DecisionEngine — Phase 5 Decision Domain
 * 
 * Stateless, deterministic, and side-effect free core evaluator.
 * Maps incoming context elements (transaction, inferences, risks, evidence) 
 * to compile a validated DecisionCandidate containing resolved facts.
 */
class DecisionEngine {
  /**
   * Evaluates facts to produce a DecisionCandidate.
   * 
   * @param {DecisionContext} context
   * @returns {DecisionCandidate}
   */
  evaluate(context) {
    if (!context) {
      throw new Error('DecisionContext is required for evaluation');
    }

    const valRes = context.validate();
    if (!valRes.valid) {
      throw new Error(`Context validation failed: ${valRes.errors.join('; ')}`);
    }

    const tx = context.transaction;

    // Compile resolved facts
    const facts = {
      price: typeof tx.price === 'number' ? tx.price : 0,
      isHighValue: typeof tx.price === 'number' && tx.price > 10000000,
      evidenceCount: context.evidence.length,
      riskScore: context.risk ? context.risk.riskScore : 0,
      riskLevel: context.risk ? context.risk.riskLevel : 'LOW',
      inferencePrediction: context.inference ? context.inference.prediction : 'GENUINE',
      inferenceProbability: context.inference ? context.inference.probability : 0.5,
      hasValidInference: !!context.inference
    };

    // Calculate raw aggregated risk score (0 - 100)
    const rawScore = facts.riskScore;

    // Calculate raw confidence (0.0 - 1.0)
    const inferenceConfidence = context.inference
      ? (context.inference.prediction === 'GENUINE' ? context.inference.probability : 1 - context.inference.probability)
      : 0.5;
    const evidenceConfidenceMultiplier = context.evidence.length > 0 ? 1.0 : 0.6;
    const rawConfidence = parseFloat((inferenceConfidence * evidenceConfidenceMultiplier).toFixed(4));

    const evidenceIds = context.evidence.map(e => e.id);
    const inferences = context.inference ? [context.inference] : [];
    const risks = context.risk ? [context.risk] : [];

    // Construct the transition candidate
    const candidate = new DecisionCandidate({
      transactionId: tx.transactionId,
      entityId: tx.entityId || tx.userId || '',
      facts,
      inferences,
      risks,
      evidenceIds,
      rawScore,
      rawConfidence,
      executionId: context.executionId,
      correlationId: context.correlationId,
      causationId: context.causationId,
      createdAt: context.timestamp
    });

    return candidate;
  }
}

module.exports = DecisionEngine;
