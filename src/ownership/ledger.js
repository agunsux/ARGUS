const { db, run, all, get } = require('../database');
const { v4: uuidv4 } = require('uuid');

/**
 * Replays all events chronologically for a ticket to calculate its current state.
 * Enforces logical invariants during the replay sequence.
 */
async function replayTicketState(ticketId) {
  const events = await all(`
    SELECT * FROM ticket_events 
    WHERE ticket_id = ? 
    ORDER BY sequence_id ASC
  `, [ticketId]);

  if (events.length === 0) {
    throw new Error(`No events found for ticket ${ticketId}`);
  }

  let currentState = {
    ticketId: ticketId,
    currentOwnerId: null,
    status: null,
    history: []
  };

  for (const evt of events) {
    const meta = JSON.parse(evt.metadata);
    
    switch (evt.event_type) {
      case 'TicketCreated':
        currentState.status = 'LISTED';
        currentState.history.push({ event: 'TicketCreated', timestamp: evt.created_at, actor: evt.actor_id });
        break;

      case 'OwnershipAssigned':
        currentState.currentOwnerId = evt.actor_id;
        currentState.status = 'LISTED';
        currentState.history.push({ event: 'OwnershipAssigned', owner: evt.actor_id, timestamp: evt.created_at });
        break;

      case 'TransferRequested':
        currentState.status = 'RESERVED';
        currentState.history.push({ 
          event: 'TransferRequested', 
          seller: currentState.currentOwnerId, 
          buyer: meta.buyer_id, 
          timestamp: evt.created_at 
        });
        break;

      case 'VerificationPassed':
        currentState.status = 'VERIFIED';
        currentState.history.push({ event: 'VerificationPassed', timestamp: evt.created_at, officer: evt.actor_id });
        break;

      case 'VerificationFailed':
        currentState.status = 'REJECTED';
        currentState.history.push({ event: 'VerificationFailed', reason: meta.reason, timestamp: evt.created_at, officer: evt.actor_id });
        break;

      case 'SettlementCompleted':
        currentState.status = 'ESCROW_PAID';
        currentState.history.push({ event: 'SettlementCompleted', timestamp: evt.created_at });
        break;

      case 'OwnershipTransferred':
        // Invariant check: Cannot transfer to a non-existent or same owner
        if (!meta.new_owner_id) {
          throw new Error('OwnershipTransferred event missing new_owner_id metadata');
        }
        currentState.currentOwnerId = meta.new_owner_id;
        currentState.status = 'TRANSFERRED';
        currentState.history.push({ 
          event: 'OwnershipTransferred', 
          previous_owner: evt.actor_id, 
          new_owner: meta.new_owner_id, 
          timestamp: evt.created_at 
        });
        break;

      case 'Redeemed':
        currentState.status = 'REDEEMED';
        currentState.history.push({ event: 'Redeemed', timestamp: evt.created_at });
        break;

      case 'Disputed':
        currentState.status = 'DISPUTED';
        currentState.history.push({ event: 'Disputed', reason: meta.reason, timestamp: evt.created_at });
        break;

      default:
        throw new Error(`Unknown event type ${evt.event_type}`);
    }
  }

  // Invariant 1: One ticket has exactly one current owner (if it has been assigned)
  if (currentState.status !== 'LISTED' && currentState.currentOwnerId === null) {
    throw new Error(`Invariant Violated: Ticket ${ticketId} has no active current owner`);
  }

  return currentState;
}

/**
 * Appends a new event to the ledger, computes the derived state,
 * updates the cached tickets table, and records an audit log.
 */
async function appendLedgerEvent(ticketId, eventType, actorId, metadata = {}) {
  const eventId = `evt-${uuidv4()}`;
  const metadataStr = JSON.stringify(metadata);

  return new Promise((resolve, reject) => {
    // Run everything in a transaction for atomicity
    db.serialize(async () => {
      try {
        // Begin Transaction
        await run('BEGIN TRANSACTION');

        // 1. Insert the ground truth event into ticket_events
        await run(`
          INSERT INTO ticket_events (id, ticket_id, event_type, actor_id, metadata)
          VALUES (?, ?, ?, ?, ?)
        `, [eventId, ticketId, eventType, actorId, metadataStr]);

        // 2. Replay all events to construct the derived state
        const derivedState = await replayTicketState(ticketId);

        // 3. Update the cached tickets table with current owner and status
        await run(`
          UPDATE tickets 
          SET current_owner_id = ?, status = ?
          WHERE id = ?
        `, [derivedState.currentOwnerId, derivedState.status, ticketId]);

        // 4. Record a write-only audit log
        await run(`
          INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, metadata)
          VALUES ('TICKET', ?, ?, ?, ?)
        `, [ticketId, eventType.toUpperCase(), actorId, JSON.stringify({ event_id: eventId, derived_status: derivedState.status })]);

        // Commit Transaction
        await run('COMMIT');
        resolve(derivedState);
      } catch (err) {
        // Rollback Transaction on error
        run('ROLLBACK').catch(() => {});
        reject(err);
      }
    });
  });
}

module.exports = {
  replayTicketState,
  appendLedgerEvent
};
