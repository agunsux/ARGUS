/**
 * Graph Replay Engine — Phase 4 Knowledge Graph Foundation
 *
 * Rebuilds the entire knowledge graph from domain events.
 * Supports snapshot-based rebuild for efficiency.
 * Verifies determinism through hash comparison.
 */
const { SnapshotManager } = require('../store/snapshotManager');
const { InMemorySnapshotStore } = require('../store/interfaces');

class GraphReplayEngine {
  constructor(graph, builder) {
    if (!graph) throw new Error('GraphReplayEngine requires a KnowledgeGraph instance');
    if (!builder) throw new Error('GraphReplayEngine requires a GraphBuilder instance');
    this._graph = graph;
    this._builder = builder;
    this._metrics = {
      totalEvents: 0,
      rebuildCount: 0,
      lastDuration: 0,
      lastNodeCount: 0,
      lastEdgeCount: 0,
      lastHash: null
    };
  }

  /**
   * Rebuilds the graph from an array of events.
   */
  rebuild(events) {
    const start = Date.now();
    const result = this._builder.rebuildFromEvents(events);
    const duration = Date.now() - start;

    this._metrics.totalEvents = events.length;
    this._metrics.rebuildCount++;
    this._metrics.lastDuration = duration;
    this._metrics.lastNodeCount = result.nodeCount;
    this._metrics.lastEdgeCount = result.edgeCount;
    this._metrics.lastHash = result.hash;

    return {
      duration,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      hash: result.hash
    };
  }

  /**
   * Rebuilds using a SnapshotManager for efficient aggregate reconstruction.
   */
  rebuildWithSnapshot(events, snapshotOptions = {}) {
    const { snapshotFrequency = 100, aggregateClass } = snapshotOptions;
    const store = new InMemorySnapshotStore();
    const sm = new SnapshotManager({ store, snapshotFrequency });

    const start = Date.now();
    this._graph.clear();

    // Group events by transaction
    const byTx = new Map();
    for (const event of events) {
      const txId = event.transactionId;
      if (!byTx.has(txId)) byTx.set(txId, []);
      byTx.get(txId).push(event);
    }

    // Process each transaction group
    for (const [txId, txEvents] of byTx) {
      const sorted = txEvents.sort((a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0));

      if (aggregateClass && sorted.length > snapshotFrequency) {
        // Use snapshot for large aggregates
        const result = sm.reconstructFromSnapshot(aggregateClass, txId, sorted);
        for (const event of sorted) {
          if ((event.aggregateVersion || 0) > (result.fromSnapshot ? result.fromSnapshot.version : 0)) {
            this._builder.processEvent(event);
          }
        }
      } else {
        for (const event of sorted) {
          this._builder.processEvent(event);
        }
      }
    }

    const duration = Date.now() - start;
    const hash = this._graph.computeHash();

    this._metrics.totalEvents = events.length;
    this._metrics.rebuildCount++;
    this._metrics.lastDuration = duration;
    this._metrics.lastNodeCount = this._graph.nodeCount;
    this._metrics.lastEdgeCount = this._graph.edgeCount;
    this._metrics.lastHash = hash;

    return { duration, nodeCount: this._graph.nodeCount, edgeCount: this._graph.edgeCount, hash };
  }

  /**
   * Verifies replay determinism by rebuilding twice and comparing hashes.
   */
  verifyReplay(events) {
    // First rebuild
    const first = this.rebuild(events);
    const firstGraph = this._graph.toJSON();

    // Second rebuild (clear and rebuild again)
    const second = this.rebuild(events);
    const secondGraph = this._graph.toJSON();

    const match = first.hash === second.hash;
    return {
      match,
      firstHash: first.hash,
      secondHash: second.hash,
      firstNodeCount: first.nodeCount,
      secondNodeCount: second.nodeCount,
      firstEdgeCount: first.edgeCount,
      secondEdgeCount: second.edgeCount,
      duration: first.duration + second.duration
    };
  }

  /**
   * Deep comparison between two graphs.
   */
  compareGraphs(graphA, graphB) {
    const differences = [];
    const hashA = graphA.computeHash();
    const hashB = graphB.computeHash();
    const match = hashA === hashB;

    if (graphA.nodeCount !== graphB.nodeCount) {
      differences.push({ type: 'NODE_COUNT', a: graphA.nodeCount, b: graphB.nodeCount });
    }
    if (graphA.edgeCount !== graphB.edgeCount) {
      differences.push({ type: 'EDGE_COUNT', a: graphA.edgeCount, b: graphB.edgeCount });
    }

    // Compare node sets
    const nodesA = new Set(graphA.nodes.keys());
    const nodesB = new Set(graphB.nodes.keys());
    for (const id of nodesA) {
      if (!nodesB.has(id)) differences.push({ type: 'MISSING_NODE', id });
    }
    for (const id of nodesB) {
      if (!nodesA.has(id)) differences.push({ type: 'EXTRA_NODE', id });
    }

    // Compare edge sets
    const edgesA = new Set(graphA.edges.keys());
    const edgesB = new Set(graphB.edges.keys());
    for (const id of edgesA) {
      if (!edgesB.has(id)) differences.push({ type: 'MISSING_EDGE', id });
    }
    for (const id of edgesB) {
      if (!edgesA.has(id)) differences.push({ type: 'EXTRA_EDGE', id });
    }

    return { match, differences, hashA, hashB };
  }

  /**
   * Returns replay metrics.
   */
  getReplayMetrics() {
    return { ...this._metrics };
  }

  /**
   * Creates a graph snapshot for a specific transaction.
   */
  snapshot(transactionId) {
    const store = new InMemorySnapshotStore();
    const sm = new SnapshotManager({ store, snapshotFrequency: 1 });

    // Extract subgraph for transaction
    const { GraphTraversal } = require('./traversal');
    const traversal = new GraphTraversal(this._graph);
    const neighborhood = traversal.getNeighborhood(transactionId, { maxDepth: 2, asArray: true });

    const snapshot = {
      transactionId,
      nodeCount: neighborhood.nodes.length,
      edgeCount: neighborhood.edges.length,
      nodes: neighborhood.nodes.map(n => n.toJSON()),
      edges: neighborhood.edges.map(e => e.toJSON()),
      hash: this._graph.computeHash(),
      timestamp: new Date().toISOString()
    };

    return snapshot;
  }

  /**
   * Restores graph state for a transaction from snapshot + events.
   */
  restore(transactionId, events) {
    // Full rebuild from events (since graph is built from events)
    // This ensures deterministic restore
    const { GraphTraversal } = require('./traversal');
    const traversal = new GraphTraversal(this._graph);

    // Rebuild only the relevant subgraph
    const start = Date.now();
    const filteredEvents = events.filter(e => e.transactionId === transactionId);
    for (const event of filteredEvents) {
      this._builder.processEvent(event);
    }

    return {
      duration: Date.now() - start,
      nodeCount: this._graph.nodeCount,
      edgeCount: this._graph.edgeCount
    };
  }
}

module.exports = { GraphReplayEngine };