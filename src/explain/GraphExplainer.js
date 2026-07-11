/**
 * GraphExplainer — Phase 19 Explainability Platform
 * 
 * Extracts entity relation pathways and linkage metrics from the Identity Graph.
 */
class GraphExplainer {
  static explainHuman(decision) {
    if (!decision || !decision.entityId) {
      return 'Graph linkage information is unavailable.';
    }
    return `Transaction maps to entity node '${decision.entityId}' with linked trace path '${decision.correlationId}'.`;
  }

  static explainTechnical(decision) {
    if (!decision) return {};
    return {
      entityNodeId: decision.entityId,
      correlationPathId: decision.correlationId,
      executionId: decision.executionId
    };
  }
}

module.exports = GraphExplainer;
