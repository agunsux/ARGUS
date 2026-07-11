/**
 * Predicate — Phase 5 Policy Framework
 * 
 * Implements logical combinations (AND, OR, NOT) over constraints and other predicates.
 */
class Predicate {
  constructor(type, children = []) {
    this.type = type; // 'AND', 'OR', 'NOT'
    this.children = children; // Array of Constraints or Predicates
  }

  /**
   * Evaluates the logical combination against a DecisionCandidate.
   */
  evaluate(candidate) {
    if (this.type === 'AND') {
      if (this.children.length === 0) return true;
      return this.children.every(child => child.evaluate(candidate));
    }
    if (this.type === 'OR') {
      if (this.children.length === 0) return false;
      return this.children.some(child => child.evaluate(candidate));
    }
    if (this.type === 'NOT') {
      if (this.children.length === 0) return false;
      return !this.children[0].evaluate(candidate);
    }
    return false;
  }
}

module.exports = Predicate;
