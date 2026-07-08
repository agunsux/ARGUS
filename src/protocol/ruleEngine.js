/**
 * Rule Engine — Wave 2 Protocol Layer
 * 
 * Rules are business policies that change frequently.
 * They are SEPARATE from invariants (which live in State Machine).
 * 
 * Invariants: must always be true, cannot be configured.
 * Rules: can change based on business needs, can be configured.
 */
const { STATES } = require('../engine/stateMachine');

class RuleEngine {
  constructor() {
    this._rules = [];
  }

  /**
   * Registers a rule with a condition and action.
   */
  addRule(name, { condition, action }) {
    this._rules.push({ name, condition, action });
  }

  /**
   * Evaluates all rules against a transaction and returns actions to take.
   */
  evaluate(transaction) {
    const actions = [];
    for (const rule of this._rules) {
      try {
        if (rule.condition(transaction)) {
          actions.push({ rule: rule.name, action: rule.action(transaction) });
        }
      } catch (err) {
        actions.push({ rule: rule.name, error: err.message });
      }
    }
    return actions;
  }

  /**
   * Registers standard ARGUS business rules.
   */
  static registerDefaults(engine) {
    // Escrow timeout: auto-cancel if escrow pending > 30 minutes
    engine.addRule('escrow_timeout', {
      condition: (tx) => tx.state === STATES.ESCROWED && tx.escrowStatus === 'PENDING' && tx._escrowCreatedAt && (Date.now() - new Date(tx._escrowCreatedAt).getTime() > 30 * 60 * 1000),
      action: () => ({ type: 'CANCEL_ESCROW', reason: 'Escrow payment timeout after 30 minutes' })
    });

    // Transfer timeout: auto-cancel if transfer pending > 24 hours
    engine.addRule('transfer_timeout', {
      condition: (tx) => tx.state === STATES.TRANSFER_PENDING && tx._transferRequestedAt && (Date.now() - new Date(tx._transferRequestedAt).getTime() > 24 * 60 * 60 * 1000),
      action: () => ({ type: 'CANCEL_TRANSFER', reason: 'Transfer timeout after 24 hours' })
    });

    // Settlement SLA: flag if settlement takes > 1 hour after venue verified
    engine.addRule('settlement_sla', {
      condition: (tx) => tx.state === STATES.VENUE_VERIFIED && tx._venueVerifiedAt && (Date.now() - new Date(tx._venueVerifiedAt).getTime() > 60 * 60 * 1000),
      action: () => ({ type: 'FLAG_SLA_BREACH', reason: 'Settlement SLA breached: > 1 hour after venue verification' })
    });

    // Auto-close dispute: close if no activity for 7 days
    engine.addRule('dispute_timeout', {
      condition: (tx) => tx.escrowStatus === 'DISPUTED' && tx._disputeOpenedAt && (Date.now() - new Date(tx._disputeOpenedAt).getTime() > 7 * 24 * 60 * 60 * 1000),
      action: () => ({ type: 'AUTO_CLOSE_DISPUTE', reason: 'Dispute auto-closed after 7 days inactivity' })
    });

    // Manual review threshold: flag high-value transactions
    engine.addRule('high_value_review', {
      condition: (tx) => tx.price > 10000000,
      action: () => ({ type: 'FLAG_MANUAL_REVIEW', reason: 'Transaction exceeds manual review threshold (Rp 10,000,000)' })
    });
  }

  /**
   * Returns all registered rules.
   */
  getRules() {
    return this._rules.map(r => ({ name: r.name }));
  }
}

module.exports = { RuleEngine };
