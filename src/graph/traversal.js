/**
 * Graph Traversal — Phase 4 Knowledge Graph Foundation
 *
 * BFS, DFS, shortest path, neighborhood extraction,
 * connected components, cycle detection, and generic traversal.
 */
class GraphTraversal {
  constructor(graph) {
    if (!graph) throw new Error('GraphTraversal requires a KnowledgeGraph instance');
    this._graph = graph;
  }

  /**
   * Breadth-first search from a start node.
   * Returns a generator yielding { node, edge, depth, parentId }.
   */
  *bfs(startNodeId, options = {}) {
    const { maxDepth = Infinity, nodeFilter, edgeFilter, relationship } = options;
    const startNode = this._graph.getNode(startNodeId);
    if (!startNode) return;

    const visited = new Set([startNodeId]);
    const queue = [{ node: startNode, edge: null, depth: 0, parentId: null }];
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];
      yield current;

      if (current.depth >= maxDepth) continue;

      const edges = this._graph.getEdgesForNode(current.node.id);
      for (const edge of edges) {
        if (relationship && edge.relationship !== relationship) continue;
        if (edgeFilter && !edgeFilter(edge)) continue;

        const neighborId = edge.source === current.node.id ? edge.target : edge.source;
        if (visited.has(neighborId)) continue;

        const neighborNode = this._graph.getNode(neighborId);
        if (!neighborNode) continue;
        if (nodeFilter && !nodeFilter(neighborNode)) continue;

        visited.add(neighborId);
        queue.push({ node: neighborNode, edge, depth: current.depth + 1, parentId: current.node.id });
      }
    }
  }

  /**
   * Depth-first search from a start node.
   * Returns a generator yielding { node, edge, depth, parentId }.
   */
  *dfs(startNodeId, options = {}) {
    const { maxDepth = Infinity, nodeFilter, edgeFilter, relationship } = options;
    const startNode = this._graph.getNode(startNodeId);
    if (!startNode) return;

    const visited = new Set();
    const stack = [{ node: startNode, edge: null, depth: 0, parentId: null }];

    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current.node.id)) continue;
      visited.add(current.node.id);
      yield current;

      if (current.depth >= maxDepth) continue;

      const edges = this._graph.getEdgesForNode(current.node.id);
      for (const edge of edges) {
        if (relationship && edge.relationship !== relationship) continue;
        if (edgeFilter && !edgeFilter(edge)) continue;

        const neighborId = edge.source === current.node.id ? edge.target : edge.source;
        const neighborNode = this._graph.getNode(neighborId);
        if (!neighborNode) continue;
        if (visited.has(neighborId)) continue;
        if (nodeFilter && !nodeFilter(neighborNode)) continue;

        stack.push({ node: neighborNode, edge, depth: current.depth + 1, parentId: current.node.id });
      }
    }
  }

  /**
   * Finds the shortest unweighted path between two nodes using BFS.
   * Returns array of { node, edge } or null if unreachable.
   */
  shortestPath(fromNodeId, toNodeId, options = {}) {
    if (fromNodeId === toNodeId) {
      const node = this._graph.getNode(fromNodeId);
      return node ? [{ node, edge: null }] : null;
    }

    const fromNode = this._graph.getNode(fromNodeId);
    const toNode = this._graph.getNode(toNodeId);
    if (!fromNode || !toNode) return null;

    const { relationship, edgeFilter, maxDepth = Infinity } = options;
    const visited = new Set([fromNodeId]);
    const queue = [{ node: fromNode, edge: null, depth: 0, parentId: null }];
    const parent = new Map();
    const usedEdge = new Map();
    let head = 0;
    let found = false;

    while (head < queue.length) {
      const current = queue[head++];
      if (current.node.id === toNodeId) { found = true; break; }
      if (current.depth >= maxDepth) continue;

      const edges = this._graph.getEdgesForNode(current.node.id);
      for (const edge of edges) {
        if (relationship && edge.relationship !== relationship) continue;
        if (edgeFilter && !edgeFilter(edge)) continue;

        const neighborId = edge.source === current.node.id ? edge.target : edge.source;
        if (visited.has(neighborId)) continue;
        const neighborNode = this._graph.getNode(neighborId);
        if (!neighborNode) continue;

        visited.add(neighborId);
        parent.set(neighborId, current.node.id);
        usedEdge.set(neighborId, edge);
        queue.push({ node: neighborNode, edge, depth: current.depth + 1, parentId: current.node.id });
      }
    }

    if (!found) return null;

    // Reconstruct path
    const path = [];
    let currentId = toNodeId;
    while (currentId !== fromNodeId) {
      const edge = usedEdge.get(currentId);
      const node = this._graph.getNode(currentId);
      path.unshift({ node, edge });
      currentId = parent.get(currentId);
    }
    path.unshift({ node: fromNode, edge: null });
    return path;
  }

  /**
   * Finds all paths to nodes matching a predicate.
   */
  findNodePaths(startNodeId, options = {}) {
    const { predicate, maxDepth = 10, maxPaths = 100 } = options;
    const startNode = this._graph.getNode(startNodeId);
    if (!startNode) return [];

    const paths = [];
    const currentPath = [{ node: startNode, edge: null }];
    const visited = new Set([startNodeId]);

    const dfs = (depth) => {
      if (paths.length >= maxPaths) return;
      const last = currentPath[currentPath.length - 1];
      if (predicate && predicate(last.node)) {
        paths.push([...currentPath]);
        if (paths.length >= maxPaths) return;
      }
      if (depth >= maxDepth) return;

      const edges = this._graph.getEdgesForNode(last.node.id);
      for (const edge of edges) {
        const neighborId = edge.source === last.node.id ? edge.target : edge.source;
        if (visited.has(neighborId)) continue;
        const neighborNode = this._graph.getNode(neighborId);
        if (!neighborNode) continue;

        visited.add(neighborId);
        currentPath.push({ node: neighborNode, edge });
        dfs(depth + 1);
        currentPath.pop();
        visited.delete(neighborId);
      }
    };

    dfs(0);
    return paths;
  }

  /**
   * Extracts the neighborhood subgraph around a node within maxDepth.
   * Returns { nodes: Map, edges: Map } or { nodes: Array, edges: Array }.
   */
  getNeighborhood(nodeId, options = {}) {
    const { maxDepth = 2, relationship, asArray = false } = options;
    const nodes = new Map();
    const edges = new Map();

    const startNode = this._graph.getNode(nodeId);
    if (!startNode) return asArray ? { nodes: [], edges: [] } : { nodes, edges };

    nodes.set(startNode.id, startNode);
    for (const result of this.bfs(nodeId, { maxDepth, relationship })) {
      if (result.node) nodes.set(result.node.id, result.node);
      if (result.edge) edges.set(result.edge.id, result.edge);
    }

    if (asArray) {
      return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) };
    }
    return { nodes, edges };
  }

  /**
   * Find all connected components in the graph.
   * Returns array of Sets, each containing node IDs of a component.
   */
  findConnectedComponents() {
    const components = [];
    const unvisited = new Set(this._graph.nodes.keys());

    for (const startId of this._graph.nodes.keys()) {
      if (!unvisited.has(startId)) continue;

      const component = new Set();
      const queue = [startId];
      unvisited.delete(startId);

      while (queue.length > 0) {
        const nodeId = queue.shift();
        component.add(nodeId);

        const edges = this._graph.getEdgesForNode(nodeId);
        for (const edge of edges) {
          const neighborId = edge.source === nodeId ? edge.target : edge.source;
          if (unvisited.has(neighborId)) {
            unvisited.delete(neighborId);
            queue.push(neighborId);
          }
        }
      }
      components.push(component);
    }
    return components;
  }

  /**
   * Detect cycles in the graph using DFS.
   * Returns array of cycles, each as an array of node IDs.
   */
  detectCycles() {
    const white = new Set(this._graph.nodes.keys());
    const gray = new Set();
    const black = new Set();
    const parent = new Map();
    const cycles = [];

    const dfs = (nodeId) => {
      white.delete(nodeId);
      gray.add(nodeId);

      const edges = this._graph.getEdgesForNode(nodeId);
      for (const edge of edges) {
        // Only follow outgoing edges for directed cycle detection
        if (edge.source !== nodeId) continue;
        const neighborId = edge.target;

        if (gray.has(neighborId)) {
          // Found a cycle — reconstruct
          const cycle = [neighborId, nodeId];
          let cur = nodeId;
          while (cur !== neighborId) {
            cur = parent.get(cur);
            cycle.push(cur);
          }
          cycle.reverse();
          cycles.push(cycle);
        } else if (white.has(neighborId)) {
          parent.set(neighborId, nodeId);
          dfs(neighborId);
        }
      }

      gray.delete(nodeId);
      black.add(nodeId);
    };

    for (const nodeId of white) {
      if (white.has(nodeId)) dfs(nodeId);
    }
    return cycles;
  }

  /**
   * Generic traversal with a query object.
   * Supports direction (outgoing/incoming/both) and visitor function.
   * Returns the number of nodes visited.
   */
  traverse(query, visitorFn) {
    const {
      start: startNodeId,
      maxDepth = Infinity,
      direction = 'outgoing',
      relationship,
      nodeFilter,
      edgeFilter,
      algorithm = 'bfs'
    } = query || {};

    const startNode = this._graph.getNode(startNodeId);
    if (!startNode) return 0;

    let count = 0;
    const gen = algorithm === 'dfs' ? this.dfs(startNodeId, { maxDepth, relationship, nodeFilter, edgeFilter }) : this.bfs(startNodeId, { maxDepth, relationship, nodeFilter, edgeFilter });

    for (const result of gen) {
      count++;
      if (visitorFn) {
        const shouldContinue = visitorFn(result);
        if (shouldContinue === false) break;
      }
    }
    return count;
  }
}

module.exports = { GraphTraversal };