const BaseContract = require('../contracts/BaseContract');

/**
 * PromotionDecision Contract
 * 
 * Enforces the schema of model promotion events.
 */
class PromotionDecision extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.modelId = data.modelId || '';
    this.promotedTo = data.promotedTo || 'CHAMPION';
    this.reason = data.reason || '';
    this.approvedBy = data.approvedBy || '';
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.modelId !== 'string' || !this.modelId.trim()) {
      errors.push('modelId must be a non-empty string');
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
      promotedTo: this.promotedTo,
      reason: this.reason,
      approvedBy: this.approvedBy
    };
  }
}

module.exports = PromotionDecision;
