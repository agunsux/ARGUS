/**
 * FeatureRegistry — EPIC Ω Knowledge & Learning Layer
 * 
 * Catalog tracking feature indicators used across ARGUS decision policies.
 */
class FeatureRegistry {
  constructor() {
    this.features = new Map();
  }

  /**
   * Registers a feature.
   */
  register(name, type, description) {
    if (!name || !type) throw new Error('Feature name and type are required');
    this.features.set(name, {
      name,
      type,
      description,
      registeredAt: new Date().toISOString()
    });
  }

  /**
   * Recalls a feature definition.
   */
  get(name) {
    return this.features.get(name);
  }

  clear() {
    this.features.clear();
  }
}

module.exports = FeatureRegistry;
