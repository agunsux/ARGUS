const ScenarioLibrary = require('./ScenarioLibrary');

/**
 * AttackSimulator — Phase 18 Historical Intelligence Laboratory
 * 
 * Generates synthetic transactional data simulating fraud spikes 
 * based on canonical attack patterns.
 */
class AttackSimulator {
  /**
   * Generates a batch of simulated transactions reflecting a specific attack signature.
   */
  static generateSpike(patternType, count = 5) {
    const template = ScenarioLibrary.get(patternType);
    if (!template) {
      throw new Error(`Unknown attack pattern: '${patternType}'`);
    }

    const simulations = [];
    for (let i = 0; i < count; i++) {
      const indexStr = `${i + 1}`;
      const transactions = template.transactions.map(tx => ({
        transactionId: `${tx.transactionId}-sim-${indexStr}`,
        price: Math.round(tx.price * (0.9 + Math.random() * 0.2)), // inject price noise
        actorRole: tx.actorRole
      }));

      // Generate simulated risk details
      const riskScore = Math.min(100, Math.max(0, Math.round(template.risk.riskScore * (0.95 + Math.random() * 0.1))));
      const risk = {
        id: `rsk-sim-${patternType}-${indexStr}`,
        riskScore,
        riskLevel: riskScore > 75 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW'
      };

      // Generate simulated inference
      const probability = parseFloat(Math.min(1.0, Math.max(0.0, template.inference.probability * (0.98 + Math.random() * 0.04))).toFixed(4));
      const inference = {
        id: `inf-sim-${patternType}-${indexStr}`,
        prediction: template.inference.prediction,
        probability
      };

      // Map evidence
      const evidence = template.evidence.map((e, idx) => ({
        id: `${e.id}-sim-${indexStr}-${idx}`,
        type: e.type
      }));

      simulations.push({
        id: `${patternType}-sim-scenario-${indexStr}`,
        name: `${template.name} Simulation Run #${indexStr}`,
        description: template.description,
        transactions,
        risk,
        inference,
        evidence
      });
    }

    return simulations;
  }
}

module.exports = AttackSimulator;
