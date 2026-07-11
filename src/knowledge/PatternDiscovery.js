/**
 * PatternDiscovery — EPIC Ω Knowledge & Learning Layer
 * 
 * Analyzes Graph node linkages to automatically discover fraud cycles or cliques.
 */
class PatternDiscovery {
  /**
   * Identifies circular association paths (mutual relationship loops).
   */
  static discoverCycles(graph) {
    if (!graph || typeof graph.getNeighbors !== 'function') {
      return [];
    }

    const cycles = [];
    
    for (const node of graph.nodes.values()) {
      const neighbors = graph.getNeighbors(node.id);
      for (const nb of neighbors) {
        const subNeighbors = graph.getNeighbors(nb.node.id);
        for (const subNb of subNeighbors) {
          // If a mutual link points back to the starting node, we have a loop
          if (subNb.node.id === node.id && nb.node.id !== node.id) {
            // Sort node ids to avoid storing duplicate path variations
            const path = [node.id, nb.node.id].sort();
            const exists = cycles.some(c => c[0] === path[0] && c[1] === path[1]);
            if (!exists) {
              cycles.push(path);
            }
          }
        }
      }
    }

    return cycles;
  }
}

module.exports = PatternDiscovery;
