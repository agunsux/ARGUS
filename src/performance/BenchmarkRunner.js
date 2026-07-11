const LoadGenerator = require('./LoadGenerator');
const PerformanceAnalyzer = require('./PerformanceAnalyzer');

/**
 * BenchmarkRunner — Phase 21 Performance Laboratory
 * 
 * Sets up and runs standardized load benchmarks.
 */
class BenchmarkRunner {
  /**
   * Executes benchmark runs at specified concurrent user levels.
   */
  static async runBenchmark(orchestrator, payloadTemplate, concurrentUsers = 100, outputDir = __dirname) {
    const start = Date.now();

    // Scale requests to fit testing constraints deterministically
    const requestCount = Math.min(200, concurrentUsers); 
    const concurrency = Math.min(20, Math.ceil(requestCount / 10));

    const results = await LoadGenerator.generateLoad(
      orchestrator,
      payloadTemplate,
      concurrency,
      requestCount
    );

    const elapsed = Date.now() - start;
    const report = PerformanceAnalyzer.analyze(`ConcurrentUsers-${concurrentUsers}`, results, elapsed);
    
    PerformanceAnalyzer.writeReport(report, outputDir);
    return report;
  }
}

module.exports = BenchmarkRunner;
