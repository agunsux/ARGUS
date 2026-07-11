/**
 * ConfidenceExplainer — Phase 19 Explainability Platform
 * 
 * Explains confidence score derivation.
 */
class ConfidenceExplainer {
  static explainHuman(decision) {
    if (!decision) return 'Undeclared confidence indicators.';
    const percentage = Math.round(decision.confidence * 100);
    return `Evaluated with ${percentage}% confidence based on inference signals and supporting evidence presence.`;
  }

  static explainTechnical(decision) {
    if (!decision) return {};
    return {
      confidenceScore: decision.confidence,
      inferenceIds: decision.inferenceIds || []
    };
  }
}

module.exports = ConfidenceExplainer;
