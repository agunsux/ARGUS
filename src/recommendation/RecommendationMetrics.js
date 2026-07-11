/**
 * RecommendationMetrics — Phase 6/EPIC H Recommendation Platform
 * 
 * Collects counters and telemetry events for formed recommendations.
 */
class RecommendationMetrics {
  constructor() {
    this._counters = new Map();
  }

  increment(metric, val = 1) {
    this._counters.set(metric, (this._counters.get(metric) || 0) + val);
  }

  snapshot() {
    const result = {};
    for (const [key, value] of this._counters) {
      result[key] = value;
    }
    return result;
  }

  reset() {
    this._counters.clear();
  }
}

const recommendationMetrics = new RecommendationMetrics();

module.exports = {
  RecommendationMetrics,
  recommendationMetrics
};
