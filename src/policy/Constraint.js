/**
 * Constraint — Phase 5 Policy Framework
 * 
 * Defines comparison evaluations on specific fact paths inside a DecisionCandidate.
 */
class Constraint {
  constructor(data = {}) {
    this.field = data.field || ''; // E.g., 'facts.riskScore'
    this.operator = data.operator || 'EQUAL'; // 'EQUAL', 'NOT_EQUAL', 'GREATER_THAN', 'GREATER_EQUAL', 'LESS_THAN', 'LESS_EQUAL', 'CONTAINS', 'IN'
    this.value = data.value !== undefined ? data.value : null;
  }

  /**
   * Evaluates the constraint against a DecisionCandidate.
   */
  evaluate(candidate) {
    if (!candidate) return false;
    const actualValue = this._resolvePath(candidate, this.field);
    
    switch (this.operator) {
      case 'EQUAL':
        return actualValue === this.value;
      case 'NOT_EQUAL':
        return actualValue !== this.value;
      case 'GREATER_THAN':
        return actualValue > this.value;
      case 'GREATER_EQUAL':
        return actualValue >= this.value;
      case 'LESS_THAN':
        return actualValue < this.value;
      case 'LESS_EQUAL':
        return actualValue <= this.value;
      case 'CONTAINS':
        return Array.isArray(actualValue) && actualValue.includes(this.value);
      case 'IN':
        return Array.isArray(this.value) && this.value.includes(actualValue);
      default:
        return false;
    }
  }

  _resolvePath(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce((acc, part) => {
      return acc && acc[part] !== undefined ? acc[part] : undefined;
    }, obj);
  }
}

module.exports = Constraint;
