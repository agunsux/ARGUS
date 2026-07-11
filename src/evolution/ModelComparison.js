const BaseContract = require('../contracts/BaseContract');

/**
 * ModelComparison Contract
 * 
 * Enforces the schema of model performance comparison objects.
 */
class ModelComparison extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.challengerId = data.challengerId || '';
    this.championId = data.championId || '';
    this.metricsDifference = data.metricsDifference || {};
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.challengerId !== 'string' || !this.challengerId.trim()) {
      errors.push('challengerId must be a non-empty string');
    }
    if (typeof this.championId !== 'string' || !this.championId.trim()) {
      errors.push('championId must be a non-empty string');
    }
    if (typeof this.metricsDifference !== 'object' || this.metricsDifference === null) {
      errors.push('metricsDifference must be an object');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      challengerId: this.challengerId,
      championId: this.championId,
      metricsDifference: this.metricsDifference
    };
  }
}

module.exports = ModelComparison;
