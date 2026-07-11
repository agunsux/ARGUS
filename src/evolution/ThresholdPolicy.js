/**
 * ThresholdPolicy — Phase 2 Model Evolution
 * 
 * Defines standard Promotion and Rollback invariants.
 */
class ThresholdPolicy {
  /**
   * Assesses if challenger metric differences warrant promotion.
   */
  static shouldPromote(modelComparison) {
    if (!modelComparison || !modelComparison.metricsDifference) return false;
    const diff = modelComparison.metricsDifference;

    // Promotion Invariants:
    // 1. Precision improvement >= 0.01 (1%)
    // 2. Recall difference is not negative (no recall degradation)
    // 3. LogLoss difference is negative (meaning challenger has lower log loss)
    const precisionOk = (diff.precision || 0) >= 0.01;
    const recallOk = (diff.recall || 0) >= 0.0;
    const logLossOk = (diff.logLoss || 0) <= 0.0;

    return precisionOk && recallOk && logLossOk;
  }

  /**
   * Assesses if canary telemetry triggers immediate rollback action.
   */
  static shouldRollback(canaryRegistry) {
    if (!canaryRegistry || !canaryRegistry.getCanary()) return false;
    return canaryRegistry.isBreached();
  }
}

module.exports = ThresholdPolicy;
