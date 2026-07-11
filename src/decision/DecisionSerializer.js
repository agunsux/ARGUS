const Decision = require('./Decision');

/**
 * DecisionSerializer — Phase 5 Decision Domain
 * 
 * Handles serialization and deserialization of Decision objects.
 */
class DecisionSerializer {
  /**
   * Serializes a Decision object to a deterministic string.
   */
  static serialize(decision) {
    if (!decision) throw new Error('Decision object is required for serialization');
    return decision.serialize();
  }

  /**
   * Deserializes a string back into a Decision instance.
   */
  static deserialize(str) {
    if (!str) throw new Error('Serialization payload is required for deserialization');
    return Decision.deserialize(str);
  }

  /**
   * Converts a Decision object to a plain JSON object.
   */
  static toJSON(decision) {
    if (!decision) throw new Error('Decision object is required');
    return decision.toJSON();
  }

  /**
   * Converts a plain JSON object to a Decision instance.
   */
  static fromJSON(json) {
    if (!json) throw new Error('JSON payload is required');
    return Decision.fromJSON(json);
  }
}

module.exports = DecisionSerializer;
