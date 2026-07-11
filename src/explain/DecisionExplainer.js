/**
 * DecisionExplainer — Phase 19 Explainability Platform
 * 
 * Explains overall outcome actions.
 */
class DecisionExplainer {
  static explainHuman(decision) {
    if (!decision) return 'Outcome state is unknown.';
    
    switch (decision.action) {
      case 'BLOCK':
        return 'The transaction was blocked due to critical security policy violations.';
      case 'REVIEW':
        return 'The transaction is flagged for manual review to verify compliance details.';
      case 'FLAG':
        return 'The transaction was processed but flagged for compliance observation.';
      case 'APPROVE':
        return 'The transaction was approved successfully.';
      default:
        return `Transaction outcome is: ${decision.action}.`;
    }
  }

  static explainTechnical(decision) {
    if (!decision) return {};
    return {
      action: decision.action,
      decisionId: decision.id,
      reasonCodes: decision.reasonCodes || []
    };
  }
}

module.exports = DecisionExplainer;
