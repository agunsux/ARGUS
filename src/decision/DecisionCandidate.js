const BaseContract = require('../contracts/BaseContract');

/**
 * DecisionCandidate — Phase 5 Decision Domain
 * 
 * Transitional domain object representing consolidated facts, inferences, 
 * and risk levels compiled from the context, before policies are executed.
 */
class DecisionCandidate extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.transactionId = data.transactionId || '';
    this.facts = data.facts || {};
    this.inferences = Array.isArray(data.inferences) ? data.inferences : [];
    this.risks = Array.isArray(data.risks) ? data.risks : [];
    this.evidenceIds = Array.isArray(data.evidenceIds) ? data.evidenceIds : [];
    this.rawScore = typeof data.rawScore === 'number' ? data.rawScore : 0;
    this.rawConfidence = typeof data.rawConfidence === 'number' ? data.rawConfidence : 0;
  }

  /**
   * Validates structure of the DecisionCandidate.
   */
  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.transactionId !== 'string' || !this.transactionId.trim()) {
      errors.push('transactionId must be a non-empty string');
    }
    if (typeof this.facts !== 'object' || this.facts === null) {
      errors.push('facts must be an object');
    }
    if (!Array.isArray(this.inferences)) {
      errors.push('inferences must be an array');
    }
    if (!Array.isArray(this.risks)) {
      errors.push('risks must be an array');
    }
    if (!Array.isArray(this.evidenceIds)) {
      errors.push('evidenceIds must be an array');
    }
    if (typeof this.rawScore !== 'number' || this.rawScore < 0 || this.rawScore > 100) {
      errors.push('rawScore must be a number between 0 and 100');
    }
    if (typeof this.rawConfidence !== 'number' || this.rawConfidence < 0 || this.rawConfidence > 1) {
      errors.push('rawConfidence must be a number between 0 and 1');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      transactionId: this.transactionId,
      facts: this.facts,
      inferences: this.inferences,
      risks: this.risks,
      evidenceIds: this.evidenceIds,
      rawScore: this.rawScore,
      rawConfidence: this.rawConfidence
    };
  }
}

module.exports = DecisionCandidate;
