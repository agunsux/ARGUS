/**
 * ModelRegistry — EPIC Ω Knowledge & Learning Layer
 * 
 * Manages model deployment configurations and indexing.
 */
class ModelRegistry {
  constructor() {
    this.models = new Map();
  }

  /**
   * Registers a model version metadata schema.
   */
  register(modelName, version, metadata) {
    if (!modelName || !version) throw new Error('modelName and version are required');
    this.models.set(`${modelName}:${version}`, {
      modelName,
      version,
      registeredAt: new Date().toISOString(),
      metadata
    });
  }

  /**
   * Recalls a registered model metadata.
   */
  get(modelName, version) {
    return this.models.get(`${modelName}:${version}`);
  }

  clear() {
    this.models.clear();
  }
}

module.exports = ModelRegistry;
