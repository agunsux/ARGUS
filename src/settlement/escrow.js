const { explainDecision } = require('../public/explain');

/**
 * Validates whether a transaction is ready to be settled (escrow released).
 * Enforces Invariant 4 (Verification Before Settlement) and Invariant 5 (Single Transfer Finalization).
 * 
 * @param {object} ticket 
 * @param {object} transfer 
 */
function validateSettlement(ticket, transfer) {
  // Double transfer block check must be performed first
  if (transfer.status === 'TRANSFERRED' || transfer.status === 'SETTLED' || ticket.status === 'TRANSFERRED') {
    return {
      allowed: false,
      error: explainDecision('DOUBLE_TRANSFER_BLOCKED')
    };
  }

  // Invariant 4 check: Verification before settlement
  if (ticket.status !== 'VERIFIED' && ticket.status !== 'ESCROW_PAID') {
    return {
      allowed: false,
      error: explainDecision('ESCROW_RELEASE_DENIED_UNVERIFIED')
    };
  }

  return {
    allowed: true
  };
}

module.exports = {
  validateSettlement
};
