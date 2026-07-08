/**
 * Ownership Ledger — Core Trust Loop v0.2
 * 
 * Ownership is append-only. Never overwrite owner.
 * Generate ownership versions for each transfer.
 * ADR-001, ADR-005, ADR-011
 */
const { db, run, all, get } = require('../database');
const { v4: uuidv4 } = require('uuid');

async function replayTicketState(ticketId) {
  const events = await all('SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY sequence_id ASC', [ticketId]);
  if (events.length === 0) throw new Error(`No events for ticket ${ticketId}`);

  let state = { ticketId, currentOwnerId: null, status: null, history: [], evidenceChain: [] };

  for (const ev of events) {
    const m = JSON.parse(ev.metadata);
    switch (ev.event_type) {
      case 'OwnershipVerified':
        state.status = 'OwnershipVerified'; state.currentOwnerId = ev.actor_id || m.owner_id;
        state.history.push({ event: 'OwnershipVerified', owner: state.currentOwnerId, time: ev.created_at }); break;
      case 'ListingCreated':
        state.status = 'Listed'; state.history.push({ event: 'ListingCreated', price: m.price, time: ev.created_at }); break;
      case 'BuyerMatched':
        state.status = 'Matched'; state.history.push({ event: 'BuyerMatched', buyer: m.buyer_id || ev.actor_id, price: m.price, time: ev.created_at }); break;
      case 'EscrowCreated':
        state.status = 'Escrowed'; state.history.push({ event: 'EscrowCreated', escrowId: m.escrow_id, time: ev.created_at }); break;
      case 'TransferInitiated':
        state.status = 'TransferPending'; state.history.push({ event: 'TransferInitiated', time: ev.created_at }); break;
      case 'TransferVerified':
        if (!m.new_owner_id) throw new Error('TransferVerified missing new_owner_id');
        state.currentOwnerId = m.new_owner_id; state.status = 'TransferVerified';
        state.history.push({ event: 'TransferVerified', new_owner: m.new_owner_id, time: ev.created_at }); break;
      case 'VenueEntryVerified':
        state.status = 'VenueVerified'; state.history.push({ event: 'VenueEntryVerified', time: ev.created_at }); break;
      case 'SettlementReleased':
        state.status = 'Settled'; state.history.push({ event: 'SettlementReleased', time: ev.created_at }); break;
      case 'TransactionClosed':
        state.status = 'Closed'; state.history.push({ event: 'TransactionClosed', time: ev.created_at }); break;
      case 'ExceptionRaised':
        state.status = 'Exception'; state.history.push({ event: 'ExceptionRaised', reason: m.reason, time: ev.created_at }); break;
      default:
        throw new Error(`Unknown event: ${ev.event_type}`);
    }
    if (m.evidenceBundleId) state.evidenceChain.push({ event: ev.event_type, bundle: m.evidenceBundleId, actor: ev.actor_id });
  }
  if (state.status && state.status !== 'Listed' && state.currentOwnerId === null) {
    throw new Error(`Invariant: Ticket ${ticketId} has no active owner`);
  }
  return state;
}

async function appendLedgerEvent(ticketId, eventType, actorId, metadata = {}) {
  const eventId = `evt-${uuidv4()}`;
  const metaStr = JSON.stringify(metadata);
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        await run('BEGIN TRANSACTION');
        await run('INSERT INTO ticket_events (id, ticket_id, event_type, actor_id, metadata) VALUES (?, ?, ?, ?, ?)', [eventId, ticketId, eventType, actorId, metaStr]);
        const derivedState = await replayTicketState(ticketId);
        await run('UPDATE tickets SET current_owner_id = ?, status = ? WHERE id = ?', [derivedState.currentOwnerId, derivedState.status, ticketId]);
        await run("INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, metadata) VALUES ('TICKET', ?, ?, ?, ?)", [ticketId, eventType.toUpperCase(), actorId, JSON.stringify({ event_id: eventId, status: derivedState.status })]);
        await run('COMMIT');
        resolve({ eventId, derivedState });
      } catch (err) {
        await run('ROLLBACK').catch(() => {});
        reject(err);
      }
    });
  });
}

module.exports = { replayTicketState, appendLedgerEvent };
