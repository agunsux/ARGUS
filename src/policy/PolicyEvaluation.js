const BaseContract = require('../contracts/BaseContract');

/**
 * PolicyEvaluation — Phase 5 Policy Framework
 * 
 * Canonical object documenting the complete evaluation outcome of a Policy 
 * against a DecisionCandidate. Inherits from BaseContract for traceability.
 */
class PolicyEvaluation extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.policyId = data.policyId || '';
    this.matchedRules = Array.isArray(data.matchedRules) ? data.matchedRules : [];
    this.failedRules = Array.isArray(data.failedRules) ? data.failedRules : [];
    this.constraints = Array.isArray(data.constraints) ? data.constraints : [];
    this.predicates = Array.isArray(data.predicates) ? data.predicates : [];
    this.decision = data.decision || 'APPROVE'; // Resolution severity: e.g. BLOCK, FLAG, REVIEW, APPROVE
    this.confidence = typeof data.confidence === 'number' ? data.confidence : 1.0;
    this.reasonCodes = Array.isArray(data.reasonCodes) ? data.reasonCodes : [];
    
    // Extracted evidence/explainability components from matched rules
    this.supportingEvidence = Array.isArray(data.supportingEvidence) ? data.supportingEvidence : [];
    this.contradictingEvidence = Array.isArray(data.contradictingEvidence) ? data.contradictingEvidence : [];
    this.missingEvidence = Array.isArray(data.missingEvidence) ? data.missingEvidence : [];
    this.evaluationTrace = Array.isArray(data.evaluationTrace) ? data.evaluationTrace : [];
  }

  /**
   * Validates structural invariants of the PolicyEvaluation.
   */
  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.policyId !== 'string' || !this.policyId.trim()) {
      errors.push('policyId must be a non-empty string');
    }
    if (typeof this.decision !== 'string' || !this.decision.trim()) {
      errors.push('decision must be a non-empty string');
    }
    if (typeof this.confidence !== 'number' || this.confidence < 0 || this.confidence > 1) {
      errors.push('confidence must be a number between 0 and 1');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      policyId: this.policyId,
      matchedRules: this.matchedRules,
      failedRules: this.failedRules,
      constraints: this.constraints,
      predicates: this.predicates,
      decision: this.decision,
      confidence: this.confidence,
      reasonCodes: this.reasonCodes,
      supportingEvidence: this.supportingEvidence,
      contradictingEvidence: this.contradictingEvidence,
      missingEvidence: this.missingEvidence,
      evaluationTrace: this.evaluationTrace
    };
  }
}

module.exports = PolicyEvaluation;
