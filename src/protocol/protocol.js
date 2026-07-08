/**
 * Protocol Layer — Wave 2 Core
 * 
 * Single entry point for ALL state changes.
 * No component may change state except through protocol.execute(command).
 */
const { StateMachine, STATES } = require('../engine/stateMachine');
const { EvidenceEngine } = require('../engine/evidenceEngine');
const { TransactionAggregate } = require('./aggregate');
const { DomainEvent, DOMAIN_EVENT_TYPES } = require('./domainEvents');
const { EventBus } = require('./eventBus');

class Protocol {
  constructor({ eventBus, aggregateStore } = {}) {
    this.eventBus = eventBus || new EventBus();
    this.aggregateStore = aggregateStore || this._defaultStore();
    this._idempotencyCache = new Map();
    this._eventStore = [];
  }

  _defaultStore() {
    const map = new Map();
    return {
      save: agg => { map.set(agg.transactionId, agg); return Promise.resolve(); },
      load: id => Promise.resolve(map.get(id) || null)
    };
  }

  static getEventForCommand(type) {
    const m = {
      VerifyOwnership: DOMAIN_EVENT_TYPES.OWNERSHIP_VERIFIED,
      CreateListing: DOMAIN_EVENT_TYPES.LISTING_CREATED,
      MatchBuyer: DOMAIN_EVENT_TYPES.BUYER_MATCHED,
      CreateEscrow: DOMAIN_EVENT_TYPES.ESCROW_CREATED,
      FundEscrow: DOMAIN_EVENT_TYPES.ESCROW_FUNDED,
      RequestTransfer: DOMAIN_EVENT_TYPES.TRANSFER_REQUESTED,
      AcceptTransfer: DOMAIN_EVENT_TYPES.TRANSFER_ACCEPTED,
      RejectTransfer: DOMAIN_EVENT_TYPES.TRANSFER_REJECTED,
      VerifyVenue: DOMAIN_EVENT_TYPES.VENUE_VERIFIED,
      CompleteSettlement: DOMAIN_EVENT_TYPES.SETTLEMENT_COMPLETED,
      OpenDispute: DOMAIN_EVENT_TYPES.DISPUTE_OPENED,
      ResolveDispute: DOMAIN_EVENT_TYPES.DISPUTE_RESOLVED,
      CloseTransaction: DOMAIN_EVENT_TYPES.TRANSACTION_CLOSED,
      RefundEscrow: DOMAIN_EVENT_TYPES.REFUND_ISSUED,
      CancelTransaction: DOMAIN_EVENT_TYPES.TRANSACTION_CANCELLED
    };
    return m[type] || null;
  }

  static getTargetState(type) {
    const m = {
      VerifyOwnership: STATES.OWNERSHIP_VERIFIED,
      CreateListing: STATES.LISTED, MatchBuyer: STATES.MATCHED,
      CreateEscrow: STATES.ESCROWED, FundEscrow: STATES.ESCROWED,
      RequestTransfer: STATES.TRANSFER_PENDING,
      AcceptTransfer: STATES.TRANSFER_VERIFIED,
      RejectTransfer: STATES.ESCROWED,
      VerifyVenue: STATES.VENUE_VERIFIED,
      CompleteSettlement: STATES.SETTLED,
      CloseTransaction: STATES.CLOSED, CancelTransaction: STATES.CLOSED
    };
    return m[type] || null;
  }

  async execute(command) {
    const start = Date.now();
    const v = command.validate();
    if (!v.valid) return this._fail(command, v.errors.join('; '), 'VALIDATION_ERROR', start);

    const cached = this._idempotencyCache.get(command.identity);
    if (cached) return this._ok(command, cached, start, true);

    let agg = await this.aggregateStore.load(command.transactionId);
    if (!agg) agg = new TransactionAggregate(command.transactionId);

    const target = Protocol.getTargetState(command.type);
    const evType = Protocol.getEventForCommand(command.type);

    if (agg.state && target) {
      const tv = StateMachine.isValidTransition(agg.state, target);
      if (!tv.valid) return this._fail(command, `${agg.state} -> ${target}: ${tv.reason}`, 'INVALID_TRANSITION', start);
      const iv = StateMachine.validateInvariants(agg.state, target, { currentOwnerId: agg.currentOwnerId, evidenceBundleId: command.payload.evidenceBundleId });
      if (iv.length > 0) return this._fail(command, iv[0].detail, 'INVARIANT_VIOLATION', start);
    }

    const ev = new DomainEvent({
      type: evType || command.type, transactionId: command.transactionId,
      actor: command.actor, data: { ...command.payload, commandType: command.type },
      aggregateVersion: agg.version + 1, commandId: command.idempotencyKey,
      metadata: command.metadata
    });
    agg.applyEvent(ev);
    await this.aggregateStore.save(agg);
    this._eventStore.push(ev);
    this._idempotencyCache.set(command.identity, ev);
    this.eventBus.publish(ev);
    return this._ok(command, ev, start, false, agg);
  }

  rebuildFromEvents(transactionId) {
    const events = this._eventStore.filter(e => e.transactionId === transactionId);
    return events.length ? TransactionAggregate.rebuild(transactionId, events) : null;
  }

  getEventHistory() { return [...this._eventStore]; }
  getTransactionEvents(id) { return this._eventStore.filter(e => e.transactionId === id); }

  _ok(cmd, ev, start, idempotent, agg) {
    return { success: true, idempotent, commandId: cmd.idempotencyKey, eventId: ev.id, eventType: ev.type, aggregateVersion: ev.aggregateVersion, state: agg ? agg.state : null, elapsed: Date.now() - start, timestamp: ev.timestamp };
  }

  _fail(cmd, reason, code, start) {
    this.eventBus.publish(new DomainEvent({ type: DOMAIN_EVENT_TYPES.TRANSACTION_FAILED, transactionId: cmd.transactionId, actor: cmd.actor, data: { reason, code, commandType: cmd.type }, commandId: cmd.idempotencyKey }));
    return { success: false, error: reason, code, commandId: cmd.idempotencyKey, elapsed: Date.now() - start, timestamp: new Date().toISOString() };
  }
}

module.exports = { Protocol };
