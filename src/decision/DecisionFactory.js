const Decision = require('./Decision');
const DecisionValidator = require('./DecisionValidator');
const { STATES } = require('./decision.types');

/**
 * DecisionFactory — Phase 5 Decision Domain
 * 
 * Enforces creation of immutable, validated Decisions.
 * Supports injection of IDs and timestamps to ensure deterministic replay.
 */
class DecisionFactory {
  /**
   * Creates a Decision, validates it, and freezes it to guarantee immutability.
   * 
   * @param {Object} data 
   * @param {Object} options
   * @param {string} [options.id] Injected unique identifier
   * @param {string} [options.createdAt] Injected timestamp
   * @param {boolean} [options.freeze=true] Freeze the object
   * @param {boolean} [options.skipValidation=false] Bypass validator
   */
  static create(data = {}, options = {}) {
    const timestamp = options.createdAt || new Date().toISOString();
    const id = options.id || `dec-${Math.random().toString(36).substr(2, 9)}`; // default fallback

    const payload = {
      ...data,
      id: data.id || id,
      createdAt: data.createdAt || timestamp,
      lifecycleState: data.lifecycleState || STATES.EVALUATED
    };

    const decision = new Decision(payload);

    if (!options.skipValidation) {
      const valRes = DecisionValidator.validate(decision);
      if (!valRes.valid) {
        throw new Error(`Decision Validation Failed: ${valRes.errors.join('; ')}`);
      }
    }

    if (options.freeze !== false) {
      decision.freeze();
    }

    return decision;
  }
}

module.exports = DecisionFactory;
