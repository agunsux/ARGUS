const BaseContract = require('../contracts/BaseContract');

/**
 * RollbackDecision Contract
 * 
 * Enforces the schema of model rollback events.
 */
class RollbackDecision extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.modelId = data.modelId || '';
    this.rolledBackTo = data.rolledBackTo || '';
    this.triggerMetric = data.triggerMetric || '';
    this.reason = data.reason || '';
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.modelId !== 'string' || !this.modelId.trim()) {
      errors.push('modelId must be a non-empty string');
    }
    if (typeof this.rolledBackTo !== 'string' || !this.rolledBackTo.trim()) {
      errors.push('rolledBackTo must be a non-empty string');
    }
    if (typeof this.reason !== 'string' || !this.reason.trim()) {
      errors.push('reason must be a non-empty string');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      modelId: this.modelId,
      rolledBackTo: this.rolledBackTo,
      triggerMetric: this.triggerMetric,
      reason: this.reason
    };
  }
}

module.exports = RollbackDecision;
