/**
 * RecommendationHistory — Phase 6/EPIC H Recommendation Platform
 * 
 * In-memory repository keeping historical logs of formulated Recommendations.
 */
class RecommendationHistory {
  constructor() {
    this._history = [];
  }

  add(recommendation) {
    if (!recommendation) return;
    this._history.push(recommendation);
  }

  list() {
    return this._history;
  }

  clear() {
    this._history = [];
  }
}

module.exports = RecommendationHistory;
