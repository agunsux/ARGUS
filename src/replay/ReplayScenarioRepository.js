const ScenarioLibrary = require('./ScenarioLibrary');

/**
 * ReplayScenarioRepository — Phase 18 Historical Intelligence Laboratory
 * 
 * Stores, queries, and registers custom and default simulation scenarios.
 */
class ReplayScenarioRepository {
  constructor() {
    this._scenarios = new Map();

    // Auto-seed with default ScenarioLibrary templates
    const templates = ScenarioLibrary.getTemplates();
    for (const [key, scenario] of Object.entries(templates)) {
      this._scenarios.set(key, scenario);
    }
  }

  /**
   * Saves or updates a scenario definition.
   */
  saveScenario(scenario) {
    if (!scenario || typeof scenario !== 'object' || !scenario.id) {
      throw new Error('Scenario definition must contain a valid id');
    }
    this._scenarios.set(scenario.id, scenario);
  }

  /**
   * Retrieves a scenario definition by ID.
   */
  getScenario(id) {
    return this._scenarios.get(id) || null;
  }

  /**
   * Lists all stored scenario definitions.
   */
  listScenarios() {
    return Array.from(this._scenarios.values());
  }

  /**
   * Clears the repository.
   */
  clear() {
    this._scenarios.clear();
  }
}

module.exports = ReplayScenarioRepository;
