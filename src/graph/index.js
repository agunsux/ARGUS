/**
 * Graph Module — Phase 4 Knowledge Graph Foundation
 *
 * Central exports for the knowledge graph module.
 */
const { KnowledgeGraph, graph } = require('./graph');
const { GraphNode } = require('./node');
const { GraphEdge } = require('./edge');
const { GraphBuilder, NODE_TYPES, RELATIONSHIP_TYPES } = require('./builder');
const { GraphTraversal } = require('./traversal');
const { GraphQueryEngine } = require('./query');
const { GraphValidator } = require('./validator');
const { GraphSerializer } = require('./serializer');
const { GraphReplayEngine } = require('./replay');

/**
 * Creates a new KnowledgeGraph instance.
 */
function createGraph() {
  return new KnowledgeGraph();
}

/**
 * Creates a GraphQueryEngine for a given graph.
 */
function createQueryEngine(graph) {
  return new GraphQueryEngine(graph);
}

/**
 * Creates a GraphTraversal for a given graph.
 */
function createTraversal(graph) {
  return new GraphTraversal(graph);
}

/**
 * Creates a GraphBuilder for a given graph.
 */
function createBuilder(graph) {
  return new GraphBuilder(graph);
}

/**
 * Creates a GraphReplayEngine for a given graph and builder.
 */
function createReplayEngine(graph) {
  const builder = new GraphBuilder(graph);
  return new GraphReplayEngine(graph, builder);
}

module.exports = {
  KnowledgeGraph, graph,
  GraphNode,
  GraphEdge,
  GraphBuilder, NODE_TYPES, RELATIONSHIP_TYPES,
  GraphTraversal,
  GraphQueryEngine,
  GraphValidator,
  GraphSerializer,
  GraphReplayEngine,
  createGraph,
  createQueryEngine,
  createTraversal,
  createBuilder,
  createReplayEngine
};