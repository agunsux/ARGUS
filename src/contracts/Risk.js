const BaseContract = require('./BaseContract');

/**
 * Risk Contract
 * 
 * Enforces schema of a Risk canonical object.
 */
class Risk extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.transactionId = data.transactionId || '';
    this.riskScore = typeof data.riskScore === 'number' ? data.riskScore : 0; // 0 to 100
    this.riskLevel = data.riskLevel || 'LOW'; // 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    this.signals = Array.isArray(data.signals) ? data.signals : [];
    this.contributors = data.contributors || {};
    this.missingInformation = Array.isArray(data.missingInformation) ? data.missingInformation : [];
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.transactionId !== 'string' || !this.transactionId.trim()) {
      errors.push('transactionId must be a non-empty string');
    }
    if (typeof this.riskScore !== 'number' || this.riskScore < 0 || this.riskScore > 100) {
      errors.push('riskScore must be a number between 0 and 100');
    }
    const validRiskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validRiskLevels.includes(this.riskLevel)) {
      errors.push(`riskLevel must be one of: ${validRiskLevels.join(', ')}`);
    }
    if (!Array.isArray(this.signals)) {
      errors.push('signals must be an array');
    }
    if (typeof this.contributors !== 'object' || this.contributors === null) {
      errors.push('contributors must be an object');
    }
    if (!Array.isArray(this.missingInformation)) {
      errors.push('missingInformation must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      transactionId: this.transactionId,
      riskScore: this.riskScore,
      riskLevel: this.riskLevel,
      signals: this.signals,
      contributors: this.contributors,
      missingInformation: this.missingInformation
    };
  }
}

module.exports = Risk;
