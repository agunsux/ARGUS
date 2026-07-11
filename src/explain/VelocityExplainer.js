/**
 * VelocityExplainer — Phase 19 Explainability Platform
 * 
 * Translates transaction frequency spikes and risk velocity flags.
 */
class VelocityExplainer {
  static explainHuman(decision) {
    if (!decision || !decision.riskIds || decision.riskIds.length === 0) {
      return 'No transaction velocity or risk rate limits were breached.';
    }
    return `Velocity/risk factors triggered: ${decision.riskIds.join(', ')}.`;
  }

  static explainTechnical(decision) {
    if (!decision) return {};
    return {
      riskIds: decision.riskIds || []
    };
  }
}

module.exports = VelocityExplainer;
