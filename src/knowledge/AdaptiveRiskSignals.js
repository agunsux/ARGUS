/**
 * AdaptiveRiskSignals — EPIC Ω Knowledge & Learning Layer
 * 
 * Dynamically scales base risk parameters depending on past execution success rates.
 */
class AdaptiveRiskSignals {
  /**
   * Adapts a base risk score based on performance feedback.
   */
  static adjustRiskScore(baseScore, feedbackCount, successRate) {
    if (typeof baseScore !== 'number') return 50;

    let adjustment = 0;
    
    // Scale risk down if success rate is very high (> 90%)
    if (successRate > 0.9) {
      adjustment = -15;
    }
    // Scale risk up if success rate is low (< 60%) indicating high anomalies
    else if (successRate < 0.6) {
      adjustment = 20;
    }

    return Math.min(100, Math.max(0, baseScore + adjustment));
  }
}

module.exports = AdaptiveRiskSignals;
