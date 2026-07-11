/**
 * ExposureCalculator — Phase 6/EPIC H Recommendation Platform
 * 
 * Computes exposure and risk limit thresholds based on entity trust profiles.
 */
class ExposureCalculator {
  /**
   * Calculates maximum recommended exposure limit.
   */
  static calculateLimit(entityId, baseLimit = 10000000, trustScore = 100) {
    if (typeof baseLimit !== 'number' || baseLimit <= 0) {
      throw new Error('Base limit must be a positive number');
    }
    const score = typeof trustScore === 'number' ? trustScore : 50;
    
    // Scale limit linearly with trust (0.1x minimum to 1.0x maximum multiplier)
    const multiplier = Math.min(1.0, Math.max(0.1, score / 100));
    return Math.round(baseLimit * multiplier);
  }

  /**
   * Checks if a transaction exceeds the allowed exposure boundary.
   */
  static isExceeded(currentExposure, transactionAmount, limit) {
    return (currentExposure + transactionAmount) > limit;
  }
}

module.exports = ExposureCalculator;
