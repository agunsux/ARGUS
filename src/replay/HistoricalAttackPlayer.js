const DecisionOrchestrator = require('../decision/DecisionOrchestrator');
const DecisionContext = require('../decision/DecisionContext');

/**
 * HistoricalAttackPlayer — Phase 18 Historical Intelligence Laboratory
 * 
 * Streams simulated scenario data streams through the production DecisionOrchestrator.
 */
class HistoricalAttackPlayer {
  constructor(orchestrator = null) {
    this.orchestrator = orchestrator || new DecisionOrchestrator();
  }

  /**
   * Evaluates a scenario and returns outputs for each transaction in the stream.
   */
  play(scenario) {
    if (!scenario) {
      throw new Error('Scenario is required to play');
    }

    const results = [];
    const executionId = `exec-play-${scenario.id}`;
    const correlationId = `corr-play-${scenario.id}`;

    for (const tx of scenario.transactions) {
      const context = new DecisionContext({
        transaction: tx,
        evidence: scenario.evidence || [],
        risk: scenario.risk,
        inference: scenario.inference,
        executionId,
        correlationId,
        timestamp: new Date().toISOString()
      });

      const outcome = this.orchestrator.evaluate(context);
      results.push({
        transactionId: tx.transactionId,
        decision: outcome.decision,
        snapshot: outcome.snapshot,
        trace: outcome.trace
      });
    }

    return results;
  }
}

module.exports = HistoricalAttackPlayer;
