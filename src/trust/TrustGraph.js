const { graph: baseGraph } = require('../graph/graph');

/**
 * TrustGraph — Phase 8/EPIC I Trust Intelligence
 * 
 * Integrates reputation values into the Identity Graph nodes.
 * Propagates trust scores across neighbor entities.
 */
class TrustGraph {
  constructor(graph = baseGraph) {
    this.graph = graph;
    this.trustScores = new Map(); // Key: entityId -> Value: trustScore (number)
  }

  /**
   * Registers or updates a local trust score.
   */
  setTrustScore(entityId, score) {
    if (!entityId) throw new Error('entityId is required');
    this.trustScores.set(entityId, score);
  }

  /**
   * Resolves the basic trust score.
   */
  getTrustScore(entityId) {
    return this.trustScores.get(entityId) || 80; // Default reputation baseline
  }

  /**
   * Propagates and resolves network proximity trust.
   * Decreases reputation if connected to lower trust entity nodes in the Identity Graph.
   */
  calculateNetworkTrust(entityId) {
    const baseScore = this.getTrustScore(entityId);

    // Fetch linked nodes in the Identity Graph
    const neighbors = this.graph.getNeighbors(entityId);
    if (!neighbors || neighbors.length === 0) {
      return baseScore;
    }

    let sum = baseScore;
    let count = 1;

    for (const neighbor of neighbors) {
      const neighborId = neighbor.node.id;
      const neighborScore = this.getTrustScore(neighborId);
      sum += neighborScore;
      count++;
    }

    return Math.round(sum / count);
  }
}

module.exports = TrustGraph;
