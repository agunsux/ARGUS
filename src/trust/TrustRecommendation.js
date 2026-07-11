/**
 * TrustRecommendation — Phase 8/EPIC I Trust Intelligence
 * 
 * Maps trust scores to concrete system-level recommendations (e.g. SUSPEND, MONITOR).
 */
class TrustRecommendation {
  /**
   * Translates a numerical score into a recommended action tag.
   */
  static recommendAction(trustScore) {
    if (typeof trustScore !== 'number') return 'NONE';

    if (trustScore < 30) return 'SUSPEND';
    if (trustScore < 60) return 'VERIFY';
    if (trustScore < 80) return 'MONITOR';
    
    return 'NONE';
  }
}

module.exports = TrustRecommendation;
