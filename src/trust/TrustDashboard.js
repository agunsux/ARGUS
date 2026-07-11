/**
 * TrustDashboard — Phase 8/EPIC I Trust Intelligence
 * 
 * Aggregates network trust scores into statistics for visual reporting.
 */
class TrustDashboard {
  /**
   * Generates dashboard statistics from a map of trust scores.
   */
  static generateDashboard(trustScoresMap) {
    if (!trustScoresMap || trustScoresMap.size === 0) {
      return {
        averageTrustScore: 80,
        excellentCount: 0,
        goodCount: 0,
        poorCount: 0
      };
    }

    const scores = Array.from(trustScoresMap.values());
    const total = scores.reduce((sum, s) => sum + s, 0);
    const average = Math.round(total / scores.length);

    const excellentCount = scores.filter(s => s >= 80).length;
    const goodCount = scores.filter(s => s >= 60 && s < 80).length;
    const poorCount = scores.filter(s => s < 60).length;

    return {
      averageTrustScore: average,
      excellentCount,
      goodCount,
      poorCount
    };
  }
}

module.exports = TrustDashboard;
