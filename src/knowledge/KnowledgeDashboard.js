/**
 * KnowledgeDashboard — EPIC Ω Knowledge & Learning Layer
 * 
 * Aggregates statistics about stored cases, ML models, and registered features.
 */
class KnowledgeDashboard {
  /**
   * Generates summary status metadata for Knowledge operations.
   */
  static getSummary(caseMemory, modelRegistry, featureRegistry) {
    return {
      totalCasesStored: caseMemory ? caseMemory.cases.length : 0,
      activeModelsCount: modelRegistry ? modelRegistry.models.size : 0,
      registeredFeaturesCount: featureRegistry ? featureRegistry.features.size : 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = KnowledgeDashboard;
