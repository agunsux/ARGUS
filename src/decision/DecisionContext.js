/**
 * DecisionContext — Phase 5 Decision Domain
 * 
 * Enforces schema validation of inputs fed into the Decision Engine.
 */
class DecisionContext {
  constructor(data = {}) {
    this.transaction = data.transaction !== undefined ? data.transaction : null;
    this.evidence = Array.isArray(data.evidence) ? data.evidence : [];
    this.risk = data.risk !== undefined ? data.risk : null;
    this.inference = data.inference !== undefined ? data.inference : null;
    this.features = data.features !== undefined ? data.features : {};
    this.history = data.history !== undefined ? data.history : {};
    this.executionId = data.executionId !== undefined ? data.executionId : '';
    this.correlationId = data.correlationId !== undefined ? data.correlationId : '';
    this.causationId = data.causationId !== undefined ? data.causationId : '';
    this.timestamp = data.timestamp !== undefined ? data.timestamp : new Date().toISOString();
  }

  /**
   * Validates structural invariants of the context.
   */
  validate() {
    const errors = [];
    if (!this.transaction || typeof this.transaction !== 'object' || !this.transaction.transactionId) {
      errors.push('transaction must be a valid object containing transactionId');
    }
    if (typeof this.executionId !== 'string' || !this.executionId.trim()) {
      errors.push('executionId is required');
    }
    if (typeof this.correlationId !== 'string' || !this.correlationId.trim()) {
      errors.push('correlationId is required');
    }
    if (typeof this.features !== 'object' || this.features === null) {
      errors.push('features must be an object');
    }
    if (!Array.isArray(this.evidence)) {
      errors.push('evidence must be an array');
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Clone the context.
   */
  clone() {
    return new DecisionContext(JSON.parse(JSON.stringify(this.toJSON())));
  }

  /**
   * Serializes the context to JSON.
   */
  toJSON() {
    return {
      transaction: this.transaction,
      evidence: this.evidence,
      risk: this.risk,
      inference: this.inference,
      features: this.features,
      history: this.history,
      executionId: this.executionId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      timestamp: this.timestamp
    };
  }

  static fromJSON(json) {
    return new DecisionContext(json);
  }
}

module.exports = DecisionContext;
