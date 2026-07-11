const fs = require('fs');
const path = require('path');

/**
 * PerformanceAnalyzer — Phase 21 Performance Laboratory
 * 
 * Computes P50, P95, P99, and throughput statistics, exporting reports to Markdown.
 */
class PerformanceAnalyzer {
  /**
   * Performs statistical analysis on latency run results.
   */
  static analyze(runName, results, durationMs) {
    const latencies = [...results.latencies].sort((a, b) => a - b);
    const count = latencies.length;

    const p50 = count > 0 ? latencies[Math.floor(count * 0.5)] : 0;
    const p95 = count > 0 ? latencies[Math.floor(count * 0.95)] : 0;
    const p99 = count > 0 ? latencies[Math.floor(count * 0.99)] : 0;
    const throughput = durationMs > 0 ? parseFloat(((count / durationMs) * 1000).toFixed(2)) : 0;

    return {
      runName,
      timestamp: new Date().toISOString(),
      totalRequests: count,
      successCount: results.successCount,
      failureCount: results.failureCount,
      throughputReqSec: throughput,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99
    };
  }

  /**
   * Writes the analysis report to BENCHMARK_RESULTS.md and PERFORMANCE_REPORT.md.
   */
  static writeReport(report, destDir) {
    const content = `
# ARGUS Performance Benchmark Report — ${report.runName}

* **Generated At:** ${report.timestamp}
* **Total Transactions Evaluated:** ${report.totalRequests}
* **Successful Actions:** ${report.successCount}
* **Failed Actions:** ${report.failureCount}
* **Overall Throughput:** ${report.throughputReqSec} req/sec

## Latency Percentiles
* **P50 (Median):** ${report.p50Ms} ms
* **P95:** ${report.p95Ms} ms
* **P99:** ${report.p99Ms} ms
`.trim();

    fs.writeFileSync(path.join(destDir, 'BENCHMARK_RESULTS.md'), content, 'utf8');
    fs.writeFileSync(path.join(destDir, 'PERFORMANCE_REPORT.md'), content, 'utf8');
    return content;
  }
}

module.exports = PerformanceAnalyzer;
