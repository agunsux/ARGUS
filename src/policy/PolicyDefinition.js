/**
 * PolicyDefinition — Phase 5 Policy Framework
 * 
 * Represents the declarative schema of a Policy's configuration, 
 * which can be parsed, compiled, or persisted.
 */
class PolicyDefinition {
  constructor(data = {}) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.version = data.version || '1.0.0';
    this.schemaVersion = data.schemaVersion || '1.0.0';
    this.compatibleSince = data.compatibleSince || '1.0.0';
    this.deprecatedSince = data.deprecatedSince || '';
    this.rules = Array.isArray(data.rules) ? data.rules : [];
  }
}

module.exports = PolicyDefinition;
