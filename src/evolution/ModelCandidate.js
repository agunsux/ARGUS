const BaseContract = require('../contracts/BaseContract');

/**
 * ModelCandidate Contract
 * 
 * Enforces the schema of an immutable Model Candidate and its metrics.
 */
class ModelCandidate extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.modelId = data.modelId || '';
    this.semver = data.semver || '1.0.0';
    this.state = data.state || 'TRAINING'; // TRAINING, VALIDATING, SHADOW, CANARY, CHAMPION, RETIRED, ARCHIVED, ROLLED_BACK, FAILED
    this.hyperparameters = data.hyperparameters || {};
    this.performanceMetrics = data.performanceMetrics || { precision: 0.9, recall: 0.9, logLoss: 0.2 };
    this.approvalHistory = Array.isArray(data.approvalHistory) ? data.approvalHistory : [];
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.modelId !== 'string' || !this.modelId.trim()) {
      errors.push('modelId must be a non-empty string');
    }
    if (typeof this.semver !== 'string' || !this.semver.trim()) {
      errors.push('semver must be a non-empty string');
    }
    const validStates = [
      'TRAINING', 'VALIDATING', 'SHADOW', 'CANARY', 'CHAMPION', 
      'RETIRED', 'ARCHIVED', 'ROLLED_BACK', 'FAILED'
    ];
    if (!validStates.includes(this.state)) {
      errors.push(`state must be one of: ${validStates.join(', ')}`);
    }
    if (typeof this.hyperparameters !== 'object' || this.hyperparameters === null) {
      errors.push('hyperparameters must be an object');
    }
    if (typeof this.performanceMetrics !== 'object' || this.performanceMetrics === null) {
      errors.push('performanceMetrics must be an object');
    }
    if (!Array.isArray(this.approvalHistory)) {
      errors.push('approvalHistory must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      modelId: this.modelId,
      semver: this.semver,
      state: this.state,
      hyperparameters: this.hyperparameters,
      performanceMetrics: this.performanceMetrics,
      approvalHistory: this.approvalHistory
    };
  }
}

module.exports = ModelCandidate;
