/**
 * Recovery Engine — Core Trust Loop v0.2
 * 
 * Supports failures at every state. Every failure must be recoverable
 * without manual database intervention.
 */
const { StateMachine, STATES, EVENTS } = require('./stateMachine');

class RecoveryEngine {
  /**
   * Attempts to recover from a failure at a given state.
   */
  static recover({ currentState, error, transactionId, context = {} }) {
    const recovery = {
      transactionId,
      failedState: currentState,
      error: error.message || error,
      timestamp: new Date().toISOString(),
      action: null,
      targetState: null,
      requiresOperator: false
    };

    // Payment timeout during Escrowed
    if (currentState === STATES.ESCROWED && (error.code === 'PAYMENT_TIMEOUT' || context.paymentTimeout)) {
      recovery.action = 'TIMEOUT_REFUND';
      recovery.targetState = STATES.CLOSED;
      recovery.requiresOperator = false;
      return recovery;
    }

    // Duplicate webhook / idempotent operation
    if (error.code === 'DUPLICATE_EVENT' || error.message?.includes('duplicate')) {
      recovery.action = 'IGNORE_DUPLICATE';
      recovery.targetState = currentState;
      recovery.requiresOperator = false;
      return recovery;
    }

    // Network failure during transfer
    if (currentState === STATES.TRANSFER_PENDING && error.code === 'NETWORK_FAILURE') {
      recovery.action = 'RETRY_TRANSFER';
      recovery.targetState = STATES.TRANSFER_PENDING;
      recovery.requiresOperator = false;
      return recovery;
    }

    // Venue offline
    if (currentState === STATES.VENUE_VERIFIED && error.code === 'VENUE_OFFLINE') {
      recovery.action = 'QUEUE_VENUE_SCAN';
      recovery.targetState = STATES.VENUE_VERIFIED;
      recovery.requiresOperator = true;
      return recovery;
    }

    // Server restart mid-transaction
    if (error.code === 'SERVER_RESTART' || error.message?.includes('restart')) {
      recovery.action = 'RESUME_FROM_LAST_STATE';
      recovery.targetState = currentState;
      recovery.requiresOperator = false;
      return recovery;
    }

    // Partial write - replay and validate
    if (error.code === 'PARTIAL_WRITE') {
      recovery.action = 'REPLAY_AND_VALIDATE';
      recovery.targetState = currentState;
      recovery.requiresOperator = false;
      return recovery;
    }

    // Default: escalate to operator
    recovery.action = 'ESCALATE_TO_OPERATOR';
    recovery.targetState = STATES.EXCEPTION;
    recovery.requiresOperator = true;
    return recovery;
  }

  /**
   * Returns a safe retryable action for a given state.
   */
  static getRetryAction(currentState) {
    const actions = {
      [STATES.OWNERSHIP_VERIFIED]: { action: 'RETRY_VERIFICATION', maxRetries: 3 },
      [STATES.LISTED]: { action: 'RETRY_LISTING', maxRetries: 3 },
      [STATES.MATCHED]: { action: 'RETRY_MATCH', maxRetries: 3 },
      [STATES.ESCROWED]: { action: 'RETRY_PAYMENT', maxRetries: 5 },
      [STATES.TRANSFER_PENDING]: { action: 'RETRY_TRANSFER', maxRetries: 3 },
      [STATES.TRANSFER_VERIFIED]: { action: 'RETRY_VERIFICATION', maxRetries: 3 },
      [STATES.VENUE_VERIFIED]: { action: 'RETRY_VENUE_SCAN', maxRetries: 3 },
      [STATES.SETTLED]: { action: 'RETRY_SETTLEMENT', maxRetries: 5 },
      [STATES.EXCEPTION]: { action: 'REQUIRES_OPERATOR', maxRetries: 0 }
    };
    return actions[currentState] || { action: 'UNKNOWN', maxRetries: 0 };
  }

  /**
   * Validates that a recovery path exists for a transition.
   */
  static validateRecovery(currentState) {
    const paths = StateMachine.getRecoveryPaths(currentState);
    return {
      hasRecoveryPath: paths.length > 0,
      paths
    };
  }
}

module.exports = { RecoveryEngine };
