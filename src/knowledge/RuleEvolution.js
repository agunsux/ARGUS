/**
 * RuleEvolution — EPIC Ω Knowledge & Learning Layer
 * 
 * Dynamically scales constraint thresholds based on policy false-positive feedback loops.
 */
class RuleEvolution {
  /**
   * Adapts threshold values dynamically.
   */
  static evolveThreshold(currentThreshold, falsePositiveRate) {
    if (typeof currentThreshold !== 'number') return currentThreshold;

    // If false positive rates exceed 10%, relax the threshold to make it less sensitive (increase threshold limit)
    if (falsePositiveRate > 0.1) {
      return parseFloat((currentThreshold * 1.15).toFixed(4));
    }
    // If false positives are zero or very low (< 1%), we can tighten the threshold to catch more anomalies
    if (falsePositiveRate < 0.01) {
      return parseFloat((currentThreshold * 0.90).toFixed(4));
    }

    return currentThreshold;
  }
}

module.exports = RuleEvolution;
