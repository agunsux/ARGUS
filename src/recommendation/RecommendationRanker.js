/**
 * RecommendationRanker — Phase 6/EPIC H Recommendation Platform
 * 
 * Orders a collection of Recommendation objects by calculated priority scores 
 * combining priority tiers and confidence levels.
 */
class RecommendationRanker {
  /**
   * Sorts recommendations in descending order of calculated priority score.
   */
  static rank(recommendations) {
    if (!Array.isArray(recommendations)) {
      return [];
    }

    const priorityWeights = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1
    };

    return [...recommendations].sort((a, b) => {
      const weightA = priorityWeights[a.priority] || 1;
      const weightB = priorityWeights[b.priority] || 1;
      
      const scoreA = a.confidence * weightA;
      const scoreB = b.confidence * weightB;

      return scoreB - scoreA;
    });
  }
}

module.exports = RecommendationRanker;
