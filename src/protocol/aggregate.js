/**
 * Transaction Aggregate — Wave 2 Protocol Layer
 * 
 * An aggregate represents the complete state of a single transaction.
 * It does not know about databases, HTTP, or the outside world.
 * It only accepts events and commands through the Protocol Layer.
 */
const { STATES } = require('../engine/stateMachine');

class TransactionAggregate {
  constructor(transactionId) {
    this.transactionId = transactionId;
    this.state = null;
    this.currentOwnerId = null;
    this.currentBuyerId = null;
    this.price = null;
    this.escrowId = null;
    this.escrowStatus = null;
    this.evidenceChain = [];
    this.history = [];
    this.version = 0;
    this.riskScore = null;
    this.errors = [];
  }

  /**
   * Applies a domain event to update aggregate state.
   * This is the ONLY way to change aggregate state.
   */
  applyEvent(event) {
    this.version = event.aggregateVersion || (this.version + 1);

    switch (event.type) {
      case 'OwnershipVerified':
        this.state = STATES.OWNERSHIP_VERIFIED;
        this.currentOwnerId = event.data.ownerId || event.actor;
        break;
      case 'ListingCreated':
        this.state = STATES.LISTED;
        this.price = event.data.price || this.price;
        break;
      case 'BuyerMatched':
        this.state = STATES.MATCHED;
        this.currentBuyerId = event.data.buyerId || event.actor;
        break;
      case 'EscrowCreated':
        this.state = STATES.ESCROWED;
        this.escrowId = event.data.escrowId;
        this.escrowStatus = 'PENDING';
        break;
      case 'EscrowFunded':
        this.state = STATES.ESCROWED;
        this.escrowStatus = 'HELD';
        break;
      case 'TransferRequested':
        this.state = STATES.TRANSFER_PENDING;
        break;
      case 'TransferAccepted':
      case 'TransferVerified':
        this.state = STATES.TRANSFER_VERIFIED;
        if (event.data.newOwnerId) this.currentOwnerId = event.data.newOwnerId;
        break;
      case 'TransferRejected':
        this.state = STATES.ESCROWED;
        break;
      case 'VenueVerified':
        this.state = STATES.VENUE_VERIFIED;
        break;
      case 'SettlementCompleted':
        this.state = STATES.SETTLED;
        this.escrowStatus = 'RELEASED';
        break;
      case 'TransactionClosed':
        this.state = STATES.CLOSED;
        break;
      case 'DisputeOpened':
        this.state = STATES.EXCEPTION;
        this.escrowStatus = 'DISPUTED';
        break;
      case 'DisputeResolved':
        this.escrowStatus = event.data.resolution || this.escrowStatus;
        break;
      case 'RefundIssued':
        this.escrowStatus = 'REFUNDED';
        break;
      case 'TransactionFailed':
        this.state = STATES.EXCEPTION;
        this.errors.push(event.data.reason);
        break;
      case 'TransactionCancelled':
        this.state = STATES.CLOSED;
        break;
    }

    // Track evidence
    if (event.data.evidenceBundleId) {
      this.evidenceChain.push({
        eventId: event.id,
        bundleId: event.data.evidenceBundleId,
        actor: event.actor,
        timestamp: event.timestamp
      });
    }

    // Build history
    this.history.push({
      event: event.type,
      actor: event.actor,
      state: this.state,
      version: this.version,
      timestamp: event.timestamp
    });
  }

  /**
   * Rebuilds aggregate from a list of domain events (replay).
   */
  static rebuild(transactionId, events) {
    const agg = new TransactionAggregate(transactionId);
    const sorted = [...events].sort((a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0));
    for (const event of sorted) {
      agg.applyEvent(event);
    }
    return agg;
  }
}

module.exports = { TransactionAggregate };
