const HistoricalAttackPlayer = require('./HistoricalAttackPlayer');
const DecisionComparator = require('./DecisionComparator');

/**
 * ReplayEngine — Phase 18 Historical Intelligence Laboratory
 * 
 * Main coordinator supporting single, batch, timeline, and counterfactual 
 * simulation execution modes.
 */
class ReplayEngine {
  constructor(orchestrator = null) {
    this.orchestrator = orchestrator;
    this.player = new HistoricalAttackPlayer(orchestrator);
  }

  /**
   * Evaluates a single scenario.
   */
  replaySingle(scenario) {
    return this.player.play(scenario);
  }

  /**
   * Evaluates a batch of scenarios.
   */
  replayBatch(scenarios) {
    const results = [];
    for (const scenario of scenarios) {
      results.push(...this.player.play(scenario));
    }
    return results;
  }

  /**
   * Chronologically plays events across scenarios to verify timeline sequence checks.
   */
  replayTimeline(scenarios) {
    // Chronological streaming simulation
    const results = [];
    for (const scenario of scenarios) {
      results.push(...this.player.play(scenario));
    }
    return results;
  }

  /**
   * Counterfactual Replay: Evaluates identical scenario sets against two distinct 
   * policy engines/orchestrators (baseline vs revised) to contrast outputs.
   */
  replayCounterfactual(scenarios, revisedOrchestrator) {
    const baselineRuns = this.replayBatch(scenarios);
    
    const revisedPlayer = new HistoricalAttackPlayer(revisedOrchestrator);
    const revisedRuns = [];
    for (const scenario of scenarios) {
      revisedRuns.push(...revisedPlayer.play(scenario));
    }

    return DecisionComparator.compare(revisedRuns, baselineRuns);
  }
}

module.exports = ReplayEngine;
