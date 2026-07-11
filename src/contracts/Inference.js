const BaseContract = require('./BaseContract');

/**
 * Inference Contract
 * 
 * Enforces schema of an Inference canonical object.
 */
class Inference extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.transactionId = data.transactionId || '';
    this.prediction = data.prediction || 'GENUINE';
    this.probability = typeof data.probability === 'number' ? data.probability : 0.5; // 0.0 to 1.0
    this.featuresUsed = Array.isArray(data.featuresUsed) ? data.featuresUsed : [];
    this.modelName = data.modelName || 'default_fraud_model';
    this.modelVersion = data.modelVersion || '1.0.0';
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.transactionId !== 'string' || !this.transactionId.trim()) {
      errors.push('transactionId must be a non-empty string');
    }
    if (typeof this.prediction !== 'string' || !this.prediction.trim()) {
      errors.push('prediction must be a non-empty string');
    }
    if (typeof this.probability !== 'number' || this.probability < 0 || this.probability > 1) {
      errors.push('probability must be a number between 0 and 1');
    }
    if (!Array.isArray(this.featuresUsed)) {
      errors.push('featuresUsed must be an array');
    }
    if (typeof this.modelName !== 'string' || !this.modelName.trim()) {
      errors.push('modelName must be a non-empty string');
    }
    if (typeof this.modelVersion !== 'string' || !this.modelVersion.trim()) {
      errors.push('modelVersion must be a non-empty string');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      transactionId: this.transactionId,
      prediction: this.prediction,
      probability: this.probability,
      featuresUsed: this.featuresUsed,
      modelName: this.modelName,
      modelVersion: this.modelVersion
    };
  }
}

module.exports = Inference;
