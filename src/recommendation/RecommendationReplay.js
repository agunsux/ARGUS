const RecommendationEngine = require('./RecommendationEngine');

/**
 * RecommendationReplay — Phase 6/EPIC H Recommendation Platform
 * 
 * Replays decision logs to regenerate or audit Recommendation states.
 */
class RecommendationReplay {
  constructor(portfolioEngine = null) {
    this.engine = new RecommendationEngine(portfolioEngine);
  }

  /**
   * Replays a stream of decisions to rebuild corresponding recommendations.
   */
  replayBatch(decisions, trustMap = new Map()) {
    if (!Array.isArray(decisions)) return [];
    
    const recommendations = [];
    for (const dec of decisions) {
      const trustScore = trustMap.get(dec.entityId) || 100;
      const rec = this.engine.recommend(dec, trustScore);
      recommendations.push(rec);
    }

    return recommendations;
  }
}

module.exports = RecommendationReplay;
