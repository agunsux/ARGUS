const LoadGenerator = require('./LoadGenerator');

/**
 * StressRunner — Phase 21 Performance Laboratory
 * 
 * Drives concurrency spikes iteratively until error or latency limits are hit.
 */
class StressRunner {
  /**
   * Evaluates breaking threshold limit points.
   */
  static async runStress(orchestrator, payload, maxConcurrency = 100) {
    let concurrency = 10;
    const stepLogs = [];

    while (concurrency <= maxConcurrency) {
      const start = Date.now();
      const results = await LoadGenerator.generateLoad(orchestrator, payload, concurrency, 20);
      const elapsed = Date.now() - start;
      const averageLatency = elapsed / 20;

      stepLogs.push({
        concurrency,
        averageLatencyMs: averageLatency,
        failures: results.failureCount
      });

      // Breaking Invariant: Fail if latency > 200ms or failureCount > 0
      if (results.failureCount > 0 || averageLatency > 200) {
        return {
          breakingPointConcurrency: concurrency,
          finalAverageLatencyMs: averageLatency,
          stepLogs
        };
      }

      concurrency += 20;
    }

    return {
      breakingPointConcurrency: null,
      stepLogs
    };
  }
}

module.exports = StressRunner;
