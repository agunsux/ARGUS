/**
 * Graph Edge — Phase 4 Knowledge Graph Foundation
 *
 * Edges represent relationships between nodes.
 * Every edge has source, target, relationship type, weight, and metadata.
 */
const { v4: uuidv4 } = require('uuid');

class GraphEdge {
  constructor({ id, source, target, relationship, weight = 1, metadata = {}, createdAt, version = 1 } = {}) {
    if (!source) throw new Error('GraphEdge source is required');
    if (!target) throw new Error('GraphEdge target is required');
    if (!relationship) throw new Error('GraphEdge relationship is required');
    this.id = id || `edge-${uuidv4()}`;
    this.source = source;
    this.target = target;
    this.relationship = relationship;
    this.weight = weight;
    this.metadata = { ...metadata };
    this.createdAt = createdAt || new Date().toISOString();
    this.version = version;
  }

  /**
   * Returns a plain object representation.
   */
  toJSON() {
    return {
      id: this.id,
      source: this.source,
      target: this.target,
      relationship: this.relationship,
      weight: this.weight,
      metadata: this.metadata,
      createdAt: this.createdAt,
      version: this.version
    };
  }

  /**
   * Creates a GraphEdge from a plain object.
   */
  static fromJSON(data) {
    return new GraphEdge({
      id: data.id,
      source: data.source,
      target: data.target,
      relationship: data.relationship,
      weight: data.weight,
      metadata: data.metadata,
      createdAt: data.createdAt,
      version: data.version
    });
  }
}

module.exports = { GraphEdge };