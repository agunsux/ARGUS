/**
 * KellyEngine — Phase 6/EPIC H Recommendation Platform
 * 
 * Implements Kelly Criterion calculations to determine optimal 
 * exposure sizes based on transaction confidence and payout/risk odds.
 */
class KellyEngine {
  /**
   * Calculates Kelly fraction: f* = p - (1-p)/b
   * 
   * @param {number} probability Win probability (0.0 - 1.0)
   * @param {number} odds Payout odds (b:1)
   */
  static calculate(probability, odds = 1.0) {
    if (typeof probability !== 'number' || probability < 0 || probability > 1) {
      throw new Error('Probability must be a number between 0 and 1');
    }
    if (typeof odds !== 'number' || odds <= 0) {
      throw new Error('Odds must be a positive number');
    }

    const fraction = probability - (1 - probability) / odds;
    
    // Constraint: clamp between 0.0 and 1.0 (no leveraging/shorting)
    return parseFloat(Math.min(1.0, Math.max(0.0, fraction)).toFixed(4));
  }
}

module.exports = KellyEngine;
