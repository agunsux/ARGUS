/**
 * TIKUM / ARGUS — Canonical Escrow Domain State Machine (Epic G)
 * 
 * Strict Domain State Machine for the Protected Transaction Lifecycle.
 * Operates purely at the domain level without connecting to real money
 * until a verified payment provider is active.
 * 
 * Canonical Lifecycle:
 * ORDER_CREATED -> PAYMENT_PENDING -> FUNDED -> TICKET_SUBMITTED ->
 * VERIFICATION_PENDING -> VERIFIED -> DELIVERY_PENDING -> DELIVERED ->
 * ENTRY_CONFIRMED -> RELEASE_PENDING -> RELEASED
 * 
 * Failure / Terminal States:
 * CANCELLED, REJECTED, REFUND_PENDING, REFUNDED, DISPUTED, FROZEN
 */

const { state, recordAuditLog } = require('../database');

const ESCROW_LIFECYCLE_STATE = {
  ORDER_CREATED: 'ORDER_CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  FUNDED: 'FUNDED',
  TICKET_SUBMITTED: 'TICKET_SUBMITTED',
  VERIFICATION_PENDING: 'VERIFICATION_PENDING',
  VERIFIED: 'VERIFIED',
  DELIVERY_PENDING: 'DELIVERY_PENDING',
  DELIVERED: 'DELIVERED',
  ENTRY_CONFIRMED: 'ENTRY_CONFIRMED',
  RELEASE_PENDING: 'RELEASE_PENDING',
  RELEASED: 'RELEASED',
  // Failure / Branch States:
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
  FROZEN: 'FROZEN'
};

const ALLOWED_ESCROW_TRANSITIONS = {
  [ESCROW_LIFECYCLE_STATE.ORDER_CREATED]: new Set([
    ESCROW_LIFECYCLE_STATE.PAYMENT_PENDING,
    ESCROW_LIFECYCLE_STATE.CANCELLED
  ]),
  [ESCROW_LIFECYCLE_STATE.PAYMENT_PENDING]: new Set([
    ESCROW_LIFECYCLE_STATE.FUNDED,
    ESCROW_LIFECYCLE_STATE.CANCELLED,
    ESCROW_LIFECYCLE_STATE.REJECTED
  ]),
  [ESCROW_LIFECYCLE_STATE.FUNDED]: new Set([
    ESCROW_LIFECYCLE_STATE.TICKET_SUBMITTED,
    ESCROW_LIFECYCLE_STATE.REFUND_PENDING,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.TICKET_SUBMITTED]: new Set([
    ESCROW_LIFECYCLE_STATE.VERIFICATION_PENDING,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.REFUND_PENDING,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.VERIFICATION_PENDING]: new Set([
    ESCROW_LIFECYCLE_STATE.VERIFIED,
    ESCROW_LIFECYCLE_STATE.REJECTED,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.VERIFIED]: new Set([
    ESCROW_LIFECYCLE_STATE.DELIVERY_PENDING,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.DELIVERY_PENDING]: new Set([
    ESCROW_LIFECYCLE_STATE.DELIVERED,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.DELIVERED]: new Set([
    ESCROW_LIFECYCLE_STATE.ENTRY_CONFIRMED,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.ENTRY_CONFIRMED]: new Set([
    ESCROW_LIFECYCLE_STATE.RELEASE_PENDING,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.RELEASE_PENDING]: new Set([
    ESCROW_LIFECYCLE_STATE.RELEASED,
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.RELEASED]: new Set([
    // Terminal success state. Funds disbursed.
  ]),
  // Failure / Branch State Transitions
  [ESCROW_LIFECYCLE_STATE.DISPUTED]: new Set([
    ESCROW_LIFECYCLE_STATE.REFUND_PENDING,
    ESCROW_LIFECYCLE_STATE.RELEASE_PENDING,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.REFUND_PENDING]: new Set([
    ESCROW_LIFECYCLE_STATE.REFUNDED,
    ESCROW_LIFECYCLE_STATE.FROZEN
  ]),
  [ESCROW_LIFECYCLE_STATE.REFUNDED]: new Set([
    // Terminal refund state.
  ]),
  [ESCROW_LIFECYCLE_STATE.CANCELLED]: new Set([
    // Terminal cancel state.
  ]),
  [ESCROW_LIFECYCLE_STATE.REJECTED]: new Set([
    ESCROW_LIFECYCLE_STATE.REFUND_PENDING
  ]),
  [ESCROW_LIFECYCLE_STATE.FROZEN]: new Set([
    ESCROW_LIFECYCLE_STATE.DISPUTED,
    ESCROW_LIFECYCLE_STATE.REFUND_PENDING,
    ESCROW_LIFECYCLE_STATE.RELEASE_PENDING
  ])
};

class EscrowStateMachine {
  /**
   * Transitions escrow account to next state under strict domain invariants.
   */
  static async transition({
    orderId,
    targetState,
    actorId,
    actorRole = 'SYSTEM',
    reason,
    correlationId = null,
    metadata = {}
  }) {
    if (!orderId || !targetState || !actorId || !reason) {
      const err = new Error('orderId, targetState, actorId, and reason are mandatory for escrow transitions');
      err.code = 'INVALID_TRANSITION_REQUEST';
      throw err;
    }

    const next = targetState.toUpperCase();
    if (!ESCROW_LIFECYCLE_STATE[next]) {
      const err = new Error(`Unknown escrow lifecycle state '${next}'`);
      err.code = 'UNKNOWN_STATE';
      throw err;
    }

    // Locate escrow account
    let escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) {
      const err = new Error(`Escrow record for order '${orderId}' not found`);
      err.code = 'ESCROW_NOT_FOUND';
      throw err;
    }

    const current = (escrow.state_machine_status || escrow.status || ESCROW_LIFECYCLE_STATE.ORDER_CREATED).toUpperCase();

    // Invariant check: Check allowed transitions
    const allowed = ALLOWED_ESCROW_TRANSITIONS[current];
    if (!allowed || !allowed.has(next)) {
      const err = new Error(
        `Invalid escrow state transition: cannot jump from '${current}' to '${next}'. Valid targets: ${allowed ? Array.from(allowed).join(', ') : 'None'}`
      );
      err.code = 'ILLEGAL_ESCROW_TRANSITION';
      err.currentState = current;
      err.targetState = next;
      throw err;
    }

    // Role authorization guards
    if (next === ESCROW_LIFECYCLE_STATE.RELEASED || next === ESCROW_LIFECYCLE_STATE.REFUNDED) {
      if (actorRole !== 'admin' && actorRole !== 'SYSTEM') {
        const err = new Error(`Unauthorized: only admin or SYSTEM can trigger terminal disbursement '${next}'`);
        err.code = 'UNAUTHORIZED_ESCROW_ACTOR';
        throw err;
      }
    }

    // Mandatory Security Invariant: RELEASED requires FINANCIAL_RELEASE_AUTHORIZED
    if (next === ESCROW_LIFECYCLE_STATE.RELEASED) {
      const { TrustPolicyEngine } = require('../trust/TrustPolicyEngine');
      const isAuth = TrustPolicyEngine.isReleaseAuthorized(orderId, metadata?.authorization_id);
      if (!isAuth) {
        const err = new Error(
          'Security invariant violation: State machine transition to RELEASED requires FINANCIAL_RELEASE_AUTHORIZED = TRUE from Trust Policy Engine'
        );
        err.code = 'FINANCIAL_RELEASE_NOT_AUTHORIZED';
        throw err;
      }
    }

    if (next === ESCROW_LIFECYCLE_STATE.ENTRY_CONFIRMED) {
      if (actorRole !== 'pic' && actorRole !== 'admin' && actorRole !== 'SYSTEM') {
        const err = new Error('Unauthorized: only assigned Event PIC or Admin can confirm venue gate entry');
        err.code = 'PIC_AUTH_REQUIRED';
        throw err;
      }
    }

    const now = new Date().toISOString();
    const historyEntry = {
      from_state: current,
      to_state: next,
      actor_id: actorId,
      actor_role: actorRole,
      reason,
      correlation_id: correlationId || `cor-${Date.now()}`,
      timestamp: now,
      metadata
    };

    if (!escrow.transition_history) {
      escrow.transition_history = [];
    }
    escrow.transition_history.push(historyEntry);

    // Apply state change
    escrow.state_machine_status = next;
    escrow.status = next; // sync
    escrow.updated_at = now;

    // Record immutable audit log
    await recordAuditLog('ESCROW_STATE_MACHINE', escrow.id || orderId, next, actorId, {
      order_id: orderId,
      from_state: current,
      to_state: next,
      reason,
      correlation_id: historyEntry.correlation_id,
      actor_role: actorRole
    });

    return {
      success: true,
      order_id: orderId,
      escrow_id: escrow.id,
      previous_state: current,
      current_state: next,
      timestamp: now,
      history_entry: historyEntry
    };
  }

  /**
   * Inspects complete transition history of an escrow account.
   */
  static getEscrowTimeline(orderId) {
    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) return null;

    return {
      order_id: orderId,
      escrow_id: escrow.id,
      current_state: escrow.state_machine_status || escrow.status,
      history: escrow.transition_history || []
    };
  }
}

module.exports = {
  EscrowStateMachine,
  ESCROW_LIFECYCLE_STATE,
  ALLOWED_ESCROW_TRANSITIONS
};
