/**
 * PolicyRule — Phase 5 Policy Framework
 * 
 * Maps constraint validations to specific actions (e.g. BLOCK), 
 * reason codes, and supporting evidence definitions.
 */
class PolicyRule {
  constructor(data = {}) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.description = data.description || '';
    this.action = data.action || 'APPROVE';
    this.reasonCode = data.reasonCode || '';
    this.constraints = Array.isArray(data.constraints) ? data.constraints : [];
    this.evidenceRequirements = data.evidenceRequirements || {
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidence: []
    };
  }

  /**
   * Evaluates if the rule's constraints are met.
   */
  evaluate(candidate) {
    if (this.constraints.length === 0) return true;
    return this.constraints.every(c => c.evaluate(candidate));
  }
}

module.exports = PolicyRule;
