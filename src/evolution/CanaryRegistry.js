/**
 * CanaryRegistry — Phase 2 Model Evolution
 * 
 * Configures rollout metrics, routing traffic percentages, and failure indicators 
 * for active Canary deployments.
 */
class CanaryRegistry {
  constructor() {
    this.canaryModel = null;
    this.trafficPercentage = 0; // 0% to 100%
    this.failureRateThreshold = 0.05; // 5% limit
    this.currentFailureRate = 0.0;
  }

  /**
   * Pushes a model to Canary rollout state.
   */
  setCanary(modelCandidate, trafficPercentage = 10) {
    this.canaryModel = modelCandidate;
    this.trafficPercentage = trafficPercentage;
    this.currentFailureRate = 0.0;
  }

  getCanary() {
    return this.canaryModel;
  }

  /**
   * Updates failure rate indicator.
   */
  recordFailure(rate) {
    this.currentFailureRate = typeof rate === 'number' ? rate : 0.0;
  }

  /**
   * Checks if failure bounds are breached.
   */
  isBreached() {
    return this.currentFailureRate > this.failureRateThreshold;
  }

  clear() {
    this.canaryModel = null;
    this.trafficPercentage = 0;
    this.currentFailureRate = 0.0;
  }
}

module.exports = CanaryRegistry;
