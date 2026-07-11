/**
 * Graph Node — Phase 4 Knowledge Graph Foundation
 *
 * Nodes represent entities in the knowledge graph.
 * Every node has an id, type, properties, and version.
 */
const { v4: uuidv4 } = require('uuid');

class GraphNode {
  constructor({ id, type, properties = {}, createdAt, version = 1 } = {}) {
    if (!type) throw new Error('GraphNode type is required');
    this.id = id || `node-${uuidv4()}`;
    this.type = type;
    this.properties = { ...properties };
    this.createdAt = createdAt || new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.version = version;
  }

  /**
   * Updates properties and increments version.
   */
  update(properties) {
    this.properties = { ...this.properties, ...properties };
    this.version++;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Returns a plain object representation.
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      properties: this.properties,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version
    };
  }

  /**
   * Creates a GraphNode from a plain object.
   */
  static fromJSON(data) {
    const node = new GraphNode({
      id: data.id,
      type: data.type,
      properties: data.properties,
      createdAt: data.createdAt,
      version: data.version
    });
    node.updatedAt = data.updatedAt || node.updatedAt;
    return node;
  }
}

module.exports = { GraphNode };