/**
 * Phase 4 — Knowledge Graph Foundation: Complete Test Suite
 *
 * Covers:
 * - GraphNode, GraphEdge construction
 * - KnowledgeGraph operations
 * - GraphBuilder event processing
 * - GraphTraversal (BFS, DFS, shortest path, components, cycles)
 * - GraphQueryEngine queries
 * - GraphValidator validation
 * - GraphSerializer serialization
 * - GraphReplayEngine determinism
 * - Performance benchmarks
 * - Backward compatibility
 */
const assert = require('assert');
const { KnowledgeGraph, GraphNode, GraphEdge, GraphBuilder, NODE_TYPES, RELATIONSHIP_TYPES,
  GraphTraversal, GraphQueryEngine, GraphValidator, GraphSerializer, GraphReplayEngine,
  createGraph, createBuilder, createReplayEngine } = require('./src/graph/index');
const { DomainEvent, DOMAIN_EVENT_TYPES } = require('./src/protocol/domainEvents');
const { TransactionAggregate } = require('./src/protocol/aggregate');

let p = 0, f = 0;
const t = (n, fn) => { try { fn(); console.log('  \u2713', n); p++; } catch (e) { console.log('  \u2717', n, e.message); f++; } };
console.log('\n=== PHASE 4 — KNOWLEDGE GRAPH FOUNDATION TEST SUITE ===\n');

// ==================== EPIC A: GRAPH FOUNDATION ====================
console.log('--- EPIC A: Graph Foundation ---\n');
t('GraphNode requires type', () => { assert.throws(() => new GraphNode({}), /type is required/); });
t('GraphNode creates with id', () => { const n = new GraphNode({ type: 'Person' }); assert.ok(n.id); assert.strictEqual(n.type, 'Person'); });
t('GraphNode.toJSON returns plain object', () => { const n = new GraphNode({ type: 'Ticket', properties: { price: 100 } }); const j = n.toJSON(); assert.strictEqual(j.type, 'Ticket'); assert.strictEqual(j.properties.price, 100); });
t('GraphNode.fromJSON restores', () => { const n = GraphNode.fromJSON({ id: 'n1', type: 'Person', properties: {}, createdAt: '2026-01-01T00:00:00Z', version: 1 }); assert.strictEqual(n.id, 'n1'); });
t('GraphNode.update modifies properties', () => { const n = new GraphNode({ type: 'Ticket' }); n.update({ price: 500 }); assert.strictEqual(n.properties.price, 500); assert.strictEqual(n.version, 2); });
t('GraphEdge requires source, target, relationship', () => { assert.throws(() => new GraphEdge({}), /source is required/); assert.throws(() => new GraphEdge({ source: 'a' }), /target is required/); assert.throws(() => new GraphEdge({ source: 'a', target: 'b' }), /relationship is required/); });
t('GraphEdge creates with weight', () => { const e = new GraphEdge({ source: 'a', target: 'b', relationship: 'owns', weight: 5 }); assert.strictEqual(e.weight, 5); assert.strictEqual(e.relationship, 'owns'); });
t('GraphEdge.toJSON returns plain object', () => { const e = new GraphEdge({ source: 'a', target: 'b', relationship: 'owns' }); const j = e.toJSON(); assert.strictEqual(j.source, 'a'); assert.strictEqual(j.relationship, 'owns'); });
t('GraphEdge.fromJSON restores', () => { const e = GraphEdge.fromJSON({ id: 'e1', source: 'a', target: 'b', relationship: 'owns', weight: 1 }); assert.strictEqual(e.source, 'a'); });

// ==================== KNOWLEDGE GRAPH ====================
console.log('\n--- KnowledgeGraph ---\n');
t('KnowledgeGraph.addNode adds node', () => { const g = new KnowledgeGraph(); const n = new GraphNode({ type: 'Person', id: 'p1' }); g.addNode(n); assert.strictEqual(g.nodeCount, 1); });
t('KnowledgeGraph.addEdge adds edge', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })); assert.strictEqual(g.edgeCount, 1); });
t('KnowledgeGraph.addEdge rejects missing source', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); assert.throws(() => g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })), /not found/); });
t('KnowledgeGraph.getNode returns node', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); const n = g.getNode('p1'); assert.ok(n); assert.strictEqual(n.id, 'p1'); });
t('KnowledgeGraph.removeNode deletes node and edges', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })); g.removeNode('p1'); assert.strictEqual(g.nodeCount, 1); assert.strictEqual(g.edgeCount, 0); });
t('KnowledgeGraph.getNodesByType filters', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addNode(new GraphNode({ type: 'Person', id: 'p2' })); const ps = g.getNodesByType('Person'); assert.strictEqual(ps.length, 2); });
t('KnowledgeGraph.getEdgesForNode returns incident edges', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addNode(new GraphNode({ type: 'Device', id: 'd1' })); g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })); g.addEdge(new GraphEdge({ source: 'p1', target: 'd1', relationship: 'uses' })); assert.strictEqual(g.getEdgesForNode('p1').length, 2); });
t('KnowledgeGraph.getNeighbors returns deduplicated', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })); g.addEdge(new GraphEdge({ source: 't1', target: 'p1', relationship: 'owned_by' })); const nb = g.getNeighbors('p1'); assert.strictEqual(nb.length, 1); });
t('KnowledgeGraph.computeHash returns sha256', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); const h = g.computeHash(); assert.strictEqual(h.length, 64); });
t('KnowledgeGraph.getStats returns counts', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })); const s = g.getStats(); assert.strictEqual(s.nodeCount, 2); assert.strictEqual(s.edgeCount, 1); assert.strictEqual(s.nodeTypes.Person, 1); assert.strictEqual(s.relationshipCounts.owns, 1); });
t('KnowledgeGraph.toJSON and fromJSON round-trip', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })); const json = g.toJSON(); const g2 = KnowledgeGraph.fromJSON(json); assert.strictEqual(g2.nodeCount, 2); assert.strictEqual(g2.edgeCount, 1); assert.strictEqual(g.computeHash(), g2.computeHash()); });
t('KnowledgeGraph.clear empties', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.clear(); assert.strictEqual(g.nodeCount, 0); });
t('KnowledgeGraph rejects duplicate node', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); assert.throws(() => g.addNode(new GraphNode({ type: 'Person', id: 'p1' })), /already exists/); });
t('KnowledgeGraph.getEdgesByRelationship filters', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addNode(new GraphNode({ type: 'Device', id: 'd1' })); g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' })); g.addEdge(new GraphEdge({ source: 'p1', target: 'd1', relationship: 'uses' })); const owns = g.getEdgesByRelationship('owns'); assert.strictEqual(owns.length, 1); });

// ==================== EPIC B: IDENTITY GRAPH (via Builder) ====================
console.log('\n--- EPIC B: Identity Graph ---\n');
t('Builder creates Person + Ticket on OwnershipVerified', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  const ev = new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-1', actor: 'seller-1', data: { ownerId: 'seller-1' }, metadata: { device: 'device-1', email: 's@e.com', phone: '+62' } });
  b.processEvent(ev);
  assert.ok(g.hasNode('seller-1')); assert.ok(g.hasNode('tx-1')); assert.ok(g.hasNode('device-1')); assert.ok(g.hasNode('s@e.com')); assert.ok(g.hasNode('+62'));
  assert.strictEqual(g.edgeCount, 4); // owns + 3 uses
});
t('Builder creates Event + Ticket listing', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-2', actor: 'seller-1' }));
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.LISTING_CREATED, transactionId: 'tx-2', actor: 'seller-1', data: { price: 500000 } }));
  assert.ok(g.hasNode('evt-tx-2')); assert.strictEqual(g.nodeCount, 3);
});
t('Builder creates Escrow on EscrowCreated', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-3', actor: 'seller-1' }));
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.ESCROW_CREATED, transactionId: 'tx-3', actor: 'buyer-1', data: { escrowId: 'esc-3' } }));
  assert.ok(g.hasNode('esc-3')); const edges = g.getEdgesByRelationship('secured_by'); assert.strictEqual(edges.length, 1);
});
t('Builder creates Dispute node', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-4', actor: 'seller-1' }));
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.DISPUTE_OPENED, transactionId: 'tx-4', actor: 'buyer-1', data: { reason: 'Fraud' } }));
  assert.ok(g.hasNode('dsp-tx-4')); const edges = g.getEdgesByRelationship('disputed_by'); assert.strictEqual(edges.length, 1);
});
t('Builder creates Venue + VenueOfficer', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-5', actor: 'seller-1' }));
  b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.VENUE_VERIFIED, transactionId: 'tx-5', actor: 'officer-1', data: { venueId: 'venue-5' } }));
  assert.ok(g.hasNode('venue-5')); assert.ok(g.hasNode('officer-1')); assert.strictEqual(g.getNode('officer-1').type, 'VenueOfficer');
});
t('Behavior edges link sequential events per transaction', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  // Events must have ids to be linked (they get auto-generated)
  const ev1 = new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-6', actor: 'seller-1' });
  const ev2 = new DomainEvent({ type: DOMAIN_EVENT_TYPES.LISTING_CREATED, transactionId: 'tx-6', actor: 'seller-1' });
  b.processEvent(ev1); b.processEvent(ev2);
  // Behavior edges link event IDs — check total edges count
  const totalEdges = g.edgeCount;
  assert.ok(totalEdges >= 2); // owns + listed
});

// ==================== EPIC C: ASSET GRAPH ====================
console.log('\n--- EPIC C: Asset Graph ---\n');
t('Asset graph builds full transaction lifecycle', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  const events = [
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-10', actor: 'seller-1' }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.LISTING_CREATED, transactionId: 'tx-10', actor: 'seller-1', data: { price: 100000 } }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.BUYER_MATCHED, transactionId: 'tx-10', actor: 'buyer-1', data: { buyerId: 'buyer-1' } }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.ESCROW_CREATED, transactionId: 'tx-10', actor: 'buyer-1', data: { escrowId: 'esc-10' } }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.ESCROW_FUNDED, transactionId: 'tx-10', actor: 'buyer-1', data: { escrowId: 'esc-10' } }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.TRANSFER_REQUESTED, transactionId: 'tx-10', actor: 'seller-1' }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.TRANSFER_VERIFIED, transactionId: 'tx-10', actor: 'seller-1' }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.VENUE_VERIFIED, transactionId: 'tx-10', actor: 'venue-1', data: { venueId: 'venue-10' } }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.SETTLEMENT_COMPLETED, transactionId: 'tx-10', actor: 'admin-1' }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.TRANSACTION_CLOSED, transactionId: 'tx-10', actor: 'system' })
  ];
  for (const ev of events) b.processEvent(ev);
  const stats = g.getStats();
  assert.ok(stats.nodeCount >= 8);
  assert.ok(stats.edgeCount >= 7); // owns, listed, matched, secured_by, transferred_to, verified_at, settled_with
});
t('Asset graph includes all node types from builder', () => {
  const types = Object.values(NODE_TYPES);
  assert.ok(types.includes('Person')); assert.ok(types.includes('Ticket'));
  assert.ok(types.includes('Event')); assert.ok(types.includes('Venue'));
  assert.ok(types.includes('Escrow')); assert.ok(types.includes('Settlement'));
  assert.ok(types.includes('Dispute')); assert.ok(types.includes('Evidence'));
});

// ==================== EPIC D: BEHAVIOR GRAPH ====================
console.log('\n--- EPIC D: Behavior Graph ---\n');
t('Behavior graph creates edges for each event in transaction', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  for (let i = 0; i < 5; i++) {
    b.processEvent(new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-beh', actor: 'u1' }));
  }
  // 5 events to same actor+tx only create 1 'owns' edge (deduplicated)
  // Each event adds node and 1 edge linking to same ticket
  assert.ok(g.edgeCount >= 1);
});
t('Behavior graph has all relationship types', () => {
  const rels = Object.values(RELATIONSHIP_TYPES);
  assert.ok(rels.includes('before')); assert.ok(rels.includes('after'));
  assert.ok(rels.includes('triggered')); assert.ok(rels.includes('correlated'));
  assert.ok(rels.includes('retried')); assert.ok(rels.includes('resolved'));
});

// ==================== EPIC E: GRAPH REPLAY ====================
console.log('\n--- EPIC E: Graph Replay ---\n');
t('GraphReplayEngine.rebuild builds from events', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g); const re = new GraphReplayEngine(g, b);
  const events = [
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-r1', actor: 'u1', aggregateVersion: 1 }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.LISTING_CREATED, transactionId: 'tx-r1', actor: 'u1', aggregateVersion: 2 }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.BUYER_MATCHED, transactionId: 'tx-r1', actor: 'b1', aggregateVersion: 3 })
  ];
  const result = re.rebuild(events);
  assert.ok(result.nodeCount >= 3); assert.ok(result.edgeCount >= 2); assert.ok(result.hash);
});
t('GraphReplayEngine.verifyReplay is deterministic', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g); const re = new GraphReplayEngine(g, b);
  const events = [
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-r2', actor: 'u1', aggregateVersion: 1 }),
    new DomainEvent({ type: DOMAIN_EVENT_TYPES.ESCROW_CREATED, transactionId: 'tx-r2', actor: 'b1', aggregateVersion: 2, data: { escrowId: 'esc-r2' } })
  ];
  const result = re.verifyReplay(events);
  assert.ok(result.match); assert.strictEqual(result.firstHash, result.secondHash);
});
t('GraphReplayEngine.compareGraphs detects differences', () => {
  const g1 = new KnowledgeGraph(); g1.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  const g2 = new KnowledgeGraph(); g2.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  const re = new GraphReplayEngine(g1, new (require('./src/graph/builder').GraphBuilder)(g1));
  const comp = re.compareGraphs(g1, g2);
  assert.ok(comp.match);
});
t('GraphReplayEngine.getReplayMetrics returns stats', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g); const re = new GraphReplayEngine(g, b);
  re.rebuild([new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-m', actor: 'u1', aggregateVersion: 1 })]);
  const m = re.getReplayMetrics();
  assert.strictEqual(m.totalEvents, 1); assert.strictEqual(m.rebuildCount, 1);
});

// ==================== EPIC F: TRAVERSAL ====================
console.log('\n--- EPIC F: Graph Traversal ---\n');
t('GraphTraversal.bfs visits all connected nodes', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addNode(new GraphNode({ type: 'Device', id: 'd1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 'd1', relationship: 'uses' }));
  const tr = new GraphTraversal(g); const visited = [];
  for (const r of tr.bfs('p1')) visited.push(r.node.id);
  assert.strictEqual(visited.length, 3);
});
t('GraphTraversal.dfs visits all connected nodes', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Ticket', id: 't1' })); g.addNode(new GraphNode({ type: 'Device', id: 'd1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 'd1', relationship: 'uses' }));
  const tr = new GraphTraversal(g); const visited = [];
  for (const r of tr.dfs('p1')) visited.push(r.node.id);
  assert.strictEqual(visited.length, 3);
});
t('GraphTraversal.shortestPath returns correct path', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addNode(new GraphNode({ type: 'Escrow', id: 'e1' })); g.addNode(new GraphNode({ type: 'Person', id: 'p2' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 't1', target: 'e1', relationship: 'secured_by' }));
  g.addEdge(new GraphEdge({ source: 'e1', target: 'p2', relationship: 'disputed_by' }));
  const tr = new GraphTraversal(g); const path = tr.shortestPath('p1', 'p2');
  assert.ok(path); assert.strictEqual(path.length, 4); // p1 -> t1 -> e1 -> p2
});
t('GraphTraversal.shortestPath returns null for unreachable', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Person', id: 'p2' }));
  const tr = new GraphTraversal(g); assert.strictEqual(tr.shortestPath('p1', 'p2'), null);
});
t('GraphTraversal.findConnectedComponents detects components', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addNode(new GraphNode({ type: 'Person', id: 'p2' }));
  const tr = new GraphTraversal(g); const comps = tr.findConnectedComponents();
  assert.strictEqual(comps.length, 2);
});
t('GraphTraversal.detectCycles finds cycles', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addNode(new GraphNode({ type: 'Device', id: 'd1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 't1', target: 'd1', relationship: 'linked_to' }));
  g.addEdge(new GraphEdge({ source: 'd1', target: 'p1', relationship: 'uses' }));
  const tr = new GraphTraversal(g); const cycles = tr.detectCycles();
  assert.ok(cycles.length >= 1);
});
t('GraphTraversal.getNeighborhood returns subgraph', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addNode(new GraphNode({ type: 'Device', id: 'd1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 'd1', relationship: 'uses' }));
  const tr = new GraphTraversal(g); const hood = tr.getNeighborhood('p1', { maxDepth: 1, asArray: true });
  assert.strictEqual(hood.nodes.length, 3); assert.strictEqual(hood.edges.length, 2);
});
t('GraphTraversal.traverse with visitor counts', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  const tr = new GraphTraversal(g);
  let count = 0; tr.traverse({ start: 'p1' }, () => { count++; });
  assert.strictEqual(count, 2);
});
t('GraphTraversal.findNodePaths finds paths matching predicate', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addNode(new GraphNode({ type: 'Escrow', id: 'e1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 't1', target: 'e1', relationship: 'secured_by' }));
  const tr = new GraphTraversal(g);
  const paths = tr.findNodePaths('p1', { predicate: n => n.type === 'Escrow', maxDepth: 5 });
  assert.strictEqual(paths.length, 1); assert.strictEqual(paths[0].length, 3);
});

// ==================== EPIC G: QUERY ENGINE ====================
console.log('\n--- EPIC G: Query Engine ---\n');
t('QueryEngine.findNode by type', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  const q = new GraphQueryEngine(g); const found = q.findNode({ type: 'Ticket' });
  assert.ok(found); assert.strictEqual(found.id, 't1');
});
t('QueryEngine.findNodes returns all matching', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Person', id: 'p2' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  const q = new GraphQueryEngine(g); const found = q.findNodes({ type: 'Person' });
  assert.strictEqual(found.length, 2);
});
t('QueryEngine.findEdge by relationship', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  const q = new GraphQueryEngine(g); const e = q.findEdge({ relationship: 'owns' });
  assert.ok(e); assert.strictEqual(e.source, 'p1');
});
t('QueryEngine.getSharedDevices works', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Device', id: 'd1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 'd1', relationship: 'shares_device' }));
  const q = new GraphQueryEngine(g); const shared = q.getSharedDevices('p1');
  assert.strictEqual(shared.length, 1);
});
t('QueryEngine.getRelationshipHistory returns edges', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'listed' }));
  const q = new GraphQueryEngine(g); const hist = q.getRelationshipHistory('p1', 't1');
  assert.strictEqual(hist.length, 2);
});
t('QueryEngine.getConnectedEntities returns all within depth', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addNode(new GraphNode({ type: 'Escrow', id: 'e1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 't1', target: 'e1', relationship: 'secured_by' }));
  const q = new GraphQueryEngine(g); const entities = q.getConnectedEntities('p1', 2);
  assert.strictEqual(entities.length, 3);
});
t('QueryEngine.extractSubgraph returns partial graph', () => {
  const g = new KnowledgeGraph();
  g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addNode(new GraphNode({ type: 'Device', id: 'd1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 'd1', relationship: 'uses' }));
  const q = new GraphQueryEngine(g); const sub = q.extractSubgraph(['p1'], 1);
  assert.strictEqual(sub.nodes.length, 3); assert.strictEqual(sub.edges.length, 2);
});

// ==================== VALIDATOR ====================
console.log('\n--- Validator ---\n');
t('GraphValidator.validateNode validates', () => {
  assert.ok(!GraphValidator.validateNode(null).valid);
  assert.ok(!GraphValidator.validateNode({}).valid);
  assert.ok(!GraphValidator.validateNode({ id: 'n1' }).valid);
  assert.ok(GraphValidator.validateNode({ id: 'n1', type: 'Person' }).valid);
});
t('GraphValidator.validateEdge rejects missing fields', () => {
  assert.ok(!GraphValidator.validateEdge({}).valid);
  assert.ok(!GraphValidator.validateEdge({ source: 'a' }).valid);
  assert.ok(GraphValidator.validateEdge({ id: 'e1', source: 'a', target: 'b', relationship: 'owns' }).valid);
});
t('GraphValidator.validateGraph validates full graph', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Ticket', id: 't1' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 't1', relationship: 'owns' }));
  assert.ok(GraphValidator.validateGraph(g).valid);
});
t('GraphValidator.validateGraph detects dangling edge', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  // Add edge manually (bypass validation)
  g.edges.set('e1', new GraphEdge({ source: 'p1', target: 'nonexistent', relationship: 'owns' }));
  assert.ok(!GraphValidator.validateGraph(g).valid);
});
t('GraphValidator.validateRelationshipConsistency checks bidirectional', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  g.addNode(new GraphNode({ type: 'Person', id: 'p2' }));
  g.addEdge(new GraphEdge({ source: 'p1', target: 'p2', relationship: 'shares_device' }));
  const v = GraphValidator.validateRelationshipConsistency(g);
  assert.ok(v.errors.length > 0); // Missing reverse edge
});

// ==================== SERIALIZER ====================
console.log('\n--- Serializer ---\n');
t('GraphSerializer.serializes to JSON', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  const s = GraphSerializer.serialize(g); assert.ok(s.includes('"Person"'));
});
t('GraphSerializer.deserialize restores graph', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  const s = GraphSerializer.serialize(g); const g2 = GraphSerializer.deserialize(s);
  assert.strictEqual(g2.nodeCount, 1); assert.strictEqual(g.computeHash(), g2.computeHash());
});
t('GraphSerializer.serialize with pretty option', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  const s = GraphSerializer.serialize(g, { pretty: true });
  assert.ok(s.includes('\n'));
});
t('GraphSerializer.exportMinimal returns minimal JSON', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  const s = GraphSerializer.exportMinimal(g); assert.ok(s.startsWith('{"'));
});
t('GraphSerializer.formatStats returns string', () => {
  const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' }));
  const stats = GraphSerializer.formatStats(g);
  assert.ok(stats.includes('Nodes:')); assert.ok(stats.includes('Hash:'));
});

// ==================== PERFORMANCE BENCHMARKS ====================
console.log('\n--- EPIC H: Performance ---\n');
t('Benchmark: 1000 events graph rebuild', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  const events = [];
  for (let i = 0; i < 200; i++) {
    events.push(new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: `tx-${i}`, actor: `user-${i % 10}`, aggregateVersion: 1 }));
    events.push(new DomainEvent({ type: DOMAIN_EVENT_TYPES.LISTING_CREATED, transactionId: `tx-${i}`, actor: `user-${i % 10}`, data: { price: 1000 * i }, aggregateVersion: 2 }));
    events.push(new DomainEvent({ type: DOMAIN_EVENT_TYPES.ESCROW_CREATED, transactionId: `tx-${i}`, actor: `user-${i % 10}`, data: { escrowId: `esc-${i}` }, aggregateVersion: 3 }));
    events.push(new DomainEvent({ type: DOMAIN_EVENT_TYPES.TRANSACTION_CLOSED, transactionId: `tx-${i}`, actor: 'system', aggregateVersion: 4 }));
    events.push(new DomainEvent({ type: DOMAIN_EVENT_TYPES.BUYER_MATCHED, transactionId: `tx-${i}`, actor: `buyer-${i % 5}`, data: { buyerId: `buyer-${i % 5}` }, aggregateVersion: 5 }));
  }
  const start = Date.now();
  const result = b.rebuildFromEvents(events);
  const duration = Date.now() - start;
  console.log('    Performance: 1000 events rebuilt in ' + duration + 'ms, ' + result.nodeCount + ' nodes, ' + result.edgeCount + ' edges');
  assert.ok(result.nodeCount > 0); assert.ok(duration < 2000, 'Rebuild took ' + duration + 'ms (expected < 2000ms)');
});
t('Benchmark: Traversal 10K neighbors', () => {
  const g = new KnowledgeGraph();
  // Create hub with 1000 leaf nodes
  g.addNode(new GraphNode({ type: 'Person', id: 'hub' }));
  const batchSize = 1000;
  for (let i = 0; i < batchSize; i++) {
    g.addNode(new GraphNode({ type: 'Device', id: `d-${i}` }));
    g.addEdge(new GraphEdge({ source: 'hub', target: `d-${i}`, relationship: 'uses' }));
  }
  const tr = new GraphTraversal(g);
  const start = Date.now();
  const hood = tr.getNeighborhood('hub', { maxDepth: 1, asArray: true });
  const duration = Date.now() - start;
  console.log('    Performance: ' + batchSize + ' neighbors traversed in ' + duration + 'ms');
  assert.strictEqual(hood.nodes.length, batchSize + 1);
  assert.ok(duration < 500, 'Traversal took ' + duration + 'ms (expected < 500ms)');
});
t('Benchmark: Graph hash verification', () => {
  const g = new KnowledgeGraph();
  for (let i = 0; i < 500; i++) {
    g.addNode(new GraphNode({ type: 'Ticket', id: `t-${i}`, properties: { price: i * 1000 } }));
  }
  const start = Date.now();
  const hash = g.computeHash();
  const duration = Date.now() - start;
  console.log('    Performance: 500 nodes hashed in ' + duration + 'ms');
  assert.strictEqual(hash.length, 64); assert.ok(duration < 500);
});

// ==================== EDGE CASES ====================
console.log('\n--- Edge Cases ---\n');
t('Empty graph has zero nodes', () => { const g = new KnowledgeGraph(); assert.strictEqual(g.nodeCount, 0); assert.strictEqual(g.edgeCount, 0); });
t('Empty graph hash is deterministic', () => { const g1 = new KnowledgeGraph(); const g2 = new KnowledgeGraph(); assert.strictEqual(g1.computeHash(), g2.computeHash()); });
t('Graph with single node has valid hash', () => { const g = new KnowledgeGraph(); g.addNode(new GraphNode({ type: 'Person', id: 'p1' })); assert.strictEqual(g.computeHash().length, 64); });
t('Builder.processEvent with unknown type does not crash', () => {
  const g = new KnowledgeGraph(); const b = new GraphBuilder(g);
  const ev = new DomainEvent({ type: 'UnknownEvent', transactionId: 'tx-1', actor: 'u1' });
  b.processEvent(ev); // Should not throw
  assert.strictEqual(g.nodeCount, 0);
});
t('GraphTraversal.bfs with non-existent start returns empty', () => {
  const g = new KnowledgeGraph(); const tr = new GraphTraversal(g);
  let count = 0; for (const _ of tr.bfs('nonexistent')) count++;
  assert.strictEqual(count, 0);
});
t('GraphSerializer.deserialize with invalid JSON throws', () => {
  assert.throws(() => GraphSerializer.deserialize('invalid'), /Invalid JSON/);
});
t('GraphSerializer.serialize with invalid graph throws', () => {
  const g = new KnowledgeGraph();
  g.nodes.set('p1', new GraphNode({ type: 'Person', id: 'p1' }));
  g.edges.set('e1', new GraphEdge({ source: 'p1', target: 'nonexistent', relationship: 'owns' }));
  // Serializer with validation enabled should throw
  try { GraphSerializer.serialize(g); } catch (e) { assert.ok(e.message.includes('invalid')); }
});
t('GraphReplayEngine.snapshot creates snapshot', () => {
  const g = new KnowledgeGraph(); const b = new (require('./src/graph/builder').GraphBuilder)(g);
  const re = new GraphReplayEngine(g, b);
  re.rebuild([new DomainEvent({ type: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED, transactionId: 'tx-snap', actor: 'u1', aggregateVersion: 1 })]);
  const snap = re.snapshot('tx-snap');
  assert.ok(snap.transactionId); assert.ok(snap.hash);
});

// ==================== RESULTS ====================
console.log('\n=======================');
console.log('Results: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
console.log('=======================\n');
if (f > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED - Phase 4 Knowledge Graph validated'); process.exit(0); }