/**
 * Replay Engine — Core Trust Loop v0.2
 * Reconstructs transaction state from append-only ledger events.
 */
const { StateMachine, STATES, EVENTS } = require('./stateMachine');

class ReplayEngine {
  static reconstructFromEvents(events) {
    if (!events || events.length === 0) throw new Error('Cannot reconstruct: no events');
    const sorted = [...events].sort((a, b) => (a.sequence_id || 0) - (b.sequence_id || 0));
    const s = {
      transactionId: sorted[0].ticket_id || sorted[0].transaction_id,
      currentState: null, currentOwnerId: null, currentBuyerId: null,
      price: null, escrowId: null, evidenceChain: [], timeline: [], violations: []
    };
    for (const ev of sorted) {
      const m = typeof ev.metadata === 'string' ? JSON.parse(ev.metadata) : (ev.metadata || {});
      // ExceptionResolved uses metadata.resolvedState, not state machine mapping
      if (ev.event_type === EVENTS.EXCEPTION_RESOLVED) {
        s.currentState = m.resolvedState || s.currentState;
        s.timeline.push({ event: ev.event_type, actor: ev.actor_id, state: s.currentState, time: ev.created_at, meta: m });
        continue;
      }
      const ts = StateMachine.getStateForEvent(ev.event_type);
      if (!ts) { s.violations.push({ eventId: ev.id, reason: 'Unknown: ' + ev.event_type }); continue; }
      if (s.currentState) {
        const v = StateMachine.isValidTransition(s.currentState, ts);
        if (!v.valid) s.violations.push({ eventId: ev.id, from: s.currentState, to: ts });
      }
      s.currentState = ts;
      if (ev.event_type === EVENTS.OWNERSHIP_VERIFIED) s.currentOwnerId = ev.actor_id || m.owner_id;
      if (ev.event_type === EVENTS.LISTING_CREATED) s.price = m.price || s.price;
      if (ev.event_type === EVENTS.BUYER_MATCHED) s.currentBuyerId = m.buyer_id || ev.actor_id;
      if (ev.event_type === EVENTS.ESCROW_CREATED) s.escrowId = m.escrow_id;
      if (ev.event_type === EVENTS.TRANSFER_VERIFIED && m.new_owner_id) s.currentOwnerId = m.new_owner_id;
      if (m.evidenceBundleId) s.evidenceChain.push({ eventId: ev.id, bundle: m.evidenceBundleId, actor: ev.actor_id });
      s.timeline.push({ event: ev.event_type, actor: ev.actor_id, state: s.currentState, time: ev.created_at, meta: m });
    }
    s.replayValid = s.violations.length === 0;
    return s;
  }

  static verifyConsistency(reconstructed, stored) {
    if (!reconstructed || !stored) return { consistent: false };
    const issues = [];
    if (reconstructed.currentState !== stored.currentState) issues.push({ field: 'state', a: reconstructed.currentState, e: stored.currentState });
    if (reconstructed.currentOwnerId !== stored.currentOwnerId) issues.push({ field: 'owner', a: reconstructed.currentOwnerId, e: stored.currentOwnerId });
    return { consistent: issues.length === 0, issues };
  }

  static buildAuditTrail(state) {
    return {
      transactionId: state.transactionId, currentState: state.currentState,
      owner: state.currentOwnerId, buyer: state.currentBuyerId, price: state.price,
      eventCount: state.timeline.length, evidenceCount: state.evidenceChain.length,
      replayValid: state.replayValid,
      timeline: state.timeline.map(t => ({ time: t.time, event: t.event, actor: t.actor, state: t.state })),
      evidenceChain: state.evidenceChain
    };
  }
}

module.exports = { ReplayEngine };
