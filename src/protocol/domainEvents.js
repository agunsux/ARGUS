/**
 * Domain Event Definitions — Wave 2 Protocol Layer
 * 
 * Domain Events represent what HAS happened, not what someone wants.
 * Events are immutable, append-only, and never fail.
 * 
 * Every event advances the aggregate version by 1.
 */
const { v4: uuidv4 } = require('uuid');

const DOMAIN_EVENT_TYPES = {
  // Core Trust Loop events (mapped from old EVENTS)
  OWNERSHIP_VERIFIED: 'OwnershipVerified',
  LISTING_CREATED: 'ListingCreated',
  BUYER_MATCHED: 'BuyerMatched',
  ESCROW_CREATED: 'EscrowCreated',
  ESCROW_FUNDED: 'EscrowFunded',
  TRANSFER_REQUESTED: 'TransferRequested',
  TRANSFER_ACCEPTED: 'TransferAccepted',
  TRANSFER_REJECTED: 'TransferRejected',
  TRANSFER_VERIFIED: 'TransferVerified',
  VENUE_VERIFIED: 'VenueVerified',
  SETTLEMENT_COMPLETED: 'SettlementCompleted',
  TRANSACTION_CLOSED: 'TransactionClosed',

  // Dispute events
  DISPUTE_OPENED: 'DisputeOpened',
  DISPUTE_RESOLVED: 'DisputeResolved',
  REFUND_ISSUED: 'RefundIssued',

  // Failure events
  TRANSACTION_FAILED: 'TransactionFailed',
  TRANSACTION_CANCELLED: 'TransactionCancelled'
};

class DomainEvent {
  constructor({ type, transactionId, actor, data = {}, aggregateVersion, commandId, metadata = {} }) {
    if (!type) throw new Error('DomainEvent type is required');
    if (!transactionId) throw new Error('DomainEvent transactionId is required');

    this.id = `evt-${uuidv4()}`;
    this.type = type;
    this.transactionId = transactionId;
    this.actor = actor || 'system';
    this.data = data;
    this.aggregateVersion = aggregateVersion || 1;
    this.commandId = commandId || null;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }

  get identity() {
    return this.id;
  }
}

module.exports = { DomainEvent, DOMAIN_EVENT_TYPES };
