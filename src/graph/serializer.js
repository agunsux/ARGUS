/**
 * Graph Serializer — Phase 4 Knowledge Graph Foundation
 *
 * Serializes and deserializes KnowledgeGraph instances to/from JSON.
 * Supports compact and pretty formats.
 */
const { KnowledgeGraph } = require('./graph');
const { GraphValidator } = require('./validator');

class GraphSerializer {
  /**
   * Serializes a graph to a JSON string.
   */
  static serialize(graph, options = {}) {
    const { pretty = false, includeHash = true, validate = true } = options;
    if (validate) {
      const v = GraphValidator.validateGraph(graph);
      if (!v.valid) throw new Error('Cannot serialize invalid graph: ' + v.errors[0].message);
    }
    const data = graph.toJSON();
    if (includeHash) {
      data.hash = graph.computeHash();
    }
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  /**
   * Deserializes a JSON string back into a KnowledgeGraph.
   */
  static deserialize(jsonString, options = {}) {
    const { validate = true } = options;
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (err) {
      throw new Error('Invalid JSON: ' + err.message);
    }
    const graph = KnowledgeGraph.fromJSON(data);
    if (validate) {
      const v = GraphValidator.validateGraph(graph);
      if (!v.valid) throw new Error('Deserialized graph is invalid: ' + v.errors[0].message);
    }
    return graph;
  }

  /**
   * Exports graph as a minimal JSON (nodes and edges only).
   */
  static exportMinimal(graph) {
    return JSON.stringify(graph.toJSON());
  }

  /**
   * Returns statistics as a formatted string.
   */
  static formatStats(graph) {
    const stats = graph.getStats();
    const lines = [
      `Nodes: ${stats.nodeCount}`,
      `Edges: ${stats.edgeCount}`,
      `Node types: ${Object.entries(stats.nodeTypes).map(([k, v]) => `${k}:${v}`).join(', ')}`,
      `Relationships: ${Object.entries(stats.relationshipCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`,
      `Hash: ${graph.computeHash()}`
    ];
    return lines.join('\n');
  }
}

module.exports = { GraphSerializer };