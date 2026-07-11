/**
 * ContinuousEvaluation — EPIC Ω Knowledge & Learning Layer
 * 
 * Tracks system validation accuracy metrics (Precision, Recall, F1) continuously.
 */
class ContinuousEvaluation {
  /**
   * Evaluates classification metrics based on predictions vs actual ground truth labels.
   */
  static evaluate(predictions = [], actuals = []) {
    if (predictions.length !== actuals.length) {
      throw new Error('Prediction and actual label arrays must match in size');
    }

    let tp = 0; // True Positives
    let fp = 0; // False Positives
    let fn = 0; // False Negatives

    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      const actual = actuals[i];

      if (pred === 1 && actual === 1) tp++;
      else if (pred === 1 && actual === 0) fp++;
      else if (pred === 0 && actual === 1) fn++;
    }

    const precision = (tp + fp) > 0 ? (tp / (tp + fp)) : 0;
    const recall = (tp + fn) > 0 ? (tp / (tp + fn)) : 0;
    const f1 = (precision + recall) > 0 ? (2 * (precision * recall) / (precision + recall)) : 0;

    return {
      precision: parseFloat(precision.toFixed(4)),
      recall: parseFloat(recall.toFixed(4)),
      f1Score: parseFloat(f1.toFixed(4))
    };
  }
}

module.exports = ContinuousEvaluation;
