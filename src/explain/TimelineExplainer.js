/**
 * TimelineExplainer — Phase 19 Explainability Platform
 * 
 * Explains chronological and sequence parameters of the transaction evaluation.
 */
class TimelineExplainer {
  static explainHuman(decision) {
    if (!decision || !decision.createdAt) {
      return 'Timeline sequence details are unavailable.';
    }
    return `Transaction evaluated chronologically at ${decision.createdAt}.`;
  }

  static explainTechnical(decision) {
    if (!decision) return {};
    return {
      evaluatedAt: decision.createdAt,
      version: decision.version,
      schemaVersion: decision.schemaVersion
    };
  }
}

module.exports = TimelineExplainer;
