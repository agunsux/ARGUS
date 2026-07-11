const BaseContract = require('./BaseContract');

/**
 * Trust Contract
 * 
 * Enforces schema of a Trust canonical object.
 */
class Trust extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.entityId = data.entityId || '';
    this.entityType = data.entityType || 'user'; // 'user', 'venue', 'provider'
    this.trustScore = typeof data.trustScore === 'number' ? data.trustScore : 50; // 0 to 100
    this.signals = Array.isArray(data.signals) ? data.signals : [];
    this.history = Array.isArray(data.history) ? data.history : [];
    this.evolution = data.evolution || { growthRate: 0, factors: {} };
    this.explanation = data.explanation || { supporting: [], risk: [] };
    this.alerts = Array.isArray(data.alerts) ? data.alerts : [];
    this.recommendation = data.recommendation || 'NONE'; // 'NONE', 'SUSPEND', 'VERIFY', 'MONITOR'
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.entityId !== 'string' || !this.entityId.trim()) {
      errors.push('entityId must be a non-empty string');
    }
    const validEntityTypes = ['user', 'venue', 'provider'];
    if (!validEntityTypes.includes(this.entityType)) {
      errors.push(`entityType must be one of: ${validEntityTypes.join(', ')}`);
    }
    if (typeof this.trustScore !== 'number' || this.trustScore < 0 || this.trustScore > 100) {
      errors.push('trustScore must be a number between 0 and 100');
    }
    if (!Array.isArray(this.signals)) {
      errors.push('signals must be an array');
    }
    if (!Array.isArray(this.history)) {
      errors.push('history must be an array');
    }
    if (typeof this.evolution !== 'object' || this.evolution === null) {
      errors.push('evolution must be an object');
    }
    if (typeof this.explanation !== 'object' || this.explanation === null) {
      errors.push('explanation must be an object');
    }
    if (!Array.isArray(this.alerts)) {
      errors.push('alerts must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      entityId: this.entityId,
      entityType: this.entityType,
      trustScore: this.trustScore,
      signals: this.signals,
      history: this.history,
      evolution: this.evolution,
      explanation: this.explanation,
      alerts: this.alerts,
      recommendation: this.recommendation
    };
  }
}

module.exports = Trust;
