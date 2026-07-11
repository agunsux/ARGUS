/**
 * KnowledgeGraph — Phase 4 Knowledge Graph Foundation
 *
 * An in-memory directed graph storing nodes and edges.
 * Provides CRUD operations, traversal helpers, serialization,
 * integrity hashing via SHA-256, and a default singleton instance.
 */
const crypto = require('crypto');
const { GraphNode } = require('./node');
const { GraphEdge } = require('./edge');

class KnowledgeGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  addNode(node) {
    if (!(node instanceof GraphNode)) {
      throw new TypeError('Expected a GraphNode instance');
    }
    if (this.nodes.has(node.id)) {
      throw new Error('Node \'' + node.id + '\' already exists');
    }
    this.nodes.set(node.id, node);
    return node;
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  removeNode(id) {
    if (!this.nodes.has(id)) return false;
    for (const [eid, e] of this.edges) {
      if (e.source === id || e.target === id) this.edges.delete(eid);
    }
    this.nodes.delete(id);
    return true;
  }

  hasNode(id) {
    return this.nodes.has(id);
  }

  getNodesByType(type) {
    const r = [];
    for (const n of this.nodes.values()) {
      if (n.type === type) r.push(n);
    }
    return r;
  }

  addEdge(edge) {
    if (!(edge instanceof GraphEdge)) {
      throw new TypeError('Expected a GraphEdge instance');
    }
    if (this.edges.has(edge.id)) {
      throw new Error('Edge \''+ edge.id + '\' already exists');
    }
    if (!this.nodes.has(edge.source)) {
      throw new Error('Source \'' + edge.source + '\' not found');
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error('Target \'' + edge.target + '\' not found');
    }
    this.edges.set(edge.id, edge);
    return edge;
  }

  getEdge(id) {
    return this.edges.get(id);
  }

  removeEdge(id) {
    if (!this.edges.has(id)) return false;
    this.edges.delete(id);
    return true;
  }

  hasEdge(id) {
    return this.edges.has(id);
  }

  getEdgesByRelationship(rel) {
    const r = [];
    for (const e of this.edges.values()) {
      if (e.relationship === rel) r.push(e);
    }
    return r;
  }

  getEdgesForNode(nodeId) {
    const r = [];
    for (const e of this.edges.values()) {
      if (e.source === nodeId || e.target === nodeId) r.push(e);
    }
    return r;
  }

  getNeighbors(nodeId, relationship) {
    const nb = [];
    const seen = new Set();
    for (const e of this.edges.values()) {
      if (e.source !== nodeId && e.target !== nodeId) continue;
      if (relationship !== undefined && e.relationship !== relationship) continue;
      const nid = e.source === nodeId ? e.target : e.source;
      const nn = this.nodes.get(nid);
      if (!nn || seen.has(nid)) continue;
      seen.add(nid);
      nb.push({ node: nn, edge: e });
    }
    return nb;
  }

  get nodeCount() { return this.nodes.size; }
  get edgeCount() { return this.edges.size; }

  clear() {
    this.nodes.clear();
    this.edges.clear();
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()).map(n => n.toJSON()),
      edges: Array.from(this.edges.values()).map(e => e.toJSON()),
    };
  }

  static fromJSON(data) {
    const g = new KnowledgeGraph();
    if (!data || typeof data !== 'object') {
      throw new TypeError('fromJSON expects object');
    }
    const { nodes = [], edges = [] } = data;
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      throw new TypeError('nodes and edges must be arrays');
    }
    for (const nd of nodes) {
      g.nodes.set(nd.id, GraphNode.fromJSON(nd));
    }
    for (const ed of edges) {
      const edge = GraphEdge.fromJSON(ed);
      if (!g.nodes.has(edge.source)) throw new Error('source missing');
      if (!g.nodes.has(edge.target)) throw new Error('target missing');
      g.edges.set(edge.id, edge);
    }
    return g;
  }

  computeHash() {
    const s = JSON.stringify(this.toJSON(), Object.keys(this.toJSON()).sort());
    return crypto.createHash('sha256').update(s, 'utf-8').digest('hex');
  }

  getStats() {
    const nt = {};
    for (const n of this.nodes.values()) {
      nt[n.type] = (nt[n.type] || 0) + 1;
    }
    const rc = {};
    for (const e of this.edges.values()) {
      rc[e.relationship] = (rc[e.relationship] || 0) + 1;
    }
    return { nodeCount: this.nodes.size, edgeCount: this.edges.size, nodeTypes: nt, relationshipCounts: rc };
  }
}

const graph = new KnowledgeGraph();
module.exports = { KnowledgeGraph, graph };
