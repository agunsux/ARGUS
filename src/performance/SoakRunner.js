const LoadGenerator = require('./LoadGenerator');

/**
 * SoakRunner — Phase 21 Performance Laboratory
 * 
 * Runs steady-state load over time to monitor RAM heap growth and flag memory leak anomalies.
 */
class SoakRunner {
  /**
   * Executes soak testing.
   */
  static async runSoak(orchestrator, payload, durationMs = 1000) {
    const start = Date.now();
    const initialHeap = process.memoryUsage().heapUsed;
    let totalRequests = 0;
    let totalSuccessCount = 0;

    while (Date.now() - start < durationMs) {
      const results = await LoadGenerator.generateLoad(orchestrator, payload, 5, 10);
      totalRequests += 10;
      totalSuccessCount += results.successCount;
    }

    const finalHeap = process.memoryUsage().heapUsed;
    // Leak Invariant: Heap growth exceeds 50% under simple loads
    const leakDetected = finalHeap > (initialHeap * 1.5);

    return {
      testDurationMs: Date.now() - start,
      totalRequests,
      totalSuccessCount,
      heapGrowthBytes: finalHeap - initialHeap,
      leakDetected
    };
  }
}

module.exports = SoakRunner;
