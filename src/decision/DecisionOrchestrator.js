const { DecisionPipeline } = require('./DecisionPipeline');
const DecisionEngine = require('./DecisionEngine');

/**
 * DecisionOrchestrator — Phase 5 Decision Domain
 * 
 * Orchestrates evaluation of DecisionContexts by running the 
 * multi-stage pipeline, returning the final Decision, Snapshot, and Execution Trace.
 */
class DecisionOrchestrator {
  constructor(policyEngine = null) {
    this.engine = new DecisionEngine();
    this.pipeline = new DecisionPipeline(this.engine, policyEngine);
  }

  /**
   * Accepts context, triggers pipeline evaluation, and returns outputs.
   */
  evaluate(context) {
    const state = this.pipeline.run(context);
    return {
      decision: state.decision,
      snapshot: state.snapshot,
      trace: state.trace
    };
  }
}

module.exports = DecisionOrchestrator;
