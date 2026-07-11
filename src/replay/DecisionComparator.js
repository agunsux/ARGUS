/**
 * DecisionComparator — Phase 18 Historical Intelligence Laboratory
 * 
 * Computes comparative performance metrics (Precision, Recall, F1, Confusion Matrix)
 * between actual decision outcomes and target expected benchmarks.
 */
class DecisionComparator {
  /**
   * Compares evaluation runs and computes precision, recall, F1 metrics.
   * 
   * @param {Array} actualRuns Array of evaluated outcomes { transactionId, decision, ... }
   * @param {Array} targetRuns Array of target expected outcomes { transactionId, action }
   */
  static compare(actualRuns, targetRuns) {
    const comparisonResults = {};
    const targetMap = new Map(targetRuns.map(r => [r.transactionId, r]));

    let tp = 0; // True Positive
    let fp = 0; // False Positive
    let tn = 0; // True Negative
    let fn = 0; // False Negative

    let detectionDelaySum = 0;
    let detectionDelayCount = 0;

    for (const actual of actualRuns) {
      const target = targetMap.get(actual.transactionId);
      if (!target) continue;

      const actAction = typeof actual.decision === 'object' ? actual.decision.action : actual.decision;
      const tarAction = typeof target.decision === 'object' ? target.decision.action : (target.action || target.decision);

      comparisonResults[actual.transactionId] = {
        actual: actAction,
        expected: tarAction,
        match: actAction === tarAction
      };

      // Classify as Positive (BLOCK/FLAG/REVIEW) vs Negative (APPROVE)
      const isActPositive = ['BLOCK', 'FLAG', 'REVIEW'].includes(actAction);
      const isTarPositive = ['BLOCK', 'FLAG', 'REVIEW'].includes(tarAction);

      if (isActPositive && isTarPositive) tp++;
      else if (isActPositive && !isTarPositive) fp++;
      else if (!isActPositive && !isTarPositive) tn++;
      else if (!isActPositive && isTarPositive) fn++;

      // Track detection delays if timestamps are available
      if (isActPositive && isTarPositive && actual.decision.createdAt && target.createdAt) {
        const delay = new Date(actual.decision.createdAt).getTime() - new Date(target.createdAt).getTime();
        detectionDelaySum += Math.max(0, delay);
        detectionDelayCount++;
      }
    }

    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1.0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 1.0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 1.0;
    const avgDetectionDelayMs = detectionDelayCount > 0 ? Math.round(detectionDelaySum / detectionDelayCount) : 0;

    return {
      precision: parseFloat(precision.toFixed(4)),
      recall: parseFloat(recall.toFixed(4)),
      f1: parseFloat(f1.toFixed(4)),
      confusionMatrix: {
        truePositives: tp,
        falsePositives: fp,
        trueNegatives: tn,
        falseNegatives: fn
      },
      averageDetectionDelayMs: avgDetectionDelayMs,
      comparisons: comparisonResults
    };
  }
}

module.exports = DecisionComparator;
