/**
 * Graph Validator — Phase 4 Knowledge Graph Foundation
 *
 * Validates nodes, edges, and full graphs for structural integrity.
 * Supports replay verification and relationship consistency checks.
 */
const crypto = require('crypto');

class GraphValidator {
  /**
   * Validates a single node.
   */
  static validateNode(node) {
    const errors = [];
    if (!node || typeof node !== 'object') return { valid: false, errors: [{ path: 'node', message: 'Node is required', code: 'REQUIRED' }] };
    if (!node.id || typeof node.id !== 'string') errors.push({ path: 'node.id', message: 'Node id is required and must be a string', code: 'INVALID_ID' });
    if (!node.type || typeof node.type !== 'string') errors.push({ path: 'node.type', message: 'Node type is required', code: 'REQUIRED' });
    if (node.properties && (typeof node.properties !== 'object' || Array.isArray(node.properties))) {
      errors.push({ path: 'node.properties', message: 'Node properties must be a plain object', code: 'INVALID_TYPE' });
    }
    if (node.version !== undefined && (!Number.isInteger(node.version) || node.version < 1)) {
      errors.push({ path: 'node.version', message: 'Node version must be a positive integer', code: 'INVALID_VERSION' });
    }
    if (node.createdAt && isNaN(new Date(node.createdAt).getTime())) {
      errors.push({ path: 'node.createdAt', message: 'Invalid createdAt date', code: 'INVALID_DATE' });
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates a single edge.
   */
  static validateEdge(edge) {
    const errors = [];
    if (!edge || typeof edge !== 'object') return { valid: false, errors: [{ path: 'edge', message: 'Edge is required', code: 'REQUIRED' }] };
    if (!edge.id || typeof edge.id !== 'string') errors.push({ path: 'edge.id', message: 'Edge id is required and must be a string', code: 'INVALID_ID' });
    if (!edge.source || typeof edge.source !== 'string') errors.push({ path: 'edge.source', message: 'Edge source is required', code: 'REQUIRED' });
    if (!edge.target || typeof edge.target !== 'string') errors.push({ path: 'edge.target', message: 'Edge target is required', code: 'REQUIRED' });
    if (!edge.relationship || typeof edge.relationship !== 'string') errors.push({ path: 'edge.relationship', message: 'Edge relationship is required', code: 'REQUIRED' });
    if (edge.weight !== undefined && (typeof edge.weight !== 'number' || edge.weight < 0)) {
      errors.push({ path: 'edge.weight', message: 'Edge weight must be a non-negative number', code: 'INVALID_WEIGHT' });
    }
    if (edge.metadata !== undefined && (typeof edge.metadata !== 'object' || Array.isArray(edge.metadata))) {
      errors.push({ path: 'edge.metadata', message: 'Edge metadata must be a plain object', code: 'INVALID_TYPE' });
    }
    if (edge.createdAt && isNaN(new Date(edge.createdAt).getTime())) {
      errors.push({ path: 'edge.createdAt', message: 'Invalid createdAt date', code: 'INVALID_DATE' });
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates a complete graph.
   */
  static validateGraph(graph) {
    const errors = [];
    const allIds = new Set();

    // Collect all node IDs
    for (const node of graph.nodes.values()) {
      if (allIds.has(node.id)) {
        errors.push({ path: `node[${node.id}]`, message: 'Duplicate node id', code: 'DUPLICATE_ID' });
      }
      allIds.add(node.id);

      const nodeValidation = GraphValidator.validateNode(node);
      for (const e of nodeValidation.errors) {
        errors.push(e);
      }
    }

    // Validate edges
    for (const edge of graph.edges.values()) {
      if (allIds.has(edge.id)) {
        errors.push({ path: `edge[${edge.id}]`, message: 'Duplicate edge id', code: 'DUPLICATE_ID' });
      }
      allIds.add(edge.id);

      const edgeValidation = GraphValidator.validateEdge(edge);
      for (const e of edgeValidation.errors) {
        errors.push(e);
      }

      // Check referential integrity
      if (!graph.nodes.has(edge.source)) {
        errors.push({ path: `edge[${edge.id}].source`, message: `Source node '${edge.source}' not found in graph`, code: 'REFERENTIAL_INTEGRITY' });
      }
      if (!graph.nodes.has(edge.target)) {
        errors.push({ path: `edge[${edge.id}].target`, message: `Target node '${edge.target}' not found in graph`, code: 'REFERENTIAL_INTEGRITY' });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates replay by comparing original and rebuilt graphs.
   */
  static validateReplay(originalGraph, rebuiltGraph) {
    const errors = [];

    // Hash comparison
    const origHash = originalGraph.computeHash();
    const rebuiltHash = rebuiltGraph.computeHash();

    if (origHash !== rebuiltHash) {
      errors.push({ path: 'replay', message: `Hash mismatch: original=${origHash}, rebuilt=${rebuiltHash}`, code: 'HASH_MISMATCH' });
    }

    // Structural comparison
    if (originalGraph.nodeCount !== rebuiltGraph.nodeCount) {
      errors.push({ path: 'replay.nodes', message: `Node count mismatch: original=${originalGraph.nodeCount}, rebuilt=${rebuiltGraph.nodeCount}`, code: 'COUNT_MISMATCH' });
    }
    if (originalGraph.edgeCount !== rebuiltGraph.edgeCount) {
      errors.push({ path: 'replay.edges', message: `Edge count mismatch: original=${originalGraph.edgeCount}, rebuilt=${rebuiltGraph.edgeCount}`, code: 'COUNT_MISMATCH' });
    }

    // Check missing nodes
    const origNodes = new Set(originalGraph.nodes.keys());
    const rebuiltNodes = new Set(rebuiltGraph.nodes.keys());
    for (const id of origNodes) {
      if (!rebuiltNodes.has(id)) {
        errors.push({ path: `replay.node[${id}]`, message: `Node '${id}' missing in rebuilt graph`, code: 'MISSING_NODE' });
      }
    }
    for (const id of rebuiltNodes) {
      if (!origNodes.has(id)) {
        errors.push({ path: `replay.node[${id}]`, message: `Extra node '${id}' in rebuilt graph`, code: 'EXTRA_NODE' });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates relationship consistency.
   * Checks for bidirectional consistency where applicable.
   */
  static validateRelationshipConsistency(graph) {
    const errors = [];
    const relationships = new Map();

    for (const edge of graph.edges.values()) {
      const key = `${edge.source}:${edge.target}`;
      if (!relationships.has(key)) relationships.set(key, []);
      relationships.get(key).push(edge);

      // Check for symmetric relationships
      const reverseKey = `${edge.target}:${edge.source}`;
      if (edge.relationship === 'shares_device' || edge.relationship === 'shares_identity' || edge.relationship === 'shares_payment') {
        const reverseEdges = relationships.get(reverseKey);
        if (!reverseEdges) {
          errors.push({
            path: `edge[${edge.id}]`,
            message: `Relationship '${edge.relationship}' is not bidirectional between '${edge.source}' and '${edge.target}'`,
            code: 'MISSING_BIDIRECTIONAL'
          });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

module.exports = { GraphValidator };