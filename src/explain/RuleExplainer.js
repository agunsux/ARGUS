/**
 * RuleExplainer — Phase 19 Explainability Platform
 * 
 * Explains rule matched or failed triggers.
 */
class RuleExplainer {
  static explainHuman(evaluation) {
    if (!evaluation || !evaluation.matchedRules || evaluation.matchedRules.length === 0) {
      return 'No policy rules were violated.';
    }
    return `Violated rules: ${evaluation.matchedRules.join(', ')}.`;
  }

  static explainTechnical(evaluation) {
    if (!evaluation) return {};
    return {
      matchedRules: evaluation.matchedRules,
      failedRules: evaluation.failedRules,
      reasonCodes: evaluation.reasonCodes,
      ruleTrace: evaluation.evaluationTrace || []
    };
  }
}

module.exports = RuleExplainer;
