/**
 * RuleSet — Phase 5 Policy Framework
 * 
 * Collects and groups PolicyRules for ordered execution.
 */
class RuleSet {
  constructor(rules = []) {
    this.rules = rules;
  }

  add(rule) {
    this.rules.push(rule);
  }

  getRules() {
    return this.rules;
  }
}

module.exports = RuleSet;
