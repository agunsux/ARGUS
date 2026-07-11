/**
 * ConceptDriftDetection — EPIC Ω Knowledge & Learning Layer
 * 
 * Compares prediction probability distributions over time to alert on concept drift.
 */
class ConceptDriftDetection {
  /**
   * Evaluates if there is significant distribution distance shift.
   */
  static detectDrift(referenceDistribution = [], currentDistribution = []) {
    if (referenceDistribution.length !== currentDistribution.length) {
      throw new Error('Reference and current distributions must have equal bins');
    }

    let absoluteDifferenceSum = 0;
    for (let i = 0; i < referenceDistribution.length; i++) {
      absoluteDifferenceSum += Math.abs(referenceDistribution[i] - currentDistribution[i]);
    }

    // Drift Invariant: Sum difference > 0.3 indicates significant concept drift
    const driftDetected = absoluteDifferenceSum > 0.3;

    return {
      driftDetected,
      ksStatisticApprox: parseFloat(absoluteDifferenceSum.toFixed(4))
    };
  }
}

module.exports = ConceptDriftDetection;
