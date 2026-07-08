/**
 * Transaction Engine — Core Trust Loop v0.2
 * 
 * Orchestrates the complete transaction lifecycle using the state machine,
 * replay engine, recovery engine, and evidence engine.
 * This is the main entry point for all Core Trust Loop operations.
 */
const { StateMachine, STATES, EVENTS, INVARIANTS } = require('./stateMachine');
const { ReplayEngine } = require('./replayEngine');
const { RecoveryEngine } = require('./recoveryEngine');
const { EvidenceEngine } = require('./evidenceEngine');
const { v4: uuidv4 } = require('uuid');

class TransactionEngine {
  /**
   * Creates a new transaction in the Core Trust Loop.
   */
  static async createTransaction({ ticketId, sellerId, eventId, seatInfo, price }, db) {
    const transactionId = ticketId;
    const eventId_gen = `evt-${uuidv4()}`;

    // State 1: Ownership Verified
    const evidence = EvidenceEngine.generateEventEvidence({
      transactionId, eventType: EVENTS.OWNERSHIP_VERIFIED,
      actorId: sellerId, metadata: { eventId, seatInfo, price }
    });

    const ownershipEvent = {
      id: eventId_gen, transaction_id: transactionId, ticket_id: transactionId,
      event_type: EVENTS.OWNERSHIP_VERIFIED, actor_id: sellerId,
      metadata: JSON.stringify({
        owner_id: sellerId, eventId, seatInfo, price,
        evidenceBundleId: evidence.evidenceId,
        evidenceSignature: evidence.signature
      }),
      created_at: new Date().toISOString()
    };

    return { transactionId, initialState: STATES.OWNERSHIP_VERIFIED, event: ownershipEvent, evidence };
  }

  /**
   * Validates and executes a state transition.
   */
  static async transition({ transactionId, currentState, nextState, actorId, metadata = {}, evidenceBundleId, db }) {
    // 1. Validate transition
    const transitionValidation = StateMachine.isValidTransition(currentState, nextState);
    if (!transitionValidation.valid) {
      throw Object.assign(new Error(transitionValidation.reason), { code: 'INVALID_TRANSITION', state: currentState, target: nextState });
    }

    // 2. Validate invariants
    const violations = StateMachine.validateInvariants(currentState, nextState, { ...metadata, evidenceBundleId });
    if (violations.length > 0) {
      throw Object.assign(new Error(`Invariant violation: ${violations[0].detail}`), {
        code: 'INVARIANT_VIOLATION', violations
      });
    }

    // 3. Generate event
    const eventId = `evt-${uuidv4()}`;
    const eventType = StateMachine.getEventForTransition(currentState, nextState);
    if (!eventType) {
      throw Object.assign(new Error(`No event for transition ${currentState} -> ${nextState}`), { code: 'NO_EVENT' });
    }

    // 4. Generate evidence
    const evidence = EvidenceEngine.generateEventEvidence({
      transactionId, eventType, actorId, metadata: { ...metadata, evidenceBundleId }
    });

    // 5. Check last event in ledger for chaining
    let previousEventId = null;
    if (db) {
      try {
        const lastEvent = await db.get(
          'SELECT id FROM ticket_events WHERE ticket_id = ? ORDER BY sequence_id DESC LIMIT 1',
          [transactionId]
        );
        if (lastEvent) previousEventId = lastEvent.id;
      } catch (e) { /* new transaction, no previous event */ }
    }

    const eventRecord = {
      id: eventId, ticket_id: transactionId,
      event_type: eventType, actor_id: actorId,
      metadata: JSON.stringify({
        ...metadata, evidenceBundleId,
        evidenceId: evidence.evidenceId,
        evidenceSignature: evidence.signature,
        previousEventId,
        fromState: currentState, toState: nextState
      }),
      created_at: new Date().toISOString()
    };

    return { eventId, eventType, event: eventRecord, evidence, targetState: nextState };
  }

  /**
   * Reconstructs full transaction state from the database.
   */
  static async reconstructTransaction(transactionId, db) {
    const events = await db.all(
      'SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY sequence_id ASC',
      [transactionId]
    );
    if (!events || events.length === 0) {
      throw Object.assign(new Error(`Transaction ${transactionId} not found`), { code: 'NOT_FOUND' });
    }
    const reconstructed = ReplayEngine.reconstructFromEvents(events);
    
    // Verify against stored ticket state
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [transactionId]);
    if (ticket) {
      const consistency = ReplayEngine.verifyConsistency(reconstructed, {
        currentState: ticket.status,
        currentOwnerId: ticket.current_owner_id
      });
      reconstructed.consistencyCheck = consistency;
    }
    
    return reconstructed;
  }

  /**
   * Recovers from a failure at any state.
   */
  static async recoverFromFailure({ transactionId, currentState, error, context = {}, db }) {
    const recovery = RecoveryEngine.recover({ currentState, error, transactionId, context });
    
    if (recovery.targetState && recovery.targetState !== currentState) {
      const transition = await TransactionEngine.transition({
        transactionId, currentState, nextState: recovery.targetState,
        actorId: 'recovery-system', metadata: { recoveryAction: recovery.action, originalError: error.message }
      });
      return { recovery, transition };
    }
    return { recovery, transition: null };
  }

  /**
   * Verifies the full audit trail for a transaction.
   */
  static async verifyAuditTrail(transactionId, db) {
    const state = await TransactionEngine.reconstructTransaction(transactionId, db);
    return ReplayEngine.buildAuditTrail(state);
  }

  /**
   * Idempotency check — prevents duplicate events.
   */
  static async isDuplicate(idempotencyKey, db) {
    const existing = await db.get(
      'SELECT id FROM ticket_events WHERE id = ?',
      [`evt-${idempotencyKey}`]
    );
    return !!existing;
  }
}

module.exports = { TransactionEngine };
