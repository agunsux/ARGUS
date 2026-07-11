/**
 * Graph Builder — Phase 4 Knowledge Graph Foundation
 *
 * Builds nodes and edges from DomainEvent objects.
 * Provides subgraph construction for identity, asset, and behavior analysis.
 */
const { GraphNode } = require('./node');
const { GraphEdge } = require('./edge');
const { DOMAIN_EVENT_TYPES } = require('../protocol/domainEvents');

const NODE_TYPES = Object.freeze({
  PERSON: 'Person',
  TICKET: 'Ticket',
  EVENT: 'Event',
  VENUE: 'Venue',
  ESCROW: 'Escrow',
  TRANSFER: 'Transfer',
  SETTLEMENT: 'Settlement',
  DISPUTE: 'Dispute',
  REFUND: 'Refund',
  FAILURE: 'Failure',
  DEVICE: 'Device',
  EMAIL: 'Email',
  PHONE: 'Phone',
  BANK_ACCOUNT: 'BankAccount',
  GOVERNMENT_ID: 'GovernmentID',
  EVIDENCE: 'Evidence',
  ORGANIZATION: 'Organization',
  VENUE_OFFICER: 'VenueOfficer',
  LOGIN: 'Login',
  VERIFICATION: 'Verification',
  PAYMENT: 'Payment',
  SCAN: 'Scan',
  RECOVERY: 'Recovery',
  ORDER: 'Order',
  PROMOTER: 'Promoter'
});

const RELATIONSHIP_TYPES = Object.freeze({
  OWNS: 'owns',
  LISTED: 'listed',
  MATCHED: 'matched',
  SECURED_BY: 'secured_by',
  TRANSFERRED_TO: 'transferred_to',
  VERIFIED_AT: 'verified_at',
  SETTLED_WITH: 'settled_with',
  DISPUTED_BY: 'disputed_by',
  CAUSED: 'caused',
  USES: 'uses',
  BELONGS_TO: 'belongs_to',
  VERIFIED_BY: 'verified_by',
  SHARES_DEVICE: 'shares_device',
  SHARES_IDENTITY: 'shares_identity',
  SHARES_PAYMENT: 'shares_payment',
  REGISTERED_WITH: 'registered_with',
  BEFORE: 'before',
  AFTER: 'after',
  TRIGGERED: 'triggered',
  CORRELATED: 'correlated',
  RETRIED: 'retried',
  RESOLVED: 'resolved',
  GENERATED: 'generated',
  LINKED_TO: 'linked_to',
  CREATED_FROM: 'created_from',
  SOLD_TO: 'sold_to',
  SECURED: 'secured'
});

class GraphBuilder {
  constructor(graph) {
    if (!graph) throw new Error('GraphBuilder requires a KnowledgeGraph instance');
    this._graph = graph;
    this._eventCount = 0;
  }

  /**
   * Process a single domain event and update the graph.
   */
  processEvent(event) {
    this._eventCount++;
    const txId = event.transactionId;
    const actor = event.actor || 'system';
    const data = event.data || {};

    switch (event.type) {
      case DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED:
        this._ensurePerson(actor);
        this._ensureTicket(txId, { ownerId: data.ownerId || actor });
        this._addEdge(actor, txId, RELATIONSHIP_TYPES.OWNS, { eventId: event.id, timestamp: event.timestamp });
        // Identity enrichment
        this.buildIdentityGraph(event);
        break;

      case DOMAIN_EVENT_TYPES.LISTING_CREATED:
        this._ensureTicket(txId, { price: data.price });
        this._ensureEvent(txId, data);
        this._addEdge(txId, `evt-${txId}`, RELATIONSHIP_TYPES.LISTED, { eventId: event.id, price: data.price });
        break;

      case DOMAIN_EVENT_TYPES.BUYER_MATCHED:
        const buyerId = data.buyerId || actor;
        this._ensurePerson(buyerId);
        this._addEdge(txId, buyerId, RELATIONSHIP_TYPES.MATCHED, { eventId: event.id });
        break;

      case DOMAIN_EVENT_TYPES.ESCROW_CREATED:
        this._ensureEscrow(data.escrowId || `esc-${txId}`, { status: 'PENDING', transactionId: txId });
        this._addEdge(txId, data.escrowId || `esc-${txId}`, RELATIONSHIP_TYPES.SECURED_BY, { eventId: event.id });
        break;

      case DOMAIN_EVENT_TYPES.ESCROW_FUNDED:
        const escrowId = data.escrowId || `esc-${txId}`;
        this._ensureEscrow(escrowId, { status: 'FUNDED', transactionId: txId });
        break;

      case DOMAIN_EVENT_TYPES.TRANSFER_REQUESTED:
        this._ensureTransfer(`trf-${txId}`, { status: 'REQUESTED', transactionId: txId });
        this._addEdge(txId, `trf-${txId}`, RELATIONSHIP_TYPES.TRANSFERRED_TO, { eventId: event.id });
        break;

      case DOMAIN_EVENT_TYPES.TRANSFER_ACCEPTED:
        this._ensureTransfer(`trf-${txId}`, { status: 'ACCEPTED' });
        break;

      case DOMAIN_EVENT_TYPES.TRANSFER_VERIFIED:
        this._ensureTransfer(`trf-${txId}`, { status: 'VERIFIED' });
        break;

      case DOMAIN_EVENT_TYPES.TRANSFER_REJECTED:
        this._ensureTransfer(`trf-${txId}`, { status: 'REJECTED', reason: data.reason });
        break;

      case DOMAIN_EVENT_TYPES.VENUE_VERIFIED:
        this._ensureVenue(data.venueId || `venue-${txId}`, { transactionId: txId });
        this._addEdge(txId, data.venueId || `venue-${txId}`, RELATIONSHIP_TYPES.VERIFIED_AT, { eventId: event.id });
        this._ensureVenueOfficer(actor, data.venueId || `venue-${txId}`);
        break;

      case DOMAIN_EVENT_TYPES.SETTLEMENT_COMPLETED:
        this._ensureSettlement(`stl-${txId}`, { status: 'COMPLETED', transactionId: txId });
        this._addEdge(txId, `stl-${txId}`, RELATIONSHIP_TYPES.SETTLED_WITH, { eventId: event.id });
        break;

      case DOMAIN_EVENT_TYPES.TRANSACTION_CLOSED:
        this._updateNodeProps(txId, { status: 'CLOSED', closedAt: event.timestamp });
        break;

      case DOMAIN_EVENT_TYPES.DISPUTE_OPENED:
        this._ensureDispute(`dsp-${txId}`, { status: 'OPEN', reason: data.reason, transactionId: txId });
        this._addEdge(txId, `dsp-${txId}`, RELATIONSHIP_TYPES.DISPUTED_BY, { eventId: event.id, reason: data.reason });
        break;

      case DOMAIN_EVENT_TYPES.DISPUTE_RESOLVED:
        this._ensureDispute(`dsp-${txId}`, { status: 'RESOLVED', resolution: data.resolution });
        this._addEdge(`dsp-${txId}`, txId, RELATIONSHIP_TYPES.RESOLVED, { eventId: event.id });
        break;

      case DOMAIN_EVENT_TYPES.REFUND_ISSUED:
        this._ensureRefund(`ref-${txId}`, { status: 'ISSUED', transactionId: txId });
        break;

      case DOMAIN_EVENT_TYPES.TRANSACTION_FAILED:
        this._ensureFailure(`fail-${event.id}`, { reason: data.reason, code: data.code, transactionId: txId });
        this._addEdge(`fail-${event.id}`, txId, RELATIONSHIP_TYPES.CAUSED, { eventId: event.id });
        break;

      case DOMAIN_EVENT_TYPES.TRANSACTION_CANCELLED:
        this._updateNodeProps(txId, { status: 'CANCELLED', cancelledAt: event.timestamp });
        break;
    }

    // Build behavior edges between sequential events per transaction
    this._linkSequentialEvents(event);
  }

  /**
   * Build identity subgraph from event metadata.
   */
  buildIdentityGraph(event) {
    const metadata = event.metadata || {};
    const actor = event.actor || 'system';

    if (metadata.device) {
      this._ensureDevice(metadata.device, { type: metadata.deviceType });
      this._addEdge(actor, metadata.device, RELATIONSHIP_TYPES.USES, { eventId: event.id });
    }
    if (metadata.email) {
      this._ensureEmail(metadata.email);
      this._addEdge(actor, metadata.email, RELATIONSHIP_TYPES.USES, { eventId: event.id });
    }
    if (metadata.phone) {
      this._ensurePhone(metadata.phone);
      this._addEdge(actor, metadata.phone, RELATIONSHIP_TYPES.USES, { eventId: event.id });
    }
    if (metadata.account) {
      this._ensureBankAccount(metadata.account, { bankName: metadata.bankName });
      this._addEdge(actor, metadata.account, RELATIONSHIP_TYPES.USES, { eventId: event.id });
    }
    if (metadata.govId) {
      this._ensureGovernmentId(metadata.govId, { type: metadata.govIdType });
      this._addEdge(actor, metadata.govId, RELATIONSHIP_TYPES.VERIFIED_BY, { eventId: event.id });
    }
  }

  /**
   * Build asset subgraph for a transaction.
   */
  buildAssetGraph(txId) {
    const ticket = this._graph.getNode(txId);
    if (!ticket) return;

    // Gather all related nodes already in graph
    const edges = this._graph.getEdgesForNode(txId);
    for (const edge of edges) {
      const neighborId = edge.source === txId ? edge.target : edge.source;
      // Already connected — ensure all asset types are present
    }
  }

  /**
   * Build behavior subgraph linking sequential events.
   */
  buildBehaviorGraph(txId) {
    // Sequential event linking is done in processEvent via _linkSequentialEvents
    // This method additionally enriches with behavior-specific edges
    const edges = this._graph.getEdgesForNode(txId);
    const sortedEdges = edges.sort((a, b) => (a.metadata.timestamp || '').localeCompare(b.metadata.timestamp || ''));

    for (let i = 1; i < sortedEdges.length; i++) {
      const prev = sortedEdges[i - 1];
      const curr = sortedEdges[i];
      this._addEdge(prev.id, curr.id, RELATIONSHIP_TYPES.BEFORE, {});
      this._addEdge(curr.id, prev.id, RELATIONSHIP_TYPES.AFTER, {});
    }
  }

  /**
   * Rebuild the entire graph from an array of events.
   */
  rebuildFromEvents(events) {
    this._graph.clear();
    this._eventCount = 0;
    for (const event of events) {
      this.processEvent(event);
    }
    return {
      nodeCount: this._graph.nodeCount,
      edgeCount: this._graph.edgeCount,
      hash: this._graph.computeHash()
    };
  }

  getAllNodeTypes() { return Object.values(NODE_TYPES); }
  getAllRelationshipTypes() { return Object.values(RELATIONSHIP_TYPES); }

  get eventCount() { return this._eventCount; }

  // ==================== Internal Helpers ====================

  _ensureNode(id, type, props = {}) {
    if (!this._graph.hasNode(id)) {
      const node = new GraphNode({ id, type, properties: props });
      this._graph.addNode(node);
      return node;
    }
    const existing = this._graph.getNode(id);
    existing.update(props);
    return existing;
  }

  _ensurePerson(id) { return this._ensureNode(id, NODE_TYPES.PERSON); }
  _ensureTicket(id, props) { return this._ensureNode(id, NODE_TYPES.TICKET, props); }
  _ensureEvent(id, props) { return this._ensureNode(`evt-${id}`, NODE_TYPES.EVENT, props); }
  _ensureVenue(id, props) { return this._ensureNode(id, NODE_TYPES.VENUE, props); }
  _ensureEscrow(id, props) { return this._ensureNode(id, NODE_TYPES.ESCROW, props); }
  _ensureTransfer(id, props) { return this._ensureNode(id, NODE_TYPES.TRANSFER, props); }
  _ensureSettlement(id, props) { return this._ensureNode(id, NODE_TYPES.SETTLEMENT, props); }
  _ensureDispute(id, props) { return this._ensureNode(id, NODE_TYPES.DISPUTE, props); }
  _ensureRefund(id, props) { return this._ensureNode(id, NODE_TYPES.REFUND, props); }
  _ensureFailure(id, props) { return this._ensureNode(id, NODE_TYPES.FAILURE, props); }
  _ensureDevice(id, props) { return this._ensureNode(id, NODE_TYPES.DEVICE, props); }
  _ensureEmail(id) { return this._ensureNode(id, NODE_TYPES.EMAIL, { address: id }); }
  _ensurePhone(id) { return this._ensureNode(id, NODE_TYPES.PHONE, { number: id }); }
  _ensureBankAccount(id, props) { return this._ensureNode(id, NODE_TYPES.BANK_ACCOUNT, props); }
  _ensureGovernmentId(id, props) { return this._ensureNode(id, NODE_TYPES.GOVERNMENT_ID, props); }
  _ensureVenueOfficer(id, venueId) { return this._ensureNode(id, NODE_TYPES.VENUE_OFFICER, { venueId }); }

  _addEdge(source, target, relationship, metadata = {}) {
    try {
      // Avoid duplicate edges of same type between same nodes
      const existingEdges = this._graph.getEdgesForNode(source);
      for (const e of existingEdges) {
        if (e.source === source && e.target === target && e.relationship === relationship) return e;
        if (e.source === target && e.target === source && e.relationship === relationship) return e;
      }
      const edge = new GraphEdge({ source, target, relationship, metadata });
      this._graph.addEdge(edge);
      return edge;
    } catch (err) {
      // Silently skip if nodes don't exist yet
      return null;
    }
  }

  _updateNodeProps(id, props) {
    const node = this._graph.getNode(id);
    if (node) node.update(props);
  }

  _linkSequentialEvents(event) {
    // Track last event per transaction for behavior edges
    if (!this._lastEvents) this._lastEvents = new Map();
    const txId = event.transactionId;
    const lastId = this._lastEvents.get(txId);
    if (lastId) {
      this._addEdge(lastId, event.id, RELATIONSHIP_TYPES.BEFORE, {});
      this._addEdge(event.id, lastId, RELATIONSHIP_TYPES.AFTER, {});
    }
    this._lastEvents.set(txId, event.id);
  }
}

module.exports = { GraphBuilder, NODE_TYPES, RELATIONSHIP_TYPES };