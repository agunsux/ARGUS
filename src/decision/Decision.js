const BaseContract = require('../contracts/BaseContract');
const { ACTIONS, STATES } = require('./decision.types');

/**
 * Decision Domain Object
 * 
 * Extends BaseContract to incorporate Decision-specific attributes, 
 * lifecycle states, and structured explanations.
 */
class Decision extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.action = data.action || ''; // 'APPROVE', 'FLAG', 'BLOCK', 'REVIEW'
    this.confidence = typeof data.confidence === 'number' ? data.confidence : 0; // 0 to 1
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
    this.lifecycleState = data.lifecycleState || STATES.PENDING;
  }

  /**
   * Validates Decision attributes and superclass fields.
   */
  validate() {
    const res = super.validate();
    const errors = res.errors;

    const validActions = Object.values(ACTIONS);
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
    }
    if (!Array.isArray(this.evidenceIds)) {
      errors.push('evidenceIds must be an array');
    }
    if (!Array.isArray(this.inferenceIds)) {
      errors.push('inferenceIds must be an array');
    }
    if (!Array.isArray(this.riskIds)) {
      errors.push('riskIds must be an array');
    }

    const validStates = Object.values(STATES);
    if (!validStates.includes(this.lifecycleState)) {
      errors.push(`lifecycleState must be one of: ${validStates.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Serializes properties to plain JSON.
   */
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
      modelVersion: this.modelVersion,
      lifecycleState: this.lifecycleState
    };
  }
}

module.exports = Decision;
