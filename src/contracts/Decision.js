const BaseContract = require('./BaseContract');

/**
 * Decision Contract
 * 
 * Enforces schema of a Decision canonical object.
 */
class Decision extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.action = data.action || ''; // 'APPROVE', 'FLAG', 'BLOCK', 'REVIEW'
    this.confidence = typeof data.confidence === 'number' ? data.confidence : 0; // 0.0 to 1.0
    this.reasonCodes = Array.isArray(data.reasonCodes) ? data.reasonCodes : [];
    this.explainability = data.explainability || {
      why: '',
      whyNot: '',
      supportingEvidence: [],
      contradictingEvidence: [],
      riskContributors: {},
      confidenceContributors: {},
      missingInformation: [],
      alternativeOutcomes: []
    };
    this.evidenceIds = Array.isArray(data.evidenceIds) ? data.evidenceIds : [];
    this.inferenceIds = Array.isArray(data.inferenceIds) ? data.inferenceIds : [];
    this.riskIds = Array.isArray(data.riskIds) ? data.riskIds : [];
    this.featureVersion = data.featureVersion || '1.0.0';
    this.pipelineVersion = data.pipelineVersion || '1.0.0';
    this.modelVersion = data.modelVersion || '1.0.0';
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    const validActions = ['APPROVE', 'FLAG', 'BLOCK', 'REVIEW'];
    if (!validActions.includes(this.action)) {
      errors.push(`action must be one of: ${validActions.join(', ')}`);
    }
    if (typeof this.confidence !== 'number' || this.confidence < 0 || this.confidence > 1) {
      errors.push('confidence must be a number between 0 and 1');
    }
    if (!Array.isArray(this.reasonCodes)) {
      errors.push('reasonCodes must be an array');
    }
    if (typeof this.explainability !== 'object' || this.explainability === null) {
      errors.push('explainability must be an object');
    } else {
      if (typeof this.explainability.why !== 'string') errors.push('explainability.why must be a string');
      if (typeof this.explainability.whyNot !== 'string') errors.push('explainability.whyNot must be a string');
      if (!Array.isArray(this.explainability.supportingEvidence)) errors.push('explainability.supportingEvidence must be an array');
      if (!Array.isArray(this.explainability.contradictingEvidence)) errors.push('explainability.contradictingEvidence must be an array');
    }
    if (!Array.isArray(this.evidenceIds)) errors.push('evidenceIds must be an array');
    if (!Array.isArray(this.inferenceIds)) errors.push('inferenceIds must be an array');
    if (!Array.isArray(this.riskIds)) errors.push('riskIds must be an array');
    if (typeof this.featureVersion !== 'string' || !this.featureVersion.trim()) errors.push('featureVersion must be a non-empty string');
    if (typeof this.pipelineVersion !== 'string' || !this.pipelineVersion.trim()) errors.push('pipelineVersion must be a non-empty string');
    if (typeof this.modelVersion !== 'string' || !this.modelVersion.trim()) errors.push('modelVersion must be a non-empty string');

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      action: this.action,
      confidence: this.confidence,
      reasonCodes: this.reasonCodes,
      explainability: this.explainability,
      evidenceIds: this.evidenceIds,
      inferenceIds: this.inferenceIds,
      riskIds: this.riskIds,
      featureVersion: this.featureVersion,
      pipelineVersion: this.pipelineVersion,
      modelVersion: this.modelVersion
    };
  }
}

module.exports = Decision;
