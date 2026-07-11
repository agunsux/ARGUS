const BaseContract = require('./BaseContract');

/**
 * Recommendation Contract
 * 
 * Enforces schema of a Recommendation canonical object.
 */
class Recommendation extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.decisionId = data.decisionId || '';
    this.recommendedAction = data.recommendedAction || ''; // 'HOLD', 'SELL', 'BUY', 'EXECUTE', 'REJECT'
    this.priority = data.priority || 'MEDIUM'; // 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    this.category = data.category || 'general'; // e.g. 'arbitrage', 'risk-mitigation'
    this.confidence = typeof data.confidence === 'number' ? data.confidence : 0;
    this.actions = Array.isArray(data.actions) ? data.actions : [];
    this.explanation = data.explanation || {
      why: '',
      supportingEvidence: []
    };
    this.alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];
    this.history = Array.isArray(data.history) ? data.history : [];
    this.suppression = data.suppression || { suppressed: false, reason: '' };
    this.feedback = data.feedback || { status: 'PENDING', reason: '' };
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.decisionId !== 'string' || !this.decisionId.trim()) {
      errors.push('decisionId must be a non-empty string');
    }
    if (typeof this.recommendedAction !== 'string' || !this.recommendedAction.trim()) {
      errors.push('recommendedAction must be a non-empty string');
    }
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validPriorities.includes(this.priority)) {
      errors.push(`priority must be one of: ${validPriorities.join(', ')}`);
    }
    if (typeof this.confidence !== 'number' || this.confidence < 0 || this.confidence > 1) {
      errors.push('confidence must be a number between 0 and 1');
    }
    if (!Array.isArray(this.actions)) {
      errors.push('actions must be an array');
    }
    if (typeof this.explanation !== 'object' || this.explanation === null) {
      errors.push('explanation must be an object');
    }
    if (!Array.isArray(this.alternatives)) {
      errors.push('alternatives must be an array');
    }
    if (!Array.isArray(this.history)) {
      errors.push('history must be an array');
    }
    if (typeof this.suppression !== 'object' || this.suppression === null) {
      errors.push('suppression must be an object');
    }
    if (typeof this.feedback !== 'object' || this.feedback === null) {
      errors.push('feedback must be an object');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      decisionId: this.decisionId,
      recommendedAction: this.recommendedAction,
      priority: this.priority,
      category: this.category,
      confidence: this.confidence,
      actions: this.actions,
      explanation: this.explanation,
      alternatives: this.alternatives,
      history: this.history,
      suppression: this.suppression,
      feedback: this.feedback
    };
  }
}

module.exports = Recommendation;
