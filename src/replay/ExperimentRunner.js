const HistoricalAttackPlayer = require('./HistoricalAttackPlayer');
const DecisionComparator = require('./DecisionComparator');

/**
 * ExperimentRunner — Phase 18 Historical Intelligence Laboratory
 * 
 * Runs simulation batches against a target orchestrator, runs evaluations,
 * and compiles comparative precision reports.
 */
class ExperimentRunner {
  constructor(registry = null) {
    this.registry = registry;
  }

  /**
   * Executes a counterfactual experiment against a test orchestrator setup.
   */
  run(id, name, scenarios, benchmarkOutcomes, orchestrator = null) {
    const player = new HistoricalAttackPlayer(orchestrator);
    const actualRuns = [];

    for (const scenario of scenarios) {
      const results = player.play(scenario);
      actualRuns.push(...results);
    }

    const metrics = DecisionComparator.compare(actualRuns, benchmarkOutcomes);

    const report = {
      id,
      name,
      timestamp: new Date().toISOString(),
      scenarioCount: scenarios.length,
      transactionCount: actualRuns.length,
      metrics
    };

    if (this.registry) {
      this.registry.registerExperiment(report);
    }

    return report;
  }
}

module.exports = ExperimentRunner;
