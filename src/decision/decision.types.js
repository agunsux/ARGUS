/**
 * Decision Types — Phase 5 Decision Domain
 * 
 * Central catalog for Decision-related states and actions.
 */

const DECISION_ACTIONS = {
  APPROVE: 'APPROVE',
  FLAG: 'FLAG',
  BLOCK: 'BLOCK',
  REVIEW: 'REVIEW'
};

const DECISION_STATES = {
  PENDING: 'PENDING',
  EVALUATING: 'EVALUATING',
  EVALUATED: 'EVALUATED',
  APPLIED: 'APPLIED',
  REPLAYED: 'REPLAYED',
  OVERRIDDEN: 'OVERRIDDEN'
};

module.exports = {
  DECISION_ACTIONS,
  DECISION_STATES,
  ACTIONS: DECISION_ACTIONS,
  STATES: DECISION_STATES
};
