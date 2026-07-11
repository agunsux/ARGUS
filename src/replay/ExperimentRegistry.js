/**
 * ExperimentRegistry — Phase 18 Historical Intelligence Laboratory
 * 
 * Central catalog keeping records of finished counterfactual simulation reports.
 */
class ExperimentRegistry {
  constructor() {
    this._experiments = new Map();
  }

  /**
   * Registers a completed experiment report.
   */
  registerExperiment(experiment) {
    if (!experiment || !experiment.id) {
      throw new Error('Experiment report must contain a valid id');
    }
    this._experiments.set(experiment.id, experiment);
  }

  /**
   * Resolves a registered experiment by ID.
   */
  getExperiment(id) {
    return this._experiments.get(id) || null;
  }

  /**
   * Lists all registered experiments.
   */
  listExperiments() {
    return Array.from(this._experiments.values());
  }

  /**
   * Clears the registry.
   */
  clear() {
    this._experiments.clear();
  }
}

module.exports = ExperimentRegistry;
