/**
 * TrustEvolution — Phase 8/EPIC I Trust Intelligence
 * 
 * Computes trust score adjustments over time, simulating positive amplification 
 * or negative reputation decay.
 */
class TrustEvolution {
  /**
   * Adjusts reputation based on signals and default positive growth parameters.
   */
  static evolve(currentScore, signals = [], growthRate = 0.05) {
    let score = typeof currentScore === 'number' ? currentScore : 50;

    // Apply all signal modifiers
    for (const signal of signals) {
      score += signal.scoreModifier || 0;
    }

    // Passive growth over time if no negative signals exist
    const hasPenalties = signals.some(s => s.scoreModifier < 0);
    if (!hasPenalties && score < 100) {
      score += growthRate * (100 - score);
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }
}

module.exports = TrustEvolution;
