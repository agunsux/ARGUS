/**
 * Graph Query Engine — Phase 4 Knowledge Graph Foundation
 *
 * High-level query methods for finding nodes, edges, shared resources,
 * and extracting subgraphs from the knowledge graph.
 */
class GraphQueryEngine {
  constructor(graph) {
    if (!graph) throw new Error('GraphQueryEngine requires a KnowledgeGraph instance');
    this._graph = graph;
  }

  /**
   * Finds a single node matching a predicate.
   * predicate can be a function (node => boolean) or an object { type, properties }.
   */
  findNode(predicate) {
    for (const node of this._graph.nodes.values()) {
      if (typeof predicate === 'function') {
        if (predicate(node)) return node.toJSON();
      } else {
        if (this._matchesNode(node, predicate)) return node.toJSON();
      }
    }
    return null;
  }

  /**
   * Finds all nodes matching a predicate.
   */
  findNodes(predicate) {
    const results = [];
    for (const node of this._graph.nodes.values()) {
      if (typeof predicate === 'function') {
        if (predicate(node)) results.push(node.toJSON());
      } else {
        if (this._matchesNode(node, predicate)) results.push(node.toJSON());
      }
    }
    return results;
  }

  /**
   * Finds a single edge matching a predicate.
   */
  findEdge(predicate) {
    for (const edge of this._graph.edges.values()) {
      if (typeof predicate === 'function') {
        if (predicate(edge)) return edge.toJSON();
      } else {
        if (this._matchesEdge(edge, predicate)) return edge.toJSON();
      }
    }
    return null;
  }

  /**
   * Finds all edges matching a predicate.
   */
  findEdges(predicate) {
    const results = [];
    for (const edge of this._graph.edges.values()) {
      if (typeof predicate === 'function') {
        if (predicate(edge)) results.push(edge.toJSON());
      } else {
        if (this._matchesEdge(edge, predicate)) results.push(edge.toJSON());
      }
    }
    return results;
  }

  /**
   * Gets neighbors of a node with optional filters.
   */
  getNeighbors(nodeId, options = {}) {
    const { relationship, type } = options;
    const results = [];
    const edges = this._graph.getEdgesForNode(nodeId);

    for (const edge of edges) {
      if (relationship && edge.relationship !== relationship) continue;
      const neighborId = edge.source === nodeId ? edge.target : edge.source;
      const neighborNode = this._graph.getNode(neighborId);
      if (!neighborNode) continue;
      if (type && neighborNode.type !== type) continue;

      results.push({ node: neighborNode.toJSON(), edge: edge.toJSON() });
    }
    return results;
  }

  /**
   * Convenience: returns nodes sharing a device with the given node.
   */
  getSharedDevices(nodeId) {
    return this.getNeighbors(nodeId, { relationship: 'shares_device' });
  }

  /**
   * Convenience: returns nodes sharing a payment method with the given node.
   */
  getSharedPaymentMethods(nodeId) {
    return this.getNeighbors(nodeId, { relationship: 'shares_payment' });
  }

  /**
   * Convenience: returns nodes sharing an identity with the given node.
   */
  getSharedIdentities(nodeId) {
    return this.getNeighbors(nodeId, { relationship: 'shares_identity' });
  }

  /**
   * Returns nodes co-owned by multiple entity IDs (intersection of neighbors).
   */
  getCommonOwnership(nodeIds) {
    if (!nodeIds || nodeIds.length < 2) return [];
    const ownerships = nodeIds.map(id => {
      const neighbors = this._graph.getNeighbors(id, 'owns');
      return new Set(neighbors.map(n => n.node.id));
    });
    // Intersection
    const common = new Set();
    for (const id of ownerships[0]) {
      if (ownerships.every(set => set.has(id))) common.add(id);
    }
    return Array.from(common).map(id => {
      const node = this._graph.getNode(id);
      return node ? node.toJSON() : null;
    }).filter(Boolean);
  }

  /**
   * Returns all edges between two nodes.
   */
  getRelationshipHistory(sourceId, targetId) {
    const results = [];
    for (const edge of this._graph.edges.values()) {
      if ((edge.source === sourceId && edge.target === targetId) ||
          (edge.source === targetId && edge.target === sourceId)) {
        results.push(edge.toJSON());
      }
    }
    return results;
  }

  /**
   * Returns all entities connected to a node within a max depth.
   */
  getConnectedEntities(nodeId, maxDepth = 3) {
    const { GraphTraversal } = require('./traversal');
    const traversal = new GraphTraversal(this._graph);
    const entities = [];
    const seen = new Set();

    for (const result of traversal.bfs(nodeId, { maxDepth })) {
      if (result.node && !seen.has(result.node.id)) {
        seen.add(result.node.id);
        entities.push(result.node.toJSON());
      }
    }
    return entities;
  }

  /**
   * Extracts a subgraph containing the specified node IDs and their neighbors.
   */
  extractSubgraph(nodeIds, maxDepth = 1) {
    const { GraphTraversal } = require('./traversal');
    const traversal = new GraphTraversal(this._graph);
    const nodes = new Map();
    const edges = new Map();

    for (const nodeId of nodeIds) {
      const node = this._graph.getNode(nodeId);
      if (node) nodes.set(node.id, node);

      const neighborhood = traversal.getNeighborhood(nodeId, { maxDepth });
      for (const [nid, n] of neighborhood.nodes) nodes.set(nid, n);
      for (const [eid, e] of neighborhood.edges) edges.set(eid, e);
    }

    return {
      nodes: Array.from(nodes.values()).map(n => n.toJSON()),
      edges: Array.from(edges.values()).map(e => e.toJSON())
    };
  }

  _matchesNode(node, pattern) {
    if (pattern.type && node.type !== pattern.type) return false;
    if (pattern.properties) {
      for (const [key, value] of Object.entries(pattern.properties)) {
        if (node.properties[key] !== value) return false;
      }
    }
    return true;
  }

  _matchesEdge(edge, pattern) {
    if (pattern.relationship && edge.relationship !== pattern.relationship) return false;
    if (pattern.source && edge.source !== pattern.source) return false;
    if (pattern.target && edge.target !== pattern.target) return false;
    return true;
  }
}

module.exports = { GraphQueryEngine };