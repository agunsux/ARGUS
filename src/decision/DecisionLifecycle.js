const { STATES } = require('./decision.types');
const Decision = require('./Decision');

const TRANSITION_RULES = {
  [STATES.PENDING]: [STATES.EVALUATING],
  [STATES.EVALUATING]: [STATES.EVALUATED],
  [STATES.EVALUATED]: [STATES.APPLIED, STATES.REPLAYED, STATES.OVERRIDDEN],
  [STATES.APPLIED]: [STATES.OVERRIDDEN],
  [STATES.REPLAYED]: [STATES.OVERRIDDEN],
  [STATES.OVERRIDDEN]: []
};

/**
 * DecisionLifecycle — Phase 5 Decision Domain
 * 
 * Enforces correct lifecycle transitions on Decision instances.
 * Since Decisions are immutable, any transition returns a cloned, updated, 
 * and frozen Decision instance.
 */
class DecisionLifecycle {
  /**
   * Evaluates if a state transition is valid.
   */
  static isValidTransition(current, next) {
    const allowed = TRANSITION_RULES[current];
    if (!allowed) return false;
    return allowed.includes(next);
  }

  /**
   * Performs a transition to a new lifecycle state.
   * Returns a new frozen Decision instance.
   */
  static transition(decision, nextState, context = {}) {
    if (!DecisionLifecycle.isValidTransition(decision.lifecycleState, nextState)) {
      throw new Error(`Lifecycle violation: transition '${decision.lifecycleState}' -> '${nextState}' is not allowed`);
    }

    const nextDecision = decision.clone();
    nextDecision.lifecycleState = nextState;

    if (nextState === STATES.OVERRIDDEN) {
      nextDecision.audit = {
        ...nextDecision.audit,
        action: 'OVERRIDE',
        actor: context.actor || 'system'
      };
      nextDecision.metadata = {
        ...nextDecision.metadata,
        overriddenAt: context.timestamp || new Date().toISOString(),
        overrideReason: context.reason || 'Operator override'
      };
    }

    return nextDecision.freeze();
  }
}

module.exports = DecisionLifecycle;
