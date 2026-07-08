/**
 * Command Definitions — Wave 2 Protocol Layer
 * 
 * Commands are intents, not results. They represent what an actor
 * wants to do, not what happened.
 * 
 * Every command MUST have an idempotencyKey for safe retry.
 * Commands may fail. Domain Events never fail.
 */
const { v4: uuidv4 } = require('uuid');

const COMMAND_TYPES = {
  VERIFY_OWNERSHIP: 'VerifyOwnership',
  CREATE_LISTING: 'CreateListing',
  MATCH_BUYER: 'MatchBuyer',
  CREATE_ESCROW: 'CreateEscrow',
  FUND_ESCROW: 'FundEscrow',
  REQUEST_TRANSFER: 'RequestTransfer',
  ACCEPT_TRANSFER: 'AcceptTransfer',
  REJECT_TRANSFER: 'RejectTransfer',
  VERIFY_VENUE: 'VerifyVenue',
  COMPLETE_SETTLEMENT: 'CompleteSettlement',
  OPEN_DISPUTE: 'OpenDispute',
  RESOLVE_DISPUTE: 'ResolveDispute',
  CLOSE_TRANSACTION: 'CloseTransaction',
  REFUND_ESCROW: 'RefundEscrow',
  CANCEL_TRANSACTION: 'CancelTransaction'
};

class Command {
  constructor({ type, transactionId, actor, payload = {}, idempotencyKey, metadata = {} }) {
    if (!type) throw new Error('Command type is required');
    if (!transactionId) throw new Error('Command transactionId is required');
    if (!actor) throw new Error('Command actor is required');

    this.type = type;
    this.transactionId = transactionId;
    this.actor = actor;
    this.payload = payload;
    this.idempotencyKey = idempotencyKey || `cmd-${uuidv4()}`;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Returns a unique identity for idempotency checking.
   */
  get identity() {
    return `${this.transactionId}:${this.idempotencyKey}`;
  }

  /**
   * Validates the command has all required fields.
   */
  validate() {
    const errors = [];
    if (!Object.values(COMMAND_TYPES).includes(this.type)) {
      errors.push(`Unknown command type: ${this.type}`);
    }
    return { valid: errors.length === 0, errors };
  }
}

function createCommand(type, params) {
  return new Command({ type, ...params });
}

module.exports = { Command, COMMAND_TYPES, createCommand };
