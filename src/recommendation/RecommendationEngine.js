const Recommendation = require('../contracts/Recommendation');
const KellyEngine = require('./KellyEngine');
const ExposureCalculator = require('./ExposureCalculator');

/**
 * RecommendationEngine — Phase 6/EPIC H Recommendation Platform
 * 
 * Maps evaluated Decisions and entity trust ratings to formulate 
 * prioritized actionable Recommendations, computing optimal sizing allocations 
 * and validating limits.
 */
class RecommendationEngine {
  constructor(portfolioEngine = null) {
    this.portfolioEngine = portfolioEngine;
  }

  /**
   * Generates a Recommendation based on a Decision contract.
   * 
   * @param {Decision} decision
   * @param {number} [trustScore=100]
   */
  recommend(decision, trustScore = 100) {
    if (!decision) {
      throw new Error('Decision is required for recommendation');
    }

    let recommendedAction = 'HOLD';
    let priority = 'MEDIUM';

    if (decision.action === 'APPROVE') {
      recommendedAction = 'EXECUTE';
      priority = 'LOW';
    } else if (decision.action === 'BLOCK') {
      recommendedAction = 'REJECT';
      priority = 'CRITICAL';
    } else if (decision.action === 'REVIEW' || decision.action === 'FLAG') {
      recommendedAction = 'HOLD';
      priority = 'HIGH';
    }

    const price = decision.explainability?.riskContributors?.price || 0;
    const odds = 2.0; // Default payout odds
    const kellyFraction = KellyEngine.calculate(decision.confidence, odds);
    const rawRecommendedSize = Math.round(price * kellyFraction);

    let finalActionSize = rawRecommendedSize;
    let explanationWhy = `Action size calculated at ${rawRecommendedSize} based on Kelly Criterion fraction ${kellyFraction}.`;

    // Perform exposure checks if portfolio monitoring is active
    if (this.portfolioEngine && price > 0) {
      const currentExposure = this.portfolioEngine.getExposure(decision.entityId);
      const limit = ExposureCalculator.calculateLimit(decision.entityId, 10000000, trustScore);

      if (ExposureCalculator.isExceeded(currentExposure, price, limit)) {
        finalActionSize = 0;
        recommendedAction = 'REJECT';
        priority = 'CRITICAL';
        explanationWhy = `Rejected: cumulative exposure would exceed calculated trust limit ${limit} for entity ${decision.entityId}.`;
      }
    }

    const id = `rec-${decision.id.split('-').slice(1).join('-')}`; // Deterministic id mapping
    
    const rec = new Recommendation({
      id,
      entityId: decision.entityId,
      executionId: decision.executionId,
      correlationId: decision.correlationId,
      causationId: decision.id,
      decisionId: decision.id,
      recommendedAction,
      priority,
      category: 'risk-mitigation',
      confidence: decision.confidence,
      actions: [
        { type: 'LIMIT_EXPOSURE', value: finalActionSize },
        { type: 'ROUTE_DECISION', value: recommendedAction }
      ],
      explanation: {
        why: explanationWhy,
        supportingEvidence: decision.evidenceIds || []
      }
    });

    return rec.freeze();
  }
}

module.exports = RecommendationEngine;
