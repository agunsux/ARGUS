const BaseContract = require('../contracts/BaseContract');

/**
 * LearningSnapshot Contract
 * 
 * Enforces the schema of an epoch-based learning and retraining snapshot.
 */
class LearningSnapshot extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.epochId = data.epochId || '';
    this.casesProcessed = typeof data.casesProcessed === 'number' ? data.casesProcessed : 0;
    this.modelParameters = data.modelParameters || {};
    this.driftStatus = data.driftStatus || { driftDetected: false, ksStatistic: 0 };
    this.metrics = data.metrics || { precision: 1.0, recall: 1.0, f1: 1.0 };
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.epochId !== 'string' || !this.epochId.trim()) {
      errors.push('epochId must be a non-empty string');
    }
    if (typeof this.casesProcessed !== 'number' || this.casesProcessed < 0) {
      errors.push('casesProcessed must be a non-negative number');
    }
    if (typeof this.modelParameters !== 'object' || this.modelParameters === null) {
      errors.push('modelParameters must be an object');
    }
    if (typeof this.driftStatus !== 'object' || this.driftStatus === null) {
      errors.push('driftStatus must be an object');
    }
    if (typeof this.metrics !== 'object' || this.metrics === null) {
      errors.push('metrics must be an object');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      epochId: this.epochId,
      casesProcessed: this.casesProcessed,
      modelParameters: this.modelParameters,
      driftStatus: this.driftStatus,
      metrics: this.metrics
    };
  }
}

module.exports = LearningSnapshot;
