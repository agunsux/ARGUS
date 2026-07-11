const Decision = require('./Decision');
const { ACTIONS } = require('./decision.types');

/**
 * DecisionValidator — Phase 5 Decision Domain
 * 
 * Enforces business rules and semantic invariants for Decision objects.
 */
class DecisionValidator {
  /**
   * Semantically validates a Decision instance.
   * Returns { valid: boolean, errors: string[] }
   */
  static validate(decision) {
    if (!decision) {
      return { valid: false, errors: ['Decision cannot be null or undefined'] };
    }

    if (!(decision instanceof Decision)) {
      return { valid: false, errors: ['Object must be an instance of Decision'] };
    }

    const structVal = decision.validate();
    const errors = structVal.errors;

    // Semantic Invariant 1: Non-approve actions must contain reason codes
    if (decision.action !== ACTIONS.APPROVE && decision.reasonCodes.length === 0) {
      errors.push('reasonCodes cannot be empty for actions other than APPROVE');
    }

    // Semantic Invariant 2: Approved decisions must have non-zero confidence
    if (decision.action === ACTIONS.APPROVE && decision.confidence === 0) {
      errors.push('confidence cannot be 0 for APPROVED decisions');
    }

    // Semantic Invariant 3: Blocked actions must contain supporting risk IDs
    if (decision.action === ACTIONS.BLOCK && decision.riskIds.length === 0) {
      errors.push('riskIds cannot be empty for BLOCKED decisions');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = DecisionValidator;
