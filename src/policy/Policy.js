/**
 * Policy — Phase 5 Policy Framework
 * 
 * Executable compiled policy containing active rule sets.
 */
class Policy {
  constructor(data = {}) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.version = data.version || '1.0.0';
    this.schemaVersion = data.schemaVersion || '1.0.0';
    this.compatibleSince = data.compatibleSince || '1.0.0';
    this.deprecatedSince = data.deprecatedSince || '';
    this.ruleSet = data.ruleSet || null;
  }
}

module.exports = Policy;
