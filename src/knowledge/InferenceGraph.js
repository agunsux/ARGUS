/**
 * InferenceGraph — EPIC Ω Knowledge & Learning Layer
 * 
 * Manages predictive link graphs, mapping risks and risk labels to specific identities.
 */
class InferenceGraph {
  constructor() {
    this.predictions = new Map(); // Key: entityId -> Value: predictedRiskScore
  }

  /**
   * Registers a predictive risk inference.
   */
  addPrediction(entityId, riskScore) {
    if (!entityId) throw new Error('entityId is required');
    this.predictions.set(entityId, typeof riskScore === 'number' ? riskScore : 0);
  }

  /**
   * Retrieves registered predictive risk.
   */
  getPrediction(entityId) {
    return this.predictions.get(entityId) || 0;
  }
}

module.exports = InferenceGraph;
