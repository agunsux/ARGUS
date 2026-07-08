/**
 * Core Trust Loop — State Machine Engine
 * 
 * Implements the formal state machine defined in docs/alpha_core_trust_loop.md.
 * Enforces transition matrix, invariants, evidence generation, and recovery paths.
 * Wave 1 — Alpha Field Pilot (v0.2)
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// STATE DEFINITIONS
// =============================================================================
const STATES = {
  OWNERSHIP_VERIFIED: 'OwnershipVerified',
  LISTED: 'Listed',
  MATCHED: 'Matched',
  ESCROWED: 'Escrowed',
  TRANSFER_PENDING: 'TransferPending',
  TRANSFER_VERIFIED: 'TransferVerified',
  VENUE_VERIFIED: 'VenueVerified',
  SETTLED: 'Settled',
  CLOSED: 'Closed',
  EXCEPTION: 'Exception'
};

// =============================================================================
// EVENT DEFINITIONS (Append-only, per ADR-001/ADR-011)
// =============================================================================
const EVENTS = {
  OWNERSHIP_VERIFIED: 'OwnershipVerified',
  LISTING_CREATED: 'ListingCreated',
  BUYER_MATCHED: 'BuyerMatched',
  ESCROW_CREATED: 'EscrowCreated',
  TRANSFER_INITIATED: 'TransferInitiated',
  TRANSFER_VERIFIED: 'TransferVerified',
  VENUE_ENTRY_VERIFIED: 'VenueEntryVerified',
  SETTLEMENT_RELEASED: 'SettlementReleased',
  TRANSACTION_CLOSED: 'TransactionClosed',
  EXCEPTION_RAISED: 'ExceptionRaised',
  EXCEPTION_RESOLVED: 'ExceptionResolved'
};

// =============================================================================
// TRANSITION MATRIX
// =============================================================================
const TRANSITION_MATRIX = {
  [STATES.OWNERSHIP_VERIFIED]: [STATES.LISTED, STATES.EXCEPTION],
  [STATES.LISTED]: [STATES.MATCHED, STATES.EXCEPTION],
  [STATES.MATCHED]: [STATES.ESCROWED, STATES.EXCEPTION],
  [STATES.ESCROWED]: [STATES.TRANSFER_PENDING, STATES.EXCEPTION],
  [STATES.TRANSFER_PENDING]: [STATES.TRANSFER_VERIFIED, STATES.EXCEPTION],
  [STATES.TRANSFER_VERIFIED]: [STATES.VENUE_VERIFIED, STATES.EXCEPTION],
  [STATES.VENUE_VERIFIED]: [STATES.SETTLED, STATES.EXCEPTION],
  [STATES.SETTLED]: [STATES.CLOSED, STATES.EXCEPTION],
  [STATES.CLOSED]: [],
  [STATES.EXCEPTION]: Object.values(STATES).filter(s => s !== STATES.EXCEPTION)
};


// =============================================================================
// EVENT-TO-STATE MAPPING
// =============================================================================
const EVENT_STATE_MAP = {
  [EVENTS.OWNERSHIP_VERIFIED]: STATES.OWNERSHIP_VERIFIED,
  [EVENTS.LISTING_CREATED]: STATES.LISTED,
  [EVENTS.BUYER_MATCHED]: STATES.MATCHED,
  [EVENTS.ESCROW_CREATED]: STATES.ESCROWED,
  [EVENTS.TRANSFER_INITIATED]: STATES.TRANSFER_PENDING,
  [EVENTS.TRANSFER_VERIFIED]: STATES.TRANSFER_VERIFIED,
  [EVENTS.VENUE_ENTRY_VERIFIED]: STATES.VENUE_VERIFIED,
  [EVENTS.SETTLEMENT_RELEASED]: STATES.SETTLED,
  [EVENTS.TRANSACTION_CLOSED]: STATES.CLOSED,
  [EVENTS.EXCEPTION_RAISED]: STATES.EXCEPTION
};

// =============================================================================
// INVARIANTS
// =============================================================================
const INVARIANTS = {
  SINGLE_OWNER: 'SINGLE_OWNER',
  ESCROW_BEFORE_SETTLEMENT: 'ESCROW_BEFORE_SETTLEMENT',
  EVIDENCE_BEFORE_TRANSFER: 'EVIDENCE_BEFORE_TRANSFER',
  APPEND_ONLY: 'APPEND_ONLY',
  REPLAY_DETERMINISM: 'REPLAY_DETERMINISM'
};

const INVARIANT_DESCRIPTIONS = {
  [INVARIANTS.SINGLE_OWNER]: 'Setiap tiket hanya memiliki satu pemilik aktif pada satu waktu',
  [INVARIANTS.ESCROW_BEFORE_SETTLEMENT]: 'Dana escrow tidak dapat dilepas sebelum Transfer Verified',
  [INVARIANTS.EVIDENCE_BEFORE_TRANSFER]: 'Ownership tidak dapat berubah tanpa menghasilkan evidence baru',
  [INVARIANTS.APPEND_ONLY]: 'Setiap perubahan state bersifat append-only',
  [INVARIANTS.REPLAY_DETERMINISM]: 'Setiap transaksi dapat direkonstruksi sepenuhnya dari audit trail'
};


// =============================================================================
// STATE MACHINE CLASS
// =============================================================================
class StateMachine {
  static isValidTransition(currentState, nextState) {
    const allowed = TRANSITION_MATRIX[currentState];
    if (!allowed) return { valid: false, reason: 'Unknown state' };
    if (allowed.includes(nextState)) return { valid: true };
    return { valid: false, reason: `'${currentState}' -> '${nextState}' not allowed` };
  }

  static validateInvariants(currentState, nextState, context = {}) {
    const violations = [];
    if (nextState === STATES.OWNERSHIP_VERIFIED && context.currentOwnerId) {
      violations.push({ invariant: INVARIANTS.SINGLE_OWNER, detail: 'Already has owner' });
    }
    if (nextState === STATES.SETTLED && currentState !== STATES.VENUE_VERIFIED) {
      violations.push({ invariant: INVARIANTS.ESCROW_BEFORE_SETTLEMENT, detail: 'Must be VenueVerified' });
    }
    if ((nextState === STATES.TRANSFER_VERIFIED || nextState === STATES.OWNERSHIP_VERIFIED) && !context.evidenceBundleId) {
      violations.push({ invariant: INVARIANTS.EVIDENCE_BEFORE_TRANSFER, detail: 'Requires evidence bundle' });
    }
    return violations;
  }

  static getEventForTransition(currentState, nextState) {
    const map = {
      [`${STATES.OWNERSHIP_VERIFIED}->${STATES.LISTED}`]: EVENTS.LISTING_CREATED,
      [`${STATES.LISTED}->${STATES.MATCHED}`]: EVENTS.BUYER_MATCHED,
      [`${STATES.MATCHED}->${STATES.ESCROWED}`]: EVENTS.ESCROW_CREATED,
      [`${STATES.ESCROWED}->${STATES.TRANSFER_PENDING}`]: EVENTS.TRANSFER_INITIATED,
      [`${STATES.TRANSFER_PENDING}->${STATES.TRANSFER_VERIFIED}`]: EVENTS.TRANSFER_VERIFIED,
      [`${STATES.TRANSFER_VERIFIED}->${STATES.VENUE_VERIFIED}`]: EVENTS.VENUE_ENTRY_VERIFIED,
      [`${STATES.VENUE_VERIFIED}->${STATES.SETTLED}`]: EVENTS.SETTLEMENT_RELEASED,
      [`${STATES.SETTLED}->${STATES.CLOSED}`]: EVENTS.TRANSACTION_CLOSED
    };
    const key = `${currentState}->${nextState}`;
    if (map[key]) return map[key];
    if (nextState === STATES.EXCEPTION) return EVENTS.EXCEPTION_RAISED;
    if (currentState === STATES.EXCEPTION) return EVENTS.EXCEPTION_RESOLVED;
    return null;
  }

  static getStateForEvent(eventType) { return EVENT_STATE_MAP[eventType] || null; }

  static generateEvidence(currentState, nextState, context = {}) {
    const evidence = {
      evidenceId: `evd-${uuidv4()}`,
      timestamp: new Date().toISOString(),
      transition: `${currentState} -> ${nextState}`,
      event: StateMachine.getEventForTransition(currentState, nextState),
      actor: context.actorId || 'system',
      transactionId: context.transactionId,
      deviceFingerprint: context.deviceFingerprint || null,
      signature: null,
      metadata: context.metadata || {}
    };
    const hash = require('crypto').createHash('sha256').update(JSON.stringify({ ...evidence, signature: null, evidenceId: null })).digest('hex');
    evidence.signature = hash;
    return evidence;
  }

  static getRecoveryPaths(currentState) {
    const paths = {
      [STATES.ESCROWED]: [{ action: 'RETRY_PAYMENT', targetState: STATES.ESCROWED }, { action: 'TIMEOUT_REFUND', targetState: STATES.CLOSED }],
      [STATES.TRANSFER_PENDING]: [{ action: 'RETRY_TRANSFER', targetState: STATES.TRANSFER_PENDING }, { action: 'CANCEL_TRANSFER', targetState: STATES.ESCROWED }],
      [STATES.EXCEPTION]: [{ action: 'RESUME', targetState: null }]
    };
    return paths[currentState] || [{ action: 'INVESTIGATE', targetState: STATES.EXCEPTION }];
  }

  static getAllStates() { return Object.values(STATES); }
  static getAllEvents() { return Object.values(EVENTS); }
  static getTransitionMatrix() { return TRANSITION_MATRIX; }
  static getAllInvariants() { return INVARIANTS; }
}

module.exports = { StateMachine, STATES, EVENTS, INVARIANTS, INVARIANT_DESCRIPTIONS, TRANSITION_MATRIX, EVENT_STATE_MAP };
